// prisma/seed.ts — Flowmerce
//
// Seed minimal append-only pour tester tous les cas d'utilisation de la page
// /dashboard/claims. Couvre les croisements (statut × type × source × ML ×
// fraude × override manuel × mlFailed) sans toucher aux données existantes.
//
// Exécution :
//   npx tsx prisma/seed.ts
//   (ou : npx ts-node --transpile-only prisma/seed.ts)
//
// Prérequis :
//   - DATABASE_URL défini dans .env (ou .env.local)
//   - L'utilisateur ADMIN existe (sinon on en crée un de test : admin@flowmerce.test / Admin1234!)
//
// Notes :
//   - Append-only : on ne supprime rien. Les contraintes unique sont gérées par
//     suffixe timestamp pour éviter les collisions si on rejoue le seed.
//   - Pour rejouer proprement, supprimez manuellement le vendeur "Seed Boutique
//     Démo" et ses claims, puis relancez.

import { PrismaClient, ClaimStatus, ClaimType, ClaimSource, VendorStatus, ValidationMode, Role } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config as loadEnv } from 'dotenv'
import { randomBytes, scryptSync } from 'crypto'

// Charge .env.local puis .env (sans écraser)
loadEnv({ path: '.env.local' })
loadEnv()

if (!process.env.DATABASE_URL) {
  console.error('[seed] DATABASE_URL manquant — ajoutez-le dans .env ou .env.local')
  process.exit(1)
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// Suffixe unique pour rendre le seed rejouable sans conflit
const TAG = Date.now().toString(36)

function hashPassword(plain: string): string {
  // bcryptjs-compatible n'est pas nécessaire ici — on stocke un hash scrypt
  // marqué pour qu'aucun login ne soit possible avec ce compte de seed.
  // Si vous voulez vous connecter avec, utilisez bcryptjs manuellement.
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(plain, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

async function main() {
  console.log(`[seed] tag=${TAG}`)

  // ── 1. User vendeur + Vendor APPROVED ────────────────────────────────────
  const vendorUser = await prisma.user.create({
    data: {
      email:    `seed-vendor-${TAG}@flowmerce.test`,
      password: hashPassword('Seed1234!'),
      name:     'Seed Vendor',
      role:     Role.VENDOR,
    },
  })

  const vendor = await prisma.vendor.create({
    data: {
      userId:           vendorUser.id,
      companyName:      `Seed Boutique Démo ${TAG}`,
      phone:            '+213555000000',
      address:          'Alger, Algérie',
      website:          'https://seed.flowmerce.test',
      status:           VendorStatus.APPROVED,
      vendorCategories: ['fashion', 'electronics'],
    },
  })

  // ── 2. ReturnPolicy (MANUAL pour voir le toggle auto-approve OFF) ────────
  await prisma.returnPolicy.create({
    data: {
      vendorId:               vendor.id,
      allowRefusalOnDelivery: true,
      maxClaimDays:           14,
      acceptedTypes:          [ClaimType.EXCHANGE, ClaimType.REFUND, ClaimType.REPAIR],
      validationMode:         ValidationMode.MANUAL,
      fraudScoreThreshold:    70,
      fraudReturnThreshold:   4,
      acceptedReturnReasons:  ['defective', 'wrong_size', 'not_as_described', 'changed_mind'],
      processingDays:         5,
    },
  })

  // ── 3. ApiKey (pour le filtre "par clé API" sur la page claims) ──────────
  const apiKey = await prisma.apiKey.create({
    data: {
      vendorId:  vendor.id,
      name:      'Boutique Shopify (seed)',
      key:       `sk_seed_${TAG}_${randomBytes(16).toString('hex')}`,
      keyPrefix: `sk_seed_${TAG.slice(-4)}`,
      isActive:  true,
    },
  })

  // ── 4. Claims couvrant les cas testés par la page ────────────────────────
  // Cas couverts :
  //   1. PENDING + ML automatique faible risque (Refund recommandé)
  //   2. APPROVED + ML override manuel (Exchange forcé)
  //   3. REJECTED + risque fraude ÉLEVÉ (>=60)
  //   4. IN_PROGRESS + REPAIR + source HOSTED_PAGE
  //   5. PENDING + mlFailed (aucune décision IA)
  //   6. PENDING + risque modéré (35-59) + EXCHANGE

  const baseOrder = `SEED-${TAG}`

  const claims = [
    // Cas 1 — PENDING, ML auto, Refund recommandé, faible fraude
    {
      vendorId:      vendor.id,
      apiKeyId:      apiKey.id,
      orderId:       `${baseOrder}-001`,
      customerName:  'Amine Benali',
      customerEmail: 'amine.benali@example.com',
      customerPhone: '+213661234567',
      type:          ClaimType.REFUND,
      description:   'Produit défectueux à la réception, écran cassé.',
      status:        ClaimStatus.PENDING,
      source:        ClaimSource.API,
      productName:   'Smartphone Galaxy A54 128GB',
      orderDate:     new Date(Date.now() - 3 * 24 * 3600_000),
      aiScore:       0.92,
      aiDecision:    'Refund',
      fraudScore:    12,
      prediction:    { productPrice: 42000, productQuantity: 1, orderTotal: 42000 },
    },

    // Cas 2 — APPROVED, ML override manuel (Exchange forcé)
    {
      vendorId:      vendor.id,
      apiKeyId:      apiKey.id,
      orderId:       `${baseOrder}-002`,
      customerName:  'Sara Cherifi',
      customerEmail: 'sara.cherifi@example.com',
      customerPhone: '+213771234567',
      type:          ClaimType.EXCHANGE,
      description:   'Mauvaise taille, je voudrais échanger contre une L.',
      status:        ClaimStatus.APPROVED,
      source:        ClaimSource.HOSTED_PAGE,
      productName:   'T-shirt coton bio — Taille M',
      orderDate:     new Date(Date.now() - 7 * 24 * 3600_000),
      aiScore:       0.71,
      aiDecision:    'Refund',
      fraudScore:    24,
      processedAt:   new Date(),
      prediction: {
        productPrice:    2500,
        productQuantity: 2,
        orderTotal:      5000,
        override: {
          resolution: 'Exchange',
          note:       'Client fidèle, on privilégie l\'échange même si IA dit Refund.',
          by:         'admin',
        },
      },
    },

    // Cas 3 — REJECTED + fraude ÉLEVÉE (>=60)
    {
      vendorId:      vendor.id,
      apiKeyId:      apiKey.id,
      orderId:       `${baseOrder}-003`,
      customerName:  'Karim Touati',
      customerEmail: 'karim.touati@example.com',
      customerPhone: '+213551112233',
      type:          ClaimType.REFUND,
      description:   'Je veux être remboursé sans renvoyer le produit.',
      status:        ClaimStatus.REJECTED,
      source:        ClaimSource.API,
      productName:   'Casque Bluetooth Pro',
      orderDate:     new Date(Date.now() - 12 * 24 * 3600_000),
      aiScore:       0.88,
      aiDecision:    'Reject',
      fraudScore:    78,
      processedAt:   new Date(),
      ipAddress:     '41.100.123.45',
      prediction:    { productPrice: 8900, productQuantity: 1, orderTotal: 8900 },
    },

    // Cas 4 — IN_PROGRESS + REPAIR + HOSTED_PAGE
    {
      vendorId:      vendor.id,
      apiKeyId:      apiKey.id,
      orderId:       `${baseOrder}-004`,
      customerName:  'Lina Khelifi',
      customerEmail: 'lina.khelifi@example.com',
      customerPhone: '+213662223344',
      type:          ClaimType.REPAIR,
      description:   'Le zip de la veste est cassé après une semaine.',
      status:        ClaimStatus.IN_PROGRESS,
      source:        ClaimSource.HOSTED_PAGE,
      productName:   'Veste en cuir synthétique',
      orderDate:     new Date(Date.now() - 10 * 24 * 3600_000),
      aiScore:       0.66,
      aiDecision:    'Repair',
      fraudScore:    18,
      prediction:    { productPrice: 12500, productQuantity: 1, orderTotal: 12500 },
    },

    // Cas 5 — PENDING + mlFailed (pas de décision IA)
    {
      vendorId:      vendor.id,
      apiKeyId:      apiKey.id,
      orderId:       `${baseOrder}-005`,
      customerName:  'Yacine Mansouri',
      customerEmail: 'yacine.mansouri@example.com',
      customerPhone: '+213773334455',
      type:          ClaimType.REFUND,
      description:   'Colis jamais reçu, le tracking est bloqué depuis 5 jours.',
      status:        ClaimStatus.PENDING,
      source:        ClaimSource.API,
      productName:   'Montre connectée X5',
      orderDate:     new Date(Date.now() - 8 * 24 * 3600_000),
      mlFailed:      true,
      mlAttempts:    3,
      mlInput:       { reason: 'not_received', daysSinceOrder: 8 },
    },

    // Cas 6 — PENDING + risque modéré (35-59) + EXCHANGE
    {
      vendorId:      vendor.id,
      apiKeyId:      apiKey.id,
      orderId:       `${baseOrder}-006`,
      customerName:  'Nadia Belkacem',
      customerEmail: 'nadia.belkacem@example.com',
      customerPhone: '+213554445566',
      type:          ClaimType.EXCHANGE,
      description:   'Couleur reçue différente de la photo du site.',
      status:        ClaimStatus.PENDING,
      source:        ClaimSource.API,
      productName:   'Sac à main cuir camel',
      orderDate:     new Date(Date.now() - 5 * 24 * 3600_000),
      aiScore:       0.55,
      aiDecision:    'Exchange',
      fraudScore:    47,
      prediction:    { productPrice: 6500, productQuantity: 1, orderTotal: 6500 },
    },
  ]

  await prisma.claim.createMany({ data: claims })

  // ── 5. Un CustomerFraudRecord pour le client à fraude élevée ─────────────
  await prisma.customerFraudRecord.create({
    data: {
      customerEmail:   'karim.touati@example.com',
      customerPhone:   '+213551112233',
      totalClaims:     6,
      totalRefusals:   3,
      distinctVendors: 4,
      lastClaimAt:     new Date(),
      lastRefusalAt:   new Date(),
      matchedBy:       'email+phone',
    },
  })

  // ── Récap ────────────────────────────────────────────────────────────────
  console.log(`[seed] ✓ Vendor créé   : ${vendor.companyName} (id=${vendor.id})`)
  console.log(`[seed] ✓ User vendeur  : ${vendorUser.email}  (password=Seed1234!)`)
  console.log(`[seed] ✓ ApiKey        : ${apiKey.name} (prefix=${apiKey.keyPrefix})`)
  console.log(`[seed] ✓ Claims créés  : ${claims.length}`)
  console.log(`[seed] ✓ FraudRecord   : 1`)
  console.log(`[seed] terminé.`)
}

main()
  .catch(e => {
    console.error('[seed] erreur :', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
