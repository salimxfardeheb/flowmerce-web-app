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
import type { ReturnForm, ReturnFormField } from '@/lib/services/return-form-builder'
import { buildMLPayload }            from '@/lib/services/ml'
import { checkReturnPolicy }         from '@/lib/services/return-policy'
import { ingestClaim }               from '@/lib/services/claim-ingestion'
import { log }                       from '@/lib/logger'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HTML_RE  = /<[^>]*>/
const URL_RE   = /^(https?:|data:|blob:)/

// ─────────────────────────────────────────────────────────────
// Validation des réponses contre la définition du formulaire
// (règles de validation pilotées par buildReturnForm — source de vérité)
// ─────────────────────────────────────────────────────────────

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.length > 0
  return true
}

function isRequired(field: ReturnFormField): boolean {
  return field.required ?? false
}

function optionValues(field: ReturnFormField): string[] {
  return (field.options ?? []).map(o =>
    typeof o === 'string' ? o : o.value,
  )
}

function validateAnswer(field: ReturnFormField, value: unknown): string | null {
  const label = field.label ?? field.id

  if (!isPresent(value)) {
    return isRequired(field) ? `Champ requis manquant : ${field.id}` : null
  }

  // Types à valeur de chaîne (text, textarea, email, tel)
  if (field.type === 'text' || field.type === 'textarea' || field.type === 'email' || field.type === 'tel') {
    if (typeof value !== 'string') return `Champ ${label} invalide`
    const text = value.trim()

    if (field.validation?.minLength != null && text.length < field.validation.minLength) {
      return `Champ ${label} : minimum ${field.validation.minLength} caractères`
    }
    if (field.validation?.maxLength != null && text.length > field.validation.maxLength) {
      return `Champ ${label} : maximum ${field.validation.maxLength} caractères`
    }

    if (field.type === 'email') {
      if (!EMAIL_RE.test(text) || text.length > 254) return 'Email invalide'
    } else if (field.validation?.pattern) {
      try {
        if (!new RegExp(field.validation.pattern).test(text)) return `Champ ${label} : format invalide`
      } catch {
        // Regex invalide dans la définition du formulaire : on ne bloque pas
      }
    }

    if (HTML_RE.test(text)) return `Contenu HTML non autorisé (champ ${label})`
    return null
  }

  // Date
  if (field.type === 'date') {
    if (typeof value !== 'string') return `Champ ${label} invalide`
    const parsed = new Date(value)
    if (isNaN(parsed.getTime())) return `Champ ${label} : date invalide`
    return null
  }

  // Nombre
  if (field.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return `Champ ${label} invalide`
    if (field.validation?.min != null && value < field.validation.min) return `Champ ${label} : valeur minimale ${field.validation.min}`
    if (field.validation?.max != null && value > field.validation.max) return `Champ ${label} : valeur maximale ${field.validation.max}`
    return null
  }

  // Select / radio — la valeur doit être une option valide du formulaire
  // (les options sont déjà filtrées par la policy du vendeur : raisons
  // acceptées et types de résolution acceptés)
  if (field.type === 'select') {
    if (typeof value !== 'string') return `Champ ${label} invalide`
    const options = optionValues(field)
    if (options.length > 0 && !options.includes(value)) {
      return `Valeur invalide pour le champ ${field.id}`
    }
    return null
  }

  // Checkbox — booléen seul, ou multi-sélection (tableau d'options)
  if (field.type === 'checkbox') {
    if (typeof value === 'boolean') return null
    if (Array.isArray(value)) {
      const options = optionValues(field)
      if (options.length > 0 && value.every(v => typeof v === 'string' && options.includes(v))) return null
    }
    return `Champ ${label} invalide`
  }

  // Fichiers uploadés (image/video/file/barcode/qr/signature) — la valeur
  // est l'URL du fichier déjà mis en ligne par la plateforme cliente
  if (typeof value === 'string') {
    if (!URL_RE.test(value)) return `Champ ${label} : URL invalide`
    return null
  }

  return null
}

function validateReturnFormAnswers(form: ReturnForm, answers: Record<string, unknown>): string | null {
  for (const section of form.sections ?? []) {
    for (const field of section.fields ?? []) {
      const error = validateAnswer(field, answers[field.id])
      if (error) return error
    }
  }
  return null
}

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

  const customerName     = str(ans.customer_name)
  const customerEmail    = str(ans.customer_email).toLowerCase()
  const customerPhone    = str(ans.customer_phone) || null
  const productName      = str(ans.product_name)
  const reason           = str(ans.reason)
  const desiredResolution = str(ans.desired_resolution).toUpperCase() as 'EXCHANGE' | 'REFUND' | 'REPAIR'
  const description      = str(ans.description)

  const orderDateRaw = ans.order_date ? new Date(String(ans.order_date)) : null
  const orderDate    = orderDateRaw && !isNaN(orderDateRaw.getTime()) ? orderDateRaw : null
  const daysToReturn = orderDate
    ? Math.max(0, Math.floor((Date.now() - orderDate.getTime()) / 86_400_000))
    : 0

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
  if (!policyCheck.ok) {
    return NextResponse.json(
      { error: policyCheck.message, code: policyCheck.code, ...policyCheck.extra },
      { status: 422 },
    )
  }

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
  const customerAge      = numOrNull(ans.customer_age)
  const customerWilaya   = strOrNull(ans.customer_wilaya) ?? 'Unknown'
  const productCategory  = strOrNull(ans.product_category)

  const mlPayload = buildMLPayload({
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
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: 'Une demande de retour existe déjà pour cette commande.' },
      { status: 409 },
    )
  }

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
