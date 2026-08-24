import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A 6-digit e-posta doğrulama kodu (`GLOSSARY.md` §7: "e-posta doğrulama kodu" — never "onay
 * kodu", which collides with a KVKK sense of *onay*). §5.3.
 *
 * `UQ_email_verification_codes_active` is a PARTIAL unique index on `user_id` where
 * `consumed_at IS NULL` (declared in the migration; TypeORM's `@Unique` cannot express a
 * `WHERE` clause, so it is not duplicated here as a plain decorator). It is a SCHEMA
 * invariant, not a service courtesy: "at most one active code per user" is enforced by
 * Postgres itself, so resend replacing the old code cannot race a stale second row into
 * existence.
 *
 * The MIGRATION is the schema truth; these decorators are declared so the access paths read
 * beside the columns.
 */
@Entity('email_verification_codes')
@Index('IDX_email_verification_codes_expires_at', ['expiresAt'])
@Check('CHK_email_verification_codes_hash_length', `octet_length("code_hash") = 32`)
@Check('CHK_email_verification_codes_attempts', `"attempt_count" >= 0 AND "attempt_count" <= 5`)
export class EmailVerificationCode {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_email_verification_codes' })
  id!: string;

  /** Owning account. `ON DELETE CASCADE`: no dangling code once the account is gone. */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /**
   * HMAC-SHA256(`AUTH_HMAC_PEPPER`, `"verify:" + userId + ":" + code`). Binding `userId` into
   * the digest input is deliberate: a digest minted for one account can never match against
   * another, even under a collision in the 6-digit code space across two different users.
   */
  @Column({ name: 'code_hash', type: 'bytea' })
  codeHash!: Buffer;

  /** `created_at + EMAIL_VERIFICATION_TTL_MINUTES`. */
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  /** Wrong-guess counter; the fifth wrong attempt deletes the row (§5.3), it is never left at 5. */
  @Column({ name: 'attempt_count', type: 'smallint', default: 0 })
  attemptCount!: number;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
