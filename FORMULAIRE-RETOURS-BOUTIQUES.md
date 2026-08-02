# Formulaire de retours pour les boutiques (ex. Caba Store)

> Document récapitulatif : tout ce qui a été fait pour fournir un **formulaire de retour** aux boutiques/partenaires (ex. **Caba Store**) sous forme de JSON générique, consommable par n'importe quelle plateforme e-commerce (Shopify, WooCommerce, PrestaShop, Magento…).

---

## 1. Objectif

Permettre à une boutique comme **Caba Store** de récupérer un **formulaire de retour prêt à l'emploi** (sections + champs typés, options, règles de validation) via une API publique, **sans exposer la logique métier** de Flowmerce (politique de retour, catégories, fraude…). Le formulaire est généré **à la volée** à partir du compte vendeur (`Vendor`) et de sa politique de retour (`ReturnPolicy`).

**Avantage clé** : la représentation JSON est 100 % indépendante de React/Next.js — n'importe quel moteur de formulaire (web, mobile, e-commerce) peut la rendre.

---

## 2. Fichiers touchés

| Fichier | Rôle | Statut |
|---|---|---|
| `lib/services/return-form-builder.ts` | Builder : Vendor + ReturnPolicy → JSON de formulaire générique | **Créé** |
| `app/api/v1/return-form/route.ts` | Endpoint public GET du formulaire (identification par clé API uniquement) | **Créé** |
| `__tests__/lib/services/return-form-builder.test.ts` | Tests unitaires du builder | **Créé** |
| `__tests__/api/return-form.test.ts` | Tests d'intégration de l'API | **Créé** |
| `lib/constants.ts` | Ajout `RETURN_REASON_DESCRIPTIONS` + `CLAIM_TYPE_DESCRIPTIONS` (source de vérité unique) | **Modifié** |
| `app/api/claims/create/route.ts` | Contrôle du type de réclamation (`desired_resolution`) contre `acceptedTypes` + envoi au payload ML | **Modifié** |
| `lib/services/return-policy.ts` | Nouvelle vérification `CLAIM_TYPE_NOT_ACCEPTED` dans `checkReturnPolicy` | **Modifié** |
| `lib/services/claim-ingestion.ts` | Journalisation du `type` dans les logs d'ingestion | **Modifié** |
| `app/return/[token]/page.tsx` | Page hébergée : déduplication des libellés/descriptions depuis `lib/constants` | **Modifié** |

> ⚠️ Statut git : les fichiers « Créés » sont **non commités** (`git status` : `??`). Les modifications sur les fichiers existants sont en working tree (`M`).

---

## 3. Le builder : `lib/services/return-form-builder.ts`

### 3.1 Principe

`buildReturnForm(vendor, policy)` transforme un `Vendor` (nom + site web) et sa `ReturnPolicy` (ou `null`) en un objet `ReturnForm` versionné :

```ts
interface ReturnForm {
  version: number        // RETURN_FORM_VERSION = 1
  title: string          // « Demande de retour »
  description: string
  sections: ReturnFormSection[]   // order, reason, resolution, description
  meta: {
    shop:   { name, slug, website }            // slug dérivé du nom (slugify)
    policy: {                                  // résumé non-sensible de la politique
      max_claim_days,
      processing_days,
      allow_refusal_on_delivery,
      partial_refund_enabled,
      non_refundable_categories,
      exchange_only_categories,
    }
  }
}
```

### 3.2 Champs supportés

`text`, `textarea`, `select`, `number`, `email`, `tel`, `date`, `checkbox` — chacun avec `required`, `placeholder`, `defaultValue`, `options[]` (value/label/description) et `validation` (minLength, maxLength, pattern, min, max).

### 3.3 Sections générées

| Section | Champs |
|---|---|
| `order` — Informations de commande | `order_id*`, `customer_name*`, `customer_email*` (pattern email), `customer_phone`, `product_name*`, `order_date` |
| `reason` — Motif du retour | `reason*` (select) — options **filtrées** par `acceptedReturnReasons` |
| `resolution` — Résolution souhaitée | `desired_resolution*` (select) — options **filtrées** par `acceptedTypes` |
| `description` — Détails de la demande | `description` (textarea, max 2000) |

### 3.4 Comportement par défaut (politique absente)

- `maxClaimDays` → 14 jours, `processingDays` → 5, `allowRefusalOnDelivery` → false, `partialRefundEnabled` → false.
- Toutes les raisons de `RETURN_REASONS` et tous les types de `CLAIM_TYPES` sont proposés.

### 3.5 `slugify`

Le slug d'une boutique est **dérivé de son nom** (aucun champ slug en base) : normalisation Unicode NFD, suppression des accents, minuscules, remplacement des caractères non alphanumériques par `-`. Ex. : `Caba Store` → `caba-store`, `Éléctro Shop` → `electro-shop`.

