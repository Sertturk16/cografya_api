import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { OperationDeadline } from '../upstream/operation-deadline';
import { UpstreamCacheService } from '../upstream/cache/upstream-cache.service';
import { UpstreamMetrics } from '../upstream/upstream-metrics';
import { buildElevationAttribution } from './elevation-attribution.constant';
import {
  ELEVATION_UPSTREAM_CONFIG,
  type ElevationUpstreamConfig,
} from './elevation-upstream.config';
import {
  ELEVATION_COORDINATE_DECIMALS,
  ELEVATION_PROFILE_SAMPLE_COUNT,
  ELEVATION_PROVIDER_TERRAIN_TILES,
  type ElevationProfilePayload,
} from './elevation.types';
import type { ElevationProfileQueryDto } from './dto/elevation-profile-query.dto';
import type { ElevationProfileDto } from './dto/elevation-profile.dto';
import { bilinearSample } from './terrain/bilinear';
import { sampleGreatCircleLine, type GeoPoint } from './terrain/great-circle';
import { TerrainTileCache } from './terrain/tile-cache';
import { TerrainTileClient, type TerrainTileGrid } from './terrain/tile.client';
import { lonLatToTilePixel, TERRAIN_SAMPLE_ZOOM, tileKey } from './terrain/tile-math';

/**
 * Cache-key version segment.
 *
 * Bump it when the SAMPLING changes meaning — a different zoom, a different sample count, a
 * different interpolation. Old entries then fall out of the key space on their own and no
 * deletion pass is needed. It is NOT bumped for a change that leaves the numbers identical.
 */
const PROFILE_KEY_VERSION = 'v1';

/** Round a coordinate to the quantisation grid the cache key is built on. */
export function quantiseCoordinate(value: number): number {
  const factor = 10 ** ELEVATION_COORDINATE_DECIMALS;
  return Math.round(value * factor) / factor;
}

/**
 * The profile cache key.
 *
 * Every input that changes the ANSWER is in it — the quantised endpoints, the zoom, the sample
 * count and the version segment. Nothing else is: no client identity, no locale, no request id.
 * The coordinates are the caller's, so the key is built from numbers a range validator has
 * already accepted and a fixed-decimal rendering, never from a user string verbatim.
 */
export function profileCacheKey(from: GeoPoint, to: GeoPoint): string {
  const render = (point: GeoPoint): string =>
    `${point.lat.toFixed(ELEVATION_COORDINATE_DECIMALS)},${point.lon.toFixed(ELEVATION_COORDINATE_DECIMALS)}`;
  return (
    `elevation:profile:${PROFILE_KEY_VERSION}:z${String(TERRAIN_SAMPLE_ZOOM)}:` +
    `n${String(ELEVATION_PROFILE_SAMPLE_COUNT)}:${render(from)}:${render(to)}`
  );
}

/** A computed profile plus whether it is the whole thing. */
interface ProfileComputation {
  readonly payload: ElevationProfilePayload;
  readonly complete: boolean;
}

