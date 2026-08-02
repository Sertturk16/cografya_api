import { createHash } from 'node:crypto';
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CLIMATE_SOURCE_MGM_GENERAL } from '../../province/province.types';
import { SEED_PROVINCES } from '../seeds/province.seed-data';
import type {
  ClimateAnomaly,
  ClimateManifestArtifact,
  ClimateManifestEntry,
  ClimateNormalsArtifact,
  ClimateNormalsEntry,
  ClimateUnpublishableProvince,
} from './climate-artifact.types';
import {
  CORE_PAIR_FIELDS,
  assertClimateNormalsShape,
  assertDecimalRoundTrip,
  findUnpublishableReason,
} from './climate-assertions';
import {
  parseMgmGeneralStatisticsPage,
  parseMgmProvinceKeys,
  type MgmParseResult,
} from './mgm-parser';

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
 *   - **≥ 5 s between requests** rather than hammering. Budget **~70 minutes** for the 81 pages:
 *     MGM degrades to ~50 s/page under sustained access (measured 2026-07-18), so the wall-clock
 *     cost is dominated by MGM's own pace, not by this delay.
 *   - **60 s timeout** per request via `AbortSignal.timeout` — no unbounded external call
 *     (repo CLAUDE §3.5). See `REQUEST_TIMEOUT_MS` for why it is not 30 s.
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

/**
 * Identify ourselves honestly.
 *
 * NO `contact via <url>` claim. It used to read `contact via https://www.mgm.gov.tr` — MGM's own
 * homepage, which gives them no way to reach us about this bot and is therefore a contact channel
 * that only looks like one (review of PR #72, where the marine probe copied this string verbatim;
 * both are fixed together).
 *
 * TODO(contact): publish a real Coğrafya-owned contact URL or mailbox once one exists. It does
 * not today — the domain and hosting are still undecided — and inventing one, or committing a
 * personal address, is an owner decision rather than an engineering one.
 *
 * NOTE: the committed manifest keeps the user agent of the run that produced it, so
 * `data/climate/climate-manifest.json` still records the old string. That is correct provenance,
 * not drift — the next `--phase=fetch` run will record this one.
 */
const USER_AGENT =
  'CografyaPlatformBot/1.0 (educational geography platform; ' +
  'climate normals import; run by hand, yearly)';

/**
 * 60 s, not 30 s. Measured, not guessed: during the 2026-07-18 run MGM served the first ~90
 * requests in ~3-4 s each and then degraded to ~50 s per page for the rest of the session. At a
 * 30 s timeout that degradation cost two spurious failures (Bolu, Karaman) which only the retry
 * saved — and three such pages in a row would have tripped the circuit breaker and aborted an
 * otherwise healthy run. A longer ceiling is also the POLITER choice: it waits for a slow server
 * instead of hanging up and asking again.
 */
const REQUEST_TIMEOUT_MS = 60_000;
/**
 * Hard cap on a single response body. A `k=A` page is ~364 KB, so 8 MB is ~22x headroom and
 * still bounds the process.
 *
 * `AbortSignal.timeout` bounds WALL-CLOCK, not payload: a fast multi-gigabyte response inside
 * the timeout window would be buffered fully into memory by `response.text()` and OOM the run.
 * Scored honestly, the realistic trigger here is "MGM misbehaves or a captive portal answers",
 * not an adversary — this is a hand-run developer script against one hardcoded HTTPS URL — but
 * "no unbounded external call, ever" (repo CLAUDE §3.5) is a rule, not a risk assessment.
 */
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
/**
 * 5 s, not 3 s. MGM visibly throttles sustained access (see `REQUEST_TIMEOUT_MS`); backing off
 * is both the courteous response and the one that makes the yearly run finish.
 */
