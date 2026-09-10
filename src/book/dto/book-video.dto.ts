import { ApiProperty } from '@nestjs/swagger';
import { BookVideoTagDto } from './book-video-tag.dto';
import { BookVideoYoutubeDto } from './book-video-youtube.dto';

/**
 * One video and its etiket index, with the generic vocabulary published (P0 PR-3, `DEC 2026-09-10b`
 * md.1/md.4 as amended by `DEC 2026-09-10c`).
 *
 * The detail response carries every one of these in a single payload — 30 videos × 6 etiketler is
 * a few kilobytes — so there is deliberately **no `/api/books/{slug}/videos` endpoint**: the SSG
 * build makes one round trip (SPEC §6.1).
 *
 * Served inside `BookDetailDto` since B3, with {@link youtube} `null` on every video until B4 lands
 * the snapshot serving path (`DEC 2026-08-15h` item 2).
 */
export class BookVideoDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'book_videos.id — the identifier both video-progress endpoints ' +
      '(GET/PUT /api/video-progress/{bookVideoId}) key on for this exact video.',
  })
  bookVideoId!: string;

  @ApiProperty({
    type: Number,
    minimum: 1,
    example: 12,
    description:
      "The video's position IN THE BOOK — not its position in the playlist. For a deneme book " +
      'the two diverge (+1 after 14, +2 after 21) because denemeler 14 and 22 exist in the book ' +
      'while their solution videos do not. The playlist position is stored nowhere and is never ' +
      'published. The generic successor to the retired `denemeNo` (`GLOSSARY.md` §4.2, `video ' +
      'sırası`); also the anchor prefix on the book page (`#video-{orderNo}-…`).',
  })
  orderNo!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description:
      "Our own display title for this video — never the YouTube API's own title, which is not " +
      'published on this contract. NULL for a deneme book: the reader-facing "Deneme 12" label ' +
      'is still composed in the web repo from i18n + orderNo. A topic-summary/soru-bankası book ' +
      'may set it (`GLOSSARY.md` §4.2, `video başlığı`).',
  })
  titleTr!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description:
      'EN counterpart of titleTr, null on the same SEO-POLICY §B14 14.2 grounds every other EN ' +
      'twin uses: a field with no counterpart is omitted, never machine-filled.',
  })
  titleEn!: string | null;

  @ApiProperty({
    type: String,
    example: 'dQw4w9WgXcQ',
    description:
      'The YouTube video id, 11 characters — the identifier the embed is built from. Load the ' +
      'player only on a click or key press, never on hover, and place nothing on top of it once ' +
      'it is in. Moving between etiketler happens INSIDE the loaded player through the IFrame ' +
      'Player API, not by rebuilding the embed URL per etiket (owner ruling DEC 2026-08-15d): ' +
      'six etiketler per video would otherwise cost six full player reloads.',
  })
  youtubeVideoId!: string;

  @ApiProperty({
    type: [BookVideoTagDto],
    description:
      'The etiket index for this video, ascending by orderNo and by startSecond. It must be ' +
      'readable and clickable WITHOUT JavaScript: SEO-POLICY §12.2.b treats a page whose body ' +
      'exists to send the visitor elsewhere as a BLOCKER, and this index is what keeps the page ' +
      'on the right side of that line. Renamed from `questions` (P0 PR-3, `DEC 2026-09-10b` ' +
      'md.1).',
  })
  tags!: BookVideoTagDto[];

  @ApiProperty({
    type: BookVideoYoutubeDto,
    nullable: true,
    description:
      'Provider-sourced enrichment, or NULL — and null is a normal state, not an error: the sync ' +
      'may never have run, the data may have aged past its serve threshold, or the video may ' +
      'have stopped being returned. When it is null, do NOT emit VideoObject and fall back to a ' +
      'typographic facade; the rest of this object is unaffected.',
  })
  youtube!: BookVideoYoutubeDto | null;
}
