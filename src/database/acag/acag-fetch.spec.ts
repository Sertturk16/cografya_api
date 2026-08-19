import { describe, expect, it } from '@jest/globals';
import {
  ACAG_KEY_PREFIX,
  ACAG_VERSION_TOKEN,
  acagFileNameForYear,
  acagObjectKeyForYear,
  acagUrlForYear,
  acagYears,
} from './acag-fetch';
import {
  ACAG_EXPECTED_FIRST_YEAR,
  ACAG_EXPECTED_LAST_YEAR,
  ACAG_PINNED_DATASET_VERSION,
} from './acag-assertions';
import { ACAG_DATASET_VERSION } from '../../province/acag-attribution.constant';

/**
 * The version identity now has ONE editable home (review CODE123-I1 / SFH123-I1), and the S3 key
 * prefix and file names DERIVE from it. These tests pin the derivation's current output, because
 * a transformation nobody checks is just a second place for the version to drift — which is the
 * defect the single-sourcing exists to remove.
 */
describe('the version identity is single-sourced', () => {
  it('derives the provider dot-free token from the one version constant', () => {
    expect(ACAG_DATASET_VERSION).toBe('V6.GL.03');
    expect(ACAG_VERSION_TOKEN).toBe('V6GL03');
    expect(ACAG_VERSION_TOKEN).toBe(ACAG_DATASET_VERSION.replaceAll('.', ''));
  });

  it('binds the assertions pin to the same constant the künye publishes', () => {
    expect(ACAG_PINNED_DATASET_VERSION).toBe(ACAG_DATASET_VERSION);
  });

  it('builds the S3 key prefix and file names from that token', () => {
    expect(ACAG_KEY_PREFIX).toBe('V6GL03/FineResolution/GL/Annual');
    expect(acagFileNameForYear(2024)).toBe('V6GL03.CNNPM25.GL.202401-202412.nc');
    expect(acagObjectKeyForYear(1998)).toBe(
      'V6GL03/FineResolution/GL/Annual/V6GL03.CNNPM25.GL.199801-199812.nc',
    );
    expect(acagUrlForYear(2024)).toBe(
      'http://satpmdata.s3.amazonaws.com/V6GL03/FineResolution/GL/Annual/' +
        'V6GL03.CNNPM25.GL.202401-202412.nc',
    );
  });

  it('every file name and key carries the SAME token — no second spelling survives', () => {
    for (const year of acagYears()) {
      expect(acagFileNameForYear(year)).toContain(ACAG_VERSION_TOKEN);
      expect(acagObjectKeyForYear(year)).toContain(ACAG_VERSION_TOKEN);
    }
  });
});

describe('acagYears', () => {
  it('is the contiguous ascending range the ruling pinned', () => {
    const years = acagYears();
    expect(years[0]).toBe(ACAG_EXPECTED_FIRST_YEAR);
    expect(years[years.length - 1]).toBe(ACAG_EXPECTED_LAST_YEAR);
    expect(years).toHaveLength(ACAG_EXPECTED_LAST_YEAR - ACAG_EXPECTED_FIRST_YEAR + 1);
    expect([...years].sort((a, b) => a - b)).toEqual(years);
  });
});
