import { describe, expect, it } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import {
  buildElevationUpstreamConfig,
  ELEVATION_PROVIDER_BUDGET,
  ELEVATION_PROVIDER_TERRAIN_TILES,
} from './elevation-upstream.config';
import { ELEVATION_PROFILE_SAMPLE_COUNT } from './elevation.types';

/** A ConfigService stand-in that answers from a plain record and refuses anything undeclared. */
function configFrom(values: Record<string, unknown>): ConfigService<Env, true> {
  return {
    getOrThrow: (key: string): unknown => {
      if (!(key in values)) throw new Error(`unexpected env read: ${key}`);
      return values[key];
    },
    get: (key: string): unknown => values[key],
  } as unknown as ConfigService<Env, true>;
}

/**
 * Every key with a DISTINCT value, so a mis-wiring is visible.
 *
 * Nine of the eleven fields are plain numbers, so wiring `singleCallTimeoutMs` to the request
 * deadline (or `tileCacheMaxTiles` to the per-request ceiling) compiles, type-checks and passes any
 * spec written with production-shaped values where several of them are equal. The earthquake leg
 * recorded that exact miss (review #118 TA118-M3); distinct values are what make the whole-object
 * comparison below able to see it.
 */
const DISTINCT: Record<string, unknown> = {
  ELEVATION_ENABLED: true,
  ELEVATION_BASE_URL: 'https://example.invalid/tiles',
  ELEVATION_UPSTREAM_DEADLINE_MS: 11,
  ELEVATION_SINGLE_CALL_TIMEOUT_MS: 22,
  ELEVATION_MAX_TILES_PER_REQUEST: 33,
  ELEVATION_TILE_FETCH_CONCURRENCY: 44,
  ELEVATION_TILE_MAX_RESPONSE_BYTES: 55,
  ELEVATION_TILE_CACHE_MAX_TILES: 66,
  ELEVATION_PROFILE_TTL_SECONDS: 77,
  ELEVATION_ERROR_TTL_SECONDS: 88,
  ELEVATION_CLIENT_ERROR_TTL_SECONDS: 99,
  ELEVATION_SCHEMA_ERROR_TTL_SECONDS: 111,
};

describe('buildElevationUpstreamConfig', () => {
  it('wires every declared variable to its own field, and none to another’s', () => {
    expect(buildElevationUpstreamConfig(configFrom(DISTINCT))).toEqual({
      enabled: true,
      baseUrl: 'https://example.invalid/tiles',
      requestDeadlineMs: 11,
      singleCallTimeoutMs: 22,
      maxTilesPerRequest: 33,
      tileFetchConcurrency: 44,
      tileMaxResponseBytes: 55,
      tileCacheMaxTiles: 66,
      budget: ELEVATION_PROVIDER_BUDGET,
      ttls: {
        ok: 77,
        no_data: 77,
        transient: 88,
        rate_limited: 88,
        client_error: 99,
        schema_error: 111,
      },
      ceilings: { staleMaxSeconds: 77, validAtMaxAgeSeconds: 77 },
    });
  });

  it('reads no variable it has not declared', () => {
    // The stand-in throws on an undeclared key, so this passing at all is the assertion: a
    // `getOrThrow` for a variable the boot schema does not carry would abort here rather than at
    // somebody's deployment.
    expect(() => buildElevationUpstreamConfig(configFrom(DISTINCT))).not.toThrow();
  });

  it('keeps the kill switch a real switch', () => {
    const off = buildElevationUpstreamConfig(configFrom({ ...DISTINCT, ELEVATION_ENABLED: false }));
    expect(off.enabled).toBe(false);
  });
});

describe('the provider budget', () => {
  it('orders the three windows so the narrower one can actually bite', () => {
    // Structural: a per-hour limit at or below the per-minute one would make the minute window
    // unreachable, and a per-day limit below the per-hour one would make the hour window the real
    // daily cap while the configured number said otherwise.
    expect(ELEVATION_PROVIDER_BUDGET.perMinute).toBeLessThan(ELEVATION_PROVIDER_BUDGET.perHour);
    expect(ELEVATION_PROVIDER_BUDGET.perHour).toBeLessThan(ELEVATION_PROVIDER_BUDGET.perDay);
  });

  it('leaves room for at least one cold worst-case request inside the narrowest window', () => {
    // The whole point of the minute limit is to brake a burst, not to make a single legitimate
    // request impossible. One request can touch at most the sample count in distinct tiles.
    expect(ELEVATION_PROVIDER_BUDGET.perMinute).toBeGreaterThan(ELEVATION_PROFILE_SAMPLE_COUNT);
  });

  it('names the provider with OUR label, not a hostname', () => {
    expect(ELEVATION_PROVIDER_TERRAIN_TILES).toBe('terrain-tiles');
    expect(ELEVATION_PROVIDER_TERRAIN_TILES).not.toContain('.');
  });
});
