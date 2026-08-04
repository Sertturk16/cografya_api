import { describe, expect, it, jest } from '@jest/globals';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SeaBasin } from '../../marine/marine.types';
import type { MarinePointsProbeArtifact } from './marine-artifact.types';
import { BASIN_CMEMS_ROUTING, MARINE_POINT_CANDIDATES } from './marine-candidates';
import {
  buildCmemsUrl,
  parseCmemsProperties,
  parseOpenMeteoLocations,
  runProbePhase,
  toUtcInstant,
} from './probe-marine-points';

/**
 * Unit tests for the `probe` phase, against SYNTHETIC responses only — no network, no timers.
 *
 * The sibling precedent is `src/database/era5/era5-fetch.spec.ts`: the network-touching CLI
 * entry point stays untested (it is run by hand), but the parsing, the request construction and
 * the retry/breaker/completeness logic are exercised through the `fetchImpl`/`sleepImpl`/`nowImpl`
 * seams whose JSDoc says "Injected for tests". This PR built those seams and, until this file,
 * never used them.
 *
 * Why it matters more here than the coverage number suggests: `--phase=probe` runs by hand,
 * roughly yearly. A defect introduced today surfaces a year from now, in front of a human with
 * no CI signal to lean on. Two of the land-mines are named in the source itself — the provider's
 * REVERSED `geometry.coordinates`, and the tile/pixel arithmetic the grid-distance ceiling exists
 * to police.
 */

const CMEMS_OK_BODY = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      // DELIBERATELY reversed relative to GeoJSON, exactly as the provider emits it.
      geometry: { type: 'Point', coordinates: [42.15, 35.15] },
      properties: {
        lat: 42.15,
        lon: 35.15,
        variableId: 'thetao',
        datasetId:
          'BLKSEA_ANALYSISFORECAST_PHY_007_001/cmems_mod_blk_phy-temp_anfc_2.5km_PT1H-m_202511',
        value: 24.6,
        units: 'degrees_C',
      },
    },
  ],
});

