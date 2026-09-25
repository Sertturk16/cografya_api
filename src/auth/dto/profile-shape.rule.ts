import {
  registerDecorator,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidationOptions,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { AccountRole, EducationLevel, InstitutionType, TeacherSubject } from '../account.types';

/** The fields of `RegisterRequestDto` the profile-shape matrix reasons about. */
export interface ProfileShapeCandidate {
  readonly accountRole?: AccountRole;
  readonly educationLevel?: EducationLevel | null;
  readonly gradeLevel?: unknown;
  readonly studyStream?: unknown;
  readonly universityName?: unknown;
  readonly departmentName?: unknown;
  readonly schoolName?: unknown;
  readonly teacherSubject?: unknown;
  readonly institutionType?: unknown;
}

const isNil = (value: unknown): boolean => value === undefined || value === null;

/**
 * §5.2's profile matrix, evaluated in TypeScript — the exact same branches
 * `CHK_users_profile_shape` (`../entities/user.entity.ts`) enforces in SQL. Two independent
 * enforcements of one rule is deliberate (the DB CHECK is the backstop this class cannot
 * bypass even if it has a bug), so this function's branches must never diverge from that
 * CHECK's branches (T-103):
 *  - TEACHER: no education field at all; `teacherSubject`/`institutionType` both or neither.
 *  - ENTHUSIAST: no field at all — no education field, no teacher field.
 *  - PARENT (minimal): no field at all.
 *  - PARENT + SECONDARY: the CHILD's gradeLevel + studyStream required; university/department/
 *    schoolName forbidden (the child is not identified by school); no teacher field.
 *  - PARENT + UNDERGRADUATE/GRADUATE: rejected — a parent never declares higher education.
 *  - STUDENT (minimal): no education field at all (educationLevel absent/null); no teacher field.
 *  - STUDENT + SECONDARY: gradeLevel + studyStream required; university/department forbidden;
 *    `schoolName` unconstrained (optional, no consuming feature yet) — the only branch that does
 *    not pin it either way.
 *  - STUDENT + UNDERGRADUATE: university + department required; grade/stream/schoolName
 *    forbidden.
 *  - STUDENT + GRADUATE: university required, department OPTIONAL; grade/stream/schoolName
 *    forbidden.
 */
export function isProfileShapeValid(candidate: ProfileShapeCandidate): boolean {
  const {
    accountRole,
    educationLevel,
    gradeLevel,
    studyStream,
    universityName,
    departmentName,
    schoolName,
    teacherSubject,
    institutionType,
  } = candidate;

  const noEducation =
    isNil(educationLevel) &&
    isNil(gradeLevel) &&
    isNil(studyStream) &&
    isNil(universityName) &&
    isNil(departmentName) &&
    isNil(schoolName);
  const noTeacherFields = isNil(teacherSubject) && isNil(institutionType);

  switch (accountRole) {
    case AccountRole.Teacher:
      // Both or neither: a minimal teacher is accepted the way a minimal student is.
      return (
        noEducation && (noTeacherFields || (!isNil(teacherSubject) && !isNil(institutionType)))
      );
    case AccountRole.Enthusiast:
      return noEducation && noTeacherFields;
    case AccountRole.Parent:
      // The education columns describe the child: one secondary grade + stream, no school.
      if (!noTeacherFields) return false;
      if (isNil(educationLevel)) return noEducation;
      return (
        educationLevel === EducationLevel.Secondary &&
        !isNil(gradeLevel) &&
        !isNil(studyStream) &&
        isNil(universityName) &&
        isNil(departmentName) &&
        isNil(schoolName)
      );
    case AccountRole.Student:
      if (!noTeacherFields) return false;
      if (isNil(educationLevel)) return noEducation;
      if (educationLevel === EducationLevel.Secondary) {
        // `schoolName` is optional here and only here.
        return (
          !isNil(gradeLevel) &&
          !isNil(studyStream) &&
          isNil(universityName) &&
          isNil(departmentName)
        );
      }
      if (educationLevel === EducationLevel.Undergraduate) {
        return (
          isNil(gradeLevel) &&
          isNil(studyStream) &&
          !isNil(universityName) &&
          !isNil(departmentName) &&
          isNil(schoolName)
        );
      }
      if (educationLevel === EducationLevel.Graduate) {
        return (
          isNil(gradeLevel) && isNil(studyStream) && !isNil(universityName) && isNil(schoolName)
        );
      }
      return false;
    default:
      return false;
  }
}

export const PROFILE_SHAPE_MESSAGE =
  'profile fields do not match the required combination for the declared accountRole ' +
  '(teacher: no education field, teacherSubject and institutionType both or neither; ' +
  'enthusiast: no field; parent: none, or secondary gradeLevel+studyStream without school; ' +
  'student: none, secondary gradeLevel+studyStream with optional schoolName, undergraduate ' +
  'university+department, graduate university with optional department; teacher fields only ' +
  'on a teacher)';

/** Whether the declared profile is complete for its role (spec §5.2). */
export function isProfileComplete(profile: {
  accountRole: AccountRole;
  educationLevel: EducationLevel | null;
  teacherSubject: TeacherSubject | null;
  institutionType: InstitutionType | null;
}): boolean {
  switch (profile.accountRole) {
    case AccountRole.Teacher:
      return profile.teacherSubject !== null && profile.institutionType !== null;
    case AccountRole.Enthusiast:
      return true;
    default:
      return profile.educationLevel !== null;
  }
}

@ValidatorConstraint({ name: 'profileShapeValid', async: false })
class ProfileShapeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    return isProfileShapeValid(args.object);
  }

  defaultMessage(): string {
    return PROFILE_SHAPE_MESSAGE;
  }
}

/**
 * Applied to `accountRole` — the natural discriminator field — but validates the WHOLE request
 * object via `args.object`, not just that one property. class-validator's public API has no true
 * class-level decorator; attaching a whole-object rule to one of its own fields (rather than an
 * unrelated sentinel property) is the standard working pattern, and it puts the rule beside the
 * field that drives its branch for a reader scanning the DTO top-to-bottom.
 */
export function ProfileShapeValid(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'profileShapeValid',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: ProfileShapeConstraint,
    });
  };
}
