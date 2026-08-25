import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, LessThanOrEqual, QueryFailedError } from 'typeorm';
import { AccountStatus } from './account.types';
import { AUTH_ERROR_KEYS } from './auth-error-keys';
import {
  EMAIL_VERIFICATION_MAX_ATTEMPTS,
  EMAIL_VERIFICATION_TTL_MINUTES,
  MAIL_SEND_TIMEOUT_MS,
  PENDING_REGISTRATION_MAX_ACTIVE,
} from './auth.constants';
import { AuthSecretsProvider } from './auth-secrets.provider';
import type { AuthResultDto } from './dto/auth-result.dto';
import { PendingRegistration } from './entities/pending-registration.entity';
import { User } from './entities/user.entity';
import { MAILER_PORT, type MailerPort } from './mail/mailer.port';
import { mintVerificationCode } from './opaque-token';
import { SessionService } from './session.service';
import { constantTimeEquals, hmacSha256 } from './token-digest';

/** Postgres unique-violation SQLSTATE — `users.email`'s `UQ_users_email` (E2E-A5). */
const UNIQUE_VIOLATION_SQLSTATE = '23505';

/**
 * Everything a candidate registration carries EXCEPT the code mechanics: the caller assembles it
 * from the validated DTO, this class adds the id, the code, its digest and the expiry.
 */
export type PendingRegistrationDraft = Pick<
  PendingRegistration,
  | 'email'
  | 'passwordHash'
  | 'firstName'
  | 'lastName'
  | 'phone'
  | 'accountRole'
  | 'educationLevel'
  | 'gradeLevel'
  | 'studyStream'
  | 'universityName'
  | 'departmentName'
  | 'districtId'
  | 'locale'
>;

/** `verify`'s transaction result — deliberately NOT an exception, see `verify`'s docblock. */
type VerifyOutcome = { verified: false } | { verified: true; userId: string };

