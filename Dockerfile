FROM node:24-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@11.2.2 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/data ./data
COPY --from=builder /app/run-migrations.cjs ./run-migrations.cjs
# Liveness probe for HEALTHCHECK below and for deploy.yml's readiness wait.
COPY --from=builder /app/healthcheck.mjs ./healthcheck.mjs

EXPOSE 3001

# Visibility only (`docker ps` shows healthy/unhealthy); nothing restarts on it. The deploy waits
# on the same probe itself rather than on this, so it does not depend on the interval.
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD ["node", "healthcheck.mjs"]

CMD ["node", "dist/main.js"]
