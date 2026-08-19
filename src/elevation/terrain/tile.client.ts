import type { OperationDeadline } from '../../upstream/operation-deadline';
import type { ProviderBudgetLimits } from '../../upstream/provider-budget';
import type { UpstreamHttpClient } from '../../upstream/upstream-http.client';
import type { UpstreamMetrics } from '../../upstream/upstream-metrics';
import { UpstreamSchemaError, type UpstreamOutcome } from '../../upstream/upstream.types';
import { ELEVATION_PROVIDER_TERRAIN_TILES } from '../elevation.types';
import { decodeTerrainTile } from './terrarium-decode';
import { TERRAIN_SAMPLE_ZOOM, tileKey } from './tile-math';

/**
 * The S3 object-metadata header the bucket reports a tile's source DEMs in.
 *
 * **This is the S3 name, not the document's.** `joerd/docs/attribution.md` calls the header
 * `X-Imagery-Sources`, which describes Mapzen's own hosted service; the AWS bucket we read serves
 * it as `x-amz-meta-x-imagery-sources`. The provenance ledger records the difference explicitly
 * (`provenance/datasets.md`, AÇIK 2) and makes the S3 spelling binding for any code that automates
 * the source check — reading the document's name would produce a tripwire that never fires and
 * looks installed.
 *
 * Lowercase because `Headers.get` is case-insensitive but a reader of this constant should see the
 * wire form.
 */
export const IMAGERY_SOURCES_HEADER = 'x-amz-meta-x-imagery-sources';

/**
 * The source families whose credit the published notices already carry.
 *
 * Derived from the attribution lines, not from a memory of what the bucket serves: line 1 credits
 * EU-DEM, line 3 credits 3DEP (formerly NED), GMTED2010 and SRTM. A tile built from any of these
 * is correctly attributed by what we publish. The PR-E1 probe measured `eudem` and `gmted` at the
 * sampling zoom and asserted the whole set as its allow-list
 * (`data/elevation/terrain-tiles-probe.json`).
 *
 * A family OUTSIDE this set means we would be publishing a credit that does not name the data —
 * which is the licence breach the tripwire exists to prevent.
 */
export const ATTRIBUTION_COVERED_SOURCE_FAMILIES: readonly string[] = [
  '3dep',
  'eudem',
  'gmted',
  'ned',
  'srtm',
];

/**
 * The family that is credited by the notices AND still refused here — the one asymmetry in this
 * file, and it is deliberate.
 *
 * ETOPO1 carries sea depth. The whole z12 pin exists because ETOPO1 leaves the tile mix at z ≥ 11
 * (measured in SPEC §8.2, re-measured by the PR-E1 probe at z8–z13), which is what lets this tool
 * promise it never draws a sea-floor profile and what keeps NOAA's "Not to be used for navigation"
 * limit from binding the surface. A tile that arrives at the sampling zoom carrying `etopo1` means
 * that premise has changed upstream. That is not a condition to sample through — it is a design
 * assumption breaking, and the honest response is to refuse the tile loudly rather than to publish
 * a profile whose sea section is a depth reading nobody labelled.
 */
export const SEA_DEPTH_SOURCE_FAMILIES: readonly string[] = ['etopo1'];

/** What a successful tile fetch yields: the decoded grid, in metres. */
export type TerrainTileGrid = Int16Array;

export interface TerrainTileClientOptions {
  readonly baseUrl: string;
  readonly limits: ProviderBudgetLimits;
  readonly singleCallTimeoutMs: number;
  readonly maxResponseBytes: number;
}

/**
 * Split an `x-amz-meta-x-imagery-sources` value into the FAMILY tokens it names.
 *
 * The measured shape is a comma-separated list of object paths:
 * `eudem/eudem_dem_5deg_n35e030.tif, gmted/30N030E_20101117_gmted_mea075.tif`. The family is the
 * first path segment, lowercased. Anything that does not look like `family/...` still yields its
 * leading token, so a reshaped value produces an UNKNOWN family and is refused rather than
 * silently treated as empty — an empty parse of a present header would be the quietest possible
 * way for this guard to stop working.
 *
 * ## Two measured holes this shape had, and why each is closed the way it is
 * Both were reproduced against the real functions in the #124 review, and both need only a
 * one-character change upstream — which is exactly the reshape this tripwire exists for.
 *
 * - **The separator is a CLASS, not a comma** (VAL124-M1). Splitting on `,` alone meant
 *   `eudem/x.tif etopo1/ETOPO1_Bed_g.tif` parsed to `['eudem']`: a plausible, fully credited set,
 *   with the sea-depth family invisible behind the first entry. That is worse than an empty parse,
 *   because the tile is then SAMPLED. Whitespace, `;` and `|` split too.
 * - **An entry whose leading segment is empty keeps its whole token** (SFH124-I1). The old trailing
 *   `.filter(family.length > 0)` dropped `/etopo1/x.tif` to nothing, and the caller accepted the
 *   tile with no refusal and no counter. Falling back to the entry itself makes it an unknown
 *   family, which {@link refuseImagerySources} refuses and names in the log.
 */
