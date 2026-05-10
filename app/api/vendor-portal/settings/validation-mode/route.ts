// app/api/vendor-portal/settings/validation-mode/route.ts — Flowmerce
//
// PATCH → bascule le validationMode via token portal (MANUAL ↔ AI_AUTO).
// Si passage en AI_AUTO → approuve immédiatement tous les claims PENDING du vendeur.

import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'
import { verifyPortalToken }         from '@/lib/vendor-portal-token'
import { notifyCustomer }            from '@/lib/services/notification'

function extractToken(req: NextRequest): string | null {
  return req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null
}

export async function PATCH(req: NextRequest) {
  const raw     = extractToken(req)
  const payload = raw ? verifyPortalToken(raw) : null
  if (!payload) {
    return NextResponse.json({ error: 'Token invalide ou expiré' }, { status: 401 })
  }

  const { vendorId } = payload

  let body: { validationMode?: string } = {}
  try { body = await req.json() } catch { /* ok */ }

  const newMode = body.validationMode
  if (newMode !== 'MANUAL' && newMode !== 'AI_AUTO') {
    return NextResponse.json(
      { error: 'validationMode invalide. Valeurs : MANUAL | AI_AUTO' },
      { status: 400 }
    )
  }

  // Mise à jour du validationMode
  await prisma.returnPolicy.upsert({
    where:  { vendorId },
    update: { validationMode: newMode },
    create: { vendorId, validationMode: newMode },
  })

  // Si activation AI_AUTO → approuver tous les PENDING
  let approved = 0

  if (newMode === 'AI_AUTO') {
    const pendingClaims = await prisma.claim.findMany({
      where:  { vendorId, status: 'PENDING' },
      select: {
        id:            true,
        aiDecision:    true,
        prediction:    true,
        customerName:  true,
        customerEmail: true,
        customerPhone: true,
        orderId:       true,
        type:          true,
      },
    })

    if (pendingClaims.length > 0) {
      const now = new Date()

      await Promise.all(
        pendingClaims.map(async (claim) => {
          const decision = (claim.aiDecision ?? 'Refund') as 'Refund' | 'Exchange' | 'Repair' | 'Reject'

          await prisma.claim.update({
            where: { id: claim.id },
            data: {
              status:      'APPROVED',
              processedAt: now,
              aiDecision:  decision,
              prediction: {
                ...(claim.prediction as object ?? {}),
                autoApprovedAt: now.toISOString(),
                autoApprovedBy: 'vendor-portal',
              },
            },
          })

          notifyCustomer({
            customerName:  claim.customerName,
            customerEmail: claim.customerEmail,
            customerPhone: claim.customerPhone ?? null,
            orderId:       claim.orderId,
            status:        'APPROVED',
            aiDecision:    decision,
            claimType:     claim.type,
            note:          null,
          }).catch(err => console.error('[portal/validation-mode] Notification :', err))

          approved++
        })
      )
    }
  }

  return NextResponse.json({ validationMode: newMode, approved })
}
