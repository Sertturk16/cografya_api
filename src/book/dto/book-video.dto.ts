import { ApiProperty } from '@nestjs/swagger';
import { BookVideoQuestionDto } from './book-video-question.dto';
import { BookVideoYoutubeDto } from './book-video-youtube.dto';

/**
 * One deneme and its video solution, with the question index that makes the page a page.
 *
 * The detail response carries every one of these in a single payload — 30 videos × 6 questions is
 * a few kilobytes — so there is deliberately **no `/api/books/{slug}/videos` endpoint**: the SSG
 * build makes one round trip (SPEC §6.1).
 *
 * Served inside `BookDetailDto` since B3, with {@link youtube} `null` on every video until B4 lands
 * the snapshot serving path (`DEC 2026-08-15h` item 2).
 */
export class BookVideoDto {
  @ApiProperty({
    type: Number,
    minimum: 1,
    example: 12,
    description:
      "The deneme's number IN THE BOOK — not its position in the playlist. The two diverge (+1 " +
      'after 14, +2 after 21) because denemeler 14 and 22 exist in the book while their solution ' +
      'videos do not. The playlist position is stored nowhere and is never published.',
  })
  denemeNo!: number;

  @ApiProperty({
    type: String,
    example: 'dQw4w9WgXcQ',
    description:
      'The YouTube video id, 11 characters — the identifier the embed is built from. Load the ' +
      'player only on a click or key press, never on hover, and place nothing on top of it once ' +
      'it is in. Moving between questions happens INSIDE the loaded player through the IFrame ' +
      'Player API, not by rebuilding the embed URL per question (owner ruling DEC 2026-08-15d): ' +
      'six questions per video would otherwise cost six full player reloads.',
  })
  youtubeVideoId!: string;

  @ApiProperty({
    type: [BookVideoQuestionDto],
    description:
      'The question index for this deneme, ascending by questionNo and by startSecond. It must ' +
      'be readable and clickable WITHOUT JavaScript: SEO-POLICY §12.2.b treats a page whose body ' +
      'exists to send the visitor elsewhere as a BLOCKER, and this index is what keeps the page ' +
      'on the right side of that line.',
  })
  questions!: BookVideoQuestionDto[];

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
