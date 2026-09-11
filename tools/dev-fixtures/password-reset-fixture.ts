import { createHash, randomBytes } from 'node:crypto';
import { Client } from 'pg';
import {
  generateCompliantPassword,
  hashPassword,
  isPasswordPolicyCompliant,
} from './credential-fixture.ts';
import { assertLocalDatabaseUrl, NonLocalDatabaseError } from './local-database-guard.ts';
import { isDirectInvocation, pickDistrict } from './iris-audit-account-runner.ts';

/**
 * `tools/dev-fixtures/password-reset-fixture.ts` — inserts ONE `password_reset_tokens` row for
 * ONE pre-verified, idempotently-reset fixture account directly in the LOCAL DEV Postgres, and
 * prints the plaintext token to THIS run's own stdout, once.
 *
 *   DATABASE_URL=postgresql://cografya:cografya_dev@localhost:5433/cografya \
 *     node tools/dev-fixtures/password-reset-fixture.ts
 *
 * ## Why this exists (`Owner's Inbox/uyelik-uyum-denetimi/p4-sifirlama-ekranlari/atlas-karar.md`
 * §3, board item `UYE-P4-FIKSTUR`)
 * No usable plaintext password-reset token is obtainable anywhere in this system, by design:
 * `requestReset` (`src/auth/password-reset.service.ts`) always answers `202` body-less, the
 * mailer is a `NoopMailerAdapter` that never logs a `MailMessage` variable (so the token never
 * reaches a log either), and `mintOpaqueToken()` (`src/auth/opaque-token.ts`) — unlike its sibling
 * `mintVerificationCode()` — carries NO `NODE_ENV === 'development'` shortcut; it is
 * unconditionally `randomBytes(32)` in every environment. Only the token's SHA-256 digest is ever
 * persisted (`password_reset_tokens.token_hash`), a one-way door. Consequently the reset flow's
 * WORKING branch — a live token opening the new-password form, `POST /api/auth/
 * password-reset/verify` answering `204` — can be neither driven end-to-end nor shown to the
 * owner without a fixture that puts a known plaintext behind a real, correctly-hashed row. This
 * script is that fixture, and nothing more.
 *
 * ## What this deliberately is NOT
 * Not wired into `db:seed:*`, `package.json`, or CI — nothing in the ordinary build, seed or test
 * path ever runs this (board Scope-out: "any product behaviour; the mailer; anything wired into
 * CI or a test suite"). Not a migration, not a schema change, and it changes NOTHING about how a
 * token is minted, stored or consumed in production code — it reproduces `requestReset`'s own two
 * writes (an upserted fixture user, a `password_reset_tokens` row) using the identical column
 * shapes and hash algorithm, from OUTSIDE the running application, run BY HAND only, exactly like
 * the `iris-audit-account.ts` precedent this file follows the posture of.
 *
 * ## Reused vs. mirrored — stated explicitly, not left for the reader to infer
 * **Reused, unmodified, via direct import** (all three are pure, `src/`-independent modules
 * already living in this directory, already covered by their own specs — nothing here adds new
 * coverage obligations): `assertLocalDatabaseUrl`/`NonLocalDatabaseError`
 * (`local-database-guard.ts` — the loopback guard itself, not a copy of it), `pickDistrict`
 * (`iris-audit-account-runner.ts` — the Çankaya-or-first-district lookup, unchanged), and
 * `generateCompliantPassword`/`hashPassword`/`isPasswordPolicyCompliant` (`credential-fixture.ts`
 * — this fixture's account needs SOME policy-compliant Argon2id hash to satisfy
 * `CHK_users_password_hash`, exactly as `iris-audit-account.ts`'s does).
 *
 * **Mirrored by hand, not imported, for the token mint + digest** (`mintResetToken`/
 * `hashResetToken` below) — consistent with this directory's established posture
 * (`local-database-guard.ts`'s and `credential-fixture.ts`'s own headers: this tool runs under
 * Node's native TypeScript type-stripping with no build step, and a relative import inside
 * `src/` that omits its own extension breaks resolution here). **Empirically reconfirmed this
 * session, not merely assumed:** `src/auth/opaque-token.ts` (which holds `mintOpaqueToken`) is
 * NOT importable from this tool — it fails with `ERR_MODULE_NOT_FOUND` on `../config/env.schema`
 * even though the only reference to that module is a type-only `import { type Env }`, because
 * Node's type-stripping erases the type but not the bare import statement, and that sibling
 * import has no explicit extension. `src/auth/token-digest.ts` (which holds `sha256`), by
 * contrast, has zero relative imports and WAS confirmed importable standalone — but it is
 * mirrored anyway rather than imported, to keep this directory's "nothing here depends on `src/`
 * staying import-shaped" boundary uniform rather than file-by-file. `sha256`'s own shape
 * (`createHash('sha256').update(input).digest()`, a raw `Buffer`) has no tunable parameters to
 * drift the way Argon2's cost profile does, so hand-mirroring it costs nothing `hashPassword`'s
 * own mirror-by-hand precedent did not already pay. `PASSWORD_RESET_TTL_MINUTES` (30, from
 * `src/auth/auth.constants.ts`) is mirrored the same way, for the same reason.
 *
 * **Deliberately NOT split into an entry-point/runner pair**, unlike `iris-audit-account.ts` /
 * `iris-audit-account-runner.ts`. That split exists solely so a ts-jest spec can import the
 * runner half without tripping the CLI's direct-invocation guard. This fixture carries no
 * companion spec by design — the board item's Scope-out forbids adding this fixture to the test
 * suite — so the split buys nothing here, and a single file keeps the change smaller. **It is,
 * however, guarded by the SAME idiom every sibling tool of its class uses** (PR #172 review,
 * FIX172-M1 — this file used to run `main()` unconditionally at module load, which meant an
 * accidental future `import` of it, not just a direct run, would have minted a real credential):
 * `main()` below runs only inside an `isDirectInvocation(import.meta.filename, process.argv[1])`
 * check, reusing the helper already imported from `iris-audit-account-runner.ts` for
 * `pickDistrict` — no new module, no duplicated logic. Importing this file now performs no work
 * and opens no connection, exactly like every sibling tool, even without the runner split.
 *
 * ## Its own account is a NEW, separate fixture identity — not `iris-audit@local.test`
 * `password-reset-audit@local.test` (RFC 2606 reserved `.test` TLD, same convention
 * `iris-audit-account.ts` uses), STUDENT role, least-privileged. Deliberately NOT the
 * `iris-audit@local.test` row: `confirmReset`'s transaction bumps `token_version` and revokes
 * every live session (`password-reset.service.ts` §5.4.3) the moment the printed token is
 * actually consumed, which would silently invalidate any access token İRİS's own fixture holds
 * mid-audit. Two independent fixtures, two independent blast radii.
 *
 * ## The loopback guard's real, honest guarantee — and its recorded, deferred gap
 * `assertLocalDatabaseUrl` proves the target SOCKET is loopback (hostname literal AND its
 * DNS-resolved address, both checked). It does NOT prove which PROCESS is listening there — an
 * `ssh -L` or `kubectl port-forward` tunnel binds a remote database to a loopback-looking socket
 * and passes this guard unchanged. This is a measured, already-boarded finding
 * (`API-FIXTURE-TUNNEL-GAP`, `TASKS.md`, found against this exact module by PR #131's remedy
 * validator) — it is the ONLY production-safety guard `iris-audit-account-runner.ts` has, no
 * second gate. This file does NOT fix that shared gap (board Scope-deferred, and it stays a
 * `local-database-guard.ts`-owned weakness, not this file's to close) — but it does not build on
 * top of it unguarded either, per the ruling that commissioned this fixture (`atlas-karar.md`
 * §3) and Atlas's own follow-up on this exact PR: unlike `iris-audit-account.ts`, this tool
 * mints a USABLE credential (a live reset token that changes a password and revokes every
 * session the moment it is consumed), so a tunnelled run does not merely read production — it
 * writes a real account and a real live reset token there.
 *
 * ## The second, independent gate — `assertOperatorConfirmedLocal` below
 * A second condition must ALSO hold before any connection opens, chosen specifically to be
 * blind to `DATABASE_URL` and everything network-shaped about it — the exact axis the loopback
 * guard already covers and the exact axis a tunnel defeats. It is a single-purpose environment
 * variable, `PASSWORD_RESET_FIXTURE_CONFIRM`, that must equal an exact, deliberate phrase (not
 * merely be truthy) and exists nowhere else in this codebase for any other purpose. Two
 * candidate designs were weighed and one was rejected, recorded rather than silently dropped:
 * an `NODE_ENV !== 'production'` check (this repo's own established idiom, `docs-gate.ts`'s
 * `resolveDocsExposure`) was considered and NOT used here, because it provides close to no
 * independent protection for THIS threat — a developer's shell very commonly already carries
 * `NODE_ENV=development` ambiently, set once for unrelated work, so it would already be
 * satisfied in the exact tunnelled-session scenario this gate exists to catch (the operator
 * debugging a production issue through a tunnel, in the same shell they do ordinary local dev
 * work in). A bespoke, single-purpose confirmation variable has no such ambient-collision risk:
 * nothing sets it except a person reading this file (or the printed refusal below) and
 * deliberately choosing to. It is checked BEFORE the loopback guard, so the operator sees the
 * more fundamental "did you mean to run this at all" refusal first.
 */

