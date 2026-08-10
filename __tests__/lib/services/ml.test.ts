import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: {
    ML_API_URL: 'https://ml.example.com',
    ML_INTERNAL_SECRET: 'test-secret-12345',
  },
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('buildMLPayload', () => {
  it('construit le payload ML avec les champs requis', async () => {
    const { buildMLPayload } = await import('@/lib/services/ml')
    const payload = buildMLPayload({
      customerId: 'CUST-1024',
      shopName: 'Ma Boutique',
      productCategory: 'Electronics',
      productPrice: 5000,
      productQuantity: 2,
      orderTotal: 10000,
      paymentMethod: 'CCP',
      shippingMethod: 'Yalidine',
      shippingCost: 500,
      customerGender: 'M',
      customerAge: 30,
      customerWilaya: '16',
      reason: 'Produit défectueux',
      daysToReturn: 5,
      returnWindowDays: 14,
    })

    expect(payload.Customer_ID).toBe('CUST-1024')
    expect(payload.Shop_Name).toBe('Ma Boutique')
    expect(payload.Product_Price_DA).toBe(5000)
    expect(payload.Order_Quantity).toBe(2)
    expect(payload.Total_Amount_DA).toBe(10000)
    expect(payload.Within_Return_Policy).toBe(1)
    expect(payload.Is_Suspicious).toBe(0)
  })

  // Within_Return_Policy n'est plus une constante : depuis que la page hébergée
  // accepte les demandes hors délai, la valeur doit refléter la réalité.
  describe('Within_Return_Policy', () => {
    const base = {
      customerId: null, shopName: 'Test', productCategory: null,
      productPrice: null, productQuantity: null, orderTotal: null,
      paymentMethod: 'CCP', shippingMethod: 'Standard', shippingCost: 0,
      customerGender: 'F', customerAge: null, customerWilaya: '31',
      reason: 'Test',
    }

    it('vaut 1 dans la fenêtre', async () => {
      const { buildMLPayload } = await import('@/lib/services/ml')
      expect(buildMLPayload({ ...base, daysToReturn: 5, returnWindowDays: 14 })
        .Within_Return_Policy).toBe(1)
    })

    it('vaut 1 le dernier jour de la fenêtre', async () => {
      const { buildMLPayload } = await import('@/lib/services/ml')
      expect(buildMLPayload({ ...base, daysToReturn: 14, returnWindowDays: 14 })
        .Within_Return_Policy).toBe(1)
    })

    it('vaut 0 hors fenêtre', async () => {
      const { buildMLPayload } = await import('@/lib/services/ml')
      expect(buildMLPayload({ ...base, daysToReturn: 15, returnWindowDays: 14 })
        .Within_Return_Policy).toBe(0)
      expect(buildMLPayload({ ...base, daysToReturn: 212, returnWindowDays: 30 })
        .Within_Return_Policy).toBe(0)
    })
  })

  it('utilise des valeurs par défaut pour les champs optionnels', async () => {
    const { buildMLPayload } = await import('@/lib/services/ml')
    const payload = buildMLPayload({
      customerId: null,
      shopName: 'Test',
      productCategory: null,
      productPrice: null,
      productQuantity: null,
      orderTotal: null,
      paymentMethod: 'CCP',
      shippingMethod: 'Standard',
      shippingCost: 0,
      customerGender: 'F',
      customerAge: null,
      customerWilaya: '31',
      reason: 'Test',
      daysToReturn: 0,
      returnWindowDays: 14,
    })

    expect(payload.Product_Category).toBe('Unknown')
    expect(payload.Customer_ID).toBe('')
    expect(payload.Customer_Age).toBe(0)
    expect(payload.Product_Price_DA).toBe(1)
    expect(payload.Order_Quantity).toBe(1)
  })
})

describe('Customer_Satisfaction', () => {
  it("n'est plus produit par buildMLPayload", async () => {
    const { buildMLPayload } = await import('@/lib/services/ml')
    const payload = buildMLPayload({
      customerId: null, shopName: 'Test', productCategory: null,
      productPrice: null, productQuantity: null, orderTotal: null,
      paymentMethod: 'CCP', shippingMethod: 'Standard', shippingCost: 0,
      customerGender: 'F', customerAge: null, customerWilaya: '31',
      reason: 'Test', daysToReturn: 2, returnWindowDays: 14,
    })

    expect('Customer_Satisfaction' in payload).toBe(false)
  })

  it('part à null vers le dataset, même sur un ancien mlInput qui portait un 3', async () => {
    const { buildReclamationInputFromClaim } = await import('@/lib/services/ml')
    const row = buildReclamationInputFromClaim({
      orderId: 'CMD-1', customerId: null, fraudScore: 0,
      productName: 'X', orderDate: null, createdAt: null,
      type: 'REFUND', aiDecision: 'Exchange',
      vendor: { companyName: 'Caba Store' },
      mlInput: { Customer_Satisfaction: 3 },
    })

    expect(row.Customer_Satisfaction).toBeNull()
  })
})

