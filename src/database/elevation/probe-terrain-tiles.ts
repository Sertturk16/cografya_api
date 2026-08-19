import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import { decodeTerrainTile, decodeTerrariumMetres } from '../../elevation/terrain/terrarium-decode';
import { bilinearSample } from '../../elevation/terrain/bilinear';
import {
  TERRAIN_SAMPLE_ZOOM,
  TILE_SIZE,
  lonLatToTilePixel,
  tileKey,
  tileWidthKmAtLatitude,
} from '../../elevation/terrain/tile-math';
import { haversineKm, sampleGreatCircleLine } from '../../elevation/terrain/great-circle';
import { UPSTREAM_USER_AGENT } from '../../upstream/upstream-http.helpers';

/**
 * `node dist/database/elevation/probe-terrain-tiles.js` — the CBS-P2 terrain evidence run.
 *
 * HAND-RUN ONLY. Never CI, never the app, never a deploy: `ENGINEERING.md` §5's two-phase
 * rule says the network-touching phase is run by a human and writes a committed, reviewable
 * artifact, and the offline phase reads only that artifact. This is the network-touching
 * half, and it is the ONLY thing in this PR that can reach a provider.
 *
 * ## What one run establishes, and why each item is here
 *
 * 1. **Bytes and latency per tile.** `plan-api.md` §13 records the deadline and budget numbers
 *    as UNMEASURED starting values, because hosting is undecided and no latency figure exists.
 *    This run replaces the guess with a distribution.
 * 2. **The `x-amz-meta-x-imagery-sources` value set at z12.** The runtime tripwire (SPEC §8.2)
 *    needs an allow-list, and an allow-list assembled from memory is how an unattributed
 *    source reaches production. It is assembled from what the bucket actually returns.
 * 3. **The bathymetry threshold, re-measured.** SPEC §8.2 found ETOPO1 at z <= 10 and absent
 *    at z >= 11. That single fact is what removes NOAA's navigation limit and one attribution
 *    line from our obligations, so this run re-checks it rather than inheriting it.
 * 4. **The attribution document's SHA-256.** `provenance/datasets.md` pinned
 *    `2ce4d341…` on 2026-08-19. If the upstream text has moved, the two notices we publish
 *    may no longer be the ones we owe, and the build PR must stop.
 * 5. **A decoder cross-check against three independently measured points.** SPEC §7.3 recorded
 *    Tuz Gölü 904.00 m, Van Gölü 1647.50 m and Erciyes 3829.28 m using a *separate* Python
 *    decoder. Reproducing those numbers with THIS decoder is a positive control that the
 *    unit tests structurally cannot provide: they prove the decoder is self-consistent, and
 *    only an independent measurement can show it agrees with the world.
 *
 * ## Politeness is a property of the code, not of the operator
 * Serial (never parallel), spaced by a fixed delay, individually timed out, and identifying
 * itself with the shared bot user agent. One full run is well under a hundred requests.
 */

const DEFAULT_BASE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod';

/** Raised when a request the probe depends on did not succeed. */
export class TerrainProbeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TerrainProbeError';
  }
}

/**
 * The terrain source families we expect AT THE SAMPLING ZOOM, and the set the tripwire's
 * allow-list is derived from.
 *
 * These are the families the two attribution lines we publish actually cover: EU-DEM (the
 * Copernicus line) plus GMTED2010, SRTM and 3DEP/NED (the USGS line). `etopo1` is deliberately
 * ABSENT and must stay absent — its absence above z10 is what keeps NOAA's "Not to be used for
 * navigation" limit from arising and removes a third attribution line from what the page owes
 * (SPEC §8.2). A run that sees a family outside this set has watched the tile mix move under
 * us, and must stop rather than write an artifact somebody configures a tripwire from.
 *
 * The measured z12 set is a SUBSET of this (`eudem`, `gmted` in the recorded run); the other
 * three are listed because the ledger measured them on Turkish tiles at other zooms and the
 * published attribution lines already cover them, so meeting one is not evidence of drift.
 */
export const EXPECTED_SAMPLING_ZOOM_FAMILIES: readonly string[] = [
  '3dep',
  'eudem',
  'gmted',
  'ned',
  'srtm',
];