const FIXTURE_EMAIL = 'password-reset-audit@local.test';
const FIXTURE_FIRST_NAME = 'Password-Reset';
const FIXTURE_LAST_NAME = 'Audit-Fixture';
/** Matches `CHK_users_phone` (`^\+905[0-9]{9}$`) — the same obviously-placeholder shape
 * `iris-audit-account-runner.ts` uses; not unique-constrained, so reuse is harmless. */
const FIXTURE_PHONE = '+905000000000';
const FIXTURE_ACCOUNT_ROLE = 'STUDENT';
const FIXTURE_EDUCATION_LEVEL = 'SECONDARY';
const FIXTURE_GRADE_LEVEL = 'GRADE_12';
const FIXTURE_STUDY_STREAM = 'DIGER';

/** Mirrors `PASSWORD_RESET_TTL_MINUTES` in `src/auth/auth.constants.ts` — see this file's header. */
const PASSWORD_RESET_TTL_MINUTES = 30;

/** The second, independent gate's env var + required exact value — see this file's header for
 * why it is a bespoke phrase rather than any truthy value, and why it is checked before, not
 * instead of, the loopback guard. */
const CONFIRM_ENV_VAR = 'PASSWORD_RESET_FIXTURE_CONFIRM';
const CONFIRM_VALUE = 'i-know-this-database-is-not-a-tunnel';

