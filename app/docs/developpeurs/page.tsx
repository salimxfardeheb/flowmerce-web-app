import type { Metadata } from 'next'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { DeveloperDocs } from '@/components/docs/DeveloperDocs'

export const metadata: Metadata = {
  title: 'Documentation développeur | Flowmerce',
  description:
    "Référence technique Flowmerce : authentification par clé API, endpoints de retour, formats de réponse et codes d'erreur.",
}

// Coquille serveur. Le contenu reste un Client Component (onglets de scénario
// et sélecteur de langage), mais l'en-tête a besoin de `auth()` côté serveur :
// il ne peut donc pas vivre à l'intérieur.
export default function DocsDeveloperPage() {
  return (
    <div className="min-h-dvh bg-page text-ink font-sans">
      <SiteHeader />
      <DeveloperDocs />
      <SiteFooter />
    </div>
  )
}
