import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { GameRoundListQueryDto } from './dto/game-round-list-query.dto';
import type { GameRoundListDto } from './dto/game-round-list.dto';
import type { GameRoundDto } from './dto/game-round.dto';
import type { SubmitGameRoundRequestDto } from './dto/submit-game-round-request.dto';
import { GameRound } from './entities/game-round.entity';
import { GAME_ROUNDS_ERROR_KEYS } from './game-rounds-error-keys';

/**
 * The raw row shape `RETURNING` hands back from the atomic upsert (snake_case, straight off the
 * driver — this is a raw `dataSource.query`, not a repository read).
 */
interface GameRoundUpsertRow {
  client_round_id: string;
  mode: string;
  score: number;
  found: number;
  first_try: number;
  total: number;
  pool_total: number;
  total_wrongs: number;
  ended_early: boolean;
  completion_time_seconds: number | null;
  created_at: Date;
}

/**
 * Submit / list-mine for `game_rounds`, both scoped to the caller's own rows (plan §5.6). Every
 * method takes `userId` from `@CurrentUser()` only — no field in either request DTO carries a
 * `userId`, so there is no field a caller could override (the cross-user-isolation invariant,
 * identical in shape to every prior package in this family).
 */
@Injectable()
export class GameRoundsService {
  constructor(
    @InjectRepository(GameRound)
    private readonly gameRounds: Repository<GameRound>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * `POST /api/game-rounds` — idempotent submit (plan §5.3).
   *
   * ## Cross-field structural validation happens BEFORE the INSERT, in this service
   * Never as a DB `CHECK`, and never treated as anti-cheat — reusing
   * `AddCountryEntityType1785949200000`'s own stated reasoning for splitting single-column
   * bounds from multi-column product rules. This is basic input-shape hygiene
   * (`ENGINEERING.md` §3.2), not a re-derivation of whether the reported score is "true".
   *
   * ## A single atomic `INSERT … ON CONFLICT (user_id, client_round_id) DO UPDATE … RETURNING`
   * The exact idiom `FavoritesService.addProvince`/`addCountry` now use after their round-2 fix
   * (`SFH144-I1`), applied here pre-emptively rather than shipping the naive two-step form.
   * `DO UPDATE SET "user_id" = EXCLUDED."user_id"` is a no-op write on conflict — every other
   * column keeps the row's ORIGINAL values, so `RETURNING` always reflects "the row as first
   * recorded", which is the return-existing idempotency behavior this package commits to (plan
   * §4): a repeat submission for an already-recorded `(user, client_round_id)` pair returns the
   * original values even if the resubmitted body's numbers differ.
   */
  async submit(userId: string, body: SubmitGameRoundRequestDto): Promise<GameRoundDto> {
    if (body.found > body.total) {
      throw new BadRequestException(GAME_ROUNDS_ERROR_KEYS.invalidSummary);
    }
    if (body.firstTry > body.found) {
      throw new BadRequestException(GAME_ROUNDS_ERROR_KEYS.invalidSummary);
    }
    if (body.total > body.poolTotal) {
      throw new BadRequestException(GAME_ROUNDS_ERROR_KEYS.invalidSummary);
    }
    if (!body.endedEarly && body.total !== body.poolTotal) {
      throw new BadRequestException(GAME_ROUNDS_ERROR_KEYS.invalidSummary);
    }

    const completionTimeSeconds = body.completionTimeSeconds ?? null;
    const rows = await this.dataSource.query<GameRoundUpsertRow[]>(
      `INSERT INTO "game_rounds"
         ("user_id", "client_round_id", "mode", "score", "found", "first_try", "total",
          "pool_total", "total_wrongs", "ended_early", "completion_time_seconds")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT ("user_id", "client_round_id") DO UPDATE SET "user_id" = EXCLUDED."user_id"
       RETURNING "client_round_id", "mode", "score", "found", "first_try", "total", "pool_total",
                 "total_wrongs", "ended_early", "completion_time_seconds", "created_at"`,
      [
        userId,
        body.clientRoundId,
        body.mode,
        body.score,
        body.found,
        body.firstTry,
        body.total,
        body.poolTotal,
        body.totalWrongs,
        body.endedEarly,
        completionTimeSeconds,
      ],
    );
    const [row] = rows;
    if (row === undefined) {
      // Cannot happen for an `INSERT … ON CONFLICT DO UPDATE` (there is no DO-NOTHING branch
      // here that could legitimately return zero rows) — kept as a fail-closed guard against
      // `noUncheckedIndexedAccess`, not a reachable runtime path (mirrors `FavoritesService`'s
      // own identical guard verbatim).
      throw new Error('game-rounds: submit upsert returned no row');
    }
    return toDto(row);
  }

  /**
   * `GET /api/game-rounds` — the caller's own history, paginated (plan §5.4). Ordered
   * `DESC` (most recent first) — a history view's natural reading order, deliberately different
   * from favorites' own arbitrary order.
   */
  async listMine(userId: string, query: GameRoundListQueryDto): Promise<GameRoundListDto> {
    const [rows, total] = await this.gameRounds.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return {
      items: rows.map((row) => ({
        mode: row.mode,
        clientRoundId: row.clientRoundId,
        score: row.score,
        found: row.found,
        firstTry: row.firstTry,
        total: row.total,
        poolTotal: row.poolTotal,
        totalWrongs: row.totalWrongs,
        endedEarly: row.endedEarly,
        completionTimeSeconds: row.completionTimeSeconds,
        createdAt: row.createdAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      // A page past the end is an empty `items` with `hasMore: false` and a 200 — never a 404.
      hasMore: query.page * query.pageSize < total,
    };
  }
}

function toDto(row: GameRoundUpsertRow): GameRoundDto {
  return {
    mode: row.mode,
    clientRoundId: row.client_round_id,
    score: row.score,
    found: row.found,
    firstTry: row.first_try,
    total: row.total,
    poolTotal: row.pool_total,
    totalWrongs: row.total_wrongs,
    endedEarly: row.ended_early,
    completionTimeSeconds: row.completion_time_seconds,
    createdAt: row.created_at.toISOString(),
  };
}
