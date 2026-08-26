import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the hash-only, single-use marker for the bounded refresh rotation recovery.
 *
 * Generated after adding `Session.rotationGraceUsedAt`, then hand-reviewed. The raw TypeORM
 * diff contained unrelated schema-name drift and was reduced to this forward-only column plus
 * its null-safe invariant. No session row is read, updated, deleted or backfilled.
 *
 * DATA-LOSS WARNING — `down()` removes the consumed-recovery audit marker. On a live database,
 * prefer a forward corrective migration; revert only with owner-approved backup/restore evidence.
 */
export class AddSessionRotationGrace1787655600000 implements MigrationInterface {
  name = 'AddSessionRotationGrace1787655600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD COLUMN "rotation_grace_used_at" timestamptz`,
    );
    await queryRunner.query(`
      ALTER TABLE "sessions"
        ADD CONSTRAINT "CHK_sessions_rotation_grace_reason"
        CHECK (("rotation_grace_used_at" IS NULL OR "revoked_reason" = 'ROTATED') IS TRUE)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP CONSTRAINT "CHK_sessions_rotation_grace_reason"`,
    );
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "rotation_grace_used_at"`);
  }
}
