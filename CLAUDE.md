# cografya_api

NestJS 11 + TypeORM + PostgreSQL 16 + Redis 7. TypeScript `strict` + `noUncheckedIndexedAccess`.
Node 24, pnpm (pinned via `packageManager`). Single source of truth for the OpenAPI contract
that `../cografya_web` codegens from. Parent workspace rules: `../CLAUDE.md`.

Read on demand, not every session:
- `docs/architecture.md` — module map, request pipeline, env, cache/upstream, auth, data ingest.
  Read before adding a module, endpoint, guard, migration or env var.
- `docs/conventions.md` — code style, DTO/pagination shape, test lanes, commit/PR rules.
  Read before writing a DTO, a test, or a migration.
- `README.md` — human onboarding (setup, seeds, script table).

## Commands

```bash
docker compose up -d                 # local Postgres + Redis
pnpm start:dev                       # http://localhost:3001, Swagger at /docs
pnpm typecheck && pnpm lint          # gate before every commit (no --fix in review)
pnpm test:unit [path]                # jest, specs next to source; bare `jest` lacks the config
pnpm test:e2e                        # Testcontainers, slow; a local .env with *_ENABLED=true
                                     # fails 6 upstream suites, CI has no .env
pnpm openapi:generate                # after ANY DTO/route change; commit openapi/openapi.json
# ^ EACCES on dist/? The dev container built it as root:
#   docker exec -u 0 cografya-api-dev sh -lc 'chown -R 1000:1000 /app/dist'
pnpm migration:generate src/database/migrations/<Name>   # then register it (see below)
```

`pnpm migration:*` and `pnpm db:*` build first and run compiled `dist/` on plain Node,
reading `DATABASE_URL` from the shell (no `.env` loading).

## Hard rules

- `synchronize` is off forever. Entity change → generate migration → **read the SQL** →
  add the class to the explicit `migrations` array in `src/database/data-source-options.ts`
  (entities are listed explicitly there too, no globs). Never commit an unread migration.
- A new migration breaks suites that never mention it: `province`/`country` e2e each assert
  the FULL ordered migration list (two copies, on purpose). Run the whole `pnpm test:e2e`
  lane before pushing a migration, not just the module you touched.
- Every env var the app reads is declared in the zod schema `src/config/env.schema.ts`.
  Booleans use `envBoolean()` (`'true'`/`'false'` only). Validation runs at import time:
  anything that imports `AppModule` validates `process.env` immediately.
- Every request DTO: `class-validator` + `@nestjs/swagger` decorators. Global pipe is
  `whitelist + forbidNonWhitelisted + transform`, so unknown query/body keys are 400.
- Auth is opt-in: `@UseGuards(AccessTokenGuard)` per route, never a global guard.
  `@CurrentUser()` throws 500 if the guard is missing (intended). Bearer JWT only.
- Public reads set headers via `@CacheControl(...)`, never `@Header`. Routes with PII use
  the module's `*-no-store.middleware.ts` (runs before guards, so 401/429 are covered).
- No global exception filter. Error bodies carry i18n keys (`errors.auth.unauthenticated`,
  from `*-error-keys.ts`), never prose. The web renders them.
- User-facing text does not exist in this repo; do not add hardcoded strings.
- Route order: `@Get('map-summary')` stays above `@Get(':slug')` in province/country
  controllers.
- Feature flags (`MARINE_ENABLED` etc.) gate only the upstream/ingest leg; routes stay up
  and degrade. Exception: `ELEVATION_ENABLED=false` → 404 by guard.
- Do not add `cache-manager`, BullMQ, a second entry point, or a shared base query DTO.
  See `docs/architecture.md` for why.
- Never weaken or skip a test to go green. Report exact test counts and quote failures.

## Done means

typecheck + lint clean, unit tests green, e2e green for any touched module that talks to
Postgres, `openapi/openapi.json` regenerated if the contract moved, migration registered if
the schema moved, and the matching web change noted (or made) if a DTO changed.
