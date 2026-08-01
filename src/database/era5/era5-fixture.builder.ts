import { analyseEra5Axis } from './era5-grid';
import type { Era5DecodedFile, Era5Month } from './era5-decode';
import { ERA5_VARIABLES } from './era5-request';
import { Era5ContractError } from './era5.errors';
import type { Era5Dataset, Era5FileReader } from './hdf5/jsfive.adapter';

/**
 * TEST INFRASTRUCTURE — synthetic ERA5-Land files, in the shape `jsfive` would hand us.
 *
 * It lives under `src/` only so the unit lane collects the specs that use it, exactly like
 * `src/air-quality/cams/netcdf3-fixture.builder.ts`, and it is excluded from `tsconfig.build.json`
 * so it never reaches `dist/`. It is NOT a golden fixture and must never be confused with one:
 * the golden test runs against REAL provider bytes (`test/fixtures/era5/`), because a builder and
 * a reader written by the same hand can share the same wrong model. This file exists to break
 * files ON PURPOSE — the `scale_factor` that appeared, the `_FillValue` that became a sentinel,
 * the transposed dimension order — which no real download will ever hand us.
 *
 * The axes default to the MEASURED production shape (lat 42.5→35.5 ×71, lon 25.5→45.0 ×196) so a
 * synthetic file still covers all 81 provinces and the extraction path is exercisable.
 */

export const TEST_LATITUDE_AXIS: readonly number[] = Array.from(
  { length: 71 },
  (_unused, index) => 42.5 - index * 0.1,
);
export const TEST_LONGITUDE_AXIS: readonly number[] = Array.from(
  { length: 196 },
  (_unused, index) => 25.5 + index * 0.1,
);

export interface SyntheticVariable {
  name: string;
  attributes?: Record<string, unknown>;
  /** Override the whole flat array. When absent, a smooth plausible field is generated. */
  values?: Float64Array;
  /** Override the reported shape without changing the data — used to fake a transposed file. */
  shape?: readonly number[];
}

export interface SyntheticFileOptions {
  monthCount?: number;
  firstYear?: number;
  latitudeAxis?: readonly number[];
  longitudeAxis?: readonly number[];
  /** `"latIndex,lonIndex"` entries that read back NaN in every month. */
  maskedCells?: ReadonlySet<string>;
  /** Masked in EVERY month except month 0 — the mask-invariance breaker. */
  flickeringCells?: ReadonlySet<string>;
  timeUnits?: string;
  expverValues?: readonly string[];
  variables?: readonly SyntheticVariable[];
  globalAttributes?: Record<string, unknown>;
  /** Drop these variables entirely, so `dataset()` reports them missing. */
  omit?: readonly string[];
}

interface ResolvedOptions {
  monthCount: number;
  firstYear: number;
  latitudeAxis: readonly number[];
  longitudeAxis: readonly number[];
  maskedCells: ReadonlySet<string>;
  flickeringCells: ReadonlySet<string>;
  timeUnits: string;
  expverValues: readonly string[];
  variables: readonly SyntheticVariable[];
  globalAttributes: Record<string, unknown>;
  omit: readonly string[];
}

function resolve(options: SyntheticFileOptions): ResolvedOptions {
  const monthCount = options.monthCount ?? 2;
  return {
    monthCount,
    firstYear: options.firstYear ?? 1991,
    latitudeAxis: options.latitudeAxis ?? TEST_LATITUDE_AXIS,
    longitudeAxis: options.longitudeAxis ?? TEST_LONGITUDE_AXIS,
    maskedCells: options.maskedCells ?? new Set<string>(),
    flickeringCells: options.flickeringCells ?? new Set<string>(),
    timeUnits: options.timeUnits ?? 'seconds since 1970-01-01',
    expverValues: options.expverValues ?? Array.from({ length: monthCount }, () => '0001'),
    variables: options.variables ?? [
      { name: 't2m', attributes: { units: 'K', _FillValue: Number.NaN } },
      { name: 'tp', attributes: { units: 'm', _FillValue: Number.NaN } },
    ],
    globalAttributes: options.globalAttributes ?? {
      Conventions: 'CF-1.7',
      history: '2026-08-02 grib_to_netcdf … filter_by_keys: {"stream": ["moda"]}',
      institution: 'ECMWF',
    },
    omit: options.omit ?? [],
  };
}

