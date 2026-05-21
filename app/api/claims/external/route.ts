// app/api/claims/external/route.ts — Flowmerce
//
// POST : ingestion d'un claim depuis une plateforme tierce (Shopify, Woo…)
// GET  : liste paginée des claims du vendeur (auth par clé API)
//
// Spécificités vs /api/claims/create :
//   - Auth via Authorization: Bearer OU x-api-key
//   - Normalisation des raisons FR → EN
//   - Application de la return policy (forceExchange, refus si délai/catégorie)
//   - Construction d'un payload ML enrichi depuis les métadonnées du body
//   - Pas de rate limiting, pas de rejet HTML
//
// La création du Claim, le fraud score, l'appel ML et l'auto-approve
// AI_AUTO sont délégués à lib/services/claim-ingestion.

import { NextRequest, NextResponse }  from 'next/server'
import { Prisma }                     from '@prisma/client'
import { prisma }                     from '@/lib/prisma'
import { validateApiKey }             from '@/lib/api-key-auth'
import { checkReturnPolicy }          from '@/lib/services/return-policy'
import {
  EXTERNAL_RETURN_REASONS,
  RETURN_REASONS,
  AI_DECISIONS,
  type AIDecision,
} from '@/lib/constants'
import { ingestClaim } from '@/lib/services/claim-ingestion'
import { log }         from '@/lib/logger'

// ─────────────────────────────────────────────────────────────
// GET — liste paginée des claims du vendeur
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const rawKey =
    req.headers.get('authorization')?.replace(/^Bearer\s+/, '') ??
    req.headers.get('x-api-key') ??
    null

  const auth = await validateApiKey(rawKey)
  if (!auth.ok) return auth.response

  const vendor = auth.keyRecord.vendor
  const { searchParams } = new URL(req.url)

  const status = searchParams.get('status')?.toUpperCase()
  const limit  = Math.min(Math.max(Number(searchParams.get('limit'))  || 50, 1), 200)
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0)

  const where: Prisma.ClaimWhereInput = { vendorId: vendor.id }
  if (status && ['PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS'].includes(status)) {
    where.status = status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS'
  }

  const [claims, total] = await Promise.all([
    prisma.claim.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take:    limit,
      skip:    offset,
      select: {
        id:            true,
        orderId:       true,
        customerName:  true,
        customerEmail: true,
        productName:   true,
        type:          true,
        status:        true,
        aiDecision:    true,
        aiScore:       true,
        fraudScore:    true,
        source:        true,
        createdAt:     true,
        updatedAt:     true,
        processedAt:   true,
        prediction:    true,
      },
    }),
    prisma.claim.count({ where }),
  ])

  return NextResponse.json({
    claims,
    meta: { total, limit, offset, vendor: { id: vendor.id, companyName: vendor.companyName } },
  })
}

// ─────────────────────────────────────────────────────────────
// Normalisation des raisons FR → code externe EN
// ─────────────────────────────────────────────────────────────
const FR_TO_EXTERNAL: Record<string, typeof EXTERNAL_RETURN_REASONS[number]> = {
  'Produit défectueux':          'DEFECTIVE',
  'Panne après utilisation':     'DEFECTIVE',
  'Produit contrefait':          'DEFECTIVE',
  'Produit endommagé livraison': 'DEFECTIVE',
  'Mauvaise taille':             'WRONG_ITEM',
  'Erreur de commande vendeur':  'WRONG_ITEM',
  'Ne correspond pas':           'DESCRIPTION',
  "Changement d'avis":           'CHANGE_MIND',
  'Allergie/Réaction':           'CHANGE_MIND',
  'Pièces manquantes':           'WRONG_ITEM',
}

function normalizeReason(raw: string): string {
  const upper = raw.trim().toUpperCase()
  if ((EXTERNAL_RETURN_REASONS as readonly string[]).includes(upper)) return upper
  if (raw.trim() in FR_TO_EXTERNAL) return FR_TO_EXTERNAL[raw.trim() as typeof RETURN_REASONS[number]]
  return raw.trim()
}

function reasonToClaimType(reason: string): 'EXCHANGE' | 'REFUND' | 'REPAIR' {
  if (reason === 'DEFECTIVE')  return 'REPAIR'
  if (reason === 'WRONG_ITEM') return 'EXCHANGE'
  return 'REFUND'
}

