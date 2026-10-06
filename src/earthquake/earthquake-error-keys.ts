/** The i18n error keys this module publishes; the sentence a reader sees is `cografya_web`'s. */
export const EARTHQUAKE_ERROR_KEYS = {
  /** `GET /earthquakes/provinces/{plateCode}`, the well-formed plate code names no province. */
  provinceNotFound: 'errors.earthquake.provinceNotFound',
  /** `fromUtc`/`toUtc` did not parse to an instant (only if the DTO's `@IsISO8601` loosens). */
  windowInvalid: 'errors.earthquake.windowInvalid',
  /** `fromUtc` is later than `toUtc`. */
  windowReversed: 'errors.earthquake.windowReversed',
  /** The window spans more than `EARTHQUAKE_MAX_WINDOW_DAYS`. */
  windowTooLong: 'errors.earthquake.windowTooLong',
} as const;

export type EarthquakeErrorKey = (typeof EARTHQUAKE_ERROR_KEYS)[keyof typeof EARTHQUAKE_ERROR_KEYS];
