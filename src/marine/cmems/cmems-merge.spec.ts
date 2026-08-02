import { describe, expect, it } from '@jest/globals';
import type { CachedRead } from '../../upstream/cache/upstream-cache.service';
import type { UpstreamOutcomeKind } from '../../upstream/upstream.types';
import type { EcmwfCompiledSeries } from '../ecmwf/ecmwf-series-compile';
import type { EcmwfPointSeriesRead } from '../ecmwf/ecmwf-series.reader';
import { MarineFreshness, MarineSource, MarineStatus, MarineUnit } from '../marine.types';
import type { CmemsPointValue } from './cmems-response';
import {
  ecmwfInstantFromSeries,
  marineStatusFromKind,
  nearestStepIndex,
  overviewDataAvailable,
  resolveSst,
  resolveWavePair,
  resolveWindPair,
  seriesSourceDiffersFromInstant,
} from './cmems-merge';

/**
 * The §5 merge rules, table-driven — including the NEGATIVE pair-consistency cases the plan
 * names explicitly ("CMEMS height ok + direction not ok → BOTH from ECMWF").
 */

const NOW_MS = Date.parse('2026-08-02T14:10:00Z');

function cmemsOkRead(
  value: number,
  overrides: Partial<CmemsPointValue> = {},
): CachedRead<CmemsPointValue> {
  return {
    value: {
      value,
      unit: MarineUnit.Meter,
      datasetId: 'BLKSEA_ANALYSISFORECAST_WAV_007_003/cmems_mod_blk_wav_anfc_2.5km_PT1H-i_202411',
      gridLatitude: 41.1000000670716,
      gridLongitude: 39.725,
      distanceKm: 0.4179,
      validAtUtc: '2026-08-02T14:00:00Z',
      ...overrides,
    },
    kind: 'ok',
    freshness: 'fresh',
    cacheAgeSeconds: 12,
    staleSinceUtc: null,
    validAtUtc: '2026-08-02T14:00:00Z',
    fetchedAtUtc: '2026-08-02T14:05:00Z',
    reason: null,
    origin: 'fresh_hit',
  };
}

function cmemsFailedRead(kind: Exclude<UpstreamOutcomeKind, 'ok'>): CachedRead<CmemsPointValue> {
  return {
    value: null,
    kind,
    freshness: null,
    cacheAgeSeconds: 3,
    staleSinceUtc: null,
    validAtUtc: null,
    fetchedAtUtc: '2026-08-02T14:05:00Z',
    reason: 'stubbed failure',
    origin: 'negative_hit',
  };
}

function compiledSeries(overrides: Partial<EcmwfCompiledSeries> = {}): EcmwfCompiledSeries {
  const timesUtc = [
    '2026-08-02T12:00:00.000Z',
    '2026-08-02T15:00:00.000Z',
    '2026-08-02T18:00:00.000Z',
  ];
  return {
    stepHours: 3,
    timesUtc,
    seaSurfaceTemperature: [null, null, null],
    waveHeight: [0.8, 0.9, 1.1],
    waveDirection: [210, 215, 220],
    windSpeed10m: [4.2, 5.1, 6.3],
    windDirection10m: [180, 185, 190],
    source: MarineSource.Ecmwf,
    modelRunAtUtc: '2026-08-02T06:00:00.000Z',
    horizonEndUtc: '2026-08-02T18:00:00.000Z',
    support: { u10: 'ok', v10: 'ok', swh: 'ok', mwd: 'ok' },
    validAtMs: Date.parse('2026-08-02T15:00:00.000Z'),
    ...overrides,
  };
}

function ecmwfOkRead(
  series: EcmwfCompiledSeries = compiledSeries(),
): CachedRead<EcmwfPointSeriesRead> {
  return {
    value: { series, gridLatitude: 41.0, gridLongitude: 39.75, distanceKm: 12.3 },
    kind: 'ok',
    freshness: 'stale',
    cacheAgeSeconds: 4_000,
    staleSinceUtc: '2026-08-02T13:30:00.000Z',
    validAtUtc: '2026-08-02T15:00:00.000Z',
    fetchedAtUtc: '2026-08-02T13:00:00.000Z',
    reason: null,
    origin: 'stale_revalidating',
  };
}

