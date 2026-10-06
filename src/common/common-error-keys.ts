/**
 * The i18n error keys no single module owns; the sentence a reader sees is `cografya_web`'s.
 */
export const COMMON_ERROR_KEYS = {
  /**
   * The 429 of any route that declares no `@ThrottlerErrorMessage` of its own: the global
   * per-client window (`THROTTLE_LIMIT` in `app.module.ts`) was exceeded. Answered by
   * `TrustedClientThrottlerGuard.getErrorMessage` instead of `@nestjs/throttler`'s English prose.
   */
  tooManyRequests: 'errors.common.tooManyRequests',
} as const;

export type CommonErrorKey = (typeof COMMON_ERROR_KEYS)[keyof typeof COMMON_ERROR_KEYS];
