-- AlterTable
ALTER TABLE "Claim" ADD COLUMN IF NOT EXISTS "policyRejected" BOOLEAN NOT NULL DEFAULT false;

-- Le dashboard vendeur filtre systématiquement sur cette colonne.
CREATE INDEX IF NOT EXISTS "Claim_vendorId_policyRejected_idx"
  ON "Claim" ("vendorId", "policyRejected");