---

## 4. L'endpoint public : `GET /api/v1/return-form`

### 4.1 Fonctionnement (route.ts)

L'**API Key est l'unique source de vérité** : elle est liée à un `Vendor`, dont on charge la `ReturnPolicy`. Aucun identifiant de boutique (slug, nom, `shopSlug`) n'est nécessaire dans l'URL, pour Caba Store comme pour toute autre plateforme.

1. **Auth par clé API** (réutilise le middleware existant `validateApiKey` de `lib/api-key-auth.ts`) — en-tête `Authorization: Bearer <api_key>` **ou** `x-api-key: <api_key>`.
2. **Identification du vendeur** directement via la clé (`keyRecord.vendor`) — la `ReturnPolicy` est déjà chargée par `validateApiKey` (include `returnPolicy`).
3. **Construction du formulaire** via `buildReturnForm(vendor, vendor.returnPolicy)`.
4. Mise à jour de `lastUsedAt` sur la clé API (fire-and-forget, `.catch(() => null)`).
5. Log `return_form_fetched` + réponse `200` avec le JSON du formulaire.

Flux attendu :

```
Authorization: Bearer API_KEY
        │
        ▼
validateApiKey()
        │
        ▼
ApiKey
        │
        ▼
Vendor
        │
        ▼
ReturnPolicy
        │
        ▼
buildReturnForm(...)
        │
        ▼
JSON
```

> L'ancienne route `GET /api/v1/shops/{shopSlug}/return-form` (avec vérification `slugify(shopSlug) === slugify(companyName)` → 404 « Boutique introuvable ») a été **supprimée** : la comparaison de slug était redondante et provoquait des 404 à tort malgré une clé valide.

### 4.2 Exemple d'utilisation — Caba Store

```bash
# Récupération du formulaire de retour de Caba Store (aucun identifiant dans l'URL)
curl -X GET "https://flowmerce.app/api/v1/return-form" \
  -H "Authorization: Bearer sk_live_caba_xxxxxx"
```

**Réponse (extrait)** :

```json
{
  "version": 1,
  "title": "Demande de retour",
  "description": "Complétez le formulaire ci-dessous pour soumettre votre demande de retour.",
  "sections": [
    {
      "id": "order",
      "title": "Informations de commande",
      "fields": [
        { "id": "order_id", "type": "text", "label": "Numéro de commande", "required": true, "placeholder": "CMD-1234", "options": [], "validation": { "maxLength": 200 }, "defaultValue": null },
        { "id": "customer_email", "type": "email", "label": "Adresse e-mail", "required": true, "validation": { "maxLength": 254, "pattern": "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$" } }
      ]
    },
    {
      "id": "reason",
      "title": "Motif du retour",
      "fields": [
        { "id": "reason", "type": "select", "label": "Motif du retour", "required": true, "options": [
          { "value": "Produit défectueux", "label": "Produit défectueux", "description": "Le produit est endommagé ou ne fonctionne pas" }
        ]}
      ]
    },
    {
      "id": "resolution",
      "title": "Résolution souhaitée",
      "fields": [
        { "id": "desired_resolution", "type": "select", "required": true, "options": [
          { "value": "EXCHANGE", "label": "Échange", "description": "Je souhaite un produit de remplacement" },
          { "value": "REFUND", "label": "Remboursement", "description": "Je souhaite être remboursé(e)" }
        ]}
      ]
    }
  ],
  "meta": {
    "shop":  { "name": "Caba Store", "slug": "caba-store", "website": "https://caba.example.com" },
    "policy": {
      "max_claim_days": 14, "processing_days": 5,
      "allow_refusal_on_delivery": false, "partial_refund_enabled": false,
      "non_refundable_categories": [], "exchange_only_categories": []
    }
  }
}
```

> **Sécurité** : le JSON **n'expose jamais** les données sensibles de la politique (`validationMode`, `fraudScoreThreshold`, `fraudReturnThreshold`, `acceptedReturnReasons` bruts…). Le test `expose le résumé de politique sans copier la politique brute` le vérifie explicitement.

---

## 5. Constantes centralisées : `lib/constants.ts`

Pour éviter toute duplication entre la page hébergée (`/return/[token]`) et le formulaire API :

