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

  // 1. Chercher par email
  if (normalizedEmail) {
    const byEmail = await prisma.customerFraudRecord.findFirst({
      where: { customerEmail: normalizedEmail },
    })
    if (byEmail) {
      // Vérifier si le même record correspond aussi au phone (→ "both")
      const matchedBy =
        normalizedPhone && byEmail.customerPhone === normalizedPhone
          ? 'both'
          : 'email'
      return { record: byEmail, matchedBy }
    }
  }

  // 2. Chercher par phone
  if (normalizedPhone) {
    const byPhone = await prisma.customerFraudRecord.findFirst({
      where: { customerPhone: normalizedPhone },
    })
    if (byPhone) {
      return { record: byPhone, matchedBy: 'phone' }
    }
  }

  // 3. Créer un nouveau record
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
// computeFraudScore
// Formule : base = min(totalClaims × 10, 60) + min(totalRefusals × 15, 40)
//           score = min(base, 100)
// ─────────────────────────────────────────────────────────────
export function computeFraudScore(record: CustomerFraudRecord | null): number {
  if (!record) return 0
  const claimsContrib   = Math.min(record.totalClaims   * 10, 60)
  const refusalsContrib = Math.min(record.totalRefusals * 15, 40)
  return Math.min(claimsContrib + refusalsContrib, 100)
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
      ? `⚠️ Signal fraude : score de risque élevé (${score}/100). Cette demande est soumise à contrôle renforcé.`
      : `⚠️ Signal fraude : ${totalClaims} retours enregistrés. Un nombre élevé de retours peut entraîner une restriction.`
    : null

  return { record, score, totalClaims, isFraudAlert, fraudSignalMessage }
}
