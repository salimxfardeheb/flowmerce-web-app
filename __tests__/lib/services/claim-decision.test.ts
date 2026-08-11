// C-05 — Application de la décision : un seul chemin, idempotent.
//
// Avant correction, `/api/cron/retry-ml` écrivait la prédiction récupérée mais
// jamais le statut, et ne notifiait personne : une réclamation dont l'appel ML
// avait échoué à la soumission restait PENDING pour toujours, même après une
// reprise réussie. La règle métier n'existait que dans `ingestClaim`.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = {
  claim: {
    update:     vi.fn(),
    updateMany: vi.fn(),
  },
  returnPolicy: {
    findUnique: vi.fn(),
  },
}

const mockNotify = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/services/notification', () => ({ notifyCustomer: mockNotify }))
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const policy = {
  validationMode:          'AI_AUTO' as const,
  maxClaimDays:            14,
  nonRefundableCategories: [] as string[],
  exchangeOnlyCategories:  [] as string[],
  acceptedTypes:           ['EXCHANGE', 'REFUND', 'REPAIR'],
}

const claimEnAttente = {
  id:            'claim-1',
  vendorId:      'vendor-1',
  status:        'PENDING' as const,
  type:          'EXCHANGE' as const,
  orderDate:     new Date('2026-08-01'),
  prediction:    { shopName: 'Ma Boutique' },
  customerName:  'Client Test',
  customerEmail: 'client@example.com',
  customerPhone: null,
  orderId:       'order-1',
}

function predictionML(resolution: string) {
  return {
    resolution: {
      prediction:    resolution,
      probabilities: { [resolution]: 0.9 },
    },
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.claim.update.mockResolvedValue({})
  mockPrisma.claim.updateMany.mockResolvedValue({ count: 1 })
})

