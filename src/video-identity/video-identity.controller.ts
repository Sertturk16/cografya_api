import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AUTH_ERROR_KEYS } from '../auth/auth-error-keys';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { NoTrustedClientExemption } from '../common/throttler/throttler-metadata';
import { VideoIdentityDto } from './dto/video-identity.dto';
import { VideoIdentityParams } from './dto/video-identity-params.dto';
import { VIDEO_IDENTITY_ERROR_KEYS } from './video-identity-error-keys';
import { VideoIdentityService } from './video-identity.service';

/**
 * `GET /api/video-identity/{bookVideoId}` — a signed-in member's own way to fetch one video's
 * identity, which the anonymous book payload no longer carries at all (plan §5.3).
 *
 * `@UseGuards(AccessTokenGuard)` + `@NoTrustedClientExemption()` — the same reasoning
 * `VideoProgressController` carries: this route is gated on `Authorization`, so the trusted-client
 * throttle exemption (scoped by HTTP method, not by auth-presence) must not silently wave it
 * through. No route-level `@Throttle` override — the global `ThrottlerGuard` ceiling already
 * applies once `@NoTrustedClientExemption()` is present, and this read is one indexed PK lookup, no
 * external call, no fan-out.
 *
 * **No `@CurrentUser()` parameter, deliberately.** The response content does not depend on WHICH
 * authenticated caller asks — every member sees the same `youtubeVideoId` for the same video — so
 * there is nothing to scope by `userId`. The guard still runs and still gates the route;
 * `@CurrentUser()` exists to *read* the resolved user, which this handler has no use for. This is a
 * deliberate deviation from the `VideoProgressController` precedent (which does need the user id,
 * to scope a personal row), not an oversight.
 */
@ApiTags('video-identity')
@Controller('video-identity')
export class VideoIdentityController {
  constructor(private readonly videoIdentity: VideoIdentityService) {}

  @Get(':bookVideoId')
  @UseGuards(AccessTokenGuard)
  @NoTrustedClientExemption()
  @ApiBearerAuth('access-token')
  @ApiParam({ name: 'bookVideoId', format: 'uuid', description: 'book_videos.id.' })
  @ApiOperation({
    summary: "A signed-in member's own way to fetch one video's identity.",
    description:
      'The anonymous book payload never carries this value (P2) — a member fetches it through ' +
      'this guarded route instead, keyed on the same public bookVideoId the anonymous payload ' +
      'already carries.',
  })
  @ApiOkResponse({ type: VideoIdentityDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: AUTH_ERROR_KEYS.unauthenticated })
  @ApiNotFoundResponse({
    type: ApiErrorDto,
    description: VIDEO_IDENTITY_ERROR_KEYS.notFound,
  })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'A malformed (non-UUID) bookVideoId.',
  })
  async getIdentity(@Param() params: VideoIdentityParams): Promise<VideoIdentityDto> {
    return this.videoIdentity.getIdentity(params.bookVideoId);
  }
}
