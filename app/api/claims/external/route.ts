// app/api/claims/external/route.ts — Flowmerce v2
//
// Reçoit les demandes de retour depuis CabaStore (ou tout autre e-commerce externe)
// Authentification : Authorization: Bearer <api-key>
//
// Nouveautés v2 :
//  - Vérification politique avancée (catégories non remboursables, délai, fraude)
//  - Messages d'erreur précis renvoyés au client CabaStore
//  - Signal fraude dans la réponse si approuvé avec score élevé

import { NextRequest, NextResponse } from 'next/server'
import { Prisma }                    from '@prisma/client'
import { prisma }                    from '@/lib/prisma'
import { validateApiKey }            from '@/lib/api-key-auth'

// ── Mapping reason externe → ClaimType Flowmerce ─────────────────────────
function reasonToClaimType(reason: string): 'EXCHANGE' | 'REFUND' | 'REPAIR' {
  if (reason === 'DEFECTIVE')  return 'REPAIR'
  if (reason === 'WRONG_ITEM') return 'EXCHANGE'
  return 'REFUND'
}

const DECISION_MAP: Record<string, 'Refund' | 'Exchange' | 'Repair' | 'Reject'> = {
  Refund:   'Refund',
  Exchange: 'Exchange',
  Repair:   'Repair',
  Reject:   'Reject',
}

// ── Catégories mapping (CabaStore → Flowmerce-ML) ────────────────────────
// Les catégories stockées dans ReturnPolicy.nonRefundableCategories
// correspondent aux noms de catégories produit de CabaStore
function normalizeCategory(cat: string | undefined): string {
  return (cat || '').toLowerCase().trim()
}

