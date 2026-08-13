"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { signOut } from "next-auth/react";
import { ChevronDown, LayoutDashboard, Menu, X } from "lucide-react";

/** Ce que la nav a besoin de connaître de la session. Volontairement minimal :
 *  la nav est rendue sur des pages publiques, on n'y fait transiter ni rôle
 *  ni identifiant vendeur. */
export type NavUser = {
  name?: string | null;
  email?: string | null;
};

/** « Salim Fardeheb » → « SF ». Repli sur l'email, puis sur « ? ». */
function initials(user: NavUser): string {
  const source = user.name?.trim() || user.email?.trim() || "";
  if (!source) return "?";
  const parts = source.split(/[\s.@_-]+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]);
  return letters.join("").toUpperCase() || "?";
}

const ACCOUNT_LINKS = [
  { label: "Tableau de bord", href: "/dashboard" },
  { label: "Réclamations", href: "/dashboard/claims" },
  { label: "Politique de retour", href: "/dashboard/return-policy" },
  { label: "Clés API", href: "/dashboard/api-keys" },
];

// Anneau de focus partagé : aucun élément interactif de la landing n'en sort.
const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const NAV_LINK = `text-sm font-medium text-body hover:text-ink transition-colors rounded-control ${FOCUS}`;

const DRAWER_LINK = `block px-3 py-3 text-sm font-medium text-body hover:bg-brand-soft hover:text-ink rounded-control transition-colors no-underline ${FOCUS}`;

// « Se connecter » sort du lot des liens de navigation : c'est une action de
// compte, pas une destination du site. Contour discret pour la distinguer sans
// concurrencer le bouton principal, qui reste le seul en aplat de marque.
const NAV_BTN_GHOST = `text-sm font-semibold text-ink bg-surface border border-line px-4 py-2 rounded-control hover:border-brand/40 active:translate-y-px transition-[border-color,transform] whitespace-nowrap ${FOCUS}`;

const NAV_BTN_PRIMARY = `bg-brand text-on-brand text-sm font-semibold px-4 py-2 rounded-control hover:bg-brand-dark active:translate-y-px transition-[background-color,transform] whitespace-nowrap ${FOCUS}`;

function LogoLockup({ compact = false }: { compact?: boolean }) {
  return (
    <Image
      src="/logos/logo-lockup.svg"
      alt="Flowmerce"
      // Ratio du SVG : 320x64, soit 5:1. Toute taille doit le respecter.
      width={compact ? 150 : 180}
      height={compact ? 30 : 36}
      priority={!compact}
    />
  );
}

