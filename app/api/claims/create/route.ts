// app/api/claims/create/route.ts — Flowmerce
//
// Création de claim "first-party" (page hébergée Flowmerce ou intégration
// directe vendeur). Spécificités vs /api/claims/external :
//   - Validation stricte (champs requis, longueur description, rejet HTML)
//   - Rate limiting par IP+order et par client/jour
//   - Auth via x-api-key uniquement (pas de Bearer)
//
// La création du Claim, le fraud score, l'appel ML et l'auto-approve
// AI_AUTO sont délégués à lib/services/claim-ingestion.

import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit }            from '@/lib/rate-limit'
import { validateApiKey }            from '@/lib/api-key-auth'
import { EXTERNAL_RETURN_REASONS }   from '@/lib/constants'
import { ingestClaim }               from '@/lib/services/claim-ingestion'

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

  const description = String(body.description)
  if (description.trim().length < 10)  return 'Description trop courte (minimum 10 caractères)'
  if (description.length > 2000)       return 'Description trop longue (maximum 2000 caractères)'

  const htmlRe = /<[^>]*>/g
  if (htmlRe.test(description) || htmlRe.test(String(body.customer_name))) {
    return 'Contenu HTML non autorisé'
  }

  return null
}

function reasonToClaimType(reason: string): 'EXCHANGE' | 'REFUND' | 'REPAIR' {
  if (reason === 'DEFECTIVE')  return 'REPAIR'
  if (reason === 'WRONG_ITEM') return 'EXCHANGE'
  return 'REFUND'
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

  // 6. Délégation au service unifié
  const orderDateRaw = body.order_date ? new Date(String(body.order_date)) : null
  const mlPayload = body.ml_payload && typeof body.ml_payload === 'object'
    ? (body.ml_payload as Record<string, unknown>)
    : null

  const result = await ingestClaim({
    vendor:    { id: keyRecord.vendorId, companyName: keyRecord.vendor.companyName },
    apiKeyId:  keyRecord.id,
    orderId,
    customerName:  String(body.customer_name),
    customerEmail: customerEmailNorm,
    customerPhone: customerPhoneNorm,
    productName:   String(body.product_name),
    description,
    type:          reasonToClaimType(reason),
    source:        body.source === 'hosted_page' ? 'HOSTED_PAGE' : 'API',
    ipAddress:     ip,
    orderDate:     orderDateRaw && !isNaN(orderDateRaw.getTime()) ? orderDateRaw : null,
    prediction: {
      orderTotal:   typeof body.order_total      === 'number' ? body.order_total      : null,
      productPrice: typeof body.product_price    === 'number' ? body.product_price    : null,
      productQuantity: typeof body.product_quantity === 'number' ? body.product_quantity : null,
    },
    mlPayload,
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: 'Une demande de retour existe déjà pour cette commande.' },
      { status: 409 },
    )
  }

  // 7. Log structuré
  console.log(JSON.stringify({
    event:               'return_submitted',
    claimId:             result.claim.id,
    vendorId:            keyRecord.vendorId,
    orderId,
    reason,
    customerPastReturns: result.customerPastReturns,
    source:              body.source === 'hosted_page' ? 'HOSTED_PAGE' : 'API',
    ip,
    timestamp:           new Date().toISOString(),
  }))

  return NextResponse.json(
    {
      success:               true,
      claim_id:              result.claim.id,
      status:                result.claim.status,
      customer_past_returns: result.customerPastReturns,
      message: result.claim.autoApproved
        ? 'Votre demande de retour a été enregistrée et approuvée automatiquement.'
        : 'Votre demande de retour a été enregistrée.',
    },
    { status: 201 },
  )
}