const CMEMS_XML_ERROR_BODY =
  '<?xml version="1.0"?><ExceptionReport><Exception exceptionCode="InvalidParameterValue" ' +
  'locator="time">Invalid time coord</Exception></ExceptionReport>';

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('buildCmemsUrl', () => {
  it('builds a WMTS GetFeatureInfo request with the layer, tile and pixel we computed', () => {
    const layer = BASIN_CMEMS_ROUTING[SeaBasin.BlackSea].seaSurfaceTemperature;
    const url = new URL(buildCmemsUrl(42.15, 35.15, layer));
    const params = url.searchParams;

    expect(params.get('request')).toBe('GetFeatureInfo');
    expect(params.get('layer')).toBe(`${layer.datasetId}/${layer.variableId}`);
    expect(params.get('infoformat')).toBe('application/json');
    expect(params.get('tilematrixset')).toBe('EPSG:3857');

    // Zoom must stay >= 10: SPEC v1 §3.1 measured the SAME coordinate returning null at zoom 6
    // and a real temperature at zoom 8, because a low-zoom pixel covers enough ground to land on
    // land. This is the single most consequential constant in the file.
    expect(Number(params.get('TileMatrix'))).toBeGreaterThanOrEqual(10);

    for (const key of ['TileRow', 'TileCol', 'I', 'J']) {
      const value = Number(params.get(key));
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(Number(params.get('I'))).toBeLessThan(256);
    expect(Number(params.get('J'))).toBeLessThan(256);
  });

  it('moves the tile/pixel address when the coordinate moves — the arithmetic is live', () => {
    const layer = BASIN_CMEMS_ROUTING[SeaBasin.BlackSea].seaSurfaceTemperature;
    const north = new URL(buildCmemsUrl(42.15, 35.15, layer)).searchParams;
    const south = new URL(buildCmemsUrl(41.15, 35.15, layer)).searchParams;
    // Southward means a LARGER tile row — the axis inversion that is easiest to get backwards.
    expect(Number(south.get('TileRow'))).toBeGreaterThan(Number(north.get('TileRow')));
  });
});

describe('parseCmemsProperties', () => {
  it('reads properties.lat/lon and NEVER geometry.coordinates', () => {
    // The provider emits `geometry.coordinates` as [lat, lon] — the REVERSE of the GeoJSON
    // standard. Anything consuming it as GeoJSON places every Turkish point in the Indian Ocean,
    // silently, because both numbers are valid coordinates. This test pins the field choice so a
    // future "fix" toward the standard fails here instead of in production a year later.
    const parsed = parseCmemsProperties(CMEMS_OK_BODY);
    expect(parsed.lat).toBe(42.15);
    expect(parsed.lon).toBe(35.15);
    expect(parsed.value).toBe(24.6);
    expect(parsed.units).toBe('degrees_C');
    expect(parsed.variableId).toBe('thetao');
  });

  it('returns nulls for a legitimate land-cell response rather than throwing', () => {
    const body = JSON.stringify({
      features: [
        {
          properties: {
            lat: null,
            lon: null,
            variableId: 'VHM0',
            datasetId: 'X/y',
            value: null,
            units: 'm',
          },
        },
      ],
    });
    const parsed = parseCmemsProperties(body);
    expect(parsed.value).toBeNull();
    expect(parsed.lat).toBeNull();
    expect(parsed.datasetId).toBe('X/y');
  });

  it('throws on a response carrying no feature properties at all', () => {
    expect(() => parseCmemsProperties(JSON.stringify({ features: [] }))).toThrow(
      /no feature properties/,
    );
  });

  it('treats a non-finite value as absent rather than publishing NaN', () => {
    const body = JSON.stringify({
      features: [{ properties: { lat: 1, lon: 2, value: 'not-a-number', units: 'm' } }],
    });
    expect(parseCmemsProperties(body).value).toBeNull();
  });
});

describe('parseOpenMeteoLocations', () => {
  const block = { latitude: 42.2, longitude: 35.1, hourly: { time: ['2026-07-30T00:00'] } };

  it('accepts the ARRAY form the provider returns for several coordinates', () => {
    const parsed = parseOpenMeteoLocations(JSON.stringify([block, block]), 2);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.latitude).toBe(42.2);
  });

  it('accepts the BARE-OBJECT form it returns for exactly one coordinate', () => {
    // Handled so the code cannot break if the candidate list ever shrinks to a single point.
    expect(parseOpenMeteoLocations(JSON.stringify(block), 1)).toHaveLength(1);
  });

  it('refuses a response whose block count does not match the coordinates we sent', () => {
    // The batched response is aligned to the candidate list BY INDEX. A count mismatch means that
    // alignment is invalid, and silently zipping them would attach every point's wind to the
    // wrong place — a wrong number that looks completely plausible.
    expect(() => parseOpenMeteoLocations(JSON.stringify([block]), 2)).toThrow(/cannot be aligned/);
  });

  it('refuses a block with no hourly object', () => {
    expect(() =>
      parseOpenMeteoLocations(JSON.stringify([{ latitude: 1, longitude: 2 }]), 1),
    ).toThrow(/no `hourly` object/);
  });
});

describe('toUtcInstant', () => {
  it('stamps a zone onto the provider’s zone-less timestamp', () => {
    // We request timezone=UTC and the provider answers `2026-07-30T00:00` — no designator. Stored
    // verbatim in a field typed "ISO-8601 UTC", that is evidence a later reader parses as local
    // time without noticing.
    expect(toUtcInstant('2026-07-30T00:00')).toBe('2026-07-30T00:00:00Z');
    expect(toUtcInstant('2026-07-30T00:00:00')).toBe('2026-07-30T00:00:00Z');
  });

  it('leaves an already-zoned timestamp untouched', () => {
    expect(toUtcInstant('2026-07-30T00:00:00Z')).toBe('2026-07-30T00:00:00Z');
    expect(toUtcInstant('2026-07-30T03:00:00+03:00')).toBe('2026-07-30T03:00:00+03:00');
  });

  it('returns an unrecognised shape verbatim instead of inventing a designator', () => {
    expect(toUtcInstant('whenever')).toBe('whenever');
    expect(toUtcInstant(null)).toBeNull();
  });
});

