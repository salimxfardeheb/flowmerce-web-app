import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashApiKey } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Score de risque basé sur la raison — préparation ML
// ─────────────────────────────────────────────────────────────
const REASON_RISK: Record<string, number> = {
  DEFECTIVE:    15,   // produit défectueux  → risque faible  (légitime)
  WRONG_ITEM:   25,   // erreur vendeur      → risque faible
  DESCRIPTION:  40,   // ne correspond pas   → risque moyen
  CHANGE_MIND:  70,   // changement d'avis   → risque élevé   (abus possible)
};

function computeFraudScore(
  reason: string,
  description: string,
  ip: string | null,
  orderId: string
): number {
  let score = REASON_RISK[reason] ?? 50;

  // Description trop courte = suspicious
  if (description.trim().length < 20) score += 15;

  // Description très courte = très suspicious
  if (description.trim().length < 10) score += 15;

  // Même orderId soumis plusieurs fois = déjà géré par rate limit,
  // mais on augmente le score si detecté ici aussi
  // (la vérification DB est dans le rate limiter ci-dessous)

  return Math.min(100, score);
}

// ─────────────────────────────────────────────────────────────
// Rate limiting : max 3 soumissions par orderId par heure
// ─────────────────────────────────────────────────────────────
async function checkRateLimit(orderId: string, ip: string): Promise<boolean> {
  const key     = `${ip}:${orderId}`;
  const now     = new Date();
  const resetAt = new Date(now.getTime() + 60 * 60 * 1000); // +1h

  try {
    return await prisma.$transaction(
      async (tx) => {
        const existing = await tx.returnRateLimit.findUnique({ where: { key } });

        if (!existing) {
          await tx.returnRateLimit.create({ data: { key, count: 1, resetAt } });
          return true;
        }

        if (existing.resetAt < now) {
          await tx.returnRateLimit.update({
            where: { key },
            data: { count: 1, resetAt },
          });
          return true;
        }

        if (existing.count >= 3) return false;

        await tx.returnRateLimit.update({
          where: { key },
          data: { count: { increment: 1 } },
        });
        return true;
      },
      { isolationLevel: "Serializable" }
    );
  } catch {
    return false;
  }
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

  // ── 1. Vérifier la clé API (header ou query param) ──────────
  const apiKey =
    req.headers.get("x-api-key") ??
    req.nextUrl.searchParams.get("api_key");

  if (!apiKey) {
    return NextResponse.json(
      { error: "Clé API manquante (header x-api-key ou param api_key)" },
      { status: 401 }
    );
  }

  // ── 2. Valider la clé API (lookup par hash, raw jamais stocké) ─
  const keyRecord = await prisma.apiKey.findUnique({
    where: { key: hashApiKey(apiKey) },
    include: {
      vendor: {
        include: { returnPolicy: true },
      },
    },
  });

  if (!keyRecord || !keyRecord.isActive) {
    return NextResponse.json({ error: "Clé API invalide ou révoquée" }, { status: 401 });
  }

  if (keyRecord.vendor.status !== "APPROVED") {
    return NextResponse.json(
      { error: "Compte vendeur non approuvé" },
      { status: 403 }
    );
  }

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

  // ── 7. Calculer le score de risque ───────────────────────────
  const fraudScore = computeFraudScore(reason, description, ip, orderId);
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

  // ── 9. Mettre à jour lastUsedAt de la clé API ─────────────────
  await prisma.apiKey.update({
    where: { id: keyRecord.id },
    data: { lastUsedAt: new Date() },
  });

  // ── 10. Log console structuré ─────────────────────────────────
  console.log(JSON.stringify({
    event:       "return_submitted",
    claimId:     claim.id,
    vendorId:    keyRecord.vendorId,
    orderId,
    reason,
    fraudScore,
    source:      claim.source,
    ip,
    timestamp:   new Date().toISOString(),
  }));

  return NextResponse.json(
    {
      success:    true,
      claim_id:   claim.id,
      status:     "PENDING",
      fraud_score: fraudScore,
      message:    "Votre demande de retour a été enregistrée.",
    },
    { status: 201 }
  );
}