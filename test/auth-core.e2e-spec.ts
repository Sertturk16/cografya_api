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
import { PendingRegistration } from '../src/auth/entities/pending-registration.entity';
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
  schoolName: string | null;
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
    schoolName: null,
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
          school_name, district_id, status, email_verified_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
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
        input.schoolName,
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
    const rows = await dataSource.query<{ users: string | null; pending: string | null }[]>(
      `SELECT to_regclass('public.users')::text AS users,
              to_regclass('public.pending_registrations')::text AS pending`,
    );
    if (rows[0]?.users !== null) await dataSource.query(`DELETE FROM users`);
    if (rows[0]?.pending !== null) await dataSource.query(`DELETE FROM pending_registrations`);
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
      'school_name',
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
        'CHK_users_school_name',
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

  it('accepts teacher, minimal student, undergraduate and both graduate profile shapes', async () => {
    await expect(insertUser(teacher())).resolves.toBeDefined();
    await expect(
      insertUser({
        ...teacher(),
        accountRole: AccountRole.Student,
      }),
    ).resolves.toBeDefined();
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

  it('reverts and reapplies the latest migration (AddSchoolNameAndParentAccountRole) on empty synthetic tables', async () => {
    // The authority for "which migration is latest" is the explicit `migrations` array in
    // `src/database/data-source-options.ts`, never a directory listing or a timestamp sort
    // (`ENGINEERING.md` §5: "no globs — every migration is registered on purpose"). Its last
    // entry is now `AddSchoolNameAndParentAccountRole1789125265639` (UYE-P1E). Between this
    // integration and the previous round, P1 PR-C's `AddGameRoundsLeaderboardIndex1788400000000`
    // landed on `dev` and now sits between `AddFavoriteRegionAndContinent` — the migration this
    // test exercised two PRs ago — and this migration, so BOTH are now earlier, settled
    // migrations rather than the one under test. This is the same living-test pattern
    // `province.e2e-spec.ts`/`country.e2e-spec.ts` name explicitly ("adding a migration means
    // editing" the lists that pin it); this file is the fourth pin of that class, and the one
    // that exercises the up/down path rather than the order.
    //
    // The new latest migration adds a NULLABLE `school_name` column to `users` AND
    // `pending_registrations`, widens both tables' `..._account_role` CHECK to admit `PARENT`,
    // and widens both `..._profile_shape` CHECKs to constrain `school_name` on every branch
    // except SECONDARY (`plan.md` §5.4). So the probe is a column-EXISTENCE check on
    // `users.school_name`/`pending_registrations.school_name`, plus the literal definition of
    // all four widened CHECKs (to tell the widened form `down()` restores apart from the
    // narrower original) — this migration's `up()` adds all of it and its `down()` removes it
    // again, safely, because this suite never seeds a `users`/`pending_registrations` row with a
    // non-null `school_name` (empty-table revert never trips the migration's own fail-closed
    // stray-row guard). `favorites.region_id`/`continent`/`CHK_favorites_exactly_one_target` and
    // `game_rounds`' `IDX_game_rounds_leaderboard` index — this test's own probes two and one PRs
    // ago, respectively — are now UNRELATED CONTROLS, settled by earlier migrations and expected
    // to stay fixed across this one's revert/reapply — proving `undoLastMigration()` unwinds only
    // the LATEST entry, never an earlier one.
    const relationSnapshot = async (): Promise<Record<string, string | null> | undefined> => {
      const rows = await dataSource.query<
        {
          users: string | null;
          sessions: string | null;
          verify_codes: string | null;
          pending: string | null;
          reset_tokens: string | null;
          video_progress: string | null;
          favorites: string | null;
          game_rounds: string | null;
          game_round_submit_rate_limits: string | null;
          measurements: string | null;
          regions: string | null;
          book_video_tags: string | null;
          book_video_questions: string | null;
        }[]
      >(`
        SELECT
          to_regclass('public.users')::text AS users,
          to_regclass('public.sessions')::text AS sessions,
          to_regclass('public.email_verification_codes')::text AS verify_codes,
          to_regclass('public.pending_registrations')::text AS pending,
          to_regclass('public.password_reset_tokens')::text AS reset_tokens,
          to_regclass('public.video_progress')::text AS video_progress,
          to_regclass('public.favorites')::text AS favorites,
          to_regclass('public.game_rounds')::text AS game_rounds,
          to_regclass('public.game_round_submit_rate_limits')::text AS game_round_submit_rate_limits,
          to_regclass('public.measurements')::text AS measurements,
          to_regclass('public.regions')::text AS regions,
          to_regclass('public.book_video_tags')::text AS book_video_tags,
          to_regclass('public.book_video_questions')::text AS book_video_questions
      `);
      return rows[0];
    };

    const expectedRelations = {
      users: 'users',
      sessions: 'sessions',
      verify_codes: null,
      pending: 'pending_registrations',
      reset_tokens: 'password_reset_tokens',
      video_progress: 'video_progress',
      favorites: 'favorites',
      game_rounds: 'game_rounds',
      game_round_submit_rate_limits: 'game_round_submit_rate_limits',
      measurements: 'measurements',
      regions: 'regions',
      book_video_tags: 'book_video_tags',
      book_video_questions: null,
    };

    // Table identity is unaffected by this migration in either direction — asserted BEFORE the
    // revert so a regression that made this migration touch table identity would be caught here
    // rather than laundered through the "unchanged" assertions below.
    expect(await relationSnapshot()).toEqual(expectedRelations);

    const rotationGraceColumn = async (): Promise<string | null> => {
      const rows = await dataSource.query<{ column_name: string }[]>(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sessions'
          AND column_name = 'rotation_grace_used_at'
      `);
      return rows[0]?.column_name ?? null;
    };
    expect(await rotationGraceColumn()).toBe('rotation_grace_used_at');

    // Unrelated control from the PREVIOUS migration: `order_no` already exists before this
    // migration ever runs, and must stay exactly as unaffected by this one as `regions` and
    // `measurements` are.
    const bookVideoOrderColumn = async (): Promise<string | null> => {
      const rows = await dataSource.query<{ column_name: string }[]>(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'book_videos'
          AND column_name = 'order_no'
      `);
      return rows[0]?.column_name ?? null;
    };
    expect(await bookVideoOrderColumn()).toBe('order_no');

    // Unrelated control from the PREVIOUS migration (P0 PR-2): the four generic-field columns
    // already exist before THIS migration ever runs, and must stay exactly as unaffected by it as
    // `book_videos.order_no`, `regions` and `measurements` are.
    const genericFieldColumns = async (): Promise<Record<string, string | null>> => {
      const rows = await dataSource.query<{ table_name: string; column_name: string }[]>(`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
            (table_name = 'book_videos' AND column_name IN ('title_tr', 'title_en'))
            OR (table_name = 'book_video_tags' AND column_name IN ('name_tr', 'name_en'))
          )
      `);
      const present = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
      return {
        'book_videos.title_tr': present.has('book_videos.title_tr') ? 'title_tr' : null,
        'book_videos.title_en': present.has('book_videos.title_en') ? 'title_en' : null,
        'book_video_tags.name_tr': present.has('book_video_tags.name_tr') ? 'name_tr' : null,
        'book_video_tags.name_en': present.has('book_video_tags.name_en') ? 'name_en' : null,
      };
    };
    const presentFieldColumns = {
      'book_videos.title_tr': 'title_tr',
      'book_videos.title_en': 'title_en',
      'book_video_tags.name_tr': 'name_tr',
      'book_video_tags.name_en': 'name_en',
    };
    expect(await genericFieldColumns()).toEqual(presentFieldColumns);

    // Unrelated control from an EARLIER migration (P0 PR-3, `DropBookDenemeCount` — this test's
    // OWN probe two PRs ago): `books.deneme_count` and its CHECK are already absent before THIS
    // migration ever runs, and must stay exactly as unaffected by it as `book_videos.order_no`,
    // `regions` and `measurements` are.
    const denemeCountColumn = async (): Promise<{
      column: string | null;
      check: string | null;
    }> => {
      const columnRows = await dataSource.query<{ column_name: string }[]>(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'books' AND column_name = 'deneme_count'
      `);
      const checkRows = await dataSource.query<{ conname: string }[]>(`
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'books'::regclass AND conname = 'CHK_books_deneme_count'
      `);
      return {
        column: columnRows[0]?.column_name ?? null,
        check: checkRows[0]?.conname ?? null,
      };
    };
    expect(await denemeCountColumn()).toEqual({ column: null, check: null });

    // Unrelated control from an EARLIER migration (P1 PR-A, `AddFavoriteRegionAndContinent` —
    // this test's own probe two PRs ago): the two columns it added and the four-branch
    // `num_nonnulls(...)` CHECK it installed already exist before THIS migration ever runs, and
    // must stay exactly as unaffected by it as `book_videos.order_no`, `regions` and
    // `measurements` are. The CHECK's literal definition text (not just its presence) is kept in
    // the assertion so a regression that silently reverted it back to the two-branch form would
    // be caught here even though this test no longer exercises that migration's own up/down.
    const favoritesTargetShape = async (): Promise<{
      regionId: string | null;
      continent: string | null;
      checkDefinition: string | null;
    }> => {
      const columnRows = await dataSource.query<{ column_name: string }[]>(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'favorites'
          AND column_name IN ('region_id', 'continent')
      `);
      const present = new Set(columnRows.map((row) => row.column_name));
      const checkRows = await dataSource.query<{ definition: string }[]>(`
        SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
        WHERE conrelid = 'favorites'::regclass AND conname = 'CHK_favorites_exactly_one_target'
      `);
      return {
        regionId: present.has('region_id') ? 'region_id' : null,
        continent: present.has('continent') ? 'continent' : null,
        checkDefinition: checkRows[0]?.definition ?? null,
      };
    };
    const favoritesControlShape = {
      regionId: 'region_id',
      continent: 'continent',
      checkDefinitionContainsNumNonnulls: true,
    };
    const assertFavoritesControlUnchanged = async (): Promise<void> => {
      const shape = await favoritesTargetShape();
      expect(shape.regionId).toBe(favoritesControlShape.regionId);
      expect(shape.continent).toBe(favoritesControlShape.continent);
      expect(shape.checkDefinition).toContain('num_nonnulls');
    };
    await assertFavoritesControlUnchanged();

    // Unrelated control from the PREVIOUS migration (P1 PR-C, `AddGameRoundsLeaderboardIndex` —
    // this test's own probe one PR ago): the plain index it created on `game_rounds` already
    // exists before THIS migration ever runs, and must stay exactly as unaffected by it as
    // `book_videos.order_no`, `regions`, `measurements` and the favourites shape are.
    const leaderboardIndexExists = async (): Promise<boolean> => {
      const rows = await dataSource.query<{ indexname: string }[]>(`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'game_rounds'
          AND indexname = 'IDX_game_rounds_leaderboard'
      `);
      return rows.length > 0;
    };
    expect(await leaderboardIndexExists()).toBe(true);

    // The columns and CHECKs THIS migration's up() adds/widens — the actual probe. `school_name`
    // is checked on BOTH tables (the migration touches `users` and `pending_registrations`
    // alike), and the CHECK definition text (not just presence) is what tells the widened form
    // `down()` restores apart from the original, narrower one.
    const authSchoolNameShape = async (): Promise<{
      usersSchoolName: string | null;
      pendingSchoolName: string | null;
      usersAccountRoleCheck: string | null;
      usersProfileShapeCheck: string | null;
      pendingAccountRoleCheck: string | null;
      pendingProfileShapeCheck: string | null;
    }> => {
      const columnRows = await dataSource.query<{ table_name: string; column_name: string }[]>(`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'school_name'
          AND table_name IN ('users', 'pending_registrations')
      `);
      const presentColumns = new Set(
        columnRows.map((row) => `${row.table_name}.${row.column_name}`),
      );
      const checkRows = await dataSource.query<{ conname: string; definition: string }[]>(`
        SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
        WHERE conname IN (
          'CHK_users_account_role', 'CHK_users_profile_shape',
          'CHK_pending_registrations_account_role', 'CHK_pending_registrations_profile_shape'
        )
      `);
      const checks = new Map(checkRows.map((row) => [row.conname, row.definition]));
      return {
        usersSchoolName: presentColumns.has('users.school_name') ? 'school_name' : null,
        pendingSchoolName: presentColumns.has('pending_registrations.school_name')
          ? 'school_name'
          : null,
        usersAccountRoleCheck: checks.get('CHK_users_account_role') ?? null,
        usersProfileShapeCheck: checks.get('CHK_users_profile_shape') ?? null,
        pendingAccountRoleCheck: checks.get('CHK_pending_registrations_account_role') ?? null,
        pendingProfileShapeCheck: checks.get('CHK_pending_registrations_profile_shape') ?? null,
      };
    };

    // `runMigrations()` in `beforeAll` already ran `up()`, so both columns exist and both CHECK
    // pairs are the widened form before this test touches anything.
    const shapeAfterUp = await authSchoolNameShape();
    expect(shapeAfterUp.usersSchoolName).toBe('school_name');
    expect(shapeAfterUp.pendingSchoolName).toBe('school_name');
    expect(shapeAfterUp.usersAccountRoleCheck).toContain('PARENT');
    expect(shapeAfterUp.usersProfileShapeCheck).toContain('school_name');
    expect(shapeAfterUp.pendingAccountRoleCheck).toContain('PARENT');
    expect(shapeAfterUp.pendingProfileShapeCheck).toContain('school_name');

    await dataSource.undoLastMigration();

    // The revert removes `users.school_name`/`pending_registrations.school_name` and restores the
    // original, narrower CHECKs on both tables — `down()` succeeds here because this suite never
    // seeds a row with a non-null `school_name` and never seeds a `PARENT` account, so neither of
    // the migration's own fail-closed guards (the explicit stray-`school_name` guard, the natural
    // CHECK-violation guard on a live `PARENT` row) finds anything to refuse. Every table, the
    // previous migrations' own columns, and the unrelated `sessions.rotation_grace_used_at`,
    // `book_videos.order_no`, `books.deneme_count`, favourites region/continent and game-rounds
    // leaderboard-index controls, all stay intact.
    expect(await relationSnapshot()).toEqual(expectedRelations);
    expect(await rotationGraceColumn()).toBe('rotation_grace_used_at');
    expect(await bookVideoOrderColumn()).toBe('order_no');
    expect(await genericFieldColumns()).toEqual(presentFieldColumns);
    expect(await denemeCountColumn()).toEqual({ column: null, check: null });
    await assertFavoritesControlUnchanged();
    expect(await leaderboardIndexExists()).toBe(true);
    const shapeAfterDown = await authSchoolNameShape();
    expect(shapeAfterDown.usersSchoolName).toBeNull();
    expect(shapeAfterDown.pendingSchoolName).toBeNull();
    expect(shapeAfterDown.usersAccountRoleCheck).not.toContain('PARENT');
    expect(shapeAfterDown.usersProfileShapeCheck).not.toContain('school_name');
    expect(shapeAfterDown.pendingAccountRoleCheck).not.toContain('PARENT');
    expect(shapeAfterDown.pendingProfileShapeCheck).not.toContain('school_name');
    // SCH170-NEW-M2: `up()` also widens the PROFILE-SHAPE check's own role predicate (not only
    // `..._account_role`) to `IN ('STUDENT', 'PARENT')` — the four assertions above never probed
    // that predicate for `PARENT`, only for `school_name`.
    expect(shapeAfterDown.usersProfileShapeCheck).not.toContain('PARENT');
    expect(shapeAfterDown.pendingProfileShapeCheck).not.toContain('PARENT');

    await dataSource.runMigrations();

    // Reapply adds the columns and widens all four CHECKs again, returning to the ORIGINAL
    // (post-`up()`) state.
    expect(await relationSnapshot()).toEqual(expectedRelations);
    expect(await rotationGraceColumn()).toBe('rotation_grace_used_at');
    expect(await bookVideoOrderColumn()).toBe('order_no');
    expect(await genericFieldColumns()).toEqual(presentFieldColumns);
    expect(await denemeCountColumn()).toEqual({ column: null, check: null });
    await assertFavoritesControlUnchanged();
    expect(await leaderboardIndexExists()).toBe(true);
    const shapeAfterReapply = await authSchoolNameShape();
    expect(shapeAfterReapply.usersSchoolName).toBe('school_name');
    expect(shapeAfterReapply.pendingSchoolName).toBe('school_name');
    expect(shapeAfterReapply.usersAccountRoleCheck).toContain('PARENT');
    expect(shapeAfterReapply.usersProfileShapeCheck).toContain('school_name');
    expect(shapeAfterReapply.pendingAccountRoleCheck).toContain('PARENT');
    expect(shapeAfterReapply.pendingProfileShapeCheck).toContain('school_name');
  });

  describe('migration down() — fail-closed once a non-null school_name value exists (SEC170-NEW-I1/SCH170-NEW-M1)', () => {
    it('refuses to revert once a school_name value exists, and drops nothing', async () => {
      await insertUser(secondary({ schoolName: 'Synthetic Guard Lisesi' }));

      await expect(dataSource.undoLastMigration()).rejects.toThrow(
        /AddSchoolNameAndParentAccountRole\.down\(\) refuses/,
      );

      const columns = await dataSource.query<{ column_name: string }[]>(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'school_name'
      `);
      expect(columns).toHaveLength(1);
    });

    // The guard sums non-null `school_name` rows across BOTH `users` AND `pending_registrations`
    // in one query. The case above seeds only `users` — a regression that dropped or broke the
    // `pending_registrations` half of that sum would still pass it. The realistic hazard is
    // exactly a candidate that WAS never verified, so its `school_name` never reached `users` at
    // all; this case seeds `pending_registrations` alone (no `users` row at all) to prove that
    // half independently, via the same `PendingRegistration` repository `auth-security.e2e-spec.ts`
    // and `auth-endpoints.e2e-spec.ts` already use for direct candidate fixtures.
    it('refuses to revert once a school_name value exists only on a pending registration, and drops nothing', async () => {
      await dataSource.getRepository(PendingRegistration).insert({
        email: 'synthetic.pending.guard@example.test',
        passwordHash: SYNTHETIC_PASSWORD_HASH,
        firstName: 'Synthetic',
        lastName: 'PendingGuard',
        phone: '+905000000098',
        accountRole: AccountRole.Student,
        educationLevel: EducationLevel.Secondary,
        gradeLevel: GradeLevel.Grade12,
        studyStream: StudyStream.Sayisal,
        universityName: null,
        departmentName: null,
        schoolName: 'Synthetic Pending Guard Lisesi',
        districtId,
        locale: 'tr',
        codeHash: Buffer.alloc(32, 7),
        expiresAt: new Date(Date.now() + 10 * 60_000),
        attemptCount: 0,
      });

      await expect(dataSource.undoLastMigration()).rejects.toThrow(
        /AddSchoolNameAndParentAccountRole\.down\(\) refuses/,
      );

      const columns = await dataSource.query<{ column_name: string }[]>(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pending_registrations'
          AND column_name = 'school_name'
      `);
      expect(columns).toHaveLength(1);
    });
  });
});
