import { ApiProperty } from '@nestjs/swagger';
import { PaginationEnvelopeDto } from '../../common/dto/pagination-envelope.dto';

/**
 * One ranked leaderboard row (plan §5.3) — the repo's first response shape that carries
 * ANOTHER user's data. What it deliberately does NOT carry is the point: no `userId`, no
 * `lastName`, no e-mail, no phone and no other profile field. "Is this me" is answered by
 * {@link LeaderboardEntryDto.isCurrentUser}, derived server-side against `@CurrentUser()` — a
 * client can never resolve a row back to an account.
 *
 * `firstName` + `lastNameInitial` are published as two separate fields rather than one joined
 * `displayName` string on purpose: `ENGINEERING.md` §6 and this module's own error-key
 * docblocks state the house rule that the api never writes user-facing prose (a separator, a
 * full stop) — that formatting belongs to `cografya_web`. `GLOSSARY.md` §7's "skor tablosu adı"
 * row is the product rule this shape publishes.
 */
export class LeaderboardEntryDto {
  @ApiProperty({
    type: Number,
    minimum: 1,
    example: 1,
    description:
      'Position in the FULL ranked set for this mode, 1-based and stable across pages ' +
      '(computed once over every qualifying round, not per page).',
  })
  rank!: number;

  @ApiProperty({
    type: String,
    example: 'Ayşe',
    description: "This row's `users.first_name`, verbatim.",
  })
  firstName!: string;

  @ApiProperty({
    type: String,
    example: 'Y',
    description:
      "Exactly one grapheme: this row's surname, truncated to its first letter and " +
      'Turkish-locale upper-cased. The full surname never leaves the api.',
  })
  lastNameInitial!: string;

  @ApiProperty({ type: Number, minimum: 0, maximum: 100, example: 96 })
  score!: number;

  @ApiProperty({ type: Number, minimum: 0, example: 79 })
  found!: number;

  @ApiProperty({ type: Number, minimum: 0, example: 74 })
  firstTry!: number;

  @ApiProperty({ type: Number, minimum: 0, example: 5 })
  totalWrongs!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: null,
    description: 'Elapsed seconds for this best round, or null when the client sent none.',
  })
  completionTimeSeconds!: number | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-09-08T19:22:11.000Z',
    description: "When this row's best round was recorded (`game_rounds.created_at`).",
  })
  achievedAt!: string;

  @ApiProperty({
    type: Boolean,
    example: true,
    description: "Whether this row is the calling user's own row.",
  })
  isCurrentUser!: boolean;
}

/**
 * The `meta` object for `GET /api/game-rounds/leaderboard` (plan §5.3) — the shared envelope's
 * own rule: everything endpoint-specific lives inside one named `meta`, never as extra
 * top-level keys.
 */
export class LeaderboardMetaDto {
  @ApiProperty({
    type: String,
    example: 'provinces',
    description: 'The mode this page ranks — echoes the request query.',
  })
  mode!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 1,
    description:
      "The caller's own rank in this mode's FULL ranking (comparable to items[].rank across " +
      'pages), or null when the caller has no qualifying round in this mode.',
  })
  currentUserRank!: number | null;
}

/**
 * `GET /api/game-rounds/leaderboard` response — the shared list envelope
 * (`PaginationEnvelopeDto`'s core five) plus one `meta` object (plan §5.3).
 */
export class LeaderboardDto extends PaginationEnvelopeDto {
  @ApiProperty({
    type: LeaderboardEntryDto,
    isArray: true,
    description: 'The page of ranked rows, best-first.',
  })
  items!: LeaderboardEntryDto[];

  @ApiProperty({ type: LeaderboardMetaDto })
  meta!: LeaderboardMetaDto;
}
