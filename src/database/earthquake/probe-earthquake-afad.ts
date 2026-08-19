import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseAfadEvent } from '../../earthquake/afad/afad-event.parse';
import { toAfadQueryStamp } from '../../earthquake/afad/afad-time';
import { readBodyCapped, UPSTREAM_USER_AGENT } from '../../upstream/upstream-http.helpers';
import type { AfadProbeArtifact, AfadProbeRequestRecord } from './earthquake-artifact.types';

/**
 * `pnpm db:import:earthquakes --phase=probe` — the ONLY thing in this leg that touches the
 * network by hand, run once, to produce the committed evidence artifact.
 *
 * ## Politeness is the design, not a promise
 * AFAD documents **no rate limit**, and this probe does not go looking for one: deliberately
 * hammering a public institution's endpoint until it refuses is not a measurement we are entitled
 * to take (SPEC §20.5). So the run is bounded by construction — **at most four requests**, serial,
 * spaced by at least three seconds, each with a timeout and an identifying User-Agent. Atlas
 * authorised exactly this envelope (`DEC 2026-08-17k` md.2).
 *
 * ## Four calls, each answering a question the ingest depends on
 * 1. **one day** — the ordinary window shape the `recent` tour uses;
 * 2. **seven days** — the `reconcile` window, and the volume/compression measurement;
 * 3. **a small `limit`** — the regression evidence for the trap that `limit` is applied BEFORE
 *    `orderby`, i.e. that a small limit returns the OLDEST rows of the window (SPEC §3.4). This is
 *    the one measurement that would silently invalidate the whole windowing design if it changed;
 * 4. **a day with a known large event, `minmag` filtered** — the revision fields (`isEventUpdate`,
 *    `lastUpdateDate`) as they actually arrive, without pulling an aftershock sequence.
 *
 * The artifact records status, headers, sizes, hashes, the field set, the observed magnitude-type
 * vocabulary, how this leg's own parser fared, and two sample rows.
 *
 * **It never runs in CI** and nothing at runtime reads it — a build that can fail because a
 * provider is down is not a build (`ENGINEERING.md` §5).
 */

/** Minimum gap between two calls. Three seconds is the SPEC's own measurement discipline. */
const SPACING_MS = 3_000;

/** Per-call ceiling. The slowest measured call was 0.43 s. */
const TIMEOUT_MS = 20_000;

/**
 * Byte ceiling per response. `AbortSignal.timeout` bounds TIME, not payload.
 *
 * The one runtime primitive a hand-run tool may not drop or re-implement is response byte metering
 * (recorded precedent, review #75 → `probe-marine-ecmwf.ts` / `probe-air-quality.ts`); this probe
 * had dropped it, which is why review #118 SEC118-M2 exists. 16 MiB is the same figure the backfill
 * uses, derived from `PROBE_LIMIT` rows at the ~330 B/row measured density.
 */
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

/** Overflow ceiling for the probe's own calls — the same alarm the ingest uses. */
const PROBE_LIMIT = 20_000;

/** The deliberately small limit of request 3, which must return the window's OLDEST rows. */
const SMALL_LIMIT = 3;

/** A day carrying a known, heavily revised large event; `minmag` keeps the response tiny. */
const REVISION_DAY = '2023-02-06';
const REVISION_MIN_MAGNITUDE = 7;

export interface EarthquakeProbeOptions {
  readonly baseUrl: string;
  readonly artifactPath: string;
  /** Injected in tests. */
  readonly fetchImpl?: typeof fetch;
  readonly sleepImpl?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runEarthquakeProbePhase(
  options: EarthquakeProbeOptions,
): Promise<AfadProbeArtifact> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? sleep;
  const now = options.now ?? Date.now;
  const base = options.baseUrl.replace(/\/+$/, '');

  const nowMs = now();
  const dayStart = new Date(nowMs - 24 * 3_600_000);
  const weekStart = new Date(nowMs - 7 * 86_400_000);
  const end = new Date(nowMs);

