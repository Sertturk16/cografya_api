/** The i18n error keys this module publishes; the sentence a reader sees is `cografya_web`'s. */
export const COUNTRY_ERROR_KEYS = {
  /** `GET /countries/{slug}`, the slug matches no country in either language. */
  notFound: 'errors.country.notFound',
} as const;

export type CountryErrorKey = (typeof COUNTRY_ERROR_KEYS)[keyof typeof COUNTRY_ERROR_KEYS];