describe('runProbePhase — retry, circuit breaker and the completeness gate', () => {
  const noSleep = (): Promise<void> => Promise.resolve();
  const fixedClock = (): Date => new Date('2026-07-30T12:00:00.000Z');

  /** Open-Meteo answers first, for all candidates, in two batched calls. */
  function openMeteoBody(count: number, endpoint: 'forecast' | 'marine'): string {
    const hourly =
      endpoint === 'forecast'
        ? { time: ['2026-07-30T00:00'], wind_speed_10m: [3.1], wind_direction_10m: [180] }
        : {
            time: ['2026-07-30T00:00'],
            wave_height: [0.4],
            wave_direction: [180],
            sea_surface_temperature: [24.1],
          };
    return JSON.stringify(
      MARINE_POINT_CANDIDATES.slice(0, count).map((candidate) => ({
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        hourly,
        hourly_units: { wind_speed_10m: 'm/s' },
      })),
    );
  }

  function makeFetch(cmemsResponder: (url: string, call: number) => Response): typeof fetch {
    let cmemsCalls = 0;
    // The probe only ever passes a string URL, so narrowing to `string` keeps the stub honest
    // instead of stringifying a `Request` object into `[object Object]`.
    return jest.fn((input: string): Promise<Response> => {
      const url = input;
      if (url.includes('api.open-meteo.com')) {
        return Promise.resolve(
          jsonResponse(openMeteoBody(MARINE_POINT_CANDIDATES.length, 'forecast')),
        );
      }
      if (url.includes('marine-api.open-meteo.com')) {
        return Promise.resolve(
          jsonResponse(openMeteoBody(MARINE_POINT_CANDIDATES.length, 'marine')),
        );
      }
      cmemsCalls += 1;
      return Promise.resolve(cmemsResponder(url, cmemsCalls));
    }) as unknown as typeof fetch;
  }

  it('ABORTS once enough consecutive candidates are refused by the provider', async () => {
    // The scenario the module's own docblock names — a pinned dataset id retires and CMEMS answers
    // every call with a clean HTTP 400 + XML. Before this, the breaker only counted transport
    // exceptions, so a 400 storm reset the counter on every "successful" iteration and the run
    // hammered the provider through all 30 candidates.
    const outputDir = await mkdtemp(join(tmpdir(), 'marine-probe-'));
    const fetchImpl = makeFetch(
      () =>
        new Response(CMEMS_XML_ERROR_BODY, {
          status: 400,
          headers: { 'content-type': 'text/xml;charset=UTF-8' },
        }),
    );

    await expect(
      runProbePhase({ outputDir, fetchImpl, sleepImpl: noSleep, nowImpl: fixedClock }),
    ).rejects.toThrow(/consecutive candidates were refused/);

    // Stopped early: far fewer CMEMS calls than the ~84 a full run makes.
    const calls = (fetchImpl as unknown as jest.Mock).mock.calls.length;
    expect(calls).toBeLessThan(20);
  });

  it('writes the artifact even when assertions FAIL, then still exits non-zero', async () => {
    // Deliberate: a failed run's evidence is exactly what an operator needs in order to move a
    // coordinate. Throwing before the write would leave them with a console scrollback.
    const outputDir = await mkdtemp(join(tmpdir(), 'marine-probe-'));
    // A well-formed 200 whose value is null everywhere → every point fails `a1-sst-present`, but
    // nothing is a transport failure, so the breaker never trips and the loop completes.
    const nullBody = JSON.stringify({
      features: [
        {
          properties: {
            lat: null,
            lon: null,
            variableId: null,
            datasetId: null,
            value: null,
            units: null,
          },
        },
      ],
    });

    await expect(
      runProbePhase({
        outputDir,
        fetchImpl: makeFetch(() => jsonResponse(nullBody)),
        sleepImpl: noSleep,
        nowImpl: fixedClock,
      }),
    ).rejects.toThrow(/assertion\(s\) FAILED/);

    const artifact = JSON.parse(
      await readFile(join(outputDir, 'marine-points-probe.json'), 'utf8'),
    ) as MarinePointsProbeArtifact;
    expect(artifact.entries).toHaveLength(MARINE_POINT_CANDIDATES.length);
    expect(artifact.entries.some((entry) => entry.assertions.some((a) => !a.passed))).toBe(true);
    // The stamp is taken AFTER the completeness gate, so it is never earlier than a probedAt.
    expect(artifact.generatedAtUtc).toBe('2026-07-30T12:00:00.000Z');
  });

  it('retries a transport failure and carries on when the retry succeeds', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'marine-probe-'));
    let failuresLeft = 2;
    const fetchImpl = makeFetch(() => {
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        throw new Error('socket hang up');
      }
      return jsonResponse(CMEMS_OK_BODY);
    });

    // The run still fails its assertions (the canned body is a Black Sea reply reused for every
    // basin), but it must fail on ASSERTIONS, not on the transport — proving the retry recovered.
    await expect(
      runProbePhase({ outputDir, fetchImpl, sleepImpl: noSleep, nowImpl: fixedClock }),
    ).rejects.toThrow(/assertion\(s\) FAILED/);

    const artifact = JSON.parse(
      await readFile(join(outputDir, 'marine-points-probe.json'), 'utf8'),
    ) as MarinePointsProbeArtifact;
    expect(artifact.entries).toHaveLength(MARINE_POINT_CANDIDATES.length);
  });

  it('reports the number of attempts it ACTUALLY made, not the configured maximum', async () => {
    // A size-cap breach is deterministic, so it breaks out after ONE attempt. The terminal
    // message used to print the constant regardless and told the operator we had tried three
    // times — which sends them looking for a flaky network that was never involved.
    const outputDir = await mkdtemp(join(tmpdir(), 'marine-probe-'));
    const oversized = (): Response =>
      new Response('x', {
        status: 200,
        headers: { 'content-type': 'application/json', 'content-length': '999999999' },
      });

    await expect(
      runProbePhase({
        outputDir,
        fetchImpl: jest.fn(() => Promise.resolve(oversized())),
        sleepImpl: noSleep,
        nowImpl: fixedClock,
      }),
    ).rejects.toThrow(/after 1 attempt\(s\)/);
  });

  it('records the two Open-Meteo calls as covering every candidate in one request each', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'marine-probe-'));
    await expect(
      runProbePhase({
        outputDir,
        fetchImpl: makeFetch(() => jsonResponse(CMEMS_OK_BODY)),
        sleepImpl: noSleep,
        nowImpl: fixedClock,
      }),
    ).rejects.toThrow();

    const artifact = JSON.parse(
      await readFile(join(outputDir, 'marine-points-probe.json'), 'utf8'),
    ) as MarinePointsProbeArtifact;
    expect(artifact.openMeteo.requests).toHaveLength(2);
    for (const record of artifact.openMeteo.requests) {
      expect(record.pointCount).toBe(MARINE_POINT_CANDIDATES.length);
      expect(record.responseSha256).toMatch(/^[0-9a-f]{64}$/);
    }
    // The probe sends no explicit `time`; it is recorded as null rather than left to inference.
    expect(artifact.cmems.timeParam).toBeNull();
    expect(artifact.openMeteo.windSpeedUnit).toBe('ms');
  });
});
