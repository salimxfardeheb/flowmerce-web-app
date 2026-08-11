// C-02 — Contrat de features et traduction du vocabulaire.
//
// L'audit avait mesuré que six des huit groupes catégoriels arrivaient au
// modèle sous forme de vecteur nul : la web app émettait `Clothing` là où
// l'encodeur avait appris `Vêtements`, `Cash on Delivery` pour
// `Espèces livraison`, `Standard` pour un transporteur, `Unknown` pour une
// wilaya. Ces tests figent la traduction et détectent toute nouvelle dérive.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

import {
  FEATURE_CONTRACT,
  FEATURE_CONTRACT_VERSION,
  PAYMENT_METHOD_TO_MODEL,
  PRODUCT_CATEGORY_TO_MODEL,
  UNKNOWN_CATEGORY,
  diagnoseCategories,
  isKnownCategory,
  normalizeCustomerGender,
  normalizeCustomerWilaya,
  normalizePaymentMethod,
  normalizeProductCategory,
  normalizeReturnReason,
  normalizeShippingMethod,
} from '@/lib/ml-contract'
import { PAYMENT_METHODS, RETURN_REASONS, VENDOR_CATEGORIES } from '@/lib/constants'

// ─────────────────────────────────────────────────────────────
// Le contrat lui-même
// ─────────────────────────────────────────────────────────────
describe('contrat de features', () => {
  it('déclare une version et les 8 groupes catégoriels du modèle', () => {
    expect(FEATURE_CONTRACT_VERSION).toMatch(/^[0-9a-f]{16}$/)
    expect(Object.keys(FEATURE_CONTRACT.categorical_features).sort()).toEqual([
      'Customer_Gender', 'Customer_Wilaya', 'Payment_Method', 'Product_Category',
      'Return_Reason', 'Shipping_Method', 'Shop_Name', 'reason_x_policy',
    ])
  })

  // Détection de dérive entre les deux dépôts. Ignoré si Flowmerce-ML n'est pas
  // présent à côté (CI de la seule web app).
  const mlContract = path.resolve(
    process.cwd(), '..', 'Flowmerce-ML', 'contracts', 'feature_contract.json',
  )
  const it_ = fs.existsSync(mlContract) ? it : it.skip

  it_('est identique au contrat publié par le dépôt ML', () => {
    const source = JSON.parse(fs.readFileSync(mlContract, 'utf-8'))

    expect(FEATURE_CONTRACT).toEqual(source)
  })
})

// ─────────────────────────────────────────────────────────────
// Les tables de traduction pointent vers des modalités réelles
// ─────────────────────────────────────────────────────────────
describe('tables de traduction', () => {
  it('ne mappe que vers des catégories réellement apprises', () => {
    for (const [source, cible] of Object.entries(PRODUCT_CATEGORY_TO_MODEL)) {
      if (cible === null) continue
      expect(isKnownCategory('Product_Category', cible), `${source} → ${cible}`).toBe(true)
    }
    for (const [source, cible] of Object.entries(PAYMENT_METHOD_TO_MODEL)) {
      expect(isKnownCategory('Payment_Method', cible), `${source} → ${cible}`).toBe(true)
    }
  })

  it('couvre chaque catégorie vendeur (Books excepté, absent du modèle)', () => {
    for (const c of VENDOR_CATEGORIES) {
      const attendu = c === 'Books' ? UNKNOWN_CATEGORY : PRODUCT_CATEGORY_TO_MODEL[c]
      expect(normalizeProductCategory(c)).toBe(attendu)
    }
  })

  it('couvre chaque moyen de paiement du produit', () => {
    for (const p of PAYMENT_METHODS) {
      expect(isKnownCategory('Payment_Method', normalizePaymentMethod(p))).toBe(true)
    }
  })

  it('couvre chaque motif de retour du produit', () => {
    for (const r of RETURN_REASONS) {
      expect(isKnownCategory('Return_Reason', normalizeReturnReason(r))).toBe(true)
    }
  })
})

