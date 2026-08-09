import { describe, it, expect } from 'vitest'
import {
  RETURN_REASONS,
  CLAIM_TYPES,
  AI_DECISIONS,
  CLAIM_STATUSES,
  DOCUMENT_TYPES,
  isAIDecision,
  VENDOR_DECISIONS,
  isVendorDecision,
  formatClaimType,
  CLAIM_TYPE_LABELS,
  AI_DECISION_LABELS,
  VENDOR_DECISION_LABELS,
  CLAIM_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  VENDOR_STATUS_LABELS,
} from '@/lib/constants'

describe('constants', () => {
  describe('RETURN_REASONS', () => {
    it('contient les raisons de retour en français', () => {
      expect(RETURN_REASONS).toContain('Produit défectueux')
      expect(RETURN_REASONS).toContain("Changement d'avis")
    })

    it('est un tableau readonly', () => {
      expect(Array.isArray(RETURN_REASONS)).toBe(true)
    })
  })

  describe('CLAIM_TYPES', () => {
    it('contient EXCHANGE, REFUND, REPAIR', () => {
      expect(CLAIM_TYPES).toEqual(['EXCHANGE', 'REFUND', 'REPAIR'])
    })
  })

  describe('AI_DECISIONS', () => {
    it('contient Exchange, Repair, Reject', () => {
      expect(AI_DECISIONS).toEqual(['Exchange', 'Repair', 'Reject'])
    })

    it("n'inclut pas Refund", () => {
      expect(AI_DECISIONS).not.toContain('Refund')
    })
  })

  describe('CLAIM_STATUSES', () => {
    it('contient les 4 statuts', () => {
      expect(CLAIM_STATUSES).toHaveLength(4)
      expect(CLAIM_STATUSES).toContain('PENDING')
      expect(CLAIM_STATUSES).toContain('APPROVED')
      expect(CLAIM_STATUSES).toContain('REJECTED')
      expect(CLAIM_STATUSES).toContain('IN_PROGRESS')
    })
  })

  describe('DOCUMENT_TYPES', () => {
    it('contient les types de document', () => {
      expect(DOCUMENT_TYPES).toContain('ID_CARD')
      expect(DOCUMENT_TYPES).toContain('BUSINESS_REGISTRATION')
    })
  })

  describe('isAIDecision', () => {
    it('retourne true pour une décision IA valide', () => {
      expect(isAIDecision('Exchange')).toBe(true)
      expect(isAIDecision('Repair')).toBe(true)
      expect(isAIDecision('Reject')).toBe(true)
    })

    it('retourne false pour une valeur invalide', () => {
      expect(isAIDecision('Refund')).toBe(false)
      expect(isAIDecision('INVALID')).toBe(false)
      expect(isAIDecision('')).toBe(false)
      expect(isAIDecision(null)).toBe(false)
      expect(isAIDecision(undefined)).toBe(false)
      expect(isAIDecision(123)).toBe(false)
    })
  })

  describe('isVendorDecision', () => {
    it('accepte les 3 classes ML plus Refund', () => {
      expect(isVendorDecision('Exchange')).toBe(true)
      expect(isVendorDecision('Repair')).toBe(true)
      expect(isVendorDecision('Reject')).toBe(true)
      expect(isVendorDecision('Refund')).toBe(true)
    })

    it('retourne false pour une valeur invalide', () => {
      expect(isVendorDecision('INVALID')).toBe(false)
      expect(isVendorDecision('')).toBe(false)
      expect(isVendorDecision(null)).toBe(false)
      expect(isVendorDecision(undefined)).toBe(false)
      expect(isVendorDecision(123)).toBe(false)
    })

    it("n'élargit pas le contrat ML 3 classes", () => {
      expect(AI_DECISIONS).not.toContain('Refund')
      expect(VENDOR_DECISIONS).toHaveLength(AI_DECISIONS.length + 1)
      for (const d of AI_DECISIONS) {
        expect(isVendorDecision(d)).toBe(true)
      }
    })
  })

  describe('formatClaimType', () => {
    it('retourne le label français pour un type valide', () => {
      expect(formatClaimType('EXCHANGE')).toBe('Échange')
      expect(formatClaimType('REFUND')).toBe('Remboursement')
      expect(formatClaimType('REPAIR')).toBe('Réparation')
    })

    it("retourne 'En attente IA' pour null/undefined", () => {
      expect(formatClaimType(null)).toBe('En attente IA')
      expect(formatClaimType(undefined)).toBe('En attente IA')
    })

    it("retourne la valeur brute si le type n'est pas reconnu", () => {
      expect(formatClaimType('UNKNOWN')).toBe('UNKNOWN')
    })
  })

  describe('labels', () => {
    it('CLAIM_TYPE_LABELS a toutes les clés', () => {
      expect(Object.keys(CLAIM_TYPE_LABELS)).toEqual(['EXCHANGE', 'REFUND', 'REPAIR'])
    })

    it('AI_DECISION_LABELS a toutes les clés', () => {
      expect(Object.keys(AI_DECISION_LABELS)).toEqual(['Exchange', 'Repair', 'Reject'])
    })

    it('VENDOR_DECISION_LABELS a toutes les clés', () => {
      expect(Object.keys(VENDOR_DECISION_LABELS)).toEqual(['Exchange', 'Repair', 'Refund', 'Reject'])
      expect(VENDOR_DECISION_LABELS.Refund).toBe('Remboursement')
    })

    it('CLAIM_STATUS_LABELS a toutes les clés', () => {
      expect(Object.keys(CLAIM_STATUS_LABELS)).toEqual(['PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS'])
    })

    it('DOCUMENT_TYPE_LABELS a toutes les clés', () => {
      expect(Object.keys(DOCUMENT_TYPE_LABELS)).toEqual([
        'ID_CARD', 'BUSINESS_REGISTRATION', 'ADDRESS_PROOF',
        'TAX_CERTIFICATE', 'BANK_DETAILS', 'OTHER',
      ])
    })

    it('VENDOR_STATUS_LABELS a toutes les clés', () => {
      expect(Object.keys(VENDOR_STATUS_LABELS)).toEqual([
        'PENDING', 'APPROVED', 'REJECTED', 'DOCUMENTS_REQUESTED',
      ])
    })
  })
})
