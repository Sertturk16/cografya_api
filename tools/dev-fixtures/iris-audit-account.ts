import { isDirectInvocation, main, NonLocalDatabaseError } from './iris-audit-account-runner.ts';

/**
 * `tools/dev-fixtures/iris-audit-account.ts` — creates or idempotently resets ONE pre-verified,
 * login-capable account directly in the LOCAL DEV Postgres, bypassing the register/e-posta
 * verification flow entirely. Infrastructure for İRİS's own login-gated design audits (e.g.
 * UYELIK-06's video-wall), reused across her sessions.
 *
 *   DATABASE_URL=postgresql://cografya:cografya_dev@localhost:5433/cografya \
 *     node tools/dev-fixtures/iris-audit-account.ts
 *
 *   # supply your own password instead of letting the tool generate one:
 *   AUDIT_ACCOUNT_PASSWORD='Choose1YourOwn' node tools/dev-fixtures/iris-audit-account.ts
 *   node tools/dev-fixtures/iris-audit-account.ts --password 'Choose1YourOwn'
 *
 * ## What this deliberately is NOT
 * Not wired into `db:seed:*`, `package.json`, or CI — nothing in the ordinary build or seed
 * path ever runs this. Not a migration and not a schema change: it writes to the EXISTING
 * `users` table exactly as `EmailVerificationService.verify` (`src/auth/email-verification.service.ts`)
 * does when a real code is confirmed — same columns, same `status = 'ACTIVE'` +
 * `email_verified_at` pairing, same Argon2id hash shape — so the row is indistinguishable, at
 * the login path, from a genuinely verified account. Run BY HAND only, exactly like the
 * `db:import:era5`/`oneoff-province-*` hand-run precedents this tool follows the shape of
 * (`ENGINEERING.md` §5/§8): a build must never depend on a step a human has to run once.
 *
 * ## The five hard requirements this file exists to satisfy (recorded, not just implemented)
 *  1. **Fail closed on anything but an obviously-local database** — `local-database-guard.ts`,
 *     checked BEFORE any connection is opened, and it checks the DNS-RESOLVED host, not merely
 *     the `DATABASE_URL` string.
 *  2. **No password ever appears in a file this tool writes or that gets committed** — taken
 *     from `--password`/`AUDIT_ACCOUNT_PASSWORD`, or generated at runtime; printed to THIS
 *     process's own stdout exactly once, never logged to a file, never included in any SQL
 *     this script would need to re-run (the hash is what is stored, never the plaintext).
 *     **Caveat, recorded rather than silent (SEC143-M3):** the `--password`/
 *     `AUDIT_ACCOUNT_PASSWORD` paths carry the password through this process's own argv or
 *     environ for the run's duration, which on Linux is readable by another LOCAL user on the
 *     same machine with sufficient permissions (`ps aux` for argv, `/proc/<pid>/environ` for the
 *     env var) — unlike the default no-argument path (stdout only, once). Accepted as-is: this
 *     is a single-developer local machine, the target is a synthetic audit fixture rather than a
 *     real user's credential, and the exposure is opt-in (the default path avoids it entirely).
 *     Prefer the no-argument default when that is enough.
 *  3. **No real personal data** — `iris-audit@local.test` (RFC 2606 reserved `.test` TLD: this
 *     address can never resolve or collide with a real mailbox), a synthetic name, a
 *     structurally-valid-but-obviously-placeholder phone number, and the STUDENT role — the
 *     least-privileged role: `AccessTokenGuard` (`src/auth/access-token.guard.ts`) checks only
 *     token validity and `status === 'ACTIVE'`, never `accountRole`, and neither does
 *     `VideoProgressController` (`src/video-progress/video-progress.controller.ts`) — grepped,
 *     not assumed: this repo has no `@Roles`/`RolesGuard` anywhere (`grep -rn "accountRole\s*===\|@Roles|RolesGuard" src`
 *     matches only the registration DTO's profile-shape validator, which is a form-shape rule,
 *     not an authorization check). STUDENT is therefore sufficient for every login-gated surface
 *     today, UYELIK-06 included.
 *  4. **Idempotent** — keyed on `UQ_users_email`; a second run `ON CONFLICT` UPDATEs the same
 *     row (fresh password hash, `status`/`email_verified_at` re-asserted, `token_version`
 *     bumped to invalidate any previously-issued access token — mirroring the one other place
 *     this repo bumps it outside reuse detection, password reset, `session.service.ts`) rather
 *     than erroring or duplicating. The row's `id` is stable across resets, so any
 *     `video_progress` rows already saved under it survive.
 *  5. **Lives under `tools/dev-fixtures/`** — not `src/database/seeds/` (the reviewed, shipped
 *     content corpus), not a `package.json` script, so nothing in the ordinary seed/build/CI
 *     path can ever reach it.
 *
 * The actual logic (`pickDistrict`, `upsertFixtureUser`, `resolvePassword`, `main`) lives in
 * `iris-audit-account-runner.ts` next door — this file is deliberately thin, mirroring the
 * `tools/seed-transcription/oneoff-*` entry-point/runner split (`ENGINEERING.md` §8): a
 * CommonJS (ts-jest) spec can import the `import.meta`-free runner directly, while THIS file
 * owns `import.meta.filename` and the argv-gated direct-invocation check, so importing it never
 * runs the CLI.
 */

if (isDirectInvocation(import.meta.filename, process.argv[1])) {
  main().catch((error: unknown) => {
    if (error instanceof NonLocalDatabaseError) {
      process.stderr.write(`[iris-audit-account] REFUSED: ${error.message}\n`);
    } else {
      process.stderr.write(
        `[iris-audit-account] failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
    }
    process.exitCode = 1;
  });
}
