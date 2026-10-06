/** The i18n error keys this module publishes; the sentence a reader sees is `cografya_web`'s. */
export const AIR_QUALITY_ERROR_KEYS = {
  /**
   * `GET /air-quality/provinces/{plateCode}`: no province carries the plate code, or the
   * province has no reference point (excluded from the detail endpoint). One key for both: the
   * caller cannot act on the difference, and the second case is logged and counted server-side.
   */
  provinceNotFound: 'errors.airQuality.provinceNotFound',
} as const;

export type AirQualityErrorKey =
  (typeof AIR_QUALITY_ERROR_KEYS)[keyof typeof AIR_QUALITY_ERROR_KEYS];
