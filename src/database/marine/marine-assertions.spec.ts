import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MarineLayerId, SeaBasin } from '../../marine/marine.types';
import { MARINE_ARTIFACT_SOURCE } from './marine-artifact.types';
import type {
  CmemsProbeResult,
  MarineProbeEntry,
  MarinePointsProbeArtifact,
} from './marine-artifact.types';
import {
  assertArtifactMatchesCandidates,
  assertProbeVerdictsAreSound,
  deriveLayerSupport,
  evaluateProbeAssertions,
  evaluateRunAssertions,
} from './marine-assertions';
import {
  BASIN_CMEMS_ROUTING,
  COAST_LABELS,
  MARINE_POINT_CANDIDATES,
  MARMARA_CROSS_CHECK_LAYER,
} from './marine-candidates';

/**
 * STRUCTURAL unit tests for the probe acceptance criteria.
 *
 * Every fixture here is SYNTHETIC. Nothing asserts that a real point has a real temperature —
 * that is what the committed artifact and its live probe run are for (CONVENTIONS §2:
 * fact-checking is a separate process, never hardcoded into a test assertion).
 *
 * What IS asserted is that each criterion fires on the failure it was written for. That matters
 * because the criteria are the only thing standing between "a coordinate was typed" and "a
 * province is bound to a sea": if `a3-wave-pair` silently stopped firing, nothing downstream
 * would notice.
 */

function cmemsResult(overrides: Partial<CmemsProbeResult> = {}): CmemsProbeResult {
  return {
    requestUrl: 'https://example.invalid/teroWmts?request=GetFeatureInfo',
    httpStatus: 200,
    contentType: 'application/json',
    responseSha256: 'a'.repeat(64),
    requestedDatasetId: BASIN_CMEMS_ROUTING[SeaBasin.BlackSea].seaSurfaceTemperature.datasetId,
    requestedVariableId: 'thetao',
    datasetId: BASIN_CMEMS_ROUTING[SeaBasin.BlackSea].seaSurfaceTemperature.datasetId,
    variableId: 'thetao',
    value: 22,
    units: 'degrees_C',
    gridLatitude: 42.15,
    gridLongitude: 35.15,
    distanceKm: 0.4,
    ...overrides,
  };
}

/**
 * The Black Sea wave routing, proven non-null at the point of use.
 *
 * A function rather than a narrowed module constant: TypeScript will not carry a top-level
 * null-narrowing into a hoisted function body, and a `!` assertion would hide the very case
 * this repo refuses to hide.
 */
function blackSeaWave(): NonNullable<(typeof BASIN_CMEMS_ROUTING)[SeaBasin.BlackSea]['wave']> {
  const wave = BASIN_CMEMS_ROUTING[SeaBasin.BlackSea].wave;
  if (wave === null) throw new Error('the Black Sea routing must carry a wave dataset');
  return wave;
}

function blackSeaEntry(overrides: Partial<MarineProbeEntry> = {}): MarineProbeEntry {
  const entry: MarineProbeEntry = {
    slugTr: 'test-aciklari',
    slugEn: 'test-offshore',
    nameTr: 'Test Açıkları',
    nameEn: 'Test Offshore',
    coastLabelTr: 'Karadeniz açıkları',
    coastLabelEn: 'Black Sea offshore',
    plateCode: '57',
    provinceNameTr: 'Sinop',
    seaBasin: SeaBasin.BlackSea,
    latitude: 42.15,
    longitude: 35.15,
    displayOrder: 1,
    probedAtUtc: '2026-07-30T12:00:00.000Z',
    cmems: {
      seaSurfaceTemperature: cmemsResult(),
      waveHeight: cmemsResult({
        requestedDatasetId: blackSeaWave().height.datasetId,
        datasetId: blackSeaWave().height.datasetId,
        requestedVariableId: 'VHM0',
        variableId: 'VHM0',
        value: 0.5,
        units: 'm',
      }),
      waveDirection: cmemsResult({
        requestedDatasetId: blackSeaWave().direction.datasetId,
        datasetId: blackSeaWave().direction.datasetId,
        requestedVariableId: 'VMDR',
        variableId: 'VMDR',
        value: 5.2,
        units: 'degree',
      }),
      crossCheck: null,
    },
    openMeteo: {
      gridLatitude: 42.2083,
      gridLongitude: 35.125,
      distanceKm: 6.8,
      windGridLatitude: 42.15,
      windGridLongitude: 35.15,
      windDistanceKm: 0.4,
      validAtUtc: '2026-07-30T00:00:00Z',
      windSpeed10m: 3.1,
      windDirection10m: 190,
      waveHeight: 0.42,
      waveDirection: 188,
      seaSurfaceTemperature: 24.1,
      units: { wind_speed_10m: 'm/s' },
    },
    support: [],
    assertions: [],
    ...overrides,
  };
  return entry;
}

