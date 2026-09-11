/**
 * The one i18n error key this module publishes (`ENGINEERING.md` §6 — the api never writes
 * user-facing prose; the sentence a reader sees is `cografya_web`'s).
 *
 * A SINGLE key for every failure state `VideoCoverService.getCover` can reach — an unknown id, a
 * non-servable snapshot, a disallowed upstream host, or any upstream failure class — by design
 * (plan §5.6): nothing about the response may let a caller distinguish WHY a cover is unavailable,
 * mirroring `VIDEO_IDENTITY_ERROR_KEYS`'s own single-key shape.
 */
export const VIDEO_COVER_ERROR_KEYS = {
  notFound: 'errors.videoCover.notFound',
} as const;

export type VideoCoverErrorKey =
  (typeof VIDEO_COVER_ERROR_KEYS)[keyof typeof VIDEO_COVER_ERROR_KEYS];
