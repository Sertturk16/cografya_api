import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { HttpStatus, ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AccountRole, AccountStatus } from '../src/auth/account.types';
import { AccessTokenService } from '../src/auth/access-token.service';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUTH_ROUTE_THROTTLES } from '../src/auth/auth.controller';
import { AUTH_TOKEN_AUDIENCE, AUTH_TOKEN_ISSUER } from '../src/auth/auth.constants';
import { SessionRevocationReason } from '../src/auth/auth.types';
import { AuthSecretsProvider } from '../src/auth/auth-secrets.provider';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { EmailVerificationCode } from '../src/auth/entities/email-verification-code.entity';
import { PasswordResetToken } from '../src/auth/entities/password-reset-token.entity';
import { Session } from '../src/auth/entities/session.entity';
import { User } from '../src/auth/entities/user.entity';
import { MAILER_PORT } from '../src/auth/mail/mailer.port';
import { seedGeography } from '../src/database/seeds/seed-geography';
import { seedReference } from '../src/database/seeds/seed-reference';
import { District } from '../src/reference/entities/district.entity';
import { PasswordHasherService } from '../src/auth/password-hasher.service';
import { Province } from '../src/province/entities/province.entity';
import { SessionService } from '../src/auth/session.service';
import { hmacSha256, sha256 } from '../src/auth/token-digest';
import { RecordingMailer } from './support/recording-mailer';

const SYNTHETIC_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$APrKX34k6VE7WGm0QyxNUA$fUFGautIsXjwaF9PfALc5EeetF5UHJq43ElafSQOVPM';

interface AuthResultBody {
  accessToken: string;
  accessTokenExpiresInSeconds: number;
  refreshToken: string;
  refreshTokenExpiresInSeconds: number;
}

/**
 * E2E-R1..R4, P1..P3, V1..V5, A1..A5, G1..G4, T1..T3, S1..S4 — roadmap §4's kabul kriterlerinin
 * doğrudan karşılığı, against a REAL Postgres.
 *
 * **Fixture strategy, stated because it is what keeps this file inside the IP-axis throttle
 * budget (§9.1, Y5 — no POST route may bypass it, not even with the trusted-client token):**
 * every scenario that does not itself test register/login/verify/resend creates its User /
 * Session / EmailVerificationCode / PasswordResetToken rows DIRECTLY via repository (or via
 * `SessionService`/`PasswordHasherService` pulled straight from the app's DI container — real
 * production code, called without an HTTP hop), never by first walking through `/register` or
 * `/login`. Only A1/A5 (register), A2/G3/G4 (login), A3/P-series (password-reset/request),
 * A4/T2 (verify-email/resend), V1-V5/T3 (verify-email/logout) exercise the ROUTE they assert
 * on. Register calls in this file: A1 (2) + A5 (2, concurrent) + T1 (4) = 8, under the 10/hour
 * ceiling with headroom. verify-email calls: V1-V5 (10 total) — exactly the 10/10min ceiling,
 * confirmed against `@nestjs/throttler`'s own counter (`totalHits > limit` blocks, so N calls at
 * `limit === N` all succeed). T3 deliberately exceeds `logout`'s ceiling (60/15min, otherwise
 * unused in this file) rather than any lower-ceiling route already in use elsewhere here.
 */
