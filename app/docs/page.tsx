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

function IconArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7" />
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

// ── Code block with copy button ───────────────────────────────────────────────

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
  name,
  type,
  required,
  desc,
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

// ── Language examples ─────────────────────────────────────────────────────────

const LANG_KEY = 'flowmerce_docs_lang'

const LANGS = ['cURL', 'JavaScript', 'Python', 'PHP'] as const
type Lang = (typeof LANGS)[number]

const CODE_EXAMPLES: Record<Lang, string> = {
  cURL: `curl -X POST https://flowmerce.app/api/return-sessions \\
  -H "Authorization: Bearer flk_votre_cle_api" \\
  -H "Content-Type: application/json" \\
  -d '{
    "order_id": "CMD-123",
    "customer_email": "client@exemple.com",
    "customer_name": "Ahmed Benali",
    "product_name": "Nike Air Max"
  }'`,

  JavaScript: `const res = await fetch("https://flowmerce.app/api/return-sessions", {
  method: "POST",
  headers: {
    "Authorization": "Bearer flk_votre_cle_api",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    order_id: "CMD-123",
    customer_email: "client@exemple.com",
    customer_name: "Ahmed Benali",
    product_name: "Nike Air Max",
  }),
});

const { url } = await res.json();
// Redirige le client → url`,

  Python: `import requests

response = requests.post(
    "https://flowmerce.app/api/return-sessions",
    headers={
        "Authorization": "Bearer flk_votre_cle_api",
        "Content-Type": "application/json",
    },
    json={
        "order_id": "CMD-123",
        "customer_email": "client@exemple.com",
        "customer_name": "Ahmed Benali",
        "product_name": "Nike Air Max",
    },
)

data = response.json()
url = data["url"]
# Redirige le client → url`,

  PHP: `$response = \\Illuminate\\Support\\Facades\\Http::withHeaders([
    'Authorization' => 'Bearer flk_votre_cle_api',
    'Content-Type'  => 'application/json',
])->post('https://flowmerce.app/api/return-sessions', [
    'order_id'       => 'CMD-123',
    'customer_email' => 'client@exemple.com',
    'customer_name'  => 'Ahmed Benali',
    'product_name'   => 'Nike Air Max',
]);

$url = $response->json('url');
// Redirige le client → $url`,
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DocsPage() {
  const [activeLang, setActiveLang] = useState<Lang>('cURL')
  const [copiedSection, setCopiedSection] = useState<string | null>(null)

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

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedSection(id)
      setTimeout(() => setCopiedSection(null), 2000)
    })
  }

  const REQUEST_BODY = `{
  "order_id":       "CMD-123",
  "customer_email": "client@ex.com",
  "customer_name":  "Ahmed Benali",
  "product_name":   "Nike Air Max",
  "customer_phone": "0555123456",
  "order_date":     "2026-04-15",
  "shop_name":      "MonShop",
  "expires_in":     72
}`

  const RESPONSE_BODY = `{
  "token":      "ret_xxxxxxxxxxxx",
  "url":        "https://flowmerce.app/return/ret_xxxxxxxxxxxx",
  "expires_at": "2026-05-20T18:00:00.000Z"
}`

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
            <Link href="/#features" className="hover:text-gray-900 transition-colors">Fonctionnalites</Link>
            <Link href="/#how-it-works" className="hover:text-gray-900 transition-colors">Comment ca marche</Link>
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
      <section className="pt-32 pb-16 px-6 bg-linear-to-b from-indigo-50/60 to-white">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white border border-indigo-100 text-indigo-700 text-xs font-semibold px-4 py-1.5 rounded-full mb-8 shadow-sm">
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full inline-block" />
            Documentation API
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.1] mb-5">
            Integrez Flowmerce
            <br />
            <span className="text-indigo-600">en quelques minutes</span>
          </h1>
          <p className="text-lg text-gray-500 leading-relaxed max-w-xl mx-auto">
            Une seule requete API suffit pour lancer un portail de retour client.
            Flowmerce gere tout le reste — analyse, decision, notification.
          </p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-6 pb-24 space-y-16">

        {/* ── Section 1 : Authentification ── */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center shrink-0">
              <IconKey />
            </div>
            <h2 className="text-xl font-bold text-gray-900">1. Authentification</h2>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
            <p className="text-gray-600 text-sm leading-relaxed">
              Toutes les requetes API Flowmerce sont authentifiees via une{' '}
              <strong className="text-gray-800">cle API</strong> a passer dans le header{' '}
              <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">Authorization</code>.
              Generez la votre depuis votre tableau de bord.
            </p>

            <CodeBlock
              lang="HTTP header"
              code={`Authorization: Bearer flk_votre_cle_api`}
            />

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              <strong>Important :</strong> Ne partagez jamais votre cle API. Elle donne acces a toutes
              les donnees de votre boutique. En cas de compromission, regenerez-la immediatement depuis
              votre{' '}
              <Link href="/dashboard/api-keys" className="underline font-medium">
                tableau de bord
              </Link>.
            </div>
          </div>
        </section>

        {/* ── Section 2 : Flux ── */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center shrink-0 text-sm font-black">
              2
            </div>
            <h2 className="text-xl font-bold text-gray-900">2. Flux d'integration</h2>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <p className="text-sm text-gray-600 leading-relaxed mb-6">
              Le flux recommande est la <strong className="text-gray-800">page de retour heberg&eacute;e</strong> —
              vous creer une session depuis votre backend, puis vous redirigez votre client.
              Flowmerce affiche le formulaire, analyse la demande et vous renvoie la decision.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {[
                { step: '1', label: 'Votre backend crée une session', sub: 'POST /api/return-sessions' },
                { step: '2', label: 'Redirigez le client', sub: 'vers url retournée' },
                { step: '3', label: 'Flowmerce traite', sub: 'formulaire + analyse IA' },
                { step: '4', label: 'Décision & notification', sub: 'email client auto' },
              ].map((item, i, arr) => (
                <div key={item.step} className="flex sm:flex-col items-center gap-2 sm:gap-0 flex-1">
                  <div className="flex sm:flex-col items-center flex-1 gap-2 sm:gap-0">
                    <div className="w-8 h-8 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {item.step}
                    </div>
                    <div className="text-center sm:mt-2">
                      <p className="text-xs font-semibold text-gray-800">{item.label}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{item.sub}</p>
                    </div>
                  </div>
                  {i < arr.length - 1 && (
                    <div className="text-gray-300 sm:hidden">
                      <IconArrow />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Section 3 : Endpoint ── */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center shrink-0 text-sm font-black">
              3
            </div>
            <h2 className="text-xl font-bold text-gray-900">
              3. Endpoint — <code className="font-mono text-indigo-600">POST /api/return-sessions</code>
            </h2>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">

            {/* Method + URL */}
            <div className="p-6 flex items-center gap-3">
              <span className="bg-indigo-100 text-indigo-700 text-xs font-black px-2.5 py-1 rounded-md">POST</span>
              <code className="text-sm font-mono text-gray-700">https://flowmerce.app/api/return-sessions</code>
            </div>

            {/* Request body */}
            <div className="p-6 space-y-4">
              <h3 className="text-sm font-semibold text-gray-800">Body JSON</h3>
              <div className="relative">
                <button
                  onClick={() => copyToClipboard(REQUEST_BODY, 'request')}
                  className="absolute top-3 right-3 flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors z-10"
                >
                  {copiedSection === 'request' ? <IconCheck /> : <IconCopy />}
                  {copiedSection === 'request' ? 'Copie !' : 'Copier'}
                </button>
                <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-950">
                  <pre className="p-4 text-sm text-gray-200 overflow-x-auto leading-relaxed font-mono whitespace-pre">
                    <code>{REQUEST_BODY}</code>
                  </pre>
                </div>
              </div>

              {/* Fields table */}
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
                    <FieldRow name="order_id"       type="string" required desc="Identifiant unique de la commande dans votre systeme" />
                    <FieldRow name="customer_email" type="string" required desc="Email du client — doit etre valide (format verifie)" />
                    <FieldRow name="customer_name"  type="string" required desc="Nom complet du client" />
                    <FieldRow name="product_name"   type="string" required desc="Nom du produit concerne par la demande de retour" />
                    <FieldRow name="customer_phone" type="string"          desc="Numero de telephone (optionnel — ameliore la detection de fraude)" />
                    <FieldRow name="order_date"     type="string"          desc="Date de la commande au format ISO-8601 (ex. 2026-04-15) — calcule automatiquement les jours ecoules" />
                    <FieldRow name="shop_name"      type="string"          desc="Nom de votre boutique (affiche sur la page de retour client)" />
                    <FieldRow name="expires_in"     type="number"          desc="Duree de validite du lien en heures (defaut : 72)" />
                  </tbody>
                </table>
              </div>
            </div>

            {/* Response */}
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-800">Reponse</h3>
                <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded">201 Created</span>
              </div>
              <div className="relative">
                <button
                  onClick={() => copyToClipboard(RESPONSE_BODY, 'response')}
                  className="absolute top-3 right-3 flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors z-10"
                >
                  {copiedSection === 'response' ? <IconCheck /> : <IconCopy />}
                  {copiedSection === 'response' ? 'Copie !' : 'Copier'}
                </button>
                <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-950">
                  <pre className="p-4 text-sm text-gray-200 overflow-x-auto leading-relaxed font-mono whitespace-pre">
                    <code>{RESPONSE_BODY}</code>
                  </pre>
                </div>
              </div>
              <p className="text-sm text-gray-500">
                Redirigez votre client vers{' '}
                <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">url</code>.
                Le lien expire apres <strong>expires_in</strong> heures (defaut 72h).
              </p>
            </div>
          </div>
        </section>

        {/* ── Section 4 : Exemples de code ── */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center shrink-0 text-sm font-black">
              4
            </div>
            <h2 className="text-xl font-bold text-gray-900">4. Exemples de code</h2>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-gray-200 bg-gray-50/60">
              {LANGS.map(lang => (
                <button
                  key={lang}
                  onClick={() => selectLang(lang)}
                  className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    activeLang === lang
                      ? 'border-indigo-600 text-indigo-600 bg-white'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>

            {/* Code */}
            <div className="p-5">
              <CodeBlock code={CODE_EXAMPLES[activeLang]} lang={activeLang} />
            </div>
          </div>
        </section>

        {/* ── Section 5 : Shopify Coming Soon ── */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center shrink-0 text-sm font-black">
              5
            </div>
            <h2 className="text-xl font-bold text-gray-900">5. Integrations natives</h2>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-8 flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center shrink-0 text-2xl font-black text-gray-300">
              S
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h3 className="text-base font-semibold text-gray-900">Integration Shopify native</h3>
                <span className="bg-indigo-100 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                  Bientot disponible
                </span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed max-w-lg">
                Un plugin Shopify officiel Flowmerce est en cours de developpement.
                Il permettra d'integrer Flowmerce en un clic, sans ecrire une seule ligne de code.
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

        {/* ── Section 6 : CTA final ── */}
        <section className="bg-linear-to-br from-indigo-50 to-white border border-indigo-100 rounded-2xl p-10 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Pret a demarrer ?</h2>
          <p className="text-gray-500 text-sm mb-8 max-w-md mx-auto">
            Creer votre compte et generez votre premiere cle API en moins de 2 minutes.
            Aucune carte bancaire requise.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/auth/register"
              className="bg-indigo-600 text-white px-7 py-3 rounded-xl text-sm font-semibold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all"
            >
              Creer mon compte
            </Link>
            <Link
              href="/dashboard/api-keys"
              className="bg-white text-gray-700 px-7 py-3 rounded-xl text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition-all"
            >
              Generer ma cle API
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
            &copy; 2026 Flowmerce. Tous droits reserves.
          </p>
          <div className="flex gap-6 text-sm text-gray-400">
            <a href="#" className="hover:text-gray-600 transition-colors">Confidentialite</a>
            <a href="#" className="hover:text-gray-600 transition-colors">Conditions</a>
            <Link href="/auth/login" className="hover:text-gray-600 transition-colors">Connexion</Link>
          </div>
        </div>
      </footer>

    </div>
  )
}
