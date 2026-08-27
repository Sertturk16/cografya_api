import { ApiProperty } from '@nestjs/swagger';
import { PaginationEnvelopeDto } from '../../common/dto/pagination-envelope.dto';
import { GameRoundDto } from './game-round.dto';

/**
 * A paginated round-history list — the response shape of `GET /api/game-rounds`.
 *
 * ## Why the shared envelope, when `favorites` (the closer precedent) uses a plain array
 * A game-round history row is created per played round, with no corpus ceiling — the first
 * genuinely unbounded per-user list in this repo (plan §2/§5.4), unlike favorites' own bounded
 * <= 280-rows-per-user set. `ENGINEERING.md` §2 reserves the plain array for "bounded and
 * small"; this list does not qualify.
 *
 * No `meta` — this endpoint has no endpoint-specific top-level field (playbook §2's own rule
 * that a list with none carries no `meta` at all).
 */
export class GameRoundListDto extends PaginationEnvelopeDto {
  @ApiProperty({
    type: GameRoundDto,
    isArray: true,
    description:
      "The page of the caller's own rounds, ordered by createdAt DESCENDING (most recent first).",
  })
  items!: GameRoundDto[];
}
