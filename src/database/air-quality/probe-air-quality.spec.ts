import { describe, expect, it } from '@jest/globals';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildNetcdf3,
  buildZipArchive,
  type FixtureFileSpec,
} from '../../air-quality/cams/netcdf3-fixture.builder';
import { parseAirQualityPhase } from './air-quality.cli';
import {
  AirQualityProbeError,
  assertAllowedDownloadHost,
  buildAdsJsonHeaders,
  buildDownloadHeaders,
  buildFixtureRequestBody,
  buildProductionRequestBody,
  FIXTURE_ARCHIVE_NAME,
  redactAdsSecret,
  runAirQualityProbePhase,
  runDateFor,
} from './probe-air-quality';

/**
 * Probe security + protocol tests (SPEC §14-A1 criterion 5): key redaction, the
 * PRIVATE-TOKEN-free download, the host allowlist, and the artifact's key-free shape — all
 * against a FULLY FAKED ADS (no network anywhere in this suite).
 */

const API_KEY = '01234567-dead-beef-0123-456789abcdef';

describe('parseAirQualityPhase', () => {
  it('accepts only --phase=probe', () => {
    expect(parseAirQualityPhase(['--phase=probe'])).toBe('probe');
    expect(() => parseAirQualityPhase([])).toThrow(/Usage/);
    expect(() => parseAirQualityPhase(['--phase=load'])).toThrow(/Usage/);
  });
});

describe('security helpers', () => {
  it('JSON headers carry PRIVATE-TOKEN; download headers NEVER do', () => {
    expect(buildAdsJsonHeaders(API_KEY)['PRIVATE-TOKEN']).toBe(API_KEY);
    const downloadHeaders = buildDownloadHeaders();
    expect(Object.keys(downloadHeaders)).not.toContain('PRIVATE-TOKEN');
    expect(JSON.stringify(downloadHeaders)).not.toContain(API_KEY);
  });

  it('assertAllowedDownloadHost refuses off-list hosts, http, and garbage', () => {
    expect(
      assertAllowedDownloadHost('https://object-store.os-api.cci2.ecmwf.int:443/bucket/file.zip')
        .hostname,
    ).toBe('object-store.os-api.cci2.ecmwf.int');
    expect(() => assertAllowedDownloadHost('https://evil.example.com/file.zip')).toThrow(
      AirQualityProbeError,
    );
    expect(() =>
      assertAllowedDownloadHost('http://object-store.os-api.cci2.ecmwf.int/file.zip'),
    ).toThrow(/https/);
    expect(() => assertAllowedDownloadHost('not a url')).toThrow(AirQualityProbeError);
  });

  it('redactAdsSecret removes the key in plain and URL-encoded form', () => {
    const body = `{"detail":"token ${API_KEY} rejected","u":"x?k=${encodeURIComponent(API_KEY)}"}`;
    const redacted = redactAdsSecret(body, API_KEY);
    expect(redacted).not.toContain(API_KEY);
    expect(redacted).toContain('[REDACTED]');
  });

  it('runDateFor uses today after 13:00 UTC and yesterday before it (SLA margin)', () => {
    expect(runDateFor(new Date('2026-08-01T14:00:00Z'))).toBe('2026-08-01');
    expect(runDateFor(new Date('2026-08-01T09:00:00Z'))).toBe('2026-07-31');
  });

  it('request bodies match the measured canonical shape', () => {
    const body = buildProductionRequestBody('2026-08-01');
    expect(body.date).toEqual(['2026-08-01/2026-08-01']);
    expect(body.level).toEqual(['0']); // strings, not numbers
    expect(body.data_format).toBe('netcdf_zip');
    expect((body.leadtime_hour as string[]).length).toBe(97);
    expect((body.variable as string[])[0]).toBe('particulate_matter_2.5um');
    const mini = buildFixtureRequestBody('2026-08-01');
    expect(mini.variable).toEqual(['particulate_matter_2.5um']);
    expect(mini.leadtime_hour).toEqual(['0']);
  });
});

// ─── the faked end-to-end run ────────────────────────────────────────────────

const POLLUTANT_FILE_VARIABLES = [
  'pm2p5_conc',
  'pm10_conc',
  'no2_conc',
  'o3_conc',
  'so2_conc',
] as const;

