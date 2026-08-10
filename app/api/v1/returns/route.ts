// app/api/v1/returns/route.ts — Flowmerce
//
// Canal unique de soumission d'une demande de retour. Deux usages, un seul
// endpoint et une seule implémentation métier (lib/services/return-submission) :
//
//   Formulaire embarqué côté boutique
//     Authorization: Bearer <flk_…>   (ou en-tête x-api-key)
//     Body: { orderId, productId, answers: { [fieldId]: valeur } }
//     → la plateforme reçoit un statut exploitable : 422 sur refus de policy.
//
//   Portail white-label hébergé (page /return/[token])
//     X-Return-Token: <ret_…>        (ou Authorization: Bearer ret_…)
//     Body: { answers: { [fieldId]: valeur } }
//     → les champs déjà connus de la session ne sont ni attendus ni redemandés,
//       et une demande hors politique est enregistrée refusée (201) plutôt que
//       rejetée en erreur : le client final mérite une réponse motivée.
//
// Dans les deux cas, `answers` est un dictionnaire produit par le formulaire
// dynamique de GET /api/v1/return-form, revalidé côté serveur contre cette même
// définition. Aucune règle de politique n'est codée ici.
//
//   201 → { success, claim_id | claimId, status?, message }
//   400/401/403/409/422/429/503 → { error, code? }

import { NextRequest, NextResponse } from 'next/server'
import { resolveSubmissionContext }  from '@/lib/services/return-credentials'
import { submitReturn, clientIp }    from '@/lib/services/return-submission'

export async function POST(req: NextRequest) {
  const resolved = await resolveSubmissionContext(req)
  if (!resolved.ok) return resolved.response
  const ctx = resolved.ctx

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 }) }

  // Contrat de wire propre à l'usage boutique : la commande et le produit sont
  // portés par le body, pas par les réponses du formulaire. Côté page hébergée
  // ils viennent de la session — rien à exiger de l'appelant.
  if (ctx.audience === 'merchant') {
    const orderId   = String(body.orderId   ?? '').trim()
    const productId = String(body.productId ?? '').trim()

    if (!orderId || !productId) {
      return NextResponse.json(
        { error: 'Champs obligatoires manquants : orderId, productId' },
        { status: 400 },
      )
    }
    if (orderId.length > 200 || productId.length > 500) {
      return NextResponse.json({ error: 'Champ trop long' }, { status: 400 })
    }
    if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) {
      return NextResponse.json({ error: 'Champ answers invalide' }, { status: 400 })
    }

    ctx.prefill.orderId = orderId
  }

  return submitReturn({ ctx, body, ip: clientIp(req) })
}
