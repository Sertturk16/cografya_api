import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ExamTrack } from '../book.types';

/**
 * One book whose video solutions we index — the künye row behind `/kitaplar/{slug_tr}`.
 *
 * ## The permanent half of the two-table-family split
 * SPEC §4.2 is the one architectural decision this leg has: fields WE own are permanent, fields
 * the YouTube Data API returns may be kept for at most 30 calendar days (Developer Policies
 * III.E.4.d). That boundary is written into the SCHEMA rather than into a comment — this table,
 * `book_videos` and `book_video_questions` are ours and never expire, while every API-sourced
 * field lives in `youtube_video_snapshots` and is deleted unconditionally. The payoff is
 * mechanical: "delete what is older than 30 days" is a `DELETE FROM`, so no column added to the
 * SNAPSHOT table can weaken the purge. Had the API fields been nullable columns on these rows, the
 * purge would have been an `UPDATE … SET … = NULL` whose column list silently goes stale.
 *
 * What that does NOT buy — stated because the earlier wording claimed it did: adding a column
 * **here** is not automatically safe. Putting an API-sourced value on this permanent table would
 * put API Data outside the purge's reach entirely, which is a worse failure than a stale column
 * list. The rule the split enforces is "API-sourced values live in the perishable table", and it
 * is enforced by review, not by the schema.
 *
 * The consequence worth stating: the page is COMPLETE without the API. The künye, the denemeler,
 * the questions and the 180 start seconds are all ours; a total YouTube outage costs the
 * `VideoObject` structured data and the thumbnail, nothing else.
 *
 * ## No price, no stock, no offer — and one outbound link
 * `CONVENTIONS.md` §4 bars commercial packages and pricing. `DEC 2026-08-15c` §1 authorised
 * exactly one thing on top of that: an outbound "Satın Al" link to the seller, with no price
 * anywhere. {@link purchaseUrl} is that link and it is the ONLY commerce-adjacent field on this
 * entity; there is no price, currency, availability or offer column, so the web repo cannot build
 * `Product`/`offers` JSON-LD from this contract even by accident (SPEC §12.6).
 *
 * ## B1 scope
 * Schema and contract only. Nothing writes a row in this PR: the seed loader, the artefact copy
 * and the editorial strings are B2, the two public endpoints are B3, and the sync leg is B4
 * (SPEC §16).
 */
@Entity('books')
// The MIGRATION is the truth for every constraint below, not these decorators: `synchronize` is
// off and the DDL is hand-authored (the `EarthquakeEvent` / `MarinePoint` precedent). They are
// declared anyway so the access paths read beside the columns — when the two disagree, the SQL is
// what runs.
export class Book {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * TR routing key — `/kitaplar/{slug_tr}` (`CONVENTIONS.md` §5).
   *
   * `ayt-cografya-konu-ozetli-brans-denemeleri` for the first book, confirmed against
   * `GLOSSARY.md` §5's four folding rules with the folding function positive-controlled against
   * all seven locked province/region examples (K-B, → DEC 2026-08-15c). The publisher name is
   * deliberately NOT in the slug: `publisher_name` is its own column and an address is permanent.
   *
   * 140 rather than the province table's 120: this book's slug is already 41 characters and a
   * book title is not bounded the way a province name is.
   */
  @Column({ name: 'slug_tr', type: 'varchar', length: 140, unique: true })
  slugTr!: string;

  /**
   * EN routing key — `/en/books/{slug_en}`.
   *
   * The same string as {@link slugTr} for this book, and that is a CONSEQUENCE rather than a rule:
   * a product name is not translated (`SEO-POLICY.md` §B14 14.2), so there is nothing to fold
   * differently. The column stays separate and separately unique because the next book might have
   * a title that does translate.
   *
   * The EN twin is permanently `noindex` by owner ruling (K-C, → DEC 2026-08-15c). That does not
   * remove the slug: a `noindex` page still has to resolve to exactly ONE URL per locale, and
   * changing that URL later would create a redirect debt.
   */
  @Column({ name: 'slug_en', type: 'varchar', length: 140, unique: true })
  slugEn!: string;

  /** The book's full title as published on the cover. */
  @Column({ name: 'title_tr', type: 'varchar', length: 200 })
  titleTr!: string;

  /**
   * Null today, and deliberately so.
   *
   * A product name has no translation, and `SEO-POLICY.md` §B14 14.2 says a field with no
   * counterpart is OMITTED rather than machine-filled. Kept as SPEC §5.1 has it, unchanged by the
   * permanent-`noindex` ruling (K-C).
   */
  @Column({ name: 'title_en', type: 'varchar', length: 200, nullable: true })
  titleEn!: string | null;