/** A TR-shaped grid: lon 25.55…44.95 (+0.1, 195) × lat 42.45…35.55 (−0.1, 70). */
function buildArchive(variables: readonly string[], records: number): Uint8Array {
  const lon = Array.from({ length: 195 }, (_u, index) => Math.fround(25.55 + index * 0.1));
  const lat = Array.from({ length: 70 }, (_u, index) => Math.fround(42.45 - index * 0.1));
  const cells = lon.length * lat.length;
  const spec: FixtureFileSpec = {
    recordCount: records,
    dimensions: [
      { name: 'longitude', length: lon.length },
      { name: 'latitude', length: lat.length },
      { name: 'level', length: 1 },
      { name: 'time', length: 'record' },
    ],
    variables: [
      { name: 'longitude', dimensions: ['longitude'], data: lon },
      { name: 'latitude', dimensions: ['latitude'], data: lat },
      { name: 'level', dimensions: ['level'], data: [0] },
      {
        name: 'time',
        dimensions: ['time'],
        attributes: [
          { name: 'units', value: 'hours' },
          { name: 'long_name', value: 'FORECAST time from 20260801' },
        ],
        data: Array.from({ length: records }, (_u, index) => index),
      },
      ...variables.map((name) => ({
        name,
        dimensions: ['time', 'level', 'latitude', 'longitude'],
        attributes: [
          { name: 'units', value: 'µg/m3' },
          { name: '_FillValue', value: [-999] },
        ],
        data: Array.from({ length: records * cells }, (_u, index) => 5 + (index % 400) * 0.1),
      })),
    ],
  };
  return buildZipArchive([{ name: 'ENS_FORECAST.nc', bytes: buildNetcdf3(spec) }]);
}

interface RecordedCall {
  method: string;
  url: string;
  headers: Record<string, string>;
}

function fakeAds(options: { failExecutionWithKeyEcho?: boolean }): {
  fetchImpl: typeof fetch;
  calls: RecordedCall[];
} {
  const productionArchive = buildArchive(POLLUTANT_FILE_VARIABLES, 2);
  const fixtureArchive = buildArchive(['pm2p5_conc'], 1);
  const archives: Record<string, Uint8Array> = {
    'job-production': productionArchive,
    'job-fixture': fixtureArchive,
  };
  const calls: RecordedCall[] = [];
  let submissions = 0;

  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  const route = (input: string | URL | Request, init?: RequestInit): Response => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? 'GET';
    calls.push({
      method,
      url,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });

    if (url.endsWith('/costing') && method === 'POST') {
      return json(200, { id: 'size', cost: 485, limit: 5000 });
    }
    if (url.endsWith('/execution') && method === 'POST') {
      if (options.failExecutionWithKeyEcho === true) {
        return json(403, {
          type: 'permission denied',
          title: 'required licences not accepted',
          detail: `token ${API_KEY} lacks the licence`,
        });
      }
      submissions += 1;
      const jobId = submissions === 1 ? 'job-production' : 'job-fixture';
      return json(201, { jobID: jobId, status: 'accepted', created: '2026-08-01T14:00:00Z' });
    }
    const pollMatch = /\/jobs\/(job-[a-z]+)$/.exec(url);
    if (pollMatch !== null && method === 'GET') {
      return json(200, {
        status: 'successful',
        created: '2026-08-01T14:00:00Z',
        started: '2026-08-01T14:00:20Z',
        finished: '2026-08-01T14:01:00Z',
      });
    }
    const resultsMatch = /\/jobs\/(job-[a-z]+)\/results$/.exec(url);
    if (resultsMatch !== null && method === 'GET') {
      const archive = archives[resultsMatch[1] ?? ''];
      if (archive === undefined) return json(404, {});
      return json(200, {
        asset: {
          value: {
            type: 'application/zip',
            href: `https://object-store.os-api.cci2.ecmwf.int:443/cache/${resultsMatch[1] ?? ''}.zip`,
            'file:size': archive.byteLength,
            'file:checksum': createHash('md5').update(archive).digest('hex'),
            'file:local_path': `s3://cache/${resultsMatch[1] ?? ''}.zip`,
          },
        },
      });
    }
    const downloadMatch = /object-store\.os-api\.cci2\.ecmwf\.int.*\/(job-[a-z]+)\.zip$/.exec(url);
    if (downloadMatch !== null && method === 'GET') {
      const archive = archives[downloadMatch[1] ?? ''];
      if (archive === undefined) return new Response(null, { status: 404 });
      return new Response(Buffer.from(archive), {
        status: 200,
        headers: { 'content-type': 'application/zip' },
      });
    }
    if (pollMatch !== null && method === 'DELETE') {
      return json(200, { status: 'dismissed' });
    }
    return json(404, { detail: `unrouted ${method} ${url}` });
  };

  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(route(input, init))) as typeof fetch;

  return { fetchImpl, calls };
}

