import Link from "next/link";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { whatsappUrl } from "@/lib/contact";
import {
  BellRing,
  Check,
  GitBranch,
  Gauge,
  History,
  Inbox,
  Link2,
  Mail,
  MessageCircle,
  PanelsTopLeft,
  Plus,
  ScanEye,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

// Icônes : lucide-react, déjà utilisé par le reste de l'app. strokeWidth 1.75 partout.
const STROKE = 1.75;

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const BTN_PRIMARY = `inline-flex items-center justify-center bg-brand text-on-brand px-5 py-3 rounded-control text-sm font-semibold hover:bg-brand-dark active:translate-y-px transition-[background-color,transform] ${FOCUS}`;

const BTN_SECONDARY = `inline-flex items-center justify-center bg-surface text-ink px-5 py-3 rounded-control text-sm font-semibold border border-line hover:border-brand/40 active:translate-y-px transition-[border-color,transform] ${FOCUS}`;

// ── Données ───────────────────────────────────────────────────────────────────

const SETUP_STEPS = [
  {
    step: "01",
    title: "Connectez votre boutique",
    desc: "Reliez Flowmerce à votre plateforme e-commerce en quelques clics.",
  },
  {
    step: "02",
    title: "Définissez vos règles",
    desc: "Délais, motifs acceptés, résolutions autorisées. Vos conditions, écrites une fois.",
  },
  {
    step: "03",
    title: "Générez votre clé API",
    desc: "Une clé depuis le tableau de bord, et vos commandes parlent à Flowmerce.",
  },
  {
    step: "04",
    title: "Flowmerce prend le relais",
    desc: "Les réclamations arrivent, sont analysées et vous attendent, déjà instruites.",
  },
];

// `tone` : couleur de l’icône du jalon. Les libellés restent en encre neutre,
// la couleur porte le repère visuel sans multiplier les micro-labels.
const FLOW = [
  {
    icon: Inbox,
    tone: "text-indigo-600",
    title: "Le client dépose sa demande",
    desc: "Depuis le portail Flowmerce à votre marque, ou via l’API de votre boutique.",
  },
  {
    icon: ShieldCheck,
    tone: "text-blue-600",
    title: "Données et politique vérifiées",
    desc: "La demande est confrontée à votre politique : délai, motif, type de retour autorisé.",
  },
  {
    icon: Gauge,
    tone: "text-pink-600",
    title: "Niveau de risque calculé",
    desc: "Historique du client et signaux de fraude, à l’échelle du réseau Flowmerce.",
  },
  {
    icon: Sparkles,
    tone: "text-teal-600",
    title: "Résolution proposée par l’IA",
    desc: "Le modèle croise la réclamation, votre politique et le contexte client.",
  },
  {
    icon: GitBranch,
    tone: "text-violet-600",
    title: "Validation manuelle ou automatique",
    desc: "Vous arbitrez chaque dossier, ou vous laissez passer ceux qui respectent vos règles.",
  },
  {
    icon: BellRing,
    tone: "text-rose-500",
    title: "Décision appliquée, client notifié",
    desc: "Le résultat part par email, la décision et son historique restent horodatés.",
  },
];

type Feature = {
  icon: typeof ScrollText;
  tone: string;
  title: string;
  desc: string;
  span?: boolean;
  surface?: "soft" | "deep";
};

const FEATURES: Feature[] = [
  {
    icon: ScrollText,
    tone: "text-indigo-600",
    title: "Votre politique fait loi",
    desc: "Conditions par produit, délai ou motif. Aucune décision ne sort du cadre que vous avez écrit, y compris en automatique.",
    span: true,
    surface: "soft",
  },
  {
    icon: Zap,
    tone: "text-teal-600",
    title: "Décisions automatiques",
    desc: "Flowmerce analyse, tranche et notifie sans traitement manuel.",
  },
  {
    icon: Link2,
    tone: "text-blue-600",
    title: "Connexion par clé API",
    desc: "Une clé, votre boutique reliée, vos réclamations traitées en temps réel.",
  },
  {
    icon: PanelsTopLeft,
    tone: "text-violet-600",
    title: "Portail client dédié",
    desc: "Vos clients déposent leur demande sur un portail à votre marque.",
  },
  {
    icon: History,
    tone: "text-green-600",
    title: "Décisions traçables",
    desc: "Chaque décision horodatée et justifiée. En cas de litige, la trace existe.",
  },
  {
    icon: ScanEye,
    tone: "text-teal-300",
    title: "Détection des comportements à risque",
    desc: "Un client refusé chez trois marchands du réseau ne repart pas de zéro chez vous.",
    span: true,
    surface: "deep",
  },
];

const MOCK_ROWS = [
  {
    id: "#REC-4821",
    product: "Veste en cuir, taille M",
    decision: "Échange",
    cls: "bg-blue-50 text-blue-700",
  },
  {
    id: "#REC-4820",
    product: "Sneakers 42, blanc",
    decision: "Remboursement",
    cls: "bg-indigo-50 text-indigo-700",
  },
  {
    id: "#REC-4819",
    product: "Sac à dos voyage, noir",
    decision: "Réparation",
    cls: "bg-amber-50 text-amber-700",
  },
];

// Décomposition réelle du score : cf. computeFraudScore() dans lib/fraud-score.ts
// claims × 5 (max 30) + refus × 10 (max 40) + (marchands − 1) × 15 (max 30)
const FRAUD_SIGNALS = [
  { label: "3 réclamations enregistrées", value: "+15" },
  { label: "3 colis refusés signalés", value: "+30" },
  { label: "3 boutiques concernées", value: "+30" },
];

// Coordonnées : cf. lib/contact.ts

// Objections réelles d’un marchand qui hésite à brancher Flowmerce sur son
// flux de commandes. Chaque réponse est vérifiable dans le code, la référence
// est indiquée en commentaire.
const FAQ = [
  {
    q: "C’est vraiment gratuit ?",
    // Aucun modèle plan/subscription/billing dans prisma/schema.prisma.
    a: "Oui. Aucun moyen de paiement n’est demandé à l’inscription, et aucune fonctionnalité n’est réservée à une offre payante : le réseau anti-fraude, l’API et le portail client sont ouverts à toutes les boutiques.",
  },
  {
    q: "Les autres boutiques voient-elles mes clients ?",
    // /api/predict ne renvoie que fraud_score_applied: { value, source }.
    a: "Non. Une boutique ne reçoit qu’un score sur 100 et le nombre de boutiques ayant croisé ce client. Ni les noms des autres marchands, ni leurs commandes, ni le détail de leurs signalements ne sortent de chez eux.",
  },
  {
    q: "Un concurrent peut-il signaler mes clients à tort ?",
    // report-refusal : orderId vérifié + contrainte unique vendorId+orderId.
    a: "Un marchand ne peut signaler qu’un client qu’il a réellement servi : Flowmerce exige une commande tracée de son côté avant d’accepter le signalement, et un même dossier ne compte qu’une fois. Un vendeur seul ne peut pas dépasser 70 sur 100.",
  },
  {
    q: "L’IA peut-elle trancher sans mon accord ?",
    // ValidationMode @default(MANUAL) dans prisma/schema.prisma.
    a: "Pas par défaut. À la création de votre compte, chaque réclamation attend votre validation. L’approbation automatique existe, mais c’est un réglage que vous activez vous-même, quand vous avez vu le modèle travailler.",
  },
  {
    q: "Que devient une réclamation si votre modèle est indisponible ?",
    // mlFailed + worker de reprise /api/cron/retry-ml toutes les 10 min.
    a: "Elle est enregistrée quand même, marquée comme non traitée, puis rejouée automatiquement toutes les dix minutes jusqu’à ce que la décision aboutisse. Aucune demande client n’est perdue à cause d’une panne de notre côté.",
  },
];

const PRICING_INCLUDES = [
  "Réclamations sans limite de volume",
  "Portail client à votre marque",
  "Clés API et endpoint de décision",
  "Réseau anti-fraude inter-boutiques",
  "Politique de retour configurable",
  "Historique horodaté et notifications par email",
];

// Bornes calées sur les seuils configurables réels (FRAUD_LEVELS dans
// app/dashboard/return-policy) : 40 flexible, 70 équilibré, 85 strict.
const FRAUD_BANDS = [
  { label: "Faible", range: "0 à 39", tone: "text-risk-low" },
  { label: "À surveiller", range: "40 à 70", tone: "text-risk-mid" },
  { label: "Alerte", range: "au-delà de 70", tone: "text-risk-high" },
];

// ── Sous-composants ───────────────────────────────────────────────────────────

function SectionHeading({
  eyebrow,
  title,
  lead,
  align = "center",
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lead?: string;
  align?: "center" | "left";
}) {
  const centered = align === "center";
  return (
    <div className={centered ? "text-center max-w-2xl mx-auto" : "max-w-md"}>
      {eyebrow && (
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-ink mb-3">
          {eyebrow}
        </p>
      )}
      <h2 className="text-3xl sm:text-4xl font-extrabold tracking-[-0.02em] leading-[1.1] text-ink">
        {title}
      </h2>
      {lead && <p className="mt-4 text-[15px] text-body leading-relaxed">{lead}</p>}
    </div>
  );
}

// Aperçu du tableau de bord. Données d’illustration.
function DashboardPreview() {
  return (
    <figure className="bg-surface rounded-card border border-line shadow-[0_24px_60px_-32px_rgb(15_26_61/0.35)] overflow-hidden m-0">
      <div className="bg-page border-b border-line px-3 py-2.5 flex items-center gap-3">
        <div className="flex gap-1.5 shrink-0" aria-hidden>
          <span className="size-2 rounded-full bg-red-400" />
          <span className="size-2 rounded-full bg-amber-400" />
          <span className="size-2 rounded-full bg-green-400" />
        </div>
        <span className="flex-1 text-center text-[11px] text-faint truncate">
          flowmerce.app/dashboard
        </span>
        <span className="text-[10px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full shrink-0">
          Temps réel
        </span>
      </div>

      <div className="p-3 sm:p-4">
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
          <div className="rounded-control bg-indigo-50/70 p-2.5">
            <p className="text-[11px] text-body mb-0.5">Réclamations</p>
            <p className="text-lg font-extrabold text-brand-ink">248</p>
          </div>
          <div className="rounded-control bg-green-50/70 p-2.5">
            <p className="text-[11px] text-body mb-0.5">Décision moyenne</p>
            <p className="text-lg font-extrabold text-green-700">4 sec</p>
          </div>
          <div className="rounded-control bg-red-50/70 p-2.5">
            <p className="text-[11px] text-body mb-0.5">Fraudes</p>
            <p className="text-lg font-extrabold text-red-600">14</p>
          </div>
        </div>

        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold text-ink">Réclamations récentes</span>
          <span className="text-[11px] font-semibold text-brand-ink">Voir tout</span>
        </div>

        <ul className="divide-y divide-line list-none p-0 m-0">
          {MOCK_ROWS.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="block text-[11px] font-mono text-faint">{row.id}</span>
                <span className="block text-xs font-medium text-ink truncate">{row.product}</span>
              </span>
              <span
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${row.cls}`}
              >
                {row.decision}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <figcaption className="sr-only">
        Aperçu du tableau de bord Flowmerce avec des données d’illustration :
        réclamations du mois, temps de décision moyen, fraudes bloquées et
        dernières réclamations traitées.
      </figcaption>
    </figure>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-page text-ink font-sans">
      <SiteHeader />

      {/* ── HERO ── */}
      {/* Hauteur d’écran : `min-h-dvh` plutôt que `h-screen`, pour que le hero
          puisse dépasser sur mobile et ne saute pas quand la barre d’adresse
          d’iOS Safari se rétracte. Le `pt-16` compense la nav fixe. */}
      <section className="relative isolate overflow-hidden min-h-dvh flex items-center bg-page pt-16 pb-12 px-4 sm:px-6">
        {/* Fonds : deux halos en dégradé radial plutôt que des cercles floutés
            (pas de filtre à repeindre), plus un grain très léger qui casse
            l’aplat CSS. Purement décoratif, hors de l’arbre d’accessibilité. */}
        <div aria-hidden className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-linear-to-b from-haze via-haze to-page" />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: [
                "radial-gradient(58% 46% at 78% 14%, color-mix(in oklab, var(--color-brand) 15%, transparent), transparent 70%)",
                "radial-gradient(44% 40% at 4% 96%, var(--color-warm), transparent 72%)",
              ].join(","),
            }}
          />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            }}
          />
        </div>

        {/* Décalages verticaux inverses : la lecture descend en diagonale du
            titre vers la carte, au lieu de deux colonnes posées à plat. */}
        <div className="w-full max-w-6xl mx-auto grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          <div className="lg:col-span-7 lg:-translate-y-6">
            <h1 className="fm-enter text-5xl sm:text-6xl font-extrabold tracking-[-0.03em] leading-[1.02] text-ink">
              L’IA recommande,
              <br />
              <span className="text-brand-ink">
                Vous maîtrisez vos retours.
              </span>
            </h1>

            <p
              className="fm-enter mt-7 text-base sm:text-lg text-body leading-relaxed max-w-lg"
              style={{ animationDelay: "90ms" }}
            >
              Flowmerce analyse automatiquement chaque demande de retour avec
              l’IA, en croisant votre politique, l’historique client et le
              niveau de risque pour proposer la meilleure décision — vous restez
              libre de choisir la décision finale à appliquer.
            </p>

            <div
              className="fm-enter mt-10 flex flex-col sm:flex-row gap-3"
              style={{ animationDelay: "180ms" }}
            >
              <Link href="/auth/register" className={BTN_PRIMARY}>
                Commencer gratuitement
              </Link>
              <a href="#etapes" className={BTN_SECONDARY}>
                Comment ça marche
              </a>
            </div>
          </div>

          {/* TODO visuel : remplacer par une capture réelle du tableau de bord
              (1200x900) quand elle sera disponible. */}
          <div
            className="fm-enter relative lg:col-span-5 lg:translate-y-6"
            style={{ animationDelay: "260ms" }}
          >
            {/* Cadre décalé : ancre la carte au lieu de la laisser flotter. */}
            <div
              aria-hidden
              className="absolute inset-0 translate-x-3 translate-y-3 sm:translate-x-5 sm:translate-y-5 rounded-card border border-brand/30"
            />
            <div className="relative">
              <DashboardPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ── MISE EN PLACE ── */}
      <section id="etapes" className="bg-warm py-16 sm:py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading
            title="Opérationnel en 4 étapes"
            lead="De l’inscription à la première décision automatique."
          />

          <ol className="fm-reveal relative mt-12 sm:mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-6 list-none p-0">
            <div
              aria-hidden
              className="hidden lg:block absolute top-7 left-[12.5%] right-[12.5%] h-px bg-line"
            />
            {SETUP_STEPS.map((s) => (
              <li key={s.step} className="relative text-center">
                <div className="size-14 rounded-card bg-surface border border-line flex items-center justify-center mx-auto mb-5">
                  <span className="text-base font-extrabold text-brand-ink">
                    {s.step}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-ink mb-2">{s.title}</h3>
                <p className="text-[13px] text-body leading-relaxed max-w-60 mx-auto">
                  {s.desc}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── LE FLUX ── */}
      {/* `overflow-x-clip` contient les cartes qui arrivent latéralement sans
          créer de conteneur de défilement (contrairement à overflow-hidden). */}
      <section
        id="flux"
        className="py-16 sm:py-24 px-4 sm:px-6 overflow-x-clip"
      >
        <div className="max-w-4xl mx-auto">
          <SectionHeading
            title={<>De la demande à la décision</>}
            lead="Ce que Flowmerce fait entre la réclamation du client et votre validation."
          />

          <ol className="relative mt-12 sm:mt-16 list-none p-0">
            <div
              aria-hidden
              // pas de -translate-x-1/2 : `transform` est réservé à l’animation de tracé
              className="fm-line absolute top-0 bottom-0 left-5 md:left-[calc(50%-0.5px)] w-px bg-line"
            />

            <div className="space-y-4 md:space-y-5">
              {FLOW.map((item, i) => {
                const Icon = item.icon;
                const left = i % 2 === 0;
                return (
                  <li
                    key={item.title}
                    className="relative pl-16 md:pl-0 md:grid md:grid-cols-[1fr_2.5rem_1fr] md:items-center md:gap-6"
                  >
                    <span
                      className={`fm-node absolute left-0 top-1 md:static md:col-start-2 md:row-start-1 size-10 rounded-full bg-surface border border-line flex items-center justify-center shrink-0 ${item.tone}`}
                    >
                      <Icon size={17} strokeWidth={STROKE} />
                    </span>

                    <div
                      className={`fm-step bg-surface border border-line rounded-card p-4 sm:p-5 ${
                        left
                          ? "fm-step-l md:col-start-1 md:row-start-1"
                          : "fm-step-r md:col-start-3 md:row-start-1"
                      }`}
                    >
                      <h3 className="text-sm font-bold text-ink mb-1.5">
                        {item.title}
                      </h3>
                      <p className="text-[13px] text-body leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </li>
                );
              })}
            </div>
          </ol>
        </div>
      </section>

      {/* ── LA PLATEFORME ── */}
      <section id="plateforme" className="px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="max-w-6xl mx-auto bg-surface rounded-block px-4 sm:px-8 py-16 sm:py-20">
          <SectionHeading
            title="Ce que vous gardez sous contrôle"
            lead="Vos règles, vos décisions, vos données. Flowmerce instruit, vous arbitrez."
          />

          <div className="fm-reveal mt-10 sm:mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              const deep = f.surface === "deep";
              const soft = f.surface === "soft";
              return (
                <article
                  key={f.title}
                  className={[
                    "rounded-card p-5 sm:p-6 transition-transform hover:-translate-y-0.5",
                    f.span ? "sm:col-span-2" : "",
                    deep
                      ? "bg-deep"
                      : soft
                      ? "bg-brand-soft"
                      : "bg-page border border-line",
                  ].join(" ")}
                >
                  <Icon
                    size={20}
                    strokeWidth={STROKE}
                    className={`${f.tone} mb-4`}
                  />
                  <h3
                    className={`text-sm font-bold mb-2 ${
                      deep ? "text-white" : "text-ink"
                    }`}
                  >
                    {f.title}
                  </h3>
                  <p
                    className={`text-[13px] leading-relaxed ${
                      deep ? "text-white/75" : "text-body"
                    } ${f.span ? "max-w-md" : ""}`}
                  >
                    {f.desc}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FRAUDE ── */}
      <section className="px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="fm-reveal">
            <SectionHeading
              align="left"
              eyebrow="Réseau anti-fraude"
              title="Le colis refusé chez un marchand protège tous les autres"
            />
            <p className="mt-4 text-[15px] text-body leading-relaxed max-w-md">
              Chaque boutique algérienne du réseau signale ses colis refusés via
              l’API. Le score qui en résulte suit le client d’une boutique à
              l’autre, au lieu de rester enfermé dans la vôtre.
            </p>
            <p className="mt-4 text-[15px] text-body leading-relaxed max-w-md">
              Personne ne peut salir un client qu’il n’a pas servi : Flowmerce
              exige une commande tracée chez le marchand signalant. Et un
              vendeur seul ne peut pas pousser un score au-delà de 70. Passé ce
              seuil, c’est le réseau qui parle.
            </p>
            <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-[13px]">
              {FRAUD_BANDS.map((b) => (
                <div key={b.label}>
                  <dt className={`font-bold ${b.tone}`}>{b.label}</dt>
                  <dd className="m-0 text-body tabular-nums">{b.range}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="fm-reveal bg-surface rounded-card border border-line p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-body">
                  Client vu par 3 boutiques du réseau
                </p>
                <p className="text-[11px] font-mono text-faint mt-0.5">
                  amine.k@…
                </p>
              </div>
              <p className="text-4xl font-extrabold text-risk-high leading-none">
                75<span className="text-base text-faint font-bold"> / 100</span>
              </p>
            </div>

            {/* Jauge du score : 75 sur 100, seuil d’alerte à 70. */}
            <div
              className="mt-4 h-1.5 rounded-full bg-page overflow-hidden"
              role="img"
              aria-label="Score de risque : 75 sur 100"
            >
              <div className="h-full w-[75%] rounded-full bg-linear-to-r from-risk-low via-risk-mid to-risk-high" />
            </div>

            <dl className="mt-5 pt-5 border-t border-line space-y-3">
              {FRAUD_SIGNALS.map((s) => (
                <div
                  key={s.label}
                  className="flex items-center justify-between gap-4"
                >
                  <dt className="text-[13px] text-body">{s.label}</dt>
                  <dd className="text-[13px] font-bold text-ink m-0 shrink-0">
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="mt-5 pt-4 border-t border-line text-xs text-faint">
              Seuil d’alerte au choix : 40 en mode flexible, 70 en équilibré
              (par défaut), 85 en strict.
            </p>
          </div>
        </div>
      </section>

      {/* ── DÉVELOPPEURS ── */}
      <section className="px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="max-w-6xl mx-auto bg-surface rounded-block px-6 sm:px-10 py-14 sm:py-16">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className="fm-reveal">
              <SectionHeading
                align="left"
                eyebrow="Développeurs"
                title={
                  <>
                    Un seul endpoint.
                    <br className="hidden sm:block" /> Toute la logique métier.
                  </>
                }
              />
              <p className="mt-4 text-[15px] text-body leading-relaxed max-w-md">
                Le formulaire de retour est généré à partir de votre politique
                et embarqué dans votre boutique. Vous n’écrivez aucune règle :
                vous relayez le JSON et vous obtenez la réponse.
              </p>
              <Link
                href="/docs"
                className={`mt-6 inline-flex text-sm font-semibold text-brand-ink hover:underline rounded-control ${FOCUS}`}
              >
                Lire la documentation
              </Link>
            </div>

            <div className="fm-reveal bg-deep rounded-card p-5 sm:p-6 overflow-x-auto">
              <pre className="text-[11px] sm:text-xs font-mono leading-relaxed text-slate-300 m-0">
                <code>
                  <span className="text-indigo-300 font-semibold">POST</span>{" "}
                  <span className="text-white">/api/v1/returns</span>
                  {"\n\n"}
                  {"{ "}
                  <span className="text-sky-300">orderId</span>
                  {": "}
                  <span className="text-emerald-300">&apos;CMD-1234&apos;</span>
                  {",\n  "}
                  <span className="text-sky-300">productId</span>
                  {": "}
                  <span className="text-emerald-300">
                    &apos;PROD-5678&apos;
                  </span>
                  {",\n  "}
                  <span className="text-sky-300">answers</span>
                  {": { "}
                  <span className="text-sky-300">reason</span>
                  {": "}
                  <span className="text-emerald-300">
                    &apos;Produit défectueux&apos;
                  </span>
                  {" }\n}"}
                  {"\n\n"}
                  <span className="text-emerald-400">
                    201 {"{ claim_id, status: 'PENDING' }"}
                  </span>
                </code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ── TARIFS ── */}
      {/* Aucun modèle de facturation dans le schéma, aucun quota par marchand :
          « gratuit » et « sans limite de volume » sont exacts au moment d’écrire. */}
      <section id="tarifs" className="bg-warm py-16 sm:py-20 px-4 sm:px-6">
        <div className="fm-reveal max-w-5xl mx-auto grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          <div className="lg:col-span-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-ink mb-3">
              Tarifs
            </p>
            <p className="text-6xl sm:text-7xl font-extrabold tracking-[-0.03em] leading-none text-ink">
              Gratuit
            </p>
            <p className="mt-4 text-[15px] text-body leading-relaxed">
              0 DA par mois, sans carte bancaire et sans engagement.
            </p>
            <Link href="/auth/register" className={`${BTN_PRIMARY} mt-7`}>
              Commencer gratuitement
            </Link>
          </div>

          <ul className="lg:col-span-7 grid sm:grid-cols-2 gap-x-8 gap-y-4 list-none p-0 m-0">
            {PRICING_INCLUDES.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2.5 text-[14px] text-ink"
              >
                <Check
                  size={16}
                  strokeWidth={2.25}
                  className="text-brand-ink shrink-0 mt-0.5"
                  aria-hidden
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── FAQ ── */}
      {/* Accordéon natif `<details>` : aucun JS, ouvrable au clavier,
          et le contenu reste indexable même replié. */}
      <section id="faq" className="px-4 sm:px-6 pt-12 sm:pt-16 pb-16 sm:pb-24">
        <div className="max-w-3xl mx-auto">
          <SectionHeading
            title="Questions fréquentes"
            lead="Ce que les marchands demandent avant de brancher Flowmerce sur leurs commandes."
          />

          <div className="fm-reveal mt-10 sm:mt-14 border-t border-line">
            {FAQ.map((item) => (
              <details key={item.q} className="group border-b border-line">
                <summary
                  className={`flex items-start justify-between gap-6 cursor-pointer list-none py-5 text-[15px] font-bold text-ink [&::-webkit-details-marker]:hidden rounded-control ${FOCUS}`}
                >
                  {item.q}
                  <Plus
                    size={18}
                    strokeWidth={2}
                    aria-hidden
                    className="shrink-0 mt-0.5 text-brand-ink transition-transform duration-200 group-open:rotate-45"
                  />
                </summary>
                <p className="pb-5 -mt-1 text-[14px] text-body leading-relaxed max-w-2xl">
                  {item.a}
                </p>
              </details>
            ))}
          </div>

          {/* Second canal : le formulaire d’inscription ne convient pas à
              quelqu’un qui a encore une question. */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 text-center">
            <p className="text-[14px] text-body">
              Une question qui n’est pas ici ?
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                href="/contact"
                className={`inline-flex items-center gap-2 bg-surface border border-line text-ink px-4 py-2.5 rounded-control text-sm font-semibold hover:border-brand/40 active:translate-y-px transition-[border-color,transform] ${FOCUS}`}
              >
                <Mail size={16} strokeWidth={STROKE} aria-hidden />
                Nous écrire
              </Link>
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-2 bg-surface border border-line text-ink px-4 py-2.5 rounded-control text-sm font-semibold hover:border-brand/40 active:translate-y-px transition-[border-color,transform] ${FOCUS}`}
                >
                  <MessageCircle size={16} strokeWidth={STROKE} aria-hidden />
                  WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="px-4 sm:px-6 pb-16 sm:pb-20">
        <div className="fm-reveal max-w-6xl mx-auto bg-deep rounded-block px-6 py-16 sm:py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-[-0.02em] text-white mb-4">
            Reprenez la main sur vos retours.
          </h2>
          <p className="text-[15px] text-white/70 leading-relaxed max-w-lg mx-auto mb-8">
            Flowmerce instruit chaque dossier. Vous gardez la décision, vos
            règles et vos clients. Gratuit.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/auth/register"
              className={`inline-flex items-center justify-center bg-white text-deep px-5 py-3 rounded-control text-sm font-semibold hover:bg-white/90 active:translate-y-px transition-[background-color,transform] ${FOCUS}`}
            >
              Commencer gratuitement
            </Link>
            <Link
              href="/auth/login"
              className={`inline-flex items-center justify-center border border-white/30 text-white px-5 py-3 rounded-control text-sm font-semibold hover:bg-white/10 active:translate-y-px transition-[background-color,transform] ${FOCUS}`}
            >
              Se connecter
            </Link>
          </div>
        </div>
      </section>

      {/* ── PIED DE PAGE ── */}
      <SiteFooter />
    </div>
  );
}
