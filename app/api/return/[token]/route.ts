// app/api/return/[token]/route.ts
// Endpoint consommé uniquement par la page hébergée /return/[token]
import { NextRequest, NextResponse }   from 'next/server'
import { Prisma }                       from '@prisma/client'
import { prisma }                       from '@/lib/prisma'
import { checkRateLimit }               from '@/lib/rate-limit'
import { findOrCreateFraudRecord, computeFraudScore, recomputeNetworkSignals } from '@/lib/fraud-score'
import { callMLPredict }                from '@/lib/services/ml'
import { checkReturnPolicy }            from '@/lib/services/return-policy'
import { RETURN_REASONS, CLAIM_TYPES }  from '@/lib/constants'
import { log }                          from '@/lib/logger'

// ─────────────────────────────────────────────────────────────
const VALID_REASONS     = new Set<string>(RETURN_REASONS)
const VALID_RESOLUTIONS = new Set<string>(CLAIM_TYPES)
const HTML_RE  = /<[^>]*>/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ─────────────────────────────────────────────────────────────
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

  const str    = (k: string) => String(body[k] ?? '').trim()
  const numPos = (k: string) => { const n = Number(body[k]); return Number.isFinite(n) && n > 0  ? n : null }
  const numGe0 = (k: string) => { const n = Number(body[k]); return Number.isFinite(n) && n >= 0 ? n : null }
  const intPos = (k: string) => { const n = parseInt(String(body[k]), 10); return Number.isFinite(n) && n > 0 ? n : null }

  const customerName    = session.customerName  || str('customer_name')
  const customerEmail   = (session.customerEmail || str('customer_email')).toLowerCase()
  const customerPhone   = session.customerPhone  || str('customer_telephone')
  const productName     = session.productName    || str('product_name')
  const orderId         = session.orderId        || str('order_id')
  const shopName        = session.shopName       || str('shop_name')
  const orderDateRaw    = session.orderDate      || str('order_date')
  const reason            = str('reason')
  const desiredResolution = str('desired_resolution').toUpperCase()
  const description       = str('description')
  const customerGender  = str('customer_gender')  || 'Unknown'
  const customerAge     = intPos('customer_age')   ?? 30
  const customerWilaya  = str('customer_wilaya')   || 'Alger'
  const productCategory = str('product_category')
  const orderAddress    = str('order_address')
  const productPrice    = session.productPrice    ?? numPos('product_price')
  const productQuantity = session.productQuantity ?? intPos('order_quantity') ?? intPos('product_quantity') ?? 1
  const orderTotal      = session.orderTotal      ?? numPos('order_total')
  const paymentMethod   = str('payment_method')  || 'Unknown'
  const shippingMethod  = str('shipping_method') || 'Standard'
  const shippingCost    = numGe0('shipping_cost') ?? 0

  // ── 3. Validation ────────────────────────────────────────────────────────
  if (!customerEmail || !orderId || !productName || !reason || !desiredResolution)
    return NextResponse.json({ error: 'Champs requis : customer_email, order_id, product_name, reason, desired_resolution' }, { status: 400 })
  if (!EMAIL_RE.test(customerEmail) || customerEmail.length > 254)
    return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
  if (customerName.length > 200 || productName.length > 500 || orderId.length > 200)
    return NextResponse.json({ error: 'Champ trop long' }, { status: 400 })
  if (description.length > 2000)
    return NextResponse.json({ error: 'Description trop longue (max 2000 caractères)' }, { status: 400 })
  if (HTML_RE.test(customerName) || HTML_RE.test(productName) || HTML_RE.test(description) || HTML_RE.test(shopName) || HTML_RE.test(orderAddress))
    return NextResponse.json({ error: 'Contenu HTML non autorisé' }, { status: 400 })
  if (!VALID_REASONS.has(reason))
    return NextResponse.json({ error: 'Motif de retour non reconnu' }, { status: 400 })
  if (!VALID_RESOLUTIONS.has(desiredResolution))
    return NextResponse.json({ error: 'Résolution invalide (EXCHANGE, REFUND ou REPAIR)' }, { status: 400 })

  const acceptedTypes = apiKey.vendor.returnPolicy?.acceptedTypes ?? ['EXCHANGE', 'REFUND', 'REPAIR']
  if (acceptedTypes.length > 0 && !acceptedTypes.includes(desiredResolution as 'EXCHANGE' | 'REFUND' | 'REPAIR'))
    return NextResponse.json({ error: "Cette résolution n'est pas acceptée par ce vendeur" }, { status: 400 })

  // ── 4. Fenêtre de retour ─────────────────────────────────────────────────
  const parsedOrderDate   = orderDateRaw ? new Date(orderDateRaw) : null
  const orderDate         = parsedOrderDate && !isNaN(parsedOrderDate.getTime()) ? parsedOrderDate : null
  const returnWindowDays  = apiKey.vendor.returnPolicy?.maxClaimDays ?? 14
  const daysSinceOrder    = orderDate
    ? Math.max(0, Math.floor((Date.now() - orderDate.getTime()) / 86_400_000))
    : 0

  const policyCheck = checkReturnPolicy(apiKey.vendor.returnPolicy, {
    daysToReturn: daysSinceOrder,
  })
  if (!policyCheck.ok) {
    return NextResponse.json(
      { error: policyCheck.message, code: policyCheck.code, ...policyCheck.extra },
      { status: 422 },
    )
  }

  // ── 5. Rate limit ────────────────────────────────────────────────────────
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          ?? req.headers.get('x-real-ip')
          ?? 'unknown'

  const allowed = await checkRateLimit(`${ip}:${orderId}`)
  if (!allowed)
    return NextResponse.json({ error: 'Trop de tentatives pour cette commande. Réessayez dans 1 heure.' }, { status: 429 })

  // ── 6. Fraude + création du claim ────────────────────────────────────────
  const claimType   = desiredResolution as 'EXCHANGE' | 'REFUND' | 'REPAIR'
  const { record: fraudRecord } = await findOrCreateFraudRecord(customerEmail, customerPhone || undefined)
  const fraudScore  = computeFraudScore(fraudRecord)
  const pastReturns = fraudRecord.totalClaims

  const fullDescription = [
    productName,
    `Motif : ${reason}`,
    description ? `Détails : ${description}` : null,
  ].filter(Boolean).join(' — ')

  let claim
  try {
    claim = await prisma.$transaction(async (tx) => {
      const dup = await tx.claim.findFirst({
        where: { vendorId: apiKey.vendorId, orderId },
        select: { id: true },
      })
      if (dup) throw Object.assign(new Error('DUPLICATE_CLAIM'), { code: 'DUPLICATE_CLAIM' })

      const created = await tx.claim.create({
        data: {
          vendorId:      apiKey.vendorId,
          orderId,
          customerName:  customerName || customerEmail,
          customerEmail,
          customerPhone: customerPhone || null,
          type:          claimType,
          description:   fullDescription,
          status:        'PENDING',
          source:        'HOSTED_PAGE',
          productName,
          orderDate,
          ipAddress:     ip,
          fraudScore,
          prediction: {
            shopName:        shopName        || null,
            customerPhone:   customerPhone   || null,
            customerGender, customerAge, customerWilaya,
            productCategory: productCategory || null,
            productPrice, productQuantity, orderTotal,
            paymentMethod, shippingMethod, shippingCost,
            orderAddress:    orderAddress    || null,
          },
        },
      })

      await tx.customerFraudRecord.update({
        where: { id: fraudRecord.id },
        data:  { totalClaims: { increment: 1 }, lastClaimAt: new Date() },
      })

      return created
    })

    // Recompute distinctVendors hors transaction (best-effort)
    recomputeNetworkSignals(customerEmail, customerPhone || undefined)
      .catch((e) => log.error('return.recompute_network_error', { err: String(e) }))
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code
    if (code === 'DUPLICATE_CLAIM' || code === 'P2002')
      return NextResponse.json({ error: 'Une demande de retour existe déjà pour cette commande.' }, { status: 409 })
    throw err
  }

  // ── 8. Prédiction ML (best-effort) ───────────────────────────────────────
  const mlInput = {
    Customer_Gender:         customerGender,
    Customer_Age:            customerAge,
    Customer_Wilaya:         customerWilaya,
    Customer_Past_Returns:   pastReturns,
    Shop_Name:               shopName || apiKey.vendor.companyName,
    Product_Category:        productCategory || apiKey.vendor.vendorCategories?.[0] || 'Unknown',
    Product_Price_DA:        productPrice ?? 1,
    Order_Quantity:          productQuantity,
    Total_Amount_DA:         orderTotal ?? productPrice ?? 1,
    Payment_Method:          paymentMethod,
    Shipping_Method:         shippingMethod,
    Shipping_Cost_DA:        shippingCost,
    Return_Reason:           reason,
    Days_to_Return:          daysSinceOrder,
    Shop_Return_Window_Days: returnWindowDays,
    Within_Return_Policy:    1 as const,
    Fraud_Score:             fraudScore,
    Customer_Satisfaction:   3,
    Is_Suspicious:           pastReturns >= (apiKey.vendor.returnPolicy?.fraudReturnThreshold ?? 4) ? 1 as const : 0 as const,
  }

  const mlResult = await callMLPredict(mlInput)
  if (mlResult.ok) {
    const { prediction: mlPrediction } = mlResult
    const resolution  = mlPrediction.resolution?.prediction ?? null
    const confidence  = resolution
      ? (mlPrediction.resolution.probabilities?.[resolution] ?? null)
      : null

    await prisma.claim.update({
      where: { id: claim.id },
      data: {
        aiDecision: resolution,
        aiScore:    confidence,
        mlFailed:   false,
        mlAttempts: { increment: 1 },
        prediction: {
          shopName: shopName || null, customerPhone: customerPhone || null,
          customerGender, customerAge, customerWilaya,
          productCategory: productCategory || null,
          productPrice, productQuantity, orderTotal,
          paymentMethod, shippingMethod, shippingCost,
          orderAddress: orderAddress || null,
          ...(mlPrediction as unknown as Prisma.InputJsonObject),
        },
      },
    }).catch((e) => log.error('return.ml_claim_update_error', { err: String(e) }))
  } else {
    log.warn('return.ml_unreachable', {
      error:    mlResult.error,
      timedOut: mlResult.timedOut,
      attempts: mlResult.attempts,
    })
    await prisma.claim.update({
      where: { id: claim.id },
      data:  { mlFailed: true, mlAttempts: { increment: mlResult.attempts } },
    }).catch((e) => log.error('return.ml_failure_flag_error', { err: String(e) }))
  }

  // ── 9. Marquer session utilisée + mettre à jour clé API ──────────────────
  await Promise.all([
    prisma.returnSession.update({ where: { token }, data: { usedAt: new Date() } }).catch(() => null),
    prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => null),
  ])

  log.info('return_submitted', {
    claimId: claim.id, vendorId: apiKey.vendorId,
    orderId, reason, fraudScore, source: 'HOSTED_PAGE', ip,
  })

  return NextResponse.json(
    { success: true, claimId: claim.id, message: 'Réclamation créée avec succès' },
    { status: 201 },
  )
}
