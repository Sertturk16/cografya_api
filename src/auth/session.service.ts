import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AccountStatus } from './account.types';
import { AccessTokenService } from './access-token.service';
import { AUTH_ERROR_KEYS } from './auth-error-keys';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_ROTATION_GRACE_WINDOW_MS,
  REFRESH_TOKEN_TTL_DAYS,
} from './auth.constants';
import { AuthRateLimitScope, SessionRevocationReason } from './auth.types';
import { AuthRateLimitService } from './auth-rate-limit.service';
import type { AuthResultDto } from './dto/auth-result.dto';
import type { SessionDto } from './dto/session.dto';
import { Session } from './entities/session.entity';
import { User } from './entities/user.entity';
import { mintOpaqueToken } from './opaque-token';
import { PasswordHasherService, PasswordHashVerificationError } from './password-hasher.service';
import { sha256 } from './token-digest';

const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_SECONDS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;

/**
 * A properly-shaped, unreachable Argon2id hash used ONLY to normalize login timing for an
 * unknown address against a known one (§6.2's login row): running a REAL Argon2 verify — not a
 * shortcut compare — against a plausible-shaped hash costs the same time as a genuine
 * wrong-password attempt against a real account. Minted once, offline, from a fixed placeholder
 * string (`synthetic-anti-enumeration-timing-normalizer`) under `PASSWORD_HASH_OPTIONS`
 * (`password-hasher.service.ts`) — no live password, no live account, never derived from one.
 */
const SYNTHETIC_TIMING_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$APrKX34k6VE7WGm0QyxNUA$fUFGautIsXjwaF9PfALc5EeetF5UHJq43ElafSQOVPM';

/**
 * `refresh`'s transaction callback returns this instead of throwing — see the method's own
 * docblock for why a reject branch must still COMMIT its revocation writes.
 */
type RefreshOutcome =
  | { rejected: true }
  | { rejected: false; userId: string; tokenVersion: number; refreshTokenPlain: string };

/**
 * Login / refresh (rotation + reuse detection) / logout / current-session (§5.2, §6.1 #4,#5,#6,#9).
 */
