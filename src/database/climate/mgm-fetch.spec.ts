import { beforeEach, describe, expect, it } from '@jest/globals';
import { access, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ClimateManifestArtifact, ClimateNormalsArtifact } from './climate-artifact.types';
import { assertArtifactsCorroborate } from './climate-assertions';
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

/**
 * Like `makeFetchStub`, but corrupts the page served for the FIRST `corruptCount` provinces.
 *
 * Used to drive the anomaly threshold from both sides. The mutation is applied to the transport
 * response, so the production parse/validate/threshold path runs exactly as it would against a
 * real MGM page that carried a bad cell.
 */
function makeMutatingStub(corruptCount: number, corrupt: (html: string) => string): typeof fetch {
  let callIndex = 0;
  const seenKeys: string[] = [];

  return (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (callIndex++ === 0) {
      return Promise.resolve(new Response(NAV_HTML, { status: 200 }));
    }

    const key = keyFromUrl(url);
    if (!seenKeys.includes(key)) seenKeys.push(key);
    const html = pageFor(key);
    const shouldCorrupt = seenKeys.indexOf(key) < corruptCount;
    return Promise.resolve(new Response(shouldCorrupt ? corrupt(html) : html, { status: 200 }));
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
    // response inside the timeout window is read in full.
    await expect(
      runFetchPhase({ outputDir, fetchImpl: oversized, sleepImpl: noSleep }),
    ).rejects.toThrow(/cap/);
  }, 60_000);

  /**
   * The anomaly threshold. Its whole purpose is to distinguish "one MGM cell is wrong" (absorb
   * it, record it, carry on) from "the source has broken" (stop before writing anything), so
   * both sides of that line need pinning.
   */
  it('records a handful of impossible values, publishes none of them, and still completes', async () => {
    // Two provinces' snow records made negative — under the threshold.
    const withAnomalies = makeMutatingStub(2, (html) =>
      html.replace(/<b>\s*\d+(?:,\d+)?\s*cm/, '<b>-1 cm'),
    );

    await runFetchPhase({ outputDir, fetchImpl: withAnomalies, sleepImpl: noSleep });

    const manifest = JSON.parse(
      await readFile(join(outputDir, 'climate-manifest.json'), 'utf8'),
    ) as ClimateManifestArtifact;
    const normals = JSON.parse(
      await readFile(join(outputDir, 'climate-normals.json'), 'utf8'),
    ) as ClimateNormalsArtifact;

    // Recorded, with the evidence…
    expect(manifest.anomalies).toHaveLength(2);
    for (const anomaly of manifest.anomalies) {
      expect(anomaly.plateCode.length).toBeGreaterThan(0);
      expect(anomaly.rawCell).toContain('-1');
    }
    // …never published…
    for (const entry of normals.entries) {
      for (const record of Object.values(entry.normals.records)) {
        if (record !== null) expect(record.value).toBeGreaterThanOrEqual(0);
      }
    }
    // …and the other 79 provinces are unharmed.
    expect(normals.entries).toHaveLength(PROVINCE_COUNT);
  }, 60_000);

  it('REGRESSION (I1): an impossible CORE value costs one province, not the whole run', async () => {
    // The mechanism advertises "the value is dropped, the rest of the province is kept" — but
    // `precipitationMm` is one of the two all-or-nothing core fields, so nulling it made the
    // province unpublishable and `assertClimateNormalsShape` then aborted the entire
    // ~70-minute, 81-province run. The mechanism defeated its own purpose on one of the four
    // cases it claims to cover, and the crash never named the anomaly that caused it.
    //
    // Ruled outcome: that province becomes UNPUBLISHABLE (a state the design already supports —
    // the page renders no climate section) and the run continues.
    const negativePrecipitation = makeMutatingStub(1, (html) =>
      // January's precipitation cell only. The label carries a nested `<span>` for its unit, so
      // the match runs from the row heading to its first `<td>` rather than assuming they are
      // adjacent.
      html.replace(/(Aylık Toplam Yağış Miktarı Ortalaması[\s\S]*?<td[^>]*>)([^<]*)/, '$1-5,0'),
    );

    await runFetchPhase({ outputDir, fetchImpl: negativePrecipitation, sleepImpl: noSleep });

    const manifest = JSON.parse(
      await readFile(join(outputDir, 'climate-manifest.json'), 'utf8'),
    ) as ClimateManifestArtifact;
    const normals = JSON.parse(
      await readFile(join(outputDir, 'climate-normals.json'), 'utf8'),
    ) as ClimateNormalsArtifact;

    // Exactly one province withheld, and WHY is recorded rather than left to be inferred from
    // its absence — an undeclared gap is the thing the completeness gate exists to refuse.
    expect(manifest.unpublishable).toHaveLength(1);
    expect(manifest.unpublishable?.[0]?.reason).toMatch(/core pair incomplete/);

    // Its provenance survives: we fetched the page, we simply chose not to publish it.
    expect(manifest.entries).toHaveLength(PROVINCE_COUNT);
    const withheld = manifest.unpublishable?.[0]?.plateCode;
    expect(manifest.entries.some((entry) => entry.plateCode === withheld)).toBe(true);

    // …and the other 80 provinces shipped, which is the entire point.
    expect(normals.entries).toHaveLength(PROVINCE_COUNT - 1);
    expect(normals.entries.some((entry) => entry.plateCode === withheld)).toBe(false);

    // The two phases must actually meet. The load phase refuses a withheld province unless a
    // VERIFIED core-pair anomaly stands behind it, so a fetch that withholds without leaving that
    // evidence would produce an artifact its own loader rejects — the ruled outcome would be
    // unreachable in practice, which is exactly the trap this design walked into once already.
    expect(() => assertArtifactsCorroborate(normals, manifest)).not.toThrow();
    expect(
      manifest.anomalies.some(
        (anomaly) => anomaly.plateCode === withheld && anomaly.field === 'precipitationMm',
      ),
    ).toBe(true);
  }, 60_000);

  it('REGRESSION (C1): every page is stamped no later than the artifact itself', async () => {
    // `generatedAtUtc` used to be captured BEFORE the ~70-minute loop, so it necessarily preceded
    // every `fetchedAtUtc` — the artifact was labelled with the run's start, and the ordering
    // could not be asserted anywhere. Captured after the completeness gate it means what its
    // name says, and `assertArtifactsCorroborate` can enforce it.
    await runFetchPhase({ outputDir, fetchImpl: makeFetchStub(), sleepImpl: noSleep });

    const manifest = JSON.parse(
      await readFile(join(outputDir, 'climate-manifest.json'), 'utf8'),
    ) as ClimateManifestArtifact;

    const generatedAt = Date.parse(manifest.generatedAtUtc);
    for (const entry of manifest.entries) {
      expect(Date.parse(entry.fetchedAtUtc)).toBeLessThanOrEqual(generatedAt);
    }
  }, 60_000);

  it('reads every provenance stamp from the injected clock, so a replay is reproducible', async () => {
    // The seam that was missing when this PR's artifacts were produced. Without it, replaying the
    // parse over locally cached pages required patching this file — which is how a committed
    // artifact came to be produced by code that was not in the repository, while the README said
    // otherwise. A yearly job whose output cannot be regenerated by the code shipped beside it
    // has no provenance story at all.
    const fixedInstant = new Date('2020-01-02T03:04:05.000Z');

    await runFetchPhase({
      outputDir,
      fetchImpl: makeFetchStub(),
      sleepImpl: noSleep,
      nowImpl: () => fixedInstant,
    });

    const manifest = JSON.parse(
      await readFile(join(outputDir, 'climate-manifest.json'), 'utf8'),
    ) as ClimateManifestArtifact;

    expect(manifest.generatedAtUtc).toBe(fixedInstant.toISOString());
    for (const entry of manifest.entries) {
      expect(entry.fetchedAtUtc).toBe(fixedInstant.toISOString());
    }
  }, 60_000);

  it('ABORTS without writing anything when impossible values pass the threshold', async () => {
    // Enough anomalies to mean "the source has broken", not "a cell is wrong".
    const manyAnomalies = makeMutatingStub(20, (html) =>
      html.replace(/<b>\s*\d+(?:,\d+)?\s*cm/, '<b>-1 cm'),
    );

    await expect(
      runFetchPhase({ outputDir, fetchImpl: manyAnomalies, sleepImpl: noSleep }),
    ).rejects.toThrow(/above the threshold/);

    // The same all-or-nothing guarantee the completeness gate gives: a refused run leaves the
    // previous artifacts untouched rather than half-rewritten.
    await expect(readFile(join(outputDir, 'climate-normals.json'), 'utf8')).rejects.toThrow();
  }, 60_000);
});
