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

## `password-reset-fixture.ts`

Inserts ONE `password_reset_tokens` row for ONE dedicated, idempotently-reset fixture account
(`password-reset-audit@local.test` — deliberately not the `iris-audit-account.ts` account, to
keep the two fixtures' blast radii independent) directly in the local dev Postgres, and prints
the plaintext token once to this run's own stdout. It exists because no plaintext password-reset
token is obtainable anywhere else in this system by design: only the token's SHA-256 digest is
ever persisted, the mailer never logs it, and `mintOpaqueToken()` — unlike the email-verification
code next to it — carries no development shortcut
(`Owner's Inbox/uyelik-uyum-denetimi/p4-sifirlama-ekranlari/atlas-karar.md` §3, board item
`UYE-P4-FIKSTUR`).

```
PASSWORD_RESET_FIXTURE_CONFIRM='i-know-this-database-is-not-a-tunnel' \
DATABASE_URL=postgresql://cografya:cografya_dev@localhost:5433/cografya \
  node tools/dev-fixtures/password-reset-fixture.ts
```

Reuses this directory's `assertLocalDatabaseUrl`/`NonLocalDatabaseError` (the loopback guard,
unmodified), `pickDistrict` and the Argon2 password helpers unchanged; mirrors the token mint and
SHA-256 digest by hand rather than importing `src/auth/opaque-token.ts` / `token-digest.ts`, for
the same `src/`-independence reason `credential-fixture.ts` and `local-database-guard.ts` already
state. See the file's own header for exactly what is reused vs. mirrored, and for the loopback
guard's real, honest guarantee (it proves the socket is loopback, not the process behind it —
`API-FIXTURE-TUNNEL-GAP`, already boarded and deliberately not fixed by this file).

**A second, independent gate on top of the loopback guard, unlike `iris-audit-account.ts`.**
Unlike that precedent, this fixture mints a USABLE credential (a live reset token that changes a
password and revokes every session on consumption), so it additionally refuses — before any
connection opens — unless `PASSWORD_RESET_FIXTURE_CONFIRM` is set to the exact phrase above. This
check is deliberately blind to `DATABASE_URL`: the loopback guard already covers the socket
address, and that is exactly the axis an `ssh -L`/`kubectl port-forward` tunnel defeats
(`API-FIXTURE-TUNNEL-GAP`) — a tunnelled `DATABASE_URL` still resolves as loopback, so a second
condition that does not look at `DATABASE_URL` at all is what catches the case the first one
cannot. See the file's own header for why a bespoke confirmation phrase was chosen over an
`NODE_ENV` check.
