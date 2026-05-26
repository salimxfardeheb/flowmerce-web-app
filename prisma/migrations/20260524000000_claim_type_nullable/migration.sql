-- Make Claim.type nullable: the final type is now decided by the ML.
-- It stays NULL until the ML responds (or forever if the ML rejects the claim).
ALTER TABLE "Claim" ALTER COLUMN "type" DROP NOT NULL;
