import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/vendors/me
 * Retourne le statut du vendeur connecté.
 * Utilisé par VendorAccessGuard (client) pour détecter un compte bloqué.
 */
export async function GET() {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const user = session.user;

  const vendor = await prisma.vendor.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      status: true,
      rejectionReason: true,
      requestedDocuments: true,
    },
  });

  // ADMIN sans Vendor → noVendor: true, la page redirige vers /dashboard
  if (!vendor && user?.role === "ADMIN")
    return NextResponse.json({ isAdmin: true, isBlocked: false, noVendor: true });

  if (!vendor)
    return NextResponse.json({ error: "Vendeur introuvable" }, { status: 404 });

  const isSuspended =
    vendor.status === "REJECTED" &&
    (vendor.rejectionReason?.startsWith("[SUSPENDU]") ?? false);

  // ADMIN avec Vendor : jamais bloqué quelle que soit le statut
  const isBlocked = user?.role === "ADMIN"
    ? false
    : isSuspended ||
      vendor.status === "PENDING" ||
      vendor.status === "DOCUMENTS_REQUESTED";

  return NextResponse.json({ ...vendor, isAdmin: user?.role === "ADMIN", isSuspended, isBlocked });
}