```ts
export const RETURN_REASON_DESCRIPTIONS: Record<ReturnReason, string> = {
  'Produit défectueux':          'Le produit est endommagé ou ne fonctionne pas',
  'Produit contrefait':          'Le produit semble être une contrefaçon',
  'Produit endommagé livraison': 'Le produit a été abîmé pendant le transport',
  "Changement d'avis":           "Je n'ai plus besoin de ce produit",
  'Panne après utilisation':     'Le produit est tombé en panne rapidement',
  'Mauvaise taille':             'La taille ou la couleur ne correspond pas',
  'Allergie/Réaction':           'Réaction allergique au produit',
  'Ne correspond pas':           'Le produit reçu est différent de la commande',
  'Erreur de commande vendeur':  'Mauvais produit envoyé par la boutique',
  'Pièces manquantes':           'Des éléments manquent dans le colis',
}

export const CLAIM_TYPE_DESCRIPTIONS: Record<ClaimTypeValue, string> = {
  EXCHANGE: 'Je souhaite un produit de remplacement',
  REFUND:   'Je souhaite être remboursé(e)',
  REPAIR:   'Je souhaite que le produit soit réparé',
}
```

La page hébergée `app/return/[token]/page.tsx` a été refactorée pour importer ces constantes (`RESOLUTION_OPTIONS`, `DEFAULT_REASONS`) au lieu de ses tableaux locaux.

---

## 6. Renforcement du flux de réclamation (cohérence avec le formulaire)

Pour que les données envoyées depuis le formulaire (ex. celui de Caba Store) soient **validées côté serveur** :

### 6.1 `lib/services/return-policy.ts` — `checkReturnPolicy`

Nouvelle vérification **3 — Type de réclamation non accepté** :

```ts
if (claimType && policy.acceptedTypes.length > 0 && !policy.acceptedTypes.includes(claimType)) {
  return { ok: false, code: 'CLAIM_TYPE_NOT_ACCEPTED',
           message: `Ce type de réclamation (${claimType}) n'est pas accepté par ce vendeur.` }
}
```

### 6.2 `app/api/claims/create/route.ts`

- `desired_resolution` (choix du client) est extrait **avant** le contrôle de politique et passé à `checkReturnPolicy` (`claimType: desiredResolution`).
- Si le type n'est pas accepté → rejet `CLAIM_TYPE_NOT_ACCEPTED` (politique non respectée).
- `desiredResolution` est envoyé dans le **payload ML** et stocké dans le `Claim` (`type`) créé.
- Le ML ne modifie **jamais** `claim.type` (sa recommandation reste dans `aiDecision`).

### 6.3 `lib/services/claim-ingestion.ts`

Le `type` du claim est maintenant journalisé dans les logs d'ingestion (`type: claim.type`).

---

## 7. Tests

### 7.1 `__tests__/lib/services/return-form-builder.test.ts` (Vitest)

- `slugify` : normalisation (`Caba Store` → `caba-store`), accents, chaîne vide.
- `buildReturnForm` :
  - structure générique de base (version, sections `order/reason/resolution/description`, chaque champ a id/type/label/required/options/validation/defaultValue) ;
  - **défauts** quand la politique est absente (toutes raisons, tous types, 14 jours, 5 jours de traitement) ;
  - **filtrage** des options selon la politique (`acceptedReturnReasons`, `acceptedTypes`) ;
  - **meta** : résumé politique sans champs sensibles (`validationMode`, `fraudScoreThreshold` absents) ;
  - validation des champs commande (email pattern, textarea max 2000) ;
  - indépendance : fonctionne avec juste `companyName` (website `null`).

### 7.2 `__tests__/api/return-form.test.ts` (Vitest, mocks `validateApiKey`/`prisma`/`log`)

- `401` sur clé API invalide (Bearer) ;
- `200` + formulaire générique correct (`version: 1`, `meta.shop` = Caba Store, sections attendues) ;
- clé via l'en-tête `x-api-key` ;
- mise à jour de `lastUsedAt` + log `return_form_fetched`.

### 7.3 Lancer les tests

```bash
npm run test:run        # toute la suite Vitest
npm run typecheck       # vérification TypeScript
```

---

## 8. Résumé du parcours « Caba Store »

1. **Caba Store** (Vendor `APPROVED`) configure sa politique de retour dans le dashboard (`/dashboard/return-policy`).
2. Flowmerce lui délivre une **clé API** (stockée hachée via `hashApiKey`).
3. Caba Store (ou sa plateforme Shopify/WooCommerce…) appelle `GET /api/v1/return-form` avec sa clé (Bearer ou `x-api-key`).
4. Flowmerce retourne le **formulaire JSON générique** : champs, options filtrées par la politique, délais, catégories non remboursables / échange seul.
5. Le client remplit le formulaire → la plateforme soumet `POST /api/claims/create` (ou page hébergée `/return/[token]`).
6. Le serveur **revalide** le type de réclamation contre `acceptedTypes` (`CLAIM_TYPE_NOT_ACCEPTED`), le délai (`DELAY_EXCEEDED`) et les catégories (`NON_REFUNDABLE_CATEGORY`) avant tout traitement ML/remboursement.