/** Avatar + menu de compte. Rendu uniquement quand une session existe. */
function AccountMenu({ user }: { user: NavUser }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Fermeture au clic extérieur et à Échap : un menu qui reste ouvert derrière
  // le reste de la page est un piège au clavier comme à la souris.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Compte de ${user.name || user.email || "l’utilisateur"}`}
        className={`flex items-center gap-2 rounded-control border border-line bg-surface py-1.5 pl-1.5 pr-2.5 transition-colors hover:border-brand/40 ${FOCUS}`}
      >
        <span
          aria-hidden
          className="flex size-7 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-on-brand"
        >
          {initials(user)}
        </span>
        <ChevronDown
          size={15}
          strokeWidth={2}
          aria-hidden
          className={`text-body transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Menu du compte"
          className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-card border border-line bg-surface shadow-xl shadow-ink/10"
        >
          <div className="border-b border-line px-4 py-3">
            {user.name && (
              <p className="truncate text-[13px] font-bold text-ink">{user.name}</p>
            )}
            {user.email && (
              <p className="truncate text-xs text-body">{user.email}</p>
            )}
          </div>

          <div className="p-1.5">
            {ACCOUNT_LINKS.map((l, i) => (
              <Link
                key={l.href}
                href={l.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 rounded-control px-2.5 py-2 text-[13px] font-medium text-body transition-colors hover:bg-brand-soft hover:text-ink ${FOCUS}`}
              >
                {i === 0 && <LayoutDashboard size={15} strokeWidth={1.75} aria-hidden />}
                <span className={i === 0 ? "" : "pl-5.75"}>{l.label}</span>
              </Link>
            ))}
          </div>

          <div className="border-t border-line p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => signOut({ callbackUrl: "/" })}
              className={`w-full rounded-control px-2.5 py-2 text-left text-[13px] font-medium text-body transition-colors hover:bg-red-50 hover:text-red-700 ${FOCUS}`}
            >
              Se déconnecter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function LandingNav({ user = null }: { user?: NavUser | null }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav className="fixed top-0 inset-x-0 z-50 h-16 bg-haze/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between">

          <Link href="/" className={`flex items-center shrink-0 no-underline rounded-control ${FOCUS}`}>
            <LogoLockup />
          </Link>

          <div className="hidden md:flex items-center gap-6 shrink-0">
            <Link href="/" className={NAV_LINK}>
              Accueil
            </Link>
            {/* Ancres préfixées par « / » : depuis /contact ou /docs, un simple
                « #tarifs » ne pointerait sur rien. */}
            <Link href="/#tarifs" className={NAV_LINK}>
              Tarifs
            </Link>
            <Link href="/docs" className={NAV_LINK}>
              Documentation
            </Link>
            <Link href="/contact" className={NAV_LINK}>
              Contact
            </Link>

            {/* Sépare les destinations du site des actions de compte. */}
            <span aria-hidden className="h-5 w-px bg-line" />

            <div className="flex items-center gap-2">
              {user ? (
                <AccountMenu user={user} />
              ) : (
                <>
                  <Link href="/auth/login" className={NAV_BTN_GHOST}>
                    Se connecter
                  </Link>
                  <Link href="/auth/register" className={NAV_BTN_PRIMARY}>
                    Commencer gratuitement
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="flex md:hidden items-center gap-2 shrink-0">
            {user ? (
              <Link
                href="/dashboard"
                aria-label="Tableau de bord"
                className={`flex size-9 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-on-brand ${FOCUS}`}
              >
                {initials(user)}
              </Link>
            ) : (
              <Link
                href="/auth/register"
                className={`bg-brand text-on-brand text-xs font-semibold px-3 py-2 rounded-control hover:bg-brand-dark active:translate-y-px transition-[background-color,transform] whitespace-nowrap ${FOCUS}`}
              >
                Commencer
              </Link>
            )}
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Ouvrir le menu"
              aria-expanded={open}
              aria-controls="landing-drawer"
              className={`size-10 flex items-center justify-center rounded-control border border-line bg-surface/60 text-body hover:bg-surface transition-colors ${FOCUS}`}
            >
              <Menu size={20} strokeWidth={1.75} />
            </button>
          </div>

        </div>
      </nav>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink/30 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <div
        id="landing-drawer"
        inert={!open}
        className={`fixed top-0 right-0 z-50 h-full w-72 bg-surface shadow-2xl flex flex-col transition-transform duration-200 ease-out md:hidden ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 h-16 border-b border-line shrink-0">
          <LogoLockup compact />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fermer le menu"
            className={`size-9 flex items-center justify-center rounded-control text-body hover:bg-brand-soft transition-colors ${FOCUS}`}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex flex-col px-4 py-3 gap-0.5 flex-1">
          <Link href="/" onClick={() => setOpen(false)} className={DRAWER_LINK}>
            Accueil
          </Link>
          <Link href="/#etapes" onClick={() => setOpen(false)} className={DRAWER_LINK}>
            Comment ça marche
          </Link>
          <Link href="/#plateforme" onClick={() => setOpen(false)} className={DRAWER_LINK}>
            La plateforme
          </Link>
          <Link href="/#tarifs" onClick={() => setOpen(false)} className={DRAWER_LINK}>
            Tarifs
          </Link>
          <Link href="/docs" onClick={() => setOpen(false)} className={DRAWER_LINK}>
            Documentation
          </Link>
          <Link href="/contact" onClick={() => setOpen(false)} className={DRAWER_LINK}>
            Contact
          </Link>
        </div>

        <div className="px-4 pb-8 pt-4 flex flex-col gap-2 border-t border-line shrink-0">
          {user ? (
            <>
              <div className="flex items-center gap-3 px-1 pb-2">
                <span
                  aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-on-brand"
                >
                  {initials(user)}
                </span>
                <span className="min-w-0">
                  {user.name && (
                    <span className="block truncate text-[13px] font-bold text-ink">
                      {user.name}
                    </span>
                  )}
                  {user.email && (
                    <span className="block truncate text-xs text-body">{user.email}</span>
                  )}
                </span>
              </div>
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className={`w-full bg-brand text-on-brand text-sm font-semibold px-4 py-3 rounded-control hover:bg-brand-dark active:translate-y-px transition-[background-color,transform] text-center ${FOCUS}`}
              >
                Tableau de bord
              </Link>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/" })}
                className={`w-full text-sm font-medium text-body hover:text-red-700 hover:bg-red-50 px-4 py-3 rounded-control transition-colors text-center border border-line ${FOCUS}`}
              >
                Se déconnecter
              </button>
            </>
          ) : (
            <>
              <Link
                href="/auth/register"
                onClick={() => setOpen(false)}
                className={`w-full bg-brand text-on-brand text-sm font-semibold px-4 py-3 rounded-control hover:bg-brand-dark active:translate-y-px transition-[background-color,transform] text-center ${FOCUS}`}
              >
                Commencer gratuitement
              </Link>
              <Link
                href="/auth/login"
                onClick={() => setOpen(false)}
                className={`w-full text-sm font-medium text-body hover:text-ink hover:bg-brand-soft px-4 py-3 rounded-control transition-colors text-center border border-line ${FOCUS}`}
              >
                Se connecter
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}
