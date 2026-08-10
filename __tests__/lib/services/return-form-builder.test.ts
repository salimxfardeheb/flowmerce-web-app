import { describe, it, expect } from 'vitest'
import type { ReturnPolicy, Vendor } from '@prisma/client'
import {
  allFields,
  buildReturnForm,
  merchantFieldIds,
  slugify,
  RETURN_FORM_VERSION,
  RETURN_FORM_MIN_COMPATIBLE_VERSION,
} from '@/lib/services/return-form-builder'
import {
  RETURN_REASONS,
  CLAIM_TYPES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from '@/lib/constants'

const vendor: Pick<Vendor, 'companyName' | 'website'> = {
  companyName: 'Caba Store',
  website:     'https://caba.example.com',
}

function policy(overrides: Partial<ReturnPolicy> = {}): ReturnPolicy {
  return {
    id:                      'pol_1',
    vendorId:                'v_1',
    allowRefusalOnDelivery:  false,
    maxClaimDays:            14,
    acceptedTypes:           ['EXCHANGE', 'REFUND'],
    validationMode:          'MANUAL',
    createdAt:               new Date(),
    updatedAt:               new Date(),
    fraudScoreThreshold:     70,
    fraudReturnThreshold:    4,
    acceptedReturnReasons:   [],
    exchangeOnlyCategories:  [],
    nonRefundableCategories: [],
    partialRefundEnabled:    false,
    partialRefundRules:      null,
    processingDays:          5,
    ...overrides,
  }
}

describe('slugify', () => {
  it('normalise un nom de boutique', () => {
    expect(slugify('Caba Store')).toBe('caba-store')
    expect(slugify('Ma Boutique')).toBe('ma-boutique')
    expect(slugify('  Boutique   Express  ')).toBe('boutique-express')
  })

  it('supprime les accents', () => {
    expect(slugify('Éléctro Shop')).toBe('electro-shop')
    expect(slugify('Zèbre Mod')).toBe('zebre-mod')
  })

  it('retourne une chaîne vide sans caractère alphanumérique', () => {
    expect(slugify('!!!')).toBe('')
  })
})

// Le contrat de version est la seule chose qu'une boutique doit contrôler
// avant de rendre le formulaire. Le casser bloque toutes les intégrations en
// place, y compris sur une évolution parfaitement additive.
describe('contrat de version', () => {
  it('expose min_compatible_version à côté de version', () => {
    const form = buildReturnForm(vendor, null)

    expect(form.version).toBe(RETURN_FORM_VERSION)
    expect(form.min_compatible_version).toBe(RETURN_FORM_MIN_COMPATIBLE_VERSION)
  })

  it('reste lisible par un moteur écrit pour une version antérieure', () => {
    // Un consommateur v1 doit pouvoir rendre le formulaire courant : c'est
    // précisément ce que min_compatible_version lui permet de vérifier.
    expect(RETURN_FORM_MIN_COMPATIBLE_VERSION).toBeLessThanOrEqual(RETURN_FORM_VERSION)

    const form = buildReturnForm(vendor, null)
    const engineVersion = 1
    expect(engineVersion).toBeGreaterThanOrEqual(form.min_compatible_version)
  })

  // Garde-fou : incrémenter `version` casse toutes les boutiques qui
  // contrôlent encore `version` au lieu de `min_compatible_version`. Ce test
  // n'autorise le bump que s'il est délibéré — et il ne l'est que sur une
  // rupture réelle du contrat.
  it('reste en v1 — aucune rupture du contrat à ce jour', () => {
    expect(RETURN_FORM_VERSION).toBe(1)
  })

  it('le contrat de compatibilité est au premier niveau, pas dans meta', () => {
    // `meta` est documenté comme un bloc informatif que les moteurs ignorent :
    // y enterrer le contrat garantirait que personne ne le lise.
    const form = buildReturnForm(vendor, null)

    expect(form).toHaveProperty('min_compatible_version')
    expect(form.meta).not.toHaveProperty('min_compatible_version')
  })
})

describe('buildReturnForm', () => {
  it('construit la structure générique de base', () => {
    const form = buildReturnForm(vendor, null)

    expect(form.version).toBe(RETURN_FORM_VERSION)
    expect(form.title).toBe('Demande de retour')
    expect(form.description).toBeTruthy()
    expect(form.sections.map(s => s.id)).toEqual([
      'order', 'reason', 'resolution', 'description',
    ])

    for (const section of form.sections) {
      for (const f of section.fields) {
        expect(f).toHaveProperty('id')
        expect(f).toHaveProperty('type')
        expect(f).toHaveProperty('label')
        expect(typeof f.required).toBe('boolean')
        expect(f.options).toBeInstanceOf(Array)
        expect(f.validation).toBeInstanceOf(Object)
        expect(f).toHaveProperty('defaultValue')
      }
    }
  })

  it('applique les défauts quand la politique est absente', () => {
    const form = buildReturnForm(vendor, null)

    const reason = form.sections.find(s => s.id === 'reason')!.fields[0]
    const resolution = form.sections.find(s => s.id === 'resolution')!.fields[0]

    expect(reason.options).toHaveLength(RETURN_REASONS.length)
    expect(resolution.options).toHaveLength(CLAIM_TYPES.length)
    expect(form.meta.policy.max_claim_days).toBe(14)
    expect(form.meta.policy.processing_days).toBe(5)
  })

  it('filtre les options selon la politique du vendeur', () => {
    const form = buildReturnForm(vendor, policy({
      acceptedReturnReasons: ['Produit défectueux'],
      acceptedTypes:         ['EXCHANGE'],
    }))

    const reason = form.sections.find(s => s.id === 'reason')!.fields[0]
    const resolution = form.sections.find(s => s.id === 'resolution')!.fields[0]

    expect(reason.options.map(o => o.value)).toEqual(['Produit défectueux'])
    expect(reason.options[0].description).toBe('Le produit est endommagé ou ne fonctionne pas')

    expect(resolution.options.map(o => o.value)).toEqual(['EXCHANGE'])
    expect(resolution.options[0].label).toBe('Échange')
    expect(resolution.options[0].description).toBe('Je souhaite un produit de remplacement')
  })

  it('expose le résumé de politique sans copier la politique brute', () => {
    const form = buildReturnForm(vendor, policy({
      maxClaimDays:            30,
      processingDays:          3,
      partialRefundEnabled:    true,
      allowRefusalOnDelivery:  true,
      nonRefundableCategories: ['Food'],
      exchangeOnlyCategories:  ['Beauty'],
    }))

    expect(form.meta).toEqual({
      shop: {
        name:    'Caba Store',
        slug:    'caba-store',
        website: 'https://caba.example.com',
      },
      policy: {
        max_claim_days:            30,
        processing_days:           3,
        allow_refusal_on_delivery: true,
        partial_refund_enabled:    true,
        non_refundable_categories: ['Food'],
        exchange_only_categories:  ['Beauty'],
      },
    })
    expect(form.meta).not.toHaveProperty('validationMode')
    expect(form.meta).not.toHaveProperty('fraudScoreThreshold')
  })

  it('définit les règles de validation des champs commande', () => {
    const form = buildReturnForm(vendor, policy())
    const order = form.sections.find(s => s.id === 'order')!

    const email = order.fields.find(f => f.id === 'customer_email')!
    expect(email.type).toBe('email')
    expect(email.required).toBe(true)
    expect(email.validation.pattern).toBe('^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$')

    const description = form.sections.find(s => s.id === 'description')!.fields[0]
    expect(description.type).toBe('textarea')
    expect(description.required).toBe(false)
    expect(description.validation.maxLength).toBe(2000)
  })

  // Identifiant client, wilaya et mode de paiement sont des faits de la
  // commande que la boutique possède déjà — et deux d'entre eux sont des
  // features du modèle. Les faire saisir au client final ajouterait de la
  // friction et lui donnerait prise sur la prédiction.
  it('décrit chaque champ boutique avec son type et ses contraintes', () => {
    const form = buildReturnForm(vendor, policy())
    const byId = (id: string) => form.merchant_fields.find(f => f.id === id)!

    const customerId = byId('customer_id')
    expect(customerId.type).toBe('text')
    expect(customerId.validation.maxLength).toBe(100)

    const wilaya = byId('customer_wilaya')
    expect(wilaya.type).toBe('text')
    expect(wilaya.validation.maxLength).toBe(100)

    const payment = byId('payment_method')
    expect(payment.type).toBe('select')
    // Les options restent exposées : une boutique peut vouloir laisser son
    // propre back-office choisir la valeur dans une liste contrôlée.
    expect(payment.options.map(o => o.value)).toEqual([...PAYMENT_METHODS])
    expect(payment.options[0].label).toBe(PAYMENT_METHOD_LABELS[PAYMENT_METHODS[0]])

    expect(byId('shipping_method').type).toBe('text')

    const cost = byId('shipping_cost')
    expect(cost.type).toBe('number')
    expect(cost.validation.min).toBe(0)

    for (const f of form.merchant_fields) expect(f.source).toBe('merchant')
  })

  // Le point clé : un moteur de rendu qui boucle naïvement sur `sections` ne
  // peut pas afficher un champ boutique, puisqu'il ne s'y trouve pas. La règle
  // est structurelle, elle ne dépend plus de la vigilance de l'intégrateur.
  it("garde les champs boutique hors des sections à afficher", () => {
    const form = buildReturnForm(vendor, policy())
    const rendus = form.sections.flatMap(s => s.fields)

    expect(merchantFieldIds(form)).toEqual([
      'customer_id',
      'customer_wilaya',
      'payment_method',
      'shipping_method',
      'shipping_cost',
    ])
    expect(rendus.some(f => f.source === 'merchant')).toBe(false)

    // Ce qui reste à saisir : son identité, son produit, et son problème.
    expect(rendus.map(f => f.id)).toEqual([
      'order_id',
      'customer_name',
      'customer_email',
      'customer_phone',
      'product_name',
      'order_date',
      'reason',
      'desired_resolution',
      'description',
    ])

    // `allFields` reste la vue complète, pour la validation à la soumission.
    expect(allFields(form)).toHaveLength(rendus.length + form.merchant_fields.length)
  })

  // Un champ boutique n'est jamais requis du client : la boutique peut ne pas
  // avoir l'information, auquel cas l'ingestion retombe sur son repli neutre.
  it('ne rend jamais un champ boutique obligatoire', () => {
    // La boutique peut ne pas avoir l'information : l'exiger fermerait le
    // formulaire à un client qui n'a aucun moyen de la fournir.
    for (const f of buildReturnForm(vendor, policy()).merchant_fields) {
      expect(f.required).toBe(false)
    }
  })

  it('ne dépend d’aucun champ du vendeur autre que le nom', () => {
    const form = buildReturnForm({ companyName: 'Caba Store', website: null }, policy())
    expect(form.meta.shop.slug).toBe('caba-store')
    expect(form.meta.shop.website).toBeNull()
  })
})
