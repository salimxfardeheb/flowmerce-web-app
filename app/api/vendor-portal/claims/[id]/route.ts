// app/api/vendor-portal/claims/[id]/route.ts — Flowmerce
//
// PATCH /api/vendor-portal/claims/:id
// Permet au vendeur de mettre à jour le statut d'une de SES réclamations.
// Auth : token de portail (Authorization: Bearer <token>) — pas de session Flowmerce.
//
// Règles :
//   - Le token doit être valide et non expiré
//   - La réclamation DOIT appartenir au vendeur du token (isolation garantie)
//   - Seuls les statuts APPROVED, REJECTED, IN_PROGRESS sont acceptés
//   - Un vendeur ne peut pas repasser en PENDING

import { NextRequest, NextResponse }  from 'next/server'
import { prisma }                     from '@/lib/prisma'
import { Prisma }                     from '@prisma/client'
import { verifyPortalToken }          from '@/lib/vendor-portal-token'

const ALLOWED_STATUSES = ['APPROVED', 'REJECTED', 'IN_PROGRESS'] as const
type AllowedStatus = (typeof ALLOWED_STATUSES)[number]

function extractToken(req: NextRequest): string | null {
  return req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null
}

export async function PATCH(
  req:    NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── 1. Vérifier le token de portail ───────────────────────────────────
  const raw     = extractToken(req)
  const payload = raw ? verifyPortalToken(raw) : null
  if (!payload) {
    return NextResponse.json({ error: 'Token invalide ou expiré' }, { status: 401 })
  }

  const { id } = await params

  // ── 2. Charger la réclamation et vérifier l'appartenance ─────────────
  const claim = await prisma.claim.findUnique({
    where:  { id },
    select: { id: true, vendorId: true, status: true, prediction: true },
  })

  if (!claim) {
    return NextResponse.json({ error: 'Réclamation introuvable' }, { status: 404 })
  }
  // Isolation stricte : seul le vendeur propriétaire peut modifier
  if (claim.vendorId !== payload.vendorId) {
    return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
  }

  // ── 3. Parser le body ─────────────────────────────────────────────────
  let body: { status?: string; note?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 }) }

  const newStatus = body.status?.toUpperCase()
  if (!newStatus || !ALLOWED_STATUSES.includes(newStatus as AllowedStatus)) {
    return NextResponse.json(
      { error: `Statut invalide. Valeurs acceptées : ${ALLOWED_STATUSES.join(', ')}` },
      { status: 400 },
    )
  }

  // ── 4. Construire la mise à jour de `prediction` (note vendeur optionnelle) ──
  const existingPrediction =
    (claim.prediction as Prisma.JsonObject | null) ?? {}

  const updatedPrediction: Prisma.InputJsonValue = body.note?.trim()
    ? { ...existingPrediction, vendorNote: body.note.trim(), vendorNoteAt: new Date().toISOString() }
    : existingPrediction

  // ── 5. Mettre à jour ──────────────────────────────────────────────────
  const updated = await prisma.claim.update({
    where: { id },
    data:  {
      status:      newStatus as AllowedStatus,
      processedAt: new Date(),
      prediction:  updatedPrediction,
    },
    select: { id: true, status: true, processedAt: true },
  })

  return NextResponse.json({ claim: updated })
}