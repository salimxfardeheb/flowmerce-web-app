'use client'
// app/vendor-portal/PortalClient.tsx — Flowmerce
//
// Composant client : affiche la table des réclamations du vendeur
// et permet de gérer les statuts via le token de portail.

import { useState, useTransition } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PortalClaim {
  id:            string
  orderId:       string
  customerName:  string
  customerEmail: string
  productName:   string | null
  type:          string
  status:        string
  aiDecision:    string | null
  aiScore:       number | null
  fraudScore:    number | null
  createdAt:     string
  description:   string | null
}

interface Props {
  initialClaims: PortalClaim[]
  token:         string
  vendorName:    string
  vendorId:      string
  currentFilter: string
}

// ── Configs visuelles ─────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; pill: string }> = {
  PENDING:     { label: 'En attente',  pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'  },
  APPROVED:    { label: 'Approuvée',   pill: 'bg-green-50 text-green-700 ring-1 ring-green-200'  },
  REJECTED:    { label: 'Rejetée',     pill: 'bg-red-50 text-red-700 ring-1 ring-red-200'        },
  IN_PROGRESS: { label: 'En cours',    pill: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'     },
}

const AI_CFG: Record<string, { label: string; cls: string }> = {
  Refund:   { label: 'Remboursement', cls: 'text-green-700'  },
  Exchange: { label: 'Échange',        cls: 'text-blue-700'   },
  Repair:   { label: 'Réparation',     cls: 'text-amber-700'  },
  Reject:   { label: 'Refus',          cls: 'text-red-700'    },
}

const TYPE_LABELS: Record<string, string> = {
  REFUND:   'Remboursement',
  EXCHANGE: 'Échange',
  REPAIR:   'Réparation',
}

const FILTER_TABS = [
  { value: '',            label: 'Toutes'      },
  { value: 'PENDING',     label: 'En attente'  },
  { value: 'IN_PROGRESS', label: 'En cours'    },
  { value: 'APPROVED',    label: 'Approuvées'  },
  { value: 'REJECTED',    label: 'Rejetées'    },
]

// ── Composant principal ───────────────────────────────────────────────────────

export default function PortalClient({
  initialClaims,
  token,
  vendorName,
  vendorId,
  currentFilter,
}: Props) {
  const [claims, setClaims]       = useState<PortalClaim[]>(initialClaims)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Counts for KPIs
  const counts = {
    total:   claims.length,
    pending: claims.filter(c => c.status === 'PENDING').length,
    inProg:  claims.filter(c => c.status === 'IN_PROGRESS').length,
    done:    claims.filter(c => c.status === 'APPROVED' || c.status === 'REJECTED').length,
  }

  // ── Action : changer le statut d'une réclamation ──────────────────────────
  async function updateStatus(claimId: string, status: string, note?: string) {
    setLoadingId(claimId)
    setError(null)
    try {
      const res = await fetch(`/api/vendor-portal/claims/${claimId}`, {
        method:  'PATCH',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status, ...(note ? { note } : {}) }),
      })

      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: 'Erreur inconnue' }))
        setError(msg ?? 'Erreur lors de la mise à jour')
        return
      }

      // Mise à jour optimiste de la liste locale
      setClaims(prev =>
        prev.map(c => c.id === claimId ? { ...c, status } : c)
      )
    } catch {
      setError('Erreur réseau. Veuillez réessayer.')
    } finally {
      setLoadingId(null)
    }
  }

  // ── Filtrage côté client (navigation via URL mais state local) ────────────
  const filtered = currentFilter
    ? claims.filter(c => c.status === currentFilter)
    : claims

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wide mb-0.5">
              Portail retours
            </p>
            <h1 className="text-lg font-bold text-gray-900">{vendorName}</h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Accès sécurisé via Flowmerce</p>
            <p className="text-xs text-gray-300 mt-0.5 font-mono">
              {vendorId.slice(0, 8)}…
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total',      value: counts.total,   cls: 'text-gray-900'   },
            { label: 'En attente', value: counts.pending,  cls: 'text-amber-600'  },
            { label: 'En cours',   value: counts.inProg,   cls: 'text-blue-600'   },
            { label: 'Traitées',   value: counts.done,     cls: 'text-green-600'  },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 px-4 py-3.5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
              <p className={`text-2xl font-bold mt-1 ${cls}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* ── Erreur ── */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            ⚠️ {error}
          </div>
        )}

        {/* ── Onglets de filtre ── */}
        <div className="flex items-center gap-1 mb-5 flex-wrap">
          {FILTER_TABS.map(tab => {
            const count = tab.value
              ? claims.filter(c => c.status === tab.value).length
              : claims.length
            const isActive = currentFilter === tab.value
            // URL relative sans window (compatible SSR)
            const href = tab.value
              ? `/vendor-portal?t=${encodeURIComponent(token)}&filter=${tab.value}`
              : `/vendor-portal?t=${encodeURIComponent(token)}`

            return (
              <a
                key={tab.value}
                href={href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {count}
                </span>
              </a>
            )
          })}
        </div>

        {/* ── Table ── */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
            <p className="text-3xl mb-3">↩</p>
            <p className="text-sm font-medium text-gray-700">Aucune réclamation</p>
            <p className="text-xs text-gray-400 mt-1">
              {currentFilter ? 'Aucune réclamation avec ce statut.' : 'Les demandes de vos clients apparaîtront ici.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60">
                  {['Client / Commande', 'Produit', 'Décision IA', 'Risque', 'Statut', 'Date', 'Actions'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(claim => {
                  const statusCfg = STATUS_CFG[claim.status] ?? STATUS_CFG.PENDING
                  const aiCfg     = claim.aiDecision ? AI_CFG[claim.aiDecision] : null
                  const isLoading = loadingId === claim.id

                  const fraud = claim.fraudScore
                  const riskCfg = fraud === null ? null
                    : fraud >= 60 ? { label: 'Élevé',  cls: 'text-red-700 bg-red-50 ring-1 ring-red-200'     }
                    : fraud >= 35 ? { label: 'Modéré', cls: 'text-amber-700 bg-amber-50 ring-1 ring-amber-200' }
                    :               { label: 'Faible',  cls: 'text-gray-600 bg-gray-50 ring-1 ring-gray-200'   }

                  const canAct = !isLoading && claim.status !== 'APPROVED' && claim.status !== 'REJECTED'

                  return (
                    <tr key={claim.id} className="hover:bg-gray-50/50 transition-colors">

                      {/* Client */}
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{claim.customerName}</p>
                        <p className="text-xs text-gray-400">{claim.customerEmail}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">
                          #{claim.orderId.slice(-8).toUpperCase()}
                        </p>
                      </td>

                      {/* Produit */}
                      <td className="px-4 py-3">
                        <p className="text-gray-800 max-w-32 truncate" title={claim.productName ?? undefined}>
                          {claim.productName ?? '—'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {TYPE_LABELS[claim.type] ?? claim.type}
                        </p>
                      </td>

                      {/* Décision IA */}
                      <td className="px-4 py-3">
                        {aiCfg ? (
                          <div>
                            <span className={`font-semibold text-xs ${aiCfg.cls}`}>{aiCfg.label}</span>
                            {claim.aiScore != null && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                Confiance {Math.round(claim.aiScore * 100)}%
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300 italic">Non analysée</span>
                        )}
                      </td>

                      {/* Risque fraude */}
                      <td className="px-4 py-3">
                        {riskCfg ? (
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${riskCfg.cls}`}>
                            {riskCfg.label}
                            <span className="opacity-50 font-normal">{Math.round(fraud!)}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>

                      {/* Statut */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${statusCfg.pill}`}>
                          {isLoading ? '⏳' : statusCfg.label}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-500 whitespace-nowrap">
                          {new Date(claim.createdAt).toLocaleDateString('fr-FR', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}
                        </p>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        {canAct ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              onClick={() => updateStatus(claim.id, 'APPROVED')}
                              disabled={isLoading}
                              className="px-2.5 py-1 text-xs font-semibold rounded-md bg-green-600 hover:bg-green-700 text-white transition disabled:opacity-50"
                            >
                              Approuver
                            </button>
                            {claim.status !== 'IN_PROGRESS' && (
                              <button
                                onClick={() => updateStatus(claim.id, 'IN_PROGRESS')}
                                disabled={isLoading}
                                className="px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-100 hover:bg-blue-200 text-blue-700 transition disabled:opacity-50"
                              >
                                En cours
                              </button>
                            )}
                            <button
                              onClick={() => updateStatus(claim.id, 'REJECTED')}
                              disabled={isLoading}
                              className="px-2.5 py-1 text-xs font-semibold rounded-md bg-red-100 hover:bg-red-200 text-red-700 transition disabled:opacity-50"
                            >
                              Rejeter
                            </button>
                          </div>
                        ) : claim.status === 'APPROVED' || claim.status === 'REJECTED' ? (
                          <span className="text-xs text-gray-300 italic">Traitée</span>
                        ) : null}
                      </td>

                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-center text-gray-300 mt-8">
          Portail sécurisé • Flowmerce — accès limité à vos réclamations uniquement
        </p>

      </div>
    </div>
  )
}