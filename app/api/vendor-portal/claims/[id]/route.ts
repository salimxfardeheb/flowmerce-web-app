// app/api/vendor-portal/claims/[id]/route.ts — Flowmerce

import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'
import { Prisma }                    from '@prisma/client'
import { verifyPortalToken }         from '@/lib/vendor-portal-token'
import { notifyCustomer }            from '@/lib/services/notification'

const ALLOWED_STATUSES = ['APPROVED', 'REJECTED', 'IN_PROGRESS'] as const
type AllowedStatus = (typeof ALLOWED_STATUSES)[number]

function extractToken(req: NextRequest): string | null {
  return req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const raw     = extractToken(req)
  const payload = raw ? verifyPortalToken(raw) : null
  if (!payload) {
    return NextResponse.json({ error: 'Token invalide ou expiré' }, { status: 401 })
  }

  const { id } = await params

  const claim = await prisma.claim.findUnique({
    where:  { id },
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

  if (claim.vendorId !== payload.vendorId) {
    return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
  }

  let body: { status?: string; note?: string; aiDecision?: string }
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
  const updatedPrediction: Prisma.InputJsonValue = body.note?.trim()
    ? { ...existingPrediction, vendorNote: body.note.trim(), vendorNoteAt: new Date().toISOString() }
    : existingPrediction

  const updated = await prisma.claim.update({
    where: { id },
    data:  {
      status:      newStatus as AllowedStatus,
      processedAt: new Date(),
      prediction:  updatedPrediction,
      // Persister la décision choisie par le vendeur
      ...(body.aiDecision ? { aiDecision: body.aiDecision } : {}),
    },
    select: { id: true, status: true, processedAt: true },
  })

  // Décision à notifier : celle choisie dans la modale (prioritaire) ou stockée sur le claim
  const aiDecision = (body.aiDecision ?? claim.aiDecision) as string | null | undefined

  notifyCustomer({
    customerName:  claim.customerName,
    customerEmail: claim.customerEmail,
    customerPhone: claim.customerPhone,
    orderId:       claim.orderId,
    status:        newStatus as AllowedStatus,
    aiDecision:    aiDecision as 'Refund' | 'Exchange' | 'Repair' | 'Reject' | null,
    claimType:     claim.type,
    note:          body.note ?? null,
  }).catch(err => console.error('[Route/vendor-portal/claims] Erreur notification :', err))

  return NextResponse.json({ claim: updated })
}