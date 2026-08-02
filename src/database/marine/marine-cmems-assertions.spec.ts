import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { CMEMS_BASIN_ROUTING } from '../../marine/cmems/cmems-routing';
import { SeaBasin } from '../../marine/marine.types';
import { BASIN_CMEMS_ROUTING } from './marine-candidates';
import { evaluateMarineCmemsArtifact } from './marine-cmems-assertions';
import type {
  CmemsLicenceRecord,
  CmemsProbeEntry,
  MarineCmemsProbeArtifact,
} from './marine-cmems-artifact.types';

/**
 * Two jobs, like the M1 assertion spec:
 *  1. **Staleness gate over the COMMITTED artifact** — the evidence in `data/marine/` must
 *     keep passing against current code on every CI run (a threshold or routing change that
 *     invalidates the recorded run must fail loudly here, not silently coexist with it).
 *  2. **The gates themselves must be falsifiable** — mutated copies prove each one can fail.
 *     Structural mutations only; no weather facts (MEMORY rule).
 */

const ARTIFACT_PATH = join(process.cwd(), 'data', 'marine', 'marine-cmems-probe.json');
const FIXTURE_PATH = join(
  process.cwd(),
  'test',
  'fixtures',
  'cmems',
  'getfeatureinfo-400-time-out-of-range.xml',
);

function loadArtifact(): MarineCmemsProbeArtifact {
  return JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8')) as MarineCmemsProbeArtifact;
}

