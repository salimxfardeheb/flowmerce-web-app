// POST /api/fraud/report-refusal
//
// Signale un refus de livraison pour un client donné.
//
// Sécurité anti-empoisonnement :
//   1. Auth via clé API → on connaît le vendorId signalant
//   2. orderId obligatoire ET vérifié : le vendeur signalant doit avoir
//      une trace de cette commande (Claim ou ReturnSession) dans Flowmerce.
//      Un vendeur ne peut donc PAS signaler un client jamais traité par lui.
//   3. Insertion idempotente (unique vendorId+orderId) — pas de spam.
//   4. Le score combine refusals locaux + diversité cross-vendeurs (cf. fraud-score.ts).
//
// Auth : x-api-key du vendeur (ou Authorization: Bearer)
// Body : { customer_email?, customer_phone?, order_id, refusal_reason? }
// Règle : customer_email OU customer_phone obligatoire

import { NextRequest, NextResponse } from 'next/server'
import { prisma }           from '@/lib/prisma'
import { validateApiKey }   from '@/lib/api-key-auth'
import { reportRefusal }    from '@/lib/fraud-score'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  // 1. Auth — on récupère le vendorId signalant
  const rawKey =
    req.headers.get('x-api-key') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    null

  const auth = await validateApiKey(rawKey)
  if (!auth.ok) return auth.response
  const { vendorId } = auth.keyRecord

  // 2. Body
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
  const orderId       = body.order_id ? String(body.order_id).trim() : undefined
  const refusalReason = body.refusal_reason ? String(body.refusal_reason).trim() : undefined

  // 3. Validation
  if (!orderId) {
    return NextResponse.json({ error: 'order_id requis' }, { status: 422 })
  }
  if (!customerEmail && !customerPhone) {
    return NextResponse.json(
      { error: 'customer_email ou customer_phone requis' },
      { status: 422 },
    )
  }
  if (customerEmail && !EMAIL_RE.test(customerEmail)) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 422 })
  }

  // 4. Vérification anti-empoisonnement :
  //    le vendeur doit avoir une trace de cette commande dans Flowmerce.
  //
  //    Trace acceptable :
  //      a) Un Claim (vendorId, orderId) existe ; OU
  //      b) Une ReturnSession a été créée pour ce vendeur avec cet orderId
  //         (cas typique : refus à la livraison sans claim préalable).
  const [claim, returnSession] = await Promise.all([
    prisma.claim.findFirst({
      where:  { vendorId, orderId },
      select: { id: true, customerEmail: true, customerPhone: true },
    }),
    prisma.returnSession.findFirst({
      where: {
        orderId,
        vendor: { vendorId },  // ReturnSession.vendor → ApiKey → vendorId
      },
      select: { id: true, customerEmail: true, customerPhone: true },
    }),
  ])

  if (!claim && !returnSession) {
    return NextResponse.json(
      {
        error:
          "Aucune commande trouvée pour ce vendeur avec cet order_id. Vous ne pouvez signaler que vos propres clients.",
      },
      { status: 403 },
    )
  }

  // 5. Vérification cohérence email/phone : si on a une trace, l'identifiant
  //    fourni doit correspondre à celui de la transaction (anti-fishing par email arbitraire).
  const knownEmail = claim?.customerEmail ?? returnSession?.customerEmail ?? null
  const knownPhone = claim?.customerPhone ?? returnSession?.customerPhone ?? null

  if (
    customerEmail &&
    knownEmail &&
    customerEmail !== knownEmail.toLowerCase()
  ) {
    return NextResponse.json(
      { error: "customer_email ne correspond pas à la commande référencée" },
      { status: 422 },
    )
  }
  if (customerPhone && knownPhone && customerPhone !== knownPhone) {
    return NextResponse.json(
      { error: "customer_phone ne correspond pas à la commande référencée" },
      { status: 422 },
    )
  }

  // 6. Insertion + recalcul score (idempotent sur vendorId+orderId)
  const result = await reportRefusal({
    vendorId,
    customerEmail: customerEmail ?? knownEmail ?? undefined,
    customerPhone: customerPhone ?? knownPhone ?? undefined,
    orderId,
    claimId: claim?.id,
    reason:  refusalReason,
  })

  return NextResponse.json(
    {
      ok:               true,
      alreadyReported:  result.alreadyReported,
      newFraudScore:    result.newFraudScore,
      distinctVendors:  result.distinctVendors,
      totalRefusals:    result.totalRefusals,
    },
    { status: 200 },
  )
}
