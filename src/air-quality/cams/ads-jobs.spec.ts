import { describe, expect, it } from '@jest/globals';
import { UpstreamSchemaError } from '../../upstream/upstream.types';
import type { AdsIngestConfig } from '../air-quality-upstream.config';
import {
  analysisDateFor,
  ANALYSIS_HOURS_PER_JOB,
  assertAllowedDownloadHost,
  buildAnalysisRequestBody,
  buildForecastRequestBody,
  compactDay,
  costingUrl,
  currentRunDate,
  executionUrl,
  expectedProductFor,
  expectedStepCount,
  isLicenceRefusal,
  isPlausibleJobId,
  isTerminalProviderStatus,
  jobResultsUrl,
  jobUrl,
  jobsListUrl,
  parseCosting,
  parseJobList,
  parseJobStatus,
  parseResultAsset,
} from './ads-jobs';

/**
 * The ADS protocol as pure functions — no network anywhere in this file. Every expectation
 * below is MEASURED provider behaviour (`probe-olcumleri.md` plus the A2a probe pass), not
 * documentation, which is why the surprising ones carry their measurement in a comment.
 */

const ADS: AdsIngestConfig = {
  baseUrl: 'https://ads.atmosphere.copernicus.eu/api',
  datasetId: 'cams-europe-air-quality-forecasts',
  objectStoreHosts: ['object-store.os-api.cci2.ecmwf.int'],
  apiKey: 'a-key',
  area: [42.5, 25.5, 35.5, 45.0],
  forecastHours: 96,
  submitAfterUtcHour: 12,
  maxAttemptsPerJob: 6,
  pollTimeoutMs: 10_000,
  downloadTimeoutMs: 180_000,
  tourBudgetMs: 200_000,
  runMaxBytes: 67_108_864,
};

describe('URL building', () => {
  it('appends the measured retrieve/v1 job path to the API ROOT', () => {
    expect(costingUrl(ADS)).toBe(
      'https://ads.atmosphere.copernicus.eu/api/retrieve/v1/processes/' +
        'cams-europe-air-quality-forecasts/costing',
    );
    expect(executionUrl(ADS)).toContain('/retrieve/v1/processes/');
    expect(jobsListUrl(ADS)).toBe('https://ads.atmosphere.copernicus.eu/api/retrieve/v1/jobs');
    expect(jobUrl(ADS, 'abc-123')).toBe(
      'https://ads.atmosphere.copernicus.eu/api/retrieve/v1/jobs/abc-123',
    );
    expect(jobResultsUrl(ADS, 'abc-123')).toMatch(/\/jobs\/abc-123\/results$/);
    // A trailing slash on the configured root must not produce a doubled separator.
    expect(jobsListUrl({ ...ADS, baseUrl: 'https://x.test/api/' })).toBe(
      'https://x.test/api/retrieve/v1/jobs',
    );
  });

  it('NEGATIVE: a hostile job id is refused BEFORE any URL is built from it', () => {
    for (const hostile of ['../secrets', 'a?b=1', 'a b', '', 'a/b', '#frag']) {
      expect(isPlausibleJobId(hostile)).toBe(false);
      expect(() => jobUrl(ADS, hostile)).toThrow(UpstreamSchemaError);
      expect(() => jobResultsUrl(ADS, hostile)).toThrow(UpstreamSchemaError);
    }
    expect(isPlausibleJobId('be6bbf4c-ab45-4a4f-a2d1-d16919566a16')).toBe(true);
  });

  it('NEGATIVE: a refused job id never reaches the message in full', () => {
    const huge = `${'x'.repeat(5_000)}/../etc`;
    expect(() => jobUrl(ADS, huge)).toThrow(/unexpected shape/);
    try {
      jobUrl(ADS, huge);
    } catch (error: unknown) {
      expect((error as Error).message.length).toBeLessThan(400);
    }
  });
});

