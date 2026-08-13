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

// Ce que la page hébergée envoie réellement : ni la livraison, ni la wilaya,
// ni le mode de paiement — ce sont des données boutique lues sur la session.
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
    },
    customerPastReturns: 0,
  })
})

// Cette route est un canal client comme le portail : elle exige le même
// consentement, injecté par défaut ici. Un test le retire explicitement pour
// vérifier qu'elle n'ouvre pas une porte dérobée au contournement.
async function callPost(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/return/[token]/route')
  const req = new NextRequest('http://localhost:3000/api/return/ret_abc', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ data_consent: true, ...body }),
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
        // Session sans wilaya, paiement ni livraison → replis neutres, jamais
        // une valeur du client.
        customerWilaya: 'Unknown',
        paymentMethod:  'Unknown',
        shippingMethod: 'Standard',
        shippingCost:   0,
      }),
    }))
  })

  it('reprend wilaya et mode de paiement depuis la session', async () => {
    mockFindUnique.mockResolvedValue(makeSession({
      customerWilaya: 'Alger',
      paymentMethod:  'Cash on Delivery',
    }))

    const res = await callPost({ answers: CLIENT_ANSWERS })

    expect(res.status).toBe(201)
    expect(mockIngestClaim).toHaveBeenCalledWith(expect.objectContaining({
      prediction: expect.objectContaining({
        customerWilaya: 'Alger',
        paymentMethod:  'Cash on Delivery',
      }),
    }))
  })

  // Même logique que pour les frais de livraison : ce sont des features du
  // modèle, le client final ne doit pas pouvoir les déclarer lui-même.
  it('ignore wilaya, paiement et identifiant client envoyés par le client', async () => {
    mockFindUnique.mockResolvedValue(makeSession({
      customerWilaya: 'Oran',
      paymentMethod:  'CCP',
      customerId:     'CUST-1024',
    }))

    const res = await callPost({
      answers: {
        ...CLIENT_ANSWERS,
        customer_wilaya: 'Alger',
        payment_method:  'Card',
        customer_id:     'CUST-9999',
      },
    })

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

  it("reprend l'âge et le genre transmis par la boutique", async () => {
    mockFindUnique.mockResolvedValue(makeSession({
      customerAge:    34,
      customerGender: 'Male',
    }))

    const res = await callPost({ answers: CLIENT_ANSWERS })

    expect(res.status).toBe(201)
    expect(mockIngestClaim).toHaveBeenCalledWith(expect.objectContaining({
      prediction: expect.objectContaining({
        customerAge:    34,
        customerGender: 'Male',
      }),
    }))
  })

  it("retombe sur les replis quand la boutique n'a transmis ni âge ni genre", async () => {
    const res = await callPost({ answers: CLIENT_ANSWERS })

    expect(res.status).toBe(201)
    expect(mockIngestClaim).toHaveBeenCalledWith(expect.objectContaining({
      prediction: expect.objectContaining({
        customerAge:    30,
        customerGender: 'Unknown',
      }),
    }))
  })

  // Hors politique : la page s'ouvre, la demande est acceptée en base mais
  // refusée d'office — sans ML, invisible du vendeur, exportable vers le dataset.
  describe('hors politique de retour', () => {
    const OLD_ORDER = new Date(Date.now() - 200 * 86_400_000).toISOString().slice(0, 10)

    beforeEach(() => {
      vendor.returnPolicy = { maxClaimDays: 14, acceptedTypes: [], nonRefundableCategories: [], exchangeOnlyCategories: [] }
      mockFindUnique.mockResolvedValue(makeSession({ orderDate: OLD_ORDER }))
      mockIngestClaim.mockResolvedValue({
        ok: true,
        claim: {
          id: 'claim_2', status: 'REJECTED', type: 'REFUND', createdAt: new Date(),
          aiDecision: 'Reject', fraudScore: 15,
          autoApproved: false, autoRejected: true, policyRejected: true,
        },
        customerPastReturns: 0,
      })
    })

    it('transmet la violation à ingestClaim', async () => {
      const res = await callPost({ answers: CLIENT_ANSWERS })

      expect(res.status).toBe(201)
      expect(mockIngestClaim).toHaveBeenCalledWith(expect.objectContaining({
        policyViolation: expect.objectContaining({ code: 'DELAY_EXCEEDED' }),
      }))
    })

    it('répond que la demande est refusée, pas « créée avec succès »', async () => {
      const res = await callPost({ answers: CLIENT_ANSWERS })
      const body = await res.json()

      expect(body.rejected).toBe(true)
      expect(body.code).toBe('DELAY_EXCEEDED')
      expect(body.message).not.toContain('succès')
    })

    it('passe un délai hors fenêtre au constructeur du payload ML', async () => {
      // buildMLPayload est mocké en identité ici : on lit son entrée. Le calcul
      // de Within_Return_Policy lui-même est couvert dans ml.test.ts.
      await callPost({ answers: CLIENT_ANSWERS })

      const mlInput = mockIngestClaim.mock.calls[0][0].mlPayload as Record<string, number>
      expect(mlInput.daysToReturn).toBeGreaterThan(mlInput.returnWindowDays)
    })

    it("ne signale rien quand la commande est dans la fenêtre", async () => {
      mockFindUnique.mockResolvedValue(makeSession({
        orderDate: new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10),
      }))
      mockIngestClaim.mockResolvedValue({
        ok: true,
        claim: {
          id: 'claim_3', status: 'PENDING', type: 'REFUND', createdAt: new Date(),
          aiDecision: null, fraudScore: 15,
          autoApproved: false, autoRejected: false, policyRejected: false,
        },
        customerPastReturns: 0,
      })

      const res = await callPost({ answers: CLIENT_ANSWERS })
      const body = await res.json()

      expect(body.rejected).toBeUndefined()
      expect(mockIngestClaim).toHaveBeenCalledWith(expect.objectContaining({
        policyViolation: null,
      }))
    })
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
    const withoutReason: Record<string, unknown> = { ...CLIENT_ANSWERS }
    delete withoutReason.reason

    const res = await callPost({ answers: withoutReason })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('reason')
    expect(mockIngestClaim).not.toHaveBeenCalled()
  })

  // Un champ boutique absent de la session ne bloque jamais le client : il
  // n'a aucun moyen de le renseigner, l'exiger fermerait le formulaire.
  it("n'exige aucun champ boutique que la session n'a pas transmis", async () => {
    const res = await callPost({ answers: CLIENT_ANSWERS })

    expect(res.status).toBe(201)
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

  // Une route dépréciée reste une route : exempter celle-ci du consentement
  // suffirait à le contourner, jeton de session en main.
  it('exige le consentement comme le canal v1', async () => {
    const res = await callPost({ answers: CLIENT_ANSWERS, data_consent: undefined })

    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('CONSENT_REQUIRED')
  })
})
