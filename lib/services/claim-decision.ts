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
import { TYPE_TO_RESOLUTION, VENDOR_DECISIONS, type AIDecision } from '@/lib/constants'
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
  /** Résolution recommandée, ou `null` si aucune n'est autorisée par le vendeur. */
  decision:     AIDecision | null
  aiScore:      number | null
  status:       'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS'
  autoApproved: boolean
  autoRejected: boolean
  /** Faux quand la réclamation avait déjà été tranchée (reprise idempotente). */
  applied:      boolean
  refundEligible: boolean
  recommendation: ResolutionRecommendation
}

// ─────────────────────────────────────────────────────────────────────────────
// Recommandation ≠ classe de score maximal
//
// Le vendeur configure les résolutions qu'il offre (`ReturnPolicy.acceptedTypes`).
// Le modèle, lui, score toutes ses classes sans connaître cette configuration.
// Prendre son argmax tel quel revenait à recommander une résolution que le
// vendeur ne propose pas — une réparation à une boutique qui ne répare pas.
//
//   scores du modèle → résolutions autorisées → filtrage → meilleure autorisée
//
// Deux principes tenus ici :
//
//   1. Le score affiché reste **le score du modèle** pour la résolution retenue.
//      Aucune renormalisation : si le modèle donne 30 % à Refund, la
//      recommandation Refund vaut 30 %, pas 67 % obtenus en redistribuant la
//      masse des classes écartées. Renormaliser laisserait croire à une
//      confiance que le modèle n'a jamais exprimée.
//
//   2. `Reject` n'est pas une résolution offerte, c'est un refus — il n'est donc
//      pas soumis au filtre. Il ne peut pas non plus l'emporter par élimination :
//      il n'est retenu que s'il est la classe de score maximal du modèle, ce qui
//      préserve exactement la règle existante « un Reject du ML refuse la
//      réclamation ». Sans cette réserve, une réclamation que le modèle voulait
//      réparer deviendrait un refus dès que la réparation n'est pas offerte.
// ─────────────────────────────────────────────────────────────────────────────

/** Aucune des résolutions offertes par le vendeur n'est scorée par le modèle. */
export const NO_ALLOWED_RESOLUTION = 'NO_ALLOWED_RESOLUTION' as const

export type ResolutionRecommendation =
  | {
      ok:         true
      resolution: AIDecision
      /** Probabilité du modèle pour cette résolution. Jamais renormalisée. */
      score:      number | null
      /** Classe de score maximal du modèle, avant filtrage. */
      mlTop:      AIDecision
      mlTopScore: number | null
      /** Vrai quand la résolution retenue n'est pas celle de score maximal. */
      filtered:   boolean
      allowed:    string[]
    }
  | {
      ok:         false
      reason:     typeof NO_ALLOWED_RESOLUTION
      mlTop:      AIDecision
      mlTopScore: number | null
      allowed:    string[]
    }

