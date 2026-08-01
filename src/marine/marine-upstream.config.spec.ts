import { describe, expect, it } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { validateEnv } from '../config/env.schema';
import {
  buildMarineUpstreamConfig,
  MARINE_PROVIDER,
  MARINE_PROVIDER_BUDGETS,
} from './marine-upstream.config';

/**
 * A ConfigService stand-in over a validated env object.
 *
 * Built from `validateEnv` rather than a hand-written literal on purpose: the mapping asserted
 * below is only meaningful if the values really are the ones boot produces.
 */
function configFrom(raw: Record<string, string>): ConfigService<Env, true> {
  const env = validateEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    ...raw,
  });
  return {
    getOrThrow: (key: keyof Env) => env[key],
  } as unknown as ConfigService<Env, true>;
}

describe('buildMarineUpstreamConfig', () => {
  it('maps every env TTL onto the outcome kind it belongs to', () => {
    // The mapping is the whole point of the function and it is entirely by NAME, which is exactly
    // the kind of thing that silently swaps two fields and produces a 60-second land mask.
    const config = buildMarineUpstreamConfig(
      configFrom({
        MARINE_VALUE_TTL_SECONDS: '11',
        MARINE_NO_DATA_TTL_SECONDS: '22',
        MARINE_ERROR_TTL_SECONDS: '33',
        MARINE_RATELIMIT_TTL_SECONDS: '44',
        MARINE_CLIENT_ERROR_TTL_SECONDS: '55',
        MARINE_SCHEMA_ERROR_TTL_SECONDS: '66',
      }),
    );

    expect(config.ttls).toEqual({
      ok: 11,
      no_data: 22,
      transient: 33,
      rate_limited: 44,
      client_error: 55,
      schema_error: 66,
    });
  });

  it('carries the two ceilings separately', () => {
    const config = buildMarineUpstreamConfig(
      configFrom({
        MARINE_STALE_MAX_SECONDS: '9000',
        MARINE_VALID_AT_MAX_AGE_SECONDS: '500',
      }),
    );

    expect(config.ceilings).toEqual({ staleMaxSeconds: 9000, validAtMaxAgeSeconds: 500 });
  });

  it('keeps the request deadline and the warmup deadline apart', () => {
    // Conflating background work with a user request in one budget was SPEC v1's error (§6.4);
    // this is the one place where both numbers are read, so it is the place to pin them.
    const config = buildMarineUpstreamConfig(configFrom({}));
    expect(config.requestDeadlineMs).toBe(6_000);
    expect(config.warmupDeadlineMs).toBe(120_000);
    expect(config.warmupDeadlineMs).toBeGreaterThan(config.requestDeadlineMs);
  });

  it('requires BOTH switches for warming', () => {
    expect(buildMarineUpstreamConfig(configFrom({ MARINE_ENABLED: 'true' })).warmupEnabled).toBe(
      true,
    );
    expect(
      buildMarineUpstreamConfig(
        configFrom({ MARINE_ENABLED: 'true', MARINE_WARMUP_ENABLED: 'false' }),
      ).warmupEnabled,
    ).toBe(false);
    // The feature switch alone is enough to stop the tour.
    expect(buildMarineUpstreamConfig(configFrom({})).warmupEnabled).toBe(false);
  });
});

describe('MARINE_PROVIDER_BUDGETS', () => {
  it('is expressed in the unit the PROVIDER counts, with real headroom (SPEC-ADDENDUM §2.7)', () => {
    // ECMWF bills nothing and publishes no request quota, so this budget is us braking ourselves.
    // The steady state is structural: whole global fields, 5 requests per step, 41 steps, 4
    // cycles a day — and it does NOT grow with the number of reference points.
    const ECMWF_REQUESTS_PER_STEP = 5;
    const ECMWF_STEPS_PER_CYCLE = 41;
    const ECMWF_CYCLES_PER_DAY = 4;
    const ECMWF_STEADY_STATE_PER_DAY =
      ECMWF_REQUESTS_PER_STEP * ECMWF_STEPS_PER_CYCLE * ECMWF_CYCLES_PER_DAY;

    const ecmwf = MARINE_PROVIDER_BUDGETS[MARINE_PROVIDER.ecmwf];
    // Above the steady state with room for a re-ingest, a redeploy and a retried cycle…
    expect(ecmwf.perDay).toBeGreaterThan(ECMWF_STEADY_STATE_PER_DAY * 2);
    // …but not so far above that a runaway loop could hammer a free anonymous provider all day.
    expect(ecmwf.perDay).toBeLessThan(ECMWF_STEADY_STATE_PER_DAY * 5);
    // The hour cap is the real brake, so it has to be the one that BITES: reaching the day cap
    // must take several hours of continuous failure, not one. (`perHour < perDay` alone is
    // satisfied by 1 999/h, which is reachable inside an hour and would prove nothing.)
    expect(ecmwf.perDay / ecmwf.perHour).toBeGreaterThanOrEqual(4);
    // One cycle's worth of work must fit inside the hour cap, or a normal ingest would trip its
    // own guard — a budget that blocks the steady state is a broken budget, not a strict one.
    expect(ecmwf.perHour).toBeGreaterThan(ECMWF_REQUESTS_PER_STEP * ECMWF_STEPS_PER_CYCLE);

    // CMEMS: one call is one point and one variable, so weight 1 and the numbers are call counts.
    // Steady state is 77 per refresh × 24 ≈ 1 848/day.
    const cmems = MARINE_PROVIDER_BUDGETS[MARINE_PROVIDER.cmems];
    expect(cmems.perDay).toBeGreaterThan(1_848 * 5);
  });

  it('keeps the three windows internally consistent', () => {
    for (const limits of Object.values(MARINE_PROVIDER_BUDGETS)) {
      expect(limits.perMinute).toBeLessThanOrEqual(limits.perHour);
      expect(limits.perHour).toBeLessThanOrEqual(limits.perDay);
    }
  });
});
