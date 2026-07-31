-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "exportedAt" TIMESTAMP(3),
ADD COLUMN     "exportedToML" BOOLEAN NOT NULL DEFAULT false;
