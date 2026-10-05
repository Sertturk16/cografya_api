import { describe, expect, it } from '@jest/globals';
import { validateSync } from 'class-validator';
import { AUTH_ERROR_KEYS } from '../auth-error-keys';
import { PASSWORD_MIN_LENGTH } from '../auth.constants';
import { LoginRequestDto } from './login-request.dto';
import { PasswordChangeRequestDto } from './password-change-request.dto';
import { PasswordResetConfirmDto } from './password-reset-confirm.dto';
import { RegisterRequestDto } from './register-request.dto';

/** Carries a lowercase letter, an uppercase letter and a digit, so only its length can fail. */
function passwordOfLength(length: number): string {
  return `Aa1${'a'.repeat(length - 3)}`;
}

/** Constraint messages on ONE field; the other fields are left unset and their errors ignored. */
function fieldErrors(dto: object, field: string): string[] {
  return validateSync(dto)
    .filter((error) => error.property === field)
    .flatMap((error) => Object.values(error.constraints ?? {}));
}

const BELOW_FLOOR = passwordOfLength(PASSWORD_MIN_LENGTH - 1);
const AT_FLOOR = passwordOfLength(PASSWORD_MIN_LENGTH);

/**
 * The floor binds every route that SETS a password, and only those. Each case validates the real
 * DTO class, so it reads the same decorator metadata the global `ValidationPipe` does: a field
 * that loses `@IsPasswordPolicyCompliant()`, or a login/current-password field that gains it,
 * fails here without an e2e register call (`auth-endpoints.e2e-spec.ts` sits at the register
 * throttle ceiling).
 */
describe('password fields — the length floor applies to new passwords only', () => {
  it('builds its fixtures one below and exactly at the floor', () => {
    expect(BELOW_FLOOR).toHaveLength(PASSWORD_MIN_LENGTH - 1);
    expect(AT_FLOOR).toHaveLength(PASSWORD_MIN_LENGTH);
  });

  describe.each([
    ['RegisterRequestDto.password', () => new RegisterRequestDto(), 'password'],
    ['PasswordChangeRequestDto.newPassword', () => new PasswordChangeRequestDto(), 'newPassword'],
    ['PasswordResetConfirmDto.password', () => new PasswordResetConfirmDto(), 'password'],
  ] as const)('%s', (_name, build, field) => {
    it('rejects a password one character below the floor with the weak-password key', () => {
      const dto = Object.assign(build(), { [field]: BELOW_FLOOR });
      expect(fieldErrors(dto, field)).toEqual([AUTH_ERROR_KEYS.weakPassword]);
    });

    it('accepts a password exactly at the floor', () => {
      const dto = Object.assign(build(), { [field]: AT_FLOOR });
      expect(fieldErrors(dto, field)).toEqual([]);
    });
  });

  describe.each([
    ['LoginRequestDto.password', () => new LoginRequestDto(), 'password'],
    [
      'PasswordChangeRequestDto.currentPassword',
      () => new PasswordChangeRequestDto(),
      'currentPassword',
    ],
  ] as const)('%s (an existing password)', (_name, build, field) => {
    it('accepts a password below the floor, so an older password still authenticates', () => {
      const dto = Object.assign(build(), { [field]: BELOW_FLOOR });
      expect(fieldErrors(dto, field)).toEqual([]);
    });
  });
});
