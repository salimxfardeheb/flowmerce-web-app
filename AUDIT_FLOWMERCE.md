# AUDIT TECHNIQUE — FLOWMERCE

> Date : 2026-04-17
> Auditeur : Audit senior SaaS (Next.js / Prisma / PostgreSQL / Cloudinary)
> Scope : `platforme-Fowmerce/` (Next.js 15 + App Router)

---

## ⚠️ Divergence majeure vs brief initial

Le brief demandait un audit de **SaaS e-commerce classique** (produits, variantes couleur/taille, stock, commandes, Stripe, images de variantes).
**Aucune de ces fonctionnalités n'existe dans ce projet.** Le schéma Prisma ne contient ni `Product`, ni `ProductVariant`, ni `Stock`, ni `Order`, ni `Cart`, ni `ProductImage`.

**Flowmerce est un SaaS B2B de gestion de retours/réclamations (claims)** avec ML anti-fraude pour marchands e-commerce tiers.
Les sections « création produit / variantes / stock / images variant » du brief **ne s'appliquent pas**.

---

## 1. Architecture réelle

- Next.js 15 + App Router, React 19, NextAuth v5 (beta), Prisma 6, PostgreSQL Neon, Cloudinary, bcryptjs.
- FastAPI Python externe (`ML_API_URL`) pour les prédictions.
- Modèles principaux : `User` / `Vendor` (+ KYC documents), `Claim`, `ReturnPolicy`, `ApiKey`, `PredictionLog`, `ReturnRateLimit`.
- **Double endpoint de création de claim** : `/api/claims/create` (strict) **et** `/api/return/[token]` (permissif) — incohérence majeure.

---

## 2. Problèmes CRITIQUES

### 🔴 CRIT-1 — Page hébergée `/api/return/[token]` : zéro sécurité
Fichier : `src/app/api/return/[token]/route.ts`
- Aucun rate limit (contrairement à `/claims/create`).
- Aucune vérification d'unicité → même `order_id` peut créer N claims.
- Aucune validation email, longueur description, anti-HTML.
- CORS `*` → n'importe quel site peut POSTer.
- Token API accepté dans l'URL → fuite dans logs, Referer, historique navigateur.
- **Impact** : inondation de claims, DoS, contournement politique.
- **Fix** : unifier avec `/claims/create`, enlever la clé de la query, imposer rate limit + dédup.

### 🔴 CRIT-2 — Clés API faibles et fuites
- `generateApiKey` utilise `Math.random()` (`src/lib/utils.ts:8-16`) — **non cryptographiquement sûr**.
- Clés stockées en clair en DB.
- `prisma.ts` : `log: ["query"]` activé **tout le temps** → clés API apparaissent dans les logs.
- **Fix** : `crypto.randomBytes(32).toString("base64url")`, stocker un hash, retirer `log: ["query"]` en prod.

### 🔴 CRIT-3 — `NEXTAUTH_SECRET` par défaut
`.env` : `NEXTAUTH_SECRET="your-secret-key-here-change-in-production"`
- Les JWT de session sont **forgeables**. N'importe qui peut se signer un `role: "ADMIN"`.
- **Impact** : take-over total.
- **Fix immédiat** : rotate secret, invalider toutes les sessions, régénérer clés.

### 🔴 CRIT-4 — Credentials production en `.env` local
Neon (DB prod) + Cloudinary (API secret) en clair sur disque. Pas tracké git, mais mélange dev/prod dangereux (`prisma migrate reset` détruirait la prod).

### 🔴 CRIT-5 — Race condition sur rate limit
`src/app/api/claims/create/route.ts:38-67`
- Pattern `findUnique` → `create/update` non atomique.
- Aucune transaction.
- **Impact** : contournement trivial du rate limit par requêtes concurrentes.
- **Fix** : `upsert` atomique avec increment conditionnel ou `$transaction`.

### 🔴 CRIT-6 — Race condition sur unicité claim par `orderId`
`src/app/api/claims/create/route.ts:196-228`
- `findFirst` puis `create` hors transaction.
- **Aucune contrainte DB unique** sur `(vendorId, orderId)` — garantie applicative uniquement.
- **Fix** : `@@unique([vendorId, orderId])` sur `Claim` + handling `P2002`.

