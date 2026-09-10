import { describe, expect, it } from '@jest/globals';
import { ADD_GENERIC_BOOK_CATALOGUE_FIELDS_STATEMENTS } from './1788300060000-AddGenericBookCatalogueFields';
import { DROP_BOOK_DENEME_COUNT_STATEMENTS } from './1788300120000-DropBookDenemeCount';
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
 *
 * ## PR-2 extends this file rather than starting a second one (measured, not assumed — `atlas-
 * approval.md` §7.3 item 3)
 * `AddGenericBookCatalogueFields1788300060000`'s four `ADD COLUMN` statements already match the
 * SAME `ALLOWED` regex below — `ADD COLUMN` was named in it from PR-1 on, anticipating exactly this
 * shape. So the choice is not "does this migration need a guard" (its own statements are already
 * inside the allowlist), it is "does its own array get its own asserted case, or does it ride on
 * PR-1's untested". Asserting it here costs four lines and keeps the house rule (`RENAME_BOOK_
 * CATALOGUE_STATEMENTS`'s own docblock: "one list, two readers, cannot drift") uniform across every
 * migration in this series rather than true for PR-1 and PR-3 (which will need the same treatment
 * for its `DROP COLUMN`) and silently absent for PR-2. The revert-to-red duty below is the second
 * authoring obligation discharged for THIS array, independently of PR-1's.
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

/**
 * `ADD_GENERIC_BOOK_CATALOGUE_FIELDS_STATEMENTS` — the same three cases, PR-2's own array.
 *
 * Revert-to-red, observed by hand before this file was committed: temporarily appending
 * `UPDATE "book_videos" SET title_tr = 'x'` as a fifth array element turned the second case below
 * red, naming index 4 and that exact statement; removing it turned the suite green again.
 */
describe('ADD_GENERIC_BOOK_CATALOGUE_FIELDS_STATEMENTS — positive allowlist over executed statements', () => {
  const ALLOWED = /^ALTER TABLE "[a-z_]+" (RENAME (TO|COLUMN|CONSTRAINT)|ADD COLUMN|DROP COLUMN)\b/;

  it('is non-empty', () => {
    expect(ADD_GENERIC_BOOK_CATALOGUE_FIELDS_STATEMENTS.length).toBeGreaterThan(0);
  });

  it('every executed statement matches the positive allowlist', () => {
    ADD_GENERIC_BOOK_CATALOGUE_FIELDS_STATEMENTS.forEach((statement, index) => {
      expect({ index, statement, matchesAllowlist: ALLOWED.test(statement) }).toEqual({
        index,
        statement,
        matchesAllowlist: true,
      });
    });
  });

  it('never carries a destructive or data-moving verb, stated directly rather than only implied', () => {
    const forbidden = /\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE TABLE|DROP TABLE|USING)\b/i;
    for (const statement of ADD_GENERIC_BOOK_CATALOGUE_FIELDS_STATEMENTS) {
      expect(statement).not.toMatch(forbidden);
    }
  });
});

/**
 * `DROP_BOOK_DENEME_COUNT_STATEMENTS` — the same three cases, PR-3's own single-element array.
 *
 * **The allowlist did NOT need to grow for this PR** (measured, not assumed — `atlas-approval.md`
 * §7.3 item 3's question, answered here): `DROP COLUMN` was already a member of `ALLOWED` from
 * PR-1 on, anticipating exactly this shape, so `ALTER TABLE "books" DROP COLUMN "deneme_count"`
 * matches it unchanged.
 *
 * Revert-to-red, observed by hand before this file was committed: temporarily appending
 * `UPDATE "books" SET deneme_count = 1` as a second array element turned the second case below
 * red, naming index 1 and that exact statement as the non-matching element; removing it turned the
 * suite green again.
 */
describe('DROP_BOOK_DENEME_COUNT_STATEMENTS — positive allowlist over executed statements', () => {
  const ALLOWED = /^ALTER TABLE "[a-z_]+" (RENAME (TO|COLUMN|CONSTRAINT)|ADD COLUMN|DROP COLUMN)\b/;

  it('is non-empty', () => {
    expect(DROP_BOOK_DENEME_COUNT_STATEMENTS.length).toBeGreaterThan(0);
  });

  it('every executed statement matches the positive allowlist', () => {
    DROP_BOOK_DENEME_COUNT_STATEMENTS.forEach((statement, index) => {
      expect({ index, statement, matchesAllowlist: ALLOWED.test(statement) }).toEqual({
        index,
        statement,
        matchesAllowlist: true,
      });
    });
  });

  it('never carries a destructive or data-moving verb, stated directly rather than only implied', () => {
    const forbidden = /\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE TABLE|DROP TABLE|USING)\b/i;
    for (const statement of DROP_BOOK_DENEME_COUNT_STATEMENTS) {
      expect(statement).not.toMatch(forbidden);
    }
  });
});