function marmaraEntry(overrides: Partial<MarineProbeEntry> = {}): MarineProbeEntry {
  const marmaraDataset = BASIN_CMEMS_ROUTING[SeaBasin.Marmara].seaSurfaceTemperature.datasetId;
  return blackSeaEntry({
    slugTr: 'marmara-aciklari',
    slugEn: 'marmara-offshore',
    coastLabelTr: 'Marmara açıkları',
    coastLabelEn: 'Marmara offshore',
    plateCode: '34',
    provinceNameTr: 'İstanbul',
    seaBasin: SeaBasin.Marmara,
    latitude: 40.85,
    longitude: 28.8,
    cmems: {
      seaSurfaceTemperature: cmemsResult({
        requestedDatasetId: marmaraDataset,
        datasetId: marmaraDataset,
        value: 23.5,
        gridLatitude: 40.85,
        gridLongitude: 28.8,
        distanceKm: 0.1,
      }),
      waveHeight: null,
      waveDirection: null,
      crossCheck: cmemsResult({
        requestedDatasetId: MARMARA_CROSS_CHECK_LAYER.datasetId,
        datasetId: MARMARA_CROSS_CHECK_LAYER.datasetId,
        requestedVariableId: 'VHM0',
        variableId: 'VHM0',
        value: null,
        units: 'm',
        gridLatitude: 40.85,
        gridLongitude: 28.8,
        distanceKm: 0.1,
      }),
    },
    openMeteo: {
      gridLatitude: 40.875,
      gridLongitude: 28.7917,
      distanceKm: 2.9,
      windGridLatitude: 40.85,
      windGridLongitude: 28.8,
      windDistanceKm: 0.2,
      validAtUtc: '2026-07-30T00:00:00Z',
      windSpeed10m: 4.4,
      windDirection10m: 30,
      waveHeight: 0.1,
      waveDirection: 40,
      seaSurfaceTemperature: 25.2,
      units: {},
    },
    ...overrides,
  });
}

/** Ids of the assertions that did NOT pass — the whole surface these tests care about. */
function failedIds(entry: MarineProbeEntry): string[] {
  return evaluateProbeAssertions(entry)
    .filter((result) => !result.passed)
    .map((result) => result.id);
}

describe('evaluateProbeAssertions — the happy paths', () => {
  it('passes every criterion for a well-placed Black Sea point', () => {
    expect(failedIds(blackSeaEntry())).toEqual([]);
  });

  it('passes for a Marmara point, where the CMEMS wave field is legitimately absent', () => {
    expect(failedIds(marmaraEntry())).toEqual([]);
  });
});

describe('(a1) sea surface temperature', () => {
  it('fails when the provider returned null — the land-cell case', () => {
    const entry = blackSeaEntry();
    entry.cmems.seaSurfaceTemperature = cmemsResult({ value: null });
    expect(failedIds(entry)).toContain('a1-sst-present');
  });

  it('fails on a physically implausible temperature, not just on null', () => {
    // 45 °C is a valid number and a valid JSON response. Only a range check catches it, and
    // without one it would be published as a sea temperature.
    const entry = blackSeaEntry();
    entry.cmems.seaSurfaceTemperature = cmemsResult({ value: 45 });
    expect(failedIds(entry)).toContain('a1-sst-present');
  });

  it('fails when the provider answered with its XML error path instead of JSON', () => {
    // CMEMS returns HTTP 400 + text/xml for a malformed request. Treating that as "no value
    // here" would turn OUR bad request into a claim about the sea.
    const entry = blackSeaEntry();
    entry.cmems.seaSurfaceTemperature = cmemsResult({
      httpStatus: 400,
      contentType: 'text/xml;charset=UTF-8',
      value: null,
      datasetId: null,
      gridLatitude: null,
      gridLongitude: null,
      distanceKm: null,
    });
    expect(failedIds(entry)).toContain('a1-sst-transport');
  });

  it('fails a 200 that is not JSON, even with a plausible body', () => {
    const entry = blackSeaEntry();
    entry.cmems.seaSurfaceTemperature = cmemsResult({ contentType: 'text/html' });
    expect(failedIds(entry)).toContain('a1-sst-transport');
  });
});

