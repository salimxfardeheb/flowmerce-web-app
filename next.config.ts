import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build Docker uniquement : produit .next/standalone (serveur Node autonome).
  // Les builds Vercel et Capacitor conservent le comportement par défaut.
  output: process.env.DOCKER_BUILD === "true" ? "standalone" : undefined,
  trailingSlash: true,   // ← recommandé pour Capacitor
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
    ],
  }];
}
};

export default nextConfig;