  /** The publisher, as credited. Feeds the `Book.publisher` JSON-LD field. */
  @Column({ name: 'publisher_name', type: 'varchar', length: 120 })
  publisherName!: string;

  /**
   * The authors, **in the order the book prints them** — never sorted.
   *
   * The same discipline as `Country.neighborIsoCodes` (playbook §5): this array is a PUBLISHED
   * render order, the consumer iterates it unsorted, and alphabetising it as a "tidy-up" changes
   * what the credit says. For this book the printed order is **Murat Karagöz, then Murat Çakır** —
   * the cover's order, ruled published by `DEC 2026-08-15i` md.1. (This sentence named the reverse
   * until 2026-08-15; the cover scan refuted it. Playbook §5 makes the entity the canonical home
   * for seed discipline notes, so a stale one here is the first wrong answer the next reader gets.)
   *
   * At least one entry, enforced by `CHK_books_author_names`: the credit is an attribution
   * obligation, so a row with nobody credited is a seeding defect rather than a state. A
   * publisher-authored title is credited the way the book credits it (`Komisyon`), never as `[]`.
   */
  @Column({ name: 'author_names', type: 'text', array: true })
  authorNames!: string[];

  /**
   * ISBN-13, digits only.
   *
   * `char(13)` is safe here specifically BECAUSE of the check constraint: a shorter value would be
   * blank-padded by Postgres and the `^[0-9]{13}$` pattern then rejects it, so the padding
   * behaviour that made `char` wrong for `binding_plate_code` in E1 cannot produce a silently
   * accepted row. There is no foreign key on this column, which is what made the type matter
   * there.
   */
  @Column({ name: 'isbn13', type: 'char', length: 13, unique: true })
  isbn13!: string;

  /** Printed page count. A künye fact the reader sees and the description cites. */
  @Column({ name: 'page_count', type: 'integer' })
  pageCount!: number;

  /** Which exam this book prepares for. Closed set — see {@link ExamTrack}. */
  @Column({ name: 'exam_track', type: 'varchar', length: 8 })
  examTrack!: ExamTrack;

  /**
   * How many denemeler the BOOK contains — not how many we have video solutions for.
   *
   * **NOT NULL, and that is the K-E ruling** (→ DEC 2026-08-15c §1). SPEC §5.1 left it nullable
   * only because the number was unverified at writing time; the owner checked the book and the
   * answer is 40, with denemeler 14 and 22 present in the book and only their SOLUTION VIDEOS
   * missing. A nullable column would now mean "we might publish a book without knowing its size",
   * which is not a state this catalogue can honestly be in — every row here is hand-seeded from a
   * künye somebody read.
   *
   * The trade-off is recorded rather than hidden: if a future book in this catalogue has no
   * denemeler at all (a topic-summary title), this column needs a migration to relax and the
   * published field goes from `number` to `number | null`, which is a BREAKING contract change.
   * That is the cost of refusing to publish an unknown; a nullable column would have bought the
   * flexibility by making "unknown" and "known" indistinguishable in the contract on day one.
   *
   * The count is a fact about the book. What we cover is `book_videos`, and the two are read
   * together by the interface, never merged into one number.
   */
  @Column({ name: 'deneme_count', type: 'integer' })
  denemeCount!: number;

  /**
   * Path to the cover image **inside the web repo's `public/`** — a relative path and nothing else.
   *
   * The check constraint is the point of the column rather than decoration: an allowlist
   * (`~ '^/[A-Za-z0-9._~/-]+$'` plus `NOT LIKE '//%'`) whose alphabet cannot express an authority,
   * so this field cannot become a remote URL and therefore cannot turn into an image proxy or an
   * SSRF surface. The obvious formulation would NOT have held — `LIKE '/%' AND NOT LIKE '%://%'`
   * accepts `//cdn.example.com/kapak.jpg` and `/\cdn.example.com/kapak.jpg`, both of which a
   * browser resolves remotely; the migration records the full rejection matrix. The api never
   * receives, stores or serves a byte of image data on this leg — there is no upload surface
   * (playbook §3.4 is not triggered, SPEC §4.3).
   *
   * **The seed rule that alphabet imposes on B2** (playbook §5: seed discipline belongs on the
   * entity). It is ASCII only, so Turkish diacritics, spaces, `%`, `+` and parentheses are all
   * refused — `/kitaplar/ağrı-kapak.jpg` and `/kitaplar/kapak 1.jpg` do not fit it. **Slugify the
   * filename before copying it into `public/`**, exactly as the shipped cover path already is. The
   * refusal is fail-closed, so a wrong name is rejected at seed time rather than stored and broken
   * later; the point of writing it here is that otherwise the rule exists only inside a regex on a
   * Turkish-language project.
   *
   * The file itself is owner-supplied (480×758, ruled sufficient — K-K, → DEC 2026-08-15c §1).
   */
  @Column({ name: 'cover_image_path', type: 'varchar', length: 200, nullable: true })
  coverImagePath!: string | null;

