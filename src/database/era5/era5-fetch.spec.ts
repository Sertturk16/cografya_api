import { describe, expect, it } from '@jest/globals';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SEED_PROVINCES } from '../seeds/province.seed-data';
import type { Era5DecodedFile } from './era5-decode';
import { EXPECTED_FALLBACK_PLATE_CODES } from './era5-extract';
import { ERA5_EXPECTED_MONTH_COUNT } from './era5-request';
import {
  adoptRawJobsSidecar,
  assertAllowedDownloadHost,
  buildCdsJsonHeaders,
  buildDownloadHeaders,
  CDS_OBJECT_STORE_HOST_ALLOWLIST,
  ERA5_MAX_DOWNLOAD_BYTES,
  Era5FetchError,
  FIXTURE_FILE_NAME,
  MANIFEST_FILE_NAME,
  RAW_FILE_NAME,
  rawJobsSidecarPath,
  redactCdsSecret,
  runEra5FetchPhase,
  SERIES_FILE_NAME,
} from './era5-fetch';
import {
  buildSyntheticDecodedFile,
  cellKeyFor,
  TEST_LATITUDE_AXIS,
  TEST_LONGITUDE_AXIS,
} from './era5-fixture.builder';

/**
 * HTTP + file-handling choreography against a FAKE `fetch`, an injected clock and an injected
 * sleep — no network, no HDF5. Decoder correctness is `era5-golden.spec.ts`'s job; this file
 * pins the order of operations and the security bindings.
 */

const KEY = 'test-cds-key-do-not-use';
const HOST = CDS_OBJECT_STORE_HOST_ALLOWLIST[0] ?? 'object-store.os-api.cci2.ecmwf.int';

interface Recorded {
  method: string;
  url: string;
  headers: Record<string, string>;
  redirect: string | undefined;
}

interface ScriptOptions {
  payload: Uint8Array;
  costing?: { cost: number; limit: number };
  executionStatus?: number;
  terminalStatus?: string;
  href?: string;
  declaredSize?: number;
  declaredChecksum?: string;
  runningPolls?: number;
  /** The provider answers `execution` with a hostile `jobID` (A1's `../secrets?x=1` case). */
  hostileJobId?: boolean;
  /** The provider's error body ECHOES the key back at us (A1's licence-403 case). */
  echoKeyInExecutionError?: boolean;
  /** `DELETE /jobs/{id}` answers non-2xx — the job could not be dismissed. */
  deleteStatus?: number;
}

/** A fake CDS that answers the whole queue protocol, with per-test sabotage points. */
function buildFakeCds(options: ScriptOptions): {
  fetchImpl: typeof fetch;
  calls: Recorded[];
} {
  const calls: Recorded[] = [];
  const md5 = createHash('md5').update(options.payload).digest('hex');
  let pollsLeft = options.runningPolls ?? 0;

  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  const fetchImpl: typeof fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({
      method: init?.method ?? 'GET',
      url,
      headers: { ...((init?.headers ?? {}) as Record<string, string>) },
      redirect: init?.redirect,
    });

    if (url.endsWith('/costing')) {
      return Promise.resolve(json(options.costing ?? { cost: 1440, limit: 120000 }));
    }
    if (url.endsWith('/execution')) {
      if (options.echoKeyInExecutionError === true) {
        return Promise.resolve(
          json(
            {
              type: 'permission denied',
              title: 'required licences not accepted',
              detail: `token ${KEY} lacks the licence`,
            },
            options.executionStatus ?? 403,
          ),
        );
      }
      return Promise.resolve(
        json(
          {
            jobID: options.hostileJobId === true ? '../secrets?x=1' : 'job-0001',
            status: pollsLeft > 0 ? 'accepted' : (options.terminalStatus ?? 'successful'),
          },
          options.executionStatus ?? 201,
        ),
      );
    }
    if (url.endsWith('/results')) {
      return Promise.resolve(
        json({
          asset: {
            value: {
              href: options.href ?? `https://${HOST}/cci2-prod-cache-1/bucket/file.nc`,
              'file:size': options.declaredSize ?? options.payload.byteLength,
              'file:checksum': options.declaredChecksum ?? md5,
              'file:local_path': 's3://never-used/path.nc',
            },
          },
        }),
      );
    }
    if (url.includes('/jobs/') && (init?.method ?? 'GET') === 'DELETE') {
      return Promise.resolve(json({ status: 'dismissed' }, options.deleteStatus ?? 200));
    }
    if (url.includes('/jobs/')) {
      if (pollsLeft > 0) {
        pollsLeft -= 1;
        return Promise.resolve(json({ jobID: 'job-0001', status: 'running' }));
      }
      return Promise.resolve(
        json({
          jobID: 'job-0001',
          status: options.terminalStatus ?? 'successful',
          created: '2026-08-02T10:00:00Z',
          started: '2026-08-02T10:00:20Z',
          finished: '2026-08-02T10:01:42Z',
        }),
      );
    }
    // The object store.
    return Promise.resolve(
      new Response(options.payload.buffer.slice(0) as ArrayBuffer, {
        status: 200,
        headers: { 'content-length': String(options.payload.byteLength) },
      }),
    );
  };

  return { fetchImpl, calls };
}