export class NotConfirmedLocalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotConfirmedLocalError';
  }
}

/**
 * Refuses unless `PASSWORD_RESET_FIXTURE_CONFIRM` is set to the exact required phrase — a check
 * that reads nothing from `DATABASE_URL` and performs no I/O, so it cannot be coincidentally
 * satisfied by anything about the target socket. This is deliberately NOT a replacement for
 * `assertLocalDatabaseUrl` and does not claim to detect a tunnel itself; it exists so a tunnelled
 * run still needs a second, separate, conscious act from the operator, on top of whatever
 * `DATABASE_URL` happens to be set to in their shell.
 */
function assertOperatorConfirmedLocal(): void {
  const presented = process.env[CONFIRM_ENV_VAR];
  if (presented === CONFIRM_VALUE) return;
  throw new NotConfirmedLocalError(
    `${CONFIRM_ENV_VAR} is not set to the required value. This fixture mints a USABLE ` +
      `password-reset credential (a live token that changes a password and revokes every ` +
      `session on consumption) — the loopback guard alone cannot tell a real local database ` +
      `from one reached through an ssh -L / kubectl port-forward tunnel ` +
      `(API-FIXTURE-TUNNEL-GAP), so this refuses until you deliberately confirm, independently ` +
      `of DATABASE_URL, that this run really targets your own local database:\n` +
      `  ${CONFIRM_ENV_VAR}='${CONFIRM_VALUE}' DATABASE_URL=... ` +
      `node tools/dev-fixtures/password-reset-fixture.ts`,
  );
}

