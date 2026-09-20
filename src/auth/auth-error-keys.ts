/**
 * The single home of every i18n error key this package publishes (§6.3) — twelve keys, no more.
 * `ApiErrorDto.message` carries one of these; the api never writes user-facing prose (`ENGINEERING.md`
 * §6, Y12) — the sentence a reader sees is `cografya_web`'s (`messages/{tr,en}.json`).
 *
 * SPEC's superset drops three keys and one whole namespace, each recorded at §2.4:
 * `errors.register.emailTaken` (S4, anti-enumeration), `errors.register.passwordMismatch` (S6,
 * no `passwordConfirm` field), `errors.verify.codeExpired` (S5, expired/invalid collapsed to one
 * answer) and `errors.register.districtNotInProvince` (the framework 400 already names the field).
 */
export const AUTH_ERROR_KEYS = {
  unauthenticated: 'errors.auth.unauthenticated',
  invalidCredentials: 'errors.auth.invalidCredentials',
  emailNotVerified: 'errors.auth.emailNotVerified',
  accountDisabled: 'errors.auth.accountDisabled',
  sessionExpired: 'errors.auth.sessionExpired',
  tooManyAttempts: 'errors.auth.tooManyAttempts',
  rateLimited: 'errors.auth.rateLimited',
  weakPassword: 'errors.register.weakPassword',
  verifyCodeInvalid: 'errors.verify.codeInvalid',
  resetTokenInvalid: 'errors.password.resetTokenInvalid',
  // T-061, `POST /api/auth/password/change`. Two keys rather than one because the two answers
  // are genuinely different actions for the member: re-enter the password you have, versus
  // choose a different new one. Neither is an enumeration oracle — the route is behind
  // `AccessTokenGuard`, so the caller already holds a session for the account in question and
  // learns nothing about anyone else's.
  passwordCurrentInvalid: 'errors.password.currentInvalid',
  passwordUnchanged: 'errors.password.unchanged',
} as const;

export type AuthErrorKey = (typeof AUTH_ERROR_KEYS)[keyof typeof AUTH_ERROR_KEYS];
