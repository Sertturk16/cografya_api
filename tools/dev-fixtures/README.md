# `tools/dev-fixtures/`

Hand-run-only dev fixture tools. Nothing here is wired into `package.json`, `db:seed:*`, or
CI — see each file's own header for what it does and does not touch. This directory follows
the `tools/seed-transcription` convention: run directly with Node's native TypeScript type
stripping (Node >= 24), no build step.

```
node tools/dev-fixtures/iris-audit-account.ts
```

## `iris-audit-account.ts`

Creates, or idempotently resets, ONE pre-verified, login-capable account
(`iris-audit@local.test`) directly in the local dev Postgres, bypassing registration/e-posta
verification entirely. It exists because this dev environment's mailer is a `NoopMailerAdapter`
with no working delivery, so İRİS (the design critic) cannot complete a real
register-then-verify flow herself to audit login-gated UI (e.g. UYELIK-06's video-wall). The
owner chose this "pre-verified seed account" approach over a dev-only mailer adapter or
skipping the audit.

```
DATABASE_URL=postgresql://cografya:cografya_dev@localhost:5433/cografya \
  node tools/dev-fixtures/iris-audit-account.ts
```

Refuses to run (no connection opened, no write) unless `DATABASE_URL`'s host — checked by its
DNS-resolved address, not merely the string — is loopback. Never invents or defaults a
password: pass one with `--password <value>` or `AUDIT_ACCOUNT_PASSWORD=…`, or let it generate
one at runtime; either way it is printed once to this run's own stdout and never written to any
file. Re-running it updates the same row (fresh password hash, `status`/`email_verified_at`
re-asserted, `token_version` bumped to invalidate any previously-issued access token) rather
than erroring or duplicating — the row's `id` is stable across resets, so any `video_progress`
rows already saved under it survive.

**Caveat:** `--password`/`AUDIT_ACCOUNT_PASSWORD` carry the password through this process's own
argv/environ for the run's duration, which another local user on the same machine could read
(`ps aux`, `/proc/<pid>/environ`) — unlike the default no-argument path, which only ever writes
the password to this run's own stdout. Accepted for a single-developer local machine and a
synthetic audit account; prefer the no-argument default when possible.

See the file's own header for the full reasoning, including why it duplicates rather than
imports the app's Argon2 profile and password policy (`credential-fixture.ts`'s header) and why
the local-only check is DNS-resolved rather than string-only (`local-database-guard.ts`'s
header).
