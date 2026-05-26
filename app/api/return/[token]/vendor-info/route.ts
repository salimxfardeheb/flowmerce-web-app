// Valide le token de session et retourne les infos publiques du vendeur
// ainsi que les données pré-remplies (PII masquées) pour le formulaire.
import { NextRequest, NextResponse } from 'next/server'
import { prisma }          from '@/lib/prisma'
import { checkRateLimit }  from '@/lib/rate-limit'
import { log }             from '@/lib/logger'

// ── Masquage PII ──────────────────────────────────────────────────────────
function maskEmail(email: string | null | undefined): string {
  if (!email) return ''
  const at = email.indexOf('@')
  if (at < 1) return '***'
  return `${email[0]}***@${email.slice(at + 1)}`
}

function maskPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 3) return '***'
  const visible = digits.slice(-2)
  return '*'.repeat(digits.length - 2) + visible
}

// ─────────────────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // ── 1. Rate-limit par IP (10 req/h) ──────────────────────────────────
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  const allowed = await checkRateLimit(`vendor-info:${ip}`, 10, 60 * 60 * 1000)
  if (!allowed) {
    return NextResponse.json(
      { valid: false, error: 'Trop de requêtes. Réessayez dans 1 heure.' },
      { status: 429 }
    )
  }

  // ── 2. Charger la session ─────────────────────────────────────────────
  const session = await prisma.returnSession.findUnique({
    where:   { token },
    include: { vendor: { include: { vendor: { include: { returnPolicy: true } } } } },
  }).catch((e) => { log.error('vendor_info.db_error', { err: String(e) }); return null })

  if (!session) {
    return NextResponse.json(
      { valid: false, companyName: '', error: 'Lien de retour introuvable.' },
      { status: 403 }
    )
  }
  if (session.expiresAt < new Date()) {
    return NextResponse.json(
      { valid: false, companyName: '', error: 'Ce lien de retour a expiré.' },
      { status: 403 }
    )
  }

  const apiKey = session.vendor
  if (!apiKey.isActive) {
    return NextResponse.json(
      { valid: false, companyName: '', error: 'Cette clé API est désactivée.' },
      { status: 403 }
    )
  }
  if (apiKey.vendor.status !== 'APPROVED') {
    return NextResponse.json(
      { valid: false, companyName: '', error: "Ce compte vendeur n'est pas encore approuvé." },
      { status: 403 }
    )
  }

  // ── 3. Log d'accès (sans PII) ─────────────────────────────────────────
  log.info('vendor_info_accessed', {
    sessionId: session.id,
    vendorId:  apiKey.vendorId,
    ip,
  })

  // ── 4. Réponse avec PII masquées ──────────────────────────────────────
  return NextResponse.json(
    {
      valid:           true,
      companyName:     apiKey.vendor.companyName,
      acceptedTypes:   apiKey.vendor.returnPolicy?.acceptedTypes   ?? ['EXCHANGE', 'REFUND', 'REPAIR'],
      acceptedReasons: apiKey.vendor.returnPolicy?.acceptedReturnReasons ?? [],
      // session pre-fill — PII masquées
      orderId:         session.orderId,
      customerEmail:   maskEmail(session.customerEmail),
      customerName:    session.customerName,
      customerPhone:   maskPhone(session.customerPhone),
      productName:     session.productName,
      orderDate:       session.orderDate,
      shopName:        session.shopName,
    },
    { status: 200 }
  )
}
