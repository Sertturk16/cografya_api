import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { buildBookAttribution } from './book-attribution.catalogue';
import { BookVideoQuestion } from './entities/book-video-question.entity';
import { BookVideo } from './entities/book-video.entity';
import { Book } from './entities/book.entity';
import type { BookDetailDto } from './dto/book-detail.dto';
import type { BookListItemDto } from './dto/book-list-item.dto';
import type { BookListQueryDto } from './dto/book-list-query.dto';
import type { BookListDto } from './dto/book-list.dto';
import type { BookVideoDto } from './dto/book-video.dto';

/**
 * Per-book aggregates, as they come back from the grouped query.
 *
 * `COUNT` arrives as a STRING and `MAX(timestamptz)` as `Date | null`, and both are stated in the
 * type rather than discovered at runtime: pg returns `bigint` as a string to avoid a lossy
 * conversion through a JS number, so a `videoCount` handed to the DTO unconverted would serialise
 * as `"30"` and satisfy every structural test that only checks presence.
 */
interface BookStatsRow {
  bookId: string;
  videoCount: string;
  questionCount: string;
  videosUpdatedAt: Date | null;
  questionsUpdatedAt: Date | null;
}

/** The same aggregates after conversion — what the mappers actually read. */
interface BookStats {
  videoCount: number;
  questionCount: number;
  /** Newest child-row timestamp, or null when the book has no videos yet. */
  childrenUpdatedAt: Date | null;
}

/** A book with no videos produces no aggregate row at all; this is that book's stats. */
const EMPTY_STATS: BookStats = { videoCount: 0, questionCount: 0, childrenUpdatedAt: null };

/**
 * The published `dateModified` / sitemap `lastmod` value for one book.
 *
 * **`GREATEST(books.updated_at, MAX(book_videos.updated_at), MAX(book_video_questions.updated_at))`,
 * and the widening is the point.** `Book.updatedAt` alone is wrong here, and B2 designed it that
 * way on purpose: a re-measurement that shifts 180 start seconds updates the child rows and
 * deliberately does NOT touch the book row, because writing a row whose own columns did not change
 * is the exact lie the seed's row-level idempotency exists to prevent. Reading only the book row
 * would therefore tell search engines the page had not changed on the day its whole question index
 * did (`SEO-POLICY.md` §B5 5.9, §B6 6.9 — build time is refused by name).
 *
 * Exported for direct unit testing of the null-collapse branch, the `computePopulationDensity`
 * precedent.
 */
export function latestUpdatedAt(bookUpdatedAt: Date, childrenUpdatedAt: Date | null): Date {
  if (childrenUpdatedAt === null) {
    return bookUpdatedAt;
  }
  return childrenUpdatedAt > bookUpdatedAt ? childrenUpdatedAt : bookUpdatedAt;
}

/**
 * The two public book reads — `/kitaplar` hub and `/kitaplar/{slug}` detail.
 *
 * ## Postgres and nothing else
 * Neither path opens a socket (`ENGINEERING.md` §3.5). The provider-sourced half of the contract
 * lives in `youtube_video_snapshots` and is not read here at all: **B3 serves `youtube: null` on
 * every video**, which is the designed normal path rather than a gap (`DEC 2026-08-15h` item 2).
 * B4 adds the serving path with its own age thresholds; the page is complete without it, and that
 * was B1's whole thesis.
 *
 * ## No TypeORM relations, and that is deliberate
 * The three entities carry plain `uuid` columns and no `@ManyToOne`/`@OneToMany` — the foreign keys
 * live in hand-authored migration SQL. So the detail path reads three queries and joins in memory
 * instead of using `relations:`. Adding relation decorators to reach for `relations:` would risk
 * `migration:generate` proposing to rebuild an existing FK under its own generated name, which is a
 * schema change this read-only PR has no business making.
 */
