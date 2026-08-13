// app/dashboard/claims/page.tsx — Flowmerce
//
// Réclamations — accessible aux VENDEURS et à l'ADMIN.
//   • Vendeur : voit uniquement ses propres réclamations (comportement inchangé)
//   • Admin   : voit TOUTES les réclamations, avec filtre par clé API (nom)

import { getSessionServer }                       from '@/lib/getSession'
import { prisma }                                 from '@/lib/prisma'
import { redirect }                               from 'next/navigation'
import { CLAIM_STATUS_LABELS, formatClaimType, formatDate } from '@/lib/utils'
import { ClaimActions }                           from '@/components/claims/ClaimActions'
import { AutoApproveToggle }                      from '@/components/claims/AutoApproveToggle' 
import { checkVendorAccess }                      from '@/lib/vendorGuard'
import { BTN_GHOST, BTN_PRIMARY, FOCUS, Pagination, riskBand, StatusBadge } from '@/components/dashboard/ui'
import { AlertTriangle, ChevronRight, Cpu, Inbox, Edit2, KeyRound, Clock, TrendingUp, ShieldAlert } from 'lucide-react'

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      scope="col"
      className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}

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
    page?:     string
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
  // Les réclamations hors politique sont refusées d'office : le vendeur n'a
  // rien à trancher, elles n'encombrent pas son tableau. L'admin les voit.
  const where: Record<string, unknown> = {}
  if (vendorId) {
    where.vendorId       = vendorId
    where.policyRejected = false
  }
  if (params.status)          where.status     = params.status
  if (params.type)            where.type       = params.type
  if (params.source)          where.source     = params.source
  if (params.risk === 'high') where.fraudScore = { gte: 60 }
  if (params.ml === 'true')   where.aiDecision = { not: null }
  // Filtre par clé API exacte (si l'utilisateur a sélectionné une clé)
  if (params.apiKeyId)        where.apiKeyId   = params.apiKeyId

  // Même exclusion pour les KPI : un refus hors politique ne doit pas gonfler
  // les compteurs du vendeur.
  const scopeWhere = vendorId ? { vendorId, policyRejected: false } : {}

  // ── Pagination ────────────────────────────────────────────────────────────────
  // La page chargeait l'intégralité des réclamations correspondant au filtre :
  // sans borne, le rendu grossit indéfiniment avec le volume du marchand.
  const PAGE_SIZE = 10
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)

  const filteredCount = await prisma.claim.count({ where })
  const totalPages    = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE))
  // Une page hors bornes (filtre resserré, lien périmé) retombe sur la dernière.
  const page          = Math.min(requestedPage, totalPages)

  const [claims, allScopedClaims] = await Promise.all([
    prisma.claim.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.claim.findMany({ where: scopeWhere, select: { id: true, status: true, type: true, aiDecision: true, fraudScore: true, apiKeyId: true } }),
  ])

  // Lire le validationMode du vendeur (pour le toggle auto-approve)
  const returnPolicy = vendorId
    ? await prisma.returnPolicy.findUnique({ where: { vendorId }, select: { validationMode: true } })
    : null
  const validationMode = (returnPolicy?.validationMode ?? 'MANUAL') as 'MANUAL' | 'AI_AUTO'

  const total    = allScopedClaims.length
  const pending  = allScopedClaims.filter(c => c.status === 'PENDING').length
  const pendingRefunds = allScopedClaims.filter(
    c => c.status === 'PENDING' && c.type === 'REFUND'
  ).length
  const withML   = allScopedClaims.filter(c => c.aiDecision !== null).length
  const highRisk = allScopedClaims.filter(c => (c.fraudScore ?? 0) >= 60).length

  // ── Configs UI ─────────────────────────────────────────────────────────────────
  const statusConfig: Record<string, { label: string; cls: string }> = {
    PENDING:     { label: 'En attente', cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'   },
    APPROVED:    { label: 'Approuvée',  cls: 'bg-green-50 text-green-700 ring-1 ring-green-200'   },
    REJECTED:    { label: 'Refusée',    cls: 'bg-red-50 text-red-700 ring-1 ring-red-200'         },
    IN_PROGRESS: { label: 'En cours',   cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'      },
  }

  // Reco ML : 3 classes. 'Refund' n'apparaît que si le vendeur a tranché pour
  // un remboursement — le modèle ne le recommande jamais.
  const resolutionConfig: Record<string, { label: string; cls: string; dot: string }> = {
    Exchange: { label: 'Échange',       cls: 'text-blue-700 bg-blue-50 ring-1 ring-blue-200',           dot: 'bg-blue-500'    },
    Repair:   { label: 'Réparation',    cls: 'text-amber-700 bg-amber-50 ring-1 ring-amber-200',        dot: 'bg-amber-400'   },
    Refund:   { label: 'Remboursement', cls: 'text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200',  dot: 'bg-emerald-500' },
    Reject:   { label: 'Refus',         cls: 'text-red-700 bg-red-50 ring-1 ring-red-200',              dot: 'bg-red-500'     },
  }

  const activeFilter = params.status || params.risk || params.ml

  // Helper : construit une URL en préservant tous les params existants
  function buildUrl(overrides: Record<string, string | undefined>): string {
    const base: Record<string, string> = {}
    if (params.status)   base.status   = params.status
    if (params.type)     base.type     = params.type
    if (params.source)   base.source   = params.source
    if (params.risk)     base.risk     = params.risk
    if (params.ml)       base.ml       = params.ml
    if (params.apiKeyId) base.apiKeyId = params.apiKeyId
    // Changer de filtre renvoie au début : rester page 7 sur un résultat qui
    // n'en compte plus que 2 donnerait une liste vide.
    const merged = { ...base, ...overrides }
    if (!('page' in overrides)) delete merged.page
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
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-full">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6 sm:mb-8">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-[-0.015em] text-ink">Réclamations</h1>
          <p className="mt-1.5 text-[13px] text-body">
            {scopeLabel
              ? <span>Filtré sur : <span className="font-semibold text-ink">{scopeLabel}</span></span>
              : 'Suivez et traitez les demandes clients, avec décisions automatiques et détection de fraude.'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {pending > 0 && (
            <a
              href={buildUrl({ status: 'PENDING' })}
              className={BTN_PRIMARY}
            >
              {pending} en attente
              <ChevronRight className="w-4 h-4" />
            </a>
          )}
          {pendingRefunds > 0 && (
            <a
              href={buildUrl({ status: 'PENDING', type: 'REFUND' })}
              className={BTN_GHOST}
            >
              {pendingRefunds} remboursement{pendingRefunds > 1 ? 's' : ''} en attente
              <ChevronRight className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>

      {/* ── Filtre par clé API (admin + vendeur multi-clés) ── */}
      {adminApiKeys.length > 0 && (
        <div className="bg-surface rounded-card border border-line px-4 py-3.5 mb-5 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-medium text-ink shrink-0">
            <KeyRound className="w-4 h-4 text-brand-ink" />
            {isAdmin ? 'Filtrer par clé API' : 'Source'}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Toutes */}
            <a
              href={buildUrl({ apiKeyId: undefined })}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors border ${
                !params.apiKeyId
                  ? 'bg-brand text-on-brand border-brand'
                  : 'border-line text-body hover:bg-page'
              } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
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
                      ? 'bg-brand text-on-brand border-brand'
                      : 'border-line text-body hover:bg-page'
                  } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 sm:mb-8">
        <div className="rounded-card border border-line bg-surface p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-brand-ink" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">Total</p>
          </div>
          <p className="text-[22px] font-bold leading-none tabular-nums text-ink">{total}</p>
        </div>
        <div className="rounded-card border border-line bg-surface p-5">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">En attente</p>
          </div>
          <p className="text-[22px] font-bold leading-none tabular-nums text-ink">{pending}</p>
          {pending > 0 && <p className="text-xs text-amber-500 mt-1 font-medium">Action requise</p>}
        </div>
        <div className="rounded-card border border-line bg-surface p-5">
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-4 h-4 text-purple-400" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">Décisions auto.</p>
          </div>
          <p className="text-[22px] font-bold leading-none tabular-nums text-ink">{withML}</p>
          {total > 0 && <p className="text-xs text-faint mt-1">{Math.round((withML / total) * 100)}% du total</p>}
        </div>
        <div className="rounded-card border border-line bg-surface p-5">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="w-4 h-4 text-red-400" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">Risque élevé</p>
          </div>
          <p className="text-[22px] font-bold leading-none tabular-nums text-ink">{highRisk}</p>
          {highRisk > 0 && <p className="text-xs text-red-500 mt-1 font-medium">Vérification requise</p>}
        </div>
      </div>

      {/* ── Filtres statut / risque / ML + Toggle auto-approve ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-5 sm:mb-6">
        <div className="flex items-center gap-1.5 flex-wrap">
          <a
            href={buildUrl({ status: undefined, risk: undefined, ml: undefined })}
            className={`px-3 py-1.5 rounded-control text-sm font-medium transition-colors ${
              !activeFilter ? 'bg-brand text-on-brand' : 'text-body hover:bg-page'
            } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
          >
            Toutes
          </a>

          {(['PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS'] as const).map(s => (
            <a
              key={s}
              href={buildUrl({ status: s, risk: undefined, ml: undefined })}
              className={`px-3 py-1.5 rounded-control text-sm font-medium transition-colors ${
                params.status === s ? 'bg-brand text-on-brand' : 'text-body hover:bg-page'
              } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
            >
              {CLAIM_STATUS_LABELS[s]}
            </a>
          ))}

          <div className="w-px h-5 bg-line mx-0.5" />

          <a
            href={buildUrl({ risk: params.risk === 'high' ? undefined : 'high', status: undefined, ml: undefined })}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control text-sm font-medium transition-colors ${
              params.risk === 'high'
                ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                : 'text-body hover:bg-page'
            } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Risque élevé
          </a>

          <a
            href={buildUrl({ ml: params.ml === 'true' ? undefined : 'true', status: undefined, risk: undefined })}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control text-sm font-medium transition-colors ${
              params.ml === 'true'
                ? 'bg-purple-50 text-purple-700 ring-1 ring-purple-200'
                : 'text-body hover:bg-page'
            } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
          >
            <Cpu className="w-3.5 h-3.5" />
            Décisions auto.
          </a>
        </div>

        {/* Toggle auto-approve — visible uniquement pour les vendeurs (pas admin global) */}
        {!isAdmin || vendorId ? (
          <AutoApproveToggle
            initialMode={validationMode}
            pendingCount={pending}
          />
        ) : null}
      </div>

      {/* ── Table ── */}
      {claims.length === 0 ? (
        <div className="bg-surface rounded-card border border-line py-20 flex flex-col items-center gap-2">
          <Inbox className="w-10 h-10 text-faint" />
          <p className="text-sm font-semibold text-ink mt-1">Aucune réclamation</p>
          <p className="text-xs text-faint">
            Les demandes clients apparaîtront ici une fois reçues.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          {/* Seul le tableau défile horizontalement : la pagination doit rester
              lisible sans avoir à revenir en arrière. */}
          <div className="overflow-x-auto">
          <table className="w-full text-left">
            <caption className="sr-only">
              Réclamations reçues, {filteredCount} au total, page {page}
            </caption>
            <thead>
              <tr className="border-b border-line bg-page">
                {isAdmin && <Th>Vendeur</Th>}
                <Th>Client et commande</Th>
                <Th>Produit</Th>
                <Th>Recommandation</Th>
                <Th>Risque</Th>
                <Th>Statut</Th>
                <Th align="right">Date</Th>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
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

                const productPrice = typeof prediction?.productPrice    === 'number' ? prediction.productPrice    : null
                const productQty   = typeof prediction?.productQuantity === 'number' ? prediction.productQuantity : null
                const orderTotal   = typeof prediction?.orderTotal      === 'number' ? prediction.orderTotal      : null
                const refundEligible = prediction?.refundEligible === true

                const band         = riskBand(fraudScore)
                const decisionInfo = displayDecision ? resolutionConfig[displayDecision] : null
                const confidence   = claim.aiScore != null ? Math.round(claim.aiScore * 100) : null

                const claimApiKeyId = (claim as Record<string, unknown>).apiKeyId as string | null | undefined
                const vendorKey = isAdmin
                  ? adminApiKeys.find(k => claimApiKeyId ? k.id === claimApiKeyId : k.vendor.id === claim.vendorId)
                  : null

                return (
                  <tr key={claim.id} className="group relative cursor-pointer align-top transition-colors hover:bg-page">

                    {isAdmin && (
                      <td className="px-4 py-4">
                        {vendorKey ? (
                          <>
                            <p className="text-[13px] font-semibold text-ink">{vendorKey.vendor.companyName}</p>
                            <p className="mt-0.5 font-mono text-[11px] text-faint">{vendorKey.name}</p>
                          </>
                        ) : (
                          <span className="text-[12px] text-faint">—</span>
                        )}
                      </td>
                    )}

                    {/* Client et commande — la ligne entière mène au détail. */}
                    {/* Lien étiré : le pseudo-élément couvre toute la ligne, qui
                        est en `relative`. Le clic mène au détail où qu'il tombe,
                        tout en restant un vrai lien — clavier, clic milieu et
                        « ouvrir dans un nouvel onglet » fonctionnent. */}
                    <td className="px-4 py-4">
                      <a
                        href={`/dashboard/claims/${claim.id}`}
                        className={`rounded-control text-[13px] font-semibold text-ink group-hover:text-brand-ink group-hover:underline ${FOCUS} before:absolute before:inset-0 before:content-['']`}
                      >
                        {claim.customerName}
                      </a>
                      <p className="mt-0.5 truncate text-[12px] text-body">{claim.customerEmail}</p>
                      <p className="mt-1 font-mono text-[11px] text-faint">{claim.orderId}</p>
                      {source === 'HOSTED_PAGE' && (
                        <span className="mt-1 inline-flex rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand-ink">
                          Portail
                        </span>
                      )}
                    </td>

                    {/* Produit */}
                    <td className="px-4 py-4">
                      <p className="max-w-44 truncate text-[13px] text-ink" title={productName ?? undefined}>
                        {productName ?? '—'}
                      </p>
                      <p className="mt-0.5 text-[12px] text-body">{formatClaimType(claim.type)}</p>
                      {productPrice != null ? (
                        <p className="mt-0.5 text-[11px] tabular-nums text-faint">
                          {productPrice.toFixed(2)} DA{productQty && productQty > 1 ? ` × ${productQty}` : ''}
                        </p>
                      ) : orderTotal != null ? (
                        <p className="mt-0.5 text-[11px] tabular-nums text-faint">{orderTotal.toFixed(2)} DA</p>
                      ) : null}
                    </td>

                    {/* Recommandation */}
                    <td className="px-4 py-4">
                      {decisionInfo ? (
                        <>
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${decisionInfo.cls}`}>
                            {decisionInfo.label}
                          </span>
                          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-faint">
                            {isOverridden
                              ? <><Edit2 className="size-3 shrink-0" aria-hidden /> Modifiée</>
                              : <><Cpu className="size-3 shrink-0" aria-hidden /> Automatique</>}
                            {confidence !== null && (
                              <span className="tabular-nums"> · {confidence} %</span>
                            )}
                          </p>
                          {refundEligible && (
                            <p className="mt-1 text-[11px] font-medium text-emerald-700">
                              Remboursement possible
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="text-[12px] text-faint">Non analysée</span>
                      )}
                    </td>

                    {/* Risque */}
                    <td className="px-4 py-4">
                      {band ? (
                        <>
                          <span className={`text-[12px] font-semibold tabular-nums ${band.text}`}>
                            {Math.round(fraudScore!)} · {band.label}
                          </span>
                          {fraudScore !== null && fraudScore > 70 && (
                            <p className="mt-0.5 text-[11px] text-risk-high">Contrôle conseillé</p>
                          )}
                        </>
                      ) : (
                        <span className="text-[12px] text-faint">—</span>
                      )}
                    </td>

                    {/* Statut */}
                    <td className="px-4 py-4">
                      <StatusBadge
                        status={claim.status}
                        label={statusConfig[claim.status]?.label ?? claim.status}
                      />
                    </td>

                    {/* Date */}
                    <td className="px-4 py-4 text-right text-[12px] tabular-nums text-body whitespace-nowrap">
                      {formatDate(claim.createdAt)}
                    </td>

                    {/* `relative z-10` : sans ça, le lien de ligne passerait
                        par-dessus et avalerait les clics sur ces boutons. */}
                    <td className="relative z-10 px-4 py-4">
                      <div className="flex flex-col items-end gap-2">
                        <ClaimActions
                          claimId={claim.id}
                          currentStatus={claim.status}
                          aiDecision={displayDecision}
                          aiScore={claim.aiScore}
                          claimType={claim.type}
                        />
                      </div>
                    </td>

                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={filteredCount}
            label="réclamations"
            hrefFor={(p) => buildUrl({ page: p > 1 ? String(p) : undefined })}
          />
        </div>
      )}
    </div>
  )
}