import { MarineUnit } from '../marine.types';

/**
 * The CMEMS adapter's closed vocabulary: zoom, variables, units, plausibility windows.
 *
 * One file on purpose, like `marine.types.ts`: the URL builder, the response parser, the
 * probe and the merge core all read the same values, and a constant duplicated between the
 * probe and the runtime is exactly how the probe ends up proving a different request than the
 * one production sends.
 */

/**
 * Zoom 12, comfortably above SPEC v1 §3.1's "≥ 10" rule — the M1 probe precedent, verbatim.
 *
 * The rule exists because the response depends on zoom: the SAME İzmir Gulf coordinate returned
 * `null` at zoom 6 and 24.65 °C at zoom 8, since a low-zoom pixel covers enough ground to land
 * on land. At zoom 12 a pixel is ~27 m at 40° N — finer than even the 500 m Marmara grid, so
 * the pixel is always inside the intended cell.
 */
export const CMEMS_ZOOM = 12;

export const CMEMS_TILE_MATRIX_SET = 'EPSG:3857';

/** The three CMEMS-served instant fields (wind is ECMWF-only — CMEMS carries none). */
export type CmemsLayerField = 'seaSurfaceTemperature' | 'waveHeight' | 'waveDirection';

/** Provider variable id per field — the third segment of the WMTS `layer=` parameter. */
export const CMEMS_VARIABLE_IDS: Readonly<Record<CmemsLayerField, string>> = {
  seaSurfaceTemperature: 'thetao',
  waveHeight: 'VHM0',
  waveDirection: 'VMDR',
};

/**
 * The raw unit string each variable MUST declare, and the canonical unit it normalises to
 * (SPEC-ADDENDUM §7.4: `degrees_C → celsius`, `degree → degree_true`; both measured verbatim).
 *
 * EXACT match, deliberately: a unit drift (`degC`, `K`, `°`) is contract drift and must surface
 * as `schema_error`, never as a silently mis-labelled number — a unit error is more insidious
 * than a value error because the number still looks plausible.
 */
export const CMEMS_UNIT_NORMALISATION: Readonly<
  Record<CmemsLayerField, { readonly raw: string; readonly canonical: MarineUnit }>
> = {
  seaSurfaceTemperature: { raw: 'degrees_C', canonical: MarineUnit.Celsius },
  waveHeight: { raw: 'm', canonical: MarineUnit.Meter },
  waveDirection: { raw: 'degree', canonical: MarineUnit.DegreeTrue },
};

/**
 * The wide-physics plausibility windows (plan §5.7, risk R2 class).
 *
 * The zod schema checks the TYPE; this checks that the number could describe a Turkish sea at
 * all. A breach maps to `schema_error` (alarm-level log): publishing `unavailable` is always
 * better than publishing a wrong number on a page that teaches geography. The windows are
 * deliberately WIDE — they exist to catch a unit mix-up (Kelvin reads ~290, centimetre waves
 * read ~300) or a corrupted payload, never to editorialise a real extreme.
 */
export interface CmemsPlausibilityWindow {
  readonly min: number;
  readonly max: number;
  /** `[0, 360)`: 360 itself is the classic wrap bug, so direction excludes its upper bound. */
  readonly maxIsExclusive: boolean;
}

export const CMEMS_PLAUSIBILITY: Readonly<Record<CmemsLayerField, CmemsPlausibilityWindow>> = {
  /** °C. Sea water below −5 or above 45 is not a Turkish sea state; it is a broken payload. */
  seaSurfaceTemperature: { min: -5, max: 45, maxIsExclusive: false },
  /** m. 0..30 — the tallest reliably measured ocean wave classes sit far below 30 m. */
  waveHeight: { min: 0, max: 30, maxIsExclusive: false },
  /** Degrees true. */
  waveDirection: { min: 0, max: 360, maxIsExclusive: true },
};

/** `true` when the value sits inside the window (bounds per {@link CmemsPlausibilityWindow}). */
export function isPlausibleCmemsValue(field: CmemsLayerField, value: number): boolean {
  const window = CMEMS_PLAUSIBILITY[field];
  if (!Number.isFinite(value)) return false;
  if (value < window.min) return false;
  return window.maxIsExclusive ? value < window.max : value <= window.max;
}
