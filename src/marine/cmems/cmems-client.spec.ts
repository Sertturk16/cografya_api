import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CircuitBreaker } from '../../upstream/circuit-breaker';
import { OperationDeadline } from '../../upstream/operation-deadline';
import { ProviderBudget } from '../../upstream/provider-budget';
import { UpstreamHttpClient } from '../../upstream/upstream-http.client';
import { UpstreamMetrics } from '../../upstream/upstream-metrics';
import { MARINE_PROVIDER_BUDGETS } from '../marine-upstream.config';
import { CmemsClient } from './cmems-client';

/**
 * The adapter through the REAL shared HTTP client with a stubbed fetch — the guard order
 * (status → content type → parse) is the thing under test, and only the real client carries it.
 *
 * The 400 body is the RECORDED provider fixture (`test/fixtures/cmems/…`), not a synthetic:
 * the XML-error path is a measured contract (out-of-extent `time=` today, a retired dataset id
 * tomorrow) and the fixture is the evidence.
 */

const FIXTURE_400 = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    '..',
    'test',
    'fixtures',
    'cmems',
    'getfeatureinfo-400-time-out-of-range.xml',
  ),
  'utf8',
);

/** The measured GetFeatureInfo 200 body (Trabzon VHM0, 2026-08-02). */
const MEASURED_200 = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [41.1000000670716, 39.725] },
      properties: {
        lat: 41.1000000670716,
        lon: 39.725,
        variableId: 'VHM0',
        datasetId: 'BLKSEA_ANALYSISFORECAST_WAV_007_003/cmems_mod_blk_wav_anfc_2.5km_PT1H-i_202411',
        value: 0.3764597177505493,
        units: 'm',
      },
    },
  ],
});

function response(body: string, status: number, contentType: string): Response {
  return new Response(body, { status, headers: { 'content-type': contentType } });
}