describe('(a2/a3) the wave pair', () => {
  it('fails when height is present but direction is null', () => {
    // The two variables then disagree about whether this cell is water, which is an
    // arithmetic/provider fault rather than a legitimate gap.
    const entry = blackSeaEntry();
    entry.cmems.waveDirection = cmemsResult({
      requestedDatasetId: blackSeaWave().direction.datasetId,
      datasetId: blackSeaWave().direction.datasetId,
      variableId: 'VMDR',
      value: null,
    });
    expect(failedIds(entry)).toContain('a3-wave-pair');
  });

  it('fails when a wave-bearing basin skipped the wave calls entirely', () => {
    const entry = blackSeaEntry();
    entry.cmems.waveHeight = null;
    expect(failedIds(entry)).toContain('a3-wave-pair');
  });

  it('fails when a Marmara point queried a wave field it must not have', () => {
    // A wave value in the Marmara means the query went to a dataset that does not cover it —
    // the declaration of `not_supported` would then be false.
    const entry = marmaraEntry();
    entry.cmems.waveHeight = cmemsResult({ value: 0.3, units: 'm' });
    expect(failedIds(entry)).toContain('a2-wave-not-supported');
  });
});

describe('(a4/a5) wind', () => {
  it('fails when wind speed is missing', () => {
    const entry = blackSeaEntry();
    entry.openMeteo = { ...entry.openMeteo, windSpeed10m: null };
    expect(failedIds(entry)).toContain('a4-wind-speed-present');
  });

  it('fails when wind direction is missing even though speed is present', () => {
    // Precisely the case a single "the provider answered" tick would have hidden.
    const entry = blackSeaEntry();
    entry.openMeteo = { ...entry.openMeteo, windDirection10m: null };
    const failed = failedIds(entry);
    expect(failed).toContain('a5-wind-direction-present');
    expect(failed).not.toContain('a4-wind-speed-present');
  });
});

describe('(b) grid-centre distance thresholds', () => {
  it('fails a CMEMS snap beyond the product ceiling', () => {
    const entry = blackSeaEntry();
    entry.cmems.seaSurfaceTemperature = cmemsResult({ distanceKm: 9 });
    expect(failedIds(entry)).toContain('b1-sst-distance');
  });

  it('applies a TIGHTER ceiling to the 500 m Marmara model than to the 2.5 km Black Sea one', () => {
    // Same distance, different verdict — the thresholds are per product, not global.
    const distanceKm = 1.5;

    const blackSea = blackSeaEntry();
    blackSea.cmems.seaSurfaceTemperature = cmemsResult({ distanceKm });
    expect(failedIds(blackSea)).not.toContain('b1-sst-distance');

    const marmara = marmaraEntry();
    marmara.cmems.seaSurfaceTemperature = {
      ...marmara.cmems.seaSurfaceTemperature,
      distanceKm,
    };
    expect(failedIds(marmara)).toContain('b1-sst-distance');
  });

  it('fails an Open-Meteo snap beyond the wet-search allowance', () => {
    const entry = blackSeaEntry();
    entry.openMeteo = { ...entry.openMeteo, distanceKm: 25 };
    expect(failedIds(entry)).toContain('b3-open-meteo-distance');
  });

  it('accepts an Open-Meteo snap that the old in-cell ceiling would have rejected', () => {
    // Guards the recorded deviation: Open-Meteo searches for the nearest WET cell (up to two
    // 1/12° steps away), so a 14 km snap at a point CMEMS reads cleanly is normal, not a defect.
    const entry = blackSeaEntry();
    entry.openMeteo = { ...entry.openMeteo, distanceKm: 14.5 };
    expect(failedIds(entry)).not.toContain('b3-open-meteo-distance');
  });

  it('fails when there is no grid centre at all to measure against', () => {
    const entry = blackSeaEntry();
    entry.cmems.seaSurfaceTemperature = cmemsResult({
      gridLatitude: null,
      gridLongitude: null,
      distanceKm: null,
    });
    const failed = failedIds(entry);
    expect(failed).toContain('b1-sst-distance');
    expect(failed).toContain('c1-basin-box');
  });
});

