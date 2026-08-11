// Journalisation des réponses reçues de l'API ML.
//
// Avant : seuls les échecs laissaient une trace. Une prédiction réussie
// disparaissait sans rien écrire — impossible de savoir après coup ce que le
// modèle avait répondu sur une réclamation donnée, ni de rejouer l'arbitrage
// entre sa classe dominante et la recommandation affichée (P1.1).

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: { ML_API_URL: 'https://ml.example.com', ML_INTERNAL_SECRET: 'test-secret-12345' },
}))

const mockLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
vi.mock('@/lib/logger', () => ({ log: mockLog }))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const REPONSE_ML = {
  resolution: {
    prediction:    'Repair',
    confidence:    0.5794,
    probabilities: { Exchange: 0.3011, Reject: 0.1195, Repair: 0.5794 },
  },
  risk_flag: {
    is_suspicious: true, fraud_score: 25, seuil_risque: 3, client_a_risque: false,
  },
  contract: {
    version: 'd720ad897bf56f11', degraded: true,
    unknown_categories: { Shop_Name: 'ia-store' },
    alert_features: [], expected_unknown: ['Shop_Name'],
    categorical_coverage: 0.8571,
  },
}

function repondre(body: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

/** Dernier appel de log portant ce nom d'évènement. */
function trace(niveau: 'info' | 'warn' | 'error', evenement: string) {
  const appels = mockLog[niveau].mock.calls.filter((c) => c[0] === evenement)
  return appels.length ? appels[appels.length - 1][1] : null
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('journal de la réponse ML', () => {
  it('journalise une prédiction réussie', async () => {
    repondre(REPONSE_ML)

    const { callMLPredict } = await import('@/lib/services/ml')
    await callMLPredict({ Shop_Name: 'ia-store' })

    expect(trace('info', 'ml.response')).not.toBeNull()
  })

  it('porte les probabilités de toutes les classes', async () => {
    repondre(REPONSE_ML)

    const { callMLPredict } = await import('@/lib/services/ml')
    await callMLPredict({})

    const t = trace('info', 'ml.response')!
    expect(t.prediction).toBe('Repair')
    expect(t.confidence).toBe(0.5794)
    expect(t.probabilities).toEqual({ Repair: 0.5794, Exchange: 0.3011, Reject: 0.1195 })
  })

  it('trie les classes par score décroissant', async () => {
    repondre(REPONSE_ML)

    const { callMLPredict } = await import('@/lib/services/ml')
    await callMLPredict({})

    const t = trace('info', 'ml.response')!
    expect(Object.keys(t.probabilities as object)).toEqual(['Repair', 'Exchange', 'Reject'])
  })

  it('porte l\'état du contrat de features', async () => {
    repondre(REPONSE_ML)

    const { callMLPredict } = await import('@/lib/services/ml')
    await callMLPredict({})

    expect(trace('info', 'ml.response')!.contract).toEqual({
      version:  'd720ad897bf56f11',
      degraded: true,
      coverage: 0.8571,
      unknown:  { Shop_Name: 'ia-store' },
    })
  })

  it('porte les signaux de risque', async () => {
    repondre(REPONSE_ML)

    const { callMLPredict } = await import('@/lib/services/ml')
    await callMLPredict({})

    expect(trace('info', 'ml.response')!.riskFlag).toEqual({
      isSuspicious: true, fraudScore: 25, clientARisque: false,
    })
  })

  it('mesure la latence de l\'appel', async () => {
    repondre(REPONSE_ML)

    const { callMLPredict } = await import('@/lib/services/ml')
    await callMLPredict({})

    expect(typeof trace('info', 'ml.response')!.durationMs).toBe('number')
  })

  it('rattache la trace à la réclamation et au vendeur', async () => {
    repondre(REPONSE_ML)

    const { callMLPredict } = await import('@/lib/services/ml')
    await callMLPredict({}, {
      context: { claimId: 'claim-1', vendorId: 'vendor-1', origin: 'ingestion' },
    })

    expect(trace('info', 'ml.response')).toMatchObject({
      claimId: 'claim-1', vendorId: 'vendor-1', origin: 'ingestion',
    })
  })

  it('reste lisible quand la réponse ne porte ni risk_flag ni contract', async () => {
    // Une instance ML antérieure au contrat de features reste journalisable.
    repondre({ resolution: { prediction: 'Exchange', probabilities: { Exchange: 1 } } })

    const { callMLPredict } = await import('@/lib/services/ml')
    await callMLPredict({})

    const t = trace('info', 'ml.response')!
    expect(t.prediction).toBe('Exchange')
    expect(t.confidence).toBeNull()
    expect(t.riskFlag).toBeNull()
    expect(t.contract).toBeNull()
  })

  it('ne recopie pas le payload envoyé', async () => {
    // Il contient des données client (âge, wilaya, genre) et il est déjà
    // persisté — `Claim.mlInput` / `PredictionLog.input`.
    repondre(REPONSE_ML)

    const { callMLPredict } = await import('@/lib/services/ml')
    await callMLPredict({ Customer_Age: 34, Customer_Wilaya: 'Béjaïa', Customer_Gender: 'Male' })

    const t = trace('info', 'ml.response')!
    expect(JSON.stringify(t)).not.toContain('Béjaïa')
    expect(t).not.toHaveProperty('Customer_Age')
  })
})

describe('journal des réponses en échec', () => {
  it('journalise un statut HTTP non-2xx', async () => {
    repondre({ detail: 'Internal error' }, 500)

    const { callMLPredict } = await import('@/lib/services/ml')
    await callMLPredict({}, { retries: 0, context: { claimId: 'claim-1' } })

    expect(trace('warn', 'ml.response_error')).toMatchObject({
      claimId: 'claim-1', httpStatus: 500,
    })
  })

  it('journalise une version de contrat divergente avec son contexte', async () => {
    repondre({ detail: 'Version de contrat incompatible' }, 409)

    const { callMLPredict } = await import('@/lib/services/ml')
    await callMLPredict({}, { retries: 0, context: { vendorId: 'vendor-1' } })

    expect(trace('error', 'ml.contract_version_mismatch')).toMatchObject({
      vendorId: 'vendor-1',
    })
  })

  it('journalise un service injoignable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const { callMLPredict } = await import('@/lib/services/ml')
    await callMLPredict({}, { retries: 0, context: { claimId: 'claim-1' } })

    expect(trace('warn', 'ml.response_unreachable')).toMatchObject({
      claimId: 'claim-1', timedOut: false, error: 'ECONNREFUSED',
    })
  })

  it('ne journalise aucune réponse quand le modèle n\'a pas répondu', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const { callMLPredict } = await import('@/lib/services/ml')
    await callMLPredict({}, { retries: 0 })

    expect(trace('info', 'ml.response')).toBeNull()
  })

  it('journalise une classe de prédiction hors contrat', async () => {
    repondre({ resolution: { prediction: 'Refund', probabilities: {} } })

    const { callMLPredict } = await import('@/lib/services/ml')
    await callMLPredict({}, { retries: 0, context: { claimId: 'claim-1' } })

    expect(trace('error', 'ml.invalid_prediction_class')).toMatchObject({
      claimId: 'claim-1', prediction: 'Refund',
    })
    // Réponse hors contrat : pas de trace de succès.
    expect(trace('info', 'ml.response')).toBeNull()
  })

  it('journalise les catégories inconnues avec leur contexte', async () => {
    repondre({
      ...REPONSE_ML,
      contract: {
        ...REPONSE_ML.contract,
        alert_features: ['Customer_Wilaya'],
        unknown_categories: { Customer_Wilaya: 'Adrar' },
      },
    })

    const { callMLPredict } = await import('@/lib/services/ml')
    await callMLPredict({}, { context: { claimId: 'claim-1' } })

    expect(trace('error', 'ml.unknown_categories')).toMatchObject({
      claimId: 'claim-1', features: ['Customer_Wilaya'],
    })
  })
})
