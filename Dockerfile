# ── Stage 1: install dependencies ─────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: build ────────────────────────────────────────────────────────────
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
RUN npm run build

# ── Stage 3: runtime ──────────────────────────────────────────────────────────
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

# Prisma CLI + schema needed by the entrypoint's `prisma db push`
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin/prisma   ./node_modules/.bin/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma        ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma       ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pg            ./node_modules/pg
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pg-types      ./node_modules/pg-types
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pgpass        ./node_modules/pgpass
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/dotenv        ./node_modules/dotenv
COPY --from=builder --chown=nextjs:nodejs /app/prisma                     ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts           ./prisma.config.ts

# Uploads directory (actual files come from the Docker volume)
RUN mkdir -p public/uploads && chown nextjs:nodejs public/uploads

# Entrypoint
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q --spider http://localhost:3000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
