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

// ── Raisons externes (anglais — API partenaires) ──────────────────────────────
export const EXTERNAL_RETURN_REASONS = [
  'DEFECTIVE', 'WRONG_ITEM', 'DESCRIPTION', 'CHANGE_MIND',
] as const
export type ExternalReturnReason = (typeof EXTERNAL_RETURN_REASONS)[number]

// ── Types de réclamation (enum Prisma ClaimType) ──────────────────────────────
export const CLAIM_TYPES = ['EXCHANGE', 'REFUND', 'REPAIR'] as const
export type ClaimTypeValue = (typeof CLAIM_TYPES)[number]

// ── Décisions IA (sorties du modèle ML) ───────────────────────────────────────
export const AI_DECISIONS = ['Refund', 'Exchange', 'Repair', 'Reject'] as const
export type AIDecision = (typeof AI_DECISIONS)[number]

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

// ── Labels UI ─────────────────────────────────────────────────────────────────
export const CLAIM_TYPE_LABELS: Record<ClaimTypeValue, string> = {
  EXCHANGE: 'Échange',
  REFUND:   'Remboursement',
  REPAIR:   'Réparation',
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
