/**
 * The three i18n error keys this module publishes (`ENGINEERING.md` §6 — the api never writes
 * user-facing prose; the sentence a reader sees is `cografya_web`'s).
 */
export const MEASUREMENTS_ERROR_KEYS = {
  /** `GET`/`PATCH`/`DELETE /api/measurements/{id}` — no row for this id and this caller. */
  notFound: 'errors.measurements.notFound',
  /** `POST /api/measurements` — the caller already holds `MEASUREMENTS_PER_USER_MAX` rows. */
  quotaExceeded: 'errors.measurements.quotaExceeded',
  /** `POST /api/measurements` — the point count does not match `type`'s minimum (plan §5.9.1). */
  invalidShape: 'errors.measurements.invalidShape',
} as const;

export type MeasurementsErrorKey =
  (typeof MEASUREMENTS_ERROR_KEYS)[keyof typeof MEASUREMENTS_ERROR_KEYS];
