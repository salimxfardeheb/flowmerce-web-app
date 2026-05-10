'use client'
// app/vendor-portal/PortalClient.tsx — Flowmerce
// Même UX que le dashboard : "Approuver" ouvre une modale de confirmation
// avec sélecteur de décision ML (modifiable) avant envoi de la notification.

import { useState, useTransition } from 'react'
import { X, CheckCircle, Brain }   from 'lucide-react'
import { AutoApproveToggle }       from '@/components/claims/AutoApproveToggle'

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

type Resolution = 'Refund' | 'Exchange' | 'Repair' | 'Reject'

interface Props {
  initialClaims:         PortalClaim[]
  token:                 string
  vendorName:            string
  vendorId:              string
  currentFilter:         string
  initialValidationMode: 'MANUAL' | 'AI_AUTO'
}

// ── Configs ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; pill: string }> = {
  PENDING:     { label: 'En attente',  pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'  },
  APPROVED:    { label: 'Approuvée',   pill: 'bg-green-50 text-green-700 ring-1 ring-green-200'  },
  REJECTED:    { label: 'Rejetée',     pill: 'bg-red-50 text-red-700 ring-1 ring-red-200'        },
  IN_PROGRESS: { label: 'En cours',    pill: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'     },
}

const AI_CFG: Record<string, { label: string; cls: string }> = {
  Refund:   { label: 'Remboursement', cls: 'text-green-700' },
  Exchange: { label: 'Échange',        cls: 'text-blue-700'  },
  Repair:   { label: 'Réparation',     cls: 'text-amber-700' },
  Reject:   { label: 'Refus',          cls: 'text-red-700'   },
}

const TYPE_LABELS: Record<string, string> = {
  REFUND: 'Remboursement', EXCHANGE: 'Échange', REPAIR: 'Réparation',
}

// ── SVG icons pour les décisions ─────────────────────────────────────────────

const RESOLUTION_ICONS: Record<Resolution, React.ReactNode> = {
  Refund: (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M8 4.5v1M8 10.5v1M6 6.5a2 2 0 0 1 4 0c0 1.2-.8 1.8-2 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  Exchange: (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 5h9M8 2.5 11 5l-3 2.5M14 11H5M8 8.5 5 11l3 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Repair: (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
      <path d="M10.5 2.5a3 3 0 0 1 0 4.2L5.2 12a1.5 1.5 0 1 1-2.1-2.1l5.2-5.3a3 3 0 0 1 2.2-2.1Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="m12 4-1 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  Reject: (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M5.5 5.5 10.5 10.5M10.5 5.5 5.5 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
}

const RESOLUTION_OPTIONS: {
  value: Resolution; label: string; dot: string; cls: string
}[] = [
  { value: 'Refund',   label: 'Remboursement', dot: 'bg-green-500', cls: 'border-green-300 bg-green-50 text-green-800'  },
  { value: 'Exchange', label: 'Échange',        dot: 'bg-blue-500',  cls: 'border-blue-300 bg-blue-50 text-blue-800'    },
  { value: 'Repair',   label: 'Réparation',     dot: 'bg-amber-400', cls: 'border-amber-300 bg-amber-50 text-amber-800' },
  { value: 'Reject',   label: 'Refus',          dot: 'bg-red-500',   cls: 'border-red-300 bg-red-50 text-red-800'       },
]

const FILTER_TABS = [
  { value: '',            label: 'Toutes'     },
  { value: 'PENDING',     label: 'En attente' },
  { value: 'IN_PROGRESS', label: 'En cours'   },
  { value: 'APPROVED',    label: 'Approuvées' },
  { value: 'REJECTED',    label: 'Rejetées'   },
]

// ── Composant principal ───────────────────────────────────────────────────────

export default function PortalClient({
  initialClaims, token, vendorName, vendorId, currentFilter, initialValidationMode,
}: Props) {
  const [claims, setClaims]         = useState<PortalClaim[]>(initialClaims)
  const [loadingId, setLoadingId]   = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [, startTransition]         = useTransition()
  const [validationMode, setValidationMode] = useState<'MANUAL' | 'AI_AUTO'>(initialValidationMode)

  // Modale d'approbation individuelle
  const [approveTarget, setApproveTarget] = useState<PortalClaim | null>(null)
  const [resolution, setResolution]       = useState<Resolution | ''>('')
  const [note, setNote]                   = useState('')

  const counts = {
    total:   claims.length,
    pending: claims.filter(c => c.status === 'PENDING').length,
    inProg:  claims.filter(c => c.status === 'IN_PROGRESS').length,
    done:    claims.filter(c => c.status === 'APPROVED' || c.status === 'REJECTED').length,
  }

  // ── Action rapide (sans décision) ──────────────────────────────────────────
  async function quickUpdate(claimId: string, status: string) {
    setLoadingId(claimId)
    setError(null)
    try {
      const res = await fetch(`/api/vendor-portal/claims/${claimId}`, {
        method:  'PATCH',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: 'Erreur inconnue' }))
        setError(msg ?? 'Erreur lors de la mise à jour')
        return
      }
      setClaims(prev => prev.map(c => c.id === claimId ? { ...c, status } : c))
    } catch {
      setError('Erreur réseau. Veuillez réessayer.')
    } finally {
      setLoadingId(null)
    }
  }

  // ── Approbation avec décision ──────────────────────────────────────────────
  function openApprove(claim: PortalClaim) {
    setApproveTarget(claim)
    setResolution((claim.aiDecision as Resolution) ?? '')
    setNote('')
    setError(null)
  }

  async function handleApprove() {
    if (!approveTarget || !resolution) return
    setLoadingId(approveTarget.id)
    setError(null)
    try {
      const res = await fetch(`/api/vendor-portal/claims/${approveTarget.id}`, {
        method:  'PATCH',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          status:     'APPROVED',
          aiDecision: resolution,
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      })
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: 'Erreur inconnue' }))
        setError(msg ?? 'Erreur lors de la mise à jour')
        return
      }
      setClaims(prev => prev.map(c =>
        c.id === approveTarget.id
          ? { ...c, status: 'APPROVED', aiDecision: resolution }
          : c
      ))
      setApproveTarget(null)
      setNote('')
    } catch {
      setError('Erreur réseau. Veuillez réessayer.')
    } finally {
      setLoadingId(null)
    }
  }

  const filtered = currentFilter
    ? claims.filter(c => c.status === currentFilter)
    : claims

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
          <div className="text-right flex flex-col items-end gap-1">
            <p className="text-xs text-gray-400">Accès sécurisé via Flowmerce</p>
            <p className="text-xs text-gray-300 font-mono">{vendorId.slice(0, 8)}…</p>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total',      value: counts.total,   cls: 'text-gray-900'  },
            { label: 'En attente', value: counts.pending,  cls: 'text-amber-600' },
            { label: 'En cours',   value: counts.inProg,   cls: 'text-blue-600'  },
            { label: 'Traitées',   value: counts.done,     cls: 'text-green-600' },
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

        {/* ── Onglets filtre + Toggle auto-approve ── */}
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-1 flex-wrap">
          {FILTER_TABS.map(tab => {
            const count = tab.value
              ? claims.filter(c => c.status === tab.value).length
              : claims.length
            const isActive = currentFilter === tab.value
            const href = tab.value
              ? `/vendor-portal?t=${encodeURIComponent(token)}&filter=${tab.value}`
              : `/vendor-portal?t=${encodeURIComponent(token)}`
            return (
              <a key={tab.value} href={href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                }`}>{count}</span>
              </a>
            )
          })}
          </div>

          {/* Toggle auto-approve */}
          <AutoApproveToggle
            initialMode={initialValidationMode}
            pendingCount={counts.pending}
            apiEndpoint="/api/vendor-portal/settings/validation-mode"
            authToken={token}
            onToggled={(newMode, approved) => {
              setValidationMode(newMode)
              if (newMode === 'AI_AUTO' && approved > 0) {
                setClaims(prev => prev.map(c =>
                  c.status === 'PENDING'
                    ? { ...c, status: 'APPROVED', aiDecision: c.aiDecision ?? 'Refund' }
                    : c
                ))
              }
            }}
          />
        </div>

        {/* ── Table ── */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
            <p className="text-3xl mb-3">↩</p>
            <p className="text-sm font-medium text-gray-700">Aucune réclamation</p>
            <p className="text-xs text-gray-400 mt-1">
              {currentFilter ? 'Aucune réclamation avec ce statut.' : 'Les demandes apparaîtront ici.'}
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
                  const fraud     = claim.fraudScore
                  const riskCfg   = fraud === null ? null
                    : fraud >= 60 ? { label: 'Élevé',  cls: 'text-red-700 bg-red-50 ring-1 ring-red-200'      }
                    : fraud >= 35 ? { label: 'Modéré', cls: 'text-amber-700 bg-amber-50 ring-1 ring-amber-200' }
                    :               { label: 'Faible',  cls: 'text-gray-600 bg-gray-50 ring-1 ring-gray-200'    }
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
                        <p className="text-xs text-gray-400 mt-0.5">{TYPE_LABELS[claim.type] ?? claim.type}</p>
                      </td>

                      {/* Décision IA */}
                      <td className="px-4 py-3">
                        {aiCfg ? (
                          <div>
                            <span className={`font-semibold text-xs ${aiCfg.cls}`}>{aiCfg.label}</span>
                            {claim.aiScore != null && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                {Math.round(claim.aiScore * 100)}% conf.
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300 italic">—</span>
                        )}
                      </td>

                      {/* Risque */}
                      <td className="px-4 py-3">
                        {riskCfg ? (
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${riskCfg.cls}`}>
                            {riskCfg.label}
                            <span className="opacity-50 font-normal">{Math.round(fraud!)}</span>
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
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
                          <div className="flex flex-col gap-1.5">
                            <div className="flex gap-1.5 flex-wrap">
                              {/* Approuver → masqué si auto-approve actif */}
                              {validationMode === 'MANUAL' && (
                                <button
                                  onClick={() => openApprove(claim)}
                                  disabled={isLoading}
                                  className="px-2.5 py-1 text-xs font-semibold rounded-md bg-green-600 hover:bg-green-700 text-white transition disabled:opacity-50 flex items-center gap-1"
                                >
                                  <CheckCircle className="w-3 h-3" />
                                  Approuver
                                </button>
                              )}
                              {claim.status !== 'IN_PROGRESS' && (
                                <button
                                  onClick={() => quickUpdate(claim.id, 'IN_PROGRESS')}
                                  disabled={isLoading}
                                  className="px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-100 hover:bg-blue-200 text-blue-700 transition disabled:opacity-50"
                                >
                                  En cours
                                </button>
                              )}
                              <button
                                onClick={() => quickUpdate(claim.id, 'REJECTED')}
                                disabled={isLoading}
                                className="px-2.5 py-1 text-xs font-semibold rounded-md bg-red-100 hover:bg-red-200 text-red-700 transition disabled:opacity-50"
                              >
                                Rejeter
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300 italic">Traitée</span>
                        )}
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

      {/* ══ Modale approbation ════════════════════════════════════════════════ */}
      {approveTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md border border-gray-200">

            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Approuver la réclamation</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Confirmez ou modifiez la décision avant envoi de la notification.
                </p>
              </div>
              <button onClick={() => setApproveTarget(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">

              {/* Décision ML actuelle */}
              {approveTarget.aiDecision && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-indigo-500 font-medium uppercase tracking-wide flex items-center gap-1">
                      <Brain className="w-3 h-3" /> Décision ML
                    </p>
                    <p className="text-sm font-semibold text-indigo-800 mt-0.5">{approveTarget.aiDecision}</p>
                  </div>
                  {approveTarget.aiScore != null && (
                    <span className="text-xs text-indigo-400 bg-indigo-100 px-2 py-0.5 rounded-full">
                      {Math.round(approveTarget.aiScore * 100)}% conf.
                    </span>
                  )}
                </div>
              )}

              {/* Sélecteur décision */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Décision à envoyer au client <span className="text-red-400 font-normal normal-case">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {RESOLUTION_OPTIONS.map(opt => (
                    <label key={opt.value}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                        resolution === opt.value
                          ? opt.cls + ' border-current'
                          : 'border-gray-200 hover:border-gray-300 bg-gray-50 text-gray-500'
                      }`}
                    >
                      <input
                        type="radio" name="portal-resolution" value={opt.value}
                        checked={resolution === opt.value}
                        onChange={() => setResolution(opt.value)}
                        className="sr-only"
                      />
                      <span className="shrink-0">{RESOLUTION_ICONS[opt.value]}</span>
                      <span className="text-xs font-medium">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Note <span className="font-normal normal-case text-gray-400">— optionnel</span>
                </label>
                <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Commentaire visible dans la notification client…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none transition"
                />
              </div>
            </div>

            <div className="flex gap-2 px-5 pb-5">
              <button onClick={() => setApproveTarget(null)}
                className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                Annuler
              </button>
              <button
                onClick={handleApprove}
                disabled={!resolution || loadingId === approveTarget.id}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {loadingId === approveTarget.id ? 'Envoi…' : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Approuver &amp; notifier
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}