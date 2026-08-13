import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/**
 * Coquille commune aux pages de connexion et d'inscription.
 *
 * La barre du haut est rendue à toutes les tailles d'écran : le panneau latéral
 * est masqué sous `sm`, et c'était jusqu'ici le seul chemin de retour vers le
 * site. Sur mobile, on entrait dans l'inscription sans pouvoir en ressortir
 * autrement que par le bouton précédent du navigateur.
 */
export function AuthShell({
  eyebrow,
  title,
  subtitle,
  aside,
  footer,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  aside: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-page text-ink font-sans flex flex-col">

      <header className="px-4 sm:px-6 py-4">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4">
          <Link href="/" className={`inline-flex rounded-control ${FOCUS}`}>
            <Image
              src="/logos/logo-lockup.svg"
              alt="Flowmerce"
              width={150}
              height={30}
              priority
            />
          </Link>
          <Link
            href="/"
            className={`inline-flex items-center gap-1.5 rounded-control px-2 py-1.5 text-[13px] font-semibold text-body transition-colors hover:text-ink ${FOCUS}`}
          >
            <ArrowLeft size={15} strokeWidth={2} aria-hidden />
            Retour au site
          </Link>
        </div>
      </header>

      <main className="flex flex-1 px-4 sm:px-6 pb-10">
        <div className="m-auto w-full max-w-4xl">
          <div className="overflow-hidden rounded-card border border-line bg-surface shadow-sm shadow-ink/5 sm:flex">

            <aside className="hidden shrink-0 flex-col bg-deep p-8 sm:flex sm:w-64 md:w-72">
              {aside}
            </aside>

            <div className="flex-1 p-6 sm:p-10">
              <div className="mb-7">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-ink">
                  {eyebrow}
                </p>
                <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-ink">{title}</h1>
                <p className="mt-1 text-[14px] text-body">{subtitle}</p>
              </div>

              {children}
            </div>
          </div>

          <p className="mt-5 text-center text-[14px] text-body">{footer}</p>
        </div>
      </main>
    </div>
  );
}

/** Champs et libellés partagés : libellé au-dessus, aide en dessous. */
export const AUTH_LABEL = "mb-2 block text-[13px] font-semibold text-ink";

export const AUTH_INPUT =
  `w-full rounded-control border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-faint focus-visible:border-brand ${FOCUS}`;

export const AUTH_BTN_PRIMARY =
  `inline-flex items-center justify-center gap-2 rounded-control bg-brand px-5 py-3 text-sm font-semibold text-on-brand transition-[background-color,transform] hover:bg-brand-dark active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;

export const AUTH_BTN_GHOST =
  `inline-flex items-center justify-center gap-2 rounded-control border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink transition-[border-color,transform] hover:border-brand/40 active:translate-y-px disabled:opacity-50 ${FOCUS}`;

export const AUTH_LINK =
  `font-semibold text-brand-ink hover:underline rounded-control ${FOCUS}`;
