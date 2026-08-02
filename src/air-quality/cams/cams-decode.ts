import {
  AirQualityPollutant,
  AirQualityStatus,
  ALL_AIR_QUALITY_POLLUTANTS,
} from '../air-quality.types';
import {
  analyseAxis,
  distanceKm,
  distanceThresholdKm,
  mapCoordinateToIndex,
  type AxisAnalysis,
} from './cams-grid';
import { CAMS_CANONICAL_UNIT, camsVariableFor } from './cams-variables';
import { extractSingleZipEntry } from './cams-zip';
import { CamsContractError } from './cams.errors';
import { NC_FLOAT, parseNetcdf3, type Netcdf3File } from './netcdf3';

/**
 * The single wrapper around the whole decode path: ZIP → NetCDF3 → variable mapping → unit
 * check → `_FillValue` null-classification → run-day cross-validation → per-province
 * extraction with both grid guards.
 *
 * Runs IN-PROCESS (approved plan D2): the decoder is pure TS, its worst failure is a
 * catchable JS exception, and every failure class is raised as a typed
 * {@link CamsContractError} from inside this wrapper — A2's ingest maps that to its
 * `schema_error` outcome. `CAMS_DECODER_VERSION` goes into the probe artifact today and the
 * run record in A2, so a silent decoder change is visible in the evidence trail (the
 * yeni-M3 §9.1 pattern, deliberately the same).
 */

/**
 * Versioned decoder identity (plan §5.7). Bump on ANY behavioural change to this path.
 * `@2`: refuses non-NC_FLOAT / CF-packed data variables, binds the FORECAST product word,
 * null-classifies implausibly large values, throws on an all-points-outside domain, and ties
 * coordinate variables to their own dimension.
 * `@3`: extends the type/packing pin to the `time` axis and binds its VALUES to the measured
 * hour ladder (0, 1, 2, …), refuses zero requested points, adds the nothing-usable OUTCOME
 * guard (an all-fill file throws instead of returning quiet `not_supported` rows), and flags
 * wrapper-origin errors as `unexpected`. The committed probe artifact honestly records `@1` —
 * the run that produced it predates these guards.
 * `@4` (A2a, plan §10-D7): the product word the `time:long_name` must carry is a CALLER
 * PARAMETER ({@link CamsDecodeOptions.expectedProduct}) instead of the hardcoded `FORECAST`,
 * because A2 requests TWO products a day (forecast D + analysis D−1) and `@3` refused the
 * analysis file outright. The default stays `'FORECAST'`, so every `@3` caller keeps `@3`
 * behaviour. The inflate ceiling also became caller-supplied (plan §10-D2) so the runtime's
 * single source of truth is `AIR_QUALITY_RUN_MAX_BYTES`, not a module constant.
 */
export const CAMS_DECODER_VERSION = 'netcdf3-ts@4';

/** The two products this leg requests. It is the word `time:long_name` must carry. */
export type CamsProduct = 'FORECAST' | 'ANALYSIS';

/**
 * Upper plausibility bound for a raw concentration, µg/m³. Far above any physically observed
 * value (extreme dust events reach the low thousands; the top EAQI boundary is 1250) and far
 * below the NetCDF DEFAULT float fill (9.96921×10³⁶), which a provider bug could leak into a
 * file whose declared `_FillValue` is −999 — without this bound such a value would publish as
 * EAQI band 6. Symmetric to the negative-value rule: implausible → null, never a fabricated
 * number.
 */
export const CAMS_MAX_PLAUSIBLE_CONCENTRATION_UG_M3 = 100_000;

/** Dimension names as the provider writes them (measured). */
const DIMENSION_LONGITUDE = 'longitude';
const DIMENSION_LATITUDE = 'latitude';
const DIMENSION_LEVEL = 'level';
const DIMENSION_TIME = 'time';

export interface CamsPoint {
  plateCode: string;
  latitude: number;
  longitude: number;
}

