# cografya_api — architecture

Read when adding a module, endpoint, guard, env var, migration or upstream provider.
Rules that must hold on every change are in `CLAUDE.md`; this file explains the shape.

## Request pipeline (`src/main.ts`, in order)

1. `helmet({ contentSecurityPolicy: false })` — CSP is off on purpose (JSON API, no HTML).
2. `applyProxyTrust(app, TRUSTED_PROXY_HOPS)` — Express `trust proxy` as a hop count (0 or 1,
   never `true`). `1` is sound only because a single L7 terminator fronts the API.
3. `enableCors(buildCorsOptions(WEB_ORIGIN))` — one origin, `credentials: false`,
   exposes `X-Marine-Cache-Age` and `Retry-After`.
4. `applyGlobalPrefix(app)` — everything under `/api`; `GET /health` stays bare.
   No URI versioning exists.
5. Global `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })`.
6. Swagger: `buildOpenApiDocument(app)` + `applyDocsGate` → `/docs`, `/docs-json`.
   Non-prod: open. Prod + `DOCS_ACCESS_TOKEN`: HTTP Basic. Prod without it: not mounted.

Global providers registered in `app.module.ts`: `APP_GUARD` = `TrustedClientThrottlerGuard`,
`APP_INTERCEPTOR` = `CacheControlInterceptor`. There is no global exception filter.

## Module map (`src/`, all registered in `app.module.ts`)

| Module | Surface | Notes |
| --- | --- | --- |
| `health` | `GET /health` | `@SkipThrottle()` |
| `province` | `/api/provinces`, `/map-summary`, `/:slug` | 81 il, public, feeds SSG pages; climate + PM2.5 derivations |
| `country` | `/api/countries`, `/map-summary`, `/:slug` | public |
| `region` | `/api/regions`, `/:slug` | 7 coğrafi bölge |
| `reference` | `/api/reference/districts`, `/universities`, `/departments` | registration form lists; districts seeded, others constants |
| `book` | `/api/books`, `/:slug` | catalogue + YouTube sync tours |
| `video-cover` | `GET /api/video-cover/:bookVideoId` | public image proxy through our origin |
| `video-identity` | `GET /api/video-identity/:id` | guarded; YouTube id removed from anon payload |
| `video-progress` | `books/:slug`, `GET/PUT /:bookVideoId` | guarded |
| `favorites` | list / put / delete | guarded; keyed on business keys (plateCode, isoCode), never uuids |
| `game-rounds` | `POST`, `GET`, `GET /leaderboard` | guarded; DB-backed submit rate limit |
| `measurements` | CRUD | guarded |
| `auth` | 12 ops under `/api/auth` | Argon2id, JWT access, opaque refresh sessions, pending registration, password reset, `MAILER_PORT` (noop or AWS SES) |
| `marine` | points/layers + conditions | ECMWF Open Data + CMEMS ingest behind `MARINE_ENABLED` |
| `air-quality` | two province reads | CAMS via Copernicus ADS, EAQI constants, `AIR_QUALITY_ENABLED` |
| `earthquake` | `/api/earthquakes`, `/meta`, `/provinces/:plateCode` | AFAD ingest behind `EARTHQUAKE_ENABLED` |
| `elevation` | `GET /api/elevation/profile` | AWS Terrarium tiles; `ELEVATION_ENABLED=false` → 404 |
| `upstream` | (library) | imported by provider legs, not by AppModule |

File layout per module: flat `*.controller.ts` / `*.service.ts` / `*.module.ts`, plus `dto/`,
`entities/`, provider subfolders (`marine/ecmwf/`, `air-quality/cams/`, ...), and `.spec.ts`
siblings next to every source file.

## Config

`ConfigModule.forRoot({ isGlobal, cache, validate: validateEnv })`. Schema:
`src/config/env.schema.ts` (zod, ~113 vars, cross-field checks via `src/config/env-bounds.ts`).
Unknown keys stripped, missing/mistyped abort boot. `.env.example` documents every var.

Groups: core (`NODE_ENV`, `PORT`=3001, `DATABASE_URL` required, `WEB_ORIGIN`), security
(`TRUSTED_PROXY_HOPS`, `INTERNAL_REQUEST_TOKEN`, `VISITOR_FORWARD_TOKEN`, `DOCS_ACCESS_TOKEN`,
`JWT_SECRET`, `AUTH_HMAC_PEPPER` — min 32 printable ASCII), `REDIS_URL` (optional, must have a
host), `MAIL_TRANSPORT` (`noop` or `ses`, plus `AWS_REGION`/`AWS_ACCESS_KEY_ID`/
`AWS_SECRET_ACCESS_KEY`/`MAIL_FROM_ADDRESS`/`MAIL_FROM_NAME` when `ses`), then one block per leg
(`MARINE_*`, `ECMWF_*`, `CMEMS_*`, `AIR_QUALITY_*`/`ADS_*`, `EARTHQUAKE_*`/`AFAD_*`,
`BOOKS_*`/`YOUTUBE_*`, `VIDEO_COVER_*`, `ELEVATION_*`).

Production rules enforced by the schema: `JWT_SECRET` and `AUTH_HMAC_PEPPER` required
(otherwise ephemeral keys per process); `MARINE_ENABLED=true` requires `REDIS_URL`;
`MAIL_TRANSPORT` must not be `noop` (outbound mail would be silently dropped).

Because validation is eager at import, the OpenAPI generator imports
`src/openapi/preview-env.ts` before `AppModule`, and e2e specs import `AppModule` dynamically
inside `beforeAll` after setting `DATABASE_URL`.

## Database

