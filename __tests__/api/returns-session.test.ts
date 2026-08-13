// Canal unique POST /api/v1/returns, usage « portail white-label » : le client
// final s'authentifie avec le jeton de sa session de retour au lieu d'une clé
// API. Même endpoint, même service, même validation que l'usage boutique —
// seules changent la provenance des champs et la forme de la réponse.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockFindUnique     = vi.fn()
const mockSessionUpdate  = vi.fn()
const mockValidateApiKey = vi.fn()
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
  buildMLPayload: (input: Record<string, unknown>) => input,
}))

vi.mock('@/lib/logger', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
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
    customerAge:     null,
    customerGender:  null,
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

// Ce que la page hébergée envoie réellement : uniquement les champs
// `source: 'customer'` encore vides. Wilaya, paiement, livraison et
// identifiant client viennent de la session.
const CLIENT_ANSWERS = {
  reason:             'Produit défectueux',
  desired_resolution: 'REFUND',
  description:        'Semelle décollée à la réception.',
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
      policyRejected: false,
    },
    customerPastReturns: 0,
  })
})

// Le portail exige un consentement explicite au traitement des données : toute
// soumission de ce canal en porte un. Il est injecté par défaut pour ne pas
// répéter la même clé dans chaque cas ; les tests qui portent sur son absence
// le redéfinissent dans leur body.
async function callPost(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const { POST } = await import('@/app/api/v1/returns/route')
  const req = new NextRequest('http://localhost:3000/api/v1/returns', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body:    JSON.stringify({ data_consent: true, ...body }),
  })
  return POST(req)
}

const withToken = (headers: Record<string, string> = {}) =>
  ({ 'x-return-token': 'ret_abc', ...headers })

