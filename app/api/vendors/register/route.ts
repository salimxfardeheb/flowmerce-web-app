// src/app/api/vendors/register/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const registerSchema = z.object({
  name:        z.string().min(2),
  email:       z.string().email(),
  password:    z.string().min(8),
  companyName: z.string().min(2),
  siret:       z.string().optional(),
  phone:       z.string().min(8),
  address:     z.string().min(5),
  website:     z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().url().optional()
  ),
  // Tableau de catégories choisies à l'inscription
  categories:  z.array(z.string()).min(1, "Sélectionnez au moins une catégorie"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = registerSchema.parse(body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return NextResponse.json({ error: "Cet email est déjà utilisé" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
      data: {
        name:     data.name,
        email:    data.email,
        password: hashedPassword,
        role:     "VENDOR",
        vendor: {
          create: {
            companyName: data.companyName,
            siret:       data.siret || null,
            phone:       data.phone,
            address:     data.address,
            website:     data.website || null,
            status:      "PENDING",
            // Stocker les catégories choisies à l'inscription
            // Elles seront disponibles dans la page de politique de retours
            vendorCategories: data.categories,
          },
        },
      },
    });

    return NextResponse.json({ success: true, userId: user.id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Données invalides", details: error.errors },
        { status: 400 }
      );
    }
    console.error(error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}