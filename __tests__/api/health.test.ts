import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}))

vi.mock('@/lib/env', () => ({
  env: {
    ML_API_URL: 'https://ml.example.com',
    NODE_ENV: 'test',
  },
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/health', () => {
  it('retourne 200 avec status ok si tout fonctionne', async () => {
    const prisma = (await import('@/lib/prisma')).prisma
    prisma.$queryRaw.mockResolvedValue([{ 1: 1 }])

    const { GET } = await import('@/app/api/health/route')
    const req = new NextRequest('http://localhost:3000/api/health')
    const res = await GET(req as any)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.database).toBe('connected')
  })

  it('retourne 503 si la DB est down', async () => {
    const prisma = (await import('@/lib/prisma')).prisma
    prisma.$queryRaw.mockRejectedValue(new Error('Connection refused'))

    const { GET } = await import('@/app/api/health/route')
    const req = new NextRequest('http://localhost:3000/api/health')
    const res = await GET(req as any)

    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('error')
    expect(body.database).toBe('disconnected')
  })
})