### 🔴 CRIT-7 — Politique vendeur non-bloquante dans `/api/predict`
`src/app/api/predict/route.ts:94-143`
- `nonRefundableCategories`, `acceptedReturnReasons` émettent seulement des `warnings`, **jamais un reject**.
- Le vendeur croit que sa politique s'applique, en réalité le ML décide seul.
- **Impact** : non-conformité contractuelle.

### 🔴 CRIT-8 — Validations d'input trop faibles / incohérentes
- `/api/return/[token]` ne valide que 3 champs.
- `/api/vendors/[vendorId]` : `requestedDocuments` non validé (peut contenir n'importe quoi).
- `/api/claims/[claimId]` : `overrideShipping`/`overrideNote` insérés dans JSONB sans validation → XSS stored possible.

### 🔴 CRIT-9 — `/api/vendors/documents/view` : XSS + SSRF
`src/app/api/vendors/documents/view/route.ts`
- `htmlPage()` interpole des strings directement dans du HTML (pas d'échappement).
- `proxyAndServe(url, …)` : `url` vient de la DB, aucun whitelistage → **SSRF** possible (`http://localhost:6379`, etc.).
- **Fix** : escape HTML, whitelist `res.cloudinary.com`.

### 🔴 CRIT-10 — Auto-approbation vendeur mal gardée
`src/app/api/vendors/documents/[documentId]/route.ts:49-68`
- Si `requestedDocuments` est vidé entre deux actions parallèles, `[].every() === true` → **auto-approbation sans documents validés**.
- **Fix** : `requestedDocuments.length > 0 && allAccepted` + transaction avec lock.

---

## 3. Problèmes MOYENS

### 🟠 MOY-1 — `Claim.prediction` : JSONB bazar
Stocke 3 choses différentes (sortie ML, overrides admin, enrichissements page hébergée) sans contrat typé.
**Fix** : éclater en tables dédiées (`ClaimEnrichment`, `ClaimOverride`).

### 🟠 MOY-2 — Double endpoint création claim incohérent
- `/api/claims/create` : strict, fraudScore, rate limit, dédup.
- `/api/return/[token]` : laxiste, zéro contrôle.
- Même table `Claim` → données incohérentes.
**Fix** : la page hébergée doit appeler `/api/claims/create` en interne.

### 🟠 MOY-3 — `checkVendorAccess` non câblé partout
`src/lib/vendorGuard.ts` existe mais utilisé seulement dans la page claims. API keys / return-policy à auditer.

### 🟠 MOY-4 — `isSuspended` basé sur préfixe string `[SUSPENDU]`
Source unique de vérité = parsing de `rejectionReason`. Fragile.
**Fix** : ajouter `VendorStatus.SUSPENDED` + colonne `suspendedReason` dédiée.

### 🟠 MOY-5 — Rate limit contournable via `x-forwarded-for`
Header lu sans vérifier proxy de confiance → n'importe qui change d'IP logique.

### 🟠 MOY-6 — N+1 et requêtes séquentielles
- `/api/claims/create` : 5 round-trips DB non transactionnels.
- `/api/vendors/documents/[id]` : 3 RTT.
- Pagination absente sur `/admin/vendors` et `/dashboard/claims` (filtres JS côté serveur, casse à > 1000 claims).

### 🟠 MOY-7 — `log: ["query"]` en prod
Bruit + coût Neon + fuite de credentials dans logs.

### 🟠 MOY-8 — Documents KYC Cloudinary `access_mode: public`
`src/app/api/vendors/documents/route.ts:86`
- URL publique devinable (`{vendorId}/documents/{TYPE}_{Date.now()}`) → exposition RGPD.
- **Fix** : `access_mode: "authenticated"` + signed URLs expirant.

### 🟠 MOY-9 — Aucun test
Zéro `*.test.ts`, zéro Jest/Vitest/Playwright configuré.

### 🟠 MOY-10 — Pas de CSRF explicite
Routes state-changing + JWT cookie. `OPTIONS` ouvertes `*` préoccupantes. À valider que `SameSite=Lax` couvre tout.

### 🟠 MOY-11 — Aucun audit log
Approbations, suspensions, overrides ML : **aucune trace** de qui/quand/quoi.

---

## 4. Problèmes MINEURS

- **MLN-1** : `as any` sur PrismaAdapter (`src/lib/auth.ts:8`) et partout ailleurs → bypass TypeScript.
- **MLN-2** : pas de limite sur `vendorCategories` / `acceptedReturnReasons` (tableau arbitraire).
- **MLN-3** : password `min(8)` sans check complexité.
- **MLN-4** : mapping `reason → ClaimType` **différent** entre `/claims/create` et `/return/[token]`. Bug de classification garanti.
- **MLN-5** : `parseFloat(... || '0') || null` retourne `null` pour prix légitime de 0.
- **MLN-6** : `seed.ts` non inspecté — vérifier qu'il ne crée pas un admin en dur.
- **MLN-7** : pas de gzip sur proxy documents.
- **MLN-8** : base64 d'un fichier 5 Mo bufferisé RAM côté serveur (`documents/route.ts`) — utiliser les streams Cloudinary.
- **MLN-9** : aucune intégration Sentry/Datadog/Axiom. Aveugle en prod.
- **MLN-10** : `dev.db` + `flowmerce.db` SQLite traînant dans `prisma/` alors que le projet utilise Postgres.
- **MLN-11** : `session.user as any` omniprésent — typer correctement `AppSession`.

---

## 5. Edge cases concrets (qui CASSENT)

1. Double-clic client sur formulaire retour → 2 claims identiques (pas de lock/unique).
2. 2 actions admin parallèles sur docs → auto-approbation peut rater ou se déclencher 2×.
3. FastAPI ML down → timeout 10 s, aucun fallback.
4. `requestedDocuments = []` + passage en `DOCUMENTS_REQUESTED` → `[].every() === true` → auto-approbation immédiate (CRIT-10).
5. `orderId` inexistant (pas de modèle `Order` dans le schéma) → claims fantômes à volonté.
6. Désactivation clé API pendant requête en cours → race.
7. Suppression d'un `User` admin → `onDelete: Cascade` détruit le `Vendor` et ses claims facturables.
8. Changement politique pendant claim `PENDING` → `maxClaimDays` non figé.
9. `x-forwarded-for` forgé → rate limit contourné.
10. PATCH claim avec `status + aiDecision` contradictoires → UI incohérente.
11. Upload 4,9 Mo → `formData()` bufferisé RAM, DoS facile.
12. Onglet `/return/[token]` ouvert, vendeur change `acceptedReasons` → soumission motif invalide (pas de revalidation POST).
13. 2 admins suspendent/dé-suspendent simultanément → last-write-wins silencieux.
14. Limite 5 clés API applicative uniquement, pas de contrainte DB.

---

## 6. Verdict final

### Prêt pour la production ? **NON.**

### Pourquoi
1. **Sécurité** : `NEXTAUTH_SECRET` par défaut → compromission triviale. Game over avant toute autre discussion.
2. Génération de clés API faible (`Math.random`) + stockage clair + logs.
3. Deux endpoints création claim avec logique divergente ; `/api/return/[token]` quasi sans sécurité.
4. Race conditions non gérées (rate limit, unicité).
5. Aucun test, aucune observabilité, aucun audit log.
6. KYC sur URL Cloudinary publiques devinables → exposition RGPD.

### TOP 5 priorités immédiates

1. **Rotate `NEXTAUTH_SECRET`** (random 64 bytes), invalider toutes les sessions, rotate clés Cloudinary (exposées sur écrans).
2. **Refondre la génération/validation des clés API** : `crypto.randomBytes`, hash en DB, retirer `log: ["query"]`, clé uniquement dans `Authorization: Bearer`.
3. **Fusionner `/api/return/[token]` et `/api/claims/create`** : un seul endpoint, rate limit, dédup, `$transaction`, `@@unique([vendorId, orderId])` + handling `P2002`.
4. **Sécuriser les documents KYC** : `access_mode: "authenticated"` + signed URLs 10 min, supprimer le proxy XSS-prone.
5. **Fixer CRIT-10** : vérifier `requestedDocuments.length > 0 && allAccepted`, transaction avec lock, ajouter `VendorStatus.SUSPENDED` dans l'enum.

### Dette à traiter ensuite
- Éclater `Claim.prediction` en tables dédiées.
- Pagination sur `/admin/vendors` et `/dashboard/claims`.
- Audit log (`AdminActionLog`).
- Tests e2e Playwright + unitaires Vitest.
- Secret manager (Vercel/Doppler) au lieu de `.env`.
- Sentry + logs structurés.
