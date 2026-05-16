-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "apiKeyId" TEXT,
ADD COLUMN     "customerPhone" TEXT;

-- AlterTable
ALTER TABLE "CustomerFraudRecord" ADD COLUMN     "distinctVendors" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ReturnPolicy" DROP COLUMN "partialRefundAfter50pct",
DROP COLUMN "partialRefundUsedPenalty",
ADD COLUMN     "fraudReturnThreshold" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "partialRefundRules" JSONB,
ADD COLUMN     "processingDays" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "ReturnSession" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL DEFAULT '',
    "orderDate" TEXT NOT NULL DEFAULT '',
    "shopName" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefusalReport" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "orderId" TEXT NOT NULL,
    "claimId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefusalReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReturnSession_token_key" ON "ReturnSession"("token");

-- CreateIndex
CREATE INDEX "RefusalReport_vendorId_idx" ON "RefusalReport"("vendorId");

-- CreateIndex
CREATE INDEX "RefusalReport_customerEmail_idx" ON "RefusalReport"("customerEmail");

-- CreateIndex
CREATE INDEX "RefusalReport_customerPhone_idx" ON "RefusalReport"("customerPhone");

-- CreateIndex
CREATE INDEX "RefusalReport_createdAt_idx" ON "RefusalReport"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefusalReport_vendorId_orderId_key" ON "RefusalReport"("vendorId", "orderId");

-- CreateIndex
CREATE INDEX "Claim_vendorId_createdAt_idx" ON "Claim"("vendorId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "ReturnSession" ADD CONSTRAINT "ReturnSession_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "ApiKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
