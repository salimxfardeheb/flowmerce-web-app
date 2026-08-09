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

export const RETURN_FORM_VERSION = 2

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
  title: string
  description: string
  sections: ReturnFormSection[]
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
    title:   'Demande de retour',
    description: 'Complétez le formulaire ci-dessous pour soumettre votre demande de retour.',
    sections: [
      {
        id:    'order',
        title: 'Informations de commande',
        description: 'Renseignez les informations de la commande concernée.',
        fields: [
          field({ id: 'order_id', type: 'text', label: 'Numéro de commande', required: true, placeholder: 'CMD-1234', validation: { maxLength: 200 } }),
          field({ id: 'customer_id', type: 'text', label: 'Identifiant client', required: false, placeholder: 'CUST-1024', validation: { maxLength: 100 } }),
          field({ id: 'customer_name', type: 'text', label: 'Nom complet', required: true, placeholder: 'Ahmed Benali', validation: { maxLength: 200 } }),
          field({ id: 'customer_email', type: 'email', label: 'Adresse e-mail', required: true, placeholder: 'client@exemple.com', validation: { maxLength: 254, pattern: EMAIL_PATTERN } }),
          field({ id: 'customer_phone', type: 'tel', label: 'Téléphone', required: false, placeholder: '0555123456' }),
          field({ id: 'customer_wilaya', type: 'text', label: 'Wilaya', required: true, placeholder: 'Alger', validation: { maxLength: 100 } }),
          field({ id: 'product_name', type: 'text', label: 'Produit', required: true, placeholder: 'Nike Air Max', validation: { maxLength: 500 } }),
          field({ id: 'payment_method', type: 'select', label: 'Mode de paiement', required: true, placeholder: 'Sélectionnez un mode de paiement…', options: paymentOptions, validation: { minLength: 1 } }),
          // Données logistiques : connues de la boutique, jamais saisies par le
          // client. La page hébergée les lit sur la ReturnSession ; les
          // intégrations externes les envoient depuis leurs données de commande.
          field({ id: 'shipping_method', type: 'text', label: 'Mode de livraison', source: 'merchant', required: false, placeholder: 'Livraison à domicile', validation: { maxLength: 100 } }),
          // Libellé sans unité : le champ n'est plus saisi, il est restitué en
          // lecture seule avec sa devise (« 500 DA »).
          field({ id: 'shipping_cost', type: 'number', label: 'Frais de livraison', source: 'merchant', required: false, placeholder: '500', validation: { min: 0 } }),
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
