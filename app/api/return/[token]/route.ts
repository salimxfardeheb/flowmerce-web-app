// src/app/api/return/[token]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/rate-limit'
import { findOrCreateFraudRecord, computeFraudScore } from '@/lib/fraud-score'

// ─────────────────────────────────────────────────────────────
// Motifs valides → ClaimType
// ─────────────────────────────────────────────────────────────
const VALID_REASONS = new Set([
  'Produit défectueux',
  'Produit contrefait',
  'Produit endommagé livraison',
  "Changement d'avis",
  'Panne après utilisation',
  'Mauvaise taille',
  'Allergie/Réaction',
  'Ne correspond pas',
  'Erreur de commande vendeur',
  'Pièces manquantes',
])

const VALID_RESOLUTIONS = new Set(['EXCHANGE', 'REFUND', 'REPAIR'])

const HTML_RE  = /<[^>]*>/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ─────────────────────────────────────────────────────────────
// POST /api/return/[token]
// Endpoint consommé uniquement par la page hébergée /return/[token]
// ─────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // ── 1. Valider la session ────────────────────────────────────
  const session = await prisma.returnSession.findUnique({
    where:   { token },
    include: { vendor: { include: { vendor: { include: { returnPolicy: true } } } } },
  }).catch(() => null)

  if (!session) {
    return NextResponse.json({ error: 'Lien de retour introuvable.' }, { status: 401 })
  }
  if (session.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Ce lien de retour a expiré.' }, { status: 401 })
  }
  if (session.usedAt) {
    return NextResponse.json({ error: 'Ce lien de retour a déjà été utilisé.' }, { status: 409 })
  }

  const apiKey = session.vendor
  if (!apiKey.isActive || apiKey.vendor.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Clé API invalide ou compte non approuvé.' }, { status: 403 })
  }

  // ── 2. Lire les paramètres depuis le body JSON ───────────────
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 })
  }

  const str    = (k: string) => String(body[k] ?? '').trim()
  const numPos = (k: string) => { const n = Number(body[k]); return Number.isFinite(n) && n > 0  ? n : null }
  const numGe0 = (k: string) => { const n = Number(body[k]); return Number.isFinite(n) && n >= 0 ? n : null }
  const intPos = (k: string) => { const n = parseInt(String(body[k]), 10); return Number.isFinite(n) && n > 0 ? n : null }

  // Customer & order data come from the session (trusted source)
  const customerName    = session.customerName  || str('customer_name')
  const customerEmail   = (session.customerEmail || str('customer_email')).toLowerCase()
  const customerPhone   = session.customerPhone  || str('customer_telephone')
  const productName     = session.productName    || str('product_name')
  const orderId         = session.orderId        || str('order_id')
  const shopName        = session.shopName       || str('shop_name')
  const orderDateRaw    = session.orderDate      || str('order_date')

  // ML-enrichment fields (optional, provided by client)
  const customerGender  = str('customer_gender')  || 'Unknown'
  const customerAge     = intPos('customer_age')   ?? 30
  const customerWilaya  = str('customer_wilaya')   || 'Alger'
  const productCategory = str('product_category')
  const orderAddress    = str('order_address')
  const reason            = str('reason')
  const desiredResolution = str('desired_resolution').toUpperCase()
  const description       = str('description')
  const productPrice    = numPos('product_price')
  const productQuantity = intPos('order_quantity') ?? numPos('product_quantity') ?? 1
  const orderTotal      = numPos('order_total')
  const paymentMethod   = str('payment_method')  || 'Unknown'
  const shippingMethod  = str('shipping_method') || 'Standard'
  const shippingCost    = numGe0('shipping_cost') ?? 0

  // ── 3. Validation stricte ───────────────────────────────────
  if (!customerEmail || !orderId || !productName || !reason || !desiredResolution) {
    return NextResponse.json(
      { error: 'Champs requis : customer_email, order_id, product_name, reason, desired_resolution' },
      { status: 400 }
    )
  }
  if (!EMAIL_RE.test(customerEmail) || customerEmail.length > 254) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
  }
  if (customerName.length > 200 || productName.length > 500 || orderId.length > 200) {
    return NextResponse.json({ error: 'Champ trop long' }, { status: 400 })
  }
  if (description.length > 2000) {
    return NextResponse.json({ error: 'Description trop longue (max 2000 caractères)' }, { status: 400 })
  }
  if (
    HTML_RE.test(customerName) ||
    HTML_RE.test(productName)  ||
    HTML_RE.test(description)  ||
    HTML_RE.test(shopName)     ||
    HTML_RE.test(orderAddress)
  ) {
    return NextResponse.json({ error: 'Contenu HTML non autorisé' }, { status: 400 })
  }
  if (!VALID_REASONS.has(reason)) {
    return NextResponse.json({ error: 'Motif de retour non reconnu' }, { status: 400 })
  }
  if (!VALID_RESOLUTIONS.has(desiredResolution)) {
    return NextResponse.json({ error: 'Résolution invalide (EXCHANGE, REFUND ou REPAIR)' }, { status: 400 })
  }
  const acceptedTypes = apiKey.vendor.returnPolicy?.acceptedTypes ?? ['EXCHANGE', 'REFUND', 'REPAIR']
  if (acceptedTypes.length > 0 && !acceptedTypes.includes(desiredResolution as any)) {
    return NextResponse.json({ error: "Cette résolution n'est pas acceptée par ce vendeur" }, { status: 400 })
  }

  // ── 4. Rate limit (3/h par IP+orderId) ──────────────────────
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          ?? req.headers.get('x-real-ip')
          ?? 'unknown'

  const allowed = await checkRateLimit(orderId, ip)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Trop de tentatives pour cette commande. Réessayez dans 1 heure.' },
      { status: 429 }
    )
  }

  // ── 5. Création du claim ─────────────────────────────────────
  const claimType = desiredResolution as 'EXCHANGE' | 'REFUND' | 'REPAIR'
  const { record: fraudRecord } = await findOrCreateFraudRecord(customerEmail, customerPhone || undefined)
  const fraudScore = computeFraudScore(fraudRecord)
  const parsedDate  = orderDateRaw ? new Date(orderDateRaw) : null
  const orderDate   = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : null

  const fullDescription = [
    productName,
    `Motif : ${reason}`,
    description ? `Détails : ${description}` : null,
  ].filter(Boolean).join(' — ')

  let claim
  try {
    claim = await prisma.$transaction(async (tx) => {
      const dup = await tx.claim.findFirst({
        where:  { vendorId: apiKey.vendorId, orderId },
        select: { id: true },
      })
      if (dup) {
        const e = new Error('DUPLICATE_CLAIM')
        ;(e as any).code = 'DUPLICATE_CLAIM'
        throw e
      }
      return tx.claim.create({
        data: {
          vendorId:      apiKey.vendorId,
          orderId,
          customerName:  customerName || customerEmail,
          customerEmail,
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
            customerGender,
            customerAge,
            customerWilaya,
            productCategory: productCategory || null,
            productPrice,
            productQuantity,
            orderTotal,
            paymentMethod,
            shippingMethod,
            shippingCost,
            orderAddress:    orderAddress    || null,
          },
        },
      })
    })
  } catch (err: any) {
    if (err?.code === 'DUPLICATE_CLAIM' || err?.code === 'P2002') {
      return NextResponse.json(
        { error: 'Une demande de retour existe déjà pour cette commande.' },
        { status: 409 }
      )
    }
    throw err
  }

  // ── 5b. Incrémenter le compteur cross-boutique (best-effort) ────
  findOrCreateFraudRecord(customerEmail, customerPhone || undefined)
    .then(({ record }) =>
      prisma.customerFraudRecord.update({
        where: { id: record.id },
        data: { totalClaims: { increment: 1 }, lastClaimAt: new Date() },
      })
    )
    .catch((e) => console.error('[return] fraud record update error:', e))

  // ── 6. Appel ML pour prédiction automatique ─────────────────
  const mlApiUrl             = process.env.ML_API_URL ?? 'http://localhost:8000'
  const returnWindowDays     = apiKey.vendor.returnPolicy?.maxClaimDays ?? 14
  const fraudReturnThreshold = (apiKey.vendor.returnPolicy as any)?.fraudReturnThreshold ?? 4
  const daysToReturn = orderDate
    ? Math.max(0, Math.floor((Date.now() - orderDate.getTime()) / 86_400_000))
    : 0
  const pastReturns = fraudRecord.totalClaims

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
    Days_to_Return:          daysToReturn,
    Shop_Return_Window_Days: returnWindowDays,
    Within_Return_Policy:    daysToReturn <= returnWindowDays ? 1 : 0,
    Fraud_Score:             fraudScore,
    Customer_Satisfaction:   3,
    Is_Suspicious:           pastReturns >= fraudReturnThreshold ? 1 : 0,
  }

  const mlController = new AbortController()
  const mlTimeoutId  = setTimeout(() => mlController.abort(), 8_000)

  try {
    const mlRes = await fetch(`${mlApiUrl}/predict`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.ML_INTERNAL_SECRET
          ? { 'X-Internal-Key': process.env.ML_INTERNAL_SECRET }
          : {}),
      },
      body:    JSON.stringify(mlInput),
      signal:  mlController.signal,
    })
    clearTimeout(mlTimeoutId)

    if (mlRes.ok) {
      const mlPrediction = await mlRes.json()
      const resolution   = mlPrediction?.resolution?.prediction ?? null
      const confidence   = resolution
        ? (mlPrediction?.resolution?.probabilities?.[resolution] ?? null)
        : null

      await prisma.claim.update({
        where: { id: claim.id },
        data: {
          aiDecision: resolution,
          aiScore:    confidence,
          prediction: {
            shopName:        shopName        || null,
            customerPhone:   customerPhone   || null,
            customerGender,
            customerAge,
            customerWilaya,
            productCategory: productCategory || null,
            productPrice,
            productQuantity,
            orderTotal,
            paymentMethod,
            shippingMethod,
            shippingCost,
            orderAddress:    orderAddress    || null,
            ...mlPrediction,
          },
        },
      }).catch(e => console.error('[return] ML claim update error:', e))
    }
  } catch (err: any) {
    clearTimeout(mlTimeoutId)
    console.warn('[return] ML server unreachable:', err?.code ?? err?.message)
  }

  // ── 7. Marquer la session comme utilisée ─────────────────────
  await prisma.returnSession.update({
    where: { token },
    data:  { usedAt: new Date() },
  }).catch(() => null)

  // ── 8. Mettre à jour lastUsedAt de la clé API ─────────────────
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data:  { lastUsedAt: new Date() },
  }).catch(() => null)

  console.log(JSON.stringify({
    event:     'return_submitted',
    claimId:   claim.id,
    vendorId:  apiKey.vendorId,
    orderId,
    reason,
    fraudScore,
    source:    'HOSTED_PAGE',
    ip,
    timestamp: new Date().toISOString(),
  }))

  return NextResponse.json(
    { success: true, claimId: claim.id, message: 'Réclamation créée avec succès' },
    { status: 201 }
  )
}
