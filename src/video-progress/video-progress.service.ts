import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BookVideo } from '../book/entities/book-video.entity';
import { YoutubeVideoSnapshot } from '../book/entities/youtube-video-snapshot.entity';
import type { VideoProgressDto } from './dto/video-progress.dto';
import { VideoProgress } from './entities/video-progress.entity';
import { resolveMaxAllowedPosition } from './video-progress-duration';
import { VIDEO_PROGRESS_ERROR_KEYS } from './video-progress-error-keys';

/** Columns an existing row hands over to the incoming one. `created_at` deliberately survives. */
const UPSERT_OVERWRITE_COLUMNS = ['last_position_seconds', 'watched', 'watched_at', 'updated_at'];

/**
 * Read-one / upsert-one for `video_progress` — both scoped to the caller's own row (plan §5).
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
   * No transaction wraps the two reads and the write (plan §5.4): `book_videos` has no runtime
   * delete path (books are seed-only), so the TOCTOU window this would close is not a live risk —
   * a conscious simplification, not an oversight.
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
