import { BookOpen, Home, Mail } from "lucide-react";

/**
 * Destinations publiques atteignables depuis les espaces connectés.
 *
 * Partagé entre `DashboardNav` (vendeur) et `AdminNav` : ces deux sidebars ont
 * des palettes différentes, donc on ne mutualise que les données — pas le
 * rendu. Sans ça, ajouter une page publique obligerait à penser aux deux
 * fichiers, et l'un des deux finirait par être oublié.
 */
export const SITE_LINKS = [
  { href: "/", label: "Accueil", Icon: Home },
  { href: "/docs", label: "Documentation", Icon: BookOpen },
  { href: "/contact", label: "Contact", Icon: Mail },
] as const;