describe('Auth security — reuse, reset, verify, anti-enumeration, guard, throttle, secrets (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let mailer: RecordingMailer;
  let sessionService: SessionService;
  let passwordHasher: PasswordHasherService;
  let jwtSecret: string;
  let hmacPepper: string;
  let districtId: string;

  let emailSequence = 0;
  const nextEmail = (): string => {
    emailSequence += 1;
    return `sec-${emailSequence}@example.test`;
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

    sessionService = app.get(SessionService);
    passwordHasher = app.get(PasswordHasherService);
    const secrets = app.get(AuthSecretsProvider);
    jwtSecret = secrets.getJwtSecret();
    hmacPepper = secrets.getHmacPepper();
  }, 300_000);

  afterAll(async () => {
    await app?.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    await container?.stop();
  });

  // ── Fixture helpers ──────────────────────────────────────────────────────────────────────

  async function createUser(overrides: {
    email: string;
    status?: AccountStatus;
    passwordHash?: string;
  }): Promise<User> {
    return dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        firstName: 'Sec',
        lastName: 'Test',
        phone: '+905000000001',
        email: overrides.email,
        passwordHash: overrides.passwordHash ?? SYNTHETIC_PASSWORD_HASH,
        accountRole: AccountRole.Teacher,
        educationLevel: null,
        gradeLevel: null,
        studyStream: null,
        universityName: null,
        departmentName: null,
        districtId,
        status: overrides.status ?? AccountStatus.Active,
        emailVerifiedAt: overrides.status === AccountStatus.Unverified ? null : new Date(),
      }),
    );
  }

  async function insertVerificationCode(
    userId: string,
    code: string,
    options: { expiresInMs?: number; attemptCount?: number; consumed?: boolean } = {},
  ): Promise<void> {
    const codeHash = hmacSha256(hmacPepper, `verify:${userId}:${code}`);
    await dataSource.getRepository(EmailVerificationCode).insert({
      userId,
      codeHash,
      expiresAt: new Date(Date.now() + (options.expiresInMs ?? 10 * 60_000)),
      attemptCount: options.attemptCount ?? 0,
      consumedAt: options.consumed ? new Date() : null,
    });
  }

  async function mintAccessTokenVariant(overrides: {
    secret?: string;
    algorithm?: 'HS256' | 'HS512';
    issuer?: string;
    audience?: string;
    typ?: string;
    subject?: string;
  }): Promise<string> {
    const jwtService = new JwtService({});
    return jwtService.signAsync(
      { sv: 0, typ: overrides.typ ?? 'access' },
      {
        secret: overrides.secret ?? jwtSecret,
        algorithm: overrides.algorithm ?? 'HS256',
        issuer: overrides.issuer ?? AUTH_TOKEN_ISSUER,
        audience: overrides.audience ?? AUTH_TOKEN_AUDIENCE,
        subject: overrides.subject ?? randomUUID(),
        jwtid: randomUUID(),
        expiresIn: 900,
      },
    );
  }

  // ── R-series — refresh reuse detection ──────────────────────────────────────────────────

  describe('R1-R4 — refresh reuse detection revokes the family and bumps token_version globally', () => {
    let userId: string;
    let family1First: AuthResultBody;
    let family1Rotated: string;
    let family2: AuthResultBody;

    beforeAll(async () => {
      const user = await createUser({ email: nextEmail() });
      userId = user.id;
      family1First = await sessionService.mintSessionForUser(userId);
      family2 = await sessionService.mintSessionForUser(userId);
    });

    it('R1 — rotates once, then reusing the OLD token 401s, revokes the WHOLE family, bumps token_version', async () => {
      const rotateResponse = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: family1First.refreshToken })
        .expect(HttpStatus.OK);
      family1Rotated = (rotateResponse.body as AuthResultBody).refreshToken;

      const before = await dataSource
        .getRepository(User)
        .findOneOrFail({ where: { id: userId }, select: { id: true, tokenVersion: true } });

      const reuseResponse = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: family1First.refreshToken })
        .expect(HttpStatus.UNAUTHORIZED);
      expect((reuseResponse.body as { message: string }).message).toBe(
        'errors.auth.sessionExpired',
      );

      const family1Rows = await dataSource.getRepository(Session).find({
        where: { userId },
      });
      const originalFamilyId = family1Rows[0]?.familyId;
      const thisFamilyRows = family1Rows.filter((row) => row.familyId === originalFamilyId);
      expect(thisFamilyRows.length).toBeGreaterThan(0);
      expect(
        thisFamilyRows.every((row) => row.revokedReason === SessionRevocationReason.ReuseDetected),
      ).toBe(true);

      const after = await dataSource
        .getRepository(User)
        .findOneOrFail({ where: { id: userId }, select: { id: true, tokenVersion: true } });
      expect(after.tokenVersion).toBe(before.tokenVersion + 1);
    });

    it('R2 — the ROTATED token (t2) is ALSO dead now — the whole family died, not just the reused row', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: family1Rotated })
        .expect(HttpStatus.UNAUTHORIZED);
      expect((response.body as { message: string }).message).toBe('errors.auth.sessionExpired');
    });

    it('R3 — an access token minted BEFORE the reuse event now 401s on GET /session (sv mismatch)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/session')
        .set('Authorization', `Bearer ${family1First.accessToken}`)
        .expect(HttpStatus.UNAUTHORIZED);
      expect((response.body as { message: string }).message).toBe('errors.auth.unauthenticated');
    });

    it('R4 — a DIFFERENT device (family 2) survives on its refresh token and can mint a fresh access token', async () => {
      // Its OLD access token (minted with the pre-reuse token_version) is dead too — global, not
      // per-family (R6 in the plan's risk table, accepted by design).
      await request(app.getHttpServer())
        .get('/api/auth/session')
        .set('Authorization', `Bearer ${family2.accessToken}`)
        .expect(HttpStatus.UNAUTHORIZED);

      // But its REFRESH token is untouched by family 1's reuse event.
      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: family2.refreshToken })
        .expect(HttpStatus.OK);
      const body = response.body as AuthResultBody;
      expect(typeof body.accessToken).toBe('string');

      const freshSession = await request(app.getHttpServer())
        .get('/api/auth/session')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(HttpStatus.OK);
      expect((freshSession.body as { id: string }).id).toBe(userId);
    });
  });

  // ── P-series — password reset revocation ────────────────────────────────────────────────

  describe('P1-P3 — password reset: one-time/expiring/hashed tokens, and it revokes every live session', () => {
    it('P1 — a token cannot confirm twice; an expired token 400s; the plaintext lives in no column', async () => {
      const email = nextEmail();
      const user = await createUser({ email });

      await request(app.getHttpServer())
        .post('/api/auth/password-reset/request')
        .send({ email })
        .expect(HttpStatus.ACCEPTED);
      const sent = mailer.lastOfTemplate(email, 'password-reset');
      if (!sent) throw new Error('no password-reset message recorded');

      await request(app.getHttpServer())
        .post('/api/auth/password-reset/confirm')
        .send({ resetToken: sent.variables.resetToken, password: 'Second-Pass1' })
        .expect(HttpStatus.NO_CONTENT);

      const secondAttempt = await request(app.getHttpServer())
        .post('/api/auth/password-reset/confirm')
        .send({ resetToken: sent.variables.resetToken, password: 'Third-Pass1' })
        .expect(HttpStatus.BAD_REQUEST);
      expect((secondAttempt.body as { message: string }).message).toBe(
        'errors.password.resetTokenInvalid',
      );

      const expiredPlain = 'synthetic-expired-reset-token';
      await dataSource.getRepository(PasswordResetToken).insert({
        userId: user.id,
        tokenHash: sha256(expiredPlain),
        expiresAt: new Date(Date.now() - 60_000),
        consumedAt: null,
      });
      await request(app.getHttpServer())
        .post('/api/auth/password-reset/confirm')
        .send({ resetToken: expiredPlain, password: 'Fourth-Pass1' })
        .expect(HttpStatus.BAD_REQUEST);

      // Neither reset token this test minted appears in plaintext in any row — every stored
      // digest is exactly the 32-byte SHA-256 of ITS OWN token, never the plaintext bytes.
      const rows = await dataSource
        .getRepository(PasswordResetToken)
        .find({ where: { userId: user.id } });
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.tokenHash).toHaveLength(32);
        expect(row.tokenHash.equals(Buffer.from(sent.variables.resetToken))).toBe(false);
        expect(row.tokenHash.equals(Buffer.from(expiredPlain))).toBe(false);
      }
      const confirmedRow = rows.find((row) =>
        row.tokenHash.equals(sha256(sent.variables.resetToken)),
      );
      expect(confirmedRow).toBeDefined();
    });

    it('P2 — a second forgot request invalidates the first token when the second is confirmed', async () => {
      const email = nextEmail();
      await createUser({ email });

      await request(app.getHttpServer())
        .post('/api/auth/password-reset/request')
        .send({ email })
        .expect(HttpStatus.ACCEPTED);
      const first = mailer.lastOfTemplate(email, 'password-reset');

      await request(app.getHttpServer())
        .post('/api/auth/password-reset/request')
        .send({ email })
        .expect(HttpStatus.ACCEPTED);
      const second = mailer
        .sentTo(email)
        .filter((m) => m.template === 'password-reset')
        .pop();

      if (!first || !second || first.variables.resetToken === second.variables.resetToken) {
        throw new Error('expected two distinct password-reset tokens');
      }

      await request(app.getHttpServer())
        .post('/api/auth/password-reset/confirm')
        .send({ resetToken: first.variables.resetToken, password: 'Consumed-Pass1' })
        .expect(HttpStatus.NO_CONTENT);

      // The FIRST confirm's step 2 already consumed every other unconsumed token for this user.
      await request(app.getHttpServer())
        .post('/api/auth/password-reset/confirm')
        .send({ resetToken: second.variables.resetToken, password: 'Should-Fail-Pass1' })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('P3 — confirming a reset revokes EVERY live session and kills the pre-reset access token', async () => {
      const email = nextEmail();
      const user = await createUser({ email });
      const deviceA = await sessionService.mintSessionForUser(user.id);
      const deviceB = await sessionService.mintSessionForUser(user.id);

      await request(app.getHttpServer())
        .post('/api/auth/password-reset/request')
        .send({ email })
        .expect(HttpStatus.ACCEPTED);
      const sent = mailer.lastOfTemplate(email, 'password-reset');
      if (!sent) throw new Error('no password-reset message recorded');

      await request(app.getHttpServer())
        .post('/api/auth/password-reset/confirm')
        .send({ resetToken: sent.variables.resetToken, password: 'Reset-Everywhere-1' })
        .expect(HttpStatus.NO_CONTENT);

      const sessions = await dataSource.getRepository(Session).find({ where: { userId: user.id } });
      expect(sessions.length).toBeGreaterThanOrEqual(2);
      expect(
        sessions.every((row) => row.revokedReason === SessionRevocationReason.PasswordReset),
      ).toBe(true);

      for (const device of [deviceA, deviceB]) {
        const refreshResponse = await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .send({ refreshToken: device.refreshToken })
          .expect(HttpStatus.UNAUTHORIZED);
        expect((refreshResponse.body as { message: string }).message).toBe(
          'errors.auth.sessionExpired',
        );
      }

      await request(app.getHttpServer())
        .get('/api/auth/session')
        .set('Authorization', `Bearer ${deviceA.accessToken}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  // ── V-series — verification code mechanics ──────────────────────────────────────────────

  describe('V1-V5 — verification code: one-time, expiring, attempt-capped, hashed, resend replaces', () => {
    it('V1 — a code cannot verify twice (already consumed)', async () => {
      const email = nextEmail();
      const user = await createUser({ email, status: AccountStatus.Unverified });
      await insertVerificationCode(user.id, '111111', { consumed: true });

      const response = await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ email, code: '111111' })
        .expect(HttpStatus.BAD_REQUEST);
      expect((response.body as { message: string }).message).toBe('errors.verify.codeInvalid');
    });

    it('V2 — an expired code 400s AND the row is deleted', async () => {
      const email = nextEmail();
      const user = await createUser({ email, status: AccountStatus.Unverified });
      await insertVerificationCode(user.id, '222222', { expiresInMs: -1_000 });

      await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ email, code: '222222' })
        .expect(HttpStatus.BAD_REQUEST);

      const remaining = await dataSource
        .getRepository(EmailVerificationCode)
        .find({ where: { userId: user.id } });
      expect(remaining).toHaveLength(0);
    });

    it('V3 — the 5th wrong attempt destroys the code; the 6th call 400s with none left', async () => {
      const email = nextEmail();
      const user = await createUser({ email, status: AccountStatus.Unverified });
      await insertVerificationCode(user.id, '333333');

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await request(app.getHttpServer())
          .post('/api/auth/verify-email')
          .send({ email, code: '000000' })
          .expect(HttpStatus.BAD_REQUEST);
      }

      const afterFive = await dataSource
        .getRepository(EmailVerificationCode)
        .find({ where: { userId: user.id } });
      expect(afterFive).toHaveLength(0);

      await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ email, code: '333333' }) // even the ORIGINALLY correct code no longer matches anything
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('V4 — the stored digest is neither the plain code nor its bare SHA-256; an un-peppered HMAC disagrees', async () => {
      const email = nextEmail();
      const user = await createUser({ email, status: AccountStatus.Unverified });
      await insertVerificationCode(user.id, '444444');

      const row = await dataSource
        .getRepository(EmailVerificationCode)
        .findOneOrFail({ where: { userId: user.id } });

      expect(row.codeHash.equals(Buffer.from('444444'))).toBe(false);
      expect(row.codeHash.equals(sha256(`verify:${user.id}:444444`))).toBe(false);
      expect(
        row.codeHash.equals(
          hmacSha256('wrong-pepper-not-the-real-one', `verify:${user.id}:444444`),
        ),
      ).toBe(false);
      expect(row.codeHash.equals(hmacSha256(hmacPepper, `verify:${user.id}:444444`))).toBe(true);
    });

    it('V5 — resend replaces the old code: the old code 400s, the new one verifies', async () => {
      const email = nextEmail();
      const user = await createUser({ email, status: AccountStatus.Unverified });
      await insertVerificationCode(user.id, '555555');

      await request(app.getHttpServer())
        .post('/api/auth/verify-email/resend')
        .send({ email })
        .expect(HttpStatus.ACCEPTED);

      const rows = await dataSource
        .getRepository(EmailVerificationCode)
        .find({ where: { userId: user.id } });
      expect(rows).toHaveLength(1);

      await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ email, code: '555555' })
        .expect(HttpStatus.BAD_REQUEST);

      const sent = mailer.lastOfTemplate(email, 'verify-email');
      if (!sent) throw new Error('no verify-email message recorded from resend');
      await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ email, code: sent.variables.code })
        .expect(HttpStatus.OK);
    });
  });

  // ── A-series — anti-enumeration ─────────────────────────────────────────────────────────

  describe('A1-A5 — anti-enumeration: known and unknown addresses are indistinguishable', () => {
    it('A1 — register: an unknown and a known-UNVERIFIED address answer IDENTICAL 202s', async () => {
      const unknownEmail = nextEmail();
      const unknownResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          firstName: 'A1',
          lastName: 'Unknown',
          phone: '+905000000010',
          email: unknownEmail,
          password: 'Synthetic-Pass1',
          accountRole: 'TEACHER',
          districtId,
          provincePlateCode: '34',
        })
        .expect(HttpStatus.ACCEPTED);

      const knownEmail = nextEmail();
      await createUser({ email: knownEmail, status: AccountStatus.Unverified });
      const knownResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          firstName: 'A1',
          lastName: 'Known',
          phone: '+905000000011',
          email: knownEmail,
          password: 'Synthetic-Pass1',
          accountRole: 'TEACHER',
          districtId,
          provincePlateCode: '34',
        })
        .expect(HttpStatus.ACCEPTED);

      expect(unknownResponse.status).toBe(knownResponse.status);
      expect(unknownResponse.body).toEqual(knownResponse.body);
      expect(unknownResponse.headers['cache-control']).toBe(knownResponse.headers['cache-control']);
    });

    it('A2 — login: an unknown address and a wrong password answer the SAME 401', async () => {
      const email = nextEmail();
      await createUser({ email, passwordHash: await passwordHasher.hash('Correct-Pass1') });

      const unknownResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: nextEmail(), password: 'Whatever-Pass1' })
        .expect(HttpStatus.UNAUTHORIZED);
      const wrongPasswordResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'Wrong-Pass1' })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(unknownResponse.body).toEqual(wrongPasswordResponse.body);
    });

    it('A3 — password-reset/request: a known and an unknown address answer the SAME 202', async () => {
      const knownEmail = nextEmail();
      await createUser({ email: knownEmail });

      const knownResponse = await request(app.getHttpServer())
        .post('/api/auth/password-reset/request')
        .send({ email: knownEmail })
        .expect(HttpStatus.ACCEPTED);
      const unknownResponse = await request(app.getHttpServer())
        .post('/api/auth/password-reset/request')
        .send({ email: nextEmail() })
        .expect(HttpStatus.ACCEPTED);

      expect(knownResponse.body).toEqual(unknownResponse.body);
    });

    it('A4 — resend: known-UNVERIFIED, unknown, and already-ACTIVE addresses all answer the SAME 202', async () => {
      const unverifiedEmail = nextEmail();
      await createUser({ email: unverifiedEmail, status: AccountStatus.Unverified });
      const activeEmail = nextEmail();
      await createUser({ email: activeEmail, status: AccountStatus.Active });

      const unverifiedResponse = await request(app.getHttpServer())
        .post('/api/auth/verify-email/resend')
        .send({ email: unverifiedEmail })
        .expect(HttpStatus.ACCEPTED);
      const unknownResponse = await request(app.getHttpServer())
        .post('/api/auth/verify-email/resend')
        .send({ email: nextEmail() })
        .expect(HttpStatus.ACCEPTED);
      const activeResponse = await request(app.getHttpServer())
        .post('/api/auth/verify-email/resend')
        .send({ email: activeEmail })
        .expect(HttpStatus.ACCEPTED);

      expect(unverifiedResponse.body).toEqual(unknownResponse.body);
      expect(unverifiedResponse.body).toEqual(activeResponse.body);
      // Only the genuinely UNVERIFIED address actually received a code — asserted separately
      // from the response shape, which by design says nothing about it.
      expect(mailer.sentTo(activeEmail)).toHaveLength(0);
    });

    it('A5 — a concurrent unique-violation race never 500s, never repeats, and creates exactly one user', async () => {
      const email = nextEmail();
      const payload = {
        firstName: 'A5',
        lastName: 'Race',
        phone: '+905000000012',
        email,
        password: 'Synthetic-Pass1',
        accountRole: 'TEACHER',
        districtId,
        provincePlateCode: '34',
      };

      const [first, second] = await Promise.all([
        request(app.getHttpServer()).post('/api/auth/register').send(payload),
        request(app.getHttpServer()).post('/api/auth/register').send(payload),
      ]);

      expect(first.status).toBe(HttpStatus.ACCEPTED);
      expect(second.status).toBe(HttpStatus.ACCEPTED);
      expect(JSON.stringify(first.body)).not.toContain('@');
      expect(JSON.stringify(second.body)).not.toContain('@');

      const users = await dataSource.getRepository(User).find({ where: { email } });
      expect(users).toHaveLength(1);
    });
  });

  // ── G-series — guard boundary ────────────────────────────────────────────────────────────

  describe('G1-G4 — AccessTokenGuard boundary', () => {
    it('G1 — no Authorization header 401s', async () => {
      await request(app.getHttpServer()).get('/api/auth/session').expect(HttpStatus.UNAUTHORIZED);
    });

    it('G2 — every malformed-token variant 401s: signature, iss, aud, alg, typ', async () => {
      const variants: Promise<string>[] = [
        mintAccessTokenVariant({ secret: 'wrong-secret-not-matching-anything-1234567890' }),
        mintAccessTokenVariant({ issuer: 'wrong-issuer' }),
        mintAccessTokenVariant({ audience: 'wrong-audience' }),
        mintAccessTokenVariant({ algorithm: 'HS512' }),
        mintAccessTokenVariant({ typ: 'refresh' }),
      ];
      for (const variantPromise of variants) {
        const token = await variantPromise;
        await request(app.getHttpServer())
          .get('/api/auth/session')
          .set('Authorization', `Bearer ${token}`)
          .expect(HttpStatus.UNAUTHORIZED);
      }
    });

    it('G3 — UNVERIFIED: login 403s; a live token whose account later flips to UNVERIFIED 401s', async () => {
      const email = nextEmail();
      const user = await createUser({
        email,
        status: AccountStatus.Unverified,
        passwordHash: await passwordHasher.hash('Correct-Pass1'),
      });

      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'Correct-Pass1' })
        .expect(HttpStatus.FORBIDDEN);
      expect((loginResponse.body as { message: string }).message).toBe(
        'errors.auth.emailNotVerified',
      );

      // `CHK_users_verification_state` ties status to email_verified_at both ways — ACTIVE
      // requires it set, UNVERIFIED requires it null — so both flips below set it explicitly.
      await dataSource
        .getRepository(User)
        .update({ id: user.id }, { status: AccountStatus.Active, emailVerifiedAt: new Date() });
      const activeToken = app.get(AccessTokenService);
      const token = await activeToken.mint(user.id, 0);
      await dataSource
        .getRepository(User)
        .update({ id: user.id }, { status: AccountStatus.Unverified, emailVerifiedAt: null });

      await request(app.getHttpServer())
        .get('/api/auth/session')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('G4 — DISABLED: login 403s; a live token 401s', async () => {
      const email = nextEmail();
      const user = await createUser({
        email,
        status: AccountStatus.Disabled,
        passwordHash: await passwordHasher.hash('Correct-Pass1'),
      });

      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'Correct-Pass1' })
        .expect(HttpStatus.FORBIDDEN);
      expect((loginResponse.body as { message: string }).message).toBe(
        'errors.auth.accountDisabled',
      );

      const accessTokens = app.get(AccessTokenService);
      const token = await accessTokens.mint(user.id, 0);
      await request(app.getHttpServer())
        .get('/api/auth/session')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  // ── T-series — throttling ────────────────────────────────────────────────────────────────

  describe('T1-T3 — identity-axis and IP-axis throttling', () => {
    it('T1 — the 4th register on the SAME address (24h REGISTER_EMAIL cap = 3) sends no new mail, still 202s', async () => {
      const email = nextEmail();
      const payload = {
        firstName: 'T1',
        lastName: 'Throttle',
        phone: '+905000000013',
        email,
        password: 'Synthetic-Pass1',
        accountRole: 'TEACHER',
        districtId,
        provincePlateCode: '34',
      };

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(payload)
        .expect(HttpStatus.ACCEPTED);
      expect(mailer.sentTo(email)).toHaveLength(1);

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(payload)
        .expect(HttpStatus.ACCEPTED);
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(payload)
        .expect(HttpStatus.ACCEPTED);

      const beforeFourth = mailer.sentTo(email).length;
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(payload)
        .expect(HttpStatus.ACCEPTED);
      const afterFourth = mailer.sentTo(email).length;
      expect(afterFourth).toBe(beforeFourth);
    });

    it('T2 — resend cooldown (60s): a second immediate resend sends no new mail, still 202s', async () => {
      const email = nextEmail();
      const user = await createUser({ email, status: AccountStatus.Unverified });
      await insertVerificationCode(user.id, '666666');

      await request(app.getHttpServer())
        .post('/api/auth/verify-email/resend')
        .send({ email })
        .expect(HttpStatus.ACCEPTED);
      const afterFirst = mailer.sentTo(email).length;

      await request(app.getHttpServer())
        .post('/api/auth/verify-email/resend')
        .send({ email })
        .expect(HttpStatus.ACCEPTED);
      const afterSecond = mailer.sentTo(email).length;

      expect(afterSecond).toBe(afterFirst);
    });

    it('T3 — the IP-axis ceiling 429s even for an otherwise-valid request, no trusted-client bypass on POST', async () => {
      const limit = AUTH_ROUTE_THROTTLES.logout.limit;
      let sawTooManyRequests = false;
      for (let attempt = 0; attempt < limit + 1; attempt += 1) {
        const response = await request(app.getHttpServer())
          .post('/api/auth/logout')
          .send({ refreshToken: 'synthetic-unknown-token-for-throttle-probe' });
        if (Number(response.status) === Number(HttpStatus.TOO_MANY_REQUESTS)) {
          sawTooManyRequests = true;
          break;
        }
        expect(response.status).toBe(HttpStatus.NO_CONTENT);
      }
      expect(sawTooManyRequests).toBe(true);
    });
  });

  // ── S-series — secrets never leak ───────────────────────────────────────────────────────

  describe('S1-S4 — no secret ever reaches a response, a log-visible echo, an OpenAPI example, or CORS credentials', () => {
    it('S1 — no response body across the flow ever carries a raw hash/code/reset-token column value', async () => {
      // Uses login rather than verify-email/resend on purpose: V1-V5 already spend the
      // verify-email IP-axis ceiling (10/10min) down to its own boundary, and login has ample
      // headroom (30/15min, a handful of calls used elsewhere in this file). The property under
      // test — no entity secret COLUMN NAME or VALUE ever reaches a serialized response — is
      // exactly as well witnessed by a real AuthResultDto-returning endpoint as by verify-email.
      const email = nextEmail();
      const passwordHash = await passwordHasher.hash('Correct-Pass1');
      await createUser({ email, passwordHash });

      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'Correct-Pass1' })
        .expect(HttpStatus.OK);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain(passwordHash);
      expect(serialized).not.toContain(SYNTHETIC_PASSWORD_HASH);
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('codeHash');
      expect(serialized).not.toContain('tokenHash');
    });

    it('S2 — a 400 body never echoes back the malformed value that was submitted', async () => {
      const distinctiveJunk = 'zz-not-a-valid-email-marker-zz';
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: distinctiveJunk, password: 'whatever' })
        .expect(HttpStatus.BAD_REQUEST);
      expect(JSON.stringify(response.body)).not.toContain(distinctiveJunk);
    });

    it('S3 — the committed openapi.json carries no real-looking address in an example, and every secret field is writeOnly with no example', () => {
      const raw = readFileSync(join(__dirname, '..', 'openapi', 'openapi.json'), 'utf8');
      const document = JSON.parse(raw) as {
        components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
      };
      const authSchemaNames = Object.keys(document.components.schemas).filter((name) =>
        [
          'RegisterRequestDto',
          'VerifyEmailRequestDto',
          'LoginRequestDto',
          'RefreshRequestDto',
          'LogoutRequestDto',
          'PasswordResetConfirmDto',
        ].includes(name),
      );
      expect(authSchemaNames.length).toBeGreaterThan(0);
      // An EXACT allow-list, not a substring pattern: `/password|code|token/i` would also match
      // `provincePlateCode` (a public plate code, not a secret) — the field NAME is what must be
      // matched precisely, the same lesson `book.contract.spec.ts`'s own banned-field scan
      // states for its price/offer pattern.
      const secretFieldNames = new Set(['password', 'code', 'refreshToken', 'resetToken']);
      for (const schemaName of authSchemaNames) {
        const properties = document.components.schemas[schemaName]?.properties ?? {};
        for (const [fieldName, field] of Object.entries(properties)) {
          const value = field as { example?: unknown; writeOnly?: boolean };
          if (secretFieldNames.has(fieldName)) {
            expect(`${schemaName}.${fieldName}:writeOnly=${String(value.writeOnly === true)}`).toBe(
              `${schemaName}.${fieldName}:writeOnly=true`,
            );
            expect(`${schemaName}.${fieldName}:hasExample=${String('example' in value)}`).toBe(
              `${schemaName}.${fieldName}:hasExample=false`,
            );
          }
        }
      }
      // No `@`-bearing example anywhere in the whole document — the structural proxy for "no
      // real-looking address ever appears as an example" (the DTOs' own examples use only
      // `example.test`, per §7.3).
      const emailLikeExamples = raw.match(/"example"\s*:\s*"[^"]*@[^"]*"/g) ?? [];
      for (const match of emailLikeExamples) {
        expect(match).toContain('example.test');
      }
    });

    it('S4 — a CORS preflight on an auth route never grants Access-Control-Allow-Credentials', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/auth/login')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');
      expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    });
  });
});
