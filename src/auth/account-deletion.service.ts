import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AUTH_ERROR_KEYS } from './auth-error-keys';
import { AuthRateLimitScope } from './auth.types';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { User } from './entities/user.entity';
import { PasswordHasherService, PasswordHashVerificationError } from './password-hasher.service';

/**
 * `DELETE /api/auth/account` (T-101) — the member permanently deletes their own account.
 *
 * **One statement deletes everything.** Every table that references `users` does so with
 * `ON DELETE CASCADE`: `sessions`, `password_reset_tokens`, `favorites`, `video_progress`,
 * `game_rounds` (so the member's leaderboard entries go with them),
 * `game_round_submit_rate_limits` and `measurements`. `test/auth-account-deletion.e2e-spec.ts`
 * seeds a row in each and asserts all are gone, so a future table added WITHOUT the cascade
 * fails there, by name, instead of turning this delete into a 23503. What is NOT keyed by the
 * user id — `pending_registrations` and `auth_rate_limits`, both keyed by address or its HMAC —
 * is short-lived and removed by `AuthRetentionCleanupTarget`.
 *
 * **Why the current password is required.** A stolen access token alone must not be able to
 * destroy an account. The check is the password-change one, and it spends the SAME
 * `PASSWORD_CHANGE_USER` budget on purpose: both routes accept a guess at the same password
 * from inside a session, and two budgets would double the guess rate an attacker gets.
 *
 * Deleting the row also ends every session: the refresh rows cascade, and a live access token
 * fails `AccessTokenGuard`'s user lookup on its next use.
 */
@Injectable()
export class AccountDeletionService {
  /** Bare literals only, as in `PasswordChangeService`: no substitution point for PII. */
  private readonly logger = new Logger('AUTH');

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly passwordHasher: PasswordHasherService,
    private readonly rateLimiter: AuthRateLimitService,
  ) {}

  async deleteAccount(userId: string, currentPassword: string): Promise<void> {
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

    if (!(await this.verifyFailClosed(user.passwordHash, currentPassword))) {
      throw new UnauthorizedException(AUTH_ERROR_KEYS.passwordCurrentInvalid);
    }

    const result = await this.users.delete({ id: userId });
    if (!result.affected) {
      // Deleted concurrently between the read and here: the account is gone either way.
      throw new UnauthorizedException(AUTH_ERROR_KEYS.unauthenticated);
    }
    this.logger.log('account.delete outcome=deleted');
  }

  /** Fail-closed like `PasswordChangeService.verifyFailClosed`, and logged for the same reason. */
  private async verifyFailClosed(storedHash: string, candidate: string): Promise<boolean> {
    try {
      return await this.passwordHasher.verify(storedHash, candidate);
    } catch (error) {
      if (!(error instanceof PasswordHashVerificationError)) throw error;
      this.logger.warn('account.delete.verify outcome=hash-integrity-failure');
      return false;
    }
  }
}
