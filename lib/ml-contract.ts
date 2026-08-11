// lib/ml-contract.ts — Flowmerce
//
// Contrat de features partagé avec l'API ML.
//
// ─────────────────────────────────────────────────────────────────────────────
// Le problème corrigé (C-02)
// ─────────────────────────────────────────────────────────────────────────────
// La web app et le modèle parlaient deux langues différentes. `VENDOR_CATEGORIES`
// disait `Clothing`, l'encodeur avait appris `Vêtements` ; `PAYMENT_METHODS`
// disait `Cash on Delivery`, l'encodeur `Espèces livraison` ; la wilaya et le
// mode de livraison partaient en texte libre avec un repli `Unknown` / `Standard`
// qui n'existait dans aucun vocabulaire. `handle_unknown="ignore"` convertissait
// chaque valeur inconnue en vecteur nul : six des huit groupes catégoriels
// étaient muets en production, sans la moindre erreur.
//
// ─────────────────────────────────────────────────────────────────────────────
// La source de vérité
// ─────────────────────────────────────────────────────────────────────────────
// `lib/ml/feature-contract.json` est une copie **à l'octet près** de
// `contracts/feature_contract.json` du dépôt Flowmerce-ML, lui-même *dérivé* des
// artefacts entraînés (ohe_encoder.joblib…). Personne ne saisit ces listes à la
// main : elles sont générées par `scripts/build_feature_contract.py`.
//
//   artefacts entraînés → feature_contract.json → { API ML, web app }
//
// Trois garde-fous empêchent la divergence de redevenir silencieuse :
//   1. un test compare cette copie au fichier du dépôt ML ;
//   2. chaque appel /predict porte l'en-tête X-Feature-Contract-Version — l'API
//      ML répond 409 si sa version diffère ;
//   3. l'API ML remonte, dans sa réponse, les catégories qu'elle n'a pas
//      reconnues (`contract.unknown_categories`).
//
// Ce module ne fait qu'une chose : traduire le vocabulaire métier de Flowmerce
// vers le vocabulaire du modèle, et signaler ce qu'il ne sait pas traduire.

import contract from '@/lib/ml/feature-contract.json'
import { VENDOR_CATEGORIES, PAYMENT_METHODS, type VendorCategory, type PaymentMethod } from '@/lib/constants'
import { WILAYAS, WILAYA_ALIASES } from '@/lib/wilayas'

export interface FeatureContract {
  contract_version:     string
  categorical_features: Record<string, { categories: string[]; unknown_policy: string }>
  numeric_features:     string[]
  train_columns_count:  number
  resolution_labels:    Record<string, string>
}

export const FEATURE_CONTRACT = contract as FeatureContract
export const FEATURE_CONTRACT_VERSION = FEATURE_CONTRACT.contract_version

/** En-tête par lequel on déclare à l'API ML sur quel contrat on est construit. */
export const CONTRACT_VERSION_HEADER = 'X-Feature-Contract-Version'

/**
 * Valeur émise quand aucune traduction n'est possible. Elle n'appartient
 * volontairement à aucun vocabulaire : l'API ML la signale comme inconnue
 * plutôt que de la confondre avec une vraie modalité.
 */
export const UNKNOWN_CATEGORY = 'Unknown'

function vocabulaire(feature: string): readonly string[] {
  return FEATURE_CONTRACT.categorical_features[feature]?.categories ?? []
}

/** Vrai si la valeur appartient au vocabulaire appris pour cette feature. */
export function isKnownCategory(feature: string, value: unknown): boolean {
  return typeof value === 'string' && vocabulaire(feature).includes(value)
}