/** The families a `x-amz-meta-x-imagery-sources` header value names: each entry's path prefix. */
export function imagerySourceFamilies(headerValue: string): string[] {
  const families: string[] = [];
  for (const entry of headerValue.split(',')) {
    const family = entry.trim().split('/')[0];
    if (family !== undefined && family !== '') families.push(family);
  }
  return families;
}

/**
 * The attribution document `provenance/datasets.md` pins. Fetched RAW — the rendered GitHub
 * page carries markup whose hash would differ from the pinned one for reasons that have
 * nothing to do with the licence text.
 */
const ATTRIBUTION_DOC_URL =
  'https://raw.githubusercontent.com/tilezen/joerd/master/docs/attribution.md';

/** The SHA-256 `provenance/datasets.md` recorded on 2026-08-19. */
const PINNED_ATTRIBUTION_SHA256 =
  '2ce4d3414b4592d17ad56a5af57feb480686ddcfb0a3e4ea0b566d28cde13567';

/** Gap between requests. Serial + spaced is the whole politeness contract. */
export const REQUEST_SPACING_MS = 400;

/** Ceiling on one request, so a stalled socket cannot hang a hand-run script indefinitely. */
export const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Refuse a body larger than this. A conforming tile measured ~121 kB (SPEC §7.1); 2 MB is far
 * above anything legitimate and far below anything that could hurt the operator's machine.
 */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

interface ProbePoint {
  readonly label: string;
  readonly lat: number;
  readonly lon: number;
  /** Independently measured metres from SPEC §7.3, where one exists. */
  readonly specMeasuredM?: number;
  readonly kind: 'land' | 'sea';
}

/**
 * The sampled points. Land points span the relief range (a salt flat, a lake surface, a
 * summit, a coastal city); sea points are the ones SPEC §8.2 used for the bathymetry
 * threshold, in four different seas so a single anomalous tile cannot decide the answer.
 */
const PROBE_POINTS: readonly ProbePoint[] = [
  { label: 'Tuz Gölü', lat: 38.7833, lon: 33.3833, specMeasuredM: 904.0, kind: 'land' },
  { label: 'Van Gölü', lat: 38.6167, lon: 42.8833, specMeasuredM: 1647.5, kind: 'land' },
  { label: 'Erciyes zirve', lat: 38.5325, lon: 35.4489, specMeasuredM: 3829.28, kind: 'land' },
  { label: 'Ankara', lat: 39.9208, lon: 32.8541, kind: 'land' },
  { label: 'İzmir', lat: 38.4192, lon: 27.1287, kind: 'land' },
  { label: 'Akdeniz açığı', lat: 35.5, lon: 30.5, kind: 'sea' },
  { label: 'Karadeniz açığı', lat: 42.5, lon: 34.0, kind: 'sea' },
  { label: 'Ege açığı', lat: 38.0, lon: 25.5, kind: 'sea' },
  { label: 'Marmara', lat: 40.7, lon: 28.3, kind: 'sea' },
];

/** Lines whose tile counts the plan predicted; measured here against the prediction. */
const PROBE_LINES: readonly {
  readonly label: string;
  readonly from: { lat: number; lon: number };
  readonly to: { lat: number; lon: number };
}[] = [
  {
    label: 'Samsun→Erzurum',
    from: { lat: 41.2867, lon: 36.33 },
    to: { lat: 39.9043, lon: 41.2769 },
  },
  {
    label: 'İzmir→Van',
    from: { lat: 38.4192, lon: 27.1287 },
    to: { lat: 38.4891, lon: 43.4089 },
  },
];

/** Sample count the endpoint will use, so the measured tile counts are the real ones. */
const PROFILE_SAMPLE_COUNT = 200;

interface TileFetchRecord {
  readonly tile: string;
  /**
   * Recorded per tile because the run deliberately spans z8…z13 for the bathymetry check, and
   * every aggregate below MUST be able to exclude those. The first run of this probe reported
   * a single mixed-zoom byte mean (50 kB) and a single mixed-zoom source list containing
   * `etopo1` — both true of the run and both useless, because the endpoint only ever fetches
   * z12 and `etopo1` appears only at z <= 10. An allow-list built from that list would have
   * whitelisted the one source whose absence is the whole licence argument.
   */
  readonly zoom: number;
  readonly httpStatus: number;
  readonly bytes: number;
  readonly elapsedMs: number;
  readonly contentType: string | null;
  readonly lastModified: string | null;
  readonly imagerySources: string | null;
}