/**
 * Builds one elevation profile: quantise, look in the shared cache, and only then touch tiles.
 *
 * ## The three layers, and what each one is for
 * 1. **Quantisation** (3 decimals) turns an unbounded key space into a usable one. Without it the
 *    cache below has a hit rate of approximately zero and every request is a cold request.
 * 2. **The profile cache** (`UpstreamCacheService`, Redis when configured) holds COMPLETE profiles
 *    only, shared across instances.
 * 3. **The tile cache** (in-process LRU, `TerrainTileCache`) holds decoded grids, and the tile
 *    client de-duplicates concurrent fetches of the same tile.
 *
 * ## Why a partial profile never enters layer 2 — and why it is not stored as a failure either
 * `plan-api.md` §2.5 makes both halves binding: a partial profile must not be cached (a CDN
 * republishing an incomplete cross-section shows a student a wrong shape and calls it right), and
 * it must not suppress the next attempt (the tiles it DID fetch are what make the next request
 * more complete — the partial answer is a warming step, not an error).
 *
 * That rules out routing it through `UpstreamCacheService.read` with a non-`ok` outcome: the
 * service writes a negative entry for every non-`ok` result, and a binding negative is precisely
 * what stops the next read from refreshing. So the flow splits by hand: `peek` on the way in
 * (read-only, no negative entries, no lock), and `read` on the way out ONLY once a complete
 * profile exists — where the closure can only ever return `ok`. The write still goes through the
 * service's own lock and TTL logic, so nothing about retention or key layout is reimplemented.
 *
 * The single-flight the plan wanted from layer 2 is not lost: it moved DOWN to the tile client,
 * where it also de-duplicates across different lines that share a tile. What is spent twice when
 * two identical requests race is the bilinear arithmetic, which costs nothing upstream.
 *
 * ## No personal data, on any branch — and where a coordinate CAN still reach a log
 * A coordinate here is a point a user tapped on a map. There is no session, no location
 * permission, no identifier, and nothing ties the pair to a person, so `ENGINEERING.md` §3.6's
 * personal-data rule is not engaged. Nothing in this class writes a coordinate to a log: its
 * metrics carry the provider label and counts only.
 *
 * The one qualification, stated rather than assumed: the cache KEY contains the rounded endpoints
 * (the shape `plan-api.md` §4.1 fixes, so a key in a log can be matched to a request), and
 * `UpstreamCacheService` names the key in two of its own degraded-path warnings — a staleness
 * ceiling drop and a failed background revalidation. Neither is reachable on this leg's normal
 * path, both are warnings about the cache rather than about the visitor, and the value is a
 * three-decimal map coordinate. If this endpoint ever accepts a coordinate that came from a
 * device's location rather than from a tap, that changes and the key needs to be opaque.
 */
@Injectable()
export class ElevationProfileService {
  constructor(
    private readonly cache: UpstreamCacheService,
    private readonly tiles: TerrainTileClient,
    private readonly tileCache: TerrainTileCache,
    private readonly metrics: UpstreamMetrics,
    @Inject(ELEVATION_UPSTREAM_CONFIG) private readonly config: ElevationUpstreamConfig,
  ) {}

  /**
   * The endpoint's whole job.
   *
   * Returns the DTO plus whether the result may be cached by an intermediary — the controller
   * needs the second half to choose between the long `Cache-Control` and `no-store`, and deriving
   * it there from `resolvedSampleCount` would put the same rule in two places.
   */
  async getProfile(
    query: ElevationProfileQueryDto,
  ): Promise<{ profile: ElevationProfileDto; cacheable: boolean }> {
    const from: GeoPoint = {
      lat: quantiseCoordinate(query.fromLat),
      lon: quantiseCoordinate(query.fromLon),
    };
    const to: GeoPoint = {
      lat: quantiseCoordinate(query.toLat),
      lon: quantiseCoordinate(query.toLon),
    };

    if (from.lat === to.lat && from.lon === to.lon) {
      // A zero-length line has no cross-section to draw. The distance tool's "0 km is an answer,
      // not an error" contract (SPEC §6.1) does not carry over: there the zero IS the result,
      // here there is nothing to plot. The message names the quantisation, because two endpoints
      // 40 m apart look different to the caller and identical to this service.
      throw new BadRequestException(
        `the two endpoints collapse to the same point once rounded to ` +
          `${String(ELEVATION_COORDINATE_DECIMALS)} decimals`,
      );
    }

    const key = profileCacheKey(from, to);
    const cacheOptions = {
      key,
      providerId: ELEVATION_PROVIDER_TERRAIN_TILES,
      ttls: this.config.ttls,
      ceilings: this.config.ceilings,
    };

    const peeked = await this.cache.peek<ElevationProfilePayload>(cacheOptions);
    if (peeked.kind === 'ok' && peeked.value !== null) {
      // Only complete profiles are ever written, so a hit is always a full one.
      return { profile: this.toDto(peeked.value), cacheable: true };
    }

    const computed = await this.compute(from, to);

    if (!computed.complete) {
      this.metrics.increment('elevation.profile_partial', ELEVATION_PROVIDER_TERRAIN_TILES);
      return { profile: this.toDto(computed.payload), cacheable: false };
    }

    // The WRITE path. `read` is used rather than a bare store call because the store is the
    // service's own business: this keeps retention, the negative-key layout and the cross-instance
    // lock in one place. The closure returns the value we already hold, so it makes no upstream
    // call and can never produce a negative entry. If another instance won the lock and landed the
    // same profile first, `read` hands that one back — the same line, so either is correct.
    const stored = await this.cache.read<ElevationProfilePayload>({
      ...cacheOptions,
      deadlineMs: this.config.requestDeadlineMs,
      refresh: () =>
        Promise.resolve({ kind: 'ok' as const, value: computed.payload, validAtMs: null }),
    });

    const payload = stored.kind === 'ok' && stored.value !== null ? stored.value : computed.payload;
    return { profile: this.toDto(payload), cacheable: true };
  }