// ─────────────────────────────────────────────────────────────
// Comparaison souple : casse, accents et séparateurs ne doivent pas faire
// échouer une correspondance par ailleurs évidente (« bejaia » → « Béjaïa »,
// « yalidine » → « Yalidine », « zr express » → « ZR Express »).
// ─────────────────────────────────────────────────────────────
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // diacritiques
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Retrouve la modalité canonique correspondant à une saisie libre. */
function matchVocabulary(feature: string, raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const needle = fold(raw)
  if (!needle) return null

  const cats = vocabulaire(feature)
  for (const c of cats) if (c === raw) return c
  for (const c of cats) if (fold(c) === needle) return c
  return null
}

// ─────────────────────────────────────────────────────────────
// Tables de traduction — vocabulaire produit Flowmerce → vocabulaire du modèle
//
// Elles ne dupliquent pas le contrat : elles font le pont entre deux référentiels
// distincts. Les valeurs de droite sont vérifiées par un test contre le contrat,
// donc une faute de frappe ou une catégorie disparue à l'entraînement est
// détectée au lieu de produire un vecteur nul.
// ─────────────────────────────────────────────────────────────

/**
 * Catégories produit. `Books` n'a aucun équivalent dans le vocabulaire appris :
 * il n'est volontairement pas mappé — mieux vaut une catégorie signalée comme
 * inconnue qu'un rapprochement inventé qui apprendrait au modèle une fausseté.
 */
export const PRODUCT_CATEGORY_TO_MODEL: Record<VendorCategory, string | null> = {
  Electronics: 'Électronique',
  Appliances:  'Électroménager',
  Clothing:    'Vêtements',
  Shoes:       'Chaussures',
  Beauty:      'Beauté & Santé',
  Toys:        'Jouets',
  Sports:      'Sports & Loisirs',
  Home:        'Maison & Jardin',
  Food:        'Alimentation',
  Books:       null,
}

/** Moyens de paiement. `Card` couvre les cartes bancaires algériennes (CIB / Edahabia). */
export const PAYMENT_METHOD_TO_MODEL: Record<PaymentMethod, string> = {
  'Cash on Delivery': 'Espèces livraison',
  'Card':             'Edahabia',
  'CCP':              'CCP',
  'Bank Transfer':    'Virement',
}

/** Genres. Le modèle n'a appris que deux modalités ; le reste reste inconnu. */
const GENDER_TO_MODEL: Record<string, string> = {
  m:      'Male',
  h:      'Male',
  male:   'Male',
  homme:  'Male',
  f:      'Female',
  female: 'Female',
  femme:  'Female',
}

// ─────────────────────────────────────────────────────────────
// Normalisateurs — un par feature catégorielle envoyée au modèle
// ─────────────────────────────────────────────────────────────

export function normalizeProductCategory(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return UNKNOWN_CATEGORY

  // 1. Déjà dans le vocabulaire du modèle (la boutique l'envoie tel quel).
  const direct = matchVocabulary('Product_Category', raw)
  if (direct) return direct

  // 2. Vocabulaire des politiques vendeur (VENDOR_CATEGORIES).
  const vendorMatch = VENDOR_CATEGORIES.find((c) => fold(c) === fold(raw))
  if (vendorMatch) return PRODUCT_CATEGORY_TO_MODEL[vendorMatch] ?? UNKNOWN_CATEGORY

  return UNKNOWN_CATEGORY
}

export function normalizePaymentMethod(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return UNKNOWN_CATEGORY

  const direct = matchVocabulary('Payment_Method', raw)
  if (direct) return direct

  const known = PAYMENT_METHODS.find((p) => fold(p) === fold(raw))
  if (known) return PAYMENT_METHOD_TO_MODEL[known]

  return UNKNOWN_CATEGORY
}

/**
 * Transporteurs. Aucune table de traduction : les noms sont les mêmes des deux
 * côtés (Yalidine, ZR Express…), seule la forme varie.
 *
 * `Shipping_Method` est retirée des features du modèle au prochain
 * réentraînement (vocabulaire vivant, apport marginal). La valeur reste
 * transmise et collectée — elle décrit la réalité d'une réclamation — mais elle
 * n'est plus normalisée contre le vocabulaire appris : on renvoie la saisie
 * nettoyée, telle que la boutique l'a fournie.
 */
