import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Primitives du tableau de bord.
 *
 * Le skill de design exclut les tableaux de bord de son périmètre : ses règles
 * de page marketing (hauteur de hero, quota d'eyebrows, variété des familles de
 * mise en page) ne s'appliquent pas ici. Ce qui s'applique, et que ce fichier
 * fait respecter mécaniquement :
 *
 *   · Verrou de couleur   — un seul accent, l'indigo de marque. Les autres
 *                           couleurs ne sortent que d'une échelle sémantique
 *                           fermée : statut de réclamation et niveau de risque.
 *   · Verrou de forme     — contrôles 10px, cartes 16px, pastilles pleines.
 *   · Contraste           — uniquement des tokens, tous ≥ 4.5:1.
 *   · Focus clavier       — un seul anneau, partagé.
 *   · États               — vide, chargement et erreur ont des composants
 *                           dédiés, au lieu d'être oubliés au cas par cas.
 *   · Chiffres            — `tabular-nums` partout, pour que les colonnes
 *                           s'alignent d'une ligne à l'autre.
 */

export const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export const BTN_PRIMARY = `inline-flex items-center justify-center gap-2 rounded-control bg-brand px-4 py-2.5 text-[13px] font-semibold text-on-brand transition-[background-color,transform] hover:bg-brand-dark active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;

export const BTN_GHOST = `inline-flex items-center justify-center gap-2 rounded-control border border-line bg-surface px-4 py-2.5 text-[13px] font-semibold text-ink transition-[border-color,transform] hover:border-brand/40 active:translate-y-px disabled:opacity-50 ${FOCUS}`;

export const FIELD = `w-full rounded-control border border-line bg-surface px-3 py-2 text-[14px] text-ink placeholder:text-faint focus-visible:border-brand ${FOCUS}`;

// ── Structure ────────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-[-0.015em] text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[13px] text-body">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={`rounded-card border border-line bg-surface ${padded ? "p-6" : ""} ${className}`}
    >
      {children}
    </section>
  );
}

export function CardTitle({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-4">
      <h2 className="text-[13px] font-semibold text-ink">{children}</h2>
      {aside}
    </div>
  );
}

// ── Chiffres ─────────────────────────────────────────────────────────────────

type Tone = "neutral" | "brand" | "positive" | "warning" | "danger";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-ink",
  brand: "text-brand-ink",
  positive: "text-green-700",
  warning: "text-amber-700",
  danger: "text-red-700",
};

export function StatTile({
  label,
  value,
  tone = "neutral",
  hint,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
  hint?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon size={13} strokeWidth={1.75} className="text-faint" aria-hidden />}
        <p className="text-[11px] font-semibold uppercase tracking-widest text-faint">{label}</p>
      </div>
      <p className={`mt-2.5 text-[22px] font-bold leading-none tabular-nums ${TONE_TEXT[tone]}`}>{value}</p>
      {hint && <p className="mt-2 text-[12px] text-body">{hint}</p>}
    </div>
  );
}

// ── Échelles sémantiques verrouillées ────────────────────────────────────────

const CLAIM_STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-800",
  APPROVED: "bg-green-50 text-green-800",
  REJECTED: "bg-red-50 text-red-800",
  IN_PROGRESS: "bg-blue-50 text-blue-800",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        CLAIM_STATUS_TONE[status] ?? "bg-page text-body"
      }`}
    >
      {label}
    </span>
  );
}

/**
 * Bandes de risque alignées sur les seuils configurables réels
 * (FRAUD_LEVELS : 40 flexible, 70 équilibré, 85 strict) et sur ce qu'affiche
 * la page publique. Le tableau de bord utilisait auparavant 35 et 60, deux
 * valeurs qui ne correspondaient à aucun réglage du produit.
 */
export function riskBand(score: number | null) {
  if (score === null) return null;
  if (score > 70) return { label: "Alerte", text: "text-risk-high" };
  if (score >= 40) return { label: "À surveiller", text: "text-risk-mid" };
  return { label: "Faible", text: "text-risk-low" };
}

export function RiskBadge({ score }: { score: number | null }) {
  const band = riskBand(score);
  if (!band) return <span className="text-[12px] text-faint">—</span>;
  return (
    <span className={`text-[12px] font-semibold tabular-nums ${band.text}`}>
      {score} · {band.label}
    </span>
  );
}

// ── Messages ─────────────────────────────────────────────────────────────────

const NOTICE_TONE: Record<"info" | "warning" | "danger", string> = {
  info: "bg-brand-soft text-ink",
  warning: "bg-amber-50 text-amber-900",
  danger: "bg-red-50 text-red-900",
};

