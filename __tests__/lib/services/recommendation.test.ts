// P1.1 — La recommandation doit respecter les résolutions autorisées par le vendeur.
//
// Défaut corrigé : `applyMLDecision` prenait la classe de score maximal du
// modèle (`resolution.prediction`) et l'écrivait telle quelle dans `aiDecision`.
// Un vendeur qui n'offre que REFUND et EXCHANGE voyait donc s'afficher
// « Réparation — Conf. 71 % », une résolution qu'il ne propose pas.
//
//   scores du modèle → résolutions autorisées → filtrage → meilleure autorisée
//
// Le score retenu reste celui du modèle : aucune renormalisation (cf. §9 de la
// spécification — 30 % reste 30 %, pas 67 % obtenus en redistribuant la masse
// des classes écartées).

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: { ML_API_URL: 'https://ml.example.com', ML_INTERNAL_SECRET: 'test-secret' },
}))

import {
  NO_ALLOWED_RESOLUTION,
  selectRecommendation,
} from '@/lib/services/claim-decision'
import type { MLPredictionOutput } from '@/lib/services/ml'

/**
 * Construit une réponse ML. `top` explicite la classe dominante quand elle ne
 * doit pas être déduite (le serveur ML renvoie les deux : argmax + probabilités).
 */
function ml(probabilities: Record<string, number>, top?: string): MLPredictionOutput {
  const argmax = top ?? Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0]
  return {
    resolution: { prediction: argmax as never, probabilities },
  } as MLPredictionOutput
}

const REFUND_EXCHANGE = ['REFUND', 'EXCHANGE']

// ═══════════════════════════════════════════════════════════════
//  Le scénario de la spécification (§13)
// ═══════════════════════════════════════════════════════════════
describe('scénario de référence', () => {
  it('recommande REFUND à 30 % quand REPAIR domine mais n\'est pas autorisé', () => {
    const r = selectRecommendation(
      ml({ Refund: 0.30, Exchange: 0.15, Repair: 0.55, Reject: 0.00 }),
      REFUND_EXCHANGE,
    )

    expect(r.ok).toBe(true)
    if (!r.ok) return

    expect(r.resolution).toBe('Refund')
    // Le score du modèle, pas un score renormalisé (qui aurait donné 0.67).
    expect(r.score).toBe(0.30)
    expect(r.mlTop).toBe('Repair')
    expect(r.mlTopScore).toBe(0.55)
    expect(r.filtered).toBe(true)
    expect(r.resolution).not.toBe('Repair')
  })

  it('ne renormalise jamais les scores', () => {
    const r = selectRecommendation(
      ml({ Refund: 0.30, Exchange: 0.15, Repair: 0.55 }),
      REFUND_EXCHANGE,
    )

    if (!r.ok) throw new Error('recommandation attendue')
    // 0.30 / (0.30 + 0.15) = 0.67 — la valeur qu'il ne faut PAS produire.
    expect(r.score).not.toBeCloseTo(0.667, 2)
    expect(r.score).toBe(0.30)
  })
})

// ═══════════════════════════════════════════════════════════════
//  Tests obligatoires 1 à 4 (§14)
// ═══════════════════════════════════════════════════════════════
describe('sélection de la meilleure résolution autorisée', () => {
  it('test 1 — REFUND recommandé quand il domine', () => {
    const r = selectRecommendation(
      ml({ Refund: 0.70, Exchange: 0.20, Repair: 0.10 }),
      REFUND_EXCHANGE,
    )

    if (!r.ok) throw new Error('recommandation attendue')
    expect(r.resolution).toBe('Refund')
    expect(r.score).toBe(0.70)
    expect(r.filtered).toBe(false)
  })

  it('test 2 — EXCHANGE recommandé quand il domine', () => {
    const r = selectRecommendation(
      ml({ Exchange: 0.70, Refund: 0.20, Repair: 0.10 }),
      REFUND_EXCHANGE,
    )

    if (!r.ok) throw new Error('recommandation attendue')
    expect(r.resolution).toBe('Exchange')
    expect(r.score).toBe(0.70)
    expect(r.filtered).toBe(false)
  })

  it('test 3 — la classe dominante interdite ne devient jamais la recommandation', () => {
    const r = selectRecommendation(
      ml({ Repair: 0.90, Refund: 0.06, Exchange: 0.04 }),
      REFUND_EXCHANGE,
    )

    if (!r.ok) throw new Error('recommandation attendue')
    expect(r.resolution).toBe('Refund')
    expect(r.score).toBe(0.06)
    expect(r.resolution).not.toBe('Repair')
  })

  it('test 4 — aucune classe autorisée → NO_ALLOWED_RESOLUTION', () => {
    const r = selectRecommendation(
      ml({ Repair: 0.90, Reject: 0.10 }, 'Repair'),
      REFUND_EXCHANGE,
    )

    expect(r.ok).toBe(false)
    if (r.ok) return

    expect(r.reason).toBe(NO_ALLOWED_RESOLUTION)
    expect(r.mlTop).toBe('Repair')
    expect(r.mlTopScore).toBe(0.90)
    // Ni repli sur Repair, ni choix arbitraire, ni résolution inventée.
    expect(r).not.toHaveProperty('resolution')
  })
})

