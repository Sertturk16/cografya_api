import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ClimateNormals } from '../../province/province.types';
import type { Era5Manifest, Era5SeriesArtifact } from './era5-artifact.types';
import {
  ANNUAL_CROSS_CHECK_TOLERANCE,
  assertEra5LoadIsSafe,
  Era5LoadError,
  type Era5LoadAssertionInput,
} from './era5-load-assertions';
import { computeEra5Normals } from './era5-normals';

/**
 * A BREAKING TEST FOR EVERY GATE.
 *
 * The gate is exercised against the REAL committed artifacts, then broken one way at a time. That
 * ordering matters: the happy case proves the gate lets the actual production data through (a
 * gate that rejects the only input it will ever see is worse than no gate), and each mutation
 * proves the gate is not merely present but LOAD-BEARING. Testing that an assertion exists is
 * cheap; testing that it shouts when broken is the part that has ever caught anything.
 *
 * Structure only: no test here asserts what any province's temperature or rainfall IS.
 */

const DATA_DIR = join(__dirname, '..', '..', '..', 'data', 'era5-land');

function readManifest(): Era5Manifest {
  return JSON.parse(readFileSync(join(DATA_DIR, 'era5-manifest.json'), 'utf8')) as Era5Manifest;
}
function readSeries(): Era5SeriesArtifact {
  return JSON.parse(
    readFileSync(join(DATA_DIR, 'era5-province-series.json'), 'utf8'),
  ) as Era5SeriesArtifact;
}

/** A fresh, independent input built from the committed artifacts — every test may mutate freely. */
function buildInput(): Era5LoadAssertionInput {
  const manifest = readManifest();
  const series = readSeries();
  const { normalsByPlateCode, annualChecks } = computeEra5Normals(series);
  return { manifest, series, normalsByPlateCode, annualChecks };
}

/** The gate reads a `ReadonlyMap`; tests that need to edit it take a mutable copy. */
function mutableNormals(input: Era5LoadAssertionInput): Map<string, ClimateNormals> {
  return new Map(
    [...input.normalsByPlateCode].map(([code, normals]) => [
      code,
      { ...normals, months: normals.months.map((month) => ({ ...month })) },
    ]),
  );
}

describe('assertEra5LoadIsSafe — the committed artifacts', () => {
  it('PASSES against the real committed pair (the data a deploy would load)', () => {
    expect(() => {
      assertEra5LoadIsSafe(buildInput());
    }).not.toThrow();
  });

  it('agrees with the manifest far more tightly than the tolerance allows', () => {
    // The tolerance is only defensible if it is orders of magnitude above the observed noise AND
    // orders below a real defect. This pins the first half against the actual data, so a future
    // change that quietly degrades the derivation's precision fails here rather than being
    // absorbed by a generous constant.
    const { manifest, annualChecks } = buildInput();
    const recorded = new Map(manifest.provinces.map((province) => [province.plateCode, province]));
    let worst = 0;
    for (const check of annualChecks) {
      const province = recorded.get(check.plateCode);
      if (province === undefined) throw new Error(`no manifest record for ${check.plateCode}`);
      worst = Math.max(
        worst,
        Math.abs(check.annualMeanTempC - province.annualMeanTempC),
        Math.abs(check.annualTotalPrecipitationMm - province.annualTotalPrecipitationMm),
      );
    }
    expect(annualChecks).toHaveLength(81);
    expect(worst).toBeLessThan(ANNUAL_CROSS_CHECK_TOLERANCE / 1_000);
  });
});

