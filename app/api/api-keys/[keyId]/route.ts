import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/getSession";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ keyId: string }> }
) {
  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const user = session.user;
  const { keyId } = await params;

  const vendor = await prisma.vendor.findUnique({ where: { userId: user.id } });
  if (!vendor) return NextResponse.json({ error: "Vendeur introuvable" }, { status: 404 });

  const key = await prisma.apiKey.findFirst({
    where: { id: keyId, vendorId: vendor.id },
  });

  if (!key) return NextResponse.json({ error: "Clé introuvable" }, { status: 404 });

  await prisma.apiKey.update({
    where: { id: keyId },
    data: { isActive: false },
  });

  return NextResponse.json({ success: true });
}