export function parseImagerySourceFamilies(headerValue: string): string[] {
  const families = headerValue
    .split(/[\s,;|]+/)
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const leading = entry.split('/')[0];
      return (leading === undefined || leading === '' ? entry : leading).toLowerCase();
    });
  return [...new Set(families)];
}

/**
 * Why a set of families is unacceptable — or `null` when it is fine.
 *
 * The caller only reaches this with a PRESENT, non-blank header ({@link
 * TerrainTileClient.checkImagerySources} returns before it otherwise), so an empty set here does
 * not mean "no header" — it means a header we did not understand at all, which is an unknown
 * source and refused as one (review #124, SFH124-I1).
 */
export function refuseImagerySources(families: readonly string[]): string | null {
  if (families.length === 0) {
    return 'imagery sources header was present but named no source family';
  }

  const seaDepth = families.filter((family) => SEA_DEPTH_SOURCE_FAMILIES.includes(family));
  if (seaDepth.length > 0) {
    return (
      `imagery sources include ${seaDepth.join(', ')}, which carries sea depth and is absent ` +
      `from the sampling zoom by measurement — the z${String(TERRAIN_SAMPLE_ZOOM)} licence ` +
      `premise no longer holds upstream`
    );
  }

  const uncredited = families.filter(
    (family) => !ATTRIBUTION_COVERED_SOURCE_FAMILIES.includes(family),
  );
  if (uncredited.length > 0) {
    return (
      `imagery sources include ${uncredited.join(', ')}, which the published attribution does ` +
      `not credit`
    );
  }

  return null;
}

/**
 * Fetches and decodes one terrarium tile, through the shared upstream client.
 *
 * ## What this class adds on top of `UpstreamHttpClient`, and what it deliberately does not
 * It adds three things: the URL shape, the runtime imagery-source tripwire, and in-flight
 * de-duplication. It adds NO timeout, retry, budget, breaker or byte-cap logic — that guard order
 * lives in the shared client, once, and is never re-implemented (the rule that class states about
 * itself, and the home of review #73's CRITICAL finding).
 *
 * ## In-flight de-duplication, and why it sits at the TILE rather than the profile
 * `plan-api.md` §4.1 wanted the profile cache's single-flight so that two students drawing the
 * same line produce one computation. De-duplicating at the tile level delivers that AND more: two
 * DIFFERENT lines crossing the same mountain also share their tiles, and it is the tile fetch —
 * not the arithmetic over it — that costs anything upstream. One `Map<tileKey, Promise>` for the
 * process, cleared as each fetch settles.
 *
 * It is per-process, like the tile cache above it. Cross-instance sharing would be a Redis tile
 * tier, which `plan-api.md` §4.2 costed and left to Atlas rather than adding on reflex.
 */
export class TerrainTileClient {
  private readonly inFlight = new Map<string, Promise<UpstreamOutcome<TerrainTileGrid>>>();

  /** Once-per-process, so a provider that stopped sending the header cannot flood the log. */
  private warnedAboutMissingHeader = false;

  constructor(
    private readonly http: UpstreamHttpClient,
    private readonly metrics: UpstreamMetrics,
    private readonly options: TerrainTileClientOptions,
  ) {}

  /**
   * The tile's URL. `{base}/terrarium/{z}/{x}/{y}.png` — the bucket's own layout.
   *
   * Built from integers this service computed, never from anything a caller supplied verbatim: the
   * tile indices come out of `lonLatToTilePixel`, which takes numbers a `class-validator` range
   * has already accepted.
   */
  urlFor(zoom: number, tileX: number, tileY: number): string {
    return `${this.options.baseUrl}/terrarium/${String(zoom)}/${String(tileX)}/${String(tileY)}.png`;
  }

  /**
   * Fetch and decode one tile.
   *
   * Returns an OUTCOME rather than throwing: a provider failure is an expected state on this path
   * (the widget degrades, the page never does), and the caller turns a failure into `null` samples
   * rather than into a 500.
   */
  async fetchTile(
    zoom: number,
    tileX: number,
    tileY: number,
    deadline: OperationDeadline,
  ): Promise<UpstreamOutcome<TerrainTileGrid>> {
    const key = tileKey(zoom, tileX, tileY);
    const running = this.inFlight.get(key);
    if (running !== undefined) {
      this.metrics.increment('elevation.tile_joined', ELEVATION_PROVIDER_TERRAIN_TILES);
      return await running;
    }

    const started = this.requestTile(key, zoom, tileX, tileY, deadline);
    this.inFlight.set(key, started);
    try {
      return await started;
    } finally {
      // In `finally`, so a rejection (our own bug escaping the client) cannot leave a settled
      // promise wedged in the map for the process's lifetime — the shape of the breaker-trial
      // leak review #73 found, applied to a much smaller thing.
      this.inFlight.delete(key);
    }
  }

