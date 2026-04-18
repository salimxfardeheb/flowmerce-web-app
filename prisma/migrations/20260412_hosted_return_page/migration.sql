-- CreateEnum
CREATE TYPE "ClaimSource" AS ENUM ('API', 'HOSTED_PAGE');

-- CreateTable: ReturnRateLimit
CREATE TABLE "ReturnRateLimit" (
    "id"      TEXT NOT NULL,
    "key"     TEXT NOT NULL,
    "count"   INTEGER NOT NULL DEFAULT 1,
    "resetAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReturnRateLimit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReturnRateLimit_key_key" ON "ReturnRateLimit"("key");
CREATE INDEX "ReturnRateLimit_key_idx"     ON "ReturnRateLimit"("key");
CREATE INDEX "ReturnRateLimit_resetAt_idx" ON "ReturnRateLimit"("resetAt");

-- AlterTable: Claim — nouveaux champs
ALTER TABLE "Claim"
  ADD COLUMN "productName" TEXT,
  ADD COLUMN "orderDate"   TIMESTAMP(3),
  ADD COLUMN "source"      "ClaimSource" NOT NULL DEFAULT 'API',
  ADD COLUMN "fraudScore"  DOUBLE PRECISION,
  ADD COLUMN "ipAddress"   TEXT;

-- directUrl optionnel déjà géré dans schema.prisma