async function runAgainst(
  script: ScriptOptions,
  extra: { monthCount?: number } = {},
): Promise<{
  calls: Recorded[];
  rawDir: string;
  outputDir: string;
  fixtureDir: string;
  error: unknown;
  logs: string[];
  errors: string[];
}> {
  const base = await mkdtemp(join(tmpdir(), 'era5-fetch-'));
  const rawDir = join(base, 'raw');
  const outputDir = join(base, 'data');
  const fixtureDir = join(base, 'fixtures');
  const { fetchImpl, calls } = buildFakeCds(script);
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]): void => {
    logs.push(args.map((arg) => String(arg)).join(' '));
  };
  console.error = (...args: unknown[]): void => {
    errors.push(args.map((arg) => String(arg)).join(' '));
  };
  let error: unknown = null;
  try {
    await runEra5FetchPhase({
      rawDir,
      outputDir,
      fixtureDir,
      apiKey: KEY,
      fetchImpl,
      sleepImpl: () => Promise.resolve(),
      nowImpl: () => new Date('2026-08-02T12:00:00Z'),
      decodeImpl: () => buildSyntheticDecodedFile({ monthCount: extra.monthCount ?? 2 }),
    });
  } catch (caught: unknown) {
    error = caught;
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return { calls, rawDir, outputDir, fixtureDir, error, logs, errors };
}

/** The grid cell one seed province resolves to on the production axes, as a `maskedCells` key. */
function cellKeyForProvince(plateCode: string): string {
  const province = SEED_PROVINCES.find((entry) => entry.plateCode === plateCode);
  if (province === undefined) throw new Error(`seed is missing province ${plateCode}`);
  return cellKeyFor(province.latitude, province.longitude);
}

function latIndexOfProvince(plateCode: string): number {
  const [latIndex] = cellKeyForProvince(plateCode).split(',');
  return Number(latIndex);
}

/**
 * A synthetic decode that satisfies EVERY assertion — the only way to reach the rename, which is
 * what a successful run's last two lines actually do.
 *
 * It is deliberately built from the same measured inputs the real run uses (the production axes,
 * the real 81 seed coordinates, the five measured sea cells) rather than from numbers chosen to
 * make the gate green: the point is a run the gate genuinely passes, not a bypass.
 */
function buildPassingDecodedFile(): Era5DecodedFile {
  const latCount = TEST_LATITUDE_AXIS.length;
  const lonCount = TEST_LONGITUDE_AXIS.length;
  // Dry enough for Konya's continental band; the Eastern Black Sea row is overwritten below so
  // Rize lands inside its wet band. Both bands are order-of-magnitude wide (see era5-assertions).
  const dryMetresPerDay = 0.0015;
  const wetMetresPerDay = 0.0075;
  const rizeLatIndex = latIndexOfProvince('53');
  const values = new Float64Array(ERA5_EXPECTED_MONTH_COUNT * latCount * lonCount).fill(
    dryMetresPerDay,
  );
  for (let timeIndex = 0; timeIndex < ERA5_EXPECTED_MONTH_COUNT; timeIndex += 1) {
    const rowStart = (timeIndex * latCount + rizeLatIndex) * lonCount;
    values.fill(wetMetresPerDay, rowStart, rowStart + lonCount);
  }
  return buildSyntheticDecodedFile({
    monthCount: ERA5_EXPECTED_MONTH_COUNT,
    maskedCells: new Set(EXPECTED_FALLBACK_PLATE_CODES.map(cellKeyForProvince)),
    variables: [
      { name: 't2m', attributes: {} },
      { name: 'tp', attributes: {}, values },
    ],
  });
}

