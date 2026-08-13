import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { DocsTabs } from "@/components/docs/DocsTabs";
import {
  BadgeCheck,
  Bell,
  Code2,
  FileText,
  GitBranch,
  KeyRound,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Documentation marchand | Flowmerce",
  description:
    "Mettre Flowmerce en place sans développeur : compte, politique de retour, mode de validation, seuil de fraude et traitement des réclamations.",
};

const STROKE = 1.75;

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

// Chaque étape correspond à un écran réel du tableau de bord. Les valeurs
// citées sont les valeurs par défaut du schéma Prisma.
const STEPS = [
  {
    icon: UserPlus,
    title: "Créez votre compte",
    time: "2 minutes",
    body: "Inscription par email, sans carte bancaire. Vous arrivez directement sur votre tableau de bord.",
    link: { label: "Créer mon compte", href: "/auth/register" },
  },
  {
    icon: BadgeCheck,
    title: "Faites valider votre boutique",
    time: "vérification manuelle",
    body: "Déposez les pièces justificatives de votre activité. Tant que la validation est en attente, vous pouvez tout configurer, mais les réclamations réelles n’arrivent qu’une fois la boutique approuvée.",
  },
  {
    icon: SlidersHorizontal,
    title: "Écrivez votre politique de retour",
    time: "l’étape qui compte",
    body: "Délai d’acceptation (14 jours par défaut), résolutions autorisées parmi échange, remboursement et réparation, motifs acceptés, catégories en échange seul ou non remboursables. Aucune décision, même automatique, ne sortira de ce cadre.",
    link: { label: "Ouvrir la politique de retour", href: "/dashboard/return-policy" },
  },
  {
    icon: GitBranch,
    title: "Choisissez qui tranche",
    time: "réversible à tout moment",
    body: "En validation manuelle, réglage par défaut, chaque dossier attend votre clic. En approbation automatique, Flowmerce applique sa recommandation quand elle respecte votre politique. Commencez en manuel, basculez quand vous aurez vu le modèle travailler.",
  },
  {
    icon: ShieldCheck,
    title: "Réglez votre tolérance à la fraude",
    time: "trois niveaux",
    body: "Le seuil d’alerte se choisit entre 40 en mode flexible, 70 en équilibré (recommandé, valeur par défaut) et 85 en strict. Une alerte se déclenche aussi au-delà de 4 retours pour un même client.",
  },
  {
    icon: KeyRound,
    title: "Générez votre clé API",
    time: "à transmettre à votre développeur",
    body: "C’est elle qui relie vos commandes à Flowmerce. Cinq clés actives maximum, et la valeur complète ne s’affiche qu’une seule fois à la création : copiez-la tout de suite.",
    link: { label: "Générer une clé", href: "/dashboard/api-keys" },
  },
];

