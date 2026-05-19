import Link from "next/link";
import Image from "next/image";
import { LandingNav } from "@/components/layout/LandingNav";

function IconShield() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconZap() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function IconBell() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconTrendDown() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
      <polyline points="17 18 23 18 23 12" />
    </svg>
  );
}


const FEATURES = [
  {
    icon: <IconShield />,
    title: "Politique flexible",
    desc: "Definissez vos conditions de retour par produit, delai ou motif. Chaque decision respecte vos regles — sans exception.",
    badge: "Vos regles",
  },
  {
    icon: <IconZap />,
    title: "Decisions automatiques",
    desc: "Flowmerce analyse chaque reclamation et choisit : echange, remboursement ou reparation. Zero intervention manuelle.",
    badge: "Sans intervention",
  },
  {
    icon: <IconLink />,
    title: "Connexion par cle API",
    desc: "Generez une cle API, integrez-la a votre boutique, et Flowmerce traite vos reclamations en temps reel. Aucun code a ecrire.",
    badge: "API REST",
  },
  {
    icon: <IconLayers />,
    title: "Portail client dedie",
    desc: "Vos clients soumettent leur reclamation via un portail a votre marque. Vous ne gerez plus rien manuellement.",
    badge: "White-label",
  },
  {
    icon: <IconBell />,
    title: "Notifications automatiques",
    desc: "A chaque etape, votre client est informe par email. Vous reduisez les contacts SAV sans effort.",
    badge: "Multi-canal",
  },
  {
    icon: <IconCheck />,
    title: "Decisions tracables",
    desc: "Chaque decision est horodatee et justifiee. En cas de litige, vous avez une trace complete et exportable.",
    badge: "Audit complet",
  },
  {
    icon: <IconClock />,
    title: "Gain de temps immediat",
    desc: "Une reclamation traitee manuellement prend 12 minutes en moyenne. Avec Flowmerce, elle est resolue en quelques secondes.",
    badge: "-90% de temps",
  },
  {
    icon: <IconTrendDown />,
    title: "Moins de retours abusifs",
    desc: "La detection de fraude integree bloque les demandes a risque avant qu'elles ne coutent quoi que ce soit.",
    badge: "Anti-fraude",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Connectez votre boutique",
    desc: "Reliez Flowmerce a votre plateforme e-commerce en quelques clics. Shopify, WooCommerce, PrestaShop — tout est supporte.",
  },
  {
    step: "02",
    title: "Definissez vos regles",
    desc: "Configurez vos conditions : delais, motifs acceptes, decisions associees. Flowmerce applique vos regles sans que vous interveniez.",
  },
  {
    step: "03",
    title: "Generez votre cle API",
    desc: "Copiez votre cle API depuis votre tableau de bord. C'est elle qui fait le lien entre vos commandes et les decisions de Flowmerce.",
  },
  {
    step: "04",
    title: "Flowmerce prend le relais",
    desc: "Les reclamations arrivent, sont analysees et traitees automatiquement. Vous suivez les resultats en temps reel, sans rien faire.",
  },
];

const STATS = [
  { value: "90%", label: "De temps economise par reclamation" },
  { value: "3x", label: "Moins de litiges non resolus" },
  { value: "15 min", label: "Pour etre operationnel" },
  { value: "0", label: "Ligne de code a ecrire" },
];

type MockRow = {
  id: string;
  product: string;
  issue: string;
  decision: string;
  decisionClass: string;
  fraud: string;
  fraudClass: string;
};

