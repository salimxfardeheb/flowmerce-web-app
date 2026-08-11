// lib/services/claim-decision.ts — Flowmerce
//
// Application de la décision issue d'une prédiction ML, pour une réclamation
// déjà créée.
//
// ─────────────────────────────────────────────────────────────────────────────
// Pourquoi ce module existe (C-05)
// ─────────────────────────────────────────────────────────────────────────────
// La règle métier « un Reject du modèle refuse la réclamation, un Exchange ou un
// Repair l'approuve en mode AI_AUTO » était écrite dans `ingestClaim`, et
// seulement là. Le worker `/api/cron/retry-ml`, qui rejoue les prédictions
// échouées, écrivait `aiDecision`, `aiScore` et `mlFailed=false` — mais jamais
// `status`, et n'envoyait aucune notification. Une réclamation dont l'appel ML
// avait échoué à la soumission restait donc `PENDING` indéfiniment, même après
// une reprise réussie : le résultat métier dépendait de la disponibilité d'un
// service tiers à la seconde près.
//
// Les deux chemins passent désormais par `applyMLDecision` :
//
//   ingestClaim ──┐
//                 ├── applyMLDecision() ── status + aiDecision + notification
//   retry-ml ─────┘
//
// ─────────────────────────────────────────────────────────────────────────────
// Idempotence
// ─────────────────────────────────────────────────────────────────────────────
// Le worker peut repasser sur la même réclamation (relance manuelle, exécutions
// concurrentes du cron, réessai après timeout). La transition de statut est donc
// conditionnelle en base : `updateMany` filtré sur `status: 'PENDING'`. Seul
// l'appel qui a effectivement modifié la ligne (`count === 1`) notifie le
// client. Un second passage ne change rien et n'envoie rien.

import { Prisma, type ReturnPolicy } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { notifyCustomer } from '@/lib/services/notification'
import { checkReturnPolicy } from '@/lib/services/return-policy'
import { log } from '@/lib/logger'
import type { AIDecision } from '@/lib/constants'
import type { MLPredictionOutput } from '@/lib/services/ml'

// Réclamation telle que les deux appelants savent la fournir.
export interface DecidableClaim {
  id:            string
  vendorId:      string
  status:        'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS'
  type:          'EXCHANGE' | 'REFUND' | 'REPAIR' | null
  orderDate:     Date | null
  prediction:    Prisma.JsonValue | null
  customerName:  string
  customerEmail: string
  customerPhone: string | null
  orderId:       string
}

/** Politique vendeur : ce dont la décision a besoin, et rien de plus. */
type DecisionPolicy = Pick<
  ReturnPolicy,
  'validationMode' | 'maxClaimDays' | 'nonRefundableCategories' | 'exchangeOnlyCategories' | 'acceptedTypes'
>

export interface ApplyMLDecisionOptions {
  /** Politique du vendeur. Chargée par l'appelant s'il l'a déjà en main. */
  returnPolicy?: DecisionPolicy | null
  /** Origine de l'appel — journalisation seulement. */
  origin: 'ingestion' | 'retry'
}

export interface ApplyMLDecisionResult {
  decision:     AIDecision
  aiScore:      number | null
  status:       'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS'
  autoApproved: boolean
  autoRejected: boolean
  /** Faux quand la réclamation avait déjà été tranchée (reprise idempotente). */
  applied:      boolean
  refundEligible: boolean
}

/**
 * Écrit la prédiction sur la réclamation, en déduit le statut métier, notifie
 * le client si — et seulement si — cet appel a réellement opéré la transition.
 */
