import {
  registerDecorator,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidationOptions,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { AccountRole, EducationLevel } from '../account.types';

/** The fields of `RegisterRequestDto` the profile-shape matrix reasons about. */
export interface ProfileShapeCandidate {
  readonly accountRole?: AccountRole;
  readonly educationLevel?: EducationLevel | null;
  readonly gradeLevel?: unknown;
  readonly studyStream?: unknown;
  readonly universityName?: unknown;
  readonly departmentName?: unknown;
}

const isNil = (value: unknown): boolean => value === undefined || value === null;

/**
 * §6.4's profile matrix, evaluated in TypeScript — the exact same five branches
 * `CHK_users_profile_shape` (`../entities/user.entity.ts`) enforces in SQL. Two independent
 * enforcements of one rule is deliberate (the DB CHECK is the backstop this class cannot
 * bypass even if it has a bug), so this function's five branches must never diverge from that
 * CHECK's five branches:
 *  - TEACHER: no education field at all.
 *  - STUDENT (minimal): no education field at all (educationLevel absent/null).
 *  - STUDENT + SECONDARY: gradeLevel + studyStream required; university/department forbidden.
 *  - STUDENT + UNDERGRADUATE: university + department required; grade/stream forbidden.
 *  - STUDENT + GRADUATE: university required, department OPTIONAL; grade/stream forbidden.
 */
export function isProfileShapeValid(candidate: ProfileShapeCandidate): boolean {
  const { accountRole, educationLevel, gradeLevel, studyStream, universityName, departmentName } =
    candidate;

  if (accountRole === AccountRole.Teacher) {
    return (
      isNil(educationLevel) &&
      isNil(gradeLevel) &&
      isNil(studyStream) &&
      isNil(universityName) &&
      isNil(departmentName)
    );
  }

  if (accountRole === AccountRole.Student) {
    // Minimal registration (Decision 2-B, DEC 2026-09-03a md.1): student can register
    // without education fields pending post-registration profile onboarding.
    if (isNil(educationLevel)) {
      return (
        isNil(gradeLevel) && isNil(studyStream) && isNil(universityName) && isNil(departmentName)
      );
    }
    if (educationLevel === EducationLevel.Secondary) {
      return (
        !isNil(gradeLevel) && !isNil(studyStream) && isNil(universityName) && isNil(departmentName)
      );
    }
    if (educationLevel === EducationLevel.Undergraduate) {
      return (
        isNil(gradeLevel) && isNil(studyStream) && !isNil(universityName) && !isNil(departmentName)
      );
    }
    if (educationLevel === EducationLevel.Graduate) {
      return isNil(gradeLevel) && isNil(studyStream) && !isNil(universityName);
    }
    return false;
  }

  return false;
}

export const PROFILE_SHAPE_MESSAGE =
  'profile fields do not match the required combination for the declared accountRole/' +
  'educationLevel (teacher/minimal student: no education fields; secondary: gradeLevel+studyStream only; ' +
  'undergraduate: university+department only; graduate: university required, department optional)';

/**
 * Returns whether the profile is complete for the given role and education level
 * (`plan-api.md` §5.3.5, `DEC 2026-09-04a` md.1, `GLOSSARY.md` §7.1).
 *
 * - TEACHER: always true. A teacher declaration carries no additional education fields ("ek eğitim alanı taşımaz").
 * - STUDENT: true if and only if educationLevel !== null.
 */
export function isProfileComplete(
  accountRole: AccountRole,
  educationLevel: EducationLevel | null | undefined,
): boolean {
  if (accountRole === AccountRole.Teacher) {
    return true;
  }
  return educationLevel !== null && educationLevel !== undefined;
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