/** Calendar months starting at `firstYear`-01, as CF epoch seconds. */
export function syntheticMonths(monthCount: number, firstYear: number): Era5Month[] {
  return Array.from({ length: monthCount }, (_unused, index) => {
    const year = firstYear + Math.floor(index / 12);
    const month = (index % 12) + 1;
    return {
      year,
      month,
      epochSeconds: Math.floor(Date.UTC(year, month - 1, 1) / 1000),
    };
  });
}

/**
 * A smooth, plausible field: temperature falls with latitude and wobbles with the month;
 * precipitation is a small positive m/day value. Masked cells read NaN.
 */
function generateValues(name: string, resolved: ResolvedOptions): Float64Array {
  const latCount = resolved.latitudeAxis.length;
  const lonCount = resolved.longitudeAxis.length;
  const out = new Float64Array(resolved.monthCount * latCount * lonCount);
  let cursor = 0;
  for (let timeIndex = 0; timeIndex < resolved.monthCount; timeIndex += 1) {
    for (let latIndex = 0; latIndex < latCount; latIndex += 1) {
      const latitude = resolved.latitudeAxis[latIndex] ?? 0;
      for (let lonIndex = 0; lonIndex < lonCount; lonIndex += 1) {
        const key = `${String(latIndex)},${String(lonIndex)}`;
        const masked =
          resolved.maskedCells.has(key) || (resolved.flickeringCells.has(key) && timeIndex > 0);
        if (masked) {
          out[cursor] = Number.NaN;
        } else if (name === 'tp') {
          // ~0.002 m/day → ~60 mm in a 30-day month: comfortably inside the physical guard.
          out[cursor] = 0.002 + (latIndex % 5) * 0.0002;
        } else {
          out[cursor] = 273.15 + (45 - latitude) + (timeIndex % 12);
        }
        cursor += 1;
      }
    }
  }
  return out;
}

/** A fake {@link Era5FileReader}: the seam `decodeEra5File` depends on, with no HDF5 involved. */
export function buildFakeEra5File(options: SyntheticFileOptions = {}): Era5FileReader {
  const resolved = resolve(options);
  const months = syntheticMonths(resolved.monthCount, resolved.firstYear);
  const latCount = resolved.latitudeAxis.length;
  const lonCount = resolved.longitudeAxis.length;

  const numericData = new Map<string, Float64Array>();
  numericData.set('latitude', Float64Array.from(resolved.latitudeAxis));
  numericData.set('longitude', Float64Array.from(resolved.longitudeAxis));
  numericData.set('valid_time', Float64Array.from(months.map((month) => month.epochSeconds)));

  const datasets = new Map<string, Era5Dataset>();
  datasets.set('latitude', {
    name: 'latitude',
    shape: [latCount],
    attributes: { units: 'degrees_north' },
    dtype: '<f8',
  });
  datasets.set('longitude', {
    name: 'longitude',
    shape: [lonCount],
    attributes: { units: 'degrees_east' },
    dtype: '<f8',
  });
  datasets.set('valid_time', {
    name: 'valid_time',
    shape: [resolved.monthCount],
    attributes: { units: resolved.timeUnits, calendar: 'proleptic_gregorian' },
    dtype: '<i8',
  });
  datasets.set('expver', {
    name: 'expver',
    shape: [resolved.expverValues.length],
    attributes: {},
    dtype: null,
  });

  for (const variable of resolved.variables) {
    datasets.set(variable.name, {
      name: variable.name,
      shape: variable.shape ?? [resolved.monthCount, latCount, lonCount],
      attributes: variable.attributes ?? {},
      dtype: '<f4',
    });
    numericData.set(variable.name, variable.values ?? generateValues(variable.name, resolved));
  }

  for (const name of resolved.omit) {
    datasets.delete(name);
    numericData.delete(name);
  }

  return {
    keys: () => [...datasets.keys()],
    globalAttributes: () => resolved.globalAttributes,
    dataset: (name: string): Era5Dataset => {
      const found = datasets.get(name);
      if (found === undefined) {
        throw new Era5ContractError(
          `variable "${name}" is not in the file. Present at root: ${[...datasets.keys()].join(', ')}.`,
        );
      }
      return found;
    },
    readNumericDataset: (name: string, expectedLength: number): Float64Array => {
      const found = numericData.get(name);
      if (found === undefined) {
        throw new Era5ContractError(`variable "${name}" is not in the file.`);
      }
      if (found.length !== expectedLength) {
        throw new Era5ContractError(
          `variable "${name}" has ${String(found.length)} value(s), expected ` +
            `${String(expectedLength)} from its own shape.`,
        );
      }
      return found;
    },
    readStringDataset: (name: string, expectedLength: number): readonly string[] => {
      if (name !== 'expver') {
        throw new Era5ContractError(`no string dataset "${name}".`);
      }
      if (resolved.expverValues.length !== expectedLength) {
        throw new Era5ContractError(
          `variable "expver" has ${String(resolved.expverValues.length)} value(s), expected ` +
            `${String(expectedLength)}.`,
        );
      }
      return resolved.expverValues;
    },
  };
}

