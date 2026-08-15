import { describe, expect, it } from '@jest/globals';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertArtifactMeetsCoverageFloor,
  BookTimestampsArtifactError,
  parseBookTimestampsArtifact,
  readBookTimestampsArtifact,
  type BookTimestampsArtifact,
} from './book-timestamps.artifact';

/**
 * The seven refusals of SPEC §7.2, one test each (§13 invariant 1).
 *
 * ## Every fixture here is SYNTHETIC, and that is a rule rather than a preference
 * Not one real video id, deneme number or measured second appears below. Tests check STRUCTURE and
 * INVARIANTS; fact verification was the measurement round's job and closed with DEC 2026-08-12p. A
 * spec that hardcoded a real second would freeze a fact into a place nobody re-measures, and would
 * then go red for the right reason — a re-measurement — at the worst possible moment.
 *
 * ## Each refusal is paired with a POSITIVE CONTROL
 * Every case is the valid fixture with exactly one field changed, and the first test asserts the
 * unchanged fixture PASSES. Without that, a refusal test proves only "this throws", which a schema
 * broken in some unrelated way would also satisfy — the suite would stay green while checking
 * nothing.
 */

interface MarkFixture {
  tag: string;
  startingSecond: number;
}

interface RecordFixture {
  videoId: string;
  deneme: number;
  title: string;
  timestamps: MarkFixture[];
}

function marks(pairs: readonly (readonly [string, number])[]): MarkFixture[] {
  return pairs.map(([tag, startingSecond]) => ({ tag, startingSecond }));
}

/** The valid record every case below mutates by exactly one field. */
function record(overrides: Partial<RecordFixture> = {}): RecordFixture {
  return {
    videoId: 'aaaaaaaaaaa',
    deneme: 1,
    title: 'irrelevant — the loader never reads this',
    timestamps: marks([
      ['Soru 1', 0],
      ['Soru 2', 30],
      ['Soru 3', 61],
    ]),
    ...overrides,
  };
}

/**
 * Asserts the refusal's TYPE and that the message names the field the case is about.
 *
 * The type alone is not enough: `assertArtifactIsSeedable` aggregates every problem into one
 * message and every refusal on this path shares one error class, so `toThrow(TheClass)` passes
 * whenever the fixture is invalid for ANY reason — including a reason the case is not about. A
 * schema change that made the shared `record()` fixture invalid for something unrelated would keep
 * such a case green while the refusal it names went unexercised. The anchors below are zod PATHS,
 * which `formatIssues` emits into the message, rather than zod's wording, which is a dependency's
 * to change.
 */
function expectRefusedBy(data: unknown, names: RegExp): void {
  expect(() => parseBookTimestampsArtifact(data, 'fixture')).toThrow(BookTimestampsArtifactError);
  expect(() => parseBookTimestampsArtifact(data, 'fixture')).toThrow(names);
}

/** A second, valid record — used where a case needs two rows to collide. */
function secondRecord(overrides: Partial<RecordFixture> = {}): RecordFixture {
  return record({
    videoId: 'bbbbbbbbbbb',
    deneme: 2,
    title: 'also never read',
    timestamps: marks([
      ['Soru 1', 7],
      ['Soru 2', 42],
    ]),
    ...overrides,
  });
}

