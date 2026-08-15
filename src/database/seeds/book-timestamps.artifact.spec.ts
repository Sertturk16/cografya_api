import { describe, expect, it } from '@jest/globals';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BookTimestampsArtifactError,
  parseBookTimestampsArtifact,
  readBookTimestampsArtifact,
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
    expect(() => parseBookTimestampsArtifact([], 'fixture')).toThrow(BookTimestampsArtifactError);
  });

  it('refuses a video carrying no marks at all', () => {
    expect(() => parseBookTimestampsArtifact([record({ timestamps: [] })], 'fixture')).toThrow(
      BookTimestampsArtifactError,
    );
  });

  // ── Refusal 2: the id alphabet, and one video to one deneme ──
  it.each([
    ['one character short', 'aaaaaaaaaa'],
    ['one character long', 'aaaaaaaaaaaa'],
    ['an illegal character', 'aaaaaaaaaa!'],
    ['empty', ''],
  ])('refuses a videoId that is %s', (_label, videoId) => {
    expect(() => parseBookTimestampsArtifact([record({ videoId })], 'fixture')).toThrow(
      BookTimestampsArtifactError,
    );
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
    expect(() => parseBookTimestampsArtifact([record({ deneme })], 'fixture')).toThrow(
      BookTimestampsArtifactError,
    );
  });

  // ── Refusal 5: start seconds, and strict ascent inside a video ──
  it.each([
    ['negative', -1],
    ['fractional', 12.5],
  ])('refuses a startingSecond that is %s', (_label, startingSecond) => {
    const data = [record({ timestamps: marks([['Soru 1', startingSecond]]) })];

    expect(() => parseBookTimestampsArtifact(data, 'fixture')).toThrow(BookTimestampsArtifactError);
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
    const data = [{ ...record(), startingSeconds: [] }];

    expect(() => parseBookTimestampsArtifact(data, 'fixture')).toThrow(BookTimestampsArtifactError);
  });

  it('refuses a missing required key', () => {
    const withoutDeneme = {
      videoId: 'aaaaaaaaaaa',
      title: 'irrelevant',
      timestamps: marks([['Soru 1', 0]]),
    };

    expect(() => parseBookTimestampsArtifact([withoutDeneme], 'fixture')).toThrow(
      BookTimestampsArtifactError,
    );
  });

  it('refuses a record whose title is missing, because the shape changed', () => {
    const withoutTitle = {
      videoId: 'aaaaaaaaaaa',
      deneme: 1,
      timestamps: marks([['Soru 1', 0]]),
    };

    expect(() => parseBookTimestampsArtifact([withoutTitle], 'fixture')).toThrow(
      BookTimestampsArtifactError,
    );
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
});
