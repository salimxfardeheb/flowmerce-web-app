// lib/services/return-form-validation.ts — Flowmerce
//
// Validation des réponses d'un formulaire de retour CONTRE sa définition
// (buildReturnForm). Aucune règle n'est codée en dur ici : le type du champ,
// son caractère obligatoire et ses options/contraintes proviennent tous du
// JSON produit par le builder — source de vérité unique.
//
// Couche réutilisable (aucune duplication de logique) :
//   - POST /api/v1/returns          (formulaire embarqué côté boutique)
//   - POST /api/return/[token]      (page hébergée Flowmerce)

import type { ReturnForm, ReturnFormField } from '@/lib/services/return-form-builder'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HTML_RE  = /<[^>]*>/
const URL_RE   = /^(https?:|data:|blob:)/

export function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.length > 0
  return true
}

function isRequired(field: ReturnFormField): boolean {
  return field.required ?? false
}

export function optionValues(field: ReturnFormField): string[] {
  return (field.options ?? []).map(o =>
    typeof o === 'string' ? o : o.value,
  )
}

export function validateAnswer(field: ReturnFormField, value: unknown): string | null {
  const label = field.label ?? field.id

  if (!isPresent(value)) {
    return isRequired(field) ? `Champ requis manquant : ${field.id}` : null
  }

  // Types à valeur de chaîne (text, textarea, email, tel)
  if (field.type === 'text' || field.type === 'textarea' || field.type === 'email' || field.type === 'tel') {
    if (typeof value !== 'string') return `Champ ${label} invalide`
    const text = value.trim()

    if (field.validation?.minLength != null && text.length < field.validation.minLength) {
      return `Champ ${label} : minimum ${field.validation.minLength} caractères`
    }
    if (field.validation?.maxLength != null && text.length > field.validation.maxLength) {
      return `Champ ${label} : maximum ${field.validation.maxLength} caractères`
    }

    if (field.type === 'email') {
      if (!EMAIL_RE.test(text) || text.length > 254) return 'Email invalide'
    } else if (field.validation?.pattern) {
      try {
        if (!new RegExp(field.validation.pattern).test(text)) return `Champ ${label} : format invalide`
      } catch {
        // Regex invalide dans la définition du formulaire : on ne bloque pas
      }
    }

    if (HTML_RE.test(text)) return `Contenu HTML non autorisé (champ ${label})`
    return null
  }

  // Date
  if (field.type === 'date') {
    if (typeof value !== 'string') return `Champ ${label} invalide`
    const parsed = new Date(value)
    if (isNaN(parsed.getTime())) return `Champ ${label} : date invalide`
    return null
  }

  // Nombre
  if (field.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return `Champ ${label} invalide`
    if (field.validation?.min != null && value < field.validation.min) return `Champ ${label} : valeur minimale ${field.validation.min}`
    if (field.validation?.max != null && value > field.validation.max) return `Champ ${label} : valeur maximale ${field.validation.max}`
    return null
  }

  // Select / radio — la valeur doit être une option valide du formulaire
  // (les options sont déjà filtrées par la policy du vendeur : raisons
  // acceptées et types de résolution acceptés)
  if (field.type === 'select') {
    if (typeof value !== 'string') return `Champ ${label} invalide`
    const options = optionValues(field)
    if (options.length > 0 && !options.includes(value)) {
      return `Valeur invalide pour le champ ${field.id}`
    }
    return null
  }

  // Checkbox — booléen seul, ou multi-sélection (tableau d'options)
  if (field.type === 'checkbox') {
    if (typeof value === 'boolean') return null
    if (Array.isArray(value)) {
      const options = optionValues(field)
      if (options.length > 0 && value.every(v => typeof v === 'string' && options.includes(v))) return null
    }
    return `Champ ${label} invalide`
  }

  // Fichiers uploadés (image/video/file/barcode/qr/signature) — la valeur
  // est l'URL du fichier déjà mis en ligne par la plateforme cliente
  if (typeof value === 'string') {
    if (!URL_RE.test(value)) return `Champ ${label} : URL invalide`
    return null
  }

  return null
}

export interface ValidateAnswersOptions {
  // Champs déjà connus du serveur (pré-remplis par la session de retour) :
  // ils ne sont pas attendus dans les réponses du client et ne sont donc pas
  // validés — la valeur de session fait foi.
  skipFields?: Iterable<string>
}

export function validateReturnFormAnswers(
  form:    ReturnForm,
  answers: Record<string, unknown>,
  opts:    ValidateAnswersOptions = {},
): string | null {
  const skip = new Set(opts.skipFields ?? [])

  for (const section of form.sections ?? []) {
    for (const field of section.fields ?? []) {
      if (skip.has(field.id)) continue
      const error = validateAnswer(field, answers[field.id])
      if (error) return error
    }
  }
  return null
}

// Champs du formulaire dont la valeur est retenue côté serveur pour un champ
// donné : liste des ids exposés par le builder, utile aux appelants qui
// veulent parcourir le formulaire sans le reconstruire.
export function formFieldIds(form: ReturnForm): string[] {
  return (form.sections ?? []).flatMap(s => (s.fields ?? []).map(f => f.id))
}
