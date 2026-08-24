import { Exclude } from 'class-transformer';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import {
  AccountRole,
  AccountStatus,
  EducationLevel,
  GradeLevel,
  StudyStream,
} from '../account.types';

/**
 * Persistent identity and declared education profile.
 *
 * `accountRole` is profile data, not authorization. This entity is also not a
 * response model: class-level `@Exclude()` makes default plain serialization
 * empty, and future private responses must use an explicit allowlist DTO.
 */
@Exclude()
@Entity('users')
@Unique('UQ_users_email', ['email'])
@Index('IDX_users_district_id', ['districtId'])
@Check('CHK_users_first_name', `"first_name" <> '' AND "first_name" = btrim("first_name")`)
@Check('CHK_users_last_name', `"last_name" <> '' AND "last_name" = btrim("last_name")`)
@Check('CHK_users_phone', `"phone" ~ '^\\+905[0-9]{9}$'`)
@Check(
  'CHK_users_email_canonical',
  `"email" <> '' AND "email" = btrim("email") AND "email" = lower("email")`,
)
@Check('CHK_users_password_hash', `"password_hash" ~ '^\\$argon2id\\$'`)
@Check('CHK_users_account_role', `"account_role" IN ('STUDENT', 'TEACHER')`)
@Check(
  'CHK_users_education_level',
  `"education_level" IS NULL OR "education_level" IN ('SECONDARY', 'UNDERGRADUATE', 'GRADUATE')`,
)
@Check(
  'CHK_users_grade_level',
  `"grade_level" IS NULL OR "grade_level" IN (` +
    `'GRADE_5', 'GRADE_6', 'GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10', ` +
    `'GRADE_11', 'GRADE_12', 'MEZUN', 'KPSS', 'DIGER')`,
)
@Check(
  'CHK_users_study_stream',
  `"study_stream" IS NULL OR "study_stream" IN (` +
    `'SAYISAL', 'SOZEL', 'ESIT_AGIRLIK', 'TYT', 'DIL', 'LGS', 'MSU', ` +
    `'ARA_SINIF', 'KPSS', 'DIGER')`,
)
@Check(
  'CHK_users_university_name',
  `"university_name" IS NULL OR (` +
    `"university_name" <> '' AND "university_name" = btrim("university_name"))`,
)
@Check(
  'CHK_users_department_name',
  `"department_name" IS NULL OR (` +
    `"department_name" <> '' AND "department_name" = btrim("department_name"))`,
)
@Check('CHK_users_status', `"status" IN ('UNVERIFIED', 'ACTIVE', 'DISABLED', 'PENDING_DELETION')`)
// The outer `IS TRUE` is load-bearing: with `education_level` NULL the STUDENT branch
// evaluates to UNKNOWN and a Postgres CHECK accepts UNKNOWN, so the matrix would admit a
// student carrying branch fields but no declared education level. Folding UNKNOWN to FALSE
// keeps it fail-closed. Mirrored token for token in
// `src/database/migrations/1787562000000-InitUsers.ts`; nothing machine-compares the two.
@Check(
  'CHK_users_profile_shape',
  `((` +
    `"account_role" = 'TEACHER' AND ` +
    `"education_level" IS NULL AND "grade_level" IS NULL AND "study_stream" IS NULL AND ` +
    `"university_name" IS NULL AND "department_name" IS NULL` +
    `) OR (` +
    `"account_role" = 'STUDENT' AND (` +
    `(` +
    `"education_level" = 'SECONDARY' AND "grade_level" IS NOT NULL AND ` +
    `"study_stream" IS NOT NULL AND "university_name" IS NULL AND "department_name" IS NULL` +
    `) OR (` +
    `"education_level" = 'UNDERGRADUATE' AND "grade_level" IS NULL AND ` +
    `"study_stream" IS NULL AND "university_name" IS NOT NULL AND ` +
    `"department_name" IS NOT NULL` +
    `) OR (` +
    `"education_level" = 'GRADUATE' AND "grade_level" IS NULL AND ` +
    `"study_stream" IS NULL AND "university_name" IS NOT NULL` +
    `)` +
    `)` +
    `)) IS TRUE`,
)
@Check(
  'CHK_users_verification_state',
  `("status" = 'UNVERIFIED' AND "email_verified_at" IS NULL) OR ` +
    `("status" = 'ACTIVE' AND "email_verified_at" IS NOT NULL) OR ` +
    `"status" IN ('DISABLED', 'PENDING_DELETION')`,
)
export class User {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_users' })
  id!: string;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName!: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100 })
  lastName!: string;

  /** Canonical Turkish mobile E.164 form; required, but not unique or verified. */
  @Column({ name: 'phone', type: 'varchar', length: 13 })
  phone!: string;

  /** Trimmed lowercase ASCII address; syntax validation is UYELIK-02's boundary. */
  @Column({ name: 'email', type: 'varchar', length: 254 })
  email!: string;

  /** Selected only by an explicit authentication query; never a response field. */
  @Column({ name: 'password_hash', type: 'text', select: false })
  passwordHash!: string;

  @Column({ name: 'account_role', type: 'varchar', length: 16 })
  accountRole!: AccountRole;

  @Column({ name: 'education_level', type: 'varchar', length: 20, nullable: true })
  educationLevel!: EducationLevel | null;

  @Column({ name: 'grade_level', type: 'varchar', length: 16, nullable: true })
  gradeLevel!: GradeLevel | null;

  @Column({ name: 'study_stream', type: 'varchar', length: 20, nullable: true })
  studyStream!: StudyStream | null;

  /** Canonical name from the compile-time reference list, validated in UYELIK-02. */
  @Column({ name: 'university_name', type: 'varchar', length: 200, nullable: true })
  universityName!: string | null;

  /** Canonical name from the compile-time reference list, validated in UYELIK-02. */
  @Column({ name: 'department_name', type: 'varchar', length: 200, nullable: true })
  departmentName!: string | null;

  /** Province is derived through `districts.province_id`; it is not duplicated here. */
  @Column({ name: 'district_id', type: 'uuid' })
  districtId!: string;

  @Column({ name: 'status', type: 'varchar', length: 24, default: AccountStatus.Unverified })
  status!: AccountStatus;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
