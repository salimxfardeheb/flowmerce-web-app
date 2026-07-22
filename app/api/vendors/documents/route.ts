import { NextRequest, NextResponse } from "next/server";
import { DocumentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { uploadFile, deleteFile } from "@/lib/storage";
import { getSessionFromRequest } from "@/lib/getSession";
import { DOCUMENT_TYPES } from "@/lib/constants";
import { log } from "@/lib/logger";

const VALID_TYPES: readonly string[] = DOCUMENT_TYPES;

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
      { status: 400 },
    );

  const formData = await req.formData();
  const documentType = formData.get("documentType") as string;
  const file = formData.get("file") as File | null;

  if (!documentType || !file)
    return NextResponse.json(
      { error: "Type de document et fichier requis" },
      { status: 400 },
    );

  if (!VALID_TYPES.includes(documentType))
    return NextResponse.json(
      { error: "Type de document invalide" },
      { status: 400 },
    );

  if (file.size > 5 * 1024 * 1024)
    return NextResponse.json(
      { error: "Fichier trop volumineux (max 5 Mo)" },
      { status: 400 },
    );

  const ALLOWED_MIMES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ];
  if (!ALLOWED_MIMES.includes(file.type))
    return NextResponse.json(
      { error: "Format non supporté. Utilisez PDF, JPG ou PNG." },
      { status: 400 },
    );

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
  const storagePath = `vendors/${
    vendor.id
  }/documents/${documentType}_${Date.now()}.${ext}`;

  try {
    await uploadFile(buffer, storagePath, file.type);
  } catch (err) {
    log.error("documents.storage_upload_error", { err: String(err) });
    return NextResponse.json(
      { error: "Erreur lors de l'upload du fichier" },
      { status: 500 },
    );
  }

  const existing = await prisma.document.findFirst({
    where: { vendorId: vendor.id, type: documentType as DocumentType },
  });

  if (existing) {
    if (existing.storagePath) {
      await deleteFile(existing.storagePath);
    }
    await prisma.document.update({
      where: { id: existing.id },
      data: {
        name: file.name,
        storagePath,
        status: "PENDING",
        rejectionReason: null,
      },
    });
  } else {
    await prisma.document.create({
      data: {
        vendorId: vendor.id,
        name: file.name,
        storagePath,
        type: documentType as DocumentType,
        status: "PENDING",
      },
    });
  }

  return NextResponse.json({ success: true });
}