describe('pure security helpers', () => {
  it('sends PRIVATE-TOKEN on JSON calls', () => {
    expect(buildCdsJsonHeaders(KEY)['PRIVATE-TOKEN']).toBe(KEY);
  });

  it('NEVER sends PRIVATE-TOKEN on the download call', () => {
    expect(Object.keys(buildDownloadHeaders())).toEqual(['User-Agent']);
    expect(JSON.stringify(buildDownloadHeaders())).not.toContain('PRIVATE-TOKEN');
  });

  it('allows the measured object-store host and refuses anything else', () => {
    expect(assertAllowedDownloadHost(`https://${HOST}/whatever/bucket.nc`).hostname).toBe(HOST);
    // The bucket path varies from job to job, so the allowlist is HOST level on purpose.
    expect(assertAllowedDownloadHost(`https://${HOST}/cci2-prod-cache-3/x.nc`).hostname).toBe(HOST);
    expect(() => assertAllowedDownloadHost('https://evil.example.com/x.nc')).toThrow(
      /not in the download allowlist/,
    );
    expect(() => assertAllowedDownloadHost(`http://${HOST}/x.nc`)).toThrow(/is not https/);
    expect(() => assertAllowedDownloadHost('not-a-url')).toThrow(Era5FetchError);
  });

  it('redacts the key and its percent-encoded form', () => {
    const secret = 'a b/c';
    expect(redactCdsSecret(`x ${secret} y`, secret)).toBe('x [REDACTED] y');
    expect(redactCdsSecret(`x ${encodeURIComponent(secret)} y`, secret)).toBe('x [REDACTED] y');
    expect(redactCdsSecret('unchanged', null)).toBe('unchanged');
  });
});

