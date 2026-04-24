"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Store, LayoutDashboard } from "lucide-react";

const adminLinks = [
  {
    href: "/admin/vendors",
    label: "Inscriptions",
    sublabel: "Demandes & documents",
    Icon: ClipboardList,
  },
  {
    href: "/admin/clients",
    label: "Boutiques",
    sublabel: "Vendeurs approuvés",
    Icon: Store,
  },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-1.5">
        Gestion
      </p>

      {adminLinks.map(({ href, label, sublabel, Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group ${
              active
                ? "bg-orange-50 text-orange-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <div
              className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                active ? "bg-orange-100" : "bg-gray-100 group-hover:bg-gray-200"
              }`}
            >
              <Icon
                size={13}
                className={active ? "text-orange-600" : "text-gray-500"}
              />
            </div>
            <div className="min-w-0">
              <p className={`text-sm leading-none ${active ? "font-semibold" : "font-medium"}`}>
                {label}
              </p>
              <p className="text-xs text-gray-400 mt-0.5 leading-none">{sublabel}</p>
            </div>
            {active && (
              <div className="ml-auto w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
            )}
          </Link>
        );
      })}

      <div className="my-2 border-t border-gray-100" />

      <Link
        href="/dashboard"
        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors group"
      >
        <div className="w-6 h-6 rounded-md bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center shrink-0">
          <LayoutDashboard size={13} className="text-gray-400" />
        </div>
        Espace vendeur
      </Link>
    </nav>
  );
}
