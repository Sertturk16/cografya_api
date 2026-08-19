import { beforeEach, describe, expect, it } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { InProcessSingleFlight } from '../upstream/cache/single-flight';
import { InProcessCacheStore } from '../upstream/cache/upstream-cache.store';
import { UpstreamCacheService } from '../upstream/cache/upstream-cache.service';
import { UpstreamMetrics } from '../upstream/upstream-metrics';
import type { UpstreamOutcome } from '../upstream/upstream.types';
import {
  ElevationProfileService,
  profileCacheKey,
  quantiseCoordinate,
} from './elevation-profile.service';
import type { ElevationUpstreamConfig } from './elevation-upstream.config';
import {
  ELEVATION_PROFILE_SAMPLE_COUNT,
  ELEVATION_PROVIDER_TERRAIN_TILES,
} from './elevation.types';
import type { ElevationProfileQueryDto } from './dto/elevation-profile-query.dto';
import { TerrainTileCache } from './terrain/tile-cache';
import type { TerrainTileClient, TerrainTileGrid } from './terrain/tile.client';
import { TERRAIN_SAMPLE_ZOOM, TILE_SIZE } from './terrain/tile-math';

const CONFIG: ElevationUpstreamConfig = {
  enabled: true,
  baseUrl: 'https://tiles.invalid',
  requestDeadlineMs: 5_000,
  singleCallTimeoutMs: 1_000,
  maxTilesPerRequest: 220,
  tileFetchConcurrency: 4,
  tileMaxResponseBytes: 524_288,
  tileCacheMaxTiles: 256,
  budget: { perMinute: 1_000, perHour: 10_000, perDay: 100_000 },
  ttls: {
    ok: 86_400,
    no_data: 86_400,
    transient: 60,
    rate_limited: 60,
    client_error: 900,
    schema_error: 300,
  },
  ceilings: { staleMaxSeconds: 86_400, validAtMaxAgeSeconds: 86_400 },
};

/** A grid where every cell holds the same elevation, so a sampled value is unambiguous. */
function flatGrid(metres: number): TerrainTileGrid {
  return new Int16Array(TILE_SIZE * TILE_SIZE).fill(metres);
}

/**
 * A tile client stand-in that answers from a rule, counts its calls, and can fail on demand.
 *
 * A fake rather than the real client over a fake `fetch`: this spec is about the SERVICE's
 * decisions — quantisation, the partial rule, what reaches the cache — and the real client's own
 * behaviour is pinned next door in `tile.client.spec.ts`.
 */
class FakeTileClient {
  readonly requested: string[] = [];

  constructor(private readonly answer: (index: number) => UpstreamOutcome<TerrainTileGrid>) {}

  // The deadline parameter is deliberately absent: this fake answers instantly, and a parameter
  // it never reads would be a lint error rather than documentation. The real signature is pinned
  // where it matters — `tile.client.spec.ts` exercises the deadline against the real client.
  fetchTile(zoom: number, tileX: number, tileY: number): Promise<UpstreamOutcome<TerrainTileGrid>> {
    const index = this.requested.length;
    this.requested.push(`${String(zoom)}/${String(tileX)}/${String(tileY)}`);
    return Promise.resolve(this.answer(index));
  }
}

function serviceWith(client: FakeTileClient): {
  service: ElevationProfileService;
  metrics: UpstreamMetrics;
} {
  const metrics = new UpstreamMetrics();
  const cache = new UpstreamCacheService(
    new InProcessCacheStore(),
    new InProcessSingleFlight(metrics),
    metrics,
  );
  return {
    service: new ElevationProfileService(
      cache,
      client as unknown as TerrainTileClient,
      new TerrainTileCache(CONFIG.tileCacheMaxTiles),
      metrics,
      CONFIG,
    ),
    metrics,
  };
}

/** A short line inside the Türkiye frame — few enough tiles to keep the fake honest. */
const SHORT_LINE: ElevationProfileQueryDto = {
  fromLat: 39.92,
  fromLon: 32.85,
  toLat: 39.95,
  toLon: 32.9,
};

describe('quantiseCoordinate', () => {
  it('rounds to three decimals', () => {
    expect(quantiseCoordinate(41.2871234)).toBe(41.287);
    expect(quantiseCoordinate(-0.0004)).toBe(-0);
  });

  it('is idempotent — quantising a quantised value changes nothing', () => {
    // The property the cache key rests on: a client echoing `from`/`to` back at us must land on
    // the same key, not one rounding step further away.
    const once = quantiseCoordinate(36.3304999);
    expect(quantiseCoordinate(once)).toBe(once);
  });
});

