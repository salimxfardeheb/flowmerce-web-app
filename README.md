# FLOWMERCE

Plateforme SaaS B2B de gestion des retours et détection de fraude pour e-commerçants. FLOWMERCE automatise le traitement des demandes de retour (remboursement, échange, réparation) et identifie les comportements frauduleux grâce à un modèle de machine learning.

---

## Fonctionnalités

- **Gestion des réclamations** — Création, suivi et résolution de réclamations via API ou portail client white-label
- **Détection de fraude** — Score de fraude cross-vendeur (0–100) basé sur l'historique client
- **Intégration ML** — Décisions automatiques via un modèle Python hébergé séparément
- **Portail white-label** — Page de dépôt de réclamation brandée, accessible via lien token
- **Dashboard vendeur** — Gestion des politiques de retour, clés API, et suivi des réclamations
- **Panel admin** — Approbation des vendeurs, revue des documents, vue par client
- **Notifications email** — Alertes automatiques (soumission, approbation, rejet)

---

## Stack technique

| Couche | Technologie |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Langage | TypeScript 5 |
| Style | Tailwind CSS 4 |
| Base de données | PostgreSQL (Neon serverless) |
| ORM | Prisma 7 |
| Auth | NextAuth v5 (beta) |
| Stockage fichiers | Cloudinary |
| Email | Nodemailer (Gmail) |
| ML backend | API HTTP externe (Render) |
| Déploiement | Vercel |

---

## Prérequis

