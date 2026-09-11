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
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import { LeaderboardDto } from './dto/leaderboard.dto';
import { SubmitGameRoundRequestDto } from './dto/submit-game-round-request.dto';
import { GameRoundSubmitRateLimitGuard } from './game-round-submit-rate-limit.guard';
import { GAME_ROUNDS_ERROR_KEYS } from './game-rounds-error-keys';
import { GameRoundsService } from './game-rounds.service';

/**
 * `/api/game-rounds…` — submit/list a caller's own game-round results, plus the per-mode
 * leaderboard (UYELIK-09, plan §5.7; leaderboard added by P1 PR-C plan §5.3).
 *
 * Every route: `@UseGuards(AccessTokenGuard)` + `@NoTrustedClientExemption()` — the SEC136-I3
 * reasoning applies verbatim: every route returns or persists per-user data behind auth. No
 * route-level `@Throttle` override, for the same reasoning video-progress/favorites already
 * recorded: the global ceiling (120/min per resolved identity) already applies once
 * `@NoTrustedClientExemption()` is present, each read/write touches at most one user's own
 * writable row, is idempotent where it writes, makes no external call, and has no fan-out cost.
 *
 * **`submit` ALSO carries `GameRoundSubmitRateLimitGuard`, chained AFTER `AccessTokenGuard`
 * (UYELIK-09 fix-round-2, `SEC145-I1`/`VAL145-I1`) — the two read routes do not.** The global
 * IP-derived throttle above bounds request RATE per resolved identity, but not per
 * AUTHENTICATED user — a single account fanned out across many IPs could otherwise grow
 * `game_rounds` (the first genuinely unbounded per-user table in this repo) at an effectively
 * unbounded rate. `listMine`/`leaderboard` are reads that create no row, so both are out of that
 * finding's scope and carry no second guard. See {@link GameRoundSubmitRateLimitGuard}'s own
 * docblock for why the ordering is load-bearing and what it does and does not overlap with.
 *
 * **`leaderboard` is this repo's first route that returns another user's personal data by
 * design** (`ENGINEERING.md` §3.6's mandatory flag) — `submit`/`listMine` filter every query by
 * the `userId` taken from `@CurrentUser()` and touch only the caller's own row (no DTO's request
 * shape carries a `userId` at all, so there is no field a caller could even attempt to
 * override); `leaderboard` deliberately does NOT filter by caller, and instead bounds what it
 * publishes about anyone else to `firstName` + a one-grapheme `lastNameInitial` — see
 * {@link GameRoundsService.getLeaderboard}'s own docblock.
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

  @Get('leaderboard')
  @UseGuards(AccessTokenGuard)
  @NoTrustedClientExemption()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'The ranked per-mode leaderboard — every player, one row each, best round first.',
    description:
      'One row per user (their single best qualifying round in the requested mode), ranked ' +
      'over the FULL filtered set so rank stays stable across pages. Each row carries only ' +
      "the row owner's first name plus their surname's initial — never a full surname, an " +
      'id, an e-mail or any other profile field. An unknown or never-played mode answers 200 ' +
      'with an empty page, never 404.',
  })
  @ApiOkResponse({ type: LeaderboardDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: AUTH_ERROR_KEYS.unauthenticated })
  async leaderboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: LeaderboardQueryDto,
  ): Promise<LeaderboardDto> {
    return this.gameRounds.getLeaderboard(user.id, query);
  }
}
