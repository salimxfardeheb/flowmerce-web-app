// P1.1 — Recommandation ≠ décision finale.
//
// Trois notions distinctes, qui doivent le rester :
//
//   ML prediction   la classe de score maximal du modèle
//   Recommendation  la meilleure résolution parmi celles que le vendeur offre
//   Final decision  ce que le vendeur tranche, et qui prime sur tout
//
// Flowmerce n'impose jamais la décision finale : la recommandation est une
// proposition, le vendeur peut la suivre ou non.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockPrisma = {
  claim:  { findUnique: vi.fn(), update: vi.fn() },
  vendor: { findUnique: vi.fn() },
}

const mockNotify = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/services/notification', () => ({ notifyCustomer: mockNotify }))
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/getSession', () => ({
  getSessionServer: vi.fn().mockResolvedValue({
    user: { id: 'user-1', role: 'VENDOR', email: 'vendeur@example.com' },
  }),
}))

// Réclamation portant la recommandation ML « Refund » (filtrée depuis Repair).
const claimAvecReco = {
  id:             'claim-1',
  vendorId:       'vendor-1',
  status:         'PENDING',
  prediction:     {
    recommendation: {
      resolution: 'Refund', score: 0.30, mlTop: 'Repair', mlTopScore: 0.55,
      filtered: true, allowed: ['Refund', 'Exchange'],
    },
  },
  aiDecision:     'Refund',
  customerName:   'Client Test',
  customerEmail:  'client@example.com',
  customerPhone:  null,
  orderId:        'order-1',
  type:           'REFUND',
  policyRejected: false,
}

function patch(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/claims/claim-1', {
    method:  'PATCH',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify(body),
  })
}

const params = Promise.resolve({ claimId: 'claim-1' })

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.claim.findUnique.mockResolvedValue(claimAvecReco)
  mockPrisma.claim.update.mockResolvedValue({
    id: 'claim-1', status: 'APPROVED', processedAt: new Date(),
  })
  mockPrisma.vendor.findUnique.mockResolvedValue({ id: 'vendor-1', userId: 'user-1' })
})

describe('PATCH /api/claims/[claimId]', () => {
  // ── Test 5 de la spécification ──────────────────────────────────────────
  it('la décision du vendeur prime sur la recommandation ML', async () => {
    const { PATCH } = await import('@/app/api/claims/[claimId]/route')
    const res = await PATCH(patch({ status: 'APPROVED', aiDecision: 'Exchange' }), { params })

    expect(res.status).toBe(200)

    const data = mockPrisma.claim.update.mock.calls[0][0].data
    // La reco était Refund ; le vendeur a choisi Exchange. C'est Exchange.
    expect(data.aiDecision).toBe('Exchange')
    expect(data.status).toBe('APPROVED')
    // …et c'est tracé comme un override, avec la reco d'origine conservée.
    expect(data.prediction.override).toMatchObject({
      resolution: 'Exchange',
      mlDecision: 'Refund',
    })
  })

  it('conserve la trace de l\'arbitrage ML sous la décision du vendeur', async () => {
    const { PATCH } = await import('@/app/api/claims/[claimId]/route')
    await PATCH(patch({ status: 'APPROVED', aiDecision: 'Exchange' }), { params })

    const data = mockPrisma.claim.update.mock.calls[0][0].data
    // Le bloc `recommendation` n'est pas écrasé : on peut toujours savoir que le
    // modèle plaçait Repair en tête et que la politique l'avait écarté.
    expect(data.prediction.recommendation).toMatchObject({
      resolution: 'Refund', mlTop: 'Repair', filtered: true,
    })
  })

  it('marque la décision comme vérité terrain humaine', async () => {
    const { PATCH } = await import('@/app/api/claims/[claimId]/route')
    await PATCH(patch({ status: 'APPROVED', aiDecision: 'Exchange' }), { params })

    const data = mockPrisma.claim.update.mock.calls[0][0].data
    expect(data.resolutionSource).toBe('HUMAN')
    expect(data.resolvedBy).toBe('vendeur@example.com')
  })

  it('suivre la recommandation reste une décision humaine', async () => {
    const { PATCH } = await import('@/app/api/claims/[claimId]/route')
    await PATCH(patch({ status: 'APPROVED', aiDecision: 'Refund' }), { params })

    const data = mockPrisma.claim.update.mock.calls[0][0].data
    expect(data.aiDecision).toBe('Refund')
    expect(data.resolutionSource).toBe('HUMAN')
    // Pas d'override : le vendeur a confirmé la reco.
    expect(data.prediction.override).toBeUndefined()
  })

  it('permet de trancher une réclamation sans recommandation', async () => {
    // NO_ALLOWED_RESOLUTION : aiDecision est null, le vendeur décide seul.
    mockPrisma.claim.findUnique.mockResolvedValue({
      ...claimAvecReco,
      aiDecision: null,
      prediction: {
        recommendation: {
          resolution: null, mlTop: 'Repair', mlTopScore: 0.9,
          filtered: true, allowed: ['Refund', 'Exchange'],
          reason: 'NO_ALLOWED_RESOLUTION',
        },
      },
    })

    const { PATCH } = await import('@/app/api/claims/[claimId]/route')
    const res = await PATCH(patch({ status: 'APPROVED', aiDecision: 'Refund' }), { params })

    expect(res.status).toBe(200)
    const data = mockPrisma.claim.update.mock.calls[0][0].data
    expect(data.aiDecision).toBe('Refund')
    expect(data.resolutionSource).toBe('HUMAN')
  })

  it('refuse une décision hors des 4 résolutions du vocabulaire vendeur', async () => {
    const { PATCH } = await import('@/app/api/claims/[claimId]/route')
    const res = await PATCH(patch({ status: 'APPROVED', aiDecision: 'Autre' }), { params })

    expect(res.status).toBe(400)
    expect(mockPrisma.claim.update).not.toHaveBeenCalled()
  })

  it('isole les vendeurs : la réclamation d\'un autre est inaccessible', async () => {
    mockPrisma.vendor.findUnique.mockResolvedValue({ id: 'vendor-2', userId: 'user-1' })

    const { PATCH } = await import('@/app/api/claims/[claimId]/route')
    const res = await PATCH(patch({ status: 'APPROVED', aiDecision: 'Exchange' }), { params })

    expect(res.status).toBe(403)
    expect(mockPrisma.claim.update).not.toHaveBeenCalled()
  })
})
