// lib/services/return-submission.ts — Flowmerce
//
// Canal unique de soumission d'une demande de retour.
//
// Les deux usages — formulaire embarqué côté boutique et portail white-label
// hébergé — partagent la totalité de la logique métier : construction du
// formulaire, validation des réponses contre sa définition, rate limiting,
// contrôle de la politique de retour, payload ML et ingestion.
//
// Ce qui les distingue tient entièrement dans le `SubmissionContext` que
// l'appelant résout en amont (cf. return-credentials.ts) :
//
//   • `prefill`      valeurs déjà connues du serveur, qui priment sur les
//                    réponses du client et ne lui sont pas redemandées ;
//   • `lockedFields` champs dont la valeur ne peut JAMAIS venir du client,
//                    même absente du prefill (logistique : un client final ne
//                    doit pas pouvoir influencer le score en déclarant ses
//                    propres frais de livraison) ;
//   • `audience`     à qui s'adresse la réponse HTTP — une boutique a besoin
//                    d'un statut d'erreur exploitable, un client final d'une
//                    explication ;
//   • `source`       API ou HOSTED_PAGE, reporté tel quel sur la réclamation.
//
// Ce module n'importe volontairement PAS `@/lib/prisma` : toute lecture en
// base (clé API, session de retour) appartient à la résolution du contexte.

import { NextResponse, type NextRequest } from 'next/server'
import { checkRateLimit }            from '@/lib/rate-limit'
import { buildReturnForm, merchantFieldIds, CONSENT_FIELD_ID } from '@/lib/services/return-form-builder'
import {
  isPresent,
  validateReturnFormAnswers,
}                                    from '@/lib/services/return-form-validation'
import { buildMLPayload }            from '@/lib/services/ml'
import { checkReturnPolicy, isPermanentPolicyViolation } from '@/lib/services/return-policy'
import { ingestClaim }               from '@/lib/services/claim-ingestion'
import { computeAgeFromBirthDate, parseOrderDate, daysSinceOrder } from '@/lib/utils'
import { log }                       from '@/lib/logger'
import type { ReturnPolicy, Vendor } from '@prisma/client'

const HTML_RE  = /<[^>]*>/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ─────────────────────────────────────────────────────────────
// Contexte de soumission
// ─────────────────────────────────────────────────────────────

// 'merchant' : une plateforme appelle pour son client. Elle doit recevoir un
//              statut d'erreur exploitable (422) et informe son client
//              elle-même — d'où `notify: false` sur les refus de politique.
// 'customer' : le client final soumet lui-même depuis la page hébergée.
//              Flowmerce porte la relation client : la demande est toujours
//              enregistrée (201) et le refus lui est expliqué par mail.
export type SubmissionAudience = 'merchant' | 'customer'

export interface SubmissionPrefill {
  orderId?:         string | null
  customerId?:      string | null
  customerName?:    string | null
  customerEmail?:   string | null
  customerPhone?:   string | null
  customerWilaya?:  string | null
  customerAge?:     number | null
  customerGender?:  string | null
  paymentMethod?:   string | null
  shippingMethod?:  string | null
  shippingCost?:    number | null
  productName?:     string | null
  productPrice?:    number | null
  productQuantity?: number | null
  orderTotal?:      number | null
  orderDate?:       string | null
  shopName?:        string | null
}

export type SubmissionVendor = Pick<Vendor, 'companyName' | 'website'> & {
  vendorCategories?: string[]
}

export interface SubmissionContext {
  vendorId:     string
  apiKeyId:     string
  vendor:       SubmissionVendor
  returnPolicy: ReturnPolicy | null
  audience:     SubmissionAudience
  source:       'API' | 'HOSTED_PAGE'
  prefill:      SubmissionPrefill
  /** Champs du formulaire dont la valeur vient exclusivement du serveur. */
  lockedFields: Set<string>
  /**
   * Second compteur de rate limit, par client et par jour (anti empoisonnement
   * du score de fraude). Inutile quand le jeton de soumission est déjà à usage
   * unique, comme sur la page hébergée.
   */
  perCustomerLimit: boolean
  /** Appelé une fois la réclamation acceptée en base (marquage du jeton). */
  onAccepted?: () => Promise<void>
}

