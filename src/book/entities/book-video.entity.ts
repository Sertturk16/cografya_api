import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * One deneme's video solution — the join between a book's deneme number and a YouTube video id.
 *
 * ## What this row deliberately does NOT store
 * **The video's title.** `timestamps.json` carries YouTube's title on every record and the seed
 * loader does not read it (SPEC §5.2). Three independent reasons, and each alone would be enough:
 * the heading the reader sees is OURS ("Deneme 12"), not the channel's; a stored title would be
 * API Data and would drag a 30-day retention obligation onto a permanent row for no benefit; and
 * the API can return a machine-translated title under `hl`, which `SEO-POLICY.md` §B14 bars from
 * publication. Not storing it means none of the three ever arises.
 *
 * ## No `slug_tr` / `slug_en`, and that is a RULING not an omission
 * Playbook §5 requires localized slugs on public entities because the web repo routes on them.
 * There is **no per-deneme page and no per-question page** (SPEC §4.3): a book yields 30
 * near-identical thin pages and four books yield 120, which is the shape `SEO-POLICY.md` §12.1
 * targets, and deep links are served by fragments (`#deneme-12`, `#deneme-12-soru-3`) exactly as
 * `#iller`/`#ulkeler` are (→ DEC 2026-08-04i §2). With no page there is no route, and with no
 * route a slug would be a column nothing resolves. Playbook §5 records the exception, which this
 * PR widens from `earthquake_events` to the class those three tables share.
 *
 * ## B1 scope
 * Schema and contract only — rows arrive with the B2 seed (SPEC §16).
 */
@Entity('book_videos')
// The MIGRATION is the truth for these constraints; the decorators are declared so the access
// paths read beside the columns (the `EarthquakeEvent` precedent).
//
// There is no separate `INDEX (book_id, deneme_no)`: this UNIQUE constraint IS a unique B-tree
// index on exactly those columns in exactly that order, so SPEC §5.2's index line is satisfied by
// it. Creating both would be one physical index paying for two.
@Unique('UQ_book_videos_book_deneme', ['bookId', 'denemeNo'])
// A video belongs to ONE book. Two books claiming the same video would mean the same 6 start
// seconds published under two different denemeler, and only one of them could be right.
@Unique('UQ_book_videos_youtube_video_id', ['youtubeVideoId'])
export class BookVideo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Owning book. `ON DELETE CASCADE`: a deneme has no meaning without its book. */
  @Column({ name: 'book_id', type: 'uuid' })
  bookId!: string;

  /**
   * The deneme's number **in the book** (`GLOSSARY.md` §4.2, `deneme numarası (denemeNo)`).
   *
   * **Not the playlist position** — the two diverge, by +1 after 14 and by +2 after 21 (→ DEC
   * 2026-08-12p md.5), because denemeler 14 and 22 exist in the book while their solution videos
   * do not. The playlist position is stored NOWHERE, so no code path can accidentally reach for
   * the wrong one.
   *
   * The Turkish name is a `GLOSSARY.md` §4.2 ruling, not a lapse: NOVA declined to mint an English
   * equivalent because "deneme" splits across *practice test* / *mock exam* / *trial exam* with no
   * authority behind any of them, so the Turkish term is preserved in the field name — the same
   * class as `plaka kodu`.
   */
  @Column({ name: 'deneme_no', type: 'integer' })
  denemeNo!: number;

  /**
   * The YouTube video id, exactly 11 characters of `[A-Za-z0-9_-]`.
   *
   * The check constraint is worth its cost because the failure it prevents is invisible: an id one
   * character short is a dead embed, and every structural test still passes. `varchar(16)` rather
   * than `varchar(11)` leaves room for the id format to grow without a migration; the CHECK, not
   * the length, is what pins today's shape.
   *
   * Whether the ID ITSELF is API Data under the 30-day rule was left unresolved on purpose (K-M):
   * the daily `videos.list` tour re-verifies every id we hold, so the "refresh" half of "delete or
   * refresh" is continuously satisfied and the question does not need an answer to be safe.
   */
  @Column({ name: 'youtube_video_id', type: 'varchar', length: 16 })
  youtubeVideoId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
