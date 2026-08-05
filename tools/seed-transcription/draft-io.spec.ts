/**
 * Unit coverage for the shared draft reader.
 *
 * WHY THIS FILE EXISTS: the friendly-path-error behaviour is the one piece of this toolchain that
 * lives in NO entry point's spec — `cli.ts` and the three one-off entry points are unspecced by
 * design (they are argv + constants). Putting the logic here rather than in each shell is what
 * makes it testable at all, so the test has to be here too, otherwise the "all four entry points
 * answer a typo the same way" claim is guarded by nothing.
 *
 * FIXTURES ARE SYNTHETIC — a temp directory and invented file names; nothing is read from
 * `Owner's Inbox/` or from a seed (→ CONVENTIONS §2: tests assert mechanics, never content).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { readDraftFiles, renderDraftReadFailures } from './draft-io.ts';

const tempDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'draft-io-'));

function writeFixture(markdown: string): string {
  const file = path.join(tempDir(), 'draft-fixture.md');
  fs.writeFileSync(file, markdown, 'utf8');
  return file;
}

describe('readDraftFiles', () => {
  it('returns each draft with its own path, in argv order', () => {
    const first = writeFixture('# birinci\n');
    const second = writeFixture('# ikinci\n');
    const { files, failures } = readDraftFiles([first, second]);
    expect(failures).toEqual([]);
    expect(files).toEqual([
      { path: first, markdown: '# birinci\n' },
      { path: second, markdown: '# ikinci\n' },
    ]);
  });

  it('reports a missing path instead of throwing — a typo is not a crash', () => {
    const missing = path.join(tempDir(), 'typo-draft.md');
    const { files, failures } = readDraftFiles([missing]);
    expect(files).toEqual([]);
    expect(failures).toEqual([{ path: missing, reason: 'no such file' }]);
  });

  it('names a directory as a directory rather than as a missing file', () => {
    const directory = tempDir();
    const { failures } = readDraftFiles([directory]);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toBe('is a directory, not a draft file');
  });

  it('reports EVERY unreadable path in one pass, so the invocation is fixed once', () => {
    const good = writeFixture('# var\n');
    const missingA = path.join(tempDir(), 'yok-a.md');
    const missingB = path.join(tempDir(), 'yok-b.md');
    const { files, failures } = readDraftFiles([missingA, good, missingB]);
    // The readable draft is still returned, carrying its own path — nothing index-matches.
    expect(files).toEqual([{ path: good, markdown: '# var\n' }]);
    expect(failures.map((failure) => failure.path)).toEqual([missingA, missingB]);
  });
});

describe('renderDraftReadFailures', () => {
  it('names every failing path and its reason', () => {
    const rendered = renderDraftReadFailures([
      { path: 'a.md', reason: 'no such file' },
      { path: 'b.md', reason: 'permission denied' },
    ]);
    expect(rendered).toContain('cannot read draft file(s)');
    expect(rendered).toContain('  a.md — no such file');
    expect(rendered).toContain('  b.md — permission denied');
  });

  it('points at where the drafts actually live — the hint that fixes the typo', () => {
    // The usage banners abbreviate the path; run from the repo root it needs the `../` hop.
    expect(renderDraftReadFailures([{ path: 'a.md', reason: 'no such file' }])).toContain(
      "../Owner's Inbox/",
    );
  });
});
