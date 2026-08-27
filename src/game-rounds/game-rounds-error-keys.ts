/**
 * The i18n error keys this module publishes (`ENGINEERING.md` §6 — the api never writes
 * user-facing prose; the sentence a reader sees is `cografya_web`'s). No `NotFoundException`
 * path exists in this module at all — there is no external business key to resolve (plan §5.1).
 */
export const GAME_ROUNDS_ERROR_KEYS = {
  /** Submitted summary fails the cross-field structural checks (plan §5.3). */
  invalidSummary: 'errors.gameRounds.invalidSummary',
  /**
   * The per-user submission rate limit (`GameRoundSubmitRateLimitGuard`, UYELIK-09
   * fix-round-2) was exceeded — mirrors the repo's own precedent for a rate-limit 429,
   * `AUTH_ERROR_KEYS.tooManyAttempts` (`session.service.ts`).
   */
  tooManySubmissions: 'errors.gameRounds.tooManySubmissions',
} as const;

export type GameRoundsErrorKey =
  (typeof GAME_ROUNDS_ERROR_KEYS)[keyof typeof GAME_ROUNDS_ERROR_KEYS];
