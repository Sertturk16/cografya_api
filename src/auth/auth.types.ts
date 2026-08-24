/**
 * Why a `sessions` row's refresh token was revoked.
 *
 * Values are INTERNAL/operational: `GLOSSARY.md` §2.3 records that
 * `sessions.revoked_reason` is never published in `openapi.json`, never shown to a reader and
 * carries no TR/EN pair for exactly that reason. Members match
 * `CHK_sessions_revoked_reason` in `1787565600000-InitAuthSessions.ts` token for token;
 * nothing machine-compares the two, so they change together by hand.
 */
export enum SessionRevocationReason {
  Rotated = 'ROTATED',
  Logout = 'LOGOUT',
  ReuseDetected = 'REUSE_DETECTED',
  PasswordReset = 'PASSWORD_RESET',
  Expired = 'EXPIRED',
  AccountInactive = 'ACCOUNT_INACTIVE',
}

/**
 * The identity-axis rate limiter's closed scope set (§9.2).
 *
 * Values are INTERNAL/operational for the same reason as `SessionRevocationReason` and match
 * `CHK_auth_rate_limits_scope` token for token.
 */
export enum AuthRateLimitScope {
  RegisterEmail = 'REGISTER_EMAIL',
  VerifyResendCooldown = 'VERIFY_RESEND_COOLDOWN',
  VerifyResendDaily = 'VERIFY_RESEND_DAILY',
  LoginEmail = 'LOGIN_EMAIL',
  PasswordResetEmail = 'PASSWORD_RESET_EMAIL',
}

/** One scope's cap and window, in milliseconds. */
export interface AuthRateLimitRule {
  readonly limit: number;
  readonly windowMs: number;
}

const ONE_SECOND_MS = 1_000;
const ONE_MINUTE_MS = 60 * ONE_SECOND_MS;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/**
 * §9.2's cap table, keyed on `AuthRateLimitScope` so a scope cannot exist here without also
 * being a member of the CHECK-constrained closed set — `Record<AuthRateLimitScope, …>` makes an
 * incomplete table a compile error the moment the enum grows.
 */
export const AUTH_RATE_LIMIT_RULES: Readonly<Record<AuthRateLimitScope, AuthRateLimitRule>> = {
  [AuthRateLimitScope.RegisterEmail]: { limit: 3, windowMs: ONE_DAY_MS },
  [AuthRateLimitScope.VerifyResendCooldown]: { limit: 1, windowMs: 60 * ONE_SECOND_MS },
  [AuthRateLimitScope.VerifyResendDaily]: { limit: 5, windowMs: ONE_DAY_MS },
  [AuthRateLimitScope.LoginEmail]: { limit: 10, windowMs: 15 * ONE_MINUTE_MS },
  [AuthRateLimitScope.PasswordResetEmail]: { limit: 3, windowMs: ONE_HOUR_MS },
};
