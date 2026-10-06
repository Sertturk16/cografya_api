/** The i18n error keys this module publishes; the sentence a reader sees is `cografya_web`'s. */
export const MARINE_ERROR_KEYS = {
  /**
   * Every marine 404, on purpose one key: the feature is off (`MarineEnabledGuard`), the slug
   * names no point, or the province is inland. While the feature is off these paths "do not
   * exist", so the body must not tell "disabled" apart from "no such resource".
   */
  notFound: 'errors.marine.notFound',
} as const;

export type MarineErrorKey = (typeof MARINE_ERROR_KEYS)[keyof typeof MARINE_ERROR_KEYS];
