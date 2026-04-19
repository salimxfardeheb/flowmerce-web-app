import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const PatchClaimSchema = z.object({
  status:          z.enum(["APPROVED", "REJECTED", "IN_PROGRESS"]).optional(),
  aiDecision:      z.enum(["Refund", "Exchange", "Repair", "Reject"]).optional(),
  overrideShipping: z.string().max(200).nullable().optional(),
  overrideNote:    z.string().max(500).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ claimId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const user = session.user;
  const { claimId } = await params;

  const vendor = await prisma.vendor.findUnique({ where: { userId: user.id } });
  if (!vendor) return NextResponse.json({ error: "Vendeur introuvable" }, { status: 404 });

  const parsed = PatchClaimSchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });

  const { status, aiDecision, overrideShipping, overrideNote } = parsed.data;

  // Vérifier que la réclamation appartient bien à ce vendeur
  const claim = await prisma.claim.findFirst({
    where: { id: claimId, vendorId: vendor.id },
  });
  if (!claim) return NextResponse.json({ error: "Réclamation introuvable" }, { status: 404 });

  // Construire les données à mettre à jour
  const updateData: Record<string, unknown> = {};

  // ── Mise à jour du statut ────────────────────────────────────
  if (status) {
    updateData.status      = status;
    updateData.processedAt = new Date();
  }

  // ── Override décision ML ──────────────────────────────────────
  if (aiDecision) {

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