export interface CamsProvinceSeries {
  plateCode: string;
  requestedLatitude: number;
  requestedLongitude: number;
  /** Grid-cell centre actually read; null when the point is outside the domain. */
  gridLatitude: number | null;
  gridLongitude: number | null;
  distanceKm: number | null;
  thresholdKm: number | null;
  outsideDomain: boolean;
  /** Per pollutant: `ok` or the structural `not_supported` (SPEC §7.4). */
  support: Record<AirQualityPollutant, AirQualityStatus.Ok | AirQualityStatus.NotSupported>;
  /** Step-aligned raw concentrations; `null` per missing step. Length = timeHours.length. */
  series: Record<AirQualityPollutant, (number | null)[]>;
}

export interface CamsAxisSummary {
  first: number;
  last: number;
  step: number;
  length: number;
}

export interface CamsDecodedFile {
  entryName: string;
  /** ZIP method (0 STORED / 8 DEFLATE) + inner magic — the two-layer format evidence. */
  zipMethod: number;
  innerFormat: 'netcdf3-classic';
  /** Hour offsets from the run base (measured: plain hour counters, NOT CF time). */
  timeHours: number[];
  longitudeAxis: CamsAxisSummary;
  latitudeAxis: CamsAxisSummary;
  /** Per decoded pollutant, verbatim from the file. */
  fileVariableNames: Partial<Record<AirQualityPollutant, string>>;
  units: Partial<Record<AirQualityPollutant, string>>;
  fillValues: Partial<Record<AirQualityPollutant, number>>;
  provinces: CamsProvinceSeries[];
  decoderVersion: string;
}

export interface CamsDecodeOptions {
  /**
   * The run day WE requested, `YYYYMMDD`. The file's `time:long_name` free text must contain
   * it — the cheap "wrong day's file" guard (SPEC §11.3): `validAtUtc` is derived from OUR
   * request, never parsed out of provider free text; the free text only cross-validates.
   */
  expectedRunDate: string;
  points: readonly CamsPoint[];
  /** Which pollutants the file MUST carry. Defaults to all five (the production shape). */
  pollutants?: readonly AirQualityPollutant[];
  /**
   * Which PRODUCT this file must be, cross-validated against `time:long_name` (plan §10-D7).
   *
   * Defaults to `'FORECAST'` so every pre-`@4` caller is unchanged. The ingest passes the
   * requesting JOB's own kind — never a constant — so a forecast archive answered for an
   * analysis request (or the reverse) is refused instead of published under the wrong label.
   * That refusal is the machine half of the A-7 honesty rule; the storage half is the two
   * products living in SEPARATE columns.
   */
  expectedProduct?: CamsProduct;
  /**
   * Ceiling on a DEFLATE entry's inflated size, forwarded to the ZIP reader (plan §10-D2).
   *
   * Optional so the hand-run probe and the unit fixtures keep the module default; the runtime
   * ingest passes `AIR_QUALITY_RUN_MAX_BYTES` explicitly, which makes env the single source of
   * truth for the heap ceiling instead of a constant that would drift beside it.
   */
  maxInflatedBytes?: number;
}

/**
 * Decode one downloaded `netcdf_zip` archive, fail-closed on every contract deviation.
 *
 * The catch-all below is the plan §5.2-D2 wrapper: every anticipated deviation already throws
 * a typed {@link CamsContractError} at its own guard, and anything UNANTICIPATED (a DataView
 * range error, a detached buffer, a bug of ours) is converted here so the caller — A2's
 * `schema_error` mapping — sees exactly one failure type from this path.
 */
export function decodeCamsFile(archive: Uint8Array, options: CamsDecodeOptions): CamsDecodedFile {
  try {
    return decodeCamsFileInner(archive, options);
  } catch (error: unknown) {
    if (error instanceof CamsContractError) throw error;
    throw new CamsContractError(
      `unexpected decoder failure (${error instanceof Error ? error.name : typeof error}) — ` +
        'not a recognised contract deviation; treat as schema_error.',
      { cause: error, unexpected: true },
    );
  }
}

