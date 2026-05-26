// app/layout.tsx — Flowmerce
//
// Root layout SANS SessionProvider.
// SessionProvider est maintenant dans app/dashboard/layout.tsx uniquement,
// ce qui évite le ClientFetchError sur les pages publiques (/auth/*, ...).

import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: "Flowmerce",
  description: "Gérez vos retours et réclamations clients avec Flowmerce",
  icons: {
    icon: "/logos/logo-mark.svg",
    apple: "/logos/logo-mark.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}