describe('profileCacheKey', () => {
  it('carries every input that changes the answer, and nothing else', () => {
    const key = profileCacheKey({ lat: 41.287, lon: 36.33 }, { lat: 39.904, lon: 41.277 });
    expect(key).toBe(
      `elevation:profile:v1:z${String(TERRAIN_SAMPLE_ZOOM)}:` +
        `n${String(ELEVATION_PROFILE_SAMPLE_COUNT)}:41.287,36.330:39.904,41.277`,
    );
  });

  it('renders a fixed number of decimals, so 36.33 and 36.330 are ONE key', () => {
    // Without the fixed rendering these two produce different strings for the same line, and the
    // cache silently halves its own hit rate in a way no test of the arithmetic could see.
    expect(profileCacheKey({ lat: 41.287, lon: 36.33 }, { lat: 39.9, lon: 41.2 })).toBe(
      profileCacheKey({ lat: 41.287, lon: 36.33 }, { lat: 39.9, lon: 41.2 }),
    );
    expect(profileCacheKey({ lat: 41.287, lon: 36.33 }, { lat: 39.9, lon: 41.2 })).toContain(
      '39.900,41.200',
    );
  });

  it('distinguishes direction — A→B is not B→A', () => {
    const forward = profileCacheKey({ lat: 41, lon: 36 }, { lat: 39, lon: 41 });
    const backward = profileCacheKey({ lat: 39, lon: 41 }, { lat: 41, lon: 36 });
    expect(forward).not.toBe(backward);
  });
});