function decodeCamsFileInner(archive: Uint8Array, options: CamsDecodeOptions): CamsDecodedFile {
  if (!/^\d{8}$/.test(options.expectedRunDate)) {
    throw new CamsContractError(
      `expectedRunDate must be YYYYMMDD, got "${options.expectedRunDate}".`,
    );
  }
  const pollutants = options.pollutants ?? ALL_AIR_QUALITY_POLLUTANTS;
  if (pollutants.length === 0) {
    throw new CamsContractError('decode was asked for zero pollutants.');
  }
  // Zero points is a refusal, not an empty success: no A1 caller has a legitimate empty set
  // (the probe always passes all 81), and an accidental empty array upstream would otherwise
  // decode a whole file into a quiet zero-row "success" — the unnamed silent-success lane.
  if (options.points.length === 0) {
    throw new CamsContractError('decode was asked for zero points.');
  }
  const seenPlateCodes = new Set<string>();
  for (const point of options.points) {
    if (seenPlateCodes.has(point.plateCode)) {
      throw new CamsContractError(
        `duplicate plateCode "${point.plateCode}" in the requested points — the per-province ` +
          'series map would silently collapse them.',
      );
    }
    seenPlateCodes.add(point.plateCode);
  }

  const entry = extractSingleZipEntry(
    archive,
    options.maxInflatedBytes === undefined ? {} : { maxInflatedBytes: options.maxInflatedBytes },
  );
  const file = parseNetcdf3(entry.bytes);

  // ── axes + guards ─────────────────────────────────────────────────────────
  // A coordinate variable must be declared on ITS OWN dimension: an axis declared on another
  // dimension would still read cleanly but misalign every index against the data grid.
  assertCoordinateVariable(file, DIMENSION_LONGITUDE);
  assertCoordinateVariable(file, DIMENSION_LATITUDE);
  const longitudeValues = file.readFixedNumeric(DIMENSION_LONGITUDE);
  const latitudeValues = file.readFixedNumeric(DIMENSION_LATITUDE);
  const longitudeAnalysis = analyseAxis(longitudeValues, DIMENSION_LONGITUDE);
  const latitudeAnalysis = analyseAxis(latitudeValues, DIMENSION_LATITUDE);

  // ── level must be a single surface level ──────────────────────────────────
  const levelDimension = file.dimensions.find((dimension) => dimension.name === DIMENSION_LEVEL);
  if (levelDimension === undefined || levelDimension.length !== 1) {
    throw new CamsContractError(
      `expected a single "${DIMENSION_LEVEL}" (surface) level, found ` +
        `${String(levelDimension?.length ?? 0)}.`,
    );
  }

  // ── per-pollutant contract checks ─────────────────────────────────────────
  const fileVariableNames: Partial<Record<AirQualityPollutant, string>> = {};
  const units: Partial<Record<AirQualityPollutant, string>> = {};
  const fillValues: Partial<Record<AirQualityPollutant, number>> = {};

  for (const pollutant of pollutants) {
    const mapping = camsVariableFor(pollutant);
    if (!file.hasVariable(mapping.fileVariableName)) {
      throw new CamsContractError(
        `expected file variable "${mapping.fileVariableName}" (pollutant "${pollutant}") is ` +
          'missing — a silently absent pollutant is banned; the mapping table or the provider ' +
          'changed.',
      );
    }
    assertVariableShape(file, mapping.fileVariableName);

    // The element type is PINNED (measured: NC_FLOAT) and CF packing attributes are REFUSED:
    // a packed NC_SHORT variable passes every other guard and decodes to plausible numbers
    // that are all off by 1/scale_factor — Copernicus's normal encoding for other datasets,
    // so this is a live provider-change lane, not a hypothetical.
    const variable = file.variable(mapping.fileVariableName);
    if (variable.ncType !== NC_FLOAT) {
      throw new CamsContractError(
        `"${mapping.fileVariableName}" is nc_type ${String(variable.ncType)}, not the measured ` +
          'NC_FLOAT — a re-typed/packed variable decodes to plausible but wrong numbers; refusing.',
      );
    }
    for (const packingAttribute of ['scale_factor', 'add_offset'] as const) {
      if (file.attribute(mapping.fileVariableName, packingAttribute) !== undefined) {
        throw new CamsContractError(
          `"${mapping.fileVariableName}" carries CF packing attribute "${packingAttribute}" — ` +
            'raw values would be off by the packing transform; refusing an encoding we did not pin.',
        );
      }
    }

    const unitAttribute = file.attribute(mapping.fileVariableName, 'units');
    if (unitAttribute === undefined || typeof unitAttribute.value !== 'string') {
      throw new CamsContractError(`"${mapping.fileVariableName}" carries no units attribute.`);
    }
    // Code-point exact: U+00B5 µ, never the Greek U+03BC lookalike (SPEC §5.4/§8.3).
    if (unitAttribute.value !== CAMS_CANONICAL_UNIT) {
      throw new CamsContractError(
        `"${mapping.fileVariableName}" unit "${unitAttribute.value}" is not the canonical ` +
          `"${CAMS_CANONICAL_UNIT}" (code-point comparison) — refusing a unit we did not pin.`,
      );
    }
    units[pollutant] = unitAttribute.value;

    // `_FillValue` is READ FROM THE FILE, never assumed; its absence is a schema error
    // (SPEC §7.4 — the −999-as-concentration class is this leg's #1 silent failure).
    const fillAttribute = file.attribute(mapping.fileVariableName, '_FillValue');
    if (
      fillAttribute === undefined ||
      typeof fillAttribute.value === 'string' ||
      fillAttribute.value.length !== 1 ||
      fillAttribute.value[0] === undefined
    ) {
      throw new CamsContractError(
        `"${mapping.fileVariableName}" has no scalar _FillValue attribute — cannot ` +
          'null-classify; refusing to treat every value as valid.',
      );
    }
    fillValues[pollutant] = fillAttribute.value[0];
    fileVariableNames[pollutant] = mapping.fileVariableName;
  }

  // ── time: hour offsets + the run-day cross-check ──────────────────────────
  // Deliberately AFTER the per-pollutant pins: a re-typed data variable changes the classic
  // record stride, which skews every time-record read — reading time first would surface that
  // corruption as a confusing hour-ladder refusal instead of naming the root cause (the
  // re-typed variable). Both orders fail closed; this order diagnoses.
  const timeHours = readTimeHours(
    file,
    options.expectedRunDate,
    options.expectedProduct ?? 'FORECAST',
  );

  // ── map every point, then extract ─────────────────────────────────────────
  const mappings = options.points.map((point) => {
    const lonMapping = mapCoordinateToIndex(
      longitudeValues,
      longitudeAnalysis,
      point.longitude,
      DIMENSION_LONGITUDE,
    );
    const latMapping = mapCoordinateToIndex(
      latitudeValues,
      latitudeAnalysis,
      point.latitude,
      DIMENSION_LATITUDE,
    );
    if (lonMapping.kind === 'outside_domain' || latMapping.kind === 'outside_domain') {
      return { point, outside: true as const };
    }
    const cellDistanceKm = distanceKm(
      point.latitude,
      point.longitude,
      latMapping.snapped,
      lonMapping.snapped,
    );
    const thresholdKm = distanceThresholdKm(
      point.latitude,
      latitudeAnalysis.step,
      longitudeAnalysis.step,
    );
    if (cellDistanceKm > thresholdKm) {
      // Not a skip, not a null: past the threshold the mapping itself is broken (SPEC §7.3).
      throw new CamsContractError(
        `point ${point.plateCode}: nearest cell is ${cellDistanceKm.toFixed(3)} km away ` +
          `(threshold ${thresholdKm.toFixed(3)} km) — the grid arithmetic is wrong; failing loudly.`,
      );
    }
    return {
      point,
      outside: false as const,
      latIndex: latMapping.index,
      lonIndex: lonMapping.index,
      gridLatitude: latMapping.snapped,
      gridLongitude: lonMapping.snapped,
      distanceKm: cellDistanceKm,
      thresholdKm,
    };
  });

  // Domain-coverage guard IN THE DECODE PATH, not only in the hand-run probe: one edge point
  // outside the domain is the structural `not_supported` class (SPEC §7.4), but EVERY point
  // outside means this is the wrong file/area (wrong `area` sent, packed axes, a lon-convention
  // change) — returning 81 quiet `not_supported` rows would be the #65 lesson inverted.
  // This is the sharper PRE-diagnosis (it can name the axis bounds); the BINDING net is the
  // nothing-usable OUTCOME guard below, which subsumes this class. Both are deliberately
  // relative to THIS call's point set, whatever its size: a caller that gets zero usable rows
  // out of a decode must hear about it loudly, never receive a quiet all-`not_supported`
  // envelope (`points` is guaranteed non-empty by the zero-points refusal above).
  if (mappings.every((mapping) => mapping.outside)) {
    throw new CamsContractError(
      `EVERY requested point (${String(mappings.length)}) is outside the file domain ` +
        `(lon ${String(longitudeAnalysis.first)}…${String(longitudeAnalysis.last)}, ` +
        `lat ${String(latitudeAnalysis.first)}…${String(latitudeAnalysis.last)}) — wrong ` +
        'file/area, not a data gap; failing loudly.',
    );
  }

  const longitudeCount = longitudeAnalysis.length;
  const series = new Map<string, Record<AirQualityPollutant, (number | null)[]>>();
  for (const mapping of mappings) {
    const empty = {} as Record<AirQualityPollutant, (number | null)[]>;
    for (const pollutant of pollutants) {
      empty[pollutant] = new Array<number | null>(timeHours.length).fill(null);
    }
    series.set(mapping.point.plateCode, empty);
  }

  // One pollutant × one time step in memory at a time (measured: 15.3 ms for the full
  // production extraction) — record-major to read each slab exactly once.
  for (const pollutant of pollutants) {
    const variableName = camsVariableFor(pollutant).fileVariableName;
    const fillValue = fillValues[pollutant];
    if (fillValue === undefined) {
      throw new CamsContractError(`internal: no _FillValue recorded for "${pollutant}".`);
    }
    for (let record = 0; record < timeHours.length; record += 1) {
      const slab = file.readRecordBlock(variableName, record);
      for (const mapping of mappings) {
        if (mapping.outside) continue;
        // Within-record shape is (level=1, latitude, longitude), row-major.
        const flatOffset = mapping.latIndex * longitudeCount + mapping.lonIndex;
        const raw = slab[flatOffset];
        if (raw === undefined) {
          throw new CamsContractError(
            `flat offset ${String(flatOffset)} outside the "${variableName}" slab.`,
          );
        }
        const provinceSeries = series.get(mapping.point.plateCode);
        if (provinceSeries === undefined) continue; // unreachable — map filled above
        // Null classification (SPEC §7.4, binding): == _FillValue → null; negative → null
        // (second line of defence — a negative concentration is physically impossible);
        // implausibly LARGE → null (third line — a leaked NetCDF default fill of ~9.97e36
        // would otherwise publish as EAQI band 6). `Number.isNaN` alone is NEVER sufficient:
        // the provider marks missing with −999.0.
        provinceSeries[pollutant][record] =
          raw === fillValue ||
          raw < 0 ||
          raw > CAMS_MAX_PLAUSIBLE_CONCENTRATION_UG_M3 ||
          Number.isNaN(raw)
            ? null
            : raw;
      }
    }
  }

  const provinces: CamsProvinceSeries[] = mappings.map((mapping) => {
    const provinceSeries = series.get(mapping.point.plateCode);
    if (provinceSeries === undefined) {
      throw new CamsContractError(`internal: no series for ${mapping.point.plateCode}.`);
    }
    const support = {} as Record<
      AirQualityPollutant,
      AirQualityStatus.Ok | AirQualityStatus.NotSupported
    >;
    for (const pollutant of pollutants) {
      const values = provinceSeries[pollutant];
      // SPEC §7.4: outside the domain, or EVERY step missing → structural not_supported;
      // SOME steps missing → per-step nulls under `ok`.
      support[pollutant] =
        mapping.outside || values.every((value) => value === null)
          ? AirQualityStatus.NotSupported
          : AirQualityStatus.Ok;
    }
    return {
      plateCode: mapping.point.plateCode,
      requestedLatitude: mapping.point.latitude,
      requestedLongitude: mapping.point.longitude,
      gridLatitude: mapping.outside ? null : mapping.gridLatitude,
      gridLongitude: mapping.outside ? null : mapping.gridLongitude,
      distanceKm: mapping.outside ? null : mapping.distanceKm,
      thresholdKm: mapping.outside ? null : mapping.thresholdKm,
      outsideDomain: mapping.outside,
      support,
      series: provinceSeries,
    };
  });

  // The OUTCOME guard (review #77 R2): after every mechanism-level check passed, ask the only
  // question that matters — did anything USABLE come out of this file? An all-fill file (or any
  // future lane nobody has named yet) passes every structural pin and would otherwise return
  // 81×5 quiet `not_supported` rows: a widget that silently goes dark instead of a pipeline
  // that stops. Partial outcomes (some provinces/pollutants usable) return normally — SPEC
  // §7.4's per-pollutant `not_supported` and per-step nulls are only legitimate while at least
  // one series carries data.
  const anyUsable = provinces.some((province) =>
    Object.values(province.support).some((status) => status === AirQualityStatus.Ok),
  );
  if (!anyUsable) {
    throw new CamsContractError(
      `nothing usable came out of this file: all ${String(provinces.length)} province × ` +
        `${String(pollutants.length)} pollutant series are outside the domain or entirely ` +
        'missing — an all-fill or wrong-area file, not a data gap; failing loudly.',
    );
  }

  return {
    entryName: entry.name,
    zipMethod: entry.method,
    innerFormat: 'netcdf3-classic',
    timeHours,
    longitudeAxis: summarise(longitudeAnalysis),
    latitudeAxis: summarise(latitudeAnalysis),
    fileVariableNames,
    units,
    fillValues,
    provinces,
    decoderVersion: CAMS_DECODER_VERSION,
  };
}

