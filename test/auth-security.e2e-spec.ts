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
import { AUTH_ERROR_KEYS } from '../src/auth/auth-error-keys';
import {
  AUTH_TOKEN_AUDIENCE,
  AUTH_TOKEN_ISSUER,
  REFRESH_ROTATION_GRACE_WINDOW_MS,
} from '../src/auth/auth.constants';
import { AuthRateLimitScope, SessionRevocationReason } from '../src/auth/auth.types';
import { AuthSecretsProvider } from '../src/auth/auth-secrets.provider';
import { applyGlobalPrefix, buildCorsOptions } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { PendingRegistration } from '../src/auth/entities/pending-registration.entity';
import { PasswordResetToken } from '../src/auth/entities/password-reset-token.entity';
import { Session } from '../src/auth/entities/session.entity';
import { User } from '../src/auth/entities/user.entity';
import { MAILER_PORT } from '../src/auth/mail/mailer.port';
import { seedGeography } from '../src/database/seeds/seed-geography';
import { seedReference } from '../src/database/seeds/seed-reference';
import { District } from '../src/reference/entities/district.entity';
import {
  EmailVerificationService,
  type ResendOutcome,
} from '../src/auth/email-verification.service';
import { PasswordHasherService } from '../src/auth/password-hasher.service';
import { Province } from '../src/province/entities/province.entity';
import { RegistrationService } from '../src/auth/registration.service';
import type { RegisterRequestDto } from '../src/auth/dto/register-request.dto';
import { SessionService } from '../src/auth/session.service';
import { hmacSha256, sha256 } from '../src/auth/token-digest';
import { RecordingMailer } from './support/recording-mailer';

const SYNTHETIC_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$APrKX34k6VE7WGm0QyxNUA$fUFGautIsXjwaF9PfALc5EeetF5UHJq43ElafSQOVPM';

/**
 * A SECOND synthetic hash, distinct from {@link SYNTHETIC_PASSWORD_HASH} — the "attacker" identity
 * in every scenario where a candidate group must carry MORE THAN ONE credential identity (D2,
 * `SEC136R2-I3`). Hoisted to module scope (PR #136 round 4, plan §9.3): V6/V6b each declared it
 * locally, but T4 (a DIFFERENT top-level `describe`) needs the identical literal, and duplicating
 * it risks the two drifting into the SAME string by a future edit, which would silently stop
 * testing D2.
 */
