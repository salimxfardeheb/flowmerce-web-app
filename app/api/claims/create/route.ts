// app/api/claims/create/route.ts — Flowmerce
//
// Création de claim "first-party" (page hébergée Flowmerce ou intégration
// directe vendeur). Spécificités :
//   - Validation stricte (champs requis, longueur description, rejet HTML)
//   - Rate limiting par IP+order et par client/jour
//   - Auth via x-api-key uniquement (pas de Bearer)
//
// La création du Claim, le fraud score, l'appel ML et l'auto-approve
// AI_AUTO sont délégués à lib/services/claim-ingestion.

import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'
import { checkRateLimit }            from '@/lib/rate-limit'
import { validateApiKey }            from '@/lib/api-key-auth'
import { EXTERNAL_RETURN_REASONS, CLAIM_TYPES } from '@/lib/constants'
import { ingestClaim }               from '@/lib/services/claim-ingestion'
import { buildMLPayload }            from '@/lib/services/ml'
import { checkReturnPolicy }         from '@/lib/services/return-policy'
import { log }                       from '@/lib/logger'

const VALID_RESOLUTIONS = new Set<string>(CLAIM_TYPES)

// ─────────────────────────────────────────────────────────────
// Validation stricte
// ─────────────────────────────────────────────────────────────
function validatePayload(body: Record<string, unknown>): string | null {
  const required = [
    'customer_name',
    'customer_email',
    'product_name',
    'order_id',
    'shop_id',
    'reason',
    'desired_resolution',
    'description',
  ]

  for (const field of required) {
    if (!body[field] || String(body[field]).trim() === '') {
      return `Champ requis manquant : ${field}`
    }
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(String(body.customer_email))) return 'Email invalide'

  if (!(EXTERNAL_RETURN_REASONS as readonly string[]).includes(String(body.reason))) {
    return 'Raison invalide'
  }

  if (!VALID_RESOLUTIONS.has(String(body.desired_resolution).toUpperCase())) {
    return 'Résolution invalide (EXCHANGE, REFUND ou REPAIR)'
  }

  const description = String(body.description)
  if (description.trim().length < 10)  return 'Description trop courte (minimum 10 caractères)'
  if (description.length > 2000)       return 'Description trop longue (maximum 2000 caractères)'

  const htmlRe = /<[^>]*>/g
  if (htmlRe.test(description) || htmlRe.test(String(body.customer_name))) {
    return 'Contenu HTML non autorisé'
  }

  return null
}