describe('runAirQualityProbePhase — faked end-to-end', () => {
  const runProbe = async (): Promise<{
    calls: RecordedCall[];
    artifactPath: string;
    fixturePath: string;
  }> => {
    const outputDir = await mkdtemp(join(tmpdir(), 'aq-probe-artifact-'));
    const fixtureDir = await mkdtemp(join(tmpdir(), 'aq-probe-fixture-'));
    const { fetchImpl, calls } = fakeAds({});
    await runAirQualityProbePhase({
      outputDir,
      fixtureDir,
      apiKey: API_KEY,
      fetchImpl,
      sleepImpl: () => Promise.resolve(),
      nowImpl: () => new Date('2026-08-01T14:05:00Z'),
    });
    return {
      calls,
      artifactPath: join(outputDir, 'air-quality-probe.json'),
      fixturePath: join(fixtureDir, FIXTURE_ARCHIVE_NAME),
    };
  };

  it('runs both jobs, never sends PRIVATE-TOKEN to the download host, and DELETEs politely', async () => {
    const { calls } = await runProbe();

    const downloads = calls.filter((call) => call.url.includes('object-store'));
    expect(downloads).toHaveLength(2);
    for (const download of downloads) {
      expect(Object.keys(download.headers)).not.toContain('PRIVATE-TOKEN');
    }
    const apiCalls = calls.filter((call) => !call.url.includes('object-store'));
    expect(apiCalls.length).toBeGreaterThan(0);
    for (const apiCall of apiCalls) {
      expect(apiCall.headers['PRIVATE-TOKEN']).toBe(API_KEY);
    }
    const deletes = calls.filter((call) => call.method === 'DELETE');
    expect(deletes).toHaveLength(2);
  }, 30_000);

  it('writes a key-free artifact with 81 in-threshold provinces and all assertions PASSED', async () => {
    const { artifactPath, fixturePath } = await runProbe();

    const raw = await readFile(artifactPath, 'utf8');
    expect(raw).not.toContain(API_KEY);
    expect(raw).not.toContain(encodeURIComponent(API_KEY));
    expect(raw).not.toContain('s3://'); // file:local_path is never persisted

    const artifact = JSON.parse(raw) as {
      provinces: { withinThreshold: boolean; outsideDomain: boolean }[];
      assertions: { id: string; passed: boolean }[];
      longitudeAxis: { step: number };
      latitudeAxis: { step: number };
      decoderVersion: string;
      jobs: { deleted: boolean; checksumVerified: boolean }[];
    };
    expect(artifact.provinces).toHaveLength(81);
    expect(artifact.provinces.every((province) => province.withinThreshold)).toBe(true);
    expect(artifact.provinces.every((province) => !province.outsideDomain)).toBe(true);
    expect(artifact.assertions.every((assertion) => assertion.passed)).toBe(true);
    expect(artifact.latitudeAxis.step).toBeLessThan(0);
    expect(artifact.decoderVersion).toBe('netcdf3-ts@1');
    expect(artifact.jobs.every((job) => job.deleted && job.checksumVerified)).toBe(true);

    // The fixture archive was written where the golden spec expects it.
    const fixture = await readFile(fixturePath);
    expect(fixture.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  }, 30_000);

  it('NEGATIVE: a provider error body that echoes the key is redacted in the thrown error', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'aq-probe-redact-'));
    const fixtureDir = await mkdtemp(join(tmpdir(), 'aq-probe-redact-fx-'));
    const { fetchImpl } = fakeAds({ failExecutionWithKeyEcho: true });

    let thrown: unknown = null;
    try {
      await runAirQualityProbePhase({
        outputDir,
        fixtureDir,
        apiKey: API_KEY,
        fetchImpl,
        sleepImpl: () => Promise.resolve(),
        nowImpl: () => new Date('2026-08-01T14:05:00Z'),
      });
    } catch (error: unknown) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AirQualityProbeError);
    const message = thrown instanceof Error ? thrown.message : '';
    expect(message).not.toContain(API_KEY);
    expect(message).toContain('[REDACTED]');
  }, 30_000);
});
