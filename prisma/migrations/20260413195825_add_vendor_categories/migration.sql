-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "vendorCategories" TEXT[] DEFAULT ARRAY[]::TEXT[];
