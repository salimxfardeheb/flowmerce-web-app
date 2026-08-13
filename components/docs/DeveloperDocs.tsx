'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { DocsTabs } from '@/components/docs/DocsTabs'

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconKey() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="M21 2l-9.6 9.6" />
      <path d="M15.5 7.5l3 3L22 7l-3-3" />
    </svg>
  )
}

function IconCopy() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function IconCode() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )
}

function IconLink() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

// ── Code block ────────────────────────────────────────────────────────────────

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="relative group rounded-card overflow-hidden border border-line bg-[#0f1729]">
      {lang && (
        <div className="flex items-center justify-between px-4 py-2 bg-[#16203a] border-b border-white/10">
          <span className="text-xs font-mono text-faint">{lang}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-faint hover:text-white transition-colors"
          >
            {copied ? <IconCheck /> : <IconCopy />}
            {copied ? 'Copié !' : 'Copier'}
          </button>
        </div>
      )}
      {!lang && (
        <button
          onClick={handleCopy}
          className="absolute top-3 right-3 flex items-center gap-1.5 text-xs text-faint hover:text-white transition-colors z-10 opacity-0 group-hover:opacity-100"
        >
          {copied ? <IconCheck /> : <IconCopy />}
          {copied ? 'Copié !' : 'Copier'}
        </button>
      )}
      <pre className="p-4 text-sm text-slate-200 overflow-x-auto leading-relaxed font-mono whitespace-pre">
        <code>{code}</code>
      </pre>
    </div>
  )
}

// ── Field row ─────────────────────────────────────────────────────────────────

function FieldRow({
  name, type, required, desc,
}: {
  name: string
  type: string
  required?: boolean
  desc: string
}) {
  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-3 pr-4 align-top w-48">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-xs font-mono text-brand-ink bg-brand-soft px-1.5 py-0.5 rounded">
            {name}
          </code>
          {required && (
            <span className="text-xs font-semibold text-red-500">requis</span>
          )}
        </div>
      </td>
      <td className="py-3 pr-4 align-top w-24">
        <span className="text-xs text-faint font-mono">{type}</span>
      </td>
      <td className="py-3 align-top text-sm text-body">{desc}</td>
    </tr>
  )
}

// ── Error row ─────────────────────────────────────────────────────────────────

function ErrorRow({ code, status, when, action }: { code: string; status: number; when: string; action: string }) {
  const statusColor =
    status === 400 ? 'bg-orange-100 text-orange-700' :
    status === 401 ? 'bg-red-100 text-red-700' :
    status === 409 ? 'bg-purple-100 text-purple-700' :
    status === 422 ? 'bg-amber-100 text-amber-700' :
    status === 429 ? 'bg-pink-100 text-pink-700' :
    'bg-page text-ink'

  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-3 pr-4 align-top">
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${statusColor}`}>{status}</span>
      </td>
      <td className="py-3 pr-4 align-top w-48">
        <code className="text-xs font-mono text-ink">{code}</code>
      </td>
      <td className="py-3 pr-4 align-top text-sm text-body max-w-xs">{when}</td>
      <td className="py-3 align-top text-sm text-body">{action}</td>
    </tr>
  )
}

// ── Section heading with anchor ───────────────────────────────────────────────

function H3({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="scroll-mt-24 text-base font-bold text-ink mb-3 flex items-center gap-2 group">
      {children}
      <a href={`#${id}`} className="opacity-0 group-hover:opacity-100 text-brand-ink transition-opacity">
        <IconLink />
      </a>
    </h3>
  )
}

// ── Languages ─────────────────────────────────────────────────────────────────

const LANG_KEY = 'flowmerce_docs_lang'
const LANGS = ['cURL', 'JavaScript', 'Python', 'PHP'] as const
type Lang = (typeof LANGS)[number]

// ── Scénario A: code examples ─────────────────────────────────────────────────

const CODE_A: Record<Lang, string> = {
  cURL: `# Appelé depuis VOTRE backend (jamais depuis le navigateur du client)
curl -X POST https://flowmerce.app/api/v1/returns \\
  -H "Authorization: Bearer flk_votre_cle_api" \\
  -H "Content-Type: application/json" \\
  -d '{
    "orderId":   "CMD-123",
    "productId": "PROD-5678",
    "answers": {
      "order_id":           "CMD-123",
      "customer_name":      "Ahmed Benali",
      "customer_email":     "ahmed@exemple.com",
      "customer_wilaya":    "Alger",
      "product_name":       "Nike Air Max",
      "payment_method":     "Cash on Delivery",
      "reason":             "Produit défectueux",
      "desired_resolution": "REFUND",
      "description":        "Défaut visible sur la semelle à la réception.",
      "data_consent":       true
    }
  }'`,

  JavaScript: `// Côté serveur uniquement (Node.js, Next.js API route, Express, etc.)
// Ne JAMAIS exposer la clé API au navigateur du client.

// Les champs et les valeurs acceptées viennent de GET /api/v1/return-form :
// ne les codez pas en dur, rendez le formulaire à partir de sa définition.
const res = await fetch("https://flowmerce.app/api/v1/returns", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.FLOWMERCE_API_KEY}\`,
    "Content-Type":  "application/json",
  },
  body: JSON.stringify({
    orderId:   "CMD-123",
    productId: "PROD-5678",
    answers: {
      order_id:           "CMD-123",
      customer_name:      "Ahmed Benali",
      customer_email:     "ahmed@exemple.com",
      customer_wilaya:    "Alger",
      product_name:       "Nike Air Max",
      payment_method:     "Cash on Delivery",
      reason:             "Produit défectueux",   // option du formulaire
      desired_resolution: "REFUND",               // EXCHANGE | REFUND | REPAIR
      description:        "Produit reçu défectueux.",
      data_consent:       true,                   // case cochée par le client
    },
  }),
})

const data = await res.json()
if (!res.ok) throw new Error(data.error)

// data.claim_id   → à sauvegarder côté votre BDD pour suivi
// data.status     → PENDING | APPROVED | REJECTED
// data.message    → texte à afficher au client`,

  Python: `# Côté serveur (Django, FastAPI, Flask…) — jamais côté client.
import os, requests

response = requests.post(
    "https://flowmerce.app/api/v1/returns",
    headers={
        "Authorization": f"Bearer {os.environ['FLOWMERCE_API_KEY']}",
        "Content-Type":  "application/json",
    },
    json={
        "orderId":   "CMD-123",
        "productId": "PROD-5678",
        "answers": {
            "order_id":           "CMD-123",
            "customer_name":      "Ahmed Benali",
            "customer_email":     "ahmed@exemple.com",
            "customer_wilaya":    "Alger",
            "product_name":       "Nike Air Max",
            "payment_method":     "Cash on Delivery",
            "reason":             "Produit défectueux",
            "desired_resolution": "REFUND",
            "description":        "Produit reçu défectueux.",
            "data_consent":       True,
        },
    },
)

response.raise_for_status()
data = response.json()
# data["claim_id"], data["status"], data["message"]`,

  PHP: `<?php
// Côté serveur Laravel — jamais côté client.
$response = \\Illuminate\\Support\\Facades\\Http::withHeaders([
    'Authorization' => 'Bearer ' . env('FLOWMERCE_API_KEY'),
    'Content-Type'  => 'application/json',
])->post('https://flowmerce.app/api/v1/returns', [
    'orderId'   => 'CMD-123',
    'productId' => 'PROD-5678',
    'answers'   => [
        'order_id'           => 'CMD-123',
        'customer_name'      => 'Ahmed Benali',
        'customer_email'     => 'ahmed@exemple.com',
        'customer_wilaya'    => 'Alger',
        'product_name'       => 'Nike Air Max',
        'payment_method'     => 'Cash on Delivery',
        'reason'             => 'Produit défectueux',
        'desired_resolution' => 'REFUND',
        'description'        => 'Produit reçu défectueux.',
        'data_consent'       => true,
    ],
]);

$data = $response->json();
// $data['claim_id'], $data['status'], $data['message']`,
}

