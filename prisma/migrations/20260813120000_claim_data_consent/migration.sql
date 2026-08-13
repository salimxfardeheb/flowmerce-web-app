-- Consentement du client final au traitement de ses données, recueilli sur les
-- deux canaux de soumission : portail hébergé (/return/[token]) et formulaire
-- embarqué chez la boutique (section `consent` de la définition du formulaire).
--
-- Nullable et sans valeur par défaut : les réclamations antérieures n'ont pas
-- été soumises sous ce consentement, et rien ne justifie de leur en inventer un.
ALTER TABLE "Claim" ADD COLUMN IF NOT EXISTS "dataConsentAt" TIMESTAMP(3);
