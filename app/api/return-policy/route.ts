// src/app/api/return-policy/route.ts
import { getSessionFromRequest } from "@/lib/getSession";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const ReturnPolicySchema = z.object({
  allowRefusalOnDelivery: z.boolean().optional(),
  maxClaimDays:           z.number().int().min(1).max(365).optional(),
  acceptedTypes:          z.array(z.enum(["EXCHANGE", "REFUND", "REPAIR"])).optional(),
  validationMode:         z.enum(["MANUAL", "AI_AUTO"]).optional(),
  fraudScoreThreshold:    z.number().int().min(0).max(100).optional(),
  fraudReturnThreshold:   z.number().int().min(1).max(100).optional(),
});

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const user = session.user;

  const vendor = await prisma.vendor.findUnique({ where: { userId: user.id } });
  if (!vendor) return NextResponse.json({ error: "Vendeur introuvable" }, { status: 404 });

  const policy = await prisma.returnPolicy.findUnique({ where: { vendorId: vendor.id } });

  // Retourner aussi les catégories du vendeur (choisies à l'inscription)
  return NextResponse.json({
    policy,
    vendorCategories: (vendor as any).vendorCategories ?? [],
  });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const user = session.user;

  const vendor = await prisma.vendor.findUnique({ where: { userId: user.id } });
  if (!vendor) return NextResponse.json({ error: "Vendeur introuvable" }, { status: 404 });

  // ADMIN avec un Vendor peut modifier la politique même si le statut n'est pas APPROVED
  if (vendor.status !== "APPROVED" && user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Compte non approuvé" }, { status: 403 });
  }

  const parsed = ReturnPolicySchema.safeParse(await req.json());
  if (!parsed.success) {
    console.error("[return-policy] validation error:", parsed.error.flatten());
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const { allowRefusalOnDelivery, maxClaimDays, acceptedTypes, validationMode, fraudScoreThreshold, fraudReturnThreshold } = parsed.data;
  const policyData = {
    allowRefusalOnDelivery,
    maxClaimDays,
    acceptedTypes,
    validationMode,
    fraudScoreThreshold:  fraudScoreThreshold  ?? 70,
    fraudReturnThreshold: fraudReturnThreshold ?? 4,
  };

  const policy = await prisma.returnPolicy.upsert({
    where:  { vendorId: vendor.id },
    update: policyData,
    create: { vendorId: vendor.id, ...policyData },
  });

  return NextResponse.json({ policy });
}