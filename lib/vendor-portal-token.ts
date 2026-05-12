// lib/vendor-portal-token.ts — Flowmerce
//
// Génère et vérifie des tokens de portail vendeur signés HMAC-SHA256.
// Ces tokens sont short-lived (1h) et encodent uniquement vendorId + apiKeyId.
// Ils sont émis par /api/vendor-portal/token et consommés par /vendor-portal.
//
// VENDOR_PORTAL_SECRET doit être dans .env.local (min 32 chars recommandé).

import { createHmac, timingSafeEqual } from 'crypto'
import { env } from './env'

const SECRET = env.VENDOR_PORTAL_SECRET

export interface PortalTokenPayload {
  vendorId: string
  apiKeyId: string
  exp:      number   // UNIX timestamp (secondes)
}

/**
 * Signe un payload et retourne un token opaque.
 * Format : base64url(json).base64url(hmac-sha256)
 */
export function signPortalToken(
  payload:    Omit<PortalTokenPayload, 'exp'>,
  ttlSeconds = 3_600,
): string {
  const exp  = Math.floor(Date.now() / 1000) + ttlSeconds
  const data = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url')
  const sig  = createHmac('sha256', SECRET).update(data).digest('base64url')
  return `${data}.${sig}`
}

/**
 * Vérifie la signature HMAC et l'expiration.
 * Retourne le payload si valide, null sinon.
 * Utilise timingSafeEqual pour éviter les timing attacks.
 */
export function verifyPortalToken(token: string): PortalTokenPayload | null {
  try {
    const dot = token.lastIndexOf('.')
    if (dot < 1) return null

    const data = token.slice(0, dot)
    const sig  = token.slice(dot + 1)

    const expected = createHmac('sha256', SECRET).update(data).digest('base64url')

    const sBuf = Buffer.from(sig,      'base64url')
    const eBuf = Buffer.from(expected, 'base64url')

    if (sBuf.length !== eBuf.length) return null
    if (!timingSafeEqual(sBuf, eBuf)) return null

    const payload = JSON.parse(
      Buffer.from(data, 'base64url').toString('utf8'),
    ) as PortalTokenPayload

    if (payload.exp < Math.floor(Date.now() / 1000)) return null

    return payload
  } catch {
    return null
  }
}