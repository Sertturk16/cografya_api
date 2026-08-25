import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { HttpStatus, ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AccountStatus } from '../src/auth/account.types';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { PendingRegistration } from '../src/auth/entities/pending-registration.entity';
import { PasswordResetToken } from '../src/auth/entities/password-reset-token.entity';
import { Session } from '../src/auth/entities/session.entity';
import { User } from '../src/auth/entities/user.entity';
import { MAILER_PORT } from '../src/auth/mail/mailer.port';
import { seedGeography } from '../src/database/seeds/seed-geography';
import { seedReference } from '../src/database/seeds/seed-reference';
import { District } from '../src/reference/entities/district.entity';
import { DEPARTMENTS } from '../src/reference/department.data';
import { Province } from '../src/province/entities/province.entity';
import { UNIVERSITIES } from '../src/reference/university.data';
import { RecordingMailer } from './support/recording-mailer';

/**
 * E2E-N1..N9 (D16 moves N10, the sözleşme guard, to the UNIT lane as `AUTH-C1`) — happy paths,
 * DTO/validation wiring, and the guard's 200/401 boundary, against a REAL Postgres.
 *
 * **`register` no longer creates the account** (`SEC136-C1`): it creates a
 * `pending_registrations` candidate, and `verify-email` materializes the `users` row from the
 * candidate whose code was presented. Every case below that used to read `users` straight after a
 * register now walks the code, which is also what makes the profile-matrix cases (N7) assert the
 * thing that actually matters — that the profile the caller SUBMITTED is the profile that becomes
 * the account.
 *
 * **Register call budget, stated because it is a real constraint (§9.1, Y5):** IP-axis
 * `@Throttle` cannot be bypassed by the trusted-client token on ANY POST route
 * (`TrustedClientThrottlerGuard.shouldSkip` restricts the exemption to GET/HEAD by design), and
 * `register`'s own ceiling is 10/hour. This file makes exactly 9 `/register` calls across every
 * `describe` block — under the ceiling with one call of headroom. Exhaustive profile-matrix
 * negatives already live at the unit level (`profile-shape.rule.spec.ts`, U-PS1); this file
 * proves the WIRING (one representative negative per concern), not the matrix itself again.
 */