describe('(c) the basin claims', () => {
  it('fails when the provider echoed a different dataset than we asked for', () => {
    const entry = blackSeaEntry();
    entry.cmems.seaSurfaceTemperature = cmemsResult({ datasetId: 'SOME_OTHER_PRODUCT/dataset' });
    expect(failedIds(entry)).toContain('c2-sst-dataset');
  });

  it('checks the SNAPPED centre against the basin box, not our requested coordinate', () => {
    // The requested coordinate is what we typed; the snapped centre is where the provider
    // actually read from, and only the second can reveal a drift.
    const entry = blackSeaEntry();
    entry.cmems.seaSurfaceTemperature = cmemsResult({
      gridLatitude: 36.6,
      gridLongitude: 30.7,
    });
    expect(failedIds(entry)).toContain('c1-basin-box');
  });

  it('fails a Marmara point whose cross-check returned a Black Sea wave VALUE', () => {
    // The strongest single piece of evidence in the whole probe: the Black Sea wave product's
    // box contains the Marmara but its land mask excludes it, so a number here means the point
    // has drifted out of the Marmara.
    const entry = marmaraEntry();
    entry.cmems.crossCheck = cmemsResult({
      requestedDatasetId: MARMARA_CROSS_CHECK_LAYER.datasetId,
      datasetId: MARMARA_CROSS_CHECK_LAYER.datasetId,
      variableId: 'VHM0',
      value: 0.9,
      units: 'm',
      gridLatitude: 40.85,
      gridLongitude: 28.8,
      distanceKm: 0.1,
    });
    expect(failedIds(entry)).toContain('c3-marmara-cross-check');
  });

  it('fails a Marmara point whose cross-check was never made', () => {
    const entry = marmaraEntry();
    entry.cmems.crossCheck = null;
    expect(failedIds(entry)).toContain('c3-marmara-cross-check');
  });

  it('fails a non-Marmara point that carries a cross-check it has no business having', () => {
    const entry = blackSeaEntry();
    entry.cmems.crossCheck = cmemsResult({ value: null });
    expect(failedIds(entry)).toContain('c3-marmara-cross-check');
  });
});

describe('evaluateRunAssertions', () => {
  function ids(entries: MarineProbeEntry[]): string[] {
    return evaluateRunAssertions(entries)
      .filter((result) => !result.passed)
      .map((result) => result.id);
  }

  it('passes a clean two-sea pair', () => {
    const black = blackSeaEntry({ plateCode: '34', slugTr: 'a-tr', slugEn: 'a-en' });
    const marmara = marmaraEntry({ slugTr: 'b-tr', slugEn: 'b-en' });
    expect(ids([black, marmara])).toEqual([]);
  });

  it('catches a duplicate slug', () => {
    const first = blackSeaEntry();
    const second = marmaraEntry({ slugTr: first.slugTr });
    expect(ids([first, second])).toContain('run-unique-slugs');
  });

  it('catches two points of the same province in the SAME basin', () => {
    // Mirrors UNIQUE (province_plate_code, sea_basin) so the artifact fails before the database
    // does, naming the pair rather than a constraint code.
    const first = blackSeaEntry();
    const second = blackSeaEntry({ slugTr: 'other-tr', slugEn: 'other-en' });
    expect(ids([first, second])).toContain('run-unique-province-basin');
  });

  it('catches two-sea points that are too close to be in different seas', () => {
    const black = blackSeaEntry({ plateCode: '34', slugTr: 'a-tr', slugEn: 'a-en' });
    const marmara = marmaraEntry({
      slugTr: 'b-tr',
      slugEn: 'b-en',
      latitude: black.latitude + 0.05,
      longitude: black.longitude,
    });
    expect(ids([black, marmara])).toContain('c4-two-sea-separation');
  });
});

