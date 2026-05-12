import { NextResponse } from 'next/server'
import { prisma } from './prisma'
import { hashApiKey } from './utils'
import { log } from './logger'

async function _findKey(hash: string) {
  return prisma.apiKey.findUnique({
    where:   { key: hash },
    include: { vendor: { include: { returnPolicy: true } } },
  })
}

type KeyRecord = NonNullable<Awaited<ReturnType<typeof _findKey>>>

export type ApiKeyResult =
  | { ok: true;  keyRecord: KeyRecord }
  | { ok: false; response: NextResponse }

export async function validateApiKey(rawKey: string | null): Promise<ApiKeyResult> {
  if (!rawKey) {
    return { ok: false, response: NextResponse.json({ error: 'Clé API manquante' }, { status: 401 }) }
  }

  let keyRecord: KeyRecord | null
  try {
    keyRecord = await _findKey(hashApiKey(rawKey))
  } catch (err) {
    log.error('api-key-auth.db_error', { err: err instanceof Error ? err.message : String(err) })
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Service temporairement indisponible' },
        { status: 503, headers: { 'Retry-After': '30' } },
      ),
    }
  }

  if (!keyRecord || !keyRecord.isActive) {
    return { ok: false, response: NextResponse.json({ error: 'Clé API invalide ou révoquée' }, { status: 401 }) }
  }
  if (keyRecord.vendor.status !== 'APPROVED') {
    return { ok: false, response: NextResponse.json({ error: 'Compte vendeur non approuvé' }, { status: 403 }) }
  }

  return { ok: true, keyRecord }
}
