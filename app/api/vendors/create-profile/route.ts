// src/app/api/vendors/create-profile/route.ts
// Réservé aux ADMIN : crée un profil Vendor lié au compte existant,
// sans créer de nouvel utilisateur.
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/getSession";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const profileSchema = z.object({
  companyName: z.string().min(2),
  siret:       z.string().optional(),
  phone:       z.string().min(8),
  address:     z.string().min(5),
  website:     z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().url().optional()
  ),
  categories:  z.array(z.string()).min(1, "Sélectionnez au moins une catégorie"),
});

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest();
  if (!session)
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const user = session.user;

  if (user?.role !== "ADMIN")
    return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });

  const existing = await prisma.vendor.findUnique({ where: { userId: user.id } });
  if (existing)
    return NextResponse.json({ error: "Vous avez déjà un profil vendeur" }, { status: 400 });

  try {
    const body = await req.json();
    const data = profileSchema.parse(body);

    const vendor = await prisma.vendor.create({
      data: {
        userId:           user.id,
        companyName:      data.companyName,
        siret:            data.siret || null,
        phone:            data.phone,
        address:          data.address,
        website:          data.website || null,
        status:           "APPROVED",
        vendorCategories: data.categories,
      },
    });

    return NextResponse.json({ success: true, vendorId: vendor.id }, { status: 201 });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return NextResponse.json(
        { error: "Données invalides", details: error.errors },
        { status: 400 }
      );
    }
    console.error(error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}