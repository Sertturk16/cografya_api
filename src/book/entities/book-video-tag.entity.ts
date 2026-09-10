import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * One etiket inside its video — the row the whole page is built from (`GLOSSARY.md` §4.2, `etiket`;
 * `DEC 2026-09-10b` md.1). The generic successor to the retired `book_video_questions` /
 * `BookVideoQuestion` (P0 plan §5.2): a single marking unit carrying an order number, a start
 * second and an optional name.
 *
 * 180 of them today: 30 videos × 6 marks, measured and closed at 180/180 (→ DEC 2026-08-12p, and
 * the owner personally closed the 12 manual items). The reader-facing index of these rows is not
 * decoration — `SEO-POLICY.md` §12.2.b makes a page whose body exists to send the visitor
 * elsewhere a BLOCKER, and a 180-row index that is readable without JavaScript and without
 * touching the player is precisely what keeps this page on the right side of that line.
 *
 * ## The ordering invariant this table CANNOT express
 * `start_second` must strictly increase within a video, and that is a condition ACROSS ROWS, which
 * no column constraint can state. So it is enforced in two places instead, on the two paths that
 * exist:
 *  - the WRITE path — B2's seed loader validates it and writes nothing at all if a single video
 *    violates it (SPEC §7.2 check 5). This is the fidelity rule playbook §5 requires of any
 *    publishing line: a set of marks in the wrong order passes every range and type invariant and
 *    is still wrong on the page;
 *  - the READ path — a B3 e2e asserts it over every seeded row without pinning a single number
 *    (SPEC §13 item 3), because pinning a number would turn a structural test into a fact test.
 *
 * ## No name for a deneme book, and that is a ruling not an omission
 * A deneme book's etiketler carry **no name** (`name_tr`/`name_en` both NULL) — sıra and saniye
 * are the only information, and the reader sees "Soru 3" built from the web repo's own i18n key
 * plus {@link orderNo}: playbook §6 bars a user-facing literal from leaving the api, and
 * `QUESTIONS.md` V-4 closed the question of giving a question a semantic title. A
 * topic-summary/soru-bankası book's etiketler DO carry a name — the one per-type hole in the api's
 * language-neutral boundary (`GLOSSARY.md` §4.2). It is also why `SEO-POLICY.md` A4 cannot be
 * applied at this level on a deneme book's surface — we do not hold the question texts, so a
 * cross-link would have to be invented (SPEC §11.3).
 *
 * The artefact's own `tag` field (e.g. `"Soru 3"`) is the position WITNESS refusal 6 checks — it is
 * NOT this row's {@link nameTr} and must never be written to it (plan §5.4 PROHIBITION).
 */
@Entity('book_video_tags')
// The MIGRATION is the truth for these constraints. As on `book_videos`, SPEC §5.3's
// `INDEX (book_video_id, order_no)` is satisfied by this UNIQUE constraint's own index rather than
// by a second, identical one.
@Unique('UQ_book_video_tags_video_order', ['bookVideoId', 'orderNo'])
export class BookVideoTag {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Owning video. `ON DELETE CASCADE`: an etiket has no meaning without its video. */
  @Column({ name: 'book_video_id', type: 'uuid' })
  bookVideoId!: string;

  /**
   * The etiket's position **inside its video**, from 1
   * (`GLOSSARY.md` §4.2, `etiket sırası (orderNo)`). Gapless ascending — a missing number would be
   * a silent hole in the index, so B2 refuses the whole artefact over it. The generic successor to
   * the retired `question_no`/`questionNo`; ALWAYS stored, never derived from
   * {@link startSecond} (`DEC 2026-09-10b` md.3).
   */
  @Column({ name: 'order_no', type: 'integer' })
  orderNo!: number;

  /**
   * Where this etiket's solution begins in the video, in whole seconds
   * (`GLOSSARY.md` §4.2, `başlangıç saniyesi (startSecond)`) — the jump target handed to the
   * player. Moving between etiketler happens INSIDE the loaded player through the IFrame Player
   * API, not by rebuilding the embed URL per etiket (→ DEC 2026-08-15d); `?start=` stays legal for
   * the INITIAL load only.
   *
   * **It is not safe to assume the first etiket starts at 0.** The measured set of first-question
   * seconds is `{0, 2, 6, 11, 94}`, so no code path may treat "the first mark" as the video's
   * beginning, and `?start=0` is an ordinary value rather than a special case. `>= 0` is the only
   * bound the database can state: an upper bound would need the video's duration, which is API
   * Data living in another table on a 30-day clock — a permanent row must never depend on it.
   */
  @Column({ name: 'start_second', type: 'integer' })
  startSecond!: number;

  /**
   * The etiket's own name — generic-model addition, P0 PR-2 (`GLOSSARY.md` §4.2, `etiket adı
   * (nameTr/nameEn)`). NULL for every etiket of a deneme book (see the class docblock); a
   * topic-summary/soru-bankası book's etiketler carry one. Feeds the readable half of the fragment
   * scheme when present (`#video-12-{ad}`; `#video-12-etiket-{sıra}` when absent, `DEC 2026-09-10b`
   * md.5) — the web repo's decision (`P0-web`), not this leg's.
   */
  @Column({ name: 'name_tr', type: 'varchar', length: 200, nullable: true })
  nameTr!: string | null;

  /** EN counterpart of {@link nameTr}. Same nullability and the same reason it is null today. */
  @Column({ name: 'name_en', type: 'varchar', length: 200, nullable: true })
  nameEn!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
