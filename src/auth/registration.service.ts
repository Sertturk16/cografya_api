import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { AccountStatus } from './account.types';
import { AuthRateLimitScope } from './auth.types';
import { AuthRateLimitService } from './auth-rate-limit.service';
import type { ResendVerificationRequestDto } from './dto/resend-verification-request.dto';
import type { RegisterRequestDto } from './dto/register-request.dto';
import { EmailVerificationService } from './email-verification.service';
import { User } from './entities/user.entity';
import { MAILER_PORT, type MailerPort, type MailMessage } from './mail/mailer.port';
import { MAIL_SEND_TIMEOUT_MS } from './auth.constants';
import { PasswordHasherService } from './password-hasher.service';

/** Postgres unique-violation SQLSTATE — `users.email`'s `UQ_users_email` (E2E-A5). */
const UNIQUE_VIOLATION_SQLSTATE = '23505';

/**
 * `POST /api/auth/register` and `POST /api/auth/verify-email/resend` — "register + resend akışı"
 * (§6.1, §6.2, D15). Ownership split from `EmailVerificationService`: this class decides WHAT
 * happens for a given address/status combination (the anti-enumeration branching and the
 * identity-axis rate-limit scopes) — `EmailVerificationService` owns HOW a code is minted,
 * hashed, stored and consumed, so `issueVerificationCode` is called from both this class' two
 * flows and never duplicated.
 */
@Injectable()
export class RegistrationService {
  private readonly logger = new Logger('AUTH');

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly passwordHasher: PasswordHasherService,
    private readonly rateLimiter: AuthRateLimitService,
    private readonly emailVerification: EmailVerificationService,
    @Inject(MAILER_PORT) private readonly mailer: MailerPort,
  ) {}

  /**
   * §6.1 #1, §6.2's `register` row. Always 202, gövdesiz — every branch below returns `void`
   * rather than a distinguishable result.
   */
  async register(dto: RegisterRequestDto): Promise<void> {
    // D15: districtId must exist and belong to provincePlateCode — one query, no class-validator
    // DB constraint (src/main.ts is frozen, Y1; no `useContainer` is wired).
    await this.assertDistrictBelongsToProvince(dto.districtId, dto.provincePlateCode);

    // Timing normalization (§6.2): the password is hashed on EVERY branch, known address or not,
    // so an attacker cannot distinguish the two paths by response latency.
    const passwordHash = await this.passwordHasher.hash(dto.password);

    // D11/§9.2: the identity-axis counter increments even for an address that does not exist,
    // and its outcome NEVER changes this endpoint's response — only whether mail goes out.
    const rateLimit = await this.rateLimiter.consume(AuthRateLimitScope.RegisterEmail, dto.email);
    if (!rateLimit.allowed) return;

    const existing = await this.users.findOne({ where: { email: dto.email } });

    if (!existing) {
      const created = await this.createUnverifiedUser(dto, passwordHash);
      if (!created) return; // unique-violation race — treated as "address exists", silently.
      await this.emailVerification.issueVerificationCode(created, dto.locale);
      return;
    }

    if (existing.status === AccountStatus.Unverified) {
      await this.regenerateCodeForUnverifiedUser(existing.email, dto.locale);
      return;
    }

    if (existing.status === AccountStatus.Active) {
      await this.sendMailFailSoft({
        template: 'account-exists',
        to: existing.email,
        locale: dto.locale,
        variables: {},
      });
      return;
    }

    // DISABLED / PENDING_DELETION — nothing goes out, nothing is written.
  }

  /** §6.1 #3, §6.2's `resend` row. Always 202, gövdesiz. */
  async resendVerification(dto: ResendVerificationRequestDto): Promise<void> {
    await this.regenerateCodeForUnverifiedUser(dto.email, 'tr');
  }

  /**
   * Shared by `register`'s known-UNVERIFIED branch and the dedicated resend endpoint: the
   * cooldown/daily gate, then a fresh code via `EmailVerificationService.issueVerificationCode`.
   *
   * `locale` defaults to `'tr'` on the bare resend path: neither `ResendVerificationRequestDto`
   * nor `User` carries a stored locale (the entity has none — UYELIK-01's shape), so a resend
   * triggered outside a fresh `register` call has no recorded language to honour. This is a
   * self-contained default, not a plan gap: `RegisterRequestDto.locale` already defaults to
   * `'tr'` for the same reason.
   */
  private async regenerateCodeForUnverifiedUser(
    email: string,
    locale: MailMessage['locale'],
  ): Promise<void> {
    const cooldown = await this.rateLimiter.consume(AuthRateLimitScope.VerifyResendCooldown, email);
    if (!cooldown.allowed) return;
    const daily = await this.rateLimiter.consume(AuthRateLimitScope.VerifyResendDaily, email);
    if (!daily.allowed) return;

    const user = await this.users.findOne({ where: { email } });
    if (!user || user.status !== AccountStatus.Unverified) return;

    await this.emailVerification.issueVerificationCode(user, locale);
  }

  /**
   * Inserts the new row. Returns `null` on a `users.email` unique-violation race instead of
   * throwing: Postgres's own `detail` on that error carries the address
   * (`Key (email)=(…)`), so this catch is the ONE place that error is allowed to reach — it is
   * neither logged nor re-thrown (E2E-A5).
   */
  private async createUnverifiedUser(
    dto: RegisterRequestDto,
    passwordHash: string,
  ): Promise<User | null> {
    try {
      return await this.users.save(
        this.users.create({
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          email: dto.email,
          passwordHash,
          accountRole: dto.accountRole,
          educationLevel: dto.educationLevel ?? null,
          gradeLevel: dto.gradeLevel ?? null,
          studyStream: dto.studyStream ?? null,
          universityName: dto.universityName ?? null,
          departmentName: dto.departmentName ?? null,
          districtId: dto.districtId,
          status: AccountStatus.Unverified,
          emailVerifiedAt: null,
        }),
      );
    } catch (error) {
      const sqlState = (error as QueryFailedError & { code?: string }).code;
      if (error instanceof QueryFailedError && sqlState === UNIQUE_VIOLATION_SQLSTATE) {
        return null;
      }
      throw error;
    }
  }

  private async assertDistrictBelongsToProvince(
    districtId: string,
    provincePlateCode: string,
  ): Promise<void> {
    const rows = await this.dataSource.query<{ id: string }[]>(
      `SELECT d.id
         FROM districts d
         INNER JOIN provinces p ON p.id = d.province_id
        WHERE d.id = $1 AND p.plate_code = $2`,
      [districtId, provincePlateCode],
    );
    if (rows.length === 0) {
      throw new BadRequestException([
        'districtId must exist and belong to the province named by provincePlateCode',
      ]);
    }
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