@Injectable()
export class SessionService {
  /**
   * The ONE observability signal this class owns (`SFH136-I2`): the credential-verification
   * integrity branch below. Every line it writes is a bare string literal with no interpolation
   * at all — not merely "no PII", but no substitution point a later edit could quietly fill with
   * an address (`ENGINEERING.md` §3.6; §10's structural gate, whose own scan is what would catch
   * a regression here).
   */
  private readonly logger = new Logger('AUTH');

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    private readonly dataSource: DataSource,
    private readonly accessTokens: AccessTokenService,
    private readonly passwordHasher: PasswordHasherService,
    private readonly rateLimiter: AuthRateLimitService,
  ) {}

  /**
   * §6.1 #4. Anti-enumeration (§6.2's `login` row): an unknown address runs a REAL Argon2 verify
   * against {@link SYNTHETIC_TIMING_HASH} before answering, so the two 401 paths (unknown
   * address / wrong password) cost the same time and return the exact same body.
   */
  async login(email: string, password: string): Promise<AuthResultDto> {
    const identityLimit = await this.rateLimiter.consume(AuthRateLimitScope.LoginEmail, email);
    if (!identityLimit.allowed) {
      throw new HttpException(AUTH_ERROR_KEYS.tooManyAttempts, HttpStatus.TOO_MANY_REQUESTS);
    }

    // `passwordHash` carries `select: false` at the column level (§7.3); explicit `addSelect` is
    // the ONE way to read it — the `auth-core.e2e-spec.ts` precedent this mirrors exactly.
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();

    if (!user) {
      await this.passwordHasher.verify(SYNTHETIC_TIMING_HASH, password).catch(() => false);
      throw new UnauthorizedException(AUTH_ERROR_KEYS.invalidCredentials);
    }

    // `PasswordHasherService.verify` RETURNS `false` for a wrong password and THROWS only on an
    // internal integrity failure — a corrupt PHC string in the column, or Argon2 failing to
    // allocate its 19 MiB under load. The previous body-less `catch` collapsed that distinction
    // into the same silent 401, so a systemic outage was indistinguishable from ordinary
    // wrong-password traffic and produced not one log line anywhere (`SFH136-I2`).
    //
    // The RESPONSE deliberately does not change: this branch stays fail-closed and answers the
    // same `errors.auth.invalidCredentials`, because telling a caller "your hash is broken" is
    // both an oracle and useless to them. What changes is that an operator can now see it. Any
    // OTHER error propagates instead of being swallowed.
    let passwordMatches: boolean;
    try {
      passwordMatches = await this.passwordHasher.verify(user.passwordHash, password);
    } catch (error) {
      if (!(error instanceof PasswordHashVerificationError)) throw error;
      this.logger.warn('login.verify outcome=hash-integrity-failure');
      passwordMatches = false;
    }
    if (!passwordMatches) {
      throw new UnauthorizedException(AUTH_ERROR_KEYS.invalidCredentials);
    }

    // Only reachable by someone who already knows the correct password — not enumeration
    // (§6.2's login row, SPEC §2.1 md.4).
    if (user.status === AccountStatus.Unverified) {
      throw new ForbiddenException(AUTH_ERROR_KEYS.emailNotVerified);
    }
    if (user.status !== AccountStatus.Active) {
      throw new ForbiddenException(AUTH_ERROR_KEYS.accountDisabled);
    }

    return this.mintTokenPairAndSession(user.id, user.tokenVersion);
  }

  /**
   * §6.1 #5, §5.2.2/§5.2.3. One transaction, `SELECT … FOR UPDATE` on the presented row.
   * Every reject branch — no row, non-qualifying reuse, expired, inactive account — throws the SAME 401
   * `errors.auth.sessionExpired`, indistinguishable by response shape (§5.2.3).
   *
   * **The reject exception is thrown AFTER the transaction commits, never from inside it.**
   * `dataSource.transaction`'s callback ROLLS BACK the whole transaction when it throws — so a
   * `throw` inside the REUSE branch would silently undo the very family-revoke and
   * `token_version` bump that branch just wrote, leaving the reuse undetected on every
   * subsequent call even though this ONE response still (correctly) answered 401. The callback
   * therefore returns a plain discriminated outcome and commits normally on every branch; only
   * the caller, after the commit, decides whether to throw.
   */
  async refresh(presentedToken: string): Promise<AuthResultDto> {
    const presentedHash = sha256(presentedToken);

    const outcome = await this.dataSource.transaction(async (manager): Promise<RefreshOutcome> => {
      const sessionRepo = manager.getRepository(Session);

      const existing = await sessionRepo
        .createQueryBuilder('session')
        .setLock('pessimistic_write')
        .where('session.tokenHash = :presentedHash', { presentedHash })
        .getOne();

      if (!existing) {
        return { rejected: true };
      }

      if (existing.revokedAt !== null) {
        const recoveryStartedAt = new Date();
        const rotatedWithinGrace =
          existing.revokedReason === SessionRevocationReason.Rotated &&
          existing.rotationGraceUsedAt === null &&
          existing.revokedAt.getTime() + REFRESH_ROTATION_GRACE_WINDOW_MS >=
            recoveryStartedAt.getTime();

        if (rotatedWithinGrace) {
          const successors = await sessionRepo
            .createQueryBuilder('successor')
            .setLock('pessimistic_write')
            .where('successor.rotatedFromId = :rotatedFromId', { rotatedFromId: existing.id })
            .andWhere('successor.familyId = :familyId', { familyId: existing.familyId })
            .andWhere('successor.userId = :userId', { userId: existing.userId })
            .getMany();
          const successor = successors.length === 1 ? successors[0] : undefined;
          const user = await manager.getRepository(User).findOne({
            where: { id: existing.userId },
            select: { id: true, status: true, tokenVersion: true },
          });

          if (successor?.revokedAt === null && user?.status === AccountStatus.Active) {
            const recoveredTokenPlain = mintOpaqueToken();
            await sessionRepo.update(
              { id: existing.id, rotationGraceUsedAt: IsNull() },
              { rotationGraceUsedAt: recoveryStartedAt },
            );
            await sessionRepo.save(
              sessionRepo.create({
                userId: existing.userId,
                familyId: existing.familyId,
                tokenHash: sha256(recoveredTokenPlain),
                issuedAt: recoveryStartedAt,
                expiresAt: new Date(recoveryStartedAt.getTime() + REFRESH_TOKEN_TTL_MS),
                revokedAt: null,
                revokedReason: null,
                rotatedFromId: successor.id,
                rotationGraceUsedAt: null,
              }),
            );
            await sessionRepo.update(
              { id: successor.id, revokedAt: IsNull() },
              { revokedAt: recoveryStartedAt, revokedReason: SessionRevocationReason.Rotated },
            );
            return {
              rejected: false,
              userId: user.id,
              tokenVersion: user.tokenVersion + 1,
              refreshTokenPlain: recoveredTokenPlain,
            };
          }
        }

        // REUSE DETECTED (§5.2.3): the WHOLE family dies, and the user's token_version bumps so
        // every live access token — not just this family's — is invalidated at once.
        await sessionRepo.update(
          { familyId: existing.familyId, revokedAt: IsNull() },
          { revokedAt: new Date(), revokedReason: SessionRevocationReason.ReuseDetected },
        );
        await manager.getRepository(User).increment({ id: existing.userId }, 'tokenVersion', 1);
        return { rejected: true };
      }

      if (existing.expiresAt.getTime() <= Date.now()) {
        await sessionRepo.update(
          { id: existing.id },
          { revokedAt: new Date(), revokedReason: SessionRevocationReason.Expired },
        );
        return { rejected: true };
      }

      const user = await manager.getRepository(User).findOne({
        where: { id: existing.userId },
        select: { id: true, status: true, tokenVersion: true },
      });
      if (!user || user.status !== AccountStatus.Active) {
        await sessionRepo.update(
          { familyId: existing.familyId, revokedAt: IsNull() },
          { revokedAt: new Date(), revokedReason: SessionRevocationReason.AccountInactive },
        );
        return { rejected: true };
      }

      const rotatedTokenPlain = mintOpaqueToken();
      const issuedAt = new Date();
      await sessionRepo.save(
        sessionRepo.create({
          userId: existing.userId,
          familyId: existing.familyId,
          tokenHash: sha256(rotatedTokenPlain),
          issuedAt,
          expiresAt: new Date(issuedAt.getTime() + REFRESH_TOKEN_TTL_MS),
          revokedAt: null,
          revokedReason: null,
          rotatedFromId: existing.id,
          rotationGraceUsedAt: null,
        }),
      );
      await sessionRepo.update(
        { id: existing.id },
        { revokedAt: issuedAt, revokedReason: SessionRevocationReason.Rotated },
      );

      return {
        rejected: false,
        userId: user.id,
        tokenVersion: user.tokenVersion,
        refreshTokenPlain: rotatedTokenPlain,
      };
    });

    if (outcome.rejected) {
      throw new UnauthorizedException(AUTH_ERROR_KEYS.sessionExpired);
    }

    const accessToken = await this.accessTokens.mint(outcome.userId, outcome.tokenVersion);
    return {
      accessToken,
      accessTokenExpiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
      refreshToken: outcome.refreshTokenPlain,
      refreshTokenExpiresInSeconds: REFRESH_TOKEN_TTL_SECONDS,
    };
  }

  /** §6.1 #6. Always 204 — an unrecognised token is indistinguishable from a known one (D-safe). */
  async logout(presentedToken: string): Promise<void> {
    const presentedHash = sha256(presentedToken);
    const existing = await this.sessions.findOne({ where: { tokenHash: presentedHash } });
    if (!existing) return;

    await this.sessions.update(
      { familyId: existing.familyId, revokedAt: IsNull() },
      { revokedAt: new Date(), revokedReason: SessionRevocationReason.Logout },
    );
  }

  /** §6.1 #9 — the guard already proved the caller; this reads only the minimum PII set (§7.3). */
  async getCurrentSession(userId: string): Promise<SessionDto> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, firstName: true, accountRole: true },
    });
    if (!user) throw new UnauthorizedException(AUTH_ERROR_KEYS.unauthenticated);
    return { id: user.id, firstName: user.firstName, accountRole: user.accountRole };
  }

  /** Used by `EmailVerificationService` after a successful code check — verify-email logs the user in. */
  async mintSessionForUser(userId: string): Promise<AuthResultDto> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, tokenVersion: true },
    });
    if (!user) {
      throw new UnauthorizedException(AUTH_ERROR_KEYS.unauthenticated);
    }
    return this.mintTokenPairAndSession(user.id, user.tokenVersion);
  }

  private async mintTokenPairAndSession(
    userId: string,
    tokenVersion: number,
  ): Promise<AuthResultDto> {
    const refreshTokenPlain = mintOpaqueToken();
    const issuedAt = new Date();

    await this.sessions.insert({
      userId,
      familyId: randomUUID(),
      tokenHash: sha256(refreshTokenPlain),
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + REFRESH_TOKEN_TTL_MS),
      revokedAt: null,
      revokedReason: null,
      rotatedFromId: null,
      rotationGraceUsedAt: null,
    });

    const accessToken = await this.accessTokens.mint(userId, tokenVersion);
    return {
      accessToken,
      accessTokenExpiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
      refreshToken: refreshTokenPlain,
      refreshTokenExpiresInSeconds: REFRESH_TOKEN_TTL_SECONDS,
    };
  }
}
