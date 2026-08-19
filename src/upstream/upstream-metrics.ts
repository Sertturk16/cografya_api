import { Injectable, Logger } from '@nestjs/common';

/**
 * Every countable thing the upstream layer does.
 *
 * A closed union rather than free-form strings: a typo in a metric name produces a counter
 * nobody reads, which is the monitoring equivalent of a swallowed error.
 */
export type UpstreamMetricName =
  /** Served from cache, still inside its freshness TTL. */
  | 'cache.hit'
  /** Served from cache past its TTL but inside the staleness ceiling (SPEC-ADDENDUM §6.1). */
  | 'cache.stale'
  /** Nothing usable cached — an upstream refresh was attempted. */
  | 'cache.miss'
  /** A cached NEGATIVE outcome answered the read without touching the provider (§6.3). */
  | 'cache.negative_hit'
  /** A cached entry was discarded for breaching a staleness ceiling. */
  | 'cache.ceiling_dropped'
  /** This caller joined an in-flight refresh instead of starting a second one (LRU mode). */
  | 'singleflight.joined'
  /** Another instance holds the refresh lock; this caller did not wait (Redis mode). */
  | 'singleflight.lost'
  /** One real HTTP request left the process. */
  | 'upstream.request'
  /** One retry of a transient failure. */
  | 'upstream.retry'
  /**
   * The operation's budget was already spent when this call was reached — no request was made.
   *
   * Its own counter because it is a refusal WE generated: it must be separable from the provider
   * failures it would otherwise be buried among, and it is deliberately never told to the breaker.
   */
  | 'upstream.deadline_exceeded'
  | 'upstream.outcome.ok'
  | 'upstream.outcome.no_data'
  | 'upstream.outcome.transient'
  | 'upstream.outcome.rate_limited'
  | 'upstream.outcome.client_error'
  | 'upstream.outcome.schema_error'
  | 'upstream.outcome.budget_exhausted'
  /** The provider budget refused the call before it was made (§2.7). */
  | 'budget.rejected'
  /** The circuit breaker refused the call before it was made. */
  | 'breaker.rejected'
  | 'breaker.opened'
  | 'breaker.closed'
  /** A half-open trial was released without an outcome — an exception crossed a boundary. */
  | 'breaker.trial_abandoned'
  /**
   * A half-open trial was released because the call carried no evidence about the provider: OUR
   * operation budget ended it before its own per-call cap.
   *
   * Separate from `breaker.trial_abandoned` on purpose. That one means we have a bug above the
   * client and is alertable for exactly that reason; this one is a routine, expected condition on
   * a leg designed to spend its whole budget, and folding the two together would retire the bug
   * signal (review #124, SFH124R2-I2).
   */
  | 'breaker.trial_released'
  /** Redis was unreachable and the call degraded to the in-process path. */
  | 'redis.degraded'
  // ── Scheduled-ingest events (M3b). Provider-neutral names: the provider dimension is the
  // `providerId` argument, exactly like every counter above. ──
  /**
   * A decode child died without a reply for a cause the DECODER can have caused — the contained
   * panic class (exit 134/SIGABRT, fatal native signals, the hung-child timeout). This counter
   * is the DEC 2026-07-31d ecCodes-migration evidence stream; IPC failures and external
   * termination are counted separately below so they cannot contaminate it (review #76 SFH-5).
   */
  | 'ingest.decode_crash'
  /**
   * A decode child ended without the decoder plausibly being the cause: fork/IPC/send failures,
   * protocol exits 0/2/3, and the JS-level exit 1 (uncaught exception — e.g. the gribberish
   * import failing to load its native binary; round-2 R2-SFH-B).
   */
  | 'ingest.decode_ipc_failure'
  /** A decode child was killed from outside (SIGTERM/SIGINT/SIGHUP/external SIGKILL). */
  | 'ingest.decode_interrupted'
  /** A payload was refused by a fail-closed contract guard (packing, grid, attribution…). */
  | 'ingest.contract_refusal'
  /** The model-cycle age ceiling suppressed publication (the THIRD ceiling, SPEC §9.4). */
  | 'ingest.cycle_age_ceiling'
  /** The candidate-cycle walk found nothing to ingest from — no cycle answered (SFH-1). */
  | 'ingest.walk_exhausted'
  /**
   * Bytes downloaded by a step that recorded nothing (incremented BY the byte count). The cycle
   * ledger counts only ingested evidence, so without this a step failing every tour would spend
   * megabytes invisible to every ceiling (review #76 SFH-2).
   */
  | 'ingest.bytes_abandoned'
  // ── Air-quality (CAMS/ADS) ingest events (A2a). Same convention: the provider dimension is
  // the `providerId` argument, so these names stay leg-neutral in shape while naming the
  // failure classes this queue protocol actually has. ──
  /** An unexpected exception escaped the ingest slice — OUR bug, never a provider fault. */
  | 'airq.ingest_bug'
  /** WE refused a request shape because `costing` exceeded the account limit. */
  | 'airq.cost_refused'
  /** WE refused a download because the DECLARED size exceeded the byte ceiling. */
  | 'airq.size_refused'
  /** A pinned decode guard refused the provider's bytes — a provider-contract record. */
  | 'airq.contract_refusal'
  /**
   * The decode WRAPPER raised, i.e. `CamsContractError.unexpected` — our decoder is broken, not
   * the provider. Counted apart from `airq.contract_refusal` because flattening the two sends
   * the diagnosis to the wrong file (plan §10-D3).
   */
  | 'airq.decoder_bug'
  /** A job exhausted `AIR_QUALITY_MAX_ATTEMPTS_PER_JOB` and was given up on. */
  | 'airq.attempts_exhausted'
  /** A `submitting` job could not be reconciled unambiguously — a human must look. */
  | 'airq.reconcile_ambiguous'
  /** The provider ended a job in its terminal refusal vocabulary (`rejected`/`dismissed`). */
  | 'airq.provider_refusal'
  /** The provider ended a job as `failed` — terminal upstream; a fresh submit needs a human. */
  | 'airq.provider_failed'
  /** WE refused a result href whose host is not on the download allowlist (SSRF class). */
  | 'airq.download_host_refused'
  /** The decoded file carries a different step count than the request asked for. */
  | 'airq.step_count_mismatch'
  /**
   * A run rolled to `abandoned` — superseded unfinished, OR its forecast failed terminally.
   * Fired at the state transition by construction (review #80 C1), so no terminal path can
   * abandon a run silently.
   */
  | 'airq.run_abandoned'
  /** The analysis product failed terminally; the run publishes without its past half. */
  | 'airq.run_degraded'
  /** The analysis file resolved to different grid cells than the forecast — refused (R11). */
  | 'airq.analysis_grid_mismatch'
  /** An analysis decoded while the run had NO stored forecast rows — a sequencing bug of ours. */
  | 'airq.analysis_without_forecast'
  /** The province reference set was not the expected 81 fully-located rows. */
  | 'airq.province_set_invalid'
  /**
   * The model-RUN age ceiling suppressed publication (the THIRD ceiling, SPEC §9.4). Owned by the
   * REFRESH side of `AirQualitySeriesReader` alone: the exit-side check runs once per public
   * request, so it logs through a throttle and never touches this counter — the number stays "the
   * ceiling fired", not a traffic-proportional one (the marine R2-SFH-A convention).
   *
   * The exit half needs no counter of its OWN because this condition HAS an owner: an over-age run
   * is equally visible to the refresh half, which fires this counter within one TTL. Contrast
   * `airq.cached_run_unusable`, whose condition the refresh half can never see (review #84 round-2
   * ruling).
   */
  | 'airq.run_age_ceiling'
  /**
   * The read path could not read its own store — a Postgres blip, mapped to `transient` and healed
   * by the next refresh. Counted apart from the data-shape classes below (review #84 SFH-4): "the
   * database was unreachable" and "what the database holds is unreadable" need different humans.
   * Refresh-cadence, never per request: the closure runs behind single-flight and a negative TTL.
   */
  | 'airq.store_read_failed'
  /**
   * A stored run held no readable series row at all, so the read degraded to `schema_error`. The
   * per-row sibling is `ingest.corrupt_row_skipped`: one bad province is a skip, ALL of them is
   * this. Also refresh-cadence — its EXIT-side twin is `airq.cached_run_unusable`.
   */
  | 'airq.run_unreadable'
  /**
   * A CACHED payload did not hold the written shape, so the exit-side guard suppressed publication
   * (review #84 CR-6, counter added at round 2).
   *
   * ## Why this one is counted while the run-age ceiling's exit half is not
   * That condition has an OWNER: `airq.run_age_ceiling` fires on the refresh half, so an over-age
   * run is never counter-invisible for longer than one TTL. This condition has no owner anywhere —
   * it is detectable only on the exit side BY CONSTRUCTION, because the refresh half recompiles
   * with today's code and therefore emits a well-shaped payload, so `airq.run_unreadable` can never
   * fire for it. Left uncounted, a condition whose own log line says "a human has to look" produced
   * zero counter events, ever. And the blast radius is wider than a corrupt cache: the exit guard
   * also runs on the refresh RESULT, so a future bug in our own `compileRun` lands here too — both
   * public endpoints 100 % `unavailable` behind `no-store`, one ERROR line a minute, nothing on any
   * dashboard. That is fail-soft hiding a genuine fault.
   *
   * ## Cadence: once per THROTTLE WINDOW, never per request
   * Incremented only when `throttledEvent` actually emits, so it reports "the condition fired" and
   * stays free of the traffic-proportionality a naive per-request increment would carry.
   */
  | 'airq.cached_run_unusable'
  /**
   * R2 fired at COMPILE time: stored concentrations were present but negative/non-finite/
   * non-numeric, so they were null-classified before `subIndexBand` could throw. Refresh-cadence,
   * incremented BY the substitution count, so the number is a real magnitude of "how many stored
   * values are bad". Non-zero means the decoder's guarantee did not hold for some bytes we stored.
   *
   * The post-cache pass is counted SEPARATELY (`airq.cached_concentration_normalised`) and not
   * folded in here — review #84 NI-1: the two run at different cadences, and the only label that
   * told them apart lived on the throttled log line rather than on the counter, so the compile
   * signal drowned in the same series.
   */
  | 'airq.concentration_normalised'
  /**
   * R2 fired on a CACHED payload, i.e. after the cache and across a deploy boundary — the pass that
   * exists for an entry an earlier deployment wrote (review #84 I2 / NI-1).
   *
   * ## Cadence: once per THROTTLE WINDOW, never per request
   * Its sibling above is refresh-cadence, so incrementing BY the count is a magnitude there. Here
   * the same arithmetic would be traffic: the pass runs on every public request, and a single
   * corrupt cached payload adds ~81 × steps × pollutants per request. So this counter is
   * incremented by ONE, only when `throttledEvent` actually emits; the magnitude of that request's
   * substitutions rides the log line's `values` field, where it describes one sample honestly.
   */
  | 'airq.cached_concentration_normalised'
  /**
   * The politeness `DELETE /jobs/{id}` did not confirm. Never a correctness problem on its own
   * (the provider expires the job in ~2 days), but a daily rise here is a protocol drift saying
   * so early — which a warn line nobody counts cannot do (review #80 R2-M2).
   */
  | 'airq.cleanup_unconfirmed'
  /**
   * A province EXISTS in the table but carries no reference point, so its detail endpoint 404s
   * (Atlas ruling Q3, re-confirmed at DEC 2026-08-03a §2 / review #84 CR-5).
   *
   * ## Why the 404 needs a counter at all
   * Q3 refuses to publish fabricated coordinates, which is right — but the refusal is invisible:
   * a seed regression that nulls `latitude`/`longitude` turns `/hava/<il>` into a silent 404 that
   * looks exactly like a plate code nobody has. This is OUR data being wrong, not a caller being
   * wrong, so it is ERROR and it is counted.
   *
   * ## Cadence: once per THROTTLE WINDOW, on a public request path
   * The condition is a standing seed state, checked once per request on an unauthenticated route,
   * so the counter is incremented by ONE and only when `throttledEvent` actually emits — the
   * `airq.cached_run_unusable` pattern (count the condition, not the traffic). The UNKNOWN-plate
   * 404 beside it stays silent on purpose: 19 of the 100 well-formed two-digit codes (the
   * validator is `/^\d{2}$/`, so `00` counts) name no province, and counting those would report
   * caller behaviour, not a defect.
   */
  | 'airq.province_coordinates_missing'
  /**
   * A stored series row was refused by the read-path shape guard and SKIPPED — the remaining
   * readable cycles still serve the point, and the read degrades to `schema_error` only when no
   * readable row is left (review #76 round-3 R3-CR-1 + R3-SFH-7). jsonb is schemaless: this
   * fires only when a row does not hold the written shape.
   */
  | 'ingest.corrupt_row_skipped'
  /** An unexpected exception escaped the ingest's own handling — OUR bug, counted loudly. */
  | 'ingest.bug'
  // ── Book video-solution sync (B4). Same convention as the two legs above: the provider
  // dimension is the `providerId` argument, so these names stay leg-neutral in shape. ──
  /** Snapshots written or refreshed by a tour — incremented BY the row count. */
  | 'books.snapshot_written'
  /**
   * A returned item this leg refused to store: a duration that does not survive the seconds round
   * trip, a non-positive thumbnail dimension, a field past its column width. Counted rather than
   * thrown, because one odd video must not stop a tour refreshing twenty-nine others — and counted
   * at all, because refusing every row silently would look exactly like a healthy quiet tour.
   */
  | 'books.snapshot_refused'
  /** The database refused ONE row (an FK violation against a corrected `book_videos` id). */
  | 'books.row_write_failed'
  /**
   * Ids that stopped coming back from `videos.list` — the dead-video health check (risk R1),
   * incremented BY the count of rows newly stamped. Non-zero means a video was deleted or
   * re-uploaded, and the correction is an owner's job: the new id's start seconds must be measured
   * again before anything can be published for it.
   */
  | 'books.video_missing'
  /** Snapshots deleted for breaching the 30-day ceiling — incremented BY the row count. */
  | 'books.snapshot_purged'
  /**
   * The purge statement COMPLETED — once per tour, whatever it deleted.
   *
   * Its own counter because `books.snapshot_purged` cannot answer the question that matters here:
   * on a healthy leg it stays at zero forever, which reads identically to a purge that was never
   * scheduled at all. This one is the liveness half — a flat `books.purge_ran` is the signal that
   * the retention mechanism has stopped running, and it is the only positive compliance evidence
   * the leg produces (the healthy no-op logs at DEBUG, which is off in production).
   */
  | 'books.purge_ran'
  /**
   * The purge statement itself failed. Its own counter because this is the mechanism that keeps us
   * inside a POLICY ceiling: every other failure in this leg costs a thumbnail, this one costs
   * compliance if it persists.
   */
  | 'books.purge_failed'
  /** An unexpected exception escaped the sync tour's own handling — OUR bug. */
  | 'books.sync_bug'
  // ── Earthquake (AFAD TDVMS) ingest events (E2). Same convention: the provider dimension is the
  // `providerId` argument. The two cadences are NOT separate counter names — they are two
  // instances of one target and the `recent`/`reconcile` split is a log-context concern; giving
  // each its own name would double every counter below to answer a question nobody asks. ──
  /** Rows inserted for the first time. */
  | 'eq.rows_inserted'
  /** Rows whose stored values actually changed. An unchanged row writes nothing and counts here
   * not at all — which is exactly what keeps `updated_at` usable as a modification date. */
  | 'eq.rows_updated'
  /** Rows stored with `in_scope = false`: kept for the archive, served on no endpoint. */
  | 'eq.rows_out_of_scope'
  /**
   * A row the PARSER refused — a malformed number, an impossible timestamp, a location that
   * cannot be split, a fidelity mismatch. Counted apart from `eq.row_write_failed` because this
   * one is the provider's payload disagreeing with the contract, not our database refusing.
   */
  | 'eq.row_rejected'
  /** A row the DATABASE refused (an FK violation, a constraint). That row's failure, not the tour's. */
  | 'eq.row_write_failed'
  /**
   * An event carried a province name that matched no row in `provinces`.
   *
   * Its own counter because the consequence is silent and partial: the event is still published,
   * it simply loses the cross-link to a province page, and nothing on the page looks broken.
   */
  | 'eq.plate_unresolved'
  /**
   * A stored event inside a reconcile window stopped being returned by the provider. Nothing is
   * ever deleted (SPEC §7.3); this counter is how the disappearance becomes visible at all.
   */
  | 'eq.rows_absent_upstream'
  /**
   * A store READ the tour could not proceed without failed — today, the province lookup.
   *
   * Its own counter rather than `eq.ingest_bug`, because it is the opposite diagnosis: OUR database
   * was unreachable, not our code wrong, and sending an operator to the code is a wasted hour.
   */
  | 'eq.store_read_failed'
  /**
   * The reconcile tour's disappearance check could not run. Diagnosis lost, tour intact — the whole
   * point of guarding it separately from the writes it follows.
   */
  | 'eq.absent_check_failed'
  /**
   * A tour ended before making its call because its slice was below the assumed cost of one call.
   *
   * Reachable today only by configuring `EARTHQUAKE_TOUR_BUDGET_MS` under that cost — which boots
   * cleanly and then makes the leg permanently dark, so it needs a count of its own.
   */
  | 'eq.slice_skipped'
  /** The run ledger could not be written — the tour worked, its freshness anchor did not. */
  | 'eq.run_record_failed'
  /** Retention pruning failed. Housekeeping; it never fails a tour. */
  | 'eq.prune_failed'
  /** An unexpected exception escaped the ingest tour's own handling — OUR bug. */
  | 'eq.ingest_bug'
  // ── Elevation profile: the terrain-tile leg (CBS-P2 E2). Same convention — the provider
  // dimension is the `providerId` argument, so the names stay leg-neutral in shape. ──
  /** A tile fetch joined one already in flight instead of opening a second socket for it. */
  | 'elevation.tile_joined'
  /**
   * A tile arrived with NO `x-amz-meta-x-imagery-sources` header.
   *
   * Accepted rather than refused (a metadata change is not a licence change), so this counter is
   * the only way the condition is visible at all after the first warning.
   */
  | 'elevation.imagery_sources_absent'
  /**
   * A tile was REFUSED because its imagery sources are not the ones our published attribution
   * credits — or because a sea-depth source reappeared at the sampling zoom.
   *
   * The licence tripwire firing. Never a routine condition: any non-zero value here means the
   * upstream source mix moved and the attribution surface has to be re-decided.
   */
  | 'elevation.imagery_sources_refused'
  /**
   * A profile request hit `ELEVATION_MAX_TILES_PER_REQUEST` and was refused before fetching.
   *
   * Structurally unreachable while the ceiling stays above the sample count, so a non-zero value
   * means the ceiling was configured below what one request legitimately needs.
   */
  | 'elevation.tile_ceiling_refused'
  /** A profile was answered with fewer resolved samples than it asked for (the warming path). */
  | 'elevation.profile_partial'
  /**
   * EVERY tile a request actually fetched came back `no_data` — the bucket-disappearance signal.
   *
   * `missingMeansNoData` treats a 404 as a legitimate coordinate at the edge of coverage: quiet
   * log, breaker SUCCESS, no negative entry. That is right for one tile and indistinguishable from
   * the provider's continuity risk (a prefix rename or a retired bucket — `provenance/
   * integrations.md`, risk R1) when it is EVERY tile, which is how a total provider loss could be
   * served as an empty profile indefinitely with nothing above debug level anywhere
   * (review #124, VAL124-M2).
   *
   * ## Cadence: once per THROTTLE WINDOW, never per request
   * The condition is a standing provider state observed once per request, so the counter is gated
   * on `throttledEvent`'s return value — it counts the condition, not the traffic
   * (the `airq.cached_run_unusable` convention above).
   */
  | 'elevation.tiles_all_no_data';

