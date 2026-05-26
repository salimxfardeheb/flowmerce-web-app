'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect } from 'react'

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
    <div className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-950">
      {lang && (
        <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
          <span className="text-xs font-mono text-gray-400">{lang}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
          >
            {copied ? <IconCheck /> : <IconCopy />}
            {copied ? 'Copié !' : 'Copier'}
          </button>
        </div>
      )}
      {!lang && (
        <button
          onClick={handleCopy}
          className="absolute top-3 right-3 flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors z-10 opacity-0 group-hover:opacity-100"
        >
          {copied ? <IconCheck /> : <IconCopy />}
          {copied ? 'Copié !' : 'Copier'}
        </button>
      )}
      <pre className="p-4 text-sm text-gray-200 overflow-x-auto leading-relaxed font-mono whitespace-pre">
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
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-3 pr-4 align-top w-48">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-xs font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
            {name}
          </code>
          {required && (
            <span className="text-xs font-semibold text-red-500">requis</span>
          )}
        </div>
      </td>
      <td className="py-3 pr-4 align-top w-24">
        <span className="text-xs text-gray-400 font-mono">{type}</span>
      </td>
      <td className="py-3 align-top text-sm text-gray-500">{desc}</td>
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
    'bg-gray-100 text-gray-700'

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-3 pr-4 align-top">
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${statusColor}`}>{status}</span>
      </td>
      <td className="py-3 pr-4 align-top w-48">
        <code className="text-xs font-mono text-gray-700">{code}</code>
      </td>
      <td className="py-3 pr-4 align-top text-sm text-gray-500 max-w-xs">{when}</td>
      <td className="py-3 align-top text-sm text-gray-600">{action}</td>
    </tr>
  )
}

// ── Section heading with anchor ───────────────────────────────────────────────

function H3({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="scroll-mt-24 text-base font-bold text-gray-900 mb-3 flex items-center gap-2 group">
      {children}
      <a href={`#${id}`} className="opacity-0 group-hover:opacity-100 text-indigo-400 transition-opacity">
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
curl -X POST https://flowmerce.app/api/claims/create \\
  -H "x-api-key: flk_votre_cle_api" \\
  -H "Content-Type: application/json" \\
  -d '{
    "shop_id":            "ma-boutique",
    "order_id":           "CMD-123",
    "customer_name":      "Ahmed Benali",
    "customer_email":     "ahmed@exemple.com",
    "product_name":       "Nike Air Max",
    "reason":             "DEFECTIVE",
    "desired_resolution": "REFUND",
    "description":        "Produit reçu avec un défaut visible sur la semelle."
  }'`,

  JavaScript: `// Côté serveur uniquement (Node.js, Next.js API route, Express, etc.)
// Ne JAMAIS exposer la clé API au navigateur du client.

const res = await fetch("https://flowmerce.app/api/claims/create", {
  method: "POST",
  headers: {
    "x-api-key":    process.env.FLOWMERCE_API_KEY,  // depuis vos env vars
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    shop_id:            "ma-boutique",
    order_id:           "CMD-123",
    customer_name:      "Ahmed Benali",
    customer_email:     "ahmed@exemple.com",
    product_name:       "Nike Air Max",
    reason:             "DEFECTIVE",            // voir liste autorisée
    desired_resolution: "REFUND",               // EXCHANGE | REFUND | REPAIR
    description:        "Produit reçu défectueux.",
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
    "https://flowmerce.app/api/claims/create",
    headers={
        "x-api-key":    os.environ["FLOWMERCE_API_KEY"],
        "Content-Type": "application/json",
    },
    json={
        "shop_id":            "ma-boutique",
        "order_id":           "CMD-123",
        "customer_name":      "Ahmed Benali",
        "customer_email":     "ahmed@exemple.com",
        "product_name":       "Nike Air Max",
        "reason":             "DEFECTIVE",
        "desired_resolution": "REFUND",
        "description":        "Produit reçu défectueux.",
    },
)

response.raise_for_status()
data = response.json()
# data["claim_id"], data["status"], data["message"]`,

  PHP: `<?php
// Côté serveur Laravel — jamais côté client.
$response = \\Illuminate\\Support\\Facades\\Http::withHeaders([
    'x-api-key'    => env('FLOWMERCE_API_KEY'),
    'Content-Type' => 'application/json',
])->post('https://flowmerce.app/api/claims/create', [
    'shop_id'            => 'ma-boutique',
    'order_id'           => 'CMD-123',
    'customer_name'      => 'Ahmed Benali',
    'customer_email'     => 'ahmed@exemple.com',
    'product_name'       => 'Nike Air Max',
    'reason'             => 'DEFECTIVE',
    'desired_resolution' => 'REFUND',
    'description'        => 'Produit reçu défectueux.',
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

export default function DocsPage() {
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
    <div className="min-h-screen bg-white text-gray-900">

      {/* ── Navbar ── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center">
            <Link href="/">
              <Image src="/logos/logo-lockup.svg" alt="Flowmerce" width={160} height={32} priority />
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-500">
            <Link href="/#features" className="hover:text-gray-900 transition-colors">Fonctionnalités</Link>
            <Link href="/#how-it-works" className="hover:text-gray-900 transition-colors">Comment ça marche</Link>
            <Link href="/docs" className="text-indigo-600 font-semibold">Documentation</Link>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/auth/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors px-3 py-2">
              Se connecter
            </Link>
            <Link
              href="/auth/register"
              className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
            >
              Commencer gratuitement
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-12 px-6 bg-linear-to-b from-indigo-50/60 to-white">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white border border-indigo-100 text-indigo-700 text-xs font-semibold px-4 py-1.5 rounded-full mb-8 shadow-sm">
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full inline-block" />
            Documentation API
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.1] mb-5">
            Intégrez Flowmerce
            <br />
            <span className="text-indigo-600">en quelques minutes</span>
          </h1>
          <p className="text-lg text-gray-500 leading-relaxed max-w-xl mx-auto">
            Deux façons d'intégrer Flowmerce à votre site e-commerce custom.
            Choisissez celle qui correspond à votre besoin.
          </p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-6 pb-24 space-y-12">

        {/* ── Authentification (commune) ── */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center shrink-0">
              <IconKey />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Authentification</h2>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
            <p className="text-gray-600 text-sm leading-relaxed">
              Toutes les requêtes API Flowmerce sont authentifiées via une{' '}
              <strong className="text-gray-800">clé API serveur</strong>.
              Deux formats sont acceptés selon l'endpoint :
            </p>

            <CodeBlock
              lang="HTTP headers"
              code={`# Format Bearer (recommandé)
