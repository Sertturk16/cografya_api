import { ApiProperty } from '@nestjs/swagger';

/**
 * The repo-wide list envelope — the CORE FIVE, established here and binding on every list after
 * (`DEC 2026-08-12k` §2 and §7; playbook §2).
 *
 * ## The contract, in one sentence
 * A list response carries **exactly** `items`, `page`, `pageSize`, `total` and `hasMore` at the
 * top level; everything endpoint-specific lives inside one named `meta` object; a list with no
 * endpoint-specific fields carries no `meta` at all.
 *
 * ## Why this class holds four fields and not five
 * `items` is declared by each list DTO, because `@ApiProperty({ type: [X] })` needs the concrete
 * item type. That is a mechanical necessity, not a loosening: the four here plus a mandatory
 * `items` are the five, and the OpenAPI artifact shows them together.
 *
 * ## Why the split lives in the `meta` SHAPE rather than in this class alone
 * Measured against `@nestjs/swagger` 11.4.5: a subclass schema is emitted FLAT — no `allOf`, no
 * `$ref` back to the base, and the base does not appear in `components.schemas` unless it is
 * registered separately. So inheritance alone would enforce the core in TypeScript while leaving
 * the published contract as an undifferentiated list of keys, where the next author cannot see
 * which ones are the shared core. Nesting the endpoint-specific fields is what makes the
 * boundary visible in the artifact the web repo actually codegens from.
 *
 * The deliberate trade-off recorded with the ruling: OFFSET pagination can shift when a new row
 * lands between two requests, so a record may appear twice across pages. Cursor pagination fixes
 * that and breaks stable `?page=2` addresses, which the web repo's canonical strategy depends
 * on. A chosen trade, not a missed defect.
 *
 * This class is NOT registered as an OpenAPI component: on its own it describes no response.
 */
export abstract class PaginationEnvelopeDto {
  @ApiProperty({
    type: Number,
    minimum: 1,
    example: 1,
    description: 'Requested page, 1-based.',
  })
  page!: number;

  @ApiProperty({
    type: Number,
    minimum: 1,
    example: 50,
    description: 'Requested page size. Each endpoint documents its own ceiling.',
  })
  pageSize!: number;

  @ApiProperty({
    type: Number,
    minimum: 0,
    example: 630,
    description: 'Total rows matching the applied filter, across all pages.',
  })
  total!: number;

  @ApiProperty({
    type: Boolean,
    example: true,
    description: 'Whether a further page exists after this one.',
  })
  hasMore!: boolean;
}
