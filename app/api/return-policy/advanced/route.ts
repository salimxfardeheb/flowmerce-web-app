// app/api/return-policy/advanced/route.ts — Flowmerce v2
//
// GET  → lire la politique avancée du vendeur connecté
// PUT  → mettre à jour (paramètres avancés uniquement)
//
// Champs avancés (basés sur admin_cli.py / Flowmerce-ML) :
//   nonRefundableCategories  : catégories non remboursables
//   exchangeOnlyCategories   : catégories échange uniquement (pas de remboursement)
//   partialRefundEnabled     : activer le remboursement partiel
//   partialRefundRules       : { after_50pct_window: %, used_product_penalty: % }
//   acceptedReturnReasons    : raisons acceptées (vide = toutes)
//   processingDays           : délai de traitement interne (jours)

import { NextRequest, NextResponse }             from 'next/server'
import { auth }                                   from '@/lib/auth'
import { prisma }                                 from '@/lib/prisma'
import { RETURN_REASONS, VENDOR_CATEGORIES }      from '@/lib/constants'

const ALL_CATEGORIES = VENDOR_CATEGORIES
const ALL_REASONS    = RETURN_REASONS

// ── GET ───────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const vendor = await prisma.vendor.findUnique({ where: { userId: session.user.id } })
  if (!vendor) return NextResponse.json({ error: 'Vendeur introuvable' }, { status: 404 })

  const policy = await prisma.returnPolicy.findUnique({
    where: { vendorId: vendor.id },
  })

  return NextResponse.json({
    // Paramètres de base (déjà existants)
    maxClaimDays:         policy?.maxClaimDays         ?? 30,
    fraudScoreThreshold:  policy?.fraudScoreThreshold  ?? 70,
    fraudReturnThreshold: policy?.fraudReturnThreshold ?? 4,

    // Paramètres avancés (nouveaux)
    nonRefundableCategories:  policy?.nonRefundableCategories ?? [],
    exchangeOnlyCategories:   policy?.exchangeOnlyCategories  ?? [],
    partialRefundEnabled:     policy?.partialRefundEnabled     ?? false,
    partialRefundRules:       policy?.partialRefundRules ?? {
      after_50pct_window:   50,
      used_product_penalty: 20,
    },
    acceptedReturnReasons:    policy?.acceptedReturnReasons ?? [],
    processingDays:           policy?.processingDays ?? 5,

    // Référentiels disponibles
    _available: {
      categories: ALL_CATEGORIES,
      reasons:    ALL_REASONS,
    },
  })
}

// ── PUT ───────────────────────────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const vendor = await prisma.vendor.findUnique({ where: { userId: session.user.id } })
  if (!vendor) return NextResponse.json({ error: 'Vendeur introuvable' }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 }) }

  // Validation catégories
  const nonRefundable = Array.isArray(body.nonRefundableCategories)
    ? (body.nonRefundableCategories as string[]).filter(c => ALL_CATEGORIES.includes(c))
    : undefined

  const exchangeOnly = Array.isArray(body.exchangeOnlyCategories)
    ? (body.exchangeOnlyCategories as string[]).filter(c => ALL_CATEGORIES.includes(c))
    : undefined

  // Vérifier conflit : une catégorie ne peut pas être dans les deux listes
  if (nonRefundable && exchangeOnly) {
    const conflict = nonRefundable.filter(c => exchangeOnly.includes(c))
    if (conflict.length > 0) {
      return NextResponse.json({
        error: `Conflit de catégories : "${conflict.join(', ')}" ne peut pas être dans les deux listes.`,
      }, { status: 422 })
    }
  }

  const partialRefundEnabled = typeof body.partialRefundEnabled === 'boolean'
    ? body.partialRefundEnabled : undefined

  let partialRefundRules = undefined
  if (partialRefundEnabled && body.partialRefundRules && typeof body.partialRefundRules === 'object') {
    const r = body.partialRefundRules as Record<string, unknown>
    partialRefundRules = {
      after_50pct_window:   typeof r.after_50pct_window   === 'number' ? r.after_50pct_window   : 50,
      used_product_penalty: typeof r.used_product_penalty === 'number' ? r.used_product_penalty : 20,
    }
  }

  const acceptedReasons = Array.isArray(body.acceptedReturnReasons)
    ? (body.acceptedReturnReasons as string[]).filter(r => ALL_REASONS.includes(r))
    : undefined

  const processingDays = typeof body.processingDays === 'number' && body.processingDays > 0
    ? body.processingDays : undefined

  // Construire l'objet de mise à jour (ne mettre à jour que les champs fournis)
  const updateData: Record<string, unknown> = {}
  if (nonRefundable     !== undefined) updateData.nonRefundableCategories = nonRefundable
  if (exchangeOnly      !== undefined) updateData.exchangeOnlyCategories  = exchangeOnly
  if (partialRefundEnabled !== undefined) updateData.partialRefundEnabled  = partialRefundEnabled
  if (partialRefundRules !== undefined) updateData.partialRefundRules      = partialRefundRules
  if (acceptedReasons   !== undefined) updateData.acceptedReturnReasons   = acceptedReasons
  if (processingDays    !== undefined) updateData.processingDays           = processingDays

  // Paramètres de base si fournis
  if (typeof body.maxClaimDays        === 'number') updateData.maxClaimDays        = body.maxClaimDays
  if (typeof body.fraudScoreThreshold === 'number') updateData.fraudScoreThreshold = body.fraudScoreThreshold

  const updated = await prisma.returnPolicy.upsert({
    where:  { vendorId: vendor.id },
    create: { vendorId: vendor.id, ...updateData },
    update: updateData,
  })

  return NextResponse.json({
    ok:      true,
    policy:  updated,
    message: 'Politique de retour mise à jour avec succès.',
  })
}