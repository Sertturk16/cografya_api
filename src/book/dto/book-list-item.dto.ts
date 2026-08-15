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
 * also no admin CRUD and no auth surface anywhere on this leg — content changes arrive as a seed
 * plus a migration (SPEC §4.3), so playbook §3.3/§3.4 are not triggered.
 *
 * **The "no personal data on this leg" half of that sentence was retired in B3, and deliberately
 * rather than quietly.** `BookDetailDto.authorNames` publishes named individuals, and B3 is the PR
 * that first serves them from a public endpoint — so the leg now has a personal-data surface, even
 * though it still has no accounts, no uploads, and logs none of it. The owner ruled on 2026-08-15
 * that these names DO publish (`FU-BOOKS-AUTHOR-PII`, closed), which is what makes the field public
 * rather than merely present: they are künye facts printed on the book's own cover, credited as the
 * book credits them. Nothing here is derived, inferred or enriched, and the surface stops at the
 * two names — playbook §3.6 still binds anything added after them.
 *
 * Served by `GET /api/books` since B3, inside {@link BookListDto}. `BookDetailDto` extends this
 * class and `@nestjs/swagger` emits a subclass FLAT, so every field declared here is published on
 * BOTH schemas — which is why {@link updatedAt} is declared once and appears twice.
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

  /**
   * When this book last changed, as a whole.
   *
   * ## It is a GREATEST across three tables, not `books.updated_at`
   * `GREATEST(books.updated_at, MAX(book_videos.updated_at), MAX(book_video_questions.updated_at))`.
   * The book row alone would be wrong, and the seed is why: a re-measurement that shifts 180 start
   * seconds updates the child rows and deliberately leaves the book row untouched, because writing
   * a row whose own columns did not change is the lie the seed's row-level idempotency exists to
   * prevent. Reading only the book row would report "unchanged" on the day the question index
   * changed completely.
   *
   * ## Why it is on the LIST item and not only on the detail
   * `DEC 2026-08-15e` made the book tier unbounded, and the sitemap needs a real `lastmod` per book
   * (`SEO-POLICY.md` §B6 6.9 refuses build time by name; §B5 5.9 binds `dateModified` to a real
   * `updated_at`). Carried here, the sitemap reads one paged list; carried only on the detail, it
   * costs one request per book forever. Declared once on this base class and inherited by
   * `BookDetailDto`, which swagger emits FLAT — so it is published on both schemas from one
   * declaration.
   */
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-08-15T09:12:33.000Z',
    description:
      'ISO 8601 UTC instant this book last changed, across its own row AND its videos and ' +
      'questions. Feeds sitemap lastmod and Book.dateModified — use it directly, never the build ' +
      'time.',
  })
  updatedAt!: string;
}
