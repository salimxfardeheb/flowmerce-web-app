import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ContactForm } from "@/components/contact/ContactForm";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { CONTACT, whatsappUrl } from "@/lib/contact";
import { BookOpen, Clock, Mail, MessageCircle, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact | Flowmerce",
  description:
    "Une question sur Flowmerce, le réseau anti-fraude ou l’intégration API ? Écrivez-nous.",
};

const STROKE = 1.75;

const LINK_BTN =
  "inline-flex items-center gap-2 rounded-control border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition-[border-color,transform] hover:border-brand/40 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const POINTS = [
  {
    icon: Clock,
    title: "Réponse sous un jour ouvré",
    desc: "Nous répondons directement à l’adresse que vous indiquez.",
  },
  {
    icon: ShieldCheck,
    title: "Rien n’est publié",
    desc: "Votre message part dans notre boîte, il n’alimente aucun réseau ni aucun score.",
  },
  {
    icon: BookOpen,
    title: "Question technique ?",
    desc: "La documentation couvre déjà l’API, les clés et le format des réponses.",
  },
];

export default function ContactPage() {
  return (
    // `flex flex-col` + `flex-1` sur main : sur un écran plus haut que le
    // contenu, le pied de page est poussé en bas au lieu de flotter au milieu.
    <div className="min-h-dvh flex flex-col bg-page text-ink font-sans">
      <SiteHeader />

      <main className="flex-1 flex px-4 sm:px-6 pt-28 pb-16 sm:pt-32 sm:pb-24">
        {/* `m-auto` plutôt que `items-center` : quand le contenu dépasse la
            hauteur disponible (mobile), les marges auto tombent à zéro au lieu
            de rendre le haut du bloc inatteignable. */}
        <div className="w-full max-w-5xl m-auto grid lg:grid-cols-12 gap-10 lg:gap-14">

          <div className="lg:col-span-5">
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-[-0.03em] leading-[1.05] text-ink">
              Parlons de vos retours.
            </h1>
            <p className="mt-5 text-[15px] text-body leading-relaxed max-w-md">
              Une question sur le réseau anti-fraude, la politique de retour ou
              l’intégration API ? Écrivez-nous, une personne vous répond.
            </p>

            <ul className="mt-8 space-y-5 list-none p-0">
              {POINTS.map((p) => {
                const Icon = p.icon;
                return (
                  <li key={p.title} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-ink">
                      <Icon size={16} strokeWidth={STROKE} aria-hidden />
                    </span>
                    <span>
                      <span className="block text-[14px] font-bold text-ink">{p.title}</span>
                      <span className="block text-[13px] text-body leading-relaxed">
                        {p.desc}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="mt-8 border-t border-line pt-6">
              <p className="text-[13px] font-semibold text-ink mb-3">
                Ou directement
              </p>
              <div className="flex flex-wrap gap-2">
                {whatsappUrl && (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={LINK_BTN}
                  >
                    <MessageCircle size={16} strokeWidth={STROKE} aria-hidden />
                    WhatsApp
                  </a>
                )}
                <a href={`mailto:${CONTACT.email}`} className={LINK_BTN}>
                  <Mail size={16} strokeWidth={STROKE} aria-hidden />
                  {CONTACT.email}
                </a>
              </div>
            </div>

            <Link
              href="/docs"
              className="mt-8 inline-flex text-sm font-semibold text-brand-ink hover:underline rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Lire la documentation
            </Link>
          </div>

          <div className="lg:col-span-7">
            <ContactForm />
          </div>

        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
