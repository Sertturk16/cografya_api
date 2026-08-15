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
 * The same value the province and country content reads carry. **Most of these responses are
 * seed-derived** — künye, denemeler, questions and start seconds are written only by a
 * `pnpm db:seed:books` run — but since B4 the nested `youtube` object carries YouTube API Data held
 * under a retention cap, so this is no longer a purely seed-derived body and the value cannot be
 * inherited on that argument alone. `no-store` would still be wrong for the opposite reason — an
 * empty catalogue is a SEED state, not an outage (`QUESTIONS.md` H-7), and caching it is correct.
 *
 * ## B4's obligation, discharged: the arithmetic that binds this window to the retention ceiling
 * A body is generated only while its snapshot is younger than the SOFT threshold
 * (`YOUTUBE_API_DATA_SOFT_MAX_AGE_HOURS`); the row is deleted at the HARD one
 * (`YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS`). A CDN may keep serving a generated body for
 * `max-age + stale-while-revalidate` after that. So the value republished latest is at most
 *
 * > `soft + max-age + stale-while-revalidate`
 *
 * and it stays inside the ceiling exactly while
 *
 * > `max-age + stale-while-revalidate < hard − soft`.
 *
 * At the defaults that is `300 s + 86 400 s ≈ 24.1 h` against `720 h − 600 h = 120 h`: ~5× of
 * margin, and the worst-case republication lands at ~624.1 h against a 720 h ceiling. The window is
 * therefore confirmed rather than inherited.
 *
 * **The residual, recorded rather than guarded.** Both thresholds are operator-configurable, and a
 * lowered ceiling narrows that margin: at `hard = 24` / `soft = 12` the margin is 12 h and the
 * ~24.1 h window would exceed it, so a body could be served after its row was deleted. Nothing in
 * the boot schema refuses that combination and nothing here should — a sixth `checkEnvBound` was
 * considered at the #111 review and rejected as YAGNI (`ENGINEERING.md` §12): the defaults hold with
 * 5× of room, and the only configuration that breaks the invariant is one an operator has to set by
 * hand. An operator who lowers the ceiling must lower this constant with it.
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
