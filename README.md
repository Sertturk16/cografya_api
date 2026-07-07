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
(`src/config/env.schema.ts`, wired into `ConfigModule.forRoot({ validate })`). A missing
or mistyped variable **aborts startup** — the app never runs with an invalid config. Add
every new variable the app reads to that schema.

## Scripts

| Script            | Purpose                                 |
| ----------------- | --------------------------------------- |
| `pnpm start:dev`  | Run in watch mode                       |
| `pnpm build`      | Compile to `dist/`                      |
| `pnpm start:prod` | Run the compiled build                  |
| `pnpm typecheck`  | `tsc --noEmit` (type gate)              |
| `pnpm lint`       | ESLint (flat config; includes Prettier) |
| `pnpm format`     | Prettier write                          |

## Quality gates

- **CI is the only test gate.** Locally, run `pnpm typecheck` + `pnpm lint` on your
  changes; the authoritative check is CI on the PR.
- Commits follow **Conventional Commits** (enforced by commitlint via a git hook).
- `pre-commit` runs `lint-staged` (ESLint `--fix` + a project-wide typecheck) on staged
  TypeScript.

## Branching

`feature/* → dev` (squash-merge PR). `main` is a placeholder until the prod-promotion
model is decided alongside the hosting target.
