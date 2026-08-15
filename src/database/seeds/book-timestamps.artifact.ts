import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * The committed question-index artefact and the seven refusals that stand between it and the
 * database (SPEC §7.1, §7.2, PR B2).
 *
 * ## The artefact is COPIED, never transcribed — and that is the whole design
 * `Owner's Inbox/kitap-video-cozumler/timestamps.json` is copied into this repo **byte for byte**
 * and read from disk at runtime. Nobody retypes 180 numbers into a `.ts` file, so the failure class
 * playbook §8 was written for cannot occur here: a dropped space is visible in review, a timestamp
 * shifted by three seconds is not. There is no transcription step, so there is nothing to verify a
 * transcription against — which is why this leg has no fifth `seed-transcription` lane (Atlas
 * ruling, B2 plan §4).
 *
 * ## What the SHA-256 pin below does, and what it deliberately does NOT do
 * {@link EXPECTED_ARTIFACT_SHA256} is compared against the file this module actually reads, and a
 * mismatch refuses the whole run. **It catches exactly one thing:** somebody editing the committed
 * copy by hand — "fixing" a mark in the repo instead of re-measuring it — which is a real
 * correction path (SPEC §17 R2 offers it explicitly) and would otherwise be silent.
 *
 * **It does NOT close R10 and must not be read as closing it.** The two copies that can diverge are
 * the Inbox source and this repo copy, and this check cannot see the Inbox source at all: that file
 * lives outside this repository, so no runtime check and no CI job here can reach it. Divergence
 * between them is still mitigated only by SPEC §7.1's stated mechanism — the hash written in
 * `data/books/README.md` and a reviewer comparing it by hand. A guard that looks like it closes a
 * risk it cannot close is worse than no guard, so the boundary is stated here rather than implied.
 *
 * When the timestamps are legitimately re-measured, the artefact AND this constant move together in
 * one PR. Forgetting the constant fails loudly and names both values; that is the intended cost.
 */

/** Where the committed artefact lives, relative to the repo root (the `data/era5-land` pattern). */
export const BOOK_TIMESTAMPS_ARTIFACT_FILENAME = 'ayt-cografya-brans-denemeleri.timestamps.json';

/** Absolute path of the committed artefact, resolved from the process working directory. */
export function bookTimestampsArtifactPath(): string {
  return join(process.cwd(), 'data', 'books', BOOK_TIMESTAMPS_ARTIFACT_FILENAME);
}

/**
 * SHA-256 of the committed artefact, measured on 2026-08-15 against the Inbox source with
 * `sha256sum` on both sides plus a byte `cmp`. See the class note for its exact scope.
 */
export const EXPECTED_ARTIFACT_SHA256 =
  'be6f529401e616225d41345ce858eeb7d0eb93b6434c28c1eb94b46a5d499a55';

/**
 * Every refusal on this path throws THIS type, and every message names the artefact path.
 *
 * Playbook §8 refusal 3: an unreadable or unparseable source is answered with a message naming the
 * file, never a bare `node:fs` stack trace — the operator has to know WHICH file to look at.
 */
export class BookTimestampsArtifactError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'BookTimestampsArtifactError';
  }
}

/** The 11-character YouTube video id alphabet (`CHK_book_videos_youtube_video_id` in SQL). */
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * One measured mark, exactly as the artefact carries it.
 *
 * `tag` is validated and then DISCARDED — see {@link normalizeArtifact} for why it is the
 * load-bearing half of this schema even though nothing stores it.
 */
const markSchema = z.strictObject({
  tag: z.string(),
  startingSecond: z.number().int().min(0),
});

/**
 * One video's record.
 *
 * `title` is DECLARED and never read. Declaring it is deliberate: `z.strictObject` refuses unknown
 * keys, so an artefact whose shape changes (a renamed field, an added one) fails loudly instead of
 * being silently stripped. Not READING it is equally deliberate and is SPEC §5.2 — a stored title
 * would be API Data on a permanent row, dragging a 30-day retention obligation onto a table
 * designed to be free of one, and `hl` can return it machine-translated, which `SEO-POLICY.md`
 * §B14 bars from publication. {@link normalizeArtifact} is where it is dropped, so "the loader does
 * not read it" is a structural property rather than a promise in a comment.
 */
const recordSchema = z.strictObject({
  videoId: z.string().regex(YOUTUBE_VIDEO_ID_PATTERN),
  deneme: z.number().int().min(1).max(999),
  title: z.string(),
  timestamps: z.array(markSchema).min(1),
});

