import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource, type Repository } from 'typeorm';
import {
  AccountRole,
  AccountStatus,
  EducationLevel,
  GradeLevel,
  StudyStream,
} from '../src/auth/account.types';
import { AccessTokenService } from '../src/auth/access-token.service';
import { AUTH_ERROR_KEYS } from '../src/auth/auth-error-keys';
import { PROFILE_SHAPE_MESSAGE } from '../src/auth/dto/profile-shape.rule';
import { User } from '../src/auth/entities/user.entity';
import { ProfileService } from '../src/auth/profile.service';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { seedGeography } from '../src/database/seeds/seed-geography';
import { seedReference } from '../src/database/seeds/seed-reference';
import { Province } from '../src/province/entities/province.entity';
import { District } from '../src/reference/entities/district.entity';
import { DEPARTMENTS } from '../src/reference/department.data';
import { UNIVERSITIES } from '../src/reference/university.data';

/**
 * `DEC2026-09-03a-MD1-GAP` e2e — `GET` and `PUT /api/auth/profile` against a real Postgres container
 * (`plan-api.md` §5.6, `DEC 2026-09-04a` md.1).
 *
 * Asserting authorization, cross-user isolation, mass-assignment guards, destructive-write controls,
 * and profile matrix persistence.
 */
describe('Auth Profile (e2e, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;

  let studentA: User;
  let studentB: User;
  let teacher: User;
  let studentLegacy: User;

  let tokenA: string;
  let tokenB: string;
  let tokenTeacher: string;
  let tokenLegacy: string;

  interface AxisPayload {
    educationLevel: EducationLevel | null;
    gradeLevel: GradeLevel | null;
    studyStream: StudyStream | null;
    universityName: string | null;
    departmentName: string | null;
  }

  const CLEARED_AXIS: AxisPayload = {
    educationLevel: null,
    gradeLevel: null,
    studyStream: null,
    universityName: null,
    departmentName: null,
  };

  const axis = (overrides: Partial<AxisPayload> = {}): AxisPayload => ({
    ...CLEARED_AXIS,
    ...overrides,
  });

  function bearer(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }

  async function createUser(
    email: string,
    districtId: string,
    role: AccountRole,
    initialValues: Partial<User> = {},
  ): Promise<User> {
    const repo = dataSource.getRepository(User);
    return repo.save(
      repo.create({
        firstName: 'Profile',
        lastName: 'Test',
        phone: '+905000000010',
        email,
        passwordHash:
          '$argon2id$v=19$m=19456,p=1,t=2$APrKX34k6VE7WGm0QyxNUA$fUFGautIsXjwaF9PfALc5EeetF5UHJq43ElafSQOVPM',
        accountRole: role,
        educationLevel: null,
        gradeLevel: null,
        studyStream: null,
        universityName: null,
        departmentName: null,
        districtId,
        status: AccountStatus.Active,
        emailVerifiedAt: new Date(),
        ...initialValues,
      }),
    );
  }

  async function mintFor(user: User): Promise<string> {
    const accessTokens = app.get(AccessTokenService);
    return accessTokens.mint(user.id, user.tokenVersion);
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();
    process.env.DATABASE_URL = url;
    process.env.WEB_ORIGIN = 'http://localhost:3000';

    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    await dataSource.runMigrations();

    await seedGeography(dataSource);
    await seedReference(dataSource);

    const istanbul = await dataSource
      .getRepository(Province)
      .findOneOrFail({ where: { plateCode: '34' } });
    const district = await dataSource
      .getRepository(District)
      .findOneOrFail({ where: { provinceId: istanbul.id } });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appModule = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [appModule.AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyGlobalPrefix(app);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    studentA = await createUser('student-a@example.test', district.id, AccountRole.Student);
    studentB = await createUser('student-b@example.test', district.id, AccountRole.Student);
    teacher = await createUser('teacher@example.test', district.id, AccountRole.Teacher);
    studentLegacy = await createUser(
      'student-legacy@example.test',
      district.id,
      AccountRole.Student,
      {
        educationLevel: EducationLevel.Undergraduate,
        universityName: UNIVERSITIES[0]!.nameTr,
        departmentName: DEPARTMENTS[0]!.nameTr,
      },
    );

    tokenA = await mintFor(studentA);
    tokenB = await mintFor(studentB);
    tokenTeacher = await mintFor(teacher);
    tokenLegacy = await mintFor(studentLegacy);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  // P-A1: GET /api/auth/profile with no Authorization -> 401 + Cache-Control: no-store
  it('P-A1: rejects unauthenticated GET /api/auth/profile with 401 and sets Cache-Control: no-store', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/profile');
    expect(res.status).toBe(401);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  // P-A2: PUT /api/auth/profile with no Authorization -> 401 + Cache-Control: no-store
  it('P-A2: rejects unauthenticated PUT /api/auth/profile with 401 and sets Cache-Control: no-store', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/auth/profile')
      .send(
        axis({
          educationLevel: EducationLevel.Secondary,
          gradeLevel: GradeLevel.Grade12,
          studyStream: StudyStream.Sayisal,
        }),
      );
    expect(res.status).toBe(401);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  // P-A3: Cross-user isolation
  it('P-A3: studentA update leaves studentB entirely unchanged in both database and GET', async () => {
    const putRes = await request(app.getHttpServer())
      .put('/api/auth/profile')
      .set(bearer(tokenA))
      .send(
        axis({
          educationLevel: EducationLevel.Secondary,
          gradeLevel: GradeLevel.Grade12,
          studyStream: StudyStream.Sayisal,
        }),
      );
    expect(putRes.status).toBe(200);

    const userBRow = await dataSource
      .getRepository(User)
      .findOneOrFail({ where: { id: studentB.id } });
    expect(userBRow.educationLevel).toBeNull();
    expect(userBRow.gradeLevel).toBeNull();
    expect(userBRow.studyStream).toBeNull();

    const getBRes = await request(app.getHttpServer()).get('/api/auth/profile').set(bearer(tokenB));
    expect(getBRes.status).toBe(200);
    expect(getBRes.body.educationLevel).toBeNull();
    expect(getBRes.body.isComplete).toBe(false);
  });

  // P-A4: Mass-assignment protection
  it('P-A4: rejects forbidden properties on PUT and leaves persisted identity/security columns unchanged', async () => {
    const forbiddenProps = [
      { accountRole: 'TEACHER' },
      { email: 'hacked@example.test' },
      { status: 'SUSPENDED' },
      { tokenVersion: 999 },
      { passwordHash: 'newhash' },
      { userId: 'other-user-id' },
    ];

    for (const forbidden of forbiddenProps) {
      const res = await request(app.getHttpServer())
        .put('/api/auth/profile')
        .set(bearer(tokenA))
        .send({
          ...axis({
            educationLevel: EducationLevel.Secondary,
            gradeLevel: GradeLevel.Grade12,
            studyStream: StudyStream.Sayisal,
          }),
          ...forbidden,
        });

      expect(res.status).toBe(400);
    }

    const rowAfter = await dataSource
      .getRepository(User)
      .findOneOrFail({ where: { id: studentA.id } });
    expect(rowAfter.accountRole).toBe(AccountRole.Student);
    expect(rowAfter.email).toBe('student-a@example.test');
    expect(rowAfter.status).toBe(AccountStatus.Active);
  });

  // P-A5: Destructive-data control (empty or partial body 400s without mutating row)
  it('P-A5: rejects empty {} or partial payload with 400 and preserves existing profile data', async () => {
    // Deliberately bypassing axis() helper to send empty and partial bodies
    const emptyRes = await request(app.getHttpServer())
      .put('/api/auth/profile')
      .set(bearer(tokenLegacy))
      .send({});
    expect(emptyRes.status).toBe(400);
    const emptyMsg = Array.isArray(emptyRes.body?.message)
      ? emptyRes.body.message.join(' ')
      : String(emptyRes.body?.message);
    expect(emptyMsg).toMatch(/educationLevel/);

    const partialRes = await request(app.getHttpServer())
      .put('/api/auth/profile')
      .set(bearer(tokenLegacy))
      .send({ educationLevel: null });
    expect(partialRes.status).toBe(400);
    const partialMsg = Array.isArray(partialRes.body?.message)
      ? partialRes.body.message.join(' ')
      : String(partialRes.body?.message);
    expect(partialMsg).toMatch(/gradeLevel|studyStream|universityName|departmentName/);

    // Row must be UNCHANGED
    const row = await dataSource
      .getRepository(User)
      .findOneOrFail({ where: { id: studentLegacy.id } });
    expect(row.educationLevel).toBe(EducationLevel.Undergraduate);
    expect(row.universityName).toBe(UNIVERSITIES[0]!.nameTr);
    expect(row.departmentName).toBe(DEPARTMENTS[0]!.nameTr);
  });

  // P-B1: Student happy path round-trip
  it('P-B1: studentA round-trip reads nulls, persists secondary profile, and re-reads persisted state', async () => {
    // Reset studentA to nulls first
    await dataSource.getRepository(User).update(
      { id: studentA.id },
      {
        educationLevel: null,
        gradeLevel: null,
        studyStream: null,
        universityName: null,
        departmentName: null,
      },
    );

    const get1 = await request(app.getHttpServer()).get('/api/auth/profile').set(bearer(tokenA));
    expect(get1.status).toBe(200);
    expect(get1.body.accountRole).toBe('STUDENT');
    expect(get1.body.educationLevel).toBeNull();
    expect(get1.body.isComplete).toBe(false);

    const putRes = await request(app.getHttpServer())
      .put('/api/auth/profile')
      .set(bearer(tokenA))
      .send(
        axis({
          educationLevel: EducationLevel.Secondary,
          gradeLevel: GradeLevel.Grade12,
          studyStream: StudyStream.Sayisal,
        }),
      );
    expect(putRes.status).toBe(200);
    expect(putRes.body).toMatchObject({
      accountRole: 'STUDENT',
      educationLevel: 'SECONDARY',
      gradeLevel: 'GRADE_12',
      studyStream: 'SAYISAL',
      universityName: null,
      departmentName: null,
      isComplete: true,
    });

    const get2 = await request(app.getHttpServer()).get('/api/auth/profile').set(bearer(tokenA));
    expect(get2.status).toBe(200);
    expect(get2.body).toEqual(putRes.body);

    const dbRow = await dataSource
      .getRepository(User)
      .findOneOrFail({ where: { id: studentA.id } });
    expect(dbRow.educationLevel).toBe(EducationLevel.Secondary);
    expect(dbRow.gradeLevel).toBe(GradeLevel.Grade12);
    expect(dbRow.studyStream).toBe(StudyStream.Sayisal);
  });

  // P-B2: Teacher role branch
  it('P-B2: teacher GET reports isComplete: true, all-null PUT is accepted, and education fields 400', async () => {
    const getRes = await request(app.getHttpServer())
      .get('/api/auth/profile')
      .set(bearer(tokenTeacher));
    expect(getRes.status).toBe(200);
    expect(getRes.body).toMatchObject({
      accountRole: 'TEACHER',
      educationLevel: null,
      gradeLevel: null,
      studyStream: null,
      universityName: null,
      departmentName: null,
      isComplete: true,
    });

    // Valid teacher no-op PUT carries explicit all-null axis()
    const putOk = await request(app.getHttpServer())
      .put('/api/auth/profile')
      .set(bearer(tokenTeacher))
      .send(axis());
    expect(putOk.status).toBe(200);
    expect(putOk.body.isComplete).toBe(true);

    // Attempting to supply education fields for teacher returns 400
    const putBad = await request(app.getHttpServer())
      .put('/api/auth/profile')
      .set(bearer(tokenTeacher))
      .send(
        axis({
          educationLevel: EducationLevel.Secondary,
          gradeLevel: GradeLevel.Grade9,
          studyStream: StudyStream.Sayisal,
        }),
      );
    expect(putBad.status).toBe(400);
  });

  // P-B3: Branch switch replaces and clears previous branch's values
  it('P-B3: studentLegacy replaces UNDERGRADUATE with SECONDARY, clearing university and department', async () => {
    const getBefore = await request(app.getHttpServer())
      .get('/api/auth/profile')
      .set(bearer(tokenLegacy));
    expect(getBefore.status).toBe(200);
    expect(getBefore.body.educationLevel).toBe('UNDERGRADUATE');
    expect(getBefore.body.universityName).toBe(UNIVERSITIES[0]!.nameTr);
    expect(getBefore.body.isComplete).toBe(true);

    const putRes = await request(app.getHttpServer())
      .put('/api/auth/profile')
      .set(bearer(tokenLegacy))
      .send(
        axis({
          educationLevel: EducationLevel.Secondary,
          gradeLevel: GradeLevel.Grade11,
          studyStream: StudyStream.Sozel,
        }),
      );
    expect(putRes.status).toBe(200);
    expect(putRes.body.educationLevel).toBe('SECONDARY');
    expect(putRes.body.gradeLevel).toBe('GRADE_11');
    expect(putRes.body.studyStream).toBe('SOZEL');
    expect(putRes.body.universityName).toBeNull();
    expect(putRes.body.departmentName).toBeNull();
    expect(putRes.body.isComplete).toBe(true);

    const row = await dataSource
      .getRepository(User)
      .findOneOrFail({ where: { id: studentLegacy.id } });
    expect(row.educationLevel).toBe(EducationLevel.Secondary);
    expect(row.gradeLevel).toBe(GradeLevel.Grade11);
    expect(row.studyStream).toBe(StudyStream.Sozel);
    expect(row.universityName).toBeNull();
    expect(row.departmentName).toBeNull();
  });

  // P-B4: Shape invalidity 400 with PROFILE_SHAPE_MESSAGE
  it('P-B4: returns 400 with PROFILE_SHAPE_MESSAGE when candidate violates matrix for caller role', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/auth/profile')
      .set(bearer(tokenA))
      .send(axis({ educationLevel: EducationLevel.Secondary })); // Missing gradeLevel and studyStream

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(PROFILE_SHAPE_MESSAGE);
  });

  // SFH156-I1: Zero rows affected throws 401 unauthenticated
  it('SFH156-I1: returns 401 unauthenticated when update affects 0 rows', async () => {
    const profileService = app.get(ProfileService);
    const usersRepo = (profileService as unknown as { users: Repository<User> }).users;
    const updateSpy = jest.spyOn(usersRepo, 'update').mockResolvedValueOnce({
      affected: 0,
      raw: [],
      generatedMaps: [],
    });

    const res = await request(app.getHttpServer())
      .put('/api/auth/profile')
      .set(bearer(tokenA))
      .send(
        axis({
          educationLevel: EducationLevel.Secondary,
          gradeLevel: GradeLevel.Grade12,
          studyStream: StudyStream.Sayisal,
        }),
      );

    expect(updateSpy).toHaveBeenCalled();
    expect(res.status).toBe(401);
    expect(res.body.message).toBe(AUTH_ERROR_KEYS.unauthenticated);
    updateSpy.mockRestore();
  });
});
