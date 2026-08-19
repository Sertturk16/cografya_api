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
const REQUEST_SPACING_MS = 400;

/** Ceiling on one request, so a stalled socket cannot hang a hand-run script indefinitely. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Refuse a body larger than this. A conforming tile measured ~121 kB (SPEC §7.1); 2 MB is far
 * above anything legitimate and far below anything that could hurt the operator's machine.
 */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

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
  readonly tiles: readonly TileFetchRecord[];
  readonly points: readonly PointRecord[];
  readonly bathymetryByZoom: readonly {
    readonly label: string;
    readonly zoom: number;
    readonly metres: number | null;
    readonly imagerySources: string | null;
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
   * Scoped deliberately: the endpoint fetches z12 and nothing else, so a mean that folded in
   * a 757-byte low-zoom sea tile would understate the byte cap and the per-request budget the
   * numbers exist to set.
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

interface FetchedBody {
  readonly status: number;
  readonly bytes: Uint8Array;
  readonly elapsedMs: number;
  readonly headers: Headers;
}

/** One polite GET with a byte cap and a timeout. */
async function politeGet(url: string): Promise<FetchedBody> {
  const startedAt = Date.now();
  const response = await fetch(url, {
    headers: { 'User-Agent': UPSTREAM_USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: 'error',
  });

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength > MAX_BODY_BYTES) {
    throw new Error(`${url} returned ${String(bytes.byteLength)} bytes, over the probe cap`);
  }

  await sleep(REQUEST_SPACING_MS);
  return {
    status: response.status,
    bytes,
    elapsedMs: Date.now() - startedAt,
    headers: response.headers,
  };
}

function percentile(sorted: readonly number[], fraction: number): number {
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

  async function loadTile(zoom: number, x: number, y: number): Promise<Int16Array | null> {
    const key = tileKey(zoom, x, y);
    const cached = decodedTiles.get(key);
    if (cached !== undefined) return cached;

    const response = await politeGet(tileUrl(baseUrl, zoom, x, y));
    requestCount += 1;

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
      for (const entry of sources.split(',')) {
        const family = entry.trim().split('/')[0];
        if (family !== undefined && family !== '') {
          imagerySourceTokens.add(family);
          perZoom.add(family);
        }
      }
      imagerySourceTokensByZoom.set(zoom, perZoom);
    }

    if (response.status !== 200) return null;

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
      const decoded = grid === null ? null : bilinearSample(grid, position.pixelX, position.pixelY);
      const nearest =
        grid === null
          ? null
          : (grid[Math.floor(position.pixelY) * TILE_SIZE + Math.floor(position.pixelX)] ?? null);
      points.push({
        label: point.label,
        kind: point.kind,
        lat: point.lat,
        lon: point.lon,
        zoom: TERRAIN_SAMPLE_ZOOM,
        tile: key,
        decodedM: decoded === null ? null : Number(decoded.toFixed(2)),
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
        const record = tiles.find((tile) => tile.tile === key);
        bathymetryByZoom.push({
          label: offshore.label,
          zoom,
          metres:
            grid === null
              ? null
              : Number(bilinearSample(grid, position.pixelX, position.pixelY).toFixed(2)),
          imagerySources: record?.imagerySources ?? null,
        });
      } catch (error: unknown) {
        bathymetryByZoom.push({
          label: offshore.label,
          zoom,
          metres: null,
          imagerySources: error instanceof Error ? `ERROR: ${error.message}` : 'ERROR',
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
  try {
    const response = await politeGet(ATTRIBUTION_DOC_URL);
    requestCount += 1;
    const sha256 = createHash('sha256').update(response.bytes).digest('hex');
    attribution = {
      url: ATTRIBUTION_DOC_URL,
      httpStatus: response.status,
      bytes: response.bytes.byteLength,
      sha256,
      pinnedSha256: PINNED_ATTRIBUTION_SHA256,
      matchesPin: sha256 === PINNED_ATTRIBUTION_SHA256,
    };
  } catch {
    attribution = null;
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

  return {
    generatedAtUtc: new Date().toISOString(),
    baseUrl,
    zoom: TERRAIN_SAMPLE_ZOOM,
    userAgent: UPSTREAM_USER_AGENT,
    requestCount,
    attribution,
    tiles,
    points,
    bathymetryByZoom,
    imagerySourceTokens: [...imagerySourceTokens].sort(),
    imagerySourceTokensByZoom: tokensByZoom,
    samplingZoomSourceTokens: tokensByZoom[String(TERRAIN_SAMPLE_ZOOM)] ?? [],
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
