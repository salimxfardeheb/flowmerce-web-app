// app/api/claims/[claimId]/route.ts — Flowmerce v2
//
// PATCH : modifier le statut ou la décision ML d'un claim
//
// Authentification supportée :
//   1. Session NextAuth  → dashboard Flowmerce (vendeur/admin connecté)
//   2. Bearer API key    → appel externe CabaStore (Authorization: Bearer flo_xxx)
//
// Body attendu :
// {
//   status?:           'APPROVED' | 'REJECTED' | 'IN_PROGRESS'
//   aiDecision?:       'Refund' | 'Exchange' | 'Repair' | 'Reject'
//   overrideShipping?: string | null
//   overrideNote?:     string | null
//   _from_external?:   boolean   ← flag anti-boucle webhook (posé par CabaStore)
// }

import { NextRequest, NextResponse }   from 'next/server'
import { Prisma }                       from '@prisma/client'
import { auth }                         from '@/lib/auth'
import { prisma }                       from '@/lib/prisma'
import { validateApiKey }               from '@/lib/api-key-auth'
import { z }                            from 'zod'

const PatchClaimSchema = z.object({
  status:           z.enum(['APPROVED', 'REJECTED', 'IN_PROGRESS']).optional(),
  aiDecision:       z.enum(['Refund', 'Exchange', 'Repair', 'Reject']).optional(),
  overrideShipping: z.string().max(200).nullable().optional(),
  overrideNote:     z.string().max(1000).nullable().optional(),
  _from_external:   z.boolean().optional(),
})

// ── Types pour le champ prediction ───────────────────────────────────────
interface PredictionData extends Record<string, Prisma.JsonValue | undefined> {
  externalReturnId?: string
  externalSource?:   string
  webhookUrl?:       string | null
  webhookSecret?:    string | null
}

// ── Notifier CabaStore via webhook ────────────────────────────────────────
async function notifyExternalWebhook(
  prediction: PredictionData,
  claimId:    string,
  newStatus:  string,
  aiDecision: string | null,
) {
  const webhookUrl    = prediction.webhookUrl    ?? null
  const webhookSecret = prediction.webhookSecret ?? null
  const returnId      = prediction.externalReturnId ?? null

  if (!webhookUrl || !returnId) return

  try {
    await fetch(webhookUrl, {
      method:  'POST',
      headers: {
        'Content-Type':     'application/json',
        'X-Webhook-Secret': webhookSecret || '',
      },
      body: JSON.stringify({
        returnId,
        claimId,
        status:     newStatus,
        resolution: aiDecision,
        source:     'flowmerce',
      }),
      signal: AbortSignal.timeout(8000),
    })
  } catch (err) {
    console.error('[Flowmerce Webhook] Erreur envoi (non-bloquant):', err)
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────
export async function PATCH(
  req:    NextRequest,
  { params }: { params: Promise<{ claimId: string }> }
) {
  // ── 1. Authentification : session OU API key ──────────────────────────
  let userId:   string | null = null
  let userRole: string | null = null
  let vendorId: string | null = null
  let isExternalCall = false

  const authHeader = req.headers.get('authorization')
  const rawKey =
    authHeader?.replace(/^Bearer\s+/, '') ??
    req.headers.get('x-api-key') ??
    null

  // Une clé API Flowmerce commence toujours par "flo_"
  const looksLikeApiKey = !!rawKey && (rawKey.startsWith('flo_') || rawKey.startsWith('flw_'))

  if (looksLikeApiKey) {
    // Appel externe (CabaStore ou autre partenaire)
    const apiAuth = await validateApiKey(rawKey)
    if (!apiAuth.ok) return apiAuth.response

    vendorId       = apiAuth.keyRecord.vendorId
    userRole       = 'VENDOR_API'
    isExternalCall = true
  } else {
    // Dashboard Flowmerce — session NextAuth
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }
    userId   = session.user.id
    userRole = session.user.role
  }

  const { claimId } = await params

  // ── 2. Charger le claim (scope par vendeur sauf ADMIN) ────────────────
  let resolvedVendorId = vendorId

  if (!resolvedVendorId && userRole !== 'ADMIN') {
    const vendor = await prisma.vendor.findUnique({ where: { userId: userId! } })
    resolvedVendorId = vendor?.id ?? null
  }

  const claim = await prisma.claim.findFirst({
    where: {
      id: claimId,
      ...(userRole !== 'ADMIN' && resolvedVendorId ? { vendorId: resolvedVendorId } : {}),
    },
  })

  if (!claim) {
    return NextResponse.json({ error: 'Réclamation introuvable' }, { status: 404 })
  }

  // ── 3. Validation du body ─────────────────────────────────────────────
  let rawBody: unknown
  try { rawBody = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 }) }

  const parsed = PatchClaimSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { status, aiDecision, overrideShipping, overrideNote, _from_external } = parsed.data

  // ── 4. Règle métier : Reject exige une note ───────────────────────────
  if (aiDecision === 'Reject') {
    const note = overrideNote?.trim() ?? ''
    if (note.length < 10) {
      return NextResponse.json(
        { error: 'La cause du refus est obligatoire (minimum 10 caractères).' },
        { status: 422 }
      )
    }
  }

  // ── 5. Construire updateData ──────────────────────────────────────────
  const updateData: Record<string, unknown> = {}

  if (status) {
    updateData.status      = status
    updateData.processedAt = new Date()
  }

  if (aiDecision) {
    updateData.aiDecision = aiDecision

    const currentPrediction = (claim.prediction as PredictionData | null) ?? {}
    const nextPrediction = {
      ...currentPrediction,
      claimId,
      override: {
        resolution:       aiDecision,
        shipping:         overrideShipping ?? null,
        note:             overrideNote?.trim() || null,
        rejectReason:     aiDecision === 'Reject' ? overrideNote?.trim() : null,
        overriddenAt:     new Date().toISOString(),
        overriddenBy:     isExternalCall ? `api:${resolvedVendorId}` : userId,
        originalDecision: claim.aiDecision,
        source:           isExternalCall ? 'cabastore' : 'dashboard',
      },
    } satisfies Prisma.InputJsonObject

    updateData.prediction = nextPrediction

    // Synchroniser le statut si non fourni explicitement
    if (!status) {
      updateData.status      = aiDecision === 'Reject' ? 'REJECTED' : 'APPROVED'
      updateData.processedAt = new Date()
    }
  }

  const updated = await prisma.claim.update({
    where: { id: claimId },
    data:  updateData,
  })

  // ── 6. Webhook vers CabaStore (sauf si l'appel vient déjà de CabaStore) ─
  // _from_external = true quand CabaStore fait le PATCH → on n'envoie pas
  // de webhook retour pour éviter la boucle infinie
  if (!_from_external) {
    const pred = (claim.prediction as PredictionData | null) ?? {}
    if (pred.externalReturnId) {
      notifyExternalWebhook(
        { ...pred, claimId },
        claimId,
        (updated.status     as string) || '',
        (updated.aiDecision as string | null),
      )
    }
  }

  return NextResponse.json({ claim: updated })
}