// app/api/claims/validation-mode/route.ts — Flowmerce
//
// PATCH → bascule le validationMode (MANUAL ↔ AI_AUTO) du vendeur connecté.
// Si on passe en AI_AUTO → approuve immédiatement tous les claims PENDING.
// Retourne { validationMode, approved } où approved = nombre de claims approuvés.

import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'
import { getSessionServer }          from '@/lib/getSession'
import { notifyCustomer }            from '@/lib/services/notification'
import { log }                       from '@/lib/logger'

export async function PATCH(req: NextRequest) {
  const session = await getSessionServer()
  if (!session?.user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const user    = session.user
  const isAdmin = user.role === 'ADMIN'

  let body: { validationMode?: string; vendorId?: string } = {}
  try { body = await req.json() } catch { /* ok */ }

  const newMode = body.validationMode
  if (newMode !== 'MANUAL' && newMode !== 'AI_AUTO') {
    return NextResponse.json(
      { error: 'validationMode invalide. Valeurs : MANUAL | AI_AUTO' },
      { status: 400 }
    )
  }

  // Résolution du vendeur
  let vendorId: string

  if (isAdmin && body.vendorId) {
    vendorId = body.vendorId
  } else {
    const vendor = await prisma.vendor.findUnique({ where: { userId: user.id } })
    if (!vendor) {
      return NextResponse.json({ error: 'Vendeur introuvable' }, { status: 404 })
    }
    vendorId = vendor.id
  }

  // Mise à jour du validationMode dans ReturnPolicy
  await prisma.returnPolicy.upsert({
    where:  { vendorId },
    update: { validationMode: newMode },
    create: { vendorId, validationMode: newMode },
  })

  // Si activation AI_AUTO → approuver tous les claims PENDING
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
                autoApprovedBy: isAdmin ? 'admin' : 'vendor',
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
          }).catch(err => log.error('validation_mode.notification_error', { err: String(err) }))

          approved++
        })
      )
    }
  }

  return NextResponse.json({ validationMode: newMode, approved })
}
