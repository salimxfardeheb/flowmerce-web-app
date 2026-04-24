// POST /api/fraud/report-refusal
//
// Appelé par ia-store (ou tout vendeur authentifié) pour signaler
// un client qui a refusé la livraison.
//
// Auth   : x-api-key du vendeur
// Body   : { customer_email?, customer_phone?, order_id, refusal_reason? }
// Règle  : customer_email OU customer_phone obligatoire

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey } from '@/lib/api-key-auth'
import { findOrCreateFraudRecord, computeFraudScore } from '@/lib/fraud-score'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  // 1. Valider la clé API
  const rawKey =
    req.headers.get('x-api-key') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    null

  const auth = await validateApiKey(rawKey)
  if (!auth.ok) return auth.response

  // 2. Parser le body
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 })
  }

  const customerEmail = body.customer_email
    ? String(body.customer_email).trim().toLowerCase()
    : undefined
  const customerPhone = body.customer_phone
    ? String(body.customer_phone).trim()
    : undefined
  const orderId = body.order_id ? String(body.order_id).trim() : undefined

  // 3. Valider : au moins email OU phone obligatoire
  if (!customerEmail && !customerPhone) {
    return NextResponse.json(
      { error: 'customer_email ou customer_phone requis' },
      { status: 422 },
    )
  }
  if (customerEmail && !EMAIL_RE.test(customerEmail)) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 422 })
  }
  if (!orderId) {
    return NextResponse.json({ error: 'order_id requis' }, { status: 422 })
  }

  // 4. Trouver ou créer le CustomerFraudRecord
  const { record } = await findOrCreateFraudRecord(customerEmail, customerPhone)

  // 5. Incrémenter totalRefusals
  const updated = await prisma.customerFraudRecord.update({
    where: { id: record.id },
    data: {
      totalRefusals: { increment: 1 },
      lastRefusalAt: new Date(),
    },
  })

  // 6. Logger (best-effort — ne bloque pas la réponse)
  prisma.predictionLog
    .create({
      data: {
        vendorId: auth.keyRecord.vendorId,
        input: {
          event:          'refusal_reported',
          customerEmail:  customerEmail ?? null,
          customerPhone:  customerPhone ?? null,
          orderId,
          refusalReason:  body.refusal_reason ?? null,
        },
        output: {
          fraudRecordId:  updated.id,
          totalRefusals:  updated.totalRefusals,
          newFraudScore:  computeFraudScore(updated),
        },
      },
    })
    .catch((e) => console.error('[report-refusal] log error:', e))

  return NextResponse.json(
    {
      ok:            true,
      newFraudScore: computeFraudScore(updated),
    },
    { status: 200 },
  )
}