/**
 * Counters + structured logs for the upstream layer.
 *
 * ## Why counters at all, when there is no metrics backend yet
 * Hosting is undecided (`CONVENTIONS.md` §7), so there is nothing to scrape. But the failure
 * modes this layer exists to survive — a provider quietly rate-limiting us, a breaker stuck
 * open, a cache that never hits — are all INVISIBLE without a count. Keeping the counters in
 * process costs nothing, makes every one of those assertable in a test, and means wiring a real
 * exporter later is a read of `snapshot()` rather than a retrofit of instrumentation.
 *
 * ## What never goes in here
 * No client IP, no user agent, no request id, no personal data of any kind — the marine feature
 * processes none (SPEC-ADDENDUM §7.10) and this layer must not become the place where that
 * stops being true. Labels are the provider id and the operation label, both of which we choose
 * ourselves. URLs reaching a log line go through `redactUrl` first.
 */
@Injectable()
export class UpstreamMetrics {
  private readonly logger = new Logger('Upstream');
  private readonly counters = new Map<string, number>();
  /**
   * Throttle key → the instant its window ENDS (not the instant it last logged).
   *
   * Storing the expiry rather than the timestamp is what lets every key be judged by its OWN
   * window — see {@link pruneThrottleKeys}, which used to judge them all by the caller's.
   */
  private readonly throttleExpiresAtMs = new Map<string, number>();

