import type { DataSource, EntityManager } from 'typeorm';
import { BookVideoQuestion } from '../../book/entities/book-video-question.entity';
import { BookVideo } from '../../book/entities/book-video.entity';
import { Book } from '../../book/entities/book.entity';
import {
  assertArtifactMatchesBook,
  assertBookSeedInvariants,
  BookSeedInvariantError,
} from './book-seed-invariants';
import {
  readBookTimestampsArtifact,
  type BookTimestampsArtifact,
} from './book-timestamps.artifact';
import { BOOK_TIMESTAMPS_OWNER_SLUG_TR, SEED_BOOKS, type BookSeed } from './books.seed-data';

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
  /** Defaults to reading (and hash-checking) the committed artefact. */
  artifact?: BookTimestampsArtifact;
  /** Which book the artefact belongs to. */
  ownerSlugTr?: string;
}

/** Element-wise, ORDER-SENSITIVE: `authorNames` is a published render order (playbook §5). */
function stringArraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * True when the stored row already equals the seed across every seeded column.
 *
 * Exhaustive rather than a hash, and deliberately so (the `seed-world.ts` discipline): it must be
 * obvious which columns participate, so adding a field to {@link BookSeed} and forgetting it here
 * shows up as a line that is not there. `id`, `createdAt` and `updatedAt` are the database's, not
 * the seed's.
 */
function rowMatchesSeed(row: Book, seed: BookSeed): boolean {
  return (
    row.slugTr === seed.slugTr &&
    row.slugEn === seed.slugEn &&
    row.titleTr === seed.titleTr &&
    row.titleEn === seed.titleEn &&
    row.publisherName === seed.publisherName &&
    stringArraysEqual(row.authorNames, seed.authorNames) &&
    row.isbn13 === seed.isbn13 &&
    row.pageCount === seed.pageCount &&
    row.examTrack === seed.examTrack &&
    row.denemeCount === seed.denemeCount &&
    row.coverImagePath === seed.coverImagePath &&
    row.purchaseUrl === seed.purchaseUrl &&
    row.introTr === seed.introTr &&
    row.introEn === seed.introEn &&
    row.metaTitleTr === seed.metaTitleTr &&
    row.metaDescriptionTr === seed.metaDescriptionTr &&
    row.youtubePlaylistId === seed.youtubePlaylistId &&
    row.youtubeChannelId === seed.youtubeChannelId &&
    row.displayOrder === seed.displayOrder
  );
}

/** The seed's own view of a book row, with the array copied out of its readonly form. */
function toEntityShape(seed: BookSeed): Partial<Book> {
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

async function seedQuestionRows(
  manager: EntityManager,
  videoRow: BookVideo,
  questions: BookTimestampsArtifact['videos'][number]['questions'],
  result: SeedBooksResult,
): Promise<void> {
  const repo = manager.getRepository(BookVideoQuestion);
  const existing = await repo.find({ where: { bookVideoId: videoRow.id } });
  const existingByNumber = new Map(existing.map((row) => [row.questionNo, row]));
  const seededNumbers = new Set(questions.map((question) => question.questionNo));

  // Removals first: a question number the artefact no longer carries would keep occupying its
  // `(video, question_no)` slot and keep appearing in the index.
  for (const row of existing) {
    if (!seededNumbers.has(row.questionNo)) {
      await repo.remove(row);
      result.questions.removed += 1;
    }
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

async function seedVideoRows(
  manager: EntityManager,
  bookRow: Book,
  artifact: BookTimestampsArtifact,
  result: SeedBooksResult,
): Promise<void> {
  const repo = manager.getRepository(BookVideo);
  const existing = await repo.find({ where: { bookId: bookRow.id } });
  const existingByDeneme = new Map(existing.map((row) => [row.denemeNo, row]));
  const seededDenemeler = new Set(artifact.videos.map((video) => video.denemeNo));

  // Removals first, and inside the same transaction. A deneme dropped from the artefact must not
  // linger — it would keep publishing start seconds nobody re-measured, and it would keep holding
  // its `(book_id, deneme_no)` slot against a replacement. `ON DELETE CASCADE` takes its questions.
  for (const row of existing) {
    if (!seededDenemeler.has(row.denemeNo)) {
      const cascaded = await manager
        .getRepository(BookVideoQuestion)
        .count({ where: { bookVideoId: row.id } });
      await repo.remove(row);
      result.videos.removed += 1;
      result.questions.removed += cascaded;
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
      await seedQuestionRows(manager, saved, video.questions, result);
      continue;
    }

    if (row.youtubeVideoId === video.youtubeVideoId) {
      result.videos.unchanged += 1;
    } else {
      row.youtubeVideoId = video.youtubeVideoId;
      await repo.save(row);
      result.videos.updated += 1;
    }

    await seedQuestionRows(manager, row, video.questions, result);
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
  const books = options.books ?? SEED_BOOKS;
  const ownerSlugTr = options.ownerSlugTr ?? BOOK_TIMESTAMPS_OWNER_SLUG_TR;

  // Everything that can refuse the run happens here — before a connection is used for anything —
  // so a defective corpus costs no database round trip and fails naming the rule rather than
  // surfacing later as a constraint violation.
  assertBookSeedInvariants(books);

  const artifact = options.artifact ?? (await readBookTimestampsArtifact());
  const owner = books.find((book) => book.slugTr === ownerSlugTr);
  if (owner === undefined) {
    throw new BookSeedInvariantError(
      `the question index belongs to ${ownerSlugTr}, which is not in the seed corpus. The artefact ` +
        `and the künye row land together or not at all.`,
    );
  }
  assertArtifactMatchesBook(owner, artifact);

  const result: SeedBooksResult = {
    books: { inserted: 0, updated: 0, unchanged: 0 },
    videos: { inserted: 0, updated: 0, unchanged: 0, removed: 0 },
    questions: { inserted: 0, updated: 0, unchanged: 0, removed: 0 },
  };

  await dataSource.transaction(async (manager) => {
    for (const seed of books) {
      try {
        const bookRow = await seedBookRow(manager, seed, result);
        if (seed.slugTr === ownerSlugTr) {
          await seedVideoRows(manager, bookRow, artifact, result);
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