describe('run-day arithmetic', () => {
  it('advances the run day only after the submit hour', () => {
    // All CAMS products close by 12:00 UTC; asking earlier asks for a file that does not exist.
    expect(currentRunDate(new Date('2026-08-02T13:00:00Z'), 12).toISOString()).toBe(
      '2026-08-02T00:00:00.000Z',
    );
    expect(currentRunDate(new Date('2026-08-02T11:59:00Z'), 12).toISOString()).toBe(
      '2026-08-01T00:00:00.000Z',
    );
    expect(currentRunDate(new Date('2026-08-01T00:10:00Z'), 12).toISOString()).toBe(
      '2026-07-31T00:00:00.000Z',
    );
  });

  it('the analysis day is exactly D−1, across month, year and leap boundaries', () => {
    expect(analysisDateFor('2026-08-01')).toBe('2026-07-31');
    expect(analysisDateFor('2026-01-01')).toBe('2025-12-31');
    expect(analysisDateFor('2028-03-01')).toBe('2028-02-29');
    expect(() => analysisDateFor('nope')).toThrow(UpstreamSchemaError);
  });

  it('compactDay is what the decoder cross-validates against the file', () => {
    expect(compactDay('2026-07-31')).toBe('20260731');
  });
});

describe('request bodies', () => {
  it('the forecast body is the measured production shape (costing 485)', () => {
    const body = buildForecastRequestBody(ADS, '2026-08-01');
    expect(body.type).toEqual(['forecast']);
    expect(body.date).toEqual(['2026-08-01/2026-08-01']);
    expect(body.time).toEqual(['00:00']);
    // STRINGS, not numbers — the provider's enum is a string list (measured).
    expect(body.level).toEqual(['0']);
    expect((body.leadtime_hour as string[]).length).toBe(97);
    expect((body.leadtime_hour as string[])[96]).toBe('96');
    expect(body.data_format).toBe('netcdf_zip');
    expect(body.area).toEqual([42.5, 25.5, 35.5, 45.0]);
    expect((body.variable as string[]).length).toBe(5);
  });

  it('the analysis body is the measured J3 shape (costing 120): 24 times, lead time 0', () => {
    const body = buildAnalysisRequestBody(ADS, '2026-07-31');
    expect(body.type).toEqual(['analysis']);
    expect(body.date).toEqual(['2026-07-31/2026-07-31']);
    expect(body.leadtime_hour).toEqual(['0']);
    expect((body.time as string[]).length).toBe(ANALYSIS_HOURS_PER_JOB);
    expect((body.time as string[])[0]).toBe('00:00');
    expect((body.time as string[])[23]).toBe('23:00');
    // Same pollutants and the same rectangle as the forecast: the two products MUST come from
    // the same grid, and the ingest refuses the analysis if they ever stop doing so.
    expect(body.variable).toEqual(buildForecastRequestBody(ADS, '2026-07-31').variable);
    expect(body.area).toEqual(buildForecastRequestBody(ADS, '2026-07-31').area);
  });

  it('the forecast horizon follows the env, and the step count follows with it', () => {
    const shorter = { ...ADS, forecastHours: 24 };
    expect((buildForecastRequestBody(shorter, '2026-08-01').leadtime_hour as string[]).length).toBe(
      25,
    );
    expect(expectedStepCount(shorter, 'forecast')).toBe(25);
    expect(expectedStepCount(shorter, 'analysis')).toBe(24);
    expect(expectedProductFor('forecast')).toBe('FORECAST');
    expect(expectedProductFor('analysis')).toBe('ANALYSIS');
  });
});

