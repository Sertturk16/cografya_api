import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { GameRoundListQueryDto } from './dto/game-round-list-query.dto';
import type { GameRoundListDto } from './dto/game-round-list.dto';
import type { GameRoundDto } from './dto/game-round.dto';
import type { LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import type { LeaderboardDto } from './dto/leaderboard.dto';
import type { SubmitGameRoundRequestDto } from './dto/submit-game-round-request.dto';
import { GameRound } from './entities/game-round.entity';
import { GAME_ROUNDS_ERROR_KEYS } from './game-rounds-error-keys';
import { toLastNameInitial } from './leaderboard-identity';

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

/** The raw row shape `getLeaderboard`'s page query returns, one per ranked user. */
interface LeaderboardPageRow {
  rank: number;
  score: number;
  found: number;
  first_try: number;
  total_wrongs: number;
  completion_time_seconds: number | null;
  created_at: Date;
  user_id: string;
  first_name: string;
  last_name: string;
}

/**
 * Submit / list-mine / the per-mode leaderboard for `game_rounds` (plan §5.6/§5.3). `submit`
 * and `listMine` take `userId` from `@CurrentUser()` only and read/write ONLY the caller's own
 * rows — no field in either request DTO carries a `userId`, so there is no field a caller could
 * override (the cross-user-isolation invariant, identical in shape to every prior package in
 * this family). **`getLeaderboard` is deliberately NOT isolated the same way** — it is this
 * repo's first read that returns OTHER users' data by design (`ENGINEERING.md` §3.6's mandatory
 * flag, plan §5.3) — `userId` there identifies only the caller for `isCurrentUser` and
 * `meta.currentUserRank`, never a filter on which rows come back.
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
   * The exact idiom `FavoritesService.addTarget` uses after its round-2 fix (`SFH144-I1`) —
   * one polymorphic method today, since P1 PR-A widened favourites' contract and folded the
   * former per-type `addProvince`/`addCountry` pair into it — applied here pre-emptively
   * rather than shipping the naive two-step form.
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

  /**
   * The shared `game_rounds` -> "one best round per user, then ranked" CTE every leaderboard
   * query below is built on (plan §5.3). `$1` is always `mode` — every caller binds it as the
   * query's first parameter.
   *
   * ## Ranking, in one sentence
   * One row per user (`DISTINCT ON ("user_id")`, that user's best candidate round), then
   * `ROW_NUMBER()` over the WHOLE filtered set ordered `score DESC, total_wrongs ASC,
   * first_try DESC, created_at ASC` — a fully deterministic total order, so identical data
   * always produces an identical table and the EARLIEST achievement wins a genuine tie. Rank is
   * computed once over the whole set, not per page, so it stays comparable across pages and
   * against `meta.currentUserRank`. Cast to `::int` here (Postgres' `ROW_NUMBER()` is `bigint`,
   * which the driver would otherwise hand back as a string) so every consumer below reads a
   * plain JS number.
   *
   * ## `"ended_early" = false` — an abandoned round is not a score
   * The api-side counterpart of İRİS's A10: a round the player quit early never becomes a
   * leaderboard entry, however high its partial score already climbed.
   */
  private static readonly RANKED_CTE = `
    WITH "best_rounds" AS (
      SELECT DISTINCT ON ("user_id")
        "user_id", "score", "found", "first_try", "total_wrongs", "completion_time_seconds",
        "created_at"
      FROM "game_rounds"
      WHERE "mode" = $1 AND "ended_early" = false
      ORDER BY "user_id", "score" DESC, "total_wrongs" ASC, "first_try" DESC, "created_at" ASC
    ),
    "ranked" AS (
      SELECT
        "user_id", "score", "found", "first_try", "total_wrongs", "completion_time_seconds",
        "created_at",
        (ROW_NUMBER() OVER (
          ORDER BY "score" DESC, "total_wrongs" ASC, "first_try" DESC, "created_at" ASC
        ))::int AS "rank"
      FROM "best_rounds"
    )
  `;

  /**
   * `GET /api/game-rounds/leaderboard` — one row per user, that user's best qualifying round in
   * `query.mode` (plan §5.3). The `users` join selects ONLY `first_name`/`last_name` — no other
   * column is read, and `last_name` never reaches the DTO as a full value: it is reduced to
   * {@link toLastNameInitial} before it does.
   *
   * Three independent round trips against the SAME ranked set (`RANKED_CTE`), run concurrently.
   * The total is counted SEPARATELY from the page query rather than folded into it as a
   * `COUNT(*) OVER()` window column: a `LIMIT`/`OFFSET` page can legitimately come back EMPTY
   * (a page past the end) while the true total is still nonzero, and a window column carried on
   * the page rows would be lost in exactly that case, silently reporting `total: 0` for a
   * leaderboard that is not actually empty.
   */
  async getLeaderboard(userId: string, query: LeaderboardQueryDto): Promise<LeaderboardDto> {
    const offset = (query.page - 1) * query.pageSize;

    const [totalRows, pageRows, currentUserRankRows] = await Promise.all([
      this.dataSource.query<{ total: number }[]>(
        `${GameRoundsService.RANKED_CTE} SELECT COUNT(*)::int AS "total" FROM "ranked"`,
        [query.mode],
      ),
      this.dataSource.query<LeaderboardPageRow[]>(
        `${GameRoundsService.RANKED_CTE}
         SELECT
           r."rank", r."score", r."found", r."first_try", r."total_wrongs",
           r."completion_time_seconds", r."created_at", r."user_id",
           u."first_name", u."last_name"
         FROM "ranked" r
         JOIN "users" u ON u."id" = r."user_id"
         ORDER BY r."rank" ASC
         LIMIT $2 OFFSET $3`,
        [query.mode, query.pageSize, offset],
      ),
      this.dataSource.query<{ rank: number }[]>(
        `${GameRoundsService.RANKED_CTE} SELECT "rank" FROM "ranked" WHERE "user_id" = $2`,
        [query.mode, userId],
      ),
    ]);

    const [totalRow] = totalRows;
    const total = totalRow === undefined ? 0 : totalRow.total;
    const [currentUserRankRow] = currentUserRankRows;
    const currentUserRank = currentUserRankRow === undefined ? null : currentUserRankRow.rank;

    return {
      items: pageRows.map((row) => ({
        rank: row.rank,
        firstName: row.first_name,
        lastNameInitial: toLastNameInitial(row.last_name),
        score: row.score,
        found: row.found,
        firstTry: row.first_try,
        totalWrongs: row.total_wrongs,
        completionTimeSeconds: row.completion_time_seconds,
        achievedAt: row.created_at.toISOString(),
        isCurrentUser: row.user_id === userId,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      // A page past the end is an empty `items` with `hasMore: false` and a 200 — never a 404,
      // the same rule `listMine` already applies.
      hasMore: query.page * query.pageSize < total,
      meta: {
        mode: query.mode,
        currentUserRank,
      },
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
