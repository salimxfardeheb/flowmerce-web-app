import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockValidateApiKey = vi.fn()
const mockCheckRateLimit = vi.fn()
const mockIngestClaim    = vi.fn()

vi.mock('@/lib/api-key-auth', () => ({
  validateApiKey: (...args: unknown[]) => mockValidateApiKey(...args),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}))

vi.mock('@/lib/services/claim-ingestion', () => ({
  ingestClaim: (...args: unknown[]) => mockIngestClaim(...args),
}))

vi.mock('@/lib/services/ml', () => ({
  buildMLPayload: () => ({}),
}))

vi.mock('@/lib/logger', () => ({
  log: { info: vi.fn() },
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

const VALID_ANSWERS: Record<string, unknown> = {
  order_id:          'ord_1',
  customer_id:       'CUST-1024',
  customer_name:     'Ahmed Benali',
  customer_email:    'ahmed@exemple.com',
  customer_phone:    '0555123456',
  customer_wilaya:   'Alger',
  product_name:      'Nike Air Max',
  payment_method:    'Cash on Delivery',
  shipping_method:   'Livraison à domicile',
  shipping_cost:     500,
  order_date:        '2026-07-01',
  reason:            'Produit défectueux',
  desired_resolution: 'REFUND',
  description:       'Le produit est tombé en panne dès le premier usage.',
}

function validBody(overrides: Record<string, unknown> = {}) {
  return { orderId: 'ord_1', productId: 'prod_1', answers: VALID_ANSWERS, ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  vendor.returnPolicy = null
  mockCheckRateLimit.mockResolvedValue(true)
  mockIngestClaim.mockResolvedValue({
    ok: true,
    claim: {
      id: 'claim_1', status: 'PENDING', type: 'REFUND', createdAt: new Date(),
      aiDecision: null, fraudScore: 0, autoApproved: false, autoRejected: false,
    },
    customerPastReturns: 0,
  })
})

async function callPost(body: unknown, headers: Record<string, string> = {}) {
  const { POST } = await import('@/app/api/v1/returns/route')
  const req = new NextRequest('http://localhost:3000/api/v1/returns', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body:    JSON.stringify(body),
  })
  return POST(req)
}

describe('POST /api/v1/returns', () => {
  it('rejette une clé API invalide avec 401', async () => {
    authFail()

    const res = await callPost(validBody(), { authorization: 'Bearer cle-invalide' })

    expect(res.status).toBe(401)
    expect(mockValidateApiKey).toHaveBeenCalledWith('cle-invalide')
  })

  it('accepte la clé via l\'en-tête x-api-key', async () => {
    authOk()

    const res = await callPost(validBody(), { 'x-api-key': 'cle-x' })

    expect(res.status).toBe(201)
    expect(mockValidateApiKey).toHaveBeenCalledWith('cle-x')
  })

  it('rejette un body sans orderId/productId avec 400', async () => {
    authOk()

    const res = await callPost({ answers: VALID_ANSWERS })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('orderId')
  })

  it('rejette un champ answers invalide avec 400', async () => {
    authOk()

    const res = await callPost({ orderId: 'ord_1', productId: 'prod_1', answers: 'nope' })

    expect(res.status).toBe(400)
  })

  it('valide les réponses contre le formulaire : champ requis manquant', async () => {
    authOk()

    const withoutEmail = { ...VALID_ANSWERS }
    delete withoutEmail.customer_email
    const res = await callPost(validBody({ answers: withoutEmail }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('customer_email')
  })

  it('valide les réponses contre le formulaire : option de select invalide', async () => {
    authOk()

    const res = await callPost(validBody({
      answers: { ...VALID_ANSWERS, desired_resolution: 'VOYAGE' },
    }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('desired_resolution')
  })

  it('rejette une raison hors options du formulaire', async () => {
    authOk()

    const res = await callPost(validBody({
      answers: { ...VALID_ANSWERS, reason: 'DEFECTIVE' },
    }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('reason')
  })

  it('rejette un email invalide', async () => {
    authOk()

    const res = await callPost(validBody({
      answers: { ...VALID_ANSWERS, customer_email: 'pas-un-email' },
    }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Email invalide')
  })

  it('rejette le contenu HTML', async () => {
    authOk()

    const res = await callPost(validBody({
      answers: { ...VALID_ANSWERS, customer_name: '<script>alert(1)</script>' },
    }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('HTML')
  })

  it('applique le rate limit par IP+order (429)', async () => {
    authOk()
    mockCheckRateLimit.mockResolvedValueOnce(false)

    const res = await callPost(validBody())

    expect(res.status).toBe(429)
    expect(mockCheckRateLimit).toHaveBeenCalledWith('unknown:ord_1')
  })

  it('renvoie 422 quand la policy refuse (délai dépassé)', async () => {
    authOk()
    vendor.returnPolicy = {
      maxClaimDays:            7,
      acceptedTypes:           ['EXCHANGE', 'REFUND', 'REPAIR'],
      nonRefundableCategories: [],
      exchangeOnlyCategories:  [],
    }

    const res = await callPost(validBody({
      answers: { ...VALID_ANSWERS, order_date: '2020-01-01' },
    }))

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('DELAY_EXCEEDED')
  })

  it('renvoie 409 si un claim existe déjà pour la commande', async () => {
    authOk()
    mockIngestClaim.mockResolvedValue({ ok: false, code: 'DUPLICATE_CLAIM' })

    const res = await callPost(validBody())

    expect(res.status).toBe(409)
  })

  it('crée le claim et retourne { claim_id, status } en 201', async () => {
    authOk()

    const res = await callPost(validBody())

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toMatchObject({ success: true, claim_id: 'claim_1', status: 'PENDING' })

    expect(mockIngestClaim).toHaveBeenCalledWith(expect.objectContaining({
      orderId:      'ord_1',
      customerId:   'CUST-1024',
      customerName: 'Ahmed Benali',
      customerEmail: 'ahmed@exemple.com',
      type:         'REFUND',
      source:       'API',
      productName:  'Nike Air Max',
      prediction:   expect.objectContaining({
        customerWilaya: 'Alger',
        paymentMethod:  'Cash on Delivery',
      }),
    }))
  })
})
