import { ApiProperty } from '@nestjs/swagger';
import { BookAttributionDto } from './book-attribution.dto';
import { BookCoverageDto } from './book-coverage.dto';
import { BookListItemDto } from './book-list-item.dto';
import { BookVideoDto } from './book-video.dto';

/**
 * The whole book page in one payload — künye, coverage, 30 videos, 180 questions, attribution.
 *
 * `GET /api/books/{slug}` accepts **either** slug (the `ProvinceController.findBySlug` precedent)
 * and answers an unknown one with 404, never a soft 200. There is no separate videos endpoint: the
 * page's entire content is a few kilobytes and the SSG build makes one round trip (SPEC §6.1).
 *
 * ## It extends the list item, and swagger flattens that
 * `@nestjs/swagger` emits a subclass schema FLAT — no `allOf`, no `$ref` to the base (playbook §2,
 * measured) — so the published `BookDetailDto` carries every inherited key inline and the web repo
 * sees one complete object. `BookListItemDto` is registered separately so its own schema exists
 * for the list endpoint.
 *
 * The consequence is a small, deliberate redundancy: `videoCount` and `questionCount` appear both
 * at the top level (inherited, for a card rendered from a detail response) and inside
 * {@link coverage}. **B3 obligation:** both are filled from ONE computation, never from two
 * queries — two paths to the same number is this repo's named drift class.
 *
 * ## What this payload deliberately does NOT carry
 * - **No price, currency, availability or offer** — `CONVENTIONS.md` §4, reaffirmed by the ruling
 *   that authorised {@link purchaseUrl}. `Product`/`offers` structured data cannot be assembled
 *   from this contract even by accident (SPEC §12.6); `Book` is the schema type for this page.
 * - **No PDF, no downloadable asset, no transcript** — owner rule and SPEC §4.3. There is no auth
 *   surface and no role on this leg. **There IS personal data**: {@link authorNames} publishes named
 *   individuals, by owner ruling (`FU-BOOKS-AUTHOR-PII`, closed) — künye facts printed on the
 *   book's own cover, nothing derived or enriched, and none of it logged. The claim that this leg
 *   carries "no personal data at all" was true until B3 served this DTO and is retired here rather
 *   than left standing; playbook §3.6 binds anything added after those two names.
 * - **No reader-facing sentence.** The api carries numbers, tokens and the two editorial strings
 *   it owns; question labels, duration formats, the "video unavailable" state and the coverage
 *   sentence are all `messages/*.json` under `CONTENT-STYLE.md` §22 (SPEC §10).
 *
 * Served by `GET /api/books/{slug}` since B3. **`videos[].youtube` is `null` on every video today**
 * and that is the designed path rather than a gap (`DEC 2026-08-15h` item 2): the snapshot serving
 * path and its age thresholds are B4's, and the page is complete without them — the künye, the
 * denemeler, the questions and the start seconds are all ours.
 */