describe('deriveLayerSupport', () => {
  it('derives CMEMS wave as UNSUPPORTED in the Marmara, with Open-Meteo carrying it instead', () => {
    const support = deriveLayerSupport(marmaraEntry());
    const cmemsWave = support.find(
      (row) =>
        row.layerId === MarineLayerId.WaveHeight && row.source === MARINE_ARTIFACT_SOURCE.cmems,
    );
    const openMeteoWave = support.find(
      (row) =>
        row.layerId === MarineLayerId.WaveHeight && row.source === MARINE_ARTIFACT_SOURCE.openMeteo,
    );
    expect(cmemsWave?.supported).toBe(false);
    expect(openMeteoWave?.supported).toBe(true);
  });

  it('derives CMEMS wave as supported where the provider actually returned a value', () => {
    const support = deriveLayerSupport(blackSeaEntry());
    const cmemsWave = support.find(
      (row) =>
        row.layerId === MarineLayerId.WaveHeight && row.source === MARINE_ARTIFACT_SOURCE.cmems,
    );
    expect(cmemsWave?.supported).toBe(true);
  });

  it('never reports wind as CMEMS-supported — CMEMS is an ocean service', () => {
    const support = deriveLayerSupport(blackSeaEntry());
    expect(
      support.some(
        (row) =>
          row.layerId === MarineLayerId.WindSpeed10m && row.source === MARINE_ARTIFACT_SOURCE.cmems,
      ),
    ).toBe(false);
  });
});

describe('assertProbeVerdictsAreSound', () => {
  function artifact(entries: MarineProbeEntry[]): MarinePointsProbeArtifact {
    return {
      generatedAtUtc: '2026-07-30T12:00:00.000Z',
      userAgent: 'test',
      cmems: {
        endpoint: 'https://example.invalid/teroWmts',
        tileMatrixSet: 'EPSG:3857',
        zoom: 12,
        timeParam: null,
      },
      openMeteo: {
        forecastEndpoint: 'https://example.invalid/forecast',
        marineEndpoint: 'https://example.invalid/marine',
        windSpeedUnit: 'ms',
        requests: [],
      },
      entries,
    };
  }

  /** Seal a fixture the way the probe does: derive the support matrix AND the verdicts. */
  function sealed(entry: MarineProbeEntry): MarineProbeEntry {
    return {
      ...entry,
      support: deriveLayerSupport(entry),
      assertions: evaluateProbeAssertions(entry),
    };
  }

  it('accepts an artifact whose recorded verdicts match a re-derivation', () => {
    expect(() => {
      assertProbeVerdictsAreSound(artifact([sealed(blackSeaEntry()), sealed(marmaraEntry())]));
    }).not.toThrow();
  });

  it('refuses an empty artifact rather than seeding nothing quietly', () => {
    expect(() => {
      assertProbeVerdictsAreSound(artifact([]));
    }).toThrow(/no points/);
  });

  it('refuses an artifact whose recorded verdict was FLIPPED by hand', () => {
    // The core anti-tamper property: the `assertions` array is a claim inside the file being
    // validated, so it is re-derived rather than believed. Editing `passed` to true does not
    // make a land-cell point loadable.
    const entry = blackSeaEntry();
    entry.cmems.seaSurfaceTemperature = cmemsResult({ value: null });
    const tampered = sealed(entry);
    tampered.assertions = tampered.assertions.map((result) => ({ ...result, passed: true }));

    expect(() => {
      assertProbeVerdictsAreSound(artifact([tampered]));
    }).toThrow(/do not match a re-derivation/);
  });

  it('refuses an artifact whose recorded assertion list is INCOMPLETE', () => {
    const entry = sealed(blackSeaEntry());
    entry.assertions = entry.assertions.slice(0, 2);
    expect(() => {
      assertProbeVerdictsAreSound(artifact([entry]));
    }).toThrow(/absent from the recorded assertions/);
  });

  it('refuses an artifact that honestly records a failure', () => {
    const entry = blackSeaEntry();
    entry.openMeteo = { ...entry.openMeteo, windDirection10m: null };
    expect(() => {
      assertProbeVerdictsAreSound(artifact([sealed(entry)]));
    }).toThrow(/assertion\(s\) FAILED/);
  });
});

