/**
 * The canonical CDS request bodies and the request↔file variable mapping (SPEC §2.3, all
 * measured by the 2026-08-01 probe — none of this is an assumption).
 *
 * ## The production request is NOT split, and that is a measured decision
 * 2 variables × 30 years × 12 months = 720 variable-months in ONE job. The measured `costing` is
 * **1 440** against this dataset's limit of **120 000** — an 83× margin. The year-sliced fallback
 * this SPEC once contemplated is therefore not built (and would not even help: account-level
 * concurrency measured 1, so slices would run serially and the wall clock would grow linearly).
 *
 * ## The enums here are the MEASURED ones, not CAMS's
 * `data_format` is `grib | netcdf` — **`netcdf_zip` does not exist in this product** — and the
 * container is a SEPARATE parameter, `download_format: zip | unarchived`. We ask for
 * `unarchived`, so a plain file arrives and no ZIP code path is written at all.
 */

import { Era5ContractError } from './era5.errors';

/** Base URL — a script-local CONSTANT, not env (see `era5-fetch.ts` for the security reasoning). */
export const CDS_BASE_URL = 'https://cds.climate.copernicus.eu/api/retrieve/v1';

export const ERA5_DATASET_ID = 'reanalysis-era5-land-monthly-means';

/** Public dataset landing page — goes into the manifest and, in PR-2, into `sourceUrl`. */
export const ERA5_DATASET_URL =
  'https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-monthly-means';

/** DOI of the dataset (CC-BY-4.0, already accepted on the account — Atlas API-verified). */
export const ERA5_DATASET_DOI = '10.24381/cds.68d2bb30';

/** [N, W, S, E] — measured: all four box edges coincide with grid points and are INCLUDED. */
export const ERA5_AREA: readonly number[] = [42.5, 25.5, 35.5, 45.0];

/** WMO normal window (DEC-locked): 1991–2020 inclusive. */
export const ERA5_FIRST_YEAR = 1991;
export const ERA5_LAST_YEAR = 2020;

/** 30 years × 12 months. Single-sourced so the request, the decode and the assertions agree. */
export const ERA5_EXPECTED_MONTH_COUNT = (ERA5_LAST_YEAR - ERA5_FIRST_YEAR + 1) * 12;

/**
 * Request name ↔ in-file variable name. Measured (M8): the file calls them `t2m` and `tp`.
 * A single `readonly` table so a provider rename surfaces as a `schema_error` in exactly one
 * place instead of silently reading the wrong array.
 */
export interface Era5VariableMapping {
  /** What the CDS request asks for. */
  readonly requestName: string;
  /** What the returned NetCDF4 file actually calls it. */
  readonly fileName: string;
  /** Which conversion `era5-extract.ts` must apply. */
  readonly kind: 'temperature' | 'precipitation';
}

export const ERA5_VARIABLES: readonly Era5VariableMapping[] = [
  { requestName: '2m_temperature', fileName: 't2m', kind: 'temperature' },
  { requestName: 'total_precipitation', fileName: 'tp', kind: 'precipitation' },
];

/** Every calendar month, zero-padded — the CDS enum is a string list. */
function allMonths(): string[] {
  return Array.from({ length: 12 }, (_unused, index) => String(index + 1).padStart(2, '0'));
}

function allYears(): string[] {
  return Array.from({ length: ERA5_LAST_YEAR - ERA5_FIRST_YEAR + 1 }, (_unused, index) =>
    String(ERA5_FIRST_YEAR + index),
  );
}

/** The production body: 2 variables × 1991–2020 × 12 months (measured `costing` 1 440). */
export function buildProductionRequestBody(): Record<string, unknown> {
  return {
    product_type: ['monthly_averaged_reanalysis'],
    variable: ERA5_VARIABLES.map((mapping) => mapping.requestName),
    year: allYears(),
    month: allMonths(),
    time: ['00:00'],
    data_format: 'netcdf',
    download_format: 'unarchived',
    area: [...ERA5_AREA],
  };
}

/**
 * The mini golden-fixture body: `2m_temperature`, January 1991 only, same TR box.
 *
 * It must be a REAL provider response, not a file we synthesise, so the fixture builder and the
 * reader cannot share the same wrong model (the A1 rule). It stays small because it is one
 * variable × one month: 13 916 cells at ~2.85:1 measured compression.
 */
export function buildFixtureRequestBody(): Record<string, unknown> {
  // Looked up by KIND and failing loudly, not `ERA5_VARIABLES[0]?.requestName ?? '2m_temperature'`:
  // a literal fallback beside the table it falls back FROM is a second copy of the same fact that
  // no test can ever reach, so a rename would leave the two disagreeing in silence.
  const temperature = ERA5_VARIABLES.find((mapping) => mapping.kind === 'temperature');
  if (temperature === undefined) {
    throw new Era5ContractError('ERA5_VARIABLES no longer carries a temperature mapping.');
  }
  return {
    ...buildProductionRequestBody(),
    variable: [temperature.requestName],
    year: [String(ERA5_FIRST_YEAR)],
    month: ['01'],
  };
}