interface PointRecord {
  readonly label: string;
  readonly kind: 'land' | 'sea';
  readonly lat: number;
  readonly lon: number;
  readonly zoom: number;
  readonly tile: string;
  /** What the endpoint will publish: the bilinear sample, rounded on write. */
  readonly decodedM: number | null;
  /**
   * The single cell the coordinate falls in, with no interpolation.
   *
   * Both are recorded because only the pair makes the control READABLE. SPEC §7.3's
   * independent Python decoder read one cell, so `decodedNearestM` is the like-for-like
   * comparison, while `decodedM` differs from it wherever the terrain is steep — most of all
   * at a sharp summit, which is precisely the case SPEC §8.3 turns into a user-facing
   * caveat. Reporting only the bilinear value would make an expected, explainable gap at
   * Erciyes look like a decoder defect.
   */
  readonly decodedNearestM: number | null;
  readonly specMeasuredM: number | null;
  /** `decodedNearestM` minus `specMeasuredM` — the like-for-like control residual. */
  readonly differenceM: number | null;
  readonly error: string | null;
}

export interface TerrainProbeArtifact {
  readonly generatedAtUtc: string;
  readonly baseUrl: string;
  readonly zoom: number;
  readonly userAgent: string;
  readonly requestCount: number;
  readonly attribution: {
    readonly url: string;
    readonly httpStatus: number;
    readonly bytes: number;
    readonly sha256: string;
    readonly pinnedSha256: string;
    readonly matchesPin: boolean;
  } | null;
  /** Why the attribution document could not be read, when it could not. */
  readonly attributionError: string | null;
  /**
   * The run's own PASS/FAIL gates.
   *
   * A probe that writes an artifact and exits 0 having measured nothing is the shape
   * `ENGINEERING.md` §5 forbids, and this is what makes the failure loud instead. Modelled on
   * `probe-air-quality.ts`, which records its assertions in the artifact and exits non-zero.
   */
  readonly assertions: readonly {
    readonly name: string;
    readonly passed: boolean;
    readonly detail: string;
  }[];
  readonly tiles: readonly TileFetchRecord[];
  readonly points: readonly PointRecord[];
  readonly bathymetryByZoom: readonly {
    readonly label: string;
    readonly zoom: number;
    readonly metres: number | null;
    /** The `x-amz-meta-x-imagery-sources` header value. NEVER an error message. */
    readonly imagerySources: string | null;
    readonly error: string | null;
  }[];
  /** Every source family seen anywhere in the run, across ALL probed zooms. Context only. */
  readonly imagerySourceTokens: readonly string[];
  /**
   * Source families per zoom — and the ONLY row the tripwire's allow-list may be built from
   * is the sampling zoom's. `etopo1` legitimately appears at low zoom and must never reach
   * the allow-list, because its absence at z12 is what removes NOAA's navigation limit and
   * one attribution line from what we owe (SPEC §8.2).
   */
  readonly imagerySourceTokensByZoom: Readonly<Record<string, readonly string[]>>;
  /** The allow-list candidate: the sampling zoom's families, alone. */
  readonly samplingZoomSourceTokens: readonly string[];
  readonly lines: readonly {
    readonly label: string;
    readonly lengthKm: number;
    readonly sampleCount: number;
    readonly distinctTiles: number;
    readonly predictedTiles: number;
  }[];
  /**
   * Byte and latency distributions for the SAMPLING ZOOM only.
   *
   * Scoped deliberately: the endpoint fetches z12 and nothing else, so folding in a low-zoom
   * tile would describe traffic this service never generates.
   *
   * **The scoping is by ZOOM and the byte skew is by TERRAIN, and the two are independent** —
   * an earlier version of this comment claimed the zoom scoping removed the skew, and the
   * artifact refutes it: several of the sampling-zoom tiles here are offshore, where a flat
   * 0 m surface compresses to under a kilobyte, so `meanBytes` sits far below the ~121 kB a
   * land line averages (SPEC §7.1). Size a per-request byte budget from `maxBytes` or from the
   * land figure in `data/elevation/README.md`, never from this mean (review #122, CODE122-M4).
   */
  readonly samplingZoomByteStats: {
    readonly count: number;
    readonly minBytes: number;
    readonly maxBytes: number;
    readonly meanBytes: number;
  } | null;
  readonly samplingZoomLatencyStats: {
    readonly count: number;
    readonly minMs: number;
    readonly maxMs: number;
    readonly medianMs: number;
    readonly p95Ms: number;
  } | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tileUrl(baseUrl: string, zoom: number, x: number, y: number): string {
  return `${baseUrl}/terrarium/${String(zoom)}/${String(x)}/${String(y)}.png`;
}

export interface FetchedBody {
  readonly status: number;
  readonly bytes: Uint8Array;
  readonly elapsedMs: number;
  readonly headers: Headers;
}

/**
 * One polite GET with a byte cap and a timeout.
 *
 * ## The spacing sleep is OUTSIDE the measurement, and in a `finally`
 * Two defects lived in the three lines below, and both were the same mistake in different
 * costumes — treating the politeness gap as part of the request (review #122, CODE122-I2,
 * CODE122-M2 / SFH122-M3):
 *
 * 1. `elapsedMs` was computed AFTER `await sleep(400)`, so every published latency carried a
 *    fixed +400 ms. The artifact's median read 640 ms where the transfer took ~240 ms, and
 *    PR-E2's request deadline is sized off exactly that number — a 2.7× overstatement that
 *    would fire the partial-profile path on lines that complete comfortably. A constant offset
 *    is proportionally worst on the fast tiles, which are most of them.
 * 2. The sleep sat on the SUCCESS path, so a timeout, a refused redirect or an over-cap body
 *    skipped it — the probe hammered the provider precisely when the provider was unwell.
 *    `ENGINEERING.md` §5 says polite *by construction*, which cannot mean "polite while
 *    nothing goes wrong".
 */
export async function politeGet(url: string): Promise<FetchedBody> {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': UPSTREAM_USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'error',
    });

    // Refuse on the DECLARED size before reading, so an oversized body is never materialised.
    // The post-read check below stays as the belt: `content-length` is optional and a hostile
    // server can lie about it, so this bounds the honest case and the belt bounds the rest.
    // (A fully streaming read would bound both; deferred deliberately — see CODE122-M3 in the
    // review notes. This is a hand-run script making ~15 requests against a known public
    // bucket, and the streaming version is more moving parts than that risk earns.)
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      throw new Error(`${url} declares ${String(declared)} bytes, over the probe cap`);
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    // Measured BEFORE the spacing sleep: this is transfer time, not transfer time plus our own
    // politeness.
    const elapsedMs = Date.now() - startedAt;

    if (bytes.byteLength > MAX_BODY_BYTES) {
      throw new Error(`${url} returned ${String(bytes.byteLength)} bytes, over the probe cap`);
    }

    return { status: response.status, bytes, elapsedMs, headers: response.headers };
  } finally {
    // Every exit path pays the gap, including the failing ones.
    await sleep(REQUEST_SPACING_MS);
  }
}