  const plan = [
    {
      label: 'one-day window (the `recent` tour shape)',
      url: filterUrl(base, dayStart, end, PROBE_LIMIT),
    },
    {
      label: 'seven-day window (the `reconcile` tour shape, and the volume measurement)',
      url: filterUrl(base, weekStart, end, PROBE_LIMIT),
    },
    {
      label: `small limit=${String(SMALL_LIMIT)} over the same day — evidence that limit precedes orderby`,
      url: filterUrl(base, dayStart, end, SMALL_LIMIT),
    },
    {
      label: `a known revised event day (${REVISION_DAY}, minmag=${String(REVISION_MIN_MAGNITUDE)})`,
      url:
        `${base}/event/filter?start=${REVISION_DAY}T00:00:00&end=${REVISION_DAY}T23:59:59` +
        `&limit=${String(PROBE_LIMIT)}&minmag=${String(REVISION_MIN_MAGNITUDE)}`,
    },
  ] as const;

  const requests: AfadProbeRequestRecord[] = [];
  for (const [index, step] of plan.entries()) {
    if (index > 0) await sleepImpl(SPACING_MS);
    requests.push(await measure(step.label, step.url, fetchImpl, now));
  }

  const artifact: AfadProbeArtifact = {
    probeVersion: 1,
    generatedAtUtc: new Date(now()).toISOString(),
    userAgent: UPSTREAM_USER_AGENT,
    nodeVersion: process.version,
    baseUrl: base,
    spacingSeconds: SPACING_MS / 1000,
    requests,
  };

  await mkdir(dirname(options.artifactPath), { recursive: true });
  await writeFile(options.artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return artifact;
}

async function measure(
  label: string,
  url: string,
  fetchImpl: typeof fetch,
  now: () => number,
): Promise<AfadProbeRequestRecord> {
  const requestedAtUtc = new Date(now()).toISOString();
  const startedMs = now();
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': UPSTREAM_USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    // The same refusal the runtime client makes: never follow a redirect to a host we did not
    // choose. A 302 here is a finding to record, not something to chase.
    redirect: 'error',
  });
  const body = await readBodyCapped(response, url, MAX_RESPONSE_BYTES);
  const durationMs = now() - startedMs;

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(body);
  } catch {
    parsedBody = null;
  }
  const rows: readonly unknown[] | null = Array.isArray(parsedBody)
    ? (parsedBody as readonly unknown[])
    : null;

  const fieldNames = new Set<string>();
  const magnitudeTypes = new Set<string>();
  const rejectionReasons = new Set<string>();
  let accepted = 0;
  let rejected = 0;
  for (const row of rows ?? []) {
    if (typeof row === 'object' && row !== null && !Array.isArray(row)) {
      for (const key of Object.keys(row)) fieldNames.add(key);
      const type = (row as Record<string, unknown>)['type'];
      if (typeof type === 'string') magnitudeTypes.add(type);
    }
    const outcome = parseAfadEvent(row);
    if (outcome.kind === 'ok') accepted += 1;
    else {
      rejected += 1;
      rejectionReasons.add(outcome.rejection.reason);
    }
  }

  return {
    label,
    url,
    requestedAtUtc,
    httpStatus: response.status,
    durationMs,
    headers: {
      'content-type': response.headers.get('content-type'),
      'content-encoding': response.headers.get('content-encoding'),
      'content-length': response.headers.get('content-length'),
      'cache-control': response.headers.get('cache-control'),
      etag: response.headers.get('etag'),
      'last-modified': response.headers.get('last-modified'),
      vary: response.headers.get('vary'),
    },
    byteLength: Buffer.byteLength(body, 'utf8'),
    sha256: createHash('sha256').update(body).digest('hex'),
    recordCount: rows?.length ?? null,
    fieldNames: [...fieldNames].sort(),
    magnitudeTypes: [...magnitudeTypes].sort(),
    parsed: {
      accepted,
      rejected,
      // Sorted and de-duplicated: the artifact records the CLASSES of refusal, not one line per row.
      rejectionReasons: [...rejectionReasons].sort(),
    },
    sampleRows: (rows ?? []).slice(0, 2),
  };
}

function filterUrl(base: string, startUtc: Date, endUtc: Date, limit: number): string {
  return (
    `${base}/event/filter?start=${toAfadQueryStamp(startUtc)}` +
    `&end=${toAfadQueryStamp(endUtc)}&limit=${String(limit)}`
  );
}
