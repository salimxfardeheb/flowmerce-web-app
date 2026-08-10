// app/api/v1/returns/route.ts — Flowmerce
//
// Endpoint public : soumission des réponses du formulaire de retour, appelé
// par les plateformes clientes (ex. Caba Store). Symétrique de
// GET /api/v1/return-form :
//   - La clé API (Bearer ou x-api-key) est l'unique source de vérité : elle
//     identifie le Vendor et sa ReturnPolicy.
//   - Le body { orderId, productId, answers } est générique : `answers` est un
//     dictionnaire { fieldId: valeur } produit par le formulaire dynamique.
//   - Les réponses sont validées CONTRE la définition du formulaire renvoyée
//     par buildReturnForm (champs requis, types, options valides), puis
//     mappées vers checkReturnPolicy + ingestClaim (services existants —
//     aucune règle de policy n'est codée ici, aucune logique dupliquée).
//
// POST /api/v1/returns
// Authorization: Bearer <api_key>   (ou en-tête x-api-key)
// Body: { orderId, productId, answers: { [fieldId]: valeur } }
//   201 → { success, claim_id, status }
//   400/401/403/409/422/429/503 → { error, code? }

import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit }            from '@/lib/rate-limit'
import { validateApiKey }            from '@/lib/api-key-auth'
import { buildReturnForm }           from '@/lib/services/return-form-builder'
import {
  isPresent,
  validateReturnFormAnswers,
}                                    from '@/lib/services/return-form-validation'
import { buildMLPayload }            from '@/lib/services/ml'
import { checkReturnPolicy, isPermanentPolicyViolation } from '@/lib/services/return-policy'
import { ingestClaim }               from '@/lib/services/claim-ingestion'
import { computeAgeFromBirthDate, parseOrderDate, daysSinceOrder } from '@/lib/utils'
import { log }                       from '@/lib/logger'