const DECISION_MAP: Record<string, AIDecision> = Object.fromEntries(
  AI_DECISIONS.map((d) => [d, d]),
)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ─────────────────────────────────────────────────────────────
// POST — ingestion d'un claim externe
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const rawKey =
    req.headers.get('authorization')?.replace(/^Bearer\s+/, '') ??
    req.headers.get('x-api-key') ??
    null

  const authResult = await validateApiKey(rawKey)
  if (!authResult.ok) return authResult.response

  const { keyRecord } = authResult
  const vendor        = keyRecord.vendor

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 }) }

  if (body.reason) body.reason = normalizeReason(String(body.reason))

  // ── Validation ────────────────────────────────────────────
  const required = [
    'customer_name', 'customer_email', 'product_name', 'order_id',
    'reason', 'description', 'external_source',
  ]
  for (const field of required) {
    if (!body[field] || String(body[field]).trim() === '') {
      log.warn('claims_external.validation_failed', { field, vendorId: vendor.id })
      return NextResponse.json({ error: `Champ requis manquant : ${field}` }, { status: 400 })
    }
  }
  if (!(EXTERNAL_RETURN_REASONS as readonly string[]).includes(String(body.reason))) {
    log.warn('claims_external.invalid_reason', {
      reason: body.reason, vendorId: vendor.id, valid: EXTERNAL_RETURN_REASONS,
    })
    return NextResponse.json(
      { error: 'Raison invalide', valid_reasons: EXTERNAL_RETURN_REASONS },
      { status: 400 },
    )
  }
  if (!EMAIL_RE.test(String(body.customer_email))) {
    log.warn('claims_external.invalid_email', {
      email: String(body.customer_email).slice(0, 50), vendorId: vendor.id,
    })
    return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
  }

  // ── Extraction des champs ────────────────────────────────
  const customerEmail   = String(body.customer_email).toLowerCase()
  const customerPhone   = body.customer_phone   ? String(body.customer_phone)   : null
  const productCategory = body.product_category ? String(body.product_category) : null
  const customerGender  = body.customer_gender  ? String(body.customer_gender)  : null
  const customerAge     = typeof body.customer_age === 'number' ? body.customer_age : null
  const customerWilaya  = body.customer_wilaya  ? String(body.customer_wilaya)  : null
  const paymentMethod   = body.payment_method   ? String(body.payment_method)   : null
  const shippingMethod  = body.shipping_method  ? String(body.shipping_method)  : null
  const shippingCost    = typeof body.shipping_cost   === 'number' ? body.shipping_cost   : null
  const productPrice    = typeof body.product_price   === 'number' ? body.product_price   : null
  const productQuantity = typeof body.product_quantity === 'number' ? body.product_quantity : null
  const orderTotal      = typeof body.order_total      === 'number' ? body.order_total      : null
  const orderAddress    = body.order_address    ? String(body.order_address)    : null

  const orderDateRaw = body.order_date ? new Date(String(body.order_date)) : null
  const daysToReturn = (() => {
    if (orderDateRaw && !isNaN(orderDateRaw.getTime())) {
      return Math.max(0, Math.floor((Date.now() - orderDateRaw.getTime()) / 86_400_000))
    }
    return typeof body.days_to_return === 'number' ? body.days_to_return : 0
  })()

  // ── Return policy ────────────────────────────────────────
  const returnPolicy = await prisma.returnPolicy.findUnique({ where: { vendorId: vendor.id } })
  const policyCheck  = checkReturnPolicy(returnPolicy, {
    daysToReturn,
    productCategory: productCategory ?? undefined,
    claimType:       reasonToClaimType(String(body.reason)),
  })
  if (!policyCheck.ok) {
    return NextResponse.json(
      { error: policyCheck.message, code: policyCheck.code, ...policyCheck.extra },
      { status: 422 },
    )
  }
  const { forceExchange } = policyCheck

  // ── Décision IA pré-fournie ──────────────────────────────
  let aiDecision: AIDecision | null = body.ai_decision
    ? DECISION_MAP[String(body.ai_decision)] ?? null
    : null
  if (forceExchange && aiDecision === 'Refund') aiDecision = 'Exchange'

  const claimType   = forceExchange ? 'EXCHANGE' : reasonToClaimType(String(body.reason))
  const description = String(body.description).trim().length >= 10
    ? String(body.description).trim()
    : `Retour ${body.external_source || 'externe'} : ${String(body.product_name)}. Raison : ${String(body.reason)}.`

  // ── Construction du payload ML enrichi (seulement si pas de décision pré-fournie) ──
  const mlPayload = aiDecision ? null : {
    Customer_Gender:         customerGender   ?? 'Unknown',
    Customer_Age:            customerAge      ?? 0,
    Customer_Wilaya:         customerWilaya   ?? 'Unknown',
    Customer_Past_Returns:   0, // sera corrigé par le service, juste un placeholder
    Shop_Name:               vendor.companyName,
    Product_Category:        productCategory  ?? 'Unknown',
    Product_Price_DA:        productPrice ?? orderTotal ?? 1,
    Order_Quantity:          productQuantity ?? 1,
    Total_Amount_DA:         orderTotal ?? 1,
    Payment_Method:          paymentMethod    ?? 'Unknown',
    Shipping_Method:         shippingMethod   ?? 'Standard',
    Shipping_Cost_DA:        shippingCost     ?? 0,
    Return_Reason:           String(body.reason),
    Days_to_Return:          daysToReturn,
    Shop_Return_Window_Days: returnPolicy?.maxClaimDays ?? 30,
    Within_Return_Policy:    1 as const,
    Fraud_Score:             0, // sera corrigé en interne; champ requis par le ML
    Customer_Satisfaction:   3,
    Is_Suspicious:           0 as const,
  }

  // ── Délégation au service unifié ─────────────────────────
  const result = await ingestClaim({
    vendor:    { id: vendor.id, companyName: vendor.companyName },
    apiKeyId:  keyRecord.id,
    orderId:   String(body.order_id),
    customerName:  String(body.customer_name),
    customerEmail,
    customerPhone,
    productName:   String(body.product_name),
    description,
    type:          claimType,
    source:        'API',
    orderDate:     orderDateRaw && !isNaN(orderDateRaw.getTime()) ? orderDateRaw : null,
    prediction: {
      aiDecision,
      orderTotal,
      customerAge,
      orderAddress,
      productPrice,
      shippingCost,
      paymentMethod,
      customerGender,
      customerWilaya,
      shippingMethod,
      productCategory,
      productQuantity,
    },
    mlPayload,
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: 'Une demande de retour existe déjà pour cette commande.' },
      { status: 409 },
    )
  }

  log.info('claims_external.created', {
    claimId:       result.claim.id,
    vendorId:      vendor.id,
    forceExchange,
  })

  return NextResponse.json(
    {
      claim: {
        id:        result.claim.id,
        status:    result.claim.status,
        createdAt: result.claim.createdAt,
      },
      policy_applied: {
        force_exchange:  forceExchange,
        processing_days: returnPolicy?.processingDays ?? 5,
      },
    },
    { status: 201 },
  )
}
