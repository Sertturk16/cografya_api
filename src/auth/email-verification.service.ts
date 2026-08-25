import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
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
 * SQLSTATEs a CONTENDED transaction dies with. None of them is a caller error and none of them
 * is a state a caller can ask about: mapping them to the route's published answer is what keeps
 * a 500 — a response only an address with several candidates can produce — out of §6.2's
 * anti-enumeration surface. The set is an allowlist on purpose; anything else still propagates.
 *
 * **`57014` is a recorded trade-off, not an oversight.** It fires whenever a statement crosses
 * `statement_timeout` (`data-source-options.ts` sets 30_000ms and no `lock_timeout` — Y18), which
 * under contention IS a lock wait but can also be any other slow statement on an unhealthy
 * database. Swallowing it means such a statement fails silently instead of surfacing as a 500 —
 * which is why the `warn` log line at each call site is part of the remedy, not decoration: the
 * response stays contractual and an operator can still see it happened. Returning a 500 instead
 * would both break the contract and itself be a distinguishable, enumeration-capable answer.
 */
const CONTENTION_SQLSTATES = new Set([
  '40P01', // deadlock_detected
  '40001', // serialization_failure
  '55P03', // lock_not_available
  '57014', // query_canceled — statement_timeout, which under contention IS a lock wait
]);

function isContentionFailure(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const sqlState = (error as QueryFailedError & { code?: string }).code;
  return typeof sqlState === 'string' && CONTENTION_SQLSTATES.has(sqlState);
}

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
 *  3. `DELETE` of the id list this transaction has ALREADY locked and classified as expired
 *     against one `now` — the bounded, same-subject cleanup `AuthRateLimitService` (D12)
 *     established. It cannot reach a live row, because the classification
 *     and the delete share the same snapshot and the same clock.
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

        // The ORDER BY is not cosmetic: BOTH write paths against this table lock an address's
        // whole candidate group in ONE statement, in `created_at ASC, id ASC` order — that shared
        // order is what keeps two concurrent writers from deadlocking rather than queueing.
        // Neither transaction acquires a row lock it does not ALREADY hold: the group DELETE
        // below names only the ids this same locking SELECT returned, so it can never reach a
        // row a concurrent writer committed after this SELECT ran (pinned by C6, PR #136 round 4,
        // `VAL136R3-DL2`).
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

        // The address now has an account, so every sibling candidate this transaction LOCKED is
        // moot — including any an attacker created. The id list is not decoration: `delete({ email })`
        // opened its OWN statement snapshot and could ask for a row committed after the locking
        // SELECT at :156-162, i.e. a row this transaction does not hold. Measured on live Postgres
        // 16.15: that shape deadlocked 20/20 in a constructed race against `insertCandidate`'s
        // ordered lock, this shape 0/20 (PR #136 round 4, `VAL136R3-DL2`) — the same differential
        // C6 pins as a positive/negative pair against this line.
        //
        // What survives, stated rather than left to be discovered: a candidate that became visible
        // INSIDE that window is not deleted here (C6's own survivor assertion). It cannot become a
        // second account — the read at :197-199 refuses an address that already owns one and
        // `UQ_users_email` catches the concurrent case (C2 pins the uniqueness half) — and it dies
        // at its own expiry, swept by the next `insertCandidate` for this address (the same DELETE
        // V2 already pins). The guard is required, not defensive: TypeORM rejects an empty
        // criterion with `TypeORMError` (`EntityManager.js:466-469`).
        if (candidates.length > 0) {
          await repo.delete(candidates.map((candidate) => candidate.id));
        }

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
      if (isContentionFailure(error)) {
        this.logger.warn('verify outcome=contention');
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
   * when the address is at its ceiling, when a resend has nothing to clone, or when a resend's
   * candidates carry more than one credential identity (D2, `SEC136R2-I3` — see the
   * `if (typeof source === 'string')` branch below).
   *
   * The expired-row cleanup is bounded to THIS address and is an address-scoped hygiene step, not
   * a retention policy: how long an expired candidate's PII may persist across the whole table is
   * a separate, Atlas-gated follow-up (`ENGINEERING.md` §12).
   */
  private async insertCandidate(
    source: PendingRegistrationDraft | string,
  ): Promise<{ code: string; locale: PendingRegistration['locale'] } | null> {
    const email = typeof source === 'string' ? source : source.email;
    const id = randomUUID();
    const code = mintVerificationCode();
    const codeHash = hmacSha256(this.secrets.getHmacPepper(), `pending:${id}:${code}`);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(PendingRegistration);

        // ONE ordered locking statement — the same order `verify` uses. Nothing else in this
        // transaction acquires a row lock on this table, so the two write paths cannot take
        // this address's rows in two different orders.
        const group = await repo
          .createQueryBuilder('pending')
          .setLock('pessimistic_write')
          .where('pending.email = :email', { email })
          .orderBy('pending.createdAt', 'ASC')
          .addOrderBy('pending.id', 'ASC')
          .getMany();

        // ONE clock for the whole transaction: the ceiling, the clone source and the delete all
        // classify the same rows the same way.
        const now = new Date();
        const live = group.filter((row) => row.expiresAt.getTime() > now.getTime());
        const expiredIds = group
          .filter((row) => row.expiresAt.getTime() <= now.getTime())
          .map((row) => row.id);

        // Deleting rows this transaction ALREADY holds: the statement's scan order cannot
        // matter, because it acquires no lock it does not have.
        if (expiredIds.length > 0) await repo.delete(expiredIds);

        if (live.length >= PENDING_REGISTRATION_MAX_ACTIVE) return null;

        let draft: PendingRegistrationDraft;
        if (typeof source === 'string') {
          // A resend carries NO caller identity — the request body is the address and nothing
          // else — so the ONLY safe rule is to send a code when there is nothing to get wrong.
          // `passwordHash` is the credential-lineage key: a clone copies it verbatim, so a
          // register→resend→resend chain stays ONE identity, while a second party's register is
          // a second one (Argon2id salts per call, so two registers never collide).
          //
          // The set is read from the group as it was LOCKED — before the expired sweep above
          // removed anything — so a candidate that died minutes ago still counts as evidence
          // that this address is contested.
          const credentialIdentities = new Set(group.map((row) => row.passwordHash));
          if (credentialIdentities.size > 1) {
            this.logger.warn('pending.resend outcome=ambiguous-source');
            return null;
          }
          const newest = live[live.length - 1];
          if (!newest) return null; // resend for an address with no live candidate.
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

        const expiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MINUTES * 60_000);
        await repo.insert({ id, ...draft, codeHash, expiresAt, attemptCount: 0 });
        return { code, locale: draft.locale };
      });
    } catch (error) {
      if (isContentionFailure(error)) {
        this.logger.warn('pending.insert outcome=contention');
        return null;
      }
      throw error;
    }
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
