import { describe, it, expect } from 'vitest'
import type { ReturnPolicy, Vendor } from '@prisma/client'
import {
  buildReturnForm,
  slugify,
  RETURN_FORM_VERSION,
} from '@/lib/services/return-form-builder'
import { RETURN_REASONS, CLAIM_TYPES } from '@/lib/constants'

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

  it('ne dépend d’aucun champ du vendeur autre que le nom', () => {
    const form = buildReturnForm({ companyName: 'Caba Store', website: null }, policy())
    expect(form.meta.shop.slug).toBe('caba-store')
    expect(form.meta.shop.website).toBeNull()
  })
})
