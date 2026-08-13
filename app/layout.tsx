// app/layout.tsx — Flowmerce
//
// Root layout SANS SessionProvider.
// SessionProvider est maintenant dans app/dashboard/layout.tsx uniquement,
// ce qui évite le ClientFetchError sur les pages publiques (/auth/*, ...).

import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
})

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
    <html lang="fr" className={jakarta.variable} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}