/** One PASS/FAIL gate, as recorded in the artifact and printed by the CLI. */
export interface ProbeAssertion {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

/** How far this decoder may sit from SPEC §7.3's independent measurement, in metres. */
export const DECODER_CONTROL_TOLERANCE_M = 2;

/**
 * Turn a finished run into PASS/FAIL gates.
 *
 * ## Why this exists, in one sentence per gate
 * Every one of these was a way for a failed or drifting run to produce a committable artifact
 * and exit 0 (review #122, SFH122-I1 / SFH122-I2 / SFH122-I3, CODE122-I3):
 *
 * - **sampling-zoom coverage** — on a network where S3 answers 403 the old run printed
 *   `tiles 200: 0`, wrote nulls everywhere and exited 0. The artifact then said
 *   `samplingZoomSourceTokens: []`, which is indistinguishable from "the provider reported no
 *   imagery sources" — and that file is what a tripwire allow-list gets built from.
 * - **known source families** — the CLI docblock promised an unexpected-family check that was
 *   never written, so the operator was told a check runs that does not run.
 * - **no `etopo1` at the sampling zoom** — this is the whole licence argument (SPEC §8.2). It
 *   was asserted by two prose comments and nothing else.
 * - **no bathymetry above z10** — the other half of the same argument, measured rather than
 *   inherited.
 * - **the decoder control** — the residuals against SPEC §7.3's INDEPENDENT decoder were
 *   computed, written to the artifact, and read by nothing. A reversed channel order or a
 *   provider silently serving a different RGB elevation encoding (same geometry, so every
 *   structural refusal passes) would leave the unit suite green, because the encoder and the
 *   decoder here are a matched pair that only prove they agree with each other.
 *
 * Pure and separately exported so the spec can drive it without a network run.
 */
export function evaluateProbeAssertions(input: {
  readonly samplingZoomTileCount: number;
  readonly samplingZoomSourceTokens: readonly string[];
  readonly bathymetryByZoom: readonly { readonly zoom: number; readonly metres: number | null }[];
  readonly points: readonly {
    readonly label: string;
    readonly specMeasuredM: number | null;
    readonly differenceM: number | null;
  }[];
  readonly attribution: { readonly matchesPin: boolean } | null;
}): ProbeAssertion[] {
  const assertions: ProbeAssertion[] = [];

  assertions.push({
    name: 'sampling zoom reached',
    passed: input.samplingZoomTileCount > 0,
    detail: `${String(input.samplingZoomTileCount)} tile(s) returned 200 at z${String(
      TERRAIN_SAMPLE_ZOOM,
    )}`,
  });

  assertions.push({
    name: 'imagery sources reported',
    passed: input.samplingZoomSourceTokens.length > 0,
    detail:
      input.samplingZoomSourceTokens.length > 0
        ? input.samplingZoomSourceTokens.join(', ')
        : 'no x-amz-meta-x-imagery-sources header seen at the sampling zoom',
  });

  const unexpected = input.samplingZoomSourceTokens.filter(
    (family) => !EXPECTED_SAMPLING_ZOOM_FAMILIES.includes(family),
  );
  assertions.push({
    name: 'no unexpected source family at the sampling zoom',
    passed: unexpected.length === 0,
    detail:
      unexpected.length === 0
        ? `all within ${EXPECTED_SAMPLING_ZOOM_FAMILIES.join(', ')}`
        : `UNEXPECTED: ${unexpected.join(', ')} — the tile mix moved; attribution may be incomplete`,
  });

  // Stated separately from the one above even though `etopo1` would also trip it. This gate is
  // the licence argument itself, so it is named in the output rather than being an implication
  // of a more general check nobody reads that way.
  assertions.push({
    name: 'no etopo1 at the sampling zoom',
    passed: !input.samplingZoomSourceTokens.includes('etopo1'),
    detail: input.samplingZoomSourceTokens.includes('etopo1')
      ? 'etopo1 IS in the mix: NOAA’s navigation limit and its attribution line now apply'
      : 'absent, as the z12 pin requires',
  });

  const shallowAboveThreshold = input.bathymetryByZoom.filter(
    (row) => row.zoom >= 11 && (row.metres === null || row.metres !== 0),
  );
  assertions.push({
    name: 'no sea depth above z10',
    passed: input.bathymetryByZoom.length > 0 && shallowAboveThreshold.length === 0,
    detail:
      input.bathymetryByZoom.length === 0
        ? 'the bathymetry sweep produced no rows'
        : shallowAboveThreshold.length === 0
          ? 'every z >= 11 offshore sample reads exactly 0 m'
          : `depth present at ${shallowAboveThreshold.map((row) => `z${String(row.zoom)}`).join(', ')}`,
  });

  const controls = input.points.filter((point) => point.specMeasuredM !== null);
  const drifted = controls.filter(
    (point) =>
      point.differenceM === null || Math.abs(point.differenceM) > DECODER_CONTROL_TOLERANCE_M,
  );
  assertions.push({
    name: 'decoder agrees with the independent measurement',
    passed: controls.length > 0 && drifted.length === 0,
    detail:
      controls.length === 0
        ? 'no control point produced a residual'
        : drifted.length === 0
          ? controls
              .map((point) => `${point.label} ${String(point.differenceM ?? 0)} m`)
              .join(' · ')
          : `OUTSIDE ±${String(DECODER_CONTROL_TOLERANCE_M)} m: ${drifted
              .map((point) => `${point.label} ${String(point.differenceM ?? Number.NaN)}`)
              .join(' · ')}`,
  });

  assertions.push({
    name: 'attribution document matches the pinned hash',
    passed: input.attribution?.matchesPin === true,
    detail:
      input.attribution === null
        ? 'the document could not be read — NOT the same signal as a changed licence'
        : input.attribution.matchesPin
          ? 'unchanged since provenance/datasets.md pinned it'
          : 'DIFFERS from the pin: the licence text moved, stop and escalate',
  });

  return assertions;
}

export function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1)));
  return sorted[index] ?? 0;
}

