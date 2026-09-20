import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AUTH_ERROR_KEYS } from './auth-error-keys';
import { AuthRateLimitScope, SessionRevocationReason } from './auth.types';
import { AuthRateLimitService } from './auth-rate-limit.service';
import type { AuthResultDto } from './dto/auth-result.dto';
import { Session } from './entities/session.entity';
import { User } from './entities/user.entity';
import { PasswordHasherService, PasswordHashVerificationError } from './password-hasher.service';
import { SessionService } from './session.service';

/**
 * `POST /api/auth/password/change` (T-061) — the authenticated counterpart to
 * `PasswordResetService`, and the only way a signed-in member changes their password.
 *
 * **Why this exists at all.** Before T-061 the sole path was the forgot-password flow, which
 * asks a signed-in member for the e-mail address they are already signed in with and then
 * needs a mailbox round trip to finish. With `MAIL_TRANSPORT` in SES sandbox that round trip
 * reaches nobody, so a member could not change their password by any route.
 *
 * **What it does NOT share with the reset flow.** Reset proves possession of a MAILBOX and
 * therefore must close every session, forcing a fresh login. This route proves possession of
 * the CURRENT PASSWORD from inside a live session, so closing that session too would punish
 * the one actor already known to be legitimate. Every OTHER session still dies — that is the
 * point of changing a password — and the caller is handed a fresh pair in the same response.
 */
@Injectable()
export class PasswordChangeService {
  /**
   * One signal, in the shape `SFH136-I2` fixed on login: a bare string literal with no
   * interpolation at all, so no later edit has a substitution point to quietly fill with PII.
   */
  private readonly logger = new Logger('AUTH');

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly passwordHasher: PasswordHasherService,
    private readonly sessions: SessionService,
    private readonly rateLimiter: AuthRateLimitService,
  ) {}

  /**
   * Order is load-bearing and pinned test by test:
   *
   * 1. Spend the identity-axis budget FIRST, so a guessing loop is bounded before any Argon2
   *    work is done on its behalf.
   * 2. Read the row with an explicit `addSelect('user.passwordHash')` — the column carries
   *    `select: false` (§7.3), and this is the one way to read it, exactly as login does.
   * 3. Verify the presented current password. A `PasswordHashVerificationError` — a corrupt
   *    PHC string, or Argon2 failing to allocate — is fail-closed into the same answer a wrong
   *    password gets, and logged; any OTHER error propagates rather than being swallowed.
   * 4. Refuse a new password identical to the current one. Checked by verifying the NEW
   *    password against the stored hash rather than comparing the two plaintexts, so it holds
   *    even when the client sends the same value in a different form.
   * 5. In one transaction: bump `tokenVersion` (every live access token dies), store the new
   *    hash, revoke every live refresh family.
   * 6. Mint a fresh pair against the BUMPED version. Minting against the old one would hand
   *    the caller a token their own change had just killed.
   */
  async change(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<AuthResultDto> {
    const budget = await this.rateLimiter.consume(AuthRateLimitScope.PasswordChange, userId);
    if (!budget.allowed) {
      throw new HttpException(AUTH_ERROR_KEYS.tooManyAttempts, HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :userId', { userId })
      .getOne();

    if (!user) {
      throw new UnauthorizedException(AUTH_ERROR_KEYS.unauthenticated);
    }

    if (!(await this.verifyFailClosed(user.passwordHash, currentPassword, 'current'))) {
      throw new UnauthorizedException(AUTH_ERROR_KEYS.passwordCurrentInvalid);
    }

    if (await this.verifyFailClosed(user.passwordHash, newPassword, 'replacement')) {
      // 400, not 401: the caller PROVED who they are one line above. This is a bad field
      // value, and answering 401 would also invite a client to treat it as a dead session.
      throw new BadRequestException(AUTH_ERROR_KEYS.passwordUnchanged);
    }

    const passwordHash = await this.passwordHasher.hash(newPassword);
    const now = new Date();

    await this.dataSource.transaction(async (manager) => {
      await manager.increment(User, { id: userId }, 'tokenVersion', 1);
      await manager.update(User, { id: userId }, { passwordHash });
      await manager.update(
        Session,
        { userId, revokedAt: IsNull() },
        { revokedAt: now, revokedReason: SessionRevocationReason.PasswordReset },
      );
    });

    return this.sessions.issueSession(userId, user.tokenVersion + 1);
  }

  /**
   * `PasswordHasherService.verify` RETURNS false for a mismatch and THROWS only on an internal
   * integrity failure. Collapsing both into a silent false would make a systemic outage
   * indistinguishable from ordinary wrong-password traffic and produce no log line anywhere —
   * the exact gap `SFH136-I2` closed on login. The response stays fail-closed either way;
   * what changes is that an operator can see it.
   */
  private async verifyFailClosed(
    storedHash: string,
    candidate: string,
    which: 'current' | 'replacement',
  ): Promise<boolean> {
    try {
      return await this.passwordHasher.verify(storedHash, candidate);
    } catch (error) {
      if (!(error instanceof PasswordHashVerificationError)) throw error;
      if (which === 'current') {
        this.logger.warn('password-change.verify outcome=hash-integrity-failure');
      } else {
        this.logger.warn('password-change.reuse-check outcome=hash-integrity-failure');
      }
      return false;
    }
  }
}
