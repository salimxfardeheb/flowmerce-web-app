// lib/services/claim-ingestion.ts — Flowmerce
//
// Service unifié de création de claims (utilisé par /api/claims/create).
// Garantit que :
//   - La structure `prediction` JSONB est identique (14 champs canoniques).
//   - La déduplication se fait sur (vendorId, orderId).
//   - L'auto-approve / auto-reject AI_AUTO s'applique dès qu'une décision IA
//     est disponible.
//
// Les validations spécifiques (rate limit, anti-HTML) restent dans les routes.

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  findOrCreateFraudRecord,
  computeFraudScore,
  recomputeNetworkSignals,
} from '@/lib/fraud-score'
import { callMLPredict, type MLPredictionOutput } from '@/lib/services/ml'
import { notifyCustomer } from '@/lib/services/notification'
import { log } from '@/lib/logger'
import type { AIDecision } from '@/lib/constants'

// ─────────────────────────────────────────────────────────────
// Structure canonique de `prediction` (14 champs de base, ordre fixe).
// Si le ML est appelé avec succès, son résultat brut (resolution, risk_flag,
// shipping_paid_by…) est mergé en plus à la racine.
// ─────────────────────────────────────────────────────────────
export interface CanonicalPrediction {
  shopName:        string
  orderTotal:      number | null
  customerAge:     number | null
  orderAddress:    string | null
  productPrice:    number | null
  shippingCost:    number | null
  customerPhone:   string | null
  paymentMethod:   string
  customerGender:  string
  customerWilaya:  string
  shippingMethod:  string
  productCategory: string | null
  productQuantity: number | null
}

function buildPrediction(input: {
  shopName:         string
  orderTotal?:      number | null
  customerAge?:     number | null
  orderAddress?:    string | null
  productPrice?:    number | null
  shippingCost?:    number | null
  customerPhone?:   string | null
  paymentMethod?:   string | null
  customerGender?:  string | null
  customerWilaya?:  string | null
  shippingMethod?:  string | null
  productCategory?: string | null
  productQuantity?: number | null
}): CanonicalPrediction {
  return {
    shopName:        input.shopName,
    orderTotal:      input.orderTotal      ?? null,
    customerAge:     input.customerAge     ?? null,
    orderAddress:    input.orderAddress    ?? null,
    productPrice:    input.productPrice    ?? null,
    shippingCost:    input.shippingCost    ?? null,
    customerPhone:   input.customerPhone   ?? null,
    paymentMethod:   input.paymentMethod   ?? 'Unknown',
    customerGender:  input.customerGender  ?? 'Unknown',
    customerWilaya:  input.customerWilaya  ?? 'Unknown',
    shippingMethod:  input.shippingMethod  ?? 'Standard',
    productCategory: input.productCategory ?? null,
    productQuantity: input.productQuantity ?? null,
  }
}

// ─────────────────────────────────────────────────────────────
// Input du service
// ─────────────────────────────────────────────────────────────
export interface IngestClaimInput {
  vendor: {
    id:          string
    companyName: string
  }
  apiKeyId?: string

  // Champs Claim "racine"
  orderId:       string
  customerName:  string
  customerEmail: string
  customerPhone: string | null
  productName:   string
  description:   string
  type:          'EXCHANGE' | 'REFUND' | 'REPAIR'  // choix client (desired_resolution)
  source:        'API' | 'HOSTED_PAGE'
  ipAddress?:    string | null
  orderDate?:    Date | null

  // Champs alimentant `prediction` (14 champs canoniques de base)
  prediction: {
    orderTotal?:      number | null
    customerAge?:     number | null
    orderAddress?:    string | null
    productPrice?:    number | null
    shippingCost?:    number | null
    paymentMethod?:   string | null
    customerGender?:  string | null
    customerWilaya?:  string | null
    shippingMethod?:  string | null
    productCategory?: string | null
    productQuantity?: number | null
  }

  // Payload ML brut. Si fourni, on tente une prédiction synchrone et on
  // persiste mlInput pour reprise par le worker /api/cron/retry-ml.
  // Typé `object` pour accepter à la fois MLPayload (interface fermée) et
  // un Record générique sans avoir besoin de cast côté appelant.
  mlPayload?: object | null
}

export type IngestClaimResult =
  | {
      ok: true
      claim: {
        id:           string
        status:       'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS'
        type:         'EXCHANGE' | 'REFUND' | 'REPAIR'
        createdAt:    Date
        aiDecision:   AIDecision | null
        fraudScore:   number
        autoApproved: boolean
        autoRejected: boolean
      }
      customerPastReturns: number
    }
  | { ok: false; code: 'DUPLICATE_CLAIM'; existingClaimId?: string }

