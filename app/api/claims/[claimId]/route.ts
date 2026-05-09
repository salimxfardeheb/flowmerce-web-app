// app/api/claims/[claimId]/route.ts — Flowmerce

import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'
import { Prisma }                    from '@prisma/client'
import { getSessionServer }          from '@/lib/getSession'
import { notifyCustomer }            from '@/lib/services/notification'

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
      aiDecision:    true,   // ← décision ML stockée sur le claim
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

  const existingPrediction = (claim.prediction as Prisma.JsonObject | null) ?? {}
  const updatedPrediction: Prisma.InputJsonValue = {
    ...existingPrediction,
    ...(body.aiDecision   ? { aiDecision:   body.aiDecision }   : {}),
    ...(body.overrideNote ? { overrideNote: body.overrideNote } : {}),
    ...(body.note?.trim() ? { vendorNote: body.note.trim(), vendorNoteAt: new Date().toISOString() } : {}),
  }

  const updated = await prisma.claim.update({
    where: { id: claimId },
    data:  {
      status:      newStatus as AllowedStatus,
      processedAt: new Date(),
      prediction:  updatedPrediction,
      // Persister aiDecision sur la colonne directe si fourni
      ...(body.aiDecision ? { aiDecision: body.aiDecision } : {}),
    },
    select: { id: true, status: true, processedAt: true },
  })

  // Décision ML : priorité au body (override admin), sinon celle déjà sur le claim
  const aiDecision = (body.aiDecision ?? claim.aiDecision) as string | null | undefined

  notifyCustomer({
    customerName:  claim.customerName,
    customerEmail: claim.customerEmail,
    customerPhone: claim.customerPhone,
    orderId:       claim.orderId,
    status:        newStatus as AllowedStatus,
    aiDecision:    aiDecision as 'Refund' | 'Exchange' | 'Repair' | 'Reject' | null,
    claimType:     claim.type,
    note:          body.note ?? body.overrideNote ?? null,
  }).catch(err => console.error('[Route/claims] Erreur notification :', err))

  return NextResponse.json({ claim: updated })
}