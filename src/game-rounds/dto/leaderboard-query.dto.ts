import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, Length, Matches, Max, Min } from 'class-validator';

/**
 * Declared ONCE and reused in both the decorator pair and the e2e — `GAME_ROUNDS_LIST_*`'s own
 * "declare once, reuse in both" reasoning (P1 PR-C plan §5.3). These are **new** constants, not
 * a reuse of `GAME_ROUNDS_LIST_*`: no shared base query DTO exists in this repo
 * (`ENGINEERING.md` §2's own stated tooling constraint — `class-validator` decorators only ever
 * TIGHTEN through inheritance), and two endpoints should not share one ceiling by accident.
 */
export const LEADERBOARD_DEFAULT_PAGE = 1;
export const LEADERBOARD_MAX_PAGE = 10_000;
export const LEADERBOARD_DEFAULT_PAGE_SIZE = 20;
export const LEADERBOARD_MAX_PAGE_SIZE = 50;

/**
 * Query contract for `GET /api/game-rounds/leaderboard` (plan §5.3).
 *
 * `mode` is **required** and uses the same charset `SubmitGameRoundRequestDto.mode` does —
 * never validated against a closed set (the entity's own "plain varchar, not a native enum"
 * ruling). A mode with no qualifying rounds yet answers **200 with an empty page**, never 404:
 * an empty leaderboard is a real, valid answer for a mode nobody has played.
 */
export class LeaderboardQueryDto {
  @ApiProperty({
    type: String,
    example: 'provinces',
    minLength: 1,
    maxLength: 40,
    pattern: '^[a-z][a-z0-9-]{0,39}$',
    description:
      'The game mode to rank. Never validated against a closed set; an unknown mode answers ' +
      '200 with an empty page, not 404.',
  })
  @IsString()
  @Length(1, 40)
  @Matches(/^[a-z][a-z0-9-]{0,39}$/, {
    message:
      'mode must start with a lowercase letter and contain only lowercase letters, digits or hyphens',
  })
  mode!: string;

  @ApiPropertyOptional({
    type: 'integer',
    format: 'int32',
    minimum: 1,
    maximum: LEADERBOARD_MAX_PAGE,
    default: LEADERBOARD_DEFAULT_PAGE,
    example: LEADERBOARD_DEFAULT_PAGE,
    description:
      'Page to read, 1-based. A page past the end answers 200 with an empty items array.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LEADERBOARD_MAX_PAGE)
  page: number = LEADERBOARD_DEFAULT_PAGE;

  @ApiPropertyOptional({
    type: 'integer',
    format: 'int32',
    minimum: 1,
    maximum: LEADERBOARD_MAX_PAGE_SIZE,
    default: LEADERBOARD_DEFAULT_PAGE_SIZE,
    example: LEADERBOARD_DEFAULT_PAGE_SIZE,
    description: 'Rows per page, ranked best-first.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LEADERBOARD_MAX_PAGE_SIZE)
  pageSize: number = LEADERBOARD_DEFAULT_PAGE_SIZE;
}