describe('parseBookTimestampsArtifact', () => {
  it('accepts the valid fixture and drops the title (positive control for every case below)', () => {
    const artifact = parseBookTimestampsArtifact([record(), secondRecord()], 'fixture');

    expect(artifact.videos).toHaveLength(2);
    expect(artifact.questionCount).toBe(5);
    // `questionNo` is DERIVED from position, and `title` is not carried at all (SPEC §5.2).
    expect(artifact.videos).toContainEqual({
      denemeNo: 1,
      youtubeVideoId: 'aaaaaaaaaaa',
      questions: [
        { questionNo: 1, startSecond: 0 },
        { questionNo: 2, startSecond: 30 },
        { questionNo: 3, startSecond: 61 },
      ],
    });
    expect(JSON.stringify(artifact)).not.toContain('never read');
  });

  // ── Refusal 1: "nothing expected" FAILS; it never reports a green count of zero ──
  it('refuses an empty artefact instead of reporting zero checked', () => {
    expectRefusedBy([], /\(root\)/);
  });

  it('refuses a video carrying no marks at all', () => {
    // Anchored on the `timestamps` path because this fixture is refused by the schema's `.min(1)`,
    // NOT by the mark-total branch the refusal's second half carries — that branch is a belt the
    // schema makes unreachable, and it is labelled as such at its site.
    expectRefusedBy([record({ timestamps: [] })], /timestamps/);
  });

  it('refuses a video carrying more marks than a question number can hold', () => {
    // `CHK_book_video_questions_question_no CHECK (question_no BETWEEN 1 AND 99)`, mirrored in the
    // loader: without it the hundredth mark is a value the database refuses mid-transaction.
    const hundred = marks(
      Array.from({ length: 100 }, (_value, index) => [`Soru ${String(index + 1)}`, index] as const),
    );

    expectRefusedBy([record({ timestamps: hundred })], /timestamps/);
  });

  // ── Refusal 2: the id alphabet, and one video to one deneme ──
  it.each([
    ['one character short', 'aaaaaaaaaa'],
    ['one character long', 'aaaaaaaaaaaa'],
    ['an illegal character', 'aaaaaaaaaa!'],
    ['empty', ''],
  ])('refuses a videoId that is %s', (_label, videoId) => {
    expectRefusedBy([record({ videoId })], /videoId/);
  });

  it('refuses the same videoId on two denemeler', () => {
    const data = [record(), secondRecord({ videoId: 'aaaaaaaaaaa' })];

    expect(() => parseBookTimestampsArtifact(data, 'fixture')).toThrow(/belongs to exactly one/);
  });

  // ── Refusal 3: the deneme number ──
  it('refuses a repeated deneme number', () => {
    const data = [record(), secondRecord({ deneme: 1 })];

    expect(() => parseBookTimestampsArtifact(data, 'fixture')).toThrow(/appears twice/);
  });

  it.each([
    ['fractional', 1.5],
    ['zero', 0],
    ['negative', -3],
  ])('refuses a deneme number that is %s', (_label, deneme) => {
    expectRefusedBy([record({ deneme })], /deneme/);
  });

  // ── Refusal 5: start seconds, and strict ascent inside a video ──
  it.each([
    ['negative', -1],
    ['fractional', 12.5],
  ])('refuses a startingSecond that is %s', (_label, startingSecond) => {
    expectRefusedBy(
      [record({ timestamps: marks([['Soru 1', startingSecond]]) })],
      /startingSecond/,
    );
  });

  it.each([
    ['equal to its predecessor', 30],
    ['before its predecessor', 12],
  ])('refuses a startingSecond %s', (_label, third) => {
    const data = [
      record({
        timestamps: marks([
          ['Soru 1', 0],
          ['Soru 2', 30],
          ['Soru 3', third],
        ]),
      }),
    ];

    expect(() => parseBookTimestampsArtifact(data, 'fixture')).toThrow(/does not come after/);
  });

  // ── Refusals 4 + 6: position and tag are two independent readings of one fact ──
  // `questionNo` derives from position, so position alone can never disagree with itself. The tag
  // is the only witness that a mark was dropped, duplicated or reordered — playbook §5's fidelity
  // rule in the form this line needs.
  it('refuses a tag that disagrees with its position', () => {
    const data = [
      record({
        timestamps: marks([
          ['Soru 1', 0],
          ['Soru 3', 30],
        ]),
      }),
    ];

    expect(() => parseBookTimestampsArtifact(data, 'fixture')).toThrow(/the position says/);
  });

  it('refuses a dropped mark, because the surviving tags stop matching their positions', () => {
    const data = [
      record({
        timestamps: marks([
          ['Soru 1', 0],
          ['Soru 3', 61],
        ]),
      }),
    ];

    expect(() => parseBookTimestampsArtifact(data, 'fixture')).toThrow(/the position says/);
  });

  it('refuses a tag written in any other shape', () => {
    const data = [record({ timestamps: marks([['Question 1', 0]]) })];

    expect(() => parseBookTimestampsArtifact(data, 'fixture')).toThrow(/the position says/);
  });

  // ── The schema is strict: a SHAPE change is loud rather than silently stripped ──
  it('refuses an unknown key', () => {
    // Anchored on OUR prefix rather than a path: an unrecognised key is reported by zod against the
    // record itself, and the prefix is what distinguishes a SCHEMA refusal from a cross-row one.
    expectRefusedBy(
      [{ ...record(), startingSeconds: [] }],
      /does not match the question-index artefact schema/,
    );
  });

  it('refuses a missing required key', () => {
    const withoutDeneme = {
      videoId: 'aaaaaaaaaaa',
      title: 'irrelevant',
      timestamps: marks([['Soru 1', 0]]),
    };

    expectRefusedBy([withoutDeneme], /deneme/);
  });

  it('refuses a record whose title is missing, because the shape changed', () => {
    const withoutTitle = {
      videoId: 'aaaaaaaaaaa',
      deneme: 1,
      timestamps: marks([['Soru 1', 0]]),
    };

    expectRefusedBy([withoutTitle], /title/);
  });

  // ── Refusal 7, first half: the message names the source ──
  it('names the source rather than leaving a bare schema error', () => {
    expect(() =>
      parseBookTimestampsArtifact({ not: 'an array' }, '/some/where/artifact.json'),
    ).toThrow(/\/some\/where\/artifact\.json/);
  });
});

