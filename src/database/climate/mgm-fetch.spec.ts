import { beforeEach, describe, expect, it } from '@jest/globals';
import { access, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ClimateNormalsArtifact } from './climate-artifact.types';
import { runFetchPhase } from './mgm-fetch';

/**
 * Unit coverage for the fetch phase's ORCHESTRATION — completeness, artifact hygiene and the
 * response cap. The parser has its own suite; nothing here re-tests parsing.
 *
 * The module ships `fetchImpl`/`sleepImpl` injection seams built for exactly this, so the
 * whole 81-province run executes offline and instantly. That matters because the logic being
 * proven — the completeness gate, the circuit breaker's blind spot, the fragment
 * reconciliation — is precisely what nobody can observe during the real run: it happens once a
 * year, unattended, and its only other signal is a `console.log`.
 *
 * Structural only (CONVENTIONS §2): the assertions are about counts, file sets and error
 * behaviour, never about any province's climate.
 */

const FIXTURE_DIR = join(__dirname, '..', '..', '..', 'test', 'fixtures', 'mgm');
const NAV_HTML = readFileSync(join(FIXTURE_DIR, 'nav-iller.html'), 'utf8');
const PAGE_HTML = readFileSync(join(FIXTURE_DIR, 'k-a-icel.tables.html'), 'utf8');
const PROVINCE_COUNT = 81;

/** The parser cross-checks the table's header cell against the requested key, so the fixture's
 * `ICEL` header is rewritten to whichever key the URL asked for. This is a transport-level
 * stand-in for 81 real pages, not a claim about any province's data. */
function pageFor(mgmKey: string): string {
  return PAGE_HTML.replace('>ICEL</th>', `>${mgmKey}</th>`);
}

function keyFromUrl(url: string): string {
  return new URL(url).searchParams.get('m') ?? '';
}

interface StubOptions {
  /** Province indexes (0-based, in nav order) whose page requests always fail. */
  failAtProvinceIndexes?: number[];
}

/**
 * A `fetch` stand-in. The FIRST call is the bootstrap request for MGM's province-key
 * dictionary; every later call is a province page.
 */
function makeFetchStub(options: StubOptions = {}): typeof fetch {
  const failures = new Set(options.failAtProvinceIndexes ?? []);
  let callIndex = 0;
  // Attempts are retried up to 3x per page, so failures are keyed by PROVINCE, not by call.
  const seenKeys: string[] = [];

  return (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (callIndex++ === 0) {
      return Promise.resolve(new Response(NAV_HTML, { status: 200 }));
    }

    const key = keyFromUrl(url);
    if (!seenKeys.includes(key)) seenKeys.push(key);
    const provinceIndex = seenKeys.indexOf(key);
    if (failures.has(provinceIndex)) {
      return Promise.resolve(new Response('upstream error', { status: 500 }));
    }
    return Promise.resolve(new Response(pageFor(key), { status: 200 }));
  };
}

const noSleep = (): Promise<void> => Promise.resolve();

describe('runFetchPhase', () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'mgm-fetch-'));
  });

  it('writes one artifact entry and one fragment per province when every page succeeds', async () => {
    await runFetchPhase({ outputDir, fetchImpl: makeFetchStub(), sleepImpl: noSleep });

    const normals = JSON.parse(
      await readFile(join(outputDir, 'climate-normals.json'), 'utf8'),
    ) as ClimateNormalsArtifact;
    expect(normals.entries).toHaveLength(PROVINCE_COUNT);
    // Plate codes must be unique — a mapping collision would silently overwrite a province.
    expect(new Set(normals.entries.map((entry) => entry.plateCode)).size).toBe(PROVINCE_COUNT);
    expect(await readdir(join(outputDir, 'fragments'))).toHaveLength(PROVINCE_COUNT);
  }, 60_000);

  it('REGRESSION (I1): scattered, NON-CONSECUTIVE failures abort instead of shipping a partial artifact', async () => {
    // The circuit breaker only counts CONSECUTIVE failures and resets on the next success, so
    // these two never trip it. Before the completeness gate, this run wrote 79 provinces to a
    // committed artifact and exited 0 — and the two absent provinces would then keep a NULL
    // series forever, with no error at any layer.
    const fragmentDir = join(outputDir, 'fragments');
    await mkdir(fragmentDir, { recursive: true });
    await writeFile(join(fragmentDir, 'k-a-previous.tables.html'), 'last year\n', 'utf8');

    const run = runFetchPhase({
      outputDir,
      fetchImpl: makeFetchStub({ failAtProvinceIndexes: [12, 40] }),
      sleepImpl: noSleep,
    });

    await expect(run).rejects.toThrow(/INCOMPLETE RUN — 79\/81/);
    // Nothing may be written: an artifact is the thing a human later reviews, and a partial
    // one is indistinguishable from a complete one.
    await expect(access(join(outputDir, 'climate-normals.json'))).rejects.toThrow();
    await expect(access(join(outputDir, 'climate-manifest.json'))).rejects.toThrow();
    // …and the previous run's audit trail must survive intact, not be half-overwritten by
    // the provinces that happened to succeed before the gate rejected the run.
    expect(await readdir(fragmentDir)).toEqual(['k-a-previous.tables.html']);
  }, 60_000);

  it('names the absent provinces in the failure, so the operator does not diff 0.5 MB of JSON', async () => {
    const run = runFetchPhase({
      outputDir,
      fetchImpl: makeFetchStub({ failAtProvinceIndexes: [12] }),
      sleepImpl: noSleep,
    });
    // Two plate codes' worth of detail is the difference between a re-run and an investigation.
    await expect(run).rejects.toThrow(/Absent: \d{2} \S+/);
  }, 60_000);

  it('REGRESSION (I7): a stale fragment from a previous run is removed, not left to inflate the file count', async () => {
    // A province dropped in year N left year N−1's file on disk and in git, so the directory
    // listed 81 files while the artifact held 79 — defeating the very human-review signal that
    // the completeness gate's absence was defended by.
    const fragmentDir = join(outputDir, 'fragments');
    await mkdir(fragmentDir, { recursive: true });
    await writeFile(join(fragmentDir, 'k-a-obsolete.tables.html'), '<table></table>\n', 'utf8');

    await runFetchPhase({ outputDir, fetchImpl: makeFetchStub(), sleepImpl: noSleep });

    const fragments = await readdir(fragmentDir);
    expect(fragments).not.toContain('k-a-obsolete.tables.html');
    expect(fragments).toHaveLength(PROVINCE_COUNT);
  }, 60_000);

  it('refuses a response larger than the cap instead of buffering it into memory', async () => {
    // Driven through the BODY STREAM rather than a `Content-Length` header on purpose: the
    // header is only a hint (absent on a chunked response, and a server may lie), so the
    // metered read is the half that actually enforces the cap and is the half worth testing.
    // A fresh Response per call because each retry consumes the stream.
    const oversized = ((): Promise<Response> => {
      const megabyte = new Uint8Array(1024 * 1024);
      let emitted = 0;
      return Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              if (emitted >= 9) {
                controller.close();
                return;
              }
              emitted += 1;
              controller.enqueue(megabyte);
            },
          }),
          { status: 200 },
        ),
      );
    }) as typeof fetch;

    // `AbortSignal.timeout` bounds wall-clock, not payload; without the cap a fast, huge
    // response inside the 30 s window is read in full.
    await expect(
      runFetchPhase({ outputDir, fetchImpl: oversized, sleepImpl: noSleep }),
    ).rejects.toThrow(/cap/);
  }, 60_000);
});
