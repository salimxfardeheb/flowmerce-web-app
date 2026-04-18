import { getSessionServer } from "@/lib/getSession";
/**
 * vendorGuard.ts
 *
 * Appeler cette fonction en haut de chaque sous-page dashboard (Server Component).
 * Si le compte vendeur est bloqué (PENDING, DOCUMENTS_REQUESTED, ou SUSPENDU),
 * l'utilisateur est redirigé vers /dashboard qui affiche le banner d'erreur.
 */


import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function checkVendorAccess() {
  const session = await getSessionServer();
  if (!session) redirect("/auth/login");

  const user = session.user as any;

  const vendor = await prisma.vendor.findUnique({
    where: { userId: user.id },
    select: { status: true, rejectionReason: true },
  });

  // ADMIN sans Vendor → redirection vers /dashboard (qui gère l'affichage)
  if (!vendor && user?.role === "ADMIN") redirect("/dashboard");

  // VENDOR sans profil → créer son profil
  if (!vendor) redirect("/auth/register");

  // ADMIN avec Vendor : accès complet quel que soit le statut
  if (user?.role === "ADMIN") return;

  const isSuspended =
    vendor.status === "REJECTED" &&
    (vendor.rejectionReason?.startsWith("[SUSPENDU]") ?? false);

  const isBlocked =
    isSuspended ||
    vendor.status === "PENDING" ||
    vendor.status === "DOCUMENTS_REQUESTED";

  if (isBlocked) {
    redirect("/dashboard");
  }
}