const MOCK_ROWS: MockRow[] = [
  {
    id: "#REC-4821",
    product: "Veste en cuir — Taille M",
    issue: "Taille incorrecte",
    decision: "Echange",
    decisionClass: "bg-blue-50 text-blue-700",
    fraud: "Risque faible",
    fraudClass: "bg-green-50 text-green-700",
  },
  {
    id: "#REC-4820",
    product: "Sneakers 42 — Blanc",
    issue: "Defaut de fabrication",
    decision: "Remboursement",
    decisionClass: "bg-indigo-50 text-indigo-700",
    fraud: "Risque moyen",
    fraudClass: "bg-yellow-50 text-yellow-700",
  },
  {
    id: "#REC-4819",
    product: "Sac a dos voyage — Noir",
    issue: "Livraison endommagee",
    decision: "Reparation",
    decisionClass: "bg-purple-50 text-purple-700",
    fraud: "Risque faible",
    fraudClass: "bg-green-50 text-green-700",
  },
  {
    id: "#REC-4818",
    product: "Montre connectee — Pro",
    issue: "Autre",
    decision: "Remboursement",
    decisionClass: "bg-indigo-50 text-indigo-700",
    fraud: "Fraude detectee",
    fraudClass: "bg-red-50 text-red-700",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* ── NAVBAR ── */}
      <LandingNav />

      {/* ── HERO ── */}
      <section className="pt-28 sm:pt-32 pb-16 sm:pb-24 px-4 sm:px-6 bg-linear-to-b from-indigo-50/60 to-white">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mx-auto text-center mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-2 bg-white border border-indigo-100 text-indigo-700 text-xs font-semibold px-3 sm:px-4 py-1.5 rounded-full mb-6 sm:mb-8 shadow-sm">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full inline-block shrink-0" />
              <span>Plateforme gratuite de gestion des retours e-commerce</span>
            </div>

            <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.1] mb-5 sm:mb-6">
              Chaque reclamation traitee
              <br className="hidden sm:block" />
              {" "}
              <span className="text-indigo-600">sans y toucher</span>
            </h1>

            <p className="text-base sm:text-lg text-gray-500 leading-relaxed mb-8 sm:mb-10 max-w-2xl mx-auto">
              Flowmerce analyse chaque demande, applique vos regles et rend une decision —
              echange, remboursement ou reparation. Vous recuperez du temps et reduisez vos pertes.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
              <Link
                href="/auth/register"
                className="bg-indigo-600 text-white px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl text-base font-semibold shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:shadow-indigo-300 transition-all"
              >
                Commencer gratuitement
              </Link>
              <a
                href="#how-it-works"
                className="bg-white text-gray-700 px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl text-base font-semibold border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all"
              >
                Voir comment ca marche
              </a>
            </div>

            <p className="text-sm text-gray-400 mt-4 sm:mt-5">
              Gratuit · Aucune configuration complexe · Operationnel en 15 minutes
            </p>
          </div>

          {/* Dashboard mockup */}
          <div className="max-w-5xl mx-auto relative">
            <div className="absolute -inset-6 bg-indigo-500/5 rounded-3xl blur-3xl -z-10" />
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
              {/* Browser bar */}
              <div className="bg-gray-50 border-b border-gray-100 px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3">
                <div className="flex gap-1.5 shrink-0">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-400" />
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-yellow-400" />
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-green-400" />
                </div>
                <div className="flex-1 bg-white rounded-md h-5 sm:h-6 border border-gray-200 max-w-xs sm:max-w-sm mx-auto flex items-center px-2 sm:px-3 min-w-0">
                  <span className="text-xs text-gray-400 truncate">app.flowmerce.io/dashboard</span>
                </div>
              </div>

              {/* Dashboard content */}
              <div className="p-3 sm:p-6 bg-gray-50/30">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-5">
                  <div className="bg-white rounded-xl p-3 sm:p-4 border border-gray-100 shadow-sm">
                    <p className="text-xs text-gray-400 mb-1">Reclamations ce mois</p>
                    <p className="text-xl sm:text-2xl font-bold text-indigo-600">248</p>
                    <p className="text-xs text-green-600 mt-1">100% traitees automatiquement</p>
                  </div>
                  <div className="bg-white rounded-xl p-3 sm:p-4 border border-gray-100 shadow-sm">
                    <p className="text-xs text-gray-400 mb-1">Temps moyen de decision</p>
                    <p className="text-xl sm:text-2xl font-bold text-green-600">4 sec</p>
                    <p className="text-xs text-green-600 mt-1">vs 12 min manuellement</p>
                  </div>
                  <div className="bg-white rounded-xl p-3 sm:p-4 border border-gray-100 shadow-sm">
                    <p className="text-xs text-gray-400 mb-1">Fraudes bloquees</p>
                    <p className="text-xl sm:text-2xl font-bold text-red-500">14</p>
                    <p className="text-xs text-red-500 mt-1">ce mois — avant paiement</p>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-3 sm:px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-800">Reclamations recentes</span>
                    <span className="text-xs text-indigo-600 font-medium cursor-pointer hover:underline shrink-0">Voir tout</span>
                  </div>

                  {/* Table header — desktop only */}
                  <div className="hidden md:grid grid-cols-[80px_1fr_110px_100px_110px] gap-3 px-4 py-2 bg-gray-50/80 border-b border-gray-100">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">ID</span>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Produit</span>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Motif</span>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Decision</span>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Risque fraude</span>
                  </div>

                  <div className="divide-y divide-gray-50 overflow-x-auto">
                    {MOCK_ROWS.map((row) => (
                      <div key={row.id} className="md:grid md:grid-cols-[80px_1fr_110px_100px_110px] flex flex-wrap gap-x-3 gap-y-1.5 px-3 sm:px-4 py-3 items-center">
                        <span className="text-xs font-mono text-gray-400">{row.id}</span>
                        <span className="text-sm text-gray-800 font-medium truncate max-w-full">{row.product}</span>
                        <span className="text-xs text-gray-500">{row.issue}</span>
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full w-fit ${row.decisionClass}`}>
                          {row.decision}
                        </span>
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full w-fit ${row.fraudClass}`}>
                          {row.fraud}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── INTEGRATIONS TRUST BAR ── */}
      <section className="py-10 sm:py-14 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-6 sm:mb-8">
            Compatible avec vos plateformes e-commerce
          </p>
          <div className="flex flex-wrap justify-center items-center gap-6 sm:gap-10 md:gap-16">
            {["Shopify", "WooCommerce", "PrestaShop", "Magento", "Wix"].map((name) => (
              <span
                key={name}
                className="text-gray-300 font-bold text-sm sm:text-base tracking-tight hover:text-gray-400 transition-colors cursor-default select-none"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
              Ce que Flowmerce fait a votre place
            </h2>
            <p className="text-gray-500 text-base sm:text-lg max-w-xl mx-auto">
              Chaque fonctionnalite est concue pour reduire vos pertes, gagner du temps et proteger votre marge.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group bg-white border border-gray-100 rounded-2xl p-5 sm:p-6 hover:border-indigo-100 hover:shadow-lg hover:shadow-indigo-50/80 transition-all duration-300"
              >
                <div className="flex items-start justify-between mb-4 sm:mb-5">
                  <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                    {f.icon}
                  </div>
                  <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                    {f.badge}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="py-16 sm:py-24 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
              Operationnel en 4 etapes
            </h2>
            <p className="text-gray-500 text-base sm:text-lg">
              De l'inscription a la premiere decision automatique — en moins de 15 minutes.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 relative">
            <div className="hidden lg:block absolute top-8 left-[10%] right-[10%] h-px bg-linear-to-r from-transparent via-indigo-200 to-transparent" />
            {STEPS.map((s) => (
              <div key={s.step} className="text-center relative">
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white border-2 border-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-sm">
                  <span className="text-lg sm:text-xl font-black text-indigo-600">{s.step}</span>
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-3">{s.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed max-w-xs mx-auto">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="py-14 sm:py-20 px-4 sm:px-6 bg-indigo-600">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 text-center">
          {STATS.map((s) => (
            <div key={s.label}>
              <p className="text-2xl sm:text-4xl font-black text-white mb-1 sm:mb-2">{s.value}</p>
              <p className="text-indigo-200 text-xs sm:text-sm leading-snug">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-20 sm:py-28 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
            Arretez de traiter les retours manuellement.
          </h2>
          <p className="text-gray-500 text-base sm:text-lg mb-8 sm:mb-10">
            Flowmerce prend la decision a votre place — en appliquant vos regles,
            en detectant les fraudes et en informant vos clients. C'est gratuit.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
            <Link
              href="/auth/register"
              className="bg-indigo-600 text-white px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl text-base font-semibold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all"
            >
              Commencer gratuitement
            </Link>
            <Link
              href="/auth/login"
              className="bg-white text-gray-700 px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl text-base font-semibold border border-gray-200 hover:bg-gray-50 transition-all"
            >
              Se connecter
            </Link>
          </div>
          <p className="text-sm text-gray-400 mt-4 sm:mt-5">
            Plateforme gratuite · Sans engagement · Operationnel en 15 min
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-gray-100 py-8 sm:py-10 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col items-center gap-4 sm:gap-6 md:flex-row md:justify-between">
          <div className="flex items-center">
            <Image src="/logos/logo-lockup.svg" alt="Flowmerce" width={120} height={24} />
          </div>
          <p className="text-xs sm:text-sm text-gray-400 text-center">
            &copy; 2026 Flowmerce. Tous droits reserves.
          </p>
          <div className="flex gap-4 sm:gap-6 text-xs sm:text-sm text-gray-400">
            <a href="#" className="hover:text-gray-600 transition-colors">Confidentialite</a>
            <a href="#" className="hover:text-gray-600 transition-colors">Conditions</a>
            <Link href="/auth/login" className="hover:text-gray-600 transition-colors">Connexion</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
