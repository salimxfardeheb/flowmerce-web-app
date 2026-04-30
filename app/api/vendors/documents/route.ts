import { NextRequest, NextResponse } from "next/server";
import { DocumentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cloudinary } from "@/lib/cloudinary";
import { getSessionFromRequest } from "@/lib/getSession";

const VALID_TYPES = [
  "ID_CARD",
  "BUSINESS_REGISTRATION",
  "ADDRESS_PROOF",
  "TAX_CERTIFICATE",
  "BANK_DETAILS",
  "OTHER",
];

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest();
  if (!session)
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const user = session.user;

  const vendor = await prisma.vendor.findUnique({
    where: { userId: user.id },
  });

  if (!vendor)
    return NextResponse.json({ error: "Vendeur introuvable" }, { status: 404 });

  if (vendor.status !== "DOCUMENTS_REQUESTED")
    return NextResponse.json(
      { error: "Votre compte n'est pas en attente de documents" },
      { status: 400 }
    );

  const formData = await req.formData();
  const documentType = formData.get("documentType") as string;
  const file = formData.get("file") as File | null;

  if (!documentType || !file)
    return NextResponse.json(
      { error: "Type de document et fichier requis" },
      { status: 400 }
    );

  if (!VALID_TYPES.includes(documentType))
    return NextResponse.json(
      { error: "Type de document invalide" },
      { status: 400 }
    );

  if (file.size > 5 * 1024 * 1024)
    return NextResponse.json(
      { error: "Fichier trop volumineux (max 5 Mo)" },
      { status: 400 }
    );

  const ALLOWED_MIMES = [
    "image/jpeg", "image/png", "image/webp", "application/pdf",
  ];
  if (!ALLOWED_MIMES.includes(file.type))
    return NextResponse.json(
      { error: "Format non supporté. Utilisez PDF, JPG ou PNG." },
      { status: 400 }
    );

  const buffer  = Buffer.from(await file.arrayBuffer());
  const isPdf   = file.type === "application/pdf";
  const dataUri = `data:${file.type};base64,${buffer.toString("base64")}`;

  let cloudinaryUrl: string;
  let cloudinaryPublicId: string;
  try {
    const result = await cloudinary.uploader.upload(dataUri, {
      folder:        `flomerce/vendors/${vendor.id}/documents`,
      public_id:     `${documentType}_${Date.now()}`,
      resource_type: isPdf ? "raw" : "image",
      type:          "authenticated",
    });
    cloudinaryUrl      = result.secure_url;
    cloudinaryPublicId = result.public_id;
  } catch (err) {
    console.error("Cloudinary upload error:", err);
    return NextResponse.json(
      { error: "Erreur lors de l'upload du fichier" },
      { status: 500 }
    );
  }

  // Upsert en base
  const existing = await prisma.document.findFirst({
    where: { vendorId: vendor.id, type: documentType as DocumentType },
  });

  if (existing) {
    await prisma.document.update({
      where: { id: existing.id },
      data: {
        name:              file.name,
        url:               cloudinaryUrl,
        cloudinaryPublicId,
        status:            "PENDING",
        rejectionReason:   null,
      },
    });
  } else {
    await prisma.document.create({
      data: {
        vendorId:          vendor.id,
        name:              file.name,
        url:               cloudinaryUrl,
        cloudinaryPublicId,
        type:              documentType as DocumentType,
        status:            "PENDING",
      },
    });
  }

  return NextResponse.json({ success: true });
}
