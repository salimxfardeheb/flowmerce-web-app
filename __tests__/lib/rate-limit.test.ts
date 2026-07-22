import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockTransaction = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    returnRateLimit: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: mockTransaction,
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('checkRateLimit', () => {
  it('autorise la première requête', async () => {
    mockTransaction.mockImplementation(async (cb: any) => {
      const tx = {
        returnRateLimit: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn(),
          update: vi.fn(),
        },
      }
      return cb(tx)
    })

    const { checkRateLimit } = await import('@/lib/rate-limit')
    const result = await checkRateLimit('test-key')
    expect(result).toBe(true)
  })

  it('autorise si le compteur est dans la limite', async () => {
    const now = new Date()
    const future = new Date(now.getTime() + 3600000)
    mockTransaction.mockImplementation(async (cb: any) => {
      const tx = {
        returnRateLimit: {
          findUnique: vi.fn().mockResolvedValue({
            key: 'test-key',
            count: 1,
            resetAt: future,
          }),
          create: vi.fn(),
          update: vi.fn(),
        },
      }
      return cb(tx)
    })

    const { checkRateLimit } = await import('@/lib/rate-limit')
    const result = await checkRateLimit('test-key')
    expect(result).toBe(true)
  })

  it('refuse si la limite est dépassée', async () => {
    const now = new Date()
    const future = new Date(now.getTime() + 3600000)
    mockTransaction.mockImplementation(async (cb: any) => {
      const tx = {
        returnRateLimit: {
          findUnique: vi.fn().mockResolvedValue({
            key: 'test-key',
            count: 3,
            resetAt: future,
          }),
          create: vi.fn(),
          update: vi.fn(),
        },
      }
      return cb(tx)
    })

    const { checkRateLimit } = await import('@/lib/rate-limit')
    const result = await checkRateLimit('test-key', 3)
    expect(result).toBe(false)
  })

  it('réinitialise le compteur après la fenêtre de temps', async () => {
    const past = new Date(Date.now() - 3600000)
    mockTransaction.mockImplementation(async (cb: any) => {
      const tx = {
        returnRateLimit: {
          findUnique: vi.fn().mockResolvedValue({
            key: 'test-key',
            count: 3,
            resetAt: past,
          }),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue({}),
        },
      }
      return cb(tx)
    })

    const { checkRateLimit } = await import('@/lib/rate-limit')
    const result = await checkRateLimit('test-key')
    expect(result).toBe(true)
  })

  it('retourne false en cas d\'erreur', async () => {
    mockTransaction.mockRejectedValue(new Error('DB error'))

    const { checkRateLimit } = await import('@/lib/rate-limit')
    const result = await checkRateLimit('test-key')
    expect(result).toBe(false)
  })
})
