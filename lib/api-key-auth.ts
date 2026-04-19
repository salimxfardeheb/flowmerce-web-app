import { NextResponse } from 'next/server'
import { prisma } from './prisma'
import { hashApiKey } from './utils'

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

  const keyRecord = await _findKey(hashApiKey(rawKey)).catch(() => null)

  if (!keyRecord || !keyRecord.isActive) {
    return { ok: false, response: NextResponse.json({ error: 'Clé API invalide ou révoquée' }, { status: 401 }) }
  }
  if (keyRecord.vendor.status !== 'APPROVED') {
    return { ok: false, response: NextResponse.json({ error: 'Compte vendeur non approuvé' }, { status: 403 }) }
  }

  return { ok: true, keyRecord }
}
