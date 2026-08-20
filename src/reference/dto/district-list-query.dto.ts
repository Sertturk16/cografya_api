import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

/**
 * Query contract for `GET /api/reference/districts` — **the first request DTO in this repository
 * whose parameter is REQUIRED**.
 *
 * ## The key is the plate code, and that was a ruling (→ `DEC 2026-08-21c`)
 * This endpoint keyed on `provinces.id` in its first revision, because SPEC §6.5 wrote
 * `?provinceId=<uuid>`. Measured against the committed spec, that key was unreachable: no endpoint
 * in this repository publishes a province uuid — `ProvinceListItemDto`, `ProvinceDetailDto` and
 * `ProvinceMapSummaryDto` expose `plateCode`, `nameTr` and the two slugs and no `id` at all — so a
 * browser building the registration form's "İl" select had nothing to pass. `plate_code` is what
 * the repo already binds provinces by on its public surface (`earthquake_events.binding_plate_code`,
 * `GET /api/earthquakes/provinces/{plateCode}`), it is `unique` on the entity, and it is human-
 * readable and permanent. The ruling picked it and left the surrogate key unpublished.
 *
 * **`districts.province_id` is untouched by this.** The foreign key is still the uuid; resolving a
 * plate code to it is the service's job, which is exactly where a lookup key differing from a
 * storage key belongs.
 *
 * ## The parameter is required, and that is a product decision rather than a technical one
 * There is no "all 973 ilçe" response and this DTO is where that is enforced: the registration form
 * asks for an il first and then narrows, so a caller with no plate code has no question the api can
 * answer. Omitting it therefore answers **400**, not "here is everything" — a payload nothing asks
 * for and every crawler would find. `class-validator` produces that 400 from the absence of
 * `@IsOptional()`, so the rule has one statement rather than a check in the service echoing a
 * decorator.
 *
 * ## An unknown plate code is 200 with an empty array, never 404
 * A query parameter is a FILTER, not a resource identifier: `/api/reference/districts` exists
 * whatever value is passed, so the response describes "how many ilçe matched", which can
 * legitimately be none. 404 would say the ROUTE is missing. This is the one place the endpoint
 * deliberately parts company with `PlateCodeParams`' 400-vs-404 table (`route-params.dto.ts`),
 * which reasons about INDEXABLE route families — `/api/earthquakes/provinces/{plateCode}` is a
 * path segment behind a page, and a crawler treats its two answers differently. This route is a
 * form-filling read with no page behind it, so there is no such distinction to preserve.
 *
 * ## Unknown query parameters are REJECTED, not ignored
 * The global pipe runs `whitelist: true` + `forbidNonWhitelisted: true` (playbook §3.2), so
 * `?utm_source=x` — and, since this revision, the retired `?provinceId=` — answer 400 rather than
 * being silently dropped. Playbook §2 records why that is true of THIS endpoint and not of every
 * route: a route with no query DTO never validates its query string at all. Having one is what puts
 * this endpoint on the strict side of that line, and it is what makes the retired parameter fail
 * loudly instead of being ignored into a full-table read.
 */
export class DistrictListQueryDto {
  /**
   * The il whose ilçe to list, by plate code.
   *
   * ## Where the shape comes from
   * `provinces.plate_code` is `varchar(2)` and **zero-padded by seed discipline** ("01"…"09", never
   * "1"…"9"), because the column is a two-character string precisely so the lexical
   * `ORDER BY plate_code` stays correct (`province.entity.ts`). So `6` is not a lenient spelling of
   * `06`: it is a different key that resolves to nothing, and `^\d{2}$` is the column's own shape
   * rather than a stricter reading of it.
   *
   * ## Why it is not `^(0[1-9]|[1-7]\d|8[01])$`
   * Pinning 01–81 would encode a FACT about how many provinces Türkiye has into a request
   * contract. `route-params.dto.ts` already states the principle this follows: a pattern tighter
   * than the data is not a stricter API, it is a wrong answer — and the day an 82nd plate code
   * exists, a pinned pattern 400s a well-formed request before the seed can land. The membership
   * question is answered by the join, which returns an empty array.
   *
   * ## This is a SECOND statement of the same shape, and the alternative was weighed
   * `PlateCodeParams.plateCode` carries the identical `^\d{2}$`. Exporting one shared constant was
   * considered and NOT taken: it would change the published surface of a shared `common/dto` file
   * that this task did not otherwise touch, and `ENGINEERING.md` §2 keeps query DTOs per-endpoint
   * on purpose (a shared base can only ever tighten). The drift this leaves is bounded and worth
   * naming rather than hiding — if the two patterns ever disagree, one route 400s where the other
   * answers 200 with an empty array, for a plate code that names no province either way. Should a
   * third statement of this shape ever be needed, that is the moment to export the constant.
   */
  @ApiProperty({
    example: '34',
    pattern: '^\\d{2}$',
    description:
      'İlin plaka kodu, iki hane ve başı sıfırla dolgulu ("06", "6" değil) — GET /api/provinces ' +
      'yanıtındaki plateCode. Zorunlu: ilçe listesi her zaman bir ile göredir. Biçimi bozuksa ya ' +
      'da eksikse 400; biçimi doğru ama karşılığı olmayan bir kod için boş dizi.',
  })
  @Matches(/^\d{2}$/, { message: 'plateCode must be exactly two digits (zero-padded)' })
  plateCode!: string;
}