describe('assertEra5LoadIsSafe — every gate, broken', () => {
  it('THROWS when the two artifacts describe different raw files', () => {
    const input = buildInput();
    input.series = { ...input.series, rawFileSha256: 'b'.repeat(64) };
    expect(() => {
      assertEra5LoadIsSafe(input);
    }).toThrow(Era5LoadError);
    expect(() => {
      assertEra5LoadIsSafe(input);
    }).toThrow(/different runs/);
  });

  it('THROWS when the manifest records a FAILED assertion', () => {
    const input = buildInput();
    const first = input.manifest.assertions[0];
    if (first === undefined) throw new Error('fixture');
    input.manifest = {
      ...input.manifest,
      assertions: [{ ...first, passed: false }, ...input.manifest.assertions.slice(1)],
    };
    expect(() => {
      assertEra5LoadIsSafe(input);
    }).toThrow(/FAILED assertion/);
  });

  it('THROWS when the manifest records no assertions at all', () => {
    const input = buildInput();
    input.manifest = { ...input.manifest, assertions: [] };
    expect(() => {
      assertEra5LoadIsSafe(input);
    }).toThrow(/records no structural assertions/);
  });

  it('THROWS when a province is missing from the derived set (80 of 81)', () => {
    const input = buildInput();
    const normals = mutableNormals(input);
    normals.delete('34');
    input.normalsByPlateCode = normals;
    input.annualChecks = input.annualChecks.filter((check) => check.plateCode !== '34');
    expect(() => {
      assertEra5LoadIsSafe(input);
    }).toThrow(/coverage disagrees/);
  });

  it('THROWS when the manifest and the series cover different provinces', () => {
    const input = buildInput();
    input.manifest = {
      ...input.manifest,
      provinces: input.manifest.provinces.slice(0, 80),
    };
    expect(() => {
      assertEra5LoadIsSafe(input);
    }).toThrow(/coverage disagrees/);
  });

  it('THROWS when the declared A-1 fallback set changes', () => {
    // A sixth province silently reading a neighbouring cell is exactly the drift the ruling
    // forbids, and the fetch phase's own check cannot protect the write path from a hand edit.
    const input = buildInput();
    input.manifest = {
      ...input.manifest,
      fallbackPlateCodes: [...input.manifest.fallbackPlateCodes, '35'],
    };
    expect(() => {
      assertEra5LoadIsSafe(input);
    }).toThrow(/closed expected set/);
  });

  it('THROWS when the calendar is not the 1991-2020 window', () => {
    const input = buildInput();
    input.series = { ...input.series, monthCount: 359 };
    expect(() => {
      assertEra5LoadIsSafe(input);
    }).toThrow(/published normal window/);
  });

  it('THROWS when a derived document has 11 months', () => {
    const input = buildInput();
    const normals = mutableNormals(input);
    const istanbul = normals.get('34');
    if (istanbul === undefined) throw new Error('fixture');
    normals.set('34', { ...istanbul, months: istanbul.months.slice(0, 11) });
    input.normalsByPlateCode = normals;
    expect(() => {
      assertEra5LoadIsSafe(input);
    }).toThrow(/11 months, expected 12/);
  });

  it('THROWS when a document carries a key the contract does not declare', () => {
    const input = buildInput();
    const normals = mutableNormals(input);
    const istanbul = normals.get('34');
    if (istanbul === undefined) throw new Error('fixture');
    (istanbul as unknown as Record<string, unknown>).rainyDays = 3;
    input.normalsByPlateCode = normals;
    expect(() => {
      assertEra5LoadIsSafe(input);
    }).toThrow(/unknown key\(s\) "rainyDays"/);
  });

  it('THROWS when a document names a sourceUrl other than the ERA5-Land dataset page', () => {
    const input = buildInput();
    const normals = mutableNormals(input);
    const istanbul = normals.get('34');
    if (istanbul === undefined) throw new Error('fixture');
    normals.set('34', { ...istanbul, sourceUrl: 'https://example.invalid/other' });
    input.normalsByPlateCode = normals;
    expect(() => {
      assertEra5LoadIsSafe(input);
    }).toThrow(/expected the ERA5-Land dataset page/);
  });

  it('THROWS when a document declares a different normal window', () => {
    const input = buildInput();
    const normals = mutableNormals(input);
    const istanbul = normals.get('34');
    if (istanbul === undefined) throw new Error('fixture');
    normals.set('34', { ...istanbul, periodStartYear: 1961, periodEndYear: 1990 });
    input.normalsByPlateCode = normals;
    expect(() => {
      assertEra5LoadIsSafe(input);
    }).toThrow(/not the requested WMO window/);
  });

  it('THROWS on a monthly temperature outside the physical band (a unit error, not weather)', () => {
    const input = buildInput();
    const normals = mutableNormals(input);
    const istanbul = normals.get('34');
    const january = istanbul?.months[0];
    if (january === undefined) throw new Error('fixture');
    // 279 °C is the Kelvin conversion having been skipped.
    january.tempMeanC = 279.15;
    input.normalsByPlateCode = normals;
    expect(() => {
      assertEra5LoadIsSafe(input);
    }).toThrow(/outside the physical band/);
  });

  it('THROWS on a monthly precipitation outside the physical band', () => {
    const input = buildInput();
    const normals = mutableNormals(input);
    const istanbul = normals.get('34');
    const january = istanbul?.months[0];
    if (january === undefined) throw new Error('fixture');
    january.precipitationMm = 44_000;
    input.normalsByPlateCode = normals;
    expect(() => {
      assertEra5LoadIsSafe(input);
    }).toThrow(/outside the physical band/);
  });

  it('THROWS when the re-derived annual figures disagree with the manifest — THE fidelity gate', () => {
    // The check that would catch a grouping, averaging or ordering bug. Broken here by an amount
    // (0.001 °C) far smaller than any such bug would produce, so passing this proves the gate is
    // tight rather than merely present.
    const input = buildInput();
    input.annualChecks = input.annualChecks.map((check) =>
      check.plateCode === '34'
        ? { ...check, annualMeanTempC: check.annualMeanTempC + 0.001 }
        : check,
    );
    expect(() => {
      assertEra5LoadIsSafe(input);
    }).toThrow(/re-derived from the 12 published normals disagree/);
  });

  it('TOLERATES a disagreement below the tolerance (the gate is not hair-trigger)', () => {
    const input = buildInput();
    input.annualChecks = input.annualChecks.map((check) =>
      check.plateCode === '34'
        ? { ...check, annualMeanTempC: check.annualMeanTempC + ANNUAL_CROSS_CHECK_TOLERANCE / 10 }
        : check,
    );
    expect(() => {
      assertEra5LoadIsSafe(input);
    }).not.toThrow();
  });

  it('THROWS when the cross-check rows do not cover every derived document', () => {
    const input = buildInput();
    input.annualChecks = input.annualChecks.slice(0, 80);
    expect(() => {
      assertEra5LoadIsSafe(input);
    }).toThrow(/did not report on everything it produced/);
  });

  it('THROWS when a cross-check row names a province the manifest has no cell record for', () => {
    // Row COUNT stays 81 so this reaches the cross-check's own lookup guard rather than the
    // count guard above it — the two failures are different defects and must not share a message.
    const input = buildInput();
    input.annualChecks = input.annualChecks.map((check) =>
      check.plateCode === '34' ? { ...check, plateCode: '99' } : check,
    );
    expect(() => {
      assertEra5LoadIsSafe(input);
    }).toThrow(/no manifest cell record/);
  });

  it('THROWS when the annual-total DISTRIBUTION leaves the magnitude band (a wrong tp factor)', () => {
    // Named by distribution, never by province: a ×1000 multiplier error moves every province by
    // three orders of magnitude, and this is what notices. Broken by scaling one province's whole
    // year — which is enough, because the band checks the extremes of the spread.
    const input = buildInput();
    const normals = mutableNormals(input);
    const target = normals.get('34');
    if (target === undefined) throw new Error('fixture');
    // Stay inside the per-month band (≤2 000 mm) while pushing the annual total past 5 000.
    for (const month of target.months) month.precipitationMm = 500;
    input.normalsByPlateCode = normals;
    // Keep the cross-check happy so this test isolates the regime gate.
    input.annualChecks = input.annualChecks.map((check) => ({ ...check }));
    expect(() => {
      assertEra5LoadIsSafe(input);
    }).toThrow(/magnitude band/);
  });
});
