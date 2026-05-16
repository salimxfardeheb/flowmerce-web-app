// app/dashboard/claims/[claimId]/page.tsx — Flowmerce
import { getSessionServer }   from '@/lib/getSession'
import { prisma }             from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import { checkVendorAccess }  from '@/lib/vendorGuard'
import { ClaimActions }       from '@/components/claims/ClaimActions'
import { CLAIM_TYPE_LABELS, CLAIM_STATUS_LABELS, formatDate } from '@/lib/utils'
import { ArrowLeft, Brain, Sparkles, AlertTriangle, User, Package, FileText, ShieldAlert } from 'lucide-react'

export default async function ClaimDetailPage({
  params,
}: {
  params: Promise<{ claimId: string }>
}) {
  await checkVendorAccess()
  const session = await getSessionServer()
  if (!session) redirect('/auth/login')

  const { claimId } = await params
  const user    = session.user
  const isAdmin = user?.role === 'ADMIN'

  let vendorId: string | undefined
  if (!isAdmin) {
    const vendor = await prisma.vendor.findUnique({ where: { userId: user.id } })
    if (!vendor) redirect('/auth/register')
    vendorId = vendor.id
  }

  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: { vendor: { select: { companyName: true } } },
  })

  if (!claim) notFound()
  if (!isAdmin && claim.vendorId !== vendorId) notFound()

  const prediction  = claim.prediction as Record<string, unknown> | null
  const overrideData = prediction?.override as Record<string, unknown> | undefined
  const isOverridden = !!overrideData
  const displayDecision = typeof overrideData?.resolution === 'string'
    ? overrideData.resolution
    : claim.aiDecision

  const productPrice = typeof prediction?.productPrice    === 'number' ? prediction.productPrice    : null
  const productQty   = typeof prediction?.productQuantity === 'number' ? prediction.productQuantity : null
  const orderTotal   = typeof prediction?.orderTotal      === 'number' ? prediction.orderTotal      : null
  const confidence   = claim.aiScore != null ? Math.round(claim.aiScore * 100) : null
  const fraudScore   = claim.fraudScore

  const statusConfig: Record<string, { label: string; cls: string }> = {
    PENDING:     { label: 'En attente', cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'  },
    APPROVED:    { label: 'Approuvée',  cls: 'bg-green-50 text-green-700 ring-1 ring-green-200'  },
    REJECTED:    { label: 'Refusée',    cls: 'bg-red-50 text-red-700 ring-1 ring-red-200'        },
    IN_PROGRESS: { label: 'En cours',   cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'     },
  }

  const resolutionConfig: Record<string, { label: string; cls: string; dot: string }> = {
    Refund:   { label: 'Remboursement', cls: 'text-green-700 bg-green-50 ring-1 ring-green-200',  dot: 'bg-green-500'  },
    Exchange: { label: 'Échange',       cls: 'text-blue-700 bg-blue-50 ring-1 ring-blue-200',     dot: 'bg-blue-500'   },
    Repair:   { label: 'Réparation',    cls: 'text-amber-700 bg-amber-50 ring-1 ring-amber-200',  dot: 'bg-amber-400'  },
    Reject:   { label: 'Refus',         cls: 'text-red-700 bg-red-50 ring-1 ring-red-200',        dot: 'bg-red-500'    },
  }

  const riskLevel = fraudScore === null || fraudScore === undefined ? null
    : fraudScore >= 60 ? { label: 'Élevé',  cls: 'text-red-700 bg-red-50 ring-1 ring-red-200',       dot: 'bg-red-500'   }
    : fraudScore >= 35 ? { label: 'Modéré', cls: 'text-amber-700 bg-amber-50 ring-1 ring-amber-200',  dot: 'bg-amber-400' }
    :                    { label: 'Faible',  cls: 'text-gray-600 bg-gray-50 ring-1 ring-gray-200',     dot: 'bg-green-500' }

  const status      = statusConfig[claim.status] ?? { label: claim.status, cls: 'bg-gray-50 text-gray-600 ring-1 ring-gray-200' }
  const decisionInfo = displayDecision ? resolutionConfig[displayDecision] : null

  return (
    <div className="px-8 py-6 max-w-4xl">

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <a
          href="/dashboard/claims"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mt-0.5"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour
        </a>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-gray-900">Réclamation #{claim.orderId}</h1>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${status.cls}`}>
              {status.label}
            </span>
            {isAdmin && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {claim.vendor.companyName}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Créée le {formatDate(claim.createdAt)}
            {claim.processedAt && ` · Traitée le ${formatDate(claim.processedAt)}`}
          </p>
        </div>

        {/* Actions */}
        <div className="shrink-0">
          <ClaimActions
            claimId={claim.id}
            currentStatus={claim.status}
            aiDecision={claim.aiDecision}
            aiScore={claim.aiScore}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ── Client ── */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Client</h2>
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-gray-400">Nom</p>
              <p className="text-sm font-medium text-gray-900">{claim.customerName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Email</p>
              <p className="text-sm text-gray-700">{claim.customerEmail}</p>
            </div>
            {claim.customerPhone && (
              <div>
                <p className="text-xs text-gray-400">Téléphone</p>
                <p className="text-sm text-gray-700">{claim.customerPhone}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-400">Commande</p>
              <p className="text-sm font-mono text-gray-700">{claim.orderId}</p>
            </div>
            {claim.orderDate && (
              <div>
                <p className="text-xs text-gray-400">Date de commande</p>
                <p className="text-sm text-gray-700">{formatDate(claim.orderDate)}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Produit ── */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Produit & Commande</h2>
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-gray-400">Produit</p>
              <p className="text-sm font-medium text-gray-900">{claim.productName ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Type de réclamation</p>
              <p className="text-sm text-gray-700">{CLAIM_TYPE_LABELS[claim.type]}</p>
            </div>
            {productPrice != null ? (
              <div>
                <p className="text-xs text-gray-400">Prix unitaire</p>
                <p className="text-sm font-semibold text-gray-900">
                  {productPrice.toFixed(2)} DA
                  {productQty && productQty > 1 ? ` × ${productQty} = ${(productPrice * productQty).toFixed(2)} DA` : ''}
                </p>
              </div>
            ) : orderTotal != null ? (
              <div>
                <p className="text-xs text-gray-400">Montant de la commande</p>
                <p className="text-sm font-semibold text-gray-900">{orderTotal.toFixed(2)} DA</p>
              </div>
            ) : null}
            <div>
              <p className="text-xs text-gray-400">Source</p>
              <p className="text-sm text-gray-700">
                {claim.source === 'HOSTED_PAGE' ? 'Page de retour' : 'API'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Description ── */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 md:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Description de la réclamation</h2>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {claim.description}
          </p>
        </div>

        {/* ── Décision IA ── */}
        {(claim.aiDecision || claim.aiScore != null) && (
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-semibold text-gray-700">Analyse IA</h2>
            </div>
            <div className="space-y-3">
              {decisionInfo && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">
                    {isOverridden ? 'Décision modifiée' : 'Décision recommandée'}
                  </p>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${decisionInfo.cls}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${decisionInfo.dot}`} />
                    {decisionInfo.label}
                  </span>
                  {isOverridden && (
                    <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                      <Sparkles className="w-3 h-3" />
                      Modifiée manuellement
                    </div>
                  )}
                </div>
              )}
              {confidence !== null && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Confiance</p>
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-gray-200 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${confidence}%` }} />
                    </div>
                    <span className="text-sm font-medium text-gray-700">{confidence}%</span>
                  </div>
                </div>
              )}
              {isOverridden && typeof overrideData?.note === 'string' && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Note de révision</p>
                  <p className="text-sm text-gray-700 italic">{overrideData.note}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Fraude ── */}
        {fraudScore != null && (
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <ShieldAlert className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-700">Analyse de fraude</h2>
            </div>
            <div className="space-y-3">
              {riskLevel && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Niveau de risque</p>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${riskLevel.cls}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${riskLevel.dot}`} />
                    {riskLevel.label}
                    <span className="opacity-60 font-normal">{Math.round(fraudScore)}/100</span>
                  </span>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-400 mb-1">Score de fraude</p>
                <div className="flex items-center gap-2">
                  <div className="w-32 bg-gray-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${fraudScore >= 60 ? 'bg-red-500' : fraudScore >= 35 ? 'bg-amber-400' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(fraudScore, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-700">{Math.round(fraudScore)}</span>
                </div>
              </div>
              {fraudScore >= 60 && (
                <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Validation manuelle recommandée
                </div>
              )}
              {claim.ipAddress && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Adresse IP</p>
                  <p className="text-xs font-mono text-gray-600">{claim.ipAddress}</p>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
