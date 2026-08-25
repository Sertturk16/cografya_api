import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AuthRateLimitScope, SessionRevocationReason } from './auth.types';
import { MAIL_SEND_TIMEOUT_MS, PASSWORD_RESET_TTL_MINUTES } from './auth.constants';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthSecretsProvider } from './auth-secrets.provider';
import { AUTH_ERROR_KEYS } from './auth-error-keys';
import { Session } from './entities/session.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { User } from './entities/user.entity';
import { MAILER_PORT, type MailerPort, type MailMessage } from './mail/mailer.port';
import { mintOpaqueToken } from './opaque-token';
import { PasswordHasherService } from './password-hasher.service';
import { sha256 } from './token-digest';

/**
 * Şifre sıfırlama: forgot (§6.1 #7) + confirm (§6.1 #8, §5.4.3). `confirm`'ün şifre politikası
 * kontrolü BU sınıfta yaşamaz — `PasswordResetConfirmDto.password`'ün
 * `IsPasswordPolicyCompliant()` dekoratörü, global `ValidationPipe` tarafından bu servis hiç
 * çağrılmadan ÖNCE çalışır, yani §6.2'nin "şifre politikası jetondan önce kontrol edilir"
 * sırası DTO doğrulamasının kendi çalışma zamanından doğal olarak gelir (ayrı bir sıralama kodu
 * gerekmez).
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger('AUTH');

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(PasswordResetToken)
    private readonly resetTokens: Repository<PasswordResetToken>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    private readonly dataSource: DataSource,
    private readonly secrets: AuthSecretsProvider,
    private readonly passwordHasher: PasswordHasherService,
    private readonly rateLimiter: AuthRateLimitService,
    @Inject(MAILER_PORT) private readonly mailer: MailerPort,
  ) {}

  /**
   * §6.1 #7. Always 202, gövdesiz — §9.2: tavan aşımı cevabı değiştirmez, yalnız e-posta gitmez.
   * Bilinmeyen bir adres de aynı 202'yi görür (§6.2's `password-reset/request` row).
   */
  async requestReset(email: string): Promise<void> {
    const rateLimit = await this.rateLimiter.consume(AuthRateLimitScope.PasswordResetEmail, email);
    if (!rateLimit.allowed) return;

    const user = await this.users.findOne({ where: { email } });
    if (!user) return;

    const tokenPlain = mintOpaqueToken();
    const tokenHash = sha256(tokenPlain);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000);

    await this.resetTokens.insert({ userId: user.id, tokenHash, expiresAt, consumedAt: null });

    await this.sendMailFailSoft({
      template: 'password-reset',
      to: user.email,
      // Bare-token requests carry no stored locale (§21 takip, `RegistrationService`'in aynı
      // notu) — 'tr' varsayılan.
      locale: 'tr',
      variables: { resetToken: tokenPlain, expiresInMinutes: PASSWORD_RESET_TTL_MINUTES },
    });
  }

  /**
   * §6.1 #8, §5.4.3's transaction. Jeton geçersizse ya da süresi geçmişse 400
   * `errors.password.resetTokenInvalid` — bilinen/bilinmeyen adres ayrımı yoktur, çünkü jeton
   * zaten adresi taşımaz.
   */
  async confirmReset(presentedToken: string, newPassword: string): Promise<void> {
    const tokenHash = sha256(presentedToken);
    const token = await this.resetTokens.findOne({
      where: { tokenHash, consumedAt: IsNull() },
    });
    if (!token || token.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(AUTH_ERROR_KEYS.resetTokenInvalid);
    }

    const passwordHash = await this.passwordHasher.hash(newPassword);
    const now = new Date();

    await this.dataSource.transaction(async (manager) => {
      // 1. The presented token is consumed.
      await manager.update(PasswordResetToken, { id: token.id }, { consumedAt: now });
      // 2. Every OTHER unconsumed reset token for this user is consumed too (§5.4.3 step 2).
      await manager.update(
        PasswordResetToken,
        { userId: token.userId, consumedAt: IsNull() },
        { consumedAt: now },
      );
      // 3. The new password lands, and token_version bumps — every live access token dies.
      await manager.increment(User, { id: token.userId }, 'tokenVersion', 1);
      await manager.update(User, { id: token.userId }, { passwordHash });
      // 4. Every live refresh family for this user is revoked — "reset iptal eder" made real.
      await manager.update(
        Session,
        { userId: token.userId, revokedAt: IsNull() },
        { revokedAt: now, revokedReason: SessionRevocationReason.PasswordReset },
      );
    });
    // 204, no body: reset does NOT open a session — the user logs in again (§5.4.3).
  }

  /** §8's fail-soft envelope: a 10s timeout, never a 5xx, one address/code/token-free log line. */
  private async sendMailFailSoft(message: MailMessage): Promise<void> {
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
