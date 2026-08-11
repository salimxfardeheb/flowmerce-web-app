// C-04 — Prédiction ≠ vérité terrain, côté web app.
//
// `buildReclamationInputFromClaim` construisait le label du dataset à partir de
// `claim.aiDecision`, colonne qui contient la prédiction du modèle sauf
// override vendeur explicite. Les auto-approbations AI_AUTO et les auto-rejets
// y contribuaient donc à 100 % : le modèle réapprenait ses propres sorties.
//
// La colonne `Claim.resolutionSource` porte désormais l'origine de la décision,
// et voyage jusqu'au dataset sous la forme `Label_Source`.

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: { ML_API_URL: 'https://ml.example.com', ML_INTERNAL_SECRET: 'test-secret' },
}))

import {
  DECISION_SOURCE_TO_LABEL_SOURCE,
  GROUND_TRUTH_SOURCES,
  buildReclamationInputFromClaim,
  isGroundTruth,
} from '@/lib/services/ml'

const claimBase = {
  orderId:     'CMD-1',
  customerId:  'CUST-1',
  fraudScore:  12,
  productName: 'Nike Air Max',
  orderDate:   new Date('2026-07-01'),
  createdAt:   new Date('2026-07-05'),
  type:        'EXCHANGE' as const,
  aiDecision:  'Exchange',
  vendor:      { companyName: 'Caba Store' },
  mlInput:     { Return_Reason: 'Mauvaise taille' },
}

describe('origine du label', () => {
  it('une décision du modèle part au dataset marquée comme telle', () => {
    const row = buildReclamationInputFromClaim({ ...claimBase, resolutionSource: 'MODEL' })

    expect(row.Resolution).toBe('Exchange')
    expect(row.Label_Source).toBe('model')
  })

  it('une décision humaine est marquée human', () => {
    const row = buildReclamationInputFromClaim({ ...claimBase, resolutionSource: 'HUMAN' })

    expect(row.Label_Source).toBe('human')
  })

  it('un refus de politique est marqué policy_rule', () => {
    const row = buildReclamationInputFromClaim({
      ...claimBase, aiDecision: 'Reject', resolutionSource: 'POLICY_RULE',
    })

    expect(row.Label_Source).toBe('policy_rule')
  })

  it('une origine inconnue est traitée comme un label de modèle', () => {
    // Le doute joue contre l'entraînement : une claim antérieure à la colonne
    // ne doit pas se faire passer pour une décision humaine.
    expect(buildReclamationInputFromClaim({ ...claimBase, resolutionSource: null }).Label_Source)
      .toBe('model')
    expect(buildReclamationInputFromClaim({ ...claimBase, resolutionSource: 'INCONNU' }).Label_Source)
      .toBe('model')
  })
})

describe('éligibilité à la vérité terrain', () => {
  it('une prédiction ML seule n\'est jamais une vérité terrain', () => {
    expect(isGroundTruth('MODEL')).toBe(false)
    expect(isGroundTruth(null)).toBe(false)
    expect(isGroundTruth(undefined)).toBe(false)
  })

  it('une décision humaine ou une règle métier en est une', () => {
    expect(isGroundTruth('HUMAN')).toBe(true)
    expect(isGroundTruth('POLICY_RULE')).toBe(true)
  })

  it('MODEL est exclu de la liste des sources exportables', () => {
    expect(GROUND_TRUTH_SOURCES).not.toContain('MODEL')
    expect([...GROUND_TRUTH_SOURCES].sort()).toEqual(['HUMAN', 'POLICY_RULE'])
  })

  it('la correspondance base → dataset couvre les trois origines', () => {
    expect(DECISION_SOURCE_TO_LABEL_SOURCE).toEqual({
      HUMAN:       'human',
      POLICY_RULE: 'policy_rule',
      MODEL:       'model',
    })
  })
})
