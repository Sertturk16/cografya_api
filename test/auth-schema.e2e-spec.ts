import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource, QueryFailedError } from 'typeorm';
import { AccountRole, AccountStatus } from '../src/auth/account.types';
import { buildDataSourceOptions } from '../src/database/data-source-options';

const SYNTHETIC_PASSWORD_HASH = '$argon2id$synthetic-e2e-shape-only';
/**
 * A FRESH 32-byte buffer per call, not a shared constant — `sessions.token_hash` and
 * `password_reset_tokens.token_hash` both carry a UNIQUE constraint, so two helper calls
 * within the same test that both fall back to a shared default would collide on it (SC6's
 * two-session rotation chain is exactly that shape). A test that needs the SAME hash across
 * calls on purpose (E2E-SC8's bucket) passes it explicitly instead of relying on the default.
 */
function randomHash32(): Buffer {
  return randomBytes(32);
}

/**
 * `test/auth-schema.e2e-spec.ts` (PR-1) — schema/constraint/cascade only, over the four auth
 * tables that exist after `1787565600000-InitAuthSessions.ts` and
 * `1787652000000-InitPendingRegistrations.ts`: E2E-SC1..SC8 (plan §14.2). No token minting, no
 * rate-limit service, no crypto: every row here is inserted by raw, parameterised SQL so the
 * assertions are about what POSTGRES enforces, independent of any service code.
 *
 * **The `email_verification_codes` half moved to `pending_registrations` (`SEC136-C1`).** The old
 * table is DROPPED, so every case that asserted its columns, constraints, cascade or partial
 * unique index now asserts the equivalent — or, for SC4, the deliberately OPPOSITE — property on
 * the new one.
 */
