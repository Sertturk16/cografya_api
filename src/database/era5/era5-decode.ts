import { analyseEra5Axis, type Era5AxisAnalysis } from './era5-grid';
import { ERA5_VARIABLES, type Era5VariableMapping } from './era5-request';
import { Era5ContractError } from './era5.errors';
import { Era5Hdf5File, type Era5FileReader } from './hdf5/jsfive.adapter';

/**
 * The FILE CONTRACT: every structural claim we make about a CDS ERA5-Land NetCDF4 response is
 * checked here, once, before a single number reaches a province (SPEC §5.2, probe M5/M6/M8).
 *
 * Nothing in this file is assumed from CAMS. Three of the ten transferred expectations were
 * measured WRONG on this product (`netcdf_zip` does not exist, longitude is −180…180 and
 * grid-point registered, `_FillValue` is NaN and not −999), so every one of the following is
 * VERIFIED against the bytes rather than trusted:
 *
 * | claim | measured | on deviation |
 * |---|---|---|
 * | variable names | `t2m`, `tp` | `schema_error` (no substitution) |
 * | dimension ORDER | `(valid_time, latitude, longitude)` | `schema_error` |
 * | latitude axis | 42.5 → 35.5, step −0.1, n=71 | axis guard |
 * | longitude axis | 25.5 → 45.0, step +0.1, n=196 | axis guard |
 * | `_FillValue` | float **NaN** | `schema_error` if it becomes a numeric sentinel |
 * | packing | `scale_factor`/`add_offset` **absent** | `schema_error` if either appears |
 * | `GRIB_missingValue` | attribute present, **0 samples in data** | `schema_error` if seen |
 * | `expver` | string variable, 360/360 `"0001"` | `schema_error` |
 * | `valid_time` | int64 epoch seconds, CF, n=360, sorted | `schema_error` |
 *
 * ## Why the dimension ORDER can be pinned by shape alone
 * The three dimension sizes (360, 71, 196) are PAIRWISE DISTINCT, so a shape triple matching
 * `[months, lat, lon]` has exactly one valid reading. That argument is load-bearing, so it is
 * itself asserted: if the three sizes ever coincide, the check silently stops discriminating and
 * we refuse to proceed instead of pretending it still holds.
 */

export interface Era5Month {
  /** Calendar year, e.g. 1991. */
  year: number;
  /** 1-based calendar month. */
  month: number;
  /** The raw `valid_time` value, kept verbatim for the manifest. */
  epochSeconds: number;
}

export interface Era5VariableData {
  mapping: Era5VariableMapping;
  /** Flat, C-ordered `[time][lat][lon]`. NaN means "masked", which is real information here. */
  values: Float64Array;
  /** The file's own `units` attribute — recorded because it is MISLEADING for `tp` (see below). */
  unitsAttribute: string | null;
}

export interface Era5AxisSummary {
  first: number;
  last: number;
  step: number;
  length: number;
}

export interface Era5DecodedFile {
  latitudeAxis: readonly number[];
  longitudeAxis: readonly number[];
  latitudeAnalysis: Era5AxisAnalysis;
  longitudeAnalysis: Era5AxisAnalysis;
  latitudeSummary: Era5AxisSummary;
  longitudeSummary: Era5AxisSummary;
  months: readonly Era5Month[];
  variables: readonly Era5VariableData[];
  /** All 360 `expver` values — asserted to be `"0001"` throughout. */
  expverValues: readonly string[];
  /** Global attributes we record as provenance (`history`, `Conventions`, `institution`, …). */
  globalAttributeSummary: Readonly<Record<string, string>>;
  /** How many of the grid's cells are masked in the FIRST time step (mask-invariance base). */
  maskedCellCount: number;
  totalCellCount: number;
}

/** `valid_time` must be CF epoch seconds — the free-text date trap CAMS had does not exist here. */
const EXPECTED_TIME_UNITS = 'seconds since 1970-01-01';
const EXPECTED_EXPVER = '0001';

