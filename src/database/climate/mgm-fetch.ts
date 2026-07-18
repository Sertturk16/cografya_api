import { createHash } from 'node:crypto';
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CLIMATE_SOURCE_MGM_GENERAL } from '../../province/province.types';
import { SEED_PROVINCES } from '../seeds/province.seed-data';
import type {
  ClimateManifestArtifact,
  ClimateManifestEntry,
  ClimateNormalsArtifact,
  ClimateNormalsEntry,
} from './climate-artifact.types';
import { assertClimateNormalsShape, assertDecimalRoundTrip } from './climate-assertions';
import { parseMgmGeneralStatisticsPage, parseMgmProvinceKeys } from './mgm-parser';

/**
 * `--phase=fetch` — the ONLY phase that touches the network.
 *
 * Run by hand, roughly yearly (PLAN.md §6), never by CI and never by the running app. It
 * writes three reviewable artifacts and stops; nothing here can reach the database.
 *
 * ## Politeness and blast-radius limits, all deliberate
 * MGM is a public institution serving us for free with no API and no permission granted
 * (→ DEC 2026-07-18f). This client is therefore conservative on every axis:
 *   - **Serial**, never parallel — one request in flight, ever.
 *   - **≥ 3 s between requests**, so 81 pages take ~5 minutes rather than hammering.
 *   - **30 s timeout** per request via `AbortSignal.timeout` — no unbounded external call
 *     (repo CLAUDE §3.5).
 *   - **2 retries** with a longer pause, for transient failures only.
 *   - **An identifying User-Agent** — we do not pretend to be a browser.
 *   - **A 3-consecutive-failure circuit breaker** that aborts the whole run. If MGM has
 *     started refusing us, the correct behaviour is to stop, not to grind through 81 pages
 *     collecting errors.
 *
 * ## What it does NOT do
 * No secrets, no API keys, no credentials: this is a plain public HTML page (repo CLAUDE
 * §3.7 is satisfied trivially, but stated so a future editor does not add one).
 */

const MGM_BASE_URL = 'https://www.mgm.gov.tr/veridegerlendirme/il-ve-ilceler-istatistik.aspx';

/** Identify ourselves honestly; a contact URL is expected of any polite crawler. */
const USER_AGENT =
  'CografyaPlatformBot/1.0 (climate normals import; yearly; contact via https://www.mgm.gov.tr)';

const REQUEST_TIMEOUT_MS = 30_000;
/**
 * Hard cap on a single response body. A `k=A` page is ~364 KB, so 8 MB is ~22x headroom and
 * still bounds the process.
 *
 * `AbortSignal.timeout` bounds WALL-CLOCK, not payload: a fast multi-gigabyte response inside
 * the 30 s window would be buffered fully into memory by `response.text()` and OOM the run.
 * Scored honestly, the realistic trigger here is "MGM misbehaves or a captive portal answers",
 * not an adversary — this is a hand-run developer script against one hardcoded HTTPS URL — but
 * "no unbounded external call, ever" (repo CLAUDE §3.5) is a rule, not a risk assessment.
 */
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const DELAY_BETWEEN_REQUESTS_MS = 3_000;
const RETRY_DELAY_MS = 10_000;
const MAX_ATTEMPTS_PER_PAGE = 3;
const MAX_CONSECUTIVE_FAILURES = 3;

export interface FetchPhaseOptions {
  /** Directory the three artifacts are written to. */
  outputDir: string;
  /** Injected for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injected for tests; defaults to a real timer. */
  sleepImpl?: (ms: number) => Promise<void>;
}

