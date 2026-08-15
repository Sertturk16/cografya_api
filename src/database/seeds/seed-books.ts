import { In, type DataSource, type EntityManager } from 'typeorm';
import { BookVideoQuestion } from '../../book/entities/book-video-question.entity';
import { BookVideo } from '../../book/entities/book-video.entity';
import { Book } from '../../book/entities/book.entity';
import { BookSeedInvariantError, validateBookSeedCorpus } from './book-seed-invariants';
import type { BookTimestampsArtifact } from './book-timestamps.artifact';
import type { BookSeed } from './books.seed-data';

/**
 * `pnpm db:seed:books` — the offline, deterministic, idempotent write phase (SPEC §7, PR B2).
 *
 * ## Two-phase discipline, and which phase this is
 * Playbook §5 splits external data into a hand-run `fetch`/`probe` that touches the network and an
 * offline `load` that reads only committed artefacts. This is a `load`, and it is the whole of this
 * leg: the measuring phase was DEC 2026-08-12p's manual round, whose output is the committed
 * artefact. Nothing here opens a socket, so this seed cannot fail because a provider is down.
 *
 * ## Idempotent PER ROW, and why that is a correctness property rather than a nicety
 * A row that already equals the seed is left completely untouched — no `UPDATE`, so
 * `@UpdateDateColumn` does not move. `Book.updatedAt` feeds `dateModified` and the sitemap's
 * `lastmod` (`SEO-POLICY.md` §B5 5.9, §B6 6.9), so a seed that rewrote identical values would tell
 * search engines the book page changed every time somebody ran it. Writes go through the repository
 * precisely so the timestamp moves exactly when a value genuinely changed; raw SQL would have made
 * it a thing to remember.
 *
 * **The converse is B3's, and it is stated here so B3 does not have to guess.** A re-measurement
 * that shifts 180 start seconds updates 180 `book_video_questions` rows and leaves `books.updated_at
 * ` untouched — the page's visible index changed while `Book.updatedAt` says it did not. This seed
 * deliberately does NOT touch the book row for that (writing a row whose own columns did not change
 * is the very lie the paragraph above prevents, and it would move `dateModified` for a book-row
 * edit that never happened). Instead **B3 derives `dateModified` and sitemap `lastmod` as
 * `GREATEST(books.updated_at, MAX(book_videos.updated_at), MAX(book_video_questions.updated_at))`**
 * — both child tables carry `@UpdateDateColumn`, so the value exists; it just has to be read.
 *
 * ## All-or-nothing
 * Every validation runs BEFORE the transaction opens, and the writes are one transaction. A
 * violation anywhere means nothing is written at all rather than a half-seeded book — SPEC §7.2's
 * "tek bir ihlalde hiçbir şey yazmaz", and the same posture as the ERA5 load phase.
 *
 * ## What this seed will DELETE, and what it will never delete
 * Within the book the artefact belongs to, a `book_videos` row whose deneme is no longer in the
 * artefact is removed (its questions follow by `ON DELETE CASCADE`), and so is a question whose
 * number is gone. Leaving them would publish a deneme we no longer have measurements for. It never
 * deletes a `books` row, including one absent from {@link SEED_BOOKS}: the seed owns the rows it
 * declares, not the table.
 */

/** Per-table outcome. `removed` exists only where this seed is allowed to delete. */
export interface SeedBooksTableResult {
  inserted: number;
  updated: number;
  /** Rows already matching the seed exactly — left untouched, so `updated_at` did not move. */
  unchanged: number;
  removed: number;
}

export interface SeedBooksResult {
  books: Omit<SeedBooksTableResult, 'removed'>;
  videos: SeedBooksTableResult;
  questions: SeedBooksTableResult;
}

