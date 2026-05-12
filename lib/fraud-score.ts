// lib/fraud-score.ts
//
// Réseau anti-fraude inter-vendeurs.
//
// Conception :
//   - Chaque évènement (claim, refusal) est rattaché à un vendeur via vendorId.
//   - Le score combine trois signaux pondérés :
//       • Quantité de claims  (signal local faible)
//       • Quantité de refusals (signal local moyen)
//       • Diversité des vendeurs (signal cross-réseau le plus fort)
//   - Un vendeur isolé ne peut pas pousser le score d'un client au-delà de ~70
//     même en spammant : il faut la confirmation d'autres marchands pour atteindre 100.
//   - Les refusals doivent être rattachés à une transaction réelle (cf.
//     report-refusal/route.ts) ; on ne peut pas signaler un client jamais traité.

import { prisma } from '@/lib/prisma'
import type { CustomerFraudRecord } from '@prisma/client'

export type { CustomerFraudRecord }

// ─────────────────────────────────────────────────────────────
// findOrCreateFraudRecord
// Matching OR : email prioritaire, puis phone, puis création.
// ─────────────────────────────────────────────────────────────
export async function findOrCreateFraudRecord(
  email?: string,
  phone?: string,
): Promise<{ record: CustomerFraudRecord; matchedBy: string }> {
  const normalizedEmail = email?.trim().toLowerCase() || undefined
  const normalizedPhone = phone?.trim() || undefined

  if (normalizedEmail) {
    const byEmail = await prisma.customerFraudRecord.findFirst({
      where: { customerEmail: normalizedEmail },
    })
    if (byEmail) {
      const matchedBy =
        normalizedPhone && byEmail.customerPhone === normalizedPhone ? 'both' : 'email'
      return { record: byEmail, matchedBy }
    }
  }

  if (normalizedPhone) {
    const byPhone = await prisma.customerFraudRecord.findFirst({
      where: { customerPhone: normalizedPhone },
    })
    if (byPhone) {
      return { record: byPhone, matchedBy: 'phone' }
    }
  }

  const record = await prisma.customerFraudRecord.create({
    data: {
      customerEmail: normalizedEmail ?? null,
      customerPhone: normalizedPhone ?? null,
      matchedBy:     null,
    },
  })
  return { record, matchedBy: 'new' }
}

// ─────────────────────────────────────────────────────────────
// computeFraudScore — formule pondérée
//
// score = claims_local + refusals_local + cross_vendor_confirmation
//   - claims_local       : min(totalClaims × 5, 30)
//   - refusals_local     : min(totalRefusals × 10, 40)
//   - cross_vendor       : min(max(distinctVendors - 1, 0) × 15, 30)
//
// Exemples :
//   • 1 vendeur,  1 claim                 →   5 / 100
//   • 1 vendeur, 10 claims, 10 refusals   →  70 / 100  (plafond local)
//   • 3 vendeurs, 1 claim + 1 refusal/ch  →  75 / 100  (cross-vendor)
//   • 5+ vendeurs                         → 100 / 100  (max)
// ─────────────────────────────────────────────────────────────
export function computeFraudScore(record: CustomerFraudRecord | null): number {
  if (!record) return 0

  const claimComponent   = Math.min(record.totalClaims   * 5,  30)
  const refusalComponent = Math.min(record.totalRefusals * 10, 40)
  const networkComponent = Math.min(
    Math.max((record.distinctVendors ?? 0) - 1, 0) * 15,
    30,
  )

  return Math.min(claimComponent + refusalComponent + networkComponent, 100)
}

// ─────────────────────────────────────────────────────────────
// recomputeDistinctVendors
// Recompte les vendeurs uniques ayant interagi avec ce client
// (claims + refusal reports). À appeler après chaque évènement.
// ─────────────────────────────────────────────────────────────
async function countDistinctVendors(
  email: string | null,
  phone: string | null,
): Promise<number> {
  if (!email && !phone) return 0

  const orFilter: Array<Record<string, string>> = []
  if (email) orFilter.push({ customerEmail: email })
  if (phone) orFilter.push({ customerPhone: phone })

  const [claimVendors, refusalVendors] = await Promise.all([
    prisma.claim.findMany({
      where: { OR: orFilter },
      select: { vendorId: true },
      distinct: ['vendorId'],
    }),
    prisma.refusalReport.findMany({
      where: { OR: orFilter },
      select: { vendorId: true },
      distinct: ['vendorId'],
    }),
  ])

  const set = new Set<string>()
  for (const r of claimVendors)  set.add(r.vendorId)
  for (const r of refusalVendors) set.add(r.vendorId)
  return set.size
}