  /**
   * Sample the line: plan the points, resolve the distinct tiles they need, then read each point.
   *
   * The order matters. Tiles are fetched for the DISTINCT set before any sampling happens, so the
   * per-request ceiling can be checked against a real number rather than discovered halfway
   * through, and so the concurrency limit applies to the whole set rather than per point.
   */
  private async compute(from: GeoPoint, to: GeoPoint): Promise<ProfileComputation> {
    const samples = sampleGreatCircleLine(from, to, ELEVATION_PROFILE_SAMPLE_COUNT);
    const positions = samples.map((sample) =>
      lonLatToTilePixel(sample.lon, sample.lat, TERRAIN_SAMPLE_ZOOM),
    );

    const needed = new Map<string, { tileX: number; tileY: number }>();
    for (const position of positions) {
      needed.set(tileKey(TERRAIN_SAMPLE_ZOOM, position.tileX, position.tileY), {
        tileX: position.tileX,
        tileY: position.tileY,
      });
    }

    if (needed.size > this.config.maxTilesPerRequest) {
      // Structurally unreachable: the distinct-tile count cannot exceed the sample count, and the
      // boot schema refuses a ceiling below it. Reaching this line means the arithmetic that
      // guarantee rests on has changed, so it stops LOUDLY rather than fetching an unbounded set.
      this.metrics.increment('elevation.tile_ceiling_refused', ELEVATION_PROVIDER_TERRAIN_TILES);
      this.metrics.event('error', 'elevation profile exceeded the per-request tile ceiling', {
        provider: ELEVATION_PROVIDER_TERRAIN_TILES,
        tiles: needed.size,
        ceiling: this.config.maxTilesPerRequest,
      });
      throw new Error(
        `elevation profile planned ${String(needed.size)} tiles, above the per-request ceiling ` +
          `of ${String(this.config.maxTilesPerRequest)}`,
      );
    }

    const grids = await this.resolveTiles(needed);

    const distancesKm: number[] = [];
    const elevationsM: (number | null)[] = [];
    let min: number | null = null;
    let max: number | null = null;
    let resolved = 0;

    for (const [index, sample] of samples.entries()) {
      distancesKm.push(round(sample.distanceKm, 3));

      const position = positions[index];
      const grid =
        position === undefined
          ? undefined
          : grids.get(tileKey(TERRAIN_SAMPLE_ZOOM, position.tileX, position.tileY));
      if (position === undefined || grid === undefined) {
        elevationsM.push(null);
        continue;
      }

      // Interpolate in floating point, round ONCE at the end. Rounding per channel or per tile
      // would accumulate; rounding here is the single published step, and the published unit is
      // whole metres because the source grid's own error is tens of metres (SPEC §6.6/§7.3).
      const metres = Math.round(bilinearSample(grid, position.pixelX, position.pixelY));
      elevationsM.push(metres);
      resolved += 1;
      min = min === null || metres < min ? metres : min;
      max = max === null || metres > max ? metres : max;
    }

    const lengthKm = samples[samples.length - 1]?.distanceKm ?? 0;

    return {
      complete: resolved === ELEVATION_PROFILE_SAMPLE_COUNT,
      payload: {
        fromLat: from.lat,
        fromLon: from.lon,
        toLat: to.lat,
        toLon: to.lon,
        lengthKm: round(lengthKm, 3),
        sampleCount: ELEVATION_PROFILE_SAMPLE_COUNT,
        sampleZoom: TERRAIN_SAMPLE_ZOOM,
        resolvedSampleCount: resolved,
        // An all-null profile publishes EMPTY arrays rather than 200 nulls: the payload then says
        // "nothing resolved" in one field instead of making a consumer scan for it, and the DTO
        // documents that pairing.
        distancesKm: resolved === 0 ? [] : distancesKm,
        elevationsM: resolved === 0 ? [] : elevationsM,
        minElevationM: min,
        maxElevationM: max,
      },
    };
  }