- `src/database/data-source-options.ts` → `buildDataSourceOptions(url, overrides?)`, shared by
  app, tests and CLI. `synchronize: false`, `migrationsRun: false`. Entities (25) and migrations
  (38) are explicit arrays.
- `src/database/data-source.ts` default-exports the CLI `DataSource` (reads `DATABASE_URL`).
- Migrations: `src/database/migrations/<epochMillis>-<PascalName>.ts`, class
  `<PascalName><epochMillis> implements MigrationInterface`.
- Constants, not env: statement timeout 30 s, connect timeout 10 s, pool 10, slow-query log at
  2 s via `SlowQueryLogger` (suppresses TypeORM's parameter dump).
- Public entities carry `slug_tr` + `slug_en` (indexed) because the web routes on them. Only
  an entity with no page of its own (e.g. `earthquake_events`) may skip slugs.
- Seeds (`src/database/seeds/*.cli.ts`), order: geography → world → books → reference
  (`regions` separately). `--check` on books/reference validates without a DB.
- Offline importers `src/database/{acag,air-quality,earthquake,elevation,era5,marine}/*.cli.ts`
  behind `pnpm db:import:*`. Network fetch phases are run by hand and commit reviewable
  artifacts under `data/`; the `load` phase is deterministic and is the only phase CI runs.
- Production migrations: `deploy.yml` runs `node run-migrations.cjs` inside the api container
  after `up -d`.

## Cache and upstream (`src/upstream/`)

- Redis is behind a 6-method `RedisClientPort` (`redis/redis-client.port.ts`): `get`,
  `setWithTtl`, `setIfAbsent`, `deleteIfValueEquals`, increment-with-TTL. Plain `del` is
  intentionally not expressible. `ioredis.adapter.ts` implements it with Lua
  (compare-and-delete, increment-with-TTL) and a namespace prefix applied in the adapter.
- `REDIS_CLIENT` factory returns `null` without `REDIS_URL` → in-process LRU
  (`cache/upstream-cache.store.ts`). Dev/test work without Redis.
- `UpstreamCacheService`: per-outcome TTLs (`ok`, `no_data`, `transient`, `rate_limited`,
  `client_error`, `schema_error`), staleness ceilings, single-flight refresh.
- Budgeting: `OperationDeadline`, `ProviderBudget` (Redis counters), `CircuitBreaker`, byte
  ceilings per tour, three staleness axes (value age, validAt age, model-cycle age).
- Scheduled work: one `ScheduledWarmupService` **instance per leg** with its own `name`
  (derives lock key, timer names, logger context), kill switch, interval and deadline. No
  BullMQ, no worker process. The book purge tour runs unconditionally with no flag or lock.
- HTTP caching is separate: `@CacheControl(value)` + global interceptor sets the header on 2xx
  only. PII routes use `*-no-store.middleware.ts` registered in `configure(consumer)`.

## Auth and rate limiting

- `AccessTokenGuard` (`src/auth/access-token.guard.ts`), opt-in per route. Bearer JWT only.
  All reject branches throw the same 401 `errors.auth.unauthenticated`.
- Refresh tokens opaque and digest-stored (`token-digest.ts`, `opaque-token.ts`). Passwords
  Argon2id. Verification codes HMAC-peppered with domain tags (`verify:`, `rate:`).
- Throttling: global `TrustedClientThrottlerGuard` over `ThrottlerModule` (120 / 60 s, per
  client and per handler, in-memory). Exemption: `x-internal-request-token` matching
  `INTERNAL_REQUEST_TOKEN`, GET/HEAD only (the web's server-side calls). Per-route ceilings via
  `@Throttle` (`AUTH_ROUTE_THROTTLES` in `auth.controller.ts`). `@NoTrustedClientExemption()`
  and `@ThrottlerErrorMessage(key)` in `src/common/throttler/throttler-metadata.ts`.
- Visitor identity (`visitor-tracker.ts`): PEER axis (`req.ip`) and FORWARDED axis
  (`x-visitor-address`, trusted only with a valid `x-visitor-forward-token`).

## OpenAPI

`openapi/openapi.json` (committed, ~47 paths, ~90 schemas, bearer scheme `access-token`).
`pnpm openapi:generate` builds and runs `dist/openapi/generate-openapi.js`, which boots
`NestFactory.create(AppModule, { preview: true })` — full module graph, no providers, no DB.
Document built once in `src/openapi/build-document.ts`, shared with `main.ts`.
`ROUTELESS_CONTRACT_MODELS` is an empty escape hatch; keep it empty. Prettier ignores `openapi/`.

## Tooling outside `src/`

- `tools/seed-transcription/` — `pnpm seed:transcribe`, lossless rewrite of seed prose; own
  `tools/tsconfig.json` (ESM, type-stripped Node).
- `tools/dev-fixtures/` — hand-run local fixtures (credentials, password-reset token, audit
  accounts) guarded by `local-database-guard.ts`.
- `data/` — committed provenance artifacts and probes per source (acag-pm25, air-quality,
  books, earthquake, elevation, era5-land, marine, reference). Copied into the prod image.
- `docs/data-provenance-*.md` — snapshot ledgers for the province seed waves.

## Known gaps (recorded, not fixed)

- `package.json` says `UNLICENSED`, `LICENSE` and README say MIT.
- Deploy gate runs typecheck + lint + unit only; e2e and `openapi:check` run in `ci.yml` on
  the PR, not before deploy.
- Prod image ships dev dependencies (node_modules from the `deps` stage) and runs as root.
- Root `Caddyfile` proxies only `web:3000`; no TLS block yet.
- Seed waves 6a/6b/6d have no `docs/data-provenance-*` file.