const DELAY_BETWEEN_REQUESTS_MS = 5_000;
const RETRY_DELAY_MS = 10_000;
const MAX_ATTEMPTS_PER_PAGE = 3;
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * How many physically-impossible source values the run tolerates before it aborts.
 *
 * The threshold is the whole point of the anomaly mechanism: it separates "one MGM cell is
 * wrong" from "MGM's data has broken". A single bad cell must not block 81 provinces — but a
 * systemic breakage must not be absorbed into a quiet pile of nulls either. The 2026-07-18
 * harvest found exactly ONE anomaly across all 81 provinces, so 5 is comfortable headroom over
 * observed reality while still being nowhere near "something is badly wrong".
 *
 * If a future run trips this, the correct response is to investigate MGM, NOT to raise the number.
 */
const MAX_ANOMALIES = 5;

export interface FetchPhaseOptions {
  /** Directory the three artifacts are written to. */
  outputDir: string;
  /** Injected for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injected for tests; defaults to a real timer. */
  sleepImpl?: (ms: number) => Promise<void>;
  /**
   * The clock every provenance stamp is read from. Injected for tests — and, just as
   * importantly, so that a REPLAY over locally cached pages is reproducible by committed code.
   *
   * This seam is not decoration. PR A1b's artifacts were produced by a live harvest followed by
   * a replay through the parser, with the per-page `fetchedAtUtc` values carried over from the
   * harvest. With no clock seam that replay could only be done by patching this file, which
   * meant the committed artifact was produced by code that was not in the repository — and the
   * README claimed it came from a plain `--phase=fetch` run. A yearly job whose artifacts cannot
   * be regenerated by the code that ships alongside them has no provenance story at all.
   */
  nowImpl?: () => Date;
}

export function buildMgmUrl(mgmKey: string): string {
  return `${MGM_BASE_URL}?k=A&m=${mgmKey}`;
}

/**
 * The audit trail is the TABLE FRAGMENT, not the 364 KB page: ~0.5 MB total across 81 provinces
 * instead of ~29 MB, and the manifest's sha256 still pins the full response.
 */
