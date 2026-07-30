import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EcmwfContractError } from './ecmwf.errors';
import {
  mergeByteRanges,
  parseEcmwfIndex,
  selectIndexRecords,
  toRangeHeader,
  type EcmwfIndexRecord,
} from './ecmwf-index';

/**
 * STRUCTURAL tests for the `.index` reader and the byte-range planner.
 *
 * The two committed `.index` files are real ones (2026-07-30 12z, step 72), so the parser is
 * exercised against the provider's actual output rather than a hand-written imitation of it —
 * which matters here more than usual, because the fact that broke the SPEC's assumption is a
 * FORMAT fact: the provider labels these files `application/json` and they are JSON-lines.
 *
 * Nothing below asserts a physical quantity. What it asserts is shape: that every line parses,
 * that a missing or duplicated parameter is refused rather than guessed, and that adjacency
 * decides merging.
 */

const FIXTURE_DIR = join(__dirname, '..', '..', '..', 'test', 'fixtures', 'ecmwf');

function readFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8');
}

function record(overrides: Partial<EcmwfIndexRecord> = {}): EcmwfIndexRecord {
  return {
    param: 'swh',
    offset: 0,
    length: 100,
    date: '20260730',
    time: '1200',
    step: '72',
    stream: 'wave',
    lineNumber: 1,
    ...overrides,
  };
}

describe('parseEcmwfIndex', () => {
  it('reads every line of a real oper index', () => {
    const records = parseEcmwfIndex(readFixture('20260730-12z-oper-step72.index'));

    expect(records.length).toBe(184);
    // Line numbers stay 1-based and gapless, so an error message can point at a line an operator
    // can actually open.
    expect(records.map((entry) => entry.lineNumber)).toEqual(
      Array.from({ length: records.length }, (_unused, index) => index + 1),
    );
    for (const entry of records) {
      expect(entry.length).toBeGreaterThan(0);
      expect(entry.offset).toBeGreaterThanOrEqual(0);
      expect(entry.stream).toBe('oper');
    }
  });

  it('reads every line of a real wave index', () => {
    const records = parseEcmwfIndex(readFixture('20260730-12z-wave-step72.index'));

    expect(records.length).toBe(13);
    expect(records.every((entry) => entry.stream === 'wave')).toBe(true);
  });

  it('refuses a whole-file JSON document — the format is JSON-lines despite the content type', () => {
    // The exact failure a `JSON.parse(body)` implementation would hit on the first real cycle.
    // Asserted from the other side: a document that IS valid JSON as a whole is not an index.
    const wholeDocument = '[\n{"param":"swh","_offset":0,"_length":10}\n]';

    expect(() => parseEcmwfIndex(wholeDocument)).toThrow(EcmwfContractError);
  });

  it('refuses a line with a missing or malformed field instead of skipping it', () => {
    const cases = [
      '{"param":"swh","_length":10,"date":"20260730","time":"1200","step":"72","stream":"wave"}',
      '{"param":"swh","_offset":0,"_length":0,"date":"20260730","time":"1200","step":"72","stream":"wave"}',
      '{"param":"swh","_offset":-1,"_length":10,"date":"20260730","time":"1200","step":"72","stream":"wave"}',
      '{"param":"","_offset":0,"_length":10,"date":"20260730","time":"1200","step":"72","stream":"wave"}',
      '{"_offset":0,"_length":10,"date":"20260730","time":"1200","step":"72","stream":"wave"}',
      'not json at all',
    ];

    for (const line of cases) {
      // A skipped line would be invisible: the parameter simply never appears and the step is
      // served short, with nothing anywhere saying why.
      expect(() => parseEcmwfIndex(line)).toThrow(EcmwfContractError);
    }
  });

  it('refuses an empty body', () => {
    expect(() => parseEcmwfIndex('')).toThrow(EcmwfContractError);
    expect(() => parseEcmwfIndex('\n\n')).toThrow(EcmwfContractError);
  });
});

