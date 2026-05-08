import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateApiKey } from "@/lib/api-key-auth";
import { findOrCreateFraudRecord, computeFraudScore } from "@/lib/fraud-score";
import { EXTERNAL_RETURN_REASONS } from "@/lib/constants";


// ─────────────────────────────────────────────────────────────
// Validation stricte des champs
// ─────────────────────────────────────────────────────────────
function validatePayload(body: Record<string, unknown>): string | null {
  const required = [
    "customer_name",
    "customer_email",
    "product_name",
    "order_id",
    "shop_id",
    "reason",
    "description",
  ];

  for (const field of required) {
    if (!body[field] || String(body[field]).trim() === "") {
      return `Champ requis manquant : ${field}`;
    }
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(String(body.customer_email))) {
    return "Email invalide";
  }

  if (!(EXTERNAL_RETURN_REASONS as readonly string[]).includes(String(body.reason))) {
    return "Raison invalide";
  }

  if (String(body.description).trim().length < 10) {
    return "Description trop courte (minimum 10 caractères)";
  }

  if (String(body.description).length > 2000) {
    return "Description trop longue (maximum 2000 caractères)";
  }

  // Sanitize : pas de balises HTML
  const htmlRe = /<[^>]*>/g;
  if (htmlRe.test(String(body.description)) || htmlRe.test(String(body.customer_name))) {
    return "Contenu HTML non autorisé";
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Mapper reason → ClaimType Prisma
// ─────────────────────────────────────────────────────────────
function reasonToClaimType(reason: string): "EXCHANGE" | "REFUND" | "REPAIR" {
  // DEFECTIVE → REPAIR, reste → REFUND par défaut
  // Le vendeur peut requalifier depuis son dashboard
  if (reason === "DEFECTIVE") return "REPAIR";
  if (reason === "WRONG_ITEM") return "EXCHANGE";
  return "REFUND";
}

// ─────────────────────────────────────────────────────────────
// POST /api/returns/create
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown";

  // ── 1. Valider la clé API ────────────────────────────────────
  const rawKey = req.headers.get("x-api-key");

  const auth = await validateApiKey(rawKey);
  if (!auth.ok) return auth.response;
  const { keyRecord } = auth;

  // ── 3. Parser le body ────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 });
  }

  // ── 4. Valider les champs ────────────────────────────────────
  const validationError = validatePayload(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const orderId          = String(body.order_id).trim();
  const reason           = String(body.reason);
  const description      = String(body.description).trim();
  const customerEmailNorm = String(body.customer_email).trim().toLowerCase();
  const customerPhoneNorm = body.customer_phone ? String(body.customer_phone).trim() : undefined;

  // ── 5. Rate limiting ─────────────────────────────────────────
  const allowed = await checkRateLimit(`${ip}:${orderId}`);
  if (!allowed) {
    return NextResponse.json(
      { error: "Trop de tentatives pour cette commande. Réessayez dans 1 heure." },
      { status: 429 }
    );
  }

  // ── 6. Rate limiting par client (anti-fraud-score poisoning) ─
  const today = new Date().toISOString().slice(0, 10);
  const allowedPerCustomer = await checkRateLimit(
    `vendor:${keyRecord.vendorId}:email:${customerEmailNorm}:${today}`,
    3,
    24 * 60 * 60 * 1000,
  );
  if (!allowedPerCustomer) {
    return NextResponse.json(
      { error: "Trop de demandes pour ce client aujourd'hui. Réessayez demain." },
      { status: 429 }
    );
  }

  // ── 7. Calculer le fraud score ───────────────────────────────
  const { record: fraudRecord } = await findOrCreateFraudRecord(customerEmailNorm, customerPhoneNorm);
  const fraudScore = computeFraudScore(fraudRecord);
  const pastReturns = fraudRecord.totalClaims;
  const orderDateRaw = body.order_date ? new Date(String(body.order_date)) : null;

  // ── 8. Vérifier unicité et créer atomiquement ─────────────── (CRIT-6)
  let claim;
  try {
    claim = await prisma.$transaction(async (tx) => {
      const dup = await tx.claim.findFirst({
        where: { vendorId: keyRecord.vendorId, orderId },
        select: { id: true },
      });
      if (dup) {
        throw Object.assign(new Error("DUPLICATE_CLAIM"), { code: "DUPLICATE_CLAIM" });
      }
      return tx.claim.create({
        data: {
          vendorId:      keyRecord.vendorId,
          orderId,
          customerName:  String(body.customer_name).trim(),
          customerEmail: String(body.customer_email).trim().toLowerCase(),
          customerPhone: customerPhoneNorm ?? null,
          productName:   String(body.product_name).trim(),
          orderDate:     orderDateRaw && !isNaN(orderDateRaw.getTime()) ? orderDateRaw : null,
          type:          reasonToClaimType(reason),
          description,
          source:        body.source === "hosted_page" ? "HOSTED_PAGE" : "API",
          fraudScore,
          ipAddress:     ip,
          status:        "PENDING",
        },
      });
    });
  } catch (err: any) {
    if (err?.code === "DUPLICATE_CLAIM" || err?.code === "P2002") {
      return NextResponse.json(
        { error: "Une demande de retour existe déjà pour cette commande." },
        { status: 409 }
      );
    }
    throw err;
  }

  // ── 9. Incrémenter le compteur cross-boutique (best-effort) ──────
  prisma.customerFraudRecord.update({
    where: { id: fraudRecord.id },
    data: { totalClaims: { increment: 1 }, lastClaimAt: new Date() },
  }).catch((e) => console.error('[claims/create] fraud record update error:', e))

  // ── 10. Mettre à jour lastUsedAt de la clé API ─────────────────
  await prisma.apiKey.update({
    where: { id: keyRecord.id },
    data: { lastUsedAt: new Date() },
  });

  // ── 11. Log console structuré ─────────────────────────────────
  console.log(JSON.stringify({
    event:            "return_submitted",
    claimId:          claim.id,
    vendorId:         keyRecord.vendorId,
    orderId,
    reason,
    customerPastReturns: pastReturns,
    source:           claim.source,
    ip,
    timestamp:   new Date().toISOString(),
  }));

  return NextResponse.json(
    {
      success:    true,
      claim_id:   claim.id,
      status:     "PENDING",
      customer_past_returns: pastReturns,
      message:    "Votre demande de retour a été enregistrée.",
    },
    { status: 201 }
  );
}