export async function POST(req: NextRequest) {
  // ── 1. Authentification par clé API ─────────────────────────────────────
  const rawKey =
    req.headers.get('authorization')?.replace(/^Bearer\s+/, '') ??
    req.headers.get('x-api-key') ??
    null

  const authResult = await validateApiKey(rawKey)
  if (!authResult.ok) return authResult.response

  const { keyRecord } = authResult
  const vendor = keyRecord.vendor

  // ── 2. Parser le body ────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  // ── 3. Validation minimale ───────────────────────────────────────────────
  const required = [
    'customer_name', 'customer_email', 'product_name', 'order_id',
    'reason', 'description', 'external_return_id', 'external_source',
  ]
  for (const field of required) {
    if (!body[field] || String(body[field]).trim() === '') {
      return NextResponse.json({ error: `Champ requis manquant : ${field}` }, { status: 400 })
    }
  }

  const validReasons = ['DEFECTIVE', 'WRONG_ITEM', 'DESCRIPTION', 'CHANGE_MIND']
  if (!validReasons.includes(String(body.reason))) {
    return NextResponse.json({ error: 'Raison invalide' }, { status: 400 })
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(String(body.customer_email))) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
  }

  // ── 4. Charger la politique de retour du vendeur ─────────────────────────
  const returnPolicy = await prisma.returnPolicy.findUnique({
    where: { vendorId: vendor.id },
  })

  const policy = {
    maxClaimDays:             returnPolicy?.maxClaimDays            ?? 30,
    fraudScoreThreshold:      returnPolicy?.fraudScoreThreshold     ?? 70,
    fraudReturnThreshold:     returnPolicy?.fraudReturnThreshold    ?? 4,
    nonRefundableCategories:  (returnPolicy as any)?.nonRefundableCategories  ?? [] as string[],
    exchangeOnlyCategories:   (returnPolicy as any)?.exchangeOnlyCategories   ?? [] as string[],
    partialRefundEnabled:     (returnPolicy as any)?.partialRefundEnabled      ?? false,
    partialRefundRules:       (returnPolicy as any)?.partialRefundRules        ?? null,
    acceptedReturnReasons:    (returnPolicy as any)?.acceptedReturnReasons     ?? [] as string[],
    processingDays:           (returnPolicy as any)?.processingDays            ?? 5,
  }

  const daysToReturn  = typeof body.days_to_return === 'number' ? body.days_to_return : 0
  const fraudScore    = typeof body.fraud_score    === 'number' ? body.fraud_score    : 0
  const productCat    = normalizeCategory(body.product_category as string | undefined)
  const customerEmail = String(body.customer_email).toLowerCase()

  // ── 5. Vérification : délai de rétractation ───────────────────────────────
  if (daysToReturn > policy.maxClaimDays) {
    return NextResponse.json({
      error:       `Vous avez dépassé le délai de rétractation (${policy.maxClaimDays} jours). Votre demande a été soumise après ${daysToReturn} jours.`,
      code:        'DELAY_EXCEEDED',
      policy_days: policy.maxClaimDays,
      days_actual: daysToReturn,
    }, { status: 422 })
  }

  // ── 6. Vérification : catégorie non remboursable ──────────────────────────
  const nonRefundNorm = policy.nonRefundableCategories.map(normalizeCategory)
  if (nonRefundNorm.length > 0 && productCat && nonRefundNorm.includes(productCat)) {
    const catDisplay = body.product_category as string || productCat
    return NextResponse.json({
      error: `La catégorie "${catDisplay}" est non remboursable selon la politique du vendeur. Aucun retour ne peut être accepté pour ce type de produit.`,
      code:  'NON_REFUNDABLE_CATEGORY',
      category: catDisplay,
    }, { status: 422 })
  }

  // ── 7. Vérification : catégorie échange uniquement → forcer Exchange ──────
  const exchangeOnlyNorm = policy.exchangeOnlyCategories.map(normalizeCategory)
  const forceExchange    = exchangeOnlyNorm.length > 0 && productCat && exchangeOnlyNorm.includes(productCat)

  // ── 8. Vérifier les doublons ──────────────────────────────────────────────
  const existing = await prisma.claim.findFirst({
    where: {
      vendorId:   vendor.id,
      prediction: {
        path:   ['externalReturnId'],
        equals: String(body.external_return_id),
      },
    },
  })
  if (existing) {
    return NextResponse.json({
      claim: { id: existing.id, status: existing.status, createdAt: existing.createdAt },
    })
  }

  // ── 9. Historique fraude du client ────────────────────────────────────────
  let fraudRecord = await prisma.customerFraudRecord.findFirst({
    where: { customerEmail },
  })

  const customerPhone = body.customer_phone ? String(body.customer_phone) : null

  if (!fraudRecord) {
    fraudRecord = await prisma.customerFraudRecord.create({
      data: { customerEmail, customerPhone },
    })
  }

  const totalClientClaims = (fraudRecord.totalClaims ?? 0) + 1

  // ── 10. Vérification fraude ───────────────────────────────────────────────
  // Si fraude ET pas déjà rejeté par le ML → signalement (mais on accepte quand même)
  const isFraudAlert = fraudScore > policy.fraudScoreThreshold ||
                       totalClientClaims > policy.fraudReturnThreshold

  // Message de signal fraude renvoyé dans la réponse (pas un rejet)
  let fraudSignalMessage: string | null = null
  if (isFraudAlert) {
    fraudSignalMessage =
      fraudScore > policy.fraudScoreThreshold
        ? `⚠️ Signal fraude : score de risque élevé (${fraudScore}/100). Cette demande est soumise à contrôle renforcé.`
        : `⚠️ Signal fraude : vous avez ${totalClientClaims} retours enregistrés. Un nombre élevé de retours peut entraîner une restriction.`
  }

  // ── 11. Décision ML + surcharge échange seul ──────────────────────────────
  let aiDecision = body.ai_decision
    ? DECISION_MAP[String(body.ai_decision)] ?? null
    : null

  if (forceExchange && aiDecision === 'Refund') {
    aiDecision = 'Exchange'  // Surcharge : catégorie échange uniquement
  }

  const claimType = forceExchange
    ? 'EXCHANGE'
    : reasonToClaimType(String(body.reason))

  const description = String(body.description).trim().length >= 10
    ? String(body.description).trim()
    : `Retour ${body.external_source || 'externe'} : ${String(body.product_name)}. Raison : ${String(body.reason)}.`

  // ── 12. Stocker les métadonnées ───────────────────────────────────────────
  const predictionData = {
    externalReturnId:  String(body.external_return_id),
    externalSource:    String(body.external_source),
    webhookUrl:        body.webhook_url    ? String(body.webhook_url)    : null,
    webhookSecret:     body.webhook_secret ? String(body.webhook_secret) : null,
    customerPhone,
    fraudScore,
    fraudAlert:        isFraudAlert,
    fraudSignal:       fraudSignalMessage,
    totalClientClaims,
    productCategory:   body.product_category ? String(body.product_category) : null,
    forceExchange,
    aiDecision,
    aiConfidence:      typeof body.ai_confidence === 'number' ? body.ai_confidence : null,
    probabilities:     body.ai_probabilities ?? null,
    orderDate:         body.order_date  ? String(body.order_date)  : null,
    orderTotal:        typeof body.order_total === 'number' ? body.order_total : null,
    receivedAt:        new Date().toISOString(),
  } satisfies Prisma.InputJsonObject

  // ── 13. Créer le claim ────────────────────────────────────────────────────
  const claim = await prisma.claim.create({
    data: {
      vendorId:      vendor.id,
      customerName:  String(body.customer_name),
      customerEmail,
      productName:   String(body.product_name),
      orderId:       String(body.order_id),
      type:          claimType,
      status:        'PENDING',
      source:        'API',
      description,
      fraudScore,
      aiDecision,
      prediction:    predictionData,
    },
  })

  // ── 14. Incrémenter totalClaims ───────────────────────────────────────────
  await prisma.customerFraudRecord.update({
    where: { id: fraudRecord.id },
    data:  { totalClaims: { increment: 1 } },
  })

  console.log(
    `[External Claim] Créé ${claim.id} pour vendor ${vendor.id}` +
    ` | fraudAlert=${isFraudAlert} | forceExchange=${forceExchange}`
  )

  return NextResponse.json(
    {
      claim: {
        id:        claim.id,
        status:    claim.status,
        createdAt: claim.createdAt,
      },
      // Informations renvoyées à CabaStore pour enrichir la réponse client
      policy_applied: {
        force_exchange:     forceExchange,
        fraud_alert:        isFraudAlert,
        fraud_signal:       fraudSignalMessage,
        processing_days:    policy.processingDays,
      },
    },
    { status: 201 }
  )
}