# Flowmerce Web App — Code Review

| Category           | Count |
|--------------------|-------|
| 🔴 Bugs            | 7     |
| ⚡ Performance     | 5     |
| 🔒 Security        | 13    |
| 🧹 Maintainability | 16    |
| **Total**          | **41**|

---

## 🔴 Bugs

### BUG-1 — Fraud score stored as raw count, not 0-100 score (silent dashboard breakage)
**Files:**
- [app/api/return/[token]/route.ts:151](app/api/return/%5Btoken%5D/route.ts#L151)
- [app/api/claims/create/route.ts:145](app/api/claims/create/route.ts#L145)
- [app/dashboard/page.tsx:105](app/dashboard/page.tsx#L105)
- [app/dashboard/claims/page.tsx:219](app/dashboard/claims/page.tsx#L219)

Both claim-creation routes set `fraudScore: pastReturns` where `pastReturns` is a raw integer count (e.g. `3` for 3 past returns). The dashboard and claims list compare against `fraudScore >= 60` (high risk) and `>= 35` (medium risk). Because a vendor almost never has 35+ claims per customer, the high-risk badge **never fires** for claims created via either route. The `/api/predict` route correctly calls `computeFraudScore()` to produce a 0-100 value, but neither claim-creation route does.

**Fix:** Replace `fraudScore: pastReturns` with the computed score:
```ts
const { record: fraudRecord } = await findOrCreateFraudRecord(customerEmail, ...)
const fraudScore = computeFraudScore(fraudRecord)
```

---

### BUG-2 — `acceptedReasons` always empty — vendor return-reason filter never applied to form
**File:** [app/api/return/[token]/vendor-info/route.ts:49](app/api/return/%5Btoken%5D/vendor-info/route.ts#L49)

The response hardcodes `acceptedReasons: []`. The return form in [app/return/[token]/page.tsx:63-65](app/return/%5Btoken%5D/page.tsx#L63) interprets an empty array as "show all reasons." Vendor-configured reason restrictions are therefore silently ignored — customers always see all 10 reasons regardless of policy.

**Fix:** Populate `acceptedReasons` from `apiKey.vendor.returnPolicy?.acceptedReasons` if that field exists, or derive it from `acceptedTypes` mapping. At minimum remove the hardcoded `[]`.

---

### BUG-3 — `Customer_Satisfaction` permanently hardcoded to `3` in ML input
**File:** [app/api/return/[token]/route.ts:251](app/api/return/%5Btoken%5D/route.ts#L251)

Every ML prediction call from the hosted-page flow sends `Customer_Satisfaction: 3`, regardless of any actual signal. This corrupts the ML feature space and makes the model's satisfaction-sensitive paths unreachable for this flow.

**Fix:** Either collect the value from the form, remove it from the ML payload (if the model can handle its absence), or document why a fixed value is intentional.

---

### BUG-4 — JWT `token.sub` can produce empty-string user ID
**File:** [lib/auth.ts:57](lib/auth.ts#L57)

```ts
session.user.id = token.sub ?? '';
```

`token.sub` is `string | undefined` in NextAuth v5. If it is `undefined`, every subsequent DB lookup using `user.id` (e.g. `prisma.vendor.findUnique({ where: { userId: user.id } })`) silently queries with `userId: ""`, returning `null` and causing unexpected 404/redirect behaviour for the logged-in user.

**Fix:**
```ts
if (!token.sub) throw new Error("token.sub missing");
session.user.id = token.sub;
```

---

### BUG-5 — `checkout-session` stores empty strings for required fields without validation
**File:** [app/api/checkout-session/route.ts:44-56](app/api/checkout-session/route.ts#L44)

Fields like `orderId`, `customerEmail`, and `productName` are stored with `|| ""` fallbacks — no validation that they are non-empty. A session created with an empty `customerEmail` will:
1. Pass the `customerEmail` field check in the return route (empty string satisfies `session.customerEmail`).
2. Bypass the `EMAIL_RE` test because the fallback logic at [app/api/return/[token]/route.ts:74](app/api/return/%5Btoken%5D/route.ts#L74) uses `session.customerEmail || str('customer_email')`, and the API check at line 104 only runs if the combined value is non-empty.

**Fix:** Validate `orderId`, `customerEmail`, and `productName` are non-empty before storing the session. Reject with `400` if missing.

---

### BUG-6 — ML call from hosted-page flow omits `X-Internal-Key` auth header
**File:** [app/api/return/[token]/route.ts:259-263](app/api/return/%5Btoken%5D/route.ts#L259)

The `/api/predict` route correctly attaches `X-Internal-Key` when calling FastAPI ([app/api/predict/route.ts:232-235](app/api/predict/route.ts#L232)). The hosted-page route does not:

```ts
const mlRes = await fetch(`${mlApiUrl}/predict`, {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },  // ← no X-Internal-Key
  ...
```

If the ML server enforces `X-Internal-Key`, predictions silently fail for all hosted-page submissions and claims are created without `aiDecision`.

**Fix:** Add the same `X-Internal-Key` header pattern used in `app/api/predict/route.ts:232-235`.

---

### BUG-7 — Duplicate comment label "── 10." in `claims/create`
**File:** [app/api/claims/create/route.ts:172,178](app/api/claims/create/route.ts#L172)

The route's step comments jump from step 1 directly to step 3 (step 2 is absent), and step 10 appears twice (lines 172 and 178). This makes auditing the control flow error-prone.

**Fix:** Renumber comments sequentially.

---

## ⚡ Performance

### PERF-1 — Unbounded claims fetch on dashboard and claims page
**Files:**
- [app/dashboard/page.tsx:39](app/dashboard/page.tsx#L39)
- [app/dashboard/claims/page.tsx:33-34](app/dashboard/claims/page.tsx#L33)

`app/dashboard/page.tsx` fetches all claims with no `take` limit inside a `vendor.findUnique` include. `app/dashboard/claims/page.tsx` runs two separate full-table scans of the vendor's claims (one filtered, one unfiltered) also without limits. A vendor with thousands of claims will load all of them into memory on every page visit.

**Fix:** Add `take: 50` (or pagination) to both queries; compute aggregate counts with `prisma.claim.count()` instead of loading all records just to call `.filter().length`.

---

### PERF-2 — Entire return page is client-side; server rendering possible
**File:** [app/return/[token]/page.tsx:1-4](app/return/%5Btoken%5D/page.tsx#L1)

The page is marked `'use client'` and fetches vendor info in a `useEffect`. The token is in the URL, so all data needed for the initial render is available server-side. The current pattern adds a waterfall round-trip (HTML → JS → fetch `/vendor-info`) and produces a flash of the loading spinner.

**Fix:** Convert to a server component, call the DB directly in the component, and pass data as props to a small `'use client'` form component.

---

### PERF-3 — No `Suspense` boundaries on any dashboard pages
**Files:** [app/dashboard/page.tsx](app/dashboard/page.tsx), [app/dashboard/claims/page.tsx](app/dashboard/claims/page.tsx), [app/admin/vendors/page.tsx](app/admin/vendors/page.tsx)

All dashboard server components perform multiple sequential DB queries (vendor + claims + policy + keys in one `findUnique` with includes). There are no `<Suspense>` wrappers, so the entire page is blocked until all queries resolve.

**Fix:** Split into granular fetches wrapped in `<Suspense fallback={<Skeleton />}>` for independent sections (metrics, recent claims, navigation cards).

---

### PERF-4 — `PredictionLog` table grows without bound
**File:** [prisma/schema.prisma:196-206](prisma/schema.prisma#L196)

The `PredictionLog` model has no TTL, expiry, or deletion mechanism. Every API call and every hosted-page submission appends a row. At scale this degrades query performance and storage.

**Fix:** Add a scheduled cleanup job or a `expiresAt DateTime` field with a DB-level TTL via pg_partman or a cron that deletes rows older than 90 days. Add a composite index on `(vendorId, createdAt)` for range deletions.

---

### PERF-5 — `ReturnRateLimit` table never cleaned up
**File:** [lib/rate-limit.ts](lib/rate-limit.ts)

Expired rate limit rows (where `resetAt < now`) are updated in place but never deleted. Over time the table accumulates millions of stale rows, degrading the `findUnique` lookup.

**Fix:** Add a periodic DELETE or replace update-in-place with an upsert that resets and a separate cleanup job.

---

## 🔒 Security

### SEC-1 — Production secrets committed to `.env` (CRITICAL)
**File:** `.env` (root)

The `.env` file is not in `.gitignore` (or was committed before being added). It contains:
- `DATABASE_URL` — full Neon PostgreSQL connection string with password
- `NEXTAUTH_SECRET` — JWT signing secret
- `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_URL` — full Cloudinary credentials

**Immediate actions required:**
1. Rotate all secrets (DB password, NextAuth secret, Cloudinary key/secret).
2. Purge the file from git history: `git filter-repo --invert-paths --path .env`.
3. Add `.env` to `.gitignore`; use `.env.local` (already gitignored by Next.js) for local development.
4. Store production secrets in the deployment platform's environment variable vault.

---

### SEC-2 — ML server error detail forwarded directly to API consumer
**File:** [app/api/predict/route.ts:245-247](app/api/predict/route.ts#L245)

```ts
return NextResponse.json(
  { error: "Erreur du modèle ML", detail: errBody },  // errBody from ML server
  { status: 502 }
);
```

`errBody` is the raw response body from the internal ML service, potentially containing stack traces, model paths, or feature names. API consumers should never receive internal service errors.

**Fix:** Log `errBody` server-side; return only a generic `{ error: "Service ML indisponible" }` to the caller.

---

### SEC-3 — No HTTP security headers configured
**File:** [next.config.ts](next.config.ts)

`next.config.ts` sets no `headers()` function. The application sends no `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, or `Referrer-Policy` headers.

**Fix:** Add a `headers()` export to `next.config.ts`:
```ts
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=()' },
    ],
  }];
}
```

---

### SEC-4 — API key accepted in URL query string
**File:** [app/api/claims/create/route.ts:81](app/api/claims/create/route.ts#L81)

```ts
req.nextUrl.searchParams.get("api_key");
```

API keys in query strings are logged by every reverse proxy, CDN, and web server in the chain, appear in browser history, and leak in `Referer` headers. This nullifies the security of the key.

**Fix:** Remove `searchParams.get("api_key")` entirely; require the key only in `x-api-key` or `Authorization: Bearer` headers as the rest of the codebase does.

---

### SEC-5 — KYC/identity documents uploaded as publicly accessible Cloudinary assets
**File:** [app/api/vendors/documents/route.ts:80-87](app/api/vendors/documents/route.ts#L80)

```ts
type:        "upload",
access_mode: "public",   // ← anyone with the URL can read the document
```

National ID cards, business registration documents, and bank details are uploaded with `access_mode: "public"`. Any party who obtains the URL (e.g. from a DB breach, log leak, or accidental exposure) can read the document with no authentication.

**Fix:** Use `access_mode: "authenticated"` and generate signed URLs server-side with short expiry for display/download. Never expose raw Cloudinary URLs to the frontend.

---

### SEC-6 — MIME type for document uploads validated from client-supplied `Content-Type` only
**File:** [app/api/vendors/documents/route.ts:65-72](app/api/vendors/documents/route.ts#L65)

```ts
if (!ALLOWED_MIMES.includes(file.type))  // file.type is client-controlled
```

`file.type` in a `FormData` payload is the MIME type asserted by the client, not verified by the server. A malicious actor can upload an executable disguised as a PDF by setting `Content-Type: application/pdf`.

**Fix:** Inspect the first few bytes (magic bytes / file signature) to verify the actual file type. Libraries like `file-type` (npm) handle this correctly.

---

### SEC-7 — Fraud refusal endpoint has no rate limiting
**File:** [app/api/fraud/report-refusal/route.ts](app/api/fraud/report-refusal/route.ts)

`POST /api/fraud/report-refusal` accepts any valid API key and increments `totalRefusals` for a customer record with no rate limiting. An attacker with a compromised vendor key can inflate any customer's fraud score to 100 with ~7 requests (`7 × 15 = 105 > 100`), permanently blocking them from the platform.

**Fix:** Apply the same `checkRateLimit()` mechanism used in other endpoints, or add a per-`(vendorId, customerEmail)` uniqueness constraint per time window.

---

### SEC-8 — Partial token disclosed in error response
**File:** [app/api/return/[token]/vendor-info/route.ts:18](app/api/return/%5Btoken%5D/vendor-info/route.ts#L18)

```ts
{ valid: false, companyName: '', error: `Lien de retour introuvable. (token: ${token.slice(0, 8)}…)` }
```

Returning a partial token in an error response is a debug artifact that has no user-facing value and reduces token entropy for brute-force attacks.

**Fix:** Remove the token fragment from the error message: `"Lien de retour introuvable."`.

---

### SEC-9 — `PrismaAdapter` cast to `any` in auth configuration
**File:** [lib/auth.ts:8](lib/auth.ts#L8)

```ts
adapter: PrismaAdapter(prisma) as any,
```

This cast suppresses TypeScript's type checking of the adapter, meaning mismatches between the Prisma schema and NextAuth's expected adapter interface are silently ignored at compile time.

**Fix:** Use the typed adapter. If there is a genuine version mismatch, address it explicitly rather than casting.

---

### SEC-10 — Zod validation errors expose internal schema to callers
**Files:**
- [app/api/vendors/register/route.ts:60-62](app/api/vendors/register/route.ts#L60)
- [app/api/api-keys/route.ts:54](app/api/api-keys/route.ts#L54)
- [app/api/vendors/[vendorId]/route.ts:30](app/api/vendors/%5BvendorId%5D/route.ts#L30)
- [app/api/return-policy/route.ts:50](app/api/return-policy/route.ts#L50)

All return `details: error.errors` or `details: parsed.error.flatten()`, revealing field names, types, and validation rules to any caller. The register endpoint also surfaces these to the unauthenticated public.

**Fix:** For public/vendor-facing endpoints return only a generic `"Données invalides"` message. Log the full Zod error server-side.

---

### SEC-11 — No route-level authentication middleware
**File:** (no `middleware.ts` exists)

Authentication is enforced per-page via `getSessionServer()` calls. There is no `middleware.ts` to protect the `/dashboard` and `/admin` route groups. If a new page is added without a session check, it is silently unprotected.

**Fix:** Create `middleware.ts` at the project root using NextAuth's `auth` export to protect `/dashboard/(.*)` and `/admin/(.*)` at the middleware layer, providing defence-in-depth.

---

### SEC-12 — `includes(claimType as any)` loses enum safety on access-control path
**Files:**
- [app/api/return/[token]/route.ts:129](app/api/return/%5Btoken%5D/route.ts#L129)
- [app/api/predict/route.ts:177](app/api/predict/route.ts#L177)

```ts
if (!policy.acceptedTypes.includes(claimType as any))
```

Casting to `any` for an `Array.includes` call on an enum-typed array means TypeScript cannot catch typos or invalid values at compile time. This is a policy-enforcement path; a type error here means a disallowed claim type could slip through.

**Fix:** `policy.acceptedTypes.includes(claimType as ClaimType)` — or fix the upstream type so the cast is unnecessary.

---

### SEC-13 — `api_key` query-param path bypasses `validateApiKey` centralised guard
**File:** [app/api/claims/create/route.ts:79-84](app/api/claims/create/route.ts#L79)

The `rawKey` extraction falls back to `req.nextUrl.searchParams.get("api_key")` before passing to `validateApiKey`. The `validateApiKey` function in `lib/api-key-auth.ts` does not know about this alternative source; future changes to key validation logic may only update `validateApiKey` and miss this codepath.

(See also SEC-4 — this is both a security and maintainability problem.)

---

## 🧹 Maintainability

### MAINT-1 — `apiKeysEqual` exported but never used
**File:** [lib/utils.ts:32-37](lib/utils.ts#L32)

`apiKeysEqual` is defined and exported but has no call sites in the codebase. Dead code.

**Fix:** Delete it.

---

### MAINT-2 — `checkout-session` duplicates API key validation logic
**File:** [app/api/checkout-session/route.ts:7-21](app/api/checkout-session/route.ts#L7)

This route re-implements the exact same key lookup and vendor status check that already exists in `lib/api-key-auth.ts:validateApiKey()`. Any change to validation rules (e.g. checking for suspended vendors) must be made in two places.

**Fix:** Call `validateApiKey(apiKeyValue)` and use its result.

---

### MAINT-3 — `ReturnSession.orderDate` is `String` not `DateTime`
**File:** [prisma/schema.prisma:149](prisma/schema.prisma#L149)

```prisma
orderDate     String    @default("")
```

`orderDate` is stored as a raw string, parsed back into a `Date` object in [app/api/return/[token]/route.ts:152](app/api/return/%5Btoken%5D/route.ts#L152). This means no DB-level date validation, no time-zone normalisation, and comparison with `Date.now()` relies on `new Date(string)` which silently returns `Invalid Date` for unexpected formats.

**Fix:** Change to `orderDate DateTime?` in the schema and migrate.

---

### MAINT-4 — `ReturnSession.vendor` relation points to `ApiKey`, not `Vendor`
**File:** [prisma/schema.prisma:156](prisma/schema.prisma#L156)

```prisma
model ReturnSession {
  vendorId  String
  vendor    ApiKey  @relation(fields: [vendorId], references: [id])
}
```

The field and relation are named `vendor` but reference an `ApiKey` row. Every call site does `session.vendor` to get an `ApiKey` object, which is deeply confusing.

**Fix:** Rename to `apiKey ApiKey @relation(...)` and update all call sites.

---

### MAINT-5 — Risk thresholds are magic numbers duplicated across files
**Files:**
- [app/dashboard/page.tsx:105](app/dashboard/page.tsx#L105)
- [app/dashboard/claims/page.tsx:219-223](app/dashboard/claims/page.tsx#L219)
- `lib/fraud-score.ts` (formula constants)

`fraudScore >= 60` (high) and `>= 35` (medium) appear inline in multiple files with no shared constant.

**Fix:** Export `FRAUD_RISK_HIGH = 60` and `FRAUD_RISK_MEDIUM = 35` from `lib/fraud-score.ts` and use them everywhere.

---

### MAINT-6 — `as any` cast proliferation
**Multiple files:**
- [lib/auth.ts:8](lib/auth.ts#L8) — `PrismaAdapter(prisma) as any`
- [app/api/predict/route.ts:199](app/api/predict/route.ts#L199) — `returnPolicy as any`
- [app/api/predict/route.ts:218](app/api/predict/route.ts#L218) — `(mlInput as any).Refund_Amount_DA`
- [app/api/predict/route.ts:283](app/api/predict/route.ts#L283) — `input: mlInput as any`
- [app/api/return/[token]/route.ts:228](app/api/return/%5Btoken%5D/route.ts#L228) — `returnPolicy as any`
- [app/api/return-policy/route.ts:30](app/api/return-policy/route.ts#L30) — `vendor as any`
- [app/api/vendors/documents/route.ts:99](app/api/vendors/documents/route.ts#L99) — `documentType as any`
- [app/dashboard/claims/page.tsx:209,213-215](app/dashboard/claims/page.tsx#L209) — `(prediction as any)?.override`

Each cast hides a real type mismatch that should be fixed at the source.

---

### MAINT-7 — Home page defines 8 custom SVG icon components instead of using `lucide-react`
**File:** [app/page.tsx:3-87](app/page.tsx#L3)

`IconShield`, `IconZap`, `IconLink`, `IconBell`, `IconLayers`, `IconCheck`, `IconClock`, `IconTrendDown`, and `Logo` are all hand-rolled SVG components. `lucide-react` (already in `dependencies`) provides exact equivalents: `Shield`, `Zap`, `Link`, `Bell`, `Layers`, `CheckSquare`, `Clock`, `TrendingDown`.

**Fix:** Replace all inline SVG components with `lucide-react` imports.

---

### MAINT-8 — `console.log` / `console.error` / `console.warn` in production API routes
**Files:**
- [app/api/return/[token]/route.ts:300,315](app/api/return/%5Btoken%5D/route.ts#L300)
- [app/api/claims/create/route.ts:170,179](app/api/claims/create/route.ts#L170)
- [app/api/predict/route.ts:244,266,286,293](app/api/predict/route.ts#L244)
- [app/api/vendors/documents/route.ts:90](app/api/vendors/documents/route.ts#L90)
- [app/api/fraud/report-refusal/route.ts:88](app/api/fraud/report-refusal/route.ts#L88)

Unstructured console output cannot be queried, aggregated, or alarmed on in production. Errors are swallowed without alerting.

**Fix:** Adopt a structured logger (e.g. `pino`) with severity levels and consistent fields (`event`, `vendorId`, `claimId`, `error`).

---

### MAINT-9 — No route-protection middleware means new pages are silently unprotected
(See also SEC-11.) The absence of `middleware.ts` is both a security and a maintainability problem: the protection pattern must be manually copy-pasted into every new page.

---

### MAINT-10 — Home page marketing copy missing French accents throughout
**File:** [app/page.tsx](app/page.tsx) — lines 93-167 and 140-161 and 251-283

Words like `"Definissez"`, `"Operationnel"`, `"Configurez"`, `"Generez"`, `"echange"`, `"reclamation"`, `"cle"` are missing their accents. The copy reads as unfinished.

---

### MAINT-11 — Footer links are dead `#` placeholders
**File:** [app/page.tsx:496-497](app/page.tsx#L496)

```tsx
<a href="#">Confidentialite</a>
<a href="#">Conditions</a>
```

These pages are referenced in marketing copy but do not exist. They also lack proper accents.

---

### MAINT-12 — `vendorCategories` field accessed via `(vendor as any).vendorCategories`
**File:** [app/api/return-policy/route.ts:30](app/api/return-policy/route.ts#L30)

```ts
vendorCategories: (vendor as any).vendorCategories ?? [],
```

`vendorCategories` is defined in `prisma/schema.prisma:76` and should be available on the typed `vendor` object. The `as any` cast suggests it was added to the schema after the route was written and the types were not regenerated, or `prisma generate` was not run.

**Fix:** Run `prisma generate`, remove the cast.

---

### MAINT-13 — `app/api/claims/create/route.ts` comment step numbering is wrong
**File:** [app/api/claims/create/route.ts](app/api/claims/create/route.ts)

Steps jump 1 → 3 (step 2 "rate limit" comment missing despite the logic existing at line 105 as step 5), and "── 10." appears at both lines 172 and 178.

---

### MAINT-14 — `isSuspended` detection relies on string prefix `[SUSPENDU]` in `rejectionReason`
**Files:**
- [app/dashboard/page.tsx:111-113](app/dashboard/page.tsx#L111)
- [app/admin/vendors/page.tsx:113-115](app/admin/vendors/page.tsx#L113)

```ts
const isSuspended =
  vendor.status === "REJECTED" &&
  (vendor.rejectionReason?.startsWith("[SUSPENDU]") ?? false);
```

Suspension is encoded as a magic string prefix in a free-text field rather than a dedicated DB status. This is fragile: a typo in the prefix, a UI that trims whitespace, or a localisation change breaks suspension detection silently.

**Fix:** Add `SUSPENDED` to the `VendorStatus` enum in the Prisma schema.

---

### MAINT-15 — `app/dashboard/claims/page.tsx` builds filter `where` as `Record<string, unknown>`
**File:** [app/dashboard/claims/page.tsx:25-30](app/dashboard/claims/page.tsx#L25)

```ts
const where: Record<string, unknown> = { vendorId: vendor.id };
if (params.status) where.status = params.status;
```

`params.status` is a raw query string value (`string | undefined`). It is assigned directly to the Prisma `where` clause without validation against the `ClaimStatus` enum. Passing an arbitrary string (e.g. `?status=DROP TABLE`) will cause a Prisma runtime error rather than returning an empty list.

**Fix:** Validate `params.status` against `ClaimStatus` enum values before use.

---

### MAINT-16 — No tests of any kind
**Entire codebase**

There are no unit tests, integration tests, or end-to-end tests. Critical logic paths (fraud score formula, rate limiter, API key hashing, policy enforcement, ML input construction) have zero automated coverage. Any refactor is blind.

**Fix:** At minimum, add unit tests for:
- `lib/fraud-score.ts` — `computeFraudScore` boundary conditions
- `lib/rate-limit.ts` — concurrency and expiry behaviour
- `app/api/predict/route.ts` — `applyVendorPolicy` and `validateInput`
- `app/api/return/[token]/route.ts` — HTML injection, duplicate claim, and rate-limit paths