function ecmwfFailedRead(
  kind: Exclude<UpstreamOutcomeKind, 'ok'>,
): CachedRead<EcmwfPointSeriesRead> {
  return {
    value: null,
    kind,
    freshness: null,
    cacheAgeSeconds: 3,
    staleSinceUtc: null,
    validAtUtc: null,
    fetchedAtUtc: '2026-08-02T14:05:00Z',
    reason: 'stubbed failure',
    origin: 'negative_hit',
  };
}

describe('marineStatusFromKind (§7.7 mapping, every kind)', () => {
  it.each([
    ['ok', MarineStatus.Ok],
    ['no_data', MarineStatus.NoData],
    ['transient', MarineStatus.Unavailable],
    ['rate_limited', MarineStatus.Unavailable],
    ['client_error', MarineStatus.Unavailable],
    ['schema_error', MarineStatus.Unavailable],
    ['budget_exhausted', MarineStatus.Unavailable],
  ] as const)('%s → %s', (kind, expected) => {
    expect(marineStatusFromKind(kind)).toBe(expected);
  });
});

describe('cmemsInstant / resolveSst (§5.1)', () => {
  it('publishes an ok CMEMS read with per-field provenance and NO fabricated model run', () => {
    const value = resolveSst(
      cmemsOkRead(24.6, { unit: MarineUnit.Celsius, datasetId: 'P/tem-set' }),
    );
    expect(value).toEqual({
      value: 24.6,
      unit: MarineUnit.Celsius,
      status: MarineStatus.Ok,
      freshness: MarineFreshness.Fresh,
      validAtUtc: '2026-08-02T14:00:00Z',
      fetchedAtUtc: '2026-08-02T14:05:00Z',
      // CMEMS publishes no run time per value — honest null, never fabricated.
      modelRunAtUtc: null,
      staleSinceUtc: null,
      source: MarineSource.Cmems,
      datasetId: 'P/tem-set',
      gridLatitude: 41.1000000670716,
      gridLongitude: 39.725,
      distanceKm: 0.4179,
    });
  });

  it('passes a non-ok status through UNTOUCHED — never fills SST from anywhere', () => {
    // The signature itself has no fallback parameter; this pins the honest-absence shape.
    for (const [kind, status] of [
      ['no_data', MarineStatus.NoData],
      ['transient', MarineStatus.Unavailable],
      ['client_error', MarineStatus.Unavailable],
    ] as const) {
      const value = resolveSst(cmemsFailedRead(kind));
      expect(value.status).toBe(status);
      expect(value.value).toBeNull();
      // §7.7 invariant: freshness null whenever status !== ok; and no provenance for nothing.
      expect(value.freshness).toBeNull();
      expect(value.source).toBeNull();
      expect(value.datasetId).toBeNull();
      // The unit is still published so the slot renders its axis honestly.
      expect(value.unit).toBe(MarineUnit.Celsius);
    }
  });
});

