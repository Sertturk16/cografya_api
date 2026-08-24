import { registerDecorator, type ValidationOptions } from 'class-validator';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './auth.constants';

/**
 * `DEC 2026-08-20g` md.1 #5: at least one lowercase letter, one uppercase letter and one digit,
 * length within `[PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH]` — imported from `auth.constants`,
 * never retyped (§11 D5, `CONVENTIONS.md` §2's structural-test rule).
 */
export function isPasswordPolicyCompliant(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) return false;
  if (!/[a-z]/.test(value)) return false;
  if (!/[A-Z]/.test(value)) return false;
  if (!/[0-9]/.test(value)) return false;
  return true;
}

/**
 * `RegisterRequestDto.password` and `PasswordResetConfirmDto.password` both carry this decorator
 * — the one shared password policy (§6.4, §5.4). Its default message is the i18n key §6.3 names
 * for a weak password (`errors.register.weakPassword`, reused verbatim by the reset-confirm path
 * per the endpoint table — no second key was minted for the same rule under a different name).
 */
export function IsPasswordPolicyCompliant(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'isPasswordPolicyCompliant',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return isPasswordPolicyCompliant(value);
        },
        defaultMessage(): string {
          return 'errors.register.weakPassword';
        },
      },
    });
  };
}
