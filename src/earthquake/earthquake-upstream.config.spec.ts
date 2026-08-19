import { describe, expect, it } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import {
  AFAD_TDVMS_BUDGET,
  AFAD_TDVMS_PROVIDER,
  buildEarthquakeUpstreamConfig,
} from './earthquake-upstream.config';

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

const VALUES: Record<string, unknown> = {
  EARTHQUAKE_ENABLED: true,
  EARTHQUAKE_INGEST_ENABLED: true,
  AFAD_EVENT_API_BASE_URL: 'https://servisnet.afad.gov.tr/apigateway/deprem/apiv2',
  EARTHQUAKE_INGEST_INTERVAL_SECONDS: 300,
  EARTHQUAKE_RECONCILE_INTERVAL_SECONDS: 21_600,
  EARTHQUAKE_INGEST_DEADLINE_MS: 120_000,
  EARTHQUAKE_RECENT_WINDOW_HOURS: 6,
  EARTHQUAKE_RECONCILE_WINDOW_DAYS: 7,
  EARTHQUAKE_CLOCK_SKEW_SECONDS: 300,
  EARTHQUAKE_SINGLE_CALL_TIMEOUT_MS: 15_000,
  EARTHQUAKE_TOUR_BUDGET_MS: 60_000,
  EARTHQUAKE_RESPONSE_MAX_BYTES: 4_194_304,
  EARTHQUAKE_SAFETY_LIMIT: 20_000,
  EARTHQUAKE_SCOPE_BUFFER_KM: 200,
  EARTHQUAKE_RUN_RETENTION_DAYS: 14,
  EARTHQUAKE_STALE_MAX_SECONDS: 10_800,
};

/**
 * The same 16 keys with a DISTINCT value each, so a mis-wiring is visible.
 *
 * Thirteen of the sixteen fields are plain `number`, so swapping two of them — `responseMaxBytes`
 * wired to `EARTHQUAKE_SAFETY_LIMIT`, say, which would cap every response at 20 KB against a
 * measured 203 KB reconcile payload — compiles, type-checks and passes any spec asserting a subset
 * with production-shaped values (review #118 TA118-M3). Distinct values are what make the
 * whole-object comparison below able to see it.
 */
const DISTINCT: Record<string, unknown> = {
  EARTHQUAKE_ENABLED: true,
  EARTHQUAKE_INGEST_ENABLED: true,
  AFAD_EVENT_API_BASE_URL: 'https://example.invalid/apiv2',
  EARTHQUAKE_INGEST_INTERVAL_SECONDS: 11,
  EARTHQUAKE_RECONCILE_INTERVAL_SECONDS: 22,
  EARTHQUAKE_INGEST_DEADLINE_MS: 33,
  EARTHQUAKE_RECENT_WINDOW_HOURS: 44,
  EARTHQUAKE_RECONCILE_WINDOW_DAYS: 55,
  EARTHQUAKE_CLOCK_SKEW_SECONDS: 66,
  EARTHQUAKE_SINGLE_CALL_TIMEOUT_MS: 77,
  EARTHQUAKE_TOUR_BUDGET_MS: 88,
  EARTHQUAKE_RESPONSE_MAX_BYTES: 99,
  EARTHQUAKE_SAFETY_LIMIT: 111,
  EARTHQUAKE_SCOPE_BUFFER_KM: 222,
  EARTHQUAKE_RUN_RETENTION_DAYS: 333,
  EARTHQUAKE_STALE_MAX_SECONDS: 444,
};

describe('buildEarthquakeUpstreamConfig', () => {
  it('maps each env key onto its OWN field — the whole object, with no two values alike', () => {
    expect(buildEarthquakeUpstreamConfig(configFrom(DISTINCT))).toEqual({
      enabled: true,
      ingestEnabled: true,
      baseUrl: 'https://example.invalid/apiv2',
      recentIntervalSeconds: 11,
      reconcileIntervalSeconds: 22,
      tourDeadlineMs: 33,
      recentWindowHours: 44,
      reconcileWindowDays: 55,
      clockSkewSeconds: 66,
      singleCallTimeoutMs: 77,
      tourBudgetMs: 88,
      responseMaxBytes: 99,
      safetyLimit: 111,
      scopeBufferKm: 222,
      runRetentionDays: 333,
      staleMaxSeconds: 444,
      budget: AFAD_TDVMS_BUDGET,
    });
  });

  it('resolves every value the ingest needs, once', () => {
    const config = buildEarthquakeUpstreamConfig(configFrom(VALUES));
    expect(config.enabled).toBe(true);
    expect(config.ingestEnabled).toBe(true);
    expect(config.recentIntervalSeconds).toBe(300);
    expect(config.reconcileIntervalSeconds).toBe(21_600);
    expect(config.scopeBufferKm).toBe(200);
    expect(config.budget).toBe(AFAD_TDVMS_BUDGET);
  });

  it('requires BOTH switches for the tours to be live', () => {
    expect(
      buildEarthquakeUpstreamConfig(configFrom({ ...VALUES, EARTHQUAKE_INGEST_ENABLED: false }))
        .ingestEnabled,
    ).toBe(false);

    const masterOff = buildEarthquakeUpstreamConfig(
      configFrom({ ...VALUES, EARTHQUAKE_ENABLED: false }),
    );
    expect(masterOff.enabled).toBe(false);
    // The master switch wins even with the tour switch on: the whole upstream half is off.
    expect(masterOff.ingestEnabled).toBe(false);
  });
});

describe('the AFAD budget', () => {
  it('leaves real headroom over the measured steady state', () => {
    // ~288 `recent` calls plus ~4 `reconcile` calls a day. The point of the assertion is the
    // RELATION, not the numbers: a budget under the steady state would throttle normal operation
    // and look like a provider problem.
    const dailySteadyState = 86_400 / 300 + 86_400 / 21_600;
    expect(AFAD_TDVMS_BUDGET.perDay).toBeGreaterThan(dailySteadyState);
    expect(AFAD_TDVMS_BUDGET.perHour).toBeGreaterThan(3_600 / 300);
    expect(AFAD_TDVMS_BUDGET.perMinute).toBeGreaterThan(1);
  });

  it('keys on OUR provider label, not a hostname', () => {
    expect(AFAD_TDVMS_PROVIDER).toBe('afad-tdvms');
  });
});
