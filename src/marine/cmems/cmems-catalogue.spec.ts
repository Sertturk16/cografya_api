import { describe, expect, it } from '@jest/globals';
import { resolveCmemsCatalogueFields } from './cmems-catalogue';
import type { CmemsProductResolution } from './cmems-stac';

/** The d1–d3 aggregation rules: min horizon, verbatim-joined frequency, max catalogue stamp. */

function resolution(overrides: Partial<CmemsProductResolution>): CmemsProductResolution {
  return {
    productId: 'P',
    license: 'proprietary',
    doi: null,
    temporalExtent: { startUtc: '2021-01-01T00:00:00Z', endUtc: '2026-08-10T23:00:00Z' },
    updateFrequency: 'daily: 16:00',
    admpUpdatedUtc: '2026-08-01T11:06:46Z',
    selections: [],
    ...overrides,
  };
}

describe('resolveCmemsCatalogueFields', () => {
  it('d1: horizonEndUtc is the MINIMUM of the serving products’ extent ends', () => {
    const fields = resolveCmemsCatalogueFields([
      resolution({ temporalExtent: { startUtc: null, endUtc: '2026-08-10T23:00:00Z' } }),
      resolution({ temporalExtent: { startUtc: null, endUtc: '2026-08-06T23:00:00Z' } }),
    ]);
    expect(fields.horizonEndUtc).toBe('2026-08-06T23:00:00Z');
  });

  it('d1: a missing resolution nulls the horizon — a partial minimum could OVERSTATE it', () => {
    const fields = resolveCmemsCatalogueFields([resolution({}), null]);
    expect(fields).toEqual({
      horizonEndUtc: null,
      updateFrequency: null,
      catalogueUpdatedAtUtc: null,
    });
  });

  it('d1: an open-ended extent nulls the horizon rather than inventing an end', () => {
    const fields = resolveCmemsCatalogueFields([
      resolution({ temporalExtent: { startUtc: null, endUtc: null } }),
      resolution({}),
    ]);
    expect(fields.horizonEndUtc).toBeNull();
  });

  it('d2: identical provider-verbatim frequencies collapse; distinct ones join with " | "', () => {
    const same = resolveCmemsCatalogueFields([resolution({}), resolution({})]);
    expect(same.updateFrequency).toBe('daily: 16:00');

    const different = resolveCmemsCatalogueFields([
      resolution({}),
      resolution({ updateFrequency: 'twice-daily: 00:00; 12:00' }),
    ]);
    expect(different.updateFrequency).toBe('daily: 16:00 | twice-daily: 00:00; 12:00');
  });

  it('d3: catalogueUpdatedAtUtc is the NEWEST admp_updated across the serving products', () => {
    const fields = resolveCmemsCatalogueFields([
      resolution({ admpUpdatedUtc: '2026-08-01T11:06:46Z' }),
      resolution({ admpUpdatedUtc: '2026-08-02T03:00:00Z' }),
    ]);
    expect(fields.catalogueUpdatedAtUtc).toBe('2026-08-02T03:00:00Z');
  });

  it('the per-field all-or-null rule is independent: one product without admp_updated nulls d3 only', () => {
    const fields = resolveCmemsCatalogueFields([
      resolution({}),
      resolution({ admpUpdatedUtc: null }),
    ]);
    expect(fields.catalogueUpdatedAtUtc).toBeNull();
    expect(fields.horizonEndUtc).not.toBeNull();
    expect(fields.updateFrequency).not.toBeNull();
  });

  it('an empty product list yields the honest empty state', () => {
    expect(resolveCmemsCatalogueFields([])).toEqual({
      horizonEndUtc: null,
      updateFrequency: null,
      catalogueUpdatedAtUtc: null,
    });
  });
});
