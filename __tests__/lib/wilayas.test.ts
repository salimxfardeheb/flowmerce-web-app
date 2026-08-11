// Référentiel des wilayas — normalisation de l'entrée `Customer_Wilaya`.
//
// Point de conception vérifié ici : la normalisation se fait contre le
// référentiel **produit** (58 wilayas), pas contre le vocabulaire du modèle
// (24 apprises). Une wilaya que le modèle ne connaît pas encore est transmise
// sous sa forme canonique et signalée comme hors vocabulaire — elle n'est plus
// écrasée en `Unknown`, ce qui détruisait l'information avant qu'elle
// n'atteigne le dataset.

import { describe, it, expect } from 'vitest'

import { WILAYAS, WILAYA_ALIASES, WILAYA_NAMES } from '@/lib/wilayas'
import {
  FEATURE_CONTRACT,
  UNKNOWN_CATEGORY,
  diagnoseCategories,
  normalizeCustomerWilaya,
} from '@/lib/ml-contract'

// ─────────────────────────────────────────────────────────────
// Intégrité du référentiel
// ─────────────────────────────────────────────────────────────
describe('référentiel des wilayas', () => {
  it('contient les 58 wilayas du découpage administratif', () => {
    expect(WILAYAS).toHaveLength(58)
  })

  it('numérote de 01 à 58 sans trou ni doublon', () => {
    expect(WILAYAS.map((w) => w.code)).toEqual(
      Array.from({ length: 58 }, (_, i) => String(i + 1).padStart(2, '0')),
    )
  })

  it("n'a aucun nom en double", () => {
    expect(new Set(WILAYA_NAMES).size).toBe(58)
  })

  it('rattache chaque alias à une wilaya réelle', () => {
    for (const [alias, parent] of Object.entries(WILAYA_ALIASES)) {
      expect(WILAYA_NAMES, `${alias} → ${parent}`).toContain(parent)
    }
  })

  // Garde-fou de non-régression : les 24 wilayas apprises par le modèle doivent
  // toutes figurer au référentiel, à l'orthographe près. Sans cela, une wilaya
  // aujourd'hui reconnue deviendrait silencieusement hors vocabulaire.
  it('couvre toutes les wilayas déjà apprises par le modèle', () => {
    const apprises = FEATURE_CONTRACT.categorical_features.Customer_Wilaya.categories

    for (const w of apprises) {
      expect(WILAYA_NAMES, `${w} absente du référentiel`).toContain(w)
    }
  })
})

// ─────────────────────────────────────────────────────────────
// Normalisation
// ─────────────────────────────────────────────────────────────
describe('normalizeCustomerWilaya', () => {
  it('accepte le nom exact', () => {
    expect(normalizeCustomerWilaya('Alger')).toBe('Alger')
    expect(normalizeCustomerWilaya('Tamanrasset')).toBe('Tamanrasset')
  })

  it('accepte la casse et les accents approximatifs', () => {
    expect(normalizeCustomerWilaya('alger')).toBe('Alger')
    expect(normalizeCustomerWilaya('bejaia')).toBe('Béjaïa')
    expect(normalizeCustomerWilaya('setif')).toBe('Sétif')
    expect(normalizeCustomerWilaya('BORDJ BOU ARRERIDJ')).toBe('Bordj Bou Arréridj')
    expect(normalizeCustomerWilaya('ain temouchent')).toBe('Aïn Témouchent')
    expect(normalizeCustomerWilaya('m sila')).toBe("M'Sila")
  })

  it('accepte le code officiel', () => {
    expect(normalizeCustomerWilaya('16')).toBe('Alger')
    expect(normalizeCustomerWilaya('06')).toBe('Béjaïa')
    expect(normalizeCustomerWilaya('6')).toBe('Béjaïa')
    expect(normalizeCustomerWilaya('58')).toBe('El Meniaa')
  })

  it('rejette un code hors plage', () => {
    expect(normalizeCustomerWilaya('00')).toBe(UNKNOWN_CATEGORY)
    expect(normalizeCustomerWilaya('59')).toBe(UNKNOWN_CATEGORY)
    expect(normalizeCustomerWilaya('99')).toBe(UNKNOWN_CATEGORY)
  })

  it('rattache une circonscription déléguée à sa wilaya de tutelle', () => {
    // Ce ne sont pas des wilayas : les traiter comme telles fragmenterait la
    // donnée — le modèle verrait deux territoires sans rapport.
    expect(normalizeCustomerWilaya('Bou Saâda')).toBe("M'Sila")
    expect(normalizeCustomerWilaya('bou saada')).toBe("M'Sila")
    expect(normalizeCustomerWilaya('Messaad')).toBe('Djelfa')
    expect(normalizeCustomerWilaya('Aflou')).toBe('Laghouat')
    expect(normalizeCustomerWilaya('Barika')).toBe('Batna')
    expect(normalizeCustomerWilaya('El Abiodh Sidi Cheikh')).toBe('El Bayadh')
  })

  it('reconnaît les 10 wilayas créées en 2019', () => {
    for (const nom of [
      'Timimoun', 'Bordj Badji Mokhtar', 'Ouled Djellal', 'Béni Abbès',
      'In Salah', 'In Guezzam', 'Touggourt', 'Djanet', "El M'Ghair", 'El Meniaa',
    ]) {
      expect(normalizeCustomerWilaya(nom)).toBe(nom)
    }
  })

  it('normalise les 58 wilayas vers elles-mêmes', () => {
    for (const w of WILAYAS) {
      expect(normalizeCustomerWilaya(w.name), w.name).toBe(w.name)
      expect(normalizeCustomerWilaya(w.code), w.code).toBe(w.name)
    }
  })

  it('renvoie Unknown sur une saisie non identifiable', () => {
    expect(normalizeCustomerWilaya('Unknown')).toBe(UNKNOWN_CATEGORY)
    expect(normalizeCustomerWilaya('Paris')).toBe(UNKNOWN_CATEGORY)
    expect(normalizeCustomerWilaya('')).toBe(UNKNOWN_CATEGORY)
    expect(normalizeCustomerWilaya(null)).toBe(UNKNOWN_CATEGORY)
  })
})

// ─────────────────────────────────────────────────────────────
// Articulation avec le contrat du modèle
// ─────────────────────────────────────────────────────────────
describe('wilayas hors vocabulaire du modèle', () => {
  const apprises = new Set(
    FEATURE_CONTRACT.categorical_features.Customer_Wilaya.categories,
  )

  it('le référentiel dépasse largement ce que le modèle a appris', () => {
    expect(apprises.size).toBe(24)
    expect(WILAYA_NAMES.filter((w) => !apprises.has(w)).length).toBe(34)
  })

  it('transmet la wilaya canonique même quand le modèle l\'ignore', () => {
    // Adrar n'est pas dans le dataset d'entraînement.
    expect(apprises.has('Adrar')).toBe(false)
    expect(normalizeCustomerWilaya('adrar')).toBe('Adrar')
  })

  it('la signale comme hors vocabulaire plutôt que de la perdre', () => {
    const d = diagnoseCategories({ Customer_Wilaya: normalizeCustomerWilaya('01') })

    expect(d.unknown).toEqual({ Customer_Wilaya: 'Adrar' })
    expect(d.alerts).toEqual(['Customer_Wilaya'])
  })

  it('ne signale rien pour une wilaya déjà apprise', () => {
    const d = diagnoseCategories({ Customer_Wilaya: normalizeCustomerWilaya('16') })

    expect(d.unknown).toEqual({})
    expect(d.alerts).toEqual([])
  })
})
