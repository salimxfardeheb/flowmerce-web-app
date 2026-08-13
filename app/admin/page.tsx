import { redirect } from "next/navigation";

/**
 * `/admin` n'a pas de tableau de bord propre : c'est le point d'entrée du panel
 * (connexion d'un administrateur, lien du logo, saisie manuelle de l'URL). On
 * renvoie vers la première entrée de la navigation, les inscriptions à traiter.
 *
 * Le contrôle de session et de rôle est déjà fait par `app/admin/layout.tsx`.
 */
export default function AdminIndexPage() {
  redirect("/admin/vendors");
}