// Correspondance champ de formulaire → clé de prefill. Un champ absent de
// cette table n'est jamais pré-rempli et vient toujours du client.
const PREFILL_BY_FIELD: Record<string, keyof SubmissionPrefill> = {
  order_id:        'orderId',
  customer_id:     'customerId',
  customer_name:   'customerName',
  customer_email:  'customerEmail',
  customer_phone:  'customerPhone',
  customer_wilaya: 'customerWilaya',
  payment_method:  'paymentMethod',
  shipping_method: 'shippingMethod',
  shipping_cost:   'shippingCost',
  product_name:    'productName',
  order_date:      'orderDate',
}

// Table figée : la paire (champ, clé) est parcourue à chaque soumission, elle
// est matérialisée une fois pour toutes au chargement du module.
const PREFILL_ENTRIES = Object.entries(PREFILL_BY_FIELD) as
  ReadonlyArray<readonly [string, keyof SubmissionPrefill]>

/** IP appelante, telle que vue derrière le proxy de déploiement. */
export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('x-real-ip')
      ?? 'unknown'
}

// ─────────────────────────────────────────────────────────────
// Soumission
// ─────────────────────────────────────────────────────────────

export interface SubmitReturnInput {
  ctx:  SubmissionContext
  body: Record<string, unknown>
  ip:   string
}

