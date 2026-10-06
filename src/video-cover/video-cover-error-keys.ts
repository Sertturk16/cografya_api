/**
 * The i18n error keys this module publishes (`ENGINEERING.md` §6 — the api never writes
 * user-facing prose; the sentence a reader sees is `cografya_web`'s).
 */
export const VIDEO_COVER_ERROR_KEYS = {
  /**
   * A SINGLE key for every failure state `VideoCoverService.getCover` can reach — an unknown id, a
   * non-servable snapshot, a disallowed upstream host, or any upstream failure class — by design
   * (plan §5.6): nothing about the response may let a caller distinguish WHY a cover is
   * unavailable, mirroring `VIDEO_IDENTITY_ERROR_KEYS`'s own single-key shape.
   */
  notFound: 'errors.videoCover.notFound',
  /**
   * The route's own `@Throttle` ceiling (`VIDEO_COVER_THROTTLE_LIMIT`). Says nothing about the
   * cover itself: the throttle guard answers before the handler looks the id up.
   */
  tooManyRequests: 'errors.videoCover.tooManyRequests',
} as const;

export type VideoCoverErrorKey =
  (typeof VIDEO_COVER_ERROR_KEYS)[keyof typeof VIDEO_COVER_ERROR_KEYS];
