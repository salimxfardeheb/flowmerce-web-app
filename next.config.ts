import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build Docker uniquement : produit .next/standalone (serveur Node autonome).
  // Les builds Vercel et Capacitor conservent le comportement par défaut.
  output: process.env.DOCKER_BUILD === "true" ? "standalone" : undefined,

  // Réservé au build Capacitor, qui sert des fichiers depuis le système de
  // fichiers de l'appareil et a besoin des slashs finaux.
  //
  // Il était actif partout, y compris sur le web : `POST /api/v1/returns`
  // répondait alors un 308 vers `/api/v1/returns/`. Les clients HTTP qui
  // suivent les redirections s'en accommodaient, mais pas `curl` sans `-L` —
  // c'est-à-dire l'exemple d'intégration de notre propre documentation, qui ne
  // soumettait donc rien du tout.
  trailingSlash: process.env.MOBILE_BUILD === "true",
  images: {
    unoptimized: process.env.MOBILE_BUILD === "true", 
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
  async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=()' },
      // HSTS — 2 ans. Volontairement sans `includeSubDomains` ni `preload` :
      // les deux sont retenus par le navigateur pendant toute la durée du
      // max-age, donc quasi irréversibles. Les ajouter une fois confirmé
      // qu'aucun sous-domaine ne sert en clair.
      { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
    ],
  }];
}
};

export default nextConfig;