  /**
   * Resolve every needed tile: cache first, then a bounded-concurrency fetch of the rest.
   *
   * ONE deadline for the whole set, minted here and shared by every fetch — that is what makes
   * "the total upstream work of one user request" a real bound rather than a per-call timeout
   * multiplied by an unknown count. When it runs out, the remaining fetches return immediately as
   * `transient` and their samples come back `null`: the partial profile, which is the designed
   * behaviour and not a failure.
   */
  private async resolveTiles(
    needed: ReadonlyMap<string, { tileX: number; tileY: number }>,
  ): Promise<Map<string, TerrainTileGrid>> {
    const resolved = new Map<string, TerrainTileGrid>();
    const missing: Array<{ key: string; tileX: number; tileY: number }> = [];

    for (const [key, tile] of needed) {
      const cached = this.tileCache.get(key);
      if (cached !== null) {
        resolved.set(key, cached);
        continue;
      }
      missing.push({ key, ...tile });
    }

    if (missing.length === 0) return resolved;

    const deadline = new OperationDeadline(this.config.requestDeadlineMs);
    let cursor = 0;

    const worker = async (): Promise<void> => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        const job = missing[index];
        if (job === undefined) return;

        // Checked per job rather than only inside the client: once the budget is spent there is
        // nothing to gain from walking the remaining hundred tiles to be told so a hundred times.
        if (deadline.hasExpired()) return;

        const outcome = await this.tiles.fetchTile(
          TERRAIN_SAMPLE_ZOOM,
          job.tileX,
          job.tileY,
          deadline,
        );
        if (outcome.kind === 'ok') {
          this.tileCache.set(job.key, outcome.value);
          resolved.set(job.key, outcome.value);
        }
        // Every other outcome leaves the tile unresolved on purpose. The shared client has already
        // counted and logged it at the right level, so there is nothing to add here — and turning
        // it into a throw would replace a partial profile with a 500 (`ENGINEERING.md` §3.5:
        // a provider outage degrades the widget, never the page).
      }
    };

    const workerCount = Math.min(this.config.tileFetchConcurrency, missing.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    return resolved;
  }

  /** The stored payload plus the licence surface, which is rebuilt fresh on every response. */
  private toDto(payload: ElevationProfilePayload): ElevationProfileDto {
    return {
      from: { latitude: payload.fromLat, longitude: payload.fromLon },
      to: { latitude: payload.toLat, longitude: payload.toLon },
      lengthKm: payload.lengthKm,
      sampleCount: payload.sampleCount,
      sampleZoom: payload.sampleZoom,
      dataAvailable: payload.resolvedSampleCount > 0,
      resolvedSampleCount: payload.resolvedSampleCount,
      distancesKm: [...payload.distancesKm],
      elevationsM: [...payload.elevationsM],
      minElevationM: payload.minElevationM,
      maxElevationM: payload.maxElevationM,
      // NOT stored in the cache entry: a licence string that was correct when a profile was
      // computed and has since changed must not be served for the entry's whole day of TTL.
      attribution: buildElevationAttribution(),
    };
  }
}

/** Round to `decimals` places, avoiding the `toFixed` string round trip. */
function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
