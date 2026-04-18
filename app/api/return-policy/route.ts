// src/app/api/return-policy/route.ts
import { getSessionFromRequest } from "@/lib/getSession";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const user = session.user as any;

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

  const user = session.user as any;

  const vendor = await prisma.vendor.findUnique({ where: { userId: user.id } });
  if (!vendor) return NextResponse.json({ error: "Vendeur introuvable" }, { status: 404 });

  // ADMIN avec un Vendor peut modifier la politique même si le statut n'est pas APPROVED
  if (vendor.status !== "APPROVED" && user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Compte non approuvé" }, { status: 403 });
  }

  const {
    allowRefusalOnDelivery,
    maxClaimDays,
    acceptedTypes,
    validationMode,
    fraudScoreThreshold,
    nonRefundableCategories,
    exchangeOnlyCategories,
    partialRefundEnabled,
    partialRefundAfter50pct,
    partialRefundUsedPenalty,
    acceptedReturnReasons,
  } = await req.json();

  const policyData = {
    allowRefusalOnDelivery,
    maxClaimDays,
    acceptedTypes,
    validationMode,
    fraudScoreThreshold:      fraudScoreThreshold      ?? 70,
    nonRefundableCategories:  nonRefundableCategories  ?? [],
    exchangeOnlyCategories:   exchangeOnlyCategories   ?? [],
    partialRefundEnabled:     partialRefundEnabled      ?? false,
    partialRefundAfter50pct:  partialRefundAfter50pct  ?? 50,
    partialRefundUsedPenalty: partialRefundUsedPenalty ?? 20,
    acceptedReturnReasons:    acceptedReturnReasons    ?? [],
  };

  const policy = await prisma.returnPolicy.upsert({
    where:  { vendorId: vendor.id },
    update: policyData,
    create: { vendorId: vendor.id, ...policyData },
  });

  return NextResponse.json({ policy });
}