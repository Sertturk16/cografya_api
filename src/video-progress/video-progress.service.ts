import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BookVideo } from '../book/entities/book-video.entity';
import { Book } from '../book/entities/book.entity';
import { YoutubeVideoSnapshot } from '../book/entities/youtube-video-snapshot.entity';
import type { BookProgressDto } from './dto/book-progress.dto';
import type { VideoProgressDto } from './dto/video-progress.dto';
import { VideoProgress } from './entities/video-progress.entity';
import { resolveMaxAllowedPosition } from './video-progress-duration';
import { VIDEO_PROGRESS_ERROR_KEYS } from './video-progress-error-keys';

/** Columns an existing row hands over to the incoming one. `created_at` deliberately survives. */
const UPSERT_OVERWRITE_COLUMNS = ['last_position_seconds', 'watched', 'watched_at', 'updated_at'];

/** Raw shape of the aggregate query in {@link VideoProgressService.getBookProgress}. */
interface BookProgressAggregateRow {
  watchedCount: string;
  startedCount: string;
}

/** Raw shape of the resume-row query in {@link VideoProgressService.getBookProgress}. */
interface BookProgressResumeRow {
  bookVideoId: string;
  orderNo: number;
  lastPositionSeconds: number;
  watched: boolean;
  updatedAt: Date;
}

/**
 * Read-one / upsert-one for `video_progress` — both scoped to the caller's own row (plan §5) —
 * plus the book-level progress aggregate (PR-B plan §5).
 */
