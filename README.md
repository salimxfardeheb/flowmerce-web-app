# FLOWMERCE

Plateforme SaaS B2B de gestion des retours et détection de fraude pour e-commerçants. FLOWMERCE automatise le traitement des demandes de retour (remboursement, échange, réparation) et identifie les comportements frauduleux grâce à un modèle de machine learning.

---

## Fonctionnalités

- **Gestion des réclamations** — Création, suivi et résolution de réclamations via API ou portail client white-label
- **Canal de soumission unique** — Un seul endpoint (`POST /api/v1/returns`) et une seule implémentation métier pour les deux usages : formulaire embarqué côté boutique (clé API) et portail hébergé (jeton de session)
- **Formulaire de retour embarqué** — API JSON générique (`GET /api/v1/return-form` + `POST /api/v1/returns`) permettant à toute boutique e-commerce (Shopify, WooCommerce, Magento, PrestaShop…) d'embarquer le formulaire de retour Flowmerce sans dupliquer de logique métier
- **Détection de fraude** — Score de fraude cross-vendeur (0–100) basé sur l'historique client
- **Intégration ML** — Décisions automatiques via un modèle Python hébergé séparément
- **Portail white-label** — Page de dépôt de réclamation brandée, accessible via lien token
- **Dashboard vendeur** — Gestion des politiques de retour, clés API, et suivi des réclamations
- **Panel admin** — Approbation des vendeurs, revue des documents, vue par client, export du dataset ML
- **Notifications email** — Alertes automatiques (soumission, approbation, rejet)
- **Garde-fou remboursement** — Les demandes de remboursement ne sont jamais auto-approuvées : elles restent soumises à une validation vendeur explicite

---

## Stack technique