// ─────────────────────────────────────────────────────────────
// reportRefusal
// Enregistre un refusal traçable (vendeur signalant connu) et
// met à jour le cache CustomerFraudRecord.
//
// Le caller est responsable de vérifier que la transaction
// (orderId) appartient bien au vendeur signalant (cf. route.ts).
// ─────────────────────────────────────────────────────────────
export interface ReportRefusalInput {
  vendorId:       string
  customerEmail?: string
  customerPhone?: string
  orderId:        string
  claimId?:       string
  reason?:        string
}

export interface ReportRefusalResult {
  alreadyReported: boolean
  newFraudScore:   number
  distinctVendors: number
  totalRefusals:   number
}

export async function reportRefusal(
  input: ReportRefusalInput,
): Promise<ReportRefusalResult> {
  const email = input.customerEmail?.trim().toLowerCase() || null
  const phone = input.customerPhone?.trim() || null

  // 1. Insertion idempotente (unique sur vendorId+orderId)
  let alreadyReported = false
  try {
    await prisma.refusalReport.create({
      data: {
        vendorId:      input.vendorId,
        customerEmail: email,
        customerPhone: phone,
        orderId:       input.orderId,
        claimId:       input.claimId ?? null,
        reason:        input.reason ?? null,
      },
    })
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2002') {
      alreadyReported = true
    } else {
      throw err
    }
  }

  // 2. findOrCreate du record (sert aussi de pivot pour le cache)
  const { record } = await findOrCreateFraudRecord(email ?? undefined, phone ?? undefined)

  // 3. Recompter les vendeurs distincts (claims + refusals)
  const distinctVendors = await countDistinctVendors(email, phone)

  // 4. Mise à jour idempotente du cache
  const updated = await prisma.customerFraudRecord.update({
    where: { id: record.id },
    data: {
      distinctVendors,
      ...(alreadyReported
        ? {}
        : {
            totalRefusals: { increment: 1 },
            lastRefusalAt: new Date(),
          }),
    },
  })

  return {
    alreadyReported,
    newFraudScore:   computeFraudScore(updated),
    distinctVendors: updated.distinctVendors,
    totalRefusals:   updated.totalRefusals,
  }
}

// ─────────────────────────────────────────────────────────────
// recomputeNetworkSignals
// Recalcule uniquement la diversité des vendeurs pour un client.
// À appeler après la création d'un Claim (en dehors de la transaction
// principale, car la requête lit Claim qui vient d'être inséré).
//
// Best-effort : si la requête échoue, le score reste sur l'ancienne
// valeur de distinctVendors — pas de quoi bloquer le flow utilisateur.
// ─────────────────────────────────────────────────────────────
export async function recomputeNetworkSignals(
  customerEmail?: string | null,
  customerPhone?: string | null,
): Promise<void> {
  const email = customerEmail?.trim().toLowerCase() || null
  const phone = customerPhone?.trim() || null
  if (!email && !phone) return

  const orFilter: Array<Record<string, string>> = []
  if (email) orFilter.push({ customerEmail: email })
  if (phone) orFilter.push({ customerPhone: phone })

  const distinctVendors = await countDistinctVendors(email, phone)

  await prisma.customerFraudRecord.updateMany({
    where: { OR: orFilter },
    data:  { distinctVendors },
  })
}

// ─────────────────────────────────────────────────────────────
// evaluateFraud
// Combine la recherche du record, le calcul du score et
// la génération du signal d'alerte en une seule opération.
// ─────────────────────────────────────────────────────────────
export interface FraudEvalResult {
  record:             CustomerFraudRecord
  score:              number
  totalClaims:        number
  distinctVendors:    number
  isFraudAlert:       boolean
  fraudSignalMessage: string | null
}

export async function evaluateFraud(
  email: string,
  phone: string | null,
  thresholds?: { scoreThreshold?: number; returnThreshold?: number },
): Promise<FraudEvalResult> {
  const { record } = await findOrCreateFraudRecord(email, phone ?? undefined)
  const score       = computeFraudScore(record)
  const totalClaims = (record.totalClaims ?? 0) + 1   // +1 pour la demande en cours

  const scoreThreshold  = thresholds?.scoreThreshold  ?? 70
  const returnThreshold = thresholds?.returnThreshold ?? 4
  const isFraudAlert    = score > scoreThreshold || totalClaims > returnThreshold

  const fraudSignalMessage: string | null = isFraudAlert
    ? score > scoreThreshold
      ? `⚠️ Signal fraude : score de risque élevé (${score}/100, ${record.distinctVendors} marchands ont interagi). Cette demande est soumise à contrôle renforcé.`
      : `⚠️ Signal fraude : ${totalClaims} retours enregistrés. Un nombre élevé de retours peut entraîner une restriction.`
    : null

  return {
    record,
    score,
    totalClaims,
    distinctVendors: record.distinctVendors,
    isFraudAlert,
    fraudSignalMessage,
  }
}
