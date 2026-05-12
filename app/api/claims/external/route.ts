// app/api/claims/external/route.ts — Flowmerce
//
// POST : soumettre un claim (existant, inchangé)
// GET  : lister les claims du vendeur authentifié via clé API (NOUVEAU)
//
// GET /api/claims/external
// Authorization: Bearer <api_key>
// Query params (optionnels):
//   ?status=PENDING|APPROVED|REJECTED|IN_PROGRESS
//   ?limit=50     (défaut: 50, max: 200)
//   ?offset=0

import { NextRequest, NextResponse }   from 'next/server'
import { Prisma }                       from '@prisma/client'
import { prisma }                       from '@/lib/prisma'
import { validateApiKey }               from '@/lib/api-key-auth'
import { evaluateFraud, recomputeNetworkSignals } from '@/lib/fraud-score'
import { checkReturnPolicy }            from '@/lib/services/return-policy'
import { EXTERNAL_RETURN_REASONS, AI_DECISIONS, type AIDecision } from '@/lib/constants'
import { callMLPredict } from '@/lib/services/ml'
import { log }           from '@/lib/logger'

// ── GET — liste les claims du vendeur (auth par clé API) ──────────────────

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

// ── POST — soumettre un claim (identique à l'original, inchangé) ──────────

function reasonToClaimType(reason: string): 'EXCHANGE' | 'REFUND' | 'REPAIR' {
  if (reason === 'DEFECTIVE')  return 'REPAIR'
  if (reason === 'WRONG_ITEM') return 'EXCHANGE'
  return 'REFUND'
}

