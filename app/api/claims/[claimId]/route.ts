import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ claimId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const user = session.user as any;
  const { claimId } = await params;

  const vendor = await prisma.vendor.findUnique({ where: { userId: user.id } });
  if (!vendor) return NextResponse.json({ error: "Vendeur introuvable" }, { status: 404 });

  const body = await req.json();
  const { status, aiDecision, overrideShipping, overrideNote } = body;

  // Vérifier que la réclamation appartient bien à ce vendeur
  const claim = await prisma.claim.findFirst({
    where: { id: claimId, vendorId: vendor.id },
  });
  if (!claim) return NextResponse.json({ error: "Réclamation introuvable" }, { status: 404 });

  // Construire les données à mettre à jour
  const updateData: Record<string, unknown> = {};

  // ── Mise à jour du statut ────────────────────────────────────
  if (status) {
    const validStatuses = ["APPROVED", "REJECTED", "IN_PROGRESS"];
    if (!validStatuses.includes(status))
      return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
    updateData.status      = status;
    updateData.processedAt = new Date();
  }

  // ── Override décision ML ──────────────────────────────────────
  if (aiDecision) {
    const validResolutions = ["Refund", "Exchange", "Repair", "Reject"];
    if (!validResolutions.includes(aiDecision))
      return NextResponse.json({ error: "Résolution invalide" }, { status: 400 });

    updateData.aiDecision = aiDecision;

    // Mettre à jour aussi le champ prediction pour stocker l'override
    const currentPrediction = (claim.prediction as Record<string, unknown>) ?? {};
    updateData.prediction = {
      ...currentPrediction,
      override: {
        resolution:       aiDecision,
        shipping:         overrideShipping ?? null,
        note:             overrideNote     ?? null,
        overriddenAt:     new Date().toISOString(),
        overriddenBy:     user.id,
        originalDecision: claim.aiDecision,
      },
    };

    // Mettre à jour le status en cohérence avec la décision
    if (!status) {
      updateData.status     = aiDecision === "Reject" ? "REJECTED" : "APPROVED";
      updateData.processedAt = new Date();
    }
  }

  const updated = await prisma.claim.update({
    where: { id: claimId },
    data:  updateData,
  });

  return NextResponse.json({ claim: updated });
}