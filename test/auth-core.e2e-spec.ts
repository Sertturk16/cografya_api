import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { instanceToPlain } from 'class-transformer';
import { DataSource, QueryFailedError } from 'typeorm';
import {
  AccountRole,
  AccountStatus,
  EducationLevel,
  GradeLevel,
  StudyStream,
} from '../src/auth/account.types';
import { canonicalizeEmail } from '../src/auth/email-canonicalization';
import { User } from '../src/auth/entities/user.entity';
import { buildDataSourceOptions } from '../src/database/data-source-options';

const SYNTHETIC_PASSWORD_HASH = '$argon2id$synthetic-e2e-shape-only';

interface UserInsert {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  passwordHash: string;
  accountRole: string;
  educationLevel: string | null;
  gradeLevel: string | null;
  studyStream: string | null;
  universityName: string | null;
  departmentName: string | null;
  districtId: string;
  status: string;
  emailVerifiedAt: Date | null;
}

interface InsertedUser {
  id: string;
  created_at: Date;
  updated_at: Date;
}

describe('Auth core schema (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let districtId: string;
  let emailSequence = 0;

  const nextEmail = (): string => {
    emailSequence += 1;
    return `synthetic.user.${emailSequence}@example.test`;
  };

  const teacher = (overrides: Partial<UserInsert> = {}): UserInsert => ({
    firstName: 'Synthetic',
    lastName: 'Teacher',
    phone: '+905000000000',
    email: nextEmail(),
    passwordHash: SYNTHETIC_PASSWORD_HASH,
    accountRole: AccountRole.Teacher,
    educationLevel: null,
    gradeLevel: null,
    studyStream: null,
    universityName: null,
    departmentName: null,
    districtId,
    status: AccountStatus.Unverified,
    emailVerifiedAt: null,
    ...overrides,
  });

  const secondary = (overrides: Partial<UserInsert> = {}): UserInsert =>
    teacher({
      lastName: 'Secondary',
      accountRole: AccountRole.Student,
      educationLevel: EducationLevel.Secondary,
      gradeLevel: GradeLevel.Grade12,
      studyStream: StudyStream.Sayisal,
      ...overrides,
    });

  const undergraduate = (overrides: Partial<UserInsert> = {}): UserInsert =>
    teacher({
      lastName: 'Undergraduate',
      accountRole: AccountRole.Student,
      educationLevel: EducationLevel.Undergraduate,
      universityName: 'Synthetic University',
      departmentName: 'Synthetic Department',
      ...overrides,
    });

  const graduate = (overrides: Partial<UserInsert> = {}): UserInsert =>
    teacher({
      lastName: 'Graduate',
      accountRole: AccountRole.Student,
      educationLevel: EducationLevel.Graduate,
      universityName: 'Synthetic University',
      ...overrides,
    });

  async function insertUser(input: UserInsert): Promise<InsertedUser> {
    const rows = await dataSource.query<InsertedUser[]>(
      `
        INSERT INTO users (
          first_name, last_name, phone, email, password_hash, account_role,
          education_level, grade_level, study_stream, university_name, department_name,
          district_id, status, email_verified_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )
        RETURNING id, created_at, updated_at
      `,
      [
        input.firstName,
        input.lastName,
        input.phone,
        input.email,
        input.passwordHash,
        input.accountRole,
        input.educationLevel,
        input.gradeLevel,
        input.studyStream,
        input.universityName,
        input.departmentName,
        input.districtId,
        input.status,
        input.emailVerifiedAt,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error('synthetic user insert returned no row');
    return row;
  }

  async function expectRejected(input: UserInsert): Promise<void> {
    await expect(insertUser(input)).rejects.toBeInstanceOf(QueryFailedError);
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource(buildDataSourceOptions(container.getConnectionUri()));
    await dataSource.initialize();
    await dataSource.runMigrations();

    const provinces = await dataSource.query<{ id: string }[]>(`
      INSERT INTO provinces (plate_code, name_tr, slug_tr, slug_en, region)
      VALUES ('99', 'Synthetic Province', 'synthetic-province', 'synthetic-province', 'MARMARA')
      RETURNING id
    `);
    const province = provinces[0];
    if (!province) throw new Error('synthetic province insert returned no row');

    const districts = await dataSource.query<{ id: string }[]>(
      `
        INSERT INTO districts (province_id, name_tr)
        VALUES ($1, 'Synthetic District')
        RETURNING id
      `,
      [province.id],
    );
    const district = districts[0];
    if (!district) throw new Error('synthetic district insert returned no row');
    districtId = district.id;
  }, 300_000);

  afterEach(async () => {
    const rows = await dataSource.query<{ relation: string | null }[]>(
      `SELECT to_regclass('public.users')::text AS relation`,
    );
    if (rows[0]?.relation !== null) await dataSource.query(`DELETE FROM users`);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    await container?.stop();
  });

  it('creates the users auth table plus the UYELIK-02 auth-primitives tables', async () => {
    // UYELIK-01 pinned these three to `null` (it deliberately tested their ABSENCE). UYELIK-02
    // PR-1 lands them, so the pin flips to the table names — the negative pin becomes the
    // positive one rather than being deleted, so a future revert of that migration is caught
    // here exactly as the original absence was.
    //
    // `email_verification_codes` then went the OTHER way: `InitPendingRegistrations` dropped it
    // and `pending_registrations` took its place (`SEC136-C1`), so its pin is `null` again — and
    // that null is an assertion, not an omission. It is what fails if the drop is ever quietly
    // reverted and two code tables end up coexisting.
    const relationRows = await dataSource.query<
      {
        users: string | null;
        sessions: string | null;
        verify_codes: string | null;
        pending: string | null;
        reset_tokens: string | null;
      }[]
    >(`
      SELECT
        to_regclass('public.users')::text AS users,
        to_regclass('public.sessions')::text AS sessions,
        to_regclass('public.email_verification_codes')::text AS verify_codes,
        to_regclass('public.pending_registrations')::text AS pending,
        to_regclass('public.password_reset_tokens')::text AS reset_tokens
    `);
    expect(relationRows[0]).toEqual({
      users: 'users',
      sessions: 'sessions',
      verify_codes: null,
      pending: 'pending_registrations',
      reset_tokens: 'password_reset_tokens',
    });

    const columns = await dataSource.query<{ column_name: string }[]>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
      ORDER BY ordinal_position
    `);
    expect(columns.map(({ column_name }) => column_name)).toEqual([
      'id',
      'first_name',
      'last_name',
      'phone',
      'email',
      'password_hash',
      'account_role',
      'education_level',
      'grade_level',
      'study_stream',
      'university_name',
      'department_name',
      'district_id',
      'status',
      'email_verified_at',
      'created_at',
      'updated_at',
      'token_version',
    ]);

    const constraints = await dataSource.query<{ conname: string }[]>(`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'public.users'::regclass
      ORDER BY conname
    `);
    expect(constraints.map(({ conname }) => conname)).toEqual(
      [
        'CHK_users_account_role',
        'CHK_users_department_name',
        'CHK_users_education_level',
        'CHK_users_email_canonical',
        'CHK_users_first_name',
        'CHK_users_grade_level',
        'CHK_users_last_name',
        'CHK_users_password_hash',
        'CHK_users_phone',
        'CHK_users_profile_shape',
        'CHK_users_status',
        'CHK_users_study_stream',
        'CHK_users_university_name',
        'CHK_users_verification_state',
        'CHK_users_token_version',
        'FK_users_district',
        'PK_users',
        'UQ_users_email',
      ].sort(),
    );
  });

  it('accepts every grade and study-stream member for secondary students', async () => {
    expect(Object.values(GradeLevel)).toHaveLength(11);
    expect(Object.values(StudyStream)).toHaveLength(10);

    for (const gradeLevel of Object.values(GradeLevel)) {
      await expect(insertUser(secondary({ gradeLevel }))).resolves.toBeDefined();
    }
    for (const studyStream of Object.values(StudyStream)) {
      await expect(insertUser(secondary({ studyStream }))).resolves.toBeDefined();
    }
  });

  it('accepts teacher, undergraduate and both graduate profile shapes', async () => {
    await expect(insertUser(teacher())).resolves.toBeDefined();
    await expect(insertUser(undergraduate())).resolves.toBeDefined();
    await expect(insertUser(graduate({ departmentName: null }))).resolves.toBeDefined();
    await expect(
      insertUser(graduate({ departmentName: 'Synthetic Department' })),
    ).resolves.toBeDefined();
  });

  it('rejects cross-role, missing and leftover profile fields', async () => {
    await expectRejected(
      teacher({
        educationLevel: EducationLevel.Secondary,
        gradeLevel: GradeLevel.Grade12,
        studyStream: StudyStream.Sayisal,
      }),
    );
    await expectRejected(secondary({ studyStream: null }));
    await expectRejected(secondary({ universityName: 'Synthetic University' }));
    await expectRejected(undergraduate({ departmentName: null }));
    await expectRejected(undergraduate({ gradeLevel: GradeLevel.Grade12 }));
    await expectRejected(graduate({ universityName: null }));
    await expectRejected(graduate({ studyStream: StudyStream.Sayisal }));

    // Three-valued SQL logic: with `education_level` NULL, a branch reaches UNKNOWN only when
    // its remaining `IS [NOT] NULL` conditions all hold too (a complete field set with no
    // declared level) — otherwise `UNKNOWN AND FALSE` is FALSE. A Postgres CHECK accepts
    // UNKNOWN. All three rows below are accepted by the pre-fix constraint and rejected by the
    // fixed one, so each is a real positive control (PR #133 review, SEC133-I1).
    // They name the rejecting constraint rather than going through `expectRejected`, which
    // only sees the `QueryFailedError` class: the guard is that one wrapper, so a constraint
    // added later must not keep these green for a different reason (round 2, CODE133R2-M1).
    await expect(insertUser(secondary({ educationLevel: null }))).rejects.toThrow(
      /CHK_users_profile_shape/,
    );
    await expect(insertUser(undergraduate({ educationLevel: null }))).rejects.toThrow(
      /CHK_users_profile_shape/,
    );
    await expect(insertUser(graduate({ educationLevel: null }))).rejects.toThrow(
      /CHK_users_profile_shape/,
    );
  });

  it('accepts lifecycle states only with their allowed verification timestamps', async () => {
    const verifiedAt = new Date('2026-08-24T12:00:00.000Z');

    await expect(insertUser(teacher())).resolves.toBeDefined();
    await expect(
      insertUser(teacher({ status: AccountStatus.Active, emailVerifiedAt: verifiedAt })),
    ).resolves.toBeDefined();
    await expect(
      insertUser(teacher({ status: AccountStatus.Disabled, emailVerifiedAt: null })),
    ).resolves.toBeDefined();
    await expect(
      insertUser(teacher({ status: AccountStatus.Disabled, emailVerifiedAt: verifiedAt })),
    ).resolves.toBeDefined();
    await expect(
      insertUser(teacher({ status: AccountStatus.PendingDeletion, emailVerifiedAt: null })),
    ).resolves.toBeDefined();
    await expect(
      insertUser(teacher({ status: AccountStatus.PendingDeletion, emailVerifiedAt: verifiedAt })),
    ).resolves.toBeDefined();

    await expectRejected(teacher({ status: AccountStatus.Active, emailVerifiedAt: null }));
    await expectRejected(
      teacher({ status: AccountStatus.Unverified, emailVerifiedAt: verifiedAt }),
    );
    await expectRejected(teacher({ status: 'LOCKED' }));
  });

  it('enforces canonical identity and trimmed profile values', async () => {
    const canonical = canonicalizeEmail('  CANONICAL.USER@EXAMPLE.TEST  ');
    await insertUser(teacher({ email: canonical }));
    await expectRejected(teacher({ email: canonical }));
    await expectRejected(teacher({ email: 'Uppercase.User@example.test' }));
    await expectRejected(teacher({ email: ' padded.user@example.test ' }));
    await expectRejected(teacher({ phone: '05000000000' }));
    await expectRejected(teacher({ passwordHash: 'synthetic-not-argon2id' }));
    await expectRejected(teacher({ firstName: ' Padded' }));
    await expectRejected(undergraduate({ universityName: ' Synthetic University' }));
  });

  it('uses district as the single location key and restricts referenced deletion', async () => {
    await expectRejected(teacher({ districtId: '00000000-0000-0000-0000-000000000000' }));
    await insertUser(teacher());
    await expect(
      dataSource.query(`DELETE FROM districts WHERE id = $1`, [districtId]),
    ).rejects.toBeInstanceOf(QueryFailedError);
  });

  it('defaults timestamps, hides passwordHash and serializes no PII', async () => {
    const inserted = await insertUser(teacher());
    expect(inserted.created_at).toBeInstanceOf(Date);
    expect(inserted.updated_at).toBeInstanceOf(Date);

    const defaultSelected = await dataSource.getRepository(User).findOneByOrFail({
      id: inserted.id,
    });
    // NOT an own-property assertion: the ES2023 class-field form declares `passwordHash` on
    // every instance, so `hasOwnProperty` measures the class shape rather than the query. The
    // `select: false` contract is that the DEFAULT query loads no value — and the explicit
    // `addSelect` block below is the positive control that proves the value would be there if
    // it were selected. Neither half means anything alone (PR #133 review, TA133-I2).
    expect(defaultSelected.passwordHash).toBeUndefined();

    const explicitlySelected = await dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id: inserted.id })
      .getOneOrFail();
    expect(explicitlySelected.passwordHash).toBe(SYNTHETIC_PASSWORD_HASH);
    expect(instanceToPlain(explicitlySelected)).toEqual({});
  });

  it('reverts and reapplies the latest migration (InitPendingRegistrations) on an empty synthetic table', async () => {
    // The migration under revert MOVED again: `InitPendingRegistrations` is now the last one, so
    // `undoLastMigration` no longer touches `sessions`, `password_reset_tokens`,
    // `auth_rate_limits` or `users.token_version` at all — `InitAuthSessions` sits one further
    // back and stays applied. What this asserts is exactly what the new `down()` does: swap the
    // two code tables back, leaving everything else in place.
    //
    // Both directions matter here. `down()` re-creating `email_verification_codes` is the half a
    // revert on a live database depends on, and nothing else in the suite exercises it.
    const counts = await dataSource.query<{ count: string }[]>(
      `SELECT count(*)::text AS count FROM users`,
    );
    expect(counts[0]?.count).toBe('0');

    const relationSnapshot = async (): Promise<Record<string, string | null> | undefined> => {
      const rows = await dataSource.query<
        {
          users: string | null;
          sessions: string | null;
          verify_codes: string | null;
          pending: string | null;
          reset_tokens: string | null;
        }[]
      >(`
        SELECT
          to_regclass('public.users')::text AS users,
          to_regclass('public.sessions')::text AS sessions,
          to_regclass('public.email_verification_codes')::text AS verify_codes,
          to_regclass('public.pending_registrations')::text AS pending,
          to_regclass('public.password_reset_tokens')::text AS reset_tokens
      `);
      return rows[0];
    };

    expect(await relationSnapshot()).toEqual({
      users: 'users',
      sessions: 'sessions',
      verify_codes: null,
      pending: 'pending_registrations',
      reset_tokens: 'password_reset_tokens',
    });

    await dataSource.undoLastMigration();

    // The swap, and ONLY the swap: `sessions`, `password_reset_tokens` and `token_version` are
    // one migration further back and must be untouched by this revert.
    expect(await relationSnapshot()).toEqual({
      users: 'users',
      sessions: 'sessions',
      verify_codes: 'email_verification_codes',
      pending: null,
      reset_tokens: 'password_reset_tokens',
    });

    const columnsAfterDown = await dataSource.query<{ column_name: string }[]>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'token_version'
    `);
    expect(columnsAfterDown).toHaveLength(1);

    // The re-created table must come back with its partial unique index, not merely with its
    // columns — that index is what `down()` hand-authors and what a naive `CREATE TABLE` would
    // silently omit.
    const revertedIndexes = await dataSource.query<{ indexname: string }[]>(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'email_verification_codes'
      ORDER BY indexname
    `);
    expect(revertedIndexes.map(({ indexname }) => indexname)).toEqual([
      'IDX_email_verification_codes_expires_at',
      'PK_email_verification_codes',
      'UQ_email_verification_codes_active',
    ]);

    await dataSource.runMigrations();

    expect(await relationSnapshot()).toEqual({
      users: 'users',
      sessions: 'sessions',
      verify_codes: null,
      pending: 'pending_registrations',
      reset_tokens: 'password_reset_tokens',
    });

    const columnsAfterUp = await dataSource.query<{ column_name: string }[]>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'token_version'
    `);
    expect(columnsAfterUp).toHaveLength(1);
  });
});
