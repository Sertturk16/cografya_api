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
 * grid-point registered, `_FillValue` is NaN and not −999), so every claim is VERIFIED.
 *
 * ## EVERY GUARD HERE READS THE DATA, NEVER AN ATTRIBUTE (Atlas ruling O-1, 2026-08-02)
 * The 2026-08-02 hand-run discovered that `jsfive@0.4.0` cannot read densely-stored HDF5
 * attributes and returns an **empty bag with no error** (see the adapter's docblock for the
 * mechanism). The original attribute-based guards were therefore not merely unavailable — one of
 * them, `if ('scale_factor' in attributes) throw`, could never fire, so a packed file would have
 * passed a check that reported "verified". A guard whose disabling surface is invisible is worse
 * than no guard.
 *
 * So the contract is proven from the bytes, which is strictly stronger than proving it from a
 * label the writer chose:
 *
 * | claim | how it is proven FROM DATA | on deviation |
 * |---|---|---|
 * | variable names | the dataset must exist under that exact name | `schema_error`, no substitution |
 * | dimension ORDER | shape must equal `[months, lat, lon]`, sizes pairwise distinct | `schema_error` |
 * | latitude / longitude axes | step derived from the axis WITH ITS SIGN; monotonic + even | axis guard |
 * | epoch (`seconds since 1970-01-01`) | the int64s must be 360 CONSECUTIVE month-starts at midnight UTC — no other epoch maps these integers onto a gapless 1991-01…2020-12 calendar | `schema_error` |
 * | missing-ness is NaN | masked cells must actually READ BACK NaN, and the grid must contain a mask at all | `schema_error` |
 * | no numeric sentinel | every value scanned against −999, 3.4028e38, 9.969e36 | `schema_error` |
 * | **no packing** | raw values must lie in the physical band (K / m per day). A packed int16 file read raw lands orders of magnitude outside and fails LOUDLY | `schema_error` |
 * | `expver` | 360/360 `"0001"` (the values themselves, not an attribute) | `schema_error` |
 *
 * `units` strings are consequently unreadable and enter provenance as `null` WITH a recorded
 * reason. Nothing was lost: the `tp` multiplier never rested on `tp:units` — that attribute is
 * actively misleading (`"m"` for a per-day quantity). It rests on the ROOT-GROUP `history`
 * attribute (`stream=moda`), which is compact-stored and reads correctly.
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
  /**
   * The file's own `units` attribute, or `null` when the decoder cannot read it — which, for this
   * decoder and this product, is ALWAYS (dense attribute storage). Kept in the shape so the
   * manifest can state "unreadable" explicitly rather than omitting the field and letting a reader
   * infer "absent from the file". See {@link ERA5_UNITS_UNREADABLE_REASON}.
   */
  unitsAttribute: string | null;
}

/** Recorded in the manifest beside every `unitsAttribute: null` (ruling O-1, condition iii). */
export const ERA5_UNITS_UNREADABLE_REASON =
  'not readable: jsfive reads compact-stored HDF5 attributes only, and this product stores them ' +
  'densely. Note the `tp` units attribute says "m" and is MISLEADING anyway — the per-day ' +
  'semantics come from the root-group history attribute (stream=moda), which IS readable.';

/**
 * Numeric sentinels that must never appear as a reading. `GRIB_missingValue` (3.4028e38) is
 * declared by this product but occurs 0 times in the data (measured, twice); −999 is CAMS's
 * convention; 9.969e36 is the netCDF default float fill. We cannot read the attribute that
 * declares them, so we scan the values for them directly — which is the stronger check regardless.
 */
export const ERA5_FORBIDDEN_SENTINELS: readonly number[] = [
  3.4028234663852886e38, -999, 9.969209968386869e36,
];

/**
 * Physical bands in the RAW units the file carries, which is what makes packing detectable.
 *
 * A packed file (int16 + `scale_factor`) read as raw values yields quantities in the thousands or
 * tens of thousands — three to four orders of magnitude outside these bands — so the check fires
 * loudly on exactly the case the unreadable `scale_factor` attribute used to pretend to cover.
 * The bands are the SPEC §5.2 physical guards expressed at source: −60…+60 °C in Kelvin, and
 * 0…2000 mm/month expressed as m per day over the shortest month.
 */