describe('the committed marine-cmems probe artifact', () => {
  it('exists alongside its 400-XML fixture', () => {
    expect(existsSync(ARTIFACT_PATH)).toBe(true);
    expect(existsSync(FIXTURE_PATH)).toBe(true);
    // The fixture body really is the recorded OWS error, not a placeholder.
    expect(readFileSync(FIXTURE_PATH, 'utf8')).toContain('ExceptionReport');
  });

  it('passes EVERY offline acceptance gate against current code', () => {
    const results = evaluateMarineCmemsArtifact(loadArtifact());
    const failures = results.filter((result) => !result.passed);
    expect(failures.map((failure) => `${failure.id}: ${failure.detail}`)).toEqual([]);
    // And the run stored the same verdicts it now reproduces.
    expect(results.length).toBeGreaterThan(0);
  });

  it('records the six licence rows with machine-verified quotes (DEC 2026-07-30k)', () => {
    const artifact = loadArtifact();
    expect(artifact.licence.records).toHaveLength(6);
    for (const record of artifact.licence.records) {
      if (record.negativeEvidence === null) {
        expect(record.quoteVerified).toBe(true);
        expect(record.doi).toMatch(/^10\.48670\//);
      }
    }
  });
});

describe('the gates are falsifiable (mutated copies must fail)', () => {
  function mutateFirstEntry(
    artifact: MarineCmemsProbeArtifact,
    mutate: (entry: CmemsProbeEntry) => CmemsProbeEntry,
  ): MarineCmemsProbeArtifact {
    const [first, ...rest] = artifact.entries;
    if (first === undefined) throw new Error('artifact has no entries');
    return { ...artifact, entries: [mutate(first), ...rest] };
  }

  it('a snap distance over the basin ceiling fails c3', () => {
    const artifact = mutateFirstEntry(loadArtifact(), (entry) => ({
      ...entry,
      seaSurfaceTemperature: {
        ...entry.seaSurfaceTemperature,
        distanceKm: entry.seaSurfaceTemperature.maxGridDistanceKm + 1,
      },
    }));
    const failures = evaluateMarineCmemsArtifact(artifact).filter((result) => !result.passed);
    expect(failures.some((failure) => failure.id.startsWith('c3-snap-'))).toBe(true);
  });

  it('a RECORDED ceiling that drifted from CMEMS_BASIN_ROUTING fails c3 even when the distance is fine (review #81 I1)', () => {
    // The distance stays under both values — only the artifact's recorded ceiling drifts. The
    // gate must judge against CURRENT code, so a code-side ceiling revision without a probe
    // re-run cannot stay green.
    const artifact = mutateFirstEntry(loadArtifact(), (entry) => ({
      ...entry,
      seaSurfaceTemperature: {
        ...entry.seaSurfaceTemperature,
        maxGridDistanceKm: entry.seaSurfaceTemperature.maxGridDistanceKm + 1,
      },
    }));
    const failures = evaluateMarineCmemsArtifact(artifact).filter((result) => !result.passed);
    expect(failures.some((failure) => failure.id.startsWith('c3-snap-'))).toBe(true);
  });

  it('a unit that drifted from CMEMS_UNIT_NORMALISATION fails c4 (review #81 I1)', () => {
    const artifact = mutateFirstEntry(loadArtifact(), (entry) => ({
      ...entry,
      seaSurfaceTemperature: {
        ...entry.seaSurfaceTemperature,
        normalizedUnit: 'kelvin',
      },
    }));
    const failures = evaluateMarineCmemsArtifact(artifact).filter((result) => !result.passed);
    expect(failures.some((failure) => failure.id.startsWith('c4-unit-'))).toBe(true);
  });

  it('a drifted RAW unit fails c4 too — both halves of the normalisation pair are gated (review #81 c4)', () => {
    // The provider-side half: a recorded `degrees_C` mutating to `K` must fail even while the
    // canonical half still reads `celsius` — the gate checks the PAIR, not one member.
    const artifact = mutateFirstEntry(loadArtifact(), (entry) => ({
      ...entry,
      seaSurfaceTemperature: {
        ...entry.seaSurfaceTemperature,
        rawUnits: 'K',
      },
    }));
    const failures = evaluateMarineCmemsArtifact(artifact).filter((result) => !result.passed);
    expect(failures.some((failure) => failure.id.startsWith('c4-unit-'))).toBe(true);
  });

  it('a recorded request URL whose tile address no longer matches toTilePixel fails c8 (review #81 I1)', () => {
    const artifact = mutateFirstEntry(loadArtifact(), (entry) => {
      const url = new URL(entry.seaSurfaceTemperature.requestUrl);
      const recordedRow = Number(url.searchParams.get('TileRow'));
      url.searchParams.set('TileRow', String(recordedRow + 1));
      return {
        ...entry,
        seaSurfaceTemperature: { ...entry.seaSurfaceTemperature, requestUrl: url.toString() },
      };
    });
    const failures = evaluateMarineCmemsArtifact(artifact).filter((result) => !result.passed);
    expect(failures.some((failure) => failure.id.startsWith('c8-request-url-'))).toBe(true);
  });

  it('a missing candidate fails a1', () => {
    const artifact = loadArtifact();
    const truncated = { ...artifact, entries: artifact.entries.slice(1) };
    const failures = evaluateMarineCmemsArtifact(truncated).filter((result) => !result.passed);
    expect(failures.some((failure) => failure.id === 'a1-completeness')).toBe(true);
  });

  it('an UNVERIFIED commercial-use quote fails its licence row — the R5 halt signal', () => {
    const artifact = loadArtifact();
    const records = artifact.licence.records.map((record): CmemsLicenceRecord =>
      record.negativeEvidence === null ? { ...record, quoteVerified: false } : record,
    );
    const failures = evaluateMarineCmemsArtifact({
      ...artifact,
      licence: { ...artifact.licence, records },
    }).filter((result) => !result.passed);
    expect(failures.some((failure) => failure.id.startsWith('a4-licence-row-'))).toBe(true);
  });

  it('a probe that queried Marmara waves fails a2 (the support rule is two-sided)', () => {
    const artifact = loadArtifact();
    const marmara = artifact.entries.find((entry) => entry.seaBasin === SeaBasin.Marmara);
    if (marmara === undefined) throw new Error('artifact holds no Marmara entry');
    const mutated = {
      ...artifact,
      entries: artifact.entries.map((entry) =>
        entry === marmara ? { ...entry, waveHeight: entry.seaSurfaceTemperature } : entry,
      ),
    };
    const failures = evaluateMarineCmemsArtifact(mutated).filter((result) => !result.passed);
    expect(failures.some((failure) => failure.id === `a2-wave-support-${marmara.slugTr}`)).toBe(
      true,
    );
  });

  it('a non-400 fixture fails a5', () => {
    const artifact = loadArtifact();
    const failures = evaluateMarineCmemsArtifact({
      ...artifact,
      xmlErrorFixture: { ...artifact.xmlErrorFixture, httpStatus: 200 },
    }).filter((result) => !result.passed);
    expect(failures.some((failure) => failure.id === 'a5-xml-fixture')).toBe(true);
  });
});

describe('the two CMEMS routing tables agree (review #81 I2)', () => {
  /**
   * The runtime/probe table (`CMEMS_BASIN_ROUTING`, M4a) and the M1 tooling table
   * (`BASIN_CMEMS_ROUTING`) both carry per-basin snap ceilings and the wave-support verdict.
   * Nothing merges them (the M1 table pins full dataset ids — recorded pre-existing debt), so
   * this invariant is what keeps a ceiling revision from certifying evidence against a
   * threshold the runtime rejects, or the inverse.
   */
  it('per-basin snap ceilings, wave support and product families match', () => {
    for (const basin of Object.values(SeaBasin)) {
      const runtime = CMEMS_BASIN_ROUTING[basin];
      const tooling = BASIN_CMEMS_ROUTING[basin];
      expect(tooling.maxGridDistanceKm).toBe(runtime.maxGridDistanceKm);
      expect(tooling.wave === null).toBe(runtime.wave === null);
      expect(
        tooling.seaSurfaceTemperature.datasetId.startsWith(
          `${runtime.seaSurfaceTemperature.productId}/`,
        ),
      ).toBe(true);
      if (tooling.wave !== null && runtime.wave !== null) {
        expect(tooling.wave.height.datasetId.startsWith(`${runtime.wave.productId}/`)).toBe(true);
        expect(tooling.wave.direction.datasetId.startsWith(`${runtime.wave.productId}/`)).toBe(
          true,
        );
      }
    }
  });
});
