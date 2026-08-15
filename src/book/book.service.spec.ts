import { describe, expect, it } from '@jest/globals';
import { latestUpdatedAt } from './book.service';

/**
 * The two branches of the published `dateModified` / sitemap `lastmod` value.
 *
 * ## Why this file exists
 * `latestUpdatedAt` was `export`ed with a docblock promising "exported for direct unit testing of
 * the null-collapse branch" — and no such test existed, which PR #110's review found by sweeping
 * for the identifier (`CODE110-M1` / `SFH110-M2`). An export justified by a test that does not
 * exist is a widened surface bought with nothing. This is the test the sentence promised.
 *
 * Pure and database-free, so it belongs in the `Test (unit)` job rather than the Testcontainers
 * suite (`ENGINEERING.md` §8).
 *
 * Structural only: the instants below are arbitrary and carry no meaning — what is asserted is
 * which of two inputs comes back, never a date a book actually has.
 */
describe('latestUpdatedAt', () => {
  const bookStamp = new Date('2026-01-01T00:00:00.000Z');

  it('collapses to the book stamp when the book has no child rows', () => {
    // The normal state of a künye row seeded before its question index — and, permanently, of any
    // book whose denemeler are not indexed here.
    expect(latestUpdatedAt(bookStamp, null).toISOString()).toBe(bookStamp.toISOString());
  });

  it('takes the CHILD stamp when a child is newer — the case the GREATEST exists for', () => {
    // A re-measurement updates `book_video_questions` and deliberately leaves `books` untouched, so
    // this branch is what stops the sitemap reporting "unchanged" on the day the whole question
    // index moved.
    const childStamp = new Date('2026-06-01T00:00:00.000Z');
    expect(latestUpdatedAt(bookStamp, childStamp).toISOString()).toBe(childStamp.toISOString());
  });

  it('keeps the BOOK stamp when it is the newer of the two', () => {
    // The other direction, which a `childrenUpdatedAt ?? bookUpdatedAt` shortcut would get wrong:
    // editing the künye without touching a child row must still move the published value.
    const olderChild = new Date('2025-01-01T00:00:00.000Z');
    expect(latestUpdatedAt(bookStamp, olderChild).toISOString()).toBe(bookStamp.toISOString());
  });

  it('returns the book stamp when the two are equal, never a different instant', () => {
    const same = new Date(bookStamp.getTime());
    expect(latestUpdatedAt(bookStamp, same).toISOString()).toBe(bookStamp.toISOString());
  });
});
