import { registerDecorator, type ValidationOptions } from 'class-validator';
import { DEPARTMENTS } from '../reference/department.data';
import { UNIVERSITIES } from '../reference/university.data';

/**
 * `UNIVERSITIES`/`DEPARTMENTS` reduced to their `nameTr` membership set, built ONCE when this
 * module loads — a registration request checks membership at O(1) rather than scanning a 223- or
 * 345-row array per request. **No count is asserted here** (`CONVENTIONS.md` §2): the size is
 * whatever the two compile-time lists carry, and `reference-lists.spec.ts` already fact-checks
 * their contents independently.
 */
export const KNOWN_UNIVERSITY_NAMES: ReadonlySet<string> = new Set(
  UNIVERSITIES.map((university) => university.nameTr),
);
export const KNOWN_DEPARTMENT_NAMES: ReadonlySet<string> = new Set(
  DEPARTMENTS.map((department) => department.nameTr),
);

export function isKnownUniversityName(value: unknown): boolean {
  return typeof value === 'string' && KNOWN_UNIVERSITY_NAMES.has(value);
}

export function isKnownDepartmentName(value: unknown): boolean {
  return typeof value === 'string' && KNOWN_DEPARTMENT_NAMES.has(value);
}

/** `RegisterRequestDto.universityName` — must be a `nameTr` the reference list actually publishes. */
export function IsKnownUniversityName(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'isKnownUniversityName',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return isKnownUniversityName(value);
        },
        defaultMessage(): string {
          return 'universityName must be one of the registration form’s known university names';
        },
      },
    });
  };
}

/** `RegisterRequestDto.departmentName` — must be a `nameTr` the reference list actually publishes. */
export function IsKnownDepartmentName(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'isKnownDepartmentName',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return isKnownDepartmentName(value);
        },
        defaultMessage(): string {
          return 'departmentName must be one of the registration form’s known department names';
        },
      },
    });
  };
}