- Node.js ≥ 20
- npm ≥ 10
- Une base de données PostgreSQL (ou compte [Neon](https://neon.tech))
- Compte Cloudinary (upload de documents)
- Compte Gmail avec mot de passe applicatif (notifications)
- ML backend déployé séparément (optionnel pour dev local)

---

## Installation

```bash
git clone https://github.com/FLOWMERCE/flowmerce-web-app.git
cd flowmerce-web-app
npm install
```

Copier et remplir le fichier d'environnement :

```bash
cp .env.example .env.local
```

Appliquer le schéma Prisma et lancer le serveur :

```bash
npm run db:push
npm run dev
```

L'application est accessible sur `http://localhost:3000`.

---

## Variables d'environnement

| Variable | Description |
|---|---|
| `DATABASE_URL` | URL de connexion PostgreSQL (Neon) |
| `NEXTAUTH_SECRET` | Secret de session NextAuth (32+ caractères) |
| `AUTH_SECRET` | Secret alternatif pour l'auth |
| `NEXTAUTH_URL` | URL de base pour les callbacks auth |
| `ML_API_URL` | Endpoint du modèle ML |
| `ML_INTERNAL_SECRET` | Clé secrète pour les appels ML internes |
| `GMAIL_USER` | Adresse Gmail pour les notifications |
| `GMAIL_APP_PASSWORD` | Mot de passe applicatif Gmail (16 caractères) |
| `CLOUDINARY_CLOUD_NAME` | Nom du cloud Cloudinary |
| `CLOUDINARY_API_KEY` | Clé API Cloudinary |
| `CLOUDINARY_API_SECRET` | Secret API Cloudinary |
| `CLOUDINARY_URL` | URL complète Cloudinary |
| `CRON_SECRET` | Secret d'autorisation pour les cron Vercel |
| `NEXT_PUBLIC_BASE_URL` | URL publique de base (côté client) |
| `LOG_LEVEL` | Niveau de log (`debug`/`info`/`warn`/`error`) |

---

## Scripts disponibles

```bash
npm run dev           # Serveur de développement (localhost:3000)
npm run build         # Build de production
npm run start         # Démarre le serveur de production
npm run lint          # Analyse ESLint
npm run typecheck     # Vérification TypeScript
npm run db:push       # Applique le schéma Prisma à la base
npm run db:studio     # Ouvre Prisma Studio (GUI base de données)
npm run db:generate   # Régénère le client Prisma
```

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
│   │   └── clients/[vendorId]/   # Vue analytique par vendeur
│   ├── return/[token]/           # Portail client white-label
│   └── api/                      # Routes API REST
│       ├── claims/               # CRUD réclamations
│       ├── vendors/              # Gestion vendeurs & documents
│       ├── api-keys/             # Cycle de vie des clés API
│       ├── return-policy/        # Politique de retour
│       ├── return-sessions/      # Génération de liens portail
│       ├── fraud/                # Rapports de refus
│       ├── predict/              # Appel direct ML
│       ├── cron/                 # Jobs planifiés (retry ML)
│       └── health/               # Health check
├── components/                   # Composants React réutilisables
├── lib/
│   ├── services/
│   │   ├── claim-ingestion.ts    # Service unifié de création de réclamation
│   │   ├── ml.ts                 # Intégration modèle ML
│   │   ├── notification.ts       # Notifications email
│   │   └── return-policy.ts      # Logique politique de retour
│   ├── fraud-score.ts            # Calcul du score de fraude
│   └── api-key-auth.ts           # Middleware authentification clé API
├── hooks/                        # Hooks React personnalisés
├── prisma/
│   ├── schema.prisma             # Schéma de base de données
│   └── seed.ts                   # Données de test
└── docs/                         # Documentation interne
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
| `Claim` | Réclamation client avec prédiction ML |
| `ReturnSession` | Session temporaire pour le portail white-label |
| `CustomerFraudRecord` | Historique de fraude client cross-vendeur |
| `PredictionLog` | Journal d'audit du modèle ML |

---

## Logique métier

### Cycle de vie d'une réclamation

Une réclamation peut être soumise par deux canaux : l'**API REST** (depuis la plateforme du vendeur) ou le **portail white-label** (directement par le client final). Dans les deux cas, le traitement passe par le même service central `ingestClaim`.

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
  Reject  Refund / Exchange / Repair
    │              │
    ▼              ▼ (si AI_AUTO)
 REJECTED       APPROVED
                   │
              (si MANUAL)
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

Le champ `type` (EXCHANGE / REFUND / REPAIR) représente le **souhait du client** et ne change jamais. La décision ML (`aiDecision`) peut recommander une résolution différente ; l'UI les affiche côte à côte.

---

### Politique de retour (`lib/services/return-policy.ts`)

Chaque vendeur configure sa politique de retour. Lors de la soumission d'une réclamation, trois règles sont vérifiées dans l'ordre :

1. **Fenêtre de rétractation** — Si la réclamation arrive après `maxClaimDays` jours depuis la commande, elle est refusée avec le code `DELAY_EXCEEDED`.
2. **Catégorie non remboursable** — Si la catégorie produit figure dans `nonRefundableCategories`, la réclamation est refusée avec `NON_REFUNDABLE_CATEGORY`.
3. **Type de réclamation non accepté** — Si le type demandé (ex. REFUND) ne fait pas partie des `acceptedTypes` du vendeur, refus avec `CLAIM_TYPE_NOT_ACCEPTED`.
4. **Échange uniquement** — Si la catégorie est dans `exchangeOnlyCategories`, le type est forcé en EXCHANGE même si le client a demandé un remboursement (`forceExchange: true`).

Si aucune règle ne s'applique, la réclamation est acceptée et passe à l'étape suivante.

---

### Modes de validation

Chaque vendeur choisit comment ses réclamations sont traitées :

| Mode | Comportement |
|---|---|
| `MANUAL` | Toutes les réclamations passent en `PENDING` — le vendeur décide manuellement |
| `AI_AUTO` | Si le ML retourne Refund / Exchange / Repair, la réclamation est automatiquement `APPROVED` |

Dans les deux modes, une décision ML **Reject** entraîne un rejet automatique immédiat, indépendamment du mode configuré.

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

**Résilience :** Le client ML effectue jusqu'à **2 retries** avec backoff exponentiel (250 ms, 500 ms) et un timeout de **4 secondes** par tentative. En cas d'échec, la réclamation passe en `PENDING` avec `mlFailed: true` — un **cron job** (`/api/cron/retry-ml`) tente de rejouer les appels ML échoués.

**Sortie du modèle :**

```json
{
  "resolution": {
    "prediction": "Refund",
    "probabilities": { "Refund": 0.82, "Exchange": 0.11, "Repair": 0.04, "Reject": 0.03 }
  }
}
```

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

Les documents sont stockés sur Cloudinary. L'admin peut demander des compléments (`DOCUMENTS_REQUESTED`) sans rejeter définitivement le dossier.

---

### API — Authentification

Les appels API externes (ingestion de réclamations) s'authentifient via une clé API dans l'en-tête :

```
Authorization: Bearer <api_key>
```

Les clés API sont générées depuis le dashboard vendeur (`/dashboard/api-keys`). Chaque clé trace sa dernière utilisation (`lastUsedAt`) et peut être révoquée individuellement.

---

## Données de test

Pour peupler la base avec des données de démonstration :

```bash
npm run db:studio   # Vérifier l'état de la base
npx ts-node prisma/seed.ts
```

Voir `docs/seed-discussion.md` pour le détail des données générées.