function summarise(analysis: AxisAnalysis): CamsAxisSummary {
  return {
    first: analysis.first,
    last: analysis.last,
    step: analysis.step,
    length: analysis.length,
  };
}

/** A coordinate variable must be 1-D on exactly its namesake dimension. */
function assertCoordinateVariable(file: Netcdf3File, dimensionName: string): void {
  const variable = file.variable(dimensionName);
  const names = variable.dimensionIds.map((id) => file.dimensions[id]?.name ?? '?');
  if (names.length !== 1 || names[0] !== dimensionName) {
    throw new CamsContractError(
      `coordinate variable "${dimensionName}" is declared on (${names.join(', ')}) instead of ` +
        'its own dimension — its values would not align with the data grid.',
    );
  }
}

/** The data variables must be exactly (time, level, latitude, longitude), by NAME. */
function assertVariableShape(file: Netcdf3File, variableName: string): void {
  const variable = file.variable(variableName);
  const dimensionNames = variable.dimensionIds.map((id) => file.dimensions[id]?.name ?? '?');
  const expected = [DIMENSION_TIME, DIMENSION_LEVEL, DIMENSION_LATITUDE, DIMENSION_LONGITUDE];
  if (
    dimensionNames.length !== expected.length ||
    dimensionNames.some((name, index) => name !== expected[index])
  ) {
    throw new CamsContractError(
      `"${variableName}" has shape (${dimensionNames.join(', ')}), expected ` +
        `(${expected.join(', ')}).`,
    );
  }
}