export function normalizeShippingMethod(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return UNKNOWN_CATEGORY
  return matchVocabulary('Shipping_Method', raw) ?? raw.trim()
}

/**
 * Wilayas — normalisation contre le **référentiel produit** (58 wilayas), et non
 * contre le vocabulaire du modèle.
 *
 * C'est le point important : une wilaya que le modèle ne connaît pas encore
 * (il n'en a vu que 24) est désormais transmise sous sa forme canonique plutôt
 * qu'écrasée en `Unknown`. Elle est signalée comme hors vocabulaire par l'API ML
 * — donc visible — et elle entre correctement dans le dataset, où un
 * réentraînement pourra l'apprendre. Écraser en `Unknown` détruisait
 * l'information au lieu de la mettre de côté.
 *
 * Accepte : le nom (accentué ou non), le code officiel (`16`, `06`), et les
 * circonscriptions déléguées rattachées à leur wilaya de tutelle.
 */
export function normalizeCustomerWilaya(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return UNKNOWN_CATEGORY
  const brut = raw.trim()

  // 1. Code officiel — « 16 », « 06 », « 6 ».
  if (/^\d{1,2}$/.test(brut)) {
    const code = brut.padStart(2, '0')
    const parCode = WILAYAS.find((w) => w.code === code)
    if (parCode) return parCode.name
  }

  // 2. Nom d'une wilaya, à la casse et aux accents près.
  const cible = fold(brut)
  const parNom = WILAYAS.find((w) => fold(w.name) === cible)
  if (parNom) return parNom.name

  // 3. Circonscription déléguée ou variante d'usage → wilaya de tutelle.
  for (const [alias, wilaya] of Object.entries(WILAYA_ALIASES)) {
    if (fold(alias) === cible) return wilaya
  }

  return UNKNOWN_CATEGORY
}

export function normalizeCustomerGender(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return UNKNOWN_CATEGORY

  const direct = matchVocabulary('Customer_Gender', raw)
  if (direct) return direct

  return GENDER_TO_MODEL[fold(raw)] ?? UNKNOWN_CATEGORY
}

/** Motifs de retour : `RETURN_REASONS` est déjà aligné sur le vocabulaire appris. */
export function normalizeReturnReason(raw: unknown): string {
  return matchVocabulary('Return_Reason', raw) ?? (typeof raw === 'string' ? raw : UNKNOWN_CATEGORY)
}

// ─────────────────────────────────────────────────────────────
// Diagnostic local — les mêmes règles que celles appliquées côté ML.
// Sert à journaliser la dégradation sans attendre la réponse du serveur.
// ─────────────────────────────────────────────────────────────
export interface CategoryDiagnosis {
  /** Features hors vocabulaire, avec la valeur émise. */
  unknown:  Record<string, string>
  /** Divergences anormales (tout sauf Shop_Name, structurellement hors vocabulaire). */
  alerts:   string[]
  /** Part des features catégorielles reconnues, 0..1. */
  coverage: number
}

export function diagnoseCategories(payload: Record<string, unknown>): CategoryDiagnosis {
  const unknown: Record<string, string> = {}
  const alerts: string[] = []
  let examined = 0
  let known = 0

  for (const [feature, spec] of Object.entries(FEATURE_CONTRACT.categorical_features)) {
    if (!(feature in payload)) continue
    examined++

    const value = payload[feature]
    if (typeof value === 'string' && spec.categories.includes(value)) {
      known++
      continue
    }

    unknown[feature] = String(value)
    if (spec.unknown_policy !== 'expected') alerts.push(feature)
  }

  return {
    unknown,
    alerts,
    coverage: examined ? Number((known / examined).toFixed(4)) : 1,
  }
}
