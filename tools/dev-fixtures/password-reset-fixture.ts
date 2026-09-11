import { createHash, randomBytes } from 'node:crypto';
import { Client } from 'pg';
import {
  generateCompliantPassword,
  hashPassword,
  isPasswordPolicyCompliant,
} from './credential-fixture.ts';
import { assertLocalDatabaseUrl, NonLocalDatabaseError } from './local-database-guard.ts';
import { pickDistrict } from './iris-audit-account-runner.ts';

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
 * suite — so there is nothing that would ever import this file, and a single file keeps the
 * change smaller. `main()` therefore just runs at module load; there is no `isDirectInvocation`
 * gate here to bypass.
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
 * validator) — it is the ONLY production-safety guard this fixture has, no second gate, exactly
 * as the validator measured for `iris-audit-account-runner.ts`. This file does not fix that gap
 * (board Scope-deferred) and does not pretend the gap is closed: do not run this script with such
 * a tunnel open.
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

  // The loopback guard — see this file's header for its real, honest guarantee and its recorded,
  // deferred gap. No connection is opened, no write happens, before this resolves.
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
      await client.query('ROLLBACK');
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

main().catch((error: unknown) => {
  if (error instanceof NonLocalDatabaseError) {
    process.stderr.write(`[password-reset-fixture] REFUSED: ${error.message}\n`);
  } else {
    process.stderr.write(
      `[password-reset-fixture] failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
  }
  process.exitCode = 1;
});