const DAILY = [
  {
    icon: FileText,
    title: "Le dossier arrive instruit",
    body: "Pour chaque réclamation : le motif du client, la confrontation à votre politique, le score de risque et la résolution proposée. Vous n’avez plus à reconstituer l’historique.",
  },
  {
    icon: GitBranch,
    title: "Vous tranchez, ou pas",
    body: "Vous suivez la recommandation, vous choisissez une autre résolution, ou vous refusez. En approbation automatique, seuls les dossiers hors politique remontent vers vous.",
  },
  {
    icon: Bell,
    title: "Le client est prévenu",
    body: "Chaque décision part par email au client, et reste horodatée dans l’historique de la réclamation en cas de litige.",
  },
];

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border border-line bg-surface p-5 sm:p-6 ${className}`}>
      {children}
    </div>
  );
}

export default function DocsMerchantPage() {
  return (
    <div className="min-h-dvh bg-page text-ink font-sans">
      <SiteHeader />

      <section className="px-4 sm:px-6 pt-28 pb-10 sm:pt-32">
        <div className="max-w-4xl mx-auto">
          <DocsTabs active="marchand" />
          <h1 className="mt-8 text-4xl sm:text-5xl font-extrabold tracking-[-0.03em] leading-[1.05] text-ink">
            Mettre Flowmerce en place,
            <br />
            <span className="text-brand-ink">sans écrire une ligne de code.</span>
          </h1>
          <p className="mt-5 text-[15px] text-body leading-relaxed max-w-xl">
            Tout ce que vous réglez vous-même depuis votre tableau de bord, et le
            seul point où vous aurez besoin de votre développeur.
          </p>
        </div>
      </section>

      <main className="px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="max-w-4xl mx-auto space-y-16">

          {/* Ce que vous faites seul, ce qui demande un développeur */}
          <section>
            <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-ink mb-2">
              Qui fait quoi
            </h2>
            <p className="text-[15px] text-body leading-relaxed mb-6 max-w-2xl">
              Soyons clairs dès le départ : la configuration se fait entièrement sans
              développeur, mais la connexion entre votre boutique et Flowmerce demande
              un appel technique, une seule fois.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <h3 className="text-sm font-bold text-ink mb-3">Vous, depuis le tableau de bord</h3>
                <ul className="space-y-2 text-[13px] text-body list-none p-0">
                  {[
                    "Écrire la politique de retour",
                    "Choisir manuel ou automatique",
                    "Régler le seuil de fraude",
                    "Générer la clé API",
                    "Traiter les réclamations au quotidien",
                  ].map((t) => (
                    <li key={t} className="flex gap-2">
                      <span aria-hidden className="text-brand-ink">•</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="bg-brand-soft border-brand/20">
                <h3 className="text-sm font-bold text-ink mb-3">
                  Votre développeur, une seule fois
                </h3>
                <ul className="space-y-2 text-[13px] text-body list-none p-0">
                  {[
                    "Poser la clé API côté serveur",
                    "Envoyer les demandes de retour à Flowmerce",
                    "Ou générer le lien vers le portail hébergé",
                  ].map((t) => (
                    <li key={t} className="flex gap-2">
                      <span aria-hidden className="text-brand-ink">•</span>
                      {t}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/docs/developpeurs"
                  className={`mt-4 inline-flex items-center gap-2 text-[13px] font-semibold text-brand-ink hover:underline rounded-control ${FOCUS}`}
                >
                  <Code2 size={15} strokeWidth={STROKE} aria-hidden />
                  La page à lui transmettre
                </Link>
              </Card>
            </div>

            <p className="mt-4 text-[13px] text-faint leading-relaxed">
              Si vous n’avez personne sous la main, écrivez-nous : la mise en relation
              avec la boutique se fait en un appel technique court.{" "}
              <Link href="/contact" className={`font-semibold text-brand-ink hover:underline rounded-control ${FOCUS}`}>
                Nous contacter
              </Link>
            </p>
          </section>

          {/* Les étapes */}
          <section>
            <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-ink mb-6">
              La mise en place, étape par étape
            </h2>

            <ol className="space-y-3 list-none p-0">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <li key={s.title}>
                    <Card>
                      <div className="flex gap-4">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-ink">
                          <Icon size={18} strokeWidth={STROKE} aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <h3 className="text-[15px] font-bold text-ink">
                              <span className="text-faint tabular-nums">
                                {String(i + 1).padStart(2, "0")}
                              </span>{" "}
                              {s.title}
                            </h3>
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                              {s.time}
                            </span>
                          </div>
                          <p className="mt-2 text-[14px] text-body leading-relaxed">{s.body}</p>
                          {s.link && (
                            <Link
                              href={s.link.href}
                              className={`mt-3 inline-flex text-[13px] font-semibold text-brand-ink hover:underline rounded-control ${FOCUS}`}
                            >
                              {s.link.label}
                            </Link>
                          )}
                        </div>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* Au quotidien */}
          <section>
            <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-ink mb-2">
              Une fois en place
            </h2>
            <p className="text-[15px] text-body leading-relaxed mb-6 max-w-2xl">
              Votre travail se réduit à arbitrer des dossiers déjà instruits.
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
              {DAILY.map((d) => {
                const Icon = d.icon;
                return (
                  <Card key={d.title}>
                    <Icon size={18} strokeWidth={STROKE} className="text-brand-ink mb-3" aria-hidden />
                    <h3 className="text-sm font-bold text-ink mb-2">{d.title}</h3>
                    <p className="text-[13px] text-body leading-relaxed">{d.body}</p>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* Sécurité de la clé */}
          <section>
            <Card className="border-brand/30">
              <h2 className="text-[15px] font-bold text-ink mb-2">
                Une seule règle de sécurité à retenir
              </h2>
              <p className="text-[14px] text-body leading-relaxed max-w-2xl">
                Votre clé API ne doit jamais apparaître dans une page web, un email ou une
                capture d’écran. Elle se pose uniquement sur le serveur de votre boutique.
                Si vous pensez qu’elle a fuité, révoquez-la depuis le tableau de bord et
                générez-en une nouvelle : l’ancienne cesse immédiatement de fonctionner.
              </p>
            </Card>
          </section>

          {/* CTA */}
          <section className="rounded-block bg-deep px-6 py-12 text-center">
            <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-white mb-3">
              Prêt à configurer votre boutique ?
            </h2>
            <p className="text-[14px] text-white/70 leading-relaxed max-w-md mx-auto mb-7">
              La politique de retour et le mode de validation se règlent en quelques
              minutes, avant même d’avoir branché quoi que ce soit.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/auth/register"
                className={`inline-flex items-center justify-center rounded-control bg-white px-5 py-3 text-sm font-semibold text-deep transition-[background-color,transform] hover:bg-white/90 active:translate-y-px ${FOCUS}`}
              >
                Commencer gratuitement
              </Link>
              <Link
                href="/docs/developpeurs"
                className={`inline-flex items-center justify-center rounded-control border border-white/30 px-5 py-3 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-white/10 active:translate-y-px ${FOCUS}`}
              >
                Documentation technique
              </Link>
            </div>
          </section>

        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