function score(probabilities: Record<string, number>, resolution: string): number | null {
  const v = probabilities[resolution]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Sélectionne la meilleure résolution parmi celles que le vendeur autorise.
 *
 * `acceptedTypes` vide ou absent = aucune restriction configurée — même
 * convention que `checkReturnPolicy`, qui n'applique la règle qu'à partir d'une
 * liste non vide.
 */
export function selectRecommendation(
  prediction:    MLPredictionOutput,
  acceptedTypes: readonly string[] | null | undefined,
): ResolutionRecommendation {
  const probabilities = prediction.resolution?.probabilities ?? {}
  const mlTop         = prediction.resolution.prediction
  const mlTopScore    = score(probabilities, mlTop)

  // Résolutions offertes par le vendeur, exprimées dans le vocabulaire du
  // modèle. `TYPE_TO_RESOLUTION` est la table déjà utilisée par l'export dataset.
  const configured = acceptedTypes ?? []
  const allowed: string[] = configured.length
    ? configured
        .map((t) => TYPE_TO_RESOLUTION[t as keyof typeof TYPE_TO_RESOLUTION] as string | undefined)
        .filter((r): r is string => typeof r === 'string')
    : [...VENDOR_DECISIONS]

  // Un refus l'emporte s'il est la classe dominante du modèle — règle inchangée.
  if (mlTop === 'Reject') {
    return {
      ok: true, resolution: 'Reject', score: mlTopScore,
      mlTop, mlTopScore, filtered: false, allowed,
    }
  }

  // Candidats : les classes scorées par le modèle qui sont à la fois autorisées
  // et de vraies résolutions (Reject exclu — il ne gagne pas par élimination).
  const candidates = Object.entries(probabilities)
    .filter(([resolution, p]) =>
      resolution !== 'Reject' &&
      allowed.includes(resolution) &&
      typeof p === 'number' && Number.isFinite(p))
    .sort((a, b) => b[1] - a[1])

  if (candidates.length === 0) {
    return { ok: false, reason: NO_ALLOWED_RESOLUTION, mlTop, mlTopScore, allowed }
  }

  const [resolution, p] = candidates[0]
  return {
    ok:         true,
    resolution: resolution as AIDecision,
    score:      p,
    mlTop,
    mlTopScore,
    filtered:   resolution !== mlTop,
    allowed,
  }
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
  // Politique du vendeur **de cette réclamation** : `claim.vendorId` vient de la
  // ligne en base, jamais de l'entrée. Un vendeur ne peut pas voir sa
  // recommandation calculée avec les résolutions autorisées d'un autre.
  const returnPolicy =
    opts.returnPolicy !== undefined
      ? opts.returnPolicy
      : await prisma.returnPolicy.findUnique({ where: { vendorId: claim.vendorId } })

  // Recommandation = meilleure résolution parmi celles que le vendeur offre,
  // et non classe de score maximal du modèle.
  const recommendation = selectRecommendation(prediction, returnPolicy?.acceptedTypes)
  const decision: AIDecision | null = recommendation.ok ? recommendation.resolution : null
  const aiScore = recommendation.ok ? recommendation.score : null

  if (recommendation.ok && recommendation.filtered) {
    log.info('claim_decision.recommendation_filtered', {
      claimId:    claim.id,
      vendorId:   claim.vendorId,
      mlTop:      recommendation.mlTop,
      mlTopScore: recommendation.mlTopScore,
      retenue:    recommendation.resolution,
      score:      recommendation.score,
      allowed:    recommendation.allowed,
    })
  }

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
  //    pas une vérité terrain (C-04). Sans recommandation exploitable, aucune
  //    décision n'est posée : l'origine reste nulle.
  //
  //    Le bloc `recommendation` conserve la trace de l'arbitrage — classe
  //    dominante du modèle, résolution retenue, résolutions autorisées. C'est ce
  //    que lit le dashboard, et ce qui permet de comprendre après coup pourquoi
  //    la reco affichée n'est pas celle que le modèle a le mieux notée.
  const mergedPrediction: Prisma.JsonObject = {
    ...existingPrediction,
    ...(prediction as unknown as Prisma.JsonObject),
    refundEligible,
    recommendation: {
      resolution: recommendation.ok ? recommendation.resolution : null,
      score:      recommendation.ok ? recommendation.score : null,
      mlTop:      recommendation.mlTop,
      mlTopScore: recommendation.mlTopScore,
      filtered:   recommendation.ok ? recommendation.filtered : true,
      allowed:    recommendation.allowed,
      ...(recommendation.ok ? {} : { reason: recommendation.reason }),
    },
  }

  await prisma.claim.update({
    where: { id: claim.id },
    data: {
      aiDecision:       decision,
      aiScore,
      mlFailed:         false,
      mlAttempts:       { increment: 1 },
      ...(decision ? { resolutionSource: 'MODEL' as const } : {}),
      prediction:       mergedPrediction as unknown as Prisma.InputJsonValue,
    },
  })

  // 2. Décision métier.
  //    - aucune reco autorisée       → reste PENDING, le vendeur tranche.
  //      Flowmerce n'invente pas une résolution que le vendeur n'offre pas, et
  //      ne retombe pas sur la classe du modèle qu'il a écartée.
  //    - Reject                      → refus, quel que soit le mode de validation
  //    - Exchange/Repair + AI_AUTO   → approbation, sauf demande de remboursement
  //    - sinon                       → reste PENDING, le vendeur tranche
  if (!recommendation.ok) {
    log.warn('claim_decision.no_allowed_resolution', {
      claimId:    claim.id,
      vendorId:   claim.vendorId,
      mlTop:      recommendation.mlTop,
      mlTopScore: recommendation.mlTopScore,
      allowed:    recommendation.allowed,
      origin:     opts.origin,
    })
    return {
      decision: null, aiScore: null, status: claim.status,
      autoApproved: false, autoRejected: false, applied: true,
      refundEligible, recommendation,
    }
  }

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
      autoApproved: false, autoRejected: false, applied: true,
      refundEligible, recommendation,
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
      autoApproved: false, autoRejected: false, applied: false,
      refundEligible, recommendation,
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
    recommendation,
  }
}
