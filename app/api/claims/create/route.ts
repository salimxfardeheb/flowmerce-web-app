import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateApiKey } from "@/lib/api-key-auth";
import { findOrCreateFraudRecord, computeFraudScore, recomputeNetworkSignals } from "@/lib/fraud-score";
import { EXTERNAL_RETURN_REASONS } from "@/lib/constants";
import { callMLPredict, type MLPredictionOutput } from "@/lib/services/ml";
import { log } from "@/lib/logger";


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

  // Le vendeur peut envoyer un ml_payload (cf. ReturnRequest dans /api/predict) pour
  // déclencher une prédiction ML automatique. Stocké tel quel et rejoué par le worker
  // de reprise si l'appel échoue.
  const mlPayload = body.ml_payload && typeof body.ml_payload === "object"
    ? (body.ml_payload as Record<string, unknown>)
    : null;

  // ── 8. Créer atomiquement claim + incrément fraud record ─────
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
      const created = await tx.claim.create({
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
          mlInput:       mlPayload ? (mlPayload as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });
      await tx.customerFraudRecord.update({
        where: { id: fraudRecord.id },
        data:  { totalClaims: { increment: 1 }, lastClaimAt: new Date() },
      });
      return created;
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

  // ── 10. Mettre à jour lastUsedAt + diversité réseau ───────────
  await prisma.apiKey.update({
    where: { id: keyRecord.id },
    data: { lastUsedAt: new Date() },
  });

  // Recompute distinctVendors hors transaction (best-effort) :
  // le Claim vient d'être inséré, donc le COUNT(DISTINCT vendorId)
  // reflète maintenant ce nouveau marchand s'il était nouveau pour ce client.
  recomputeNetworkSignals(customerEmailNorm, customerPhoneNorm)
    .catch((e) => console.error('[claims/create] recomputeNetworkSignals error:', e));

  // ── 10.5. Appel ML (si payload fourni) ────────────────────────
  // En cas d'échec on marque mlFailed=true ; le worker /api/cron/retry-ml
  // reprendra plus tard depuis mlInput persisté en base.
  if (mlPayload) {
    const mlResult = await callMLPredict(mlPayload);
    if (mlResult.ok) {
      const pred = mlResult.prediction as MLPredictionOutput;
      const probs = pred.resolution?.probabilities ?? {};
      const aiScore = Object.values(probs).length ? Math.max(...Object.values(probs)) : null;

      const updated = await prisma.claim.update({
        where: { id: claim.id },
        data: {
          prediction: pred as unknown as Prisma.InputJsonValue,
          aiDecision: pred.resolution?.prediction ?? null,
          aiScore,
          mlFailed:   false,
          mlAttempts: { increment: 1 },
        },
      });
      claim = updated;
    } else {
      await prisma.claim.update({
        where: { id: claim.id },
        data: { mlFailed: true, mlAttempts: { increment: 1 } },
      });
      log.warn("ml.predict.failed_on_create", { claimId: claim.id, error: mlResult.error });
    }
  }

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

  // ── 12. Auto-approbation si validationMode = AI_AUTO ──────────
  const returnPolicy = await prisma.returnPolicy.findUnique({
    where:  { vendorId: keyRecord.vendorId },
    select: { validationMode: true },
  })

  if (returnPolicy?.validationMode === 'AI_AUTO') {
    const decision = (claim.aiDecision ?? 'Refund') as 'Refund' | 'Exchange' | 'Repair' | 'Reject'

    await prisma.claim.update({
      where: { id: claim.id },
      data: {
        status:      'APPROVED',
        processedAt: new Date(),
        aiDecision:  decision,
        prediction: {
          autoApprovedAt: new Date().toISOString(),
          autoApprovedBy: 'auto_on_create',
        },
      },
    })

    const { notifyCustomer } = await import('@/lib/services/notification')
    notifyCustomer({
      customerName:  claim.customerName,
      customerEmail: claim.customerEmail,
      customerPhone: claim.customerPhone ?? null,
      orderId:       claim.orderId,
      status:        'APPROVED',
      aiDecision:    decision,
      claimType:     claim.type,
      note:          null,
    }).catch(err => console.error('[claims/create] Erreur notification auto-approve :', err))

    console.log(JSON.stringify({
      event:     'claim_auto_approved',
      claimId:   claim.id,
      vendorId:  keyRecord.vendorId,
      decision,
      timestamp: new Date().toISOString(),
    }))

    return NextResponse.json(
      {
        success:    true,
        claim_id:   claim.id,
        status:     'APPROVED',
        customer_past_returns: pastReturns,
        message:    'Votre demande de retour a été enregistrée et approuvée automatiquement.',
      },
      { status: 201 }
    )
  }

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