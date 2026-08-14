'use client'

import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next'

/**
 * Vercel Web Analytics.
 *
 * Enveloppé dans un composant client pour une seule raison : `beforeSend` est
 * une fonction, donc impossible à passer depuis le layout racine, qui est un
 * composant serveur.
 *
 * Ce que la redaction protège — l'événement envoyé porte l'URL complète de la
 * page (cf. `BeforeSendEvent.url`), et deux de nos routes en mettent trop :
 *
 *   · /return/<token>        le jeton vaut autorisation de déposer une
 *                            réclamation au nom d'un client. Il n'a rien à
 *                            faire dans un tableau de bord tiers, et l'URL
 *                            désigne à elle seule un client identifiable.
 *   · /dashboard/claims/<id> et /admin/clients/<id> — identifiants internes
 *                            de réclamation et de vendeur.
 *
 * On garde la forme de la route, qui est tout ce dont sert une statistique de
 * fréquentation, et on jette la partie variable.
 *
 * Analytics ne pose ni cookie ni identifiant persistant : rien à ajouter au
 * bandeau de consentement. Le script n'est chargé que sur un déploiement
 * Vercel ; en local le composant ne fait rien.
 */

const REDACTED: { pattern: RegExp; replacement: string }[] = [
  { pattern: /^\/return\/[^/]+/,                replacement: '/return/[token]' },
  { pattern: /^\/dashboard\/claims\/[^/]+/,     replacement: '/dashboard/claims/[claimId]' },
  { pattern: /^\/admin\/clients\/[^/]+/,        replacement: '/admin/clients/[vendorId]' },
]

function redact(event: BeforeSendEvent): BeforeSendEvent {
  let url: URL
  try {
    url = new URL(event.url)
  } catch {
    // URL illisible : on préfère perdre l'événement que le laisser passer tel
    // quel sans avoir pu l'inspecter.
    return { ...event, url: '/' }
  }

  for (const { pattern, replacement } of REDACTED) {
    if (pattern.test(url.pathname)) {
      url.pathname = url.pathname.replace(pattern, replacement)
      break
    }
  }

  return { ...event, url: url.toString() }
}

export function WebAnalytics() {
  return <Analytics beforeSend={redact} />
}
