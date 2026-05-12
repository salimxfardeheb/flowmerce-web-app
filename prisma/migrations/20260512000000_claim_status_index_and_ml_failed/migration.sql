-- AlterTable
ALTER TABLE "Claim" ADD COLUMN "mlFailed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Claim" ADD COLUMN "mlAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Claim_vendorId_status_idx" ON "Claim"("vendorId", "status");

-- CreateIndex
CREATE INDEX "Claim_mlFailed_idx" ON "Claim"("mlFailed");
