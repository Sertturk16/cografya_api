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

EXPOSE 3001

CMD ["node", "dist/main.js"]
