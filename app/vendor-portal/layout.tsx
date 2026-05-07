// app/vendor-portal/layout.tsx — Flowmerce
//
// Layout minimal pour le portail vendeur.
// IMPORTANT : ce fichier court-circuite le layout parent (dashboard/layout.tsx)
// qui appelle auth() et injecte la nav admin.
// Le portail vendeur est accessible SANS session Flowmerce — uniquement via token.

export const metadata = {
  title:       'Portail retours — Flowmerce',
  description: 'Espace sécurisé de gestion des retours vendeur',
  robots:      'noindex, nofollow',
}

export default function VendorPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Rendu brut : pas de nav, pas de sidebar, pas de vérification de session.
  return <>{children}</>
}