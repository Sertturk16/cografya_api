import { describe, expect, it } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import { MAX_INFLATED_BYTES } from './cams/cams-zip';
import type { Env } from '../config/env.schema';
import { validateEnv } from '../config/env.schema';
import {
  buildAirQualityUpstreamConfig,
  CAMS_ADS_BUDGET,
  CAMS_ADS_PROVIDER,
} from './air-quality-upstream.config';

/**
 * The env → config resolution, exercised through the REAL schema output rather than a
 * hand-written object: a field that stops existing in the schema must fail here, not silently
 * resolve to `undefined` inside a config nobody re-reads.
 */
function configServiceFor(overrides: Record<string, string> = {}): ConfigService<Env, true> {
  const env = validateEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    ...overrides,
  });
  return {
    get: (key: keyof Env) => env[key],
    getOrThrow: (key: keyof Env) => {
      const value = env[key];
      if (value === undefined) throw new Error(`missing ${String(key)}`);
      return value;
    },
  } as unknown as ConfigService<Env, true>;
}

describe('buildAirQualityUpstreamConfig', () => {
  it('resolves the whole coherent set from the schema defaults', () => {
    const config = buildAirQualityUpstreamConfig(configServiceFor());

    expect(config.enabled).toBe(false);
    // Both switches, so the ingest tour is off whenever EITHER is off.
    expect(config.ingestEnabled).toBe(false);
    expect(config.analysisEnabled).toBe(true);
    expect(config.ads.apiKey).toBeNull();
    expect(config.ads.area).toEqual([42.5, 25.5, 35.5, 45.0]);
    expect(config.ads.objectStoreHosts).toEqual(['object-store.os-api.cci2.ecmwf.int']);
    expect(config.ads.forecastHours).toBe(96);
    expect(config.ads.maxAttemptsPerJob).toBe(6);
    expect(config.budgets[CAMS_ADS_PROVIDER]).toEqual(CAMS_ADS_BUDGET);
    expect(config.ttls.ok).toBe(3_600);
    expect(config.ceilings.staleMaxSeconds).toBe(43_200);
    expect(config.runMaxAgeSeconds).toBe(172_800);
  });

  it('ingestEnabled needs BOTH switches — either one off stops the tour', () => {
    expect(
      buildAirQualityUpstreamConfig(
        configServiceFor({ AIR_QUALITY_ENABLED: 'true', ADS_API_KEY: 'k' }),
      ).ingestEnabled,
    ).toBe(true);
    expect(
      buildAirQualityUpstreamConfig(
        configServiceFor({
          AIR_QUALITY_ENABLED: 'true',
          ADS_API_KEY: 'k',
          AIR_QUALITY_INGEST_ENABLED: 'false',
        }),
      ).ingestEnabled,
    ).toBe(false);
  });

  it('splits a multi-host allowlist and drops blanks', () => {
    const config = buildAirQualityUpstreamConfig(
      configServiceFor({ ADS_OBJECT_STORE_HOSTS: 'a.example, b.example ,' }),
    );
    expect(config.ads.objectStoreHosts).toEqual(['a.example', 'b.example']);
  });

  it('K-A2a-4: the ZIP module default EQUALS the env default for the same ceiling (D2)', () => {
    // Two numbers describing one ceiling. The runtime passes env explicitly, so the module
    // constant is only the hand-run/test default — but if the two ever diverge, the tool that
    // produced the committed evidence would be enforcing a different limit than the server.
    // That divergence is now a red test rather than a comment nobody re-reads.
    const env = validateEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    });
    expect(MAX_INFLATED_BYTES).toBe(env.AIR_QUALITY_RUN_MAX_BYTES);
  });
});