/**
 * A synthetic {@link Era5DecodedFile}, for the layers ABOVE decode (extraction, the fetch
 * choreography) that need a decoded file without caring how it was decoded.
 */
export function buildSyntheticDecodedFile(options: SyntheticFileOptions = {}): Era5DecodedFile {
  const resolved = resolve(options);
  const latitudeAnalysis = analyseEra5Axis(resolved.latitudeAxis, 'latitude');
  const longitudeAnalysis = analyseEra5Axis(resolved.longitudeAxis, 'longitude');
  const cellsPerStep = resolved.latitudeAxis.length * resolved.longitudeAxis.length;

  const variables = resolved.variables.map((variable) => {
    const mapping =
      ERA5_VARIABLES.find((candidate) => candidate.fileName === variable.name) ?? ERA5_VARIABLES[0];
    if (mapping === undefined) throw new Era5ContractError('no variable mapping available.');
    return {
      mapping,
      values: variable.values ?? generateValues(variable.name, resolved),
      unitsAttribute: variable.name === 'tp' ? 'm' : 'K',
    };
  });

  const first = variables[0];
  let maskedCellCount = 0;
  if (first !== undefined) {
    for (let index = 0; index < cellsPerStep; index += 1) {
      const value = first.values[index];
      if (value === undefined || Number.isNaN(value)) maskedCellCount += 1;
    }
  }

  return {
    latitudeAxis: [...resolved.latitudeAxis],
    longitudeAxis: [...resolved.longitudeAxis],
    latitudeAnalysis,
    longitudeAnalysis,
    latitudeSummary: {
      first: latitudeAnalysis.first,
      last: latitudeAnalysis.last,
      step: latitudeAnalysis.step,
      length: latitudeAnalysis.length,
    },
    longitudeSummary: {
      first: longitudeAnalysis.first,
      last: longitudeAnalysis.last,
      step: longitudeAnalysis.step,
      length: longitudeAnalysis.length,
    },
    months: syntheticMonths(resolved.monthCount, resolved.firstYear),
    variables,
    expverValues: resolved.expverValues,
    globalAttributeSummary: Object.fromEntries(
      Object.entries(resolved.globalAttributes).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    ),
    maskedCellCount,
    totalCellCount: cellsPerStep,
  };
}

/** The grid indices the five measured fallback provinces' administrative points land on. */
export function cellKeyFor(
  latitude: number,
  longitude: number,
  latitudeAxis: readonly number[] = TEST_LATITUDE_AXIS,
  longitudeAxis: readonly number[] = TEST_LONGITUDE_AXIS,
): string {
  const latAnalysis = analyseEra5Axis(latitudeAxis, 'latitude');
  const lonAnalysis = analyseEra5Axis(longitudeAxis, 'longitude');
  const latIndex = Math.round((latitude - latAnalysis.first) / latAnalysis.step);
  const lonIndex = Math.round((longitude - lonAnalysis.first) / lonAnalysis.step);
  return `${String(latIndex)},${String(lonIndex)}`;
}
