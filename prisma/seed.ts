import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function main() {
  // Create admin user
  const adminPassword = await bcrypt.hash("admin123!", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@flomerce.com" },
    update: {},
    create: {
      email: "admin@flomerce.com",
      name: "Admin Flomerce",
      password: adminPassword,
      role: "ADMIN",
      vendor: {
        create: {
          companyName: "Flomerce Admin",
          phone: "0600000000",
          address: "1 rue de la Paix, Paris",
          status: "APPROVED",
        },
      },
    },
  });

  // Create demo vendor
  const vendorPassword = await bcrypt.hash("vendor123!", 12);
  const vendorUser = await prisma.user.upsert({
    where: { email: "vendeur@demo.com" },
    update: {},
    create: {
      email: "vendeur@demo.com",
      name: "Marie Martin",
      password: vendorPassword,
      role: "VENDOR",
      vendor: {
        create: {
          companyName: "Ma Boutique Demo",
          siret: "12345678901234",
          phone: "0612345678",
          address: "42 avenue Victor Hugo, Lyon",
          website: "https://maboutique.fr",
          status: "APPROVED",
          returnPolicy: {
            create: {
              allowRefusalOnDelivery: true,
              maxClaimDays: 30,
              acceptedTypes: "EXCHANGE,REFUND,REPAIR",
              validationMode: "MANUAL",
            },
          },
        },
      },
    },
    include: { vendor: true },
  });

  const vendor = await prisma.vendor.findUnique({
    where: { userId: vendorUser.id },
  });

  if (vendor) {
    // Add demo claims
    await prisma.claim.createMany({
      data: [
        {
          vendorId: vendor.id,
          orderId: "CMD-2024-001",
          customerName: "Pierre Durand",
          customerEmail: "pierre@client.com",
          type: "REFUND",
          description: "Produit défectueux à réception",
          status: "PENDING",
          aiScore: 0.85,
          aiDecision: "Remboursement recommandé",
        },
        {
          vendorId: vendor.id,
          orderId: "CMD-2024-002",
          customerName: "Sophie Bernard",
          customerEmail: "sophie@client.com",
          type: "EXCHANGE",
          description: "Mauvaise taille reçue",
          status: "APPROVED",
          aiScore: 0.92,
          processedAt: new Date(),
        },
        {
          vendorId: vendor.id,
          orderId: "CMD-2024-003",
          customerName: "Lucas Petit",
          customerEmail: "lucas@client.com",
          type: "REPAIR",
          description: "Écran fissuré après 2 jours",
          status: "REJECTED",
          aiScore: 0.23,
          aiDecision: "Dommage non couvert par la garantie",
          processedAt: new Date(),
        },
      ],
    });

    // Add demo API key
    await prisma.apiKey.upsert({
      where: { key: "flk_demo_key_test_12345678901234567890123456" },
      update: {},
      create: {
        vendorId: vendor.id,
        name: "Clé de test",
        key: "flk_demo_key_test_12345678901234567890123456",
      },
    });
  }

  console.log("✅ Seed terminé !");
  console.log("Admin : admin@flomerce.com / admin123!");
  console.log("Vendeur demo : vendeur@demo.com / vendor123!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
