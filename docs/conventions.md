# cografya_api — conventions

Read before writing a DTO, a test, a migration or a commit.

## Code style

- Prettier: single quotes, trailing commas, width 100, 2 spaces, semicolons, LF.
- ESLint flat config: `recommendedTypeChecked` + prettier. Hard errors:
  `no-explicit-any`, `no-floating-promises`, `no-unsafe-argument`. In `*.spec.ts` /
  `*.e2e-spec.ts` the `no-unsafe-*` family is off but `no-explicit-any` stays on.
- `tsconfig`: `nodenext`, ES2023, decorators + metadata, `strict`, `noUncheckedIndexedAccess`.
  No path aliases; all imports are relative.
- Comments carry rationale and measurements, not restatements of the code. Keep that
  culture but do not cite documents that no longer exist (see `../CLAUDE.md`).
- Constants that are policy (timeouts, pool size, throttle limits) are exported named
  constants, not env vars, unless an operator genuinely needs to tune them per deploy.

## Adding an endpoint (build order)

entity (+ `slug_tr`/`slug_en` if it has a page) → migration (hand-reviewed, registered in
`data-source-options.ts`) → DTOs (`class-validator` + `@nestjs/swagger`) → service
(validation, transactions, caching) → controller (guards, `@CacheControl` or no-store
middleware, `@Throttle` if needed) → error keys in `*-error-keys.ts` → seeds if base data →
unit specs beside the source → e2e in `test/` if it touches Postgres → `pnpm openapi:generate`.

## DTO rules

- Tiers: `List` (lean) and `Detail` (full) per public entity. Add a `Response` tier only when
  a write echo needs a distinct shape.
- Small bounded lists (81 provinces) return a plain typed array. Any unbounded list uses the
  pagination envelope: exactly `items`, `page`, `pageSize`, `total`, `hasMore` at top level
  (base `src/common/dto/pagination-envelope.dto.ts`, `items` declared per DTO for the concrete
  type). Endpoint-specific fields go inside one `meta` object; no `meta` if none. Nesting is
  required because `@nestjs/swagger` flattens subclass schemas.
- Query DTOs: `page`/`pageSize` bounds and defaults live in the class-validator decorators AND
  `@ApiPropertyOptional`, default in the property initialiser (never `?? 50` in the service).
  Each number is one exported constant reused by the e2e. No shared base query DTO: validator
  decorators accumulate through inheritance, so a subclass can only tighten a base `@Max`.
- Error bodies are NestJS defaults with i18n keys as `message`; `ApiErrorDto` only describes
  that shape.

## Env vars

Declare in `src/config/env.schema.ts`, document in `.env.example` (commented-out unless
required), default only when a safe default exists. Cross-field constraints go through
`checkEnvBound` in `env-bounds.ts`. Add prod-only requirements to the `superRefine` block.

## Tests

- Unit lane `pnpm test:unit`: `test/jest-unit.json`, regex `(tools|src)/.*\.spec\.ts$`,
  `TZ=Europe/Istanbul`. Spec sits next to its source. Anything that needs no database
  belongs here. Fixture builders that exist only for specs are excluded from
  `tsconfig.build.json`.
- e2e lane `pnpm test:e2e`: `test/*.e2e-spec.ts`, `test/jest-e2e.json`, 120 s timeout.
  Each spec starts a Testcontainers Postgres, builds a `DataSource` via
  `buildDataSourceOptions`, runs migrations, then `await import('../src/app.module')` inside
  `beforeAll`. Apps are built with `Test.createTestingModule` and call `applyGlobalPrefix`,
  `buildCorsOptions`, `applyProxyTrust` by hand (`main.ts` never runs in tests).
- Helpers: `test/support/fake-redis-client.ts`, `test/support/recording-mailer.ts`. Binary
  fixtures under `test/fixtures/{cams,cmems,ecmwf,era5}` with golden `reference.json`.
- Guarded routes: assert both the unauthenticated path and the role-forbidden path.
- ts-jest is transpile-only (`isolatedModules`); types of tests are checked by `pnpm typecheck`.

## Migrations

`pnpm migration:generate src/database/migrations/<PascalName>` → open the file, read every
statement → add the class to `migrations` in `data-source-options.ts` → commit both. Never
edit an applied migration; write a new one. `migration:revert` is for local only.

## Git

- Conventional Commits, scope = module (`feat(auth):`, `fix(video-cover):`, `chore(deploy):`).
  Breaking contract changes use `!` (`feat(book)!:`).
- Pre-commit: lint-staged runs `eslint --fix` on staged `*.ts` and a whole-project
  `tsc --noEmit`. Commit-msg: commitlint.
- `feature/*` → `dev` squash PR. CI on PR: typecheck-and-lint, build, openapi-check,
  test-unit, test (e2e). Merge only on a green run you have seen.
- Native builds are denied by `pnpm-workspace.yaml` `allowBuilds`; only `argon2` is allowed.
  A new dep that needs a postinstall build must be added there deliberately.
