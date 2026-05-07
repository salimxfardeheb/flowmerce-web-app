// app/dashboard/claims/page.tsx — Flowmerce
//
// Réclamations — accessible aux VENDEURS et à l'ADMIN.
//   • Vendeur : voit uniquement ses propres réclamations (comportement inchangé)
//   • Admin   : voit TOUTES les réclamations, avec filtre par clé API (nom)

import { getSessionServer }                       from '@/lib/getSession'
import { prisma }                                 from '@/lib/prisma'
import { redirect }                               from 'next/navigation'
import { CLAIM_TYPE_LABELS, CLAIM_STATUS_LABELS, formatDate } from '@/lib/utils'
import { ClaimActions }                           from '@/components/claims/ClaimActions'
import { checkVendorAccess }                      from '@/lib/vendorGuard'
import { AlertTriangle, ArrowRight, Brain, Inbox, Sparkles, Key } from 'lucide-react'

export default async function ClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?:   string
    type?:     string
    source?:   string
    risk?:     string
    ml?:       string
    apiKeyId?: string   // filtre par clé API (admin + vendeur)
  }>
}) {
  await checkVendorAccess()
  const session = await getSessionServer()
  if (!session) redirect('/auth/login')

  const user    = session.user
  const isAdmin = user?.role === 'ADMIN'
  const params  = await searchParams

  // ── Résolution du scope (admin vs vendeur) ────────────────────────────────────
  let vendorId: string | undefined
  let adminApiKeys: {
    id: string; name: string; isActive: boolean
    vendor: { id: string; companyName: string }
  }[] = []

  if (isAdmin) {
    // Admin : charger toutes les clés API actives pour le filtre
    adminApiKeys = await prisma.apiKey.findMany({
      where:   { isActive: true },
      include: { vendor: { select: { id: true, companyName: true } } },
      orderBy: { vendor: { companyName: 'asc' } },
    })

    // Si un filtre apiKeyId est sélectionné → restreindre au vendeur de cette clé
    // vendorId reste undefined pour admin → toutes les réclamations
    // Le filtre par apiKeyId est appliqué directement sur le champ Claim.apiKeyId
  } else {
    // Vendeur : ses réclamations uniquement
    const vendor = await prisma.vendor.findUnique({ where: { userId: user.id } })
    if (!vendor) redirect('/auth/register')
    vendorId = vendor.id

    // Charger les clés API du vendeur pour le filtre
    adminApiKeys = await prisma.apiKey.findMany({
      where:   { vendorId: vendor.id, isActive: true },
      include: { vendor: { select: { id: true, companyName: true } } },
      orderBy: { createdAt: 'asc' },
    })
  }

  // ── Construction du filtre Prisma ─────────────────────────────────────────────
  const where: Record<string, unknown> = {}
  if (vendorId)               where.vendorId   = vendorId
  if (params.status)          where.status     = params.status
  if (params.type)            where.type       = params.type
  if (params.source)          where.source     = params.source
  if (params.risk === 'high') where.fraudScore = { gte: 60 }
  if (params.ml === 'true')   where.aiDecision = { not: null }
  // Filtre par clé API exacte (si l'utilisateur a sélectionné une clé)
  if (params.apiKeyId)        where.apiKeyId   = params.apiKeyId

  const scopeWhere = vendorId ? { vendorId } : {}

  const [claims, allScopedClaims] = await Promise.all([
    prisma.claim.findMany({ where, orderBy: { createdAt: 'desc' } }),
    prisma.claim.findMany({ where: scopeWhere, select: { id: true, status: true, aiDecision: true, fraudScore: true, apiKeyId: true } }),
  ])

  const total    = allScopedClaims.length
  const pending  = allScopedClaims.filter(c => c.status === 'PENDING').length
  const withML   = allScopedClaims.filter(c => c.aiDecision !== null).length
  const highRisk = allScopedClaims.filter(c => (c.fraudScore ?? 0) >= 60).length

  // ── Configs UI ─────────────────────────────────────────────────────────────────
  const statusConfig: Record<string, { label: string; cls: string }> = {
    PENDING:     { label: 'En attente', cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'   },
    APPROVED:    { label: 'Approuvée',  cls: 'bg-green-50 text-green-700 ring-1 ring-green-200'   },
    REJECTED:    { label: 'Refusée',    cls: 'bg-red-50 text-red-700 ring-1 ring-red-200'         },
    IN_PROGRESS: { label: 'En cours',   cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'      },
  }

  const resolutionConfig: Record<string, { label: string; cls: string; dot: string }> = {
    Refund:   { label: 'Remboursement', cls: 'text-green-700 bg-green-50 ring-1 ring-green-200',  dot: 'bg-green-500'  },
    Exchange: { label: 'Échange',       cls: 'text-blue-700 bg-blue-50 ring-1 ring-blue-200',     dot: 'bg-blue-500'   },
    Repair:   { label: 'Réparation',    cls: 'text-amber-700 bg-amber-50 ring-1 ring-amber-200',  dot: 'bg-amber-400'  },
    Reject:   { label: 'Refus',         cls: 'text-red-700 bg-red-50 ring-1 ring-red-200',        dot: 'bg-red-500'    },
  }

  const activeFilter = params.status || params.risk || params.ml

  // Helper : construit une URL en préservant tous les params existants
  function buildUrl(overrides: Record<string, string | undefined>): string {
    const base: Record<string, string> = {}
    if (params.status)   base.status   = params.status
    if (params.risk)     base.risk     = params.risk
    if (params.ml)       base.ml       = params.ml
    if (params.apiKeyId) base.apiKeyId = params.apiKeyId
    const merged = { ...base, ...overrides }
    const qs = Object.entries(merged)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join('&')
    return `/dashboard/claims${qs ? `?${qs}` : ''}`
  }

  // Label affiché dans le header selon le scope
  const selectedKey = params.apiKeyId
    ? adminApiKeys.find(k => k.id === params.apiKeyId)
    : null

  const scopeLabel = isAdmin
    ? selectedKey
      ? `${selectedKey.vendor.companyName} — ${selectedKey.name}`
      : 'Toutes boutiques'
    : undefined

  return (
    <div className="px-8 py-6 max-w-350">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Réclamations</h1>
          <p className="text-sm text-gray-500 mt-1">
            {scopeLabel
              ? <span>Scope : <span className="font-medium text-gray-700">{scopeLabel}</span></span>
              : 'Suivez et traitez les demandes clients, avec décisions automatiques et détection de fraude.'}
          </p>
        </div>
        {pending > 0 && (
          <a
            href={buildUrl({ status: 'PENDING' })}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors shrink-0"
          >
            {pending} en attente
            <ArrowRight className="w-4 h-4" />
          </a>
        )}
      </div>

      {/* ── Filtre par clé API (admin + vendeur multi-clés) ── */}
      {adminApiKeys.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3.5 mb-4 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 shrink-0">
            <Key className="w-4 h-4 text-indigo-500" />
            {isAdmin ? 'Filtrer par clé API' : 'Source'}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Toutes */}
            <a
              href={buildUrl({ apiKeyId: undefined })}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors border ${
                !params.apiKeyId
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {isAdmin ? 'Toutes boutiques' : 'Toutes sources'}
              <span className="ml-1.5 opacity-60">({allScopedClaims.length})</span>
            </a>

            {/* Une clé = une source */}
            {adminApiKeys.map(key => {
              // Nombre de claims liés exactement à cette clé
              const keyCount = allScopedClaims.filter(
                (c: { apiKeyId?: string | null }) => c.apiKeyId === key.id
              ).length
              return (
                <a
                  key={key.id}
                  href={buildUrl({ apiKeyId: key.id })}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors border ${
                    params.apiKeyId === key.id
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                  title={isAdmin ? `${key.vendor.companyName} — ${key.name}` : key.name}
                >
                  {isAdmin && (
                    <span className="mr-1">{key.vendor.companyName} —</span>
                  )}
                  {key.name}
                  <span className="ml-1.5 opacity-60">({keyCount})</span>
                </a>
              )
            })}
          </div>
        </div>
      )}

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3.5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{total}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3.5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">En attente</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{pending}</p>
          {pending > 0 && <p className="text-xs text-amber-500 mt-0.5">Action requise</p>}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3.5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Décisions auto.</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{withML}</p>
          {total > 0 && <p className="text-xs text-gray-400 mt-0.5">{Math.round((withML / total) * 100)}% du total</p>}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3.5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Risque élevé</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{highRisk}</p>
          {highRisk > 0 && <p className="text-xs text-red-500 mt-0.5">Vérification requise</p>}
        </div>
      </div>

      {/* ── Filtres statut / risque / ML ── */}
      <div className="flex items-center gap-1 mb-5 flex-wrap">
        <a
          href={buildUrl({ status: undefined, risk: undefined, ml: undefined })}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            !activeFilter ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Toutes
        </a>

        {(['PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS'] as const).map(s => (
          <a
            key={s}
            href={buildUrl({ status: s, risk: undefined, ml: undefined })}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              params.status === s ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {CLAIM_STATUS_LABELS[s]}
          </a>
        ))}

        <div className="w-px h-5 bg-gray-200 mx-1" />

        <a
          href={buildUrl({ risk: params.risk === 'high' ? undefined : 'high', status: undefined, ml: undefined })}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            params.risk === 'high'
              ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Risque élevé
        </a>

        <a
          href={buildUrl({ ml: params.ml === 'true' ? undefined : 'true', status: undefined, risk: undefined })}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            params.ml === 'true'
              ? 'bg-purple-50 text-purple-700 ring-1 ring-purple-200'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Brain className="w-3.5 h-3.5" />
          Décisions auto.
        </a>
      </div>

      {/* ── Table ── */}
      {claims.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 py-16 flex flex-col items-center">
          <Inbox className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-700">Aucune réclamation</p>
          <p className="text-xs text-gray-400 mt-1">
            Les demandes clients apparaîtront ici une fois reçues.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/60">
                {isAdmin && (
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">
                    Vendeur
                  </th>
                )}
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">
                  Client / Commande
                </th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">
                  Produit
                </th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">
                  Décision recommandée
                </th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">
                  Risque fraude
                </th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">
                  Statut
                </th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">
                  Date
                </th>
                <th className="px-4 py-3 min-w-47.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {claims.map(claim => {
                const fraudScore  = claim.fraudScore
                const source      = claim.source
                const productName = claim.productName
                const prediction  = claim.prediction as Record<string, unknown> | null

                const overrideData    = prediction?.override as Record<string, unknown> | undefined
                const displayDecision = typeof overrideData?.resolution === 'string'
                  ? overrideData.resolution
                  : claim.aiDecision
                const isOverridden = !!overrideData

                const productPrice = prediction?.productPrice    as number | null
                const productQty   = prediction?.productQuantity as number | null
                const orderTotal   = prediction?.orderTotal       as number | null

                const riskLevel =
                  fraudScore === null ? null
                  : fraudScore >= 60  ? { label: 'Élevé',  cls: 'text-red-700 bg-red-50 ring-1 ring-red-200',       dot: 'bg-red-500'    }
                  : fraudScore >= 35  ? { label: 'Modéré', cls: 'text-amber-700 bg-amber-50 ring-1 ring-amber-200',  dot: 'bg-amber-400'  }
                  :                    { label: 'Faible',  cls: 'text-gray-600 bg-gray-50 ring-1 ring-gray-200',     dot: 'bg-green-500'  }

                const decisionInfo = displayDecision ? resolutionConfig[displayDecision] : null
                const confidence   = claim.aiScore != null ? Math.round(claim.aiScore * 100) : null
                const status       = statusConfig[claim.status] ?? {
                  label: claim.status,
                  cls:   'bg-gray-50 text-gray-600 ring-1 ring-gray-200',
                }

                // Nom du vendeur (admin uniquement, via la clé API)
                const claimApiKeyId = (claim as Record<string, unknown>).apiKeyId as string | null | undefined
                const vendorKey = isAdmin
                  ? adminApiKeys.find(k => claimApiKeyId ? k.id === claimApiKeyId : k.vendor.id === claim.vendorId)
                  : null

                return (
                  <tr key={claim.id} className="hover:bg-gray-50/50 transition-colors">

                    {/* Colonne vendeur — admin seulement */}
                    {isAdmin && (
                      <td className="px-4 py-3">
                        {vendorKey ? (
                          <div>
                            <p className="text-xs font-semibold text-gray-700">
                              {vendorKey.vendor.companyName}
                            </p>
                            <p className="text-xs text-gray-400 font-mono">{vendorKey.name}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    )}

                    {/* Client / Commande */}
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{claim.customerName}</p>
                      <p className="text-xs text-gray-500">{claim.customerEmail}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{claim.orderId}</p>
                      {source === 'HOSTED_PAGE' && (
                        <span className="text-xs text-indigo-500 mt-0.5 block">Page de retour</span>
                      )}
                    </td>

                    {/* Produit */}
                    <td className="px-4 py-3">
                      <p className="text-gray-800 max-w-35 truncate" title={productName ?? undefined}>
                        {productName ?? '—'}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{CLAIM_TYPE_LABELS[claim.type]}</p>
                      {productPrice != null && (
                        <p className="text-xs text-gray-400">
                          {productPrice.toFixed(2)} DA
                          {productQty && productQty > 1 ? ` × ${productQty}` : ''}
                        </p>
                      )}
                      {orderTotal != null && (
                        <p className="text-xs font-semibold text-gray-700">
                          Total : {orderTotal.toFixed(2)} DA
                        </p>
                      )}
                    </td>

                    {/* Décision recommandée */}
                    <td className="px-4 py-3 min-w-47.5">
                      {decisionInfo ? (
                        <div className="space-y-1.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${decisionInfo.cls}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${decisionInfo.dot}`} />
                            {decisionInfo.label}
                          </span>
                          <div className="flex items-center gap-1 text-xs text-gray-400">
                            {isOverridden
                              ? <><Sparkles className="w-3 h-3" /> Modifiée manuellement</>
                              : <><Brain className="w-3 h-3" /> Automatique</>}
                          </div>
                          {confidence !== null && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-16 bg-gray-200 rounded-full h-1">
                                <div className="h-1 rounded-full bg-indigo-500" style={{ width: `${confidence}%` }} />
                              </div>
                              <span className="text-xs text-gray-400">Conf. {confidence}%</span>
                            </div>
                          )}
                          {isOverridden && typeof overrideData?.note === 'string' && (
                            <p className="text-xs text-gray-400 italic truncate max-w-40" title={overrideData.note}>
                              {overrideData.note}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Non analysée</span>
                      )}
                    </td>

                    {/* Risque */}
                    <td className="px-4 py-3">
                      {riskLevel ? (
                        <div className="space-y-1">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${riskLevel.cls}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${riskLevel.dot}`} />
                            {riskLevel.label}
                            {fraudScore !== null && (
                              <span className="opacity-50 font-normal">{Math.round(fraudScore)}</span>
                            )}
                          </span>
                          {fraudScore !== null && fraudScore >= 60 && (
                            <p className="text-xs text-red-500">Validation requise</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>

                    {/* Statut */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${status.cls}`}>
                        {status.label}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3">
                      <p className="text-xs text-gray-500">{formatDate(claim.createdAt)}</p>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <ClaimActions
                        claimId={claim.id}
                        currentStatus={claim.status}
                        aiDecision={claim.aiDecision}
                        aiScore={claim.aiScore}
                      />
                    </td>

                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}