describe('nearestStepIndex / ecmwfInstantFromSeries (§5.4)', () => {
  it('selects the step nearest to now and publishes ITS real time', () => {
    expect(nearestStepIndex(compiledSeries().timesUtc, NOW_MS)).toBe(1);

    const value = ecmwfInstantFromSeries('windSpeed10m', ecmwfOkRead(), NOW_MS);
    expect(value.value).toBe(5.1);
    expect(value.validAtUtc).toBe('2026-08-02T15:00:00.000Z');
    expect(value.modelRunAtUtc).toBe('2026-08-02T06:00:00.000Z');
    expect(value.source).toBe(MarineSource.Ecmwf);
    expect(value.freshness).toBe(MarineFreshness.Stale);
    expect(value.staleSinceUtc).toBe('2026-08-02T13:30:00.000Z');
    // ECMWF carries no per-value dataset id; the cycle is the provenance.
    expect(value.datasetId).toBeNull();
    expect(value.gridLatitude).toBe(41.0);
    expect(value.distanceKm).toBe(12.3);
  });

  it('publishes not_supported when EITHER wind component is masked (pair support)', () => {
    const read = ecmwfOkRead(
      compiledSeries({ support: { u10: 'ok', v10: 'not_supported', swh: 'ok', mwd: 'ok' } }),
    );
    expect(ecmwfInstantFromSeries('windSpeed10m', read, NOW_MS).status).toBe(
      MarineStatus.NotSupported,
    );
    expect(ecmwfInstantFromSeries('windDirection10m', read, NOW_MS).status).toBe(
      MarineStatus.NotSupported,
    );
    // The wave fields do not inherit the wind mask.
    expect(ecmwfInstantFromSeries('waveHeight', read, NOW_MS).status).toBe(MarineStatus.Ok);
  });

  it('publishes no_data for a gap at the nearest step — a gap is a gap, never repaired', () => {
    const read = ecmwfOkRead(compiledSeries({ waveHeight: [0.8, null, 1.1] }));
    const value = ecmwfInstantFromSeries('waveHeight', read, NOW_MS);
    expect(value.status).toBe(MarineStatus.NoData);
    expect(value.value).toBeNull();
  });

  it('maps a failed series read onto an honest absence', () => {
    const value = ecmwfInstantFromSeries('waveHeight', ecmwfFailedRead('transient'), NOW_MS);
    expect(value.status).toBe(MarineStatus.Unavailable);
    expect(value.value).toBeNull();
  });
});

describe('resolveWavePair (§5.2 — the PAIR-consistency rule)', () => {
  const ecmwf = ecmwfOkRead();

  it('serves BOTH halves from CMEMS when both are ok', () => {
    const pair = resolveWavePair({
      cmemsSupport: 'supported',
      cmemsHeight: cmemsOkRead(0.38),
      cmemsDirection: cmemsOkRead(214, { unit: MarineUnit.DegreeTrue }),
      ecmwf,
      nowMs: NOW_MS,
    });
    expect(pair.waveHeight.source).toBe(MarineSource.Cmems);
    expect(pair.waveDirection.source).toBe(MarineSource.Cmems);
    expect(pair.waveHeight.value).toBe(0.38);
    expect(pair.waveDirection.value).toBe(214);
  });

  it.each(['no_data', 'transient', 'client_error', 'schema_error'] as const)(
    'NEGATIVE: CMEMS height ok + direction %s sends BOTH halves to ECMWF',
    (directionKind) => {
      const pair = resolveWavePair({
        cmemsSupport: 'supported',
        cmemsHeight: cmemsOkRead(0.38), // a perfectly good CMEMS height…
        cmemsDirection: cmemsFailedRead(directionKind), // …but its partner failed.
        ecmwf,
        nowMs: NOW_MS,
      });
      // One model's direction over another model's height is the arrow form of silent
      // mixing (K6): the good CMEMS half is DISCARDED and both come from ECMWF.
      expect(pair.waveHeight.source).toBe(MarineSource.Ecmwf);
      expect(pair.waveDirection.source).toBe(MarineSource.Ecmwf);
      expect(pair.waveHeight.value).toBe(0.9);
      expect(pair.waveDirection.value).toBe(215);
    },
  );

  it('NEGATIVE: CMEMS direction ok + height failed ALSO sends both halves to ECMWF', () => {
    const pair = resolveWavePair({
      cmemsSupport: 'supported',
      cmemsHeight: cmemsFailedRead('no_data'),
      cmemsDirection: cmemsOkRead(214, { unit: MarineUnit.DegreeTrue }),
      ecmwf,
      nowMs: NOW_MS,
    });
    expect(pair.waveHeight.source).toBe(MarineSource.Ecmwf);
    expect(pair.waveDirection.source).toBe(MarineSource.Ecmwf);
  });

  it('Marmara (not_supported): publishes the FALLBACK’s own status, never not_supported', () => {
    const pair = resolveWavePair({
      cmemsSupport: 'not_supported',
      cmemsHeight: null,
      cmemsDirection: null,
      ecmwf,
      nowMs: NOW_MS,
    });
    expect(pair.waveHeight.status).toBe(MarineStatus.Ok);
    expect(pair.waveHeight.source).toBe(MarineSource.Ecmwf);
  });

  it('degrades to an honest absence when ECMWF cannot serve either — never approximates', () => {
    const pair = resolveWavePair({
      cmemsSupport: 'not_supported',
      cmemsHeight: null,
      cmemsDirection: null,
      ecmwf: ecmwfFailedRead('transient'),
      nowMs: NOW_MS,
    });
    expect(pair.waveHeight.status).toBe(MarineStatus.Unavailable);
    expect(pair.waveDirection.status).toBe(MarineStatus.Unavailable);
    expect(pair.waveHeight.value).toBeNull();
  });

  it('NEVER mixes sources, across every CMEMS outcome combination (exhaustive table)', () => {
    const kinds: readonly (UpstreamOutcomeKind | 'missing')[] = [
      'ok',
      'no_data',
      'transient',
      'rate_limited',
      'client_error',
      'schema_error',
      'budget_exhausted',
      'missing',
    ];
    for (const heightKind of kinds) {
      for (const directionKind of kinds) {
        const pair = resolveWavePair({
          cmemsSupport: 'supported',
          cmemsHeight:
            heightKind === 'missing'
              ? null
              : heightKind === 'ok'
                ? cmemsOkRead(0.5)
                : cmemsFailedRead(heightKind),
          cmemsDirection:
            directionKind === 'missing'
              ? null
              : directionKind === 'ok'
                ? cmemsOkRead(200, { unit: MarineUnit.DegreeTrue })
                : cmemsFailedRead(directionKind),
          ecmwf,
          nowMs: NOW_MS,
        });
        // The invariant, not the values: both halves always claim the SAME source (or none).
        expect(pair.waveHeight.source).toBe(pair.waveDirection.source);
      }
    }
  });
});

