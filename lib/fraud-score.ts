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
