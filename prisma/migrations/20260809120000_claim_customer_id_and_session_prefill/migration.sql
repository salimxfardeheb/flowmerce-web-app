-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "customerId" TEXT;

-- AlterTable
ALTER TABLE "ReturnSession" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "customerWilaya" TEXT,
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "shippingMethod" TEXT,
ADD COLUMN     "shippingCost" DOUBLE PRECISION;
