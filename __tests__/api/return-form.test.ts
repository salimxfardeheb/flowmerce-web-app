import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockValidateApiKey = vi.fn()

vi.mock('@/lib/api-key-auth', () => ({
  validateApiKey: (...args: unknown[]) => mockValidateApiKey(...args),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    apiKey: {
      update: vi.fn().mockResolvedValue({}),
    },
  },
}))

vi.mock('@/lib/logger', () => ({
  log: {
    info: vi.fn(),
  },
}))

const vendor = {
  id:          'v_1',
  companyName: 'Caba Store',
  website:     'https://caba.example.com',
  status:      'APPROVED',
  returnPolicy: null,
}

const keyRecord = {
  id:     'k_1',
  key:    'hash',
  vendor,
}

function authOk() {
  mockValidateApiKey.mockResolvedValue({ ok: true, keyRecord })
}

function authFail() {
  mockValidateApiKey.mockResolvedValue({
    ok:       false,
    response: NextResponse.json({ error: 'Clé API invalide ou révoquée' }, { status: 401 }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

async function callGet(headers: Record<string, string>) {
  const { GET } = await import('@/app/api/v1/return-form/route')
  const req = new NextRequest('http://localhost:3000/api/v1/return-form', { headers })
  return GET(req)
}

describe('GET /api/v1/return-form', () => {
  it('rejette une clé API invalide avec 401', async () => {
    authFail()

    const res = await callGet({ authorization: 'Bearer cle-invalide' })

    expect(res.status).toBe(401)
    expect(mockValidateApiKey).toHaveBeenCalledWith('cle-invalide')
  })

  it('retourne le formulaire générique pour le vendeur de la clé', async () => {
    authOk()

    const res = await callGet({ authorization: 'Bearer cle-valide' })

    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.version).toBe(1)
    expect(body.title).toBe('Demande de retour')
    expect(body.meta.shop).toEqual({ name: 'Caba Store', slug: 'caba-store', website: 'https://caba.example.com' })
    expect(body.sections.map((s: { id: string }) => s.id)).toEqual([
      'order', 'reason', 'resolution', 'description',
    ])
    expect(body.sections[1].fields[0].id).toBe('reason')
  })

  it('gère aussi la clé via l’en-tête x-api-key', async () => {
    authOk()

    const res = await callGet({ 'x-api-key': 'cle-x' })

    expect(res.status).toBe(200)
    expect(mockValidateApiKey).toHaveBeenCalledWith('cle-x')
  })

  it('met à jour lastUsedAt de la clé et journalise', async () => {
    authOk()

    const prisma = (await import('@/lib/prisma')).prisma
    const logger = (await import('@/lib/logger')).log

    await callGet({ authorization: 'Bearer cle-valide' })

    expect(prisma.apiKey.update).toHaveBeenCalledWith({
      where: { id: 'k_1' },
      data:  { lastUsedAt: expect.any(Date) },
    })
    expect(logger.info).toHaveBeenCalledWith('return_form_fetched', { vendorId: 'v_1' })
  })
})
