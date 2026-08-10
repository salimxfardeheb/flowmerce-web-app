// lib/services/return-form-builder.ts — Flowmerce
//
// Transforme un Vendor + sa ReturnPolicy en une représentation JSON générique
// de formulaire de retour, consommable par n'importe quelle plateforme externe
// (Shopify, WooCommerce, Magento, PrestaShop…).
//
// Le JSON produit est totalement indépendant de React/Next.js et de la boutique
// cliente : sections → champs typés (text, email, select…) avec options et
// règles de validation interprétables par n'importe quel moteur de formulaire.
//
// Couche réutilisable (aucune duplication de logique) :
//   - GET /api/v1/return-form
//   - futur portail white-label, SDK, autres API publiques.

import type { ReturnPolicy, Vendor } from '@prisma/client'
import {
  CLAIM_TYPES,
  CLAIM_TYPE_DESCRIPTIONS,
  CLAIM_TYPE_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  RETURN_REASONS,
  RETURN_REASON_DESCRIPTIONS,
} from '@/lib/constants'

// ─────────────────────────────────────────────────────────────
// Contrat de version du formulaire
//
// `version` n'est incrémentée que sur un changement de RUPTURE : champ
// supprimé ou renommé, type modifié, contrainte durcie, sémantique changée.
// Les évolutions additives — nouvelle propriété, nouveau champ optionnel,
// contrainte relâchée, nouvelle option — ne l'incrémentent pas.
//
// `min_compatible_version` dit jusqu'où la définition reste lisible : un
// consommateur écrit pour la version V peut rendre ce formulaire dès lors que
// `V >= min_compatible_version`. C'est le seul contrôle à implémenter côté
// boutique — comparer `version` à une liste blanche fermée bloque sur des
// évolutions inoffensives.
//
// En contrepartie, un consommateur DOIT ignorer ce qu'il ne connaît pas :
// propriétés inconnues sur un champ, types de champ inconnus, sections
// inconnues. C'est ce qui permet d'enrichir le formulaire sans rupture.
//
// Le contrat n'a jamais connu de rupture : il est en v1 depuis l'origine.
// L'ajout de `field.source` et le passage de `shipping_method` en optionnel
// avaient brièvement fait passer la constante à 2 ; ces deux évolutions étant
// additives, elles ne justifiaient pas d'incrément et il a été annulé.
// ─────────────────────────────────────────────────────────────
export const RETURN_FORM_VERSION = 1
export const RETURN_FORM_MIN_COMPATIBLE_VERSION = 1

// Qui renseigne la valeur d'un champ :
//   'customer' → saisi par le client final dans le formulaire ;
//   'merchant' → connu du système de la boutique (logistique, facturation…).
//                Jamais demandé au client : la page hébergée le prend sur la
//                ReturnSession, les intégrations externes l'envoient depuis
//                leurs données de commande. Affiché en lecture seule quand la
//                valeur est connue.
export type ReturnFormFieldSource = 'customer' | 'merchant'

export type ReturnFormFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'number'
  | 'email'
  | 'tel'
  | 'date'
  | 'checkbox'

export interface ReturnFormOption {
  value: string
  label: string
  description?: string
}

export interface ReturnFormField {
  id: string
  type: ReturnFormFieldType
  label: string
  source: ReturnFormFieldSource
  required: boolean
  placeholder?: string
  defaultValue?: string | number | boolean | null
  options: ReturnFormOption[]
  validation: {
    minLength?: number
    maxLength?: number
    pattern?: string
    min?: number
    max?: number
  }
}

export interface ReturnFormSection {
  id: string
  title: string
  description?: string
  fields: ReturnFormField[]
}

export interface ReturnForm {
  version: number
  /** Version de moteur la plus ancienne capable de rendre ce formulaire. */
  min_compatible_version: number
  title: string
  description: string
  /** Champs à AFFICHER au client final. Un moteur de rendu boucle ici. */
  sections: ReturnFormSection[]
  /**
   * Champs à FOURNIR depuis les données de commande, jamais à afficher.
   * Volontairement hors de `sections` : un moteur qui boucle naïvement sur
   * les sections fait ainsi la bonne chose sans avoir à connaître `source`.
   * Ils restent validés à la soumission quand une valeur est transmise.
   */
  merchant_fields: ReturnFormField[]
  meta: {
    shop: {
      name: string
      slug: string
      website?: string | null
    }
    policy: {
      max_claim_days: number
      processing_days: number
      allow_refusal_on_delivery: boolean
      partial_refund_enabled: boolean
      non_refundable_categories: string[]
      exchange_only_categories: string[]
    }
  }
}