export interface SeedBooksOptions {
  /** Defaults to the committed corpus. The e2e suite passes synthetic rows through this same path. */
  books?: readonly BookSeed[];
  /**
   * Defaults to reading, hash-checking and floor-checking the committed artefact.
   *
   * **What an injected artefact SKIPS, stated so a fixture author knows what they own:** the
   * SHA-256 pin, the coverage floor, and the four cross-row refusals that live in
   * `assertArtifactIsSeedable` — uniqueness of `denemeNo` and `youtubeVideoId`, strictly ascending
   * seconds, and the tag/position witness. Those run inside `parseBookTimestampsArtifact`, which
   * only the file-reading path calls. What an injected artefact does NOT skip is
   * `assertArtifactMatchesBook`, including its emptiness refusal — the destructive half.
   */
  artifact?: BookTimestampsArtifact;
  /** Which book the artefact belongs to. */
  ownerSlugTr?: string;
  /**
   * Authorises the run to DELETE published rows. Default `false`, and the default is the point.
   *
   * A run that removes 27 of 30 denemeler prints its counts and would otherwise exit 0 — the same
   * exit code as a run that changed nothing, while playbook §8 makes the exit code what a run is
   * judged by. So a removal is an operator DECISION (`--allow-removals`) rather than a number in a
   * log line: the seed refuses and names every row it was about to delete, and the whole
   * transaction rolls back. Re-running with the flag is cheap; a deleted deneme index is not.
   */
  allowRemovals?: boolean;
}

/** Element-wise, ORDER-SENSITIVE: `authorNames` is a published render order (playbook §5). */
function stringArraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * One comparison per seeded column — and the RECORD TYPE is the gate.
 *
 * ## Why this is a keyed record and not the chain of `&&`s it replaces
 * It was that chain, and the docblock argued that "adding a field to `BookSeed` and forgetting it
 * here shows up as a line that is not there". PR #72 falsified exactly that reasoning in this repo:
 * two coast labels were missing from a hand-written comparison list, and the stale text shipped
 * with the gate, the e2e suite and CI all green (`marine-assertions.ts:576` carries the fix and the
 * note "adding the two missing names fixed that INSTANCE; it did not fix the CLASS"). The failure
 * is invisible in exactly the way that matters: a field omitted HERE makes a later correction to
 * that column report `unchanged` for ever, `Book.updatedAt` correctly does not move, and nothing
 * anywhere signals that the seed and the database disagree.
 *
 * `{ [K in keyof BookSeed]: … }` is the same compile-time gate marine's
 * `AssertNever<Exclude<keyof T, …>>` provides, in the form this comparison can actually use: the
 * marine gate guards a list of NAMES that is then iterated generically, while these comparisons are
 * per-field and heterogeneous (`authorNames` is order-sensitive, everything else is `===`). A
 * mapped type demands one entry per key and refuses a key that is not one — omit a field and the
 * build fails naming it, add a stray one and it fails naming that.
 */
const BOOK_FIELD_MATCHERS: { [K in keyof BookSeed]: (row: Book, seed: BookSeed) => boolean } = {
  slugTr: (row, seed) => row.slugTr === seed.slugTr,
  slugEn: (row, seed) => row.slugEn === seed.slugEn,
  titleTr: (row, seed) => row.titleTr === seed.titleTr,
  titleEn: (row, seed) => row.titleEn === seed.titleEn,
  publisherName: (row, seed) => row.publisherName === seed.publisherName,
  authorNames: (row, seed) => stringArraysEqual(row.authorNames, seed.authorNames),
  isbn13: (row, seed) => row.isbn13 === seed.isbn13,
  pageCount: (row, seed) => row.pageCount === seed.pageCount,
  examTrack: (row, seed) => row.examTrack === seed.examTrack,
  denemeCount: (row, seed) => row.denemeCount === seed.denemeCount,
  coverImagePath: (row, seed) => row.coverImagePath === seed.coverImagePath,
  purchaseUrl: (row, seed) => row.purchaseUrl === seed.purchaseUrl,
  introTr: (row, seed) => row.introTr === seed.introTr,
  introEn: (row, seed) => row.introEn === seed.introEn,
  metaTitleTr: (row, seed) => row.metaTitleTr === seed.metaTitleTr,
  metaDescriptionTr: (row, seed) => row.metaDescriptionTr === seed.metaDescriptionTr,
  youtubePlaylistId: (row, seed) => row.youtubePlaylistId === seed.youtubePlaylistId,
  youtubeChannelId: (row, seed) => row.youtubeChannelId === seed.youtubeChannelId,
  displayOrder: (row, seed) => row.displayOrder === seed.displayOrder,
};

