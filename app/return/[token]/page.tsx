'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

type VendorInfo = {
  valid:           boolean
  companyName:     string
  acceptedReasons: string[]
  acceptedTypes:   string[]
  error?:          string
  // session pre-fill data
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
  { value: "Produit défectueux",            desc: "Le produit est endommagé ou ne fonctionne pas" },
  { value: "Produit contrefait",            desc: "Le produit semble être une contrefaçon" },
  { value: "Produit endommagé livraison",   desc: "Le produit a été abîmé pendant le transport" },
  { value: "Changement d'avis",             desc: "Je n'ai plus besoin de ce produit" },
  { value: "Panne après utilisation",       desc: "Le produit est tombé en panne rapidement" },
  { value: "Mauvaise taille",               desc: "La taille ou la couleur ne correspond pas" },
  { value: "Allergie/Réaction",             desc: "Réaction allergique au produit" },
  { value: "Ne correspond pas",             desc: "Le produit reçu est différent de la commande" },
  { value: "Erreur de commande vendeur",    desc: "Mauvais produit envoyé par la boutique" },
  { value: "Pièces manquantes",             desc: "Des éléments manquent dans le colis" },
]

export default function ReturnPage() {
  const params = useParams()
  const token  = params.token as string

  const [vendor, setVendor]               = useState<VendorInfo | null>(null)
  const [loadingVendor, setLoadingVendor] = useState(true)
  const [reason, setReason]               = useState('')
  const [desiredResolution, setResolution] = useState('')
  const [description, setDescription]     = useState('')
  const [submitting, setSubmitting]       = useState(false)
  const [result, setResult]               = useState<{ success: boolean; claimId?: string; message: string } | null>(null)

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
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 text-sm">Vérification en cours...</p>
      </div>
    </div>
  )

  // ── Lien invalide / expiré ────────────────────────────────────
  if (!vendor?.valid) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-8 max-w-md w-full text-center">
        <p className="text-5xl mb-4">❌</p>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Lien invalide</h1>
        <p className="text-sm text-gray-500">{vendor?.error ?? "Ce lien de retour n'est pas valide ou a expiré."}</p>
      </div>
    </div>
  )

  // ── Succès ───────────────────────────────────────────────────
  if (result?.success) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Demande envoyée !</h1>
        <p className="text-sm text-gray-500 mb-4">{result.message}</p>
        {result.claimId && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-4">
            <p className="text-xs text-gray-400 mb-1">Numéro de dossier</p>
            <p className="text-sm font-mono font-bold text-gray-700">#{result.claimId.slice(-10).toUpperCase()}</p>
          </div>
        )}
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
          <p className="text-xs text-indigo-700">
            📧 Un email de confirmation sera envoyé à <strong>{vendor.customerEmail}</strong>
          </p>
        </div>
        <p className="text-xs text-gray-400 mt-6">Vous pouvez fermer cet onglet.</p>
      </div>
    </div>
  )

  // ── Formulaire principal ──────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">Flowmerce</p>
              <p className="text-xs text-gray-400">Gestion des retours</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Boutique partenaire</p>
            <p className="text-sm font-semibold text-gray-700">{vendor.companyName}</p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        <div>
          <h1 className="text-2xl font-bold text-gray-800">Demande de retour</h1>
          <p className="text-sm text-gray-500 mt-1">Complétez le formulaire ci-dessous pour soumettre votre demande.</p>
        </div>

        {/* Récapitulatif commande */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Récapitulatif de la commande</p>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: "🛍️ Boutique",   value: vendor.companyName },
              { label: "📦 Produit",    value: vendor.productName },
              { label: "🔖 Commande",   value: vendor.orderId ? `#${vendor.orderId.slice(-10).toUpperCase()}` : '—' },
              { label: "📅 Date",       value: vendor.orderDate ? new Date(vendor.orderDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—' },
              { label: "👤 Client",     value: vendor.customerName || '—' },
              { label: "📧 Email",      value: vendor.customerEmail },
              { label: "📞 Téléphone",  value: vendor.customerPhone || '—' },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                <p className="text-sm font-medium text-gray-800 truncate">{value || '—'}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Motifs du retour */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Motif du retour <span className="text-red-500">*</span>
            </p>
          </div>
          <div className="p-5 space-y-3">
            {displayedReasons.map(opt => (
              <button
                key={opt.value}
                onClick={() => setReason(opt.value)}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                  reason === opt.value
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                }`}
              >
                <p className={`text-sm font-semibold ${reason === opt.value ? 'text-indigo-700' : 'text-gray-700'}`}>
                  {opt.value}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Résolution souhaitée */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Résolution souhaitée <span className="text-red-500">*</span>
            </p>
          </div>
          <div className="p-5 space-y-3">
            {displayedResolutions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setResolution(opt.value)}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                  desiredResolution === opt.value
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                }`}
              >
                <p className={`text-sm font-semibold ${desiredResolution === opt.value ? 'text-indigo-700' : 'text-gray-700'}`}>
                  {opt.label}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Description (optionnel)</p>
          </div>
          <div className="p-5">
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              placeholder="Décrivez votre problème en détail pour accélérer le traitement..."
              className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 bg-transparent text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none transition"
            />
          </div>
        </div>

        {/* Avertissement */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-3">
          <span className="text-lg shrink-0">⚠️</span>
          <p className="text-xs text-amber-700">
            Conservez le produit en bon état jusqu'à la confirmation de votre retour.
            Le dossier sera traité sous <strong>48h ouvrées</strong> par {vendor.companyName}.
          </p>
        </div>

        {/* Erreur soumission */}
        {result && !result.success && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-sm text-red-600">❌ {result.message}</p>
          </div>
        )}

        {/* Bouton soumettre */}
        <button
          onClick={handleSubmit}
          disabled={submitting || !reason || !desiredResolution}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl transition-all text-sm shadow-sm"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Envoi en cours...
            </span>
          ) : (
            '↩ Soumettre la demande de retour'
          )}
        </button>

        <p className="text-center text-xs text-gray-400 pb-8">
          Propulsé par <span className="font-semibold text-indigo-500">Flowmerce</span> · Gestion intelligente des retours
        </p>
      </div>
    </div>
  )
}
