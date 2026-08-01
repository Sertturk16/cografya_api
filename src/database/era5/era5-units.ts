import { Era5ContractError } from './era5.errors';

/**
 * Unit conversion for the ERA5-Land core pair — the heart of the silent-wrong class (SPEC §5.2,
 * probe M7).
 *
 * ## The `tp` trap, written down because the FILE LIES
 * The file's own attribute says `tp:units = "m"` — with **no "/day"**. Reading that attribute and
 * concluding "monthly total, in metres" is EXACTLY the 30× error SPEC §11-R3 is about. The real
 * evidence is the PRODUCT IDENTITY, not the attribute: the global `history` attribute carries
 * `filter_by_keys: {"stream": ["moda"]}` — *monthly means of daily means* — and ECMWF's own
 * ERA5-Land documentation states that accumulations in the `moda` stream "have units that include
 * 'per day'" and that hydrological parameters are in "m of water equivalent per day".
 *
 * So: **mm/month = value × days_in_that_month × 1000**.
 *
 * The probe raced the three candidate readings against reality (Rize's administrative point,
 * annual total):
 *   - `× days × 1000`  → 2 223 mm/yr  ✅ plausible for the Eastern Black Sea
 *   - `× 1000`         →    73 mm/yr  ❌ impossible
 *   - `× 24 × days × 1000` → 53 352 mm/yr ❌ impossible
 * The wrong multipliers land THREE ORDERS OF MAGNITUDE away, which is why the plausibility band
 * in `era5-assertions.ts` — loose as it is — catches them with certainty.
 *
 * ## Real calendar days, always
 * The 30-year normal averages each calendar month across 1991–2020, and February 1992/1996/…/2020
 * are 29-day months. Using a flat 30 or 30.44 would bias February by up to 3.4 %, small enough to
 * look right and therefore exactly the kind of error that survives review.
 */

/** Kelvin → Celsius offset. */
export const KELVIN_OFFSET = 273.15;

/** Metres of water equivalent → millimetres. */
export const METRES_TO_MM = 1000;

/** `t2m` in Kelvin → °C. NOT rounded — rounding happens once, in PR-2, when the normal is written. */
export function kelvinToCelsius(kelvin: number): number {
  if (!Number.isFinite(kelvin)) {
    throw new Era5ContractError(
      `kelvinToCelsius: expected a finite number, got ${String(kelvin)}.`,
    );
  }
  return kelvin - KELVIN_OFFSET;
}

/**
 * Proleptic-Gregorian days in a month. `month` is 1-based.
 *
 * The leap rule is spelled out rather than delegated to `Date`, because `new Date(y, m, 0)` runs
 * in the process's LOCAL time zone and would make the artifact depend on where it was generated —
 * a determinism hole in a committed file.
 */
export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Era5ContractError(
      `daysInMonth: expected an integer year and a month in 1…12, got ${String(year)}/${String(month)}.`,
    );
  }
  if (month === 2) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return isLeap ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/**
 * `tp` (m of water equivalent PER DAY, `stream=moda`) → total mm for that calendar month.
 *
 * See the module docblock: the multiplier is the product identity's, not the `units` attribute's.
 */
export function totalPrecipitationToMonthlyMm(
  metresPerDay: number,
  year: number,
  month: number,
): number {
  if (!Number.isFinite(metresPerDay)) {
    throw new Era5ContractError(
      `totalPrecipitationToMonthlyMm: expected a finite number, got ${String(metresPerDay)}.`,
    );
  }
  return metresPerDay * daysInMonth(year, month) * METRES_TO_MM;
}

/**
 * Physical range guards (SPEC §5.2). Out of range is a LOUD FAIL, never a silent null: this is a
 * migration, and missing data is not "degraded", the run stops and someone looks.
 *
 * Measured actuals across the whole TR grid sit comfortably inside: −15.96…+39.24 °C and
 * 0.014…726.6 mm/month, with zero negative precipitation samples.
 */
export const TEMPERATURE_MIN_C = -60;
export const TEMPERATURE_MAX_C = 60;
export const PRECIPITATION_MIN_MM = 0;
export const PRECIPITATION_MAX_MM = 2000;

export function assertTemperatureInRange(celsius: number, label: string): void {
  if (!Number.isFinite(celsius) || celsius < TEMPERATURE_MIN_C || celsius > TEMPERATURE_MAX_C) {
    throw new Era5ContractError(
      `${label}: temperature ${String(celsius)} °C is outside the physical guard ` +
        `[${String(TEMPERATURE_MIN_C)}, ${String(TEMPERATURE_MAX_C)}] °C.`,
    );
  }
}

export function assertPrecipitationInRange(millimetres: number, label: string): void {
  if (
    !Number.isFinite(millimetres) ||
    millimetres < PRECIPITATION_MIN_MM ||
    millimetres > PRECIPITATION_MAX_MM
  ) {
    throw new Era5ContractError(
      `${label}: precipitation ${String(millimetres)} mm/month is outside the physical guard ` +
        `[${String(PRECIPITATION_MIN_MM)}, ${String(PRECIPITATION_MAX_MM)}] mm.`,
    );
  }
}