const RAW_BANDS: Record<Era5VariableMapping['kind'], { min: number; max: number; unit: string }> = {
  temperature: { min: 213.15, max: 333.15, unit: 'K' },
  precipitation: { min: 0, max: 2000 / 28 / 1000, unit: 'm per day' },
};

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

  // ── valid_time: the EPOCH is proven from the values, not from an attribute ──
  // `buildMonths` requires every int64 to be midnight UTC on the first of a month AND each to be
  // exactly one calendar month after its predecessor. Interpreted under any other epoch, this
  // particular run of integers does not land on a gapless run of month-starts — so passing that
  // gate IS the proof that the units are `seconds since 1970-01-01`. The attribute (which this
  // decoder cannot read anyway) would only have been the writer's claim about the same thing.
  const rawTimes = file.readNumericDataset('valid_time', monthCount);
  const months = rawTimes.length === 0 ? [] : buildMonths(rawTimes);

  // ── expver: a string VARIABLE, not an extra dimension (measured M8) ─────────
  // In the 360-month production file it is a proper vector. In the single-month fixture cfgrib
  // collapses it to a SCALAR dataspace (rank 0, one value). Both are one value per month, so the
  // scalar is accepted as a 1-element vector — and the production length check below is NOT
  // relaxed by it (Atlas ruling, 2026-08-02).
  const expverDataset = file.dataset('expver');
  const expverLength =
    expverDataset.shape.length === 0 ? 1 : onlyDimension(expverDataset.shape, 'expver');
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

    const values = file.readNumericDataset(mapping.fileName, expectedCellCount);

    // ── ONE data pass that replaces three unreadable attribute guards ────────
    // Missing-ness, sentinels and packing are all decided by the VALUES. See the module docblock
    // for why this is stronger than reading `_FillValue` / `GRIB_missingValue` / `scale_factor`,
    // and the adapter docblock for why reading them is impossible with this decoder.
    const band = RAW_BANDS[mapping.kind];
    let maskedInVariable = 0;
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      if (value === undefined) {
        throw new Era5ContractError(
          `variable "${mapping.fileName}"[${String(index)}] is missing from the decoded array.`,
          { unexpected: true },
        );
      }
      // NaN IS the fill value in this product, and the sea mask is real information — kept.
      if (Number.isNaN(value)) {
        maskedInVariable += 1;
        continue;
      }
      for (const sentinel of ERA5_FORBIDDEN_SENTINELS) {
        if (value === sentinel) {
          throw new Era5ContractError(
            `variable "${mapping.fileName}"[${String(index)}] is the sentinel ${String(sentinel)} ` +
              '— a missing-value marker masquerading as a reading. Missing-ness on this product ' +
              'is NaN; a numeric sentinel means the product changed.',
          );
        }
      }
      // The packing guard. A packed int16 file read raw lands orders of magnitude outside.
      if (value < band.min || value > band.max) {
        throw new Era5ContractError(
          `variable "${mapping.fileName}"[${String(index)}] = ${String(value)} ${band.unit} is ` +
            `outside the physical band [${String(band.min)}, ${String(band.max)}] ${band.unit}. ` +
            'The most likely cause is that the product started returning PACKED values ' +
            '(scale_factor/add_offset), which must never be read raw — refusing to publish ' +
            'plausible-looking nonsense.',
        );
      }
    }
    // A grid with NO masked cell at all would mean ERA5-Land started returning sea values, i.e.
    // that NaN stopped being the fill marker. Measured: 24.4 % of this box is masked.
    if (maskedInVariable === 0) {
      throw new Era5ContractError(
        `variable "${mapping.fileName}" contains NO masked cell. ERA5-Land is defined on land ` +
          'only and 24.4 % of this box is sea, so an unmasked grid means missing-ness is no ' +
          'longer expressed as NaN — every sea cell would be published as a real reading.',
      );
    }

    decodedVariables.push({
      mapping,
      // Always null with this decoder; the manifest states the reason explicitly (ruling O-1 iii).
      unitsAttribute: readStringAttribute(dataset.attributes.units),
      values,
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
