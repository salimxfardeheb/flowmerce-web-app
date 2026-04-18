import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/vendors/documents/[documentId]
 * Admin : accepte ou refuse un document soumis par un vendeur.
 * Si tous les documents demandés sont ACCEPTED → vendeur auto-approuvé.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const user = session.user as any;
  if (user?.role !== "ADMIN")
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { documentId } = await params;
  const { status, rejectionReason } = await req.json();

  if (!["ACCEPTED", "REJECTED"].includes(status))
    return NextResponse.json({ error: "Statut invalide" }, { status: 400 });

  // Mettre à jour le document
  const document = await prisma.document.update({
    where: { id: documentId },
    data: {
      status,
      rejectionReason: status === "REJECTED" ? (rejectionReason || null) : null,
    },
  });

  // Récupérer le vendeur avec tous ses documents
  const vendor = await prisma.vendor.findUnique({
    where: { id: document.vendorId },
    include: { documents: true },
  });

  if (!vendor)
    return NextResponse.json({ error: "Vendeur introuvable" }, { status: 404 });

  // ── Auto-approbation ──────────────────────────────────────────
  // Fonctionne que le vendeur soit en DOCUMENTS_REQUESTED (première
  // validation) ou qu'il ait été rebloqué après approbation.
  if (
    vendor.status === "DOCUMENTS_REQUESTED" &&
    vendor.requestedDocuments.length > 0
  ) {
    const allAccepted = (vendor.requestedDocuments as string[]).every((docType) => {
      const submitted = vendor.documents.find((d) => d.type === docType);
      return submitted?.status === "ACCEPTED";
    });

    if (allAccepted) {
      await prisma.vendor.update({
        where: { id: vendor.id },
        data: {
          status: "APPROVED",
          rejectionReason: null,
          requestedDocuments: [],
        },
      });
      return NextResponse.json({ document, autoApproved: true });
    }
  }

  return NextResponse.json({ document, autoApproved: false });
}