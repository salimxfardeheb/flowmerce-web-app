import { describe, it, expect } from 'vitest'
import { cn, generateApiKey, hashApiKey, apiKeyPrefix, formatDate } from '@/lib/utils'

describe('utils', () => {
  describe('cn', () => {
    it('fusionne des classes Tailwind', () => {
      expect(cn('px-4', 'py-2')).toBe('px-4 py-2')
    })

    it('gère les classes conditionnelles', () => {
      expect(cn('base', false && 'hidden', 'visible')).toBe('base visible')
    })

    it('résout les conflits Tailwind', () => {
      expect(cn('px-4', 'px-6')).toBe('px-6')
    })

    it('gère les arguments vides', () => {
      expect(cn()).toBe('')
    })
  })

  describe('generateApiKey', () => {
    it('génère une clé avec le préfixe flk_', () => {
      const key = generateApiKey()
      expect(key).toMatch(/^flk_/)
    })

    it('génère une clé de longueur suffisante', () => {
      const key = generateApiKey()
      expect(key.length).toBeGreaterThan(40)
    })

    it('génère des clés uniques', () => {
      const keys = new Set(Array.from({ length: 100 }, () => generateApiKey()))
      expect(keys.size).toBe(100)
    })
  })

  describe('hashApiKey', () => {
    it('produit un hash SHA-256 hexadécimal', () => {
      const hash = hashApiKey('test-key')
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('est déterministe', () => {
      expect(hashApiKey('test-key')).toBe(hashApiKey('test-key'))
    })

    it('produit des hash différents pour des clés différentes', () => {
      expect(hashApiKey('key-a')).not.toBe(hashApiKey('key-b'))
    })
  })

  describe('apiKeyPrefix', () => {
    it('retourne les 12 premiers caractères', () => {
      const prefix = apiKeyPrefix('flk_abc123def456ghi')
      expect(prefix).toBe('flk_abc123de')
      expect(prefix.length).toBe(12)
    })
  })

  describe('formatDate', () => {
    it('formate une date en français (jj/mm/aaaa)', () => {
      const date = new Date(2025, 0, 15)
      expect(formatDate(date)).toBe('15/01/2025')
    })

    it('accepte une chaîne ISO', () => {
      expect(formatDate('2025-06-01T00:00:00.000Z')).toBe('01/06/2025')
    })
  })
})
