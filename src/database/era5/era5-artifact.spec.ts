import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SEED_PROVINCES } from '../seeds/province.seed-data';
import type { Era5Manifest, Era5SeriesArtifact } from './era5-artifact.types';
import { evaluateEra5Assertions } from './era5-assertions';
import { EXPECTED_FALLBACK_PLATE_CODES } from './era5-extract';
import { FALLBACK_MAX_DISTANCE_KM } from './era5-grid';
import { ERA5_EXPECTED_MONTH_COUNT } from './era5-request';

/**
 * Re-validates the COMMITTED artifacts offline, in CI, on every run.
 *
 * Without this, `data/era5-land/*.json` would be two files that were generated once, reviewed
 * once, and never looked at again — and a hand-edit, a truncated series or a regeneration that
 * quietly lost a province would ship unnoticed. Here the same structural gate the hand-run applied
 * is re-applied to the bytes in git.
 *
 * Structure and invariants only. No test in this file asserts what any province's temperature or
 * rainfall IS — those are recorded evidence, and fact-checking is a separate process.
 */

const DATA_DIR = join(__dirname, '..', '..', '..', 'data', 'era5-land');

const manifest = JSON.parse(
  readFileSync(join(DATA_DIR, 'era5-manifest.json'), 'utf8'),
) as Era5Manifest;
const series = JSON.parse(
  readFileSync(join(DATA_DIR, 'era5-province-series.json'), 'utf8'),
) as Era5SeriesArtifact;

describe('committed ERA5 artifacts', () => {
  it('still passes the FULL structural gate the hand-run applied', () => {
    const results = evaluateEra5Assertions({ manifest, series, apiKey: null });
    const failures = results.filter((result) => !result.passed);
    expect(failures.map((result) => `${result.id}: ${result.detail}`)).toEqual([]);
    // Guard against the gate itself being emptied: it must actually have run some checks.
    expect(results.length).toBeGreaterThan(15);
  });

  it('covers all 81 seed provinces, and only those', () => {
    const seeded = [...SEED_PROVINCES.map((province) => province.plateCode)].sort();
    expect([...manifest.provinces.map((province) => province.plateCode)].sort()).toEqual(seeded);
    expect([...series.provinces.map((province) => province.plateCode)].sort()).toEqual(seeded);
  });

  it('carries a complete, gapless 1991-01 … 2020-12 calendar', () => {
    expect(series.monthCount).toBe(ERA5_EXPECTED_MONTH_COUNT);
    expect(series.monthLabels).toHaveLength(ERA5_EXPECTED_MONTH_COUNT);
    const expected: string[] = [];
    for (let year = series.firstYear; year <= series.lastYear; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        expected.push(`${String(year)}-${String(month).padStart(2, '0')}`);
      }
    }
    expect([...series.monthLabels]).toEqual(expected);
  });

  it('carries 360 finite values per variable per province — completeness is absolute', () => {
    for (const province of series.provinces) {
      expect(province.tempMeanC).toHaveLength(ERA5_EXPECTED_MONTH_COUNT);
      expect(province.precipitationMm).toHaveLength(ERA5_EXPECTED_MONTH_COUNT);
      expect(province.tempMeanC.every((value) => Number.isFinite(value))).toBe(true);
      expect(province.precipitationMm.every((value) => Number.isFinite(value) && value >= 0)).toBe(
        true,
      );
    }
  });

  it('declares the A-1 fallback for exactly the five coastal provinces, with all three records', () => {
    expect([...manifest.fallbackPlateCodes].sort()).toEqual(
      [...EXPECTED_FALLBACK_PLATE_CODES].sort(),
    );
    for (const province of manifest.provinces) {
      if (!province.fallbackUsed) {
        expect(province.fallbackDistanceKm).toBe(0);
        continue;
      }
      expect(province.fallbackDistanceKm).toBeGreaterThan(0);
      expect(province.fallbackDistanceKm).toBeLessThanOrEqual(FALLBACK_MAX_DISTANCE_KM);
      expect(Number.isFinite(province.cellLatitude)).toBe(true);
      expect(Number.isFinite(province.cellLongitude)).toBe(true);
    }
  });

  it('declares the half-step tie-break rule and every province it applied to', () => {
    // A tie resolved silently would be a shift decided by floating-point noise; declaring it is
    // what makes it legitimate (same principle as the fallback).
    expect(manifest.halfStepTieBreak.rule).toContain('LOWER INDEX');
    const tied = manifest.provinces
      .filter((province) => province.halfStepTieAxes.length > 0)
      .map((province) => province.plateCode);
    expect([...manifest.halfStepTieBreak.plateCodes].sort()).toEqual([...tied].sort());
  });

  it('discloses that this decoder cannot read the attributes, so `null` is never read as "absent"', () => {
    expect(manifest.decoder.attributeSupport).toBe('compact-only');
    expect(manifest.unitsAttributeNote).toMatch(/not readable/i);
    for (const variable of manifest.variables) {
      expect(variable.unitsAttribute).toBeNull();
    }
  });

  it('keeps the `tp` multiplier anchored to evidence that IS readable', () => {
    // The units attribute is unreadable AND misleading; the real justification is the root-group
    // history attribute, which is compact-stored. If that ever stops being recorded, the manifest
    // no longer explains why we multiply by days.
    expect(manifest.globalAttributes.history ?? '').toContain('moda');
  });

  it('identifies the raw file it came from, which is deliberately NOT committed', () => {
    expect(manifest.rawFile.sizeBytes).toBeGreaterThan(0);
    expect(manifest.rawFile.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.rawFile.md5).toMatch(/^[0-9a-f]{32}$/);
    expect(series.rawFileSha256).toBe(manifest.rawFile.sha256);
  });

  it('records the licence and the verbatim attribution the licence requires', () => {
    expect(manifest.licence).toBe('CC-BY-4.0');
    expect(manifest.requiredAttribution).toContain('Copernicus Climate Change Service');
    expect(manifest.doi).toBe('10.24381/cds.68d2bb30');
  });

  it('contains no CDS key material and no `PRIVATE-TOKEN` header anywhere', () => {
    const serialised = JSON.stringify({ manifest, series });
    expect(serialised).not.toContain('PRIVATE-TOKEN');
    expect(serialised.toLowerCase()).not.toContain('api_key');
  });
});
