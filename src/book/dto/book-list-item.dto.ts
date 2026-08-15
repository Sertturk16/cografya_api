import { ApiProperty } from '@nestjs/swagger';
import { ExamTrack } from '../book.types';

/**
 * Lean list payload for the `/kitaplar` hub — one card.
 *
 * ## `GET /api/books` returns the shared ENVELOPE, and this is one item inside it
 * The response type is {@link BookListDto} — playbook §2's core five, no `meta`. B1 first froze a
 * plain array on the premise that the book tier is a fixed four-row set; the owner overturned the
 * premise (*"onlarca kitap bile olabilir"*, → DEC 2026-08-15e), so this is an unbounded growing
 * list and §2 applies in its ordinary form. The bounded-and-small case §2 keeps — the 81
 * provinces — is untouched and is not what this endpoint is.
 *
 * ## DTO tiers here are List + Detail, and no more
 * Playbook §2: no Response tier, because there is no write endpoint and nothing to echo. There is
 * also no admin CRUD, no auth surface and no personal data anywhere on this leg — content changes
 * arrive as a seed plus a migration (SPEC §4.3), so playbook §3.3/§3.4 are not triggered.
 *
 * **NOT SERVED BY ANY B1 ENDPOINT** — a frozen contract published for codegen; `GET /api/books`
 * lands in B3 (SPEC §16).
 */
export class BookListItemDto {
  @ApiProperty({
    type: String,
    example: 'ayt-cografya-konu-ozetli-brans-denemeleri',
    description: 'TR routing key — /kitaplar/{slugTr}.',
  })
  slugTr!: string;

  @ApiProperty({
    type: String,
    example: 'ayt-cografya-konu-ozetli-brans-denemeleri',
    description:
      'EN routing key — /en/books/{slugEn}. Equal to slugTr for this book because a product name ' +
      'is not translated; that is a consequence, not a rule, and the two are separate columns. ' +
      'The EN twin is permanently noindex by owner ruling and still needs exactly one URL.',
  })
  slugEn!: string;

  @ApiProperty({
    type: String,
    example: 'AYT Coğrafya Konu Özetli Branş Denemeleri',
    description: "The book's full title as printed on the cover.",
  })
  titleTr!: string;

  @ApiProperty({
    type: String,
    example: 'Coğrafya Gurmesi Yayınları',
    description: 'Publisher, as credited. Feeds Book.publisher in the structured data.',
  })
  publisherName!: string;

  @ApiProperty({
    enum: ExamTrack,
    example: ExamTrack.Ayt,
    description:
      'Which exam this book prepares for. A closed set — adding a member is a breaking contract ' +
      'change, because it can break an exhaustive switch in the consumer.',
  })
  examTrack!: ExamTrack;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '/kitaplar/ayt-cografya-konu-ozetli-brans-denemeleri.jpg',
    description:
      "A path inside the web repo's own public/ directory — never a remote URL, enforced by a " +
      'database constraint. The api neither receives nor serves image bytes on this leg. Null ' +
      'means there is no cover to render.',
  })
  coverImagePath!: string | null;

  @ApiProperty({
    type: Number,
    minimum: 0,
    example: 30,
    description:
      'How many denemeler of this book have an indexed video solution. Present on the card so ' +
      'the hub carries real content of its own rather than being a bare list of links.',
  })
  videoCount!: number;

  @ApiProperty({
    type: Number,
    minimum: 0,
    example: 180,
    description: 'How many individual question solutions are indexed, across every video.',
  })
  questionCount!: number;

  @ApiProperty({
    type: Number,
    example: 1,
    description:
      'Hub ordering. Read with a deterministic secondary sort — equal values must not leave the ' +
      'order to chance.',
  })
  displayOrder!: number;
}