export interface Era5DecodeOptions {
  /** Which variables the caller expects. Defaults to the full core pair. */
  variables?: readonly Era5VariableMapping[];
  /** Expected month count (360 for production, 1 for the mini fixture); `null` = derive. */
  expectedMonthCount?: number | null;
  /** Injected for tests only — see {@link Era5FileReader}. Production always uses jsfive. */
  openImpl?: (bytes: Uint8Array, filename: string) => Era5FileReader;
}

export function decodeEra5File(
  bytes: Uint8Array,
  filename: string,
  options: Era5DecodeOptions = {},
): Era5DecodedFile {
  const variables = options.variables ?? ERA5_VARIABLES;
  const file: Era5FileReader =
    options.openImpl === undefined
      ? Era5Hdf5File.open(bytes, filename)
      : options.openImpl(bytes, filename);

  // ── axes ────────────────────────────────────────────────────────────────────
  const latitudeDataset = file.dataset('latitude');
  const longitudeDataset = file.dataset('longitude');
  const timeDataset = file.dataset('valid_time');
  const latitudeLength = onlyDimension(latitudeDataset.shape, 'latitude');
  const longitudeLength = onlyDimension(longitudeDataset.shape, 'longitude');
  const monthCount = onlyDimension(timeDataset.shape, 'valid_time');

  if (options.expectedMonthCount != null && monthCount !== options.expectedMonthCount) {
    throw new Era5ContractError(
      `valid_time has ${String(monthCount)} entries, expected ${String(options.expectedMonthCount)}.`,
    );
  }

  const latitudeAxis = Array.from(file.readNumericDataset('latitude', latitudeLength));
  const longitudeAxis = Array.from(file.readNumericDataset('longitude', longitudeLength));
  const latitudeAnalysis = analyseEra5Axis(latitudeAxis, 'latitude');
  const longitudeAnalysis = analyseEra5Axis(longitudeAxis, 'longitude');

  // ── valid_time: CF units, epoch seconds, sorted, month-aligned ──────────────
  const timeUnits = readStringAttribute(timeDataset.attributes.units);
  if (timeUnits === null || !timeUnits.startsWith(EXPECTED_TIME_UNITS)) {
    throw new Era5ContractError(
      `valid_time:units is ${JSON.stringify(timeUnits)}, expected it to start with ` +
        `"${EXPECTED_TIME_UNITS}". A different epoch would shift every month silently.`,
    );
  }
  const rawTimes = file.readNumericDataset('valid_time', monthCount);
  const months = rawTimes.length === 0 ? [] : buildMonths(rawTimes);

  // ── expver: a string VARIABLE, not an extra dimension (measured M8) ─────────
  const expverDataset = file.dataset('expver');
  const expverLength = onlyDimension(expverDataset.shape, 'expver');
  if (expverLength !== monthCount) {
    throw new Era5ContractError(
      `expver has ${String(expverLength)} entries but valid_time has ${String(monthCount)} — ` +
        'the product gained a dimension we do not model.',
    );
  }
  const expverValues = file.readStringDataset('expver', expverLength);
  const wrongExpver = expverValues.filter((value) => value !== EXPECTED_EXPVER);
  if (wrongExpver.length > 0) {
    throw new Era5ContractError(
      `${String(wrongExpver.length)}/${String(expverValues.length)} expver values are not ` +
        `"${EXPECTED_EXPVER}" (saw e.g. ${JSON.stringify(wrongExpver[0])}). ERA5T (0005) interim ` +
        'data is mixed in — refusing to publish a normal built from provisional months.',
    );
  }

  // ── the data variables ─────────────────────────────────────────────────────
  const expectedCellCount = monthCount * latitudeLength * longitudeLength;
  // The dimension-order argument (see the module docblock) only discriminates while the three
  // sizes differ. Assert the premise instead of relying on it.
  if (
    monthCount === latitudeLength ||
    monthCount === longitudeLength ||
    latitudeLength === longitudeLength
  ) {
    throw new Era5ContractError(
      `dimension sizes (${String(monthCount)}, ${String(latitudeLength)}, ` +
        `${String(longitudeLength)}) are no longer pairwise distinct, so a matching shape no ` +
        'longer pins the dimension ORDER. Refusing to guess which axis is which.',
    );
  }

  const decodedVariables: Era5VariableData[] = [];
  for (const mapping of variables) {
    const dataset = file.dataset(mapping.fileName);
    if (dataset.shape.length !== 3) {
      throw new Era5ContractError(
        `variable "${mapping.fileName}" has ${String(dataset.shape.length)} dimensions, expected 3 ` +
          '(valid_time, latitude, longitude).',
      );
    }
    if (
      dataset.shape[0] !== monthCount ||
      dataset.shape[1] !== latitudeLength ||
      dataset.shape[2] !== longitudeLength
    ) {
      throw new Era5ContractError(
        `variable "${mapping.fileName}" has shape [${dataset.shape.join(', ')}], expected ` +
          `[${String(monthCount)}, ${String(latitudeLength)}, ${String(longitudeLength)}] — the ` +
          'DIMENSION ORDER changed; every value would come from the wrong place.',
      );
    }

    // Packing must be ABSENT. It is today (measured), and the danger is the future: a product
    // that starts returning packed int16 would decode as garbage-but-plausible if we read raw.
    for (const forbidden of ['scale_factor', 'add_offset']) {
      if (forbidden in dataset.attributes) {
        throw new Era5ContractError(
          `variable "${mapping.fileName}" now carries a "${forbidden}" attribute. The measured ` +
            'product is UNPACKED; reading raw values from a packed file would be silently wrong.',
        );
      }
    }

    // `_FillValue` must be NaN, so missing-ness is tested with `Number.isNaN` and NOT with a
    // sentinel comparison. If it turns into a number (CAMS's −999), that comparison would be
    // missing everywhere and −999 would be published as a temperature.
    const fillValue = readNumericAttribute(dataset.attributes._FillValue);
    if (fillValue !== null && !Number.isNaN(fillValue)) {
      throw new Era5ContractError(
        `variable "${mapping.fileName}" has _FillValue = ${String(fillValue)}, expected NaN. A ` +
          'numeric sentinel must not be read as data (SPEC §5.2).',
      );
    }

    const values = file.readNumericDataset(mapping.fileName, expectedCellCount);

    // `GRIB_missingValue` (3.4028e38) is declared as an attribute but never occurs in the data
    // (0 samples measured). If it ever does, it is a sentinel masquerading as a reading.
    const gribMissing = readNumericAttribute(dataset.attributes.GRIB_missingValue);
    if (gribMissing !== null && Number.isFinite(gribMissing)) {
      for (let index = 0; index < values.length; index += 1) {
        if (values[index] === gribMissing) {
          throw new Era5ContractError(
            `variable "${mapping.fileName}" contains its own GRIB_missingValue ` +
              `(${String(gribMissing)}) at flat index ${String(index)} — a sentinel in the data.`,
          );
        }
      }
    }

    decodedVariables.push({
      mapping,
      values,
      unitsAttribute: readStringAttribute(dataset.attributes.units),
    });
  }

  // ── mask census over the FIRST time step (mask invariance is checked in extract) ────
  const first = decodedVariables[0];
  if (first === undefined) {
    throw new Era5ContractError('no variables were requested — nothing to decode.');
  }
  const cellsPerStep = latitudeLength * longitudeLength;
  let maskedCellCount = 0;
  for (let index = 0; index < cellsPerStep; index += 1) {
    const value = first.values[index];
    if (value === undefined || Number.isNaN(value)) maskedCellCount += 1;
  }

  return {
    latitudeAxis,
    longitudeAxis,
    latitudeAnalysis,
    longitudeAnalysis,
    latitudeSummary: summarise(latitudeAnalysis),
    longitudeSummary: summarise(longitudeAnalysis),
    months,
    variables: decodedVariables,
    expverValues,
    globalAttributeSummary: summariseGlobalAttributes(file.globalAttributes()),
    maskedCellCount,
    totalCellCount: cellsPerStep,
  };
}