export function Notice({
  tone = "info",
  icon: Icon,
  title,
  children,
  action,
}: {
  tone?: "info" | "warning" | "danger";
  icon?: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={`rounded-card p-5 ${NOTICE_TONE[tone]}`}
    >
      <div className="flex items-start gap-3">
        {Icon && <Icon size={17} strokeWidth={1.75} className="mt-px shrink-0" aria-hidden />}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">{title}</p>
          {children && <div className="mt-1.5 text-[13px] leading-relaxed">{children}</div>}
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-14 text-center">
      <span
        aria-hidden
        className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-page text-faint"
      >
        <Icon size={20} strokeWidth={1.75} />
      </span>
      <p className="text-[14px] font-semibold text-ink">{title}</p>
      {hint && <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-body">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Squelette de chargement, calé sur la forme du contenu attendu. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-control bg-page ${className}`} />;
}

// ── Pagination ───────────────────────────────────────────────────────────────

/** Fenêtre de pages autour de la page courante, avec « … » aux extrémités. */
function pageWindow(page: number, totalPages: number): (number | "gap")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const out: (number | "gap")[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(totalPages - 1, page + 1);
  if (from > 2) out.push("gap");
  for (let i = from; i <= to; i++) out.push(i);
  if (to < totalPages - 1) out.push("gap");
  out.push(totalPages);
  return out;
}

/**
 * Un pas de pagination : lien quand la page est paginée côté serveur, bouton
 * quand elle l'est en mémoire. Le reste (styles, libellés, ARIA) est commun.
 */
function PageControl({
  to,
  disabled,
  rel,
  className,
  ariaLabel,
  ariaCurrent,
  hrefFor,
  onPageChange,
  children,
}: {
  to: number;
  disabled?: boolean;
  rel?: "prev" | "next";
  className: string;
  ariaLabel?: string;
  ariaCurrent?: "page";
  hrefFor?: (page: number) => string;
  onPageChange?: (page: number) => void;
  children: React.ReactNode;
}) {
  if (hrefFor) {
    return (
      <Link
        href={hrefFor(to)}
        rel={rel}
        aria-disabled={disabled || undefined}
        aria-label={ariaLabel}
        aria-current={ariaCurrent}
        tabIndex={disabled ? -1 : undefined}
        className={className}
      >
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPageChange?.(to)}
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
      className={className}
    >
      {children}
    </button>
  );
}

/**
 * Pagination.
 *
 * Deux modes, exclusifs l'un de l'autre :
 *   · `hrefFor`      — pagination serveur. Reçoit un numéro de page et rend
 *                      l'URL, ce qui laisse à l'appelant la responsabilité de
 *                      conserver ses filtres.
 *   · `onPageChange` — pagination locale, pour une liste déjà chargée et
 *                      filtrée en mémoire. Réservé aux composants client.
 */
export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
  onPageChange,
  label = "éléments",
}: {
  page: number;
  pageSize: number;
  total: number;
  label?: string;
} & (
  | { hrefFor: (page: number) => string; onPageChange?: never }
  | { onPageChange: (page: number) => void; hrefFor?: never }
)) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  const arrow =
    `inline-flex items-center gap-1 rounded-control border border-line px-3 py-1.5 text-[12px] font-semibold transition-colors ${FOCUS}`;
  const arrowOn = `${arrow} text-ink hover:border-brand/40`;
  const arrowOff = `${arrow} pointer-events-none text-faint opacity-50`;

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4"
    >
      <p className="text-[12px] tabular-nums text-body">
        <span className="font-semibold text-ink">
          {first}–{last}
        </span>{" "}
        sur <span className="font-semibold text-ink">{total}</span> {label}
      </p>

      <div className="flex items-center gap-1">
        <PageControl
          to={Math.max(1, page - 1)}
          disabled={page <= 1}
          rel="prev"
          className={page <= 1 ? arrowOff : arrowOn}
          hrefFor={hrefFor}
          onPageChange={onPageChange}
        >
          <ChevronLeft size={14} aria-hidden />
          <span className="hidden sm:inline">Précédent</span>
        </PageControl>

        <ul className="hidden items-center gap-1 sm:flex list-none m-0 p-0">
          {pageWindow(page, totalPages).map((p, i) =>
            p === "gap" ? (
              <li key={`gap-${i}`} aria-hidden className="px-1 text-[12px] text-faint">
                …
              </li>
            ) : (
              <li key={p}>
                <PageControl
                  to={p}
                  ariaCurrent={p === page ? "page" : undefined}
                  ariaLabel={`Page ${p}`}
                  hrefFor={hrefFor}
                  onPageChange={onPageChange}
                  className={`inline-flex min-w-8 justify-center rounded-control px-2 py-1.5 text-[12px] font-semibold tabular-nums transition-colors ${FOCUS} ${
                    p === page
                      ? "bg-brand text-on-brand"
                      : "text-body hover:bg-page hover:text-ink"
                  }`}
                >
                  {p}
                </PageControl>
              </li>
            ),
          )}
        </ul>

        <span className="px-2 text-[12px] tabular-nums text-body sm:hidden">
          {page} / {totalPages}
        </span>

        <PageControl
          to={Math.min(totalPages, page + 1)}
          disabled={page >= totalPages}
          rel="next"
          className={page >= totalPages ? arrowOff : arrowOn}
          hrefFor={hrefFor}
          onPageChange={onPageChange}
        >
          <span className="hidden sm:inline">Suivant</span>
          <ChevronRight size={14} aria-hidden />
        </PageControl>
      </div>
    </nav>
  );
}

// ── Navigation ───────────────────────────────────────────────────────────────

export function NavCard({
  href,
  icon: Icon,
  title,
  hint,
  badge,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  hint: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-3.5 rounded-card border border-line bg-surface p-5 transition-colors hover:border-brand/40 ${FOCUS}`}
    >
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-ink"
      >
        <Icon size={16} strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-ink">{title}</span>
          {badge !== undefined && badge > 0 && (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold tabular-nums text-white">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-body">{hint}</span>
      </span>
      <ChevronRight
        size={16}
        aria-hidden
        className="shrink-0 text-faint transition-colors group-hover:text-brand-ink"
      />
    </Link>
  );
}
