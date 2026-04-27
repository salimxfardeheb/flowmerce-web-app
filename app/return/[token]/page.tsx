'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import {
  Store, Package, Hash, Calendar, User, Mail, Phone,
  AlertTriangle, XCircle, CheckCircle, RotateCcw, Loader2, ChevronDown,
} from 'lucide-react'

type VendorInfo = {
  valid:           boolean
  companyName:     string
  acceptedReasons: string[]
  acceptedTypes:   string[]
  error?:          string
  orderId:         string
  customerEmail:   string
  customerName:    string
  customerPhone:   string
  productName:     string
  orderDate:       string
  shopName:        string
}

const RESOLUTION_OPTIONS = [
  { value: 'REFUND',   label: 'Remboursement',  desc: 'Je souhaite être remboursé(e)' },
  { value: 'EXCHANGE', label: 'Échange',         desc: 'Je souhaite un produit de remplacement' },
  { value: 'REPAIR',   label: 'Réparation',      desc: 'Je souhaite que le produit soit réparé' },
]

const DEFAULT_REASONS = [
  { value: "Produit défectueux",          desc: "Le produit est endommagé ou ne fonctionne pas" },
  { value: "Produit contrefait",          desc: "Le produit semble être une contrefaçon" },
  { value: "Produit endommagé livraison", desc: "Le produit a été abîmé pendant le transport" },
  { value: "Changement d'avis",           desc: "Je n'ai plus besoin de ce produit" },
  { value: "Panne après utilisation",     desc: "Le produit est tombé en panne rapidement" },
  { value: "Mauvaise taille",             desc: "La taille ou la couleur ne correspond pas" },
  { value: "Allergie/Réaction",           desc: "Réaction allergique au produit" },
  { value: "Ne correspond pas",           desc: "Le produit reçu est différent de la commande" },
  { value: "Erreur de commande vendeur",  desc: "Mauvais produit envoyé par la boutique" },
  { value: "Pièces manquantes",           desc: "Des éléments manquent dans le colis" },
]