describe('Auth-primitives schema (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let districtId: string;
  let emailSequence = 0;

  async function insertUser(overrides: { status?: AccountStatus } = {}): Promise<string> {
    emailSequence += 1;
    const rows = await dataSource.query<{ id: string }[]>(
      `
        INSERT INTO users (
          first_name, last_name, phone, email, password_hash, account_role,
          district_id, status, email_verified_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `,
      [
        'Synthetic',
        'User',
        '+905000000000',
        `synthetic.schema.${emailSequence}@example.test`,
        SYNTHETIC_PASSWORD_HASH,
        AccountRole.Teacher,
        districtId,
        overrides.status ?? AccountStatus.Unverified,
        overrides.status === AccountStatus.Active ? new Date() : null,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error('synthetic user insert returned no row');
    return row.id;
  }

  interface SessionInsert {
    userId: string;
    familyId: string;
    tokenHash: Buffer;
    issuedAt: Date;
    expiresAt: Date;
    revokedAt: Date | null;
    revokedReason: string | null;
    rotatedFromId: string | null;
    rotationGraceUsedAt: Date | null;
  }

  async function insertSession(overrides: Partial<SessionInsert> & { userId: string }): Promise<{
    id: string;
  }> {
    const now = new Date();
    const input: SessionInsert = {
      familyId: randomUUID(),
      tokenHash: randomHash32(),
      issuedAt: now,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      revokedAt: null,
      revokedReason: null,
      rotatedFromId: null,
      rotationGraceUsedAt: null,
      ...overrides,
    };
    const rows = await dataSource.query<{ id: string }[]>(
      `
        INSERT INTO sessions (
          user_id, family_id, token_hash, issued_at, expires_at, revoked_at, revoked_reason,
          rotated_from_id, rotation_grace_used_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `,
      [
        input.userId,
        input.familyId,
        input.tokenHash,
        input.issuedAt,
        input.expiresAt,
        input.revokedAt,
        input.revokedReason,
        input.rotatedFromId,
        input.rotationGraceUsedAt,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error('synthetic session insert returned no row');
    return row;
  }

  interface PendingRegistrationInsert {
    email: string;
    codeHash: Buffer;
    expiresAt: Date;
    attemptCount: number;
    districtId: string;
    accountRole: string;
    educationLevel: string | null;
    gradeLevel: string | null;
    studyStream: string | null;
    universityName: string | null;
    departmentName: string | null;
    locale: string;
    passwordHash: string;
  }

  /**
   * `pending_registrations` replaced `email_verification_codes` in
   * `1787652000000-InitPendingRegistrations.ts`: an unconfirmed registration is no longer a
   * `users` row, so the code row carries the submitted credentials and hangs off `districts`
   * rather than `users` (`SEC136-C1`). Every assertion below moved with it.
   */
  async function insertPendingRegistration(
    overrides: Partial<PendingRegistrationInsert> = {},
  ): Promise<{ id: string }> {
    emailSequence += 1;
    const input: PendingRegistrationInsert = {
      email: `synthetic.pending.${emailSequence}@example.test`,
      codeHash: randomHash32(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attemptCount: 0,
      districtId,
      accountRole: AccountRole.Teacher,
      educationLevel: null,
      gradeLevel: null,
      studyStream: null,
      universityName: null,
      departmentName: null,
      locale: 'tr',
      passwordHash: SYNTHETIC_PASSWORD_HASH,
      ...overrides,
    };
    const rows = await dataSource.query<{ id: string }[]>(
      `
        INSERT INTO pending_registrations (
          email, password_hash, first_name, last_name, phone, account_role, education_level,
          grade_level, study_stream, university_name, department_name, district_id, locale,
          code_hash, expires_at, attempt_count
        ) VALUES ($1, $2, 'Synthetic', 'Pending', '+905000000000', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id
      `,
      [
        input.email,
        input.passwordHash,
        input.accountRole,
        input.educationLevel,
        input.gradeLevel,
        input.studyStream,
        input.universityName,
        input.departmentName,
        input.districtId,
        input.locale,
        input.codeHash,
        input.expiresAt,
        input.attemptCount,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error('synthetic pending registration insert returned no row');
    return row;
  }

  interface ResetTokenInsert {
    userId: string;
    tokenHash: Buffer;
    expiresAt: Date;
    consumedAt: Date | null;
  }

  async function insertResetToken(
    overrides: Partial<ResetTokenInsert> & { userId: string },
  ): Promise<{ id: string }> {
    const input: ResetTokenInsert = {
      tokenHash: randomHash32(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      consumedAt: null,
      ...overrides,
    };
    const rows = await dataSource.query<{ id: string }[]>(
      `
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, consumed_at)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [input.userId, input.tokenHash, input.expiresAt, input.consumedAt],
    );
    const row = rows[0];
    if (!row) throw new Error('synthetic reset token insert returned no row');
    return row;
  }

  interface RateLimitInsert {
    scope: string;
    subjectHash: Buffer;
    windowStart: Date;
    attemptCount: number;
  }

  async function insertRateLimit(overrides: Partial<RateLimitInsert> = {}): Promise<{
    id: string;
    attempt_count: number;
  }> {
    const input: RateLimitInsert = {
      scope: 'LOGIN_EMAIL',
      subjectHash: randomHash32(),
      windowStart: new Date(Math.floor(Date.now() / (15 * 60 * 1000)) * (15 * 60 * 1000)),
      attemptCount: 1,
      ...overrides,
    };
    const rows = await dataSource.query<{ id: string; attempt_count: number }[]>(
      `
        INSERT INTO auth_rate_limits (scope, subject_hash, window_start, attempt_count, updated_at)
        VALUES ($1, $2, $3, $4, now())
        RETURNING id, attempt_count
      `,
      [input.scope, input.subjectHash, input.windowStart, input.attemptCount],
    );
    const row = rows[0];
    if (!row) throw new Error('synthetic rate-limit insert returned no row');
    return row;
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource(buildDataSourceOptions(container.getConnectionUri()));
    await dataSource.initialize();
    await dataSource.runMigrations();

    const provinces = await dataSource.query<{ id: string }[]>(`
      INSERT INTO provinces (plate_code, name_tr, slug_tr, slug_en, region)
      VALUES ('98', 'Synthetic Schema Province', 'synthetic-schema-province', 'synthetic-schema-province', 'MARMARA')
      RETURNING id
    `);
    const province = provinces[0];
    if (!province) throw new Error('synthetic province insert returned no row');

    const districts = await dataSource.query<{ id: string }[]>(
      `INSERT INTO districts (province_id, name_tr) VALUES ($1, 'Synthetic Schema District') RETURNING id`,
      [province.id],
    );
    const district = districts[0];
    if (!district) throw new Error('synthetic district insert returned no row');
    districtId = district.id;
  }, 300_000);

  afterEach(async () => {
    // FK cascade from `users` clears `sessions` and `password_reset_tokens`.
    // `auth_rate_limits` has no FK, and `pending_registrations` hangs off `districts` rather
    // than `users` — both are cleared independently.
    await dataSource.query(`DELETE FROM users`);
    await dataSource.query(`DELETE FROM pending_registrations`);
    await dataSource.query(`DELETE FROM auth_rate_limits`);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    await container?.stop();
  });

  it('E2E-SC1: creates exactly the four new tables with pinned column order', async () => {
    const relation = await dataSource.query<{ relation: string | null }[]>(`
      SELECT to_regclass('public.sessions')::text AS relation
    `);
    expect(relation[0]?.relation).toBe('sessions');

    const columnsOf = async (table: string): Promise<string[]> => {
      const rows = await dataSource.query<{ column_name: string }[]>(
        `
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position
        `,
        [table],
      );
      return rows.map(({ column_name }) => column_name);
    };

    expect(await columnsOf('sessions')).toEqual([
      'id',
      'user_id',
      'family_id',
      'token_hash',
      'issued_at',
      'expires_at',
      'revoked_at',
      'revoked_reason',
      'rotated_from_id',
      'created_at',
      'rotation_grace_used_at',
    ]);
    expect(await columnsOf('pending_registrations')).toEqual([
      'id',
      'email',
      'password_hash',
      'first_name',
      'last_name',
      'phone',
      'account_role',
      'education_level',
      'grade_level',
      'study_stream',
      'university_name',
      'department_name',
      'district_id',
      'locale',
      'code_hash',
      'expires_at',
      'attempt_count',
      'created_at',
    ]);
    // The table this one replaced is GONE, not merely unused — a dead table with a live FK and a
    // one-slot unique index is exactly the debt the rework existed to remove.
    const droppedRelation = await dataSource.query<{ relation: string | null }[]>(`
      SELECT to_regclass('public.email_verification_codes')::text AS relation
    `);
    expect(droppedRelation[0]?.relation).toBeNull();
    expect(await columnsOf('password_reset_tokens')).toEqual([
      'id',
      'user_id',
      'token_hash',
      'expires_at',
      'consumed_at',
      'created_at',
    ]);
    expect(await columnsOf('auth_rate_limits')).toEqual([
      'id',
      'scope',
      'subject_hash',
      'window_start',
      'attempt_count',
      'updated_at',
    ]);
  });

  it('E2E-SC2: users.token_version is NOT NULL DEFAULT 0, and rejects a negative value', async () => {
    const userId = await insertUser();
    const rows = await dataSource.query<{ token_version: number }[]>(
      `SELECT token_version FROM users WHERE id = $1`,
      [userId],
    );
    expect(rows[0]?.token_version).toBe(0);

    await expect(
      dataSource.query(`UPDATE users SET token_version = -1 WHERE id = $1`, [userId]),
    ).rejects.toThrow(/CHK_users_token_version/);
  });

  it('E2E-SC3: every non-length CHECK constraint rejects by name in its negative case', async () => {
    const userId = await insertUser();

    // sessions.CHK_sessions_revocation — revoked_at set without revoked_reason.
    await expect(
      insertSession({ userId, revokedAt: new Date(), revokedReason: null }),
    ).rejects.toThrow(/CHK_sessions_revocation/);

    // sessions.CHK_sessions_revoked_reason — a reason outside the closed set.
    await expect(
      insertSession({ userId, revokedAt: new Date(), revokedReason: 'MADE_UP_REASON' }),
    ).rejects.toThrow(/CHK_sessions_revoked_reason/);

    // sessions.CHK_sessions_expiry — expires_at not strictly after issued_at.
    const now = new Date();
    await expect(insertSession({ userId, issuedAt: now, expiresAt: now })).rejects.toThrow(
      /CHK_sessions_expiry/,
    );

    // sessions.CHK_sessions_not_self_rotated — rotated_from_id cannot equal id. Postgres assigns
    // the PK via gen_random_uuid() at insert time, so this is proven with an UPDATE instead.
    const { id: sessionId } = await insertSession({ userId });
    await expect(
      dataSource.query(`UPDATE sessions SET rotated_from_id = id WHERE id = $1`, [sessionId]),
    ).rejects.toThrow(/CHK_sessions_not_self_rotated/);

    // pending_registrations.CHK_pending_registrations_attempts — out of [0, 5]. This is the
    // constraint `SFH136-I1` measured a concurrent increment pair could violate into a 500; the
    // service now holds a row lock and clamps at the ceiling, and the constraint stays as the belt.
    await expect(insertPendingRegistration({ attemptCount: 6 })).rejects.toThrow(
      /CHK_pending_registrations_attempts/,
    );
    await expect(insertPendingRegistration({ attemptCount: -1 })).rejects.toThrow(
      /CHK_pending_registrations_attempts/,
    );

    // pending_registrations.CHK_pending_registrations_profile_shape — the users mirror. A TEACHER
    // carrying a student-only field is the branch whose UNKNOWN-folding `IS TRUE` matters.
    await expect(
      insertPendingRegistration({ accountRole: AccountRole.Teacher, gradeLevel: 'GRADE_9' }),
    ).rejects.toThrow(/CHK_pending_registrations_profile_shape/);
    // …and a STUDENT with no declared education level, the case a bare CHECK would accept as
    // UNKNOWN.
    await expect(
      insertPendingRegistration({ accountRole: 'STUDENT', educationLevel: null }),
    ).rejects.toThrow(/CHK_pending_registrations_profile_shape/);

    // pending_registrations.CHK_pending_registrations_password_hash — the users mirror: a
    // candidate that could not satisfy `users` must fail HERE, not after the user typed a
    // correct code.
    await expect(
      insertPendingRegistration({ passwordHash: 'synthetic-not-argon2id' }),
    ).rejects.toThrow(/CHK_pending_registrations_password_hash/);

    // pending_registrations.CHK_pending_registrations_email_canonical — a non-canonical address
    // would never be found by `verify`, which looks the group up by exact match.
    await expect(
      insertPendingRegistration({ email: 'Uppercase.Pending@example.test' }),
    ).rejects.toThrow(/CHK_pending_registrations_email_canonical/);

    // pending_registrations.CHK_pending_registrations_locale — closed set.
    await expect(insertPendingRegistration({ locale: 'de' })).rejects.toThrow(
      /CHK_pending_registrations_locale/,
    );

    // auth_rate_limits.CHK_auth_rate_limits_count — negative counter.
    await expect(insertRateLimit({ attemptCount: -1 })).rejects.toThrow(
      /CHK_auth_rate_limits_count/,
    );

    // auth_rate_limits.CHK_auth_rate_limits_scope — a scope outside the closed set.
    await expect(insertRateLimit({ scope: 'MADE_UP_SCOPE' })).rejects.toThrow(
      /CHK_auth_rate_limits_scope/,
    );
  });

  it('E2E-SC4: one address may hold SEVERAL live candidates, but two rows may never share a digest', async () => {
    // The INVERSION of what this case used to assert, and the inversion is the point.
    // `UQ_email_verification_codes_active` made "at most one active code per user" a schema
    // invariant — which is precisely the one-slot rule that let whoever registered an address
    // FIRST own its credentials (`SEC136-C1`). Several candidates for one address must now
    // coexist, each with its own credentials and its own code.
    const email = 'synthetic.multi.candidate@example.test';
    await insertPendingRegistration({ email });
    await expect(insertPendingRegistration({ email })).resolves.toBeDefined();
    await expect(insertPendingRegistration({ email })).resolves.toBeDefined();

    const rows = await dataSource.query<{ count: string }[]>(
      `SELECT count(*)::text AS count FROM pending_registrations WHERE email = $1`,
      [email],
    );
    expect(rows[0]?.count).toBe('3');

    // The uniqueness that REMAINS: no two candidates may carry the same digest. It is redundant
    // with binding the row's own id into the HMAC input and is kept as the structural belt, in
    // the same shape `sessions.token_hash` uses.
    const sharedHash = randomHash32();
    await insertPendingRegistration({ codeHash: sharedHash });
    await expect(insertPendingRegistration({ codeHash: sharedHash })).rejects.toBeInstanceOf(
      QueryFailedError,
    );
  });

  it('E2E-SC5: deleting the user CASCADEs its two auth tables; district deletion still RESTRICTs', async () => {
    const userId = await insertUser();
    const { id: sessionId } = await insertSession({ userId });
    const { id: tokenId } = await insertResetToken({ userId });

    await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);

    const remaining = await dataSource.query<{ count: string }[]>(
      `
        SELECT
          (SELECT count(*) FROM sessions WHERE id = $1) +
          (SELECT count(*) FROM password_reset_tokens WHERE id = $2) AS count
      `,
      [sessionId, tokenId],
    );
    expect(remaining[0]?.count).toBe('0');

    // UYELIK-01's district RESTRICT is unbroken by either migration. A SEPARATE user (not the one
    // just deleted above) must still reference `districtId` here — RESTRICT only blocks a
    // deletion while a referencing row exists, and the whole file shares one `districtId` from
    // `beforeAll`, so actually deleting it here would break every test that runs after this one.
    await insertUser();
    await expect(
      dataSource.query(`DELETE FROM districts WHERE id = $1`, [districtId]),
    ).rejects.toBeInstanceOf(QueryFailedError);

    // `pending_registrations` hangs off `districts` with CASCADE, not RESTRICT, and the asymmetry
    // is deliberate: a real account's location must never be silently removed under it, while a
    // candidate pointing at a removed ilçe could not materialize anyway. Proven on a THROWAWAY
    // district so the shared one above stays intact.
    const throwawayDistricts = await dataSource.query<{ id: string }[]>(
      `INSERT INTO districts (province_id, name_tr)
       SELECT province_id, 'Synthetic Cascade District' FROM districts WHERE id = $1
       RETURNING id`,
      [districtId],
    );
    const throwawayDistrictId = throwawayDistricts[0]?.id;
    if (!throwawayDistrictId) throw new Error('throwaway district insert returned no row');
    const { id: pendingId } = await insertPendingRegistration({
      districtId: throwawayDistrictId,
    });
    await dataSource.query(`DELETE FROM districts WHERE id = $1`, [throwawayDistrictId]);
    const survivingPending = await dataSource.query<{ count: string }[]>(
      `SELECT count(*)::text AS count FROM pending_registrations WHERE id = $1`,
      [pendingId],
    );
    expect(survivingPending[0]?.count).toBe('0');
  });

  it('E2E-SC6: sessions.rotated_from_id is SET NULL when the referenced row is deleted', async () => {
    const userId = await insertUser();
    const { id: originalId } = await insertSession({ userId });
    const { id: rotatedId } = await insertSession({ userId, rotatedFromId: originalId });

    await dataSource.query(`DELETE FROM sessions WHERE id = $1`, [originalId]);

    const rows = await dataSource.query<{ rotated_from_id: string | null }[]>(
      `SELECT rotated_from_id FROM sessions WHERE id = $1`,
      [rotatedId],
    );
    expect(rows[0]?.rotated_from_id).toBeNull();
  });

  it('E2E-SC7: token_hash / code_hash / subject_hash reject anything but exactly 32 bytes', async () => {
    const userId = await insertUser();

    await expect(insertSession({ userId, tokenHash: Buffer.alloc(31, 1) })).rejects.toThrow(
      /CHK_sessions_token_hash_length/,
    );
    await expect(insertPendingRegistration({ codeHash: Buffer.alloc(16, 2) })).rejects.toThrow(
      /CHK_pending_registrations_code_hash_length/,
    );
    await expect(insertResetToken({ userId, tokenHash: Buffer.alloc(20, 3) })).rejects.toThrow(
      /CHK_password_reset_tokens_hash_length/,
    );
    await expect(insertRateLimit({ subjectHash: Buffer.alloc(10, 4) })).rejects.toThrow(
      /CHK_auth_rate_limits_subject_length/,
    );
  });

  it('E2E-SC8: rotation_grace_used_at is allowed only on a ROTATED session row', async () => {
    const userId = await insertUser();
    await expect(
      insertSession({
        userId,
        revokedAt: new Date(),
        revokedReason: 'LOGOUT',
        rotationGraceUsedAt: new Date(),
      }),
    ).rejects.toThrow(/CHK_sessions_rotation_grace_reason/);
    await expect(
      insertSession({
        userId,
        revokedAt: new Date(),
        revokedReason: 'ROTATED',
        rotationGraceUsedAt: new Date(),
      }),
    ).resolves.toBeDefined();
  });

  it('E2E-SC9: the (scope, subject_hash, window_start) bucket is unique and increments atomically', async () => {
    const windowStart = new Date(Math.floor(Date.now() / (15 * 60 * 1000)) * (15 * 60 * 1000));
    const subjectHash = randomHash32();

    const first = await insertRateLimit({ subjectHash, windowStart, attemptCount: 1 });
    expect(first.attempt_count).toBe(1);

    // The exact D10 algorithm: INSERT … ON CONFLICT (scope, subject_hash, window_start) DO
    // UPDATE SET attempt_count = attempt_count + 1 … RETURNING attempt_count.
    const upsert = async (): Promise<number> => {
      const rows = await dataSource.query<{ attempt_count: number }[]>(
        `
          INSERT INTO auth_rate_limits (scope, subject_hash, window_start, attempt_count, updated_at)
          VALUES ('LOGIN_EMAIL', $1, $2, 1, now())
          ON CONFLICT (scope, subject_hash, window_start)
          DO UPDATE SET attempt_count = auth_rate_limits.attempt_count + 1, updated_at = now()
          RETURNING attempt_count
        `,
        [subjectHash, windowStart],
      );
      const row = rows[0];
      if (!row) throw new Error('upsert returned no row');
      return row.attempt_count;
    };

    const results = await Promise.all([upsert(), upsert(), upsert()]);
    // Started at 1, three concurrent increments land on {2,3,4} in some order — the point is
    // that all three land distinctly (no lost update) and the final read agrees.
    expect(new Set(results).size).toBe(3);

    const finalRows = await dataSource.query<{ attempt_count: number }[]>(
      `SELECT attempt_count FROM auth_rate_limits WHERE scope = 'LOGIN_EMAIL' AND subject_hash = $1 AND window_start = $2`,
      [subjectHash, windowStart],
    );
    expect(finalRows[0]?.attempt_count).toBe(4);

    // A different window for the SAME (scope, subject_hash) is a DIFFERENT row, not a conflict.
    const otherWindowStart = new Date(windowStart.getTime() + 15 * 60 * 1000);
    await expect(
      insertRateLimit({ subjectHash, windowStart: otherWindowStart, attemptCount: 1 }),
    ).resolves.toBeDefined();
  });

  it('E2E-SC10: sessions.token_hash rejects a duplicate value across two rows', async () => {
    const userId = await insertUser();
    const sharedHash = randomHash32();
    await insertSession({ userId, tokenHash: sharedHash });
    await expect(insertSession({ userId, tokenHash: sharedHash })).rejects.toBeInstanceOf(
      QueryFailedError,
    );
  });

  it('E2E-SC11: password_reset_tokens.token_hash rejects a duplicate value across two rows', async () => {
    const userId = await insertUser();
    const sharedHash = randomHash32();
    await insertResetToken({ userId, tokenHash: sharedHash });
    await expect(insertResetToken({ userId, tokenHash: sharedHash })).rejects.toBeInstanceOf(
      QueryFailedError,
    );
  });
});
