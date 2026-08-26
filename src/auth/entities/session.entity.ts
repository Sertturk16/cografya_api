import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { SessionRevocationReason } from '../auth.types';

/**
 * A refresh-token FAMILY member (§5.2). "Refresh token family" never appears as a table or
 * column name — `GLOSSARY.md` §7 fixes oturum = session, so the table is `sessions`.
 *
 * One row exists per MINTED refresh token, not per login: rotation (`POST /api/auth/refresh`,
 * PR-2) inserts a new row and revokes the old one with `rotated_from_id` pointing back, so a
 * family is the chain of rows sharing one `family_id`. Reuse detection (§5.2.3) revokes every
 * row in a family at once.
 *
 * No UA/IP column, by KVKK minimisation (SPEC §3.5) — this table exists to prove "this opaque
 * token is currently live", not to fingerprint the caller.
 *
 * The MIGRATION (`1787565600000-InitAuthSessions.ts`) is the schema truth; these decorators
 * are declared so the access paths read beside the columns (the `User`/`BookVideo` precedent).
 * Nothing machine-compares the two — they change together by hand.
 */
@Entity('sessions')
@Unique('UQ_sessions_token_hash', ['tokenHash'])
@Index('IDX_sessions_family_id', ['familyId'])
@Index('IDX_sessions_user_id', ['userId'])
@Index('IDX_sessions_expires_at', ['expiresAt'])
@Check('CHK_sessions_token_hash_length', `octet_length("token_hash") = 32`)
@Check(
  'CHK_sessions_revocation',
  `("revoked_at" IS NULL AND "revoked_reason" IS NULL) OR ` +
    `("revoked_at" IS NOT NULL AND "revoked_reason" IS NOT NULL)`,
)
@Check(
  'CHK_sessions_revoked_reason',
  `"revoked_reason" IS NULL OR "revoked_reason" IN (` +
    `'ROTATED', 'LOGOUT', 'REUSE_DETECTED', 'PASSWORD_RESET', 'EXPIRED', 'ACCOUNT_INACTIVE')`,
)
@Check('CHK_sessions_expiry', `"expires_at" > "issued_at"`)
@Check('CHK_sessions_not_self_rotated', `"rotated_from_id" IS NULL OR "rotated_from_id" <> "id"`)
@Check(
  'CHK_sessions_rotation_grace_reason',
  `("rotation_grace_used_at" IS NULL OR "revoked_reason" = 'ROTATED') IS TRUE`,
)
export class Session {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_sessions' })
  id!: string;

  /** Owning account. `ON DELETE CASCADE`: an account has no orphaned sessions. */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /**
   * Minted at login and carried unchanged through every rotation in the chain. Reuse
   * detection revokes every row sharing this value at once (§5.2.3).
   */
  @Column({ name: 'family_id', type: 'uuid' })
  familyId!: string;

  /** SHA-256 digest of the opaque refresh token (`token-digest.ts`); the plaintext is never stored. */
  @Column({ name: 'token_hash', type: 'bytea' })
  tokenHash!: Buffer;

  @Column({ name: 'issued_at', type: 'timestamptz', default: () => 'now()' })
  issuedAt!: Date;

  /** `issued_at + REFRESH_TOKEN_TTL_DAYS`; rotation TAZELER (slides) this on every refresh. */
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'revoked_reason', type: 'varchar', length: 24, nullable: true })
  revokedReason!: SessionRevocationReason | null;

  /** The row this one replaced during rotation; an adjudication/forensic trail, never read for auth. */
  @Column({ name: 'rotated_from_id', type: 'uuid', nullable: true })
  rotatedFromId!: string | null;

  /** Single-use marker for the bounded lost-response recovery; no token material is retained. */
  @Column({ name: 'rotation_grace_used_at', type: 'timestamptz', nullable: true })
  rotationGraceUsedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
