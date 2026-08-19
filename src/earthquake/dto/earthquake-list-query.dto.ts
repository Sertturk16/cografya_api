import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsNumber, IsOptional, Matches, Max, Min } from 'class-validator';

/**
 * The numbers this endpoint's request contract is made of, each declared ONCE.
 *
 * They are exported because the e2e pins the BEHAVIOUR without restating the values: a test that
 * hardcoded `200` would silently stop testing the real ceiling the day somebody tuned it, and
 * re-typing a fact into an assertion is what `CONVENTIONS.md` §2's structural-test rule forbids.
 *
 * Each also appears TWICE in this file — once in a `class-validator` decorator, which decides what
 * the server accepts, and once in `@ApiPropertyOptional`, which decides what the contract PROMISES.
 * Two copies of one number in two decorators that no tool cross-checks is this repo's named drift
 * class (`BookListQueryDto`), and a constant is what collapses them into one.
 */

/**
 * The magnitude floor when the caller names none — `QUESTIONS.md` D-2, ruled by `DEC 2026-08-12k`.
 *
 * A COMPILE-TIME constant rather than an env variable, and the reason is the contract rather than
 * taste: `@nestjs/swagger` publishes this default into `openapi/openapi.json`, which the web repo
 * reads. An env-driven default would be baked into that committed artifact from whatever
 * environment the generator happened to run in, so a deployment could serve a different floor than
 * the contract promises with no gate able to see it. The number is a ruled product decision, not an
 * operational knob (SPEC §14's `EARTHQUAKE_MIN_MAGNITUDE_DEFAULT` proposal, resolved this way at
 * the E3 plan gate).
 *
 * The floor is applied at DISPLAY time and never at ingest: everything is stored, so lowering it
 * finds real data rather than a hole (D-C).
 */
export const EARTHQUAKE_DEFAULT_MIN_MAGNITUDE = 2.5;

/** Magnitudes below this are not a filter, they are a typo. Negative values are real (SPEC §3.2). */
export const EARTHQUAKE_MIN_MAGNITUDE_FLOOR = -1;

/** No instrument has recorded one this large; a request past it is a mistake, not a query. */
export const EARTHQUAKE_MIN_MAGNITUDE_CEILING = 10;

export const EARTHQUAKE_LIST_DEFAULT_PAGE = 1;

/**
 * Stops a crawler walking an unbounded OFFSET sequence (the `BOOK_LIST_MAX_PAGE` precedent).
 *
 * SPEC §13 item 13 asks for a 400 when "the page × pageSize ceiling" is exceeded. It is implemented
 * as the TWO published ceilings — this one and {@link EARTHQUAKE_LIST_MAX_PAGE_SIZE} — rather than
 * as a cross-parameter product rule, because OpenAPI cannot express a product and a rule the web
 * repo cannot read is a rule it will violate. The window ceiling below bounds the row set
 * independently, so a large offset lands on an exhausted result rather than on an unbounded scan.
 */
export const EARTHQUAKE_LIST_MAX_PAGE = 10_000;

export const EARTHQUAKE_LIST_DEFAULT_PAGE_SIZE = 50;

/** SPEC §6.3. A contract bound, not a DoS bound: an unbounded page serialises the whole archive. */
export const EARTHQUAKE_LIST_MAX_PAGE_SIZE = 200;

/** The window when the caller names neither end — SPEC §6.3's "last 7 days". */
export const EARTHQUAKE_DEFAULT_WINDOW_DAYS = 7;

/**
 * The widest window a single request may ask for.
 *
 * 366 days covers D-A's one-year initial load — the widest page the product plans — while keeping
 * one request from walking a permanent archive that grows by ~33 000 rows a year.
 */
export const EARTHQUAKE_MAX_WINDOW_DAYS = 366;

/**
 * An ISO-8601 instant that states its own offset: `…Z` or `…+03:00`.
 *
 * A timezone-LESS string is refused rather than assumed, and on this leg that is the single most
 * expensive defect class rather than pedantry: AFAD publishes UTC without a suffix while its own
 * page shows the same event shifted +3 hours, so reading a bare `2026-08-10T10:07:59` as local time
 * publishes every earthquake three hours wrong (SPEC §3.3, R1/R11). Accepting one at our own
 * boundary would reintroduce exactly that ambiguity one layer up, where no fidelity rule is
 * watching. A bare calendar date is refused for the same reason — `2026-08-01` has no single
 * instant until somebody picks a zone.
 */
