// lib/services/claim-ingestion.ts — Flowmerce
//
// Service unifié de création de claims, en aval du canal unique de soumission
// (lib/services/return-submission → POST /api/v1/returns).
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
import { checkReturnPolicy } from '@/lib/services/return-policy'
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
  customerId:      string | null
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
  customerId?:      string | null
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
    customerId:      input.customerId      ?? null,
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
  // Identifiant du client côté boutique (Customer_ID du dataset ML).
  customerId?:   string | null
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

  // Réclamation hors politique vendeur. Quand il est fourni, le claim est
  // refusé d'office : aucune prédiction n'est demandée (le ML n'a rien à
  // arbitrer, la règle est déterministe) et le vendeur ne le voit pas.
  // Le `mlInput` reste persisté : ces réclamations sont précisément les
  // exemples négatifs qui manquent au dataset d'entraînement.
  //
  // `notify` : envoyer le mail de refus au client. Vrai sur la page hébergée,
  // où Flowmerce porte la relation client. Faux sur les API directes : la
  // boutique reçoit un 422 et informe son client elle-même — un mail de notre
  // part ferait doublon avec le sien.
  policyViolation?: { code: string; message: string; notify: boolean } | null
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
        fraudScore:     number
        autoApproved:   boolean
        autoRejected:   boolean
        policyRejected: boolean
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
  const customerIdNorm    = input.customerId?.trim() || null
  const policyViolation   = input.policyViolation ?? null

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
    customerId:      customerIdNorm,
    customerPhone:   customerPhoneNorm,
    ...input.prediction,
  })

  // 2 bis. Enrichissement du payload ML avec les signaux que seul ingestClaim
  // connaît (fraud score, past returns, seuil suspicious). Fait AVANT la
  // création pour que `mlInput` persisté soit exactement le payload envoyé au
  // ML — sinon les placeholders à 0 de buildMLPayload restent en base et
  // repartent tels quels à l'export /save_claim et au worker retry-ml.
  const returnPolicy = input.mlPayload
    ? await prisma.returnPolicy.findUnique({ where: { vendorId: input.vendor.id } })
    : null

  const enrichedMlPayload = input.mlPayload
    ? {
        ...input.mlPayload,
        // Identité client : la valeur passée à ingestClaim fait foi (elle est
        // aussi persistée en colonne). Sans valeur, on laisse celle du payload.
        ...(customerIdNorm ? { Customer_ID: customerIdNorm } : {}),
        Fraud_Score:           fraudScore,
        Customer_Past_Returns: pastReturns,
        Is_Suspicious:
          pastReturns >= (returnPolicy?.fraudReturnThreshold ?? 4) ? 1 : 0,
      }
    : null

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
          customerId:    customerIdNorm,
          customerName:  input.customerName.trim(),
          customerEmail: customerEmailNorm,
          customerPhone: customerPhoneNorm,
          productName:   input.productName.trim(),
          orderDate:     input.orderDate ?? null,
          type:          input.type,
          description:   input.description,
          source:        input.source,
          // Hors politique : refus immédiat et définitif, le claim naît
          // tranché. Sinon PENDING, en attente du ML ou du vendeur.
          status:        policyViolation ? 'REJECTED' : 'PENDING',
          processedAt:   policyViolation ? new Date() : null,
          policyRejected: !!policyViolation,
          fraudScore,
          ipAddress:     input.ipAddress ?? null,
          aiDecision:    policyViolation ? 'Reject' : null,
          prediction:    (policyViolation
            ? { ...predictionData, policyViolation }
            : predictionData) as unknown as Prisma.InputJsonValue,
          mlInput:       enrichedMlPayload
            ? (enrichedMlPayload as Prisma.InputJsonValue)
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

  // 4 bis. Hors politique : le dossier est clos avant même le ML. On notifie le
  // client (il a soumis, il mérite une réponse) et on s'arrête là — pas de
  // prédiction, pas d'auto-approve, rien à afficher au vendeur.
  if (policyViolation) {
    if (policyViolation.notify) {
      notifyCustomer({
        customerName:  claim.customerName,
        customerEmail: claim.customerEmail,
        customerPhone: claim.customerPhone,
        orderId:       claim.orderId,
        status:        'REJECTED',
        aiDecision:    'Reject',
        claimType:     claim.type,
        note:          policyViolation.message,
      }).catch((err) => log.error('claim_ingestion.notification_error', { err: String(err) }))
    }

    log.info('claim_ingestion.policy_rejected', {
      claimId:  claim.id,
      vendorId: input.vendor.id,
      orderId:  input.orderId,
      code:     policyViolation.code,
      notified: policyViolation.notify,
    })

    return {
      ok: true,
      claim: {
        id:             claim.id,
        status:         claim.status,
        type:           input.type,
        createdAt:      claim.createdAt,
        aiDecision:     'Reject',
        fraudScore,
        autoApproved:   false,
        autoRejected:   true,
        policyRejected: true,
      },
      customerPastReturns: pastReturns,
    }
  }

  // 5. Appel ML (si payload fourni) — sur le payload enrichi persisté en 2 bis.
  let finalAiDecision: AIDecision | null = null
  let refundEligible = false
  if (enrichedMlPayload) {
    const mlResult = await callMLPredict(enrichedMlPayload)
    if (mlResult.ok) {
      const pred  = mlResult.prediction as MLPredictionOutput
      const probs = pred.resolution?.probabilities ?? {}
      const aiScore = Object.values(probs).length ? Math.max(...Object.values(probs)) : null
      // Garanti ∈ {Exchange, Repair, Reject} par la validation dans ml.ts.
      const resolution: AIDecision = pred.resolution.prediction

      // Drapeau "remboursement éligible" — calculé UNIQUEMENT côté web app.
      // Purement informatif pour le vendeur : ne modifie ni le statut du claim,
      // ni aiDecision, ni claim.type, et ne déclenche aucune action financière.
      const daysToReturn = input.orderDate
        ? Math.max(0, Math.floor((Date.now() - input.orderDate.getTime()) / 86_400_000))
        : 0
      refundEligible =
        input.type === 'REFUND' &&
        resolution !== 'Reject' &&
        checkReturnPolicy(returnPolicy, {
          daysToReturn,
          productCategory: predictionData.productCategory ?? undefined,
          claimType:       input.type,
        }).ok

      // Merge : 14 champs canoniques + tout ce que le ML a renvoyé
      // (resolution, risk_flag, shipping_paid_by…). Pas de aiDecision plat.
      const updatedPrediction = {
        ...predictionData,
        ...(pred as unknown as Prisma.JsonObject),
        refundEligible,
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
  //    - Exchange/Repair + AI_AUTO → claim auto-approuvé.
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
    // Le remboursement (type REFUND) n'est JAMAIS auto-approuvé : c'est un
    // choix du client stocké dans claim.type, distinct de aiDecision — le
    // vendeur doit valider chaque remboursement manuellement, même en
    // validationMode AI_AUTO. Les échanges/réparations (EXCHANGE/REPAIR)
    // conservent le comportement auto-approve existant.
    if (returnPolicy?.validationMode === 'AI_AUTO' && input.type !== 'REFUND') {
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
    type:     claim.type,
    autoApproved,
    autoRejected,
  })

  return {
    ok: true,
    claim: {
      id:             claim.id,
      status:         claim.status,
      type:           input.type,
      createdAt:      claim.createdAt,
      aiDecision:     finalAiDecision,
      fraudScore,
      autoApproved,
      autoRejected,
      policyRejected: false,
    },
    customerPastReturns: pastReturns,
  }
}
