/**
 * The two independent ceilings a cached value has to clear (SPEC-ADDENDUM §6.1 / A5-a).
 *
 * SPEC v1 said "stale data beats an error" and set no upper bound at all, so a value whose model
 * horizon had long expired could sit there looking current indefinitely. Two ceilings, because
 * they catch two different failures and NEITHER implies the other:
 *
 * - **Cache age** answers *"how long have we been unable to refresh?"*
 * - **`validAt` age** answers *"which moment is this number about?"*
 *
 * A value fetched ten minutes ago (perfectly fresh cache) can belong to a model step eight hours
 * old — the provider kept answering, it just kept answering with the same stale run. Only the
 * second ceiling sees that, and it is the one the external review was actually aiming at.
 */
export interface StalenessCeilings {
  /** `MARINE_STALE_MAX_SECONDS` — default 21 600 (6 h). */
  staleMaxSeconds: number;
  /** `MARINE_VALID_AT_MAX_AGE_SECONDS` — default 10 800 (3 h). */
  validAtMaxAgeSeconds: number;
}

export interface StalenessInput {
  /** When the value was written to cache. */
  storedAtMs: number;
  /** The model time the value belongs to; `null` when the payload carries none. */
  validAtMs: number | null;
  /** The freshness horizon (NOT the eviction horizon — see `UpstreamCacheStore`). */
  ttlSeconds: number;
  nowMs: number;
  ceilings: StalenessCeilings;
}

export type StalenessVerdict =
  | {
      readonly usable: true;
      readonly freshness: 'fresh' | 'stale';
      readonly ageSeconds: number;
      /** When the value stopped being fresh; `null` while still fresh. */
      readonly staleSinceMs: number | null;
    }
  | {
      readonly usable: false;
      readonly ageSeconds: number;
      readonly reason: 'cache_age_ceiling' | 'valid_at_ceiling';
    };

/**
 * Decide whether a cached value may still be published, and how it must be labelled.
 *
 * Pure arithmetic on purpose: this is the rule that decides what a visitor is told about a
 * number's trustworthiness, so it has to be assertable without a cache, a clock or a provider.
 *
 * A value with `validAtMs === null` skips only the SECOND ceiling — it is not exempt from the
 * first. Nothing in the system may be published as current without an age bound.
 */
export function evaluateStaleness(input: StalenessInput): StalenessVerdict {
  const ageSeconds = Math.max(0, (input.nowMs - input.storedAtMs) / 1000);

  if (ageSeconds > input.ceilings.staleMaxSeconds) {
    return { usable: false, ageSeconds, reason: 'cache_age_ceiling' };
  }

  if (input.validAtMs !== null) {
    const validAtAgeSeconds = (input.nowMs - input.validAtMs) / 1000;
    if (validAtAgeSeconds > input.ceilings.validAtMaxAgeSeconds) {
      return { usable: false, ageSeconds, reason: 'valid_at_ceiling' };
    }
  }

  const fresh = ageSeconds <= input.ttlSeconds;
  return {
    usable: true,
    freshness: fresh ? 'fresh' : 'stale',
    ageSeconds,
    staleSinceMs: fresh ? null : input.storedAtMs + input.ttlSeconds * 1000,
  };
}