/**
 * True when the stored row already equals the seed across every seeded column.
 *
 * `id`, `createdAt` and `updatedAt` are the database's, not the seed's — they are absent from
 * `BookSeed`, so the mapped type above cannot admit them.
 */
function rowMatchesSeed(row: Book, seed: BookSeed): boolean {
  return Object.values(BOOK_FIELD_MATCHERS).every((matches) => matches(row, seed));
}

/**
 * The seed's own view of a book row, with the array copied out of its readonly form.
 *
 * The return type is the OTHER half of the gate, and it guards the worse failure: a field present
 * in {@link BOOK_FIELD_MATCHERS} but missing here is not `undefined` (no `BookSeed` field is
 * optional), so `merge` does not skip it — the column is simply absent from the UPDATE,
 * `rowMatchesSeed` returns false on every subsequent run, `save` fires every run,
 * `@UpdateDateColumn` moves every run, and the seed never converges. `Book.updatedAt` feeds
 * `dateModified` and sitemap `lastmod`, so every `pnpm db:seed:books` would tell search engines the
 * page changed when it did not. `Required<Pick<…>>` makes an omitted key a compile error instead of
 * a legal `Partial`.
 */
function toEntityShape(seed: BookSeed): Required<Pick<Book, keyof BookSeed>> {
  return {
    slugTr: seed.slugTr,
    slugEn: seed.slugEn,
    titleTr: seed.titleTr,
    titleEn: seed.titleEn,
    publisherName: seed.publisherName,
    authorNames: [...seed.authorNames],
    isbn13: seed.isbn13,
    pageCount: seed.pageCount,
    examTrack: seed.examTrack,
    denemeCount: seed.denemeCount,
    coverImagePath: seed.coverImagePath,
    purchaseUrl: seed.purchaseUrl,
    introTr: seed.introTr,
    introEn: seed.introEn,
    metaTitleTr: seed.metaTitleTr,
    metaDescriptionTr: seed.metaDescriptionTr,
    youtubePlaylistId: seed.youtubePlaylistId,
    youtubeChannelId: seed.youtubeChannelId,
    displayOrder: seed.displayOrder,
  };
}

async function seedBookRow(
  manager: EntityManager,
  seed: BookSeed,
  result: SeedBooksResult,
): Promise<Book> {
  const repo = manager.getRepository(Book);
  // Keyed on `slug_tr`: unique, permanent (changing it would create a redirect debt) and the same
  // key the public route resolves on.
  const existing = await repo.findOne({ where: { slugTr: seed.slugTr } });

  if (existing === null) {
    const saved = await repo.save(repo.create(toEntityShape(seed)));
    result.books.inserted += 1;
    return saved;
  }

  if (rowMatchesSeed(existing, seed)) {
    result.books.unchanged += 1;
    return existing;
  }

  repo.merge(existing, toEntityShape(seed));
  const saved = await repo.save(existing);
  result.books.updated += 1;
  return saved;
}

/** The message every removal refusal shares, so the operator reads one instruction. */
function removalRefusal(detail: string): BookSeedInvariantError {
  return new BookSeedInvariantError(
    `${detail}\nThis run would DELETE published rows, and a deletion is an operator decision, ` +
      `never a side effect of re-running a seed. Nothing was written — the whole transaction ` +
      `rolled back. If the removal is intended, re-run with:\n  pnpm db:seed:books --allow-removals`,
  );
}