const ISO_WITH_EXPLICIT_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * Query contract for `GET /api/earthquakes` and the per-province path.
 *
 * ## Defaults live in the property initialisers, not in the service
 * `transform: true` on the global pipe constructs the class, so an absent parameter keeps its
 * initialiser and the service never sees `undefined`. A default hidden behind a `?? 50` in a
 * service expression is invisible in `openapi.json`, which is where the web repo reads it
 * (`ENGINEERING.md` §2).
 *
 * ## Unknown query parameters are REJECTED, not ignored
 * The global pipe runs `whitelist: true` + `forbidNonWhitelisted: true`, so `?utm_source=x` answers
 * 400. This endpoint takes no exception: it is called server-to-server by the SSG build, not by a
 * browser following a tagged link.
 *
 * ## There is no `plateCode` parameter here, deliberately
 * The province filter is its own path (`/api/earthquakes/provinces/{plateCode}`), so that a plate
 * code naming no province is a 404 — SPEC §12's single 404 — rather than a 200 with an empty list.
 * Two surfaces for one filter would answer the same mistake two different ways, and a crawler
 * treats those answers differently. Adding the parameter later would be additive; ruled at the E3
 * plan gate.
 */
export class EarthquakeListQueryDto {
  /** The magnitude floor. See {@link EARTHQUAKE_DEFAULT_MIN_MAGNITUDE}. */
  @ApiPropertyOptional({
    type: 'number',
    minimum: EARTHQUAKE_MIN_MAGNITUDE_FLOOR,
    maximum: EARTHQUAKE_MIN_MAGNITUDE_CEILING,
    default: EARTHQUAKE_DEFAULT_MIN_MAGNITUDE,
    example: EARTHQUAKE_DEFAULT_MIN_MAGNITUDE,
    description:
      'Only events at or above this magnitude. Applied at display time, never at ingest — ' +
      'everything is stored, so lowering it returns real data rather than a hole. The applied ' +
      'value is echoed back in meta.filter.',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(EARTHQUAKE_MIN_MAGNITUDE_FLOOR)
  @Max(EARTHQUAKE_MIN_MAGNITUDE_CEILING)
  minMagnitude: number = EARTHQUAKE_DEFAULT_MIN_MAGNITUDE;

  /**
   * Start of the window, inclusive. Absent means {@link EARTHQUAKE_DEFAULT_WINDOW_DAYS} before the
   * window's end.
   */
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    example: '2026-08-12T00:00:00.000Z',
    description:
      'Window start, inclusive. MUST carry an explicit zone (Z or ±HH:MM) — a timezone-less ' +
      'timestamp is rejected rather than guessed. Defaults to 7 days before the window end; the ' +
      'window applied is echoed back as concrete instants in meta.filter.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(ISO_WITH_EXPLICIT_ZONE, {
    message: 'fromUtc must state its timezone explicitly (…Z or ±HH:MM)',
  })
  fromUtc?: string;

  /** End of the window, inclusive. Absent means "now", plus the clock-skew allowance. */
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    example: '2026-08-19T12:00:00.000Z',
    description:
      'Window end, inclusive, with the same explicit-zone rule as fromUtc. Defaults to now plus ' +
      'the clock-skew allowance, so an event stamped slightly ahead of our clock is still the ' +
      'newest row rather than an invisible one. The window may span at most 366 days.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(ISO_WITH_EXPLICIT_ZONE, {
    message: 'toUtc must state its timezone explicitly (…Z or ±HH:MM)',
  })
  toUtc?: string;

  /** 1-based page index. */
  @ApiPropertyOptional({
    // `'integer'` rather than `Number`: the validator enforces `@IsInt()`, and a contract that
    // published `number` would let a consumer generate `1.5` as a legal page and receive a 400 for
    // a request its own types called valid.
    type: 'integer',
    format: 'int32',
    minimum: 1,
    maximum: EARTHQUAKE_LIST_MAX_PAGE,
    default: EARTHQUAKE_LIST_DEFAULT_PAGE,
    example: EARTHQUAKE_LIST_DEFAULT_PAGE,
    description:
      'Page to read, 1-based. A page past the end answers 200 with an empty items array, never ' +
      '404.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(EARTHQUAKE_LIST_MAX_PAGE)
  page: number = EARTHQUAKE_LIST_DEFAULT_PAGE;

  /** Rows per page. */
  @ApiPropertyOptional({
    type: 'integer',
    format: 'int32',
    minimum: 1,
    maximum: EARTHQUAKE_LIST_MAX_PAGE_SIZE,
    default: EARTHQUAKE_LIST_DEFAULT_PAGE_SIZE,
    example: EARTHQUAKE_LIST_DEFAULT_PAGE_SIZE,
    description:
      'Rows per page. Read a whole window by paging until hasMore is false; this ceiling is the ' +
      'contract that bounds how many requests that takes.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(EARTHQUAKE_LIST_MAX_PAGE_SIZE)
  pageSize: number = EARTHQUAKE_LIST_DEFAULT_PAGE_SIZE;
}