describe('buildReclamationInputFromClaim', () => {
  const baseClaim = {
    orderId:     'CMD-1',
    productName: 'Nike Air Max',
    orderDate:   new Date('2026-07-01'),
    createdAt:   new Date('2026-07-05'),
    type:        'REFUND' as const,
    aiDecision:  'Exchange',
    vendor:      { companyName: 'Caba Store' },
  }

  it('prend Customer_ID et Fraud_Score sur les colonnes de la claim', async () => {
    const { buildReclamationInputFromClaim } = await import('@/lib/services/ml')
    const row = buildReclamationInputFromClaim({
      ...baseClaim,
      customerId: 'CUST-1024',
      fraudScore: 45,
      mlInput:    { Customer_ID: 'ancien', Fraud_Score: 0, Customer_Wilaya: 'Alger', Payment_Method: 'CCP' },
    })

    expect(row.Customer_ID).toBe('CUST-1024')
    expect(row.Fraud_Score).toBe(45)
    expect(row.Customer_Wilaya).toBe('Alger')
    expect(row.Payment_Method).toBe('CCP')
  })

  it('retombe sur mlInput quand les colonnes sont absentes (claims historiques)', async () => {
    const { buildReclamationInputFromClaim } = await import('@/lib/services/ml')
    const row = buildReclamationInputFromClaim({
      ...baseClaim,
      customerId: null,
      fraudScore: null,
      mlInput:    { Customer_ID: 'CUST-legacy', Fraud_Score: 30 },
    })

    expect(row.Customer_ID).toBe('CUST-legacy')
    expect(row.Fraud_Score).toBe(30)
  })
})

describe('callMLPredict', () => {
  it('retourne ok:true en cas de prédiction valide', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        resolution: {
          prediction: 'Exchange',
          probabilities: { Exchange: 0.85, Repair: 0.1, Reject: 0.05 },
        },
      }),
    })

    const { callMLPredict } = await import('@/lib/services/ml')
    const result = await callMLPredict({ test: true })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.prediction.resolution.prediction).toBe('Exchange')
    }
  })

  it('retourne ok:false en cas de HTTP 500 (retryable)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ detail: 'Internal error' }),
    })

    const { callMLPredict } = await import('@/lib/services/ml')
    const result = await callMLPredict({ test: true }, { retries: 0 })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.retryable).toBe(true)
    }
  })

  it('retry en cas d\'échec retryable', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          resolution: {
            prediction: 'Repair',
            probabilities: { Repair: 0.9, Exchange: 0.1, Reject: 0 },
          },
        }),
      })

    const { callMLPredict } = await import('@/lib/services/ml')
    const result = await callMLPredict({ test: true })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.prediction.resolution.prediction).toBe('Repair')
    }
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('rejette une classe de prédiction invalide', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        resolution: {
          prediction: 'Refund',
          probabilities: {},
        },
      }),
    })

    const { callMLPredict } = await import('@/lib/services/ml')
    const result = await callMLPredict({ test: true }, { retries: 0 })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.retryable).toBe(false)
      expect(result.error).toContain('invalid_prediction_class')
    }
  })

  it('timeout après le délai configuré', async () => {
    vi.useFakeTimers()
    mockFetch.mockImplementationOnce((_url: string, options?: RequestInit) => {
      const signal = (options as any)?.signal as AbortSignal | undefined
      return new Promise((_resolve, reject) => {
        if (signal) {
          signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted')
            err.name = 'AbortError'
            reject(err)
          })
        }
      })
    })

    const { callMLPredict } = await import('@/lib/services/ml')
    const promise = callMLPredict({ test: true }, { retries: 0, timeoutMs: 100 })

    vi.advanceTimersByTime(150)
    const result = await promise

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.timedOut).toBe(true)
    }
    vi.useRealTimers()
  })
})