describe('readBookTimestampsArtifact', () => {
  async function writeTempArtifact(contents: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'book-timestamps-'));
    const path = join(dir, 'artifact.json');
    await writeFile(path, contents, 'utf8');
    return path;
  }

  function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  // ── Refusal 7, second half: an unreadable or unparseable file is answered by NAME, never with a
  // `node:fs` stack trace (playbook §8's third shared refusal) ──
  it('names the missing file rather than surfacing an fs error', async () => {
    await expect(readBookTimestampsArtifact('/no/such/artifact.json', sha256(''))).rejects.toThrow(
      /\/no\/such\/artifact\.json/,
    );
  });

  it('names the file when it is not valid JSON', async () => {
    const path = await writeTempArtifact('{ not json');

    await expect(readBookTimestampsArtifact(path, sha256('{ not json'))).rejects.toThrow(
      /is not valid JSON/,
    );
  });

  it('accepts a file whose hash matches the pin (positive control for the case below)', async () => {
    const contents = JSON.stringify([record(), secondRecord()]);
    const path = await writeTempArtifact(contents);

    await expect(readBookTimestampsArtifact(path, sha256(contents))).resolves.toMatchObject({
      questionCount: 5,
    });
  });

  it('refuses a file whose hash does not match the pin', async () => {
    const contents = JSON.stringify([record(), secondRecord()]);
    const path = await writeTempArtifact(contents);

    await expect(readBookTimestampsArtifact(path, sha256('something else'))).rejects.toThrow(
      /does not match its pinned SHA-256/,
    );
  });

  /**
   * The one case that drives the COMMITTED file, and the reason it exists.
   *
   * Every case above writes a synthetic temp file and passes a hash computed from that same file,
   * so the pin under test is always the fixture's own hash and the file under test is never
   * `data/books/…timestamps.json`. Neither `bookTimestampsArtifactPath()` nor
   * `EXPECTED_ARTIFACT_SHA256` was referenced by any spec, so the committed artefact passed through
   * none of the seven refusals in CI: a PR moving the artefact without the constant, or carrying a
   * tag/position disagreement, stayed green on all five jobs (PR #109 review, `TA109-I1` =
   * `SFH109-M7`). B3 does not close it — `seedBooks` takes `options.artifact` and the e2e drives
   * synthetic fixtures through that seam.
   *
   * STRUCTURE ONLY. No literal second, video id or total appears below: every expectation is a
   * property the artefact must have whatever it says, so a legitimate re-measurement does not turn
   * this red. The counts are compared against THEMSELVES; the facts were closed by the measurement
   * round (→ DEC 2026-08-12p) and re-asserting them here would freeze them.
   */
  it('drives the COMMITTED artefact through its own loader, pin and refusals', async () => {
    const artifact = await readBookTimestampsArtifact();

    expect(artifact.videos.length).toBeGreaterThan(0);
    expect(new Set(artifact.videos.map((video) => video.denemeNo)).size).toBe(
      artifact.videos.length,
    );
    expect(new Set(artifact.videos.map((video) => video.youtubeVideoId)).size).toBe(
      artifact.videos.length,
    );
    expect(artifact.questionCount).toBe(
      artifact.videos.reduce((total, video) => total + video.questions.length, 0),
    );
    expect(artifact.questionCount).toBeGreaterThan(0);
  });
});

describe('assertArtifactMeetsCoverageFloor', () => {
  function artifactOf(videoCount: number, questionsPerVideo: number): BookTimestampsArtifact {
    const videos = Array.from({ length: videoCount }, (_value, index) => ({
      denemeNo: index + 1,
      youtubeVideoId: 'aaaaaaaaaaa',
      questions: Array.from({ length: questionsPerVideo }, (_mark, position) => ({
        questionNo: position + 1,
        startSecond: position,
      })),
    }));

    return { videos, questionCount: videoCount * questionsPerVideo };
  }

  it('accepts an artefact that meets its floor exactly (positive control)', () => {
    expect(() => {
      assertArtifactMeetsCoverageFloor(artifactOf(3, 2), { videos: 3, questions: 6 });
    }).not.toThrow();
  });

  it('accepts an artefact that grew past its floor', () => {
    expect(() => {
      assertArtifactMeetsCoverageFloor(artifactOf(4, 2), { videos: 3, questions: 6 });
    }).not.toThrow();
  });

  it('refuses a truncated artefact, which every other refusal accepts', () => {
    // The truncation case in full: fewer records, each of them perfectly valid. The hash pin cannot
    // catch it, because updating the pin is the DOCUMENTED procedure for a re-measurement.
    expect(() => {
      assertArtifactMeetsCoverageFloor(artifactOf(1, 2), { videos: 3, questions: 6 });
    }).toThrow(/below the pinned floor/);
  });

  it('refuses an artefact that kept its videos and lost marks', () => {
    expect(() => {
      assertArtifactMeetsCoverageFloor(artifactOf(3, 1), { videos: 3, questions: 6 });
    }).toThrow(/marks, below the pinned floor/);
  });

  it('applies the committed floor by default, and the committed artefact meets it', async () => {
    // The default argument is what production uses, so it is what a test must exercise — a floor
    // proved only against a hand-passed value proves nothing about the run.
    const artifact = await readBookTimestampsArtifact();

    expect(() => {
      assertArtifactMeetsCoverageFloor(artifact);
    }).not.toThrow();
  });
});