  /**
   * Count one event.
   *
   * @param providerId our own provider label (`ecmwf`, `cmems`, `cams-ads`), never a hostname —
   *   hostnames change and a metric that changes name on a provider's DNS migration is worse
   *   than no metric.
   */
  increment(name: UpstreamMetricName, providerId: string, by = 1): void {
    const key = `${name}|${providerId}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + by);
  }

  /** Current value of one counter — the seam every test asserts through. */
  get(name: UpstreamMetricName, providerId: string): number {
    return this.counters.get(`${name}|${providerId}`) ?? 0;
  }

  /** All non-zero counters, `name|provider` → count. Sorted for a stable log/diff. */
  snapshot(): Record<string, number> {
    return Object.fromEntries([...this.counters.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }

  /**
   * A structured event line.
   *
   * `level` is part of the contract, not a stylistic choice (SPEC-ADDENDUM §6.3): our own bad
   * request (`client_error`) and a provider contract change (`schema_error`) are ERROR because
   * they need a human; a provider blip is WARN; routine cache work is DEBUG. A silent drop is
   * never an option — "loudly logged" is the written mitigation for every degraded path here.
   */
  event(
    level: 'debug' | 'log' | 'warn' | 'error',
    message: string,
    context: Readonly<Record<string, string | number | boolean | null>>,
  ): void {
    const rendered = `${message} ${JSON.stringify(context)}`;
    switch (level) {
      case 'debug':
        this.logger.debug(rendered);
        break;
      case 'log':
        this.logger.log(rendered);
        break;
      case 'warn':
        this.logger.warn(rendered);
        break;
      case 'error':
        this.logger.error(rendered);
        break;
    }
  }

  /**
   * A structured event that repeats at most once per `everyMs` for the same `throttleKey`.
   *
   * ## Why a throttle exists at all, when "loud" is the rule everywhere else
   * Two paths in this layer fire once per REQUEST while the thing they report is a single
   * standing condition: a Redis outage (a degrade line per cache read, and there are two reads
   * per call) and an exhausted daily budget (a line per attempt, for the rest of the window).
   * With the global limit at 120 req/min per client, that is an unbounded, fan-out-inflatable
   * ERROR stream layered on top of the outage itself — an availability problem caused by the
   * reporting of an availability problem.
   *
   * Loudness is preserved where it matters: the first occurrence is ALWAYS logged, so the
   * transition into the bad state is always visible. What is suppressed is only the repetition of
   * a message that says nothing new.
   *
   * ## The COUNTER is throttled only where the condition is request-cadence (corrected)
   * An earlier revision of this docblock stated as an absolute that *"the COUNTER is never
   * throttled"*, and the CADENCE SEAM below then introduced counters gated on exactly this
   * method — the docblock contradicted the file it documented (review #84 round 3, carried as a
   * rider). The real rule is one sentence: **a counter follows the cadence of the condition it
   * measures, not the cadence of the code that notices it.** Refresh-cadence conditions
   * (`airq.run_age_ceiling`, `airq.concentration_normalised`) are counted unthrottled, because
   * there the count IS the magnitude. Conditions detectable only once per REQUEST
   * (`airq.cached_run_unusable`, `airq.cached_concentration_normalised`,
   * `airq.province_coordinates_missing`) gate their increment on this method's return value, so
   * the series stays a count of the condition instead of a reading of the traffic.
   *
   * ## The return value is the CADENCE SEAM (review #84 round 2)
   * `true` exactly when this call emitted. A condition that is detectable only on the once-per-
   * request path still deserves a counter — but incrementing it per request turns "how often did
   * this fire?" into a traffic reading. Gating the increment on this boolean gives such a condition
   * a counter that ticks at most once per window, which is the file's real convention: count the
   * condition, not the traffic. Callers that only log are unaffected — ignoring the value is the
   * normal case.
   */
  throttledEvent(
    level: 'debug' | 'log' | 'warn' | 'error',
    throttleKey: string,
    everyMs: number,
    message: string,
    context: Readonly<Record<string, string | number | boolean | null>>,
  ): boolean {
    const now = Date.now();
    const expiresAt = this.throttleExpiresAtMs.get(throttleKey);
    if (expiresAt !== undefined && now < expiresAt) return false;

    this.throttleExpiresAtMs.set(throttleKey, now + everyMs);
    this.pruneThrottleKeys(now);
    this.event(level, message, context);
    return true;
  }

  /**
   * Drop throttle keys whose OWN window has already ended.
   *
   * ## Why each key carries its own expiry (review #85 I1)
   * This method used to compare every key against the CALLING site's `everyMs`, which is a
   * cross-domain bug the moment the map grows past the cleanup floor: a caller with a 60 s window
   * would evict a key whose real window is an hour, and that key's next event — already
   * throttled for a reason — would emit immediately. Measured shape of the failure: a seed
   * regression darkens dozens of provinces, `airq.province-coordinates-missing:<plate>` fills the
   * map, and every 60 s airq call then evicts `ecmwf.bytes-abandoned-systematic`, turning
   * marine's hourly ERROR into a per-minute one DURING an incident — precisely the
   * log-amplification `throttledEvent`'s own docblock exists to prevent.
   *
   * Storing the expiry removes the parameter that made that possible, so the bug is now
   * structurally impossible rather than merely unlikely. A key just set can never be evicted
   * here: its expiry is strictly in the future.
   *
   * ## The 64 is a cleanup FLOOR, not a cap
   * The old comment claimed the map is "small by construction". That premise died when a key
   * gained a per-province suffix, so state the real one: the key space is bounded by keys WE
   * choose — static operation names plus at most one per province (81) — and the map is allowed
   * to exceed 64 while those windows are genuinely open. Evicting an unexpired key to respect a
   * size limit would silently disable the throttle it belongs to, which is worse than holding a
   * few dozen numbers.
   */
  private pruneThrottleKeys(nowMs: number): void {
    if (this.throttleExpiresAtMs.size <= 64) return;
    for (const [key, expiresAt] of this.throttleExpiresAtMs) {
      if (nowMs >= expiresAt) this.throttleExpiresAtMs.delete(key);
    }
  }

  /** Test-only reset; production code never calls it. */
  resetForTest(): void {
    this.counters.clear();
    this.throttleExpiresAtMs.clear();
  }
}
