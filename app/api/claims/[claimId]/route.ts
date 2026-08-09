// app/api/claims/[claimId]/route.ts — Flowmerce

import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'
import { Prisma }                    from '@prisma/client'
import { getSessionServer }          from '@/lib/getSession'
import { notifyCustomer }            from '@/lib/services/notification'
import { log }                       from '@/lib/logger'
import { VENDOR_DECISIONS, isVendorDecision, type VendorDecision } from '@/lib/constants'

const ALLOWED_STATUSES = ['APPROVED', 'REJECTED', 'IN_PROGRESS'] as const
type AllowedStatus = (typeof ALLOWED_STATUSES)[number]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ claimId: string }> },
) {
  const session = await getSessionServer()
  if (!session?.user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const user    = session.user
  const isAdmin = user.role === 'ADMIN'
  const { claimId } = await params

  const claim = await prisma.claim.findUnique({
    where:  { id: claimId },
    select: {
      id:            true,
      vendorId:      true,
      status:        true,
      prediction:    true,
      aiDecision:    true,
      customerName:  true,
      customerEmail: true,
      customerPhone: true,
      orderId:       true,
      type:          true,
    },
  })

  if (!claim) {
    return NextResponse.json({ error: 'Réclamation introuvable' }, { status: 404 })
  }

  if (!isAdmin) {
    const vendor = await prisma.vendor.findUnique({ where: { userId: user.id } })
    if (!vendor || vendor.id !== claim.vendorId) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }
  }

  let body: { status?: string; note?: string; aiDecision?: string; overrideNote?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 }) }

  const newStatus = body.status?.toUpperCase()
  if (!newStatus || !ALLOWED_STATUSES.includes(newStatus as AllowedStatus)) {
    return NextResponse.json(
      { error: `Statut invalide. Valeurs acceptées : ${ALLOWED_STATUSES.join(', ')}` },
      { status: 400 },
    )
  }

  // Le vendeur tranche parmi 4 décisions (les 3 classes ML + Refund) : il peut
  // accorder un remboursement que le ML ne sait pas recommander.
  if (body.aiDecision !== undefined && !isVendorDecision(body.aiDecision)) {
    return NextResponse.json(
      { error: `Décision invalide. Valeurs acceptées : ${VENDOR_DECISIONS.join(', ')}` },
      { status: 400 },
    )
  }

  const decision = body.aiDecision as VendorDecision | undefined
  const note     = body.note?.trim() || body.overrideNote?.trim() || null

  // Une décision qui diverge de la reco ML est un override vendeur : on le trace
  // dans `prediction.override`, la forme que lisent les deux pages dashboard
  // (badge « Modifiée manuellement » + note de révision).
  const isOverride = !!decision && decision !== claim.aiDecision

  const existingPrediction = (claim.prediction as Prisma.JsonObject | null) ?? {}
  const updatedPrediction: Prisma.InputJsonValue = {
    ...existingPrediction,
    ...(decision ? { aiDecision: decision } : {}),
    ...(isOverride
      ? {
          override: {
            resolution: decision,
            mlDecision: claim.aiDecision,
            note,
            at: new Date().toISOString(),
            by: user.email ?? user.id,
          },
        }
      : {}),
    ...(body.overrideNote ? { overrideNote: body.overrideNote } : {}),
    ...(body.note?.trim() ? { vendorNote: body.note.trim(), vendorNoteAt: new Date().toISOString() } : {}),
  }

  const updated = await prisma.claim.update({
    where: { id: claimId },
    data:  {
      status:      newStatus as AllowedStatus,
      processedAt: new Date(),
      prediction:  updatedPrediction,
      // Colonne `aiDecision` = décision effective sur la réclamation (reco ML
      // à la création, puis choix du vendeur s'il tranche autrement).
      ...(decision ? { aiDecision: decision } : {}),
    },
    select: { id: true, status: true, processedAt: true },
  })

  // Décision notifiée : priorité au choix du vendeur, sinon celle déjà sur le claim
  const finalDecision = (decision ?? claim.aiDecision) as VendorDecision | null

  notifyCustomer({
    customerName:  claim.customerName,
    customerEmail: claim.customerEmail,
    customerPhone: claim.customerPhone,
    orderId:       claim.orderId,
    status:        newStatus as AllowedStatus,
    aiDecision:    finalDecision,
    claimType:     claim.type,
    note,
  }).catch(err => log.error('claims.notification_error', { err: String(err) }))

  log.info('claims.decision', {
    claimId,
    status:     newStatus,
    decision:   finalDecision,
    mlDecision: claim.aiDecision,
    overridden: isOverride,
  })

  return NextResponse.json({ claim: updated })
}
