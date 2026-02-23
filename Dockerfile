# ── Stage 1: Install dependencies ─────────────────────────────────────────────
FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy only manifests + lockfile for a cacheable install layer
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/catalog/package.json packages/catalog/
COPY apps/web-client/package.json apps/web-client/

RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/catalog/node_modules ./packages/catalog/node_modules
COPY --from=deps /app/apps/web-client/node_modules ./apps/web-client/node_modules

# Copy source
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json ./
COPY packages/catalog packages/catalog
COPY apps/web-client apps/web-client

# Build catalog first (web-client imports @crucible/catalog)
RUN pnpm --filter @crucible/catalog build

# Build web-client (standalone output)
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter web-client build

# ── Stage 3: Production runner ────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone server (mirrors monorepo layout)
COPY --from=builder /app/apps/web-client/.next/standalone ./

# Copy static assets (not included in standalone output)
COPY --from=builder /app/apps/web-client/public ./apps/web-client/public
COPY --from=builder /app/apps/web-client/.next/static ./apps/web-client/.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/web-client/server.js"]