describe('Auth endpoints — happy paths + DTO/validation + guard wiring (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let mailer: RecordingMailer;

  let istanbulDistrictId: string;
  let ankaraDistrictId: string;
  let university: string;
  let department: string;

  let emailSequence = 0;
  const nextEmail = (): string => {
    emailSequence += 1;
    return `n-flow-${emailSequence}@example.test`;
  };

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
    const ankara = await dataSource
      .getRepository(Province)
      .findOneOrFail({ where: { plateCode: '06' } });
    const istanbulDistrict = await dataSource
      .getRepository(District)
      .findOneOrFail({ where: { provinceId: istanbul.id } });
    const ankaraDistrict = await dataSource
      .getRepository(District)
      .findOneOrFail({ where: { provinceId: ankara.id } });
    istanbulDistrictId = istanbulDistrict.id;
    ankaraDistrictId = ankaraDistrict.id;

    const universityRow = UNIVERSITIES[0];
    const departmentRow = DEPARTMENTS[0];
    if (!universityRow || !departmentRow) throw new Error('UNIVERSITIES/DEPARTMENTS is empty');
    university = universityRow.nameTr;
    department = departmentRow.nameTr;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appModule = require('../src/app.module') as typeof import('../src/app.module');
    mailer = new RecordingMailer();
    const moduleRef = await Test.createTestingModule({ imports: [appModule.AppModule] })
      .overrideProvider(MAILER_PORT)
      .useValue(mailer)
      .compile();
    app = moduleRef.createNestApplication();
    applyGlobalPrefix(app);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  }, 300_000);

  afterAll(async () => {
    await app?.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    await container?.stop();
  });

  /**
   * Walks the code the api just mailed and returns the created account.
   *
   * verify-email call budget in this file: N2 (1) + N2b (1) + N7 (4) = 6, under the 10/10min
   * IP-axis ceiling with headroom.
   */
  async function verifyLatestCode(email: string): Promise<User> {
    const sent = mailer.lastOfTemplate(email, 'verify-email');
    if (!sent) throw new Error(`no verify-email message recorded for ${email}`);
    await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ email, code: sent.variables.code })
      .expect(HttpStatus.OK);
    return dataSource.getRepository(User).findOneOrFail({ where: { email } });
  }

  function teacherPayload(email: string, districtId: string): Record<string, unknown> {
    return {
      firstName: 'Ayşe',
      lastName: 'Yılmaz',
      phone: '0532 111 22 33',
      email,
      password: 'Synthetic-Pass1',
      accountRole: 'TEACHER',
      districtId,
      provincePlateCode: '34',
    };
  }

  describe('N1 → N6 — one sequential flow: register, verify, login, session, refresh, logout, reset', () => {
    const email = nextEmail();
    let userId: string;
    let accessToken: string;
    let refreshToken: string;
    let currentSessionRowId: string;

    it('N1 — register creates a PENDING candidate and NO account, and sends verify-email', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(teacherPayload(email, istanbulDistrictId))
        .expect(HttpStatus.ACCEPTED);

      expect(response.body).toEqual({});
      expect(response.headers['cache-control']).toBe('no-store');

      // The account does NOT exist yet, and that is the whole point of the rework: an
      // unconfirmed registration owns no `users` row, so it is not a slot anyone can claim.
      const users = await dataSource.getRepository(User).find({ where: { email } });
      expect(users).toHaveLength(0);

      const candidates = await dataSource
        .getRepository(PendingRegistration)
        .find({ where: { email } });
      expect(candidates).toHaveLength(1);
      const candidate = candidates[0];
      expect(candidate?.attemptCount).toBe(0);
      // The submitted credentials and profile are held on the candidate, not thrown away.
      expect(candidate?.firstName).toBe('Ayşe');
      expect(candidate?.passwordHash.startsWith('$argon2id$')).toBe(true);
      // …and the plain code lives in no column: only its peppered digest does.
      expect(candidate?.codeHash).toHaveLength(32);

      const sent = mailer.lastOfTemplate(email, 'verify-email');
      expect(sent).toBeDefined();
      expect(sent?.variables.code).toMatch(/^[0-9]{6}$/);
      expect(candidate?.codeHash.equals(Buffer.from(sent?.variables.code ?? ''))).toBe(false);
    });

    it('N2 — verify-email CREATES the account from the candidate and opens a fresh session', async () => {
      const sent = mailer.lastOfTemplate(email, 'verify-email');
      if (!sent) throw new Error('no verify-email message recorded');

      const response = await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ email, code: sent.variables.code })
        .expect(HttpStatus.OK);
      expect(response.headers['cache-control']).toBe('no-store');

      const body = response.body as { accessToken: string; refreshToken: string };
      expect(typeof body.accessToken).toBe('string');
      expect(typeof body.refreshToken).toBe('string');
      accessToken = body.accessToken;
      refreshToken = body.refreshToken;
      void accessToken;

      const user = await dataSource.getRepository(User).findOneOrFail({ where: { email } });
      userId = user.id;
      // Straight to ACTIVE: there is no UNVERIFIED step any more, because there was no row.
      expect(user.status).toBe(AccountStatus.Active);
      expect(user.emailVerifiedAt).not.toBeNull();
      // The profile that materialized is the one N1 submitted, field for field.
      expect(user.firstName).toBe('Ayşe');
      expect(user.lastName).toBe('Yılmaz');
      expect(user.districtId).toBe(istanbulDistrictId);

      // The whole candidate group for this address is gone with the account's creation.
      const candidates = await dataSource
        .getRepository(PendingRegistration)
        .find({ where: { email } });
      expect(candidates).toHaveLength(0);

      const sessions = await dataSource.getRepository(Session).find({ where: { userId } });
      expect(sessions).toHaveLength(1);
      currentSessionRowId = sessions[0]?.id ?? '';
    });

    it('N2b — verify-email with a wrong/consumed code answers 400 errors.verify.codeInvalid, no-store', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ email, code: '000000' })
        .expect(HttpStatus.BAD_REQUEST);
      expect(response.headers['cache-control']).toBe('no-store');
      const body = response.body as { message: string };
      expect(body.message).toBe('errors.verify.codeInvalid');
    });

    it('N3 — login returns a fresh pair; GET /session returns exactly {id, firstName, accountRole}', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'Synthetic-Pass1' })
        .expect(HttpStatus.OK);
      expect(loginResponse.headers['cache-control']).toBe('no-store');
      const loginBody = loginResponse.body as { accessToken: string; refreshToken: string };

      // A second session row now exists (login mints its own family, independent of N2's).
      const sessionResponse = await request(app.getHttpServer())
        .get('/api/auth/session')
        .set('Authorization', `Bearer ${loginBody.accessToken}`)
        .expect(HttpStatus.OK);
      expect(sessionResponse.headers['cache-control']).toBe('no-store');
      expect(Object.keys(sessionResponse.body as object).sort()).toEqual([
        'accountRole',
        'firstName',
        'id',
      ]);
      expect(sessionResponse.body).toEqual({
        id: userId,
        firstName: 'Ayşe',
        accountRole: 'TEACHER',
      });

      // The N2 verify-email family stays the one this flow rotates/logs-out below.
      void loginBody;
    });

    it('N4 — refresh rotates: old row ROTATED, new row shares family_id, rotated_from_id points back', async () => {
      const before = await dataSource
        .getRepository(Session)
        .findOneOrFail({ where: { id: currentSessionRowId } });

      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(HttpStatus.OK);
      expect(response.headers['cache-control']).toBe('no-store');
      const body = response.body as { refreshToken: string };
      expect(body.refreshToken).not.toBe(refreshToken);
      refreshToken = body.refreshToken;

      const oldRow = await dataSource
        .getRepository(Session)
        .findOneOrFail({ where: { id: currentSessionRowId } });
      expect(oldRow.revokedReason).toBe('ROTATED');

      const rotatedHash = createHash('sha256').update(refreshToken).digest();
      const newRow = await dataSource
        .getRepository(Session)
        .findOneOrFail({ where: { tokenHash: rotatedHash } });
      expect(newRow.familyId).toBe(before.familyId);
      expect(newRow.rotatedFromId).toBe(before.id);
      currentSessionRowId = newRow.id;
    });

    it('N5 — logout revokes the whole family with LOGOUT; the same token then 401s (reuse)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .send({ refreshToken })
        .expect(HttpStatus.NO_CONTENT);

      const revoked = await dataSource
        .getRepository(Session)
        .findOneOrFail({ where: { id: currentSessionRowId } });
      expect(revoked.revokedReason).toBe('LOGOUT');

      const reuseResponse = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(HttpStatus.UNAUTHORIZED);
      const body = reuseResponse.body as { message: string };
      expect(body.message).toBe('errors.auth.sessionExpired');
    });

    it('N6 — password-reset request + confirm: new password logs in, old password 401s', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/password-reset/request')
        .send({ email })
        .expect(HttpStatus.ACCEPTED);

      const resetTokens = await dataSource
        .getRepository(PasswordResetToken)
        .find({ where: { userId } });
      expect(resetTokens.length).toBeGreaterThan(0);

      const sentReset = mailer.lastOfTemplate(email, 'password-reset');
      if (!sentReset) throw new Error('no password-reset message recorded');

      const confirmResponse = await request(app.getHttpServer())
        .post('/api/auth/password-reset/confirm')
        .send({ resetToken: sentReset.variables.resetToken, password: 'New-Synthetic-Pass2' })
        .expect(HttpStatus.NO_CONTENT);
      expect(confirmResponse.headers['cache-control']).toBe('no-store');

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'New-Synthetic-Pass2' })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'Synthetic-Pass1' })
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  /**
   * Each branch now registers AND verifies, because that is where the profile lands: the
   * candidate carries it, `verify` copies it into `users`, and only the second half proves the
   * matrix survived the copy. Asserting the candidate alone would re-test the DTO and leave
   * materialization — the step this rework introduced — unmeasured.
   */
  describe('N7 — all four profile-matrix branches register and materialize; a malformed one 400s', () => {
    it('registers a TEACHER (educationLevel/grade/stream/university/department all absent)', async () => {
      const email = nextEmail();
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(teacherPayload(email, istanbulDistrictId))
        .expect(HttpStatus.ACCEPTED);
      const user = await verifyLatestCode(email);
      expect(user.accountRole).toBe('TEACHER');
      expect(user.educationLevel).toBeNull();
    });

    it('registers a STUDENT/SECONDARY (gradeLevel + studyStream)', async () => {
      const email = nextEmail();
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          firstName: 'Mehmet',
          lastName: 'Demir',
          phone: '0532 111 22 44',
          email,
          password: 'Synthetic-Pass1',
          accountRole: 'STUDENT',
          educationLevel: 'SECONDARY',
          gradeLevel: 'GRADE_9',
          studyStream: 'SAYISAL',
          districtId: istanbulDistrictId,
          provincePlateCode: '34',
        })
        .expect(HttpStatus.ACCEPTED);
      const user = await verifyLatestCode(email);
      expect(user.gradeLevel).toBe('GRADE_9');
      expect(user.studyStream).toBe('SAYISAL');
    });

    it('registers a STUDENT/UNDERGRADUATE (university + department)', async () => {
      const email = nextEmail();
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          firstName: 'Zeynep',
          lastName: 'Kaya',
          phone: '0532 111 22 55',
          email,
          password: 'Synthetic-Pass1',
          accountRole: 'STUDENT',
          educationLevel: 'UNDERGRADUATE',
          universityName: university,
          departmentName: department,
          districtId: istanbulDistrictId,
          provincePlateCode: '34',
        })
        .expect(HttpStatus.ACCEPTED);
      const user = await verifyLatestCode(email);
      expect(user.universityName).toBe(university);
      expect(user.departmentName).toBe(department);
    });

    it('registers a STUDENT/GRADUATE with department omitted (optional)', async () => {
      const email = nextEmail();
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          firstName: 'Can',
          lastName: 'Öz',
          phone: '0532 111 22 66',
          email,
          password: 'Synthetic-Pass1',
          accountRole: 'STUDENT',
          educationLevel: 'GRADUATE',
          universityName: university,
          districtId: istanbulDistrictId,
          provincePlateCode: '34',
        })
        .expect(HttpStatus.ACCEPTED);
      const user = await verifyLatestCode(email);
      expect(user.universityName).toBe(university);
      expect(user.departmentName).toBeNull();
    });

    it('a SECONDARY payload missing studyStream 400s (profile-shape wiring, not re-proving the matrix)', async () => {
      const email = nextEmail();
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          firstName: 'Eksik',
          lastName: 'Alan',
          phone: '0532 111 22 77',
          email,
          password: 'Synthetic-Pass1',
          accountRole: 'STUDENT',
          educationLevel: 'SECONDARY',
          gradeLevel: 'GRADE_9',
          districtId: istanbulDistrictId,
          provincePlateCode: '34',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('N8 — district↔province, reference-list membership, and unknown-field rejections', () => {
    it('400s when districtId does not belong to provincePlateCode (D15)', async () => {
      const email = nextEmail();
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        // Ankara district, but the province code claimed is Istanbul's.
        .send(teacherPayload(email, ankaraDistrictId))
        .expect(HttpStatus.BAD_REQUEST);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('400s on an unknown universityName/departmentName (reference-membership wiring)', async () => {
      const email = nextEmail();
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          firstName: 'Bilinmeyen',
          lastName: 'Kurum',
          phone: '0532 111 22 88',
          email,
          password: 'Synthetic-Pass1',
          accountRole: 'STUDENT',
          educationLevel: 'UNDERGRADUATE',
          universityName: 'Synthetic Nonexistent University 99999',
          departmentName: 'Synthetic Nonexistent Department 99999',
          districtId: istanbulDistrictId,
          provincePlateCode: '34',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('400s on an unknown field (passwordConfirm) instead of silently dropping it', async () => {
      const email = nextEmail();
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...teacherPayload(email, istanbulDistrictId), passwordConfirm: 'Synthetic-Pass1' })
        .expect(HttpStatus.BAD_REQUEST);
      const body = response.body as { message: string[] };
      expect(body.message.some((entry) => entry.includes('passwordConfirm'))).toBe(true);
    });
  });
});
