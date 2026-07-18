import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
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
      return { body: await response.text(), status: response.status };
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
  await mkdir(fragmentDir, { recursive: true });

  let consecutiveFailures = 0;

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
    await writeFile(
      join(fragmentDir, `k-a-${provinceKey.key.toLowerCase()}.tables.html`),
      `${fragments.join('\n')}\n`,
      'utf8',
    );
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
