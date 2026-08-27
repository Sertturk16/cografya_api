import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/**
 * Declared ONCE, reused in both the decorator and the e2e — `BOOK_LIST_*`'s own reasoning
 * (plan §5.4): each number would otherwise appear twice in two decorators no tool cross-checks.
 */
export const GAME_ROUNDS_LIST_DEFAULT_PAGE = 1;
export const GAME_ROUNDS_LIST_MAX_PAGE = 10_000; // matches BOOK_LIST_MAX_PAGE's ceiling
export const GAME_ROUNDS_LIST_DEFAULT_PAGE_SIZE = 20;
export const GAME_ROUNDS_LIST_MAX_PAGE_SIZE = 100;

/**
 * Query contract for `GET /api/game-rounds` — mirrors `BookListQueryDto`'s exact decorator shape
 * (plan §5.4). **No shared base query DTO**: `ENGINEERING.md` §2's own stated reason
 * (`class-validator` decorators only ever tighten through inheritance) applies unchanged.
 */
export class GameRoundListQueryDto {
  @ApiPropertyOptional({
    type: 'integer',
    format: 'int32',
    minimum: 1,
    maximum: GAME_ROUNDS_LIST_MAX_PAGE,
    default: GAME_ROUNDS_LIST_DEFAULT_PAGE,
    example: GAME_ROUNDS_LIST_DEFAULT_PAGE,
    description:
      'Page to read, 1-based. A page past the end answers 200 with an empty items array.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(GAME_ROUNDS_LIST_MAX_PAGE)
  page: number = GAME_ROUNDS_LIST_DEFAULT_PAGE;

  @ApiPropertyOptional({
    type: 'integer',
    format: 'int32',
    minimum: 1,
    maximum: GAME_ROUNDS_LIST_MAX_PAGE_SIZE,
    default: GAME_ROUNDS_LIST_DEFAULT_PAGE_SIZE,
    example: GAME_ROUNDS_LIST_DEFAULT_PAGE_SIZE,
    description: 'Rows per page, most-recent-first.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(GAME_ROUNDS_LIST_MAX_PAGE_SIZE)
  pageSize: number = GAME_ROUNDS_LIST_DEFAULT_PAGE_SIZE;
}