/**
 * Run the probe and return the artifact. Exported so the entry point stays a thin shell and
 * the shape can be inspected without executing a network run.
 */
export async function runTerrainProbe(baseUrl: string): Promise<TerrainProbeArtifact> {
  const tiles: TileFetchRecord[] = [];
  const points: PointRecord[] = [];
  const bathymetryByZoom: TerrainProbeArtifact['bathymetryByZoom'][number][] = [];
  const imagerySourceTokens = new Set<string>();
  const imagerySourceTokensByZoom = new Map<number, Set<string>>();
  const decodedTiles = new Map<string, Int16Array>();
  let requestCount = 0;

  async function loadTile(zoom: number, x: number, y: number): Promise<Int16Array> {
    const key = tileKey(zoom, x, y);
    const cached = decodedTiles.get(key);
    if (cached !== undefined) return cached;

    // Counted BEFORE the await, so a request that throws is still counted. `requestCount` is
    // the artifact's own evidence of how much traffic the run produced, and under-reporting it
    // exactly when requests are failing makes the artifact wrong about its own behaviour in
    // the one case a reviewer needs it right (review #122, CODE122-M2 / SFH122-M3).
    requestCount += 1;
    const response = await politeGet(tileUrl(baseUrl, zoom, x, y));

    const sources = response.headers.get('x-amz-meta-x-imagery-sources');
    tiles.push({
      tile: key,
      zoom,
      httpStatus: response.status,
      bytes: response.bytes.byteLength,
      elapsedMs: response.elapsedMs,
      contentType: response.headers.get('content-type'),
      lastModified: response.headers.get('last-modified'),
      imagerySources: sources,
    });

    if (sources !== null) {
      // Record the SOURCE FAMILY (the path prefix), which is what the tripwire's allow-list
      // is keyed on — the individual file names change with the tile, the families do not.
      const perZoom = imagerySourceTokensByZoom.get(zoom) ?? new Set<string>();
      for (const family of imagerySourceFamilies(sources)) {
        imagerySourceTokens.add(family);
        perZoom.add(family);
      }
      imagerySourceTokensByZoom.set(zoom, perZoom);
    }

    // A non-200 is an ERROR, not an empty result. Returning null here meant the caller's catch
    // never fired, so the point row was written with `error: null` — the field whose entire job
    // is to say what went wrong — and the run exited 0 having measured nothing. On a network
    // where S3 answers 403 that produced a committable artifact of a failed run, which is the
    // shape ENGINEERING.md §5 exists to forbid (review #122, SFH122-I1).
    if (response.status !== 200) {
      throw new TerrainProbeError(
        `${tileUrl(baseUrl, zoom, x, y)} returned HTTP ${String(response.status)}`,
      );
    }

    const grid = decodeTerrainTile(response.bytes);
    decodedTiles.set(key, grid);
    return grid;
  }

  // ── 1. Point decode, including the three SPEC §7.3 control values ──────────────────
  for (const point of PROBE_POINTS) {
    const position = lonLatToTilePixel(point.lon, point.lat, TERRAIN_SAMPLE_ZOOM);
    const key = tileKey(TERRAIN_SAMPLE_ZOOM, position.tileX, position.tileY);
    try {
      const grid = await loadTile(TERRAIN_SAMPLE_ZOOM, position.tileX, position.tileY);
      const decoded = bilinearSample(grid, position.pixelX, position.pixelY);
      const nearest =
        grid[Math.floor(position.pixelY) * TILE_SIZE + Math.floor(position.pixelX)] ?? null;
      points.push({
        label: point.label,
        kind: point.kind,
        lat: point.lat,
        lon: point.lon,
        zoom: TERRAIN_SAMPLE_ZOOM,
        tile: key,
        decodedM: Number(decoded.toFixed(2)),
        decodedNearestM: nearest,
        specMeasuredM: point.specMeasuredM ?? null,
        differenceM:
          nearest === null || point.specMeasuredM === undefined
            ? null
            : Number((nearest - point.specMeasuredM).toFixed(2)),
        error: null,
      });
    } catch (error: unknown) {
      points.push({
        label: point.label,
        kind: point.kind,
        lat: point.lat,
        lon: point.lon,
        zoom: TERRAIN_SAMPLE_ZOOM,
        tile: key,
        decodedM: null,
        decodedNearestM: null,
        specMeasuredM: point.specMeasuredM ?? null,
        differenceM: null,
        error: error instanceof Error ? error.message : 'unknown failure',
      });
    }
  }

  // ── 2. The bathymetry threshold, re-measured across the zoom axis ─────────────────
  // One offshore point at z8 … z13. The claim under test is sharp — depth present at z <= 10,
  // a flat 0 at z >= 11 — so a probe that only looked at z12 could not distinguish "no
  // bathymetry" from "this tile happens to be land".
  const offshore = PROBE_POINTS.find((point) => point.label === 'Akdeniz açığı');
  if (offshore !== undefined) {
    for (const zoom of [8, 9, 10, 11, 12, 13]) {
      const position = lonLatToTilePixel(offshore.lon, offshore.lat, zoom);
      try {
        const grid = await loadTile(zoom, position.tileX, position.tileY);
        const key = tileKey(zoom, position.tileX, position.tileY);
        // `findLast`, not `find`: a failed attempt pushes a record and is not cached, so a
        // retried tile has TWO records under one key and `find` returns the FAILED one — which
        // would quote a null source list beside a successfully decoded depth, reading as "the
        // provider reported no imagery sources at this zoom". That is a claim the licence
        // argument turns on (review #122, SFH122-M8).
        const record = tiles.findLast((tile) => tile.tile === key);
        bathymetryByZoom.push({
          label: offshore.label,
          zoom,
          metres: Number(bilinearSample(grid, position.pixelX, position.pixelY).toFixed(2)),
          imagerySources: record?.imagerySources ?? null,
          error: null,
        });
      } catch (error: unknown) {
        bathymetryByZoom.push({
          label: offshore.label,
          zoom,
          metres: null,
          // The error goes in its OWN field. It used to be written into `imagerySources`,
          // where any reader tokenising that field would parse "ERROR: fetch failed" as a
          // terrain source family (review #122, CODE122-M5 / SFH122-M4).
          imagerySources: null,
          error: error instanceof Error ? error.message : 'unknown failure',
        });
      }
    }
  }

  // ── 3. Tile counts per line — measured against the plan's prediction ──────────────
  // No fetching here: the line walk only needs the tile ARITHMETIC, and downloading 200 tiles
  // twice would make an impolite probe out of a counting exercise.
  const lines = PROBE_LINES.map((line) => {
    const samples = sampleGreatCircleLine(line.from, line.to, PROFILE_SAMPLE_COUNT);
    const distinct = new Set<string>();
    for (const sample of samples) {
      const position = lonLatToTilePixel(sample.lon, sample.lat, TERRAIN_SAMPLE_ZOOM);
      distinct.add(tileKey(TERRAIN_SAMPLE_ZOOM, position.tileX, position.tileY));
    }
    const lengthKm = haversineKm(line.from, line.to);
    const midLat = (line.from.lat + line.to.lat) / 2;
    return {
      label: line.label,
      lengthKm: Number(lengthKm.toFixed(1)),
      sampleCount: PROFILE_SAMPLE_COUNT,
      distinctTiles: distinct.size,
      predictedTiles: Math.round(lengthKm / tileWidthKmAtLatitude(midLat, TERRAIN_SAMPLE_ZOOM)),
    };
  });

  // ── 4. The attribution document's hash, against the pinned one ───────────────────
  // A failure here yields `null` rather than aborting the run: the tile measurements are
  // still worth having, and `null` is unambiguous — the CLI prints "NOT FETCHED", which is
  // NOT the same signal as "DIFFERS". Collapsing the two would let a network blip read as a
  // licence change, or worse, the reverse.
  let attribution: TerrainProbeArtifact['attribution'];
  let attributionError: string | null = null;
  try {
    requestCount += 1;
    const response = await politeGet(ATTRIBUTION_DOC_URL);
    // A non-200 body is an ERROR PAGE, and hashing it reports `matchesPin: false` — i.e. "the
    // licence document changed" — for a routine 429 from raw.githubusercontent.com. That is
    // exactly the collapse the comment above forbids, in the direction that cries wolf until
    // an operator stops believing a signal meant to be a hard stop (review #122, SFH122-M1).
    if (response.status !== 200) {
      throw new TerrainProbeError(`attribution document returned HTTP ${String(response.status)}`);
    }
    const sha256 = createHash('sha256').update(response.bytes).digest('hex');
    attribution = {
      url: ATTRIBUTION_DOC_URL,
      httpStatus: response.status,
      bytes: response.bytes.byteLength,
      sha256,
      pinnedSha256: PINNED_ATTRIBUTION_SHA256,
      matchesPin: sha256 === PINNED_ATTRIBUTION_SHA256,
    };
  } catch (error: unknown) {
    // The reason is KEPT. A bare `catch {}` left "NOT FETCHED" unable to say whether it was a
    // timeout, DNS, a refused redirect or a 429.
    attribution = null;
    attributionError = error instanceof Error ? error.message : 'unknown failure';
  }

  const samplingZoomTiles = tiles.filter(
    (tile) => tile.httpStatus === 200 && tile.zoom === TERRAIN_SAMPLE_ZOOM,
  );
  const byteValues = samplingZoomTiles.map((tile) => tile.bytes).sort((a, b) => a - b);
  const latencyValues = samplingZoomTiles.map((tile) => tile.elapsedMs).sort((a, b) => a - b);

  const tokensByZoom: Record<string, readonly string[]> = {};
  for (const [zoom, families] of [...imagerySourceTokensByZoom.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    tokensByZoom[String(zoom)] = [...families].sort();
  }

  const samplingZoomSourceTokens = tokensByZoom[String(TERRAIN_SAMPLE_ZOOM)] ?? [];
  const assertions = evaluateProbeAssertions({
    samplingZoomTileCount: samplingZoomTiles.length,
    samplingZoomSourceTokens,
    bathymetryByZoom,
    points,
    attribution,
  });

  return {
    generatedAtUtc: new Date().toISOString(),
    baseUrl,
    zoom: TERRAIN_SAMPLE_ZOOM,
    userAgent: UPSTREAM_USER_AGENT,
    requestCount,
    attribution,
    attributionError,
    assertions,
    tiles,
    points,
    bathymetryByZoom,
    imagerySourceTokens: [...imagerySourceTokens].sort(),
    imagerySourceTokensByZoom: tokensByZoom,
    samplingZoomSourceTokens,
    lines,
    samplingZoomByteStats:
      byteValues.length === 0
        ? null
        : {
            count: byteValues.length,
            minBytes: byteValues[0] ?? 0,
            maxBytes: byteValues[byteValues.length - 1] ?? 0,
            meanBytes: Math.round(
              byteValues.reduce((sum, value) => sum + value, 0) / byteValues.length,
            ),
          },
    samplingZoomLatencyStats:
      latencyValues.length === 0
        ? null
        : {
            count: latencyValues.length,
            minMs: latencyValues[0] ?? 0,
            maxMs: latencyValues[latencyValues.length - 1] ?? 0,
            medianMs: percentile(latencyValues, 0.5),
            p95Ms: percentile(latencyValues, 0.95),
          },
  };
}

/** The verified bucket, exported so the entry point does not restate the address. */
export const TERRAIN_DEFAULT_BASE_URL = DEFAULT_BASE_URL;

/**
 * Run the probe and write the artifact.
 *
 * `outputPath` must be ABSOLUTE — a relative path resolves against whatever directory the
 * operator happened to be in, which is how an evidence artifact ends up written somewhere
 * nobody commits (the ERA5 `--raw-dir` rule, applied to a smaller tool).
 */
export async function runTerrainProbePhase(options: {
  readonly outputPath: string;
  readonly baseUrl?: string;
}): Promise<TerrainProbeArtifact> {
  if (!isAbsolute(options.outputPath)) {
    throw new Error(`outputPath must be absolute, received "${options.outputPath}"`);
  }

  const artifact = await runTerrainProbe(options.baseUrl ?? DEFAULT_BASE_URL);

  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

  return artifact;
}

/**
 * A decode helper the artifact's readers may want; exported so the raw channel values in a
 * pasted header can be turned into metres without re-deriving the formula.
 */
export { decodeTerrariumMetres };
