-- Origine de la décision portée par Claim.aiDecision (C-04).
--
-- Sans cette colonne, rien ne distinguait dans le dataset d'entraînement un
-- label décidé par un humain d'une prédiction du modèle appliquée
-- automatiquement : le modèle se réentraînait sur ses propres sorties.

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DecisionSource') THEN
    CREATE TYPE "DecisionSource" AS ENUM ('MODEL', 'POLICY_RULE', 'HUMAN');
  END IF;
END
$$;

-- AlterTable
ALTER TABLE "Claim" ADD COLUMN IF NOT EXISTS "resolutionSource" "DecisionSource";
ALTER TABLE "Claim" ADD COLUMN IF NOT EXISTS "resolvedBy" TEXT;
ALTER TABLE "Claim" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);

-- Rétro-qualification des réclamations existantes.
--
-- Les refus hors politique sont déterministes : leur label vient d'une règle
-- métier écrite par un humain, il est utilisable à l'entraînement.
UPDATE "Claim"
   SET "resolutionSource" = 'POLICY_RULE'
 WHERE "resolutionSource" IS NULL
   AND "policyRejected" = true;

-- Toutes les autres décisions déjà posées portent une valeur d'aiDecision dont
-- on ne peut pas prouver l'origine humaine : elles ont pu être écrites par
-- l'ingestion ou par le worker de reprise. Elles sont marquées MODEL — donc
-- exclues de la vérité terrain. C'est le choix conservateur : mieux vaut perdre
-- quelques labels réellement humains que réinjecter des sorties de modèle.
UPDATE "Claim"
   SET "resolutionSource" = 'MODEL'
 WHERE "resolutionSource" IS NULL
   AND "aiDecision" IS NOT NULL;

-- L'export ne sélectionne que les claims exportables : index sur le couple lu.
CREATE INDEX IF NOT EXISTS "Claim_exportedToML_resolutionSource_idx"
  ON "Claim" ("exportedToML", "resolutionSource");
