import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CacheControl } from '../common/http-cache/cache-control.decorator';
import { BookService } from './book.service';
import { BookDetailDto } from './dto/book-detail.dto';
import { BookListQueryDto } from './dto/book-list-query.dto';
import { BookListDto } from './dto/book-list.dto';
import { BookSlugParams } from './dto/book-slug.params';

/**
 * The `Cache-Control` both book reads publish.
 *
 * The same value the province and country content reads carry, and the sameness is reasoned rather
 * than copied: every byte of these responses is seed-derived, written only by a `pnpm db:seed:books`
 * run, so there is no provider-freshness dimension and none of the marine / air-quality `s-maxage`
 * tiers apply. `no-store` would be wrong for the opposite reason — an empty catalogue is a SEED
 * state, not an outage (`QUESTIONS.md` H-7), and caching it is correct.
 *
 * **B4 obligation, recorded here where it will be read:** once the sync leg starts serving
 * snapshots, these responses begin carrying YouTube API Data under a 30-calendar-day retention cap.
 * The 86 400 s stale-while-revalidate window sits far below the 600 h soft threshold, so this value
 * still looks right — but B4 must confirm that rather than inherit it.
 */
const BOOK_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=86400';

/**
 * Public, read-only book endpoints — the source for the SSG `/kitaplar` hub and detail pages.
 *
 * **No auth guard, by design** (`ENGINEERING.md` §2, the `ProvinceController` precedent):
 * this is public content, `QUESTIONS.md` V-1 left access open, and there is no write endpoint, no
 * admin CRUD and no role on this leg at all — content changes arrive as a seed plus a migration.
 * The one personal-data field, `authorNames`, publishes by owner ruling (2026-08-15,
 * `FU-BOOKS-AUTHOR-PII` closed): they are the künye names printed on the book's own cover.
 *
 * `Cache-Control` rides `@CacheControl` rather than `@Header` so it is set on SUCCESS ONLY. That
 * matters most on the detail route: a 404 for a book not yet seeded must not be cached for five
 * minutes, or the page stays missing for a CDN window after the seed lands.
 */
@ApiTags('books')
@Controller('books')
export class BookController {
  constructor(private readonly bookService: BookService) {}

  @Get()
  @CacheControl(BOOK_CACHE_CONTROL)
  @ApiOperation({
    summary: 'List books, paginated (lean payload for the /kitaplar hub).',
    description:
      'Returns the shared list envelope. Read every book by paging until hasMore is false — the ' +
      'book tier is unbounded, so there is no single request that returns all of them.',
  })
  @ApiOkResponse({ type: BookListDto })
  @ApiBadRequestResponse({
    description:
      'A query parameter is out of range, not an integer, or not recognised. Unknown parameters ' +
      'are rejected rather than ignored.',
  })
  findAll(@Query() query: BookListQueryDto): Promise<BookListDto> {
    return this.bookService.findAll(query);
  }

  @Get(':slug')
  @CacheControl(BOOK_CACHE_CONTROL)
  @ApiOperation({
    summary: 'Get one book by its TR or EN slug, with its full question index.',
    description:
      'One request carries the whole page: künye, coverage, every deneme and all its questions. ' +
      'There is deliberately no separate videos endpoint — the SSG build makes one round trip.',
  })
  @ApiOkResponse({ type: BookDetailDto })
  @ApiNotFoundResponse({ description: 'No book matches the given slug.' })
  @ApiBadRequestResponse({
    description:
      'The slug is not a well-formed slug (lowercase ASCII letters, digits and hyphens, 1-140 ' +
      'characters). Distinct from 404, which means the slug is well-formed and matches no book; ' +
      'a client rendering a page should treat both as "not found".',
  })
  findBySlug(@Param() params: BookSlugParams): Promise<BookDetailDto> {
    return this.bookService.findBySlug(params.slug);
  }
}
