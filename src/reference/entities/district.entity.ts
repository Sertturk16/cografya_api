import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * İlçe — the second-level administrative unit of an il (`GLOSSARY.md` §1: ilçe ⇒ district).
 *
 * It exists for exactly one consumer: the "İlçe" select on the registration form, which needs the
 * districts of the province the user just picked. Nothing else reads it today, and the columns
 * reflect that — this is a reference list, not a content entity.
 *
 * ## No `slug_tr` / `slug_en`, and that is a RULING not an omission
 * Playbook §5 requires localized slugs on public entities because the web repo routes on them, and
 * it defines the exception as a CLASS: a public entity WITHOUT its own page. `DEC 2026-08-20i` md.2
 * rules there is no ilçe page, no ilçe route and nothing that resolves an ilçe slug, so a slug
 * column here would be a column nothing looks up. Each member of that class dies with its premise:
 * if the ruling is reopened, the two slug columns and their migration land in the PR that reopens
 * it. The sibling members are `earthquake_events` (E1), `book_videos` and `book_video_questions`
 * (B1).
 *
 * ## No `name_en`, for a different reason than the missing slugs
 * `provinces` carries `name_tr` alone while `countries` carries both: a Turkish administrative
 * unit's name IS its name in every language, whereas *Yunanistan* / *Greece* genuinely differ. An
 * ilçe is the province case, so this follows `provinces.name_tr` rather than `countries.name_en`.
 *
 * ## What is deliberately NOT stored
 * No population, area, coordinate, elevation or climate. The registration form asks "which ilçe",
 * and every one of those fields would be a fact needing its own source, its own vintage and its own
 * fact-check for 973 rows — for a select box. When an ilçe surface earns them, they arrive with the
 * research that justifies them (`ENGINEERING.md` §12: YAGNI is the default).
 */
@Entity('districts')
// The MIGRATION is the truth for these constraints; the decorators are declared so the access paths
// read beside the columns (the `BookVideo` / `EarthquakeEvent` precedent).
//
// Two ilçe of the SAME il never share a name — measured over the committed artefact, 0 duplicates
// in 81 provinces, with the counter proved able to see one (25 names DO repeat across different
// provinces, `Merkez` 51 times, so the check is not vacuous). This constraint is also the only
// index this table needs: it IS a unique B-tree on `(province_id, name_tr)` in that order, and the
// single query path — `WHERE province_id = $1` — reads it as a prefix. A separate
// `INDEX (province_id)` would be one more physical index paying for an access path this one already
// serves (the `UQ_book_videos_book_deneme` precedent).
@Unique('UQ_districts_province_name_tr', ['provinceId', 'nameTr'])
export class District {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Owning il. `ON DELETE CASCADE`: an ilçe has no meaning without its il.
   *
   * A plain column rather than a `@ManyToOne` relation — the house pattern (`BookVideo.bookId`,
   * `EarthquakeEvent`): the foreign key lives in the migration, and the only query this table
   * serves filters on this column and selects nothing from `provinces`, so a relation would buy a
   * module dependency and no query.
   */
  @Column({ name: 'province_id', type: 'uuid' })
  provinceId!: string;

  /**
   * İlçe adı (TR), in the form a reader sees — `Boğaziçi`, never `BOĞAZİÇİ` (`DEC 2026-08-20m`
   * md.6).
   *
   * `varchar(100)` matches `provinces.name_tr` exactly, so the two administrative-name columns
   * cannot disagree on what a Turkish place name may be. It is far above the measured maximum
   * (`Mustafakemalpaşa`, 16 characters); the length is a sibling-consistency choice, not a fit.
   *
   * **The writing-form guarantees do NOT live here.** The column carries a trimmed/non-empty CHECK
   * and nothing else, because the two defects this data class actually produces — an ALL-CAPS name
   * that survived the source's own casing, and a `İ` lowercased by a locale-blind converter into
   * `i` + an invisible U+0307 — are properties of the SOURCE TRANSFORMATION, and the load phase is
   * where a transformation is judged. They are refused in `district.artifact.ts`, which is also the
   * only place that can name the source in its error message.
   */
  @Column({ name: 'name_tr', type: 'varchar', length: 100 })
  nameTr!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