export function buildMgmUrl(mgmKey: string): string {
  return `${MGM_BASE_URL}?k=A&m=${mgmKey}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FetchedPage {
  body: string;
  status: number;
}

/**
 * Read a response body with a hard byte cap.
 *
 * `Content-Length` is checked first because it lets us refuse before reading anything — but it
 * is only a hint (it is absent on a chunked response and a server may simply lie), so the
 * stream itself is metered as well. That second half is the one that actually enforces the
 * cap; the header check is the cheap early exit.
 */
async function readBodyCapped(response: Response, url: string): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length') ?? Number.NaN);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error(
      `${url} declares Content-Length ${declaredLength} B, above the ${MAX_RESPONSE_BYTES} B cap.`,
    );
  }

  const body = response.body;
  // A body-less response cannot exceed the cap; `text()` is safe and keeps this working under
  // a `fetchImpl` stub that returns a plain `Response` without a stream.
  if (body === null) return response.text();

  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  const chunks: string[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        throw new Error(
          `${url} exceeded the ${MAX_RESPONSE_BYTES} B response cap — aborting the read.`,
        );
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    // Releases the connection on the throw path too, so a capped read cannot leak a socket.
    await reader.cancel().catch(() => undefined);
  }

  chunks.push(decoder.decode());
  return chunks.join('');
}

async function fetchPage(
  url: string,
  fetchImpl: typeof fetch,
  sleepImpl: (ms: number) => Promise<void>,
): Promise<FetchedPage> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_PAGE; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'follow',
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      return { body: await readBodyCapped(response, url), status: response.status };
    } catch (error: unknown) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS_PER_PAGE) {
        console.warn(`[db:import:climate] attempt ${attempt} failed for ${url} — retrying:`, error);
        await sleepImpl(RETRY_DELAY_MS);
      }
    }
  }

  throw new Error(
    `Failed to fetch ${url} after ${MAX_ATTEMPTS_PER_PAGE} attempts: ${String(lastError)}`,
  );
}

/**
 * Fetch, parse and validate all 81 provinces, then write the artifacts.
 *
 * NOTE (PR A1a): this function is the SKELETON — it is complete and reviewable, but it has
 * not been executed. The actual run, its committed artifacts and their review are PR A1b.
 */
export async function runFetchPhase(options: FetchPhaseOptions): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? sleep;
  const generatedAtUtc = new Date().toISOString();

  // Step 1: read MGM's own province-key dictionary off any one of its pages, so no key is
  // ever guessed from a province name (Mersin's key is `ICEL`).
  const seedByName = new Map(SEED_PROVINCES.map((province) => [province.nameTr, province]));
  const bootstrapPage = await fetchPage(buildMgmUrl('ANKARA'), fetchImpl, sleepImpl);
  const provinceKeys = parseMgmProvinceKeys(bootstrapPage.body);

  const unmatched = provinceKeys.filter((entry) => !seedByName.has(entry.nameTr));
  if (unmatched.length > 0) {
    throw new Error(
      `[db:import:climate] MGM lists province name(s) we do not seed: ` +
        `${unmatched.map((entry) => `${entry.nameTr} (${entry.key})`).join(', ')}. ` +
        `Resolve the naming mismatch rather than skipping the province.`,
    );
  }

  const normalsEntries: ClimateNormalsEntry[] = [];
  const manifestEntries: ClimateManifestEntry[] = [];
  const fragmentDir = join(options.outputDir, 'fragments');

  let consecutiveFailures = 0;
  const failures: { plateCode: string; nameTr: string }[] = [];
  // Fragments are BUFFERED, not streamed to disk, so that a run which fails the completeness
  // gate below leaves the previous year's audit trail completely untouched rather than half
  // overwritten. ~0.5 MB across 81 provinces — the whole point of committing the table
  // fragments instead of the 29 MB of raw pages.
  const fragmentsByFile = new Map<string, string>();

  for (const [index, provinceKey] of provinceKeys.entries()) {
    const province = seedByName.get(provinceKey.nameTr);
    if (!province) {
      throw new Error(`[db:import:climate] no seeded province for ${provinceKey.nameTr}.`);
    }

    if (index > 0) await sleepImpl(DELAY_BETWEEN_REQUESTS_MS);
    const url = buildMgmUrl(provinceKey.key);

    let page: FetchedPage;
    try {
      page = await fetchPage(url, fetchImpl, sleepImpl);
      consecutiveFailures = 0;
    } catch (error: unknown) {
      consecutiveFailures += 1;
      failures.push({ plateCode: province.plateCode, nameTr: province.nameTr });
      console.error(`[db:import:climate] ${province.plateCode} ${province.nameTr} failed:`, error);
      // The circuit breaker: three in a row means MGM is refusing or down. Stop the run
      // instead of producing a partial artifact that looks like a complete one.
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        throw new Error(
          `[db:import:climate] aborting: ${MAX_CONSECUTIVE_FAILURES} consecutive fetch failures.`,
          { cause: error },
        );
      }
      continue;
    }

    // Parsing throws on any structural surprise — no catch-and-skip here on purpose.
    const parsed = parseMgmGeneralStatisticsPage(page.body, {
      mgmKey: provinceKey.key,
      sourceUrl: url,
    });

    // Validate BEFORE writing an artifact, so a bad page never reaches a committed file.
    assertClimateNormalsShape(province.plateCode, parsed.normals);
    assertDecimalRoundTrip(
      province.plateCode,
      parsed.normals,
      parsed.raw.metricRows,
      parsed.raw.recordCells,
    );

    normalsEntries.push({ plateCode: province.plateCode, normals: parsed.normals });
    manifestEntries.push({
      plateCode: province.plateCode,
      mgmKey: provinceKey.key,
      mgmNameTr: provinceKey.nameTr,
      url,
      fetchedAtUtc: new Date().toISOString(),
      httpStatus: page.status,
      pageSha256: createHash('sha256').update(page.body, 'utf8').digest('hex'),
      periodStartYear: parsed.normals.periodStartYear,
      periodEndYear: parsed.normals.periodEndYear,
      rawMetricRows: parsed.raw.metricRows,
      rawRecordCells: parsed.raw.recordCells,
    });

    // The audit trail is the TABLE FRAGMENT, not the 364 KB page: ~0.5 MB total across 81
    // provinces instead of ~29 MB, and the sha256 above still pins the full response.
    const fragments = [...page.body.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map((m) => m[0]);
    fragmentsByFile.set(
      `k-a-${provinceKey.key.toLowerCase()}.tables.html`,
      `${fragments.join('\n')}\n`,
    );
  }

  // COMPLETENESS GATE — nothing is written until all 81 provinces are in hand.
  //
  // The circuit breaker above only catches CONSECUTIVE failures, and `consecutiveFailures`
  // resets to 0 on the next success: a 500 on province 12 and another on province 40 across an
  // unattended ~5-minute run never trips it, and both provinces would simply be absent from
  // the artifacts, which were then written with the process exiting 0. Nothing downstream
  // catches that either — the load phase's old check ran the OPPOSITE direction, and a
  // province dropped here keeps `climate_normals = NULL` forever with no error at any layer.
  //
  // The end-of-run `console.log` was the only signal, which is a hope, not a gate.
  if (normalsEntries.length !== provinceKeys.length) {
    throw new Error(
      `[db:import:climate] INCOMPLETE RUN — ${normalsEntries.length}/${provinceKeys.length} ` +
        `provinces fetched. Absent: ` +
        `${failures.map((failure) => `${failure.plateCode} ${failure.nameTr}`).join(', ')}. ` +
        `Refusing to write a partial artifact: an absent province is invisible after this ` +
        `point. Re-run the fetch phase.`,
    );
  }

  // Write the fragment directory as a SET: exactly this run's files, nothing else. Fragments
  // were previously only ever written, never reconciled — so a province dropped in year N left
  // year N−1's file on disk and in git, the directory listing showed 81 files when the artifact
  // held 79, and the stale file's sha256 corresponded to no manifest row. That is what defeated
  // the human-review signal exactly in the yearly re-run this script is written for.
  await mkdir(fragmentDir, { recursive: true });
  for (const [file, contents] of fragmentsByFile) {
    await writeFile(join(fragmentDir, file), contents, 'utf8');
  }
  for (const existing of await readdir(fragmentDir)) {
    if (!fragmentsByFile.has(existing)) {
      console.warn(`[db:import:climate] removing stale fragment ${existing}`);
      await unlink(join(fragmentDir, existing));
    }
  }

  const normalsArtifact: ClimateNormalsArtifact = {
    generatedAtUtc,
    source: CLIMATE_SOURCE_MGM_GENERAL,
    entries: normalsEntries,
  };
  const manifestArtifact: ClimateManifestArtifact = {
    generatedAtUtc,
    source: CLIMATE_SOURCE_MGM_GENERAL,
    userAgent: USER_AGENT,
    entries: manifestEntries,
  };

  await writeFile(
    join(options.outputDir, 'climate-normals.json'),
    `${JSON.stringify(normalsArtifact, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    join(options.outputDir, 'climate-manifest.json'),
    `${JSON.stringify(manifestArtifact, null, 2)}\n`,
    'utf8',
  );

  console.log(
    `[db:import:climate] fetch done — ${normalsEntries.length}/${provinceKeys.length} provinces ` +
      `written to ${options.outputDir}`,
  );
}
