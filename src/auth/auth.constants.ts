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

/** Email verification code lifetime, in minutes (§5.3). */
export const EMAIL_VERIFICATION_TTL_MINUTES = 10;

/** Wrong-code attempts allowed before the code is destroyed (§5.3). */
export const EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;

/** Password reset token lifetime, in minutes — shorter than the verification code (§5.4). */
export const PASSWORD_RESET_TTL_MINUTES = 30;

/** Timeout wrapped around every `MailerPort.send` call (§8). */
export const MAIL_SEND_TIMEOUT_MS = 10_000;

/** Fixed JWT `iss` claim (§5.1). */
export const AUTH_TOKEN_ISSUER = 'cografya-api';

/** Fixed JWT `aud` claim (§5.1). */
export const AUTH_TOKEN_AUDIENCE = 'cografya-web';

/** `RegisterRequestDto.password` lower bound (`DEC 2026-08-20g` md.1 #5). */
export const PASSWORD_MIN_LENGTH = 6;

/**
 * `RegisterRequestDto.password` upper bound. Not an owner ruling — an engineering ceiling so
 * Argon2's input is never left unbounded (§6.4).
 */
export const PASSWORD_MAX_LENGTH = 128;