const ATTACKER_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$ZGlmZmVyZW50c2FsdA$ZGlmZmVyZW50aGFzaHZhbHVlZGlmZg';

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
 * Session / PendingRegistration / PasswordResetToken rows DIRECTLY via repository (or via
 * `SessionService`/`PasswordHasherService`/`EmailVerificationService` pulled straight from the
 * app's DI container — real production code, called without an HTTP hop), never by first walking
 * through `/register` or `/login`. Only A1/A5 (register), A2/G3/G4 (login), A3/P-series
 * (password-reset/request), A4/T2/V5/C5 (verify-email/resend), V1-V3/V5 (verify-email), N9b
 * (refresh) and T3 (logout) exercise the ROUTE they assert on. Register calls in this file:
 * A1 (2) + A5 (2, concurrent) + T1 (4) = 8, under the 10/hour ceiling with headroom.
 * verify-email calls: V1 (2) + V2 (1) + V3 (5) + V5 (1) = 9, under the 10/10min ceiling — the
 * C-series deliberately calls `EmailVerificationService.verify` through DI instead, because its
 * scenarios are about the transaction's own concurrency and would otherwise spend a budget the
 * V-series needs. verify-email/resend calls: A4 (3) + V5 (1) + T2 (2) + C5 (1, PR #136 round 3 —
 * the ONE case in the C-series that genuinely needs the ROUTE, because it pins the response the
 * ROUTE HANDLER's own contention catch produces) = 7, under the 10/hour ceiling. refresh calls:
 * R1 (3) + R2 (1) + R4 (1) + R5a (3) + R5 (3) + R6 (2) + R7 (8, ×4 reasons) + R7b (2) + R8
 * (4, ×2 cases) + R9 (3) + P3 (2) + N9a (1) = 33, under `AUTH_ROUTE_THROTTLES.refresh`'s 60/15min
 * ceiling — N9b also POSTs the route but its malformed body 400s at Express's own parser before
 * the request ever reaches the guard (the same boundary N9b's own inline comment traces for
 * `AuthNoStoreMiddleware`), so it spends nothing from the budget. T3 deliberately
 * exceeds `logout`'s ceiling (60/15min, otherwise unused in this
 * file) rather than any lower-ceiling route already in use elsewhere here.
 */
describe('Auth security — reuse, reset, verify, anti-enumeration, guard, throttle, secrets (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let mailer: RecordingMailer;
  let sessionService: SessionService;
  let emailVerification: EmailVerificationService;
  let registration: RegistrationService;
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
    // CODE136-I5: S4 asserts a CORS property, so this application must actually HAVE a CORS
    // layer — built from the shared option shape, not from a hand-copied literal.
    app.enableCors(buildCorsOptions('http://localhost:3000'));
    applyGlobalPrefix(app);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    sessionService = app.get(SessionService);
    emailVerification = app.get(EmailVerificationService);
    registration = app.get(RegistrationService);
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

  /**
   * A `pending_registrations` candidate carrying a KNOWN code, inserted directly.
   *
   * Replaces the old `insertVerificationCode(userId, …)`: a code no longer belongs to a `users`
   * row, it belongs to a candidate that carries its own credentials, and its digest binds that
   * candidate's own primary key (`SEC136-C1`). The id is generated HERE for the same reason the
   * service generates it — the digest cannot be computed after the database has chosen the key.
   */
  async function insertCandidate(
    email: string,
    code: string,
    options: {
      expiresInMs?: number;
      attemptCount?: number;
      passwordHash?: string;
      firstName?: string;
    } = {},
  ): Promise<PendingRegistration> {
    const id = randomUUID();
    const repo = dataSource.getRepository(PendingRegistration);
    await repo.insert({
      id,
      email,
      passwordHash: options.passwordHash ?? SYNTHETIC_PASSWORD_HASH,
      firstName: options.firstName ?? 'Sec',
      lastName: 'Test',
      phone: '+905000000001',
      accountRole: AccountRole.Teacher,
      educationLevel: null,
      gradeLevel: null,
      studyStream: null,
      universityName: null,
      departmentName: null,
      districtId,
      locale: 'tr',
      codeHash: hmacSha256(hmacPepper, `pending:${id}:${code}`),
      expiresAt: new Date(Date.now() + (options.expiresInMs ?? 10 * 60_000)),
      attemptCount: options.attemptCount ?? 0,
    });
    return repo.findOneOrFail({ where: { id } });
  }

  function candidatesOf(email: string): Promise<PendingRegistration[]> {
    return dataSource
      .getRepository(PendingRegistration)
      .find({ where: { email }, order: { createdAt: 'ASC' } });
  }

  /** Holds a row lock from a SEPARATE connection — the stand-in for a concurrent `verify`. */
  async function withHeldRowLock<T>(
    ids: readonly string[],
    body: (lockNext: (id: string) => Promise<void>) => Promise<T>,
  ): Promise<T> {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      for (const id of ids) {
        await runner.query('SELECT id FROM pending_registrations WHERE id = $1 FOR UPDATE', [id]);
      }
      return await body(async (id) => {
        await runner.query('SELECT id FROM pending_registrations WHERE id = $1 FOR UPDATE', [id]);
      });
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  }

  /**
   * Positive control: the app really is WAITING on a row lock of this table, not merely slow.
   *
   * **Measured correction against the plan's own literal query** (`grep`-verifiable against real
   * Postgres 16, two independent `psql` sessions): a `SELECT … FOR UPDATE` waiting on a row
   * another live transaction holds does NOT surface in `pg_locks` as an ungranted `relation`-type
   * lock — that lock (`RowShareLock`) is a table-level intent lock and is granted immediately,
   * whatever row it targets. The wait itself is a `transactionid`-type lock on the HOLDING
   * transaction's own xid, and `pg_locks.relation` is NULL for that row — so
   * `WHERE NOT granted AND relation = 'pending_registrations'::regclass` can never match. Joined
   * against `pg_stat_activity` on `pid` to keep the check scoped to a backend whose own query
   * names this table, rather than any ungranted lock anywhere in the instance.
   */
  async function waitForBlockedWaiter(): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const rows = await dataSource.query<{ n: string }[]>(
        `SELECT count(*)::int AS n
           FROM pg_locks l
           JOIN pg_stat_activity a ON a.pid = l.pid
          WHERE NOT l.granted
            AND l.locktype = 'transactionid'
            AND a.query ILIKE '%pending_registrations%'`,
      );
      if (Number(rows[0]?.n ?? 0) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(
      'no blocked waiter appeared — the contention this case measures was never set up',
    );
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
    let family1Recovered: string;
    let family2: AuthResultBody;

    beforeAll(async () => {
      const user = await createUser({ email: nextEmail() });
      userId = user.id;
      family1First = await sessionService.mintSessionForUser(userId);
      family2 = await sessionService.mintSessionForUser(userId);
    });

    it('R1 — a just-rotated token recovers once, then its second replay 401s, revokes the WHOLE family, bumps token_version', async () => {
      const rotateResponse = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: family1First.refreshToken })
        .expect(HttpStatus.OK);
      family1Rotated = (rotateResponse.body as AuthResultBody).refreshToken;

      const before = await dataSource
        .getRepository(User)
        .findOneOrFail({ where: { id: userId }, select: { id: true, tokenVersion: true } });

      const recoveryResponse = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: family1First.refreshToken })
        .expect(HttpStatus.OK);
      family1Recovered = (recoveryResponse.body as AuthResultBody).refreshToken;

      const afterRecovery = await dataSource
        .getRepository(User)
        .findOneOrFail({ where: { id: userId }, select: { id: true, tokenVersion: true } });
      expect(afterRecovery.tokenVersion).toBe(before.tokenVersion);

      const recoveredOriginal = await dataSource
        .getRepository(Session)
        .findOneOrFail({ where: { tokenHash: sha256(family1First.refreshToken) } });
      expect(recoveredOriginal.rotationGraceUsedAt).not.toBeNull();

      const reuseResponse = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: family1First.refreshToken })
        .expect(HttpStatus.UNAUTHORIZED);
      expect((reuseResponse.body as { message: string }).message).toBe(
        'errors.auth.sessionExpired',
      );

      // `userId` carries TWO families (family1First + family2, minted in beforeAll) — `find`
      // with no ORDER BY does not guarantee row order, so the family under test is identified
      // by its OWN familyId (read off the row this test itself rotated), never by array index.
      const family1OriginalRow = await dataSource
        .getRepository(Session)
        .findOneOrFail({ where: { tokenHash: sha256(family1First.refreshToken) } });
      const thisFamilyRows = await dataSource
        .getRepository(Session)
        .find({ where: { familyId: family1OriginalRow.familyId } });
      expect(thisFamilyRows.length).toBeGreaterThan(0);
      // "the whole family dies" (§5.2.3) means every row ends up REVOKED — it does NOT mean
      // every row shares one revokedReason: the algorithm's own `WHERE revoked_at IS NULL`
      // clause only touches rows that were still LIVE at reuse time (§5.2.3 step 1), so a row
      // already revoked earlier (this one, ROTATED by this very test seconds ago) keeps its
      // original reason. The row that WAS live — the rotated t2 — is the one asserted by name.
      expect(thisFamilyRows.every((row) => row.revokedAt !== null)).toBe(true);
      const recoveredRow = thisFamilyRows.find((row) =>
        row.tokenHash.equals(sha256(family1Recovered)),
      );
      expect(recoveredRow?.revokedReason).toBe(SessionRevocationReason.ReuseDetected);

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

  // ── R5-R9 — bounded refresh rotation recovery ───────────────────────────────────────────

  describe('R5-R9 — one-use refresh rotation recovery remains fail-closed outside its window', () => {
    async function rotateForRecovery(): Promise<{
      user: User;
      original: AuthResultBody;
      successor: string;
    }> {
      const user = await createUser({ email: nextEmail() });
      const original = await sessionService.mintSessionForUser(user.id);
      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: original.refreshToken })
        .expect(HttpStatus.OK);
      return { user, original, successor: (response.body as AuthResultBody).refreshToken };
    }

    it('R5a — the recovered pair is USABLE: its access token opens a session and its refresh token rotates again', async () => {
      const { user, original } = await rotateForRecovery();

      const recovered = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: original.refreshToken })
        .expect(HttpStatus.OK);
      const pair = recovered.body as AuthResultBody;

      // ACCESS-TOKEN LEG: status alone is a tautology — mirrors R4's own pattern (line 420). The
      // returned session must belong to THIS user, not merely to some ACTIVE user.
      const session = await request(app.getHttpServer())
        .get('/api/auth/session')
        .set('Authorization', `Bearer ${pair.accessToken}`)
        .expect(HttpStatus.OK);
      expect((session.body as { id: string }).id).toBe(user.id);

      // REFRESH-TOKEN LEG: the recovered refresh token must still rotate — an ordinary,
      // family-continuous rotation, not a second recovery.
      const rotated = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: pair.refreshToken })
        .expect(HttpStatus.OK);
      const rotatedBody = rotated.body as AuthResultBody;

      const recoveredRow = await dataSource
        .getRepository(Session)
        .findOneOrFail({ where: { tokenHash: sha256(pair.refreshToken) } });
      const rotatedRow = await dataSource
        .getRepository(Session)
        .findOneOrFail({ where: { tokenHash: sha256(rotatedBody.refreshToken) } });
      expect(recoveredRow.revokedReason).toBe(SessionRevocationReason.Rotated);
      expect(rotatedRow.revokedAt).toBeNull();
      expect(rotatedRow.familyId).toBe(recoveredRow.familyId);
    });

    it('R5 — recovery is one-use and leaves token_version unchanged until a second replay', async () => {
      const { user, original, successor } = await rotateForRecovery();
      const before = await dataSource
        .getRepository(User)
        .findOneOrFail({ where: { id: user.id }, select: { id: true, tokenVersion: true } });

      const recovered = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: original.refreshToken })
        .expect(HttpStatus.OK);
      const recoveredToken = (recovered.body as AuthResultBody).refreshToken;

      const originalRow = await dataSource
        .getRepository(Session)
        .findOneOrFail({ where: { tokenHash: sha256(original.refreshToken) } });
      const successorRow = await dataSource
        .getRepository(Session)
        .findOneOrFail({ where: { tokenHash: sha256(successor) } });
      expect(originalRow.rotationGraceUsedAt).not.toBeNull();
      expect(successorRow.revokedReason).toBe(SessionRevocationReason.Rotated);
      expect(
        await dataSource.getRepository(User).findOneOrFail({
          where: { id: user.id },
          select: { id: true, tokenVersion: true },
        }),
      ).toMatchObject({ tokenVersion: before.tokenVersion });

      // Positive control for the persisted one-use marker: restore the direct successor to the
      // otherwise-qualifying live state. The next request must still reject because the old row
      // consumed its grace; removing that guard makes this request return 200.
      await dataSource
        .getRepository(Session)
        .update({ id: successorRow.id }, { revokedAt: null, revokedReason: null });

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: original.refreshToken })
        .expect(HttpStatus.UNAUTHORIZED);
      const recoveredRow = await dataSource
        .getRepository(Session)
        .findOneOrFail({ where: { tokenHash: sha256(recoveredToken) } });
      expect(recoveredRow.revokedReason).toBe(SessionRevocationReason.ReuseDetected);
    });

    it('R6 — an out-of-window ROTATED predecessor takes the strict family-revoke path', async () => {
      const { user, original, successor } = await rotateForRecovery();
      await dataSource
        .getRepository(Session)
        .update(
          { tokenHash: sha256(original.refreshToken) },
          { revokedAt: new Date(Date.now() - REFRESH_ROTATION_GRACE_WINDOW_MS - 1) },
        );

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: original.refreshToken })
        .expect(HttpStatus.UNAUTHORIZED);

      const successorRow = await dataSource
        .getRepository(Session)
        .findOneOrFail({ where: { tokenHash: sha256(successor) } });
      const after = await dataSource
        .getRepository(User)
        .findOneOrFail({ where: { id: user.id }, select: { id: true, tokenVersion: true } });
      expect(successorRow.revokedReason).toBe(SessionRevocationReason.ReuseDetected);
      expect(after.tokenVersion).toBe(1);
    });

    it.each([
      SessionRevocationReason.Logout,
      SessionRevocationReason.PasswordReset,
      SessionRevocationReason.Expired,
      SessionRevocationReason.AccountInactive,
    ])('R7 — %s never receives rotation recovery', async (reason) => {
      const { user, original, successor } = await rotateForRecovery();
      await dataSource
        .getRepository(Session)
        .update({ tokenHash: sha256(original.refreshToken) }, { revokedReason: reason });

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: original.refreshToken })
        .expect(HttpStatus.UNAUTHORIZED);

      const successorRow = await dataSource
        .getRepository(Session)
        .findOneOrFail({ where: { tokenHash: sha256(successor) } });
      const after = await dataSource
        .getRepository(User)
        .findOneOrFail({ where: { id: user.id }, select: { id: true, tokenVersion: true } });
      expect(successorRow.revokedReason).toBe(SessionRevocationReason.ReuseDetected);
      expect(after.tokenVersion).toBe(1);
    });

    it('R7b — an account made inactive after rotation cannot use recovery', async () => {
      const { user, original, successor } = await rotateForRecovery();
      await dataSource
        .getRepository(User)
        .update({ id: user.id }, { status: AccountStatus.Disabled });

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: original.refreshToken })
        .expect(HttpStatus.UNAUTHORIZED);

      const successorRow = await dataSource
        .getRepository(Session)
        .findOneOrFail({ where: { tokenHash: sha256(successor) } });
      const after = await dataSource
        .getRepository(User)
        .findOneOrFail({ where: { id: user.id }, select: { id: true, tokenVersion: true } });
      expect(successorRow.revokedReason).toBe(SessionRevocationReason.ReuseDetected);
      expect(after.tokenVersion).toBe(1);
    });

    it.each(['missing', 'non-live'] as const)(
      'R8 — a %s direct successor takes the strict family-revoke path',
      async (caseName) => {
        const { user, original, successor } = await rotateForRecovery();
        if (caseName === 'missing') {
          await dataSource.getRepository(Session).delete({ tokenHash: sha256(successor) });
        } else {
          await dataSource
            .getRepository(Session)
            .update(
              { tokenHash: sha256(successor) },
              { revokedAt: new Date(), revokedReason: SessionRevocationReason.Logout },
            );
        }

        await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .send({ refreshToken: original.refreshToken })
          .expect(HttpStatus.UNAUTHORIZED);

        const after = await dataSource
          .getRepository(User)
          .findOneOrFail({ where: { id: user.id }, select: { id: true, tokenVersion: true } });
        expect(after.tokenVersion).toBe(1);
      },
    );

    it('R9 — concurrent recovery serializes: one succeeds, its paired replay strictly revokes', async () => {
      const { user, original } = await rotateForRecovery();
      const [left, right] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/auth/refresh')
          .send({ refreshToken: original.refreshToken }),
        request(app.getHttpServer())
          .post('/api/auth/refresh')
          .send({ refreshToken: original.refreshToken }),
      ]);
      expect([left.status, right.status].sort()).toEqual([HttpStatus.OK, HttpStatus.UNAUTHORIZED]);

      const originalRow = await dataSource
        .getRepository(Session)
        .findOneOrFail({ where: { tokenHash: sha256(original.refreshToken) } });
      const familyRows = await dataSource
        .getRepository(Session)
        .find({ where: { familyId: originalRow.familyId } });
      const after = await dataSource
        .getRepository(User)
        .findOneOrFail({ where: { id: user.id }, select: { id: true, tokenVersion: true } });
      expect(originalRow.rotationGraceUsedAt).not.toBeNull();
      expect(familyRows.every((row) => row.revokedAt !== null)).toBe(true);
      expect(after.tokenVersion).toBe(1);
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

  describe('V1-V6 — verification code: one-time, expiring, attempt-capped, hashed, resend CLONES', () => {
    it('V1 — a code cannot verify twice: the second attempt finds the group already gone', async () => {
      const email = nextEmail();
      await insertCandidate(email, '111111');

      await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ email, code: '111111' })
        .expect(HttpStatus.OK);

      // "One-time" is now enforced by the candidate group being DELETED with the account's
      // creation, rather than by a `consumed_at` stamp on a surviving row.
      expect(await candidatesOf(email)).toHaveLength(0);

      const replay = await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ email, code: '111111' })
        .expect(HttpStatus.BAD_REQUEST);
      expect((replay.body as { message: string }).message).toBe('errors.verify.codeInvalid');
    });

    it('V2 — an expired code 400s, stays unusable, and is swept by the next insert for that address', async () => {
      const email = nextEmail();
      await insertCandidate(email, '222222', { expiresInMs: -1_000 });

      await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ email, code: '222222' })
        .expect(HttpStatus.BAD_REQUEST);

      // The row is NOT deleted by the failed verify — that is the deliberate change: no caller
      // without a valid code may remove a row. It is filtered out by time instead, and swept by
      // the bounded, same-address cleanup on the next insert path (the `AuthRateLimitService`
      // D12 pattern). Driven through DI rather than the resend ROUTE, to leave the
      // verify-email/resend budget to A4/T2/V5.
      expect(await candidatesOf(email)).toHaveLength(1);

      await emailVerification.resendCandidateCode(email);

      // Swept, and NOT replaced: an address whose only candidate had expired has nothing to
      // clone, so a resend must not conjure credentials out of nowhere.
      expect(await candidatesOf(email)).toHaveLength(0);
      expect(mailer.sentTo(email)).toHaveLength(0);
    });

    it('V3 — the 5th wrong attempt kills the CODE while the candidate survives to expiry', async () => {
      const email = nextEmail();
      await insertCandidate(email, '333333');

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await request(app.getHttpServer())
          .post('/api/auth/verify-email')
          .send({ email, code: '000000' })
          .expect(HttpStatus.BAD_REQUEST);
      }

      // The row is still THERE — the old table deleted it, and that deletion was a primitive any
      // caller who knew an address could reach. What dies is the code: the counter is at its
      // ceiling, so `verify` no longer considers the row, and the CHECK is not violated.
      const afterFive = await candidatesOf(email);
      expect(afterFive).toHaveLength(1);
      expect(afterFive[0]?.attemptCount).toBe(5);

      // Even the originally CORRECT code no longer matches anything. Asserted through DI rather
      // than a 6th HTTP call: this file's verify-email budget is spent by design and the
      // property under test is the service's, not the route's.
      await expect(emailVerification.verify(email, '333333')).rejects.toMatchObject({
        message: 'errors.verify.codeInvalid',
      });

      // …and the honest owner is NOT stranded: a resend clones the burned candidate's
      // credentials with a fresh code and a fresh budget. Before the rework, exhausting the
      // attempts destroyed the only copy of the submitted credentials.
      await emailVerification.resendCandidateCode(email);
      const afterResend = await candidatesOf(email);
      expect(afterResend).toHaveLength(2);
      const clone = afterResend.find((candidate) => candidate.id !== afterFive[0]?.id);
      expect(clone?.attemptCount).toBe(0);
      expect(clone?.passwordHash).toBe(afterFive[0]?.passwordHash);
    });

    it('V4 — the stored digest is neither the plain code nor its bare SHA-256, and it binds the ROW id', async () => {
      const email = nextEmail();
      const candidate = await insertCandidate(email, '444444');

      expect(candidate.codeHash.equals(Buffer.from('444444'))).toBe(false);
      expect(candidate.codeHash.equals(sha256(`pending:${candidate.id}:444444`))).toBe(false);
      expect(
        candidate.codeHash.equals(
          hmacSha256('wrong-pepper-not-the-real-one', `pending:${candidate.id}:444444`),
        ),
      ).toBe(false);
      expect(
        candidate.codeHash.equals(hmacSha256(hmacPepper, `pending:${candidate.id}:444444`)),
      ).toBe(true);

      // NON-TRANSFERABILITY, structurally: the same code under a SIBLING candidate's id produces
      // a different digest, which is what stops one candidate's code from materializing another.
      const sibling = await insertCandidate(email, '999999');
      expect(
        candidate.codeHash.equals(hmacSha256(hmacPepper, `pending:${sibling.id}:444444`)),
      ).toBe(false);
    });

    it('V5 — resend ADDS a code and cancels nothing: the code already in flight still verifies', async () => {
      // The inversion of what this case used to assert, and the reason is `VAL136-I1`: replacing
      // the active code handed anyone who merely knew an address the power to invalidate the code
      // its owner was typing. A resend now clones.
      const email = nextEmail();
      const original = await insertCandidate(email, '555555');

      await request(app.getHttpServer())
        .post('/api/auth/verify-email/resend')
        .send({ email })
        .expect(HttpStatus.ACCEPTED);

      const rows = await candidatesOf(email);
      expect(rows).toHaveLength(2);
      const clone = rows.find((row) => row.id !== original.id);
      expect(clone).toBeDefined();
      // Same credentials, different id, therefore a different digest.
      expect(clone?.passwordHash).toBe(original.passwordHash);
      expect(clone?.firstName).toBe(original.firstName);
      expect(clone?.id).not.toBe(original.id);
      expect(clone?.codeHash.equals(original.codeHash)).toBe(false);

      const sent = mailer.lastOfTemplate(email, 'verify-email');
      expect(sent).toBeDefined();

      // The ORIGINAL code — the one a third party would have destroyed — still works.
      await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ email, code: '555555' })
        .expect(HttpStatus.OK);

      // …and it created the account, taking the whole group — clone included — with it.
      const user = await dataSource.getRepository(User).findOneOrFail({ where: { email } });
      expect(user.status).toBe(AccountStatus.Active);
      expect(await candidatesOf(email)).toHaveLength(0);
    });

    /**
     * V6 pins D2 (`SEC136R2-I3`/`VAL136R2-I1`): once an address's candidate group carries MORE
     * THAN ONE credential identity, `resend` must write nothing and mail nothing — the victim's
     * own resend must never hand an attacker's credentials back into the victim's own mailbox.
     * The B-side (a single-identity group still clones, exactly as before) is already pinned by
     * V5 above; this case does not duplicate it.
     *
     * **Tightened in PR #136 round 4** (plan §9.2): `resendCandidateCode` used to return `void`,
     * so the only observable proof of a refusal was the absence of a write. It now returns a
     * {@link ResendOutcome}, and this case pins the REASON, not merely the absence of a throw.
     */
    it('V6 — resend for an address with MORE THAN ONE credential identity writes and mails nothing', async () => {
      const email = nextEmail();
      const victim = await insertCandidate(email, '616161', {
        passwordHash: SYNTHETIC_PASSWORD_HASH,
      });
      const attacker = await insertCandidate(email, '626262', {
        passwordHash: ATTACKER_PASSWORD_HASH,
      });

      // Positive control: the two candidates really DO carry different credentials — otherwise
      // this case measures nothing.
      expect(victim.passwordHash).not.toBe(attacker.passwordHash);

      const beforeCount = (await candidatesOf(email)).length;
      const beforeMailCount = mailer.sentTo(email).length;

      await expect(emailVerification.resendCandidateCode(email)).resolves.toBe('ambiguous-source');

      expect(await candidatesOf(email)).toHaveLength(beforeCount);
      expect(mailer.sentTo(email)).toHaveLength(beforeMailCount);
    });

    /**
     * V6b closes the gap V6 itself cannot see (PR #136 round 4, plan §4.5, §9.2): V6's victim
     * candidate is LIVE (the helper's default `expiresInMs` is 10 minutes), so `insertCandidate`'s
     * expired-row sweep never runs and round 3's defect — the refusal deleting the very evidence
     * it refused on — was invisible to every round's V6. Here the victim's candidate is EXPIRED,
     * which is exactly the shape `SEC136R3-I1`/`SFH136R3-I3` broke: a refused resend must write
     * NOTHING, so the SAME refusal still holds on the very next call.
     */
    it('V6b — a refused resend deletes NOTHING, so the same refusal still holds on the next call', async () => {
      const email = nextEmail();
      const victim = await insertCandidate(email, '616162', {
        passwordHash: SYNTHETIC_PASSWORD_HASH,
        expiresInMs: -1_000, // ALREADY DEAD — the shape V6 cannot see.
      });
      const attacker = await insertCandidate(email, '626263', {
        passwordHash: ATTACKER_PASSWORD_HASH,
      });
      // Positive control: the two candidates really DO carry different credentials.
      expect(victim.passwordHash).not.toBe(attacker.passwordHash);

      const before = (await candidatesOf(email)).map((row) => row.id).sort();
      await expect(emailVerification.resendCandidateCode(email)).resolves.toBe('ambiguous-source');
      expect((await candidatesOf(email)).map((row) => row.id).sort()).toEqual(before);

      // The SECOND call is the point: round 3's order swept the victim's DEAD row on the FIRST
      // refusal, so this second call saw a single-identity group and mailed the ATTACKER's clone.
      const mailsBefore = mailer.sentTo(email).length;
      await expect(emailVerification.resendCandidateCode(email)).resolves.toBe('ambiguous-source');
      expect(mailer.sentTo(email)).toHaveLength(mailsBefore);
      expect((await candidatesOf(email)).map((row) => row.id).sort()).toEqual(before);
    });

    /**
     * V7 pins `TA136R3-M2`: the clone-source re-indexing (`live[live.length - 1]`) had never been
     * exercised with MORE THAN ONE live SAME-identity candidate, so a misbinding of that index
     * (e.g. `live[0]`) would have broken nothing in the suite. Built with a raw, timestamp-explicit
     * insert (the `C4` pattern) so `createdAt` ordering is deterministic rather than a same-millisecond
     * race between two ordinary inserts.
     */
    it('V7 — resend clones the NEWEST live candidate when more than one shares the identity (TA136R3-M2)', async () => {
      const email = nextEmail();
      const now = Date.now();
      const idOlder = randomUUID();
      const idNewer = randomUUID();

      async function rawInsertLivePending(id: string, createdAtMs: number, firstName: string) {
        await dataSource.query(
          `INSERT INTO pending_registrations
             (id, email, password_hash, first_name, last_name, phone, account_role,
              education_level, grade_level, study_stream, university_name, department_name,
              district_id, locale, code_hash, expires_at, attempt_count, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
          [
            id,
            email,
            SYNTHETIC_PASSWORD_HASH,
            firstName,
            'Test',
            '+905000000001',
            AccountRole.Teacher,
            null,
            null,
            null,
            null,
            null,
            districtId,
            'tr',
            hmacSha256(hmacPepper, `pending:${id}:000000`),
            new Date(now + 10 * 60_000), // LIVE
            0,
            new Date(createdAtMs),
          ],
        );
      }

      // SAME identity (SYNTHETIC_PASSWORD_HASH), different `created_at`, both LIVE.
      await rawInsertLivePending(idOlder, now - 10 * 60_000, 'Older');
      await rawInsertLivePending(idNewer, now - 1_000, 'Newer');

      // Positive control: `created_at ASC` really does put the "Newer" row LAST.
      const ordered = await candidatesOf(email);
      expect(ordered.map((row) => row.firstName)).toEqual(['Older', 'Newer']);

      await expect(emailVerification.resendCandidateCode(email)).resolves.toBe('issued');

      const after = await candidatesOf(email);
      expect(after).toHaveLength(3);
      const clone = after.find((row) => row.id !== idOlder && row.id !== idNewer);
      expect(clone).toBeDefined();
      // The decisive assertion: the clone carries "Newer"'s profile, not "Older"'s — pinning
      // `live[live.length - 1]`, not `live[0]`.
      expect(clone?.firstName).toBe('Newer');
    });
  });

  // ── A-series — anti-enumeration ─────────────────────────────────────────────────────────

  describe('A1-A5 — anti-enumeration: known and unknown addresses are indistinguishable', () => {
    it('A1 — register: an unknown address and one that already has a candidate answer IDENTICAL 202s', async () => {
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
      // The interesting "known" case is no longer an UNVERIFIED `users` row — that state is
      // unreachable now — but an address that already carries a pending candidate, which is the
      // branch a second registration for the same address actually takes.
      await insertCandidate(knownEmail, '654321');
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

    it('A4 — resend: pending, unknown, and already-ACTIVE addresses all answer the SAME 202', async () => {
      const unverifiedEmail = nextEmail();
      await insertCandidate(unverifiedEmail, '777777');
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
      // Only the address with a pending candidate actually received a code — asserted separately
      // from the response shape, which by design says nothing about it. An address that already
      // owns an account has no candidate to clone, so nothing goes out and, crucially, nothing
      // about that account is touched.
      expect(mailer.sentTo(activeEmail)).toHaveLength(0);
      expect(await candidatesOf(activeEmail)).toHaveLength(0);
      expect(mailer.sentTo(unverifiedEmail).length).toBeGreaterThan(0);
    });

    it('A5 — concurrent registers for one address never 500 and never leak the address', async () => {
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

      // No account exists yet — registering does not create one any more — and the second call
      // did NOT silently discard its submission the way the old one-slot flow did. The
      // `UQ_users_email` race this case used to exercise moved to `verify`, where C2 drives it.
      expect(await dataSource.getRepository(User).find({ where: { email } })).toHaveLength(0);
      expect(await candidatesOf(email)).toHaveLength(2);
    });
  });

  // ── C-series — SEC136-C1: no submission is ever discarded or overwritten ────────────────

  /**
   * The CRITICAL finding's own pins. Before this rework, a second `register` for an address that
   * already had an unverified row hashed the new password, threw it away, and answered the same
   * 202 — so whoever registered an address FIRST owned its credentials, and the victim who later
   * confirmed their own mailbox activated the attacker's password on their own verified address.
   *
   * These run through DI rather than the routes on purpose (the file docblock's fixture
   * strategy): they are about the verify TRANSACTION's own behaviour under concurrency, and
   * driving them over HTTP would spend a throttle budget the V-series needs without measuring
   * anything extra.
   */
  describe('C1-C7 — two candidates coexist, and the code that is used decides the account', () => {
    function registerPayload(
      email: string,
      password: string,
      firstName: string,
    ): RegisterRequestDto {
      return {
        firstName,
        lastName: 'Aday',
        phone: '+905000000020',
        email,
        password,
        accountRole: AccountRole.Teacher,
        districtId,
        provincePlateCode: '34',
        locale: 'tr',
      };
    }

    async function readPasswordHash(email: string): Promise<string> {
      const user = await dataSource
        .getRepository(User)
        .createQueryBuilder('user')
        .addSelect('user.passwordHash')
        .where('user.email = :email', { email })
        .getOneOrFail();
      return user.passwordHash;
    }

    it('C1 — the CONSUMED code decides whose password and profile become the account', async () => {
      const email = nextEmail();

      // "Attacker first": a candidate nobody asked for, created with the attacker's credentials.
      await registration.register(registerPayload(email, 'Attacker-Pass1', 'Saldiran'));
      // The real owner then registers with their OWN password. Nothing is discarded, nothing is
      // overwritten — a SECOND candidate appears beside the first.
      await registration.register(registerPayload(email, 'Victim-Pass1', 'Kurban'));

      const candidates = await candidatesOf(email);
      expect(candidates).toHaveLength(2);
      // Identified by their own field, never by array position: `created_at` is a transaction
      // timestamp and two rows written microseconds apart can tie, so index order is not a fact
      // this file may assume (the `R1` lesson, applied here).
      const attackerCandidate = candidates.find((row) => row.firstName === 'Saldiran');
      const victimCandidate = candidates.find((row) => row.firstName === 'Kurban');
      expect(attackerCandidate).toBeDefined();
      expect(victimCandidate).toBeDefined();
      // The control that makes the assertion below mean something: the two candidates really do
      // carry different credentials, so "the right one materialized" is a real choice.
      expect(attackerCandidate?.passwordHash).not.toBe(victimCandidate?.passwordHash);

      const codes = mailer
        .sentTo(email)
        .filter((message) => message.template === 'verify-email')
        .map((message) => (message as { variables: { code: string } }).variables.code);
      expect(codes).toHaveLength(2);
      const victimCode = codes[1];
      if (victimCode === undefined) throw new Error('no second verification code recorded');

      await emailVerification.verify(email, victimCode);

      const users = await dataSource.getRepository(User).find({ where: { email } });
      expect(users).toHaveLength(1);
      expect(users[0]?.firstName).toBe('Kurban');
      expect(users[0]?.status).toBe(AccountStatus.Active);

      // The decisive assertion: the account opens with the password of the candidate whose code
      // was used, and NOT with the other one's. This is the exact chain `VAL136-C1` walked.
      const storedHash = await readPasswordHash(email);
      expect(storedHash).toBe(victimCandidate?.passwordHash);
      await expect(passwordHasher.verify(storedHash, 'Victim-Pass1')).resolves.toBe(true);
      await expect(passwordHasher.verify(storedHash, 'Attacker-Pass1')).resolves.toBe(false);

      // The rival candidate died with the group rather than lingering against a real account.
      expect(await candidatesOf(email)).toHaveLength(0);
    });

    it('C2 — two CONCURRENT verifies for one address create exactly one account, and never 500', async () => {
      // The `UQ_users_email` race moved here from `register` when registration stopped writing
      // `users`. The group lock serializes the pair; the loser sees an empty group and answers
      // the same 400 every other failure answers — and, like the old register race, it never
      // echoes the address (`E2E-A5`'s property, at its new home).
      const email = nextEmail();
      await insertCandidate(email, '101010');
      await insertCandidate(email, '202020');

      const outcomes = await Promise.allSettled([
        emailVerification.verify(email, '101010'),
        emailVerification.verify(email, '202020'),
      ]);
      const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
      const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      for (const outcome of rejected) {
        expect(JSON.stringify(outcome.reason)).not.toContain('@');
      }

      expect(await dataSource.getRepository(User).find({ where: { email } })).toHaveLength(1);
      expect(await candidatesOf(email)).toHaveLength(0);
    });

    it('C3 — SFH136-I1: a wrong guess charges every live candidate exactly once, even concurrently', async () => {
      const email = nextEmail();
      await insertCandidate(email, '303030');
      await insertCandidate(email, '404040');

      // The lost-update half. Before the row lock, two concurrent wrong guesses both read the
      // same counter and both wrote the same value, so the cap of 5 quietly never arrived.
      const concurrent = await Promise.allSettled([
        emailVerification.verify(email, '999999'),
        emailVerification.verify(email, '888888'),
      ]);
      expect(concurrent.every((outcome) => outcome.status === 'rejected')).toBe(true);
      const afterConcurrent = await candidatesOf(email);
      expect(afterConcurrent.map((candidate) => candidate.attemptCount)).toEqual([2, 2]);

      // The ceiling half. The reviewed remedy (`+ 1` then a separate DELETE) could produce 6 and
      // trip `CHK_pending_registrations_attempts` into a 500; the counter is clamped instead, and
      // the extra guesses below would have overflowed it.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await expect(emailVerification.verify(email, '777777')).rejects.toMatchObject({
          message: 'errors.verify.codeInvalid',
        });
      }
      const afterCeiling = await candidatesOf(email);
      expect(afterCeiling.map((candidate) => candidate.attemptCount)).toEqual([5, 5]);

      // Both codes are dead, and both rows are still THERE — no caller without a valid code
      // removed anything.
      await expect(emailVerification.verify(email, '303030')).rejects.toMatchObject({
        message: 'errors.verify.codeInvalid',
      });
      expect(await candidatesOf(email)).toHaveLength(2);
    });

    /**
     * C4 pins defect A (`SFH136R2-I1`/`VAL136R2-DL1`): the fix's whole claim is that ONE ordered
     * locking statement — not an unordered DELETE followed by an ordered SELECT — is what a
     * concurrent `verify` can never deadlock against, REGARDLESS of the group's physical row
     * order. This case builds that mismatch DIRECTLY (a row's physical position drifting away
     * from its `created_at` is what cleanup + autovacuum + FSM reuse produce naturally over time,
     * measured in Faz 1 at roughly 1 in 860 pairs) rather than trying to reproduce that rate: a
     * CI gate cannot assert a frequency, only a mechanism, so the case is DETERMINISTIC by
     * construction, not a replay of the natural odds.
     */
    it('C4 — a reversed physical row order still locks group-wide in ONE created_at ASC statement: no deadlock', async () => {
      const email = nextEmail();
      const now = Date.now();
      const idB = randomUUID();
      const idA = randomUUID();
      const idLive = randomUUID();

      async function rawInsertPending(id: string, createdAtMs: number, expiresInMs: number) {
        await dataSource.query(
          `INSERT INTO pending_registrations
             (id, email, password_hash, first_name, last_name, phone, account_role,
              education_level, grade_level, study_stream, university_name, department_name,
              district_id, locale, code_hash, expires_at, attempt_count, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
          [
            id,
            email,
            SYNTHETIC_PASSWORD_HASH,
            'Sec',
            'Test',
            '+905000000001',
            AccountRole.Teacher,
            null,
            null,
            null,
            null,
            null,
            districtId,
            'tr',
            hmacSha256(hmacPepper, `pending:${id}:000000`),
            new Date(now + expiresInMs),
            0,
            new Date(createdAtMs),
          ],
        );
      }

      // Physically FIRST (lowest ctid, inserted first), logically LAST (later `created_at`).
      await rawInsertPending(idB, now - 5 * 60_000, -60_000);
      // Physically SECOND, logically FIRST (earlier `created_at`).
      await rawInsertPending(idA, now - 10 * 60_000, -60_000);
      // A LIVE row — the clone source once the expired pair is swept.
      await rawInsertPending(idLive, now - 1_000, 10 * 60_000);

      // Positive control #1: physical order really IS the reverse of `created_at` order. If this
      // fails, the case has not built the mismatch it claims to measure against.
      const physicalOrder = await dataSource.query<{ id: string }[]>(
        `SELECT id FROM pending_registrations WHERE email = $1 ORDER BY ctid`,
        [email],
      );
      expect(physicalOrder.map((row) => row.id)).toEqual([idB, idA, idLive]);
      expect(await candidatesOf(email)).toHaveLength(3);

      let resendPromise: Promise<ResendOutcome> | undefined;
      await withHeldRowLock([idA], async (lockNext) => {
        // The stand-in for a concurrent `verify`: `E_a` is `created_at ASC`'s FIRST row, the
        // same first lock the fixed `insertCandidate` will also try to take.
        resendPromise = emailVerification.resendCandidateCode(email);

        // Positive control #2: the app is really BLOCKED on a row lock of this table.
        await waitForBlockedWaiter();

        // Lock `E_b` too, from the SAME test transaction — this succeeds immediately, because the
        // app's single locking statement is still queued behind `E_a` and has not reached `E_b`
        // yet. No cycle forms: the app only ever waits ON the test, never the reverse.
        await lockNext(idB);
      });

      // The test transaction's rollback (inside `withHeldRowLock`) released both locks, so the
      // app's queued statement can now finish: it acquires every lock in the SAME `created_at ASC`
      // order, sweeps the expired pair, and writes its clone. `resendCandidateCode` now returns a
      // `ResendOutcome` (PR #136 round 4, plan §5.3(a)); this group is single-identity (all three
      // rows share `SYNTHETIC_PASSWORD_HASH`), so the reorder in item 2 does not refuse it — it
      // still issues.
      if (!resendPromise) throw new Error('resend was never triggered');
      await expect(resendPromise).resolves.toBe('issued');

      const after = await candidatesOf(email);
      expect(after).toHaveLength(2);
      const clone = after.find((row) => row.id !== idLive);
      expect(clone).toBeDefined();
    });

    /**
     * C5 pins defect B (`SFH136R2-I1`'s second half): even against the FIXED, single-statement
     * lock order, a genuinely adversarial concurrent locker can still complete a classic two-party
     * deadlock cycle — the fix's job was never to make a deadlock impossible, only to make the
     * SAME-shaped writers (this class's own `insertCandidate`/`verify` pair) stop forming one, and
     * to make sure that when Postgres does kill a side, the route answers its published 202/400
     * rather than a 500 (`§6.2`'s anti-enumeration surface). Differs from C4 in building the loop
     * AGAINST the fixed code ON PURPOSE — a third party violating the lock-order convention is
     * always structurally possible — so the two cases pin two independent remedies.
     */
    it('C5 — a genuine deadlock against the fixed lock order still answers 202, never 500', async () => {
      const email = nextEmail();
      const r1 = await insertCandidate(email, '515151');
      const r2 = await insertCandidate(email, '525252');
      const beforeCount = (await candidatesOf(email)).length;
      expect(beforeCount).toBe(2);

      let resendPromise: Promise<request.Response> | undefined;
      await withHeldRowLock([r2.id], async (lockNext) => {
        // `supertest`'s `Test` object is LAZY: it does not actually dispatch the HTTP request
        // until something invokes `.then()`/`.end()` on it. Wrapping it in a `new Promise` whose
        // executor runs SYNCHRONOUSLY is what forces dispatch to happen NOW, inside this body,
        // rather than only once the outer test finally awaits `resendPromise` below — by which
        // point `withHeldRowLock`'s own rollback would already have released every lock and there
        // would be nothing left to contend with.
        resendPromise = new Promise<request.Response>((resolve, reject) => {
          request(app.getHttpServer())
            .post('/api/auth/verify-email/resend')
            .send({ email })
            .then(resolve, reject);
        });

        // Positive control: the app is really BLOCKED — it already holds `r1`'s lock (`created_at
        // ASC`'s first row) and is waiting on `r2`, which this transaction holds.
        await waitForBlockedWaiter();

        // Locking `r1` FROM HERE closes the cycle: the app waits on this transaction's `r2`, this
        // transaction now waits on the app's `r1`. Postgres's own deadlock detector breaks it —
        // measured 8/8 in Faz 1 as killing the FIRST waiter, i.e. the app.
        await lockNext(r1.id);
      });

      if (!resendPromise) throw new Error('resend route call was never captured');
      const resendResponse = await resendPromise;
      expect(resendResponse.status).toBe(HttpStatus.ACCEPTED);
      // The 202 above is a SWALLOWED contention, not a success: no new row was written.
      expect(await candidatesOf(email)).toHaveLength(beforeCount);
    });

    /**
     * C6 pins item 1 (`VAL136R3-DL2`, PR #136 round 4): `verify`'s group DELETE must name only
     * the ids ITS OWN locking SELECT returned. A fresh `WHERE email` statement (round 3's shape)
     * opens its OWN snapshot and can see — and delete — a row committed AFTER that SELECT ran.
     * The window is opened DETERMINISTICALLY with a test-scoped `BEFORE INSERT ON users` trigger,
     * de-risked end to end on live Postgres 16.15 in Phase 1 (plan §13.3): the pause really opens
     * (measured 1003 ms), the racing row really commits inside it, and survival flips exactly with
     * the delete shape.
     */
    it('C6 — verify deletes only the candidates it LOCKED; one that commits inside the window survives', async () => {
      const email = nextEmail();
      const code = '717171';
      await insertCandidate(email, code);

      // A test-scoped pause INSIDE verify's transaction, between its locking SELECT and its group
      // DELETE: `verify` inserts the `users` row in between, so a BEFORE INSERT trigger on `users`
      // is the one deterministic hook available without touching production code. Scoped to this
      // address by its WHEN clause, and dropped in `finally`.
      await dataSource.query(`
        CREATE OR REPLACE FUNCTION pg_temp_pause_users() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN PERFORM pg_sleep(1); RETURN NEW; END; $$;
      `);
      await dataSource.query(
        `CREATE TRIGGER c6_pause_users BEFORE INSERT ON "users" FOR EACH ROW
           WHEN (NEW."email" = '${email}') EXECUTE FUNCTION pg_temp_pause_users();`,
      );
      try {
        const verifyPromise = emailVerification.verify(email, code);
        await new Promise((resolve) => setTimeout(resolve, 300)); // verify is now inside the pause
        const racer = await insertCandidate(email, '818181'); // commits INSIDE the window
        await expect(verifyPromise).resolves.toBeDefined();

        // Positive control: the account really WAS materialized, so the DELETE really did run —
        // otherwise "the row survived" would only mean "verify never got there".
        const user = await dataSource.getRepository(User).findOneOrFail({ where: { email } });
        expect(user.status).toBe(AccountStatus.Active);

        const left = await candidatesOf(email);
        expect(left.map((row) => row.id)).toEqual([racer.id]);
      } finally {
        await dataSource.query('DROP TRIGGER IF EXISTS c6_pause_users ON "users"');
        await dataSource.query('DROP FUNCTION IF EXISTS pg_temp_pause_users()');
      }
    });

    /**
     * C7 pins `TA136R3-M1` (alias `SFH136R3-M4`): `verify`'s OWN contention branch (the
     * `isContentionFailure` catch inside `EmailVerificationService.verify`, distinct from C5's
     * target inside `insertCandidate`) had been executed by NO case in this suite — reverting it,
     * or misbinding which SQLSTATE it names, broke nothing. Same construction as C5, aimed at
     * `verify` instead of `resend`, and — unlike C5 — driven through DI (this file's
     * `verify-email` ROUTE budget is spent elsewhere; the property under test is the SERVICE's).
     */
    it('C7 — a genuine deadlock INSIDE verify itself still answers the same 400, never 500 (TA136R3-M1)', async () => {
      const email = nextEmail();
      const r1 = await insertCandidate(email, '717172');
      const r2 = await insertCandidate(email, '727273');
      const beforeCount = (await candidatesOf(email)).length;
      expect(beforeCount).toBe(2);

      let verifyPromise: Promise<unknown> | undefined;
      await withHeldRowLock([r2.id], async (lockNext) => {
        // The CORRECT code for `r1` — the point is that contention, not a wrong code, is what
        // swallows this call.
        verifyPromise = expect(emailVerification.verify(email, '717172')).rejects.toMatchObject({
          message: 'errors.verify.codeInvalid',
        });

        // Positive control: the app is really BLOCKED — it already holds `r1`'s lock (`created_at
        // ASC`'s first row, the same lock order `verify` and `insertCandidate` share) and is
        // waiting on `r2`, which this transaction holds.
        await waitForBlockedWaiter();

        // Locking `r1` FROM HERE closes the cycle, exactly as in C5.
        await lockNext(r1.id);
      });

      if (!verifyPromise) throw new Error('verify was never triggered');
      await verifyPromise;

      // The 400 above is a SWALLOWED contention, not "the code was actually wrong": no account was
      // created and both candidates are still there — the deadlock killed `verify`'s OWN
      // transaction before it could write anything.
      expect(await dataSource.getRepository(User).findOne({ where: { email } })).toBeNull();
      expect(await candidatesOf(email)).toHaveLength(beforeCount);
    });
  });

  // ── G-series — guard boundary ────────────────────────────────────────────────────────────

  describe('G1-G4 — AccessTokenGuard boundary', () => {
    it('G1 — no Authorization header 401s, and that 401 carries Cache-Control: no-store', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/session')
        .expect(HttpStatus.UNAUTHORIZED);
      // CODE136-I2/TA136-I1: this header was measurably ABSENT before `AuthNoStoreMiddleware`,
      // because `@Header` metadata is applied after guards and `AccessTokenGuard` throws first.
      expect(response.headers['cache-control']).toBe('no-store');
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

  describe('T1-T4 — identity-axis and IP-axis throttling', () => {
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
      const candidatesBeforeFourth = (await candidatesOf(email)).length;
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(payload)
        .expect(HttpStatus.ACCEPTED);
      const afterFourth = mailer.sentTo(email).length;
      expect(afterFourth).toBe(beforeFourth);
      // The refused call also writes nothing: the identity-axis limiter is what bounds how many
      // candidates one address can accumulate, which is the derivation
      // `PENDING_REGISTRATION_MAX_ACTIVE` rests on.
      expect(await candidatesOf(email)).toHaveLength(candidatesBeforeFourth);
    });

    it('T2 — resend cooldown (60s): a second immediate resend sends no new mail, still 202s', async () => {
      const email = nextEmail();
      await insertCandidate(email, '666666');

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

    it('T3 — the IP-axis 429 carries the published i18n key AND no-store (SEC84-P1: the trusted-client-bypass claim this title used to make is measured for real by test/throttle.e2e-spec.ts E-5 — this body never sets x-internal-request-token, so it cannot measure that)', async () => {
      const limit = AUTH_ROUTE_THROTTLES.logout.limit;
      let throttled: request.Response | undefined;
      for (let attempt = 0; attempt < limit + 1; attempt += 1) {
        const response = await request(app.getHttpServer())
          .post('/api/auth/logout')
          .send({ refreshToken: 'synthetic-unknown-token-for-throttle-probe' });
        if (Number(response.status) === Number(HttpStatus.TOO_MANY_REQUESTS)) {
          throttled = response;
          break;
        }
        expect(response.status).toBe(HttpStatus.NO_CONTENT);
      }
      expect(throttled).toBeDefined();

      // CODE136-I1/SEC136-I4: `errors.auth.rateLimited` was published in the contract and thrown
      // by nothing — the body was `@nestjs/throttler`'s English prose. This is the PRODUCTION
      // control the contract spec structurally cannot provide: it reads a real 429 body.
      const throttledBody = throttled?.body as { message?: string };
      expect(throttledBody.message).toBe(AUTH_ERROR_KEYS.rateLimited);
      // CODE136-I2/TA136-I1: the throttler is a guard, so this header was absent too.
      expect(throttled?.headers['cache-control']).toBe('no-store');
    });

    /**
     * T4 pins item 3 (`SFH136R3-I2`/`VAL136R3-RS2`, PR #136 round 4, plan §5.6): a resend refused
     * for credential ambiguity must NOT spend `VERIFY_RESEND_DAILY` — it produced no mail and the
     * refusal is not the caller's fault. Pinned from BOTH sides in one case, which is what stops a
     * later "fix" from refunding EVERY refusal: the honest, single-identity address (POSITIVE
     * control — the budget really IS spendable) still spends its unit, and only the contested
     * address is refunded.
     */
    it('T4 — a resend refused for credential ambiguity leaves the daily budget untouched; one that mails spends it', async () => {
      const dailyCount = async (email: string): Promise<number> => {
        const rows = await dataSource.query<{ attempt_count: number }[]>(
          `SELECT "attempt_count" FROM "auth_rate_limits" WHERE "scope" = $1 AND "subject_hash" = $2`,
          [
            AuthRateLimitScope.VerifyResendDaily,
            hmacSha256(hmacPepper, `rate:${AuthRateLimitScope.VerifyResendDaily}:${email}`),
          ],
        );
        return rows[0]?.attempt_count ?? 0;
      };

      // POSITIVE CONTROL first, on a single-identity address: the budget really IS spendable, so
      // a zero on the ambiguous address below means "refunded", not "this counter never moves".
      const honest = nextEmail();
      await insertCandidate(honest, '515152');
      await registration.resendVerification({ email: honest });
      expect(await dailyCount(honest)).toBe(1);
      expect(mailer.sentTo(honest)).toHaveLength(1);

      const contested = nextEmail();
      await insertCandidate(contested, '535354', { passwordHash: SYNTHETIC_PASSWORD_HASH });
      await insertCandidate(contested, '545455', { passwordHash: ATTACKER_PASSWORD_HASH });
      await registration.resendVerification({ email: contested });
      expect(await dailyCount(contested)).toBe(0);
      expect(mailer.sentTo(contested)).toHaveLength(0);

      // The cooldown axis is deliberately NOT asserted here — it is a SEPARATE contract (spent on
      // every call regardless), and if a later change also refunds it, this case must stay green.
    });
  });

  // ── N9 — the no-store boundary, from BOTH sides ─────────────────────────────────────────

  /**
   * Acceptance criterion #15, as CORRECTED by the PR #136 review and restated as a MECHANISM in
   * round 4 (`VAL136R3-NS1`: the count was wrong three rounds running — see
   * `AuthNoStoreMiddleware`'s own docblock for the full argument). The criterion states what the
   * middleware actually holds, and every side of it is pinned here — the covered classes above
   * (G1's guard 401, T3's throttler 429) and elsewhere in the suite (200/202/204/400 across
   * `auth-endpoints.e2e-spec.ts`), the two classes answered BEFORE the middleware stage (N9b, N9c
   * — PR #136 round 3, `CODE136R2-I4`), and Nest's own 404 for an UNREGISTERED `(path, method)`
   * pair under `/api/auth` (N9d, N9e — a class this file's earlier rounds never measured, PR #136
   * round 4 §6.2), plus the blast-radius check that a non-auth 404 carries nothing either way
   * (N9f).
   */
  describe('N9 — Cache-Control: no-store, stated as a mechanism and pinned from every side', () => {
    it('N9a — a service-thrown 401 carries no-store (the class that always worked)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: 'synthetic-unknown-refresh-token-for-no-store-probe' })
        .expect(HttpStatus.UNAUTHORIZED);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('N9b — a MALFORMED JSON body 400 does NOT carry it, and that boundary is asserted on purpose', async () => {
      // NEGATIVE pin. Express's body parser runs before any module middleware
      // (`NestApplication.init` registers it ahead of `registerModules`), so this response leaves
      // before `AuthNoStoreMiddleware` is reached — and `src/main.ts`, the only place the parser
      // could be reconfigured, is frozen. RFC 9110 §15.1 / 9111 §3 bound the exposure: 400 is
      // not heuristically cacheable, and the body carries neither token nor PII.
      //
      // This is asserted rather than ignored so that the day the boundary MOVES — a global
      // exception filter, a parser change, a `main.ts` unfreeze — this test goes red and the
      // docblock gets corrected with it, instead of drifting the way the original criterion did.
      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Content-Type', 'application/json')
        .send('{"refreshToken": ')
        .expect(HttpStatus.BAD_REQUEST);
      expect(response.headers['cache-control']).toBeUndefined();
    });

    it('N9c — a CORS preflight is the SECOND uncovered class, and it is pinned negatively', async () => {
      // NEGATIVE pin, the same shape as N9b. Two INDEPENDENT causes measured against the
      // installed framework (`AuthNoStoreMiddleware`'s own docblock carries the full argument):
      // `cors@2.8.6` answers and ends a preflight itself, before any module middleware runs; and,
      // independently, `@nestjs/core`'s `MiddlewareModule` binds this middleware to each route's
      // OWN declared method (POST/GET), so an `OPTIONS` request never matches any of them even if
      // `cors` did not answer first.
      //
      // This is asserted rather than ignored so that the day the boundary MOVES, this test goes
      // red and the docblock gets corrected with it, instead of drifting the way the original
      // criterion did.
      const response = await request(app.getHttpServer())
        .options('/api/auth/login')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');

      // Positive control: what was measured really IS a preflight, not a 404 or a CORS-less
      // response — either of which would ALSO lack `cache-control`, telling us nothing.
      expect(response.status).toBe(HttpStatus.NO_CONTENT);
      expect(response.headers['access-control-allow-origin']).toBeDefined();

      expect(response.headers['cache-control']).toBeUndefined();
    });

    it("N9d — GET /api/auth/login is a (path, method) pair AuthController does NOT register: Nest's own 404, no header", async () => {
      // NEGATIVE pin, and the class N9b/N9c never covered: `forRoutes(AuthController)` binds by
      // (path, method) pair, and this controller registers `POST /auth/login`, never `GET`. The
      // one-line fix (`auth{/*splat}`) is measured but NOT landed this round — recorded as
      // `FU-AUTH-NOSTORE-BINDING` (PR #136 round 4, Q2) — so this pin is deliberately NEGATIVE
      // today. Reverting the binding is not what turns this red; the binding is UNCHANGED this
      // round. What turns this red is the day someone lands the follow-up without updating this
      // test to its (then) POSITIVE form.
      const response = await request(app.getHttpServer()).get('/api/auth/login');

      // Positive control: this really is Nest's OWN 404 for an unmatched route, not some other
      // response that would also lack the header and tell us nothing.
      expect(response.status).toBe(HttpStatus.NOT_FOUND);
      expect((response.body as { statusCode?: number }).statusCode).toBe(404);
      expect(response.headers['cache-control']).toBeUndefined();
    });

    it("N9e — GET /api/auth (the bare prefix) is ALSO an unregistered pair: Nest's own 404, no header", async () => {
      // The case that distinguishes the two candidate binding patterns: `auth/{*splat}` (measured
      // incomplete, PR #136 round 4 §6.2) still misses the bare prefix; only `auth{/*splat}` would
      // cover it, and that is the follow-up, not this round's code.
      const response = await request(app.getHttpServer()).get('/api/auth');

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
      expect((response.body as { statusCode?: number }).statusCode).toBe(404);
      expect(response.headers['cache-control']).toBeUndefined();
    });

    it('N9f — a 404 on a NON-auth path never carries the header either way (blast-radius check)', async () => {
      // Positive/negative pair with N9d/N9e: this middleware is bound to AuthController's own
      // paths only, so a 404 outside `/api/auth` must stay header-free under EITHER binding
      // pattern — reverting `forRoutes(AuthController)` to something wider would be what turns
      // this red, and this round makes no such change.
      const response = await request(app.getHttpServer()).get('/api/provinces/does-not-exist');

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
      expect(response.headers['cache-control']).toBeUndefined();
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

      // POSITIVE CONTROL, and the reason this case is worth anything at all now (`CODE136-I5`):
      // the CORS layer is genuinely installed, so the preflight DOES answer with an
      // allow-origin header. Without this line the credentials assertion below would once again
      // be a check nothing can break.
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    });
  });
});
