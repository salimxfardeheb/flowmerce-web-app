// app/api/v1/return-form/route.ts — Flowmerce
//
// Endpoint public : récupère le formulaire de retour de la boutique identifiée
// par la clé API. L'API Key est l'unique source de vérité : elle est liée à un
// Vendor, dont on charge la ReturnPolicy. Aucun identifiant de boutique n'est
// nécessaire dans l'URL — le JSON produit (sections + champs typés, options,
// validation) est interprétable par n'importe quelle plateforme e-commerce
// (Shopify, WooCommerce, Magento, PrestaShop…).
//
// GET /api/v1/return-form
// Authorization: Bearer <api_key>
// (ou en-tête x-api-key)
//
// Réponse 200 : { version, title, description, sections, meta }
// La construction du formulaire est déléguée à lib/services/return-form-builder.

import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'
import { validateApiKey }            from '@/lib/api-key-auth'
import { buildReturnForm }           from '@/lib/services/return-form-builder'
import { log }                       from '@/lib/logger'

export async function GET(req: NextRequest) {
  // 1. Authentification par clé API (middleware existant, non réécrit)
  const rawKey =
    req.headers.get('authorization')?.replace(/^Bearer\s+/, '') ??
    req.headers.get('x-api-key') ??
    null

  const auth = await validateApiKey(rawKey)
  if (!auth.ok) return auth.response

  // 2. La clé identifie directement le vendeur (ReturnPolicy déjà chargée par
  //    validateApiKey) — aucune recherche de boutique supplémentaire
  const { keyRecord } = auth
  const vendor = keyRecord.vendor

  // 3. Construire la représentation générique du formulaire
  const form = buildReturnForm(vendor, vendor.returnPolicy)

  // 4. Mettre à jour lastUsedAt de la clé
  await prisma.apiKey.update({
    where: { id: keyRecord.id },
    data:  { lastUsedAt: new Date() },
  }).catch(() => null)

  log.info('return_form_fetched', { vendorId: vendor.id })

  return NextResponse.json(form)
}
