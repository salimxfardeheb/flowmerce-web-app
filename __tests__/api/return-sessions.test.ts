// __tests__/api/return-sessions.test.ts — Flowmerce
//
// Profil client transmis par la boutique à la création du lien de retour.
// La page hébergée ne demande jamais l'âge ni le genre : s'ils ne sont pas
// posés ici, l'ingestion repart avec ses replis (30 / 'Unknown').

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockValidateApiKey = vi.fn()
const mockSessionCreate  = vi.fn()
const mockApiKeyUpdate   = vi.fn()

vi.mock('@/lib/api-key-auth', () => ({
  validateApiKey: (...args: unknown[]) => mockValidateApiKey(...args),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    returnSession: { create: (...args: unknown[]) => mockSessionCreate(...args) },
    apiKey:        { update: (...args: unknown[]) => mockApiKeyUpdate(...args) },
  },
}))

vi.mock('@/lib/env', () => ({
  env: { NEXT_PUBLIC_BASE_URL: 'https://flowmerce.test' },
}))

vi.mock('@/lib/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const vendor = {
  id:           'v_1',
  companyName:  'Caba Store',
  status:       'APPROVED',
  returnPolicy: null as Record<string, unknown> | null,
}

const REQUIRED = {
  order_id:       'CMD-1',
  customer_email: 'ahmed@exemple.com',
  customer_name:  'Ahmed Benali',
  product_name:   'Nike Air Max',
}

beforeEach(() => {
  vi.clearAllMocks()
  vendor.returnPolicy = null
  mockValidateApiKey.mockResolvedValue({ ok: true, keyRecord: { id: 'k_1', vendor } })
  mockSessionCreate.mockResolvedValue({})
  mockApiKeyUpdate.mockResolvedValue({})
})

async function callPost(body: unknown) {
  const { POST } = await import('@/app/api/return-sessions/route')
  const req = new NextRequest('http://localhost:3000/api/return-sessions', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer flk_test' },
    body:    JSON.stringify(body),
  })
  return POST(req)
}

/** Données passées à prisma.returnSession.create. */
function createdSession() {
  return mockSessionCreate.mock.calls[0][0].data as Record<string, unknown>
}

describe('POST /api/return-sessions — profil client', () => {
  it('stocke un âge direct', async () => {
    const res = await callPost({ ...REQUIRED, customer_age: 34, customer_gender: 'Male' })

    expect(res.status).toBe(201)
    expect(createdSession()).toMatchObject({ customerAge: 34, customerGender: 'Male' })
  })

  it("dérive l'âge d'une date de naissance", async () => {
    const birthYear = new Date().getUTCFullYear() - 40
    const res = await callPost({ ...REQUIRED, customer_birth_date: `${birthYear}-01-01` })

    expect(res.status).toBe(201)
    expect(createdSession().customerAge).toBe(40)
  })

  it("la date de naissance prime sur l'âge direct", async () => {
    const birthYear = new Date().getUTCFullYear() - 25
    const res = await callPost({
      ...REQUIRED,
      customer_age:        99,
      customer_birth_date: `${birthYear}-01-01`,
    })

    expect(res.status).toBe(201)
    expect(createdSession().customerAge).toBe(25)
  })

  it('rejette une date de naissance inexploitable', async () => {
    const res = await callPost({ ...REQUIRED, customer_birth_date: 'pas-une-date' })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('customer_birth_date')
    expect(mockSessionCreate).not.toHaveBeenCalled()
  })

  it('rejette une date de naissance dans le futur', async () => {
    const res = await callPost({ ...REQUIRED, customer_birth_date: '2999-01-01' })

    expect(res.status).toBe(400)
    expect(mockSessionCreate).not.toHaveBeenCalled()
  })

  it('rejette un âge hors bornes', async () => {
    const res = await callPost({ ...REQUIRED, customer_age: 999 })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('customer_age')
    expect(mockSessionCreate).not.toHaveBeenCalled()
  })

  it('laisse le profil à null quand la boutique ne transmet rien', async () => {
    const res = await callPost(REQUIRED)

    expect(res.status).toBe(201)
    expect(createdSession()).toMatchObject({ customerAge: null, customerGender: null })
  })

  it('rejette du HTML dans le genre', async () => {
    const res = await callPost({ ...REQUIRED, customer_gender: '<script>x</script>' })

    expect(res.status).toBe(400)
    expect(mockSessionCreate).not.toHaveBeenCalled()
  })
})

describe('POST /api/return-sessions — date de commande', () => {
  it('rejette une commande dans le futur', async () => {
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
    const res = await callPost({ ...REQUIRED, order_date: future })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('futur')
    expect(mockSessionCreate).not.toHaveBeenCalled()
  })

  it('rejette une date de commande illisible', async () => {
    const res = await callPost({ ...REQUIRED, order_date: 'hier' })

    expect(res.status).toBe(400)
    expect(mockSessionCreate).not.toHaveBeenCalled()
  })

  it('accepte une commande du jour', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const res = await callPost({ ...REQUIRED, order_date: today })

    expect(res.status).toBe(201)
    expect((await res.json()).out_of_window).toBe(false)
  })
})

describe('POST /api/return-sessions — fenêtre de retour', () => {
  // Le dépassement ne bloque plus la création du lien : la page doit s'ouvrir,
  // c'est la soumission qui refuse.
  it('crée quand même le lien hors délai et le signale', async () => {
    vendor.returnPolicy = { maxClaimDays: 14 }
    const old = new Date(Date.now() - 200 * 86_400_000).toISOString().slice(0, 10)

    const res = await callPost({ ...REQUIRED, order_date: old })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.out_of_window).toBe(true)
    expect(body.url).toContain('/return/')
    expect(mockSessionCreate).toHaveBeenCalled()
  })

  it('ne signale rien quand la commande est dans la fenêtre', async () => {
    vendor.returnPolicy = { maxClaimDays: 30 }
    const recent = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10)

    const res = await callPost({ ...REQUIRED, order_date: recent })

    expect(res.status).toBe(201)
    expect((await res.json()).out_of_window).toBe(false)
  })
})
