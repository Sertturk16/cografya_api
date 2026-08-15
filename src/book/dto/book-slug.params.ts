import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

/** The slug alphabet `GLOSSARY.md` §5 rule 4 produces: lowercase ASCII, digits, hyphen. */
const SLUG_PATTERN = /^[a-z0-9-]+$/;

/**
 * Route parameter for `GET /api/books/{slug}` — validated, deliberately.
 *
 * ## Why this class exists at all, when the sibling controllers take a bare string
 * `ProvinceController.findBySlug` and `CountryController` declare `@Param('slug') slug: string`,
 * which is the api architecture scan's `B3` finding: two endpoints with no validation on the one
 * value a stranger controls. That half of the precedent is **not copied**. The finding is about
 * existing code and fixing it is a separate change (out of scope here, and touching it would be a
 * deviation) — but reproducing it in new code would be a choice, and this is the choice not to.
 *
 * ## What the two rules are anchored to
 * - The alphabet is `GLOSSARY.md` §5 rule 4's output (`a-z0-9-`) — the same folding that produced
 *   the book's own slug, positive-controlled there against seven locked province examples.
 *   **It is a deliberate SUPERSET of the seed's shape gate, and the two are not interchangeable.**
 *   `book-seed-invariants.ts` uses `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, which additionally refuses a
 *   leading, trailing or doubled hyphen — correct there, because that gate decides what may be
 *   WRITTEN and a malformed slug becomes a permanent address. This pattern decides only what is
 *   worth a database lookup, and `--foo-` is not dangerous, merely unmatchable: it answers 404 like
 *   any other unknown slug. Tightening this one to match would convert a 404 into a 400 for a value
 *   no book can hold either way, so the difference is kept and named rather than "fixed" (PR #110
 *   review, `SEC110-M2`).
 * - The length ceiling is `books.slug_tr varchar(140)`. A value longer than the column can hold
 *   cannot match a row, so bounding it here refuses the request instead of sending an
 *   unmatchable string to Postgres and logging it on the way.
 *
 * ## The status-code consequence, stated because the web repo has to handle it
 * A slug that violates the shape answers **400**; a well-formed slug matching no row answers
 * **404**. Both are documented on the route, and the web repo maps BOTH to `notFound()` — a
 * hand-typed `/kitaplar/FOO` must render the 404 page, not an error page. Folding the shape
 * violation into 404 was the alternative and was rejected: "no book has that slug" and "that is
 * not a slug" are different facts, and a 400 is what tells a caller its own request was wrong.
 */
export class BookSlugParams {
  @ApiProperty({
    type: String,
    pattern: SLUG_PATTERN.source,
    minLength: 1,
    maxLength: 140,
    example: 'ayt-cografya-konu-ozetli-brans-denemeleri',
    description:
      'TR or EN slug of the book — both resolve to the same row, so each locale asks with its ' +
      'own. Lowercase ASCII letters, digits and hyphens only.',
  })
  @IsString()
  @Length(1, 140)
  @Matches(SLUG_PATTERN)
  slug!: string;
}