// ═══════════════════════════════════════════════════════════════
//  Reject — un refus n'est pas une résolution offerte
// ═══════════════════════════════════════════════════════════════
describe('traitement de Reject', () => {
  it('un refus dominant reste un refus, même si le vendeur ne le « propose » pas', () => {
    // `acceptedTypes` ne peut structurellement pas contenir REJECT (l'enum
    // ClaimType ne le connaît pas). Le soumettre au filtre supprimerait
    // l'auto-rejet pour tous les vendeurs — règle métier existante.
    const r = selectRecommendation(
      ml({ Reject: 0.80, Refund: 0.15, Exchange: 0.05 }),
      REFUND_EXCHANGE,
    )

    if (!r.ok) throw new Error('recommandation attendue')
    expect(r.resolution).toBe('Reject')
    expect(r.score).toBe(0.80)
    expect(r.filtered).toBe(false)
  })

  it('ne gagne pas par élimination quand il n\'est pas dominant', () => {
    // Le modèle veut réparer (55 %), le vendeur ne répare pas. Reject est
    // deuxième (30 %) : il ne doit pas devenir la recommandation par défaut,
    // sinon une réclamation à réparer se transformerait en refus.
    const r = selectRecommendation(
      ml({ Repair: 0.55, Reject: 0.30, Exchange: 0.15 }),
      REFUND_EXCHANGE,
    )

    if (!r.ok) throw new Error('recommandation attendue')
    expect(r.resolution).toBe('Exchange')
    expect(r.score).toBe(0.15)
  })
})

// ═══════════════════════════════════════════════════════════════
//  Politique absente ou non configurée
// ═══════════════════════════════════════════════════════════════
describe('politique non configurée', () => {
  it('sans acceptedTypes, aucune restriction — même convention que checkReturnPolicy', () => {
    const probs = { Repair: 0.55, Refund: 0.30, Exchange: 0.15 }

    for (const acceptedTypes of [undefined, null, []]) {
      const r = selectRecommendation(ml(probs), acceptedTypes)
      if (!r.ok) throw new Error('recommandation attendue')
      expect(r.resolution).toBe('Repair')
      expect(r.filtered).toBe(false)
    }
  })

  it('une valeur inconnue dans acceptedTypes est ignorée, pas interprétée', () => {
    const r = selectRecommendation(
      ml({ Repair: 0.55, Refund: 0.30, Exchange: 0.15 }),
      ['REFUND', 'CHOSE_INCONNUE'],
    )

    if (!r.ok) throw new Error('recommandation attendue')
    expect(r.resolution).toBe('Refund')
    expect(r.allowed).toEqual(['Refund'])
  })
})

// ═══════════════════════════════════════════════════════════════
//  Isolation entre vendeurs (test 6)
// ═══════════════════════════════════════════════════════════════
describe('isolation multi-tenant', () => {
  const probs = { Repair: 0.55, Refund: 0.30, Exchange: 0.15, Reject: 0.0 }

  it('deux vendeurs, deux configurations, deux recommandations', () => {
    const vendeurA = selectRecommendation(ml(probs), ['REFUND', 'EXCHANGE'])
    const vendeurB = selectRecommendation(ml(probs), ['REPAIR'])

    if (!vendeurA.ok || !vendeurB.ok) throw new Error('recommandations attendues')
    expect(vendeurA.resolution).toBe('Refund')
    expect(vendeurB.resolution).toBe('Repair')
    // La configuration de B n'élargit jamais celle de A.
    expect(vendeurA.allowed).toEqual(['Refund', 'Exchange'])
    expect(vendeurB.allowed).toEqual(['Repair'])
  })
})

// ═══════════════════════════════════════════════════════════════
//  Contrat réel du modèle déployé — 3 classes, jamais Refund
// ═══════════════════════════════════════════════════════════════
describe('contrat réel du modèle (Exchange | Repair | Reject)', () => {
  it('un vendeur REFUND + EXCHANGE reçoit Exchange, la seule classe commune', () => {
    // Le modèle en production ne score jamais Refund : l'intersection entre ce
    // qu'il sait prédire et ce que ce vendeur offre se réduit à Exchange.
    const r = selectRecommendation(
      ml({ Exchange: 0.20, Repair: 0.70, Reject: 0.10 }),
      REFUND_EXCHANGE,
    )

    if (!r.ok) throw new Error('recommandation attendue')
    expect(r.resolution).toBe('Exchange')
    expect(r.score).toBe(0.20)
    expect(r.filtered).toBe(true)
  })

  it('un vendeur REFUND seul n\'obtient aucune recommandation du modèle actuel', () => {
    const r = selectRecommendation(
      ml({ Exchange: 0.20, Repair: 0.70, Reject: 0.10 }),
      ['REFUND'],
    )

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe(NO_ALLOWED_RESOLUTION)
  })
})