describe('assertArtifactMatchesCandidates', () => {
  /**
   * The staleness gate, exercised against the REAL committed artifact.
   *
   * Structural, not factual: it asserts that the file on disk describes the candidate table in
   * the same commit — never that a coordinate is correct. Without this gate the two-phase split
   * has a hole that defeats its own purpose: edit a coordinate, forget to re-probe, and `load`
   * seeds the old artifact with every assertion still passing.
   */
  const committed = JSON.parse(
    readFileSync(
      join(__dirname, '..', '..', '..', 'data', 'marine', 'marine-points-probe.json'),
      'utf8',
    ),
  ) as MarinePointsProbeArtifact;

  it('accepts the committed artifact — it was probed from the current candidate table', () => {
    expect(() => {
      assertArtifactMatchesCandidates(committed);
    }).not.toThrow();
    expect(committed.entries).toHaveLength(MARINE_POINT_CANDIDATES.length);
  });

  it('rejects an artifact whose coordinate no longer matches the candidate table', () => {
    const stale = JSON.parse(JSON.stringify(committed)) as MarinePointsProbeArtifact;
    const first = stale.entries[0];
    if (first === undefined) throw new Error('the committed artifact has no entries');
    first.latitude += 0.5;

    expect(() => {
      assertArtifactMatchesCandidates(stale);
    }).toThrow(/STALE/);
  });

  it('rejects an artifact with the wrong number of points', () => {
    const stale = JSON.parse(JSON.stringify(committed)) as MarinePointsProbeArtifact;
    stale.entries.pop();
    expect(() => {
      assertArtifactMatchesCandidates(stale);
    }).toThrow(/STALE/);
  });

  it('rejects a REORDERED artifact — display order is the array index', () => {
    const stale = JSON.parse(JSON.stringify(committed)) as MarinePointsProbeArtifact;
    const [first, second] = [stale.entries[0], stale.entries[1]];
    if (first === undefined || second === undefined) throw new Error('too few entries');
    stale.entries[0] = second;
    stale.entries[1] = first;

    expect(() => {
      assertArtifactMatchesCandidates(stale);
    }).toThrow(/STALE/);
  });
});

describe('(c2) dataset routing is re-derived against the code, not just echoed', () => {
  /**
   * The gap this closes: comparing `datasetId` to `requestedDatasetId` compares two fields that
   * both live inside the artifact, so it can never detect that the evidence was gathered against
   * a dataset the code no longer routes to. `marine-candidates.ts` pins those ids and records
   * that they retire — so this is the failure the pinning itself predicts.
   */
  it('fails when the artifact was probed against a dataset this basin no longer routes to', () => {
    const entry = blackSeaEntry();
    const stalePin =
      'BLKSEA_ANALYSISFORECAST_PHY_007_001/cmems_mod_blk_phy-temp_anfc_2.5km_PT1H-m_209901';
    // Internally consistent — requested and echoed agree, exactly as a real old run would look.
    entry.cmems.seaSurfaceTemperature = cmemsResult({
      requestedDatasetId: stalePin,
      datasetId: stalePin,
    });
    expect(failedIds(entry)).toContain('c2-sst-dataset');
  });

  it('fails a Marmara point certified against the BLACK SEA temperature model', () => {
    // The copy-paste this assertion is really for: the addendum says a Marmara point answering
    // from the 2.5 km Black Sea model "has drifted into the Black Sea model".
    const entry = marmaraEntry();
    const blackSeaTemp = BASIN_CMEMS_ROUTING[SeaBasin.BlackSea].seaSurfaceTemperature.datasetId;
    entry.cmems.seaSurfaceTemperature = cmemsResult({
      requestedDatasetId: blackSeaTemp,
      datasetId: blackSeaTemp,
      gridLatitude: 40.85,
      gridLongitude: 28.8,
      distanceKm: 0.1,
      value: 23.5,
    });
    expect(failedIds(entry)).toContain('c2-sst-dataset');
  });

  it('fails when the provider echoed a different VARIABLE than we asked for', () => {
    const entry = blackSeaEntry();
    entry.cmems.seaSurfaceTemperature = cmemsResult({ variableId: 'so' });
    expect(failedIds(entry)).toContain('c2-sst-dataset');
  });
});

