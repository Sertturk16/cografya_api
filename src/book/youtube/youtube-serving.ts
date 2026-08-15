/**
 * The three-step ageing rule, as one pure decision (SPEC §8.3).
 *
 * | age of `fetched_at_utc` | what happens |
 * |---|---|
 * | `< YOUTUBE_API_DATA_SOFT_MAX_AGE_HOURS` (600 h ≈ 25 days) | the snapshot is served |
 * | between soft and hard | **not served** — the contract says `youtube: null` |
 * | `> YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS` (720 h = 30 days) | the row is DELETED by the purge |
 * | `missing_since_utc` set | not served, whatever the age |
 *
 * Two thresholds because they answer two different obligations: the soft one discharges "show the
 * most current API Data" (a stale snapshot is treated as absent rather than shown), the hard one
 * discharges "delete or refresh within 30 calendar days". Soft being 25 rather than 30 is what stops
 * a few failed tours from putting us straight against the wall.
 *
 * ## Why this is a function and not two lines inside the mapper
 * It is the rule the whole leg exists to enforce, and it is invisible from the outside: a snapshot
 * that is served one hour too long looks exactly like one served correctly. Isolated, it is unit
 * tested with a fake clock in every state (SPEC §13 items 9 and 11) without a database.
 *
 * ## No flag gates this
 * Not `BOOKS_ENABLED`, not `BOOKS_YOUTUBE_SYNC_ENABLED`. A deployment that turned the sync off does
 * not thereby gain permission to keep serving month-old provider data — age is the only input, so
 * the guarantee holds in every configuration, including the one where nothing has run for a month.
 */
export interface AgeableSnapshot {
  readonly fetchedAtUtc: Date;
  readonly missingSinceUtc: Date | null;
}

const MS_PER_HOUR = 3_600_000;

export function isSnapshotServable(
  snapshot: AgeableSnapshot,
  nowMs: number,
  softMaxAgeHours: number,
): boolean {
  // An id the provider stopped returning is not served at ANY age — a dead video's cover and
  // `VideoObject` would point at something that no longer exists, while its deneme and questions
  // stay on the page untouched.
  if (snapshot.missingSinceUtc !== null) return false;

  const ageMs = nowMs - snapshot.fetchedAtUtc.getTime();
  // A negative age (a clock stepping backwards, a row written by a machine running ahead) is not
  // "extra fresh": it is unexplained, and the honest answer to unexplained provider data is to stop
  // serving it rather than to serve it for longer than the policy allows.
  if (ageMs < 0) return false;

  return ageMs < softMaxAgeHours * MS_PER_HOUR;
}