describe('POST /api/v1/returns — jeton de session', () => {
  it('crée le claim en source HOSTED_PAGE sans orderId ni productId dans le body', async () => {
    const res = await callPost({ answers: CLIENT_ANSWERS }, withToken())

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ success: true, claimId: 'claim_1' })

    // La clé API n'est jamais sollicitée sur ce mode.
    expect(mockValidateApiKey).not.toHaveBeenCalled()
    expect(mockIngestClaim).toHaveBeenCalledWith(expect.objectContaining({
      orderId:      'CMD-1',
      customerName: 'Ahmed Benali',
      source:       'HOSTED_PAGE',
    }))
  })

  it('accepte aussi le jeton en Authorization: Bearer ret_…', async () => {
    const res = await callPost(
      { answers: CLIENT_ANSWERS },
      { authorization: 'Bearer ret_abc' },
    )

    expect(res.status).toBe(201)
    expect(mockValidateApiKey).not.toHaveBeenCalled()
    expect(mockFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { token: 'ret_abc' },
    }))
  })

  it('récupère automatiquement les champs boutique depuis la session', async () => {
    mockFindUnique.mockResolvedValue(makeSession({
      customerId:     'CUST-1024',
      customerWilaya: 'Oran',
      paymentMethod:  'CCP',
    }))

    const res = await callPost(
      { answers: { reason: 'Produit défectueux', desired_resolution: 'REFUND' } },
      withToken(),
    )

    expect(res.status).toBe(201)
    expect(mockIngestClaim).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'CUST-1024',
      prediction: expect.objectContaining({
        customerWilaya: 'Oran',
        paymentMethod:  'CCP',
      }),
    }))
  })

  it('ignore le mode et les frais de livraison envoyés par le client', async () => {
    mockFindUnique.mockResolvedValue(makeSession({
      shippingMethod: 'Stopdesk',
      shippingCost:   400,
    }))

    const res = await callPost(
      { answers: { ...CLIENT_ANSWERS, shipping_method: 'Gratuit', shipping_cost: 0 } },
      withToken(),
    )

    expect(res.status).toBe(201)
    expect(mockIngestClaim).toHaveBeenCalledWith(expect.objectContaining({
      prediction: expect.objectContaining({
        shippingMethod: 'Stopdesk',
        shippingCost:   400,
      }),
    }))
  })

  it("n'applique pas de second compteur par client — le lien est à usage unique", async () => {
    await callPost({ answers: CLIENT_ANSWERS }, withToken())

    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1)
    expect(mockCheckRateLimit).toHaveBeenCalledWith('unknown:CMD-1')
  })

  it('marque la session comme utilisée après succès', async () => {
    await callPost({ answers: CLIENT_ANSWERS }, withToken())

    expect(mockSessionUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { token: 'ret_abc' },
    }))
  })

  it('rejette un lien déjà utilisé', async () => {
    mockFindUnique.mockResolvedValue(makeSession({ usedAt: new Date() }))

    const res = await callPost({ answers: CLIENT_ANSWERS }, withToken())

    expect(res.status).toBe(409)
    expect(mockIngestClaim).not.toHaveBeenCalled()
  })

  it('rejette un lien expiré', async () => {
    mockFindUnique.mockResolvedValue(makeSession({
      expiresAt: new Date(Date.now() - 1_000),
    }))

    const res = await callPost({ answers: CLIENT_ANSWERS }, withToken())

    expect(res.status).toBe(401)
  })

  // Divergence assumée avec l'usage boutique : celle-ci reçoit un 422 pour
  // pouvoir réagir, le client final reçoit sa demande enregistrée et motivée.
  it('enregistre une demande hors politique en 201 refusé, pas en 422', async () => {
    vendor.returnPolicy = {
      maxClaimDays: 14, acceptedTypes: [],
      nonRefundableCategories: [], exchangeOnlyCategories: [],
    }
    mockFindUnique.mockResolvedValue(makeSession({
      orderDate: new Date(Date.now() - 200 * 86_400_000).toISOString().slice(0, 10),
    }))
    mockIngestClaim.mockResolvedValue({
      ok: true,
      claim: {
        id: 'claim_2', status: 'REJECTED', type: 'REFUND', createdAt: new Date(),
        aiDecision: 'Reject', fraudScore: 15,
        autoApproved: false, autoRejected: true, policyRejected: true,
      },
      customerPastReturns: 0,
    })

    const res  = await callPost({ answers: CLIENT_ANSWERS }, withToken())
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.rejected).toBe(true)
    expect(body.code).toBe('DELAY_EXCEEDED')
    expect(mockIngestClaim).toHaveBeenCalledWith(expect.objectContaining({
      // notify: true — sur la page hébergée, Flowmerce porte la relation client.
      policyViolation: expect.objectContaining({ code: 'DELAY_EXCEEDED', notify: true }),
    }))
  })

  it('valide les réponses du client contre le formulaire du vendeur', async () => {
    const res = await callPost(
      { answers: { ...CLIENT_ANSWERS, desired_resolution: 'VOYAGE' } },
      withToken(),
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('desired_resolution')
    expect(mockIngestClaim).not.toHaveBeenCalled()
  })

  // ── Consentement au traitement des données ─────────────────────────────────
  // La case du portail est une commodité d'interface : c'est ce refus serveur
  // qui garantit qu'aucune réclamation du canal client n'entre en base sans
  // accord explicite.
  it('refuse une soumission sans consentement', async () => {
    const res = await callPost(
      { answers: CLIENT_ANSWERS, data_consent: undefined },
      withToken(),
    )

    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('CONSENT_REQUIRED')
    expect(mockIngestClaim).not.toHaveBeenCalled()
  })

  it('refuse un consentement qui n\'est pas un booléen vrai', async () => {
    const res = await callPost(
      { answers: CLIENT_ANSWERS, data_consent: 'true' },
      withToken(),
    )

    expect(res.status).toBe(400)
    expect(mockIngestClaim).not.toHaveBeenCalled()
  })

  it('horodate le consentement sur la réclamation', async () => {
    await callPost({ answers: CLIENT_ANSWERS }, withToken())

    expect(mockIngestClaim).toHaveBeenCalledWith(expect.objectContaining({
      dataConsentAt: expect.any(Date),
    }))
  })

  it('retombe sur la clé API quand aucun jeton de session n\'est fourni', async () => {
    mockValidateApiKey.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 }),
    })

    await callPost({ answers: CLIENT_ANSWERS }, { authorization: 'Bearer flk_xxx' })

    expect(mockValidateApiKey).toHaveBeenCalledWith('flk_xxx')
    expect(mockFindUnique).not.toHaveBeenCalled()
  })
})