Authorization: Bearer flk_votre_cle_api

# OU format x-api-key (compatible /api/claims/create)
x-api-key: flk_votre_cle_api`}
            />

            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
              <strong>⚠ Sécurité critique :</strong> votre clé API ne doit
              <strong> jamais</strong> apparaître côté navigateur (code source HTML, JavaScript
              client, DevTools). Gardez-la dans vos <strong>variables d'environnement serveur</strong>
              {' '}(<code className="text-xs bg-red-100 px-1 py-0.5 rounded font-mono">FLOWMERCE_API_KEY</code>).
              Aucun préfixe <code className="text-xs bg-red-100 px-1 py-0.5 rounded font-mono">NEXT_PUBLIC_</code>,
              <code className="text-xs bg-red-100 px-1 py-0.5 rounded font-mono">VITE_</code>, etc.
            </div>

            <p className="text-sm text-gray-500">
              Générez et gérez vos clés depuis votre{' '}
              <Link href="/dashboard/api-keys" className="text-indigo-600 hover:underline font-medium">
                tableau de bord
              </Link>. Maximum 5 clés actives par compte. La valeur brute n'est affichée qu'une seule fois — copiez-la immédiatement.
            </p>
          </div>
        </section>

        {/* ── Choix scénario ── */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Choisissez votre intégration</h2>
          <p className="text-sm text-gray-500 mb-6">
            Deux scénarios selon que vous voulez garder la main sur le formulaire de retour ou que
            Flowmerce héberge tout pour vous.
          </p>

          {/* Tab selector */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            <button
              onClick={() => setScenario('A')}
              className={`text-left p-5 rounded-xl border-2 transition-all ${
                scenario === 'A'
                  ? 'border-indigo-600 bg-indigo-50/40 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  scenario === 'A' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  <IconCode />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900">Scénario A</span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-sm text-gray-600">Formulaire embarqué</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Vous concevez votre propre formulaire de retour, vous gardez le contrôle UX complet.
                Une seule requête serveur → Flowmerce.
              </p>
            </button>

            <button
              onClick={() => setScenario('B')}
              className={`text-left p-5 rounded-xl border-2 transition-all ${
                scenario === 'B'
                  ? 'border-indigo-600 bg-indigo-50/40 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  scenario === 'B' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  <IconLink />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900">Scénario B</span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-sm text-gray-600">Page hébergée</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
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
              <div className="bg-white border border-gray-200 rounded-2xl p-6">
                <p className="text-sm text-gray-600 leading-relaxed mb-5">
                  Le client remplit votre propre formulaire (sur votre site). Votre backend reçoit la
                  demande, vérifie qu'elle est légitime, puis appelle Flowmerce. La clé API reste
                  toujours côté serveur.
                </p>
                <CodeBlock
                  lang="Flux serveur → serveur"
                  code={`[Navigateur client]
       │  POST /api/orders/return   (votre endpoint local)
       ▼
[Votre backend]
       │  1. Vérifie que la commande appartient bien à l'utilisateur
       │  2. Évite les doublons (claim déjà existant ?)
       │  3. Mappe les champs vers le format Flowmerce
       │
       │  POST /api/claims/create
       │  x-api-key: flk_xxx
       ▼
[Flowmerce]
       │  4. Validation, rate limit, vérification policy
       │  5. Création du claim + appel ML synchrone
       │  6. Auto-approve / auto-reject / pending
       │  7. Email automatique au client
       │
       │  201 { claim_id, status, message }
       ▼
[Votre backend]
       │  8. Sauvegarde claim_id pour traçabilité
       │
       │  200 OK
       ▼
[Navigateur client]
       9. Affiche "Demande enregistrée" au client`}
                />
              </div>
            </section>

            {/* Endpoint */}
            <section>
              <H3 id="a-endpoint">Endpoint</H3>
              <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">

                <div className="p-6 flex items-center gap-3 flex-wrap">
                  <span className="bg-indigo-100 text-indigo-700 text-xs font-black px-2.5 py-1 rounded-md">POST</span>
                  <code className="text-sm font-mono text-gray-700">https://flowmerce.app/api/claims/create</code>
                </div>

                {/* Champs obligatoires */}
                <div className="p-6 space-y-4">
                  <h4 className="text-sm font-semibold text-gray-800">Champs obligatoires</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider pb-2 pr-4">Champ</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider pb-2 pr-4">Type</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider pb-2">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        <FieldRow name="shop_id"            type="string" required desc="Identifiant unique de votre boutique (libre, ex: ma-boutique)" />
                        <FieldRow name="order_id"           type="string" required desc="Identifiant de la commande dans votre système" />
                        <FieldRow name="customer_name"      type="string" required desc="Nom complet du client" />
                        <FieldRow name="customer_email"     type="string" required desc="Email du client (format vérifié)" />
                        <FieldRow name="product_name"       type="string" required desc="Nom du produit concerné" />
                        <FieldRow name="reason"             type="enum"   required desc="DEFECTIVE | WRONG_ITEM | DESCRIPTION | CHANGE_MIND" />
                        <FieldRow name="desired_resolution" type="enum"   required desc="EXCHANGE | REFUND | REPAIR (choix du client)" />
                        <FieldRow name="description"        type="string" required desc="Description du problème (10–2000 caractères, pas de HTML)" />
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Champs optionnels */}
                <div className="p-6 space-y-4">
                  <h4 className="text-sm font-semibold text-gray-800">Champs optionnels (améliorent fortement la prédiction IA)</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        <FieldRow name="customer_phone"   type="string" desc="Téléphone client (renforce la détection de fraude)" />
                        <FieldRow name="customer_age"     type="number" desc="Âge du client" />
                        <FieldRow name="customer_gender"  type="string" desc="Genre du client" />
                        <FieldRow name="customer_wilaya"  type="string" desc="Wilaya (région) du client" />
                        <FieldRow name="product_category" type="string" desc="Catégorie produit (ex: Electronics, Clothing)" />
                        <FieldRow name="product_price"    type="number" desc="Prix unitaire en DA" />
                        <FieldRow name="product_quantity" type="number" desc="Quantité commandée" />
                        <FieldRow name="order_total"      type="number" desc="Montant total de la commande en DA" />
                        <FieldRow name="shipping_cost"    type="number" desc="Frais de livraison en DA" />
                        <FieldRow name="payment_method"   type="string" desc="Mode de paiement (Cash on Delivery, Card…)" />
                        <FieldRow name="shipping_method"  type="string" desc="Mode de livraison (Home Delivery, Standard…)" />
                        <FieldRow name="order_date"       type="string" desc="Date de commande ISO-8601 (calcule les jours écoulés)" />
                        <FieldRow name="order_address"    type="string" desc="Adresse de livraison" />
                        <FieldRow name="source"           type="string" desc='Marquer la source ("hosted_page" si tunnel hébergé)' />
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Réponse */}
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-gray-800">Réponse</h4>
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
                </div>
              </div>
            </section>

            {/* Exemples de code */}
            <section>
              <H3 id="a-code">Exemple de code</H3>
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="flex border-b border-gray-200 bg-gray-50/60 overflow-x-auto">
                  {LANGS.map(lang => (
                    <button
                      key={lang}
                      onClick={() => selectLang(lang)}
                      className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                        activeLang === lang
                          ? 'border-indigo-600 text-indigo-600 bg-white'
                          : 'border-transparent text-gray-500 hover:text-gray-800'
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
              <div className="bg-white border border-gray-200 rounded-2xl p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider pb-2 pr-4">Status</th>
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider pb-2 pr-4">Code</th>
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider pb-2 pr-4">Quand</th>
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider pb-2">Action recommandée</th>
                      </tr>
                    </thead>
                    <tbody>
                      <ErrorRow status={400} code="VALIDATION"   when="Champ requis manquant, email invalide, HTML détecté, raison/résolution non reconnue" action="Corriger le payload côté votre backend" />
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
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-2 text-sm text-amber-900">
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
              <div className="bg-white border border-gray-200 rounded-2xl p-6">
                <p className="text-sm text-gray-600 leading-relaxed mb-5">
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
       │  POST /api/return/ret_xxx   (soumission)
       │  body: { reason, description, desired_resolution, ... }
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
              <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">

                <div className="p-6 flex items-center gap-3 flex-wrap">
                  <span className="bg-indigo-100 text-indigo-700 text-xs font-black px-2.5 py-1 rounded-md">POST</span>
                  <code className="text-sm font-mono text-gray-700">https://flowmerce.app/api/return-sessions</code>
                </div>

                <div className="p-6 space-y-4">
                  <h4 className="text-sm font-semibold text-gray-800">Champs obligatoires</h4>
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
                  <h4 className="text-sm font-semibold text-gray-800">Champs optionnels (pré-remplissent le formulaire client)</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        <FieldRow name="customer_phone"   type="string" desc="Téléphone du client" />
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
                    <h4 className="text-sm font-semibold text-gray-800">Réponse</h4>
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
                  <p className="text-sm text-gray-500">
                    Envoyez <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">url</code> au
                    client par email/SMS. Le lien expire après <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">expires_in</code> heures
                    et est <strong>à usage unique</strong>.
                  </p>
                </div>
              </div>
            </section>

            {/* Endpoint ÉTAPE 2 */}
            <section>
              <H3 id="b-endpoint-2">Endpoint étape 2 — Soumission du formulaire</H3>
              <div className="bg-white border border-gray-200 rounded-2xl p-6">
                <p className="text-sm text-gray-600 leading-relaxed mb-4">
                  Cette route est appelée automatiquement par la page Flowmerce
                  (<code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">/return/[token]</code>)
                  quand le client soumet le formulaire. <strong>Vous n'avez normalement pas à l'appeler vous-même</strong>,
                  mais voici les détails pour information :
                </p>

                <div className="flex items-center gap-3 flex-wrap mb-4">
                  <span className="bg-gray-100 text-gray-700 text-xs font-black px-2.5 py-1 rounded-md">POST</span>
                  <code className="text-sm font-mono text-gray-700">https://flowmerce.app/api/return/&#123;token&#125;</code>
                </div>

                <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
                  <li>Auth : <strong>token dans l'URL</strong> (pas de clé API)</li>
                  <li>Le token est à usage unique — une fois utilisé, il devient invalide</li>
                  <li>Rate limit : 1 tentative par IP+commande par heure</li>
                  <li>Source du claim créé : <code className="text-xs bg-gray-100 px-1 py-0.5 rounded font-mono">HOSTED_PAGE</code></li>
                </ul>
              </div>
            </section>

            {/* Exemples de code */}
            <section>
              <H3 id="b-code">Exemple de code (étape 1)</H3>
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="flex border-b border-gray-200 bg-gray-50/60 overflow-x-auto">
                  {LANGS.map(lang => (
                    <button
                      key={lang}
                      onClick={() => selectLang(lang)}
                      className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                        activeLang === lang
                          ? 'border-indigo-600 text-indigo-600 bg-white'
                          : 'border-transparent text-gray-500 hover:text-gray-800'
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
              <div className="bg-white border border-gray-200 rounded-2xl p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider pb-2 pr-4">Status</th>
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider pb-2 pr-4">Code</th>
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider pb-2 pr-4">Quand</th>
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider pb-2">Action recommandée</th>
                      </tr>
                    </thead>
                    <tbody>
                      <ErrorRow status={400} code="VALIDATION"   when="Champ requis manquant, email invalide, HTML détecté" action="Corriger le payload" />
                      <ErrorRow status={401} code="AUTH"         when="Clé API invalide ou désactivée" action="Vérifier la clé dans /dashboard/api-keys" />
                      <ErrorRow status={422} code="RETURN_WINDOW_EXPIRED" when="order_date dépasse maxClaimDays (return policy)" action="Ne pas proposer le retour au client" />
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-400 mt-4">
                  Note : les erreurs ML / fraud / duplication surviennent à l'étape 2 (formulaire client) et sont
                  gérées par Flowmerce ; le client en est notifié sur la page hébergée.
                </p>
              </div>
            </section>

            {/* Bonnes pratiques B */}
            <section>
              <H3 id="b-best-practices">Bonnes pratiques</H3>
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-6 space-y-2 text-sm text-indigo-900">
                <p>✓ Stocker le <code className="bg-indigo-100 px-1 rounded">token</code> côté votre BDD pour retrouver le claim plus tard</p>
                <p>✓ Adapter <code className="bg-indigo-100 px-1 rounded">expires_in</code> selon votre cas (court = sécurité, long = confort client)</p>
                <p>✓ Régénérer un nouveau lien si l'ancien expire (ils ne sont pas renouvelables)</p>
                <p>✓ Envoyer l'URL via un canal authentifié (email du client, SMS sur son numéro vérifié)</p>
                <p>✓ Inclure <code className="bg-indigo-100 px-1 rounded">order_date</code> pour bloquer en amont les retours hors délai</p>
              </div>
            </section>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* INTÉGRATIONS NATIVES (commun)                                       */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Intégrations natives</h2>
          <div className="bg-white border border-gray-200 rounded-2xl p-8 flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center shrink-0 text-2xl font-black text-gray-300">
              S
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h3 className="text-base font-semibold text-gray-900">Intégration Shopify native</h3>
                <span className="bg-indigo-100 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                  Bientôt disponible
                </span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed max-w-lg">
                Un plugin Shopify officiel Flowmerce est en cours de développement.
                Il permettra d'intégrer Flowmerce en un clic, sans écrire une seule ligne de code.
              </p>
            </div>
            <button
              disabled
              className="shrink-0 px-5 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 text-gray-400 cursor-not-allowed"
            >
              Disponible prochainement
            </button>
          </div>
        </section>

        {/* CTA final */}
        <section className="bg-linear-to-br from-indigo-50 to-white border border-indigo-100 rounded-2xl p-10 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Prêt à démarrer ?</h2>
          <p className="text-gray-500 text-sm mb-8 max-w-md mx-auto">
            Créez votre compte et générez votre première clé API en moins de 2 minutes.
            Aucune carte bancaire requise.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/auth/register"
              className="bg-indigo-600 text-white px-7 py-3 rounded-xl text-sm font-semibold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all"
            >
              Créer mon compte
            </Link>
            <Link
              href="/dashboard/api-keys"
              className="bg-white text-gray-700 px-7 py-3 rounded-xl text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition-all"
            >
              Générer ma clé API
            </Link>
          </div>
        </section>

      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center">
            <Image src="/logos/logo-lockup.svg" alt="Flowmerce" width={140} height={28} />
          </div>
          <p className="text-sm text-gray-400">
            &copy; 2026 Flowmerce. Tous droits réservés.
          </p>
          <div className="flex gap-6 text-sm text-gray-400">
            <a href="#" className="hover:text-gray-600 transition-colors">Confidentialité</a>
            <a href="#" className="hover:text-gray-600 transition-colors">Conditions</a>
            <Link href="/auth/login" className="hover:text-gray-600 transition-colors">Connexion</Link>
          </div>
        </div>
      </footer>

    </div>
  )
}
