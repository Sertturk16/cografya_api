import {
  assertArtifactMeetsCoverageFloor,
  readBookTimestampsArtifact,
  type BookTimestampsArtifact,
} from './book-timestamps.artifact';
import { BOOK_TIMESTAMPS_OWNER_SLUG_TR, SEED_BOOKS, type BookSeed } from './books.seed-data';

/**
 * The structural rules a book row must satisfy BEFORE anything is written — the seed-side half of
 * `ENGINEERING.md` §5's fidelity requirement for this line (PR B2).
 *
 * ## Why these live here rather than in a CHECK constraint or a comment
 * Three different reasons, and they do not overlap:
 *
 * 1. **Some are cross-table and a CHECK cannot see them.** `book_videos.deneme_no <=
 *    books.deneme_count` needs a trigger, and `1786752000000-InitBookCatalogue.ts` records it as a
 *    B2 seed obligation by name rather than growing machinery this catalogue has not earned.
 * 2. **Some the database deliberately declines to chase.** `CHK_books_author_names` rejects `'{}'`
 *    and nothing else — `{''}` and `{'   '}` are ACCEPTED, measured on Postgres 16.15 — because a
 *    content guard would have no precedent in that schema. The migration calls a blank credit "a
 *    B2 seeding defect"; this is where B2 refuses it.
 * 3. **The prose ceilings are `CONTENT-STYLE.md`'s, not Postgres's.** §2, §16, §17 and §20 carry
 *    numeric ceilings, and pinning a ceiling is asserting a RULE — not a fact. Nothing here
 *    hardcodes what the prose says; a different book with different text passes exactly the same
 *    gate. This is what stands in place of a fifth transcription lane (Atlas ruling, B2 plan §4),
 *    together with the single-literal form of the strings and the hashes in `data/books/README.md`.
 *
 * ## What is deliberately NOT enforced
 * The `SEO-POLICY.md` A1 (25–60) and A2 (110–165) length bands. SPEC §5.1 is explicit that those
 * are editorial defaults rather than limits, and §0.2 of the policy says the same: "bandın dışı
 * ihlal değil, nottur". Turning a note into a failure would let a length band veto an editorial
 * decision the owner already ruled on. They are surfaced as NOTES instead —
 * {@link collectBookSeedNotes} — which the seed CLI prints on every run, so the policy is visible
 * at the moment somebody edits a string rather than at audit time.
 *
 * ## Which HALF of each CONTENT-STYLE section is pinned, so the gate's silence is not read as cover
 * Only the parts that are ARITHMETIC are here, and §16 is the section where that split matters:
 * its second limit ("bir paragrafta en fazla 1 noktalı virgül") is counted below, while its FIRST
 * ("bir cümlede en fazla 2 bağımsız olgu") is not — counting independent facts in a sentence is
 * judgement, and a wrong count would either veto correct prose or license a false green. §12
 * (sentence-length uniformity), §9 (mechanical parallelism) and §13 (repeated openers) are absent
 * for the same reason. **A green `pnpm db:seed:books --check` therefore does NOT mean "the
 * CONTENT-STYLE ceilings hold"** — it means the machine-checkable ones hold. The rest is the
 * content-fidelity review leg's, on the draft, before the string reaches this file.
 */

/** Slug alphabet after `GLOSSARY.md` §5's four folding rules: only `a-z0-9-` survives. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Exactly thirteen digits — the same shape `CHK_books_isbn13` pins in SQL. */
const ISBN13_PATTERN = /^[0-9]{13}$/;

/**
 * The `CHK_books_cover_image_path` allowlist, mirrored.
 *
 * Mirrored rather than merely trusted because a value rejected by the database arrives as a
 * constraint violation mid-transaction, while a value rejected here names the field and the rule.
 * The alphabet carries no `:`, `\`, `%` or `@`, so it cannot express an authority; the second
 * condition closes the protocol-relative `//host` form the alphabet alone would still admit.
 */
const COVER_IMAGE_PATH_PATTERN = /^\/[A-Za-z0-9._~/-]+$/;

/**
 * A run of four or more capitals inside one word — `CONTENT-STYLE.md` §2 (emphasis by ALL CAPS is
 * never used).
 *
 * Four rather than two, and the reason is stated so the next reader can tell a threshold from an
 * accident: every abbreviation this surface legitimately carries is three letters (`AYT`, `TYT`,
 * `YKS`, `LGS` — the whole `ExamTrack` set), so three is the boundary between a term and emphasis.
 * A longer legitimate acronym in a future book's prose is added to an explicit allowlist in the PR
 * that needs it, not accommodated by weakening the threshold here.
 */
