# ── Stage 1: install all dependencies (build + dev) ───────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: production-only dependencies (for runtime prisma CLI) ─────────────
FROM node:22-alpine AS prod-deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 3: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma client into lib/generated/prisma
RUN node node_modules/.bin/prisma generate
# proxy.ts checks NEXTAUTH_SECRET at module load time; supply a placeholder so
# `next build` can collect page data. The real secret is injected at runtime.
ENV NEXTAUTH_SECRET=build-placeholder
# SHA is passed via --build-arg GIT_SHA=$(git rev-parse --short HEAD) and baked
# into the bundle so the Settings page and /api/health can surface the build.
ARG GIT_SHA=dev
ENV NEXT_PUBLIC_GIT_SHA=$GIT_SHA
RUN npm run build

# ── Stage 4: runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl netcat-openbsd

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Standalone Next.js server (server.js + traced node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Static assets and public files
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public        ./public

# Prisma generated client (standalone trace may not pick up custom output path)
COPY --from=builder --chown=nextjs:nodejs /app/lib/generated/prisma ./lib/generated/prisma

# Production node_modules — needed by the entrypoint's `prisma db push`
# Prisma 7's CLI has a large transitive dep tree (includes Studio, effect, etc.)
# so we copy the full production set rather than cherry-picking packages.
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Prisma schema needed by `db push`
COPY --from=builder --chown=nextjs:nodejs /app/prisma         ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts

# Uploads directory (actual files come from the Docker volume)
RUN mkdir -p public/uploads && chown nextjs:nodejs public/uploads

# Entrypoint
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
