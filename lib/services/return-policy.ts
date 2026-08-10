import type { ReturnPolicy } from '@prisma/client';

type PolicyData = Pick<ReturnPolicy,
  | 'maxClaimDays'
  | 'nonRefundableCategories'
  | 'exchangeOnlyCategories'
  | 'acceptedTypes'
>;

export type PolicyCheckResult =
  | { ok: true;  forceExchange: boolean }
  | { ok: false; code: string; message: string; extra?: Record<string, unknown> };

// ─────────────────────────────────────────────────────────────
// Violations définitives pour une commande donnée : réessayer avec le même
// order_id ne peut pas aboutir (la date de commande et la catégorie produit
// ne changeront pas). Elles peuvent donc être enregistrées en base sans
// risque.
//
// CLAIM_TYPE_NOT_ACCEPTED en est volontairement absent : il se corrige en
// changeant `desired_resolution`. Créer une réclamation dessus ferait butter
// le réessai légitime sur la contrainte unique (vendorId, orderId).
// ─────────────────────────────────────────────────────────────
export const PERMANENT_POLICY_CODES = [
  'DELAY_EXCEEDED',
  'NON_REFUNDABLE_CATEGORY',
] as const;

export function isPermanentPolicyViolation(code: string): boolean {
  return (PERMANENT_POLICY_CODES as readonly string[]).includes(code);
}

const norm = (s?: string | null) => (s ?? '').toLowerCase().trim();

export function checkReturnPolicy(
  policy: PolicyData | null,
  input: {
    daysToReturn:     number;
    productCategory?: string;
    claimType?:       string;
  },
): PolicyCheckResult {
  if (!policy) return { ok: true, forceExchange: false };

  const { daysToReturn, productCategory, claimType } = input;

  // 1. Fenêtre de rétractation
  if (daysToReturn > policy.maxClaimDays) {
    return {
      ok:      false,
      code:    'DELAY_EXCEEDED',
      message: `Délai de retour dépassé. La politique du vendeur autorise ${policy.maxClaimDays} jours, votre demande arrive après ${daysToReturn} jours.`,
      extra:   { policy_days: policy.maxClaimDays, days_actual: daysToReturn },
    };
  }

  // 2. Catégorie non remboursable
  const normCat       = norm(productCategory);
  const nonRefundable = policy.nonRefundableCategories.map(norm);
  if (normCat && nonRefundable.includes(normCat)) {
    return {
      ok:      false,
      code:    'NON_REFUNDABLE_CATEGORY',
      message: `La catégorie "${productCategory}" est non remboursable selon la politique du vendeur.`,
      extra:   { category: productCategory },
    };
  }

  // 3. Type de réclamation non accepté
  if (claimType && policy.acceptedTypes.length > 0 && !policy.acceptedTypes.includes(claimType as ReturnPolicy['acceptedTypes'][number])) {
    return {
      ok:      false,
      code:    'CLAIM_TYPE_NOT_ACCEPTED',
      message: `Ce type de réclamation (${claimType}) n'est pas accepté par ce vendeur.`,
    };
  }

  // 4. Catégorie échange uniquement
  const exchangeOnly = policy.exchangeOnlyCategories.map(norm);
  const forceExchange = !!(normCat && exchangeOnly.includes(normCat));

  return { ok: true, forceExchange };
}
