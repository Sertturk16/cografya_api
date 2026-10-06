/** The i18n error keys this module publishes; the sentence a reader sees is `cografya_web`'s. */
export const ELEVATION_ERROR_KEYS = {
  /** `ELEVATION_ENABLED=false`: the path "does not exist" (`ElevationEnabledGuard`). */
  notFound: 'errors.elevation.notFound',
  /**
   * The two endpoints are the same point once rounded to `ELEVATION_COORDINATE_DECIMALS`: a
   * zero-length line has no cross-section. Two points ~40 m apart look different to the caller
   * and identical to the service, which is why the key names the rounding, not the input.
   */
  endpointsCoincide: 'errors.elevation.endpointsCoincide',
} as const;

export type ElevationErrorKey = (typeof ELEVATION_ERROR_KEYS)[keyof typeof ELEVATION_ERROR_KEYS];
