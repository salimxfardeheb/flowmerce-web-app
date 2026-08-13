"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function SidebarShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Le tiroir fermé est translaté hors écran mais reste tabulable. On le neutralise
  // avec `inert`, et uniquement sous md.
  //
  // Surtout pas via `invisible` / `md:visible` : `visibility: hidden` conserve la
  // boîte de l'élément en masquant son contenu, donc la moindre feuille de style
  // périmée produit une colonne de 16rem parfaitement vide sur grand écran.
  // `inert` ne touche pas à l'affichage : il ne peut pas faire disparaître
  // le sidebar, quoi qu'il arrive au CSS.
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767.98px)");
    const sync = () => setIsCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    // `h-dvh` + `overflow-hidden` : la coquille occupe exactement la hauteur de
    // l'écran et ne défile pas. Le sidebar, étiré par le flex, fait donc
    // toujours la hauteur de la fenêtre, et seul le contenu principal défile.
    <div className="flex h-dvh overflow-hidden bg-page text-ink font-sans">
      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink/30 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        id="dashboard-sidebar"
        inert={isCompact && !open ? true : undefined}
        className={`fixed md:static inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-line bg-surface transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Fermer le menu"
          className={`absolute right-3 top-3 rounded-control p-1.5 text-body transition-colors hover:bg-brand-soft hover:text-ink md:hidden ${FOCUS}`}
        >
          <X size={18} aria-hidden />
        </button>
        {sidebar}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Ouvrir le menu"
            aria-expanded={open}
            aria-controls="dashboard-sidebar"
            className={`rounded-control p-1.5 text-body transition-colors hover:bg-brand-soft hover:text-ink ${FOCUS}`}
          >
            <Menu size={20} aria-hidden />
          </button>
        </div>

        {/* `min-h-0` est indispensable : un élément flex garde `min-height: auto`
            par défaut, donc `flex-1` seul le laisse grandir à la hauteur de son
            contenu au lieu de défiler. Combiné à l'`overflow-hidden` de la
            coquille, le débordement devenait invisible et inatteignable. */}
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