async function seedQuestionRows(
  manager: EntityManager,
  videoRow: BookVideo,
  questions: BookTimestampsArtifact['videos'][number]['questions'],
  result: SeedBooksResult,
  allowRemovals: boolean,
): Promise<void> {
  const repo = manager.getRepository(BookVideoQuestion);
  const existing = await repo.find({ where: { bookVideoId: videoRow.id } });
  const existingByNumber = new Map(existing.map((row) => [row.questionNo, row]));
  const seededNumbers = new Set(questions.map((question) => question.questionNo));

  // Removals first: a question number the artefact no longer carries would keep occupying its
  // `(video, question_no)` slot and keep appearing in the index.
  const staleQuestions = existing.filter((row) => !seededNumbers.has(row.questionNo));

  if (staleQuestions.length > 0 && !allowRemovals) {
    throw removalRefusal(
      `deneme ${String(videoRow.denemeNo)}: the artefact no longer carries question(s) ` +
        `${staleQuestions.map((row) => String(row.questionNo)).join(', ')}.`,
    );
  }

  for (const row of staleQuestions) {
    await repo.remove(row);
    result.questions.removed += 1;
  }

  for (const question of questions) {
    const row = existingByNumber.get(question.questionNo);

    if (row === undefined) {
      await repo.save(
        repo.create({
          bookVideoId: videoRow.id,
          questionNo: question.questionNo,
          startSecond: question.startSecond,
        }),
      );
      result.questions.inserted += 1;
      continue;
    }

    if (row.startSecond === question.startSecond) {
      result.questions.unchanged += 1;
      continue;
    }

    row.startSecond = question.startSecond;
    await repo.save(row);
    result.questions.updated += 1;
  }
}

/**
 * A temporary `youtube_video_id`, exactly 11 characters of `CHK_book_videos_youtube_video_id`'s
 * alphabet — see {@link seedVideoRows} for why a parking value exists at all.
 */
function parkedVideoId(index: number): string {
  return `__park${String(index + 1).padStart(5, '0')}`;
}

async function seedVideoRows(
  manager: EntityManager,
  bookRow: Book,
  artifact: BookTimestampsArtifact,
  result: SeedBooksResult,
  allowRemovals: boolean,
): Promise<void> {
  const repo = manager.getRepository(BookVideo);
  const existing = await repo.find({ where: { bookId: bookRow.id } });
  const seededDenemeler = new Set(artifact.videos.map((video) => video.denemeNo));

  // Removals first, and inside the same transaction. A deneme dropped from the artefact must not
  // linger — it would keep publishing start seconds nobody re-measured, and it would keep holding
  // its `(book_id, deneme_no)` slot against a replacement. `ON DELETE CASCADE` takes its questions.
  const staleVideos = existing.filter((row) => !seededDenemeler.has(row.denemeNo));

  if (staleVideos.length > 0 && !allowRemovals) {
    const cascading = await manager
      .getRepository(BookVideoQuestion)
      .count({ where: { bookVideoId: In(staleVideos.map((row) => row.id)) } });

    throw removalRefusal(
      `the artefact no longer carries deneme(s) ` +
        `${staleVideos.map((row) => String(row.denemeNo)).join(', ')} — ` +
        `${String(staleVideos.length)} video row(s), taking ${String(cascading)} question row(s) ` +
        `with them by ON DELETE CASCADE.`,
    );
  }

  for (const row of staleVideos) {
    const cascaded = await manager
      .getRepository(BookVideoQuestion)
      .count({ where: { bookVideoId: row.id } });
    await repo.remove(row);
    result.videos.removed += 1;
    result.questions.removed += cascaded;
  }

  const surviving = existing.filter((row) => seededDenemeler.has(row.denemeNo));
  const existingByDeneme = new Map(surviving.map((row) => [row.denemeNo, row]));

  // ── Free the OTHER unique slot, the one the removal pass above does not touch ──
  // `book_videos` carries two unique constraints and the same reasoning covers both:
  // `UQ_book_videos_book_deneme`, freed above, and `UQ_book_videos_youtube_video_id`, which is
  // GLOBAL across the table rather than scoped to a book. A re-measurement that moves a video to a
  // different deneme (SPEC §17 R2 keeps hand correction open, and deneme number and playlist
  // position already diverge) leaves both denemeler in the artefact, so nothing is removed — and
  // the update loop below then assigns an id another surviving row still holds. Postgres raises the
  // unique violation, the transaction rolls back, and it does so on EVERY run: the seed's stated
  // idempotency does not hold for that input, and the only recovery is hand-written SQL against the
  // live table. Which direction the move goes decides whether it happens, so it can be tested once
  // and believed correct (PR #109 review, `SFH109-I2` = `CODE109-M8`).
  //
  // Parking rather than deleting: a moved video loses nothing, so deleting its row would churn its
  // question rows through a cascade, reset their `created_at`, and — worse — make a run that
  // removes nothing trip the `--allow-removals` refusal. Every parked row is guaranteed to be
  // rewritten before the transaction commits, because a surviving row's deneme is by definition
  // still in the artefact and the loop below assigns it its incoming id.
  //
  // Out of scope by measurement, not by oversight: a video id held by ANOTHER book cannot be parked
  // from here (this candidate set is scoped to one book), and it is a different defect — two books
  // claiming one video, which the global constraint exists to refuse. It surfaces as a named
  // constraint violation inside the per-book wrapper below.
  const incomingDenemeByVideoId = new Map(
    artifact.videos.map((video) => [video.youtubeVideoId, video.denemeNo]),
  );
  const movers = surviving.filter((row) => {
    const incomingDeneme = incomingDenemeByVideoId.get(row.youtubeVideoId);
    return incomingDeneme !== undefined && incomingDeneme !== row.denemeNo;
  });

  if (movers.length > 0) {
    const parkIds = movers.map((_row, index) => parkedVideoId(index));
    const alreadyHeld = await repo.count({ where: { youtubeVideoId: In(parkIds) } });
    if (alreadyHeld > 0) {
      throw new BookSeedInvariantError(
        `cannot re-key ${String(movers.length)} video(s): a row already holds a parking id ` +
          `(${parkIds.join(', ')}). Those ids are reserved and never seeded, so a row holding one ` +
          `is left over from an interrupted run and must be inspected before re-seeding.`,
      );
    }

    for (const [index, row] of movers.entries()) {
      row.youtubeVideoId = parkedVideoId(index);
      await repo.save(row);
    }
  }

  for (const video of artifact.videos) {
    const row = existingByDeneme.get(video.denemeNo);

    if (row === undefined) {
      const saved = await repo.save(
        repo.create({
          bookId: bookRow.id,
          denemeNo: video.denemeNo,
          youtubeVideoId: video.youtubeVideoId,
        }),
      );
      result.videos.inserted += 1;
      await seedQuestionRows(manager, saved, video.questions, result, allowRemovals);
      continue;
    }

    if (row.youtubeVideoId === video.youtubeVideoId) {
      result.videos.unchanged += 1;
    } else {
      row.youtubeVideoId = video.youtubeVideoId;
      await repo.save(row);
      result.videos.updated += 1;
    }

    await seedQuestionRows(manager, row, video.questions, result, allowRemovals);
  }
}