describe('CmemsClient', () => {
  let metrics: UpstreamMetrics;
  let nowMs: number;

  function build(fetchImpl: typeof fetch): CmemsClient {
    const breaker = new CircuitBreaker(metrics, {
      failureThreshold: 3,
      openMs: 10_000,
      now: () => nowMs,
    });
    const budget = new ProviderBudget(metrics, null, () => nowMs);
    const http = new UpstreamHttpClient(metrics, budget, breaker, {
      singleCallTimeoutMs: 6_000,
      userAgent: 'TestBot/1.0',
      fetchImpl,
      sleepImpl: () => Promise.resolve(),
      now: () => nowMs,
    });
    return new CmemsClient(http, {
      wmtsBaseUrl: 'https://wmts.marine.copernicus.eu/teroWmts',
      stacBaseUrl: 'https://stac.marine.copernicus.eu/metadata',
      limits: MARINE_PROVIDER_BUDGETS.cmems,
      singleCallTimeoutMs: 6_000,
    });
  }

  function fetchValue(client: CmemsClient) {
    return client.fetchPointValue({
      field: 'waveHeight',
      latitude: 41.1,
      longitude: 39.72,
      datasetPath: 'BLKSEA_ANALYSISFORECAST_WAV_007_003/cmems_mod_blk_wav_anfc_2.5km_PT1H-i_202411',
      maxGridDistanceKm: 2.1,
      timeIso: '2026-08-02T14:00:00Z',
      validAtMs: Date.parse('2026-08-02T14:00:00Z'),
      deadline: new OperationDeadline(6_000),
    });
  }

  beforeEach(() => {
    metrics = new UpstreamMetrics();
    jest.spyOn(metrics, 'event').mockImplementation(() => undefined);
    nowMs = Date.parse('2026-08-02T14:03:00.000Z');
  });

  it('classifies the RECORDED 400-XML reply as client_error BEFORE any body parse', async () => {
    const fetchImpl = jest.fn<typeof fetch>(() =>
      Promise.resolve(response(FIXTURE_400, 400, 'text/xml; charset=utf-8')),
    );
    const outcome = await fetchValue(build(fetchImpl));

    // `client_error`, NOT `schema_error`: had the XML reached the JSON parse, the thrown
    // UpstreamSchemaError would have surfaced as schema_error — the kind itself proves the
    // status guard ran first. This is the retired-dataset signature the M4b self-heal keys on.
    expect(outcome.kind).toBe('client_error');
    if (outcome.kind !== 'client_error') return;
    expect(outcome.reason).toContain('ExceptionReport');
    // No retry for a 4xx: the same request would produce the same refusal.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses HTTP 200 with a NON-JSON content type before parsing (guard order)', async () => {
    const fetchImpl = jest.fn<typeof fetch>(() =>
      Promise.resolve(response(FIXTURE_400, 200, 'text/xml; charset=utf-8')),
    );
    const outcome = await fetchValue(build(fetchImpl));

    expect(outcome.kind).toBe('schema_error');
    if (outcome.kind !== 'schema_error') return;
    // The reason names the content-type check, not a JSON.parse failure: the body never
    // reached the parser.
    expect(outcome.reason).toContain('content-type');
  });

  it('parses the measured 200 body into a normalised point value', async () => {
    const fetchImpl = jest.fn<typeof fetch>(() =>
      Promise.resolve(response(MEASURED_200, 200, 'application/json;charset=UTF-8')),
    );
    const outcome = await fetchValue(build(fetchImpl));

    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.value.unit).toBe('m');
    expect(outcome.value.validAtUtc).toBe('2026-08-02T14:00:00Z');
    expect(outcome.value.distanceKm).toBeLessThanOrEqual(2.1);

    // The request itself: explicit time, the resolved dataset path, honest UA.
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    if (typeof url !== 'string') throw new Error('expected the client to fetch a string URL');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('time')).toBe('2026-08-02T14:00:00Z');
    expect(parsed.searchParams.get('layer')).toContain('BLKSEA_ANALYSISFORECAST_WAV_007_003/');
    expect(((init as RequestInit).headers as Record<string, string>)['User-Agent']).toBe(
      'TestBot/1.0',
    );
  });

  it('resolves a product STAC document, isolating selector misses per selection', async () => {
    const doc = JSON.stringify({
      id: 'BLKSEA_ANALYSISFORECAST_PHY_007_001',
      license: 'proprietary',
      'sci:doi': '10.48670/mds-00355',
      extent: { temporal: { interval: [['2021-01-01T00:00:00Z', '2026-08-10T00:00:00Z']] } },
      properties: { admp_updated: '2026-08-01T11:06:46Z' },
      links: [
        {
          rel: 'license',
          href: 'https://marine.copernicus.eu/user-corner/service-commitments-and-licence',
        },
        { rel: 'item', href: 'cmems_mod_blk_phy-temp_anfc_2.5km_PT1H-m_202511/dataset.stac.json' },
      ],
    });
    const fetchImpl = jest.fn<typeof fetch>(() =>
      Promise.resolve(response(doc, 200, 'application/json')),
    );
    const client = build(fetchImpl);

    const outcome = await client.fetchProductResolution({
      productId: 'BLKSEA_ANALYSISFORECAST_PHY_007_001',
      selectors: [
        {
          key: 'blksea/2.5km',
          selector: {
            productId: 'BLKSEA_ANALYSISFORECAST_PHY_007_001',
            acceptedVariableTokens: ['phy-tem', 'phy-temp'],
            gridToken: '2.5km',
          },
        },
        {
          key: 'blksea/mrm-500m',
          selector: {
            productId: 'BLKSEA_ANALYSISFORECAST_PHY_007_001',
            acceptedVariableTokens: ['phy-tem', 'phy-temp'],
            gridToken: 'mrm-500m',
          },
        },
      ],
      deadline: new OperationDeadline(6_000),
    });

    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    const stacUrl = fetchImpl.mock.calls[0]?.[0];
    expect(stacUrl).toBe(
      'https://stac.marine.copernicus.eu/metadata/BLKSEA_ANALYSISFORECAST_PHY_007_001/product.stac.json',
    );
    const [hit, miss] = outcome.value.selections;
    expect(hit?.selection.datasetId).toBe('cmems_mod_blk_phy-temp_anfc_2.5km_PT1H-m_202511');
    expect(miss?.selection.datasetId).toBeNull();
  });

  it('surfaces a malformed STAC document as schema_error (alarm class)', async () => {
    const fetchImpl = jest.fn<typeof fetch>(() =>
      Promise.resolve(response('{"links": 12}', 200, 'application/json')),
    );
    const outcome = await build(fetchImpl).fetchProductResolution({
      productId: 'BLKSEA_ANALYSISFORECAST_PHY_007_001',
      selectors: [],
      deadline: new OperationDeadline(6_000),
    });
    expect(outcome.kind).toBe('schema_error');
  });
});
