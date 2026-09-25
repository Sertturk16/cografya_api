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
  InstitutionType,
  StudyStream,
  TeacherSubject,
} from '../src/auth/account.types';
import { AccessTokenService } from '../src/auth/access-token.service';
import { AUTH_ERROR_KEYS } from '../src/auth/auth-error-keys';
import { PROFILE_SHAPE_MESSAGE } from '../src/auth/dto/profile-shape.rule';
import { User } from '../src/auth/entities/user.entity';
import { PasswordHasherService } from '../src/auth/password-hasher.service';
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
    accountRole: AccountRole;
    educationLevel: EducationLevel | null;
    gradeLevel: GradeLevel | null;
    studyStream: StudyStream | null;
    universityName: string | null;
    departmentName: string | null;
    schoolName: string | null;
    teacherSubject: TeacherSubject | null;
    institutionType: InstitutionType | null;
  }

  const CLEARED_AXIS: Omit<AxisPayload, 'accountRole' | 'teacherSubject' | 'institutionType'> = {
    educationLevel: null,
    gradeLevel: null,
    studyStream: null,
    universityName: null,
    departmentName: null,
    schoolName: null,
  };

  const axis = (accountRole: AccountRole, overrides: Partial<AxisPayload> = {}): AxisPayload => ({
    ...CLEARED_AXIS,
    teacherSubject: null,
    institutionType: null,
    accountRole,
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
        axis(AccountRole.Student, {
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
        axis(AccountRole.Student, {
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
          ...axis(AccountRole.Student, {
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
        schoolName: null,
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
        axis(AccountRole.Student, {
          educationLevel: EducationLevel.Secondary,
          gradeLevel: GradeLevel.Grade12,
          studyStream: StudyStream.Sayisal,
          schoolName: '  Kadıköy Anadolu Lisesi  ',
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
      schoolName: 'Kadıköy Anadolu Lisesi',
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
    expect(dbRow.schoolName).toBe('Kadıköy Anadolu Lisesi');
  });

  // P-B2: Teacher role branch
  it('P-B2: teacher GET reports isComplete: false until branch and institution are set', async () => {
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
      teacherSubject: null,
      institutionType: null,
      isComplete: false,
    });

    // All-null teacher PUT (no branch/institution yet) is accepted but incomplete.
    const putStillIncomplete = await request(app.getHttpServer())
      .put('/api/auth/profile')
      .set(bearer(tokenTeacher))
      .send(axis(AccountRole.Teacher));
    expect(putStillIncomplete.status).toBe(200);
    expect(putStillIncomplete.body.isComplete).toBe(false);

    // Setting both teacher fields completes the profile.
    const putComplete = await request(app.getHttpServer())
      .put('/api/auth/profile')
      .set(bearer(tokenTeacher))
      .send(
        axis(AccountRole.Teacher, {
          teacherSubject: TeacherSubject.Cografya,
          institutionType: InstitutionType.DevletOkulu,
        }),
      );
    expect(putComplete.status).toBe(200);
    expect(putComplete.body.isComplete).toBe(true);

    // Attempting to supply education fields for teacher returns 400
    const putBad = await request(app.getHttpServer())
      .put('/api/auth/profile')
      .set(bearer(tokenTeacher))
      .send(
        axis(AccountRole.Teacher, {
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
        axis(AccountRole.Student, {
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
      .send(axis(AccountRole.Student, { educationLevel: EducationLevel.Secondary })); // Missing gradeLevel and studyStream

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
        axis(AccountRole.Student, {
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
  // ── T-061: the personal block and the signed-in password change ────────────────────────

  // T61-A1: the personal block is published by GET /api/auth/profile, resolved through the
  // district → province join rather than stored on `users`.
  it('T61-A1: GET /api/auth/profile carries the personal block and the resolved province', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/profile').set(bearer(tokenA));

    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('Profile');
    expect(res.body.lastName).toBe('Test');
    expect(res.body.email).toBe('student-a@example.test');
    expect(res.body.phone).toBe('+905000000010');
    expect(res.body.provincePlateCode).toBe('34');
    expect(res.body.provinceName).toBe('İstanbul');
    expect(typeof res.body.districtName).toBe('string');
    expect(res.body.districtName.length).toBeGreaterThan(0);
    expect(typeof res.body.createdAt).toBe('string');
    // The read is behind the no-store middleware like every other PII route here.
    expect(res.headers['cache-control']).toBe('no-store');
  });

  // T61-A2: the personal block never leaks the hash, on any route that returns a profile.
  it('T61-A2: no profile response carries passwordHash under any spelling', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/profile').set(bearer(tokenA));

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('password_hash');
    expect(serialized).not.toContain('$argon2');
  });

  // T61-A3: PUT /api/auth/account is guarded and no-store, like its profile sibling.
  it('T61-A3: rejects unauthenticated PUT /api/auth/account with 401 and no-store', async () => {
    const res = await request(app.getHttpServer()).put('/api/auth/account').send({
      firstName: 'Ayşe',
      lastName: 'Yılmaz',
      phone: '+905551112233',
      provincePlateCode: '34',
      districtId: studentA.districtId,
    });

    expect(res.status).toBe(401);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  // T61-A4: the route takes the subject from the TOKEN. A body naming another user's id is
  // rejected outright by the global pipe's forbidNonWhitelisted, so there is no id to honour.
  it('T61-A4: a body carrying id or email is a 400, not a silent mass assignment', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/auth/account')
      .set(bearer(tokenA))
      .send({
        id: studentB.id,
        email: 'attacker@example.test',
        firstName: 'Ayşe',
        lastName: 'Yılmaz',
        phone: '+905551112233',
        provincePlateCode: '34',
        districtId: studentA.districtId,
      });

    expect(res.status).toBe(400);

    const untouched = await dataSource.getRepository(User).findOneByOrFail({ id: studentB.id });
    expect(untouched.email).toBe('student-b@example.test');
  });

  // T61-A5: a district that exists but belongs to a DIFFERENT province is refused, and the
  // refusal happens before any write.
  it('T61-A5: refuses a districtId outside the named province and writes nothing', async () => {
    const ankara = await dataSource
      .getRepository(Province)
      .findOneOrFail({ where: { plateCode: '06' } });
    const ankaraDistrict = await dataSource
      .getRepository(District)
      .findOneOrFail({ where: { provinceId: ankara.id } });

    const before = await dataSource.getRepository(User).findOneByOrFail({ id: studentA.id });

    const res = await request(app.getHttpServer())
      .put('/api/auth/account')
      .set(bearer(tokenA))
      .send({
        firstName: 'Değişti',
        lastName: 'Değişti',
        phone: '+905551112233',
        provincePlateCode: '34',
        districtId: ankaraDistrict.id,
      });

    expect(res.status).toBe(400);

    const after = await dataSource.getRepository(User).findOneByOrFail({ id: studentA.id });
    expect(after.firstName).toBe(before.firstName);
    expect(after.districtId).toBe(before.districtId);
  });

  // T61-A6: a valid replacement lands, canonicalises the phone, and answers with the province
  // the NEW district resolves to — a value the request never sent.
  it('T61-A6: replaces the personal block and canonicalises the phone', async () => {
    const ankara = await dataSource
      .getRepository(Province)
      .findOneOrFail({ where: { plateCode: '06' } });
    const ankaraDistrict = await dataSource
      .getRepository(District)
      .findOneOrFail({ where: { provinceId: ankara.id } });

    const res = await request(app.getHttpServer())
      .put('/api/auth/account')
      .set(bearer(tokenA))
      .send({
        firstName: '  Ayşe  ',
        lastName: 'Yılmaz',
        phone: '0555 111 22 33',
        provincePlateCode: '06',
        districtId: ankaraDistrict.id,
      });

    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('Ayşe');
    expect(res.body.phone).toBe('+905551112233');
    expect(res.body.provincePlateCode).toBe('06');
    expect(res.body.provinceName).toBe('Ankara');

    const persisted = await dataSource.getRepository(User).findOneByOrFail({ id: studentA.id });
    expect(persisted.firstName).toBe('Ayşe');
    expect(persisted.districtId).toBe(ankaraDistrict.id);
    // accountRole is not a field on this route and could not have moved.
    expect(persisted.accountRole).toBe(AccountRole.Student);
  });

  // T61-A7: the education block is untouched by a personal-block write — the two endpoints
  // are separate precisely so one cannot clear the other.
  it('T61-A7: writing the personal block leaves the education block alone', async () => {
    const before = await dataSource.getRepository(User).findOneByOrFail({ id: studentLegacy.id });

    const res = await request(app.getHttpServer())
      .put('/api/auth/account')
      .set(bearer(tokenLegacy))
      .send({
        firstName: 'Legacy',
        lastName: 'Renamed',
        phone: '+905551119988',
        provincePlateCode: '34',
        districtId: before.districtId,
      });

    expect(res.status).toBe(200);
    // Compared against the row as it stood a moment ago, NOT against the seed: earlier cases
    // in this file deliberately rewrite this user's education block, so a hardcoded seed value
    // would be asserting the order tests happen to run in rather than the property under test.
    expect(res.body.educationLevel).toBe(before.educationLevel);
    expect(res.body.universityName).toBe(before.universityName);

    const after = await dataSource.getRepository(User).findOneByOrFail({ id: studentLegacy.id });
    expect(after.educationLevel).toBe(before.educationLevel);
    expect(after.universityName).toBe(before.universityName);
    expect(after.departmentName).toBe(before.departmentName);
  });

  // T61-P1: the password route is guarded and no-store.
  it('T61-P1: rejects an unauthenticated password change with 401 and no-store', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/password/change')
      .send({ currentPassword: 'Whatever1', newPassword: 'Another1' });

    expect(res.status).toBe(401);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  describe('T61-P: password change against a real hash', () => {
    let changer: User;
    let changerToken: string;
    const ORIGINAL = 'Original1';
    const REPLACEMENT = 'Replacement2';

    beforeAll(async () => {
      const hasher = app.get(PasswordHasherService);
      const istanbul = await dataSource
        .getRepository(Province)
        .findOneOrFail({ where: { plateCode: '34' } });
      const district = await dataSource
        .getRepository(District)
        .findOneOrFail({ where: { provinceId: istanbul.id } });

      changer = await createUser('changer@example.test', district.id, AccountRole.Student, {
        passwordHash: await hasher.hash(ORIGINAL),
      });
      changerToken = await mintFor(changer);
    }, 60_000);

    it('T61-P2: refuses a wrong current password and changes nothing', async () => {
      const before = await dataSource.getRepository(User).findOneOrFail({
        where: { id: changer.id },
        select: { id: true, tokenVersion: true },
      });

      const res = await request(app.getHttpServer())
        .post('/api/auth/password/change')
        .set(bearer(changerToken))
        .send({ currentPassword: 'NotTheOne9', newPassword: REPLACEMENT });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe(AUTH_ERROR_KEYS.passwordCurrentInvalid);

      const after = await dataSource.getRepository(User).findOneOrFail({
        where: { id: changer.id },
        select: { id: true, tokenVersion: true },
      });
      expect(after.tokenVersion).toBe(before.tokenVersion);
    });

    it('T61-P3: refuses a new password identical to the current one', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/password/change')
        .set(bearer(changerToken))
        .send({ currentPassword: ORIGINAL, newPassword: ORIGINAL });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe(AUTH_ERROR_KEYS.passwordUnchanged);
    });

    it('T61-P4: refuses a new password the policy rejects', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/password/change')
        .set(bearer(changerToken))
        .send({ currentPassword: ORIGINAL, newPassword: 'short' });

      expect(res.status).toBe(400);
    });

    it('T61-P5: succeeds, kills the OLD access token, and hands back a working one', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/password/change')
        .set(bearer(changerToken))
        .send({ currentPassword: ORIGINAL, newPassword: REPLACEMENT });

      expect(res.status).toBe(200);
      expect(typeof res.body.accessToken).toBe('string');
      expect(typeof res.body.refreshToken).toBe('string');

      // The token the caller arrived with was minted against the pre-bump tokenVersion.
      const withOldToken = await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set(bearer(changerToken));
      expect(withOldToken.status).toBe(401);

      // The one the change handed back works — the caller is not signed out by their own
      // password change, which is the whole difference from the reset flow.
      const withNewToken = await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set(bearer(res.body.accessToken as string));
      expect(withNewToken.status).toBe(200);
      expect(withNewToken.body.email).toBe('changer@example.test');
    });

    it('T61-P6: the old password no longer logs in and the new one does', async () => {
      const withOld = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'changer@example.test', password: ORIGINAL });
      expect(withOld.status).toBe(401);

      const withNew = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'changer@example.test', password: REPLACEMENT });
      expect(withNew.status).toBe(200);
      expect(typeof withNew.body.accessToken).toBe('string');
    });
  });
});
