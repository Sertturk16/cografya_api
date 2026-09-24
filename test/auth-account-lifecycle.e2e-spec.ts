import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { HttpStatus, ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AUTH_ERROR_KEYS } from '../src/auth/auth-error-keys';
import { PendingRegistration } from '../src/auth/entities/pending-registration.entity';
import { User } from '../src/auth/entities/user.entity';
import { MAILER_PORT } from '../src/auth/mail/mailer.port';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { seedGeography } from '../src/database/seeds/seed-geography';
import { seedReference } from '../src/database/seeds/seed-reference';
import { Province } from '../src/province/entities/province.entity';
import { District } from '../src/reference/entities/district.entity';
import { RetentionCleanupTarget } from '../src/retention/retention-cleanup.target';
import { EXPIRED_AUTH_RECORD_GRACE_MS } from '../src/retention/retention.constants';
import { RecordingMailer } from './support/recording-mailer';

/**
 * T-101 against a real Postgres: marketing consent from the register form to the profile, its
 * grant/withdraw on `PUT /api/auth/account`, permanent account deletion with every dependent row,
 * and the retention cleanup tour.
 *
 * Route budgets used here (own container, own in-memory throttler): register 3/10 per hour,
 * verify-email 2/10 per 10 min, account delete 4/10 per 15 min.
 */
