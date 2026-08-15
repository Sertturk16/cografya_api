import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/**
 * The four numbers `DEC 2026-08-15h` item 3 approved, each declared ONCE.
 *
 * They are exported for the same reason `THROTTLE_TTL_MS`/`THROTTLE_LIMIT` are: the e2e suite
 * pins the BEHAVIOUR without restating the values. A test that hardcoded `100` would silently
 * stop testing the real ceiling the day somebody tuned it, and re-typing a fact into an assertion
 * is what `CONVENTIONS.md` §2's structural-test rule forbids.
 *
 * They are constants rather than inline literals for a second, sharper reason: each number would
 * otherwise appear TWICE in this file — once in `@Max`, which decides what the server accepts,
 * and once in `@ApiPropertyOptional`, which decides what the contract PROMISES. Two copies of one
 * number, in two decorators that no tool cross-checks, is this repo's named drift class; the day
 * they disagree the web repo pages against a ceiling the server rejects.
 */
export const BOOK_LIST_DEFAULT_PAGE = 1;
export const BOOK_LIST_MAX_PAGE = 10_000;
export const BOOK_LIST_DEFAULT_PAGE_SIZE = 50;
export const BOOK_LIST_MAX_PAGE_SIZE = 100;

/**
 * Query contract for `GET /api/books` — **the first request DTO in this repository**.
 *
 * Measured before writing it: `@Query` appears nowhere else in `src/`, so there was no house
 * pattern to follow and this file establishes one. The rule it establishes is recorded in the
 * playbook (§2) rather than only here, because the next list endpoint (E3) inherits the shape.
 *
 * ## The ceilings are ENDPOINT-SPECIFIC, and that is why there is no shared base class
 * `DEC 2026-08-15h` item 3 approved these four numbers and refused a shared base in the same
 * breath, for a reason that is a property of the tooling rather than a preference:
 * class-validator decorators ACCUMULATE through inheritance, so a subclass can only ever TIGHTEN
 * a base `@Max` — never loosen it. A base class would therefore have to carry the lowest ceiling
 * any endpoint will ever want, and every endpoint needing a higher one would have to stop
 * extending it. A ceiling a subclass cannot raise is the wrong shape for a value that is
 * per-endpoint by definition.
 *
 * ## Defaults live in the property initialisers, not in the service
 * `transform: true` on the global pipe constructs the class, so an absent parameter keeps its
 * initialiser and the service never sees `undefined`. Putting the default here rather than behind
 * a `?? 50` in the service is what lets `@nestjs/swagger` publish it: the web repo reads the
 * ceiling and the default out of `openapi.json`, and a default that exists only in a service
 * expression is invisible there (`kitap-video-web/SPEC.md` §6 E2 asked for exactly this).
 *
 * ## Unknown query parameters are REJECTED, not ignored
 * The global pipe runs `whitelist: true` + `forbidNonWhitelisted: true` (playbook §3.2), so
 * `?utm_source=x` answers 400 rather than being silently dropped. That is the repo-wide input
 * rule and this endpoint does not carve itself an exception: it is called server-to-server by the
 * SSG build, not by a browser following a tagged link.
 */
export class BookListQueryDto {
  /** 1-based page index. */
  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: BOOK_LIST_MAX_PAGE,
    default: BOOK_LIST_DEFAULT_PAGE,
    example: BOOK_LIST_DEFAULT_PAGE,
    description:
      'Page to read, 1-based. The ceiling exists so a crawler cannot walk an unbounded OFFSET ' +
      'sequence; a page past the end answers 200 with an empty items array, never 404.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(BOOK_LIST_MAX_PAGE)
  page: number = BOOK_LIST_DEFAULT_PAGE;

  /**
   * Rows per page.
   *
   * The maximum is what makes `hasMore` a usable contract for the web repo: the sitemap and
   * `generateStaticParams` need EVERY book, so they page until `hasMore === false`, and a
   * published ceiling is what tells them how many round trips that is.
   */
  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: BOOK_LIST_MAX_PAGE_SIZE,
    default: BOOK_LIST_DEFAULT_PAGE_SIZE,
    example: BOOK_LIST_DEFAULT_PAGE_SIZE,
    description:
      'Rows per page. Read every book by paging until hasMore is false; this ceiling is the ' +
      'contract that bounds how many requests that takes.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(BOOK_LIST_MAX_PAGE_SIZE)
  pageSize: number = BOOK_LIST_DEFAULT_PAGE_SIZE;
}
