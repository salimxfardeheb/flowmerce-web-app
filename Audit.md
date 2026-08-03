# Audit technique — FLOWMERCE Web App

> Audit général du code à jour de la branche `refactor/refund_Decision`.
> Date : 2026-08-03 — Base : `C:\Users\salah\Desktop\startup\flowmerce-web-app`

---

## 1. Vue d'ensemble

FLOWMERCE est une plateforme SaaS B2B de gestion des retours et de détection de fraude pour e-commerçants. Le code privilégie la **qualité de la modélisation** : un service central (`ingestClaim`) canalise tous les canaux de soumission, le formulaire embarqué repose sur un **builder JSON générique** indépendant de la UI, et la logique de politique de retour est isolée dans `checkReturnPolicy` (aucune duplication dans les routes).

| Critère | Valeur |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Langage | TypeScript 5 |
| Base de données | PostgreSQL (Supabase) + Prisma 7 |
| Auth | NextAuth v5 (beta) — credentials + JWT |
| Client mobile | Capacitor 8 (Android, WebView distant sur Vercel) |
| Tests | Vitest 4 — 13 fichiers, 115 tests ✅ |
| Typecheck | `tsc --noEmit` — **6 erreurs** (fichiers de test uniquement) |

---

## 2. Architecture

### 2.1 Modules principaux

| Module | Fichiers | Rôle |
|---|---|---|
| Form builder embarqué | `lib/services/return-form-builder.ts`, `app/api/v1/return-form/route.ts` | Génère le formulaire JSON générique à partir du Vendeur + ReturnPolicy |
| Soumission embarquée | `app/api/v1/returns/route.ts` | Valide `{ orderId, productId, answers }` contre la définition du formulaire puis ingère |
| Ingestion unifiée | `lib/services/claim-ingestion.ts` | Création atomique du Claim (dédup), fraud score, appel ML, auto-approve/reject |
| Politique de retour | `lib/services/return-policy.ts` | Vérifications DELAY / CATEGORY / CLAIM_TYPE / forceExchange |
| Fraude | `lib/fraud-score.ts` | Score cross-vendeur + réseau de refus idempotent |
| ML client | `lib/services/ml.ts` | Payload 19 champs, retries + timeout, contrat 3 classes strict |
| Notification | `lib/services/notification.ts` | Emails HTML Gmail (Nodemailer) |
| Rate limit | `lib/rate-limit.ts` | Fenêtre par clé en base (fail-closed) |
| Auth API | `lib/api-key-auth.ts` | Clés hachées (SHA-256), vendor APPROVED requis |

### 2.2 Canaux de création de réclamation

| Canal | Auth | Endpoint | Source (Claim) |
|---|---|---|---|
| API REST interne | `x-api-key` | `POST /api/claims/create` | `API` / `HOSTED_PAGE` |
| Formulaire embarqué | Bearer ou `x-api-key` | `GET /api/v1/return-form` → `POST /api/v1/returns` | `API` |
| Portail white-label | Token à usage unique | `POST /api/return/[token]` | `HOSTED_PAGE` |

Les trois canaux aboutissent au même `ingestClaim` → fraude, déduplication, ML.

### 2.3 Schéma de données (14 modèles)

`User`, `Account`, `Session`, `VerificationToken`, `Vendor`, `Document`, `ReturnPolicy`, `ApiKey`, `ReturnSession`, `Claim`, `PredictionLog`, `ReturnRateLimit`, `CustomerFraudRecord`, `RefusalReport` — 15 migrations (avril → juillet 2026).

**Point fort :** la contrainte `@@unique([vendorId, orderId])` sur `Claim` rend la déduplication fiable côté base (et non pas seulement applicative).

---

## 3. Sécurité

### 3.1 Points forts constatés

- **Clés API hachées** en base (`hashApiKey`), jamais stockées en clair, révocables individuellement, traçables (`lastUsedAt`).
- **Validation serveur systématique** sur toutes les routes : champs requis, longueurs, email, rejet HTML (regex), allow-lists (raisons/résolutions).
- **Rate limiting par fenêtre** (IP+commande, puis client/jour anti *fraud-score poisoning*) — fail-closed en cas d'erreur DB.
- Données personnelles **masquées** dans le portail (`a***@domain`, `******12`) et rejet des valeurs HTML.
- `X-Frame-Options: DENY`, `nosniff`, Permissions-Policy (caméra/micro bloqués) dans `next.config.ts`.
- Route de validation ML : **contrat sur les classes** — une prédiction hors `Exchange | Repair | Reject` est un échec non-retryable (fail-closed).
- Le formulaire embarqué n'expose **jamais** les données sensibles de la politique (`validationMode`, seuils, `acceptedReturnReasons` bruts).
- `.env.local` est bien exclu via `.gitignore` (secrets non versionnés).

### 3.2 Réserves