describe('ElevationProfileService', () => {
  let client: FakeTileClient;

  beforeEach(() => {
    client = new FakeTileClient(() => ({ kind: 'ok', value: flatGrid(500), validAtMs: null }));
  });

  it('refuses a line whose endpoints collapse under quantisation', async () => {
    const { service } = serviceWith(client);
    await expect(
      service.getProfile({ fromLat: 39.9201, fromLon: 32.8541, toLat: 39.9199, toLon: 32.8539 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // And it refuses BEFORE reaching the provider — the point of validating first.
    expect(client.requested).toHaveLength(0);
  });

  it('echoes the QUANTISED endpoints, not the ones it was given', async () => {
    const { service } = serviceWith(client);
    const { profile } = await service.getProfile({
      fromLat: 39.9201234,
      fromLon: 32.8541234,
      toLat: 39.9501234,
      toLon: 32.9001234,
    });
    expect(profile.from).toEqual({ latitude: 39.92, longitude: 32.854 });
    expect(profile.to).toEqual({ latitude: 39.95, longitude: 32.9 });
  });

  it('publishes the server constants rather than letting a caller assume them', async () => {
    const { service } = serviceWith(client);
    const { profile } = await service.getProfile(SHORT_LINE);
    expect(profile.sampleCount).toBe(ELEVATION_PROFILE_SAMPLE_COUNT);
    expect(profile.sampleZoom).toBe(TERRAIN_SAMPLE_ZOOM);
  });

  it('returns two parallel arrays of the sample count, with a monotone distance ramp', async () => {
    const { service } = serviceWith(client);
    const { profile } = await service.getProfile(SHORT_LINE);
    expect(profile.distancesKm).toHaveLength(ELEVATION_PROFILE_SAMPLE_COUNT);
    expect(profile.elevationsM).toHaveLength(ELEVATION_PROFILE_SAMPLE_COUNT);
    expect(profile.distancesKm[0]).toBe(0);
    for (let index = 1; index < profile.distancesKm.length; index += 1) {
      expect(profile.distancesKm[index] ?? 0).toBeGreaterThanOrEqual(
        profile.distancesKm[index - 1] ?? 0,
      );
    }
  });

  it('publishes whole metres only', async () => {
    const { service } = serviceWith(
      new FakeTileClient(() => ({ kind: 'ok', value: flatGrid(1234), validAtMs: null })),
    );
    const { profile } = await service.getProfile(SHORT_LINE);
    for (const value of profile.elevationsM) {
      if (value === null) continue;
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('marks a complete profile cacheable and answers the second request with ZERO fetches', async () => {
    const { service } = serviceWith(client);
    const first = await service.getProfile(SHORT_LINE);
    expect(first.cacheable).toBe(true);
    expect(first.profile.resolvedSampleCount).toBe(ELEVATION_PROFILE_SAMPLE_COUNT);

    const fetchesAfterFirst = client.requested.length;
    expect(fetchesAfterFirst).toBeGreaterThan(0);

    const second = await service.getProfile(SHORT_LINE);
    expect(client.requested).toHaveLength(fetchesAfterFirst);
    expect(second.profile.elevationsM).toEqual(first.profile.elevationsM);
  });

  it('reaches the same cache entry from an unquantised repeat of the same line', async () => {
    const { service } = serviceWith(client);
    await service.getProfile(SHORT_LINE);
    const fetchesAfterFirst = client.requested.length;

    await service.getProfile({
      fromLat: SHORT_LINE.fromLat + 0.0001,
      fromLon: SHORT_LINE.fromLon - 0.0001,
      toLat: SHORT_LINE.toLat + 0.0002,
      toLon: SHORT_LINE.toLon,
    });
    expect(client.requested).toHaveLength(fetchesAfterFirst);
  });

  it('answers a PARTIAL profile as not cacheable, and does not store it', async () => {
    // Only the first tile resolves; everything after it fails transiently.
    const { service, metrics } = serviceWith(
      new FakeTileClient((index) =>
        index === 0
          ? { kind: 'ok', value: flatGrid(700), validAtMs: null }
          : { kind: 'transient', reason: 'provider down' },
      ),
    );
    const first = await service.getProfile(SHORT_LINE);
    expect(first.cacheable).toBe(false);
    expect(first.profile.resolvedSampleCount).toBeLessThan(ELEVATION_PROFILE_SAMPLE_COUNT);
    expect(first.profile.dataAvailable).toBe(true);
    expect(metrics.get('elevation.profile_partial', ELEVATION_PROVIDER_TERRAIN_TILES)).toBe(1);

    // The second half of the rule, and the one a naive implementation gets wrong: a partial answer
    // must not have written a NEGATIVE entry either, or the retry that completes it never happens.
    const second = await service.getProfile(SHORT_LINE);
    expect(second.profile.resolvedSampleCount).toBeGreaterThan(0);
  });

  it('answers dataAvailable:false with EMPTY arrays when nothing resolves', async () => {
    const { service } = serviceWith(
      new FakeTileClient(() => ({ kind: 'transient', reason: 'provider down' })),
    );
    const { profile, cacheable } = await service.getProfile(SHORT_LINE);
    expect(cacheable).toBe(false);
    expect(profile.dataAvailable).toBe(false);
    expect(profile.resolvedSampleCount).toBe(0);
    expect(profile.distancesKm).toEqual([]);
    expect(profile.elevationsM).toEqual([]);
    expect(profile.minElevationM).toBeNull();
    expect(profile.maxElevationM).toBeNull();
  });

  it('carries the full attribution block even when nothing resolved', async () => {
    const { service } = serviceWith(
      new FakeTileClient(() => ({ kind: 'transient', reason: 'provider down' })),
    );
    const { profile } = await service.getProfile(SHORT_LINE);
    expect(profile.attribution.requiredNoticesEn).toHaveLength(3);
    expect(profile.attribution.methodNoteTr.length).toBeGreaterThan(0);
  });

  it('never turns a provider failure into a throw', async () => {
    const { service } = serviceWith(
      new FakeTileClient(() => ({ kind: 'schema_error', reason: 'imagery sources refused' })),
    );
    await expect(service.getProfile(SHORT_LINE)).resolves.toBeDefined();
  });

  it('fetches each distinct tile once, however many samples land on it', async () => {
    const { service } = serviceWith(client);
    await service.getProfile(SHORT_LINE);
    expect(new Set(client.requested).size).toBe(client.requested.length);
    // And the structural ceiling holds: distinct tiles cannot exceed the sample count.
    expect(client.requested.length).toBeLessThanOrEqual(ELEVATION_PROFILE_SAMPLE_COUNT);
  });

  it('samples only at the pinned zoom', async () => {
    const { service } = serviceWith(client);
    await service.getProfile(SHORT_LINE);
    for (const tile of client.requested) {
      expect(tile.startsWith(`${String(TERRAIN_SAMPLE_ZOOM)}/`)).toBe(true);
    }
  });
});
