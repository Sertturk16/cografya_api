import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
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
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { NoTrustedClientExemption } from '../common/throttler/throttler-metadata';
import { UpsertVideoProgressRequestDto } from './dto/upsert-video-progress-request.dto';
import { VideoProgressDto } from './dto/video-progress.dto';
import { VideoProgressParams } from './dto/video-progress.params';
import { VIDEO_PROGRESS_ERROR_KEYS } from './video-progress-error-keys';
import { VideoProgressService } from './video-progress.service';

/**
 * `GET`/`PUT /api/video-progress/{bookVideoId}` — one caller's own resume position on one video
 * (UYELIK-05, plan §5.6).
 *
 * Both routes: `@UseGuards(AccessTokenGuard)` + `@NoTrustedClientExemption()` — the SEC136-I3
 * reasoning applies verbatim here: both return or persist per-user data behind auth, so the
 * trusted-client throttle exemption (scoped by HTTP method, not by auth-presence) must not
 * silently wave either of them through. No route-level `@Throttle` override — the global
 * `ThrottlerGuard` ceiling (120/min per resolved identity) already applies once
 * `@NoTrustedClientExemption()` is present, and this write path touches only the caller's own
 * row, is idempotent, makes no external call and has no fan-out cost (plan §5.6, YAGNI —
 * `ENGINEERING.md` §3.1's "per-user/upload endpoints get their own tighter throttle when they
 * land").
 *
 * Every query in {@link VideoProgressService} filters by the `userId` taken from
 * `@CurrentUser()`, never from a client-supplied field — neither DTO's request shape carries a
 * `userId` at all, so there is no field a caller could even attempt to override (the cross-user
 * isolation invariant).
 */
@ApiTags('video-progress')
@Controller('video-progress')
export class VideoProgressController {
  constructor(private readonly videoProgress: VideoProgressService) {}

  @Get(':bookVideoId')
  @UseGuards(AccessTokenGuard)
  @NoTrustedClientExemption()
  @ApiBearerAuth('access-token')
  @ApiParam({ name: 'bookVideoId', format: 'uuid', description: 'book_videos.id.' })
  @ApiOperation({
    summary: "The caller's own saved progress on one video.",
    description:
      'One undifferentiated 404 whether bookVideoId names no video at all or the caller simply ' +
      'has no saved progress for a valid one — a client asking "do I have progress here" gets ' +
      'the same actionable answer (no) regardless of which is true.',
  })
  @ApiOkResponse({ type: VideoProgressDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: AUTH_ERROR_KEYS.unauthenticated })
  @ApiNotFoundResponse({
    type: ApiErrorDto,
    description: VIDEO_PROGRESS_ERROR_KEYS.notFound,
  })
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: VideoProgressParams,
  ): Promise<VideoProgressDto> {
    return this.videoProgress.getOne(user.id, params.bookVideoId);
  }

  @Put(':bookVideoId')
  @UseGuards(AccessTokenGuard)
  @NoTrustedClientExemption()
  @ApiBearerAuth('access-token')
  @ApiParam({ name: 'bookVideoId', format: 'uuid', description: 'book_videos.id.' })
  @ApiOperation({
    summary: "Upsert the caller's own progress on one video (idempotent full-state replace).",
    description:
      "A reported position beyond the video's real duration (when known) or beyond the fallback " +
      'ceiling (when the duration is currently unknown — never synced or purged past 30 days) is ' +
      "REJECTED, not clamped. Returns the persisted row on success, matching AuthResultDto's " +
      'own write-echo precedent.',
  })
  @ApiOkResponse({ type: VideoProgressDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: AUTH_ERROR_KEYS.unauthenticated })
  @ApiNotFoundResponse({
    type: ApiErrorDto,
    description: VIDEO_PROGRESS_ERROR_KEYS.videoNotFound,
  })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: `${VIDEO_PROGRESS_ERROR_KEYS.positionExceedsDuration}, or a malformed body / bookVideoId.`,
  })
  async upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: VideoProgressParams,
    @Body() dto: UpsertVideoProgressRequestDto,
  ): Promise<VideoProgressDto> {
    return this.videoProgress.upsert(
      user.id,
      params.bookVideoId,
      dto.lastPositionSeconds,
      dto.watched,
    );
  }
}
