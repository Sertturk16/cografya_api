import { describe, expect, it } from '@jest/globals';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertAllowedDownloadHost,
  buildCdsJsonHeaders,
  buildDownloadHeaders,
  CDS_OBJECT_STORE_HOST_ALLOWLIST,
  ERA5_MAX_DOWNLOAD_BYTES,
  Era5FetchError,
  FIXTURE_FILE_NAME,
  MANIFEST_FILE_NAME,
  RAW_FILE_NAME,
  redactCdsSecret,
  runEra5FetchPhase,
  SERIES_FILE_NAME,
} from './era5-fetch';
import { buildSyntheticDecodedFile } from './era5-fixture.builder';

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
      return Promise.resolve(
        json(
          {
            jobID: 'job-0001',
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
      return Promise.resolve(json({ status: 'dismissed' }));
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
}> {
  const base = await mkdtemp(join(tmpdir(), 'era5-fetch-'));
  const rawDir = join(base, 'raw');
  const outputDir = join(base, 'data');
  const fixtureDir = join(base, 'fixtures');
  const { fetchImpl, calls } = buildFakeCds(script);
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]): void => {
    logs.push(args.map((arg) => String(arg)).join(' '));
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
  }
  return { calls, rawDir, outputDir, fixtureDir, error, logs };
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
    const manifest = await readFile(join(outputDir, MANIFEST_FILE_NAME), 'utf8');
    const series = await readFile(join(outputDir, SERIES_FILE_NAME), 'utf8');
    expect(manifest).not.toContain(KEY);
    expect(series).not.toContain(KEY);
    expect(JSON.parse(manifest)).toMatchObject({ schemaVersion: 1, datasetId: expect.any(String) });
  });

  it('never prints key material', async () => {
    const { logs } = await runAgainst({ payload });
    expect(logs.join('\n')).not.toContain(KEY);
  });

  it('FAILS LOUDLY when the structural assertions do not pass, having written the evidence', async () => {
    // The synthetic decode yields 2 months, not 360, so `months-360` must fail.
    const { error, outputDir } = await runAgainst({ payload });
    expect(String(error)).toContain('assertion(s) FAILED');
    expect(String(error)).toContain('months-360');
    // The artifacts of a FAILED run are what explain the failure — they must still be on disk.
    await expect(readFile(join(outputDir, MANIFEST_FILE_NAME), 'utf8')).resolves.toContain(
      '"assertions"',
    );
  });

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
    await expect(readFile(join(base, 'data', MANIFEST_FILE_NAME), 'utf8')).resolves.toContain(
      '"schemaVersion"',
    );
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
      return readFile(join(base, 'data', SERIES_FILE_NAME), 'utf8');
    };
    expect(await readAgain()).toBe(await readAgain());
  });
});