describe('(b4) the wind grid has its own distance evidence', () => {
  it('fails a wind snap beyond the ceiling even when the marine snap is fine', () => {
    // Wind comes from a DIFFERENT endpoint on a DIFFERENT grid, and it is the only source of
    // both wind layers — guarding only the marine grid left them with no distance evidence.
    const entry = blackSeaEntry();
    entry.openMeteo = { ...entry.openMeteo, windDistanceKm: 40 };
    const failed = failedIds(entry);
    expect(failed).toContain('b4-open-meteo-wind-distance');
    expect(failed).not.toContain('b3-open-meteo-distance');
  });
});

describe('run-coordinate-scale', () => {
  function runFailures(entries: MarineProbeEntry[]): string[] {
    return evaluateRunAssertions(entries)
      .filter((result) => !result.passed)
      .map((result) => result.id);
  }

  it('accepts coordinates that fit numeric(9,6) exactly', () => {
    expect(runFailures([blackSeaEntry()])).not.toContain('run-coordinate-scale');
  });

  it('rejects a coordinate with more decimals than the column can store', () => {
    // Postgres rounds it on write, so it never compares equal on read-back and every subsequent
    // load reports `updated` — silently bumping updated_at, which feeds dateModified and the
    // sitemap lastmod. Without this the symptom is an unexplained `updated=30`.
    const entry = blackSeaEntry({ latitude: 42.1234567 });
    expect(runFailures([entry])).toContain('run-coordinate-scale');
  });
});

describe('the support matrix is re-derived, not trusted', () => {
  it('refuses an artifact whose recorded support matrix was hand-edited', () => {
    // `support` is what the M4 runtime reads to decide `not_supported` and to SKIP a provider
    // call, so a flipped flag would silently retire a layer at a point that actually serves it.
    const entry = blackSeaEntry();
    const sealed = {
      ...entry,
      support: deriveLayerSupport(entry).map((row) => ({ ...row, supported: false })),
      assertions: evaluateProbeAssertions(entry),
    };

    expect(() => {
      assertProbeVerdictsAreSound({
        generatedAtUtc: '2026-07-30T12:00:00.000Z',
        userAgent: 'test',
        cmems: {
          endpoint: 'https://example.invalid/teroWmts',
          tileMatrixSet: 'EPSG:3857',
          zoom: 12,
          timeParam: null,
        },
        openMeteo: {
          forecastEndpoint: 'https://example.invalid/forecast',
          marineEndpoint: 'https://example.invalid/marine',
          windSpeedUnit: 'ms',
          requests: [],
        },
        entries: [sealed],
      });
    }).toThrow(/support matrix does not match a re-derivation/);
  });
});

describe('the staleness gate covers the coast labels', () => {
  const committed = JSON.parse(
    readFileSync(
      join(__dirname, '..', '..', '..', 'data', 'marine', 'marine-points-probe.json'),
      'utf8',
    ),
  ) as MarinePointsProbeArtifact;

  it('rejects an artifact whose coast label no longer matches COAST_LABELS', () => {
    // The hole the review found: coastLabel is a LOADED COLUMN that was outside both gates, so a
    // wording fix in COAST_LABELS shipped the old text forever with everything green.
    const stale = JSON.parse(JSON.stringify(committed)) as MarinePointsProbeArtifact;
    const first = stale.entries[0];
    if (first === undefined) throw new Error('the committed artifact has no entries');
    first.coastLabelTr = 'eski metin';

    expect(() => {
      assertArtifactMatchesCandidates(stale);
    }).toThrow(/STALE/);
  });

  it('rejects a drifted EN label too, not only the TR one', () => {
    const stale = JSON.parse(JSON.stringify(committed)) as MarinePointsProbeArtifact;
    const first = stale.entries[0];
    if (first === undefined) throw new Error('the committed artifact has no entries');
    first.coastLabelEn = 'stale text';

    expect(() => {
      assertArtifactMatchesCandidates(stale);
    }).toThrow(/STALE/);
  });

  it('holds every committed coast label equal to the live COAST_LABELS value', () => {
    for (const candidate of MARINE_POINT_CANDIDATES) {
      expect(candidate.coastLabelTr).toBe(COAST_LABELS[candidate.seaBasin].tr);
      expect(candidate.coastLabelEn).toBe(COAST_LABELS[candidate.seaBasin].en);
    }
  });
});
