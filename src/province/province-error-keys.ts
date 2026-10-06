/** The i18n error keys this module publishes; the sentence a reader sees is `cografya_web`'s. */
export const PROVINCE_ERROR_KEYS = {
  /** `GET /provinces/{slug}`, the slug matches no province in either language. */
  notFound: 'errors.province.notFound',
} as const;

export type ProvinceErrorKey = (typeof PROVINCE_ERROR_KEYS)[keyof typeof PROVINCE_ERROR_KEYS];
