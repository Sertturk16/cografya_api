import { AUTH_RATE_LIMIT_RULES, AuthRateLimitScope } from './auth.types';

/**
 * Auth timers, ceilings and identifiers.
 *
 * CODE CONSTANTS, deliberately NOT env variables (D5, → `data-source-options.ts`'s
 * `DATABASE_STATEMENT_TIMEOUT_MS` docblock, applied here to a new domain): none of these is a
 * real operational choice an operator would tune per deployment, and opening a security
 * parameter to env means a misconfigured deployment silently weakens it. Env carries only
 * SECRETS and the transport selector (§11).
 *
 * Every test that asserts one of these numbers IMPORTS the constant rather than retyping it
 * (the `THROTTLE_LIMIT` precedent in `app.module.ts`; `CONVENTIONS.md` §2's structural-test
 * rule) — a test that hardcodes `900` would silently stop testing the real TTL the day someone
 * tunes it here.
 */

/** Access JWT lifetime, in seconds (§5.1). */
export const ACCESS_TOKEN_TTL_SECONDS = 900;

/** Refresh token family lifetime, in days; rotation TAZELER (slides) this window (§5.2.1). */
export const REFRESH_TOKEN_TTL_DAYS = 30;

/**
 * One-use recovery window for a refresh response that committed but was lost before the BFF
 * received it. It matches the BFF's sole auth-attempt timeout; it is a security boundary, not
 * an operator-tunable env value. `R5` in `auth-security.e2e-spec.ts` pins the one-use and
 * elapsed-window guards.
 */
export const REFRESH_ROTATION_GRACE_WINDOW_MS = 15_000;

/** Email verification code lifetime, in minutes (§5.3). */
export const EMAIL_VERIFICATION_TTL_MINUTES = 10;

/**
 * Wrong-code attempts allowed before a pending registration's code stops being accepted (§5.3).
 *
 * Unchanged in value and in effect by the `SEC136-C1` rework; what changed is only WHERE the
 * counter lives (`pending_registrations.attempt_count`) and what reaching the cap does — the row
 * survives to expiry instead of being deleted, so no caller without a valid code can destroy a
 * candidate. `PendingRegistration.attemptCount`'s docblock carries the full reasoning.
 */
export const EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;

/**
 * How many UNEXPIRED `pending_registrations` rows one address may hold at once.
 *
 * **DERIVED, not chosen** — and the derivation is the justification. Rows are created on exactly
 * two paths, and both are already bounded by the ATOMIC identity-axis limiter (§9.2,
 * `auth_rate_limits`, `INSERT … ON CONFLICT … RETURNING`): `register` spends `REGISTER_EMAIL` and
 * `verify-email/resend` spends `VERIFY_RESEND_DAILY`. Their sum is therefore the largest number of
 * candidates one address can accumulate inside a single 24-hour window, so a ceiling at that sum
 * can never be what refuses an honest user — the limiter refuses them first, with the same
 * body-less 202.
 *
 * **It is still not a rule that never fires.** Both limiter windows are FIXED windows
 * (`floor(now / windowMs) * windowMs`, D10's recorded trade-off), so an address sitting on a
 * window boundary can spend two full budgets minutes apart. This ceiling is what stops that from
 * putting an unbounded pile of live codes in one mailbox — the surface the owner's accepted
 * residual risk (a victim choosing the wrong code) is measured against.
 *
 * Hitting it is silent by design: the request still answers the same body-less 202, because a
 * distinguishable answer would be a new enumeration channel (§6.2).
 */
export const PENDING_REGISTRATION_MAX_ACTIVE =
  AUTH_RATE_LIMIT_RULES[AuthRateLimitScope.RegisterEmail].limit +
  AUTH_RATE_LIMIT_RULES[AuthRateLimitScope.VerifyResendDaily].limit;

/** Password reset token lifetime, in minutes — shorter than the verification code (§5.4). */
export const PASSWORD_RESET_TTL_MINUTES = 30;

/** Timeout wrapped around every `MailerPort.send` call (§8). */
export const MAIL_SEND_TIMEOUT_MS = 10_000;

/** Fixed JWT `iss` claim (§5.1). */
export const AUTH_TOKEN_ISSUER = 'cografya-api';

/** Fixed JWT `aud` claim (§5.1). */
export const AUTH_TOKEN_AUDIENCE = 'cografya-web';

/**
 * Lower bound on every NEW password — `RegisterRequestDto.password`,
 * `PasswordChangeRequestDto.newPassword` and `PasswordResetConfirmDto.password`, all through
 * `isPasswordPolicyCompliant`. Owner decision: raised from 6 to 8, the minimum NIST SP 800-63B
 * sets for a memorized secret the user chooses.
 *
 * Deliberately NOT applied to a password the account already has: `LoginRequestDto.password` and
 * `PasswordChangeRequestDto.currentPassword` carry no policy validator, so a password set under
 * the old floor keeps logging in until its owner changes it (`auth-endpoints.e2e-spec.ts` N11).
 */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * `RegisterRequestDto.password` upper bound. Not an owner ruling — an engineering ceiling so
 * Argon2's input is never left unbounded (§6.4).
 */
export const PASSWORD_MAX_LENGTH = 128;
