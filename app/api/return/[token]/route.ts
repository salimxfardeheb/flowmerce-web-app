// src/app/api/return/[token]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/rate-limit'
import { validateApiKey } from '@/lib/api-key-auth'

// ─────────────────────────────────────────────────────────────
// Constantes : motifs en français → mapping risque + ClaimType
// ─────────────────────────────────────────────────────────────
const REASON_RISK: Record<string, number> = {
  'Produit défectueux':           15,
  'Produit contrefait':           60,
  'Produit endommagé livraison':  20,
  "Changement d'avis":            70,
  'Panne après utilisation':      25,
  'Mauvaise taille':              40,
  'Allergie/Réaction':            30,
  'Ne correspond pas':            40,
  'Erreur de commande vendeur':   20,
  'Pièces manquantes':            25,
}

const TYPE_MAP: Record<string, 'EXCHANGE' | 'REFUND' | 'REPAIR'> = {
  'Produit défectueux':           'REPAIR',
  'Panne après utilisation':      'REPAIR',
  'Ne correspond pas':            'EXCHANGE',
  'Mauvaise taille':              'EXCHANGE',
  'Erreur de commande vendeur':   'EXCHANGE',
  "Changement d'avis":            'REFUND',
}

const HTML_RE  = /<[^>]*>/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/


function computeFraudScore(reason: string, description: string): number {
  let score = REASON_RISK[reason] ?? 50
  const len = description.trim().length
  if (len < 20) score += 15
  if (len < 10) score += 15
  return Math.min(100, score)
}

// ─────────────────────────────────────────────────────────────
// POST /api/return/[token]
// Endpoint consommé uniquement par la page hébergée /return/[token]
// (même origine → pas de CORS ouvert).
// ─────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // ── 1. Valider la clé API ────────────────────────────────────
  const auth = await validateApiKey(token)
  if (!auth.ok) return auth.response
  const { keyRecord } = auth

  // ── 2. Lire les paramètres uniquement depuis le body JSON ───
  //     (les query params sont ignorés : pas de PII dans l'URL)
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 })
  }

  const str = (k: string) => String(body[k] ?? '').trim()
  const num = (k: string) => {
    const n = Number(body[k])
    return Number.isFinite(n) && n > 0 ? n : null
  }

  const customerName    = str('customer_name')
  const customerEmail   = str('customer_email').toLowerCase()
  const customerPhone   = str('customer_telephone')
  const productName     = str('product_name')
  const orderId         = str('order_id')
  const orderAddress    = str('order_address')
  const shopName        = str('shop_name')
  const orderDateRaw    = str('order_date')
  const reason          = str('reason')
  const description     = str('description')
  const productPrice    = num('product_price')
  const productQuantity = num('product_quantity') ?? 1
  const orderTotal      = num('order_total')

  // ── 3. Validation stricte ───────────────────────────────────
  if (!customerEmail || !orderId || !productName || !reason) {
    return NextResponse.json(
      { error: 'Champs requis : customer_email, order_id, product_name, reason' },
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
  if (!REASON_RISK[reason]) {
    return NextResponse.json({ error: 'Motif de retour non reconnu' }, { status: 400 })
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

  // ── 6. Création du claim (unicité + création atomiques) ──────
  const claimType   = TYPE_MAP[reason] ?? 'REFUND'
  const fraudScore  = computeFraudScore(reason, description)
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
        where:  { vendorId: keyRecord.vendorId, orderId },
        select: { id: true },
      })
      if (dup) {
        const e = new Error('DUPLICATE_CLAIM')
        ;(e as any).code = 'DUPLICATE_CLAIM'
        throw e
      }
      return tx.claim.create({
        data: {
          vendorId:      keyRecord.vendorId,
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
            shopName:      shopName || null,
            customerPhone: customerPhone || null,
            productPrice,
            productQuantity,
            orderTotal,
            orderAddress:  orderAddress || null,
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

  await prisma.apiKey.update({
    where: { id: keyRecord.id },
    data:  { lastUsedAt: new Date() },
  }).catch(() => null)

  console.log(JSON.stringify({
    event:     'return_submitted',
    claimId:   claim.id,
    vendorId:  keyRecord.vendorId,
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
