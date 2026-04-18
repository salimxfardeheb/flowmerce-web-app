/*
  Warnings:

  - A unique constraint covering the columns `[vendorId,orderId]` on the table `Claim` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "keyPrefix" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Claim_vendorId_orderId_key" ON "Claim"("vendorId", "orderId");