const SHOUTED_WORD_PATTERN = /[A-ZÇĞİÖŞÜ]{4,}/;

/**
 * The YouTube CHANNEL id shape — `UC` plus 22 characters of the same alphabet the video id uses.
 *
 * Pinned for the reason `CHK_book_videos_youtube_video_id` pins the 11-character video id: this
 * value is REQUIRED in the published contract (`BookDetailDto.youtubeChannelId`), so an id one
 * character short ships to every consumer of that field and every other check passes it.
 *
 * **Its older justification — that this value builds the reader-facing attribution link — is no
 * longer true and the pattern outlives it.** `DEC 2026-08-17b` made the served address the handle
 * constant in `book/book-attribution.catalogue.ts`, so nothing composes a link from this id any
 * more. The `^UC` half is what now earns its keep on its own: the channel's RSS feed prints
 * `<yt:channelId>` with the `UC` prefix DROPPED (22 characters instead of 24), so an id copied from
 * there looks entirely plausible and is refused here — the trap recorded in
 * `Owner's Inbox/kitap-video-web/channelurl-verification.md` K3.
 *
 * `youtubePlaylistId` deliberately gets NO pattern: playlist ids come in several families (`PL`,
 * `UU`, `OL`, `RD`, …) of differing lengths, so a pattern would refuse legitimate values, and the
 * column is nullable and attribution-only. Its non-empty and length checks below are the whole
 * guard, and that is a decision rather than an omission.
 */
const YOUTUBE_CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;

/**
 * Fields on a book row that a reader sees as prose, and which the ceilings therefore bind.
 *
 * `titleTr` and `publisherName` are reader-facing too and are deliberately OUTSIDE this list: a
 * printed book title and a publisher name are quoted from the cover, so the §2 ALL-CAPS ceiling
 * and the §16/§17 paragraph ceilings would bind us to restyle somebody else's name. They still
 * carry the structural checks in {@link collectKunyeProblems} (non-empty, column length) and the
 * No-Endorsement guard. The boundary is asserted by a spec case so the next reader meets a
 * decision rather than an omission.
 */
const PROSE_FIELDS = ['introTr', 'metaTitleTr', 'metaDescriptionTr'] as const;

/** Prose fields that are single-line by nature: a newline inside a `<title>`/`<meta>` is a defect. */
const SINGLE_LINE_PROSE_FIELDS = ['metaTitleTr', 'metaDescriptionTr'] as const;

/**
 * Every REQUIRED string column, with the `varchar` length the migration gives it.
 *
 * Mirrored for the reason `CHK_books_cover_image_path` is mirrored above: a value the database
 * rejects arrives as a constraint violation mid-transaction, while a value rejected here names the
 * field and the rule — and `--check`, which opens no connection, can see it at all. The database
 * has NO guard for the other half of this list: an empty `metaTitleTr` satisfies every CHECK and
 * every invariant, and publishes an empty `<title>` on an indexable page.
 *
 * `null` is the entry for `intro_tr`, whose column is `text` and therefore unbounded.
 */
const REQUIRED_STRING_FIELDS = [
  ['slugTr', 140],
  ['slugEn', 140],
  ['titleTr', 200],
  ['publisherName', 120],
  ['introTr', null],
  ['metaTitleTr', 200],
  ['metaDescriptionTr', 400],
  ['youtubeChannelId', 32],
] as const satisfies readonly (readonly [keyof BookSeed, number | null])[];

/** Nullable string columns, with their `varchar` lengths. A `null` value skips both checks. */
const OPTIONAL_STRING_FIELDS = [
  ['titleEn', 200],
  ['coverImagePath', 200],
  ['purchaseUrl', 300],
  ['youtubePlaylistId', 64],
] as const satisfies readonly (readonly [keyof BookSeed, number])[];

export class BookSeedInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookSeedInvariantError';
  }
}