function summarise(analysis: Era5AxisAnalysis): Era5AxisSummary {
  return {
    first: analysis.first,
    last: analysis.last,
    step: analysis.step,
    length: analysis.length,
  };
}

/**
 * Turn CF epoch seconds into calendar months, asserting the shape of the series as it goes:
 * strictly increasing, each value exactly midnight UTC on the FIRST of a month, and each month
 * exactly one calendar month after its predecessor. A dropped or duplicated month would otherwise
 * shift a 30-year average by a whole month's climate.
 */
export function buildMonths(epochSeconds: ArrayLike<number>): Era5Month[] {
  const months: Era5Month[] = [];
  for (let index = 0; index < epochSeconds.length; index += 1) {
    const seconds = epochSeconds[index];
    if (seconds === undefined || !Number.isFinite(seconds)) {
      throw new Era5ContractError(`valid_time[${String(index)}] is not a finite number.`);
    }
    if (!Number.isSafeInteger(seconds)) {
      throw new Era5ContractError(
        `valid_time[${String(index)}] = ${String(seconds)} is not a safe integer — the int64 ` +
          'decode overflowed and the date would be wrong.',
      );
    }
    const previous = epochSeconds[index - 1];
    if (index > 0 && previous !== undefined && seconds <= previous) {
      throw new Era5ContractError(
        `valid_time is not strictly increasing at index ${String(index)} ` +
          `(${String(previous)} → ${String(seconds)}).`,
      );
    }
    const date = new Date(seconds * 1000);
    if (
      date.getUTCDate() !== 1 ||
      date.getUTCHours() !== 0 ||
      date.getUTCMinutes() !== 0 ||
      date.getUTCSeconds() !== 0
    ) {
      throw new Era5ContractError(
        `valid_time[${String(index)}] = ${date.toISOString()} is not midnight UTC on the first of ` +
          'a month — this is not a monthly-means product.',
      );
    }
    const month: Era5Month = {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      epochSeconds: seconds,
    };
    const last = months[months.length - 1];
    if (last !== undefined) {
      const expectedMonth = last.month === 12 ? 1 : last.month + 1;
      const expectedYear = last.month === 12 ? last.year + 1 : last.year;
      if (month.year !== expectedYear || month.month !== expectedMonth) {
        throw new Era5ContractError(
          `valid_time skips from ${String(last.year)}-${String(last.month).padStart(2, '0')} to ` +
            `${String(month.year)}-${String(month.month).padStart(2, '0')} — the series has a ` +
            'gap or a duplicate.',
        );
      }
    }
    months.push(month);
  }
  return months;
}

