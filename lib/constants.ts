// ─────────────────────────────────────────────────────────────────────────────
// Source de vérité unique pour toutes les chaînes constantes de l'application.
// Importer depuis ici — ne jamais redéfinir localement.
// ─────────────────────────────────────────────────────────────────────────────

// ── Raisons de retour (français — page hébergée + politique avancée) ─────────
export const RETURN_REASONS = [
  'Produit défectueux',
  'Produit contrefait',
  'Produit endommagé livraison',
  "Changement d'avis",
  'Panne après utilisation',
  'Mauvaise taille',
  'Allergie/Réaction',
  'Ne correspond pas',
  'Erreur de commande vendeur',
  'Pièces manquantes',
] as const
export type ReturnReason = (typeof RETURN_REASONS)[number]

// ── Descriptions des raisons (page hébergée + formulaire API) ────────────────
export const RETURN_REASON_DESCRIPTIONS: Record<ReturnReason, string> = {
  'Produit défectueux':          'Le produit est endommagé ou ne fonctionne pas',
  'Produit contrefait':          'Le produit semble être une contrefaçon',
  'Produit endommagé livraison': 'Le produit a été abîmé pendant le transport',
  "Changement d'avis":           "Je n'ai plus besoin de ce produit",
  'Panne après utilisation':     'Le produit est tombé en panne rapidement',
  'Mauvaise taille':             'La taille ou la couleur ne correspond pas',
  'Allergie/Réaction':           'Réaction allergique au produit',
  'Ne correspond pas':           'Le produit reçu est différent de la commande',
  'Erreur de commande vendeur':  'Mauvais produit envoyé par la boutique',
  'Pièces manquantes':           'Des éléments manquent dans le colis',
}

// ── Raisons externes (anglais — API partenaires) ──────────────────────────────
export const EXTERNAL_RETURN_REASONS = [
  'DEFECTIVE', 'WRONG_ITEM', 'DESCRIPTION', 'CHANGE_MIND',
] as const
export type ExternalReturnReason = (typeof EXTERNAL_RETURN_REASONS)[number]

// ── Types de réclamation (enum Prisma ClaimType) ──────────────────────────────
export const CLAIM_TYPES = ['EXCHANGE', 'REFUND', 'REPAIR'] as const
export type ClaimTypeValue = (typeof CLAIM_TYPES)[number]

// Contrat ML : 3 classes. Le modèle ne prédit JAMAIS 'Refund' — c'est ce que
// valide callMLPredict sur la réponse de /predict. Ne pas élargir cette liste.
export const AI_DECISIONS = ['Exchange', 'Repair', 'Reject'] as const
export type AIDecision = (typeof AI_DECISIONS)[number]

export function isAIDecision(value: unknown): value is AIDecision {
  return typeof value === 'string' && (AI_DECISIONS as readonly string[]).includes(value)
}

// Décision effective du vendeur : les 3 classes ML + 'Refund'. Le remboursement
// reste hors du contrat ML (le modèle ne peut pas le recommander) mais le
// vendeur doit pouvoir l'accorder — notamment quand le client l'a demandé
// (claim.type = REFUND) et que le ML a recommandé autre chose.
export const VENDOR_DECISIONS = ['Exchange', 'Repair', 'Refund', 'Reject'] as const
export type VendorDecision = (typeof VENDOR_DECISIONS)[number]

export function isVendorDecision(value: unknown): value is VendorDecision {
  return typeof value === 'string' && (VENDOR_DECISIONS as readonly string[]).includes(value)
}

// Résolution demandée par le client (`ClaimType`) → résolution correspondante
// dans le vocabulaire des décisions. Sert à deux endroits qui doivent rester
// d'accord : l'export vers le dataset ML, et la lecture des résolutions
// autorisées par le vendeur (`ReturnPolicy.acceptedTypes`, qui est une liste de
// `ClaimType`) pour filtrer la recommandation du modèle.
//
// `Reject` n'y figure volontairement pas : ce n'est pas une résolution qu'un
// client demande ni qu'un vendeur « offre », c'est un refus.
export const TYPE_TO_RESOLUTION = {
  EXCHANGE: 'Exchange',
  REFUND:   'Refund',
  REPAIR:   'Repair',
} as const satisfies Record<ClaimTypeValue, VendorDecision>

// ── Statuts de réclamation (enum Prisma ClaimStatus) ─────────────────────────
export const CLAIM_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS'] as const
export type ClaimStatusValue = (typeof CLAIM_STATUSES)[number]