export default function ReturnPage() {
  const params = useParams()
  const token  = params.token as string

  const [vendor, setVendor]                 = useState<VendorInfo | null>(null)
  const [loadingVendor, setLoadingVendor]   = useState(true)
  const [reason, setReason]                 = useState('')
  const [reasonOpen, setReasonOpen]         = useState(false)
  const [desiredResolution, setResolution]  = useState('')
  const [description, setDescription]       = useState('')
  const [submitting, setSubmitting]         = useState(false)
  const [result, setResult]                 = useState<{ success: boolean; claimId?: string; message: string } | null>(null)
  const reasonRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (reasonRef.current && !reasonRef.current.contains(e.target as Node)) {
        setReasonOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    fetch(`/api/return/${token}/vendor-info`)
      .then(r => r.json())
      .then(data => { setVendor(data); setLoadingVendor(false) })
      .catch(() => {
        setVendor({ valid: false, companyName: '', acceptedReasons: [], acceptedTypes: [], error: 'Impossible de vérifier le lien.', orderId: '', customerEmail: '', customerName: '', customerPhone: '', productName: '', orderDate: '', shopName: '' })
        setLoadingVendor(false)
      })
  }, [token])

  const displayedReasons = (vendor?.acceptedReasons?.length ?? 0) > 0
    ? DEFAULT_REASONS.filter(r => vendor!.acceptedReasons.includes(r.value))
    : DEFAULT_REASONS

  const displayedResolutions = RESOLUTION_OPTIONS.filter(
    r => (vendor?.acceptedTypes?.length ?? 0) === 0 || vendor!.acceptedTypes.includes(r.value)
  )

  const handleSubmit = async () => {
    if (!reason) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/return/${token}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason,
          desired_resolution: desiredResolution,
          description:        description.trim(),
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setResult({ success: true, claimId: data.claimId, message: 'Votre demande de retour a bien été enregistrée.' })
      } else {
        setResult({ success: false, message: data.error ?? 'Une erreur est survenue.' })
      }
    } catch {
      setResult({ success: false, message: 'Impossible de contacter le serveur. Réessayez plus tard.' })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading ──────────────────────────────────────────────────
  if (loadingVendor) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Vérification en cours…</p>
      </div>
    </div>
  )

  // ── Lien invalide ────────────────────────────────────────────
  if (!vendor?.valid) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md w-full text-center">
        <XCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
        <h1 className="text-base font-semibold text-gray-900 mb-1">Lien invalide</h1>
        <p className="text-sm text-gray-500">{vendor?.error ?? "Ce lien de retour n'est pas valide ou a expiré."}</p>
      </div>
    </div>
  )

  // ── Succès ───────────────────────────────────────────────────
  if (result?.success) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md w-full text-center">
        <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-7 h-7 text-green-600" />
        </div>
        <h1 className="text-base font-semibold text-gray-900 mb-1">Demande envoyée</h1>
        <p className="text-sm text-gray-500 mb-5">{result.message}</p>
        {result.claimId && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-4">
            <p className="text-xs text-gray-400 mb-1">Numéro de dossier</p>
            <p className="text-sm font-mono font-semibold text-gray-800">#{result.claimId.slice(-10).toUpperCase()}</p>
          </div>
        )}
        <div className="flex items-center justify-center gap-2 bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3">
          <Mail className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <p className="text-xs text-indigo-700">
            Confirmation envoyée à <strong>{vendor.customerEmail}</strong>
          </p>
        </div>
        <p className="text-xs text-gray-400 mt-5">Vous pouvez fermer cet onglet.</p>
      </div>
    </div>
  )

  const orderFields = [
    { icon: Store,    label: "Boutique",   value: vendor.companyName },
    { icon: Package,  label: "Produit",    value: vendor.productName },
    { icon: Hash,     label: "Commande",   value: vendor.orderId ? `#${vendor.orderId.slice(-10).toUpperCase()}` : '—' },
    { icon: Calendar, label: "Date",       value: vendor.orderDate ? new Date(vendor.orderDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—' },
    { icon: User,     label: "Client",     value: vendor.customerName || '—' },
    { icon: Mail,     label: "Email",      value: vendor.customerEmail },
    { icon: Phone,    label: "Téléphone",  value: vendor.customerPhone || '—' },
  ]

  // ── Formulaire principal ──────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-indigo-600 rounded-md flex items-center justify-center">
              <RotateCcw className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Flowmerce</p>
              <p className="text-xs text-gray-400">Gestion des retours</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Boutique partenaire</p>
            <p className="text-sm font-medium text-gray-700">{vendor.companyName}</p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

        <div>
          <h1 className="text-xl font-semibold text-gray-900">Demande de retour</h1>
          <p className="text-sm text-gray-500 mt-1">Complétez le formulaire ci-dessous pour soumettre votre demande.</p>
        </div>

        {/* Récapitulatif commande */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Récapitulatif de la commande</p>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {orderFields.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-2.5">
                <Icon className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="text-sm font-medium text-gray-800 truncate">{value || '—'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Motifs du retour */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Motif du retour <span className="text-red-400 font-normal">requis</span>
            </p>
          </div>
          <div className="p-5">
            <div ref={reasonRef} className="relative">
              <button
                type="button"
                onClick={() => setReasonOpen(o => !o)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-sm rounded-lg border transition-all ${
                  reasonOpen
                    ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                    : 'border-gray-200 hover:border-gray-300'
                } bg-white`}
              >
                <span className={reason ? 'text-gray-900' : 'text-gray-400'}>
                  {reason || 'Sélectionnez un motif…'}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${reasonOpen ? 'rotate-180' : ''}`} />
              </button>

              {reasonOpen && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                  {displayedReasons.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { setReason(opt.value); setReasonOpen(false) }}
                      className={`w-full text-left px-4 py-3 transition-colors border-b border-gray-100 last:border-0 ${
                        reason === opt.value
                          ? 'bg-indigo-50'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <p className={`text-sm font-medium ${reason === opt.value ? 'text-indigo-700' : 'text-gray-800'}`}>
                        {opt.value}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {reason && !reasonOpen && (
              <p className="text-xs text-gray-500 mt-2 px-1">
                {displayedReasons.find(r => r.value === reason)?.desc}
              </p>
            )}
          </div>
        </div>

        {/* Résolution souhaitée */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Résolution souhaitée <span className="text-red-400 font-normal">requis</span>
            </p>
          </div>
          <div className="p-5 space-y-2">
            {displayedResolutions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setResolution(opt.value)}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
                  desiredResolution === opt.value
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                }`}
              >
                <p className={`text-sm font-medium ${desiredResolution === opt.value ? 'text-indigo-700' : 'text-gray-800'}`}>
                  {opt.label}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Description <span className="font-normal normal-case">— optionnel</span></p>
          </div>
          <div className="p-5">
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              placeholder="Décrivez votre problème en détail pour accélérer le traitement…"
              className="w-full text-sm border border-gray-200 rounded-lg px-4 py-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition"
            />
          </div>
        </div>

        {/* Avertissement */}
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            Conservez le produit en bon état jusqu&apos;à la confirmation de votre retour.
            Le dossier sera traité sous <strong>48h ouvrées</strong> par {vendor.companyName}.
          </p>
        </div>

        {/* Erreur soumission */}
        {result && !result.success && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-600">{result.message}</p>
          </div>
        )}

        {/* Bouton soumettre */}
        <button
          onClick={handleSubmit}
          disabled={submitting || !reason || !desiredResolution}
          className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-3 rounded-lg transition-colors"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Envoi en cours…
            </>
          ) : (
            <>
              <RotateCcw className="w-4 h-4" />
              Soumettre la demande de retour
            </>
          )}
        </button>

        <p className="text-center text-xs text-gray-400 pb-6">
          Propulsé par <span className="font-semibold text-indigo-500">Flowmerce</span> · Gestion intelligente des retours
        </p>

      </div>
    </div>
  )
}
