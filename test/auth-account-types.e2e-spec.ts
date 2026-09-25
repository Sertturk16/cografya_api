import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { HttpStatus, ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { User } from '../src/auth/entities/user.entity';
import { MAILER_PORT } from '../src/auth/mail/mailer.port';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { seedGeography } from '../src/database/seeds/seed-geography';
import { seedReference } from '../src/database/seeds/seed-reference';
import { Province } from '../src/province/entities/province.entity';
import { District } from '../src/reference/entities/district.entity';
import { RecordingMailer } from './support/recording-mailer';

/**
 * The four account types and the role switch, against a real Postgres (T-103).
 *
 * Route budgets used here (own container, own in-memory throttler): register 10/hour. This file
 * makes six `/register` calls, well under the ceiling.
 */
describe('Account types (e2e, T-103)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let mailer: RecordingMailer;
  let districtId: string;

  const PASSWORD = 'Synthetic-Pass1';

  function payload(email: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      firstName: 'Ayşe',
      lastName: 'Yılmaz',
      phone: '0532 111 22 33',
      email,
      password: PASSWORD,
      accountRole: 'TEACHER',
      districtId,
      provincePlateCode: '34',
      ...extra,
    };
  }

  /** Registers, confirms the mailed code, and returns the new account's access token. */
  async function registerAndVerify(
    email: string,
    extra: Record<string, unknown> = {},
  ): Promise<string> {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(payload(email, extra))
      .expect(HttpStatus.ACCEPTED);
    const sent = mailer.lastOfTemplate(email, 'verify-email');
    if (!sent) throw new Error(`no verify-email message recorded for ${email}`);
    const res = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ email, code: sent.variables.code })
      .expect(HttpStatus.OK);
    return (res.body as { accessToken: string }).accessToken;
  }

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

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
    districtId = district.id;

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

  const profileOf = async (token: string) =>
    (await request(app.getHttpServer()).get('/api/auth/profile').set(bearer(token)).expect(200))
      .body as Record<string, unknown>;

  it('registers an ENTHUSIAST with a referral source; the source is stored, never returned', async () => {
    const token = await registerAndVerify('enthusiast@example.test', {
      accountRole: 'ENTHUSIAST',
      referralSource: 'YOUTUBE',
    });
    const profile = await profileOf(token);
    expect(profile).toMatchObject({ accountRole: 'ENTHUSIAST', isComplete: true });
    expect(profile).not.toHaveProperty('referralSource');
    const row = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'enthusiast@example.test' });
    expect(row.referralSource).toBe('YOUTUBE');
  });

  it('registers a TEACHER with branch and institution', async () => {
    const token = await registerAndVerify('teacher-t103@example.test', {
      accountRole: 'TEACHER',
      teacherSubject: 'COGRAFYA',
      institutionType: 'DERSHANE_KURS',
    });
    expect(await profileOf(token)).toMatchObject({
      accountRole: 'TEACHER',
      teacherSubject: 'COGRAFYA',
      institutionType: 'DERSHANE_KURS',
      isComplete: true,
    });
  });

  it('refuses a TEACHER with only one of the two teacher fields', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(
        payload('teacher-half@example.test', { accountRole: 'TEACHER', teacherSubject: 'DIGER' }),
      )
      .expect(HttpStatus.BAD_REQUEST);
  });

  it('switching TEACHER → PARENT in PUT /auth/profile clears the teacher fields', async () => {
    const token = await registerAndVerify('switch@example.test', {
      accountRole: 'TEACHER',
      teacherSubject: 'SOSYAL_BILGILER',
      institutionType: 'OZEL_OKUL',
    });
    const res = await request(app.getHttpServer())
      .put('/api/auth/profile')
      .set(bearer(token))
      .send({
        accountRole: 'PARENT',
        educationLevel: 'SECONDARY',
        gradeLevel: 'GRADE_12',
        studyStream: 'ESIT_AGIRLIK',
        schoolName: null,
        universityName: null,
        departmentName: null,
        teacherSubject: null,
        institutionType: null,
      })
      .expect(200);
    expect(res.body).toMatchObject({
      accountRole: 'PARENT',
      gradeLevel: 'GRADE_12',
      teacherSubject: null,
      institutionType: null,
      isComplete: true,
    });
    const session = await request(app.getHttpServer())
      .get('/api/auth/session')
      .set(bearer(token))
      .expect(200);
    expect(session.body.accountRole).toBe('PARENT');
  });

  it('refuses a role switch whose fields belong to the old role, and changes nothing', async () => {
    const token = await registerAndVerify('switch-bad@example.test', {
      accountRole: 'TEACHER',
      teacherSubject: 'COGRAFYA',
      institutionType: 'DEVLET_OKULU',
    });
    await request(app.getHttpServer())
      .put('/api/auth/profile')
      .set(bearer(token))
      .send({
        accountRole: 'ENTHUSIAST',
        educationLevel: null,
        gradeLevel: null,
        studyStream: null,
        schoolName: null,
        universityName: null,
        departmentName: null,
        teacherSubject: 'COGRAFYA',
        institutionType: 'DEVLET_OKULU',
      })
      .expect(HttpStatus.BAD_REQUEST);
    expect(await profileOf(token)).toMatchObject({
      accountRole: 'TEACHER',
      teacherSubject: 'COGRAFYA',
    });
  });

  it('refuses referralSource on PUT /auth/profile (not a declared property)', async () => {
    const token = await registerAndVerify('ref-put@example.test', { accountRole: 'ENTHUSIAST' });
    await request(app.getHttpServer())
      .put('/api/auth/profile')
      .set(bearer(token))
      .send({
        accountRole: 'ENTHUSIAST',
        educationLevel: null,
        gradeLevel: null,
        studyStream: null,
        schoolName: null,
        universityName: null,
        departmentName: null,
        teacherSubject: null,
        institutionType: null,
        referralSource: 'GOOGLE',
      })
      .expect(HttpStatus.BAD_REQUEST);
  });
});
