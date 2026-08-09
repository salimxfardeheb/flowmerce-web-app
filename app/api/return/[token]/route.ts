// app/api/return/[token]/route.ts
//
// Endpoint consommé uniquement par la page hébergée /return/[token].
// Le client final remplit le formulaire ; auth via token de session
// (à usage unique, expirable). Délègue la création du Claim à ingestClaim().
//
// Les réponses sont validées CONTRE la définition du formulaire renvoyée par
// buildReturnForm — exactement comme POST /api/v1/returns. La page hébergée et
// les intégrations externes partagent donc le même formulaire, la même
// validation et le même service d'ingestion ; seule l'authentification diffère
// (token de session ici, clé API là-bas).
//
// Body accepté :
//   { "answers": { "<field_id>": valeur, … } }   ← format formulaire
//   { "reason": …, "desired_resolution": … }     ← format plat (rétrocompat)
//
// Les champs déjà connus de la session (commande, identité client, wilaya,
// mode de paiement quand la boutique les a transmis) ne sont ni attendus ni
// validés : la valeur de session fait foi.
//
// Le mode et les frais de livraison (champs `merchant` du formulaire) ne sont
// jamais demandés au client ni lus depuis son body : ils proviennent
// uniquement de la session, avec repli 'Standard' / 0.
//
// La return policy a déjà été vérifiée par /api/return-sessions au moment
// de générer le lien — on ne re-vérifie pas ici.

import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'
import { checkRateLimit }            from '@/lib/rate-limit'
import { buildReturnForm }           from '@/lib/services/return-form-builder'
import { validateReturnFormAnswers } from '@/lib/services/return-form-validation'
import { ingestClaim }               from '@/lib/services/claim-ingestion'
import { buildMLPayload }            from '@/lib/services/ml'
import { log }                       from '@/lib/logger'