type VendorInput = Pick<Vendor, 'companyName' | 'website'>
type PolicyInput = ReturnPolicy | null

const DEFAULTS = {
  maxClaimDays:              14,
  processingDays:            5,
  allowRefusalOnDelivery:    false,
  partialRefundEnabled:      false,
  nonRefundableCategories:   [] as string[],
  exchangeOnlyCategories:    [] as string[],
}

const EMAIL_PATTERN = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$'

// Ids des champs dont la valeur appartient à la boutique et jamais au client
// final. Sur la page hébergée ils ne sont ni affichés ni acceptés depuis le
// body : la ReturnSession fait foi, et un champ absent retombe sur son repli
// neutre plutôt que d'être inventé par le client.
export function merchantFieldIds(form: Pick<ReturnForm, 'merchant_fields'>): string[] {
  return (form.merchant_fields ?? []).map(f => f.id)
}

/** Tous les champs du formulaire, affichés comme fournis par la boutique. */
export function allFields(
  form: Pick<ReturnForm, 'sections' | 'merchant_fields'>,
): ReturnFormField[] {
  return [
    ...(form.sections ?? []).flatMap(s => s.fields ?? []),
    ...(form.merchant_fields ?? []),
  ]
}

// Slug d'une boutique dérivé de son nom (aucun champ slug en base).
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function field(
  input: Omit<ReturnFormField, 'options' | 'validation' | 'defaultValue' | 'source'> & {
    options?: ReturnFormOption[]
    validation?: ReturnFormField['validation']
    defaultValue?: ReturnFormField['defaultValue']
    source?: ReturnFormFieldSource
  },
): ReturnFormField {
  const { options, validation, defaultValue, source, ...rest } = input
  return {
    ...rest,
    source:      source ?? 'customer',
    options:     options ?? [],
    validation:  validation ?? {},
    defaultValue: defaultValue ?? null,
  }
}

