-- CreateTable
CREATE TABLE "CustomerFraudRecord" (
    "id" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "totalClaims" INTEGER NOT NULL DEFAULT 0,
    "totalRefusals" INTEGER NOT NULL DEFAULT 0,
    "lastClaimAt" TIMESTAMP(3),
    "lastRefusalAt" TIMESTAMP(3),
    "matchedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerFraudRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerFraudRecord_customerEmail_idx" ON "CustomerFraudRecord"("customerEmail");

-- CreateIndex
CREATE INDEX "CustomerFraudRecord_customerPhone_idx" ON "CustomerFraudRecord"("customerPhone");