/** `[time][lat][lon]` → flat index. Single-sourced so extract and the specs cannot disagree. */
export function flatIndex(
  timeIndex: number,
  latIndex: number,
  lonIndex: number,
  latitudeLength: number,
  longitudeLength: number,
): number {
  return (timeIndex * latitudeLength + latIndex) * longitudeLength + lonIndex;
}

function onlyDimension(shape: readonly number[], what: string): number {
  if (shape.length !== 1) {
    throw new Era5ContractError(
      `"${what}" has ${String(shape.length)} dimensions, expected exactly 1.`,
    );
  }
  const size = shape[0];
  if (size === undefined) throw new Era5ContractError(`"${what}" has an undefined dimension size.`);
  return size;
}

/** HDF5 attributes arrive as a bare scalar (rank 0) or a 1-element array — accept both, only those. */
function readNumericAttribute(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return raw;
  if (Array.isArray(raw) && raw.length === 1) {
    const value: unknown = raw[0];
    return typeof value === 'number' ? value : null;
  }
  return null;
}

function readStringAttribute(raw: unknown): string | null {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && raw.length === 1) {
    const value: unknown = raw[0];
    return typeof value === 'string' ? value : null;
  }
  return null;
}

/**
 * Flatten the global attribute bag to strings for the manifest.
 *
 * `history` is the one that MATTERS: it carries `filter_by_keys: {"stream": ["moda"]}`, which is
 * the actual evidence for the `tp` multiplier (`era5-units.ts`). Recording it means a future
 * reader can re-derive the unit decision from the artifact instead of trusting a comment.
 */
function summariseGlobalAttributes(
  attributes: Readonly<Record<string, unknown>>,
): Record<string, string> {
  const summary: Record<string, string> = {};
  for (const key of Object.keys(attributes).sort()) {
    const value = attributes[key];
    if (typeof value === 'string') {
      summary[key] = value;
    } else if (Array.isArray(value) && value.length === 1 && typeof value[0] === 'string') {
      summary[key] = value[0];
    }
  }
  return summary;
}
