import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Query contract for `GET /api/reference/districts` — **the first request DTO in this repository
 * whose parameter is REQUIRED**, and the first to validate a uuid.
 *
 * ## The parameter is required, and that is a product decision rather than a technical one
 * There is no "all 973 ilçe" response and this DTO is where that is enforced: the registration form
 * asks for an il first and then narrows, so a caller with no `provinceId` has no question the api
 * can answer. Omitting it therefore answers **400**, not "here is everything" — a payload nothing
 * asks for and every crawler would find. `class-validator` produces that 400 from the absence of
 * `@IsOptional()`, so the rule has one statement rather than a check in the service echoing a
 * decorator.
 *
 * ## An unknown `provinceId` is 200 with an empty array, never 404
 * A query parameter is a FILTER, not a resource identifier: `/api/reference/districts` exists
 * whatever value is passed, so the response describes "how many ilçe matched", which can legitimately
 * be none. 404 would say the ROUTE is missing. (The plan's PR-1 acceptance criterion 3; the same
 * line the book list takes on a page past the end.)
 *
 * ## OPEN, and surfaced rather than decided here: nothing publishes a province uuid yet
 * This endpoint keys on `provinces.id` because SPEC §6.2 and §6.5 say so — `?provinceId=<uuid>`,
 * with `users.province_id` a uuid foreign key. **But no endpoint in this repository publishes that
 * id.** Measured against the committed spec: `ProvinceListItemDto`, `ProvinceDetailDto` and
 * `ProvinceMapSummaryDto` expose `plateCode`, `nameTr` and the two slugs and no `id` at all, and
 * every other province-keyed surface joins on `plate_code` — `earthquake_events`' foreign key and
 * `GET /api/earthquakes/provinces/{plateCode}` included. So a browser building the registration
 * form's "İl" select today has a plate code and no uuid to pass here.
 *
 * The endpoint is nonetheless built to its written contract, because closing the gap the other way
 * would be a deviation from an approved plan rather than an implementation choice, and the two ways
 * out land in different PRs: publish `provinces.id` (an additive change to a DTO the plan's §8.1
 * says this package does not touch), or key the whole il surface on `plate_code` (which changes
 * PR-3's `users` columns and the SPEC's own field table). **Atlas owns that call**; it is recorded
 * in this PR's closing summary as an unresolved assumption. Nothing here is wasted either way: the
 * table, the seed, the artefact gates and the response shape are identical under both answers, and
 * only this one parameter moves.
 *
 * ## Unknown query parameters are REJECTED, not ignored
 * The global pipe runs `whitelist: true` + `forbidNonWhitelisted: true` (playbook §3.2), so
 * `?utm_source=x` answers 400 rather than being silently dropped. Playbook §2 records why that is
 * true of THIS endpoint and not of every route: a route with no query DTO never validates its query
 * string at all. Having one is what puts this endpoint on the strict side of that line.
 */
export class DistrictListQueryDto {
  /**
   * The il whose ilçe to list.
   *
   * `@IsUUID()` accepts any uuid version rather than pinning v4. The ids this filters on come from
   * `gen_random_uuid()`, which is v4 today — but the version is a property of how the database
   * happens to mint ids, not of the contract, and a request DTO that pinned it would answer 400 for
   * an id the database could legitimately have issued. What the contract needs is the SHAPE, which
   * is what this validates and what keeps a malformed value from ever reaching a query.
   */
  @ApiProperty({
    format: 'uuid',
    example: '6b3f6f5a-6f5a-4f5a-8f5a-6f5a6f5a6f5a',
    description:
      'İlin kimliği (GET /api/provinces yanıtındaki uuid). Zorunlu: ilçe listesi her zaman bir ile ' +
      'göredir. Geçersiz ya da eksikse 400; geçerli ama karşılığı olmayan bir uuid için boş dizi.',
  })
  @IsUUID()
  provinceId!: string;
}
