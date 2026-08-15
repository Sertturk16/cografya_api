import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import type { ProviderBudgetLimits } from '../../upstream/provider-budget';

/**
 * Provider id — OUR label, not a hostname. It keys the budget, the breaker and every metric, so a
 * provider DNS change must never rename them (the `cams-ads` precedent).
 */
export const YOUTUBE_DATA_PROVIDER = 'youtube-data';

/**
 * The YouTube Data API budget, in the unit the provider counts: quota units.
 *
 * `videos.list` costs **1 unit** per call regardless of how many ids it carries, and the default
 * daily allocation is 10 000 units (`provenance/integrations.md`, "YouTube Data API v3 — book video
 * snapshots"). Our steady state is one call a day, because the whole catalogue fits in a single
 * 50-id request:
 *
 * | quantity | value |
 * |---|---|
 * | per tour | 1 call for 30 ids — `ceil(ids / 50)` in general |
 * | per day | 1 tour ⇒ **1 unit** |
 * | budget below | 5/min · 20/h · **60/day** |
 *
 * 60/day is 0.6 % of the allocation and ~60× the steady state, which is room for a crash-loop of
 * boot tours and a few hand-triggered runs without ever approaching the provider's ceiling. The
 * per-minute figure is the brake that actually bites: a tour makes one call per 50 ids, so it
 * cannot spend a minute's budget even if every tour failed and retried.
 *
 * Shared across instances only when Redis is present — which production requires while the sync is
 * on (the E1 cross-check in `env.schema.ts`).
 */
export const YOUTUBE_DATA_BUDGET: ProviderBudgetLimits = { perMinute: 5, perHour: 20, perDay: 60 };

/**
 * What the READ path is allowed to know about this leg.
 *
 * One field, and the omissions are the design: the public detail path has no business holding the
 * API key, the base URL or the refresh cadence, and a config object carrying them would hand every
 * future edit of `BookService` a reference to the secret. Same reasoning as the air-quality read
 * store's separate port (A2b decision D-A2b-1) — a surface's authority is what it can reach.
 */
export interface BookYoutubeServeConfig {
  /**
   * `YOUTUBE_API_DATA_SOFT_MAX_AGE_HOURS` — past this age a snapshot stops being served and the
   * contract says so by publishing `youtube: null` (SPEC §8.3). It is NOT the deletion threshold;
   * that one belongs to the purge, and the two are deliberately different numbers.
   */
  readonly softMaxAgeHours: number;
}

