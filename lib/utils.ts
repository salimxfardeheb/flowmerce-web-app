import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { randomBytes, createHash } from "node:crypto";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─────────────────────────────────────────────────────────────
// Clés API
// - Génération : crypto.randomBytes (CSPRNG) — jamais Math.random
// - Stockage   : SHA-256 du raw → la valeur en clair n'existe
//   qu'à l'instant de la création, retournée une seule fois au
//   vendeur. La DB ne contient que le hash + un préfixe public.
// ─────────────────────────────────────────────────────────────
const API_KEY_PREFIX = "flk";

export function generateApiKey(): string {
  // 32 octets aléatoires → 43 chars base64url, ~256 bits d'entropie
  return `${API_KEY_PREFIX}_${randomBytes(32).toString("base64url")}`;
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function apiKeyPrefix(raw: string): string {
  // 12 premiers caractères affichés au vendeur pour identification
  return raw.slice(0, 12);
}

// ─────────────────────────────────────────────────────────────
// Âge client — feature Customer_Age du modèle.
// Les boutiques transmettent soit un âge direct (`customer_age`),
// soit une date de naissance (`customer_birth_date`) dont l'âge est
// dérivé ici. Une date de naissance prime sur un âge direct : c'est
// la donnée précise, et elle reste juste quelle que soit la date à
// laquelle la réclamation est déposée.
// ─────────────────────────────────────────────────────────────
export const MIN_CUSTOMER_AGE = 1;
export const MAX_CUSTOMER_AGE = 120;

/**
 * Âge révolu, en années, à partir d'une date de naissance.
 * Retourne null si la valeur n'est pas une date exploitable, si elle est
 * dans le futur, ou si l'âge obtenu sort des bornes plausibles — dans tous
 * ces cas l'appelant doit traiter l'entrée comme invalide plutôt que de
 * laisser une valeur aberrante alimenter le modèle.
 */
export function computeAgeFromBirthDate(
  value: unknown,
  now: Date = new Date(),
): number | null {
  if (!(value instanceof Date) && typeof value !== "string") return null;

  const birth = value instanceof Date ? value : new Date(value.trim());
  if (Number.isNaN(birth.getTime())) return null;
  if (birth.getTime() > now.getTime()) return null;

  // Comparaison en UTC de bout en bout : les dates ISO nues ('1992-05-14')
  // sont parsées à minuit UTC, mélanger avec le fuseau local décalerait
  // l'anniversaire d'un jour.
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) {
    age--; // anniversaire pas encore passé cette année
  }

  if (age < MIN_CUSTOMER_AGE || age > MAX_CUSTOMER_AGE) return null;
  return age;
}

// ─────────────────────────────────────────────────────────────
// Date de commande
// Une commande ne peut pas être passée dans le futur : une telle valeur est
// une erreur d'intégration. Laissée passer, elle produit un `Days_to_Return`
// négatif ramené à 0 par les appelants — soit un 0 inventé injecté dans le
// dataset ML, indiscernable d'un retour le jour même.
// ─────────────────────────────────────────────────────────────
export type OrderDateResult =
  | { ok: true; date: Date | null }
  | { ok: false; reason: "invalid" | "future" };

export function parseOrderDate(value: unknown, now: Date = new Date()): OrderDateResult {
  if (value === null || value === undefined || value === "") return { ok: true, date: null };

  const date = value instanceof Date ? value : new Date(String(value).trim());
  if (Number.isNaN(date.getTime())) return { ok: false, reason: "invalid" };
  // Tolérance d'un jour : une commande passée aujourd'hui dans un fuseau en
  // avance sur UTC ne doit pas être rejetée.
  if (date.getTime() > now.getTime() + 86_400_000) return { ok: false, reason: "future" };

  return { ok: true, date };
}

/** Jours écoulés depuis la commande, 0 si la date est absente. */
export function daysSinceOrder(orderDate: Date | null, now: Date = new Date()): number {
  if (!orderDate) return 0;
  return Math.max(0, Math.floor((now.getTime() - orderDate.getTime()) / 86_400_000));
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export {
  CLAIM_TYPE_LABELS,
  CLAIM_STATUS_LABELS,
  VENDOR_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  formatClaimType,
} from './constants';
