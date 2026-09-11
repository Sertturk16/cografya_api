/**
 * The one i18n error key this module publishes (`ENGINEERING.md` §6 — the api never writes
 * user-facing prose; the sentence a reader sees is `cografya_web`'s).
 */
export const VIDEO_IDENTITY_ERROR_KEYS = {
  /** `GET`, `{bookVideoId}` is well-formed but names no `BookVideo` row. */
  notFound: 'errors.videoIdentity.notFound',
} as const;

export type VideoIdentityErrorKey =
  (typeof VIDEO_IDENTITY_ERROR_KEYS)[keyof typeof VIDEO_IDENTITY_ERROR_KEYS];
