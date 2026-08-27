/**
 * The one i18n error key this module publishes (`ENGINEERING.md` §6 — the api never writes
 * user-facing prose; the sentence a reader sees is `cografya_web`'s). No `NotFoundException`
 * path exists in this module at all — there is no external business key to resolve (plan §5.1).
 */
export const GAME_ROUNDS_ERROR_KEYS = {
  /** Submitted summary fails the cross-field structural checks (plan §5.3). */
  invalidSummary: 'errors.gameRounds.invalidSummary',
} as const;

export type GameRoundsErrorKey =
  (typeof GAME_ROUNDS_ERROR_KEYS)[keyof typeof GAME_ROUNDS_ERROR_KEYS];
