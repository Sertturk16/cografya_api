import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AUTH_ERROR_KEYS } from '../auth/auth-error-keys';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { NoTrustedClientExemption } from '../common/throttler/throttler-metadata';
import { GameRoundListQueryDto } from './dto/game-round-list-query.dto';
import { GameRoundListDto } from './dto/game-round-list.dto';
import { GameRoundDto } from './dto/game-round.dto';
import { SubmitGameRoundRequestDto } from './dto/submit-game-round-request.dto';
import { GameRoundSubmitRateLimitGuard } from './game-round-submit-rate-limit.guard';
import { GAME_ROUNDS_ERROR_KEYS } from './game-rounds-error-keys';
import { GameRoundsService } from './game-rounds.service';

/**
 * `/api/game-rounds…` — one caller's own submitted game-round results (UYELIK-09, plan §5.7).
 *
 * Both routes: `@UseGuards(AccessTokenGuard)` + `@NoTrustedClientExemption()` — the SEC136-I3
 * reasoning applies verbatim: both return or persist per-user data behind auth. No route-level
 * `@Throttle` override, for the same reasoning video-progress/favorites already recorded: the
 * global ceiling (120/min per resolved identity) already applies once
 * `@NoTrustedClientExemption()` is present, each write touches only the caller's own row, is
 * idempotent, makes no external call, and has no fan-out cost.
 *
 * **`submit` ALSO carries `GameRoundSubmitRateLimitGuard`, chained AFTER `AccessTokenGuard`
 * (UYELIK-09 fix-round-2, `SEC145-I1`/`VAL145-I1`) — `listMine` does not.** The global
 * IP-derived throttle above bounds request RATE per resolved identity, but not per
 * AUTHENTICATED user — a single account fanned out across many IPs could otherwise grow
 * `game_rounds` (the first genuinely unbounded per-user table in this repo) at an effectively
 * unbounded rate. `listMine` is a read that creates no row, so it is out of that finding's
 * scope and carries no second guard. See {@link GameRoundSubmitRateLimitGuard}'s own docblock
 * for why the ordering is load-bearing and what it does and does not overlap with.
 *
 * Every query in {@link GameRoundsService} filters by the `userId` taken from `@CurrentUser()`,
 * never from a client-supplied field — no DTO's request shape carries a `userId` at all, so
 * there is no field a caller could even attempt to override (the cross-user-isolation
 * invariant).
 */
@ApiTags('game-rounds')
@Controller('game-rounds')
export class GameRoundsController {
  constructor(private readonly gameRounds: GameRoundsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard, GameRoundSubmitRateLimitGuard)
  @NoTrustedClientExemption()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Idempotent submit — record the result of a completed or player-ended-early round.',
    description:
      "Always 200, never 201 — the resource's final state is identical whether this call " +
      "created or found the row, matching this repo's established idempotent-write " +
      'convention (video-progress/favorites). Resubmitting the same clientRoundId for the ' +
      'same caller returns the ORIGINAL recorded values, even if the resubmitted body differs.',
  })
  @ApiOkResponse({ type: GameRoundDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: AUTH_ERROR_KEYS.unauthenticated })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: GAME_ROUNDS_ERROR_KEYS.invalidSummary,
  })
  @ApiTooManyRequestsResponse({
    type: ApiErrorDto,
    description: GAME_ROUNDS_ERROR_KEYS.tooManySubmissions,
  })
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SubmitGameRoundRequestDto,
  ): Promise<GameRoundDto> {
    return this.gameRounds.submit(user.id, body);
  }

  @Get()
  @UseGuards(AccessTokenGuard)
  @NoTrustedClientExemption()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: "The caller's own round history, paginated, most-recent-first.",
    description:
      'The shared pagination envelope, not a plain array — this is the first genuinely ' +
      'unbounded per-user list in this repo (a round-history row is created per played round, ' +
      'with no corpus ceiling).',
  })
  @ApiOkResponse({ type: GameRoundListDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: AUTH_ERROR_KEYS.unauthenticated })
  async listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GameRoundListQueryDto,
  ): Promise<GameRoundListDto> {
    return this.gameRounds.listMine(user.id, query);
  }
}
