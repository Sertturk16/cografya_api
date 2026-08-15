import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * One question's start second inside its deneme's video — the row the whole page is built from.
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
 * ## No label column, deliberately
 * The reader sees "Soru 3". That string is built from the web repo's i18n key and the number in
 * {@link questionNo}: playbook §6 bars a user-facing literal from leaving the api, and
 * `QUESTIONS.md` V-4 closed the question of giving a question a semantic title. The api carries a
 * NUMBER and no language. It is also why `SEO-POLICY.md` A4 cannot be applied at question level on
 * this surface — we do not hold the question texts, so a cross-link would have to be invented
 * (SPEC §11.3).
 */
@Entity('book_video_questions')
// The MIGRATION is the truth for these constraints. As on `book_videos`, SPEC §5.3's
// `INDEX (book_video_id, question_no)` is satisfied by this UNIQUE constraint's own index rather
// than by a second, identical one.
@Unique('UQ_book_video_questions_video_question', ['bookVideoId', 'questionNo'])
export class BookVideoQuestion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Owning video. `ON DELETE CASCADE`: a start second has no meaning without its video. */
  @Column({ name: 'book_video_id', type: 'uuid' })
  bookVideoId!: string;

  /**
   * The question's position inside its deneme, from 1. Gapless ascending within a video — a
   * missing number would be a silent hole in the index, so B2 refuses the whole artefact over it.
   */
  @Column({ name: 'question_no', type: 'integer' })
  questionNo!: number;

  /**
   * Where this question's solution begins in the video, in whole seconds
   * (`GLOSSARY.md` §4.2, `başlangıç saniyesi (startSecond)`); handed to the player as
   * `?start=<seconds>`.
   *
   * **It is not safe to assume the first question starts at 0.** The measured set of first-question
   * seconds is `{0, 2, 6, 11, 94}`, so no code path may treat "the first mark" as the video's
   * beginning, and `?start=0` is an ordinary value rather than a special case. `>= 0` is the only
   * bound the database can state: an upper bound would need the video's duration, which is API
   * Data living in another table on a 30-day clock — a permanent row must never depend on it.
   */
  @Column({ name: 'start_second', type: 'integer' })
  startSecond!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
