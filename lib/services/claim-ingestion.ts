// lib/services/claim-ingestion.ts — Flowmerce
//
// Service unifié de création de claims (utilisé par /api/claims/create et
// /api/claims/external). Garantit que :
//   - La structure `prediction` JSONB est identique (15 champs canoniques).
//   - La déduplication se fait sur (vendorId, orderId).
//   - L'auto-approve AI_AUTO s'applique quelle que soit la source.
//
// Les validations spécifiques (rate limit, anti-HTML pour /create ;
// normalisation FR→EN, return policy pour /external) restent dans les routes.

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
  type:          'EXCHANGE' | 'REFUND' | 'REPAIR'
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

  // Décision IA pré-fournie (ex: body.ai_decision côté /external).
  // Stockée uniquement sur la colonne Claim.aiDecision — n'apparaît pas
  // dans le JSON prediction (qui ne contient resolution que si le ML
  // a été réellement appelé).
  preFilledAiDecision?: AIDecision | null

  // Payload ML brut. Si fourni, on tente une prédiction synchrone et on
  // persiste mlInput pour reprise par le worker /api/cron/retry-ml.
  mlPayload?: Record<string, unknown> | null
}

export type IngestClaimResult =
  | {
      ok: true
      claim: {
        id:           string
        status:       'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS'
        createdAt:    Date
        aiDecision:   AIDecision | null
        fraudScore:   number
        autoApproved: boolean
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
          aiDecision:    input.preFilledAiDecision ?? null,
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

  // 5. Appel ML (si payload fourni ET si aucune décision pré-fournie)
  let finalAiDecision: AIDecision | null = input.preFilledAiDecision ?? null
  if (input.mlPayload && !finalAiDecision) {
    const mlResult = await callMLPredict(input.mlPayload)
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

  // 6. Auto-approve si validationMode = AI_AUTO
  let autoApproved = false
  const returnPolicy = await prisma.returnPolicy.findUnique({
    where:  { vendorId: input.vendor.id },
    select: { validationMode: true },
  })

  if (returnPolicy?.validationMode === 'AI_AUTO') {
    const decision: AIDecision = finalAiDecision ?? 'Refund'
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
        aiDecision:  decision,
        prediction:  autoApprovedPrediction as unknown as Prisma.InputJsonValue,
      },
    })
    autoApproved = true
    finalAiDecision = decision

    notifyCustomer({
      customerName:  claim.customerName,
      customerEmail: claim.customerEmail,
      customerPhone: claim.customerPhone,
      orderId:       claim.orderId,
      status:        'APPROVED',
      aiDecision:    decision,
      claimType:     claim.type,
      note:          null,
    }).catch((err) => log.error('claim_ingestion.notification_error', { err: String(err) }))

    log.info('claim_ingestion.auto_approved', {
      claimId:  claim.id,
      vendorId: input.vendor.id,
      decision,
    })
  }

  log.info('claim_ingestion.created', {
    claimId:  claim.id,
    vendorId: input.vendor.id,
    orderId:  input.orderId,
    source:   input.source,
    autoApproved,
  })

  return {
    ok: true,
    claim: {
      id:           claim.id,
      status:       claim.status,
      createdAt:    claim.createdAt,
      aiDecision:   finalAiDecision,
      fraudScore,
      autoApproved,
    },
    customerPastReturns: pastReturns,
  }
}
