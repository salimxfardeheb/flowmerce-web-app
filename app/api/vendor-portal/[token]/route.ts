// app/api/vendor-portal/token/route.ts — Flowmerce
//
// POST /api/vendor-portal/token
// Appelé par CabaStore (côté serveur) avec la clé API du vendeur.
// Retourne un token de portail signé (1h) que CabaStore embarque dans l'URL du lien.
//
// Sécurité :
//   - La clé API brute n'est jamais exposée au navigateur du vendeur
//   - Le token signé ne permet d'accéder qu'aux données de ce vendeur
//   - Expiration courte (1h) → le vendeur obtient un nouveau lien depuis CabaStore

import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey }            from '@/lib/api-key-auth'
import { signPortalToken }           from '@/lib/vendor-portal-token'

export async function POST(req: NextRequest) {
  // Auth via clé API vendeur (CabaStore l'envoie en Bearer depuis son serveur)
  const rawKey =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    req.headers.get('x-api-key') ??
    null

  const auth = await validateApiKey(rawKey)
  if (!auth.ok) return auth.response

  const { keyRecord } = auth

  const token = signPortalToken({
    vendorId: keyRecord.vendorId,
    apiKeyId: keyRecord.id,
  })

  return NextResponse.json({ token, expires_in: 3600 })
}