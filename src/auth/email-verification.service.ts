import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AccountStatus } from './account.types';
import { AUTH_ERROR_KEYS } from './auth-error-keys';
import {
  EMAIL_VERIFICATION_MAX_ATTEMPTS,
  EMAIL_VERIFICATION_TTL_MINUTES,
  MAIL_SEND_TIMEOUT_MS,
} from './auth.constants';
import { AuthSecretsProvider } from './auth-secrets.provider';
import type { AuthResultDto } from './dto/auth-result.dto';
import { EmailVerificationCode } from './entities/email-verification-code.entity';
import { User } from './entities/user.entity';
import { MAILER_PORT, type MailerPort, type MailLocale } from './mail/mailer.port';
import { mintVerificationCode } from './opaque-token';
import { SessionService } from './session.service';
import { constantTimeEquals, hmacSha256 } from './token-digest';

/**
 * Code MECHANICS — mint, hash, consume, attempt cap (§5.3). `RegistrationService` owns the FLOW
 * decisions (which endpoint, which rate-limit scope, what the anti-enumeration response looks
 * like); this class never decides whether a code should be sent, only how one is produced,
 * stored and checked once that decision has been made.
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger('AUTH');

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(EmailVerificationCode)
    private readonly codes: Repository<EmailVerificationCode>,
    private readonly dataSource: DataSource,
    private readonly secrets: AuthSecretsProvider,
    @Inject(MAILER_PORT) private readonly mailer: MailerPort,
    private readonly sessions: SessionService,
  ) {}

  /**
   * `POST /api/auth/verify-email` (§6.1 #2). Correct code → 200 `AuthResultDto`, a FRESH session
   * (E2E-N2: verify-email opens a session, unlike password-reset/confirm). Every failure — no
   * user, no active code, expired code, wrong code — answers the SAME 400
   * `errors.verify.codeInvalid` (§2.4 S5: expired/invalid are deliberately indistinguishable).
   */
  async verify(email: string, code: string): Promise<AuthResultDto> {
    const user = await this.users.findOne({ where: { email } });
    if (!user) throw new BadRequestException(AUTH_ERROR_KEYS.verifyCodeInvalid);

    const activeCode = await this.codes.findOne({
      where: { userId: user.id, consumedAt: IsNull() },
    });
    if (!activeCode) throw new BadRequestException(AUTH_ERROR_KEYS.verifyCodeInvalid);

    if (activeCode.expiresAt.getTime() <= Date.now()) {
      await this.codes.delete({ id: activeCode.id });
      throw new BadRequestException(AUTH_ERROR_KEYS.verifyCodeInvalid);
    }

    const presentedHash = hmacSha256(this.secrets.getHmacPepper(), `verify:${user.id}:${code}`);
    if (!constantTimeEquals(presentedHash, activeCode.codeHash)) {
      // Fifth wrong attempt destroys the code (§5.3) — the user must request a new one.
      const nextAttemptCount = activeCode.attemptCount + 1;
      if (nextAttemptCount >= EMAIL_VERIFICATION_MAX_ATTEMPTS) {
        await this.codes.delete({ id: activeCode.id });
      } else {
        await this.codes.update({ id: activeCode.id }, { attemptCount: nextAttemptCount });
      }
      throw new BadRequestException(AUTH_ERROR_KEYS.verifyCodeInvalid);
    }

    const consumedAt = new Date();
    await this.dataSource.transaction(async (manager) => {
      await manager.update(EmailVerificationCode, { id: activeCode.id }, { consumedAt });
      await manager.update(
        User,
        { id: user.id },
        { status: AccountStatus.Active, emailVerifiedAt: consumedAt },
      );
    });

    return this.sessions.mintSessionForUser(user.id);
  }

  /**
   * Mints a fresh code for `user`, replacing any active one, and sends it. Shared by
   * `RegistrationService`'s brand-new-user branch and its resend flow — the ONE place a code is
   * ever produced.
   *
   * `UQ_email_verification_codes_active`'s partial unique index (§4.1) makes "at most one active
   * code per user" a SCHEMA invariant; the `DELETE` below is a courtesy that keeps the table
   * tidy, not what enforces the rule.
   */
  async issueVerificationCode(user: Pick<User, 'id' | 'email'>, locale: MailLocale): Promise<void> {
    const code = mintVerificationCode();
    const codeHash = hmacSha256(this.secrets.getHmacPepper(), `verify:${user.id}:${code}`);
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MINUTES * 60_000);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(EmailVerificationCode, { userId: user.id, consumedAt: IsNull() });
      await manager.insert(EmailVerificationCode, { userId: user.id, codeHash, expiresAt });
    });

    await this.sendMailFailSoft({
      template: 'verify-email',
      to: user.email,
      locale,
      variables: { code, expiresInMinutes: EMAIL_VERIFICATION_TTL_MINUTES },
    });
  }

  /** §8's fail-soft envelope: a 10s timeout, never a 5xx, one address/code/token-free log line. */
  private async sendMailFailSoft(message: Parameters<MailerPort['send']>[0]): Promise<void> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.mailer.send(message),
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error('mail send timeout')),
            MAIL_SEND_TIMEOUT_MS,
          );
        }),
      ]);
    } catch {
      this.logger.warn(`mail.send template=${message.template} outcome=failed`);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }
}
