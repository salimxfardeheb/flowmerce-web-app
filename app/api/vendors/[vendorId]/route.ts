import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ vendorId: string }> }
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const user = session.user as any;
  if (user?.role !== "ADMIN")
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { vendorId } = await params;
  const { status, rejectionReason, requestedDocuments } = await req.json();

  const validStatuses = ["APPROVED", "REJECTED", "DOCUMENTS_REQUESTED"];
  if (!validStatuses.includes(status))
    return NextResponse.json({ error: "Statut invalide" }, { status: 400 });

  // Récupérer l'état actuel du vendeur
  const currentVendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { status: true },
  });

  if (!currentVendor)
    return NextResponse.json({ error: "Vendeur introuvable" }, { status: 404 });

  // ── Logique de reblocage ──────────────────────────────────────
  // Si l'admin demande des documents supplémentaires à un vendeur
  // APPROUVÉ → on passe en DOCUMENTS_REQUESTED (compte rebloqué).
  // Les anciens documents ACCEPTED sont conservés, seuls les nouveaux
  // types demandés seront en attente.

  const vendor = await prisma.vendor.update({
    where: { id: vendorId },
    data: {
      status,
      rejectionReason: rejectionReason || null,
      requestedDocuments:
        status === "DOCUMENTS_REQUESTED"
          ? (requestedDocuments ?? [])
          : [],
    },
  });

  return NextResponse.json({ vendor });
}