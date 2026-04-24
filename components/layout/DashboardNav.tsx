"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Key,
  Inbox,
  ShieldCheck,
} from "lucide-react";

const navLinks = [
  {
    href:     "/dashboard",
    label:    "Tableau de bord",
    sublabel: "Vue d'ensemble",
    Icon:     LayoutDashboard,
    exact:    true,
  },
  {
    href:     "/dashboard/return-policy",
    label:    "Politique de retours",
    sublabel: "Règles de remboursement",
    Icon:     FileText,
    exact:    false,
  },
  {
    href:     "/dashboard/api-keys",
    label:    "Clés API",
    sublabel: "Intégration & accès",
    Icon:     Key,
    exact:    false,
  },
  {
    href:     "/dashboard/claims",
    label:    "Réclamations",
    sublabel: "Demandes clients",
    Icon:     Inbox,
    exact:    false,
  },
];

export function DashboardNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-1.5">
        Menu
      </p>

      {navLinks.map(({ href, label, sublabel, Icon, exact }) => {
        const active = isActive(href, exact);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group ${
              active
                ? "bg-indigo-50 text-indigo-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <div
              className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                active ? "bg-indigo-100" : "bg-gray-100 group-hover:bg-gray-200"
              }`}
            >
              <Icon size={13} className={active ? "text-indigo-600" : "text-gray-500"} />
            </div>
            <div className="min-w-0">
              <p className={`text-sm leading-none ${active ? "font-semibold" : "font-medium"}`}>
                {label}
              </p>
              <p className="text-xs text-gray-400 mt-0.5 leading-none">{sublabel}</p>
            </div>
            {active && (
              <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
            )}
          </Link>
        );
      })}

      {isAdmin && (
        <>
          <div className="my-2 border-t border-gray-100" />
          <Link
            href="/admin/vendors"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-600 hover:bg-orange-50 hover:text-orange-700 transition-colors group"
          >
            <div className="w-6 h-6 rounded-md bg-gray-100 group-hover:bg-orange-100 flex items-center justify-center shrink-0">
              <ShieldCheck size={13} className="text-gray-500 group-hover:text-orange-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium leading-none">Panel Admin</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-none">Gestion des vendeurs</p>
            </div>
          </Link>
        </>
      )}
    </nav>
  );
}
