# ═══════════════════════════════════════════════════════════════
#  Flowmerce — Application Next.js
#  Build multi-stage : deps → builder → runner (output standalone)
# ═══════════════════════════════════════════════════════════════
ARG NODE_VERSION=24-alpine

# ═══════════════════════════════════════════════════════════════
#  STAGE 1 : deps — installe les dépendances node
# ═══════════════════════════════════════════════════════════════
FROM node:${NODE_VERSION} AS deps

# libc6-compat : requis par certaines dépendances natives sur Alpine
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Le script `postinstall` du projet lance `prisma generate` :
# le schéma et la config Prisma doivent donc être présents avant `npm ci`.
COPY package.json package-lock.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma

# prisma.config.ts exige DATABASE_URL/DIRECT_URL pour se charger.
# `prisma generate` n'ouvre aucune connexion : un placeholder suffit,
# la vraie valeur est injectée au runtime par Docker Compose.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

RUN npm ci

# ═══════════════════════════════════════════════════════════════
#  STAGE 2 : builder — compile l'application
# ═══════════════════════════════════════════════════════════════
FROM node:${NODE_VERSION} AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Active `output: "standalone"` dans next.config.ts (build Docker uniquement)
ENV DOCKER_BUILD=true
ENV NEXT_TELEMETRY_DISABLED=1

# lib/env.ts valide l'environnement via zod au chargement du module et
# refuse de démarrer si une variable manque — y compris pendant `next build`.
# Ces placeholders satisfont le schéma sans introduire le moindre secret :
# toutes les valeurs serveur sont réinjectées au runtime par Docker Compose.
ENV DIRECT_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    NEXTAUTH_SECRET="build_time_placeholder_not_a_secret_0000000000" \
    AUTH_SECRET="build_time_placeholder_not_a_secret_0000000000" \
    SUPABASE_URL="https://placeholder.supabase.co" \
    SUPABASE_SERVICE_ROLE_KEY="placeholder" \
    CRON_SECRET="build_time_placeholder_not_a_secret_0000000000" \
    ML_API_URL="http://ml:8000" \
    ML_INTERNAL_SECRET="placeholder" \
    GMAIL_USER="placeholder@example.com" \
    GMAIL_APP_PASSWORD="placeholderplaceholder"

# NEXT_PUBLIC_* est inliné dans le bundle client au moment du build :
# c'est la seule variable qui doit porter sa valeur réelle dès ici.
ARG NEXT_PUBLIC_BASE_URL=http://localhost:3000
ENV NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL}

RUN npm run build

# ═══════════════════════════════════════════════════════════════
#  STAGE 3 : runner — image finale minimale
# ═══════════════════════════════════════════════════════════════
FROM node:${NODE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Utilisateur non-root : si l'application est compromise,
# l'attaquant n'a pas les droits root dans le conteneur.
RUN addgroup -g 1001 -S nodejs \
 && adduser  -u 1001 -S nextjs -G nodejs

# Le serveur standalone embarque uniquement les dépendances réellement
# tracées : ni node_modules complet, ni sources TypeScript.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Le client Prisma 7 s'appuie sur un query compiler WebAssembly.
# Copie explicite : le file-tracing de Next ne garantit pas l'inclusion du .wasm.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs

EXPOSE 3000

# Le serveur répond dès qu'il est prêt ; on n'exige pas un 2xx car
# /api/health dépend de la base de données (hors périmètre Docker ici).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
