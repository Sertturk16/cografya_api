/**
 * The single ceiling both the DTO-level validation (`UpsertVideoProgressRequestDto.lastPositionSeconds`'s
 * `@Max()`) and the service's unknown-duration fallback (`resolveMaxAllowedPosition` below) read
 * (`UYELIK-05-plan.md` §5.4) — one magic number, never the two-copies-nobody-cross-checks class
 * `book-list-query.dto.ts`'s own docblock names as this repo's drift hazard.
 *
 * 6 hours (21 600 s), generous against every real video in this catalogue — the exam-solution
 * videos are minutes long; the longest measured `durationIso` example in this codebase is
 * `PT6M8S` — while still rejecting obviously-garbage client input.
 */
export const VIDEO_PROGRESS_MAX_POSITION_SECONDS = 21_600;

/**
 * Resolves the ceiling a reported `lastPositionSeconds` is checked against — pure, and unit-tested
 * in isolation (`ENGINEERING.md` §8: "a module that needs no database belongs there").
 *
 * `snapshotDurationSeconds` is the video's real duration, read from a `YoutubeVideoSnapshot` row
 * that still physically exists — never gated by the serving soft-threshold `isSnapshotServable`
 * uses, since a video's real duration does not change over its lifetime (plan §5.4 step 2).
 * `null` means the snapshot has never synced, or has aged past the 30-calendar-day retention
 * ceiling and been purged: the real duration is genuinely unknown, and
 * {@link VIDEO_PROGRESS_MAX_POSITION_SECONDS} stands in for it (plan §5.4 step 4).
 *
 * `??`, not `||`: a real `durationSeconds` of `0` must resolve to `0`, not fall through to the
 * fallback ceiling — `0` is a valid (if degenerate) duration, never a missing one.
 */
export function resolveMaxAllowedPosition(snapshotDurationSeconds: number | null): number {
  return snapshotDurationSeconds ?? VIDEO_PROGRESS_MAX_POSITION_SECONDS;
}
