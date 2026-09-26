/**
 * The profile-shape matrix as SQL (spec §5.2, T-103), shared by the `users` and
 * `pending_registrations` entities so the two declarations cannot drift from each other.
 * `isProfileShapeValid` (`../dto/profile-shape.rule.ts`) is the same rule in TypeScript; the
 * migration `1790380800000-AddAccountTypesAndAudienceFields` holds its own frozen copy.
 *
 * The outer `IS TRUE` folds UNKNOWN to FALSE: with `education_level` NULL a comparison such as
 * `"education_level" = 'SECONDARY'` is UNKNOWN, and a Postgres CHECK accepts UNKNOWN.
 */
const NO_EDUCATION =
  `"education_level" IS NULL AND "grade_level" IS NULL AND "study_stream" IS NULL AND ` +
  `"university_name" IS NULL AND "department_name" IS NULL AND "school_name" IS NULL`;
const NO_TEACHER = `"teacher_subject" IS NULL AND "institution_type" IS NULL`;

export const PROFILE_SHAPE_CHECK =
  `((` +
  `("account_role" = 'TEACHER' AND ${NO_EDUCATION} AND (` +
  `(${NO_TEACHER}) OR ("teacher_subject" IS NOT NULL AND "institution_type" IS NOT NULL)` +
  `)) OR ` +
  `("account_role" = 'ENTHUSIAST' AND ${NO_EDUCATION} AND ${NO_TEACHER}) OR ` +
  `("account_role" = 'PARENT' AND ${NO_TEACHER} AND (` +
  `(${NO_EDUCATION}) OR (` +
  `"education_level" = 'SECONDARY' AND "grade_level" IS NOT NULL AND ` +
  `"study_stream" IS NOT NULL AND "university_name" IS NULL AND ` +
  `"department_name" IS NULL AND "school_name" IS NULL` +
  `))) OR ` +
  `("account_role" = 'STUDENT' AND ${NO_TEACHER} AND (` +
  `(${NO_EDUCATION}) OR (` +
  `"education_level" = 'SECONDARY' AND "grade_level" IS NOT NULL AND ` +
  `"study_stream" IS NOT NULL AND "university_name" IS NULL AND "department_name" IS NULL` +
  `) OR (` +
  `"education_level" = 'UNDERGRADUATE' AND "grade_level" IS NULL AND ` +
  `"study_stream" IS NULL AND "university_name" IS NOT NULL AND ` +
  `"department_name" IS NOT NULL AND "school_name" IS NULL` +
  `) OR (` +
  `"education_level" = 'GRADUATE' AND "grade_level" IS NULL AND ` +
  `"study_stream" IS NULL AND "university_name" IS NOT NULL AND "school_name" IS NULL` +
  `)))` +
  `)) IS TRUE`;

export const TEACHER_SUBJECT_VALUES = `'COGRAFYA', 'SOSYAL_BILGILER', 'DIGER'`;
export const INSTITUTION_TYPE_VALUES = `'DEVLET_OKULU', 'OZEL_OKUL', 'DERSHANE_KURS', 'DIGER'`;
export const REFERRAL_SOURCE_VALUES = `'OGRETMEN', 'ARKADAS', 'YOUTUBE', 'INSTAGRAM', 'GOOGLE', 'KITAP', 'DIGER'`;
export const ACCOUNT_ROLE_VALUES = `'STUDENT', 'TEACHER', 'PARENT', 'ENTHUSIAST'`;