describe('resolveWindPair (§5.3)', () => {
  it('serves both halves from the ECMWF series by construction', () => {
    const pair = resolveWindPair(ecmwfOkRead(), NOW_MS);
    expect(pair.windSpeed10m.value).toBe(5.1);
    expect(pair.windDirection10m.value).toBe(185);
    expect(pair.windSpeed10m.source).toBe(MarineSource.Ecmwf);
    expect(pair.windDirection10m.source).toBe(MarineSource.Ecmwf);
  });
});

describe('seriesSourceDiffersFromInstant (§5.5 / B12)', () => {
  const ecmwfInstant = ecmwfInstantFromSeries('windSpeed10m', ecmwfOkRead(), NOW_MS);
  const cmemsSst = resolveSst(cmemsOkRead(24.6, { unit: MarineUnit.Celsius }));

  it('is false with no series', () => {
    expect(seriesSourceDiffersFromInstant(null, [cmemsSst])).toBe(false);
  });

  it('is false when every ok instant shares the series source', () => {
    expect(seriesSourceDiffersFromInstant(MarineSource.Ecmwf, [ecmwfInstant])).toBe(false);
  });

  it('is true the moment ANY ok instant came from another provider (the CMEMS SST case)', () => {
    expect(seriesSourceDiffersFromInstant(MarineSource.Ecmwf, [ecmwfInstant, cmemsSst])).toBe(true);
  });

  it('ignores non-ok fields — an absent value has no source to differ with', () => {
    const absent = resolveSst(cmemsFailedRead('no_data'));
    expect(seriesSourceDiffersFromInstant(MarineSource.Ecmwf, [ecmwfInstant, absent])).toBe(false);
  });
});

describe('overviewDataAvailable (§5.6)', () => {
  it('is true when any point carries any ok field, false when nothing does', () => {
    const ok = resolveSst(cmemsOkRead(24.6, { unit: MarineUnit.Celsius }));
    const absent = resolveSst(cmemsFailedRead('transient'));
    expect(overviewDataAvailable([[absent], [absent, ok]])).toBe(true);
    expect(overviewDataAvailable([[absent], [absent]])).toBe(false);
    expect(overviewDataAvailable([])).toBe(false);
  });
});