// ─────────────────────────────────────────────────────────────
// POST /api/claims/create
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  // 1. Auth clé API
  const auth = await validateApiKey(req.headers.get('x-api-key'))
  if (!auth.ok) return auth.response
  const { keyRecord } = auth

  // 2. Parse body
  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 }) }

  // 3. Validation stricte
  const validationError = validatePayload(body)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const orderId           = String(body.order_id).trim()
  const reason            = String(body.reason)
  const description       = String(body.description).trim()
  const customerEmailNorm = String(body.customer_email).trim().toLowerCase()
  const customerPhoneNorm = body.customer_phone ? String(body.customer_phone).trim() : null

  // 4. Rate limit par IP+order
  const allowed = await checkRateLimit(`${ip}:${orderId}`)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Trop de tentatives pour cette commande. Réessayez dans 1 heure.' },
      { status: 429 },
    )
  }

  // 5. Rate limit par client/jour (anti fraud-score poisoning)
  const today = new Date().toISOString().slice(0, 10)
  const allowedPerCustomer = await checkRateLimit(
    `vendor:${keyRecord.vendorId}:email:${customerEmailNorm}:${today}`,
    3,
    24 * 60 * 60 * 1000,
  )
  if (!allowedPerCustomer) {
    return NextResponse.json(
      { error: "Trop de demandes pour ce client aujourd'hui. Réessayez demain." },
      { status: 429 },
    )
  }

  // 6. Return policy : refus si la politique du vendeur n'est pas respectée
  //    (délai, catégorie non remboursable). Le type vient de desired_resolution
  //    (choix client) ; le ML stocke sa recommandation à part dans aiDecision.
  const orderDateRaw = body.order_date ? new Date(String(body.order_date)) : null
  const validOrderDate = orderDateRaw && !isNaN(orderDateRaw.getTime()) ? orderDateRaw : null
  const daysToReturn = validOrderDate
    ? Math.max(0, Math.floor((Date.now() - validOrderDate.getTime()) / 86_400_000))
    : 0
  const productCategory = body.product_category ? String(body.product_category) : undefined

  const returnPolicy = await prisma.returnPolicy.findUnique({
    where: { vendorId: keyRecord.vendorId },
  })
  const policyCheck = checkReturnPolicy(returnPolicy, {
    daysToReturn,
    productCategory,
  })
  if (!policyCheck.ok) {
    return NextResponse.json(
      { error: policyCheck.message, code: policyCheck.code, ...policyCheck.extra },
      { status: 422 },
    )
  }

  // 7. Extraction des champs optionnels pour enrichir prediction + ML payload
  const orderTotal      = typeof body.order_total      === 'number' ? body.order_total      : null
  const productPrice    = typeof body.product_price    === 'number' ? body.product_price    : null
  const productQuantity = typeof body.product_quantity === 'number' ? body.product_quantity : null
  const customerAge     = typeof body.customer_age     === 'number' ? body.customer_age     : null
  const shippingCost    = typeof body.shipping_cost    === 'number' ? body.shipping_cost    : 0
  const customerGender  = body.customer_gender  ? String(body.customer_gender)  : 'Unknown'
  const customerWilaya  = body.customer_wilaya  ? String(body.customer_wilaya)  : 'Unknown'
  const paymentMethod   = body.payment_method   ? String(body.payment_method)   : 'Unknown'
  const shippingMethod  = body.shipping_method  ? String(body.shipping_method)  : 'Standard'
  const orderAddress    = body.order_address    ? String(body.order_address)    : null

  // 8. Construction du payload ML enrichi (les champs non fournis prennent
  //    des valeurs par défaut neutres). Fraud_Score / Past_Returns / Is_Suspicious
  //    sont injectés par ingestClaim après calcul du fraud record.
  const returnWindowDays = returnPolicy?.maxClaimDays ?? 14
  const mlPayload = buildMLPayload({
    shopName:         keyRecord.vendor.companyName,
    productCategory:  productCategory ?? null,
    productPrice,
    productQuantity,
    orderTotal,
    paymentMethod,
    shippingMethod,
    shippingCost,
    customerGender,
    customerAge,
    customerWilaya,
    reason,
    daysToReturn,
    returnWindowDays,
  })

  // 9. Délégation au service unifié
  const desiredResolution = String(body.desired_resolution).toUpperCase() as 'EXCHANGE' | 'REFUND' | 'REPAIR'

  const result = await ingestClaim({
    vendor:    { id: keyRecord.vendorId, companyName: keyRecord.vendor.companyName },
    apiKeyId:  keyRecord.id,
    orderId,
    customerName:  String(body.customer_name),
    customerEmail: customerEmailNorm,
    customerPhone: customerPhoneNorm,
    productName:   String(body.product_name),
    description,
    type:          desiredResolution,
    source:        body.source === 'hosted_page' ? 'HOSTED_PAGE' : 'API',
    ipAddress:     ip,
    orderDate:     validOrderDate,
    prediction: {
      orderTotal,
      productPrice,
      productQuantity,
      productCategory: productCategory ?? null,
      customerAge,
      customerGender,
      customerWilaya,
      paymentMethod,
      shippingMethod,
      shippingCost,
      orderAddress,
    },
    mlPayload,
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: 'Une demande de retour existe déjà pour cette commande.' },
      { status: 409 },
    )
  }

  // 8. Log structuré
  log.info('return_submitted', {
    claimId:             result.claim.id,
    vendorId:            keyRecord.vendorId,
    orderId,
    reason,
    customerPastReturns: result.customerPastReturns,
    source:              body.source === 'hosted_page' ? 'HOSTED_PAGE' : 'API',
    ip,
  })

  const message = result.claim.autoRejected
    ? "Votre demande de retour a été refusée automatiquement par notre système d'analyse."
    : result.claim.autoApproved
      ? 'Votre demande de retour a été enregistrée et approuvée automatiquement.'
      : 'Votre demande de retour a été enregistrée.'

  return NextResponse.json(
    {
      success:               true,
      claim_id:              result.claim.id,
      status:                result.claim.status,
      customer_past_returns: result.customerPastReturns,
      message,
    },
    { status: 201 },
  )
}