/** Everything the SYNC half needs, resolved from env once (the `MarineUpstreamConfig` precedent). */
export interface BookYoutubeSyncConfig {
  /**
   * `BOOKS_ENABLED && BOOKS_YOUTUBE_SYNC_ENABLED` — both, and the reading is `DEC 2026-08-15h`
   * item 1: `BOOKS_ENABLED` closes the INGEST half of this leg (never the public endpoints), so a
   * deployment with the book feature off must not be reaching a provider because a second flag was
   * left on. The marine (`MARINE_ENABLED` + `MARINE_WARMUP_ENABLED`) and air-quality
   * (`AIR_QUALITY_ENABLED` + `AIR_QUALITY_INGEST_ENABLED`) legs are both wired this way.
   */
  readonly refreshEnabled: boolean;
  /**
   * **Always `true` — the purge is gated on NOTHING**, and the asymmetry with
   * {@link refreshEnabled} is the most important decision in this leg (SPEC §8.1).
   *
   * Deleting expired API Data is an OBLIGATION, not a feature, so it may not hang off the feature's
   * switch: were the purge a step of the refresh tour, it would stop silently in the two states
   * where it matters most — a provider outage (the tour fails before reaching it) and the kill
   * switch being thrown (the tour never runs). Both would let data pass 30 calendar days.
   *
   * This field read `BOOKS_ENABLED` until the #111 review, and that was the same mistake one level
   * up: an operator retiring the feature through the documented switch would have stopped the
   * compliance delete while the rows stayed in Postgres, with no log, counter or symptom to say so.
   * The SPEC said `BOOKS_ENABLED` in §8.1's table and "koşulsuz" in §4.1 and §9.1 — it contradicted
   * itself, and the Atlas ruling of 2026-08-15 resolved it towards the unconditional reading and
   * corrected the table.
   *
   * It stays a FIELD rather than becoming a literal at the construction site because it is the one
   * place this decision is written as code: a future ruling that re-gates the purge changes this
   * line, and every reader of the leg passes through here.
   */
  readonly purgeEnabled: true;
  /** API root; `/videos` is appended by the URL builder. */
  readonly baseUrl: string;
  /**
   * The credential, or `null` while the sync is off. The env schema makes the enabled-and-keyless
   * combination unbootable (§14 cross-check 1), so `null` here can only mean "this leg is not
   * running".
   */
  readonly apiKey: string | null;
  readonly intervalSeconds: number;
  readonly deadlineMs: number;
  readonly tourBudgetMs: number;
  readonly singleCallTimeoutMs: number;
  /** Per-response byte ceiling — the numeric form of "no unbounded external call" (playbook §3.5). */
  readonly responseMaxBytes: number;
  /** How often the purge tour runs; independent of {@link intervalSeconds} by design. */
  readonly purgeIntervalSeconds: number;
  /**
   * `YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS` — the age past which a row is DELETED. The env schema
   * refuses a value above 720 h at boot, so the policy ceiling (Developer Policies III.E.4.d) is a
   * boot check rather than a comment.
   */
  readonly hardMaxAgeHours: number;
  /**
   * The provider budget, as ONE value rather than a provider-keyed record.
   *
   * The marine and air-quality configs carry a `Record<string, ProviderBudgetLimits>` because
   * marine genuinely talks to two providers. This leg talks to one, and a record would force a
   * lookup that can return `undefined` — a branch whose only honest handlings are a throw or a
   * fabricated fallback that would silently strangle the tour. One field removes the question.
   */
  readonly budget: ProviderBudgetLimits;
}

/** Injection token for {@link BookYoutubeServeConfig}. */
export const BOOK_YOUTUBE_SERVE_CONFIG = Symbol('BOOK_YOUTUBE_SERVE_CONFIG');

/** Injection token for {@link BookYoutubeSyncConfig}. */
export const BOOK_YOUTUBE_SYNC_CONFIG = Symbol('BOOK_YOUTUBE_SYNC_CONFIG');

export function buildBookYoutubeServeConfig(
  config: ConfigService<Env, true>,
): BookYoutubeServeConfig {
  return {
    softMaxAgeHours: config.getOrThrow('YOUTUBE_API_DATA_SOFT_MAX_AGE_HOURS', { infer: true }),
  };
}

export function buildBookYoutubeSyncConfig(
  config: ConfigService<Env, true>,
): BookYoutubeSyncConfig {
  const booksEnabled = config.getOrThrow('BOOKS_ENABLED', { infer: true });

  return {
    refreshEnabled:
      booksEnabled && config.getOrThrow('BOOKS_YOUTUBE_SYNC_ENABLED', { infer: true }),
    // Deliberately NOT `booksEnabled`, and deliberately not any other env value — see the field.
    purgeEnabled: true,
    baseUrl: config.getOrThrow('YOUTUBE_DATA_API_BASE_URL', { infer: true }),
    apiKey: config.get('YOUTUBE_API_KEY', { infer: true }) ?? null,
    intervalSeconds: config.getOrThrow('YOUTUBE_SYNC_INTERVAL_SECONDS', { infer: true }),
    deadlineMs: config.getOrThrow('YOUTUBE_SYNC_DEADLINE_MS', { infer: true }),
    tourBudgetMs: config.getOrThrow('YOUTUBE_SYNC_TOUR_BUDGET_MS', { infer: true }),
    singleCallTimeoutMs: config.getOrThrow('YOUTUBE_SINGLE_CALL_TIMEOUT_MS', { infer: true }),
    responseMaxBytes: config.getOrThrow('YOUTUBE_RESPONSE_MAX_BYTES', { infer: true }),
    purgeIntervalSeconds: config.getOrThrow('BOOKS_PURGE_INTERVAL_SECONDS', { infer: true }),
    hardMaxAgeHours: config.getOrThrow('YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS', { infer: true }),
    budget: YOUTUBE_DATA_BUDGET,
  };
}
