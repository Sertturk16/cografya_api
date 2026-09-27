---
name: changing-the-schema
description: Use when a cografya_api change touches the database schema or its data - adding, removing or altering an entity, column, index, constraint or relation in a *.entity.ts file, creating or editing a file under src/database/migrations, or writing a data migration.
---

# Changing the schema

`CLAUDE.md` (Hard rules) and `docs/conventions.md` (Migrations) are the authority; where this
file disagrees, they win. `synchronize` is off, so nothing reaches Postgres without a migration.

## Steps

1. **Entity.** Edit the `*.entity.ts`. A new entity class also goes into `entities` in
   `src/database/data-source-options.ts`.
2. **Database at `dev` head.** `migration:generate` diffs the entities against a real database;
   against an empty or stale one it emits every table again. Export `DATABASE_URL` (the
   `migration:*` scripts read the shell, not `.env`) and run `pnpm migration:run` first.
3. **Generate.** `pnpm migration:generate src/database/migrations/<PascalName>`. Data-only
   change: `pnpm migration:create src/database/migrations/<PascalName>` and write it by hand.
4. **Read every statement**, `up()` and `down()`. Delete anything unrelated to this change
   (drift from another branch), check `down()` undoes `up()` in reverse order, and check that
   a `NOT NULL` on an existing table has a default or a backfill. Never edit a migration that
   is already on `dev`; write a new one.
5. **Register** the class at the end of `migrations` in `data-source-options.ts` and append its
   name to BOTH ordered lists (`test/province.e2e-spec.ts`, `test/country.e2e-spec.ts`).
   `pnpm test:unit src/database/migration-registry.spec.ts` fails until the file, the array
   and both lists agree.
6. **Whole e2e lane.** `pnpm test:e2e`, not only the module you touched: a new migration breaks
   suites that never mention it. A local `.env` with `*_ENABLED=true` fails six upstream suites
   (see `CLAUDE.md` Commands); CI has none.
7. **Contract.** If a DTO changed too: `pnpm openapi:generate`, then `pnpm contract:sync` from
   `cografya_web` (root `CLAUDE.md`).

## Report

Name the migration, say you read its SQL (and what you removed, if anything), and quote the
unit and e2e counts. If the e2e lane could not run, say so; do not call the change done.
