'use client'

// app/return/[token]/page.tsx — page de retour hébergée Flowmerce.
//
// La page ne code AUCUN champ en dur : elle récupère la définition du
// formulaire (buildReturnForm) via /api/return/[token]/vendor-info — la même
// que celle servie aux plateformes externes par /api/v1/return-form — et la
// restitue telle quelle. Les champs déjà connus de la session sont affichés en
// récapitulatif (lecture seule) ; les autres sont saisis par le client puis
// soumis dans `answers`, comme pour l'API v1.

import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams } from 'next/navigation'
import {
  Store, Package, Hash, Calendar, User, Mail, Phone, MapPin, CreditCard, Truck,
  Banknote, Fingerprint, AlertTriangle, XCircle, CheckCircle, RotateCcw, Loader2, ChevronDown,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ── Types du formulaire (miroir de lib/services/return-form-builder) ────────
type FieldType = 'text' | 'textarea' | 'select' | 'number' | 'email' | 'tel' | 'date' | 'checkbox'

interface FormOption {
  value:        string
  label:        string
  description?: string
}

// 'merchant' : valeur fournie par la boutique, jamais saisie par le client.
type FieldSource = 'customer' | 'merchant'

interface FormField {
  id:            string
  type:          FieldType
  label:         string
  source?:       FieldSource
  required:      boolean
  placeholder?:  string
  defaultValue?: string | number | boolean | null
  options:       FormOption[]
  validation: {
    minLength?: number
    maxLength?: number
    pattern?:   string
    min?:       number
    max?:       number
  }
}

interface FormSection {
  id:           string
  title:        string
  description?: string
  fields:       FormField[]
}

interface ReturnForm {
  version:     number
  title:       string
  description: string
  sections:    FormSection[]
  /** Champs fournis par la boutique : affichés en récap, jamais en saisie. */
  merchant_fields?: FormField[]
  meta: {
    shop:   { name: string; slug: string; website?: string | null }
    policy: { max_claim_days: number; processing_days: number }
  }
}

type VendorInfo = {
  valid:         boolean
  companyName:   string
  error?:        string
  form?:         ReturnForm
  prefill?:      Record<string, string>
  customerEmail: string
}

type FieldValue = string | boolean

// ── Icônes du récapitulatif, par id de champ ────────────────────────────────
const FIELD_ICONS: Record<string, LucideIcon> = {
  order_id:        Hash,
  customer_id:     Fingerprint,
  customer_name:   User,
  customer_email:  Mail,
  customer_phone:  Phone,
  customer_wilaya: MapPin,
  product_name:    Package,
  payment_method:  CreditCard,
  shipping_method: Truck,
  shipping_cost:   Banknote,
  order_date:      Calendar,
}

function formatValue(field: FormField, raw: string): string {
  if (!raw) return '—'
  if (field.type === 'date') {
    const d = new Date(raw)
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    }
  }
  if (field.type === 'select') {
    return field.options.find(o => o.value === raw)?.label ?? raw
  }
  if (field.id === 'order_id') return `#${raw.slice(-10).toUpperCase()}`
  if (field.id === 'shipping_cost') return `${raw} DA`
  return raw
}

// ── Select générique (piloté par les options du formulaire) ─────────────────
function SelectField({
  field, value, onChange,
}: {
  field:    FormField
  value:    string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = field.options.find(o => o.value === value)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-3 py-2.5 text-sm rounded-lg border transition-all ${
          open ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-gray-200 hover:border-gray-300'
        } bg-white`}
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
          {selected?.label ?? field.placeholder ?? 'Sélectionnez…'}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-72 overflow-y-auto">
          {field.options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full text-left px-4 py-3 transition-colors border-b border-gray-100 last:border-0 ${
                value === opt.value ? 'bg-indigo-50' : 'hover:bg-gray-50'
              }`}
            >
              <p className={`text-sm font-medium ${value === opt.value ? 'text-indigo-700' : 'text-gray-800'}`}>
                {opt.label}
              </p>
              {opt.description && <p className="text-xs text-gray-400 mt-0.5">{opt.description}</p>}
            </button>
          ))}
        </div>
      )}

      {selected?.description && !open && (
        <p className="text-xs text-gray-500 mt-2 px-1">{selected.description}</p>
      )}
    </div>
  )
}