function extractTableFragments(pageBody: string): string {
  const fragments = [...pageBody.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map(
    (match) => match[0],
  );
  return `${fragments.join('\n')}\n`;
}

/**
 * Provenance for one fetched page.
 *
 * Written for BOTH outcomes — a published province and a declared-unpublishable one — because a
 * province we chose not to publish still has to carry the evidence for that choice. Extracted so
 * the two call sites cannot drift into recording different things.
 */
function buildManifestEntry(
  plateCode: string,
  provinceKey: { key: string; nameTr: string },
  url: string,
  page: FetchedPage,
  parsed: MgmParseResult,
  nowImpl: () => Date,
): ClimateManifestEntry {
  return {
    plateCode,
    mgmKey: provinceKey.key,
    mgmNameTr: provinceKey.nameTr,
    url,
    fetchedAtUtc: nowImpl().toISOString(),
    httpStatus: page.status,
    pageSha256: createHash('sha256').update(page.body, 'utf8').digest('hex'),
    periodStartYear: parsed.normals.periodStartYear,
    periodEndYear: parsed.normals.periodEndYear,
    rawMetricRows: parsed.raw.metricRows,
    rawRecordCells: parsed.raw.recordCells,
  };
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
 * Executed for real on 2026-07-18 (PR A1b); `data/climate/` holds that run's output. See
 * `data/climate/README.md` for how those specific files were produced — it was not a single
 * clean invocation of this function, and the README says so.
 */
export async function runFetchPhase(options: FetchPhaseOptions): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? sleep;
  const nowImpl = options.nowImpl ?? ((): Date => new Date());

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
  let pagesFetched = 0;
  const failures: { plateCode: string; nameTr: string }[] = [];
  const anomalies: ClimateAnomaly[] = [];
  const unpublishable: ClimateUnpublishableProvince[] = [];
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

    // The parser has already nulled anything physically impossible; record what it refused, with
    // the province attached, so the manifest can carry the evidence.
    for (const anomaly of parsed.anomalies) {
      anomalies.push({ plateCode: province.plateCode, ...anomaly });
      console.warn(
        `[db:import:climate] ANOMALY ${province.plateCode} ${province.nameTr} — ` +
          `"${anomaly.sourceLabel}" = ${JSON.stringify(anomaly.rawCell)}: ${anomaly.reason}. ` +
          `Value dropped; the rest of the province is kept.`,
      );
    }
    // A pile of these is a different event from one of them — stop before writing anything.
    if (anomalies.length > MAX_ANOMALIES) {
      throw new Error(
        `[db:import:climate] ABORTING — ${anomalies.length} impossible values found, above the ` +
          `threshold of ${MAX_ANOMALIES}. One bad cell is MGM having a bad day; this many means ` +
          `the source has changed or broken. Investigate MGM before raising this number.\n` +
          anomalies
            .map((a) => `  - ${a.plateCode} "${a.sourceLabel}" = ${JSON.stringify(a.rawCell)}`)
            .join('\n'),
      );
    }

    // An anomaly on a CORE-PAIR field is the one case where refusing a value costs us the whole
    // province: `precipitationMm` is nulled, and the all-or-nothing rule (PLAN §1) then makes the
    // series unpublishable. Before this branch existed, `assertClimateNormalsShape` threw on it
    // and the entire 81-province run died — a mechanism advertised as "the value is dropped, the
    // rest of the province is kept" instead losing everything, and doing so with a message that
    // never named the anomaly, leaving the operator to scroll back through ~70 minutes of log.
    //
    // Ruled outcome: an impossible CORE value makes that province unpublishable, and the run
    // CONTINUES. An unpublishable province is a state the design already supports (the page
    // simply renders no climate section); a lost run is not. The exclusion is recorded in the
    // manifest, so a gap is declared rather than silent, and reported again at the end.
    //
    // Narrow on purpose: this converts an ANOMALY-INDUCED gap only. A province that arrives
    // unpublishable for any other reason still aborts the run, because under ruling 5 all 81 are
    // expected to publish and any other cause means MGM's page changed shape.
    const unpublishableReason = findUnpublishableReason(parsed.normals);
    const coreAnomalies = parsed.anomalies.filter((anomaly) => CORE_PAIR_FIELDS.has(anomaly.field));
    if (unpublishableReason !== null && coreAnomalies.length > 0) {
      unpublishable.push({ plateCode: province.plateCode, reason: unpublishableReason });
      pagesFetched += 1;
      manifestEntries.push(
        buildManifestEntry(province.plateCode, provinceKey, url, page, parsed, nowImpl),
      );
      fragmentsByFile.set(
        `k-a-${provinceKey.key.toLowerCase()}.tables.html`,
        extractTableFragments(page.body),
      );
      console.warn(
        `[db:import:climate] ${province.plateCode} ${province.nameTr} is UNPUBLISHABLE — ` +
          `${unpublishableReason}. Caused by ${coreAnomalies.length} impossible core value(s): ` +
          `${coreAnomalies
            .map(
              (anomaly) =>
                `"${anomaly.sourceLabel}"${anomaly.month === null ? '' : ` month ${String(anomaly.month)}`} = ` +
                `${JSON.stringify(anomaly.rawCell)}`,
            )
            .join('; ')}. No series is written for this province; the run continues.`,
      );
      continue;
    }

    // Validate BEFORE writing an artifact, so a bad page never reaches a committed file.
    assertClimateNormalsShape(province.plateCode, parsed.normals);
    assertDecimalRoundTrip(
      province.plateCode,
      parsed.normals,
      parsed.raw.metricRows,
      parsed.raw.recordCells,
      parsed.anomalies,
    );

    pagesFetched += 1;
    normalsEntries.push({ plateCode: province.plateCode, normals: parsed.normals });
    manifestEntries.push(
      buildManifestEntry(province.plateCode, provinceKey, url, page, parsed, nowImpl),
    );
    fragmentsByFile.set(
      `k-a-${provinceKey.key.toLowerCase()}.tables.html`,
      extractTableFragments(page.body),
    );
  }

  // COMPLETENESS GATE — nothing is written until all 81 provinces are in hand.
  //
  // The circuit breaker above only catches CONSECUTIVE failures, and `consecutiveFailures`
  // resets to 0 on the next success: a 500 on province 12 and another on province 40 across an
  // unattended ~70-minute run never trips it, and both provinces would simply be absent from
  // the artifacts, which were then written with the process exiting 0. Nothing downstream
  // catches that either — the load phase's old check ran the OPPOSITE direction, and a
  // province dropped here keeps `climate_normals = NULL` forever with no error at any layer.
  //
  // The end-of-run `console.log` was the only signal, which is a hope, not a gate.
  //
  // It counts PAGES FETCHED, not provinces published — two different questions. "Did we reach all
  // 81 of MGM's pages?" is the completeness question this gate owns; "is each one publishable?"
  // is a separate, expected-outcome question owned by `findUnpublishableReason`. Conflating them
  // is what made a single impossible core value abort an otherwise perfect run.
  if (pagesFetched !== provinceKeys.length) {
    throw new Error(
      `[db:import:climate] INCOMPLETE RUN — ${pagesFetched}/${provinceKeys.length} ` +
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

  // Stamped HERE — after the completeness gate, not before the ~70-minute loop.
  //
  // Captured at the top, `generatedAtUtc` was always earlier than every `fetchedAtUtc`, which is
  // both wrong (it labels the artifact with the run's START) and unassertable. Taken at the end
  // it means what its name says, and it makes `fetchedAtUtc <= generatedAtUtc` a real invariant
  // that `assertArtifactsCorroborate` now enforces — which is the check that would have caught
  // this PR's own provenance defect at CI instead of in review.
  const generatedAtUtc = nowImpl().toISOString();

  const normalsArtifact: ClimateNormalsArtifact = {
    generatedAtUtc,
    source: CLIMATE_SOURCE_MGM_GENERAL,
    entries: normalsEntries,
  };
  const manifestArtifact: ClimateManifestArtifact = {
    generatedAtUtc,
    source: CLIMATE_SOURCE_MGM_GENERAL,
    userAgent: USER_AGENT,
    anomalies,
    unpublishable,
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

  // Same reasoning as the anomaly summary below: an exclusion decided 70 minutes ago has
  // scrolled out of sight, and an unpublished province that nobody notices is the exact silent
  // gap the completeness gate exists to prevent.
  if (unpublishable.length > 0) {
    console.warn(
      `[db:import:climate] ${unpublishable.length} PROVINCE(S) NOT PUBLISHED — their pages were ` +
        `fetched, but an impossible core value left them with no publishable series. Recorded in ` +
        `climate-manifest.json under "unpublishable":`,
    );
    for (const province of unpublishable) {
      console.warn(`  - ${province.plateCode}: ${province.reason}`);
    }
  }

  // Re-stated at the END, where a human actually looks. A warning logged 70 minutes and 81
  // provinces ago has scrolled far out of sight; an anomaly nobody reads is a silent one.
  if (anomalies.length === 0) {
    console.log('[db:import:climate] no impossible source values found.');
  } else {
    console.warn(
      `[db:import:climate] ${anomalies.length} IMPOSSIBLE SOURCE VALUE(S) dropped — recorded in ` +
        `climate-manifest.json under "anomalies":`,
    );
    for (const anomaly of anomalies) {
      console.warn(
        `  - ${anomaly.plateCode} "${anomaly.sourceLabel}" = ${JSON.stringify(anomaly.rawCell)} ` +
          `→ ${anomaly.field} set to null (${anomaly.reason})`,
      );
    }
  }
}
