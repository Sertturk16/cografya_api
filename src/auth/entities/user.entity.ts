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
  InstitutionType,
  ReferralSource,
  StudyStream,
  TeacherSubject,
} from '../account.types';
import {
  ACCOUNT_ROLE_VALUES,
  INSTITUTION_TYPE_VALUES,
  PROFILE_SHAPE_CHECK,
  REFERRAL_SOURCE_VALUES,
  TEACHER_SUBJECT_VALUES,
} from './profile-shape-check';

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
@Check('CHK_users_account_role', `"account_role" IN (${ACCOUNT_ROLE_VALUES})`)
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
@Check(
  'CHK_users_school_name',
  `"school_name" IS NULL OR ("school_name" <> '' AND "school_name" = btrim("school_name"))`,
)
@Check('CHK_users_status', `"status" IN ('UNVERIFIED', 'ACTIVE', 'DISABLED', 'PENDING_DELETION')`)
// Spec §5.2 (T-103); the expression is shared with `pending_registrations`.
@Check('CHK_users_profile_shape', PROFILE_SHAPE_CHECK)
@Check(
  'CHK_users_teacher_subject',
  `"teacher_subject" IS NULL OR "teacher_subject" IN (${TEACHER_SUBJECT_VALUES})`,
)
@Check(
  'CHK_users_institution_type',
  `"institution_type" IS NULL OR "institution_type" IN (${INSTITUTION_TYPE_VALUES})`,
)
@Check(
  'CHK_users_referral_source',
  `"referral_source" IS NULL OR "referral_source" IN (${REFERRAL_SOURCE_VALUES})`,
)
@Check(
  'CHK_users_verification_state',
  `("status" = 'UNVERIFIED' AND "email_verified_at" IS NULL) OR ` +
    `("status" = 'ACTIVE' AND "email_verified_at" IS NOT NULL) OR ` +
    `"status" IN ('DISABLED', 'PENDING_DELETION')`,
)
// ATLAS ADDENDUM 1 (UYELIK-02 PR-1, §12.1 madde 33): the ONLY change this file carries this
// turn is `tokenVersion` below plus this one `@Check`. Every other column, `@Check` and
// docblock sentence in this file is UYELIK-01's, byte for byte.
@Check('CHK_users_token_version', `"token_version" >= 0`)
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

  /**
   * Free text, not a closed set (`GLOSSARY.md` §7.1 `schoolName` sub-block). Meaningful only for
   * a STUDENT on `education_level = SECONDARY`; NULL everywhere else, including a PARENT
   * (T-103). No consuming feature reads it yet, and it must never become the basis for a
   * school-scoped grouping/ranking (`DEC 2026-09-11g`).
   */
  @Column({ name: 'school_name', type: 'varchar', length: 200, nullable: true })
  schoolName!: string | null;

  /** Canonical name from the compile-time reference list, validated in UYELIK-02. */
  @Column({ name: 'university_name', type: 'varchar', length: 200, nullable: true })
  universityName!: string | null;

  /** Canonical name from the compile-time reference list, validated in UYELIK-02. */
  @Column({ name: 'department_name', type: 'varchar', length: 200, nullable: true })
  departmentName!: string | null;

  /** Teacher's branch (T-103); set together with `institutionType`, NULL on every other role. */
  @Column({ name: 'teacher_subject', type: 'varchar', length: 16, nullable: true })
  teacherSubject!: TeacherSubject | null;

  /** Where a teacher works (T-103); set together with `teacherSubject`. */
  @Column({ name: 'institution_type', type: 'varchar', length: 16, nullable: true })
  institutionType!: InstitutionType | null;

  /**
   * "Bizi nereden duydun?" (T-103). Answered once at registration, never edited and never
   * returned by any endpoint: it exists for the owners' audience reports.
   */
  @Column({ name: 'referral_source', type: 'varchar', length: 16, nullable: true })
  referralSource!: ReferralSource | null;

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

  /**
   * Added by UYELIK-02 PR-1 (ATLAS ADDENDUM 1). Compared against the access JWT's `sv` claim
   * (`access-token.service.ts`, `AccessTokenGuard` in PR-2): incrementing it invalidates every
   * live access token for this user at once. It is bumped in exactly two places — reuse
   * detection (§5.2.3) and password reset (§5.4.3) — never on ordinary login or refresh.
   */
  @Column({ name: 'token_version', type: 'integer', default: 0 })
  tokenVersion!: number;

  /**
   * When the member consented to commercial electronic messages (T-101); `null` = no consent or
   * withdrawn. Optional and separate from the terms, so it is never a condition of the service.
   * Set from the pending registration on verification, then granted/withdrawn on
   * `PUT /api/auth/account`.
   */
  @Column({ name: 'marketing_consent_at', type: 'timestamptz', nullable: true })
  marketingConsentAt!: Date | null;
}
