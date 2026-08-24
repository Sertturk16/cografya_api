import { Check, Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import type { AuthRateLimitScope } from '../auth.types';

/**
 * The identity-axis rate limiter's persistent counter (§9.2). SPEC §2.3: Redis is an
 * accelerator layered in later; the counter of record is this table.
 *
 * No FK to `users` — a bucket must count an UNREGISTERED address too (D11), otherwise a
 * request for an address that does not exist would be free to retry without limit, which is
 * an enumeration/mail-bombing path. `subject_hash` is
 * `HMAC-SHA256(AUTH_HMAC_PEPPER, "rate:" + scope + ":" + canonicalEmail)` — never the raw
 * address (D11).
 *
 * The fixed-window algorithm (D10) is entirely in `AuthRateLimitService`: a single
 * `DELETE` (stale windows) followed by `INSERT … ON CONFLICT (scope, subject_hash,
 * window_start) DO UPDATE … RETURNING attempt_count`, both against this table.
 *
 * The MIGRATION is the schema truth; these decorators are declared so the access paths read
 * beside the columns.
 */
@Entity('auth_rate_limits')
@Unique('UQ_auth_rate_limits_bucket', ['scope', 'subjectHash', 'windowStart'])
@Index('IDX_auth_rate_limits_window_start', ['windowStart'])
@Check('CHK_auth_rate_limits_subject_length', `octet_length("subject_hash") = 32`)
@Check('CHK_auth_rate_limits_count', `"attempt_count" >= 0`)
@Check(
  'CHK_auth_rate_limits_scope',
  `"scope" IN (` +
    `'REGISTER_EMAIL', 'VERIFY_RESEND_COOLDOWN', 'VERIFY_RESEND_DAILY', 'LOGIN_EMAIL', ` +
    `'PASSWORD_RESET_EMAIL')`,
)
export class AuthRateLimit {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_auth_rate_limits' })
  id!: string;

  @Column({ name: 'scope', type: 'varchar', length: 32 })
  scope!: AuthRateLimitScope;

  /** `HMAC-SHA256(AUTH_HMAC_PEPPER, "rate:" + scope + ":" + canonicalEmail)` — never the raw address. */
  @Column({ name: 'subject_hash', type: 'bytea' })
  subjectHash!: Buffer;

  /** `floor(now / windowMs) * windowMs`, in UTC — the fixed window's start instant. */
  @Column({ name: 'window_start', type: 'timestamptz' })
  windowStart!: Date;

  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount!: number;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;
}
