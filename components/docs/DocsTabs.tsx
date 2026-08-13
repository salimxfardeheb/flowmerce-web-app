import Link from "next/link";
import { Code2, Store } from "lucide-react";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const TABS = [
  { key: "marchand", href: "/docs", label: "Marchand", icon: Store },
  { key: "developpeurs", href: "/docs/developpeurs", label: "Développeur", icon: Code2 },
] as const;

/**
 * Bascule entre les deux documentations. Deux publics, deux pages : le marchand
 * qui configure sa boutique n'a pas à traverser des exemples de code, et le
 * développeur n'a pas à relire le mode d'emploi du tableau de bord.
 */
export function DocsTabs({ active }: { active: "marchand" | "developpeurs" }) {
  return (
    <nav aria-label="Documentation" className="inline-flex gap-1 rounded-control border border-line bg-surface p-1">
      {TABS.map((t) => {
        const Icon = t.icon;
        const current = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={current ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded-control px-3.5 py-2 text-[13px] font-semibold transition-colors ${FOCUS} ${
              current
                ? "bg-brand text-on-brand"
                : "text-body hover:text-ink"
            }`}
          >
            <Icon size={15} strokeWidth={1.75} aria-hidden />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
