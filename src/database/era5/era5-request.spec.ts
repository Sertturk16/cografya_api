import { describe, expect, it } from '@jest/globals';
import {
  buildFixtureRequestBody,
  buildProductionRequestBody,
  ERA5_AREA,
  ERA5_EXPECTED_MONTH_COUNT,
  ERA5_FIRST_YEAR,
  ERA5_LAST_YEAR,
  ERA5_VARIABLES,
} from './era5-request';

/**
 * The request body is the ONE input the whole chain hangs from, and every other gate sees it only
 * after the fact: a body missing a year fails as `months-360`, a body with the wrong `area` fails
 * as an outside-domain province, a body asking for `grib` fails at the magic bytes. Those are all
 * good failures, but they arrive after a real CDS job has been queued, run and downloaded.
 *
 * So the body is pinned here, offline, against the MEASURED enums (SPEC §2.3 — `netcdf_zip` does
 * not exist in this product and the container is a separate parameter).
 *
 * Structure only: nothing here asserts a climate fact.
 */

describe('buildProductionRequestBody', () => {
  const body = buildProductionRequestBody();

  it('asks for the full WMO normal window, with no year missing', () => {
    expect(body.year).toEqual(
      Array.from({ length: ERA5_LAST_YEAR - ERA5_FIRST_YEAR + 1 }, (_unused, index) =>
        String(ERA5_FIRST_YEAR + index),
      ),
    );
    expect(body.month).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12',
    ]);
    // The two lists MULTIPLY into the month count every downstream gate expects.
    expect((body.year as string[]).length * (body.month as string[]).length).toBe(
      ERA5_EXPECTED_MONTH_COUNT,
    );
  });

  it('asks for both core variables by their REQUEST names, not their file names', () => {
    expect(body.variable).toEqual(ERA5_VARIABLES.map((mapping) => mapping.requestName));
    expect(body.variable).toEqual(['2m_temperature', 'total_precipitation']);
  });

  it('asks for the MEASURED format enums — `netcdf_zip` does not exist in this product', () => {
    expect(body.data_format).toBe('netcdf');
    expect(body.download_format).toBe('unarchived');
    expect(body.product_type).toEqual(['monthly_averaged_reanalysis']);
    expect(body.time).toEqual(['00:00']);
  });

  it('sends the TR box as [N, W, S, E], copied so a caller cannot mutate the constant', () => {
    expect(body.area).toEqual([...ERA5_AREA]);
    expect(body.area).not.toBe(ERA5_AREA);
    const [north, west, south, east] = body.area as number[];
    expect(north).toBeGreaterThan(south as number);
    expect(east).toBeGreaterThan(west as number);
  });
});

describe('buildFixtureRequestBody', () => {
  const body = buildFixtureRequestBody();

  it('is ONE variable × ONE month, so the committed golden fixture stays small', () => {
    expect(body.variable).toEqual(['2m_temperature']);
    expect(body.year).toEqual([String(ERA5_FIRST_YEAR)]);
    expect(body.month).toEqual(['01']);
  });

  it('keeps the production box and formats, so it is the same product read the same way', () => {
    const production = buildProductionRequestBody();
    expect(body.area).toEqual(production.area);
    expect(body.data_format).toBe(production.data_format);
    expect(body.download_format).toBe(production.download_format);
    expect(body.product_type).toEqual(production.product_type);
  });
});