describe('selectIndexRecords', () => {
  it('finds every Faz-1 parameter in the real indexes', () => {
    const oper = parseEcmwfIndex(readFixture('20260730-12z-oper-step72.index'));
    const wave = parseEcmwfIndex(readFixture('20260730-12z-wave-step72.index'));

    expect(selectIndexRecords(oper, ['10u', '10v']).map((entry) => entry.param)).toEqual([
      '10u',
      '10v',
    ]);
    expect(selectIndexRecords(wave, ['swh', 'mwd']).map((entry) => entry.param)).toEqual([
      'swh',
      'mwd',
    ]);
  });

  it('refuses a parameter the index does not carry', () => {
    const wave = parseEcmwfIndex(readFixture('20260730-12z-wave-step72.index'));

    // `10u` lives in the `oper` stream, not `wave`. Asking the wrong file must fail loudly rather
    // than return a short list that silently drops a published layer.
    expect(() => selectIndexRecords(wave, ['10u'])).toThrow(EcmwfContractError);
  });

  it('refuses a duplicated parameter rather than picking the first', () => {
    const records = [
      record({ param: 'swh', offset: 0, lineNumber: 1 }),
      record({ param: 'swh', offset: 100, lineNumber: 2 }),
    ];

    expect(() => selectIndexRecords(records, ['swh'])).toThrow(EcmwfContractError);
  });
});

describe('mergeByteRanges', () => {
  it('merges the adjacent wave pair into ONE request and keeps the wind pair apart', () => {
    // The measured layout of a real cycle, and the reason merging is computed rather than pinned:
    // swh/mwd are adjacent at every step, 10u/10v at none.
    const wave = parseEcmwfIndex(readFixture('20260730-12z-wave-step72.index'));
    const oper = parseEcmwfIndex(readFixture('20260730-12z-oper-step72.index'));

    const waveRanges = mergeByteRanges(selectIndexRecords(wave, ['swh', 'mwd']));
    expect(waveRanges.length).toBe(1);
    expect(waveRanges[0]?.members.map((member) => member.param)).toEqual(['swh', 'mwd']);
    // The second message's position INSIDE the merged range is the only thing that later binds
    // those bytes to `mwd`.
    expect(waveRanges[0]?.members[1]?.relativeOffset).toBe(waveRanges[0]?.members[0]?.length);

    const operRanges = mergeByteRanges(selectIndexRecords(oper, ['10u', '10v']));
    expect(operRanges.length).toBe(2);
  });

  it('merges only on EXACT adjacency, never across a gap', () => {
    const adjacent = mergeByteRanges([
      record({ param: 'swh', offset: 100, length: 50 }),
      record({ param: 'mwd', offset: 150, length: 25 }),
    ]);
    expect(adjacent.length).toBe(1);
    expect(adjacent[0]).toMatchObject({ start: 100, endInclusive: 174, length: 75 });

    // One byte of daylight is enough to keep them apart: bridging it would mean paying for bytes
    // we must then skip, and the range would stop decomposing into "message, message".
    const gapped = mergeByteRanges([
      record({ param: 'swh', offset: 100, length: 50 }),
      record({ param: 'mwd', offset: 151, length: 25 }),
    ]);
    expect(gapped.length).toBe(2);
  });

  it('sorts by offset before merging, so index order cannot change the plan', () => {
    const ranges = mergeByteRanges([
      record({ param: 'mwd', offset: 150, length: 25 }),
      record({ param: 'swh', offset: 100, length: 50 }),
    ]);

    expect(ranges.length).toBe(1);
    expect(ranges[0]?.members.map((member) => member.param)).toEqual(['swh', 'mwd']);
  });

  it('refuses overlapping records', () => {
    expect(() =>
      mergeByteRanges([
        record({ param: 'swh', offset: 100, length: 60 }),
        record({ param: 'mwd', offset: 150, length: 25 }),
      ]),
    ).toThrow(EcmwfContractError);
  });

  it('refuses an empty record set', () => {
    expect(() => mergeByteRanges([])).toThrow(EcmwfContractError);
  });
});

describe('toRangeHeader', () => {
  it('emits an inclusive HTTP byte range', () => {
    const [range] = mergeByteRanges([record({ offset: 10, length: 5 })]);

    // Inclusive on BOTH ends: `bytes=10-14` is five bytes. Writing the exclusive end here would
    // fetch one byte too many and break the message-boundary decomposition.
    expect(range && toRangeHeader(range)).toBe('bytes=10-14');
  });
});