// ─────────────────────────────────────────────────────────────
// POST /api/v1/returns
// ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  // 1. Auth — Bearer ou x-api-key (même extraction que GET /api/v1/return-form)
  const rawKey =
    req.headers.get('authorization')?.replace(/^Bearer\s+/, '') ??
    req.headers.get('x-api-key') ??
    null

  const auth = await validateApiKey(rawKey)
  if (!auth.ok) return auth.response
  const { keyRecord } = auth
  const vendor = keyRecord.vendor

  // 2. Parse body
  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 }) }

  const orderId   = String(body.orderId ?? '').trim()
  const productId = String(body.productId ?? '').trim()
  const answers   = body.answers

  if (!orderId || !productId) {
    return NextResponse.json(
      { error: 'Champs obligatoires manquants : orderId, productId' },
      { status: 400 },
    )
  }
  if (orderId.length > 200 || productId.length > 500) {
    return NextResponse.json({ error: 'Champ trop long' }, { status: 400 })
  }
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return NextResponse.json({ error: 'Champ answers invalide' }, { status: 400 })
  }

  // 3. Validation des réponses contre la définition du formulaire du vendeur
  const form = buildReturnForm(vendor, vendor.returnPolicy)
  const ans  = answers as Record<string, unknown>

  // Le champ order_id du formulaire est renseigné par le client ; si absent,
  // l'orderId du body (contrat API) fait foi pour le claim.
  if (!isPresent(ans.order_id)) ans.order_id = orderId

  const validationError = validateReturnFormAnswers(form, ans)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  // 4. Mapping des réponses validées vers les champs métier
  const str = (v: unknown) => String(v ?? '').trim()

  const customerId       = str(ans.customer_id) || null
  const customerName     = str(ans.customer_name)
  const customerEmail    = str(ans.customer_email).toLowerCase()
  const customerPhone    = str(ans.customer_phone) || null
  const productName      = str(ans.product_name)
  const reason           = str(ans.reason)
  const desiredResolution = str(ans.desired_resolution).toUpperCase() as 'EXCHANGE' | 'REFUND' | 'REPAIR'
  const description      = str(ans.description)

  // Une commande dans le futur est une erreur d'intégration : refusée plutôt
  // que ramenée à un Days_to_Return de 0 qui polluerait le dataset.
  const parsedOrderDate = parseOrderDate(ans.order_date)
  if (!parsedOrderDate.ok) {
    return NextResponse.json(
      {
        error: parsedOrderDate.reason === 'future'
          ? 'order_date ne peut pas être dans le futur'
          : 'order_date invalide (date ISO-8601 attendue)',
      },
      { status: 400 },
    )
  }
  const orderDate    = parsedOrderDate.date
  const daysToReturn = daysSinceOrder(orderDate)

  // 5. Rate limiting — identique à /api/claims/create :
  //    par IP+order, puis par client/jour (anti fraud-score poisoning)
  const allowed = await checkRateLimit(`${ip}:${orderId}`)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Trop de tentatives pour cette commande. Réessayez dans 1 heure.' },
      { status: 429 },
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  const allowedPerCustomer = await checkRateLimit(
    `vendor:${keyRecord.vendorId}:email:${customerEmail}:${today}`,
    3,
    24 * 60 * 60 * 1000,
  )
  if (!allowedPerCustomer) {
    return NextResponse.json(
      { error: "Trop de demandes pour ce client aujourd'hui. Réessayez demain." },
      { status: 429 },
    )
  }

  // 6. Return policy — la politique du vendeur est l'unique source de vérité
  //    (la catégorie produit n'est pas collectée par le formulaire générique)
  const policyCheck = checkReturnPolicy(vendor.returnPolicy, {
    daysToReturn,
    claimType: desiredResolution,
  })
  // Réponse inchangée pour la plateforme cliente : 422 avec le même code.
  // Sur une violation *définitive*, la réclamation est tout de même enregistrée
  // (refusée, masquée au vendeur) pour alimenter le dataset. Sur une violation
  // corrigeable, on sort sans rien créer, sinon le réessai légitime avec une
  // autre résolution butterait sur la contrainte unique (vendorId, orderId).
  const policyFailure = policyCheck.ok
    ? null
    : { code: policyCheck.code, message: policyCheck.message, extra: policyCheck.extra }

  const policy422 = () =>
    NextResponse.json(
      { error: policyFailure!.message, code: policyFailure!.code, ...policyFailure!.extra },
      { status: 422 },
    )

  if (policyFailure && !isPermanentPolicyViolation(policyFailure.code)) {
    return policy422()
  }

  // notify: false — la plateforme reçoit le 422 et informe son client elle-même.
  const policyViolation = policyFailure
    ? { code: policyFailure.code, message: policyFailure.message, notify: false }
    : null

  // 7. Payload ML + ingestion unifiée (fraud score, dédup, auto-approve)
  //    Champs optionnels du formulaire : lus depuis `ans` quand la plateforme
  //    cliente les fournit, avec repli sur les défauts si absents.

  const numOrNull = (v: unknown) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const strOrNull = (v: unknown) => {
    const s = String(v ?? '').trim()
    return s ? s : null
  }

  const productPrice     = numOrNull(ans.product_price)
  const productQuantity  = numOrNull(ans.order_quantity)
  const orderTotal       = numOrNull(ans.order_total)
  const paymentMethod    = strOrNull(ans.payment_method)  ?? 'Unknown'
  const shippingMethod   = strOrNull(ans.shipping_method) ?? 'Standard'
  const shippingCost     = numOrNull(ans.shipping_cost)   ?? 0
  const customerGender   = strOrNull(ans.customer_gender) ?? 'Unknown'
  // Une date de naissance, si fournie, prime sur l'âge direct.
  const customerAge      = computeAgeFromBirthDate(ans.customer_birth_date)
                        ?? numOrNull(ans.customer_age)
  const customerWilaya   = strOrNull(ans.customer_wilaya) ?? 'Unknown'
  const productCategory  = strOrNull(ans.product_category)

  const mlPayload = buildMLPayload({
    customerId,
    shopName:           vendor.companyName,
    productCategory,
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
    returnWindowDays:   vendor.returnPolicy?.maxClaimDays ?? 14,
  })

  const fullDescription = [
    productName,
    `Motif : ${reason}`,
    description ? `Détails : ${description}` : null,
  ].filter(Boolean).join(' — ')

  const result = await ingestClaim({
    vendor:        { id: keyRecord.vendorId, companyName: vendor.companyName },
    apiKeyId:      keyRecord.id,
    orderId,
    customerId,
    customerName,
    customerEmail,
    customerPhone,
    productName,
    description:   fullDescription,
    type:          desiredResolution,
    source:        'API',
    ipAddress:     ip,
    orderDate,
    prediction: {
      orderTotal,
      customerAge,
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
    policyViolation,
  })

  if (!result.ok) {
    // Doublon sur une violation définitive : la réclamation refusée existe
    // déjà, la plateforme doit quand même recevoir sa raison métier.
    if (policyFailure) return policy422()
    return NextResponse.json(
      { error: 'Une demande de retour existe déjà pour cette commande.' },
      { status: 409 },
    )
  }

  // Violation définitive : enregistrée en base, réponse identique à avant.
  if (policyFailure) return policy422()

  // 8. Log structuré (lastUsedAt est mis à jour par ingestClaim en best-effort)
  log.info('return_submitted', {
    claimId:             result.claim.id,
    vendorId:            keyRecord.vendorId,
    orderId,
    reason,
    desiredResolution,
    customerPastReturns: result.customerPastReturns,
    source:              'API',
    ip,
  })

  return NextResponse.json(
    {
      success:  true,
      claim_id: result.claim.id,
      status:   result.claim.status,
      message:  result.claim.autoRejected
        ? "Votre demande de retour a été refusée automatiquement par notre système d'analyse."
        : result.claim.autoApproved
          ? 'Votre demande de retour a été enregistrée et approuvée automatiquement.'
          : 'Votre demande de retour a été enregistrée.',
    },
    { status: 201 },
  )
}
