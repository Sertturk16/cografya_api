import { describe, expect, it } from '@jest/globals';
import { UpstreamSchemaError } from '../../upstream/upstream.types';
import { MarineUnit } from '../marine.types';
import { parseCmemsGetFeatureInfo, type ParseCmemsOptions } from './cmems-response';
import { buildCmemsGetFeatureInfoUrl } from './cmems-url';

/**
 * The parse layer's contract, pinned against the MEASURED response shape (Trabzon,
 * 2026-08-02): unit normalisation, the plausibility windows, the snap guard, and the
 * lat/lon-vs-geometry trap.
 */

const OPTIONS: ParseCmemsOptions = {
  field: 'waveHeight',
  requestedLatitude: 41.1,
  requestedLongitude: 39.72,
  maxGridDistanceKm: 2.1,
  timeIso: '2026-08-02T14:00:00Z',
  validAtMs: Date.parse('2026-08-02T14:00:00Z'),
};

/** The measured body shape — including the REVERSED [lat, lon] geometry trap, verbatim. */
function measuredBody(overrides: Partial<Record<string, unknown>> = {}): string {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        // The provider emits geometry.coordinates as [latitude, longitude] — the REVERSE of
        // GeoJSON. Present in the fixture precisely so a regression that starts reading it
        // produces loud test failures (the values differ from properties.lat/lon order).
        geometry: { type: 'Point', coordinates: [41.1000000670716, 39.725] },
        properties: {
          lat: 41.1000000670716,
          lon: 39.725,
          variableId: 'VHM0',
          datasetId:
            'BLKSEA_ANALYSISFORECAST_WAV_007_003/cmems_mod_blk_wav_anfc_2.5km_PT1H-i_202411',
          value: 0.3764597177505493,
          units: 'm',
          ...overrides,
        },
      },
    ],
  });
}

