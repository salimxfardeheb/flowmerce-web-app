-- AlterTable
ALTER TABLE "ReturnSession" ADD COLUMN IF NOT EXISTS "customerAge" INTEGER,
ADD COLUMN IF NOT EXISTS "customerGender" TEXT;
