// Page de retour hébergée : la soumission /api/return/[token] est validée
// contre la MÊME définition de formulaire que /api/v1/returns, et les champs
// déjà connus de la session de retour ne sont ni attendus ni redemandés.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockFindUnique     = vi.fn()
const mockSessionUpdate  = vi.fn()
const mockCheckRateLimit = vi.fn()
const mockIngestClaim    = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    returnSession: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update:     (...args: unknown[]) => mockSessionUpdate(...args),
    },
  },
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}))

vi.mock('@/lib/services/claim-ingestion', () => ({
  ingestClaim: (...args: unknown[]) => mockIngestClaim(...args),
}))

vi.mock('@/lib/services/ml', () => ({
  buildMLPayload: (input: Record<string, unknown>) => input,
}))

vi.mock('@/lib/logger', () => ({
  log: { info: vi.fn(), error: vi.fn() },
}))

const vendor = {
  id:               'v_1',
  companyName:      'Caba Store',
  website:          null,
  status:           'APPROVED',
  vendorCategories: [],
  returnPolicy:     null as Record<string, unknown> | null,
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id:              's_1',
    token:           'ret_abc',
    orderId:         'CMD-1',
    customerId:      null,
    customerName:    'Ahmed Benali',
    customerEmail:   'ahmed@exemple.com',
    customerPhone:   '0555123456',
    customerWilaya:  null,
    paymentMethod:   null,
    shippingMethod:  null,
    shippingCost:    null,
    productName:     'Nike Air Max',
    orderDate:       '2026-07-01',
    shopName:        'Caba Store',
    productPrice:    5000,
    productQuantity: 1,
    orderTotal:      5500,
    expiresAt:       new Date(Date.now() + 86_400_000),
    usedAt:          null,
    vendorId:        'k_1',
    vendor:          { id: 'k_1', vendorId: 'v_1', isActive: true, vendor },
    ...overrides,
  }
}

// Ce que la page hébergée envoie réellement : la livraison n'y figure pas,
// c'est une donnée boutique lue sur la session.
const CLIENT_ANSWERS = {
  reason:             'Produit défectueux',
  desired_resolution: 'REFUND',
  description:        'Semelle décollée à la réception.',
  customer_wilaya:    'Alger',
  payment_method:     'Cash on Delivery',
}

beforeEach(() => {
  vi.clearAllMocks()
  vendor.returnPolicy = null
  mockCheckRateLimit.mockResolvedValue(true)
  mockSessionUpdate.mockResolvedValue({})
  mockFindUnique.mockResolvedValue(makeSession())
  mockIngestClaim.mockResolvedValue({
    ok: true,
    claim: {
      id: 'claim_1', status: 'PENDING', type: 'REFUND', createdAt: new Date(),
      aiDecision: null, fraudScore: 15, autoApproved: false, autoRejected: false,
    },
    customerPastReturns: 0,
  })
})

async function callPost(body: unknown) {
  const { POST } = await import('@/app/api/return/[token]/route')
  const req = new NextRequest('http://localhost:3000/api/return/ret_abc', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  return POST(req, { params: Promise.resolve({ token: 'ret_abc' }) })
}

describe('POST /api/return/[token]', () => {
  it('crée le claim à partir des answers du formulaire', async () => {
    const res = await callPost({ answers: CLIENT_ANSWERS })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toMatchObject({ success: true, claimId: 'claim_1' })

    expect(mockIngestClaim).toHaveBeenCalledWith(expect.objectContaining({
      orderId:      'CMD-1',
      customerName: 'Ahmed Benali',
      source:       'HOSTED_PAGE',
      prediction:   expect.objectContaining({
        customerWilaya: 'Alger',
        paymentMethod:  'Cash on Delivery',
        // Session sans livraison → repli, jamais une valeur du client.
        shippingMethod: 'Standard',
        shippingCost:   0,
      }),
    }))
  })

  it('ignore le mode et les frais de livraison envoyés par le client', async () => {
    mockFindUnique.mockResolvedValue(makeSession({
      shippingMethod: 'Stopdesk',
      shippingCost:   400,
    }))

    const res = await callPost({
      answers: { ...CLIENT_ANSWERS, shipping_method: 'Gratuit', shipping_cost: 0 },
    })

    expect(res.status).toBe(201)
    expect(mockIngestClaim).toHaveBeenCalledWith(expect.objectContaining({
      prediction: expect.objectContaining({
        shippingMethod: 'Stopdesk',
        shippingCost:   400,
      }),
    }))
  })

  it("n'exige pas la livraison quand la boutique ne l'a pas transmise", async () => {
    const res = await callPost({ answers: CLIENT_ANSWERS })

    expect(res.status).toBe(201)
  })

  it('accepte encore le body plat (ancien client)', async () => {
    const res = await callPost(CLIENT_ANSWERS)

    expect(res.status).toBe(201)
  })

  it('rejette un champ requis du formulaire manquant', async () => {
    const withoutWilaya: Record<string, unknown> = { ...CLIENT_ANSWERS }
    delete withoutWilaya.customer_wilaya

    const res = await callPost({ answers: withoutWilaya })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('customer_wilaya')
    expect(mockIngestClaim).not.toHaveBeenCalled()
  })

  it('ne redemande pas les champs pré-remplis par la boutique', async () => {
    mockFindUnique.mockResolvedValue(makeSession({
      customerId:     'CUST-1024',
      customerWilaya: 'Oran',
      paymentMethod:  'CCP',
      shippingMethod: 'Stopdesk',
      shippingCost:   400,
    }))

    const res = await callPost({
      answers: {
        reason:             'Produit défectueux',
        desired_resolution: 'REFUND',
      },
    })

    expect(res.status).toBe(201)
    expect(mockIngestClaim).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'CUST-1024',
      prediction: expect.objectContaining({
        customerWilaya: 'Oran',
        paymentMethod:  'CCP',
        shippingMethod: 'Stopdesk',
        shippingCost:   400,
      }),
    }))
  })

  it('rejette une résolution hors des types acceptés par le vendeur', async () => {
    vendor.returnPolicy = {
      maxClaimDays:          14,
      acceptedTypes:         ['EXCHANGE'],
      acceptedReturnReasons: [],
    }

    const res = await callPost({
      answers: { ...CLIENT_ANSWERS, desired_resolution: 'REFUND' },
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('desired_resolution')
  })

  it('rejette un motif hors des motifs acceptés par le vendeur', async () => {
    vendor.returnPolicy = {
      maxClaimDays:          14,
      acceptedTypes:         ['EXCHANGE', 'REFUND', 'REPAIR'],
      acceptedReturnReasons: ['Mauvaise taille'],
    }

    const res = await callPost({ answers: CLIENT_ANSWERS })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('reason')
  })

  it('rejette un lien déjà utilisé', async () => {
    mockFindUnique.mockResolvedValue(makeSession({ usedAt: new Date() }))

    const res = await callPost({ answers: CLIENT_ANSWERS })

    expect(res.status).toBe(409)
  })

  it('marque la session comme utilisée après succès', async () => {
    await callPost({ answers: CLIENT_ANSWERS })

    expect(mockSessionUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { token: 'ret_abc' },
    }))
  })
})
