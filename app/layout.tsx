import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

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
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
