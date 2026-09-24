/**
 * Retention policy for short-lived auth records (T-101). Policy, not env: the privacy page on the
 * web quotes these periods (`docs/architecture.md` "Data retention"), so an operator must not be
 * able to change them per deploy without the text changing too.
 */

const ONE_HOUR_MS = 60 * 60 * 1000;

/** How often the cleanup tour runs. */
export const RETENTION_CLEANUP_INTERVAL_SECONDS = 60 * 60;

/**
 * The tour's own budget. It is a handful of DELETEs over indexed columns, each already bounded by
 * the pool-wide 30 s statement timeout; the number exists because `ScheduledWarmupService` needs
 * one (the `PURGE_TOUR_DEADLINE_MS` precedent in `book.module.ts`).
 */
export const RETENTION_CLEANUP_DEADLINE_MS = 120_000;

/**
 * A pending registration or a password-reset token is deleted once it has been EXPIRED for this
 * long. Not zero: `EmailVerificationService.insertCandidate` still reads a just-expired candidate
 * when it decides whether a resend is ambiguous, and one day matches the longest identity-axis
 * rate-limit window, so no in-flight decision loses a row it is looking at.
 */
export const EXPIRED_AUTH_RECORD_GRACE_MS = 24 * ONE_HOUR_MS;