describe('parseCmemsGetFeatureInfo', () => {
  it('parses the measured body: normalised unit, snapped grid centre, echoed dataset id', () => {
    const result = parseCmemsGetFeatureInfo(measuredBody(), OPTIONS);
    if (result.kind !== 'ok') throw new Error(`expected ok, got ${result.kind}`);

    expect(result.value.value).toBeCloseTo(0.3764597177505493, 12);
    expect(result.value.unit).toBe(MarineUnit.Meter);
    expect(result.value.datasetId).toMatch(/^BLKSEA_ANALYSISFORECAST_WAV_007_003\//);
    // The coordinates come from properties.lat/lon, never geometry.
    expect(result.value.gridLatitude).toBeCloseTo(41.1000000670716, 12);
    expect(result.value.gridLongitude).toBeCloseTo(39.725, 12);
    // ~0.42 km for this snap; the assertion is the ceiling, not the number (structure rule).
    expect(result.value.distanceKm).toBeGreaterThan(0);
    expect(result.value.distanceKm).toBeLessThanOrEqual(OPTIONS.maxGridDistanceKm);
    // validAtUtc is BY DEFINITION the time we sent (the reply has no time field).
    expect(result.value.validAtUtc).toBe(OPTIONS.timeIso);
    expect(result.validAtMs).toBe(OPTIONS.validAtMs);
  });

  it('reads null value as no_data — the land-mask answer, quiet by design', () => {
    const result = parseCmemsGetFeatureInfo(measuredBody({ value: null }), OPTIONS);
    expect(result.kind).toBe('no_data');
  });

  it('refuses a unit drift LOUDLY — the number would still look plausible', () => {
    for (const units of ['cm', 'M', 'metre', '°C', '']) {
      expect(() => parseCmemsGetFeatureInfo(measuredBody({ units }), OPTIONS)).toThrow(
        UpstreamSchemaError,
      );
    }
  });

  it('refuses a reply about a different variable than asked', () => {
    expect(() => parseCmemsGetFeatureInfo(measuredBody({ variableId: 'VMDR' }), OPTIONS)).toThrow(
      /echoed variable/,
    );
  });

  it('enforces the plausibility windows, with the direction bound EXCLUSIVE at 360', () => {
    // Wave height outside [0, 30].
    expect(() => parseCmemsGetFeatureInfo(measuredBody({ value: -0.1 }), OPTIONS)).toThrow(
      /plausibility/,
    );
    expect(() => parseCmemsGetFeatureInfo(measuredBody({ value: 30.5 }), OPTIONS)).toThrow(
      /plausibility/,
    );
    // The boundary itself passes (structure: inclusive max for magnitudes).
    expect(parseCmemsGetFeatureInfo(measuredBody({ value: 30 }), OPTIONS).kind).toBe('ok');

    // Direction: [0, 360) — 360 is the classic wrap bug.
    const directionOptions: ParseCmemsOptions = { ...OPTIONS, field: 'waveDirection' };
    const directionBody = (value: number): string =>
      measuredBody({ variableId: 'VMDR', units: 'degree', value });
    expect(parseCmemsGetFeatureInfo(directionBody(359.9), directionOptions).kind).toBe('ok');
    expect(() => parseCmemsGetFeatureInfo(directionBody(360), directionOptions)).toThrow(
      /plausibility/,
    );

    // SST: [-5, 45] on its own field/unit.
    const sstOptions: ParseCmemsOptions = { ...OPTIONS, field: 'seaSurfaceTemperature' };
    const sstBody = (value: number): string =>
      measuredBody({ variableId: 'thetao', units: 'degrees_C', value });
    expect(parseCmemsGetFeatureInfo(sstBody(24.6), sstOptions).kind).toBe('ok');
    expect(() => parseCmemsGetFeatureInfo(sstBody(46), sstOptions)).toThrow(/plausibility/);
    expect(() => parseCmemsGetFeatureInfo(sstBody(-6), sstOptions)).toThrow(/plausibility/);
  });

  it('refuses a snap beyond the basin ceiling — the wrong-cell alarm', () => {
    // A grid centre ~5.5 km away from the requested point (0.05° of latitude).
    expect(() =>
      parseCmemsGetFeatureInfo(measuredBody({ lat: 41.15, lon: 39.72 }), OPTIONS),
    ).toThrow(/tile arithmetic/);
  });

  it('refuses bodies that are not the promised shape', () => {
    expect(() => parseCmemsGetFeatureInfo('<xml/>', OPTIONS)).toThrow(UpstreamSchemaError);
    expect(() => parseCmemsGetFeatureInfo('{"features": []}', OPTIONS)).toThrow(
      UpstreamSchemaError,
    );
    expect(() =>
      parseCmemsGetFeatureInfo('{"features": [{"properties": {"lat": "x"}}]}', OPTIONS),
    ).toThrow(UpstreamSchemaError);
  });
});

describe('buildCmemsGetFeatureInfoUrl', () => {
  it('builds the M1 probe request shape plus the ALWAYS-explicit time', () => {
    const url = new URL(
      buildCmemsGetFeatureInfoUrl({
        wmtsBaseUrl: 'https://wmts.marine.copernicus.eu/teroWmts',
        datasetPath:
          'BLKSEA_ANALYSISFORECAST_WAV_007_003/cmems_mod_blk_wav_anfc_2.5km_PT1H-i_202411',
        field: 'waveHeight',
        latitude: 41.1,
        longitude: 39.72,
        timeIso: '2026-08-02T14:00:00Z',
      }),
    );

    expect(url.searchParams.get('request')).toBe('GetFeatureInfo');
    expect(url.searchParams.get('tilematrixset')).toBe('EPSG:3857');
    expect(url.searchParams.get('TileMatrix')).toBe('12');
    expect(url.searchParams.get('layer')).toBe(
      'BLKSEA_ANALYSISFORECAST_WAV_007_003/cmems_mod_blk_wav_anfc_2.5km_PT1H-i_202411/VHM0',
    );
    expect(url.searchParams.get('infoformat')).toBe('application/json');
    // The one M4 addition over M1: an explicit time, never defaulted.
    expect(url.searchParams.get('time')).toBe('2026-08-02T14:00:00Z');
    // The tile address must be the shared arithmetic's output (measured: 2499/1534 @ 236/48).
    expect(url.searchParams.get('TileCol')).toBe('2499');
    expect(url.searchParams.get('TileRow')).toBe('1534');
    expect(url.searchParams.get('I')).toBe('236');
    expect(url.searchParams.get('J')).toBe('48');
  });
});
