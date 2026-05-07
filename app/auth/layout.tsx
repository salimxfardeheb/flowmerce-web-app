// app/auth/layout.tsx — Flowmerce
//
// Layout minimaliste pour les pages d'authentification.
// signIn() de next-auth/react ne nécessite pas SessionProvider.

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}