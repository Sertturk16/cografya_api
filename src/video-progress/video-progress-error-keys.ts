/**
 * The four i18n error keys this module publishes (`ENGINEERING.md` §6 — the api never writes
 * user-facing prose; the sentence a reader sees is `cografya_web`'s).
 */
export const VIDEO_PROGRESS_ERROR_KEYS = {
  /** `PUT`, `{bookVideoId}` is well-formed but names no `BookVideo` row. */
  videoNotFound: 'errors.videoProgress.videoNotFound',
  /** `GET`, no progress row for `(caller, bookVideoId)` — whatever `bookVideoId` names. */
  notFound: 'errors.videoProgress.notFound',
  /** `PUT`, `lastPositionSeconds` exceeds the applicable ceiling (plan §5.4). */
  positionExceedsDuration: 'errors.videoProgress.positionExceedsDuration',
  /** `GET /books/{slug}`, the slug is well-formed but names no `Book` row (PR-B plan §5). */
  bookNotFound: 'errors.videoProgress.bookNotFound',
} as const;

export type VideoProgressErrorKey =
  (typeof VIDEO_PROGRESS_ERROR_KEYS)[keyof typeof VIDEO_PROGRESS_ERROR_KEYS];