describe('Auth account lifecycle — consent, deletion, retention (e2e, T-101)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let mailer: RecordingMailer;
  let districtId: string;
  let istanbulId: string;

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
    istanbulId = istanbul.id;
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

  describe('marketing consent', () => {
    let consentingToken: string;
    const consentingEmail = 'consent-yes@example.test';

    it('MC1: a ticked box is stored on the pending row and carried onto the account', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(payload(consentingEmail, { marketingConsent: true }))
        .expect(HttpStatus.ACCEPTED);
      const pending = await dataSource
        .getRepository(PendingRegistration)
        .findOneOrFail({ where: { email: consentingEmail } });
      expect(pending.marketingConsentAt).toBeInstanceOf(Date);

      const sent = mailer.lastOfTemplate(consentingEmail, 'verify-email');
      const res = await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ email: consentingEmail, code: sent?.variables.code })
        .expect(HttpStatus.OK);
      consentingToken = (res.body as { accessToken: string }).accessToken;

      const user = await dataSource
        .getRepository(User)
        .findOneOrFail({ where: { email: consentingEmail } });
      expect(user.marketingConsentAt?.toISOString()).toBe(
        pending.marketingConsentAt?.toISOString(),
      );

      const profile = await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set(bearer(consentingToken))
        .expect(HttpStatus.OK);
      expect(profile.body.marketingConsent).toBe(true);
    });

    it('MC2: no box means no consent, and registration still succeeds', async () => {
      const token = await registerAndVerify('consent-no@example.test');
      const profile = await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set(bearer(token))
        .expect(HttpStatus.OK);
      expect(profile.body.marketingConsent).toBe(false);
    });

    it('MC3: a non-boolean consent value is a 400', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(payload('consent-bad@example.test', { marketingConsent: 'yes' }))
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('MC4: PUT /account withdraws, re-grants, keeps the first instant, and ignores omission', async () => {
      const user = await dataSource
        .getRepository(User)
        .findOneOrFail({ where: { email: consentingEmail } });
      const account = {
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        provincePlateCode: '34',
        districtId: user.districtId,
      };
      const readAt = async (): Promise<Date | null> =>
        (await dataSource.getRepository(User).findOneByOrFail({ id: user.id })).marketingConsentAt;

      // Omitted key: unchanged.
      const omitted = await request(app.getHttpServer())
        .put('/api/auth/account')
        .set(bearer(consentingToken))
        .send(account)
        .expect(HttpStatus.OK);
      expect(omitted.body.marketingConsent).toBe(true);

      const withdrawn = await request(app.getHttpServer())
        .put('/api/auth/account')
        .set(bearer(consentingToken))
        .send({ ...account, marketingConsent: false })
        .expect(HttpStatus.OK);
      expect(withdrawn.body.marketingConsent).toBe(false);
      expect(await readAt()).toBeNull();

      await request(app.getHttpServer())
        .put('/api/auth/account')
        .set(bearer(consentingToken))
        .send({ ...account, marketingConsent: true })
        .expect(HttpStatus.OK);
      const granted = await readAt();
      expect(granted).toBeInstanceOf(Date);

      await request(app.getHttpServer())
        .put('/api/auth/account')
        .set(bearer(consentingToken))
        .send({ ...account, marketingConsent: true })
        .expect(HttpStatus.OK);
      expect((await readAt())?.toISOString()).toBe(granted?.toISOString());
    });
  });

  describe('account deletion', () => {
    const email = 'delete-me@example.test';
    let token: string;
    let userId: string;

    /** Every (table, column) pair holding a foreign key to `users`, read from the catalog. */
    async function userForeignKeys(): Promise<{ table: string; column: string; rule: string }[]> {
      return dataSource.query(`
        SELECT c.conrelid::regclass::text AS "table",
               a.attname                  AS "column",
               c.confdeltype              AS "rule"
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
         WHERE c.contype = 'f' AND c.confrelid = 'public.users'::regclass
         ORDER BY 1
      `);
    }

    beforeAll(async () => {
      token = await registerAndVerify(email);
      userId = (await dataSource.getRepository(User).findOneOrFail({ where: { email } })).id;

      // One row in every dependent table the service must take down with the account.
      await dataSource.query(`INSERT INTO favorites (user_id, province_id) VALUES ($1, $2)`, [
        userId,
        istanbulId,
      ]);
      await dataSource.query(
        `INSERT INTO game_rounds (user_id, client_round_id, mode, score, found, first_try,
                                  total, pool_total, total_wrongs)
         VALUES ($1, 'r-1', 'provinces', 50, 1, 1, 2, 81, 0)`,
        [userId],
      );
      await dataSource.query(
        `INSERT INTO game_round_submit_rate_limits (user_id, window_start, attempt_count)
         VALUES ($1, now(), 1)`,
        [userId],
      );
      await dataSource.query(
        `INSERT INTO measurements (user_id, client_measurement_id, type, points)
         VALUES ($1, 'm-1', 'coordinate', '[{"lat": 41, "lon": 29}]'::jsonb)`,
        [userId],
      );
      await dataSource.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, decode(repeat('ab', 32), 'hex'), now() + interval '30 minutes')`,
        [userId],
      );
    }, 60_000);

    it('D0: every foreign key to users cascades on delete', async () => {
      const fks = await userForeignKeys();
      expect(fks.length).toBeGreaterThanOrEqual(7);
      for (const fk of fks) {
        expect(`${fk.table}.${fk.column}:${fk.rule}`).toBe(`${fk.table}.${fk.column}:c`);
      }
    });

    it('D1: unauthenticated delete is a 401 with no-store', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/auth/account')
        .send({ currentPassword: PASSWORD });
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('D2: a missing password is a 400 and deletes nothing', async () => {
      await request(app.getHttpServer())
        .delete('/api/auth/account')
        .set(bearer(token))
        .send({})
        .expect(HttpStatus.BAD_REQUEST);
      expect(await dataSource.getRepository(User).countBy({ id: userId })).toBe(1);
    });

    it('D3: a wrong password is errors.password.currentInvalid and deletes nothing', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/auth/account')
        .set(bearer(token))
        .send({ currentPassword: 'Wrong-Pass9' });
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(res.body.message).toBe(AUTH_ERROR_KEYS.passwordCurrentInvalid);
      expect(await dataSource.getRepository(User).countBy({ id: userId })).toBe(1);
    });

    it('D4: the right password deletes the account and every dependent row', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/auth/account')
        .set(bearer(token))
        .send({ currentPassword: PASSWORD });
      expect(res.status).toBe(HttpStatus.NO_CONTENT);
      expect(res.headers['cache-control']).toBe('no-store');

      expect(await dataSource.getRepository(User).countBy({ id: userId })).toBe(0);
      for (const fk of await userForeignKeys()) {
        const rows = await dataSource.query<{ n: string }[]>(
          `SELECT count(*)::text AS n FROM ${fk.table} WHERE "${fk.column}" = $1`,
          [userId],
        );
        expect(`${fk.table}:${rows[0]?.n}`).toBe(`${fk.table}:0`);
      }
    });

    it('D5: the access token of a deleted account no longer works', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set(bearer(token))
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('retention cleanup', () => {
    it('R1: deletes only records past their retention period', async () => {
      const graceHours = EXPIRED_AUTH_RECORD_GRACE_MS / 3_600_000;
      const pendingRepo = dataSource.getRepository(PendingRegistration);
      const base = {
        passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA',
        firstName: 'Eski',
        lastName: 'Aday',
        phone: '+905000000030',
        accountRole: 'TEACHER' as User['accountRole'],
        educationLevel: null,
        gradeLevel: null,
        studyStream: null,
        universityName: null,
        departmentName: null,
        schoolName: null,
        districtId,
        locale: 'tr' as const,
        attemptCount: 0,
        marketingConsentAt: null,
      };
      const stale = await pendingRepo.save(
        pendingRepo.create({
          ...base,
          email: 'stale@example.test',
          codeHash: Buffer.alloc(32, 1),
          expiresAt: new Date(Date.now() - (graceHours + 1) * 3_600_000),
        }),
      );
      const recent = await pendingRepo.save(
        pendingRepo.create({
          ...base,
          email: 'recent@example.test',
          codeHash: Buffer.alloc(32, 2),
          expiresAt: new Date(Date.now() - 60_000),
        }),
      );

      await dataSource.query(
        `INSERT INTO auth_rate_limits (scope, subject_hash, window_start, attempt_count)
         VALUES ('LOGIN_EMAIL', decode(repeat('01', 32), 'hex'), now() - interval '1 hour', 1),
                ('REGISTER_EMAIL', decode(repeat('02', 32), 'hex'), now() - interval '1 hour', 1)`,
      );

      const counts = await app.get(RetentionCleanupTarget).run();

      expect(await pendingRepo.countBy({ id: stale.id })).toBe(0);
      expect(await pendingRepo.countBy({ id: recent.id })).toBe(1);
      expect(counts.pendingRegistrations).toBeGreaterThanOrEqual(1);

      // LOGIN_EMAIL's 15-minute window started an hour ago and is over; REGISTER_EMAIL's
      // one-day window is still open.
      const scopes = await dataSource.query<{ scope: string }[]>(
        `SELECT scope FROM auth_rate_limits
          WHERE subject_hash IN (decode(repeat('01', 32), 'hex'), decode(repeat('02', 32), 'hex'))`,
      );
      expect(scopes.map((row) => row.scope)).toEqual(['REGISTER_EMAIL']);
    });
  });
});
