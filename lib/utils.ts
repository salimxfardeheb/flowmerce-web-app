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
