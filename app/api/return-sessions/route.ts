// app/api/return-sessions/route.ts — Flowmerce
//
// Crée une session de retour pré-remplie et retourne un token + URL hébergée.
// Tout partenaire e-commerce peut appeler cet endpoint avec sa clé API vendeur
// pour générer le lien à afficher au client sur une commande livrée.
//
// POST /api/return-sessions
// Authorization: Bearer <api_key>
//
// Body:
// {
//   "order_id":       "CMD-123",          // obligatoire
//   "customer_email": "client@ex.com",    // obligatoire
//   "customer_name":  "Ahmed Benali",     // obligatoire
//   "product_name":   "Nike Air Max",     // obligatoire
//   "customer_phone": "0555123456",       // optionnel
//   "customer_id":     "CUST-1024",        // optionnel  id client côté boutique
//   "customer_wilaya": "Alger",            // optionnel  pré-remplit le formulaire
//   "payment_method":  "Cash on Delivery", // optionnel  pré-remplit le formulaire
//   "shipping_method": "Livraison à domicile", // optionnel  pré-remplit le formulaire
//   "shipping_cost":   500,                // optionnel  DA, pré-remplit le formulaire
//   "order_date":     "2026-04-15",       // optionnel  ISO-8601
//   "shop_name":      "Ma Boutique",      // optionnel
//   "expires_in":     72                  // optionnel  heures (défaut : 72)
// }
//
// Les champs pré-remplis ne sont plus demandés au client sur la page hébergée :
// ils sont affichés en récapitulatif et font foi à la soumission.
//
// Réponse 201:
// {
//   "token":      "ret_xxxxxxxxxxx",
//   "url":        "https://flowmerce.app/return/ret_xxxxxxxxxxx",
//   "expires_at": "2026-05-07T18:00:00.000Z"
// }

import { NextRequest, NextResponse } from 'next/server'
import { prisma }           from '@/lib/prisma'
import { env }              from '@/lib/env'
import { validateApiKey }   from '@/lib/api-key-auth'
import { PAYMENT_METHODS }  from '@/lib/constants'
import { log }              from '@/lib/logger'
import { randomBytes }      from 'node:crypto'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HTML_RE  = /<[^>]*>/

const BASE_URL = env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '')

function generateToken(): string {
  return 'ret_' + randomBytes(24).toString('base64url')
}

export async function POST(req: NextRequest) {
  // ── 1. Authentification par clé API ────────────────────────────────────
  const rawKey =
    req.headers.get('authorization')?.replace(/^Bearer\s+/, '') ??
    req.headers.get('x-api-key') ??
    null

  const auth = await validateApiKey(rawKey)
  if (!auth.ok) return auth.response

  const { keyRecord } = auth
  const vendor = keyRecord.vendor

  // ── 2. Parse + validation ───────────────────────────────────────────────
  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 }) }

  const str    = (k: string) => String(body[k] ?? '').trim()
  const numPos = (k: string) => { const n = Number(body[k]); return Number.isFinite(n) && n > 0 ? n : null }
  const numGe0 = (k: string) => { const n = Number(body[k]); return body[k] != null && body[k] !== '' && Number.isFinite(n) && n >= 0 ? n : null }
  const intPos = (k: string) => { const n = parseInt(String(body[k]), 10); return Number.isFinite(n) && n > 0 ? n : null }

  const orderId         = str('order_id')
  const customerEmail   = str('customer_email').toLowerCase()
  const customerName    = str('customer_name')
  const productName     = str('product_name')
  const customerPhone   = str('customer_phone')
  const customerId      = str('customer_id')
  const customerWilaya  = str('customer_wilaya')
  const paymentMethod   = str('payment_method')
  const shippingMethod  = str('shipping_method')
  const shippingCost    = numGe0('shipping_cost')
  const orderDate       = str('order_date')
  const shopName        = str('shop_name') || vendor.companyName
  const productPrice    = numPos('product_price')
  const productQuantity = intPos('product_quantity') ?? intPos('order_quantity')
  const orderTotal      = numPos('order_total')
  const expiresIn       = Math.min(Math.max(Number(body.expires_in) || 72, 1), 720) // 1h–30j

  // Champs obligatoires
  if (!orderId)       return NextResponse.json({ error: 'order_id est obligatoire' },       { status: 400 })
  if (!customerEmail) return NextResponse.json({ error: 'customer_email est obligatoire' }, { status: 400 })
  if (!customerName)  return NextResponse.json({ error: 'customer_name est obligatoire' },  { status: 400 })
  if (!productName)   return NextResponse.json({ error: 'product_name est obligatoire' },   { status: 400 })

  // Validation format
  if (!EMAIL_RE.test(customerEmail) || customerEmail.length > 254)
    return NextResponse.json({ error: 'Format email invalide' }, { status: 400 })
  if (orderId.length > 200 || customerName.length > 200 || productName.length > 500)
    return NextResponse.json({ error: 'Champ trop long' }, { status: 400 })
  if (customerId.length > 100 || customerWilaya.length > 100 || shippingMethod.length > 100)
    return NextResponse.json({ error: 'Champ trop long' }, { status: 400 })
  if (HTML_RE.test(customerName) || HTML_RE.test(productName) || HTML_RE.test(shopName) ||
      HTML_RE.test(customerId)   || HTML_RE.test(customerWilaya) || HTML_RE.test(shippingMethod))
    return NextResponse.json({ error: 'Contenu HTML non autorisé' }, { status: 400 })
  if (paymentMethod && !(PAYMENT_METHODS as readonly string[]).includes(paymentMethod))
    return NextResponse.json(
      { error: `payment_method invalide (valeurs acceptées : ${PAYMENT_METHODS.join(', ')})` },
      { status: 400 },
    )

  // Vérifier la politique de retour (fenêtre de temps)
  if (orderDate) {
    const parsed = new Date(orderDate)
    if (!isNaN(parsed.getTime())) {
      const daysSince = Math.floor((Date.now() - parsed.getTime()) / 86_400_000)
      const maxDays   = vendor.returnPolicy?.maxClaimDays ?? 14
      if (daysSince > maxDays) {
        return NextResponse.json(
          { error: `Délai de retour dépassé (${maxDays} jours maximum)`, code: 'RETURN_WINDOW_EXPIRED' },
          { status: 422 }
        )
      }
    }
  }

  // ── 3. Générer token + session ──────────────────────────────────────────
  const token     = generateToken()
  const expiresAt = new Date(Date.now() + expiresIn * 60 * 60 * 1000)

  await prisma.returnSession.create({
    data: {
      token,
      vendorId:      keyRecord.id,
      orderId,
      customerId:      customerId || null,
      customerEmail,
      customerName,
      customerPhone:   customerPhone || '',
      customerWilaya:  customerWilaya || null,
      paymentMethod:   paymentMethod || null,
      shippingMethod:  shippingMethod || null,
      shippingCost,
      productName,
      orderDate:       orderDate || '',
      shopName,
      productPrice,
      productQuantity,
      orderTotal,
      expiresAt,
    },
  })

  // Mettre à jour lastUsedAt de la clé
  await prisma.apiKey.update({
    where: { id: keyRecord.id },
    data:  { lastUsedAt: new Date() },
  }).catch(() => null)

  log.info('return_session_created', { token, vendorId: vendor.id, orderId })

  return NextResponse.json(
    {
      token,
      url:        `${BASE_URL}/return/${token}`,
      expires_at: expiresAt.toISOString(),
    },
    { status: 201 }
  )
}