describe('applyMLDecision', () => {
  // ── Décision nominale ───────────────────────────────────────────────────
  it('auto-rejette sur Reject, écrit le statut et notifie', async () => {
    const { applyMLDecision } = await import('@/lib/services/claim-decision')
    const r = await applyMLDecision(claimEnAttente, predictionML('Reject'), {
      returnPolicy: policy as never, origin: 'ingestion',
    })

    expect(r.status).toBe('REJECTED')
    expect(r.autoRejected).toBe(true)
    expect(r.applied).toBe(true)
    expect(mockPrisma.claim.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'claim-1', status: 'PENDING' },
        data:  expect.objectContaining({ status: 'REJECTED' }),
      }),
    )
    expect(mockNotify).toHaveBeenCalledTimes(1)
  })

  it('auto-approuve en AI_AUTO sur Exchange', async () => {
    const { applyMLDecision } = await import('@/lib/services/claim-decision')
    const r = await applyMLDecision(claimEnAttente, predictionML('Exchange'), {
      returnPolicy: policy as never, origin: 'ingestion',
    })

    expect(r.status).toBe('APPROVED')
    expect(r.autoApproved).toBe(true)
    expect(mockNotify).toHaveBeenCalledTimes(1)
  })

  it('laisse PENDING en mode MANUAL, sans notification', async () => {
    const { applyMLDecision } = await import('@/lib/services/claim-decision')
    const r = await applyMLDecision(claimEnAttente, predictionML('Exchange'), {
      returnPolicy: { ...policy, validationMode: 'MANUAL' } as never, origin: 'ingestion',
    })

    expect(r.status).toBe('PENDING')
    expect(r.autoApproved).toBe(false)
    expect(mockPrisma.claim.updateMany).not.toHaveBeenCalled()
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it("n'auto-approuve jamais un remboursement, même en AI_AUTO", async () => {
    const { applyMLDecision } = await import('@/lib/services/claim-decision')
    const r = await applyMLDecision(
      { ...claimEnAttente, type: 'REFUND' }, predictionML('Repair'),
      { returnPolicy: policy as never, origin: 'ingestion' },
    )

    expect(r.status).toBe('PENDING')
    expect(mockNotify).not.toHaveBeenCalled()
  })

  // ── Traçabilité de l'origine (C-04) ─────────────────────────────────────
  it('marque la décision comme venant du modèle', async () => {
    const { applyMLDecision } = await import('@/lib/services/claim-decision')
    await applyMLDecision(claimEnAttente, predictionML('Exchange'), {
      returnPolicy: policy as never, origin: 'ingestion',
    })

    expect(mockPrisma.claim.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ resolutionSource: 'MODEL' }),
      }),
    )
  })

  // ── Reprise ─────────────────────────────────────────────────────────────
  it('produit le même état final depuis la reprise que depuis l\'ingestion', async () => {
    const { applyMLDecision } = await import('@/lib/services/claim-decision')

    const parIngestion = await applyMLDecision(claimEnAttente, predictionML('Reject'), {
      returnPolicy: policy as never, origin: 'ingestion',
    })
    vi.clearAllMocks()
    mockPrisma.claim.update.mockResolvedValue({})
    mockPrisma.claim.updateMany.mockResolvedValue({ count: 1 })

    const parReprise = await applyMLDecision(claimEnAttente, predictionML('Reject'), {
      returnPolicy: policy as never, origin: 'retry',
    })

    expect(parReprise.status).toBe(parIngestion.status)
    expect(parReprise.autoRejected).toBe(parIngestion.autoRejected)
    expect(mockNotify).toHaveBeenCalledTimes(1)
  })

  it('remet mlFailed à false quand la reprise aboutit', async () => {
    const { applyMLDecision } = await import('@/lib/services/claim-decision')
    await applyMLDecision(claimEnAttente, predictionML('Exchange'), {
      returnPolicy: policy as never, origin: 'retry',
    })

    expect(mockPrisma.claim.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mlFailed: false }),
      }),
    )
  })

  // ── Idempotence ─────────────────────────────────────────────────────────
  it('ne retouche ni ne renotifie une réclamation déjà tranchée', async () => {
    // Deuxième passage : la transition conditionnelle ne trouve plus de
    // réclamation PENDING — count = 0.
    mockPrisma.claim.updateMany.mockResolvedValue({ count: 0 })

    const { applyMLDecision } = await import('@/lib/services/claim-decision')
    const r = await applyMLDecision(
      { ...claimEnAttente, status: 'REJECTED' }, predictionML('Reject'),
      { returnPolicy: policy as never, origin: 'retry' },
    )

    expect(r.applied).toBe(false)
    expect(r.autoRejected).toBe(false)
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('deux reprises consécutives ne notifient qu\'une seule fois', async () => {
    const { applyMLDecision } = await import('@/lib/services/claim-decision')

    mockPrisma.claim.updateMany.mockResolvedValueOnce({ count: 1 })
    await applyMLDecision(claimEnAttente, predictionML('Reject'), {
      returnPolicy: policy as never, origin: 'retry',
    })

    mockPrisma.claim.updateMany.mockResolvedValueOnce({ count: 0 })
    await applyMLDecision(claimEnAttente, predictionML('Reject'), {
      returnPolicy: policy as never, origin: 'retry',
    })

    expect(mockNotify).toHaveBeenCalledTimes(1)
  })

  it('une décision vendeur prise entre-temps prime sur la reprise', async () => {
    // Le vendeur a approuvé pendant que le ML était indisponible : la reprise
    // ne doit pas refuser la réclamation derrière lui.
    mockPrisma.claim.updateMany.mockResolvedValue({ count: 0 })

    const { applyMLDecision } = await import('@/lib/services/claim-decision')
    const r = await applyMLDecision(
      { ...claimEnAttente, status: 'APPROVED' }, predictionML('Reject'),
      { returnPolicy: policy as never, origin: 'retry' },
    )

    expect(r.applied).toBe(false)
    expect(r.status).toBe('APPROVED')
    expect(mockNotify).not.toHaveBeenCalled()
  })

  // ── P1.1 — La recommandation respecte les résolutions autorisées ────────
  it('persiste la meilleure résolution autorisée, pas la classe dominante', async () => {
    // Le vendeur n'offre ni réparation ni refus ; le modèle place Repair en tête.
    const { applyMLDecision } = await import('@/lib/services/claim-decision')
    const r = await applyMLDecision(
      claimEnAttente,
      {
        resolution: {
          prediction:    'Repair',
          probabilities: { Repair: 0.55, Refund: 0.30, Exchange: 0.15, Reject: 0 },
        },
      } as never,
      {
        returnPolicy: { ...policy, acceptedTypes: ['REFUND', 'EXCHANGE'] } as never,
        origin: 'ingestion',
      },
    )

    expect(r.decision).toBe('Refund')
    expect(r.aiScore).toBe(0.30)          // score du modèle, non renormalisé
    expect(mockPrisma.claim.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ aiDecision: 'Refund', aiScore: 0.30 }),
      }),
    )
  })

  it('trace l\'arbitrage dans le JSON de prédiction', async () => {
    const { applyMLDecision } = await import('@/lib/services/claim-decision')
    await applyMLDecision(
      claimEnAttente,
      {
        resolution: {
          prediction:    'Repair',
          probabilities: { Repair: 0.55, Refund: 0.30, Exchange: 0.15 },
        },
      } as never,
      {
        returnPolicy: { ...policy, acceptedTypes: ['REFUND', 'EXCHANGE'] } as never,
        origin: 'ingestion',
      },
    )

    const data = mockPrisma.claim.update.mock.calls[0][0].data
    expect(data.prediction.recommendation).toMatchObject({
      resolution: 'Refund',
      score:      0.30,
      mlTop:      'Repair',
      mlTopScore: 0.55,
      filtered:   true,
      allowed:    ['Refund', 'Exchange'],
    })
  })

  it('n\'auto-approuve jamais une résolution que le vendeur n\'offre pas', async () => {
    // Mode AI_AUTO : sans filtrage, Repair aurait été approuvé automatiquement
    // chez un vendeur qui ne répare pas.
    const { applyMLDecision } = await import('@/lib/services/claim-decision')
    const r = await applyMLDecision(
      claimEnAttente,
      {
        resolution: {
          prediction:    'Repair',
          probabilities: { Repair: 0.90, Exchange: 0.10 },
        },
      } as never,
      {
        returnPolicy: { ...policy, acceptedTypes: ['EXCHANGE'] } as never,
        origin: 'ingestion',
      },
    )

    expect(r.decision).toBe('Exchange')
    expect(r.autoApproved).toBe(true)
    expect(mockNotify.mock.calls[0][0]).toMatchObject({ aiDecision: 'Exchange' })
  })

  it('laisse la réclamation au vendeur quand aucune résolution n\'est autorisée', async () => {
    const { applyMLDecision } = await import('@/lib/services/claim-decision')
    const r = await applyMLDecision(
      claimEnAttente,
      {
        resolution: { prediction: 'Repair', probabilities: { Repair: 0.90, Reject: 0.10 } },
      } as never,
      {
        returnPolicy: { ...policy, acceptedTypes: ['REFUND', 'EXCHANGE'] } as never,
        origin: 'ingestion',
      },
    )

    expect(r.decision).toBeNull()
    expect(r.aiScore).toBeNull()
    expect(r.status).toBe('PENDING')
    expect(r.autoApproved).toBe(false)
    expect(r.autoRejected).toBe(false)
    // Aucune transition de statut, aucune notification : le vendeur tranche.
    expect(mockPrisma.claim.updateMany).not.toHaveBeenCalled()
    expect(mockNotify).not.toHaveBeenCalled()

    const data = mockPrisma.claim.update.mock.calls[0][0].data
    expect(data.aiDecision).toBeNull()
    expect(data.prediction.recommendation.reason).toBe('NO_ALLOWED_RESOLUTION')
    // Rien n'a été décidé : l'origine de décision reste vide (C-04).
    expect(data.resolutionSource).toBeUndefined()
  })

  it('la reprise applique le même filtrage que l\'ingestion', async () => {
    const { applyMLDecision } = await import('@/lib/services/claim-decision')
    const prediction = {
      resolution: {
        prediction:    'Repair',
        probabilities: { Repair: 0.55, Refund: 0.30, Exchange: 0.15 },
      },
    } as never
    const opts = {
      returnPolicy: { ...policy, acceptedTypes: ['REFUND', 'EXCHANGE'] } as never,
    }

    const parIngestion = await applyMLDecision(claimEnAttente, prediction, {
      ...opts, origin: 'ingestion',
    })
    const parReprise = await applyMLDecision(claimEnAttente, prediction, {
      ...opts, origin: 'retry',
    })

    expect(parReprise.decision).toBe(parIngestion.decision)
    expect(parReprise.aiScore).toBe(parIngestion.aiScore)
  })

  it('charge la politique du vendeur de la réclamation, jamais d\'un autre', async () => {
    // Isolation multi-tenant : `vendorId` vient de la ligne en base.
    mockPrisma.returnPolicy.findUnique.mockResolvedValue({
      ...policy, acceptedTypes: ['EXCHANGE'],
    })

    const { applyMLDecision } = await import('@/lib/services/claim-decision')
    const r = await applyMLDecision(
      { ...claimEnAttente, vendorId: 'vendor-42' },
      {
        resolution: { prediction: 'Repair', probabilities: { Repair: 0.8, Exchange: 0.2 } },
      } as never,
      { origin: 'retry' },   // pas de policy fournie → chargement en base
    )

    expect(mockPrisma.returnPolicy.findUnique).toHaveBeenCalledWith({
      where: { vendorId: 'vendor-42' },
    })
    expect(r.decision).toBe('Exchange')
  })

  // ── Échec de notification ───────────────────────────────────────────────
  it('applique la décision même si la notification échoue', async () => {
    mockNotify.mockRejectedValueOnce(new Error('SMTP down'))

    const { applyMLDecision } = await import('@/lib/services/claim-decision')
    const r = await applyMLDecision(claimEnAttente, predictionML('Reject'), {
      returnPolicy: policy as never, origin: 'retry',
    })

    expect(r.status).toBe('REJECTED')
    expect(r.applied).toBe(true)
  })
})