export async function applyMLDecision(
  claim:      DecidableClaim,
  prediction: MLPredictionOutput,
  opts:       ApplyMLDecisionOptions,
): Promise<ApplyMLDecisionResult> {
  const probs   = prediction.resolution?.probabilities ?? {}
  const aiScore = Object.values(probs).length ? Math.max(...Object.values(probs)) : null
  // Garanti ∈ {Exchange, Repair, Reject} par la validation dans ml.ts.
  const decision: AIDecision = prediction.resolution.prediction

  const returnPolicy =
    opts.returnPolicy !== undefined
      ? opts.returnPolicy
      : await prisma.returnPolicy.findUnique({ where: { vendorId: claim.vendorId } })

  const existingPrediction = (claim.prediction as Prisma.JsonObject | null) ?? {}

  // Drapeau « remboursement éligible » — informatif pour le vendeur. Il ne
  // modifie ni le statut, ni aiDecision, ni claim.type.
  const daysToReturn = claim.orderDate
    ? Math.max(0, Math.floor((Date.now() - claim.orderDate.getTime()) / 86_400_000))
    : 0
  const productCategory =
    typeof existingPrediction.productCategory === 'string'
      ? existingPrediction.productCategory
      : undefined
  const refundEligible =
    claim.type === 'REFUND' &&
    decision !== 'Reject' &&
    checkReturnPolicy(returnPolicy, {
      daysToReturn,
      productCategory,
      claimType: claim.type ?? undefined,
    }).ok

  // 1. Résultat de la prédiction — toujours écrit, quel que soit le statut.
  //    `resolutionSource: MODEL` : cette décision vient du modèle, elle n'est
  //    pas une vérité terrain (C-04).
  const mergedPrediction: Prisma.JsonObject = {
    ...existingPrediction,
    ...(prediction as unknown as Prisma.JsonObject),
    refundEligible,
  }

  await prisma.claim.update({
    where: { id: claim.id },
    data: {
      aiDecision:       decision,
      aiScore,
      mlFailed:         false,
      mlAttempts:       { increment: 1 },
      resolutionSource: 'MODEL',
      prediction:       mergedPrediction as unknown as Prisma.InputJsonValue,
    },
  })

  // 2. Décision métier.
  //    - Reject                      → refus, quel que soit le mode de validation
  //    - Exchange/Repair + AI_AUTO   → approbation, sauf demande de remboursement
  //    - sinon                       → reste PENDING, le vendeur tranche
  const autoReject = decision === 'Reject'
  const autoApprove =
    !autoReject &&
    returnPolicy?.validationMode === 'AI_AUTO' &&
    claim.type !== 'REFUND'

  if (!autoReject && !autoApprove) {
    log.info('claim_decision.pending', {
      claimId:  claim.id,
      vendorId: claim.vendorId,
      decision,
      origin:   opts.origin,
    })
    return {
      decision, aiScore, status: claim.status,
      autoApproved: false, autoRejected: false, applied: true, refundEligible,
    }
  }

  const targetStatus = autoReject ? 'REJECTED' : 'APPROVED'
  const marker = autoReject
    ? { autoRejectedAt: new Date().toISOString(), autoRejectedBy: 'ml_decision' }
    : { autoApprovedAt: new Date().toISOString(), autoApprovedBy: 'auto_on_create' }

  // Transition conditionnelle : n'agit que si la réclamation est encore en
  // attente. C'est la garantie d'idempotence — une reprise qui repasse sur une
  // réclamation déjà tranchée ne la modifie pas et ne renotifie pas.
  const { count } = await prisma.claim.updateMany({
    where: { id: claim.id, status: 'PENDING' },
    data: {
      status:      targetStatus,
      processedAt: new Date(),
      prediction:  { ...mergedPrediction, ...marker } as unknown as Prisma.InputJsonValue,
    },
  })

  if (count === 0) {
    log.info('claim_decision.already_resolved', {
      claimId:  claim.id,
      vendorId: claim.vendorId,
      decision,
      origin:   opts.origin,
    })
    return {
      decision, aiScore, status: claim.status,
      autoApproved: false, autoRejected: false, applied: false, refundEligible,
    }
  }

  notifyCustomer({
    customerName:  claim.customerName,
    customerEmail: claim.customerEmail,
    customerPhone: claim.customerPhone,
    orderId:       claim.orderId,
    status:        targetStatus,
    aiDecision:    decision,
    claimType:     claim.type,
    note:          null,
  }).catch((err) => log.error('claim_decision.notification_error', { err: String(err) }))

  log.info(autoReject ? 'claim_decision.auto_rejected' : 'claim_decision.auto_approved', {
    claimId:  claim.id,
    vendorId: claim.vendorId,
    decision,
    origin:   opts.origin,
  })

  return {
    decision,
    aiScore,
    status:       targetStatus,
    autoApproved: !autoReject,
    autoRejected: autoReject,
    applied:      true,
    refundEligible,
  }
}
