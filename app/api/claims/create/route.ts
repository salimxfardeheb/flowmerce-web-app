import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateApiKey } from "@/lib/api-key-auth";

async function getCustomerPastReturns(customerEmail: string, vendorId: string): Promise<number> {
  return prisma.claim.count({ where: { customerEmail, vendorId } });
}


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

  const validReasons = ["DEFECTIVE", "WRONG_ITEM", "DESCRIPTION", "CHANGE_MIND"];
  if (!validReasons.includes(String(body.reason))) {
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
  const rawKey =
    req.headers.get("x-api-key") ??
    req.nextUrl.searchParams.get("api_key");

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

  const orderId     = String(body.order_id).trim();
  const reason      = String(body.reason);
  const description = String(body.description).trim();

  // ── 5. Rate limiting ─────────────────────────────────────────
  const allowed = await checkRateLimit(orderId, ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "Trop de tentatives pour cette commande. Réessayez dans 1 heure." },
      { status: 429 }
    );
  }

  // ── 7. Calculer Customer_Past_Returns depuis la DB ───────────
  const pastReturns = await getCustomerPastReturns(
    String(body.customer_email).trim().toLowerCase(),
    keyRecord.vendorId
  );
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
        const e = new Error("DUPLICATE_CLAIM");
        (e as any).code = "DUPLICATE_CLAIM";
        throw e;
      }
      return tx.claim.create({
        data: {
          vendorId:      keyRecord.vendorId,
          orderId,
          customerName:  String(body.customer_name).trim(),
          customerEmail: String(body.customer_email).trim().toLowerCase(),
          productName:   String(body.product_name).trim(),
          orderDate:     orderDateRaw && !isNaN(orderDateRaw.getTime()) ? orderDateRaw : null,
          type:          reasonToClaimType(reason),
          description,
          source:        body.source === "hosted_page" ? "HOSTED_PAGE" : "API",
          fraudScore:    pastReturns,
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

  // ── 9. Mettre à jour lastUsedAt de la clé API ─────────────────
  await prisma.apiKey.update({
    where: { id: keyRecord.id },
    data: { lastUsedAt: new Date() },
  });

  // ── 10. Log console structuré ─────────────────────────────────
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