/**
 * Read the hour offsets and cross-validate the run day.
 *
 * The provider's `time` is NOT CF-standard: plain hour counters with `units = "hours"` and
 * the reference instant only in free text (`long_name = "FORECAST time from 20260731"`). The
 * global attribute KEY changes with the request type (`FORECAST`/`ANALYSIS`), so the check
 * reads `time:long_name` and searches for SUBSTRINGS — never full equality, never parsing a
 * timestamp out of prose. TWO substrings are bound: the `YYYYMMDD` run day AND the product
 * word the CALLER asked for.
 *
 * `@4` (plan §10-D7) turned that product word into a parameter. `@3` hardcoded `FORECAST`
 * because Faz-1 requested only forecasts; A2 requests both products, and the honesty rule is
 * unchanged — it is now enforced in BOTH directions: an analysis file may not be published as
 * forecast steps, and a forecast file may not be published as the analysis (past) half of the
 * series. The caller passes the requesting job's own kind, never a constant.
 */
function readTimeHours(
  file: Netcdf3File,
  expectedRunDate: string,
  expectedProduct: CamsProduct,
): number[] {
  const timeVariable = file.variable(DIMENSION_TIME);
  // The same element-type + CF-packing pin the data variables carry (review #77 R2-SFH-I1):
  // `time` was the ONE axis exempt from every check, and a packed NC_SHORT time would ×-skew
  // every validAtUtc while the step COUNT still looked right. Measured: NC_FLOAT, unpacked
  // (golden fixture + probe overlay).
  if (timeVariable.ncType !== NC_FLOAT) {
    throw new CamsContractError(
      `"${DIMENSION_TIME}" is nc_type ${String(timeVariable.ncType)}, not the measured ` +
        'NC_FLOAT — a re-typed/packed time axis shifts every validAtUtc; refusing.',
    );
  }
  for (const packingAttribute of ['scale_factor', 'add_offset'] as const) {
    if (file.attribute(DIMENSION_TIME, packingAttribute) !== undefined) {
      throw new CamsContractError(
        `"${DIMENSION_TIME}" carries CF packing attribute "${packingAttribute}" — raw hour ` +
          'offsets would be off by the packing transform; refusing an encoding we did not pin.',
      );
    }
  }
  const unitsAttribute = file.attribute(DIMENSION_TIME, 'units');
  if (
    unitsAttribute === undefined ||
    typeof unitsAttribute.value !== 'string' ||
    unitsAttribute.value !== 'hours'
  ) {
    throw new CamsContractError(
      `time units "${String(unitsAttribute?.value ?? '(absent)')}" — expected the measured ` +
        'plain "hours"; a CF-style epoch here would silently shift every validAtUtc.',
    );
  }
  const longName = file.attribute(DIMENSION_TIME, 'long_name');
  if (longName === undefined || typeof longName.value !== 'string') {
    throw new CamsContractError('time has no long_name — cannot cross-validate the run day.');
  }
  if (!longName.value.includes(expectedRunDate)) {
    throw new CamsContractError(
      `WRONG DAY'S FILE: time long_name "${longName.value}" does not contain the requested ` +
        `run day ${expectedRunDate}.`,
    );
  }
  // Case-insensitive on purpose: the binding is PRODUCT IDENTITY, not prose casing — a benign
  // casing drift ("Forecast …") must not raise a misleading WRONG PRODUCT TYPE alarm, while the
  // other product stays refused in any casing.
  if (!longName.value.toUpperCase().includes(expectedProduct)) {
    throw new CamsContractError(
      `WRONG PRODUCT TYPE: time long_name "${longName.value}" does not contain ` +
        `"${expectedProduct}" — the two CAMS products are stored and published separately, and ` +
        "one must never be served under the other's label.",
    );
  }
  if (!timeVariable.isRecord) {
    throw new CamsContractError('"time" is not the record dimension — unexpected file layout.');
  }
  const hours: number[] = [];
  for (let record = 0; record < file.recordCount; record += 1) {
    const block = file.readRecordBlock(DIMENSION_TIME, record);
    const value = block[0];
    if (block.length !== 1 || value === undefined) {
      throw new CamsContractError(`time record ${String(record)} is not a single value.`);
    }
    hours.push(value);
  }
  // Bind the published VALUES, not only the count (review #77 R2-SFH-I1): the probe overlay
  // pins the production time axis to exactly 0…96 — integral, ascending, step +1, starting at
  // 0 — and every request WE build asks for a 0-based contiguous hour ladder. So the values
  // must equal their own indices (float32 holds these small integers exactly); anything else
  // means every derived validAtUtc would be silently wrong. If a future phase ever requests a
  // non-0-based ladder, this pin is revisited EXPLICITLY, never loosened in passing.
  hours.forEach((hour, index) => {
    if (hour !== index) {
      throw new CamsContractError(
        `time value ${String(hour)} at record ${String(index)} breaks the measured hour ` +
          'ladder (0, 1, 2, …) — validAtUtc derivation would be wrong for every step; refusing.',
      );
    }
  });
  return hours;
}
