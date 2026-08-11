// C-06 — /api/predict.
//
// Deux défauts corrigés :
//   (a) la route lisait `rawBody.customer_email` / `customer_phone`, deux clés
//       hors contrat qui valaient donc toujours `undefined` : chaque appel
//       créait un `CustomerFraudRecord` vide, dans une table interrogée par
//       index sur email/téléphone ;
//   (b) `rawBody.Fraud_Score` était écrasé par le score de ce compte vierge,
//       c'est-à-dire 0 — le modèle recevait systématiquement `Is_Suspicious = 0`
//       et `fraud_score_bin = 0`, quelle que soit la valeur transmise.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockPrisma = {
  predictionLog: { create: vi.fn().mockResolvedValue({}) },
  apiKey:        { update: vi.fn().mockResolvedValue({}) },
  customerFraudRecord: { findFirst: vi.fn(), create: vi.fn() },
}

const mockFraud = {
  findFraudRecord:         vi.fn(),
  findOrCreateFraudRecord: vi.fn(),
  computeFraudScore:       vi.fn(),
}

const mockML = { callMLPredict: vi.fn() }

const keyRecord = {
  id:       'key-1',
  vendorId: 'vendor-1',
  vendor:   {
    returnPolicy: {
      maxClaimDays: 14, fraudScoreThreshold: 70,
      nonRefundableCategories: [], exchangeOnlyCategories: [],
      acceptedTypes: ['EXCHANGE', 'REFUND', 'REPAIR'],
    },
  },
}

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/fraud-score', () => mockFraud)
vi.mock('@/lib/services/ml', () => mockML)
vi.mock('@/lib/api-key-auth', () => ({
  validateApiKey: vi.fn().mockResolvedValue({ ok: true, keyRecord }),
}))
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const corpsValide = {
  Customer_Gender:       'Female',
  Customer_Age:          30,
  Customer_Wilaya:       'Alger',
  Customer_Past_Returns: 3,
  Shop_Name:             'MonShop',
  Product_Category:      'Electronics',
  Product_Price_DA:      15000,
  Order_Quantity:        1,
  Total_Amount_DA:       15500,
  Payment_Method:        'CCP',
  Shipping_Method:       'Yalidine',
  Shipping_Cost_DA:      500,
  Return_Reason:         'Produit défectueux',
  Days_to_Return:        5,
  Fraud_Score:           42,
  Is_Suspicious:         0,
}

function requete(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/predict', {
    method:  'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': 'flw_test' },
    body:    JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockML.callMLPredict.mockResolvedValue({
    ok: true,
    prediction: {
      resolution: { prediction: 'Exchange', confidence: 0.8, probabilities: { Exchange: 0.8 } },
      contract:   { version: 'v-test', degraded: false, unknown_categories: {} },
    },
  })
})