// ── Types de document (enum Prisma DocumentType) ──────────────────────────────
export const DOCUMENT_TYPES = [
  'ID_CARD', 'BUSINESS_REGISTRATION', 'ADDRESS_PROOF',
  'TAX_CERTIFICATE', 'BANK_DETAILS', 'OTHER',
] as const
export type DocumentTypeValue = (typeof DOCUMENT_TYPES)[number]

// ── Catégories produit (politique vendeur avancée) ────────────────────────────
export const VENDOR_CATEGORIES = [
  'Electronics', 'Appliances', 'Clothing', 'Shoes',
  'Beauty', 'Books', 'Toys', 'Sports', 'Home', 'Food',
] as const
export type VendorCategory = (typeof VENDOR_CATEGORIES)[number]

// ── Moyens de paiement ────────────────────────────────────────────────────────
// `value` = valeur envoyée au ML (champ Payment_Method), `label` = affichage FR.
// La wilaya n'a volontairement pas de liste figée : elle est transmise par la
// boutique (session de retour ou réponses du formulaire) et reprise telle quelle.
export const PAYMENT_METHODS = [
  'Cash on Delivery', 'Card', 'CCP', 'Bank Transfer',
] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  'Cash on Delivery': 'Paiement à la livraison',
  'Card':             'Carte bancaire (CIB / Edahabia)',
  'CCP':              'Versement CCP',
  'Bank Transfer':    'Virement bancaire',
}

// ── Labels UI ─────────────────────────────────────────────────────────────────
export const CLAIM_TYPE_LABELS: Record<ClaimTypeValue, string> = {
  EXCHANGE: 'Échange',
  REFUND:   'Remboursement',
  REPAIR:   'Réparation',
}

export const CLAIM_TYPE_DESCRIPTIONS: Record<ClaimTypeValue, string> = {
  EXCHANGE: 'Je souhaite un produit de remplacement',
  REFUND:   'Je souhaite être remboursé(e)',
  REPAIR:   'Je souhaite que le produit soit réparé',
}

// Le type d'un claim peut être null tant que le ML n'a pas répondu (la décision
// du type est désormais déléguée au ML). Helper UI pour afficher proprement.
export function formatClaimType(type: ClaimTypeValue | string | null | undefined): string {
  if (!type) return 'En attente IA'
  return CLAIM_TYPE_LABELS[type as ClaimTypeValue] ?? type
}

// Le genre est transmis librement par la boutique (champ Customer_Gender du
// dataset ML, pas de liste figée côté API). On traduit les valeurs courantes
// pour l'affichage et on restitue la valeur brute pour tout le reste.
// 'Unknown' est la valeur de repli des routes d'ingestion : elle signifie
// « non transmis », donc rien à afficher.
const GENDER_LABELS: Record<string, string> = {
  male:   'Homme',
  m:      'Homme',
  homme:  'Homme',
  female: 'Femme',
  f:      'Femme',
  femme:  'Femme',
  other:  'Autre',
  autre:  'Autre',
}

export function formatCustomerGender(gender: unknown): string | null {
  if (typeof gender !== 'string') return null
  const raw = gender.trim()
  if (!raw || raw.toLowerCase() === 'unknown') return null
  return GENDER_LABELS[raw.toLowerCase()] ?? raw
}

export const AI_DECISION_LABELS: Record<AIDecision, string> = {
  Exchange: 'Échange',
  Repair:   'Réparation',
  Reject:   'Refus',
}

export const VENDOR_DECISION_LABELS: Record<VendorDecision, string> = {
  Exchange: 'Échange',
  Repair:   'Réparation',
  Refund:   'Remboursement',
  Reject:   'Refus',
}

export const CLAIM_STATUS_LABELS: Record<ClaimStatusValue, string> = {
  PENDING:     'En attente',
  APPROVED:    'Approuvée',
  REJECTED:    'Rejetée',
  IN_PROGRESS: 'En cours',
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentTypeValue, string> = {
  ID_CARD:               "Carte d'identité nationale",
  BUSINESS_REGISTRATION: 'Registre du commerce',
  ADDRESS_PROOF:         'Justificatif de domicile',
  TAX_CERTIFICATE:       'Attestation fiscale',
  BANK_DETAILS:          'Coordonnées bancaires',
  OTHER:                 'Autre document',
}

export const VENDOR_STATUS_LABELS: Record<string, string> = {
  PENDING:             'En attente',
  APPROVED:            'Approuvé',
  REJECTED:            'Rejeté',
  DOCUMENTS_REQUESTED: 'Documents demandés',
}