- Pas de **rate limit au niveau API** sur la récupération du formulaire (`GET /api/v1/return-form`) au-delà de la clé elle-même — acceptable car clé + abus visibles.
- Pas de **webhook** sortant ni d'endpoint public de statut (la boutique cote « en attente » par défaut).
- Pas d'**API d'upload public** : les champs `image/video/file/signature` exigent un gestionnaire d'upload côté boutique.

---

## 4. Qualité, tests & maintenabilité

### 4.1 Tests — 115/115 ✅

| Suite | Fichiers | Couverture |
|---|---|---|
| Unités (lib) | `utils`, `env`, `constants`, `rate-limit`, `logger`, `fraud-score`, `return-policy`, `return-form-builder`, `ml`, `claim-ingestion` | Logique métier principale |
| Intégration (API) | `health`, `return-form`, `returns` | Auth, validation, rate-limit, policy, création |

### 4.2 Typecheck — 6 erreurs (fichiers de test uniquement)

| Fichier | Ligne | Erreur |
|---|---|---|
| `__tests__/api/health.test.ts` | 27, 41 | `mockResolvedValue`/`mockRejectedValue` inconnus sur le client `$queryRaw` |
| `__tests__/api/returns.test.ts` | 134 | `delete` sur propriété non-optionnelle |
| `__tests__/api/returns.test.ts` | 202 | objet assigné à un champ typé `null` |
| `__tests__/lib/logger.test.ts` | 31, 41 | `NODE_ENV` en lecture seule (assignation interdite) |

Le code de production (`app/`, `components/`, `lib/`) ne produit **aucune** erreur `tsc`. Les 6 erreurs sont dues aux mocks Vitest et ne bloquent pas le build, mais devraient être corrigées (voir §6).

### 4.3 Volumétrie

| Périmètre | Fichiers | Lignes (approx.) |
|---|---|---|
| `app/` | 44 | ~ 7 000 |
| `components/` | 13 | ~ 2 100 |
| `lib/` | 17 | ~ 2 000 |
| **Total** | **74** | **~ 11 100** |

---

## 5. Points d'attention connus

1. **Double flux de génération de lien portail** : `/api/return-sessions` (riche, 72 h, pré-remplie PII) et `/api/checkout-session` (minimal, 24 h) coexistent. Consolidation à prévoir pour éviter la divergence des payloads.
2. **Descripteurs de raisons incohérents** : le formulaire (`GET /api/v1/return-form`) propose des motifs en français (`RETURN_REASONS`, ex. « Produit défectueux »), tandis que `POST /api/claims/create` valide `reason` contre `EXTERNAL_RETURN_REASONS` (anglais : `DEFECTIVE`, `WRONG_ITEM`, `DESCRIPTION`, `CHANGE_MIND`). Une soumission **strictement** générée depuis le formulaire peut être rejetée `400 Raison invalide`. → **Réconcilier les deux constantes** (priorité haute).
3. **`docs/seed-discussion.md` n'existe pas** (référence supprimée du README). La description du seed réside désormais dans le README.
4. **`.env.example` n'existe pas** : le README conseille `cp .env.example .env.local` mais aucun template n'est commité — le contrat env est seulement défini dans `lib/env.ts`.
5. **Pas d'endpoint public de statut / webhook** : les boutiques ne peuvent pas interroger l'évolution d'un `claim_id`.
6. **Pas d'API d'upload publique** pour les champs `image/video/signature` (délégué côté boutique).
7. **Tests : 6 erreurs `tsc`** (cf. §4.2) — la santé CI dépend de `test:run` mais pas d'un typecheck strict sur les tests.

---

## 6. Recommandations

| Priorité | Action |
|---|---|
| Haute | Unifier `RETURN_FORM.reasons` (français) et `EXTERNAL_RETURN_REASONS` (codes) pour que le formulaire embarqué soit soumis sans `400` |
| Haute | Ajouter une passe de **TS sur les tests** au CI + corriger les 6 erreurs §4.2 |
| Moyenne | Documenter le contrat d'environnement en fournissant un **`.env.example`** désensibilisé |
| Haute | Fournir un **endpoint public de statut** ou un **webhook** de sortie (blocker pour les intégrations boutiques) |
| Moyenne | Consolider les deux endpoints de génération de liens portail (`checkout-session` vs `return-sessions`) |
| Faible | Ajouter un rate limit sur `GET /api/v1/return-form` (opt.) |
| Faible | Publier une spec OpenAPI pour les 3 endpoints v1/formulaire (contrat versionné explicitement via `RETURN_FORM_VERSION`) |

---

## 7. Conclusion

FLOWMERCE est un codebase **bien architecturé** et **soigneusement sécurisé** : source de vérité unique pour la politique, formulaire embarqué 100 % générique (aucune logique dupliquée côté boutique), ingestion centralisée et sécurité serveur soignée. La priorité immédiate est la **réconciliation des raisons de retour** (casse fonctionnelle entre `GET /api/v1/return-form` et `POST /api/v1/returns` / `/api/claims/create`), puis la **correction du typecheck des tests** et l'achèvement de la **documentation et du contrat d'env**.