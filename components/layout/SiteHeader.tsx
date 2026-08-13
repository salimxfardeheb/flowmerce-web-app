import { auth } from "@/lib/auth";
import { LandingNav } from "@/components/layout/LandingNav";

/**
 * En-tête des pages publiques.
 *
 * La session est lue côté serveur puis passée en props : `useSession()` est
 * impossible ici, le SessionProvider n'existe que sous /dashboard (il provoquait
 * un ClientFetchError sur les pages publiques). Seuls le nom et l'email
 * traversent la frontière, pas le rôle ni le vendorId.
 *
 * Conséquence : toute page qui affiche cet en-tête est rendue dynamiquement.
 */
export async function SiteHeader() {
  const session = await auth();
  const user = session?.user
    ? { name: session.user.name, email: session.user.email }
    : null;

  return <LandingNav user={user} />;
}