function paragraphsOf(value: string): string[] {
  return value.split('\n\n');
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

/**
 * `CONTENT-STYLE.md` ceilings over one row's prose. Applied per FIELD and per PARAGRAPH, because
 * that is the unit both §16 and §17 state their limits in.
 */
function collectProseProblems(book: BookSeed): string[] {
  const problems: string[] = [];
  let emDashesOnPage = 0;

  for (const field of PROSE_FIELDS) {
    const value = book[field];

    if (value.trim() !== value) {
      problems.push(`${field}: leading or trailing whitespace.`);
    }
    if (value.includes('\r')) {
      problems.push(`${field}: carries a carriage return; line endings are LF only.`);
    }
    // §20: a paragraph break is a BLANK LINE. A lone `\n` is not a paragraph separator and the web
    // repo's `ProseNote` does not render it as one, so it would silently disappear on the page.
    if (value.replace(/\n\n/g, '').includes('\n')) {
      problems.push(
        `${field}: contains a single newline. Paragraphs are separated by a blank line ` +
          `(\\n\\n) — a lone \\n is not a paragraph break (CONTENT-STYLE §20).`,
      );
    }
    // §20's other side, and the case the check above cannot see: a run of FOUR newlines is
    // consumed as two `\n\n` pairs and passes it, while `paragraphsOf` then yields an empty
    // paragraph and the web repo's `ProseNote` renders an empty block. Testing the OUTPUT of the
    // split rather than the raw string closes every run length at once.
    if (paragraphsOf(value).some((paragraph) => paragraph.trim().length === 0)) {
      problems.push(
        `${field}: contains an empty paragraph (a run of four or more newlines). One blank ` +
          `line separates two paragraphs (CONTENT-STYLE §20).`,
      );
    }
    if (SHOUTED_WORD_PATTERN.test(value)) {
      problems.push(`${field}: ALL CAPS emphasis (CONTENT-STYLE §2). Rewrite the sentence.`);
    }
    // §6: an official citation string does not belong in running prose. The ISBN is the instance
    // that exists on this surface — it is a structural künye field and stays one.
    if (value.includes(book.isbn13)) {
      problems.push(
        `${field}: carries the ISBN. Official citation strings stay in structural fields, not in ` +
          `prose (CONTENT-STYLE §6).`,
      );
    }

    for (const [index, paragraph] of paragraphsOf(value).entries()) {
      const position = `${field} paragraph ${String(index + 1)}`;
      // §16: at most one semicolon per paragraph — the Turkish form of semicolon chaining.
      const semicolons = countOccurrences(paragraph, ';');
      if (semicolons > 1) {
        problems.push(
          `${position}: ${String(semicolons)} semicolons; the ceiling is 1 (CONTENT-STYLE §16).`,
        );
      }
      // §17: at most one em-dash per paragraph.
      const emDashes = countOccurrences(paragraph, '—');
      emDashesOnPage += emDashes;
      if (emDashes > 1) {
        problems.push(
          `${position}: ${String(emDashes)} em-dashes; the ceiling is 1 (CONTENT-STYLE §17).`,
        );
      }
    }
  }

  for (const field of SINGLE_LINE_PROSE_FIELDS) {
    if (book[field].includes('\n')) {
      problems.push(`${field}: must be a single line — it becomes a <title>/<meta> value.`);
    }
  }

  // §17's second ceiling: 3-4 per PAGE, summed across every prose field of the row.
  if (emDashesOnPage > 4) {
    problems.push(
      `${String(emDashesOnPage)} em-dashes across this book's prose; the page ceiling is 4 ` +
        `(CONTENT-STYLE §17).`,
    );
  }

  return problems;
}

function collectKunyeProblems(book: BookSeed): string[] {
  const problems: string[] = [];
  const label = book.slugTr || '(no slugTr)';

  for (const [field, maxLength] of REQUIRED_STRING_FIELDS) {
    const value = book[field];

    if (value.trim().length === 0) {
      problems.push(
        `${label}: ${field} is empty. It is NOT NULL in the schema and required in the published ` +
          `contract — the database accepts an empty string and the page publishes it.`,
      );
    }
    if (maxLength !== null && [...value].length > maxLength) {
      problems.push(
        `${label}: ${field} is ${String([...value].length)} characters; the column holds ` +
          `${String(maxLength)}. Postgres would refuse it mid-transaction as "value too long".`,
      );
    }
  }

  for (const [field, maxLength] of OPTIONAL_STRING_FIELDS) {
    const value = book[field];

    if (value === null) {
      continue;
    }
    if (value.trim().length === 0) {
      problems.push(
        `${label}: ${field} is an empty string. A value we do not have is \`null\`, never \`''\` — ` +
          `the contract defines the null case and defines no empty-string case.`,
      );
    }
    if ([...value].length > maxLength) {
      problems.push(
        `${label}: ${field} is ${String([...value].length)} characters; the column holds ` +
          `${String(maxLength)}. Postgres would refuse it mid-transaction as "value too long".`,
      );
    }
  }

  if (!YOUTUBE_CHANNEL_ID_PATTERN.test(book.youtubeChannelId)) {
    problems.push(
      `${label}: youtubeChannelId ${JSON.stringify(book.youtubeChannelId)} is not a channel id ` +
        `(UC + 22 characters). It is published on the book detail response, and an RSS feed's ` +
        `yt:channelId drops the UC prefix, so a truncated id is plausible and nothing else ` +
        `would catch it.`,
    );
  }

  for (const [field, value] of [
    ['slugTr', book.slugTr],
    ['slugEn', book.slugEn],
  ] as const) {
    if (!SLUG_PATTERN.test(value)) {
      problems.push(
        `${label}: ${field} ${JSON.stringify(value)} is not a slug — GLOSSARY §5 folds to a-z0-9-.`,
      );
    }
  }

  if (!ISBN13_PATTERN.test(book.isbn13)) {
    problems.push(`${label}: isbn13 ${JSON.stringify(book.isbn13)} is not thirteen digits.`);
  }
  if (!Number.isInteger(book.pageCount) || book.pageCount <= 0) {
    problems.push(`${label}: pageCount must be a positive integer.`);
  }
  if (!Number.isInteger(book.denemeCount) || book.denemeCount <= 0) {
    problems.push(`${label}: denemeCount must be a positive integer.`);
  }
  if (!Number.isInteger(book.displayOrder)) {
    problems.push(`${label}: displayOrder must be an integer.`);
  }

  // The credit is an attribution obligation (`CONVENTIONS.md` §7), so an empty credit is a defect
  // rather than a state — and a BLANK entry is the form the database accepts and we must not.
  if (book.authorNames.length === 0) {
    problems.push(
      `${label}: authorNames is empty. A publisher-authored title is credited the way the book ` +
        `credits it, never as [].`,
    );
  }
  for (const [index, author] of book.authorNames.entries()) {
    if (author.trim() !== author || author.length === 0) {
      problems.push(
        `${label}: authorNames[${String(index)}] is blank or padded ` +
          `(${JSON.stringify(author)}). CHK_books_author_names accepts it; we do not.`,
      );
    }
  }

  if (book.coverImagePath !== null) {
    if (
      !COVER_IMAGE_PATH_PATTERN.test(book.coverImagePath) ||
      book.coverImagePath.startsWith('//')
    ) {
      problems.push(
        `${label}: coverImagePath ${JSON.stringify(book.coverImagePath)} is outside the ` +
          `allowlist. It is a path inside the web repo's public/ — slugify the filename (no ` +
          `Turkish diacritics, no spaces) and never a remote URL.`,
      );
    }
  }

  if (book.purchaseUrl !== null && !book.purchaseUrl.startsWith('https://')) {
    problems.push(
      `${label}: purchaseUrl must be https:// — the value becomes an href on a public page.`,
    );
  }

  return problems;
}

/**
 * Refuses the whole corpus over any structural defect, naming every one of them.
 *
 * Called before the transaction opens (and by `--check`, which never opens one at all), so a
 * defective batch is refused WHOLE with nothing written and nothing to roll back — the
 * `assertCountryEntityInvariants` posture.
 */
export function assertBookSeedInvariants(books: readonly BookSeed[]): void {
  // Playbook §8 refusal 1, in its seed form: an empty corpus fails instead of reporting a green it
  // did not earn.
  if (books.length === 0) {
    throw new BookSeedInvariantError(
      'the book seed corpus is empty — nothing to check, and that is a failure.',
    );
  }

  const problems: string[] = [];
  // Keyed on the row's POSITION, never on its slug. Keying on the slug cannot distinguish "this
  // book's own two slug columns" from "two different books with the same slug" — which is the
  // collision the check exists for, so it would have been a gate that never goes red.
  const seenSlugs = new Map<string, number>();
  const seenIsbns = new Map<string, number>();
  // One map PER prose field, keyed the same way and for the same reason. Unlike the two above,
  // this refusal mirrors NO database constraint: `meta_title_tr` carries no UNIQUE, and it should
  // not — it is an editorial rule (`SEO-POLICY.md` §B10.1/10.2, two indexable pages must not ship
  // one `<title>` or one description), and the book tier has no row ceiling (→ DEC 2026-08-15e).
  // It is the BYTE-level floor and nothing more: the realistic copy-paste failure is skeleton-level
  // (same shape, künye slots swapped), which no exact comparison can see and which a masking
  // comparator over a corpus of one would be speculative generality to build.
  const seenProse = new Map<string, Map<string, number>>(
    PROSE_FIELDS.map((field) => [field, new Map<string, number>()]),
  );

  for (const [index, book] of books.entries()) {
    problems.push(...collectKunyeProblems(book), ...collectProseProblems(book));

    // Both slug columns share one address space in practice: `/kitaplar/{slugTr}` and
    // `/en/books/{slugEn}` are resolved by the same lookup in B3, so a TR slug colliding with
    // another book's EN slug is the same defect as a duplicate. A single book legitimately
    // carrying the same string in both columns is NOT a collision, which is what the index
    // comparison distinguishes.
    for (const slug of [book.slugTr, book.slugEn]) {
      const owner = seenSlugs.get(slug);
      if (owner !== undefined && owner !== index) {
        problems.push(
          `slug ${JSON.stringify(slug)} is claimed by two books (rows ${String(owner + 1)} and ` +
            `${String(index + 1)}).`,
        );
      } else if (owner === undefined) {
        seenSlugs.set(slug, index);
      }
    }

    const isbnOwner = seenIsbns.get(book.isbn13);
    if (isbnOwner !== undefined) {
      problems.push(
        `isbn13 ${book.isbn13} is claimed by rows ${String(isbnOwner + 1)} and ` +
          `${String(index + 1)}.`,
      );
    } else {
      seenIsbns.set(book.isbn13, index);
    }

    for (const field of PROSE_FIELDS) {
      const seen = seenProse.get(field);
      if (seen === undefined) {
        continue;
      }
      const proseOwner = seen.get(book[field]);
      if (proseOwner !== undefined) {
        problems.push(
          `${field} is byte-identical on rows ${String(proseOwner + 1)} and ` +
            `${String(index + 1)}. Two indexable book pages must not ship one ${field} ` +
            `(SEO-POLICY §B10) — write the second book's text, do not copy the first's.`,
        );
      } else {
        seen.set(book[field], index);
      }
    }
  }

  if (problems.length > 0) {
    throw new BookSeedInvariantError(
      `the book seed corpus is not seedable:\n  ${problems.join('\n  ')}`,
    );
  }
}

/**
 * The artefact↔künye join — the check `1786752000000-InitBookCatalogue.ts` hands to B2 by name.
 *
 * `book_videos.deneme_no <= books.deneme_count` cannot be a CHECK (a CHECK sees one row of one
 * table) and does not justify a trigger. Both numbers are hand-read from the same künye, so a
 * disagreement means one of the two readings is wrong — and the failure it prevents is a page
 * offering "deneme 41" of a forty-deneme book, which no structural test would catch.
 */
export function assertArtifactMatchesBook(book: BookSeed, artifact: BookTimestampsArtifact): void {
  const problems: string[] = [];

  // Playbook §8 refusal 1 on the INJECTED path. `parseBookTimestampsArtifact` refuses an empty
  // artefact by schema, but `seedBooks(ds, { artifact })` bypasses the parser entirely, and an
  // empty artefact down that seam means "every deneme is stale": the whole index is deleted and
  // the run reports it as a successful removal. B3 drives that seam with fixtures, so the refusal
  // lives here, where BOTH paths reach it.
  if (artifact.videos.length === 0) {
    problems.push(
      'the artefact carries no videos at all — nothing to seed, and that is a failure.',
    );
  }

  for (const video of artifact.videos) {
    if (video.denemeNo > book.denemeCount) {
      problems.push(
        `deneme ${String(video.denemeNo)} is greater than the book's denemeCount ` +
          `(${String(book.denemeCount)}). One of the two readings of the künye is wrong.`,
      );
    }
  }

  // Unreachable on a PARSED artefact and deliberately kept: refusal 3 makes `deneme` unique and
  // the loop above bounds each one by `denemeCount`, so at most `denemeCount` distinct values can
  // exist. What it still guards is the injected seam, where no uniqueness refusal ran — which is
  // also why its spec case has to construct a duplicate deneme the parser would refuse.
  if (artifact.videos.length > book.denemeCount) {
    problems.push(
      `${String(artifact.videos.length)} videos for a book with ${String(book.denemeCount)} ` +
        `denemeler — coverage cannot exceed the book.`,
    );
  }

  if (problems.length > 0) {
    throw new BookSeedInvariantError(
      `the question index does not fit ${book.slugTr}:\n  ${problems.join('\n  ')}`,
    );
  }
}

/** What a corpus reduces to once every refusal has passed. */
export interface ValidatedBookSeedCorpus {
  readonly books: readonly BookSeed[];
  readonly artifact: BookTimestampsArtifact;
  /** The row the question index belongs to — resolved here so no caller re-derives it. */
  readonly owner: BookSeed;
}

export interface ValidateBookSeedCorpusOptions {
  /** Defaults to the committed corpus. */
  books?: readonly BookSeed[];
  /** Defaults to reading, hash-checking and floor-checking the committed artefact. */
  artifact?: BookTimestampsArtifact;
  /** Which book the artefact belongs to. */
  ownerSlugTr?: string;
}

/**
 * EVERY refusal that stands between an input and the database, in one place.
 *
 * ## Why this is one exported function and not two call sites that "do the same thing"
 * They did not do the same thing. `--check` used to run the corpus invariants and the artefact
 * read, while the write path additionally ran the owner-existence refusal and
 * {@link assertArtifactMatchesBook} — so a künye whose `denemeCount` disagreed with the artefact
 * passed `--check` with exit 0 and was refused by the write, and three documents claimed the
 * opposite (PR #109 review, `CODE109-I1` = `TA109-I2` = `SFH109-I1`; measured at `denemeCount=25`).
 * The two lists were hand-duplicated, which is how they could diverge at all. One list cannot.
 *
 * Nothing here opens a connection, imports an entity or touches TypeORM — which is what makes
 * "`--check` needs no database" a structural property of this module rather than a promise in a
 * comment. Adding a refusal here adds it to both paths by construction.
 *
 * The floor and the hash pin apply to the COMMITTED artefact only. An injected artefact is a
 * caller's fixture (B3's e2e drives insert/update/no-op/remove through it), and its size and bytes
 * are the caller's business — but every CROSS-ROW refusal in this module still binds it.
 */
export async function validateBookSeedCorpus(
  options: ValidateBookSeedCorpusOptions = {},
): Promise<ValidatedBookSeedCorpus> {
  const books = options.books ?? SEED_BOOKS;
  const ownerSlugTr = options.ownerSlugTr ?? BOOK_TIMESTAMPS_OWNER_SLUG_TR;

  assertBookSeedInvariants(books);

  let artifact: BookTimestampsArtifact;
  if (options.artifact === undefined) {
    artifact = await readBookTimestampsArtifact();
    assertArtifactMeetsCoverageFloor(artifact);
  } else {
    artifact = options.artifact;
  }

  const owner = books.find((book) => book.slugTr === ownerSlugTr);
  if (owner === undefined) {
    throw new BookSeedInvariantError(
      `the question index belongs to ${ownerSlugTr}, which is not in the seed corpus. The artefact ` +
        `and the künye row land together or not at all.`,
    );
  }

  assertArtifactMatchesBook(owner, artifact);

  return { books, artifact, owner };
}

/**
 * Non-fatal editorial notes — the `SEO-POLICY.md` length bands, which are notes BY RULE.
 *
 * Printed by the seed CLI on every run so an out-of-band string is seen by whoever edits it, and
 * never returned as a failure: A1's 25–60 and A2's 110–165 are editorial defaults, not Google
 * limits (§0.2), and SPEC §5.1 refuses to write them as constraints for exactly that reason.
 */
export function collectBookSeedNotes(books: readonly BookSeed[]): string[] {
  const notes: string[] = [];

  for (const book of books) {
    const titleLength = [...book.metaTitleTr].length;
    if (titleLength < 25 || titleLength > 60) {
      notes.push(
        `${book.slugTr}: metaTitleTr is ${String(titleLength)} characters, outside the A1 ` +
          `editorial band of 25-60. Not a failure — a truncation-risk note.`,
      );
    }

    const descriptionLength = [...book.metaDescriptionTr].length;
    if (descriptionLength < 110 || descriptionLength > 165) {
      notes.push(
        `${book.slugTr}: metaDescriptionTr is ${String(descriptionLength)} characters, outside ` +
          `the A2 editorial band of 110-165. Not a failure — a truncation-risk note.`,
      );
    }
  }

  return notes;
}