export async function submitReturn({ ctx, body, ip }: SubmitReturnInput): Promise<NextResponse> {
  const isMerchant = ctx.audience === 'merchant'

  // ── 1. Réponses du client ────────────────────────────────────────────────
  // `answers` (formulaire dynamique) ou body plat (intégrations historiques).
  const rawAnswers: Record<string, unknown> =
    body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)
      ? body.answers as Record<string, unknown>
      : body

  // ── 1 bis. Consentement au traitement des données ────────────────────────
  // Le client final accepte explicitement que les données de sa demande servent
  // à trancher la réclamation, à entraîner le modèle et à être rapprochées de
  // ses retours précédents. La case cochée dans un navigateur ne prouve rien :
  // la garde est ici, et l'horodatage part en base avec la réclamation.
  //
  // Deux provenances, parce qu'il y a deux façons légitimes de le recueillir :
  //   · `answers.data_consent` — le champ de la section `consent` du formulaire,
  //     rendu tel quel par le formulaire embarqué chez la boutique ;
  //   · `body.data_consent`    — accord donné hors formulaire, ce que fait le
  //     portail hébergé avec son propre bloc explicatif.
  //
  // La validation du formulaire ne suffit pas à l'exiger : `isPresent(false)`
  // est vrai, donc une case décochée passerait le contrôle « champ requis ».
  // Seule la comparaison stricte ci-dessous ferme la porte.
  const consentGiven =
    body.data_consent === true || rawAnswers[CONSENT_FIELD_ID] === true
  const dataConsentAt = consentGiven ? new Date() : null

  if (!consentGiven) {
    return NextResponse.json(
      {
        error: isMerchant
          ? `Consentement du client requis : transmettez ${CONSENT_FIELD_ID} = true dans answers, `
            + 'après acceptation explicite de la section « consent » du formulaire.'
          : 'Vous devez accepter le traitement de vos données pour envoyer votre demande.',
        code:  'CONSENT_REQUIRED',
      },
      { status: 400 },
    )
  }

  // ── 2. Définition du formulaire du vendeur ───────────────────────────────
  // Construite avant la fusion : c'est elle qui désigne les champs `merchant`,
  // donc ceux que le client final n'a pas le droit de renseigner.
  const form = buildReturnForm(ctx.vendor, ctx.returnPolicy)

  // Face à un client final, tout champ `merchant` est verrouillé — la règle est
  // dérivée du formulaire, pas d'une liste en dur : un futur champ boutique
  // sera protégé sans rien changer ici. Face à une plateforme, au contraire,
  // ces champs sont précisément ce qu'elle est censée transmettre depuis ses
  // données de commande.
  // Un seul jeu suffit pour les deux rôles : il porte les champs verrouillés à
  // l'entrée, puis s'enrichit des champs effectivement pré-remplis. Les deux
  // populations sont traitées à l'identique en aval — valeur non revalidée —
  // et un champ n'est jamais testé après y avoir été ajouté (une entrée de
  // PREFILL_BY_FIELD est visitée une fois).
  const serverControlled = new Set<string>(ctx.lockedFields)
  if (!isMerchant) {
    for (const id of merchantFieldIds(form)) serverControlled.add(id)
  }

  // Fusion prefill ↔ réponses : la valeur serveur prime toujours ; un champ
  // verrouillé ignore purement et simplement ce que le client a envoyé.
  const answers: Record<string, unknown> = { ...rawAnswers }

  // Le consentement est désormais un champ requis de la définition, mais le
  // portail le donne à la racine du body : sans cette normalisation, la
  // validation le réclamerait dans `answers` alors qu'il a déjà été contrôlé.
  // À ce stade il est acquis — l'étape 1 bis a renvoyé 400 sinon.
  answers[CONSENT_FIELD_ID] = true

  for (const [fieldId, prefillKey] of PREFILL_ENTRIES) {
    const value = ctx.prefill[prefillKey]
    if (isPresent(value)) {
      answers[fieldId] = value
      serverControlled.add(fieldId)
    } else if (serverControlled.has(fieldId)) {
      delete answers[fieldId]
    }
  }

  // ── 3. Validation contre la définition du formulaire du vendeur ──────────
  // Les champs renseignés par le serveur ne sont pas revalidés : leur valeur a
  // déjà été contrôlée à la création du jeton de session ou vient de la
  // plateforme elle-même. `desired_resolution` est comparé en majuscules aux
  // options du formulaire.
  // Normalisée en place : `answers` est déjà une copie locale, la réécrire
  // évite de dupliquer tout l'objet juste pour la validation.
  const desiredResolution = String(answers.desired_resolution ?? '').trim().toUpperCase()
  answers.desired_resolution = desiredResolution

  const validationError = validateReturnFormAnswers(form, answers, { skipFields: serverControlled })
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  // ── 4. Mapping des réponses validées vers les champs métier ──────────────
  const str = (k: string): string => {
    const v = answers[k]
    return v == null ? '' : String(v).trim()
  }
  const numOrNull = (k: string): number | null => {
    const v = answers[k]
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const intPos = (k: string): number | null => {
    // `Number.isFinite` reste nécessaire : parseInt renvoie Infinity sur une
    // suite de chiffres assez longue pour dépasser Number.MAX_VALUE.
    const n = parseInt(String(answers[k]), 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  const orderId       = str('order_id')
  const customerId    = str('customer_id')    || null
  const customerName  = str('customer_name')
  const customerEmail = str('customer_email').toLowerCase()
  const customerPhone = str('customer_phone') || str('customer_telephone') || null
  const productName   = str('product_name')
  const reason        = str('reason')
  const description   = str('description')
  const productCategory = str('product_category') || null
  const orderAddress    = str('order_address')    || null
  const shopName        = ctx.prefill.shopName || str('shop_name') || ctx.vendor.companyName

  // Données de commande : le prefill prime, sinon les réponses.
  const productPrice    = ctx.prefill.productPrice    ?? numOrNull('product_price')
  const productQuantity = ctx.prefill.productQuantity ?? intPos('order_quantity') ?? intPos('product_quantity')
  const orderTotal      = ctx.prefill.orderTotal      ?? numOrNull('order_total')

  // Livraison : toujours issue du prefill quand le champ est verrouillé, avec
  // repli neutre — jamais une valeur déclarée par le client final.
  const shippingMethod = str('shipping_method') || 'Standard'
  const shippingCost   = numOrNull('shipping_cost') ?? 0
  const paymentMethod  = str('payment_method')  || 'Unknown'
  const customerWilaya = str('customer_wilaya') || 'Unknown'

  // Profil client : features ML Customer_Age / Customer_Gender. Le formulaire
  // ne les demande pas — elles viennent de la boutique. Le repli d'âge ne
  // s'applique que sur la page hébergée, où l'absence de valeur est normale ;
  // côté API, un âge inconnu reste inconnu plutôt qu'inventé.
  const customerGender = ctx.prefill.customerGender || str('customer_gender') || 'Unknown'
  const customerAge    = ctx.prefill.customerAge
                      ?? computeAgeFromBirthDate(answers.customer_birth_date)
                      ?? numOrNull('customer_age')
                      ?? (isMerchant ? null : 30)

  // ── 5. Garde-fous sur les valeurs hors formulaire ────────────────────────
  // Ils couvrent ce que la validation du formulaire ne voit pas : champs
  // pré-remplis par le serveur et champs libres absents de la définition.
  if (!customerEmail || !orderId || !productName || !reason || !desiredResolution) {
    return NextResponse.json(
      { error: 'Champs requis : customer_email, order_id, product_name, reason, desired_resolution' },
      { status: 400 },
    )
  }
  if (!EMAIL_RE.test(customerEmail) || customerEmail.length > 254) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
  }
  if (orderId.length > 200 || customerName.length > 200 || productName.length > 500) {
    return NextResponse.json({ error: 'Champ trop long' }, { status: 400 })
  }
  if (HTML_RE.test(shopName) || (orderAddress && HTML_RE.test(orderAddress))) {
    return NextResponse.json({ error: 'Contenu HTML non autorisé' }, { status: 400 })
  }

  // ── 6. Date de commande ──────────────────────────────────────────────────
  // Une commande dans le futur est une erreur d'intégration : refusée plutôt
  // que ramenée à un Days_to_Return de 0 qui polluerait le dataset. Quand la
  // date vient du serveur, elle a déjà été validée en amont : une valeur
  // aberrante y retombe sur `null` au lieu de bloquer un client final qui n'y
  // peut rien.
  const orderDateFromServer = isPresent(ctx.prefill.orderDate)
  const parsedOrderDate = parseOrderDate(answers.order_date)
  if (!parsedOrderDate.ok && !orderDateFromServer) {
    return NextResponse.json(
      {
        error: parsedOrderDate.reason === 'future'
          ? 'order_date ne peut pas être dans le futur'
          : 'order_date invalide (date ISO-8601 attendue)',
      },
      { status: 400 },
    )
  }
  const orderDate    = parsedOrderDate.ok ? parsedOrderDate.date : null
  const daysToReturn = daysSinceOrder(orderDate)

  // ── 7. Rate limiting ─────────────────────────────────────────────────────
  const allowed = await checkRateLimit(`${ip}:${orderId}`)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Trop de tentatives pour cette commande. Réessayez dans 1 heure.' },
      { status: 429 },
    )
  }

  if (ctx.perCustomerLimit) {
    const today = new Date().toISOString().slice(0, 10)
    const allowedPerCustomer = await checkRateLimit(
      `vendor:${ctx.vendorId}:email:${customerEmail}:${today}`,
      3,
      24 * 60 * 60 * 1000,
    )
    if (!allowedPerCustomer) {
      return NextResponse.json(
        { error: "Trop de demandes pour ce client aujourd'hui. Réessayez demain." },
        { status: 429 },
      )
    }
  }

  // ── 8. Politique de retour ───────────────────────────────────────────────
  const policyCheck = checkReturnPolicy(ctx.returnPolicy, {
    daysToReturn,
    productCategory: productCategory ?? undefined,
    claimType:       desiredResolution,
  })

  const policyFailure: PolicyFailure | null = policyCheck.ok
    ? null
    : { code: policyCheck.code, message: policyCheck.message, extra: policyCheck.extra }

  // Côté boutique, une violation *corrigeable* sort sans rien créer : le
  // réessai légitime sur le même order_id avec une autre résolution butterait
  // sinon sur la contrainte unique (vendorId, orderId). Les violations
  // définitives sont enregistrées — ce sont les exemples négatifs qui manquent
  // au dataset d'entraînement. Côté client final, tout est enregistré : la
  // demande est déposée, elle mérite une trace et une réponse motivée.
  if (isMerchant && policyFailure && !isPermanentPolicyViolation(policyFailure.code)) {
    return policy422(policyFailure)
  }

  const policyViolation = policyFailure
    ? { code: policyFailure.code, message: policyFailure.message, notify: !isMerchant }
    : null

  // ── 9. Payload ML + ingestion unifiée ────────────────────────────────────
  const mlPayload = buildMLPayload({
    customerId,
    shopName,
    productCategory:  productCategory ?? ctx.vendor.vendorCategories?.[0] ?? null,
    productPrice,
    productQuantity,
    orderTotal,
    paymentMethod,
    shippingMethod,
    shippingCost,
    customerGender,
    customerAge,
    customerWilaya,
    reason,
    daysToReturn,
    returnWindowDays: ctx.returnPolicy?.maxClaimDays ?? 14,
  })

  // `productName` et `reason` sont garantis non vides par le garde-fou de
  // l'étape 5 : seul le détail libre est conditionnel.
  const fullDescription = description
    ? `${productName} — Motif : ${reason} — Détails : ${description}`
    : `${productName} — Motif : ${reason}`

  const result = await ingestClaim({
    vendor:        { id: ctx.vendorId, companyName: ctx.vendor.companyName },
    apiKeyId:      ctx.apiKeyId,
    orderId,
    customerId,
    customerName:  customerName || customerEmail,
    customerEmail,
    customerPhone,
    productName,
    description:   fullDescription,
    type:          desiredResolution as 'EXCHANGE' | 'REFUND' | 'REPAIR',
    source:        ctx.source,
    ipAddress:     ip,
    orderDate,
    dataConsentAt,
    prediction: {
      orderTotal,
      customerAge,
      orderAddress,
      productPrice,
      shippingCost,
      paymentMethod,
      customerGender,
      customerWilaya,
      shippingMethod,
      productCategory,
      productQuantity,
    },
    mlPayload,
    policyViolation,
  })

  if (!result.ok) {
    // Doublon sur une violation définitive : la réclamation refusée existe
    // déjà, l'appelant doit quand même recevoir sa raison métier.
    if (isMerchant && policyFailure) return policy422(policyFailure)
    return NextResponse.json(
      { error: 'Une demande de retour existe déjà pour cette commande.' },
      { status: 409 },
    )
  }

  // ── 10. Jeton consommé ────────────────────────────────────────────────────
  if (ctx.onAccepted) {
    await ctx.onAccepted().catch((e) =>
      log.error('return_submission.on_accepted_error', { err: String(e) }),
    )
  }

  log.info('return_submitted', {
    claimId:             result.claim.id,
    vendorId:            ctx.vendorId,
    orderId,
    reason,
    desiredResolution,
    customerPastReturns: result.customerPastReturns,
    fraudScore:          result.claim.fraudScore,
    source:              ctx.source,
    policyRejected:      result.claim.policyRejected,
    dataConsent:         consentGiven,
    ip,
  })

  // ── 11. Réponse ──────────────────────────────────────────────────────────
  // Violation définitive côté boutique : enregistrée en base, mais la réponse
  // reste le 422 documenté, inchangé pour l'intégrateur.
  if (isMerchant && policyFailure) return policy422(policyFailure)

  if (isMerchant) {
    return NextResponse.json(
      {
        success:               true,
        claim_id:              result.claim.id,
        status:                result.claim.status,
        customer_past_returns: result.customerPastReturns,
        message:               resultMessage(result.claim),
      },
      { status: 201 },
    )
  }

  // Client final hors politique : la demande est bien enregistrée (201), mais
  // il doit comprendre qu'elle est refusée — pas « créée avec succès ».
  if (result.claim.policyRejected) {
    return NextResponse.json(
      {
        success:  true,
        claimId:  result.claim.id,
        rejected: true,
        code:     policyViolation?.code,
        message:  policyViolation?.message
          ?? "Votre demande a été enregistrée mais ne peut pas être acceptée : elle est hors de la politique de retour du vendeur.",
      },
      { status: 201 },
    )
  }

  return NextResponse.json(
    { success: true, claimId: result.claim.id, message: 'Réclamation créée avec succès' },
    { status: 201 },
  )
}

// ─────────────────────────────────────────────────────────────
// Refus de politique
// ─────────────────────────────────────────────────────────────

interface PolicyFailure {
  code:    string
  message: string
  extra?:  Record<string, unknown>
}

/** 422 documenté pour l'intégrateur : message métier, code, contexte. */
function policy422(failure: PolicyFailure): NextResponse {
  return NextResponse.json(
    { error: failure.message, code: failure.code, ...failure.extra },
    { status: 422 },
  )
}

function resultMessage(claim: { autoApproved: boolean; autoRejected: boolean }): string {
  if (claim.autoRejected) {
    return "Votre demande de retour a été refusée automatiquement par notre système d'analyse."
  }
  if (claim.autoApproved) {
    return 'Votre demande de retour a été enregistrée et approuvée automatiquement.'
  }
  return 'Votre demande de retour a été enregistrée.'
}
