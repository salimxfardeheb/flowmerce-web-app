import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFraudRecord = {
  id: 'rec-1',
  customerEmail: 'test@example.com',
  customerPhone: '0550123456',
  totalClaims: 2,
  totalRefusals: 1,
  distinctVendors: 2,
  lastClaimAt: null,
  lastRefusalAt: null,
  matchedBy: 'email',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockFindFirst = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockUpdateMany = vi.fn()
const mockClaimFindMany = vi.fn()
const mockRefusalFindMany = vi.fn()
const mockRefusalCreate = vi.fn()
const mockTransaction = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    customerFraudRecord: {
      findFirst: mockFindFirst,
      create: mockCreate,
      update: mockUpdate,
      updateMany: mockUpdateMany,
    },
    claim: { findMany: mockClaimFindMany },
    refusalReport: { findMany: mockRefusalFindMany, create: mockRefusalCreate },
    $transaction: mockTransaction,
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('computeFraudScore', () => {
  it('retourne 0 pour un record null', async () => {
    const { computeFraudScore } = await import('@/lib/fraud-score')
    expect(computeFraudScore(null)).toBe(0)
  })

  it('calcule le score pour un nouveau client sans activité', async () => {
    const { computeFraudScore } = await import('@/lib/fraud-score')
    const score = computeFraudScore({ ...mockFraudRecord, totalClaims: 0, totalRefusals: 0, distinctVendors: 0 })
    expect(score).toBe(0)
  })

  it('pondère les claims (5 pts chacun, max 30)', async () => {
    const { computeFraudScore } = await import('@/lib/fraud-score')
    expect(computeFraudScore({ ...mockFraudRecord, totalClaims: 1, totalRefusals: 0, distinctVendors: 1 })).toBe(5)
    expect(computeFraudScore({ ...mockFraudRecord, totalClaims: 6, totalRefusals: 0, distinctVendors: 1 })).toBe(30)
  })

  it('pondère les refusals (10 pts chacun, max 40)', async () => {
    const { computeFraudScore } = await import('@/lib/fraud-score')
    expect(computeFraudScore({ ...mockFraudRecord, totalClaims: 0, totalRefusals: 1, distinctVendors: 1 })).toBe(10)
    expect(computeFraudScore({ ...mockFraudRecord, totalClaims: 0, totalRefusals: 4, distinctVendors: 1 })).toBe(40)
  })

  it('pondère les vendeurs distincts (15 pts/vendeur -1, max 30)', async () => {
    const { computeFraudScore } = await import('@/lib/fraud-score')
    expect(computeFraudScore({ ...mockFraudRecord, totalClaims: 0, totalRefusals: 0, distinctVendors: 1 })).toBe(0)
    expect(computeFraudScore({ ...mockFraudRecord, totalClaims: 0, totalRefusals: 0, distinctVendors: 2 })).toBe(15)
    expect(computeFraudScore({ ...mockFraudRecord, totalClaims: 0, totalRefusals: 0, distinctVendors: 3 })).toBe(30)
    expect(computeFraudScore({ ...mockFraudRecord, totalClaims: 0, totalRefusals: 0, distinctVendors: 5 })).toBe(30)
  })

  it('ne dépasse jamais 100', async () => {
    const { computeFraudScore } = await import('@/lib/fraud-score')
    const score = computeFraudScore({
      ...mockFraudRecord,
      totalClaims: 10,
      totalRefusals: 10,
      distinctVendors: 10,
    })
    expect(score).toBe(100)
  })

  it('suit les cas documentés', async () => {
    const { computeFraudScore } = await import('@/lib/fraud-score')
    expect(computeFraudScore({ ...mockFraudRecord, totalClaims: 1, totalRefusals: 0, distinctVendors: 1 })).toBe(5)
    expect(computeFraudScore({ ...mockFraudRecord, totalClaims: 10, totalRefusals: 10, distinctVendors: 1 })).toBe(70)
    expect(computeFraudScore({ ...mockFraudRecord, totalClaims: 3, totalRefusals: 3, distinctVendors: 3 })).toBe(75)
  })
})

describe('findOrCreateFraudRecord', () => {
  let findOrCreateFraudRecord: any

  beforeEach(async () => {
    const mod = await import('@/lib/fraud-score')
    findOrCreateFraudRecord = mod.findOrCreateFraudRecord
  })

  it('trouve un record par email', async () => {
    mockFindFirst.mockResolvedValue(mockFraudRecord)
    const result = await findOrCreateFraudRecord('test@example.com')
    expect(result.matchedBy).toBe('email')
    expect(result.record.id).toBe('rec-1')
  })

  it('crée un nouveau record si aucun existant', async () => {
    mockFindFirst.mockResolvedValue(null)
    mockCreate.mockResolvedValue(mockFraudRecord)
    const result = await findOrCreateFraudRecord('new@example.com')
    expect(result.matchedBy).toBe('new')
    expect(mockCreate).toHaveBeenCalled()
  })

  it('normalise l\'email en minuscules', async () => {
    mockFindFirst.mockResolvedValue(mockFraudRecord)
    await findOrCreateFraudRecord('TEST@EXAMPLE.COM')
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { customerEmail: 'test@example.com' },
    })
  })
})

describe('evaluateFraud', () => {
  let evaluateFraud: any

  beforeEach(async () => {
    const mod = await import('@/lib/fraud-score')
    evaluateFraud = mod.evaluateFraud
  })

  it('retourne isFraudAlert=false pour un score bas', async () => {
    mockFindFirst.mockResolvedValue({
      ...mockFraudRecord,
      totalClaims: 0,
      totalRefusals: 0,
      distinctVendors: 1,
    })

    const result = await evaluateFraud('test@example.com', null)
    expect(result.score).toBe(0)
    expect(result.isFraudAlert).toBe(false)
    expect(result.fraudSignalMessage).toBeNull()
  })

  it('déclenche une alerte pour score élevé', async () => {
    mockFindFirst.mockResolvedValue({
      ...mockFraudRecord,
      totalClaims: 5,
      totalRefusals: 5,
      distinctVendors: 3,
    })

    const result = await evaluateFraud('test@example.com', null)
    expect(result.isFraudAlert).toBe(true)
    expect(result.fraudSignalMessage).toContain('Signal fraude')
  })

  it('déclenche une alerte pour trop de retours', async () => {
    mockFindFirst.mockResolvedValue({
      ...mockFraudRecord,
      totalClaims: 6,
      totalRefusals: 0,
      distinctVendors: 1,
    })

    const result = await evaluateFraud('test@example.com', null)
    expect(result.totalClaims).toBe(7)
    expect(result.isFraudAlert).toBe(true)
  })
})