describe('runEra5FetchPhase — the queue protocol', () => {
  const payload = new Uint8Array(Array.from({ length: 1024 }, (_unused, index) => index % 251));

  it('refuses to run without a key and says WHY it is not in the env schema', async () => {
    await expect(
      runEra5FetchPhase({
        rawDir: '/tmp/era5-none',
        outputDir: '/tmp/era5-none',
        fixtureDir: '/tmp/era5-none',
        apiKey: '',
        fetchImpl: () => Promise.reject(new Error('must not be called')),
      }),
    ).rejects.toThrow(/NOT part of the app boot schema/);
  });

  it('does NOT submit when costing exceeds the limit', async () => {
    const { calls } = await runAgainst({ payload, costing: { cost: 200000, limit: 120000 } });
    expect(calls.some((call) => call.url.endsWith('/execution'))).toBe(false);
  });

  it('treats a `rejected` job as TERMINAL and never retries it', async () => {
    const { calls, error } = await runAgainst({ payload, terminalStatus: 'rejected' });
    expect(String(error)).toContain('rejected');
    expect(calls.filter((call) => call.url.endsWith('/execution'))).toHaveLength(1);
    expect(calls.some((call) => call.url.endsWith('/results'))).toBe(false);
  });

  it('polls patiently while the job is running', async () => {
    const { calls } = await runAgainst({ payload, runningPolls: 5 });
    const polls = calls.filter(
      (call) =>
        call.method === 'GET' && call.url.includes('/jobs/') && !call.url.endsWith('/results'),
    );
    expect(polls.length).toBeGreaterThanOrEqual(5);
  });

  it('refuses a declared file:size above the byte cap WITHOUT downloading', async () => {
    const { calls, error } = await runAgainst({
      payload,
      declaredSize: ERA5_MAX_DOWNLOAD_BYTES + 1,
    });
    expect(String(error)).toContain('exceeds the');
    expect(calls.some((call) => call.url.includes(HOST))).toBe(false);
  });

  it('refuses a download href on a non-allowlisted host WITHOUT downloading', async () => {
    const { calls, error } = await runAgainst({
      payload,
      href: 'https://attacker.example.com/bucket/file.nc',
    });
    expect(String(error)).toContain('not in the download allowlist');
    expect(calls.some((call) => call.url.includes('attacker.example.com'))).toBe(false);
  });

  it('refuses a checksum that is not 32 hex chars', async () => {
    const { error } = await runAgainst({ payload, declaredChecksum: 'sha256:abc' });
    expect(String(error)).toContain('not 32 hex chars');
  });

  it('refuses a downloaded payload whose MD5 does not match', async () => {
    const { error } = await runAgainst({
      payload,
      declaredChecksum: '0'.repeat(32),
    });
    expect(String(error)).toContain('does not match the declared file:checksum');
  });

  it('sets redirect:"error" on every call and sends the token ONLY to the API host', async () => {
    const { calls } = await runAgainst({ payload });
    expect(calls.every((call) => call.redirect === 'error')).toBe(true);
    for (const call of calls) {
      if (call.url.includes(HOST)) {
        expect(call.headers['PRIVATE-TOKEN']).toBeUndefined();
      } else {
        expect(call.headers['PRIVATE-TOKEN']).toBe(KEY);
      }
    }
  });

  it('calls DELETE only AFTER the download has been verified — the call ORDER is the rule', async () => {
    const { calls } = await runAgainst({ payload });
    const order = calls.map(
      (call) =>
        `${call.method} ${call.url.includes(HOST) ? 'download' : (call.url.split('/').pop() ?? '')}`,
    );
    const downloadAt = order.findIndex((entry) => entry.endsWith('download'));
    const deleteAt = order.findIndex((entry) => entry.startsWith('DELETE'));
    expect(downloadAt).toBeGreaterThanOrEqual(0);
    expect(deleteAt).toBeGreaterThan(downloadAt);
  });

  it('renames `.part` → final only after verification, leaving no `.part` behind', async () => {
    const { rawDir, fixtureDir } = await runAgainst({ payload });
    const rawFiles = await readdir(rawDir);
    expect(rawFiles).toContain(RAW_FILE_NAME);
    expect(rawFiles.some((name) => name.endsWith('.part'))).toBe(false);
    const fixtureFiles = await readdir(fixtureDir);
    expect(fixtureFiles).toContain(FIXTURE_FILE_NAME);
  });

  it('writes both artifacts, and neither contains key material', async () => {
    const { outputDir } = await runAgainst({ payload });
    // This run FAILS the gate (2 synthetic months), so the evidence lives at `.part` — see the
    // gate-before-rename test below.
    const manifest = await readFile(join(outputDir, `${MANIFEST_FILE_NAME}.part`), 'utf8');
    const series = await readFile(join(outputDir, `${SERIES_FILE_NAME}.part`), 'utf8');
    expect(manifest).not.toContain(KEY);
    expect(series).not.toContain(KEY);
    expect(JSON.parse(manifest)).toMatchObject({ schemaVersion: 1, datasetId: expect.any(String) });
  });

  it('never prints key material, on stdout or stderr', async () => {
    const { logs, errors } = await runAgainst({ payload });
    expect(logs.join('\n')).not.toContain(KEY);
    expect(errors.join('\n')).not.toContain(KEY);
  });

  it('NEGATIVE: a hostile jobID shape is refused BEFORE any URL is built from it', async () => {
    // A1 precedent (`probe-air-quality.spec.ts`), ported with its guard: the shape gate is only a
    // guard if something proves it rejects.
    const { calls, error } = await runAgainst({ payload, hostileJobId: true });
    expect(String(error)).toContain('unexpected shape');
    expect(calls.some((call) => call.url.includes('secrets'))).toBe(false);
  });

  it('NEGATIVE: a provider error body that echoes the key is redacted in the thrown error', async () => {
    const { error } = await runAgainst({ payload, echoKeyInExecutionError: true });
    const message = error instanceof Error ? error.message : String(error);
    expect(message).not.toContain(KEY);
    expect(message).toContain('[REDACTED]');
  });

  it('reports a failed job DELETE on STDERR and fails the run at the gate', async () => {
    const { errors, outputDir } = await runAgainst({ payload, deleteStatus: 500 });
    // The immediate signal must match the eventual outcome: a job we could not dismiss is an
    // error, not progress narration.
    expect(errors.join('\n')).toContain('was NOT');
    expect(errors.join('\n')).toContain('DELETE answered HTTP 500');
    const manifest = JSON.parse(
      await readFile(join(outputDir, `${MANIFEST_FILE_NAME}.part`), 'utf8'),
    ) as { assertions: { id: string; passed: boolean }[] };
    expect(manifest.assertions.find((result) => result.id === 'jobs-deleted')?.passed).toBe(false);
  });

  it('FAILS LOUDLY without overwriting the committed artifacts — the gate is ON the write path', async () => {
    // The synthetic decode yields 2 months, not 360, so `months-360` must fail.
    const { error, outputDir } = await runAgainst({ payload });
    expect(String(error)).toContain('assertion(s) FAILED');
    expect(String(error)).toContain('months-360');
    // The artifacts of a FAILED run are what explain the failure — they stay on disk, but at
    // `.part`, so an invalid pair can never sit at the two paths git tracks.
    await expect(
      readFile(join(outputDir, `${MANIFEST_FILE_NAME}.part`), 'utf8'),
    ).resolves.toContain('"assertions"');
    const written = await readdir(outputDir);
    expect(written).not.toContain(MANIFEST_FILE_NAME);
    expect(written).not.toContain(SERIES_FILE_NAME);
  });

  it('renames `.part` → final ONLY when every assertion passes, leaving no `.part` behind', async () => {
    const base = await mkdtemp(join(tmpdir(), 'era5-pass-'));
    const rawPath = join(base, RAW_FILE_NAME);
    await writeFile(rawPath, payload);
    const outputDir = join(base, 'data');
    const originalLog = console.log;
    console.log = (): void => undefined;
    try {
      await runEra5FetchPhase({
        rawDir: join(base, 'raw'),
        outputDir,
        fixtureDir: join(base, 'fixtures'),
        fromFile: rawPath,
        sleepImpl: () => Promise.resolve(),
        nowImpl: () => new Date('2026-08-02T12:00:00Z'),
        decodeImpl: () => buildPassingDecodedFile(),
      });
    } finally {
      console.log = originalLog;
    }
    const written = await readdir(outputDir);
    expect(written).toContain(MANIFEST_FILE_NAME);
    expect(written).toContain(SERIES_FILE_NAME);
    expect(written.some((name) => name.endsWith('.part'))).toBe(false);
    const manifest = JSON.parse(await readFile(join(outputDir, MANIFEST_FILE_NAME), 'utf8')) as {
      assertions: { id: string; passed: boolean }[];
    };
    expect(manifest.assertions.filter((result) => !result.passed)).toEqual([]);
  }, 60_000);

  it('--from-file makes ZERO network calls', async () => {
    const first = await runAgainst({ payload });
    const rawPath = join(first.rawDir, RAW_FILE_NAME);
    const base = await mkdtemp(join(tmpdir(), 'era5-fromfile-'));
    const calls: Recorded[] = [];
    const originalLog = console.log;
    console.log = (): void => undefined;
    try {
      await runEra5FetchPhase({
        rawDir: join(base, 'raw'),
        outputDir: join(base, 'data'),
        fixtureDir: join(base, 'fixtures'),
        fromFile: rawPath,
        fetchImpl: () => {
          calls.push({ method: 'GET', url: 'X', headers: {}, redirect: undefined });
          return Promise.reject(new Error('the network must not be touched'));
        },
        sleepImpl: () => Promise.resolve(),
        nowImpl: () => new Date('2026-08-02T12:00:00Z'),
        decodeImpl: () => buildSyntheticDecodedFile({ monthCount: 2 }),
      });
    } catch {
      // The assertion gate still fails on a 2-month synthetic decode; the point is the call count.
    } finally {
      console.log = originalLog;
    }
    expect(calls).toHaveLength(0);
    await expect(
      readFile(join(base, 'data', `${MANIFEST_FILE_NAME}.part`), 'utf8'),
    ).resolves.toContain('"schemaVersion"');
  });

  it('produces BYTE-IDENTICAL artifacts on a re-run over the same raw file', async () => {
    const first = await runAgainst({ payload });
    const rawPath = join(first.rawDir, RAW_FILE_NAME);
    const readAgain = async (): Promise<string> => {
      const base = await mkdtemp(join(tmpdir(), 'era5-determinism-'));
      const originalLog = console.log;
      console.log = (): void => undefined;
      try {
        await runEra5FetchPhase({
          rawDir: join(base, 'raw'),
          outputDir: join(base, 'data'),
          fixtureDir: join(base, 'fixtures'),
          fromFile: rawPath,
          sleepImpl: () => Promise.resolve(),
          nowImpl: () => new Date('2026-08-02T12:00:00Z'),
          decodeImpl: () => buildSyntheticDecodedFile({ monthCount: 2 }),
        });
      } catch {
        // Assertion gate; irrelevant here.
      } finally {
        console.log = originalLog;
      }
      return readFile(join(base, 'data', `${SERIES_FILE_NAME}.part`), 'utf8');
    };
    // Byte-identical DATA. The two run-stamp fields (`generatedAtUtc`, `totals.wallClockMs`) are
    // pinned here by the injected clock; `writeArtifact`'s docblock scopes the claim honestly.
    expect(await readAgain()).toBe(await readAgain());
  });
});