describe('response parsing', () => {
  it('costing reports cost and limit WITHOUT judging them', () => {
    // Measured: the endpoint answers HTTP 200 even far above the limit and never refuses by
    // itself. The comparison belongs to the caller, and this parser must not hide that.
    expect(parseCosting('{"id":"size","cost":23280,"limit":5000}')).toEqual({
      cost: 23280,
      limit: 5000,
    });
    expect(() => parseCosting('{"cost":"485","limit":5000}')).toThrow(UpstreamSchemaError);
    expect(() => parseCosting('[]')).toThrow(UpstreamSchemaError);
  });

  it('job status carries the provider queue stamps verbatim', () => {
    const status = parseJobStatus(
      '{"jobID":"job-1","status":"successful","created":"2026-08-02T01:35:00Z",' +
        '"started":"2026-08-02T01:35:20Z","finished":"2026-08-02T01:36:06Z"}',
      'poll',
    );
    expect(status).toEqual({
      jobId: 'job-1',
      status: 'successful',
      created: '2026-08-02T01:35:00Z',
      started: '2026-08-02T01:35:20Z',
      finished: '2026-08-02T01:36:06Z',
    });
    expect(parseJobStatus('{"jobID":"job-1","status":"accepted"}', 'poll').started).toBeNull();
    expect(() => parseJobStatus('{"jobID":"../x","status":"accepted"}', 'poll')).toThrow(
      /unexpected shape/,
    );
  });

  it('the jobs list is parsed structurally — measured shape { jobs, links, metadata }', () => {
    const entries = parseJobList(
      '{"jobs":[{"processID":"cams-europe-air-quality-forecasts","jobID":"job-1",' +
        '"status":"running","created":"2026-08-02T01:35:00Z"}],"links":[],"metadata":{}}',
    );
    expect(entries).toEqual([
      {
        jobId: 'job-1',
        status: 'running',
        processId: 'cams-europe-air-quality-forecasts',
        created: '2026-08-02T01:35:00Z',
      },
    ]);
    expect(() => parseJobList('{"metadata":{}}')).toThrow(/jobs" array/);
  });

  it('the result asset is read with the checksum LENGTH pinned, and file:local_path ignored', () => {
    const body =
      '{"asset":{"value":{"type":"application/zip",' +
      '"href":"https://object-store.os-api.cci2.ecmwf.int/cache/x.zip",' +
      '"file:size":26484852,"file:checksum":"a9e515930000000000000000000000ff",' +
      '"file:local_path":"s3://cache/x.zip"}}}';
    const asset = parseResultAsset(body);
    expect(asset.sizeBytes).toBe(26484852);
    expect(asset.href).toContain('object-store');
    expect(JSON.stringify(asset)).not.toContain('s3://');

    // The algorithm is never declared in the body — MD5 was verified by computing it. A change
    // of algorithm must refuse, not silently "verify" something else.
    expect(() => parseResultAsset(body.replace('a9e515930000000000000000000000ff', 'abc'))).toThrow(
      /32 hex/,
    );
  });
});

describe('download host allowlist (SSRF class)', () => {
  it('accepts only https on an allowlisted HOST, whatever the path', () => {
    expect(
      assertAllowedDownloadHost(
        'https://object-store.os-api.cci2.ecmwf.int:443/cci2-prod-cache-3/x.zip',
        ADS.objectStoreHosts,
      ).hostname,
    ).toBe('object-store.os-api.cci2.ecmwf.int');

    for (const href of [
      'https://evil.example.com/x.zip',
      'http://object-store.os-api.cci2.ecmwf.int/x.zip',
      'https://object-store.os-api.cci2.ecmwf.int.evil.example/x.zip',
      'file:///etc/passwd',
      'not a url',
    ]) {
      expect(() => assertAllowedDownloadHost(href, ADS.objectStoreHosts)).toThrow(
        UpstreamSchemaError,
      );
    }
  });

  it('an EMPTY allowlist refuses everything — it never means "allow all"', () => {
    expect(() =>
      assertAllowedDownloadHost('https://object-store.os-api.cci2.ecmwf.int/x.zip', []),
    ).toThrow(/allowlist/);
  });
});

describe('terminal classification', () => {
  it('names the states that must never be retried', () => {
    expect(isTerminalProviderStatus('rejected')).toBe(true);
    expect(isTerminalProviderStatus('dismissed')).toBe(true);
    // `failed` is the provider's TRANSIENT class and is retried against the per-job budget.
    expect(isTerminalProviderStatus('failed')).toBe(false);
    expect(isTerminalProviderStatus('running')).toBe(false);
  });

  it('reads a licence refusal from the BODY, not from a string match on the whole message', () => {
    expect(
      isLicenceRefusal(
        403,
        '{"type":"permission denied","title":"required licences not accepted"}',
      ),
    ).toBe(true);
    expect(isLicenceRefusal(403, '{"title":"forbidden"}')).toBe(false);
    expect(isLicenceRefusal(400, '{"title":"required licences not accepted"}')).toBe(false);
    expect(isLicenceRefusal(403, 'not json at all')).toBe(false);
  });
});
