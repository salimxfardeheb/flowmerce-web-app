'use client'

// app/return/[token]/page.tsx — page de retour hébergée Flowmerce.
//
// La page ne code AUCUN champ en dur : elle récupère la définition du
// formulaire (buildReturnForm) via /api/return/[token]/vendor-info — la même
// que celle servie aux plateformes externes par /api/v1/return-form — et la
// restitue telle quelle. Les champs déjà connus de la session sont affichés en
// récapitulatif (lecture seule) ; les autres sont saisis par le client puis
// soumis dans `answers`, comme pour l'API v1.
//
// Seule page du produit vue par les clients finaux des boutiques : elle suit
// les tokens du design system (`ink`, `line`, `surface`, `brand`…) comme la
// landing et les pages d'authentification, pas les gris bruts du back-office.

import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import {
  Store, Package, Hash, Calendar, User, Mail, Phone, MapPin, CreditCard, Truck,
  Banknote, Fingerprint, AlertTriangle, XCircle, CheckCircle2, RotateCcw, Loader2,
  ChevronDown, ShieldCheck, Cpu, Network,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ── Vocabulaire visuel partagé ──────────────────────────────────────────────
const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

const CARD = 'rounded-card border border-line bg-surface'

const CARD_HEAD = 'border-b border-line bg-page px-5 py-3'

const EYEBROW = 'text-[11px] font-bold uppercase tracking-[0.18em] text-faint'

const INPUT =
  `w-full rounded-control border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-faint focus-visible:border-brand ${FOCUS}`

const LABEL = 'mb-1.5 block text-[13px] font-semibold text-ink'

const BTN_PRIMARY =
  `inline-flex w-full items-center justify-center gap-2 rounded-control bg-brand px-5 py-3 text-sm font-semibold text-on-brand transition-[background-color,transform] hover:bg-brand-dark active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`

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

// Le consentement fait partie de la définition du formulaire (section
// `consent`), pour que le formulaire embarqué chez la boutique l'obtienne sans
// code dédié. Ici il serait rendu deux fois : une case générique perdue dans
// une section, et le bloc explicatif ci-dessous. On retire la première et on
// envoie l'accord à la racine du body.
const CONSENT_FIELD_ID = 'data_consent'

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

// ── Coquille des écrans pleine page (chargement, lien mort, succès) ─────────
function Standalone({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-page px-4 font-sans text-ink">
      <div className={`w-full max-w-md p-8 text-center shadow-sm shadow-ink/5 ${CARD}`}>
        {children}
      </div>
    </div>
  )
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
        id={field.id}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center justify-between rounded-control border bg-surface px-3.5 py-2.5 text-[15px] transition-colors ${FOCUS} ${
          open ? 'border-brand' : 'border-line hover:border-brand/40'
        }`}
      >
        <span className={selected ? 'text-ink' : 'text-faint'}>
          {selected?.label ?? field.placeholder ?? 'Sélectionnez…'}
        </span>
        <ChevronDown
          size={16}
          aria-hidden
          className={`shrink-0 text-faint transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-10 mt-1 max-h-72 w-full list-none overflow-y-auto rounded-control border border-line bg-surface p-0 shadow-lg shadow-ink/10"
        >
          {field.options.map(opt => {
            const active = value === opt.value
            return (
              <li key={opt.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false) }}
                  className={`w-full border-b border-line px-4 py-3 text-left transition-colors last:border-0 ${FOCUS} ${
                    active ? 'bg-brand-soft' : 'hover:bg-page'
                  }`}
                >
                  <span
                    className={`block text-[14px] font-semibold ${active ? 'text-brand-ink' : 'text-ink'}`}
                  >
                    {opt.label}
                  </span>
                  {opt.description && (
                    <span className="mt-0.5 block text-[12px] text-body">{opt.description}</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {selected?.description && !open && (
        <p className="mt-2 text-[12px] text-body">{selected.description}</p>
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
  if (field.type === 'select') {
    return <SelectField field={field} value={String(value ?? '')} onChange={onChange} />
  }

  if (field.type === 'textarea') {
    return (
      <textarea
        id={field.id}
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        rows={4}
        maxLength={field.validation.maxLength}
        placeholder={field.placeholder}
        className={`${INPUT} resize-none`}
      />
    )
  }

  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2.5 text-[14px] text-body">
        <input
          id={field.id}
          type="checkbox"
          checked={value === true}
          onChange={e => onChange(e.target.checked)}
          className={`size-4 shrink-0 accent-brand ${FOCUS}`}
        />
        {field.placeholder ?? field.label}
      </label>
    )
  }

  return (
    <input
      id={field.id}
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type}
      value={String(value ?? '')}
      onChange={e => onChange(e.target.value)}
      maxLength={field.validation.maxLength}
      min={field.validation.min}
      max={field.validation.max}
      placeholder={field.placeholder}
      className={INPUT}
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
  const [consent, setConsent]             = useState(false)
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
        if (field.id === CONSENT_FIELD_ID) continue
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

  const blocked = missingRequired || !consent

  const setAnswer = (id: string, value: FieldValue) =>
    setAnswers(a => ({ ...a, [id]: value }))

  const handleSubmit = async () => {
    if (blocked) return
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
      //
      // `data_consent` voyage à la racine du body, hors `answers` : ce n'est pas
      // une réponse au formulaire du vendeur mais un accord donné à Flowmerce.
      // Le serveur refuse la soumission sans lui (400 CONSENT_REQUIRED) et
      // horodate l'acceptation sur la réclamation.
      const res  = await fetch('/api/v1/returns', {
        method:  'POST',
        headers: {
          'Content-Type':   'application/json',
          'X-Return-Token': token,
        },
        body:    JSON.stringify({ answers: payload, data_consent: true }),
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

  // ── Chargement ───────────────────────────────────────────────
  if (loadingVendor) return (
    <Standalone>
      <Loader2 size={28} className="mx-auto mb-3 animate-spin text-brand" aria-hidden />
      <p role="status" className="text-[14px] text-body">Vérification du lien…</p>
    </Standalone>
  )

  // ── Lien invalide ────────────────────────────────────────────
  if (!vendor?.valid || !form) return (
    <Standalone>
      <span
        aria-hidden
        className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-red-50"
      >
        <XCircle size={22} className="text-red-600" />
      </span>
      <h1 className="text-lg font-bold tracking-[-0.015em] text-ink">Lien invalide</h1>
      <p className="mt-1.5 text-[14px] text-body">
        {vendor?.error ?? "Ce lien de retour n'est pas valide ou a expiré."}
      </p>
    </Standalone>
  )

  // ── Succès ───────────────────────────────────────────────────
  if (result?.success) return (
    <Standalone>
      <span
        aria-hidden
        className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-green-50"
      >
        <CheckCircle2 size={22} className="text-green-700" />
      </span>
      <h1 className="text-lg font-bold tracking-[-0.015em] text-ink">Demande envoyée</h1>
      <p className="mt-1.5 text-[14px] text-body">{result.message}</p>

      {result.claimId && (
        <div className="mt-5 rounded-control border border-line bg-page px-4 py-3">
          <p className={EYEBROW}>Numéro de dossier</p>
          <p className="mt-1 font-mono text-[15px] font-bold text-ink">
            #{result.claimId.slice(-10).toUpperCase()}
          </p>
        </div>
      )}

      <p className="mt-3 flex items-center justify-center gap-2 rounded-control bg-brand-soft px-4 py-3 text-[13px] text-brand-ink">
        <Mail size={14} className="shrink-0" aria-hidden />
        <span>
          Confirmation envoyée à <strong className="font-semibold">{vendor.customerEmail}</strong>
        </span>
      </p>

      <p className="mt-5 text-[13px] text-faint">Vous pouvez fermer cet onglet.</p>
    </Standalone>
  )

  // ── Formulaire principal ──────────────────────────────────────
  return (
    <div className="min-h-dvh bg-page font-sans text-ink">

      <header className="border-b border-line bg-surface px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3">
          <Image
            src="/logos/logo-lockup.svg"
            alt="Flowmerce"
            width={132}
            height={26}
            priority
          />
          <div className="text-right">
            <p className={EYEBROW}>Boutique partenaire</p>
            <p className="mt-0.5 text-[14px] font-semibold text-ink">{vendor.companyName}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-8 sm:px-6">

        <div>
          <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-ink">{form.title}</h1>
          <p className="mt-1.5 text-[14px] text-body">{form.description}</p>
        </div>

        {/* Récapitulatif commande — champs déjà connus de la boutique */}
        <section className={CARD}>
          <div className={`${CARD_HEAD} rounded-t-card`}>
            <h2 className={EYEBROW}>Récapitulatif de la commande</h2>
          </div>
          <dl className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <div className="flex items-start gap-2.5">
              <Store size={14} className="mt-0.5 shrink-0 text-faint" aria-hidden />
              <div className="min-w-0">
                <dt className="text-[12px] text-faint">Boutique</dt>
                <dd className="truncate text-[14px] font-semibold text-ink">{vendor.companyName}</dd>
              </div>
            </div>
            {recapFields.map(({ field, value }) => {
              const Icon = FIELD_ICONS[field.id] ?? Hash
              return (
                <div key={field.id} className="flex items-start gap-2.5">
                  <Icon size={14} className="mt-0.5 shrink-0 text-faint" aria-hidden />
                  <div className="min-w-0">
                    <dt className="text-[12px] text-faint">{field.label}</dt>
                    <dd className="truncate text-[14px] font-semibold text-ink">
                      {formatValue(field, value)}
                    </dd>
                  </div>
                </div>
              )
            })}
          </dl>
        </section>

        {/* Sections du formulaire — pilotées par la définition du vendeur.
            Pas d'`overflow-hidden` sur la carte : il découperait le panneau
            déroulant des selects, positionné en absolu hors de la carte. Les
            coins hauts sont arrondis sur l'en-tête lui-même. */}
        {inputSections.map(section => (
          <section key={section.id} className={CARD}>
            <div className={`${CARD_HEAD} rounded-t-card`}>
              <h2 className={EYEBROW}>
                {section.title}{' '}
                {section.fields.some(f => f.required)
                  ? <span className="font-bold text-brand-ink">requis</span>
                  : <span className="font-semibold normal-case tracking-normal">— optionnel</span>}
              </h2>
              {section.description && (
                <p className="mt-1 text-[12px] normal-case text-body">{section.description}</p>
              )}
            </div>
            <div className="space-y-4 p-5">
              {section.fields.map(field => (
                <div key={field.id}>
                  {/* Le libellé n'est masqué que s'il répète le titre de section */}
                  {!(section.fields.length === 1 && field.label === section.title) && (
                    <label htmlFor={field.id} className={LABEL}>
                      {field.label}
                      {field.required && (
                        <span className="ml-1 text-brand-ink" aria-hidden>*</span>
                      )}
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
          </section>
        ))}

        {/* ── Consentement ──────────────────────────────────────────────────
            Le client final n'a aucune relation contractuelle avec Flowmerce :
            il connaît sa boutique, pas nous. L'usage de ses données doit donc
            être énoncé ici, avant l'envoi, et accepté explicitement. Les trois
            finalités listées sont celles que le code applique réellement —
            décision, entraînement, score inter-boutiques (le dossier anti-fraude
            est rapproché par email et téléphone, toutes boutiques confondues).
            Le refus n'est pas un état d'erreur : le bouton reste simplement
            inactif, et le serveur redemande le consentement de son côté. */}
        <section className={`${CARD} border-brand/30`}>
          <div className={`${CARD_HEAD} rounded-t-card`}>
            <h2 className={EYEBROW}>Utilisation de vos données</h2>
          </div>

          <div className="p-5">
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {[
                {
                  Icon: ShieldCheck,
                  title: 'Décider de votre demande',
                  text: 'Les informations de cette demande — commande, produit, motif, coordonnées — servent à analyser votre réclamation et à proposer une décision à la boutique.',
                },
                {
                  Icon: Cpu,
                  title: 'Entraîner notre modèle',
                  text: 'Ces mêmes informations, ainsi que la décision finale, alimentent le modèle qui produit ces analyses, afin de le rendre plus juste au fil du temps.',
                },
                {
                  Icon: Network,
                  title: 'Historique des retours',
                  text: 'Votre email et votre téléphone rapprochent cette demande de vos retours précédents chez les boutiques partenaires, pour distinguer un client régulier d’un usage abusif.',
                },
              ].map(({ Icon, title, text }) => (
                <li key={title} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-control bg-brand-soft"
                  >
                    <Icon size={14} className="text-brand-ink" />
                  </span>
                  <span>
                    <span className="block text-[13px] font-semibold text-ink">{title}</span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-body">{text}</span>
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-4 text-[12px] leading-relaxed text-faint">
              Ces données ne sont ni revendues, ni utilisées à des fins publicitaires, ni exploitées
              pour un autre usage que le traitement des retours. Pour toute question les concernant,
              contactez {vendor.companyName}.
            </p>

            <label
              className={`mt-4 flex cursor-pointer items-start gap-3 rounded-control border p-3.5 transition-colors ${
                consent ? 'border-brand bg-brand-soft' : 'border-line hover:border-brand/40'
              }`}
            >
              <input
                type="checkbox"
                checked={consent}
                onChange={e => setConsent(e.target.checked)}
                className={`mt-0.5 size-4 shrink-0 accent-brand ${FOCUS}`}
              />
              <span className="text-[13px] leading-relaxed text-ink">
                J’accepte que Flowmerce utilise les informations de cette demande pour les usages
                décrits ci-dessus, y compris l’entraînement de son modèle d’analyse.
              </span>
            </label>
          </div>
        </section>

        {/* Avertissement */}
        <div className="flex items-start gap-3 rounded-control border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
          <p className="text-[13px] leading-relaxed text-amber-800">
            Conservez le produit en bon état jusqu&apos;à la confirmation de votre retour.
            Le dossier sera traité sous <strong className="font-semibold">{form.meta.policy.processing_days} jours ouvrés</strong> par {vendor.companyName}.
          </p>
        </div>

        {/* Erreur soumission */}
        {result && !result.success && (
          <p
            role="alert"
            className="flex items-start gap-3 rounded-control border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
          >
            <XCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
            {result.message}
          </p>
        )}

        {/* Bouton soumettre */}
        <div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || blocked}
            className={BTN_PRIMARY}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden />
                Envoi en cours…
              </>
            ) : (
              <>
                <RotateCcw size={16} aria-hidden />
                Soumettre la demande de retour
              </>
            )}
          </button>

          {/* Un bouton grisé sans explication laisse le client chercher. */}
          {!submitting && blocked && (
            <p className="mt-2 text-center text-[12px] text-faint">
              {missingRequired
                ? 'Complétez les champs obligatoires pour continuer.'
                : 'Cochez l’accord d’utilisation des données pour continuer.'}
            </p>
          )}
        </div>

        <p className="pb-6 text-center text-[12px] text-faint">
          Propulsé par <span className="font-semibold text-brand-ink">Flowmerce</span> · Gestion intelligente des retours
        </p>

      </main>
    </div>
  )
}
