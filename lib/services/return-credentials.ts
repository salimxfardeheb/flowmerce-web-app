// lib/services/return-credentials.ts — Flowmerce
//
// Résolution du contexte de soumission d'un retour à partir des identifiants
// portés par la requête. C'est le seul endroit qui distingue les deux usages
// du canal unique `POST /api/v1/returns` :
//
//   Clé API      → une plateforme soumet pour son client (formulaire embarqué).
//                  En-têtes : `Authorization: Bearer <flk_…>` ou `x-api-key`.
//
//   Jeton de     → le client final soumet depuis la page hébergée.
//   session        En-tête : `X-Return-Token: <ret_…>`, ou jeton passé
//                  explicitement par la route dépréciée /api/return/[token].
//
// Le type d'identifiant n'est jamais deviné à partir de sa forme : un en-tête
// dédié le déclare. Les jetons émis par l'ancien /api/checkout-session n'ont
// pas de préfixe `ret_`, une heuristique les aurait mal routés. Le préfixe
// n'est accepté comme raccourci que sur `Authorization: Bearer`, pour les
// intégrations qui ne veulent gérer qu'un seul en-tête.

import { NextResponse, type NextRequest } from 'next/server'
import { prisma }         from '@/lib/prisma'
import { validateApiKey } from '@/lib/api-key-auth'
import type { SubmissionContext, SubmissionPrefill } from '@/lib/services/return-submission'

export type ResolveResult =
  | { ok: true;  ctx: SubmissionContext }
  | { ok: false; response: NextResponse }

interface CredentialInput {
  /** Jeton de session passé par la route dépréciée /api/return/[token]. */
  sessionToken?: string
}

export async function resolveSubmissionContext(
  req:  NextRequest,
  opts: CredentialInput = {},
): Promise<ResolveResult> {
  const headerToken = req.headers.get('x-return-token')?.trim()
  const bearer      = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()

  const sessionToken =
    opts.sessionToken ??
    headerToken ??
    (bearer?.startsWith('ret_') ? bearer : undefined)

  if (sessionToken) return resolveFromSession(sessionToken)

  return resolveFromApiKey(bearer || req.headers.get('x-api-key') || null)
}

// ─────────────────────────────────────────────────────────────
// Clé API — formulaire embarqué côté boutique
// ─────────────────────────────────────────────────────────────
async function resolveFromApiKey(rawKey: string | null): Promise<ResolveResult> {
  const auth = await validateApiKey(rawKey)
  if (!auth.ok) return { ok: false, response: auth.response }

  const { keyRecord } = auth
  const vendor = keyRecord.vendor

  return {
    ok: true,
    ctx: {
      vendorId:     keyRecord.vendorId,
      apiKeyId:     keyRecord.id,
      vendor,
      returnPolicy: vendor.returnPolicy,
      audience:     'merchant',
      source:       'API',
      // Rien n'est connu du serveur : la plateforme envoie toutes les réponses.
      // `order_id` est injecté par la route, qui le tient du contrat d'API.
      prefill:      {},
      lockedFields: new Set<string>(),
      perCustomerLimit: true,
    },
  }
}

// ─────────────────────────────────────────────────────────────
// Jeton de session — portail white-label hébergé
// ─────────────────────────────────────────────────────────────
async function resolveFromSession(token: string): Promise<ResolveResult> {
  const session = await prisma.returnSession.findUnique({
    where:   { token },
    include: { vendor: { include: { vendor: { include: { returnPolicy: true } } } } },
  }).catch(() => null)

  if (!session) {
    return { ok: false, response: NextResponse.json({ error: 'Lien de retour introuvable.' }, { status: 401 }) }
  }
  if (session.expiresAt < new Date()) {
    return { ok: false, response: NextResponse.json({ error: 'Ce lien de retour a expiré.' }, { status: 401 }) }
  }
  if (session.usedAt) {
    return { ok: false, response: NextResponse.json({ error: 'Ce lien de retour a déjà été utilisé.' }, { status: 409 }) }
  }

  const apiKey = session.vendor
  if (!apiKey.isActive || apiKey.vendor.status !== 'APPROVED') {
    return { ok: false, response: NextResponse.json({ error: 'Clé API invalide ou compte non approuvé.' }, { status: 403 }) }
  }

  const prefill: SubmissionPrefill = {
    orderId:         session.orderId,
    customerId:      session.customerId,
    customerName:    session.customerName,
    customerEmail:   session.customerEmail,
    customerPhone:   session.customerPhone,
    customerWilaya:  session.customerWilaya,
    customerAge:     session.customerAge,
    customerGender:  session.customerGender,
    paymentMethod:   session.paymentMethod,
    shippingMethod:  session.shippingMethod,
    shippingCost:    session.shippingCost,
    productName:     session.productName,
    productPrice:    session.productPrice,
    productQuantity: session.productQuantity,
    orderTotal:      session.orderTotal,
    orderDate:       session.orderDate,
    shopName:        session.shopName,
  }

  return {
    ok: true,
    ctx: {
      vendorId:     apiKey.vendorId,
      apiKeyId:     apiKey.id,
      vendor:       apiKey.vendor,
      returnPolicy: apiKey.vendor.returnPolicy,
      audience:     'customer',
      source:       'HOSTED_PAGE',
      prefill,
      // Vide : face à un client final, `submitReturn` verrouille déjà tout
      // champ marqué `source: 'merchant'` dans la définition du formulaire.
      // Ce jeu ne sert qu'aux verrous supplémentaires, hors formulaire.
      lockedFields: new Set<string>(),
      // Le lien est déjà à usage unique : un second compteur par client et par
      // jour n'ajouterait rien.
      perCustomerLimit: false,
      onAccepted: async () => {
        await prisma.returnSession.update({
          where: { token },
          data:  { usedAt: new Date() },
        })
      },
    },
  }
}