/**
 * Refusal 1, first half: an EMPTY artefact fails rather than reporting "0 checked".
 *
 * Playbook §8's first shared refusal, in its seed-loader form: a gate whose expected set is empty
 * reports a green it did not earn. The second half — a non-empty mark total — is asserted in
 * {@link assertArtifactIsSeedable}, because zod can bound each array but not their product.
 */
const artifactSchema = z.array(recordSchema).min(1);

/** One question's jump target, keyed by its position in the deneme. */
export interface BookQuestionSeed {
  /** 1-based, gapless within its video — DERIVED from array position, corroborated by `tag`. */
  readonly questionNo: number;
  /** Whole seconds from the start of the video. */
  readonly startSecond: number;
}

/** One deneme's video and its question index. */
export interface BookVideoSeed {
  /** The deneme's number IN THE BOOK — never the playlist position (→ DEC 2026-08-12p md.5). */
  readonly denemeNo: number;
  readonly youtubeVideoId: string;
  readonly questions: readonly BookQuestionSeed[];
}

/** What a validated artefact reduces to: exactly the values the three tables store. */
export interface BookTimestampsArtifact {
  readonly videos: readonly BookVideoSeed[];
  /** Mark total across every video — carried so the CLI can print a count it actually computed. */
  readonly questionCount: number;
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

/**
 * The four cross-row refusals zod cannot express, each of which is a real silent defect.
 *
 * A zod schema sees one value at a time. Uniqueness, ordering and the tag/index agreement are all
 * claims about a row's RELATIONSHIP to its neighbours, so they run here — before anything is
 * written, and over the whole set, so a violation refuses the artefact WHOLE (SPEC §7.2: one
 * violation and nothing is written).
 *
 * ## Why the `tag` check is the fidelity rule of this line, not a formality
 * The artefact carries no question number. `questionNo` is DERIVED from array position, which by
 * construction is gapless and ascending from 1 — so refusal 4 could never fail on its own and
 * would be a gate that cannot go red. What makes the derivation meaningful is that each record
 * carries an INDEPENDENT witness of the same fact: the human-readable `Soru {n}` tag measured
 * alongside the second. If a mark were dropped, duplicated or reordered, position and tag stop
 * agreeing. That is playbook §5's fidelity requirement in its form for this line — a per-row value
 * derived from an external source, cross-checked against something that was not derived the same
 * way — and it is the reason "plausible but wrong" cannot pass here.
 */
function assertArtifactIsSeedable(records: readonly z.infer<typeof recordSchema>[]): void {
  const problems: string[] = [];
  const seenVideoIds = new Map<string, number>();
  const seenDenemeler = new Map<number, string>();
  let markTotal = 0;

  for (const record of records) {
    // Refusal 2: a repeated id would mean two denemeler publishing one video's seconds, and
    // `UQ_book_videos_youtube_video_id` would reject the second row mid-transaction anyway —
    // failing here names both denemeler instead of surfacing a constraint violation.
    const previousDeneme = seenVideoIds.get(record.videoId);
    if (previousDeneme !== undefined) {
      problems.push(
        `videoId ${record.videoId} appears on deneme ${String(previousDeneme)} and deneme ` +
          `${String(record.deneme)} — one video belongs to exactly one deneme.`,
      );
    } else {
      seenVideoIds.set(record.videoId, record.deneme);
    }

    // Refusal 3: seeding one deneme twice is two blocks on the page, and only one can be right.
    const previousVideoId = seenDenemeler.get(record.deneme);
    if (previousVideoId !== undefined) {
      problems.push(
        `deneme ${String(record.deneme)} appears twice — first with videoId ${previousVideoId}, ` +
          `then with ${record.videoId}.`,
      );
    } else {
      seenDenemeler.set(record.deneme, record.videoId);
    }

    let previousSecond: number | null = null;
    record.timestamps.forEach((mark, index) => {
      const questionNo = index + 1;
      markTotal += 1;

      // Refusal 6: the tag is the witness described in this function's note. A tag that stops
      // agreeing with its position means the marks moved under us, and the reader would then be
      // sent to the wrong question — the one defect a reader sees instantly (SPEC §17 R2).
      const expectedTag = `Soru ${String(questionNo)}`;
      if (mark.tag !== expectedTag) {
        problems.push(
          `deneme ${String(record.deneme)}, position ${String(questionNo)}: tag is ` +
            `${JSON.stringify(mark.tag)} but the position says ${JSON.stringify(expectedTag)}. ` +
            `The mark order and the measured labels disagree — do not seed either reading.`,
        );
      }

      // Refusal 5: strictly ascending within a video. `book_video_questions` cannot express this
      // (a CHECK sees one row), so SPEC §5.3 puts it on the write path — here — and on the read
      // path as an e2e invariant (§13 item 3, B3).
      if (previousSecond !== null && mark.startingSecond <= previousSecond) {
        problems.push(
          `deneme ${String(record.deneme)}, question ${String(questionNo)}: startingSecond ` +
            `${String(mark.startingSecond)} does not come after ${String(previousSecond)}.`,
        );
      }
      previousSecond = mark.startingSecond;
    });
  }

  // Refusal 1, second half: a set of records that somehow carries no marks at all must fail rather
  // than let the CLI print a count of zero and exit 0.
  if (markTotal === 0) {
    problems.push('the artefact carries no marks at all — nothing to seed, and that is a failure.');
  }

  if (problems.length > 0) {
    throw new BookTimestampsArtifactError(
      `the question-index artefact is not seedable:\n${problems.join('\n')}`,
    );
  }
}

/**
 * Reduces a validated artefact to exactly what the three tables store.
 *
 * This is where `title` is dropped (SPEC §5.2) and where `questionNo` comes into existence, derived
 * from array position after {@link assertArtifactIsSeedable} has proven position and tag agree.
 */
function normalizeArtifact(
  records: readonly z.infer<typeof recordSchema>[],
): BookTimestampsArtifact {
  const videos = records.map((record) => ({
    denemeNo: record.deneme,
    youtubeVideoId: record.videoId,
    questions: record.timestamps.map((mark, index) => ({
      questionNo: index + 1,
      startSecond: mark.startingSecond,
    })),
  }));

  return {
    videos,
    questionCount: videos.reduce((total, video) => total + video.questions.length, 0),
  };
}

/**
 * Validates already-parsed JSON and returns the seedable shape. Pure — no filesystem, no database,
 * no clock — which is what lets the unit lane drive all seven refusals without Postgres.
 */
export function parseBookTimestampsArtifact(
  data: unknown,
  sourceLabel: string,
): BookTimestampsArtifact {
  const parsed = artifactSchema.safeParse(data);
  if (!parsed.success) {
    throw new BookTimestampsArtifactError(
      `${sourceLabel} does not match the question-index artefact schema:\n` +
        formatIssues(parsed.error),
    );
  }

  assertArtifactIsSeedable(parsed.data);
  return normalizeArtifact(parsed.data);
}

/**
 * Reads, hash-checks and validates the committed artefact.
 *
 * Refusal 7 in three places: an unreadable path, an unparseable body and a schema failure are each
 * answered with a message naming the file. The hash check runs BEFORE parsing, so "this file is not
 * the file that was reviewed" is reported as itself rather than as whatever downstream symptom it
 * happens to cause.
 */
export async function readBookTimestampsArtifact(
  path: string = bookTimestampsArtifactPath(),
  expectedSha256: string = EXPECTED_ARTIFACT_SHA256,
): Promise<BookTimestampsArtifact> {
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch (cause: unknown) {
    throw new BookTimestampsArtifactError(
      `cannot read the question-index artefact at ${path}. It is a COMMITTED file — run from the ` +
        `repo root, and never regenerate it by hand.`,
      { cause },
    );
  }

  const actualSha256 = createHash('sha256').update(contents, 'utf8').digest('hex');
  if (actualSha256 !== expectedSha256) {
    throw new BookTimestampsArtifactError(
      `${path} does not match its pinned SHA-256.\n` +
        `  expected ${expectedSha256}\n  actual   ${actualSha256}\n` +
        `The committed artefact is a byte copy of the measured source and is never hand-edited. ` +
        `If the marks were genuinely re-measured, the artefact and EXPECTED_ARTIFACT_SHA256 move ` +
        `together in one PR. This check cannot see the Inbox source, so it does not tell you the ` +
        `two copies agree — only that this one is unchanged since review.`,
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(contents);
  } catch (cause: unknown) {
    throw new BookTimestampsArtifactError(`${path} is not valid JSON`, { cause });
  }

  return parseBookTimestampsArtifact(data, path);
}
