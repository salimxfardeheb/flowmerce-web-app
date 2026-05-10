// app/vendor-portal/page.tsx — Flowmerce
//
// Portail vendeur isolé par apiKeyId (pas uniquement vendorId).
// Le token contient vendorId + apiKeyId — on filtre sur les DEUX
// pour garantir qu'un vendeur ne voit que les claims créés avec SA clé.
// Les claims de l'admin (créés avec FLOWMERCE_API_KEY) ont un apiKeyId différent
// et n'apparaissent donc pas ici.

import { verifyPortalToken }               from '@/lib/vendor-portal-token'
import { prisma }                          from '@/lib/prisma'
import PortalClient, { type PortalClaim } from './PortalClient' 

function ErrorPage({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-10 max-w-md text-center">
        <p className="text-4xl mb-4">🔒</p>
        <h1 className="text-lg font-bold text-gray-900 mb-2">Accès refusé</h1>
        <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
        <p className="text-xs text-gray-400 mt-4">
          Retournez sur CabaStore et cliquez à nouveau sur{' '}
          <strong>«&nbsp;Gérer mes retours&nbsp;»</strong> pour obtenir un lien valide.
        </p>
      </div>
    </div>
  )
}

export default async function VendorPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; filter?: string }>
}) {
  const params = await searchParams
  const token  = params.t?.trim()

  if (!token) {
    return <ErrorPage message="Aucun token d'accès fourni." />
  }

  const payload = verifyPortalToken(token)
  if (!payload) {
    return <ErrorPage message="Ce lien a expiré ou est invalide. Les liens sont valides 1 heure." />
  }

  // Les DEUX valeurs viennent du token signé — jamais du query string
  const { vendorId, apiKeyId } = payload

  console.log('[vendor-portal] vendorId:', vendorId, '| apiKeyId:', apiKeyId)

  const vendor = await prisma.vendor.findUnique({
    where:  { id: vendorId },
    select: { companyName: true },
  })

  if (!vendor) {
    return <ErrorPage message="Vendeur introuvable. Contactez l'administrateur." />
  }

  // Lire le validationMode pour le toggle auto-approve
  const returnPolicy = await prisma.returnPolicy.findUnique({
    where:  { vendorId },
    select: { validationMode: true },
  })
  const validationMode = (returnPolicy?.validationMode ?? 'MANUAL') as 'MANUAL' | 'AI_AUTO'

  // Filtre de statut optionnel
  const VALID = ['PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS'] as const
  type S = (typeof VALID)[number]
  const up     = params.filter?.toUpperCase()
  const status = up && (VALID as readonly string[]).includes(up) ? (up as S) : undefined

  // ── Requête filtrée par apiKeyId (isolation stricte par clé API) ──────────
  // vendorId est une sécurité supplémentaire (double vérification)
  const raw = await prisma.claim.findMany({
    where: {
      vendorId,   // sécurité : le claim appartient bien à ce vendeur
      apiKeyId,   // isolation : seulement les claims créés avec cette clé API
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id:            true,
      orderId:       true,
      customerName:  true,
      customerEmail: true,
      productName:   true,
      type:          true,
      status:        true,
      aiDecision:    true,
      aiScore:       true,
      fraudScore:    true,
      createdAt:     true,
      description:   true,
    },
  })

  console.log('[vendor-portal] claims found:', raw.length, '(filtered by apiKeyId:', apiKeyId, ')')

  const claims: PortalClaim[] = raw.map(c => ({
    ...c,
    fraudScore: c.fraudScore != null ? Number(c.fraudScore) : null,
    aiScore:    c.aiScore    != null ? Number(c.aiScore)    : null,
    createdAt:  c.createdAt.toISOString(),
  }))

  return (
    <PortalClient
      initialClaims={claims}
      token={token}
      vendorName={vendor.companyName}
      vendorId={vendorId}
      currentFilter={up ?? ''}
      initialValidationMode={validationMode}
    />
  )
}