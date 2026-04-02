# ── Stage 1: Install dependencies ─────────────────────────────────────────────
FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy only manifests + lockfile for a cacheable install layer
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/catalog/package.json packages/catalog/
COPY packages/crucible/package.json packages/crucible/
COPY apps/web-client/package.json apps/web-client/
COPY apps/demo-dashboard/package.json apps/demo-dashboard/

RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/catalog/node_modules ./packages/catalog/node_modules
COPY --from=deps /app/packages/crucible/node_modules ./packages/crucible/node_modules
COPY --from=deps /app/apps/web-client/node_modules ./apps/web-client/node_modules
COPY --from=deps /app/apps/demo-dashboard/node_modules ./apps/demo-dashboard/node_modules

# Copy source
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json ./
COPY packages/catalog packages/catalog
COPY packages/crucible packages/crucible
COPY apps/web-client apps/web-client
COPY apps/demo-dashboard apps/demo-dashboard

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @atlascrew/crucible build
RUN pnpm deploy --filter @atlascrew/crucible --prod /release

# ── Stage 3: Production runner ────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /release ./

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "dist/bin.js", "start"]
