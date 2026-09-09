# Image Next.js autonome (multi-stage). Utilisée par le docker-compose
# full-stack à la racine du dépôt — pas nécessaire pour `next dev` local.
#
# Node 20 : même version que la CI (.github/workflows/ci.yml).
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Résilience réseau : plus de tentatives / timeouts plus longs (registre npm
# lent ou instable). --no-audit --no-fund : rien d'utile en build.
RUN npm config set fetch-retries 5 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm config set fetch-timeout 300000 \
    && npm ci --no-audit --no-fund

# ── Build ──────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Les NEXT_PUBLIC_* sont inlinés DANS le bundle au build → passés en args.
# NEXT_PUBLIC_API_URL = l'URL de l'API telle que le NAVIGATEUR la joint
# (ex. http://localhost:8000/api). Le rendu serveur, lui, utilise
# API_URL_INTERNAL au runtime (cf. src/lib/api-base.ts).
ARG NEXT_PUBLIC_API_URL=http://localhost:8000/api
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_USE_MOCKS=false
# Hostname du domaine public du bucket média (next/image allowlist). Vide →
# next.config.ts retombe sur `media.akal.ma`. Doit matcher AWS_S3_CUSTOM_DOMAIN
# du backend. Sans objet pour le docker-compose (médias en localhost:9000).
ARG NEXT_PUBLIC_MEDIA_HOSTNAME=
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=
ARG NEXT_PUBLIC_SENTRY_DSN=
ARG NEXT_PUBLIC_FIREBASE_API_KEY=
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID=
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
ARG NEXT_PUBLIC_FIREBASE_APP_ID=
ARG NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
# Autorise next/image à charger les médias depuis un MinIO local en
# http://localhost:9000 — lu par next.config.ts au build. `false` par défaut
# (vrais déploiements : médias derrière media.akal.ma) ; passé à `true` par le
# docker-compose full-stack uniquement.
ARG MEDIA_ALLOW_LOCALHOST=false
ENV MEDIA_ALLOW_LOCALHOST=$MEDIA_ALLOW_LOCALHOST \
    NEXT_PUBLIC_MEDIA_HOSTNAME=$NEXT_PUBLIC_MEDIA_HOSTNAME \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_USE_MOCKS=$NEXT_PUBLIC_USE_MOCKS \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=$NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID \
    NEXT_TELEMETRY_DISABLED=1

# `generateStaticParams` / `sitemap` interrogent le catalogue au build ; le
# backend n'est pas joignable ici → build OK quand même, 0 fiche pré-générée
# (cf. app/parcelles/[slug]/page.tsx), rendues à la demande au runtime.
RUN npm run build

# ── Runtime ────────────────────────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN useradd -m nextjs
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