const DECISION_MAP: Record<string, AIDecision> = Object.fromEntries(AI_DECISIONS.map((d) => [d, d]))
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

  const required = [
    'customer_name', 'customer_email', 'product_name', 'order_id',
    'reason', 'description', 'external_return_id', 'external_source',
  ]
  for (const field of required) {
    if (!body[field] || String(body[field]).trim() === '')
      return NextResponse.json({ error: `Champ requis manquant : ${field}` }, { status: 400 })
  }
  if (!(EXTERNAL_RETURN_REASONS as readonly string[]).includes(String(body.reason)))
    return NextResponse.json({ error: 'Raison invalide' }, { status: 400 })
  if (!EMAIL_RE.test(String(body.customer_email)))
    return NextResponse.json({ error: 'Email invalide' }, { status: 400 })

  const customerEmail    = String(body.customer_email).toLowerCase()
  const customerPhone    = body.customer_phone    ? String(body.customer_phone)    : null
  const productCategory  = body.product_category  ? String(body.product_category)  : undefined
  const customerGender   = body.customer_gender   ? String(body.customer_gender)   : null
  const customerAge      = typeof body.customer_age === 'number' ? body.customer_age : null
  const customerWilaya   = body.customer_wilaya   ? String(body.customer_wilaya)   : null
  const paymentMethod    = body.payment_method    ? String(body.payment_method)    : null
  const shippingMethod   = body.shipping_method   ? String(body.shipping_method)   : null
  const shippingCost     = typeof body.shipping_cost === 'number' ? body.shipping_cost : null
  const daysToReturn    = (() => {
    const raw = body.order_date ? new Date(String(body.order_date)) : null
    if (raw && !isNaN(raw.getTime()))
      return Math.max(0, Math.floor((Date.now() - raw.getTime()) / 86_400_000))
    return typeof body.days_to_return === 'number' ? body.days_to_return : 0
  })()
  const fraudScore = typeof body.fraud_score === 'number' ? body.fraud_score : 0

  const returnPolicy = await prisma.returnPolicy.findUnique({ where: { vendorId: vendor.id } })

  const policyCheck = checkReturnPolicy(returnPolicy, {
    daysToReturn, productCategory, claimType: reasonToClaimType(String(body.reason)),
  })
  if (!policyCheck.ok) {
    return NextResponse.json(
      { error: policyCheck.message, code: policyCheck.code, ...policyCheck.extra },
      { status: 422 },
    )
  }
  const { forceExchange } = policyCheck

  const existing = await prisma.claim.findFirst({
    where: {
      vendorId:   vendor.id,
      prediction: { path: ['externalReturnId'], equals: String(body.external_return_id) },
    },
  })
  if (existing) {
    return NextResponse.json({
      claim: { id: existing.id, status: existing.status, createdAt: existing.createdAt },
    })
  }

  const { record: fraudRecord, score, totalClaims, isFraudAlert, fraudSignalMessage } =
    await evaluateFraud(customerEmail, customerPhone, {
      scoreThreshold:  returnPolicy?.fraudScoreThreshold  ?? 70,
      returnThreshold: returnPolicy?.fraudReturnThreshold ?? 4,
    })

  let aiDecision = body.ai_decision ? DECISION_MAP[String(body.ai_decision)] ?? null : null
  if (forceExchange && aiDecision === 'Refund') aiDecision = 'Exchange'

  const claimType   = forceExchange ? 'EXCHANGE' : reasonToClaimType(String(body.reason))
  const description = String(body.description).trim().length >= 10
    ? String(body.description).trim()
    : `Retour ${body.external_source || 'externe'} : ${String(body.product_name)}. Raison : ${String(body.reason)}.`

  const predictionData = {
    externalReturnId: String(body.external_return_id),
    externalSource:   String(body.external_source),
    webhookUrl:       body.webhook_url    ? String(body.webhook_url)    : null,
    webhookSecret:    body.webhook_secret ? String(body.webhook_secret) : null,
    customerPhone,
    fraudScore,
    fraudAlert:        isFraudAlert,
    fraudSignal:       fraudSignalMessage,
    totalClientClaims: totalClaims,
    productCategory:   productCategory ?? null,
    forceExchange,
    aiDecision,
    aiConfidence:    typeof body.ai_confidence === 'number' ? body.ai_confidence : null,
    probabilities:   body.ai_probabilities ?? null,
    orderDate:       body.order_date  ? String(body.order_date)  : null,
    orderTotal:      typeof body.order_total === 'number' ? body.order_total : null,
    receivedAt:      new Date().toISOString(),
  } satisfies Prisma.InputJsonObject

  const claim = await prisma.$transaction(async (tx) => {
    const created = await tx.claim.create({
      data: {
        vendorId:      vendor.id,
        apiKeyId:      keyRecord.id,
        customerName:  String(body.customer_name),
        customerEmail,
        productName:   String(body.product_name),
        orderId:       String(body.order_id),
        type:          claimType,
        status:        'PENDING',
        source:        'API',
        description,
        fraudScore:    score,
        aiDecision,
        prediction:    predictionData,
      },
    })
    await tx.customerFraudRecord.update({
      where: { id: fraudRecord.id },
      data:  { totalClaims: { increment: 1 }, lastClaimAt: new Date() },
    })
    return created
  })

  // Recompute distinctVendors hors transaction (best-effort)
  recomputeNetworkSignals(customerEmail, customerPhone)
    .catch((e) => log.error('claims_external.recompute_network_error', { err: String(e) }))

  // ── 8. Prédiction ML (best-effort, uniquement si pas de décision fournie) ─
  if (!aiDecision) {
    const mlInput = {
      Customer_Gender:         customerGender   ?? 'Unknown',
      Customer_Age:            customerAge      ?? 0,
      Customer_Wilaya:         customerWilaya   ?? 'Unknown',
      Customer_Past_Returns:   totalClaims,
      Shop_Name:               vendor.companyName,
      Product_Category:        productCategory  ?? 'Unknown',
      Product_Price_DA:        typeof body.order_total === 'number' ? body.order_total : 1,
      Order_Quantity:          1,
      Total_Amount_DA:         typeof body.order_total === 'number' ? body.order_total : 1,
      Payment_Method:          paymentMethod    ?? 'Unknown',
      Shipping_Method:         shippingMethod   ?? 'Standard',
      Shipping_Cost_DA:        shippingCost     ?? 0,
      Return_Reason:           String(body.reason),
      Days_to_Return:          daysToReturn,
      Shop_Return_Window_Days: returnPolicy?.maxClaimDays ?? 30,
      Within_Return_Policy:    1 as const,
      Fraud_Score:             score,
      Customer_Satisfaction:   3,
      Is_Suspicious:           isFraudAlert ? 1 as const : 0 as const,
    }

    const mlResult = await callMLPredict(mlInput)
    if (mlResult.ok) {
      const resolution   = mlResult.prediction.resolution?.prediction ?? null
      const confidence   = resolution
        ? (mlResult.prediction.resolution.probabilities?.[resolution] ?? null)
        : null

      await prisma.claim.update({
        where: { id: claim.id },
        data: {
          aiDecision: resolution as AIDecision | null,
          aiScore:    confidence,
          mlFailed:   false,
          mlAttempts: { increment: 1 },
          prediction: { ...predictionData, aiDecision: resolution, aiConfidence: confidence },
        },
      }).catch((e) => log.error('claims_external.ml_update_error', { err: String(e) }))
    } else {
      log.warn('claims_external.ml_unreachable', {
        error:    mlResult.error,
        timedOut: mlResult.timedOut,
        attempts: mlResult.attempts,
      })
      await prisma.claim.update({
        where: { id: claim.id },
        data:  { mlFailed: true, mlAttempts: { increment: mlResult.attempts } },
      }).catch((e) => log.error('claims_external.ml_failure_flag_error', { err: String(e) }))
    }
  }

  log.info('claims_external.created', {
    claimId: claim.id, vendorId: vendor.id, isFraudAlert, forceExchange,
  })

  return NextResponse.json(
    {
      claim:          { id: claim.id, status: claim.status, createdAt: claim.createdAt },
      policy_applied: {
        force_exchange:  forceExchange,
        fraud_alert:     isFraudAlert,
        fraud_signal:    fraudSignalMessage,
        processing_days: returnPolicy?.processingDays ?? 5,
      },
    },
    { status: 201 },
  )
}