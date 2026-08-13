"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  FileText,
  Home,
  Inbox,
  Key,
  LayoutDashboard,
  Mail,
  ShieldCheck,
} from "lucide-react";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const NAV_LINKS = [
  {
    href: "/dashboard",
    label: "Tableau de bord",
    sublabel: "Vue d’ensemble",
    Icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/dashboard/return-policy",
    label: "Politique de retour",
    sublabel: "Vos règles",
    Icon: FileText,
    exact: false,
  },
  {
    href: "/dashboard/api-keys",
    label: "Clés API",
    sublabel: "Intégration et accès",
    Icon: Key,
    exact: false,
  },
  {
    href: "/dashboard/claims",
    label: "Réclamations",
    sublabel: "Demandes clients",
    Icon: Inbox,
    exact: false,
  },
];

// Destinations publiques du site. Elles quittent l'espace vendeur : jamais
// d'état actif ici, le sidebar n'y est de toute façon pas rendu.
const SITE_LINKS = [
  { href: "/", label: "Accueil", Icon: Home },
  { href: "/docs", label: "Documentation", Icon: BookOpen },
  { href: "/contact", label: "Contact", Icon: Mail },
];

export function DashboardNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav aria-label="Navigation principale" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
      <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
        Menu
      </p>

      {NAV_LINKS.map(({ href, label, sublabel, Icon, exact }) => {
        const active = isActive(href, exact);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`group flex items-center gap-2.5 rounded-control px-3 py-2 transition-colors ${FOCUS} ${
              active ? "bg-brand-soft text-brand-ink" : "text-body hover:bg-page hover:text-ink"
            }`}
          >
            <span
              aria-hidden
              className={`flex size-6 shrink-0 items-center justify-center rounded-control transition-colors ${
                active ? "bg-brand text-on-brand" : "bg-page text-body group-hover:bg-line"
              }`}
            >
              <Icon size={13} strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
              <span
                className={`block text-[13px] leading-none ${active ? "font-semibold" : "font-medium"}`}
              >
                {label}
              </span>
              <span className="mt-1 block text-[10.5px] leading-none text-faint">{sublabel}</span>
            </span>
          </Link>
        );
      })}

      {isAdmin && (
        <>
          <div className="my-2 border-t border-line" />
          <Link
            href="/admin/vendors"
            className={`group flex items-center gap-2.5 rounded-control px-3 py-2 text-body transition-colors hover:bg-amber-50 hover:text-amber-800 ${FOCUS}`}
          >
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-control bg-page text-body transition-colors group-hover:bg-amber-100 group-hover:text-amber-700"
            >
              <ShieldCheck size={13} strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium leading-none">Panel admin</span>
              <span className="mt-1 block text-[10.5px] leading-none text-faint">
                Gestion des vendeurs
              </span>
            </span>
          </Link>
        </>
      )}

      {/* `mt-auto` colle la section au bas de la nav quand le menu est plus court
          que la colonne ; la marge s'annule d'elle-même dès que ça déborde, donc
          les liens restent atteignables au défilement. */}
      <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-3">
        <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
          Site
        </p>

        {SITE_LINKS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={`group flex items-center gap-2.5 rounded-control px-3 py-2 text-body transition-colors hover:bg-page hover:text-ink ${FOCUS}`}
          >
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-control bg-page text-body transition-colors group-hover:bg-line"
            >
              <Icon size={13} strokeWidth={1.75} />
            </span>
            <span className="min-w-0 truncate text-[13px] font-medium leading-none">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