export function buildReturnForm(vendor: VendorInput, policy: PolicyInput): ReturnForm {
  const maxClaimDays = policy?.maxClaimDays ?? DEFAULTS.maxClaimDays
  const acceptedTypes = policy && policy.acceptedTypes.length > 0
    ? policy.acceptedTypes
    : CLAIM_TYPES
  const acceptedReasons = policy?.acceptedReturnReasons ?? []

  const reasonOptions: ReturnFormOption[] = RETURN_REASONS
    .filter(r => acceptedReasons.length === 0 || acceptedReasons.includes(r))
    .map(r => ({
      value:       r,
      label:       r,
      description: RETURN_REASON_DESCRIPTIONS[r],
    }))

  const resolutionOptions: ReturnFormOption[] = CLAIM_TYPES
    .filter(t => acceptedTypes.includes(t))
    .map(t => ({
      value:       t,
      label:       CLAIM_TYPE_LABELS[t],
      description: CLAIM_TYPE_DESCRIPTIONS[t],
    }))

  const paymentOptions: ReturnFormOption[] = PAYMENT_METHODS.map(p => ({
    value: p,
    label: PAYMENT_METHOD_LABELS[p],
  }))

  return {
    version: RETURN_FORM_VERSION,
    min_compatible_version: RETURN_FORM_MIN_COMPATIBLE_VERSION,
    title:   'Demande de retour',
    description: 'Complétez le formulaire ci-dessous pour soumettre votre demande de retour.',
    sections: [
      {
        id:    'order',
        title: 'Informations de commande',
        description: 'Renseignez les informations de la commande concernée.',
        fields: [
          field({ id: 'order_id', type: 'text', label: 'Numéro de commande', required: true, placeholder: 'CMD-1234', validation: { maxLength: 200 } }),
          field({ id: 'customer_name', type: 'text', label: 'Nom complet', required: true, placeholder: 'Ahmed Benali', validation: { maxLength: 200 } }),
          field({ id: 'customer_email', type: 'email', label: 'Adresse e-mail', required: true, placeholder: 'client@exemple.com', validation: { maxLength: 254, pattern: EMAIL_PATTERN } }),
          field({ id: 'customer_phone', type: 'tel', label: 'Téléphone', required: false, placeholder: '0555123456' }),
          field({ id: 'product_name', type: 'text', label: 'Produit', required: true, placeholder: 'Nike Air Max', validation: { maxLength: 500 } }),
          field({ id: 'order_date', type: 'date', label: 'Date de commande', required: false }),
        ],
      },
      {
        id:    'reason',
        title: 'Motif du retour',
        fields: [
          field({
            id: 'reason',
            type: 'select',
            label: 'Motif du retour',
            required: true,
            placeholder: 'Sélectionnez un motif…',
            options: reasonOptions,
            validation: { minLength: 1 },
          }),
        ],
      },
      {
        id:    'resolution',
        title: 'Résolution souhaitée',
        fields: [
          field({
            id: 'desired_resolution',
            type: 'select',
            label: 'Résolution souhaitée',
            required: true,
            options: resolutionOptions,
            validation: { minLength: 1 },
          }),
        ],
      },
      {
        id:    'description',
        title: 'Détails de la demande',
        fields: [
          field({
            id: 'description',
            type: 'textarea',
            label: 'Description',
            required: false,
            placeholder: 'Décrivez votre problème en détail pour accélérer le traitement…',
            validation: { maxLength: 2000 },
          }),
        ],
      },
    ],
    // Faits de la commande, fournis par la boutique et jamais demandés au
    // client. Aucun n'est `required` : la boutique peut ne pas avoir
    // l'information, auquel cas l'ingestion retombe sur son repli neutre —
    // l'exiger fermerait le formulaire à un client qui ne peut rien y faire.
    merchant_fields: [
      // Identifiant interne : le client ne le connaît pas, et une valeur
      // inventée casserait le lien avec son historique de retours.
      field({ id: 'customer_id', type: 'text', label: 'Identifiant client', source: 'merchant', required: false, placeholder: 'CUST-1024', validation: { maxLength: 100 } }),
      // Wilaya et mode de paiement sont des faits de la commande, pas des
      // déclarations du client — et deux features du modèle. Les lui faire
      // saisir lui donnerait prise sur sa propre prédiction.
      field({ id: 'customer_wilaya', type: 'text', label: 'Wilaya', source: 'merchant', required: false, placeholder: 'Alger', validation: { maxLength: 100 } }),
      field({ id: 'payment_method', type: 'select', label: 'Mode de paiement', source: 'merchant', required: false, placeholder: 'Sélectionnez un mode de paiement…', options: paymentOptions }),
      field({ id: 'shipping_method', type: 'text', label: 'Mode de livraison', source: 'merchant', required: false, placeholder: 'Livraison à domicile', validation: { maxLength: 100 } }),
      // Libellé sans unité : le champ n'est pas saisi, il est restitué en
      // lecture seule avec sa devise (« 500 DA »).
      field({ id: 'shipping_cost', type: 'number', label: 'Frais de livraison', source: 'merchant', required: false, placeholder: '500', validation: { min: 0 } }),
    ],
    meta: {
      shop: {
        name:    vendor.companyName,
        slug:    slugify(vendor.companyName),
        website: vendor.website ?? null,
      },
      policy: {
        max_claim_days:             maxClaimDays,
        processing_days:            policy?.processingDays ?? DEFAULTS.processingDays,
        allow_refusal_on_delivery:  policy?.allowRefusalOnDelivery ?? DEFAULTS.allowRefusalOnDelivery,
        partial_refund_enabled:     policy?.partialRefundEnabled ?? DEFAULTS.partialRefundEnabled,
        non_refundable_categories:  policy?.nonRefundableCategories ?? DEFAULTS.nonRefundableCategories,
        exchange_only_categories:   policy?.exchangeOnlyCategories ?? DEFAULTS.exchangeOnlyCategories,
      },
    },
  }
}