/**
 * Seeds the book catalogue and its question index.
 *
 * The parameters exist for the same reason `seedWorld` takes its corpus: the e2e suite (B3) drives
 * the real insert/update/no-op/remove paths with synthetic fixtures, so no real künye fact or
 * measured second is ever hardcoded into a test.
 */
export async function seedBooks(
  dataSource: DataSource,
  options: SeedBooksOptions = {},
): Promise<SeedBooksResult> {
  // Everything that can refuse the run happens here — before a connection is used for anything —
  // so a defective corpus costs no database round trip and fails naming the rule rather than
  // surfacing later as a constraint violation. It is the SAME function `--check` runs, which is
  // the whole point: the two lists cannot diverge if there is one list.
  const { books, artifact, owner } = await validateBookSeedCorpus(options);
  const allowRemovals = options.allowRemovals ?? false;

  const result: SeedBooksResult = {
    books: { inserted: 0, updated: 0, unchanged: 0 },
    videos: { inserted: 0, updated: 0, unchanged: 0, removed: 0 },
    questions: { inserted: 0, updated: 0, unchanged: 0, removed: 0 },
  };

  await dataSource.transaction(async (manager) => {
    for (const seed of books) {
      try {
        const bookRow = await seedBookRow(manager, seed, result);
        if (seed.slugTr === owner.slugTr) {
          await seedVideoRows(manager, bookRow, artifact, result, allowRemovals);
        }
      } catch (cause: unknown) {
        // Name the offending row: a failure mid-batch (a constraint violation, say) is otherwise
        // diagnosable only from the SQL. The transaction still rolls the WHOLE run back.
        throw new Error(`Seeding book [${seed.slugTr}] failed — see cause.`, { cause });
      }
    }
  });

  return result;
}
