// Valide le token de session et retourne les infos publiques du vendeur
// ainsi que les données pré-remplies pour le formulaire.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const session = await prisma.returnSession.findUnique({
    where:   { token },
    include: { vendor: { include: { vendor: { include: { returnPolicy: true } } } } },
  }).catch((e) => { console.error('[vendor-info] DB error:', e); return null })

  if (!session) {
    return NextResponse.json(
      { valid: false, companyName: '', error: `Lien de retour introuvable. (token: ${token.slice(0, 8)}…)` },
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

  return NextResponse.json(
    {
      valid:         true,
      companyName:   apiKey.vendor.companyName,
      acceptedTypes: apiKey.vendor.returnPolicy?.acceptedTypes ?? ['EXCHANGE', 'REFUND', 'REPAIR'],
      acceptedReasons: apiKey.vendor.returnPolicy?.acceptedReasons ?? [],
      // session pre-fill data
      orderId:       session.orderId,
      customerEmail: session.customerEmail,
      customerName:  session.customerName,
      customerPhone: session.customerPhone,
      productName:   session.productName,
      orderDate:     session.orderDate,
      shopName:      session.shopName,
    },
    { status: 200 }
  )
}