  /**
   * Outbound "Satın Al" link to the seller's product page.
   *
   * **Added by owner ruling after the SPEC was approved** (→ DEC 2026-08-15c §1): the book page
   * carries a purchase link and **no price anywhere**. The two halves are both load-bearing —
   * `CONVENTIONS.md` §4 bars pricing, and a price would additionally go stale on a page we do not
   * control. So this is a bare address: no price, no currency, no availability, no offer, and no
   * seller-side identifier beyond the URL itself.
   *
   * The check constraint requires `https://`. That is a security guard, not tidiness: this value
   * becomes an `href` on a public page, so `javascript:`, `data:` and protocol-relative values are
   * refused by the database rather than by whichever renderer happens to read it. Plain `http://`
   * is refused too — linking a mixed-content destination from an HTTPS page is a defect we would
   * rather find at seed time.
   *
   * Nullable because a book without a seller link is a real state, and `null` is how the web repo
   * is told not to render the button. It is published on the DETAIL DTO only; the ruling names the
   * book page, and adding it to the list item later is an additive, non-breaking change (SPEC §15).
   */
  @Column({ name: 'purchase_url', type: 'varchar', length: 300, nullable: true })
  purchaseUrl!: string | null;

  /**
   * The editorial narrative — the only authored prose this table carries.
   *
   * `CONTENT-STYLE.md` §1–§21 and `SEO-POLICY.md` A2/A4 bind it. The approved text (v2,
   * → DEC 2026-08-15c §2) is seeded in B2, not here; this PR only guarantees the column can hold
   * it. `text` rather than a bounded `varchar` because a length cap on narrative prose is an
   * editorial judgement, and `SEO-POLICY.md` §0.2 is explicit that those bands are not database
   * errors.
   */
  @Column({ name: 'intro_tr', type: 'text' })
  introTr!: string;

  /**
   * Null today. `SEO-POLICY.md` §B14 14.2: a field with no counterpart is omitted, never
   * machine-filled — so the EN page carries no narrative rather than a translated one. Kept as
   * SPEC §5.1 has it (K-C).
   */
  @Column({ name: 'intro_en', type: 'text', nullable: true })
  introEn!: string | null;

  /**
   * Hand-written page title (`SEO-POLICY.md` A1).
   *
   * **These two metadata strings live in the api and that is a deliberate divergence from the
   * province and country surfaces**, where they are generated from one pattern in the web repo's
   * `messages/tr.json` — a state A1 itself records as non-compliant. Writing 81 provinces by hand
   * was not possible; writing four books by hand is both possible and required. The alternative
   * was per-book message keys in the web repo, which would put the content behind the
   * single-writer boundary of the repo that does not own it.
   */
  @Column({ name: 'meta_title_tr', type: 'varchar', length: 200 })
  metaTitleTr!: string;

  /** Hand-written meta description carrying a CONCRETE fact (`SEO-POLICY.md` A2). */
  @Column({ name: 'meta_description_tr', type: 'varchar', length: 400 })
  metaDescriptionTr!: string;

  /**
   * The playlist the solutions live in — stored for the attribution LINK only.
   *
   * **No code path queries it, and that is the design** (SPEC §4.2): `playlistItems.list` is never
   * called, so a playlist edit cannot silently change our page and a new deneme cannot appear
   * without its start seconds having been measured first. The sync leg asks `videos.list` about
   * our own ids, which is also why the daily cost is one quota unit.
   */
  @Column({ name: 'youtube_playlist_id', type: 'varchar', length: 64, nullable: true })
  youtubePlaylistId!: string | null;

  /**
   * The channel the solutions are published on, published as-is on the detail response.
   *
   * It does NOT build the reader-facing channel link: `DEC 2026-08-17b` made that address the
   * handle constant in `book/book-attribution.catalogue.ts`, which a channel id cannot compose.
   */
  @Column({ name: 'youtube_channel_id', type: 'varchar', length: 32 })
  youtubeChannelId!: string;

  /** Hub ordering. Read with a deterministic secondary sort in B3, never on its own. */
  @Column({ name: 'display_order', type: 'integer' })
  displayOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /**
   * Feeds `dateModified` / sitemap `lastmod` (`SEO-POLICY.md` §B5 5.9, §B6 6.9), which is why B2's
   * seed must be idempotent down to not touching a row whose values did not change.
   */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
