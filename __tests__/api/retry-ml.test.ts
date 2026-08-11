// C-05 — Le worker de reprise mène la réclamation jusqu'à son état final.
//
// Scénario de l'audit : rendre le ML indisponible, soumettre une réclamation,
// remettre le ML en service, déclencher le cron. Avant correction on obtenait
// `aiDecision = "Reject"`, `status = "PENDING"`, aucun email. La réclamation
// restait en attente indéfiniment.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockPrisma = {
  claim: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  returnPolicy: { findUnique: vi.fn() },
}

const mockML = { callMLPredict: vi.fn() }
const mockNotify = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/services/ml', () => mockML)
vi.mock('@/lib/services/notification', () => ({ notifyCustomer: mockNotify }))
vi.mock('@/lib/env', () => ({ env: { CRON_SECRET: 'cron-secret-test' } }))
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const claimBloquee = {
  id:            'claim-1',
  mlInput:       { Shop_Name: 'Ma Boutique', Return_Reason: 'Mauvaise taille' },
  mlAttempts:    1,
  vendorId:      'vendor-1',
  status:        'PENDING',
  type:          'EXCHANGE',
  orderDate:     new Date('2026-08-01'),
  prediction:    { shopName: 'Ma Boutique' },
  customerName:  'Client Test',
  customerEmail: 'client@example.com',
  customerPhone: null,
  orderId:       'order-1',
}

function requete(secret = 'cron-secret-test') {
  return new NextRequest('http://localhost:3000/api/cron/retry-ml', {
    headers: { authorization: `Bearer ${secret}` },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.claim.update.mockResolvedValue({})
  mockPrisma.claim.updateMany.mockResolvedValue({ count: 1 })
  mockPrisma.returnPolicy.findUnique.mockResolvedValue({
    validationMode: 'MANUAL', maxClaimDays: 14,
    nonRefundableCategories: [], exchangeOnlyCategories: [],
    acceptedTypes: ['EXCHANGE', 'REFUND', 'REPAIR'],
  })
})

describe('GET /api/cron/retry-ml', () => {
  it('refuse un secret invalide', async () => {
    const { GET } = await import('@/app/api/cron/retry-ml/route')
    expect((await GET(requete('mauvais'))).status).toBe(401)
  })

  it('applique le refus et notifie quand la reprise réussit', async () => {
    mockPrisma.claim.findMany.mockResolvedValue([claimBloquee])
    mockML.callMLPredict.mockResolvedValue({
      ok: true,
      prediction: { resolution: { prediction: 'Reject', probabilities: { Reject: 0.95 } } },
    })

    const { GET } = await import('@/app/api/cron/retry-ml/route')
    const body = await (await GET(requete())).json()

    expect(body.recovered).toBe(1)
    // Le statut est écrit — c'était précisément ce qui manquait.
    expect(mockPrisma.claim.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'claim-1', status: 'PENDING' },
        data:  expect.objectContaining({ status: 'REJECTED' }),
      }),
    )
    // …et le client est informé.
    expect(mockNotify).toHaveBeenCalledTimes(1)
    expect(mockNotify.mock.calls[0][0]).toMatchObject({
      status: 'REJECTED', aiDecision: 'Reject', orderId: 'order-1',
    })
  })

  it('approuve en AI_AUTO quand la reprise ramène Exchange', async () => {
    mockPrisma.returnPolicy.findUnique.mockResolvedValue({
      validationMode: 'AI_AUTO', maxClaimDays: 14,
      nonRefundableCategories: [], exchangeOnlyCategories: [],
      acceptedTypes: ['EXCHANGE', 'REFUND', 'REPAIR'],
    })
    mockPrisma.claim.findMany.mockResolvedValue([claimBloquee])
    mockML.callMLPredict.mockResolvedValue({
      ok: true,
      prediction: { resolution: { prediction: 'Exchange', probabilities: { Exchange: 0.9 } } },
    })

    const { GET } = await import('@/app/api/cron/retry-ml/route')
    await GET(requete())

    expect(mockPrisma.claim.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) }),
    )
  })

  it('compte les échecs sans toucher au statut', async () => {
    mockPrisma.claim.findMany.mockResolvedValue([claimBloquee])
    mockML.callMLPredict.mockResolvedValue({
      ok: false, timedOut: true, error: 'timeout', retryable: true, attempts: 1,
    })

    const { GET } = await import('@/app/api/cron/retry-ml/route')
    const body = await (await GET(requete())).json()

    expect(body.stillFailing).toBe(1)
    expect(body.recovered).toBe(0)
    expect(mockPrisma.claim.updateMany).not.toHaveBeenCalled()
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('est idempotent : un second passage ne renotifie pas', async () => {
    mockPrisma.claim.findMany.mockResolvedValue([claimBloquee])
    mockML.callMLPredict.mockResolvedValue({
      ok: true,
      prediction: { resolution: { prediction: 'Reject', probabilities: { Reject: 0.95 } } },
    })

    const { GET } = await import('@/app/api/cron/retry-ml/route')
    await GET(requete())

    // Deuxième exécution : la réclamation n'est plus PENDING.
    mockPrisma.claim.updateMany.mockResolvedValue({ count: 0 })
    const body = await (await GET(requete())).json()

    expect(body.alreadyResolved).toBe(1)
    expect(body.recovered).toBe(0)
    expect(mockNotify).toHaveBeenCalledTimes(1)
  })

  it('abandonne une réclamation marquée mlFailed sans mlInput', async () => {
    mockPrisma.claim.findMany.mockResolvedValue([{ ...claimBloquee, mlInput: null }])

    const { GET } = await import('@/app/api/cron/retry-ml/route')
    await GET(requete())

    expect(mockML.callMLPredict).not.toHaveBeenCalled()
    expect(mockPrisma.claim.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { mlFailed: false, mlAttempts: 6 } }),
    )
  })
})
