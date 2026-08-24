import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AccountStatus } from './account.types';
import { AccessTokenService } from './access-token.service';
import { AUTH_ERROR_KEYS } from './auth-error-keys';
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_DAYS } from './auth.constants';
import { AuthRateLimitScope, SessionRevocationReason } from './auth.types';
import { AuthRateLimitService } from './auth-rate-limit.service';
import type { AuthResultDto } from './dto/auth-result.dto';
import type { SessionDto } from './dto/session.dto';
import { Session } from './entities/session.entity';
import { User } from './entities/user.entity';
import { mintOpaqueToken } from './opaque-token';
import { PasswordHasherService } from './password-hasher.service';
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
 * Login / refresh (rotation + reuse detection) / logout / current-session (§5.2, §6.1 #4,#5,#6,#9).
 */
@Injectable()
export class SessionService {
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

    let passwordMatches: boolean;
    try {
      passwordMatches = await this.passwordHasher.verify(user.passwordHash, password);
    } catch {
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
   * Every reject branch — no row, reuse, expired, inactive account — throws the SAME 401
   * `errors.auth.sessionExpired`, indistinguishable by response shape (§5.2.3).
   */
  async refresh(presentedToken: string): Promise<AuthResultDto> {
    const presentedHash = sha256(presentedToken);

    return this.dataSource.transaction(async (manager) => {
      const sessionRepo = manager.getRepository(Session);

      const existing = await sessionRepo
        .createQueryBuilder('session')
        .setLock('pessimistic_write')
        .where('session.tokenHash = :presentedHash', { presentedHash })
        .getOne();

      if (!existing) {
        throw new UnauthorizedException(AUTH_ERROR_KEYS.sessionExpired);
      }

      if (existing.revokedAt !== null) {
        // REUSE DETECTED (§5.2.3): the WHOLE family dies, and the user's token_version bumps so
        // every live access token — not just this family's — is invalidated at once.
        await sessionRepo.update(
          { familyId: existing.familyId, revokedAt: IsNull() },
          { revokedAt: new Date(), revokedReason: SessionRevocationReason.ReuseDetected },
        );
        await manager.getRepository(User).increment({ id: existing.userId }, 'tokenVersion', 1);
        throw new UnauthorizedException(AUTH_ERROR_KEYS.sessionExpired);
      }

      if (existing.expiresAt.getTime() <= Date.now()) {
        await sessionRepo.update(
          { id: existing.id },
          { revokedAt: new Date(), revokedReason: SessionRevocationReason.Expired },
        );
        throw new UnauthorizedException(AUTH_ERROR_KEYS.sessionExpired);
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
        throw new UnauthorizedException(AUTH_ERROR_KEYS.sessionExpired);
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
        }),
      );
      await sessionRepo.update(
        { id: existing.id },
        { revokedAt: issuedAt, revokedReason: SessionRevocationReason.Rotated },
      );

      const accessToken = await this.accessTokens.mint(user.id, user.tokenVersion);
      return {
        accessToken,
        accessTokenExpiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
        refreshToken: rotatedTokenPlain,
        refreshTokenExpiresInSeconds: REFRESH_TOKEN_TTL_SECONDS,
      };
    });
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
