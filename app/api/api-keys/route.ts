import { getSessionFromRequest } from "@/lib/getSession";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateApiKey, hashApiKey, apiKeyPrefix } from "@/lib/utils";
import { log } from "@/lib/logger";
import { z } from "zod";

const CreateApiKeySchema = z.object({
  name: z.string().min(1, "Nom requis").max(50).trim(),
});

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const user = session.user;

  const vendor = await prisma.vendor.findUnique({ where: { userId: user.id } });
  if (!vendor) return NextResponse.json({ error: "Vendeur introuvable" }, { status: 404 });

  const rows = await prisma.apiKey.findMany({
    where:   { vendorId: vendor.id, isActive: true },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, keyPrefix: true,
      isActive: true, lastUsedAt: true, createdAt: true,
    },
  });

  // On ne ressert jamais le raw key. Le champ `key` exposé est un masque.
  const keys = rows.map(k => ({
    ...k,
    key: k.keyPrefix ? `${k.keyPrefix}…` : "••••••••",
  }));

  return NextResponse.json({ keys });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const user = session.user;

  const vendor = await prisma.vendor.findUnique({ where: { userId: user.id } });
  if (!vendor) return NextResponse.json({ error: "Vendeur introuvable" }, { status: 404 });

  // ADMIN avec un Vendor peut créer des clés même si le statut n'est pas APPROVED
  if (vendor.status !== "APPROVED" && user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Compte non approuvé" }, { status: 403 });
  }

  const parsed = CreateApiKeySchema.safeParse(await req.json());
  if (!parsed.success) {
    log.error("api_keys.validation_error", { issues: parsed.error.flatten() });
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const { name } = parsed.data;

  const count = await prisma.apiKey.count({
    where: { vendorId: vendor.id, isActive: true },
  });

  if (count >= 5) {
    return NextResponse.json(
      { error: "Maximum 5 clés API actives" },
      { status: 400 }
    );
  }

  const duplicate = await prisma.apiKey.findFirst({
    where: { vendorId: vendor.id, isActive: true, name: { equals: name.trim(), mode: "insensitive" } },
  });
  if (duplicate) {
    return NextResponse.json(
      { error: "Une clé avec ce nom existe déjà" },
      { status: 409 }
    );
  }

  const rawKey = generateApiKey();
  const created = await prisma.apiKey.create({
    data: {
      vendorId:  vendor.id,
      name:      name.trim(),
      key:       hashApiKey(rawKey),
      keyPrefix: apiKeyPrefix(rawKey),
    },
    select: {
      id: true, name: true, keyPrefix: true,
      isActive: true, lastUsedAt: true, createdAt: true,
    },
  });

  // Raw key retourné UNE seule fois (à la création).
  // Aucune autre route ne pourra plus le restituer.
  return NextResponse.json(
    { key: { ...created, key: rawKey }, oneTimeReveal: true },
    { status: 201 }
  );
}