/**
 * R1 — the `<raw>.jobs.json` sidecar.
 *
 * The read half is tested through {@link adoptRawJobsSidecar} directly, because what has to be
 * proved is a MATRIX of rejections that all degrade to the same silent, identical behaviour. The
 * write half and the end-to-end recovery are proved through a real run.
 */
describe('adoptRawJobsSidecar — fail-soft in every direction', () => {
  const SHA = 'c'.repeat(64);
  const job = {
    label: 'production',
    jobId: 'job-0001',
    requestBody: {},
    costing: { cost: 1, limit: 2 },
    cdsStamps: { created: null, started: null, finished: null },
    queueSeconds: null,
    runSeconds: null,
    resultHost: 'example.invalid',
    declaredSizeBytes: 1,
    downloadedBytes: 1,
    declaredChecksumMd5: 'd'.repeat(32),
    computedChecksumMd5: 'd'.repeat(32),
    checksumVerified: true,
    sha256: SHA,
    downloadMs: 1,
    decodeMs: 1,
    deleted: true,
  };
  const valid = JSON.stringify({
    schemaVersion: 1,
    generatedAtUtc: '2026-08-02T12:00:00.000Z',
    rawFileSha256: SHA,
    jobs: [job],
  });

  function adopt(contents: string | null): { jobs: unknown; warnings: string[] } {
    const warnings: string[] = [];
    const jobs = adoptRawJobsSidecar(contents, SHA, (message) => warnings.push(message));
    return { jobs, warnings };
  }

  it('adopts a well-formed sidecar that names the right raw file', () => {
    const { jobs, warnings } = adopt(valid);
    expect(jobs).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it('returns null and does NOT warn when there is no sidecar at all', () => {
    // The ordinary case: every raw file we hold today predates the mechanism. It must be silent,
    // not merely non-fatal, or the noise would train operators to ignore the channel.
    const { jobs, warnings } = adopt(null);
    expect(jobs).toBeNull();
    expect(warnings).toEqual([]);
  });

  it('returns null on invalid JSON', () => {
    const { jobs, warnings } = adopt('{not json');
    expect(jobs).toBeNull();
    expect(warnings[0]).toMatch(/not valid JSON/);
  });

  it('returns null on a JSON array or scalar', () => {
    expect(adopt('[]').jobs).toBeNull();
    expect(adopt('42').jobs).toBeNull();
  });

  it('returns null on an unknown schemaVersion', () => {
    const { jobs, warnings } = adopt(JSON.stringify({ ...JSON.parse(valid), schemaVersion: 2 }));
    expect(jobs).toBeNull();
    expect(warnings[0]).toMatch(/schemaVersion/);
  });

  it('REFUSES a sidecar belonging to a different raw file — evidence is never transplanted', () => {
    const { jobs, warnings } = adopt(
      JSON.stringify({ ...JSON.parse(valid), rawFileSha256: 'e'.repeat(64) }),
    );
    expect(jobs).toBeNull();
    expect(warnings[0]).toMatch(/never transplanted/);
  });

  it('returns null on an empty or non-array jobs list', () => {
    expect(adopt(JSON.stringify({ ...JSON.parse(valid), jobs: [] })).jobs).toBeNull();
    expect(adopt(JSON.stringify({ ...JSON.parse(valid), jobs: 'x' })).jobs).toBeNull();
  });

  it('returns null when an entry is not a job record', () => {
    const { jobs, warnings } = adopt(JSON.stringify({ ...JSON.parse(valid), jobs: [{ a: 1 }] }));
    expect(jobs).toBeNull();
    expect(warnings[0]).toMatch(/not a job record/);
  });
});

describe('the .jobs.json sidecar, end to end', () => {
  const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

  it('a LIVE run writes the sidecar beside the raw file, key-free', async () => {
    const run = await runAgainst({ payload });
    const sidecarPath = rawJobsSidecarPath(join(run.rawDir, RAW_FILE_NAME));
    const contents = await readFile(sidecarPath, 'utf8');
    expect(contents).not.toContain(KEY);
    const sidecar = JSON.parse(contents) as {
      schemaVersion: number;
      rawFileSha256: string;
      jobs: { jobId: string }[];
    };
    expect(sidecar.schemaVersion).toBe(1);
    expect(sidecar.rawFileSha256).toBe(createHash('sha256').update(payload).digest('hex'));
    // Both jobs of the run (production + fixture), so the evidence travels whole.
    expect(sidecar.jobs.length).toBeGreaterThan(0);
    expect(sidecar.jobs.every((entry) => entry.jobId.length > 0)).toBe(true);
  });

  it('an OFFLINE --from-file re-run recovers it into `recoveredJobs`, leaving `jobs` empty', async () => {
    const live = await runAgainst({ payload });
    const rawPath = join(live.rawDir, RAW_FILE_NAME);
    const base = await mkdtemp(join(tmpdir(), 'era5-sidecar-'));
    const originalLog = console.log;
    console.log = (): void => undefined;
    try {
      await runEra5FetchPhase({
        rawDir: join(base, 'raw'),
        outputDir: join(base, 'data'),
        fixtureDir: join(base, 'fixtures'),
        fromFile: rawPath,
        sleepImpl: () => Promise.resolve(),
        nowImpl: () => new Date('2026-08-02T12:00:00Z'),
        decodeImpl: () => buildSyntheticDecodedFile({ monthCount: 2 }),
      });
    } catch {
      // The assertion gate still fails on a 2-month synthetic decode; the `.part` is what matters.
    } finally {
      console.log = originalLog;
    }
    const manifest = JSON.parse(
      await readFile(join(base, 'data', `${MANIFEST_FILE_NAME}.part`), 'utf8'),
    ) as { sourceMode: string; jobs: unknown[]; recoveredJobs?: unknown[] };

    expect(manifest.sourceMode).toBe('from-file');
    // The honesty invariant is untouched: this run issued no jobs and claims none.
    expect(manifest.jobs).toEqual([]);
    // The evidence survives, in a field that says what it is.
    expect(manifest.recoveredJobs?.length).toBeGreaterThan(0);
  });

  it('an OFFLINE re-run with NO sidecar behaves exactly as before — no field, no failure', async () => {
    // The mandatory fail-soft property (→ DEC 2026-08-04c Q6), proved rather than commented: a
    // raw file with no sidecar is the case for every file we hold today.
    const base = await mkdtemp(join(tmpdir(), 'era5-nosidecar-'));
    const rawPath = join(base, RAW_FILE_NAME);
    await writeFile(rawPath, payload);
    const outputDir = join(base, 'data');
    const originalLog = console.log;
    console.log = (): void => undefined;
    try {
      await runEra5FetchPhase({
        rawDir: join(base, 'raw'),
        outputDir,
        fixtureDir: join(base, 'fixtures'),
        fromFile: rawPath,
        sleepImpl: () => Promise.resolve(),
        nowImpl: () => new Date('2026-08-02T12:00:00Z'),
        decodeImpl: () => buildSyntheticDecodedFile({ monthCount: 2 }),
      });
    } catch {
      // Assertion gate on a 2-month synthetic decode; irrelevant here.
    } finally {
      console.log = originalLog;
    }
    const manifest = JSON.parse(
      await readFile(join(outputDir, `${MANIFEST_FILE_NAME}.part`), 'utf8'),
    ) as Record<string, unknown>;
    expect(manifest.jobs).toEqual([]);
    expect('recoveredJobs' in manifest).toBe(false);
  });
});