export class BookDetailDto extends BookListItemDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Null today, deliberately: a product name has no translation, and SEO-POLICY §B14 14.2 ' +
      'omits a field with no counterpart rather than machine-filling it. Render the TR title on ' +
      'the EN page rather than inventing one.',
  })
  titleEn!: string | null;

  /**
   * The example is a PLACEHOLDER, and deliberately not the real authors.
   *
   * It used to carry the seeded pair, in an order a later ruling made false (`DEC 2026-08-15i`
   * md.1 — the published order is the cover's). The seed was corrected and the example was not, so
   * the artifact contradicted itself and served a false claim about two named living people from
   * an ungated `/docs` on a PUBLIC repository (PR #110 review, `FID110-I1`/`SEC110-I1`).
   *
   * Fixing the order would have fixed this instance; using non-real names fixes the CLASS. An
   * example's job is to show an ordered array of strings — it does not need to be these people, and
   * a placeholder cannot drift out of step with a ruling about them again. Same shape
   * `book-seed-invariants.spec.ts` already uses for its fixtures.
   */
  @ApiProperty({
    type: [String],
    example: ['Ada Lovelace', 'Grace Hopper'],
    description:
      'Authors in the order the BOOK prints them. This is a published render order — iterate it ' +
      'as given and never sort it alphabetically as a tidy-up. The example above is a placeholder, ' +
      'not real seeded data.',
  })
  authorNames!: string[];

  @ApiProperty({
    type: String,
    example: '9786259490069',
    description: 'ISBN-13, exactly 13 digits, no hyphens. Feeds Book.isbn.',
  })
  isbn13!: string;

  @ApiProperty({
    type: Number,
    minimum: 1,
    example: 144,
    description: 'Printed page count. Feeds Book.numberOfPages.',
  })
  pageCount!: number;

  @ApiProperty({
    type: Number,
    minimum: 1,
    example: 40,
    description:
      'How many denemeler the BOOK contains — a künye fact, distinct from how many have video ' +
      'solutions. Also present inside coverage; both come from the same value.',
  })
  denemeCount!: number;

  @ApiProperty({
    type: String,
    description:
      'The editorial narrative, hand-written and reviewed against CONTENT-STYLE and SEO-POLICY ' +
      'Part A. Paragraphs are separated by a blank line; render it as prose, never as a single ' +
      'run-on block.',
  })
  introTr!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Null today (SEO-POLICY §B14 14.2). The EN page carries no narrative rather than a ' +
      'machine-translated one; the EN twin is permanently noindex by owner ruling.',
  })
  introEn!: string | null;

  @ApiProperty({
    type: String,
    description:
      'Hand-written page title (SEO-POLICY A1). It comes from the api rather than a web-side ' +
      'pattern because four books can be written by hand where 81 provinces could not — pass it ' +
      'through buildMetadata, do not bypass the helper.',
  })
  metaTitleTr!: string;

  @ApiProperty({
    type: String,
    description:
      'Hand-written meta description carrying a concrete fact (SEO-POLICY A2), not a generic ' +
      'phrase and not derived from a template.',
  })
  metaDescriptionTr!: string;

  @ApiProperty({
    type: String,
    example: 'UCH7D1zOgHykrHfx5Q7WERmw',
    description: 'The channel the solutions are published on — attribution and the channel link.',
  })
  youtubeChannelId!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'The playlist, carried for the attribution link ONLY. No code path on our side queries it: ' +
      'the video set is fixed by seed, so a playlist edit cannot silently change this page.',
  })
  youtubePlaylistId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example:
      'https://www.kitapisler.com/cografya-gurmesi-yayinlari-ayt-cografya-konu-ozetli-brans-denemeleri_106636.html',
    description:
      'Outbound "Satın Al" link to the seller, or null when there is none — render no button on ' +
      'null. **No price is published anywhere, by rule**: CONVENTIONS §4 bars pricing, and a ' +
      'price on a page we do not control goes stale. Always https, enforced by a database ' +
      'constraint, because this value becomes an href on a public page.',
  })
  purchaseUrl!: string | null;

  @ApiProperty({
    type: BookCoverageDto,
    description:
      'What this index actually covers, as numbers. The counts belong to the interface rather ' +
      'than to the prose (owner ruling); the editorial text asserts nothing about them.',
  })
  coverage!: BookCoverageDto;

  @ApiProperty({
    type: [BookVideoDto],
    description:
      'Every indexed deneme with its question index, ascending by denemeNo. The 180-row index ' +
      'must be readable and clickable without JavaScript — that is what keeps this page clear of ' +
      'SEO-POLICY §12.2.b.',
  })
  videos!: BookVideoDto[];

  @ApiProperty({
    type: [BookAttributionDto],
    description:
      'Never empty, on any response, in any data state — an empty array would be a breach of the ' +
      'attribution obligation rather than a degraded widget. Two rows: the YouTube source credit ' +
      'and the content partner credit; neither substitutes for the other.',
  })
  attribution!: BookAttributionDto[];
}
