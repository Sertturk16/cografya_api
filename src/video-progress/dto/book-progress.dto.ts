import { ApiProperty } from '@nestjs/swagger';

/**
 * The caller's own resume point on one book — the most-recently-`updatedAt` progress row among
 * that book's videos (plan §5, `Owner's Inbox/uyelik-uyum-denetimi/p1-api-sozlesme/pr-b/plan.md`).
 *
 * `orderNo`, not the retired `denemeNo` (P0 renamed `book_videos.deneme_no` →
 * `order_no`/`orderNo`, `DEC 2026-09-10b`); the field feeds `GET`/`PUT
 * /api/video-progress/{bookVideoId}` directly.
 */
export class BookProgressResumeDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'book_videos.id of the resume video — feeds GET/PUT /api/video-progress/{bookVideoId}.',
  })
  bookVideoId!: string;

  @ApiProperty({
    type: Number,
    minimum: 1,
    example: 12,
    description:
      "The resume video's position IN THE BOOK (`BookVideoDto.orderNo`'s own field, never the " +
      'retired denemeNo) — the anchor prefix on the book page (`#video-{orderNo}-…`).',
  })
  orderNo!: number;

  @ApiProperty({
    type: Number,
    example: 245,
    description: 'Last playback position on the resume video, in seconds.',
  })
  lastPositionSeconds!: number;

  @ApiProperty({
    type: Boolean,
    description: "The caller's declared watched signal on this video.",
  })
  watched!: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description:
      'When this progress row was last written, UTC — the ordering key that selects the resume ' +
      "row among the caller's progress rows for this book.",
  })
  updatedAt!: string;
}

/**
 * The caller's own reading progress on one book (plan §5). `videoCount`/`watchedCount`/
 * `startedCount` are kept on this authenticated, per-user surface deliberately: `DEC 2026-09-10c`
 * md.1 bars a reader-visible count from the PUBLIC book surface's own marketing claim, and this is
 * a different surface in kind — a signed-in member's own progress answer, not the book's promise
 * (`atlas-approval.md` §1). The denominator is a live `COUNT(book_videos)`, never a stored/declared
 * column, so the removed `books.deneme_count` signal is not reintroduced.
 *
 * **No `completionRatio` field** — `watchedCount / videoCount` is derivable by the caller from two
 * published integers, and a published float invites two surfaces rounding it differently.
 *
 * A caller with no progress at all still gets a 200, not a 404: `{ videoCount, watchedCount: 0,
 * startedCount: 0, resume: null }` is a real, useful answer — this route answers "how far am I",
 * which has a valid zero, unlike the single-video `GET`'s "do I have a row here".
 */
export class BookProgressDto {
  @ApiProperty({
    type: String,
    example: 'ayt-cografya-konu-ozetli-brans-denemeleri',
    description:
      "The resolved book's canonical TR slug (`books.slug_tr`), regardless of which locale " +
      'slug the request named.',
  })
  bookSlugTr!: string;

  @ApiProperty({
    type: Number,
    minimum: 0,
    example: 30,
    description:
      "The book's own video-row count — the progress denominator. A live COUNT, never a " +
      'stored/declared column.',
  })
  videoCount!: number;

  @ApiProperty({
    type: Number,
    minimum: 0,
    example: 4,
    description:
      "The caller's progress rows among this book's videos with watched = true — declared " +
      'marks only, never inferred from position.',
  })
  watchedCount!: number;

  @ApiProperty({
    type: Number,
    minimum: 0,
    example: 6,
    description:
      "The caller's progress rows among this book's videos, whatever their watched state — " +
      'every video the caller has ever saved a position for.',
  })
  startedCount!: number;

  @ApiProperty({
    type: BookProgressResumeDto,
    nullable: true,
    description:
      "The caller's most-recently-updated progress row among this book's videos, or null when " +
      'the caller has none.',
  })
  resume!: BookProgressResumeDto | null;
}