/** Mirrors `mintOpaqueToken` in `src/auth/opaque-token.ts` — see this file's header. */
function mintResetToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Mirrors `sha256` in `src/auth/token-digest.ts` — see this file's header. Asserts the 32-byte
 * shape `CHK_password_reset_tokens_hash_length` requires, as a fail-closed sanity check rather
 * than trusting Node's crypto module silently. */
function hashResetToken(plaintext: string): Buffer {
  const digest = createHash('sha256').update(plaintext).digest();
  if (digest.length !== 32) {
    throw new Error(`sha256 digest was ${digest.length} bytes, expected 32 — refusing to insert.`);
  }
  return digest;
}

interface UpsertUserResult {
  readonly id: string;
  readonly inserted: boolean;
}

async function upsertFixtureUser(
  client: Client,
  args: { passwordHash: string; districtId: string },
): Promise<UpsertUserResult> {
  const result = await client.query<{ id: string; inserted: boolean }>(
    `INSERT INTO users (
       first_name, last_name, phone, email, password_hash, account_role,
       education_level, grade_level, study_stream, university_name, department_name,
       district_id, status, email_verified_at, token_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, NULL, $10, 'ACTIVE', now(), 0
     )
     ON CONFLICT (email) DO UPDATE SET
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       phone = EXCLUDED.phone,
       password_hash = EXCLUDED.password_hash,
       account_role = EXCLUDED.account_role,
       education_level = EXCLUDED.education_level,
       grade_level = EXCLUDED.grade_level,
       study_stream = EXCLUDED.study_stream,
       university_name = EXCLUDED.university_name,
       department_name = EXCLUDED.department_name,
       district_id = EXCLUDED.district_id,
       status = 'ACTIVE',
       email_verified_at = now(),
       updated_at = now()
     RETURNING id, (xmax = 0) AS inserted`,
    [
      FIXTURE_FIRST_NAME,
      FIXTURE_LAST_NAME,
      FIXTURE_PHONE,
      FIXTURE_EMAIL,
      args.passwordHash,
      FIXTURE_ACCOUNT_ROLE,
      FIXTURE_EDUCATION_LEVEL,
      FIXTURE_GRADE_LEVEL,
      FIXTURE_STUDY_STREAM,
      args.districtId,
    ],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('user upsert returned no row — unexpected, refusing to report success.');
  }
  return { id: row.id, inserted: row.inserted };
}

interface InsertTokenResult {
  readonly id: string;
  readonly expiresAt: Date;
}

