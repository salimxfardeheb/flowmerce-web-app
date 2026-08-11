// C-04 — L'export vers le dataset ne prend que des vérités terrain.
//
// Le point de rupture de la boucle de rétroaction : une réclamation dont la
// résolution vient du modèle (auto-approve AI_AUTO, auto-reject sur `Reject`,
// ou simple recommandation jamais tranchée) n'est pas envoyée à /save_claim.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = {
  claim: { findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
}

const mockML = {
  buildReclamationInputFromClaim: vi.fn(() => ({ Order_ID: 'CMD-1' })),
  callMLSaveClaim:                vi.fn(),
  GROUND_TRUTH_SOURCES:           ['HUMAN', 'POLICY_RULE'] as const,
}

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/services/ml', () => mockML)
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { role: 'ADMIN', email: 'admin@flowmerce.dz' } }),
}))
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

async function lireFlux(res: Response) {
  const texte = await res.text()
  return texte.trim().split('\n').map((l) => JSON.parse(l))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.claim.count.mockResolvedValue(0)
  mockPrisma.claim.update.mockResolvedValue({})
  mockML.callMLSaveClaim.mockResolvedValue({ ok: true, message: 'ok', order_id: 'CMD-1' })
})

describe('POST /api/admin/claims/export', () => {
  it('ne sélectionne que les réclamations de vérité terrain', async () => {
    mockPrisma.claim.findMany.mockResolvedValue([])

    const { POST } = await import('@/app/api/admin/claims/export/route')
    await POST()

    expect(mockPrisma.claim.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          exportedToML:     false,
          resolutionSource: { in: ['HUMAN', 'POLICY_RULE'] },
        },
      }),
    )
  })

  it('exporte une décision humaine', async () => {
    mockPrisma.claim.findMany.mockResolvedValue([{
      id: 'claim-1', orderId: 'CMD-1', customerId: null, fraudScore: 0,
      productName: 'X', orderDate: null, createdAt: new Date(), type: 'EXCHANGE',
      aiDecision: 'Exchange', resolutionSource: 'HUMAN',
      mlInput: { Return_Reason: 'Mauvaise taille' },
      vendor: { companyName: 'Caba Store' },
    }])

    const { POST } = await import('@/app/api/admin/claims/export/route')
    const lignes = await lireFlux(await POST())

    expect(mockML.callMLSaveClaim).toHaveBeenCalledTimes(1)
    expect(lignes.at(-1)).toMatchObject({ type: 'done', exported: 1 })
  })

  it('transmet l\'origine du label au constructeur de la ligne', async () => {
    mockPrisma.claim.findMany.mockResolvedValue([{
      id: 'claim-1', orderId: 'CMD-1', customerId: null, fraudScore: 0,
      productName: 'X', orderDate: null, createdAt: new Date(), type: 'EXCHANGE',
      aiDecision: 'Reject', resolutionSource: 'POLICY_RULE',
      mlInput: { Return_Reason: 'Mauvaise taille' },
      vendor: { companyName: 'Caba Store' },
    }])

    const { POST } = await import('@/app/api/admin/claims/export/route')
    await POST()

    expect(mockML.buildReclamationInputFromClaim).toHaveBeenCalledWith(
      expect.objectContaining({ resolutionSource: 'POLICY_RULE' }),
    )
  })

  it('compte les réclamations en attente de décision humaine', async () => {
    mockPrisma.claim.findMany.mockResolvedValue([])
    mockPrisma.claim.count.mockResolvedValue(7)

    const { POST } = await import('@/app/api/admin/claims/export/route')
    const lignes = await lireFlux(await POST())

    expect(mockPrisma.claim.count).toHaveBeenCalledWith({
      where: {
        exportedToML: false,
        OR: [{ resolutionSource: null }, { resolutionSource: 'MODEL' }],
      },
    })
    expect(lignes.at(-1)).toMatchObject({ awaitingGroundTruth: 7 })
  })

  it('refuse un utilisateur non admin', async () => {
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockResolvedValueOnce({ user: { role: 'VENDOR' } } as never)

    const { POST } = await import('@/app/api/admin/claims/export/route')
    expect((await POST()).status).toBe(403)
  })
})
