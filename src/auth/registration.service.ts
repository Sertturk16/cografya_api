import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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

/**
 * `POST /api/auth/register` and `POST /api/auth/verify-email/resend` — "register + resend akışı"
 * (§6.1, §6.2, D15). Ownership split from `EmailVerificationService`: this class decides WHAT
 * happens for a given address/status combination (the anti-enumeration branching and the
 * identity-axis rate-limit scopes) — `EmailVerificationService` owns HOW a candidate is stored,
 * how its code is hashed and consumed, and how a verified candidate becomes a `users` row.
 *
 * **This class no longer writes to `users` at all** (`SEC136-C1`). Registering used to INSERT an
 * UNVERIFIED account immediately, which made the row a one-slot resource an unauthenticated
 * caller could claim and made every later submission for the same address a silent no-op. The
 * account is now created in `verify`'s transaction, from the candidate whose code was presented.
 * `grep -rn "passwordHash" src/ --include=*.ts` therefore finds exactly two writers left:
 * `EmailVerificationService.verify` (INSERT) and `PasswordResetService.confirmReset` (UPDATE, a
 * proof-of-mailbox path).
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
   *
   * **Register spends `REGISTER_EMAIL` and nothing else.** It used to fall through to the resend
   * helper for a known-unverified address and spend `VERIFY_RESEND_COOLDOWN` +
   * `VERIFY_RESEND_DAILY` as well, which is what let a third party exhaust the daily resend budget
   * and leave the real owner unable to register for 24 hours (`VAL136-I1`). The two axes are now
   * structurally separate: nothing on this path touches a resend counter.
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

    if (existing) {
      if (existing.status === AccountStatus.Active) {
        await this.sendMailFailSoft({
          template: 'account-exists',
          to: existing.email,
          locale: dto.locale,
          variables: {},
        });
      }
      // ACTIVE got its notice above. DISABLED / PENDING_DELETION send nothing.
      //
      // UNVERIFIED is now a state no code path can CREATE — `verify` inserts accounts straight to
      // ACTIVE — so reaching it means a row that predates the `pending_registrations` migration.
      // Nothing is sent and, above all, nothing is written: an existing account's credentials are
      // never touched by an unauthenticated call, whatever its status. The migration's own
      // docblock carries the deploy preflight that counts such rows.
      return;
    }

    await this.emailVerification.issueCandidateCode({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      accountRole: dto.accountRole,
      educationLevel: dto.educationLevel ?? null,
      gradeLevel: dto.gradeLevel ?? null,
      studyStream: dto.studyStream ?? null,
      universityName: dto.universityName ?? null,
      departmentName: dto.departmentName ?? null,
      districtId: dto.districtId,
      locale: dto.locale,
    });
  }

  /**
   * §6.1 #3, §6.2's `resend` row. Always 202, gövdesiz.
   *
   * The cooldown/daily gate is this class' call; the clone itself is
   * `EmailVerificationService.resendCandidateCode`, which never deletes or mutates a live
   * candidate (`VAL136-I1`). The mail's language comes from the cloned candidate, so a resend now
   * honours the language the original `register` asked for — the old code had nowhere to store it
   * and defaulted every bare resend to `tr`.
   *
   * **A credential-ambiguity refusal REFUNDS the daily unit it just spent.** Without this, an
   * address a third party made ambiguous (`SEC136R2-I3`) burns the owner's `VERIFY_RESEND_DAILY`
   * budget on every honest resend attempt even though none of them ever mails — five calls and
   * the owner is locked out for 24 hours despite doing nothing wrong (`SFH136R3-I2`, measured on
   * live Postgres in round 4's Phase 1). T4 pins both sides: the honest single-identity address
   * still spends its unit, the contested address does not.
   *
   * **Residual, measured rather than assumed (PR #136 round 5, `VAL136R4-RF1`/`RF2`):** because
   * this branch refunds EVERY call that reaches it, an ambiguous address's counter is put back to
   * what it was before the call each time — T4 pins that per-call mechanism on both sides — so
   * across repeated calls the counter never climbs past the one request in flight and the
   * `if (!daily.allowed) return` guard above never fires for that address. The only identity-axis
   * brake left on that address is the 60-second `VerifyResendCooldown` above; a single-identity
   * address that reaches the daily ceiling gets THAT early return, while an ambiguous address
   * keeps running the full locking `insertCandidate` transaction on every call. This is neither
   * harmless nor an attack, and both halves were measured, not assumed: on a 200k-row table the
   * transaction the ambiguous branch still pays for is `LockRows → Sort → Index Scan`, ~0.110ms,
   * scoped to the address's own rows only; the caller pays exactly one HTTP request per
   * transaction (no amplification); and the route's own per-socket throttle
   * (`verifyEmailResend`, `auth.controller.ts`) is already tighter than this identity axis.
   */
  async resendVerification(dto: ResendVerificationRequestDto): Promise<void> {
    const cooldown = await this.rateLimiter.consume(
      AuthRateLimitScope.VerifyResendCooldown,
      dto.email,
    );
    if (!cooldown.allowed) return;
    const daily = await this.rateLimiter.consume(AuthRateLimitScope.VerifyResendDaily, dto.email);
    if (!daily.allowed) return;

    const outcome = await this.emailVerification.resendCandidateCode(dto.email);
    if (outcome === 'ambiguous-source') {
      // The refusal is not the caller's fault and it produced no mail, so it must not spend the
      // owner's 5/day budget — round 3 measured an honest user locked out for 24 hours by a
      // branch a third party can open with ONE register (`SFH136R3-I2`/`VAL136R3-RS2`).
      //
      // The COOLDOWN axis above is still spent unconditionally: it is the brute-force brake, and
      // refunding it would let one address be probed without limit. Not asserted refunded by T4
      // on purpose — if a later change refunds it too, T4 stays green, because cooldown is a
      // separate contract from the daily cap this refund targets.
      //
      // Fail-SOFT on purpose, and the reason is the anti-enumeration contract, not convenience:
      // if this write threw, only an AMBIGUOUS address could produce a 500 — a response class no
      // other address can produce, i.e. exactly the oracle §6.2 exists to prevent. The cost of a
      // failed refund is one lost slot, which is today's behaviour anyway.
      try {
        await this.rateLimiter.refund(
          AuthRateLimitScope.VerifyResendDaily,
          dto.email,
          daily.windowStart,
        );
      } catch {
        this.logger.warn('pending.resend outcome=refund-failed');
      }
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