async function insertResetToken(
  client: Client,
  args: { userId: string; tokenHash: Buffer },
): Promise<InsertTokenResult> {
  const result = await client.query<{ id: string; expires_at: Date }>(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, consumed_at)
     VALUES ($1, $2, now() + ($3 || ' minutes')::interval, NULL)
     RETURNING id, expires_at`,
    [args.userId, args.tokenHash, PASSWORD_RESET_TTL_MINUTES],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('token insert returned no row — unexpected, refusing to report success.');
  }
  return { id: row.id, expiresAt: row.expires_at };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required (read script-locally; no default — fail-fast).');
  }

  // Gate 1/2 — the second, independent gate (see this file's header). Blind to DATABASE_URL by
  // construction; checked first because it is the cheaper, more fundamental "did you mean this"
  // refusal.
  assertOperatorConfirmedLocal();

  // Gate 2/2 — the loopback guard — see this file's header for its real, honest guarantee and
  // its recorded, deferred gap. No connection is opened, no write happens, before this resolves.
  const target = await assertLocalDatabaseUrl(databaseUrl);
  process.stdout.write(
    `[password-reset-fixture] DATABASE_URL resolved host is loopback: ${target.host}:${target.port} — proceeding.\n`,
  );

  const password = generateCompliantPassword();
  if (!isPasswordPolicyCompliant(password)) {
    // Unreachable by construction (generateCompliantPassword always satisfies its own policy
    // check), kept as a fail-closed assertion mirroring iris-audit-account-runner.ts's posture.
    throw new Error(
      'generated password failed the policy check it was built to satisfy — refusing.',
    );
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('SET statement_timeout = 30000');

    const district = await pickDistrict(client);
    const passwordHash = await hashPassword(password);

    await client.query('BEGIN');
    let user: UpsertUserResult;
    let token: InsertTokenResult;
    const plaintext = mintResetToken();
    try {
      user = await upsertFixtureUser(client, { passwordHash, districtId: district.id });
      const tokenHash = hashResetToken(plaintext);
      token = await insertResetToken(client, { userId: user.id, tokenHash });
      await client.query('COMMIT');
    } catch (error) {
      // ROLLBACK can itself throw (e.g. the connection already dropped) — that failure must
      // never replace `error` as what reaches the operator (PR #172 review, FIX172-M2). It is
      // reported separately, on its own stderr line; the ORIGINAL cause is always what is
      // thrown and printed by main().catch() below.
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        process.stderr.write(
          `[password-reset-fixture] ROLLBACK itself failed — the error below is still the real ` +
            `cause, not this one: ${rollbackError instanceof Error ? (rollbackError.stack ?? rollbackError.message) : String(rollbackError)}\n`,
        );
      }
      throw error;
    }

    process.stdout.write(
      `[password-reset-fixture] ${user.inserted ? 'created' : 'reset'} user id=${user.id} ` +
        `email=${FIXTURE_EMAIL} district=${district.districtNameTr}/${district.provinceNameTr}\n`,
    );
    process.stdout.write(
      `[password-reset-fixture] inserted password_reset_tokens row id=${token.id}, ` +
        `expires_at=${token.expiresAt.toISOString()} (${PASSWORD_RESET_TTL_MINUTES} minutes from now).\n`,
    );
    process.stdout.write(
      '[password-reset-fixture] Verify it yourself, e.g.:\n' +
        `  curl -i -X POST http://localhost:<PORT>/api/auth/password-reset/verify ` +
        `-H 'Content-Type: application/json' -d '{"resetToken":"<token below>"}'\n`,
    );
    process.stdout.write('\n=== PASSWORD-RESET FIXTURE — read once, not stored anywhere ===\n');
    process.stdout.write(`email:       ${FIXTURE_EMAIL}\n`);
    process.stdout.write(`password:    ${password}\n`);
    process.stdout.write(`reset token: ${plaintext}\n`);
    process.stdout.write('=================================================================\n');
  } finally {
    await client.end();
  }
}

// Guards every sibling tool of this class carries (PR #172 review, FIX172-M1): importing this
// module must never run it, only a direct `node tools/dev-fixtures/password-reset-fixture.ts`
// may. `isDirectInvocation` is reused, unmodified, from `iris-audit-account-runner.ts`.
if (isDirectInvocation(import.meta.filename, process.argv[1])) {
  main().catch((error: unknown) => {
    if (error instanceof NonLocalDatabaseError || error instanceof NotConfirmedLocalError) {
      process.stderr.write(`[password-reset-fixture] REFUSED: ${error.message}\n`);
    } else {
      process.stderr.write(
        `[password-reset-fixture] failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
    }
    process.exitCode = 1;
  });
}
