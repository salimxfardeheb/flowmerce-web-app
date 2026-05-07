// app/layout.tsx — Flowmerce
//
// Root layout SANS SessionProvider.
// SessionProvider est maintenant dans app/dashboard/layout.tsx uniquement,
// ce qui évite le ClientFetchError sur les pages publiques (/vendor-portal, /auth/*, ...).

import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title:       'Flowmerce - Plateforme Vendeur',
  description: 'Gérez vos retours et réclamations clients avec Flowmerce',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}