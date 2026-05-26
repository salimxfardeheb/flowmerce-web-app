'use client'
// components/claims/AutoApproveToggle.tsx — Flowmerce
//
// Toggle ON/OFF persistant pour l'auto-approbation des réclamations.
// Lit et écrit le champ validationMode (MANUAL | AI_AUTO) dans ReturnPolicy.
// Quand activé → approuve immédiatement les claims PENDING + active le mode auto.
// Quand désactivé → repasse en mode manuel.

import { useState } from 'react'
import { Zap }      from 'lucide-react'

interface Props {
  initialMode:    'MANUAL' | 'AI_AUTO'
  pendingCount:   number
  onToggled?:     (newMode: 'MANUAL' | 'AI_AUTO', approved: number) => void
}

export function AutoApproveToggle({
  initialMode, pendingCount, onToggled,
}: Props) {
  const [mode,    setMode]    = useState<'MANUAL' | 'AI_AUTO'>(initialMode)
  const [loading, setLoading] = useState(false)
  const [toast,   setToast]   = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const isOn = mode === 'AI_AUTO'

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function toggle() {
    if (loading) return
    const nextMode = isOn ? 'MANUAL' : 'AI_AUTO'
    setLoading(true)

    try {
      const res = await fetch('/api/claims/validation-mode', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ validationMode: nextMode }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        showToast(data.error ?? 'Erreur lors de la mise à jour', 'error')
        return
      }

      setMode(nextMode)
      onToggled?.(nextMode, data.approved ?? 0)

      if (nextMode === 'AI_AUTO') {
        const n = data.approved ?? 0
        showToast(
          n > 0
            ? `✅ Auto-approuver activé — ${n} réclamation${n > 1 ? 's' : ''} approuvée${n > 1 ? 's' : ''}`
            : '✅ Auto-approuver activé',
          'success'
        )
      } else {
        showToast('⏸ Auto-approuver désactivé — mode manuel', 'success')
      }
    } catch {
      showToast('Erreur réseau. Veuillez réessayer.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex items-center gap-2.5 shrink-0">

      {/* Label */}
      <div className="text-right">
        <p className="text-xs font-semibold text-gray-600 leading-tight">
          Auto-approuver
        </p>
        <p className={`text-[10px] font-medium leading-tight transition-colors ${
          isOn ? 'text-green-600' : 'text-gray-400'
        }`}>
          {isOn
            ? `Actif${pendingCount > 0 ? ` · ${pendingCount} en attente` : ''}`
            : 'Désactivé'}
        </p>
      </div>

      {/* Toggle switch style iOS */}
      <button
        onClick={toggle}
        disabled={loading}
        aria-pressed={isOn}
        aria-label={isOn ? 'Désactiver l\'auto-approbation' : 'Activer l\'auto-approbation'}
        className={`
          relative inline-flex h-7 w-13 items-center rounded-full
          transition-all duration-300 ease-in-out
          focus:outline-none focus:ring-2 focus:ring-offset-2
          disabled:cursor-wait
          ${isOn
            ? 'bg-green-500 focus:ring-green-400 shadow-[0_0_0_1px_#16a34a20]'
            : 'bg-gray-300 focus:ring-gray-400 shadow-[0_0_0_1px_#9ca3af20]'
          }
        `}
        style={{ width: '52px' }}
      >
        {/* Cercle du toggle */}
        <span
          className={`
            inline-flex items-center justify-center
            h-5 w-5 rounded-full bg-white shadow-md
            transition-transform duration-300 ease-in-out
            ${isOn ? 'translate-x-7' : 'translate-x-1'}
          `}
        >
          {loading ? (
            <span className="w-2.5 h-2.5 border-[1.5px] border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          ) : isOn ? (
            <Zap className="w-2.5 h-2.5 text-green-500" />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
          )}
        </span>
      </button>

      {/* Toast notification */}
      {toast && (
        <div
          className={`
            absolute right-0 top-10 z-50 whitespace-nowrap
            px-3 py-2 rounded-lg text-xs font-medium shadow-lg
            animate-in fade-in slide-in-from-top-1 duration-200
            ${toast.type === 'success'
              ? 'bg-gray-900 text-white'
              : 'bg-red-50 text-red-700 border border-red-200'
            }
          `}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}
