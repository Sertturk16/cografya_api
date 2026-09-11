import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { CacheControl } from '../common/http-cache/cache-control.decorator';
import { VideoCoverParams } from './dto/video-cover-params.dto';
import { VIDEO_COVER_ROUTE_SEGMENT } from './video-cover-address';
import { VideoCoverService } from './video-cover.service';

/**
 * Long, mirroring the elevation `PROFILE_CACHE_CONTROL` reasoning: an aged-out or purged snapshot
 * answers the identical 404 a cold cache miss would, so nothing here risks serving a cached SUCCESS
 * body past the point the underlying row stops being servable — the cache is the client's/CDN's,
 * keyed on our own address, and simply re-asks us once it expires (plan §5.5).
 */
const VIDEO_COVER_CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=604800';

/**
 * Tighter than the global 120/min, mirroring `ElevationController`'s "this route can reach an
 * external provider" precedent — but not its exact number: this route is hit once per rendered
 * book-page thumbnail, and a single shared IP (a school's NAT, a classroom) can legitimately
 * generate many requests quickly, sized for "many thumbnails, one visitor" rather than elevation's
 * "one action, one visitor" (plan §5.7). A first-cut default, flagged for confirmation before real
 * production traffic (plan §13).
 */
const VIDEO_COVER_THROTTLE_LIMIT = 60;
const VIDEO_COVER_THROTTLE_TTL_MS = 60_000;

/**
 * The public, unauthenticated cover-proxy route — plan §5.2.
 *
 * **No auth guard, by design**: this content is exactly as public as `GET /api/books/{slug}`
 * already is. **No `@NoTrustedClientExemption`**: that decorator exists to stop the trusted-forwarder
 * exemption from bypassing per-visitor throttling on a GATED route; every caller of this route is an
 * anonymous reader's own browser rendering `<img src>`, not a trusted server-to-server forwarder, so
 * the question the decorator answers does not arise here.
 */
@ApiTags('video-cover')
@Controller(VIDEO_COVER_ROUTE_SEGMENT)
export class VideoCoverController {
  constructor(private readonly videoCover: VideoCoverService) {}

  @Get(':bookVideoId')
  @CacheControl(VIDEO_COVER_CACHE_CONTROL)
  @Throttle({ default: { limit: VIDEO_COVER_THROTTLE_LIMIT, ttl: VIDEO_COVER_THROTTLE_TTL_MS } })
  @ApiParam({ name: 'bookVideoId', format: 'uuid', description: 'book_videos.id.' })
  @ApiOperation({
    summary: "The api's own cover proxy for one book video — never the provider's own address.",
    description:
      "Proxies the video's cover bytes from the api's own address, keyed on the video's own " +
      'already-public bookVideoId. No response this route can produce — success, 404, or any ' +
      "unexpected error — ever carries the provider's own video identity, in a field value or " +
      'embedded in an address path segment. Every failure state (an unknown id, a non-servable ' +
      'snapshot, a disallowed upstream host, or any upstream failure) answers the identical 404 — ' +
      'nothing distinguishes WHY a cover is unavailable.',
  })
  @ApiOkResponse({ description: 'The cover image bytes. Content-Type: image/jpeg.' })
  @ApiBadRequestResponse({ description: 'bookVideoId is not a well-formed UUID.' })
  @ApiNotFoundResponse({ description: 'No cover is available for this id, for any reason.' })
  @ApiTooManyRequestsResponse({
    description:
      'The per-client rate limit for this route was exceeded. Tighter than the global limit ' +
      'because this route can reach an external provider.',
  })
  async getCover(@Param() params: VideoCoverParams): Promise<StreamableFile> {
    return this.videoCover.getCover(params.bookVideoId);
  }
}