@Injectable()
export class BookService {
  constructor(
    @InjectRepository(Book)
    private readonly books: Repository<Book>,
    @InjectRepository(BookVideo)
    private readonly videos: Repository<BookVideo>,
    @InjectRepository(BookVideoQuestion)
    private readonly questions: Repository<BookVideoQuestion>,
  ) {}

  /**
   * One page of books for the hub.
   *
   * **Ordered by `display_order`, tie-broken by `slug_tr`, and the tie-break is load-bearing.**
   * `display_order` is hand-assigned and may repeat; offset pagination over a partial order can
   * serve the same row on two pages and skip another entirely. `slug_tr` carries a UNIQUE
   * constraint, which is what makes the ordering TOTAL rather than merely intended.
   */
  async findAll(query: BookListQueryDto): Promise<BookListDto> {
    const [rows, total] = await this.books.findAndCount({
      order: { displayOrder: 'ASC', slugTr: 'ASC' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    const stats = await this.loadStats(rows.map((row) => row.id));

    return {
      items: rows.map((row) => this.toListItem(row, stats.get(row.id) ?? EMPTY_STATS)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      // A page past the end is an empty `items` with `hasMore: false` and a 200 — never a 404.
      hasMore: query.page * query.pageSize < total,
    };
  }

  /**
   * One book by either slug, with its whole question index.
   *
   * The web repo routes both locales and asks with the locale's own slug, so both columns are
   * matched (the `ProvinceController.findBySlug` precedent). Unknown slug → 404 with a stable
   * message KEY, never authored prose: full i18n wiring lands with the first end-user-facing
   * message surface (`ENGINEERING.md` §6).
   */
  async findBySlug(slug: string): Promise<BookDetailDto> {
    const book = await this.books.findOne({ where: [{ slugTr: slug }, { slugEn: slug }] });

    if (book === null) {
      throw new NotFoundException('errors.book.notFound');
    }

    // Ordered in SQL, and NOT re-sorted in the mapper. The e2e asserts that the SERVED arrays
    // ascend; if the mapper sorted them too, that assertion could never fail and the guard would be
    // one that cannot fire. Order is established once, here, and the test checks the result.
    const videos = await this.videos.find({
      where: { bookId: book.id },
      order: { denemeNo: 'ASC' },
    });
    const questions =
      videos.length === 0
        ? []
        : await this.questions.find({
            where: { bookVideoId: In(videos.map((video) => video.id)) },
            order: { bookVideoId: 'ASC', questionNo: 'ASC' },
          });

    const questionsByVideo = new Map<string, BookVideoQuestion[]>();
    for (const question of questions) {
      const bucket = questionsByVideo.get(question.bookVideoId);
      if (bucket === undefined) {
        questionsByVideo.set(question.bookVideoId, [question]);
      } else {
        bucket.push(question);
      }
    }

    const videoDtos: BookVideoDto[] = videos.map((video) => ({
      denemeNo: video.denemeNo,
      youtubeVideoId: video.youtubeVideoId,
      questions: (questionsByVideo.get(video.id) ?? []).map((question) => ({
        questionNo: question.questionNo,
        startSecond: question.startSecond,
      })),
      // Always null in B3 — see the class docblock. Not a gap: the reader gets a typographic
      // facade and no `VideoObject`, and every other field on this object is unaffected.
      youtube: null,
    }));

    // ONE computation feeding both the inherited top-level counts and `coverage`. Two queries for
    // one number is this repo's named drift class, so the numbers below are derived from the arrays
    // that were actually served, never recounted.
    const stats: BookStats = {
      videoCount: videoDtos.length,
      questionCount: videoDtos.reduce((sum, video) => sum + video.questions.length, 0),
      childrenUpdatedAt: latestChildTimestamp(videos, questions),
    };

    return {
      ...this.toListItem(book, stats),
      titleEn: book.titleEn,
      authorNames: book.authorNames,
      isbn13: book.isbn13,
      pageCount: book.pageCount,
      denemeCount: book.denemeCount,
      introTr: book.introTr,
      introEn: book.introEn,
      metaTitleTr: book.metaTitleTr,
      metaDescriptionTr: book.metaDescriptionTr,
      youtubeChannelId: book.youtubeChannelId,
      youtubePlaylistId: book.youtubePlaylistId,
      purchaseUrl: book.purchaseUrl,
      coverage: {
        videoCount: stats.videoCount,
        questionCount: stats.questionCount,
        // The SET, ascending — never a formatted range string. Turning [1,2,3] into "1–3" is the
        // web layer's decision and its locale's punctuation.
        denemeNumbers: videoDtos.map((video) => video.denemeNo),
        denemeCount: book.denemeCount,
      },
      videos: videoDtos,
      // Populated on EVERY response, in every data state — an empty array would be a breach of the
      // attribution obligation rather than a degraded widget, which is why the rows are compiled
      // constants and not seed data.
      attribution: buildBookAttribution(book.youtubeChannelId),
    };
  }

  /**
   * Per-book counts and child timestamps for a page of books, in one grouped query.
   *
   * `COUNT(DISTINCT v.id)` rather than `COUNT(v.id)`: the join to questions multiplies each video
   * row by its question count, so the plain count would report 180 videos for 30.
   */
  private async loadStats(bookIds: string[]): Promise<Map<string, BookStats>> {
    // An empty `IN ()` is invalid SQL, and an empty page is an ordinary state (a book set smaller
    // than the requested page). Skipping the round trip is also the honest answer: there is nothing
    // to aggregate.
    if (bookIds.length === 0) {
      return new Map();
    }

    const rows = await this.videos
      .createQueryBuilder('v')
      .leftJoin(BookVideoQuestion, 'q', 'q.bookVideoId = v.id')
      .select('v.bookId', 'bookId')
      .addSelect('COUNT(DISTINCT v.id)', 'videoCount')
      .addSelect('COUNT(q.id)', 'questionCount')
      .addSelect('MAX(v.updatedAt)', 'videosUpdatedAt')
      .addSelect('MAX(q.updatedAt)', 'questionsUpdatedAt')
      .where('v.bookId IN (:...bookIds)', { bookIds })
      .groupBy('v.bookId')
      .getRawMany<BookStatsRow>();

    return new Map(
      rows.map((row) => [
        row.bookId,
        {
          // `Number(...)` because pg hands back `bigint` as a string — see `BookStatsRow`.
          videoCount: Number(row.videoCount),
          questionCount: Number(row.questionCount),
          childrenUpdatedAt: newerOf(row.videosUpdatedAt, row.questionsUpdatedAt),
        },
      ]),
    );
  }

  private toListItem(row: Book, stats: BookStats): BookListItemDto {
    return {
      slugTr: row.slugTr,
      slugEn: row.slugEn,
      titleTr: row.titleTr,
      publisherName: row.publisherName,
      examTrack: row.examTrack,
      coverImagePath: row.coverImagePath,
      videoCount: stats.videoCount,
      questionCount: stats.questionCount,
      displayOrder: row.displayOrder,
      updatedAt: latestUpdatedAt(row.updatedAt, stats.childrenUpdatedAt).toISOString(),
    };
  }
}

/** The newer of two nullable instants, or null when both are absent. */
function newerOf(left: Date | null, right: Date | null): Date | null {
  if (left === null) return right;
  if (right === null) return left;
  return left > right ? left : right;
}

/** The newest `updated_at` across a book's loaded child rows — the detail path's half of GREATEST. */
function latestChildTimestamp(
  videos: readonly BookVideo[],
  questions: readonly BookVideoQuestion[],
): Date | null {
  let latest: Date | null = null;
  for (const row of [...videos, ...questions]) {
    latest = newerOf(latest, row.updatedAt);
  }
  return latest;
}
