import { describe, expect, it } from '@jest/globals';
import { RENAME_BOOK_CATALOGUE_STATEMENTS } from './1788300000000-RenameBookCatalogueGeneric';

/**
 * The §5.6a guard: a POSITIVE allowlist over the EXECUTED statements, never a denylist over this
 * file's own text.
 *
 * ## Why not a denylist (P0 plan §5.6a, `C1-VAL-I1`)
 * A denylist scanning the migration file's TEXT for `/\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE
 * TABLE|DROP TABLE|USING)\b/i` was measured to defeat itself twice against the sibling
 * `1786752000000-InitBookCatalogue.ts`: once on that file's OWN docblock prose (which uses the
 * word "DELETE" describing `ON DELETE CASCADE` in English) and once on the SQL clause
 * `ON DELETE CASCADE` itself, which is a constraint clause, not a statement. A character scan
 * cannot tell a verb from a clause from a sentence.
 *
 * ## What this asserts instead
 * `RENAME_BOOK_CATALOGUE_STATEMENTS` is the EXACT array `up()` executes, in order — imported
 * here, never retyped, so this spec and the migration cannot drift apart (the same one-list
 * discipline `validateBookSeedCorpus` already enforces after `CODE109-I1`). Every element must
 * match a POSITIVE shape: `ALTER TABLE "<table>" (RENAME (TO|COLUMN|CONSTRAINT)|ADD COLUMN|DROP
 * COLUMN)`. `ON DELETE CASCADE` cannot appear because no statement of that shape can carry it;
 * an unlisted statement (an `INSERT`, an `UPDATE`, a bare `DELETE`, a `CREATE TABLE`, a `USING`
 * cast) fails POSITIVELY — the array not matching the shape it is expected to have — rather than
 * depending on someone predicting the one forbidden word a future statement might contain.
 *
 * ## Revert-to-red evidence (`BUILDER-RETURN.md`'s second authoring obligation)
 * Observed by hand before this file was committed: temporarily appending
 * `UPDATE "books" SET deneme_count = 1` as an eleventh array element turned the second case below
 * red, its failure output naming index 10 and that exact statement as the non-matching element;
 * removing it turned the suite green again. Reported with the exact console output in the PR-1
 * completion summary rather than left as an untested claim.
 */
describe('RENAME_BOOK_CATALOGUE_STATEMENTS — positive allowlist over executed statements', () => {
  const ALLOWED = /^ALTER TABLE "[a-z_]+" (RENAME (TO|COLUMN|CONSTRAINT)|ADD COLUMN|DROP COLUMN)\b/;

  it('is non-empty', () => {
    expect(RENAME_BOOK_CATALOGUE_STATEMENTS.length).toBeGreaterThan(0);
  });

  it('every executed statement matches the positive allowlist', () => {
    RENAME_BOOK_CATALOGUE_STATEMENTS.forEach((statement, index) => {
      expect({ index, statement, matchesAllowlist: ALLOWED.test(statement) }).toEqual({
        index,
        statement,
        matchesAllowlist: true,
      });
    });
  });

  it('never carries a destructive or data-moving verb, stated directly rather than only implied', () => {
    // Belt-and-braces: the allowlist above already makes this structurally true — no allowed
    // shape can carry any of these tokens — but the property is worth asserting on its own so a
    // future widening of the allowlist regex cannot silently let one back in unnoticed.
    const forbidden = /\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE TABLE|DROP TABLE|USING)\b/i;
    for (const statement of RENAME_BOOK_CATALOGUE_STATEMENTS) {
      expect(statement).not.toMatch(forbidden);
    }
  });
});
