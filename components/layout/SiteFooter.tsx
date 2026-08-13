import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Facebook, Instagram } from "lucide-react";
import { SOCIALS } from "@/lib/contact";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const FOOTER_LINK = `text-[13px] text-body hover:text-ink transition-colors rounded-control ${FOCUS}`;

// Les liens de la barre de navigation, repris à l'identique.
const NAV_LINKS = [
  { label: "Accueil", href: "/" },
  { label: "Tarifs", href: "/#tarifs" },
  { label: "Documentation", href: "/docs" },
  { label: "Contact", href: "/contact" },
];

// `href: null` = page pas encore écrite. On affiche l'entrée avec la mention
// « bientôt » plutôt qu'un lien mort : un 404 depuis son propre pied de page
// coûte plus cher en confiance qu'une promesse assumée.
const COMPANY_LINKS: { label: string; href: string | null }[] = [
  { label: "Ce que nous proposons", href: "/#plateforme" },
  { label: "À propos de nous", href: null },
  { label: "Carrières", href: null },
];

// lucide ne fournit ni TikTok ni WhatsApp. Tracés officiels Simple Icons :
// une marque déposée ne s'approxime pas avec une icône générique.
function BrandIcon({ path, size = 16 }: { path: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}

const TIKTOK_PATH =
  "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z";

const WHATSAPP_PATH =
  "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z";

const SOCIAL_ICONS: Record<string, React.ReactNode> = {
  Instagram: <Instagram size={16} strokeWidth={1.75} aria-hidden />,
  Facebook: <Facebook size={16} strokeWidth={1.75} aria-hidden />,
  TikTok: <BrandIcon path={TIKTOK_PATH} />,
  WhatsApp: <BrandIcon path={WHATSAPP_PATH} />,
};

// `span` est obligatoire : sans lui, la colonne retombe sur 1/12 de la grille
// et les libellés se cassent sur quatre lignes.
function FooterColumn({
  title,
  span,
  children,
}: {
  title: string;
  span: string;
  children: React.ReactNode;
}) {
  return (
    <div className={span}>
      <h2 className="text-[13px] font-bold text-ink mb-4">{title}</h2>
      {children}
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="px-4 sm:px-6 pb-10">
      <div className="max-w-6xl mx-auto border-t border-line pt-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-12 lg:gap-8">

          <div className="lg:col-span-4">
            <Link
              href="/"
              className={`inline-flex no-underline rounded-control ${FOCUS}`}
            >
              <Image src="/logos/logo-lockup.svg" alt="Flowmerce" width={175} height={35} />
            </Link>
            <p className="mt-4 text-[13px] text-body leading-relaxed max-w-xs">
              Décisions de retour automatisées, et un réseau anti-fraude partagé
              entre boutiques algériennes.
            </p>

            {/* Les quatre réseaux sont toujours affichés. Ceux dont l'URL n'est
                pas encore renseignée sont rendus inertes et estompés, plutôt
                que masqués : la rangée reste cohérente sans lien mort. */}
            <ul className="mt-6 flex gap-2 list-none p-0">
              {SOCIALS.map((s) =>
                s.url ? (
                  <li key={s.name}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={s.name}
                      className={`flex size-9 items-center justify-center rounded-control border border-line bg-surface text-body transition-colors hover:border-brand/40 hover:text-brand-ink ${FOCUS}`}
                    >
                      {SOCIAL_ICONS[s.name]}
                    </a>
                  </li>
                ) : (
                  <li key={s.name}>
                    <span
                      aria-label={`${s.name} (bientôt)`}
                      title={`${s.name} : compte à venir`}
                      className="flex size-9 items-center justify-center rounded-control border border-dashed border-line bg-surface/50 text-faint"
                    >
                      {SOCIAL_ICONS[s.name]}
                    </span>
                  </li>
                ),
              )}
            </ul>
          </div>

          <FooterColumn title="Navigation" span="lg:col-span-2">
            <ul className="space-y-2.5 list-none p-0">
              {NAV_LINKS.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className={FOOTER_LINK}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </FooterColumn>

          <FooterColumn title="Entreprise" span="lg:col-span-3">
            <ul className="space-y-2.5 list-none p-0">
              {COMPANY_LINKS.map((l) => (
                <li key={l.label}>
                  {l.href ? (
                    <Link href={l.href} className={FOOTER_LINK}>
                      {l.label}
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-2 text-[13px] text-faint">
                      {l.label}
                      <span className="rounded-full border border-line px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">
                        Bientôt
                      </span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </FooterColumn>

          <div className="sm:col-span-2 lg:col-span-3">
            <h2 className="text-[13px] font-bold text-ink mb-4">Newsletter</h2>
            <p className="mb-4 text-[13px] text-body leading-relaxed">
              Les nouveautés produit et les évolutions du réseau anti-fraude.
              Pas plus d’un email par mois.
            </p>

            {/* Maquette statique : le champ et le bouton sont inertes tant que
                la collecte n’est pas branchée. Bouton en `type="button"` pour
                qu’un clic ne recharge pas la page via une soumission vide. */}
            <label htmlFor="nl-email" className="sr-only">
              Votre adresse email
            </label>
            <div className="flex gap-2">
              <input
                id="nl-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="vous@boutique.dz"
                className={`min-w-0 flex-1 rounded-control border border-line bg-surface px-3 py-2.5 text-[14px] text-ink placeholder:text-faint focus-visible:border-brand ${FOCUS}`}
              />
              <button
                type="button"
                aria-label="S’inscrire à la newsletter"
                className={`inline-flex shrink-0 items-center justify-center rounded-control bg-brand px-3.5 py-2.5 text-on-brand transition-[background-color,transform] hover:bg-brand-dark active:translate-y-px ${FOCUS}`}
              >
                <ArrowRight size={16} strokeWidth={2} aria-hidden />
              </button>
            </div>
            <p className="mt-2 text-xs text-faint">Inscription bientôt ouverte.</p>
          </div>

        </div>

        <div className="mt-12 border-t border-line pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-faint">
          <p>© 2026 Flowmerce. Tous droits réservés.</p>
          <p>Conçu pour le commerce algérien</p>
        </div>
      </div>
    </footer>
  );
}