// ─────────────────────────────────────────────────────────────
// Normalisateurs
// ─────────────────────────────────────────────────────────────
describe('normalisation des catégories', () => {
  it('traduit les catégories produit vers le vocabulaire du modèle', () => {
    expect(normalizeProductCategory('Clothing')).toBe('Vêtements')
    expect(normalizeProductCategory('Electronics')).toBe('Électronique')
    expect(normalizeProductCategory('Appliances')).toBe('Électroménager')
  })

  it('accepte déjà le vocabulaire du modèle, accents et casse compris', () => {
    expect(normalizeProductCategory('Vêtements')).toBe('Vêtements')
    expect(normalizeProductCategory('vetements')).toBe('Vêtements')
    expect(normalizeProductCategory('ÉLECTRONIQUE')).toBe('Électronique')
  })

  it('signale une catégorie sans équivalent plutôt que d\'en inventer un', () => {
    expect(normalizeProductCategory('Books')).toBe(UNKNOWN_CATEGORY)
    expect(normalizeProductCategory('Bijoux')).toBe(UNKNOWN_CATEGORY)
    expect(normalizeProductCategory(null)).toBe(UNKNOWN_CATEGORY)
  })

  it('traduit les moyens de paiement', () => {
    expect(normalizePaymentMethod('Cash on Delivery')).toBe('Espèces livraison')
    expect(normalizePaymentMethod('Card')).toBe('Edahabia')
    expect(normalizePaymentMethod('CCP')).toBe('CCP')
    expect(normalizePaymentMethod('Bank Transfer')).toBe('Virement')
    expect(normalizePaymentMethod('Unknown')).toBe(UNKNOWN_CATEGORY)
  })

  it('normalise les transporteurs connus, conserve les autres', () => {
    expect(normalizeShippingMethod('Yalidine')).toBe('Yalidine')
    expect(normalizeShippingMethod('yalidine')).toBe('Yalidine')
    expect(normalizeShippingMethod('zr express')).toBe('ZR Express')
    // Feature en cours de retrait : une valeur inconnue est transmise telle
    // quelle plutôt qu'écrasée — le dataset garde l'information.
    expect(normalizeShippingMethod('Standard')).toBe('Standard')
    expect(normalizeShippingMethod('Nouveau Transporteur')).toBe('Nouveau Transporteur')
    expect(normalizeShippingMethod('')).toBe(UNKNOWN_CATEGORY)
  })

  it('traduit le genre', () => {
    expect(normalizeCustomerGender('M')).toBe('Male')
    expect(normalizeCustomerGender('homme')).toBe('Male')
    expect(normalizeCustomerGender('Female')).toBe('Female')
    expect(normalizeCustomerGender('femme')).toBe('Female')
    expect(normalizeCustomerGender('Unknown')).toBe(UNKNOWN_CATEGORY)
    expect(normalizeCustomerGender(null)).toBe(UNKNOWN_CATEGORY)
  })
})

// ─────────────────────────────────────────────────────────────
// Diagnostic — les mêmes règles que côté ML
// ─────────────────────────────────────────────────────────────
describe('diagnoseCategories', () => {
  const payloadAligne = {
    Customer_Gender:  'Female',
    Customer_Wilaya:  'Alger',
    Shop_Name:        'Shop_001',
    Product_Category: 'Vêtements',
    Payment_Method:   'Espèces livraison',
    Shipping_Method:  'Yalidine',
    Return_Reason:    'Mauvaise taille',
  }

  it('ne signale rien sur un payload aligné', () => {
    const d = diagnoseCategories(payloadAligne)

    expect(d.unknown).toEqual({})
    expect(d.alerts).toEqual([])
    expect(d.coverage).toBe(1)
  })

  it('signale les six groupes que l\'ancien vocabulaire faisait tomber à zéro', () => {
    const d = diagnoseCategories({
      Customer_Gender:  'Unknown',
      Customer_Wilaya:  'Unknown',
      Shop_Name:        'ia-store',
      Product_Category: 'Clothing',
      Payment_Method:   'Unknown',
      Shipping_Method:  'Standard',
      Return_Reason:    'Mauvaise taille',
    })

    expect(Object.keys(d.unknown).sort()).toEqual([
      'Customer_Gender', 'Customer_Wilaya', 'Payment_Method',
      'Product_Category', 'Shipping_Method', 'Shop_Name',
    ])
    // Shop_Name et Shipping_Method sont des features en cours de retrait :
    // divergences documentées, pas des anomalies. Les quatre autres le restent.
    expect(d.alerts.sort()).toEqual([
      'Customer_Gender', 'Customer_Wilaya', 'Payment_Method', 'Product_Category',
    ])
  })

  it('ne compte pas les features en retrait comme des anomalies', () => {
    const d = diagnoseCategories({
      ...payloadAligne,
      Shop_Name:       'Ma Boutique',
      Shipping_Method: 'Nouveau Transporteur',
    })

    expect(d.unknown).toEqual({
      Shop_Name:       'Ma Boutique',
      Shipping_Method: 'Nouveau Transporteur',
    })
    expect(d.alerts).toEqual([])
  })
})