// ─────────────────────────────────────────────────────────────
// Service principal
// ─────────────────────────────────────────────────────────────
export async function ingestClaim(input: IngestClaimInput): Promise<IngestClaimResult> {
  const customerEmailNorm = input.customerEmail.trim().toLowerCase()
  const customerPhoneNorm = input.customerPhone?.trim() || null

  // 1. Fraud score
  const { record: fraudRecord } = await findOrCreateFraudRecord(
    customerEmailNorm,
    customerPhoneNorm ?? undefined,
  )
  const fraudScore  = computeFraudScore(fraudRecord)
  const pastReturns = fraudRecord.totalClaims

  // 2. Prediction canonique (14 champs de base, sans aiDecision plat).
  // Le résultat ML sera mergé en plus si l'appel réussit (étape 5).
  const predictionData = buildPrediction({
    shopName:        input.vendor.companyName,
    customerPhone:   customerPhoneNorm,
    ...input.prediction,
  })

  // 3. Création atomique : dédup (vendorId, orderId) + incrément fraud record
  let claim
  try {
    claim = await prisma.$transaction(async (tx) => {
      const dup = await tx.claim.findFirst({
        where:  { vendorId: input.vendor.id, orderId: input.orderId },
        select: { id: true },
      })
      if (dup) {
        throw Object.assign(new Error('DUPLICATE_CLAIM'), {
          code: 'DUPLICATE_CLAIM',
          existingClaimId: dup.id,
        })
      }

      // À la création, type = choix du client (input.type). Le ML peut
      // recommander une autre résolution dans aiDecision, mais ne modifie
      // jamais type. L'UI montre les deux côte à côte.
      const created = await tx.claim.create({
        data: {
          vendorId:      input.vendor.id,
          apiKeyId:      input.apiKeyId ?? null,
          orderId:       input.orderId,
          customerName:  input.customerName.trim(),
          customerEmail: customerEmailNorm,
          customerPhone: customerPhoneNorm,
          productName:   input.productName.trim(),
          orderDate:     input.orderDate ?? null,
          type:          input.type,
          description:   input.description,
          source:        input.source,
          status:        'PENDING',
          fraudScore,
          ipAddress:     input.ipAddress ?? null,
          aiDecision:    null,
          prediction:    predictionData as unknown as Prisma.InputJsonValue,
          mlInput:       input.mlPayload
            ? (input.mlPayload as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      })

      await tx.customerFraudRecord.update({
        where: { id: fraudRecord.id },
        data:  { totalClaims: { increment: 1 }, lastClaimAt: new Date() },
      })

      return created
    })
  } catch (err: unknown) {
    const e = err as { code?: string; existingClaimId?: string }
    if (e?.code === 'DUPLICATE_CLAIM' || e?.code === 'P2002') {
      return { ok: false, code: 'DUPLICATE_CLAIM', existingClaimId: e.existingClaimId }
    }
    throw err
  }

  // 4. Best-effort : recompute network signals + lastUsedAt apiKey
  recomputeNetworkSignals(customerEmailNorm, customerPhoneNorm).catch((e) =>
    log.error('claim_ingestion.recompute_network_error', { err: String(e) }),
  )
  if (input.apiKeyId) {
    prisma.apiKey
      .update({ where: { id: input.apiKeyId }, data: { lastUsedAt: new Date() } })
      .catch((e) => log.error('claim_ingestion.api_key_update_error', { err: String(e) }))
  }

  // 5. Appel ML (si payload fourni)
  //    On enrichit le payload avec les signaux que seul ingestClaim connaît
  //    (fraud score, past returns, seuil suspicious) avant l'envoi au ML.
  let finalAiDecision: AIDecision | null = null
  if (input.mlPayload) {
    const returnPolicyForML = await prisma.returnPolicy.findUnique({
      where:  { vendorId: input.vendor.id },
      select: { fraudReturnThreshold: true },
    })
    const suspiciousThreshold = returnPolicyForML?.fraudReturnThreshold ?? 4

    const enrichedMlPayload = {
      ...input.mlPayload,
      Fraud_Score:           fraudScore,
      Customer_Past_Returns: pastReturns,
      Is_Suspicious:         pastReturns >= suspiciousThreshold ? 1 : 0,
    }

    const mlResult = await callMLPredict(enrichedMlPayload)
    if (mlResult.ok) {
      const pred  = mlResult.prediction as MLPredictionOutput
      const probs = pred.resolution?.probabilities ?? {}
      const aiScore = Object.values(probs).length ? Math.max(...Object.values(probs)) : null
      const resolution = (pred.resolution?.prediction ?? null) as AIDecision | null

      // Merge : 14 champs canoniques + tout ce que le ML a renvoyé
      // (resolution, risk_flag, shipping_paid_by…). Pas de aiDecision plat.
      const updatedPrediction = {
        ...predictionData,
        ...(pred as unknown as Prisma.JsonObject),
      }

      claim = await prisma.claim.update({
        where: { id: claim.id },
        data: {
          aiDecision: resolution,
          aiScore,
          mlFailed:   false,
          mlAttempts: { increment: 1 },
          prediction: updatedPrediction as unknown as Prisma.InputJsonValue,
        },
      })
      finalAiDecision = resolution
    } else {
      await prisma.claim
        .update({
          where: { id: claim.id },
          data:  { mlFailed: true, mlAttempts: { increment: mlResult.attempts } },
        })
        .catch((e) => log.error('claim_ingestion.ml_failure_flag_error', { err: String(e) }))
      log.warn('claim_ingestion.ml_failed', {
        claimId:  claim.id,
        error:    mlResult.error,
        timedOut: mlResult.timedOut,
        attempts: mlResult.attempts,
      })
    }
  }

  // 6. Décision automatique basée sur le ML
  //    - Reject  → claim auto-rejeté quel que soit validationMode (le ML est
  //                la seule source qui peut refuser, après que la return policy
  //                vendeur a déjà été validée en amont par la route).
  //    - Refund/Exchange/Repair + AI_AUTO → claim auto-approuvé.
  //    - Sinon (ML absent/fail ou validationMode=MANUAL) → reste PENDING,
  //      le vendeur traite manuellement.
  let autoApproved = false
  let autoRejected = false

  if (finalAiDecision === 'Reject') {
    const rejectedPrediction = {
      ...(claim.prediction as Prisma.JsonObject),
      autoRejectedAt: new Date().toISOString(),
      autoRejectedBy: 'ml_decision',
    }

    claim = await prisma.claim.update({
      where: { id: claim.id },
      data: {
        status:      'REJECTED',
        processedAt: new Date(),
        prediction:  rejectedPrediction as unknown as Prisma.InputJsonValue,
      },
    })
    autoRejected = true

    notifyCustomer({
      customerName:  claim.customerName,
      customerEmail: claim.customerEmail,
      customerPhone: claim.customerPhone,
      orderId:       claim.orderId,
      status:        'REJECTED',
      aiDecision:    finalAiDecision,
      claimType:     claim.type,
      note:          null,
    }).catch((err) => log.error('claim_ingestion.notification_error', { err: String(err) }))

    log.info('claim_ingestion.auto_rejected', {
      claimId:  claim.id,
      vendorId: input.vendor.id,
      decision: finalAiDecision,
    })
  } else if (finalAiDecision) {
    const returnPolicy = await prisma.returnPolicy.findUnique({
      where:  { vendorId: input.vendor.id },
      select: { validationMode: true },
    })

    if (returnPolicy?.validationMode === 'AI_AUTO') {
      const autoApprovedPrediction = {
        ...(claim.prediction as Prisma.JsonObject),
        autoApprovedAt: new Date().toISOString(),
        autoApprovedBy: 'auto_on_create',
      }

      claim = await prisma.claim.update({
        where: { id: claim.id },
        data: {
          status:      'APPROVED',
          processedAt: new Date(),
          aiDecision:  finalAiDecision,
          prediction:  autoApprovedPrediction as unknown as Prisma.InputJsonValue,
        },
      })
      autoApproved = true

      notifyCustomer({
        customerName:  claim.customerName,
        customerEmail: claim.customerEmail,
        customerPhone: claim.customerPhone,
        orderId:       claim.orderId,
        status:        'APPROVED',
        aiDecision:    finalAiDecision,
        claimType:     claim.type,
        note:          null,
      }).catch((err) => log.error('claim_ingestion.notification_error', { err: String(err) }))

      log.info('claim_ingestion.auto_approved', {
        claimId:  claim.id,
        vendorId: input.vendor.id,
        decision: finalAiDecision,
      })
    }
  }

  log.info('claim_ingestion.created', {
    claimId:  claim.id,
    vendorId: input.vendor.id,
    orderId:  input.orderId,
    source:   input.source,
    autoApproved,
    autoRejected,
  })

  return {
    ok: true,
    claim: {
      id:           claim.id,
      status:       claim.status,
      type:         input.type,
      createdAt:    claim.createdAt,
      aiDecision:   finalAiDecision,
      fraudScore,
      autoApproved,
      autoRejected,
    },
    customerPastReturns: pastReturns,
  }
}
