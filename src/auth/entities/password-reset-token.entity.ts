import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/**
 * A 256-bit opaque password-reset token (`GLOSSARY.md` §7: şifre = password), §5.4.
 *
 * Deliberately its OWN table rather than reusing the verification code's shape (that code lived
 * in `email_verification_codes` and now lives on `pending_registrations` — `SEC136-C1`): the
 * reset flow is a higher-value target (it changes `password_hash` and revokes every live
 * session, §5.4.3), so it gets its own shorter TTL, its own opaque-token format (not a
 * 6-digit code) and its own attempt-free design — there is no "wrong guess" counter here
 * because the token is 256 bits of entropy, not a 6-digit space.
 *
 * That separation is worth more after the rework, not less: this flow acts on an EXISTING
 * account and is the only remaining path that UPDATEs `users.password_hash`, while the
 * verification code now creates an account and never rewrites one.
 *
 * The MIGRATION is the schema truth; these decorators are declared so the access paths read
 * beside the columns.
 */
@Entity('password_reset_tokens')
@Unique('UQ_password_reset_tokens_token_hash', ['tokenHash'])
@Index('IDX_password_reset_tokens_user_id', ['userId'])
@Index('IDX_password_reset_tokens_expires_at', ['expiresAt'])
@Check('CHK_password_reset_tokens_hash_length', `octet_length("token_hash") = 32`)
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_password_reset_tokens' })
  id!: string;

  /** Owning account. `ON DELETE CASCADE`: no dangling reset token once the account is gone. */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** SHA-256 digest of the opaque token (`token-digest.ts`); the plaintext is never stored. */
  @Column({ name: 'token_hash', type: 'bytea' })
  tokenHash!: Buffer;

  /** `created_at + PASSWORD_RESET_TTL_MINUTES` — shorter-lived than a verification code. */
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