/**
 * Code MECHANICS over `pending_registrations` — mint, hash, resend, consume, attempt cap (§5.3) —
 * plus the MATERIALIZATION of the `users` row in `verify`'s transaction. `RegistrationService`
 * owns the FLOW decisions (which endpoint, which rate-limit scope, what the anti-enumeration
 * response looks like); this class never decides whether a code should be sent, only how one is
 * produced, stored, checked, and what happens when it is right.
 *
 * ## The write surface, stated as a property rather than left to be inferred (`SEC136-C1`)
 * A caller that does not hold a valid code can reach exactly three writes here, and **none of
 * them can alter or remove a live candidate's credentials**:
 *  1. `INSERT` of a new candidate (`issueCandidateCode`, `resendCandidateCode`);
 *  2. `UPDATE … SET attempt_count = …` on the candidates a wrong guess was tested against —
 *     §5.3's attempt cap, whose whole purpose is to be reachable by an unauthenticated guesser.
 *     It is bounded by the cap and touches no other column;
 *  3. `DELETE` of that same address's ALREADY-EXPIRED rows, inside the insert transaction — the
 *     bounded, same-subject cleanup `AuthRateLimitService` (D12) established instead of a
 *     scheduler. It is a `WHERE expires_at <= now()` delete: it cannot reach a live row.
 * There is **no UPDATE of any credential column anywhere in this repo** — a candidate's `email`,
 * `password_hash` and profile are written once, by the INSERT that creates the row, and never
 * again. That is the property the rejected "overwrite the UNVERIFIED row" repair would have
 * destroyed.
 *
 * The two writes only a code-holder can reach are the `users` INSERT and the DELETE of the
 * address's whole candidate group, both inside `verify`'s transaction.
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger('AUTH');

  /**
   * No `@InjectRepository(PendingRegistration)`: every write in this class runs inside a
   * transaction and therefore goes through `manager.getRepository(...)`, so a second,
   * connection-level repository would be an injected dependency nothing reads (the shape
   * `CODE136-M2` flagged on `PasswordResetService`). The entity is registered where it belongs,
   * in `data-source-options.ts`'s explicit entity list.
   */
  constructor(
    private readonly dataSource: DataSource,
    private readonly secrets: AuthSecretsProvider,
    @Inject(MAILER_PORT) private readonly mailer: MailerPort,
    private readonly sessions: SessionService,
  ) {}

  /**
   * `POST /api/auth/verify-email` (§6.1 #2). A correct code MATERIALIZES the `users` row from the
   * candidate that code belongs to, then opens a session (E2E-N2: verify-email logs the user in,
   * unlike password-reset/confirm). Every failure — no candidate, expired, attempt-capped, wrong
   * code, address already taken — answers the SAME 400 `errors.verify.codeInvalid` (§2.4 S5).
   *
   * **One transaction, `SELECT … FOR UPDATE` over the address's whole candidate group.** Three
   * things depend on that lock and none of them works without it:
   *  - the attempt counter is read-modify-written, so concurrent wrong guesses would otherwise
   *    lose updates and let the cap of 5 pass silently (`SFH136-I1`), and the increment could
   *    race past the `CHECK (attempt_count <= 5)` into a 500;
   *  - two candidates for one address could otherwise materialize two `users` rows and collide on
   *    `UQ_users_email` at commit;
   *  - the group DELETE that follows a successful materialization has to be atomic with it, or a
   *    sibling candidate would survive an address that now has a real account.
   *
   * **A code is tested against each live candidate and belongs to exactly one.** The digest input
   * binds the candidate's own id, so there is no cross-matching to design around: the loop is a
   * lookup, not a widening of the guess space — one code still has a 1-in-10⁶ chance against each
   * candidate, and the shared attempt cap charges the guess to every candidate it was tested
   * against.
   *
   * **The reject decision is returned, never thrown from inside the callback.** Throwing would
   * roll back the attempt-counter increments the wrong-code branch just wrote — the exact
   * silent-rollback class `SessionService.refresh` documents and this PR's CI already caught once.
   */
  async verify(email: string, code: string): Promise<AuthResultDto> {
    let outcome: VerifyOutcome;
    try {
      outcome = await this.dataSource.transaction(async (manager): Promise<VerifyOutcome> => {
        const repo = manager.getRepository(PendingRegistration);
        const now = new Date();

        // The ORDER BY is not cosmetic: two concurrent verifies for one address lock the SAME
        // rows, and a deterministic lock order is what keeps that from being a deadlock rather
        // than a queue.
        const candidates = await repo
          .createQueryBuilder('pending')
          .setLock('pessimistic_write')
          .where('pending.email = :email', { email })
          .orderBy('pending.createdAt', 'ASC')
          .addOrderBy('pending.id', 'ASC')
          .getMany();

        const live = candidates.filter(
          (candidate) =>
            candidate.expiresAt.getTime() > now.getTime() &&
            candidate.attemptCount < EMAIL_VERIFICATION_MAX_ATTEMPTS,
        );
        if (live.length === 0) return { verified: false };

        const pepper = this.secrets.getHmacPepper();
        const matched = live.find((candidate) =>
          constantTimeEquals(
            hmacSha256(pepper, `pending:${candidate.id}:${code}`),
            candidate.codeHash,
          ),
        );

        if (!matched) {
          // §5.3's cap, charged to every candidate the guess was tested against. Capped by
          // `Math.min` rather than by a bare `+ 1`: the row must stay inside
          // `CHK_pending_registrations_attempts` even if a future caller reaches here twice.
          for (const candidate of live) {
            await repo.update(
              { id: candidate.id },
              {
                attemptCount: Math.min(candidate.attemptCount + 1, EMAIL_VERIFICATION_MAX_ATTEMPTS),
              },
            );
          }
          return { verified: false };
        }

        // The address must not already own an account. This is a READ + refusal, never an
        // update: materialization only ever INSERTs, so a code can never rewrite an existing
        // account's credentials — the whole point of `SEC136-C1`.
        const existingUser = await manager
          .getRepository(User)
          .findOne({ where: { email }, select: { id: true } });
        if (existingUser) return { verified: false };

        const userId = randomUUID();
        await manager.insert(User, {
          id: userId,
          firstName: matched.firstName,
          lastName: matched.lastName,
          phone: matched.phone,
          email: matched.email,
          passwordHash: matched.passwordHash,
          accountRole: matched.accountRole,
          educationLevel: matched.educationLevel,
          gradeLevel: matched.gradeLevel,
          studyStream: matched.studyStream,
          universityName: matched.universityName,
          departmentName: matched.departmentName,
          districtId: matched.districtId,
          status: AccountStatus.Active,
          emailVerifiedAt: now,
        });

        // The address now has an account, so every sibling candidate is moot — including any
        // an attacker created. They die with the group, inside the same transaction.
        await repo.delete({ email });

        return { verified: true, userId };
      });
    } catch (error) {
      // A concurrent materialization of the same address (a second candidate that slipped
      // between the read above and this commit) surfaces as `UQ_users_email`. Postgres's own
      // `detail` on that error carries the address (`Key (email)=(…)`), so this catch is the ONE
      // place it is allowed to reach: it is neither logged nor re-thrown, and the caller sees the
      // same 400 every other failure produces (E2E-A5).
      const sqlState = (error as QueryFailedError & { code?: string }).code;
      if (error instanceof QueryFailedError && sqlState === UNIQUE_VIOLATION_SQLSTATE) {
        throw new BadRequestException(AUTH_ERROR_KEYS.verifyCodeInvalid);
      }
      throw error;
    }

    if (!outcome.verified) {
      throw new BadRequestException(AUTH_ERROR_KEYS.verifyCodeInvalid);
    }
    return this.sessions.mintSessionForUser(outcome.userId);
  }

  /**
   * Creates a NEW candidate for `draft`'s address and mails its code. Called from `register`'s
   * unknown-address branch — the only place a candidate's credentials originate.
   *
   * Silently does nothing when the address already holds {@link PENDING_REGISTRATION_MAX_ACTIVE}
   * unexpired candidates. Silence is the contract: the endpoint answers the same body-less 202 in
   * both cases, because a distinguishable answer is a new enumeration channel (§6.2).
   */
  async issueCandidateCode(draft: PendingRegistrationDraft): Promise<void> {
    const issued = await this.insertCandidate(draft);
    if (!issued) return;
    await this.sendCodeFailSoft(draft.email, draft.locale, issued.code);
  }

  /**
   * `POST /api/auth/verify-email/resend` (§6.1 #3). Adds a CLONE of the address's newest candidate
   * — same credentials, same profile, same locale, a fresh id, a fresh code and a fresh attempt
   * budget — and mails it.
   *
   * **It deletes nothing and mutates nothing** (`VAL136-I1`). The previous implementation replaced
   * the address's active code, which handed any caller who merely knew an address a way to
   * invalidate the code its owner was in the middle of typing, and — because register shared the
   * resend counters — to spend the daily budget until the owner could not get a code at all for
   * 24 hours. Cloning removes both halves: every code already in the mailbox stays valid, and the
   * only thing the daily cap now limits is mail volume.
   *
   * **The clone source may be a candidate whose attempt budget an attacker burned.** That is
   * deliberate: the clone gets its own counter, so exhausting a candidate's guesses can no longer
   * strand the honest owner — they resend and are back in business, without needing a new
   * `register` call.
   */
  async resendCandidateCode(email: string): Promise<void> {
    const issued = await this.insertCandidate(email);
    if (!issued) return;
    await this.sendCodeFailSoft(email, issued.locale, issued.code);
  }

  /**
   * The single INSERT path, shared by a fresh registration (`draft`) and a resend (an address,
   * whose newest live candidate is cloned). Returns `null` — silently, never distinguishably —
   * when the address is at its ceiling or, for a resend, has nothing to clone.
   *
   * The expired-row cleanup is bounded to THIS address and to rows that are already dead by time;
   * it is the `AuthRateLimitService` (D12) pattern, chosen for the same reason: a scheduler is
   * machinery this repo does not add without a real need (`ENGINEERING.md` §1/§12).
   */
  private async insertCandidate(
    source: PendingRegistrationDraft | string,
  ): Promise<{ code: string; locale: PendingRegistration['locale'] } | null> {
    const email = typeof source === 'string' ? source : source.email;
    const id = randomUUID();
    const code = mintVerificationCode();
    const codeHash = hmacSha256(this.secrets.getHmacPepper(), `pending:${id}:${code}`);
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MINUTES * 60_000);

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(PendingRegistration);

      await repo.delete({ email, expiresAt: LessThanOrEqual(new Date()) });

      // Newest first, with `id` as a deterministic tie-break: `created_at` is `now()`, i.e. the
      // TRANSACTION timestamp, so two candidates written microseconds apart can tie. Either is an
      // equally valid clone source — what must not be left open is WHICH one, because a
      // non-deterministic pick is a behaviour no test can pin.
      const live = await repo
        .createQueryBuilder('pending')
        .setLock('pessimistic_write')
        .where('pending.email = :email', { email })
        .orderBy('pending.createdAt', 'DESC')
        .addOrderBy('pending.id', 'DESC')
        .getMany();
      if (live.length >= PENDING_REGISTRATION_MAX_ACTIVE) return null;

      let draft: PendingRegistrationDraft;
      if (typeof source === 'string') {
        const newest = live[0];
        if (!newest) return null; // resend for an address with no candidate — nothing to clone.
        draft = {
          email: newest.email,
          passwordHash: newest.passwordHash,
          firstName: newest.firstName,
          lastName: newest.lastName,
          phone: newest.phone,
          accountRole: newest.accountRole,
          educationLevel: newest.educationLevel,
          gradeLevel: newest.gradeLevel,
          studyStream: newest.studyStream,
          universityName: newest.universityName,
          departmentName: newest.departmentName,
          districtId: newest.districtId,
          locale: newest.locale,
        };
      } else {
        draft = source;
      }

      await repo.insert({ id, ...draft, codeHash, expiresAt, attemptCount: 0 });
      return { code, locale: draft.locale };
    });
  }

  private async sendCodeFailSoft(
    to: string,
    locale: PendingRegistration['locale'],
    code: string,
  ): Promise<void> {
    await this.sendMailFailSoft({
      template: 'verify-email',
      to,
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