describe('POST /api/predict', () => {
  // ── (a) Plus de ligne orpheline ─────────────────────────────────────────
  it('ne crée aucun enregistrement de fraude', async () => {
    const { POST } = await import('@/app/api/predict/route')
    await POST(requete(corpsValide))

    expect(mockFraud.findOrCreateFraudRecord).not.toHaveBeenCalled()
    expect(mockPrisma.customerFraudRecord.create).not.toHaveBeenCalled()
  })

  it('ne consulte même pas la base sans identification du client', async () => {
    const { POST } = await import('@/app/api/predict/route')
    await POST(requete(corpsValide))

    expect(mockFraud.findFraudRecord).not.toHaveBeenCalled()
  })

  // ── (b) Le Fraud_Score transmis n'est plus neutralisé ───────────────────
  it('conserve le Fraud_Score de l\'appelant quand le client n\'est pas identifié', async () => {
    const { POST } = await import('@/app/api/predict/route')
    const res = await POST(requete(corpsValide))
    const body = await res.json()

    expect(mockML.callMLPredict).toHaveBeenCalledWith(
      expect.objectContaining({ Fraud_Score: 42 }),
      expect.anything(),
    )
    expect(body.fraud_score_applied).toEqual({ value: 42, source: 'caller' })
  })

  it('remplace le score par celui du réseau quand le client est identifié', async () => {
    mockFraud.findFraudRecord.mockResolvedValue({ id: 'fraud-1' })
    mockFraud.computeFraudScore.mockReturnValue(75)

    const { POST } = await import('@/app/api/predict/route')
    const body = await (await POST(
      requete({ ...corpsValide, customer_email: 'client@example.com' }),
    )).json()

    expect(mockFraud.findFraudRecord).toHaveBeenCalledWith('client@example.com', undefined)
    expect(body.fraud_score_applied).toEqual({ value: 75, source: 'flowmerce_network' })
  })

  it('conserve le score transmis si le client est inconnu du réseau', async () => {
    mockFraud.findFraudRecord.mockResolvedValue(null)

    const { POST } = await import('@/app/api/predict/route')
    await POST(requete({ ...corpsValide, customer_email: 'inconnu@example.com' }))

    expect(mockML.callMLPredict).toHaveBeenCalledWith(
      expect.objectContaining({ Fraud_Score: 42 }),
      expect.anything(),
    )
  })

  it('propage le score au seuil vendeur : Is_Suspicious devient 1', async () => {
    const { POST } = await import('@/app/api/predict/route')
    await POST(requete({ ...corpsValide, Fraud_Score: 85 }))

    expect(mockML.callMLPredict).toHaveBeenCalledWith(
      expect.objectContaining({ Fraud_Score: 85, Is_Suspicious: 1 }),
      expect.anything(),
    )
  })

  // ── Contrat ML ──────────────────────────────────────────────────────────
  it('traduit le vocabulaire catégoriel avant l\'appel', async () => {
    const { POST } = await import('@/app/api/predict/route')
    await POST(requete(corpsValide))

    expect(mockML.callMLPredict).toHaveBeenCalledWith(
      expect.objectContaining({
        Product_Category: 'Électronique',
        Payment_Method:   'CCP',
        Shipping_Method:  'Yalidine',
        Customer_Gender:  'Female',
        Customer_Wilaya:  'Alger',
      }),
      expect.anything(),
    )
  })

  it('n\'envoie aucun champ hors contrat ML', async () => {
    const { POST } = await import('@/app/api/predict/route')
    await POST(requete({
      ...corpsValide,
      customer_email:          'client@example.com',
      Customer_Satisfaction:   4,
      Refund_Amount_DA:        1000,
      Return_Shipping_Paid_By: 'Marchand',
      champ_proprietaire:      'xyz',
    }))

    const payload = mockML.callMLPredict.mock.calls[0][0]
    for (const interdit of [
      'customer_email', 'Customer_Satisfaction', 'Refund_Amount_DA',
      'Return_Shipping_Paid_By', 'champ_proprietaire',
    ]) {
      expect(payload).not.toHaveProperty(interdit)
    }
  })

  it('n\'exige plus Customer_Satisfaction', async () => {
    const { POST } = await import('@/app/api/predict/route')
    expect((await POST(requete(corpsValide))).status).toBe(200)
  })

  it('refuse un champ requis manquant', async () => {
    const { Shop_Name, ...incomplet } = corpsValide
    const { POST } = await import('@/app/api/predict/route')
    const res = await POST(requete(incomplet))

    expect(res.status).toBe(422)
    expect((await res.json()).error).toContain('Shop_Name')
  })

  it('remonte l\'état du contrat renvoyé par le ML', async () => {
    const { POST } = await import('@/app/api/predict/route')
    const body = await (await POST(requete(corpsValide))).json()

    expect(body.contract).toMatchObject({ version: 'v-test', degraded: false })
  })

  // ── Indisponibilité ML ──────────────────────────────────────────────────
  it('renvoie 504 sur timeout ML', async () => {
    mockML.callMLPredict.mockResolvedValue({
      ok: false, timedOut: true, error: 'timeout', retryable: true, attempts: 3,
    })

    const { POST } = await import('@/app/api/predict/route')
    expect((await POST(requete(corpsValide))).status).toBe(504)
  })

  it('renvoie 503 si le service ML est inaccessible', async () => {
    mockML.callMLPredict.mockResolvedValue({
      ok: false, timedOut: false, error: 'ECONNREFUSED', retryable: true, attempts: 3,
    })

    const { POST } = await import('@/app/api/predict/route')
    expect((await POST(requete(corpsValide))).status).toBe(503)
  })
})
