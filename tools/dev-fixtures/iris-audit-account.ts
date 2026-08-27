import { Client } from 'pg';
import {
  generateCompliantPassword,
  hashPassword,
  isPasswordPolicyCompliant,
} from './credential-fixture.ts';
import { assertLocalDatabaseUrl, NonLocalDatabaseError } from './local-database-guard.ts';

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
 */

const FIXTURE_EMAIL = 'iris-audit@local.test';
const FIXTURE_FIRST_NAME = 'Iris';
const FIXTURE_LAST_NAME = 'Audit-Fixture';
/** Matches `CHK_users_phone` (`^\+905[0-9]{9}$`) — an obviously-placeholder Turkish mobile shape. */
const FIXTURE_PHONE = '+905000000000';

/**
 * `AccountRole.Student` / `EducationLevel.Secondary` / `GradeLevel.Grade12` /
 * `StudyStream.Diger`, spelled as their DB literals rather than imported (see this file's own
 * header + `credential-fixture.ts` for why `src/` is unreachable from here). Chosen to satisfy
 * `CHK_users_profile_shape`'s STUDENT/SECONDARY branch with the least-specific study stream
 * ("DIĞER" = other) available in that closed set, since this is a synthetic audit fixture, not
 * a real declared student profile.
 */
const FIXTURE_ACCOUNT_ROLE = 'STUDENT';
const FIXTURE_EDUCATION_LEVEL = 'SECONDARY';
const FIXTURE_GRADE_LEVEL = 'GRADE_12';
const FIXTURE_STUDY_STREAM = 'DIGER';

interface DistrictRef {
  readonly id: string;
  readonly districtNameTr: string;
  readonly provinceNameTr: string;
}

/**
 * Prefers Ankara/Çankaya (a stable, always-seeded reference row) and falls back to the first
 * district by id when that exact pair is absent — e.g. a fresh clone whose seed corpus changed.
 * Never invents an id: refuses loudly when `districts` is empty rather than picking nothing.
 */
async function pickDistrict(client: Client): Promise<DistrictRef> {
  const preferred = await client.query<{
    id: string;
    district_name_tr: string;
    province_name_tr: string;
  }>(
    `SELECT d.id, d.name_tr AS district_name_tr, p.name_tr AS province_name_tr
       FROM districts d
       JOIN provinces p ON p.id = d.province_id
      WHERE d.name_tr = 'Çankaya' AND p.plate_code = '06'
      LIMIT 1`,
  );
  const preferredRow = preferred.rows[0];
  if (preferredRow) {
    return {
      id: preferredRow.id,
      districtNameTr: preferredRow.district_name_tr,
      provinceNameTr: preferredRow.province_name_tr,
    };
  }

  const fallback = await client.query<{
    id: string;
    district_name_tr: string;
    province_name_tr: string;
  }>(
    `SELECT d.id, d.name_tr AS district_name_tr, p.name_tr AS province_name_tr
       FROM districts d
       JOIN provinces p ON p.id = d.province_id
      ORDER BY d.id
      LIMIT 1`,
  );
  const fallbackRow = fallback.rows[0];
  if (!fallbackRow) {
    throw new Error(
      'districts is empty — run `pnpm db:seed:geography` then `pnpm db:seed:reference` first ' +
        '(reference.cli.ts requires geography to have run: every ilçe hangs off a province row).',
    );
  }
  return {
    id: fallbackRow.id,
    districtNameTr: fallbackRow.district_name_tr,
    provinceNameTr: fallbackRow.province_name_tr,
  };
}

interface UpsertResult {
  readonly id: string;
  readonly tokenVersion: number;
  readonly inserted: boolean;
}

async function upsertFixtureUser(
  client: Client,
  args: { passwordHash: string; districtId: string },
): Promise<UpsertResult> {
  // `xmax = 0` is the standard Postgres idiom for "did THIS statement insert or update the
  // row": a freshly inserted row's xmax is 0 (no deleting transaction yet), while a row that
  // took the ON CONFLICT branch carries the updating transaction's xmax. Read once, inside the
  // same statement — no second query, no race with a concurrent run.
  const result = await client.query<{ id: string; token_version: number; inserted: boolean }>(
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
       token_version = users.token_version + 1,
       updated_at = now()
     RETURNING id, token_version, (xmax = 0) AS inserted`,
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
  if (!row) throw new Error('upsert returned no row — unexpected, refusing to report success.');
  return { id: row.id, tokenVersion: row.token_version, inserted: row.inserted };
}

function resolvePassword(): { password: string; source: 'cli' | 'env' | 'generated' } {
  const argv = process.argv.slice(2);
  const flagIndex = argv.indexOf('--password');
  if (flagIndex !== -1) {
    const value = argv[flagIndex + 1];
    if (!value) throw new Error('--password requires a value.');
    return { password: value, source: 'cli' };
  }
  const fromEnv = process.env.AUDIT_ACCOUNT_PASSWORD;
  if (fromEnv) return { password: fromEnv, source: 'env' };
  return { password: generateCompliantPassword(), source: 'generated' };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required (read script-locally; no default — fail-fast).');
  }

  // Requirement #1: fail closed BEFORE any connection is opened, on the DNS-resolved host, not
  // merely the string.
  const target = await assertLocalDatabaseUrl(databaseUrl);
  process.stdout.write(
    `[iris-audit-account] DATABASE_URL resolved host is loopback: ${target.host}:${target.port} — proceeding.\n`,
  );

  const { password, source } = resolvePassword();
  if (!isPasswordPolicyCompliant(password)) {
    throw new Error(
      `The ${source === 'generated' ? 'generated' : 'supplied'} password does not meet the ` +
        "app's own policy (min/max length, one lowercase, one uppercase, one digit) — refusing " +
        'to create an account the real login path would never have accepted from registration.',
    );
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    // Belt matching this repo's own pool posture (`data-source-options.ts`
    // `DATABASE_STATEMENT_TIMEOUT_MS`) — a hand-run tool should not hang forever either.
    await client.query('SET statement_timeout = 30000');

    const district = await pickDistrict(client);
    const passwordHash = await hashPassword(password);
    const result = await upsertFixtureUser(client, { passwordHash, districtId: district.id });

    process.stdout.write(
      `[iris-audit-account] ${result.inserted ? 'created' : 'reset'} user id=${result.id} ` +
        `email=${FIXTURE_EMAIL} district=${district.districtNameTr}/${district.provinceNameTr} ` +
        `tokenVersion=${result.tokenVersion}\n`,
    );
    process.stdout.write(
      '[iris-audit-account] Any access token issued before this run is now invalid ' +
        '(token_version bumped) — log in again to get a fresh one.\n',
    );
    process.stdout.write('\n=== İRİS AUDIT ACCOUNT — read once, not stored anywhere ===\n');
    process.stdout.write(`email:    ${FIXTURE_EMAIL}\n`);
    process.stdout.write(`password: ${password}\n`);
    process.stdout.write('=============================================================\n');
  } finally {
    await client.end();
  }
}

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