  private requestTile(
    key: string,
    zoom: number,
    tileX: number,
    tileY: number,
    deadline: OperationDeadline,
  ): Promise<UpstreamOutcome<TerrainTileGrid>> {
    return this.http.request<TerrainTileGrid>({
      providerId: ELEVATION_PROVIDER_TERRAIN_TILES,
      label: `terrain.tile.${key}`,
      url: this.urlFor(zoom, tileX, tileY),
      deadline,
      limits: this.options.limits,
      singleCallTimeoutMs: this.options.singleCallTimeoutMs,
      maxResponseBytes: this.options.maxResponseBytes,
      // The bucket serves PNG; anything else means we are not looking at a tile, and the check
      // runs BEFORE the body is handed to the decoder.
      expectedContentType: 'image/png',
      responseKind: 'bytes',
      // A tile that does not exist in the pyramid is a legitimate answer for a coordinate at the
      // edge of coverage, not an outage — `no_data` keeps its log quiet and records a breaker
      // SUCCESS, because the provider answered exactly as designed.
      missingMeansNoData: true,
      parse: (body, headers) => {
        this.checkImagerySources(key, headers.get(IMAGERY_SOURCES_HEADER));
        // Throws `TerrainTileFormatError` on a malformed or unexpected PNG. That is not an
        // `UpstreamSchemaError`, so it would reach the client as OUR bug and be rethrown — which
        // is wrong here: a provider serving bytes we did not design for is a contract surprise,
        // not a programming error. Translated at this boundary, which is the only place that
        // knows both vocabularies.
        try {
          return { kind: 'ok', value: decodeTerrainTile(body) };
        } catch (error: unknown) {
          if (error instanceof UpstreamSchemaError) throw error;
          throw new UpstreamSchemaError(
            `terrain tile ${key} did not decode: ${error instanceof Error ? error.message : 'unknown'}`,
            { cause: error },
          );
        }
      },
    });
  }

  /**
   * The tripwire (SPEC §8.2, `provenance/integrations.md` go-live obligations).
   *
   * ## An unexpected source is REFUSED; a missing header is not
   * These two are not symmetric, and treating them the same would be the wrong call in both
   * directions:
   *
   * - **An unexpected family** means the tile we are about to publish a credit for was built from
   *   something that credit does not name — a licence breach in the making. Refusing the tile
   *   costs one blank sample; publishing it costs the thing the ledger's go-live obligation is
   *   about. It is raised as `UpstreamSchemaError`, which the shared client turns into
   *   `schema_error`: an alarm-level log, no retry, and the shortest negative TTL on this leg.
   * - **A missing header** is a metadata change, not a data change. Failing closed there would
   *   take the whole feature down the day AWS reorganises its object metadata, for a risk that is
   *   not licence risk. So the tile is accepted, a counter moves, and the first occurrence warns
   *   once — visible without being a flood.
   * - **A PRESENT header we cannot parse into any family** belongs to the first class, not the
   *   second: the metadata is there and says something, and we cannot tell what. It is refused
   *   (review #124, SFH124-I1). The line between the two is drawn HERE, by the early return below,
   *   so `refuseImagerySources` never sees the missing-header case at all.
   */
  private checkImagerySources(key: string, headerValue: string | null): void {
    if (headerValue === null || headerValue.trim() === '') {
      this.metrics.increment('elevation.imagery_sources_absent', ELEVATION_PROVIDER_TERRAIN_TILES);
      if (!this.warnedAboutMissingHeader) {
        this.warnedAboutMissingHeader = true;
        this.metrics.event('warn', 'terrain tile carried no imagery-sources header', {
          provider: ELEVATION_PROVIDER_TERRAIN_TILES,
          header: IMAGERY_SOURCES_HEADER,
          tile: key,
          note: 'accepted: a metadata change is not a licence change. Counted, warned once.',
        });
      }
      return;
    }

    const families = parseImagerySourceFamilies(headerValue);
    const refusal = refuseImagerySources(families);
    if (refusal === null) return;

    this.metrics.increment('elevation.imagery_sources_refused', ELEVATION_PROVIDER_TERRAIN_TILES);
    // The families, not the raw header: the value is a list of object paths and the families are
    // what the decision was made on. `UpstreamSchemaError` carries it into the alarm-level line
    // the shared client emits for `schema_error`.
    throw new UpstreamSchemaError(
      `terrain tile ${key} refused — ${refusal} (families: ${families.join(', ')})`,
    );
  }
}
