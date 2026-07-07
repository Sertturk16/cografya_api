# cografya_api

Backend API for the **Coğrafya platform** — an SEO-first, free, TR+EN geography
education site. Built with **NestJS + TypeScript** (full `strict` mode), **TypeORM +
PostgreSQL** (from PR-1a), and **Redis** for caching.

This repo is the **single source of truth for the OpenAPI contract**: DTOs are
documented with `@nestjs/swagger`, and the web repo codegens its types from the
generated spec (OpenAPI codegen). `cografya_api` is written by a single author (Deniz);
the web frontend lives in the separate `cografya_web` repo.

> `cografya_api` is a working title — it will be renamed once the brand/domain is final.

## Requirements

- **Node 24** (see `.nvmrc` — `nvm use`)
- **pnpm** (pinned via `packageManager`; `corepack enable` will provision it)
- **Docker** (for the local Postgres + Redis, from PR-1a onward)

## Getting started

```bash
# 1. Install dependencies (also installs the git hooks via husky)
pnpm install

# 2. Create your local env file (see the template for what each var is for)
cp .env.example .env

# 3. Start local infrastructure (Postgres 16 + Redis 7)
#    Not wired into the app yet — the DB connection lands in PR-1a.
docker compose up -d

# 4. Run the API in watch mode
pnpm start:dev
```

The API listens on `PORT` (default `3000`). Verify it is up:

```bash
curl http://localhost:3000/health
# -> {"status":"ok"}
```

Interactive OpenAPI docs are served at <http://localhost:3000/docs>.

## Configuration

Environment variables are validated at boot by a zod schema
(`src/config/env.schema.ts`, wired into `ConfigModule.forRoot({ validate })`). An
**invalid** value — or a **missing** value for any variable that has no default — **aborts
startup**, so the app never runs with an invalid config. `DATABASE_URL` has **no default**,
so leaving it unset kills boot (fail-fast); `NODE_ENV`, `PORT` and `WEB_ORIGIN` carry safe
defaults. Add every new variable the app reads to that schema, and give it a default only
when a safe one exists.

## Database & migrations

Postgres is accessed through TypeORM. The connection is built once in
`src/database/data-source-options.ts` (`synchronize` is always off — schema changes ship
as reviewed migrations) and reused by the app, the tests, and the migration CLI.

```bash
docker compose up -d          # start local Postgres (+ Redis)
pnpm migration:run            # apply migrations (builds, then runs against DATABASE_URL)
```

Migrations live in `src/database/migrations/` and are listed explicitly in
`data-source-options.ts` (no globs — every migration is added on purpose and hand-reviewed).
The CLI runs against the compiled build (`dist/database/data-source.js`) on plain Node.

| Script                 | Purpose                                          |
| ---------------------- | ------------------------------------------------ |
| `pnpm migration:run`   | Apply pending migrations                         |
| `pnpm migration:revert`| Revert the last migration                        |
| `pnpm migration:show`  | Show applied/pending migrations                  |
| `pnpm migration:generate <path>` | Generate a migration from entity diffs |
| `pnpm migration:create <path>`   | Scaffold an empty migration            |

> After generating a migration, **add it to the `migrations` array** in
> `data-source-options.ts` and hand-review the SQL before committing.

## OpenAPI contract

The api owns the shared DTO/type contract. `openapi/openapi.json` is a **committed
artifact** the web repo codegens its types from. Regenerate it after any DTO/route change:

```bash
pnpm openapi:generate   # boots the app in preview mode (no DB) and writes the spec
```

CI runs `pnpm openapi:check` (regenerate + `git diff --exit-code`) — a stale committed spec
fails the build. Prettier ignores `openapi/`; the generator is its sole authority.

## Scripts

| Script                 | Purpose                                        |
| ---------------------- | ---------------------------------------------- |
| `pnpm start:dev`       | Run in watch mode                              |
| `pnpm build`           | Compile to `dist/`                             |
| `pnpm start:prod`      | Run the compiled build                         |
| `pnpm typecheck`       | `tsc --noEmit` (type gate)                     |
| `pnpm lint`            | ESLint (flat config; includes Prettier)        |
| `pnpm format`          | Prettier write                                 |
| `pnpm test:e2e`        | Jest + Testcontainers e2e (needs Docker; CI)   |
| `pnpm migration:run`   | Apply DB migrations (see Database & migrations) |
| `pnpm openapi:generate`| Regenerate the committed OpenAPI spec          |

## Quality gates

- **CI is the only test gate.** Locally, run `pnpm typecheck` + `pnpm lint` on your
  changes; the authoritative check is CI on the PR (typecheck+lint, build, e2e tests on a
  real Postgres via Testcontainers, and the OpenAPI drift check).
- Commits follow **Conventional Commits** (enforced by commitlint via a git hook).
- `pre-commit` runs `lint-staged` (ESLint `--fix` + a project-wide typecheck) on staged
  TypeScript.

## Branching

`feature/* → dev` (squash-merge PR). `main` is a placeholder until the prod-promotion
model is decided alongside the hosting target.
