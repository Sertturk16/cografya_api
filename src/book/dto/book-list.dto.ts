import { ApiProperty } from '@nestjs/swagger';
import { PaginationEnvelopeDto } from '../../common/dto/pagination-envelope.dto';
import { BookListItemDto } from './book-list-item.dto';

/**
 * A paginated book list — the response shape of `GET /api/books`, which lands in B3.
 *
 * **NOT SERVED BY ANY B1 ENDPOINT.** Published in this contract PR so the web repo can codegen and
 * build against a mock while B2 seeds the store and B3 lands the endpoints (SPEC §16).
 *
 * ## Why the envelope, when B1 first froze a plain array (→ DEC 2026-08-15e)
 * The plain array rested on one premise — that the book tier is a fixed four-row set — and the
 * owner overturned it: *"beşinci kitap ihtimali var, kaç kitap olacağı belli değil, onlarca kitap
 * bile olabilir."* With no ceiling this is an unbounded, growing list, so playbook §2 applies in
 * its ordinary form rather than through the bounded exception, and that exception is deleted
 * rather than amended. The cost of the reversal is zero only because the PR had not merged and
 * nothing had been generated from the contract; a day later the same change would have been
 * breaking.
 *
 * ## No `meta`, and that is the rule rather than an omission
 * Playbook §2: endpoint-specific fields live in one `meta` object, and a list with none carries no
 * `meta` at all. The book hub has none today — `videoCount` and `questionCount` are ours and sit
 * on the item, and the attribution belongs to the detail response, not to the list. If B3 finds it
 * needs one, adding `meta` is additive.
 *
 * **B3 obligation:** the query DTO and its `pageSize` ceiling are B3's, exactly as the earthquake
 * list's are E3's — a contract PR publishes no request DTO, so no default is invented here.
 */
export class BookListDto extends PaginationEnvelopeDto {
  @ApiProperty({
    type: BookListItemDto,
    isArray: true,
    description:
      'The page of books, ordered by displayOrder ascending and tie-broken by slugTr. The ' +
      'tie-break is not decoration: displayOrder is hand-assigned and may repeat, and offset ' +
      'pagination without a total order can serve the same book on two pages. slugTr carries a ' +
      'UNIQUE constraint, which is what makes the ordering total rather than merely intended.',
  })
  items!: BookListItemDto[];
}