const HTML_RE  = /<[^>]*>/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // ── 1. Validation de la session ──────────────────────────────────────────
  const session = await prisma.returnSession.findUnique({
    where:   { token },
    include: { vendor: { include: { vendor: { include: { returnPolicy: true } } } } },
  }).catch(() => null)

  if (!session)
    return NextResponse.json({ error: 'Lien de retour introuvable.' }, { status: 401 })
  if (session.expiresAt < new Date())
    return NextResponse.json({ error: 'Ce lien de retour a expiré.' }, { status: 401 })
  if (session.usedAt)
    return NextResponse.json({ error: 'Ce lien de retour a déjà été utilisé.' }, { status: 409 })

  const apiKey = session.vendor
  if (!apiKey.isActive || apiKey.vendor.status !== 'APPROVED')
    return NextResponse.json({ error: 'Clé API invalide ou compte non approuvé.' }, { status: 403 })

  // ── 2. Parse du body ─────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 }) }

  // `answers` (formulaire dynamique) ou body plat (ancien client)
  const ans: Record<string, unknown> =
    body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)
      ? body.answers as Record<string, unknown>
      : body

  const str    = (k: string) => String(ans[k] ?? '').trim()
  const numPos = (k: string) => { const n = Number(ans[k]); return Number.isFinite(n) && n > 0  ? n : null }
  const intPos = (k: string) => { const n = parseInt(String(ans[k]), 10); return Number.isFinite(n) && n > 0 ? n : null }

  // Données pré-remplies (session) prioritaires sur celles tapées par le client
  const customerName    = session.customerName   || str('customer_name')
  const customerEmail   = (session.customerEmail || str('customer_email')).toLowerCase()
  const customerPhone   = session.customerPhone  || str('customer_telephone') || str('customer_phone')
  const customerId      = session.customerId     || str('customer_id')
  const productName     = session.productName    || str('product_name')
  const orderId         = session.orderId        || str('order_id')
  const shopName        = session.shopName       || str('shop_name')
  const orderDateRaw    = session.orderDate      || str('order_date')
  const customerWilaya  = session.customerWilaya || str('customer_wilaya') || 'Unknown'
  const paymentMethod   = session.paymentMethod  || str('payment_method')  || 'Unknown'
  // Livraison : donnée logistique de la boutique (champs `merchant` du
  // formulaire). Jamais lue depuis les réponses du client — un client final ne
  // doit pas pouvoir influencer le score en déclarant ses propres frais.
  const shippingMethod  = session.shippingMethod || 'Standard'
  const shippingCost    = session.shippingCost   ?? 0
  const productPrice    = session.productPrice    ?? numPos('product_price')
  const productQuantity = session.productQuantity ?? intPos('order_quantity') ?? intPos('product_quantity') ?? 1
  const orderTotal      = session.orderTotal      ?? numPos('order_total')

  // Profil client : données de la boutique (features ML Customer_Age /
  // Customer_Gender). Le formulaire ne les demande pas — elles viennent de la
  // session. Les replis 'Unknown' / 30 ne s'appliquent que si la boutique ne
  // les a pas transmises à la création du lien.
  const customerGender  = session.customerGender || str('customer_gender') || 'Unknown'
  const customerAge     = session.customerAge    ?? intPos('customer_age') ?? 30

  // Données saisies par le client uniquement
  const reason            = str('reason')
  const desiredResolution = str('desired_resolution').toUpperCase()
  const description       = str('description')
  const productCategory   = str('product_category')
  const orderAddress      = str('order_address')

  // ── 3. Validation contre la définition du formulaire ─────────────────────
  // Les champs renseignés par la session ne sont pas validés (le client ne les
  // saisit pas) ; tous les autres suivent les règles du formulaire du vendeur.
  const form = buildReturnForm(apiKey.vendor, apiKey.vendor.returnPolicy)

  const sessionFields = new Set<string>()
  if (session.orderId)        sessionFields.add('order_id')
  if (session.customerId)     sessionFields.add('customer_id')
  if (session.customerName)   sessionFields.add('customer_name')
  if (session.customerEmail)  sessionFields.add('customer_email')
  if (session.customerPhone)  sessionFields.add('customer_phone')
  if (session.customerWilaya) sessionFields.add('customer_wilaya')
  if (session.paymentMethod)  sessionFields.add('payment_method')
  // Toujours ignorés côté client : leur valeur vient exclusivement de la
  // session, y compris quand la boutique ne l'a pas transmise (repli).
  sessionFields.add('shipping_method')
  sessionFields.add('shipping_cost')
  if (session.productName)    sessionFields.add('product_name')
  if (session.orderDate)      sessionFields.add('order_date')

  // `desired_resolution` est comparé en majuscules aux options du formulaire.
  const normalizedAnswers = { ...ans, desired_resolution: desiredResolution }

  const validationError = validateReturnFormAnswers(form, normalizedAnswers, {
    skipFields: sessionFields,
  })
  if (validationError)
    return NextResponse.json({ error: validationError }, { status: 400 })

  // Garde-fous sur les valeurs issues de la session (jamais passées par le
  // formulaire) et sur les champs libres hors formulaire.
  if (!customerEmail || !orderId || !productName || !reason || !desiredResolution)
    return NextResponse.json({ error: 'Champs requis : customer_email, order_id, product_name, reason, desired_resolution' }, { status: 400 })
  if (!EMAIL_RE.test(customerEmail) || customerEmail.length > 254)
    return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
  if (customerName.length > 200 || productName.length > 500 || orderId.length > 200)
    return NextResponse.json({ error: 'Champ trop long' }, { status: 400 })
  if (HTML_RE.test(shopName) || HTML_RE.test(orderAddress))
    return NextResponse.json({ error: 'Contenu HTML non autorisé' }, { status: 400 })

  // ── 4. Rate limit ────────────────────────────────────────────────────────
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          ?? req.headers.get('x-real-ip')
          ?? 'unknown'

  const allowed = await checkRateLimit(`${ip}:${orderId}`)
  if (!allowed)
    return NextResponse.json({ error: 'Trop de tentatives pour cette commande. Réessayez dans 1 heure.' }, { status: 429 })

  // ── 5. Construction du payload ML enrichi ────────────────────────────────
  const parsedOrderDate  = orderDateRaw ? new Date(orderDateRaw) : null
  const orderDate        = parsedOrderDate && !isNaN(parsedOrderDate.getTime()) ? parsedOrderDate : null
  const returnWindowDays = apiKey.vendor.returnPolicy?.maxClaimDays ?? 14
  const daysSinceOrder   = orderDate
    ? Math.max(0, Math.floor((Date.now() - orderDate.getTime()) / 86_400_000))
    : 0

  const mlPayload = buildMLPayload({
    customerId:       customerId || null,
    shopName:         shopName || apiKey.vendor.companyName,
    productCategory:  productCategory || apiKey.vendor.vendorCategories?.[0] || null,
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
    daysToReturn:     daysSinceOrder,
    returnWindowDays,
  })

  // ── 6. Délégation au service d'ingestion ─────────────────────────────────
  const fullDescription = [
    productName,
    `Motif : ${reason}`,
    description ? `Détails : ${description}` : null,
  ].filter(Boolean).join(' — ')

  const result = await ingestClaim({
    vendor:    { id: apiKey.vendorId, companyName: apiKey.vendor.companyName },
    apiKeyId:  apiKey.id,
    orderId,
    customerId:    customerId || null,
    customerName:  customerName || customerEmail,
    customerEmail,
    customerPhone: customerPhone || null,
    productName,
    description:   fullDescription,
    type:          desiredResolution as 'EXCHANGE' | 'REFUND' | 'REPAIR',
    source:        'HOSTED_PAGE',
    ipAddress:     ip,
    orderDate,
    prediction: {
      orderTotal,
      customerAge,
      orderAddress: orderAddress || null,
      productPrice,
      shippingCost,
      paymentMethod,
      customerGender,
      customerWilaya,
      shippingMethod,
      productCategory: productCategory || null,
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

  // ── 7. Marquer la session utilisée (à usage unique) ──────────────────────
  await prisma.returnSession
    .update({ where: { token }, data: { usedAt: new Date() } })
    .catch((e) => log.error('return.session_mark_used_error', { err: String(e) }))

  log.info('return_submitted', {
    claimId: result.claim.id, vendorId: apiKey.vendorId,
    orderId, reason, fraudScore: result.claim.fraudScore,
    source: 'HOSTED_PAGE', ip,
  })

  return NextResponse.json(
    { success: true, claimId: result.claim.id, message: 'Réclamation créée avec succès' },
    { status: 201 },
  )
}
