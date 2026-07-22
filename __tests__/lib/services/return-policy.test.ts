import { describe, it, expect } from 'vitest'
import { checkReturnPolicy } from '@/lib/services/return-policy'

const basePolicy = {
  maxClaimDays: 14,
  nonRefundableCategories: [],
  exchangeOnlyCategories: [],
  acceptedTypes: ['EXCHANGE' as const, 'REFUND' as const, 'REPAIR' as const],
}

describe('checkReturnPolicy', () => {
  it('accepte une demande dans les délais', () => {
    const result = checkReturnPolicy(basePolicy, { daysToReturn: 5 })
    expect(result).toEqual({ ok: true, forceExchange: false })
  })

  it('accepte si la politique est null (pas de politique configurée)', () => {
    const result = checkReturnPolicy(null, { daysToReturn: 99 })
    expect(result).toEqual({ ok: true, forceExchange: false })
  })

  describe('DELAY_EXCEEDED', () => {
    it('refuse si le délai est dépassé', () => {
      const result = checkReturnPolicy(basePolicy, { daysToReturn: 15 })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('DELAY_EXCEEDED')
        expect(result.extra?.policy_days).toBe(14)
        expect(result.extra?.days_actual).toBe(15)
      }
    })

    it('accepte si le délai est exactement la limite', () => {
      const result = checkReturnPolicy(basePolicy, { daysToReturn: 14 })
      expect(result.ok).toBe(true)
    })
  })

  describe('NON_REFUNDABLE_CATEGORY', () => {
    const policyWithNonRefundable = {
      ...basePolicy,
      nonRefundableCategories: ['Food', 'Beauty'],
    }

    it('refuse une catégorie non remboursable', () => {
      const result = checkReturnPolicy(policyWithNonRefundable, {
        daysToReturn: 5,
        productCategory: 'Food',
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('NON_REFUNDABLE_CATEGORY')
      }
    })

    it('accepte une catégorie remboursable', () => {
      const result = checkReturnPolicy(policyWithNonRefundable, {
        daysToReturn: 5,
        productCategory: 'Electronics',
      })
      expect(result.ok).toBe(true)
    })

    it('est insensible à la casse', () => {
      const result = checkReturnPolicy(policyWithNonRefundable, {
        daysToReturn: 5,
        productCategory: 'food',
      })
      expect(result.ok).toBe(false)
    })
  })

  describe('CLAIM_TYPE_NOT_ACCEPTED', () => {
    const policyWithAcceptedTypes = {
      ...basePolicy,
      acceptedTypes: ['EXCHANGE' as const, 'REPAIR' as const],
    }

    it('refuse un type non accepté', () => {
      const result = checkReturnPolicy(policyWithAcceptedTypes, {
        daysToReturn: 5,
        claimType: 'REFUND',
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('CLAIM_TYPE_NOT_ACCEPTED')
      }
    })

    it('accepte un type accepté', () => {
      const result = checkReturnPolicy(policyWithAcceptedTypes, {
        daysToReturn: 5,
        claimType: 'EXCHANGE',
      })
      expect(result.ok).toBe(true)
    })
  })

  describe('forceExchange', () => {
    const policyWithExchangeOnly = {
      ...basePolicy,
      exchangeOnlyCategories: ['Underwear', 'Shoes'],
    }

    it('force l\'échange pour une catégorie exchange-only', () => {
      const result = checkReturnPolicy(policyWithExchangeOnly, {
        daysToReturn: 5,
        productCategory: 'Shoes',
      })
      expect(result).toEqual({ ok: true, forceExchange: true })
    })

    it('ne force pas l\'échange pour une catégorie normale', () => {
      const result = checkReturnPolicy(policyWithExchangeOnly, {
        daysToReturn: 5,
        productCategory: 'Electronics',
      })
      expect(result).toEqual({ ok: true, forceExchange: false })
    })
  })
})