// ── Scénario B: code examples ─────────────────────────────────────────────────

const CODE_B: Record<Lang, string> = {
  cURL: `# 1. Votre backend appelle Flowmerce pour générer un lien sécurisé
curl -X POST https://flowmerce.app/api/return-sessions \\
  -H "Authorization: Bearer flk_votre_cle_api" \\
  -H "Content-Type: application/json" \\
  -d '{
    "order_id":       "CMD-123",
    "customer_email": "ahmed@exemple.com",
    "customer_name":  "Ahmed Benali",
    "product_name":   "Nike Air Max",
    "expires_in":     72
  }'

# Réponse :
# {
#   "token":      "ret_xxxxxxxxxxxx",
#   "url":        "https://flowmerce.app/return/ret_xxxxxxxxxxxx",
#   "expires_at": "2026-05-20T18:00:00.000Z"
# }

# 2. Vous envoyez cette "url" au client (email, SMS, popup).
#    Quand il l'ouvre, Flowmerce affiche le formulaire et traite la demande.`,

  JavaScript: `// Côté serveur — génération du lien
const res = await fetch("https://flowmerce.app/api/return-sessions", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.FLOWMERCE_API_KEY,
    "Content-Type":  "application/json",
  },
  body: JSON.stringify({
    order_id:       "CMD-123",
    customer_email: "ahmed@exemple.com",
    customer_name:  "Ahmed Benali",
    product_name:   "Nike Air Max",
    expires_in:     72,             // heures, défaut 72 (max 720 = 30j)
  }),
})

const { url, token, expires_at } = await res.json()

// → Envoyez "url" au client par email/SMS.
// → Sauvegardez "token" côté votre BDD pour retrouver le claim plus tard.`,

  Python: `import os, requests

response = requests.post(
    "https://flowmerce.app/api/return-sessions",
    headers={
        "Authorization": f"Bearer {os.environ['FLOWMERCE_API_KEY']}",
        "Content-Type":  "application/json",
    },
    json={
        "order_id":       "CMD-123",
        "customer_email": "ahmed@exemple.com",
        "customer_name":  "Ahmed Benali",
        "product_name":   "Nike Air Max",
        "expires_in":     72,
    },
)

data = response.json()
# data["url"]   → à envoyer au client
# data["token"] → à stocker pour retrouver le claim`,

  PHP: `<?php
$response = \\Illuminate\\Support\\Facades\\Http::withHeaders([
    'Authorization' => 'Bearer ' . env('FLOWMERCE_API_KEY'),
    'Content-Type'  => 'application/json',
])->post('https://flowmerce.app/api/return-sessions', [
    'order_id'       => 'CMD-123',
    'customer_email' => 'ahmed@exemple.com',
    'customer_name'  => 'Ahmed Benali',
    'product_name'   => 'Nike Air Max',
    'expires_in'     => 72,
]);

$data = $response->json();
// $data['url']  → à envoyer au client
// $data['token'] → à stocker côté votre BDD`,
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Scenario = 'A' | 'B'

export function DeveloperDocs() {
  const [scenario, setScenario] = useState<Scenario>('A')
  const [activeLang, setActiveLang] = useState<Lang>('cURL')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY) as Lang | null
      if (saved && LANGS.includes(saved)) setActiveLang(saved)
    } catch {}
  }, [])

  function selectLang(lang: Lang) {
    setActiveLang(lang)
    try { localStorage.setItem(LANG_KEY, lang) } catch {}
  }

  return (
    <>

      <section className="px-4 sm:px-6 pt-28 pb-10 sm:pt-32">
        <div className="max-w-4xl mx-auto">
          <DocsTabs active="developpeurs" />
          <h1 className="mt-8 text-4xl sm:text-5xl font-extrabold tracking-[-0.03em] leading-[1.05] text-ink">
            Brancher Flowmerce
            <br />
            <span className="text-brand-ink">sur la boutique.</span>
          </h1>
          <p className="mt-5 text-[15px] text-body leading-relaxed max-w-xl">
            Référence technique : authentification, endpoints, formats de réponse et
            codes d’erreur. Deux scénarios d’intégration au choix.
          </p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-6 pb-24 space-y-12">

        {/* ── Authentification (commune) ── */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-brand text-white rounded-control flex items-center justify-center shrink-0">
              <IconKey />
            </div>
            <h2 className="text-xl font-bold text-ink">Authentification</h2>
          </div>

          <div className="bg-surface border border-line rounded-card p-6 space-y-4">
            <p className="text-body text-sm leading-relaxed">
              Toutes les requêtes API Flowmerce sont authentifiées via une{' '}
              <strong className="text-ink">clé API serveur</strong>.
              Deux formats équivalents sont acceptés :
            </p>

            <CodeBlock
              lang="HTTP headers"
              code={`# Format Bearer (recommandé)
Authorization: Bearer flk_votre_cle_api

# OU format x-api-key
x-api-key: flk_votre_cle_api`}
            />

            <div className="bg-red-50 border border-red-200 rounded-card p-4 text-sm text-red-800">
              <strong>⚠ Sécurité critique :</strong> votre clé API ne doit
              <strong> jamais</strong> apparaître côté navigateur (code source HTML, JavaScript
              client, DevTools). Gardez-la dans vos <strong>variables d'environnement serveur</strong>
              {' '}(<code className="text-xs bg-red-100 px-1 py-0.5 rounded font-mono">FLOWMERCE_API_KEY</code>).
              Aucun préfixe <code className="text-xs bg-red-100 px-1 py-0.5 rounded font-mono">NEXT_PUBLIC_</code>,
              <code className="text-xs bg-red-100 px-1 py-0.5 rounded font-mono">VITE_</code>, etc.
            </div>

            <p className="text-sm text-body">
              Générez et gérez vos clés depuis votre{' '}
              <Link href="/dashboard/api-keys" className="text-brand-ink hover:underline font-medium">
                tableau de bord
              </Link>. Maximum 5 clés actives par compte. La valeur brute n'est affichée qu'une seule fois — copiez-la immédiatement.
            </p>
          </div>
        </section>

        {/* ── Choix scénario ── */}
        <section>
          <h2 className="text-xl font-bold text-ink mb-2">Choisissez votre intégration</h2>
          <p className="text-sm text-body mb-6">
            Deux scénarios selon que vous voulez garder la main sur le formulaire de retour ou que
            Flowmerce héberge tout pour vous.
          </p>

          {/* Tab selector */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            <button
              onClick={() => setScenario('A')}
              className={`text-left p-5 rounded-card border-2 transition-all ${
                scenario === 'A'
                  ? 'border-brand bg-brand-soft/40 shadow-sm'
                  : 'border-line bg-surface hover:border-line'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-8 h-8 rounded-control flex items-center justify-center ${
                  scenario === 'A' ? 'bg-brand text-white' : 'bg-page text-body'
                }`}>
                  <IconCode />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-ink">Scénario A</span>
                  <span className="text-xs text-faint">·</span>
                  <span className="text-sm text-body">Formulaire embarqué</span>
                </div>
              </div>
              <p className="text-xs text-body leading-relaxed">
                Vous concevez votre propre formulaire de retour, vous gardez le contrôle UX complet.
                Une seule requête serveur → Flowmerce.
              </p>
            </button>

            <button
              onClick={() => setScenario('B')}
              className={`text-left p-5 rounded-card border-2 transition-all ${
                scenario === 'B'
                  ? 'border-brand bg-brand-soft/40 shadow-sm'
                  : 'border-line bg-surface hover:border-line'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-8 h-8 rounded-control flex items-center justify-center ${
                  scenario === 'B' ? 'bg-brand text-white' : 'bg-page text-body'
                }`}>
                  <IconLink />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-ink">Scénario B</span>
                  <span className="text-xs text-faint">·</span>
                  <span className="text-sm text-body">Page hébergée</span>
                </div>
              </div>
              <p className="text-xs text-body leading-relaxed">
                Vous générez un lien sécurisé que le client ouvre directement chez Flowmerce.
                Zéro frontend à coder.
              </p>
            </button>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SCÉNARIO A — FORMULAIRE EMBARQUÉ                                    */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        {scenario === 'A' && (
          <div className="space-y-12">

            {/* Flux */}
            <section>
              <H3 id="a-flux">Flux d'intégration</H3>
              <div className="bg-surface border border-line rounded-card p-6">
                <p className="text-sm text-body leading-relaxed mb-5">
                  Vous rendez le formulaire dans votre boutique à partir de sa définition JSON, puis
                  votre backend transmet les réponses à Flowmerce. Les champs, les motifs et les
                  résolutions proposés découlent de votre politique de retour — vous n'en codez
                  aucun en dur. La clé API reste toujours côté serveur.
                </p>
                <CodeBlock
                  lang="Flux serveur → serveur"
                  code={`[Votre backend]
       │  GET /api/v1/return-form
       │  Authorization: Bearer flk_xxx
       ▼
[Flowmerce]
       │  200 { sections, fields, options, meta.policy }
       ▼
[Navigateur client]
       │  1. Rend le formulaire à partir de cette définition
       │  2. Le client saisit et envoie
       │
       │  POST /api/orders/return   (votre endpoint local)
       ▼
[Votre backend]
       │  3. Vérifie que la commande appartient bien à l'utilisateur
       │  4. Transmet les réponses telles quelles
       │
       │  POST /api/v1/returns
       │  Authorization: Bearer flk_xxx
       │  { orderId, productId, answers }
       ▼
[Flowmerce]
       │  5. Revalide les réponses contre la définition du formulaire
       │  6. Rate limit, score de fraude, vérification policy
       │  7. Création du claim + appel ML synchrone
       │  8. Auto-approve / auto-reject / pending
       │  9. Email automatique au client
       │
       │  201 { claim_id, status, message }
       ▼
[Votre backend]
      10. Sauvegarde claim_id pour traçabilité`}
                />
              </div>
            </section>

            {/* Versionnage */}
            <section>
              <H3 id="a-versioning">Versionnage et compatibilité</H3>
              <div className="bg-surface border border-line rounded-card p-6 space-y-4">
                <p className="text-sm text-body leading-relaxed">
                  La définition renvoyée par{' '}
                  <code className="text-xs bg-page px-1.5 py-0.5 rounded font-mono">GET /api/v1/return-form</code>{' '}
                  porte deux entiers au premier niveau. Le contrôle de compatibilité de votre moteur
                  doit se faire sur <strong>le second</strong>.
                </p>

                <CodeBlock
                  lang="JSON"
                  code={`{
  "version": 2,
  "min_compatible_version": 1,
  "sections":        [ /* à AFFICHER au client */ ],
  "merchant_fields": [ /* à FOURNIR depuis vos données de commande */ ]
}`}
                />

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      <FieldRow name="version" type="number" desc="Version servie aujourd'hui. Incrémentée uniquement sur une RUPTURE : champ supprimé ou renommé, type modifié, contrainte durcie." />
                      <FieldRow name="min_compatible_version" type="number" desc="Version de moteur la plus ancienne capable de rendre ce formulaire." />
                    </tbody>
                  </table>
                </div>

                <CodeBlock
                  lang="Contrôle de compatibilité"
                  code={`// ✅ résiste aux évolutions additives
if (MY_ENGINE_VERSION < form.min_compatible_version) {
  throw new Error("moteur trop ancien")
}

// ❌ bloque sur un ajout inoffensif
// (c'est ce contrôle qui casse au passage en v2, pas le formulaire)
if (![1].includes(form.version)) {
  throw new Error("version non supportée")
}`}
                />

                <div className="bg-amber-50 border border-amber-200 rounded-card p-4 text-sm text-amber-900">
                  <p className="font-semibold mb-1">Contrepartie obligatoire</p>
                  <p>
                    Votre moteur doit <strong>ignorer ce qu&apos;il ne connaît pas</strong> : propriétés
                    inconnues sur un champ, types de champ inconnus, sections inconnues. C&apos;est ce qui
                    permet d&apos;enrichir le formulaire sans casser les intégrations en place. Les
                    évolutions additives — nouvelle propriété, champ optionnel, contrainte relâchée,
                    nouvelle option de <code className="font-mono text-xs bg-amber-100 px-1 py-0.5 rounded">select</code> —
                    ne changent pas <code className="font-mono text-xs bg-amber-100 px-1 py-0.5 rounded">version</code>.
                  </p>
                </div>

                <div className="bg-brand-soft border border-line rounded-card p-4 text-sm text-ink">
                  <p className="font-semibold mb-1">
                    Champs <code className="font-mono text-xs bg-brand-soft px-1 py-0.5 rounded">source: &quot;merchant&quot;</code>
                  </p>
                  <p>
                    Chaque champ porte <code className="font-mono text-xs bg-brand-soft px-1 py-0.5 rounded">source</code>{' '}
                    valant <code className="font-mono text-xs bg-brand-soft px-1 py-0.5 rounded">customer</code> ou{' '}
                    <code className="font-mono text-xs bg-brand-soft px-1 py-0.5 rounded">merchant</code>. Un champ{' '}
                    <code className="font-mono text-xs bg-brand-soft px-1 py-0.5 rounded">merchant</code> est un fait de la
                    commande que vous connaissez déjà : <strong>ne l&apos;affichez pas au client</strong>, renseignez-le
                    depuis vos données de commande. Le laisser saisir ajoute de la friction sur une information
                    que vous possédez, et permet au client d&apos;influencer la prédiction IA.
                  </p>
                  <p className="mt-2">
                    Vous n&apos;avez rien à filtrer : ces champs vivent dans{' '}
                    <code className="font-mono text-xs bg-brand-soft px-1 py-0.5 rounded">merchant_fields</code>, hors de{' '}
                    <code className="font-mono text-xs bg-brand-soft px-1 py-0.5 rounded">sections</code>. Une boucle de
                    rendu sur les sections fait donc la bonne chose par construction.
                  </p>
                  <p className="mt-2">
                    Sur le portail hébergé, où Flowmerce contrôle le navigateur, ces champs ne sont ni affichés
                    ni acceptés depuis le body : la session fait foi.
                  </p>
                </div>
              </div>
            </section>

            {/* Endpoint */}
            <section>
              <H3 id="a-endpoint">Endpoint</H3>
              <div className="bg-surface border border-line rounded-card divide-y divide-line">

                <div className="p-6 flex items-center gap-3 flex-wrap">
                  <span className="bg-brand-soft text-brand-ink text-xs font-black px-2.5 py-1 rounded-md">POST</span>
                  <code className="text-sm font-mono text-ink">https://flowmerce.app/api/v1/returns</code>
                </div>

                {/* Corps de la requête */}
                <div className="p-6 space-y-4">
                  <h4 className="text-sm font-semibold text-ink">Corps de la requête</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-line">
                          <th className="text-left text-xs font-semibold text-faint uppercase tracking-wider pb-2 pr-4">Champ</th>
                          <th className="text-left text-xs font-semibold text-faint uppercase tracking-wider pb-2 pr-4">Type</th>
                          <th className="text-left text-xs font-semibold text-faint uppercase tracking-wider pb-2">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        <FieldRow name="orderId"   type="string" required desc="Identifiant de la commande dans votre système (clé de déduplication)" />
                        <FieldRow name="productId" type="string" required desc="Identifiant du produit concerné dans votre système" />
                        <FieldRow name="answers"   type="object" required desc="Réponses du formulaire, indexées par l'id de champ renvoyé par GET /api/v1/return-form" />
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* answers — obligatoires */}
                <div className="p-6 space-y-4">
                  <h4 className="text-sm font-semibold text-ink">
                    <code className="font-mono text-xs bg-page px-1.5 py-0.5 rounded">answers</code> — champs obligatoires
                  </h4>
                  <p className="text-sm text-body">
                    Cette liste est celle du formulaire par défaut. Elle varie avec votre politique de
                    retour : fiez-vous toujours à <code className="font-mono text-xs bg-page px-1 py-0.5 rounded">GET /api/v1/return-form</code>,
                    qui fait foi.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-line">
                          <th className="text-left text-xs font-semibold text-faint uppercase tracking-wider pb-2 pr-4">Champ</th>
                          <th className="text-left text-xs font-semibold text-faint uppercase tracking-wider pb-2 pr-4">Type</th>
                          <th className="text-left text-xs font-semibold text-faint uppercase tracking-wider pb-2">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        <FieldRow name="order_id"           type="string" required desc="Numéro de commande (repris de orderId s'il est absent)" />
                        <FieldRow name="customer_name"      type="string" required desc="Nom complet du client" />
                        <FieldRow name="customer_email"     type="string" required desc="Email du client (format vérifié)" />
                        <FieldRow name="product_name"       type="string" required desc="Nom du produit concerné" />
                        <FieldRow name="reason"             type="enum"   required desc="Motif de retour — une des options du formulaire (ex: Produit défectueux)" />
                        <FieldRow name="desired_resolution" type="enum"   required desc="EXCHANGE | REFUND | REPAIR (choix du client, filtré par votre policy)" />
                        <FieldRow name="data_consent"       type="boolean" required desc="true — accord explicite du client sur l'usage de ses données (section « consent » du formulaire). Voir ci-dessous." />
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Consentement — rupture de contrat, elle mérite son propre bloc */}
                <div className="p-6 space-y-4">
                  <h4 className="text-sm font-semibold text-ink">
                    Consentement du client{' '}
                    <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                      formulaire v2
                    </span>
                  </h4>
                  <p className="text-sm text-body">
                    <code className="font-mono text-xs bg-page px-1 py-0.5 rounded">GET /api/v1/return-form</code>{' '}
                    renvoie désormais une section{' '}
                    <code className="font-mono text-xs bg-page px-1 py-0.5 rounded">consent</code>, dont le
                    champ obligatoire{' '}
                    <code className="font-mono text-xs bg-page px-1 py-0.5 rounded">data_consent</code>{' '}
                    porte le texte à afficher et la case à cocher. Si vous rendez le formulaire à partir
                    de sa définition, comme recommandé, elle apparaît sans un mot de code de votre part.
                  </p>
                  <p className="text-sm text-body">
                    Le client accepte que les informations de sa demande servent à trancher sa
                    réclamation, à entraîner le modèle qui produit ces analyses, et à être rapprochées
                    de ses retours précédents chez les boutiques partenaires. L&apos;horodatage de son
                    accord est conservé avec la réclamation.
                  </p>
                  <div className="rounded-control border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-sm text-amber-800">
                      <strong className="font-semibold">Changement bloquant.</strong> Une soumission sans{' '}
                      <code className="font-mono text-xs bg-white/60 px-1 py-0.5 rounded">data_consent: true</code>{' '}
                      est refusée avec un{' '}
                      <code className="font-mono text-xs bg-white/60 px-1 py-0.5 rounded">400</code> et le code{' '}
                      <code className="font-mono text-xs bg-white/60 px-1 py-0.5 rounded">CONSENT_REQUIRED</code>.
                      Cochez-le après acceptation réelle du client : le pré-cocher, ou l&apos;envoyer en
                      dur, n&apos;est pas un consentement.
                    </p>
                  </div>
                </div>

                {/* answers — champs boutique */}
                <div className="p-6 space-y-4">
                  <h4 className="text-sm font-semibold text-ink">
                    <code className="font-mono text-xs bg-page px-1.5 py-0.5 rounded">answers</code> — champs boutique
                    <span className="ml-2 font-normal text-faint">source: &quot;merchant&quot;</span>
                  </h4>
                  <p className="text-sm text-body">
                    Ces champs sont des <strong>faits de la commande</strong>, pas des saisies du client. Ils sont
                    renvoyés dans <code className="font-mono text-xs bg-page px-1 py-0.5 rounded">merchant_fields</code>,
                    hors de <code className="font-mono text-xs bg-page px-1 py-0.5 rounded">sections</code> : votre
                    formulaire ne les affiche donc pas, vous les renseignez depuis vos données de commande.
                    Aucun n&apos;est obligatoire — un champ absent retombe sur une valeur neutre, mais la
                    prédiction y perd. Toute valeur transmise est validée contre sa définition.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        <FieldRow name="customer_id"      type="string" desc="Identifiant du client dans votre système (exporté en Customer_ID). Le client ne le connaît pas." />
                        <FieldRow name="customer_wilaya"  type="string" desc="Wilaya (région) de livraison. Feature du modèle." />
                        <FieldRow name="payment_method"   type="enum"   desc="Cash on Delivery | Card | CCP | Bank Transfer. Feature du modèle." />
                        <FieldRow name="shipping_method"  type="string" desc="Mode de livraison." />
                        <FieldRow name="shipping_cost"    type="number" desc="Frais de livraison en DA. Feature du modèle." />
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* answers — optionnels */}
                <div className="p-6 space-y-4">
                  <h4 className="text-sm font-semibold text-ink">
                    <code className="font-mono text-xs bg-page px-1.5 py-0.5 rounded">answers</code> — champs optionnels (améliorent fortement la prédiction IA)
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        <FieldRow name="description"      type="string" desc="Description du problème (max 2000 caractères, pas de HTML)" />
                        <FieldRow name="customer_phone"   type="string" desc="Téléphone client (renforce la détection de fraude)" />
                        <FieldRow name="customer_age"     type="number" desc="Âge du client" />
                        <FieldRow name="customer_birth_date" type="string" desc="Date de naissance ISO-8601 — l'âge en est déduit et prime sur customer_age" />
                        <FieldRow name="customer_gender"  type="string" desc="Genre du client" />
                        <FieldRow name="product_category" type="string" desc="Catégorie produit — requise pour appliquer vos catégories non remboursables" />
                        <FieldRow name="product_price"    type="number" desc="Prix unitaire en DA" />
                        <FieldRow name="order_quantity"   type="number" desc="Quantité commandée" />
                        <FieldRow name="order_total"      type="number" desc="Montant total de la commande en DA" />
                        <FieldRow name="order_date"       type="string" desc="Date de commande ISO-8601 (calcule les jours écoulés)" />
                        <FieldRow name="order_address"    type="string" desc="Adresse de livraison" />
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Réponse */}
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-ink">Réponse</h4>
                    <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded">201 Created</span>
                  </div>
                  <CodeBlock
                    lang="JSON"
                    code={`{
  "success":               true,
  "claim_id":              "clxxxxxxxxxxxxxx",
  "status":                "APPROVED",   // ou PENDING / REJECTED
  "customer_past_returns": 2,
  "message":               "Votre demande de retour a été enregistrée et approuvée automatiquement."
}`}
                  />
                  <div className="bg-brand-soft border border-line rounded-card p-4 text-sm text-ink">
                    <p className="font-semibold mb-1">Recommandation IA — contrat 3 classes</p>
                    <p>
                      La recommandation du moteur IA vaut toujours <code className="font-mono text-xs bg-brand-soft px-1 py-0.5 rounded">Exchange</code>,{' '}
                      <code className="font-mono text-xs bg-brand-soft px-1 py-0.5 rounded">Repair</code> ou{' '}
                      <code className="font-mono text-xs bg-brand-soft px-1 py-0.5 rounded">Reject</code> — jamais un remboursement.
                      Le remboursement est une <strong>décision vendeur</strong> : lorsque le client demande un remboursement
                      (<code className="font-mono text-xs bg-brand-soft px-1 py-0.5 rounded">desired_resolution: REFUND</code>) et que la demande est
                      éligible selon la politique de retour, le dashboard affiche un indicateur « Remboursement recommandé — décision vendeur ».
                      Aucune action financière n&apos;est déclenchée automatiquement.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Exemples de code */}
            <section>
              <H3 id="a-code">Exemple de code</H3>
              <div className="bg-surface border border-line rounded-card overflow-hidden">
                <div className="flex border-b border-line bg-page/60 overflow-x-auto">
                  {LANGS.map(lang => (
                    <button
                      key={lang}
                      onClick={() => selectLang(lang)}
                      className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                        activeLang === lang
                          ? 'border-brand text-brand-ink bg-surface'
                          : 'border-transparent text-body hover:text-ink'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
                <div className="p-5">
                  <CodeBlock code={CODE_A[activeLang]} lang={activeLang} />
                </div>
              </div>
            </section>

            {/* Gestion d'erreurs A */}
            <section>
              <H3 id="a-errors">Codes d'erreur</H3>
              <div className="bg-surface border border-line rounded-card p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line">
                        <th className="text-left text-xs font-semibold text-faint uppercase tracking-wider pb-2 pr-4">Status</th>
                        <th className="text-left text-xs font-semibold text-faint uppercase tracking-wider pb-2 pr-4">Code</th>
                        <th className="text-left text-xs font-semibold text-faint uppercase tracking-wider pb-2 pr-4">Quand</th>
                        <th className="text-left text-xs font-semibold text-faint uppercase tracking-wider pb-2">Action recommandée</th>
                      </tr>
                    </thead>
                    <tbody>
                      <ErrorRow status={400} code="VALIDATION"   when="Champ requis manquant, email invalide, HTML détecté, raison/résolution non reconnue" action="Corriger le payload côté votre backend" />
                      <ErrorRow status={400} code="CONSENT_REQUIRED" when="answers.data_consent absent ou différent de true" action="Afficher la section « consent » du formulaire et transmettre la case cochée par le client" />
                      <ErrorRow status={401} code="AUTH"         when="Clé API invalide, désactivée, ou vendor non APPROVED" action="Vérifier la clé dans /dashboard/api-keys" />
                      <ErrorRow status={409} code="DUPLICATE"    when="Un claim existe déjà pour (vendorId, order_id)" action='Afficher "un retour existe déjà" au client' />
                      <ErrorRow status={422} code="DELAY_EXCEEDED" when="Délai de retour dépassé (selon return policy vendor)" action="Afficher la raison au client (champ `extra.policy_days`)" />
                      <ErrorRow status={422} code="NON_REFUNDABLE_CATEGORY" when="Catégorie produit configurée comme non remboursable" action="Proposer un échange à la place" />
                      <ErrorRow status={429} code="RATE_LIMIT"   when="3 demandes/client/jour ou trop de tentatives pour la même commande" action="Demander au client de réessayer plus tard" />
                      <ErrorRow status={503} code="ML_DOWN"      when="Serveur ML temporairement indisponible (claim créé en PENDING)" action="Le claim sera rejoué automatiquement par le cron" />
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* Checklist sécurité */}
            <section>
              <H3 id="a-security">Checklist sécurité</H3>
              <div className="bg-amber-50 border border-amber-200 rounded-card p-6 space-y-2 text-sm text-amber-900">
                <p>✓ <strong>FLOWMERCE_API_KEY</strong> uniquement dans vos variables d'env serveur</p>
                <p>✓ Vérifier que la commande appartient à l'utilisateur connecté avant d'appeler Flowmerce</p>
                <p>✓ Échapper / valider les inputs (longueur, pas de HTML — Flowmerce le fait aussi)</p>
                <p>✓ Sauvegarder <code className="bg-amber-100 px-1 rounded">claim_id</code> côté votre BDD pour le suivi</p>
                <p>✓ Tester avec une clé de dev avant la prod ; révoquer si compromise</p>
              </div>
            </section>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SCÉNARIO B — PAGE HÉBERGÉE                                          */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        {scenario === 'B' && (
          <div className="space-y-12">

            {/* Flux */}
            <section>
              <H3 id="b-flux">Flux d'intégration</H3>
              <div className="bg-surface border border-line rounded-card p-6">
                <p className="text-sm text-body leading-relaxed mb-5">
                  Vous générez un lien sécurisé depuis votre backend, vous l'envoyez au client par
                  email/SMS. Quand il l'ouvre, Flowmerce affiche le formulaire et traite la demande
                  de bout en bout. Votre clé API ne circule jamais jusqu'au navigateur du client.
                </p>
                <CodeBlock
                  lang="Flux à 2 étapes"
                  code={`ÉTAPE 1 — serveur → serveur (avec clé API)

[Votre backend]
       │  POST /api/return-sessions
       │  Authorization: Bearer flk_xxx
       │  body: { order_id, customer_email, customer_name, product_name }
       ▼
[Flowmerce]
       │  Crée un token unique (~24-72h)
       │
       │  201 { token, url, expires_at }
       ▼
[Votre backend]
       Envoie "url" au client (email, SMS, popup…)


ÉTAPE 2 — navigateur client → Flowmerce (sans clé API)

[Navigateur client]  ←──  ouvre le lien
       │
       │  GET /return/ret_xxx   (page React hébergée)
       ▼
[Flowmerce sert la page]
       │  Formulaire pré-rempli (PII masquées)
       │
       │  POST /api/v1/returns       (soumission)
       │  X-Return-Token: ret_xxx
       │  body: { answers: { reason, desired_resolution, … } }
       ▼
[Flowmerce]
       │  Validation, fraud score, appel ML, décision
       │  Email automatique au client
       ▼
[Page de confirmation affichée au client]`}
                />
              </div>
            </section>

            {/* Endpoint ÉTAPE 1 */}
            <section>
              <H3 id="b-endpoint-1">Endpoint étape 1 — Créer la session</H3>
              <div className="bg-surface border border-line rounded-card divide-y divide-line">

                <div className="p-6 flex items-center gap-3 flex-wrap">
                  <span className="bg-brand-soft text-brand-ink text-xs font-black px-2.5 py-1 rounded-md">POST</span>
                  <code className="text-sm font-mono text-ink">https://flowmerce.app/api/return-sessions</code>
                </div>

                <div className="p-6 space-y-4">
                  <h4 className="text-sm font-semibold text-ink">Champs obligatoires</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        <FieldRow name="order_id"       type="string" required desc="Identifiant de la commande dans votre système" />
                        <FieldRow name="customer_email" type="string" required desc="Email du client (format vérifié)" />
                        <FieldRow name="customer_name"  type="string" required desc="Nom complet du client" />
                        <FieldRow name="product_name"   type="string" required desc="Nom du produit concerné" />
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <h4 className="text-sm font-semibold text-ink">Champs optionnels (pré-remplissent le formulaire client)</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        <FieldRow name="customer_phone"   type="string" desc="Téléphone du client" />
                        <FieldRow name="customer_id"      type="string" desc="Identifiant du client dans votre système (repris sur la réclamation)" />
                        <FieldRow name="customer_wilaya"  type="string" desc="Wilaya du client — sinon demandée au client sur la page de retour" />
                        <FieldRow name="customer_age"     type="number" desc="Âge du client (1–120) — jamais demandé au client : repli 30 si absent" />
                        <FieldRow name="customer_birth_date" type="string" desc="Date de naissance ISO-8601 (ex: 1992-05-14) — l'âge en est déduit et prime sur customer_age" />
                        <FieldRow name="customer_gender"  type="string" desc="Genre du client — jamais demandé au client : repli 'Unknown' si absent" />
                        <FieldRow name="payment_method"   type="string" desc="Cash on Delivery | Card | CCP | Bank Transfer — sinon demandé au client" />
                        <FieldRow name="shipping_method"  type="string" desc="Mode de livraison (Livraison à domicile, Stopdesk…) — jamais demandé au client : repli 'Standard' si absent" />
                        <FieldRow name="shipping_cost"    type="number" desc="Frais de livraison en DA — jamais demandés au client : repli 0 si absent" />
                        <FieldRow name="order_date"       type="string" desc="Date de commande ISO-8601 (vérifie le délai vs return policy)" />
                        <FieldRow name="shop_name"        type="string" desc="Nom de votre boutique (affiché sur la page de retour). Défaut: nom du compte." />
                        <FieldRow name="product_price"    type="number" desc="Prix unitaire en DA" />
                        <FieldRow name="product_quantity" type="number" desc="Quantité commandée" />
                        <FieldRow name="order_total"      type="number" desc="Montant total de la commande" />
                        <FieldRow name="expires_in"       type="number" desc="Durée de validité du lien en heures (défaut 72, min 1, max 720)" />
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-ink">Réponse</h4>
                    <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded">201 Created</span>
                  </div>
                  <CodeBlock
                    lang="JSON"
                    code={`{
  "token":      "ret_xxxxxxxxxxxx",
  "url":        "https://flowmerce.app/return/ret_xxxxxxxxxxxx",
  "expires_at": "2026-05-20T18:00:00.000Z"
}`}
                  />
                  <p className="text-sm text-body">
                    Envoyez <code className="text-xs bg-page px-1.5 py-0.5 rounded font-mono">url</code> au
                    client par email/SMS. Le lien expire après <code className="text-xs bg-page px-1.5 py-0.5 rounded font-mono">expires_in</code> heures
                    et est <strong>à usage unique</strong>.
                  </p>
                </div>
              </div>
            </section>

            {/* Endpoint ÉTAPE 2 */}
            <section>
              <H3 id="b-endpoint-2">Endpoint étape 2 — Soumission du formulaire</H3>
              <div className="bg-surface border border-line rounded-card p-6">
                <p className="text-sm text-body leading-relaxed mb-4">
                  C'est <strong>le même endpoint que le scénario A</strong> — seul l'identifiant change :
                  le jeton de session remplace la clé API. Il est appelé automatiquement par la page
                  Flowmerce (<code className="text-xs bg-page px-1.5 py-0.5 rounded font-mono">/return/[token]</code>)
                  quand le client soumet le formulaire. <strong>Vous n'avez normalement pas à l'appeler vous-même</strong>,
                  mais voici les détails pour information :
                </p>

                <div className="flex items-center gap-3 flex-wrap mb-4">
                  <span className="bg-page text-ink text-xs font-black px-2.5 py-1 rounded-md">POST</span>
                  <code className="text-sm font-mono text-ink">https://flowmerce.app/api/v1/returns</code>
                </div>

                <ul className="text-sm text-body space-y-1.5 list-disc list-inside">
                  <li>
                    Auth : <code className="text-xs bg-page px-1 py-0.5 rounded font-mono">X-Return-Token: ret_xxx</code>{' '}
                    (ou <code className="text-xs bg-page px-1 py-0.5 rounded font-mono">Authorization: Bearer ret_xxx</code>) — pas de clé API
                  </li>
                  <li>
                    <code className="text-xs bg-page px-1 py-0.5 rounded font-mono">orderId</code> et{' '}
                    <code className="text-xs bg-page px-1 py-0.5 rounded font-mono">productId</code> ne sont pas attendus : ils viennent de la session
                  </li>
                  <li>
                    L'ancienne route <code className="text-xs bg-page px-1 py-0.5 rounded font-mono">POST /api/return/&#123;token&#125;</code>{' '}
                    reste acceptée mais est <strong>dépréciée</strong>
                  </li>
                  <li>Le token est à usage unique — une fois utilisé, il devient invalide</li>
                  <li>Rate limit : 1 tentative par IP+commande par heure</li>
                  <li>Source du claim créé : <code className="text-xs bg-page px-1 py-0.5 rounded font-mono">HOSTED_PAGE</code></li>
                  <li>
                    Body : <code className="text-xs bg-page px-1 py-0.5 rounded font-mono">{'{ "answers": { "<field_id>": valeur } }'}</code> —
                    les <code className="text-xs bg-page px-1 py-0.5 rounded font-mono">field_id</code> proviennent du
                    même formulaire que <code className="text-xs bg-page px-1 py-0.5 rounded font-mono">GET /api/v1/return-form</code>,
                    et les réponses sont validées contre sa définition
                  </li>
                  <li>Les champs transmis à l&apos;étape 1 ne sont pas redemandés au client : la valeur de session fait foi</li>
                </ul>
              </div>
            </section>

            {/* Exemples de code */}
            <section>
              <H3 id="b-code">Exemple de code (étape 1)</H3>
              <div className="bg-surface border border-line rounded-card overflow-hidden">
                <div className="flex border-b border-line bg-page/60 overflow-x-auto">
                  {LANGS.map(lang => (
                    <button
                      key={lang}
                      onClick={() => selectLang(lang)}
                      className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                        activeLang === lang
                          ? 'border-brand text-brand-ink bg-surface'
                          : 'border-transparent text-body hover:text-ink'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
                <div className="p-5">
                  <CodeBlock code={CODE_B[activeLang]} lang={activeLang} />
                </div>
              </div>
            </section>

            {/* Gestion d'erreurs B */}
            <section>
              <H3 id="b-errors">Codes d'erreur</H3>
              <div className="bg-surface border border-line rounded-card p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line">
                        <th className="text-left text-xs font-semibold text-faint uppercase tracking-wider pb-2 pr-4">Status</th>
                        <th className="text-left text-xs font-semibold text-faint uppercase tracking-wider pb-2 pr-4">Code</th>
                        <th className="text-left text-xs font-semibold text-faint uppercase tracking-wider pb-2 pr-4">Quand</th>
                        <th className="text-left text-xs font-semibold text-faint uppercase tracking-wider pb-2">Action recommandée</th>
                      </tr>
                    </thead>
                    <tbody>
                      <ErrorRow status={400} code="VALIDATION"   when="Champ requis manquant, email invalide, HTML détecté" action="Corriger le payload" />
                      <ErrorRow status={401} code="AUTH"         when="Clé API invalide ou désactivée" action="Vérifier la clé dans /dashboard/api-keys" />
                      <ErrorRow status={400} code="ORDER_DATE"   when="order_date illisible ou dans le futur" action="Corriger la date de commande" />
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-body mt-4">
                  Le dépassement du délai de retour ne provoque plus d&apos;erreur : le lien est créé
                  normalement et la réponse porte <code className="font-mono text-ink">out_of_window: true</code>.
                  La page s&apos;ouvre, le client peut déposer sa demande, mais elle sera enregistrée
                  refusée d&apos;office à la soumission.
                </p>
                <p className="text-xs text-faint mt-4">
                  Note : les erreurs ML / fraud / duplication surviennent à l'étape 2 (formulaire client) et sont
                  gérées par Flowmerce ; le client en est notifié sur la page hébergée.
                </p>
              </div>
            </section>

            {/* Bonnes pratiques B */}
            <section>
              <H3 id="b-best-practices">Bonnes pratiques</H3>
              <div className="bg-brand-soft border border-brand/30 rounded-card p-6 space-y-2 text-sm text-ink">
                <p>✓ Stocker le <code className="bg-brand-soft px-1 rounded">token</code> côté votre BDD pour retrouver le claim plus tard</p>
                <p>✓ Adapter <code className="bg-brand-soft px-1 rounded">expires_in</code> selon votre cas (court = sécurité, long = confort client)</p>
                <p>✓ Régénérer un nouveau lien si l'ancien expire (ils ne sont pas renouvelables)</p>
                <p>✓ Envoyer l'URL via un canal authentifié (email du client, SMS sur son numéro vérifié)</p>
                <p>✓ Inclure <code className="bg-brand-soft px-1 rounded">order_date</code> pour bloquer en amont les retours hors délai</p>
              </div>
            </section>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* INTÉGRATIONS NATIVES (commun)                                       */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        <section>
          <h2 className="text-xl font-bold text-ink mb-4">Intégrations natives</h2>
          <div className="bg-surface border border-line rounded-card p-8 flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="w-14 h-14 bg-page rounded-card flex items-center justify-center shrink-0 text-2xl font-black text-faint">
              S
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h3 className="text-base font-semibold text-ink">Intégration Shopify native</h3>
                <span className="bg-brand-soft text-brand-ink text-xs font-semibold px-2.5 py-1 rounded-full">
                  Bientôt disponible
                </span>
              </div>
              <p className="text-sm text-body leading-relaxed max-w-lg">
                Un plugin Shopify officiel Flowmerce est en cours de développement.
                Il permettra d'intégrer Flowmerce en un clic, sans écrire une seule ligne de code.
              </p>
            </div>
            <button
              disabled
              className="shrink-0 px-5 py-2.5 rounded-control text-sm font-semibold bg-page text-faint cursor-not-allowed"
            >
              Disponible prochainement
            </button>
          </div>
        </section>

        {/* CTA final */}
        <section className="bg-linear-to-br from-indigo-50 to-white border border-line rounded-card p-10 text-center">
          <h2 className="text-2xl font-bold text-ink mb-3">Prêt à démarrer ?</h2>
          <p className="text-body text-sm mb-8 max-w-md mx-auto">
            Créez votre compte et générez votre première clé API en moins de 2 minutes.
            Aucune carte bancaire requise.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/auth/register"
              className="bg-brand text-white px-7 py-3 rounded-card text-sm font-semibold shadow-lg shadow-indigo-200 hover:bg-brand-dark transition-all"
            >
              Créer mon compte
            </Link>
            <Link
              href="/dashboard/api-keys"
              className="bg-surface text-ink px-7 py-3 rounded-card text-sm font-semibold border border-line hover:bg-page transition-all"
            >
              Générer ma clé API
            </Link>
          </div>
        </section>

      </div>
    </>
  )
}