@Injectable()
export class VideoProgressService {
  constructor(
    @InjectRepository(VideoProgress)
    private readonly progress: Repository<VideoProgress>,
    @InjectRepository(BookVideo)
    private readonly videos: Repository<BookVideo>,
    @InjectRepository(YoutubeVideoSnapshot)
    private readonly snapshots: Repository<YoutubeVideoSnapshot>,
    @InjectRepository(Book)
    private readonly books: Repository<Book>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * `GET` — one undifferentiated 404 whether `bookVideoId` names no `BookVideo` at all or the
   * caller simply has no saved progress for a valid one (plan §5.6, a deliberate simplification:
   * one query, and a client's next action is identical either way).
   */
  async getOne(userId: string, bookVideoId: string): Promise<VideoProgressDto> {
    const row = await this.progress.findOne({ where: { userId, bookVideoId } });
    if (row === null) throw new NotFoundException(VIDEO_PROGRESS_ERROR_KEYS.notFound);
    return toDto(row);
  }

  /**
   * `PUT` — validates the reported position against the video's real duration when it is knowable,
   * then a single atomic `INSERT … ON CONFLICT (user_id, book_video_id) DO UPDATE` (plan §5.3):
   * `UQ_video_progress_user_book_video` makes this idempotent AND concurrency-safe with no
   * app-level lock — two concurrent upserts for the same pair serialize inside Postgres.
   *
   * No transaction wraps the two reads and the write (plan §5.4): `book_videos` has no
   * REQUEST-PATH delete (books are seed-only), but it does have a real one — `pnpm db:seed:books
   * --allow-removals`, a hand-run, offline, operator-authorised maintenance command. That command
   * is safer BECAUSE of `FK_video_progress_book_video`'s `ON DELETE RESTRICT`, not despite the
   * missing transaction here: a delete blocked mid-run rolls the seed's own all-or-nothing
   * transaction back cleanly, it does not race this endpoint's read-then-write into a
   * half-applied state. The TOCTOU window an app-level transaction would close is therefore still
   * not a live risk — a conscious simplification, not an oversight.
   */
  async upsert(
    userId: string,
    bookVideoId: string,
    lastPositionSeconds: number,
    watched: boolean,
  ): Promise<VideoProgressDto> {
    const video = await this.videos.findOne({ where: { id: bookVideoId } });
    if (video === null) throw new NotFoundException(VIDEO_PROGRESS_ERROR_KEYS.videoNotFound);

    // NOT gated by `isSnapshotServable`'s soft threshold (`book.service.ts`): a video's real
    // duration does not change over its lifetime, so any snapshot row that still physically
    // exists may be used here for validation, however old (plan §5.4 step 2).
    const snapshot = await this.snapshots.findOne({
      where: { youtubeVideoId: video.youtubeVideoId },
    });
    const maxAllowed = resolveMaxAllowedPosition(snapshot?.durationSeconds ?? null);
    if (lastPositionSeconds > maxAllowed) {
      throw new BadRequestException(VIDEO_PROGRESS_ERROR_KEYS.positionExceedsDuration);
    }

    const now = new Date();
    await this.dataSource
      .getRepository(VideoProgress)
      .createQueryBuilder()
      .insert()
      .values({
        userId,
        bookVideoId,
        lastPositionSeconds,
        watched,
        // "Last confirmed instant", not "first ever watched instant" (plan §5.3) — overwritten on
        // every call, never referencing the pre-existing row.
        watchedAt: watched ? now : null,
      })
      .orUpdate(UPSERT_OVERWRITE_COLUMNS, ['user_id', 'book_video_id'])
      .execute();

    const row = await this.progress.findOneOrFail({ where: { userId, bookVideoId } });
    return toDto(row);
  }

  /**
   * `GET books/{slug}` — the caller's own reading progress on one book (PR-B plan §5).
   *
   * `slug` resolves TR-or-Either exactly like `BookService.findBySlug`: an unknown, well-formed
   * slug is a genuine 404 (`bookNotFound`), never folded into the zero-progress 200 below. Once the
   * book is resolved, EVERY remaining query is filtered by `userId` — the same cross-user isolation
   * invariant {@link getOne}/{@link upsert} already carry — so a caller with no progress at all still
   * gets 200 with `videoCount` from the book's own video rows and `watchedCount`/`startedCount: 0`,
   * `resume: null`: this route answers "how far am I", which has a valid zero, unlike the
   * single-video `GET`'s "do I have a row here" 404.
   *
   * Two aggregate queries against the caller's own `video_progress` rows joined to this book's
   * `book_videos` — never a per-video loop — plus one `COUNT` for the denominator (the
   * `earthquake-read.store.ts` `.getRawOne()` precedent).
   *
   * ## One REPEATABLE READ snapshot across all four reads, mirroring `BookService.findBySlug`
   * exactly (CODE169-M2 fix, round 1). Under the default READ COMMITTED, each of the four
   * statements below would take its own snapshot, so a write landing between them (today only
   * `pnpm db:seed:books --allow-removals` adding a video mid-request — `FK_video_progress_book_video`
   * `ON DELETE RESTRICT` already rules out a mid-request delete of a video with existing progress)
   * could yield a `videoCount` that undercounts against the aggregate/resume rows it is reported
   * beside. `findBySlug`'s own docblock is the fuller argument for why the isolation level, not
   * just the transaction wrapper, is the part that closes this.
   */
  async getBookProgress(userId: string, slug: string): Promise<BookProgressDto> {
    return this.books.manager.transaction('REPEATABLE READ', async (manager) => {
      const book = await manager
        .getRepository(Book)
        .findOne({ where: [{ slugTr: slug }, { slugEn: slug }] });
      if (book === null) throw new NotFoundException(VIDEO_PROGRESS_ERROR_KEYS.bookNotFound);

      const videoCount = await manager
        .getRepository(BookVideo)
        .count({ where: { bookId: book.id } });

      const aggregate = await manager
        .getRepository(VideoProgress)
        .createQueryBuilder('progress')
        .innerJoin(
          BookVideo,
          'video',
          'video.id = progress.bookVideoId AND video.bookId = :bookId',
          {
            bookId: book.id,
          },
        )
        .where('progress.userId = :userId', { userId })
        .select('COUNT(*) FILTER (WHERE progress.watched)', 'watchedCount')
        .addSelect('COUNT(*)', 'startedCount')
        .getRawOne<BookProgressAggregateRow>();

      // `.addOrderBy('progress.id', 'DESC')` (CODE169-M1 fix, round 1): the primary sort key alone
      // is not a total order — on a genuine `updated_at` tie (possible: no transaction wraps the
      // read-then-write in `upsert`, so two concurrent PUTs can land on the same microsecond-
      // resolution timestamp) Postgres's row choice on `LIMIT 1` is otherwise plan-dependent rather
      // than deterministic. `id` carries no chronological meaning of its own (`gen_random_uuid()`);
      // it exists here only to make the ordering total.
      const resumeRow = await manager
        .getRepository(VideoProgress)
        .createQueryBuilder('progress')
        .innerJoin(
          BookVideo,
          'video',
          'video.id = progress.bookVideoId AND video.bookId = :bookId',
          {
            bookId: book.id,
          },
        )
        .where('progress.userId = :userId', { userId })
        .select('progress.bookVideoId', 'bookVideoId')
        .addSelect('video.orderNo', 'orderNo')
        .addSelect('progress.lastPositionSeconds', 'lastPositionSeconds')
        .addSelect('progress.watched', 'watched')
        .addSelect('progress.updatedAt', 'updatedAt')
        .orderBy('progress.updatedAt', 'DESC')
        .addOrderBy('progress.id', 'DESC')
        .limit(1)
        .getRawOne<BookProgressResumeRow>();

      return {
        bookSlugTr: book.slugTr,
        videoCount,
        watchedCount: Number(aggregate?.watchedCount ?? 0),
        startedCount: Number(aggregate?.startedCount ?? 0),
        resume:
          resumeRow === undefined
            ? null
            : {
                bookVideoId: resumeRow.bookVideoId,
                orderNo: resumeRow.orderNo,
                lastPositionSeconds: resumeRow.lastPositionSeconds,
                watched: resumeRow.watched,
                updatedAt: resumeRow.updatedAt.toISOString(),
              },
      };
    });
  }
}

function toDto(row: VideoProgress): VideoProgressDto {
  return {
    bookVideoId: row.bookVideoId,
    lastPositionSeconds: row.lastPositionSeconds,
    watched: row.watched,
    watchedAt: row.watchedAt === null ? null : row.watchedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
