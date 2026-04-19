// src/app/api/return/[token]/vendor-info/route.ts
// Valide la clé API et retourne les infos publiques du vendeur
// incluant les motifs de retour configurés (pour le formulaire public)
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashApiKey } from '@/lib/utils'

// Endpoint consommé uniquement par /return/[token] (même origine).
// Pas de CORS ouvert : les requêtes cross-origin sont bloquées par le navigateur.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const keyRecord = await prisma.apiKey.findUnique({
    where:   { key: hashApiKey(token) },
    include: { vendor: { include: { returnPolicy: true } } },
  }).catch(() => null)

  if (!keyRecord) {
    return NextResponse.json(
      { valid: false, companyName: '', error: 'Clé API introuvable.' },
      { status: 403 }
    )
  }
  if (!keyRecord.isActive) {
    return NextResponse.json(
      { valid: false, companyName: '', error: 'Cette clé API est désactivée.' },
      { status: 403 }
    )
  }
  if (keyRecord.vendor.status !== 'APPROVED') {
    return NextResponse.json(
      { valid: false, companyName: '', error: "Ce compte vendeur n'est pas encore approuvé." },
      { status: 403 }
    )
  }

  return NextResponse.json(
    {
      valid:       true,
      companyName: keyRecord.vendor.companyName,
    },
    { status: 200 }
  )
}