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
import { AirQualityPollutant, AirQualityStatus } from '../../air-quality/air-quality.types';
import type { AirQualityProbeArtifact } from './air-quality-artifact.types';
import { parseAirQualityCliArgs, parseAirQualityPhase } from './air-quality.cli';
import {
  ADS_DATASET_ID,
  AirQualityProbeError,
  analysisDateFor,
  ANALYSIS_ARCHIVE_NAME,
  ANALYSIS_STEP_COUNT,
  assertAllowedDownloadHost,
  buildAdsJsonHeaders,
  buildAnalysisRequestBody,
  buildDownloadHeaders,
  buildFixtureRequestBody,
  buildProductionRequestBody,
  evaluateProbeAssertions,
  FIXTURE_ARCHIVE_NAME,
  FORECAST_ARCHIVE_NAME,
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

describe('parseAirQualityCliArgs', () => {
  it('requires an ABSOLUTE --raw-dir — the raw archives must never default into the repo', () => {
    expect(() => parseAirQualityCliArgs(['--phase=probe'])).toThrow(/--raw-dir is mandatory/);
    expect(() => parseAirQualityCliArgs(['--phase=probe', '--raw-dir=tmp/raw'])).toThrow(
      /ABSOLUTE/,
    );
    expect(parseAirQualityCliArgs(['--phase=probe', '--raw-dir=/tmp/raw'])).toEqual({
      phase: 'probe',
      rawDir: '/tmp/raw',
      fromFile: null,
    });
  });

  it('accepts an absolute --from-file and refuses a relative one', () => {
    expect(
      parseAirQualityCliArgs([
        '--phase=probe',
        '--raw-dir=/tmp/raw',
        '--from-file=/tmp/raw/production-forecast.zip',
      ]).fromFile,
    ).toBe('/tmp/raw/production-forecast.zip');
    expect(() =>
      parseAirQualityCliArgs(['--phase=probe', '--raw-dir=/tmp/raw', '--from-file=raw.zip']),
    ).toThrow(/ABSOLUTE/);
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

  it('analysisDateFor is exactly D−1, across month and year boundaries', () => {
    expect(analysisDateFor('2026-08-01')).toBe('2026-07-31');
    expect(analysisDateFor('2026-01-01')).toBe('2025-12-31');
    expect(analysisDateFor('2028-03-01')).toBe('2028-02-29'); // leap year, not 02-28
    expect(() => analysisDateFor('not-a-date')).toThrow(AirQualityProbeError);
  });

  it('the analysis body is the measured J3 shape: 24 hourly times, leadtime 0, type analysis', () => {
    const analysis = buildAnalysisRequestBody('2026-07-31');
    expect(analysis.type).toEqual(['analysis']);
    expect(analysis.date).toEqual(['2026-07-31/2026-07-31']);
    expect(analysis.leadtime_hour).toEqual(['0']);
    expect((analysis.time as string[]).length).toBe(ANALYSIS_STEP_COUNT);
    expect((analysis.time as string[])[0]).toBe('00:00');
    expect((analysis.time as string[])[23]).toBe('23:00');
    // Same five pollutants and the same area as the forecast job — the two products must be
    // read from the same grid, which is what the ingest's identity guard later enforces.
    expect(analysis.variable).toEqual(buildProductionRequestBody('2026-07-31').variable);
    expect(analysis.area).toEqual(buildProductionRequestBody('2026-07-31').area);
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
function buildArchive(
  variables: readonly string[],
  records: number,
  timeLongName = 'FORECAST time from 20260801',
  entryName = 'ENS_FORECAST.nc',
): Uint8Array {
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
          { name: 'long_name', value: timeLongName },
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
  return buildZipArchive([{ name: entryName, bytes: buildNetcdf3(spec) }]);
}

interface RecordedCall {
  method: string;
  url: string;
  headers: Record<string, string>;
}

function fakeAds(options: { failExecutionWithKeyEcho?: boolean; hostileJobId?: boolean }): {
  fetchImpl: typeof fetch;
  calls: RecordedCall[];
} {
  // 97 records: the evidence gate BINDS the production step count (SF-77-2) — a 2-step fake
  // would now fail the probe's own assertions, which is exactly the point. The analysis archive
  // is the D−1 shape: 24 records, ANALYSIS product word, the SAME grid (which is what the
  // grid-identity gate reads).
  const productionArchive = buildArchive(POLLUTANT_FILE_VARIABLES, 97);
  const analysisArchive = buildArchive(
    POLLUTANT_FILE_VARIABLES,
    24,
    'ANALYSIS time from 20260731',
    'ENS_ANALYSIS.nc',
  );
  const fixtureArchive = buildArchive(['pm2p5_conc'], 1);
  const archives: Record<string, Uint8Array> = {
    'job-production': productionArchive,
    'job-analysis': analysisArchive,
    'job-fixture': fixtureArchive,
  };
  const calls: RecordedCall[] = [];
  const submittedJobIds: string[] = [];
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
      if (options.hostileJobId === true) {
        return json(201, { jobID: '../secrets?x=1', status: 'accepted' });
      }
      submissions += 1;
      const jobId =
        submissions === 1 ? 'job-production' : submissions === 2 ? 'job-analysis' : 'job-fixture';
      submittedJobIds.push(jobId);
      return json(201, { jobID: jobId, status: 'accepted', created: '2026-08-01T14:00:00Z' });
    }
    // `GET /jobs` — the reconciliation list (Ö-A2-3). The measured-plausible shape: a `jobs`
    // array of records that do NOT echo the submitted inputs.
    if (/\/jobs$/.test(url) && method === 'GET') {
      return json(200, {
        jobs: submittedJobIds.map((jobId) => ({
          processID: ADS_DATASET_ID,
          jobID: jobId,
          status: 'running',
          created: '2026-08-01T14:00:00Z',
        })),
        metadata: { totalCount: submittedJobIds.length },
      });
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
    outputDir: string;
    rawDir: string;
    artifactPath: string;
  }> => {
    const outputDir = await mkdtemp(join(tmpdir(), 'aq-probe-artifact-'));
    const rawDir = await mkdtemp(join(tmpdir(), 'aq-probe-raw-'));
    const { fetchImpl, calls } = fakeAds({});
    await runAirQualityProbePhase({
      outputDir,
      rawDir,
      apiKey: API_KEY,
      fetchImpl,
      sleepImpl: () => Promise.resolve(),
      nowImpl: () => new Date('2026-08-01T14:05:00Z'),
    });
    return {
      calls,
      outputDir,
      rawDir,
      artifactPath: join(outputDir, 'air-quality-probe.json'),
    };
  };

  it('runs all three jobs, never sends PRIVATE-TOKEN to the download host, and DELETEs politely', async () => {
    const { calls } = await runProbe();

    const downloads = calls.filter((call) => call.url.includes('object-store'));
    expect(downloads).toHaveLength(3);
    for (const download of downloads) {
      expect(Object.keys(download.headers)).not.toContain('PRIVATE-TOKEN');
    }
    const apiCalls = calls.filter((call) => !call.url.includes('object-store'));
    expect(apiCalls.length).toBeGreaterThan(0);
    for (const apiCall of apiCalls) {
      expect(apiCall.headers['PRIVATE-TOKEN']).toBe(API_KEY);
    }
    const deletes = calls.filter((call) => call.method === 'DELETE');
    expect(deletes).toHaveLength(3);
    // The analysis job asked for D−1 while the forecast asked for D — the ONE ordering fact
    // the whole product boundary rests on.
    const executions = calls.filter((call) => call.url.endsWith('/execution'));
    expect(executions).toHaveLength(3);
    // Exactly ONE list measurement, and only while our jobs exist (Ö-A2-3).
    expect(calls.filter((call) => /\/jobs$/.test(call.url) && call.method === 'GET')).toHaveLength(
      1,
    );
  }, 30_000);

  it('writes every archive to --raw-dir and NEVER touches the committed golden fixture', async () => {
    const { rawDir } = await runProbe();
    for (const name of [FORECAST_ARCHIVE_NAME, ANALYSIS_ARCHIVE_NAME, FIXTURE_ARCHIVE_NAME]) {
      const bytes = await readFile(join(rawDir, name));
      expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    }
    // The probe has no fixture-directory option at all any more (it would not type-check), so
    // the golden archive and its independently produced `reference.json` can only be replaced
    // by a deliberate operator step, never as a side effect of a measurement run.
  }, 30_000);

  it('records the analysis evidence: D−1, 24 steps, grid identical to the forecast', async () => {
    const { artifactPath } = await runProbe();
    const artifact = JSON.parse(await readFile(artifactPath, 'utf8')) as AirQualityProbeArtifact;

    expect(artifact.sourceMode).toBe('ads-probe');
    expect(artifact.analysis).not.toBeNull();
    expect(artifact.analysis?.requestDate).toBe(analysisDateFor(artifact.runDate));
    expect(artifact.analysis?.timeStepCount).toBe(ANALYSIS_STEP_COUNT);
    expect(artifact.analysis?.gridIdenticalToForecast).toBe(true);
    expect(artifact.analysis?.gridMismatchPlateCodes).toEqual([]);
    // The job record carries the product it asked for, so the artifact can never be read as
    // "three forecast jobs".
    expect(artifact.jobs.map((job) => job.product)).toEqual(['FORECAST', 'ANALYSIS', 'FORECAST']);
    expect(artifact.jobs[1]?.requestDate).toBe(analysisDateFor(artifact.runDate));
  }, 30_000);

  it('records the content-type of every response and the GET /jobs shape (Ö-A2-1/2/3)', async () => {
    const { artifactPath } = await runProbe();
    const artifact = JSON.parse(await readFile(artifactPath, 'utf8')) as AirQualityProbeArtifact;

    expect(artifact.requests.length).toBeGreaterThan(0);
    for (const request of artifact.requests) {
      expect(request).toHaveProperty('contentType');
    }
    const deleteRecords = artifact.requests.filter((request) => request.method === 'DELETE');
    expect(deleteRecords).toHaveLength(3);
    const download = artifact.requests.find((request) => request.label.endsWith('.download'));
    expect(download?.contentType).toBe('application/zip');

    expect(artifact.jobsListProbe).not.toBeNull();
    expect(artifact.jobsListProbe?.jobsArrayKey).toBe('jobs');
    expect(artifact.jobsListProbe?.entryKeys).toContain('jobID');
    expect(artifact.jobsListProbe?.containsSubmittedJob).toBe(true);
    // KEYS ONLY: no provider body, no values, and therefore nothing that could carry a key.
    expect(JSON.stringify(artifact.jobsListProbe)).not.toContain(ADS_DATASET_ID);
  }, 30_000);

  it('--from-file re-derives the artifact with ZERO network calls and NO job records', async () => {
    const { outputDir, rawDir } = await runProbe();
    const before = JSON.parse(
      await readFile(join(outputDir, 'air-quality-probe.json'), 'utf8'),
    ) as AirQualityProbeArtifact;

    let networkCalls = 0;
    const countingFetch = ((): Promise<Response> => {
      networkCalls += 1;
      return Promise.reject(new Error('the offline path must not fetch'));
    }) as unknown as typeof fetch;

    await runAirQualityProbePhase({
      outputDir,
      rawDir,
      fromFile: join(rawDir, FORECAST_ARCHIVE_NAME),
      fetchImpl: countingFetch,
      sleepImpl: () => Promise.resolve(),
      nowImpl: () => new Date('2026-08-03T09:00:00Z'),
    });

    expect(networkCalls).toBe(0);
    const after = JSON.parse(
      await readFile(join(outputDir, 'air-quality-probe.json'), 'utf8'),
    ) as AirQualityProbeArtifact;
    expect(after.sourceMode).toBe('from-file');
    // The run day came from the COMMITTED artifact, not from the (two days later) clock.
    expect(after.runDate).toBe(before.runDate);
    expect(after.jobs).toEqual([]);
    expect(after.requests).toEqual([]);
    expect(after.jobsListProbe).toBeNull();
    // The measurement itself is reproduced: same provinces, same axes, same analysis evidence.
    expect(after.provinces).toEqual(before.provinces);
    expect(after.longitudeAxis).toEqual(before.longitudeAxis);
    expect(after.analysis?.timeStepCount).toBe(ANALYSIS_STEP_COUNT);
    expect(after.assertions.every((assertion) => assertion.passed)).toBe(true);
  }, 30_000);

  it('writes a key-free artifact with 81 in-threshold provinces and all assertions PASSED', async () => {
    const { artifactPath } = await runProbe();

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
    // The BINDING gates are present, not merely "whatever ran passed".
    for (const id of ['time-steps-97', 'support-all-ok', 'null-step-budget']) {
      expect(artifact.assertions.map((assertion) => assertion.id)).toContain(id);
    }
    // The A2a measurement gates are present too — an artifact that quietly dropped them would
    // still be "all passed" while proving nothing about the two products.
    for (const id of [
      'content-type-recorded',
      'analysis-d-minus-1',
      'analysis-24-steps',
      'analysis-grid-identical',
      'jobs-list-measured',
    ]) {
      expect(artifact.assertions.map((assertion) => assertion.id)).toContain(id);
    }
    expect(artifact.latitudeAxis.step).toBeLessThan(0);
    expect(artifact.decoderVersion).toBe('netcdf3-ts@4');
    expect(artifact.jobs.every((job) => job.deleted && job.checksumVerified)).toBe(true);
  }, 30_000);

  it('NEGATIVE: the three binding evidence gates can actually FAIL (test-r2-1 — no vacuous gate)', async () => {
    // Take a genuinely PASSING artifact and break each bound fact: the gates must flip to
    // FAIL, proving they read the artifact rather than always reporting green.
    const { artifactPath } = await runProbe();
    const artifact = JSON.parse(await readFile(artifactPath, 'utf8')) as AirQualityProbeArtifact;

    const passing = evaluateProbeAssertions(artifact, API_KEY);
    expect(passing.every((assertion) => assertion.passed)).toBe(true);

    const byId = (id: string): boolean => {
      const results = evaluateProbeAssertions(artifact, API_KEY);
      const found = results.find((assertion) => assertion.id === id);
      if (found === undefined) throw new Error(`gate ${id} missing from the assertion set`);
      return found.passed;
    };

    const stepCount = artifact.timeStepCount;
    artifact.timeStepCount = 2; // a 2-step file must never pass as the production shape
    expect(byId('time-steps-97')).toBe(false);
    artifact.timeStepCount = stepCount;

    const firstProvince = artifact.provinces[0];
    if (firstProvince === undefined) throw new Error('artifact lost its provinces');
    const support = firstProvince.support[AirQualityPollutant.Pm2_5];
    firstProvince.support[AirQualityPollutant.Pm2_5] = AirQualityStatus.NotSupported;
    expect(byId('support-all-ok')).toBe(false);
    firstProvince.support[AirQualityPollutant.Pm2_5] = support;

    const nullCount = firstProvince.nullStepCounts[AirQualityPollutant.Pm2_5];
    // Blow the 5% budget from a single province (81×5×97 total steps → >1 964 nulls needed).
    firstProvince.nullStepCounts[AirQualityPollutant.Pm2_5] = 5_000;
    expect(byId('null-step-budget')).toBe(false);
    firstProvince.nullStepCounts[AirQualityPollutant.Pm2_5] = nullCount;

    // Restored artifact passes again — the mutations, not the harness, flipped the gates.
    expect(evaluateProbeAssertions(artifact, API_KEY).every((a) => a.passed)).toBe(true);
  }, 30_000);

  it('NEGATIVE: a hostile jobID shape is refused BEFORE any URL is built from it', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'aq-probe-jobid-'));
    const rawDir = await mkdtemp(join(tmpdir(), 'aq-probe-jobid-raw-'));
    const { fetchImpl, calls } = fakeAds({ hostileJobId: true });

    await expect(
      runAirQualityProbePhase({
        outputDir,
        rawDir,
        apiKey: API_KEY,
        fetchImpl,
        sleepImpl: () => Promise.resolve(),
        nowImpl: () => new Date('2026-08-01T14:05:00Z'),
      }),
    ).rejects.toThrow(/unexpected shape/);
    // No poll/results/DELETE call ever carried the hostile id.
    expect(calls.some((call) => call.url.includes('secrets'))).toBe(false);
  }, 30_000);

  it('NEGATIVE: a provider error body that echoes the key is redacted in the thrown error', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'aq-probe-redact-'));
    const rawDir = await mkdtemp(join(tmpdir(), 'aq-probe-redact-raw-'));
    const { fetchImpl } = fakeAds({ failExecutionWithKeyEcho: true });

    let thrown: unknown = null;
    try {
      await runAirQualityProbePhase({
        outputDir,
        rawDir,
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