| Couche | Technologie |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Langage | TypeScript 5 |
| Style | Tailwind CSS 4 |
| Base de données | PostgreSQL (Supabase) |
| ORM | Prisma 7 |
| Auth | NextAuth v5 (beta) |
| Validation | Zod 3 (schémas d'environnement et de payload) |
| Stockage fichiers | Supabase Storage (bucket `documents`) |
| Email | Nodemailer (Gmail) |
| ML backend | API HTTP externe (Render) |
| Tests | Vitest 4 (+ couverture V8) |
| Mobile | Capacitor 8 (Android) |
| Déploiement | Vercel (cron inclus) |

---

## Prérequis

- Node.js ≥ 20
- npm ≥ 10
- Une base de données PostgreSQL (ou compte [Supabase](https://supabase.com) — base + Storage documents)
- Compte Gmail avec mot de passe applicatif (notifications)
- ML backend déployé séparément (optionnel pour dev local)

---

## Installation

```bash
git clone https://github.com/FLOWMERCE/flowmerce-web-app.git
cd flowmerce-web-app
npm install
```

Créer un fichier `.env.local` à la racine et y renseigner **toutes** les variables listées dans la section [Variables d'environnement](#variables-denvironnement) :

```bash
touch .env.local
```

> ⚠️ La configuration est validée au démarrage par Zod (`lib/env.ts`). Si une variable est manquante ou malformée (URL invalide, secret trop court…), **l'application refuse de démarrer** avec un message détaillant chaque champ fautif. Il n'y a volontairement pas de `.env.example` versionné.

Appliquer le schéma Prisma et lancer le serveur :

```bash
npm run db:push
npm run dev
```

L'application est accessible sur `http://localhost:3000`.

---

## Variables d'environnement

Toutes les variables ci-dessous sont **obligatoires** sauf mention contraire — elles sont validées par Zod au boot (`lib/env.ts`), avec les contraintes indiquées.

| Variable | Contrainte | Description |
|---|---|---|
| `DATABASE_URL` | URL | Connexion PostgreSQL (Supabase, pooler) |
| `DIRECT_URL` | URL | Connexion directe PostgreSQL pour Prisma (migrations) |
| `NEXTAUTH_SECRET` | ≥ 32 car. | Secret de session NextAuth |
| `AUTH_SECRET` | ≥ 32 car. | Secret NextAuth v5 (les deux sont requis) |
| `SUPABASE_URL` | URL | URL du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | non vide | Clé service Supabase (Storage documents) |
| `ML_API_URL` | URL | Base du modèle ML (`/predict`, `/save_claim`) |
| `ML_INTERNAL_SECRET` | ≥ 8 car. | Envoyée en en-tête `X-Internal-Key` au ML |
| `GMAIL_USER` | email | Adresse Gmail pour les notifications |
| `GMAIL_APP_PASSWORD` | ≥ 16 car. | Mot de passe applicatif Gmail |
| `CRON_SECRET` | ≥ 32 car. | Autorisation des jobs cron Vercel |
| `NEXT_PUBLIC_BASE_URL` | URL | URL publique de base (exposée au client) |
| `LOG_LEVEL` | *optionnel* | Niveau de log (`debug`/`info`/`warn`/`error`) |

`env` est exposé via un Proxy qui **lève une erreur si une variable serveur est lue depuis le bundle client** — seules les clés `NEXT_PUBLIC_*` y sont accessibles.

---

## Scripts disponibles

```bash
npm run dev           # Serveur de développement (localhost:3000)
npm run build         # Build de production (lance `prisma generate` au préalable)
npm run build:mobile  # Build en mode mobile (MOBILE_BUILD=true, pour Capacitor)
npm run start         # Démarre le serveur de production
npm run lint          # Analyse ESLint
npm run typecheck     # Vérification TypeScript (tsc --noEmit)
npm run test          # Vitest en mode watch
npm run test:run      # Vitest en une passe (CI)
npm run db:push       # Applique le schéma Prisma à la base
npm run db:studio     # Ouvre Prisma Studio (GUI base de données)
npm run db:generate   # Régénère le client Prisma
```

> `postinstall` exécute automatiquement `prisma generate` après chaque `npm install`.

---

## Structure du projet

```
flowmerce-web-app/
├── app/
│   ├── page.tsx                  # Landing page marketing
│   ├── auth/                     # Pages login / register
│   ├── dashboard/                # Interface vendeur
│   │   ├── claims/               # Gestion des réclamations
│   │   ├── api-keys/             # Gestion des clés API
│   │   └── return-policy/        # Configuration politique de retour
│   ├── admin/                    # Panel administrateur
│   │   ├── vendors/              # Approbation des vendeurs
│   │   ├── claims/               # Vue globale des réclamations + export ML
│   │   └── clients/[vendorId]/   # Vue analytique par vendeur
│   ├── docs/                     # Documentation d'intégration (page publique)
│   ├── return/[token]/           # Portail client white-label
│   └── api/                      # Routes API REST
│       ├── v1/
│       │   ├── return-form/      # GET — définition JSON du formulaire
│       │   └── returns/          # POST — canal unique de soumission
│       ├── admin/claims/         # Vue admin, export dataset ML, save-claim
│       ├── claims/               # CRUD réclamations
│       │   └── validation-mode/  # PATCH — bascule MANUAL ↔ AI_AUTO
│       ├── vendors/              # Gestion vendeurs & documents
│       ├── api-keys/             # Cycle de vie des clés API
│       ├── return-policy/        # Politique de retour (+ `advanced/`)
│       ├── return-sessions/      # Génération de liens portail
│       ├── return/[token]/       # Lecture session + infos vendeur (portail)
│       │                         #   POST — alias déprécié de /v1/returns
│       ├── fraud/                # Rapports de refus
│       ├── predict/              # Appel direct ML
│       ├── cron/                 # Jobs planifiés (retry ML)
│       └── health/               # Health check
├── components/                   # Composants React réutilisables
├── lib/
│   ├── services/
│   │   ├── return-submission.ts  # Canal unique de soumission (cœur métier)
│   │   ├── return-credentials.ts # Clé API ou jeton de session → contexte
│   │   ├── claim-ingestion.ts    # Service unifié de création de réclamation
│   │   ├── return-form-builder.ts# Vendor + ReturnPolicy → formulaire JSON générique
│   │   ├── return-form-validation.ts # Réponses validées contre la définition
│   │   ├── ml.ts                 # Intégration modèle ML
│   │   ├── notification.ts       # Notifications email
│   │   └── return-policy.ts      # Logique politique de retour
│   ├── constants.ts              # Source de vérité unique des chaînes métier
│   ├── env.ts                    # Validation Zod de l'environnement (boot)
│   ├── fraud-score.ts            # Calcul du score de fraude
│   ├── rate-limit.ts             # Rate limiting persistant (table dédiée)
│   ├── storage.ts                # Supabase Storage (upload / URL signée)
│   └── api-key-auth.ts           # Middleware authentification clé API
├── hooks/                        # Hooks React personnalisés
├── __tests__/                    # Suite Vitest (lib, services, routes API)
├── prisma/
│   ├── schema.prisma             # Schéma de base de données
│   └── seed.ts                   # Données de test
└── android/                      # Application mobile Capacitor (Android)
```

---

## Architecture des données

Les modèles principaux de la base de données :

| Modèle | Description |
|---|---|
| `User` | Utilisateurs système (ADMIN ou VENDOR) |
| `Vendor` | Profil e-commerçant (statut : PENDING / APPROVED / REJECTED) |
| `ApiKey` | Clés d'authentification API par vendeur |
| `Document` | Documents d'onboarding vendeur (KYC) |
| `ReturnPolicy` | Règles de retour par vendeur (seuils, modes, types acceptés) |
| `Claim` | Réclamation client avec prédiction ML (unique sur `vendorId + orderId`) |
| `ReturnSession` | Session temporaire pour le portail white-label |
| `CustomerFraudRecord` | Historique de fraude client cross-vendeur |
| `RefusalReport` | Signalement de refus par un vendeur (unique sur `vendorId + orderId`) |
| `ReturnRateLimit` | Compteurs de rate limiting persistés en base |
| `PredictionLog` | Journal d'audit du modèle ML |

---

## Logique métier

### Cycle de vie d'une réclamation

Une réclamation se soumet par un **canal unique** — `POST /api/v1/returns` — servi par un service unique, `lib/services/return-submission.ts`. Ce canal connaît **deux usages**, distingués par le seul identifiant présenté :

| Usage | Identifiant | Qui soumet | Réponse sur refus de politique |
|---|---|---|---|
| **Formulaire embarqué** | clé API (`Bearer flk_…` / `x-api-key`) | la boutique, pour son client | `422` avec le code métier — la plateforme réagit |
| **Portail white-label** | jeton de session (`X-Return-Token: ret_…`) | le client final, page hébergée | `201` + `rejected: true` — le client reçoit une explication et un mail |

Tout le reste est commun : construction du formulaire, revalidation des réponses contre sa définition, rate limiting, score de fraude, contrôle de politique, payload ML et ingestion par `ingestClaim`. Le contexte de soumission (`lib/services/return-credentials.ts`) porte les seules différences : champs déjà connus du serveur, champs verrouillés, audience et `source` du claim.

> `POST /api/return/[token]` subsiste comme **alias déprécié** du mode jeton, pour les intégrations qui pilotent elles-mêmes une session. Il délègue au même service et n'a aucun comportement propre.

```
Client / API vendeur
       │
       ▼
 Validation politique de retour
 (délai, catégorie, type accepté)
       │
       ▼
  Calcul score de fraude
       │
       ▼
  Création atomique du Claim
  (déduplication sur vendorId + orderId)
       │
       ▼
  Appel ML (si payload fourni)
       │
      / \
  Reject   Exchange / Repair
    │              │
    ▼              ▼ (si AI_AUTO **et** type ≠ REFUND)
 REJECTED       APPROVED
                   │
       (si MANUAL, ou type = REFUND,
        ou ML absent / en échec)
                   ▼
               PENDING
          → revue humaine vendeur
```

**Statuts possibles d'une réclamation :**

| Statut | Description |
|---|---|
| `PENDING` | En attente de traitement (mode MANUAL ou ML en échec) |
| `IN_PROGRESS` | Prise en charge par le vendeur |
| `APPROVED` | Approuvée (manuellement ou automatiquement) |
| `REJECTED` | Rejetée (manuellement ou par décision ML) |

Le champ `type` (EXCHANGE / REFUND / REPAIR) représente le **souhait du client** et ne change jamais. La décision ML (`aiDecision`) peut recommander une résolution différente ; l'UI les affiche côte à côte. Les deux vocabulaires sont volontairement distincts : `type` est un choix client, `aiDecision` est une recommandation modèle sur **trois classes seulement** (voir [Intégration ML](#intégration-ml-libservicesmlts)).

---

### Politique de retour (`lib/services/return-policy.ts`)

Chaque vendeur configure sa politique de retour. Lors de la soumission d'une réclamation, quatre règles sont évaluées dans l'ordre (les trois premières peuvent refuser, la quatrième requalifie) :

1. **Fenêtre de rétractation** — Si la réclamation arrive après `maxClaimDays` jours depuis la commande, elle est refusée avec le code `DELAY_EXCEEDED`.
2. **Catégorie non remboursable** — Si la catégorie produit figure dans `nonRefundableCategories`, la réclamation est refusée avec `NON_REFUNDABLE_CATEGORY`.
3. **Type de réclamation non accepté** — Si le type demandé (ex. REFUND) ne fait pas partie des `acceptedTypes` du vendeur, refus avec `CLAIM_TYPE_NOT_ACCEPTED`.
4. **Échange uniquement** — Si la catégorie est dans `exchangeOnlyCategories`, le type est forcé en EXCHANGE même si le client a demandé un remboursement (`forceExchange: true`).

Si aucune règle ne s'applique, la réclamation est acceptée et passe à l'étape suivante. En l'absence de politique configurée, tout est accepté (`forceExchange: false`).

Les autres champs de `ReturnPolicy` — `processingDays`, `fraudScoreThreshold`, `fraudReturnThreshold`, `allowRefusalOnDelivery`, `partialRefundEnabled` / `partialRefundRules` — n'entrent pas dans `checkReturnPolicy` : ils alimentent l'affichage vendeur, le seuil `Is_Suspicious` envoyé au ML, et la politique avancée.

---

### Modes de validation

Chaque vendeur choisit comment ses réclamations sont traitées :

| Mode | Comportement |
|---|---|
| `MANUAL` | Toutes les réclamations passent en `PENDING` — le vendeur décide manuellement |
| `AI_AUTO` | Si le ML retourne `Exchange` ou `Repair`, la réclamation est automatiquement `APPROVED` — **sauf si son `type` est `REFUND`** |

Deux règles transversales s'appliquent quel que soit le mode :

- **Un `Reject` du ML rejette toujours la réclamation**, immédiatement et automatiquement. Le ML est la seule source pouvant refuser à ce stade, la politique vendeur ayant déjà été validée en amont par la route.
- **Un remboursement n'est jamais auto-approuvé.** Si `claim.type === 'REFUND'`, la réclamation reste `PENDING` même en `AI_AUTO` : le vendeur doit valider chaque remboursement à la main, car c'est le seul cas engageant un mouvement financier. Les échanges et réparations conservent l'auto-approbation.

#### Bascule du mode (`PATCH /api/claims/validation-mode`)

Le vendeur (ou un admin, en précisant `vendorId`) peut basculer `MANUAL ↔ AI_AUTO`. Passer en `AI_AUTO` **approuve rétroactivement** les réclamations déjà `PENDING` qui remplissent les mêmes conditions — `aiDecision ∈ {Exchange, Repair}` et `type ≠ REFUND` — et notifie chaque client. Les réclamations sans décision ML restent `PENDING`. La route répond `{ validationMode, approved }`, `approved` étant le nombre de réclamations requalifiées.

#### Drapeau `refundEligible`

Lorsqu'une réclamation de type `REFUND` reçoit une décision ML non-`Reject` et satisfait toujours `checkReturnPolicy`, `ingestClaim` écrit `refundEligible: true` dans le JSON `prediction`. Ce drapeau est **purement informatif** — une aide à la décision affichée au vendeur. Il ne modifie ni le statut, ni `aiDecision`, ni `claim.type`, et ne déclenche aucune action financière.

---

### Score de fraude cross-vendeur (`lib/fraud-score.ts`)

Le score est calculé à partir de trois composantes pondérées, chacune plafonnée :

```
score = claims_local + refusals_local + cross_vendor_confirmation

  claims_local   = min(totalClaims   × 5,  30)   → max 30 pts
  refusals_local = min(totalRefusals × 10, 40)   → max 40 pts
  cross_vendor   = min((distinctVendors - 1) × 15, 30)  → max 30 pts
```

**Exemples concrets :**

| Situation | Score |
|---|---|
| Nouveau client, 1 réclamation | 5 / 100 |
| 1 vendeur, 10 réclamations + 10 refus | 70 / 100 (plafond local) |
| 3 vendeurs différents, 1 réclamation + 1 refus chacun | 75 / 100 |
| 5+ vendeurs distincts | 100 / 100 |

**Interprétation :**

| Plage | Niveau |
|---|---|
| < 35 | Faible |
| 35 – 59 | Modéré |
| ≥ 60 | Élevé |

**Pourquoi ce design ?** Un vendeur seul ne peut pas dépasser ~70, même en spammant des signaux. Atteindre 100 nécessite une confirmation de plusieurs marchands indépendants — ce qui empêche les faux positifs causés par un vendeur malveillant ou mal configuré.

Le matching client se fait **par email en priorité**, puis par téléphone. Les deux identifiants peuvent être liés au même `CustomerFraudRecord`.

---

### Réseau de refus (`reportRefusal`)

Un vendeur peut signaler qu'un client a **refusé** de récupérer ou d'accepter un retour traité. Ce signal :

- Incrémente `totalRefusals` sur le `CustomerFraudRecord` du client (+10 pts au score)
- Met à jour `distinctVendors` en recomptant toutes les interactions cross-réseau
- Est **idempotent** : un double signalement sur la même commande est ignoré
- Nécessite que la transaction (orderId) appartienne bien au vendeur signalant — vérification faite côté route avant l'appel au service

---

### Intégration ML (`lib/services/ml.ts`)

Le modèle ML reçoit un payload de 19 champs structurés décrivant la réclamation, le client et le contexte de la commande. Trois champs sont des **placeholders à la construction** et sont recalculés juste avant l'envoi par `ingestClaim` :

| Champ recalculé | Source |
|---|---|
| `Fraud_Score` | `computeFraudScore()` au moment de l'ingestion |
| `Customer_Past_Returns` | `fraudRecord.totalClaims` en base |
| `Is_Suspicious` | `1` si `pastReturns ≥ fraudReturnThreshold` (seuil vendeur), `0` sinon |

**Contrat trois classes.** Le modèle ne renvoie que `Exchange`, `Repair` ou `Reject` — **jamais `Refund`**. Le remboursement relève du choix client (`claim.type`), pas d'une recommandation modèle. Toute autre valeur reçue est une violation de contrat : la réponse est traitée comme un échec (`mlFailed: true`) **sans retry**, puisque rejouer le même input renverrait la même classe.

**Résilience :** Le client ML effectue jusqu'à **2 retries** avec backoff exponentiel (~250 ms puis ~500 ms, avec jitter) et un timeout de **4 secondes** par tentative. Seuls les échecs réseau et les HTTP 5xx / 429 sont rejoués. En cas d'échec, la réclamation reste en `PENDING` avec `mlFailed: true` — un **cron job** (`/api/cron/retry-ml`, quotidien à minuit UTC via `vercel.json`) tente de rejouer les appels ML échoués.

**Sortie du modèle :**

```json
{
  "resolution": {
    "prediction": "Exchange",
    "probabilities": { "Exchange": 0.82, "Repair": 0.14, "Reject": 0.04 }
  },
  "shipping_paid_by": {
    "prediction": "Customer",
    "probabilities": { "Customer": 0.71, "Shop": 0.29 }
  }
}
```

Le résultat brut du modèle est mergé dans le JSON `prediction` de la réclamation, aux côtés des champs canoniques ; `aiScore` reçoit la probabilité maximale.

---

### Export du dataset ML (`POST /api/admin/claims/export`)

Réservé aux **admins**. Envoie vers l'endpoint ML `/save_claim` toutes les réclamations jamais exportées (`exportedToML: false`), une par une, pour alimenter le jeu de données d'entraînement. Chaque succès marque la réclamation comme exportée ; les échecs sont journalisés sans interrompre le lot. La progression est **streamée en NDJSON** (`{type:'progress'|'done', …}`).

Le payload suit le contrat `ReclamationInput` du modèle Pydantic côté FastAPI. Il est reconstruit à partir du `mlInput` persisté (source de vérité), complété par les données de la réclamation et des valeurs neutres — **sans aucun recalcul**. À la différence de `/predict`, le champ `Resolution` de cet export accepte bien les quatre valeurs, `Refund` inclus, puisqu'il décrit une issue réelle et non une prédiction.

---

## Formulaire de retour embarqué

Flowmerce est la **source de vérité unique** pour les retours : le formulaire (champs, motifs, résolutions, règles de validation) est **généré dynamiquement** à partir du compte vendeur et de sa `ReturnPolicy`, puis embarqué dans la boutique partenaire. La boutique ne code jamais en dur les champs ni les motifs — elle restitue le JSON tel quel.

### Flux en deux étapes

```
1. GET  /api/v1/return-form      → définition du formulaire (JSON générique)
                                     → rendu dynamique côté boutique
2. POST /api/v1/returns          → soumission { orderId, productId, answers }
                                     → Flowmerce valide et répond claim_id + statut
```

- **`GET /api/v1/return-form`** — identifie le vendeur par sa clé API (Bearer **ou** `x-api-key`), construit le formulaire via `buildReturnForm(vendor, returnPolicy)` (`lib/services/return-form-builder.ts`) : sections `order` / `reason` / `resolution` / `description`, options de motifs et de résolutions **filtrées** par la politique (`acceptedReturnReasons`, `acceptedTypes`), règles de validation pilotées par le JSON, et `meta.policy` résumé (délai, catégories non remboursables, échange seul…). Le JSON n'expose **jamais** les données sensibles de la politique.
- **`POST /api/v1/returns`** — reçoit un body générique `{ orderId, productId, answers: { fieldId: valeur } }`. Chaque réponse est **revalidée côté serveur contre la définition du formulaire** (champs requis, types, longueurs, HTML, options valides), puis mappée vers `checkReturnPolicy` → `ingestClaim` (score de fraude, déduplication sur `vendorId + orderId`, appel ML, auto-approve `AI_AUTO`). Aucune règle de politique n'est dupliquée dans la route.

### Versionnage et compatibilité

Le JSON du formulaire porte deux entiers au premier niveau :

```json
{ "version": 1, "min_compatible_version": 1, "sections": [...], "merchant_fields": [...] }
```

| Champ | Sens |
|---|---|
| `version` | Version du contrat servie aujourd'hui. Incrémentée **uniquement sur une rupture** : champ supprimé ou renommé, type modifié, contrainte durcie, sémantique changée. |
| `min_compatible_version` | Version de moteur la plus ancienne capable de rendre ce formulaire. |

**Règle côté intégrateur** — un moteur écrit pour la version `V` accepte le formulaire si `V >= min_compatible_version`. C'est le **seul** contrôle à implémenter :

```ts
// ✅ résiste aux évolutions additives
if (MY_ENGINE_VERSION < form.min_compatible_version) throw new Error('moteur trop ancien')

// ❌ bloque sur un ajout inoffensif
if (![1].includes(form.version)) throw new Error('version non supportée')
```

**Contrepartie obligatoire** — le consommateur doit **ignorer ce qu'il ne connaît pas** : propriétés inconnues sur un champ, types de champ inconnus, sections inconnues. C'est ce qui permet d'enrichir le formulaire sans casser les intégrations en place.

Les évolutions **additives** ne changent pas `version` : nouvelle propriété sur un champ, nouveau champ optionnel, contrainte relâchée, nouvelle option dans un `select`. C'est le cas le plus fréquent — les motifs et résolutions varient déjà d'un vendeur à l'autre selon sa `ReturnPolicy`.

> **Historique.** Le contrat n'a jamais rompu : il est en `v1` depuis l'origine. L'ajout de `field.source` et le passage de `shipping_method` en optionnel avaient brièvement fait passer `version` à `2` ; ces deux évolutions étant additives, l'incrément n'était pas justifié et a été annulé.

#### Champs boutique — `merchant_fields`

Le JSON sépare **ce qui s'affiche** de **ce qui se fournit** :

```json
{
  "sections":        [ /* à AFFICHER au client final */ ],
  "merchant_fields": [ /* à FOURNIR depuis vos données de commande */ ]
}
```

Un moteur de rendu boucle sur `sections`. Les champs boutique n'y étant pas, il ne peut pas les afficher — **la règle est structurelle, elle ne dépend pas de la vigilance de l'intégrateur**. Chaque champ porte aussi `source: 'customer' | 'merchant'`, mais ce n'est plus qu'une indication : le placement suffit.

Les `merchant_fields` sont des **faits de la commande** que la boutique possède déjà — jamais une saisie du client final :

| Champ | Pourquoi la boutique |
|---|---|
| `customer_id` | Identifiant interne ; le client ne le connaît pas et une valeur inventée casserait le lien avec son historique |
| `customer_wilaya` | Adresse de livraison de la commande. Feature du modèle (`Customer_Wilaya`) |
| `payment_method` | Mode de paiement réellement utilisé. Feature du modèle (`Payment_Method`) |
| `shipping_method` | Donnée logistique. Feature du modèle (`Shipping_Method`) |
| `shipping_cost` | Donnée logistique. Feature du modèle (`Shipping_Cost_DA`) |

Aucun n'est `required` : la boutique peut ne pas avoir l'information, auquel cas l'ingestion retombe sur son repli neutre (`Unknown`, `Standard`, `0`). L'exiger fermerait le formulaire à un client qui n'a aucun moyen de le renseigner. En revanche, dès qu'une valeur est transmise elle est **validée** contre sa définition — type, bornes, options — au même titre qu'un champ de `sections`.

**Côté portail hébergé** — la règle est appliquée par le serveur : ces champs ne sont ni affichés, ni acceptés depuis le body. La `ReturnSession` fait foi, et le verrouillage est **dérivé du formulaire** (`merchantFieldIds`), pas d'une liste en dur — un futur champ boutique sera protégé sans rien changer.

**Côté clé API** — la boutique reste libre d'afficher ce qu'elle veut, mais elle doit aller chercher ces champs hors de `sections` pour cela : le chemin par défaut est le bon. Flowmerce ne peut pas distinguer une valeur lue dans sa base d'une valeur relayée depuis un champ affiché au client ; laisser le client les saisir lui donnerait prise sur quatre features du payload ML, donc sur la prédiction.

### Exemple de soumission

```json
POST /api/v1/returns
x-api-key: <VOTRE_CLE_API_FLOWMERCE>
{
  "orderId": "CMD-1234",
  "productId": "PROD-5678",
  "answers": {
    "customer_name": "Ahmed Benali",
    "customer_email": "client@exemple.com",
    "customer_phone": "0555123456",
    "product_name": "Nike Air Max",
    "order_date": "2026-07-15",
    "reason": "Produit défectueux",
    "desired_resolution": "REFUND",
    "description": "Le produit est arrivé endommagé."
  }
}
```

Réponse `201` : `{ success, claim_id, status, message }` — `status` ∈ `PENDING` / `APPROVED` / `REJECTED` / `IN_PROGRESS`.

> Dans l'exemple ci-dessus, `desired_resolution: "REFUND"` garantit un `status: "PENDING"` : les remboursements attendent toujours une validation vendeur, même en mode `AI_AUTO`. Seul un `Reject` du ML peut les faire basculer directement en `REJECTED`.

### Erreurs possibles

| Code | Signification |
|---|---|
| `400` | Réponse invalide par rapport à la définition du formulaire (requis, type, option, HTML, longueur) |
| `401` | Clé API manquante, invalide ou révoquée |
| `403` | Compte vendeur non approuvé |
| `409` | Une demande de retour existe déjà pour cette commande |
| `422` | Refus par la politique du vendeur (`DELAY_EXCEEDED`, `CLAIM_TYPE_NOT_ACCEPTED`…) |
| `429` | Rate limit dépassé (voir ci-dessous) |

**Rate limiting** — compteurs persistés en base (`ReturnRateLimit`) sur `POST /api/v1/returns` :

| Portée | Limite | Fenêtre | Appliqué à |
|---|---|---|---|
| IP + `orderId` | 3 tentatives | 1 heure | les deux usages |
| Vendeur + email client + jour | 3 demandes | 24 heures | usage boutique uniquement |

Le second compteur protège contre l'empoisonnement du score de fraude par soumissions répétées. Il ne s'applique pas au portail hébergé, dont le lien est déjà à usage unique.

> 📄 Guide d'intégration complet pour les plateformes partenaires : `integration-formulaire-retour-flowmerce.md`.

---

### Onboarding vendeur

Un vendeur suit ce parcours avant de pouvoir utiliser la plateforme :

```
Inscription → PENDING
     │
     ▼
Upload documents KYC
(carte d'identité, registre commerce, justificatif adresse, etc.)
     │
     ▼
Revue admin → APPROVED / REJECTED / DOCUMENTS_REQUESTED
     │
     ▼ (si APPROVED)
Accès dashboard + génération clés API
```

Les documents sont stockés sur Supabase Storage. L'admin peut demander des compléments (`DOCUMENTS_REQUESTED`) sans rejeter définitivement le dossier.

---

### API — Authentification

Les appels API externes (ingestion de réclamations) s'authentifient via une clé API dans l'en-tête, dans l'un ou l'autre format — les deux sont acceptés partout :

```
Authorization: Bearer <api_key>
x-api-key: <api_key>
```

Le portail hébergé, lui, ne dispose d'aucune clé API : le navigateur du client final s'authentifie avec le jeton de sa session de retour, sur le même endpoint.

```
X-Return-Token: ret_<token>
```

Les clés API sont générées depuis le dashboard vendeur (`/dashboard/api-keys`). Chaque clé trace sa dernière utilisation (`lastUsedAt`) et peut être révoquée individuellement.

---

## Données de test

Pour peupler la base avec des données de démonstration :

```bash
npx ts-node prisma/seed.ts
```

Le seed crée un vendeur de démonstration approuvé (politique MANUAL) et des réclamations couvrant toutes les combinaisons statut × type × source × ML × fraude.

---

## Tests

La suite tourne sous **Vitest** — aucune base de données ni service externe n'est requis, les dépendances (Prisma, ML, email) sont mockées.

```bash
npm run test        # mode watch
npm run test:run    # une passe (CI)
```

Périmètre couvert (`__tests__/`) :

| Fichier | Couverture |
|---|---|
| `lib/services/claim-ingestion.test.ts` | Dédup, score de fraude, auto-approve / auto-reject, carve-out REFUND |
| `lib/services/ml.test.ts` | Retries, timeout, rejet des classes hors contrat |
| `lib/services/return-policy.test.ts` | Les quatre règles de politique et leur ordre |
| `lib/services/return-form-builder.test.ts` | Génération du formulaire et filtrage par politique |
| `lib/fraud-score.test.ts` | Formule pondérée et plafonds |
| `lib/rate-limit.test.ts` | Compteurs, fenêtres, réinitialisation |
| `lib/env.test.ts` | Validation Zod et garde client/serveur |
| `lib/constants.test.ts`, `lib/logger.test.ts`, `lib/utils.test.ts` | Helpers partagés |
| `api/returns.test.ts`, `api/return-form.test.ts`, `api/health.test.ts` | Routes API v1 et health check |