// ── Champ générique ─────────────────────────────────────────────────────────
function Field({
  field, value, onChange,
}: {
  field:    FormField
  value:    FieldValue
  onChange: (v: FieldValue) => void
}) {
  const inputClass =
    'w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 text-gray-800 placeholder-gray-400 ' +
    'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition'

  if (field.type === 'select') {
    return <SelectField field={field} value={String(value ?? '')} onChange={onChange} />
  }

  if (field.type === 'textarea') {
    return (
      <textarea
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        rows={4}
        maxLength={field.validation.maxLength}
        placeholder={field.placeholder}
        className={`${inputClass} resize-none`}
      />
    )
  }

  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2.5 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={value === true}
          onChange={e => onChange(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        {field.placeholder ?? field.label}
      </label>
    )
  }

  return (
    <input
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type}
      value={String(value ?? '')}
      onChange={e => onChange(e.target.value)}
      maxLength={field.validation.maxLength}
      min={field.validation.min}
      max={field.validation.max}
      placeholder={field.placeholder}
      className={inputClass}
    />
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function ReturnPage() {
  const params = useParams()
  const token  = params.token as string

  const [vendor, setVendor]               = useState<VendorInfo | null>(null)
  const [loadingVendor, setLoadingVendor] = useState(true)
  const [answers, setAnswers]             = useState<Record<string, FieldValue>>({})
  const [submitting, setSubmitting]       = useState(false)
  const [result, setResult]               = useState<{ success: boolean; claimId?: string; message: string } | null>(null)

  useEffect(() => {
    fetch(`/api/return/${token}/vendor-info`)
      .then(r => r.json())
      .then((data: VendorInfo) => { setVendor(data); setLoadingVendor(false) })
      .catch(() => {
        setVendor({ valid: false, companyName: '', customerEmail: '', error: 'Impossible de vérifier le lien.' })
        setLoadingVendor(false)
      })
  }, [token])

  const form    = vendor?.form
  const prefill = useMemo(() => vendor?.prefill ?? {}, [vendor])

  // Champs à afficher en récapitulatif (connus de la session) vs. à saisir.
  const { recapFields, inputSections } = useMemo(() => {
    const recap: { field: FormField; value: string }[] = []
    const sections: FormSection[] = []

    // `sections` ne contient plus que des champs destinés au client : connus de
    // la session → récapitulatif en lecture seule, sinon à saisir.
    for (const section of form?.sections ?? []) {
      const fields: FormField[] = []
      for (const field of section.fields) {
        const known = prefill[field.id]
        if (known) recap.push({ field, value: known })
        else       fields.push(field)
      }
      if (fields.length > 0) sections.push({ ...section, fields })
    }

    // `merchant_fields` n'est jamais proposé à la saisie : la boutique l'a
    // transmis, on le restitue en récapitulatif ; sinon il disparaît de la page.
    for (const field of form?.merchant_fields ?? []) {
      const known = prefill[field.id]
      if (known) recap.push({ field, value: known })
    }

    return { recapFields: recap, inputSections: sections }
  }, [form, prefill])

  // Valeurs par défaut fournies par le formulaire
  useEffect(() => {
    if (!form) return
    const defaults: Record<string, FieldValue> = {}
    for (const section of form.sections) {
      for (const field of section.fields) {
        if (field.defaultValue !== null && field.defaultValue !== undefined) {
          defaults[field.id] = field.type === 'checkbox'
            ? Boolean(field.defaultValue)
            : String(field.defaultValue)
        }
      }
    }
    setAnswers(a => ({ ...defaults, ...a }))
  }, [form])

  const missingRequired = useMemo(
    () => inputSections.some(s => s.fields.some(f => {
      if (!f.required) return false
      const v = answers[f.id]
      return v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
    })),
    [inputSections, answers],
  )

  const setAnswer = (id: string, value: FieldValue) =>
    setAnswers(a => ({ ...a, [id]: value }))

  const handleSubmit = async () => {
    if (missingRequired) return
    setSubmitting(true)
    try {
      // Les champs `number` sont envoyés typés : la validation serveur
      // (return-form-validation) refuse une chaîne pour ce type.
      const payload: Record<string, string | number | boolean> = {}
      for (const section of inputSections) {
        for (const field of section.fields) {
          const v = answers[field.id]
          if (v === undefined || v === null) continue
          if (typeof v === 'boolean') { payload[field.id] = v; continue }

          const text = v.trim()
          if (text === '') continue

          if (field.type === 'number') {
            const n = Number(text)
            if (Number.isFinite(n)) payload[field.id] = n
            continue
          }
          payload[field.id] = text
        }
      }

      // Canal unique : le jeton de session s'authentifie par en-tête, comme
      // une clé API côté boutique. L'URL /return/<token> reste celle de la
      // page — les liens déjà distribués aux clients ne bougent pas.
      const res  = await fetch('/api/v1/returns', {
        method:  'POST',
        headers: {
          'Content-Type':   'application/json',
          'X-Return-Token': token,
        },
        body:    JSON.stringify({ answers: payload }),
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
  if (!vendor?.valid || !form) return (
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
          <h1 className="text-xl font-semibold text-gray-900">{form.title}</h1>
          <p className="text-sm text-gray-500 mt-1">{form.description}</p>
        </div>

        {/* Récapitulatif commande — champs déjà connus de la boutique */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Récapitulatif de la commande</p>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-start gap-2.5">
              <Store className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-gray-400">Boutique</p>
                <p className="text-sm font-medium text-gray-800 truncate">{vendor.companyName}</p>
              </div>
            </div>
            {recapFields.map(({ field, value }) => {
              const Icon = FIELD_ICONS[field.id] ?? Hash
              return (
                <div key={field.id} className="flex items-start gap-2.5">
                  <Icon className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400">{field.label}</p>
                    <p className="text-sm font-medium text-gray-800 truncate">{formatValue(field, value)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Sections du formulaire — pilotées par la définition du vendeur.
            Pas d'`overflow-hidden` sur la carte : il découperait le panneau
            déroulant des selects, positionné en absolu hors de la carte. Les
            coins hauts sont arrondis sur l'en-tête lui-même. */}
        {inputSections.map(section => (
          <div key={section.id} className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 rounded-t-xl">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {section.title}{' '}
                {section.fields.some(f => f.required)
                  ? <span className="text-red-400 font-normal">requis</span>
                  : <span className="font-normal normal-case">— optionnel</span>}
              </p>
              {section.description && (
                <p className="text-xs text-gray-400 mt-1 normal-case">{section.description}</p>
              )}
            </div>
            <div className="p-5 space-y-4">
              {section.fields.map(field => (
                <div key={field.id}>
                  {/* Le libellé n'est masqué que s'il répète le titre de section */}
                  {!(section.fields.length === 1 && field.label === section.title) && (
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      {field.label}
                      {field.required && <span className="text-red-400 ml-1">*</span>}
                    </label>
                  )}
                  <Field
                    field={field}
                    value={answers[field.id] ?? ''}
                    onChange={v => setAnswer(field.id, v)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Avertissement */}
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            Conservez le produit en bon état jusqu&apos;à la confirmation de votre retour.
            Le dossier sera traité sous <strong>{form.meta.policy.processing_days} jours ouvrés</strong> par {vendor.companyName}.
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
          disabled={submitting || missingRequired}
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
