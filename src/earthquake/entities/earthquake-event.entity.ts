import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  type ValueTransformer,
} from 'typeorm';
import { EarthquakeBindingKind, type EarthquakeProvider, MagnitudeType } from '../earthquake.types';

/**
 * Postgres `numeric` comes back from the driver as a string (arbitrary precision). These are
 * small, fixed-scale values, so they are converted to `number` on read and passed through on
 * write — the same transformer shape as `Province.latitude` and `MarinePoint.latitude` (one
 * shape per repo, not three).
 *
 * Without it a `number`-typed DTO field would silently publish a STRING, which is the class of
 * defect no range invariant can see.
 */
const decimalTransformer: ValueTransformer = {
  to: (value: number | null | undefined): number | null => value ?? null,
  from: (value: string | null | undefined): number | null =>
    value === null || value === undefined ? null : Number(value),
};

/**
 * One earthquake, as published by AFAD TDVMS and normalised by us.
 *
 * ## Why Postgres holds these rows at all
 * The alternative — a TTL'd read-through proxy — was evaluated and REJECTED (SPEC §4.2): AFAD
 * revises solutions after the fact, and a revision can only be DETECTED against a previous
 * stored state; scope classification would otherwise be recomputed on every request; and a
 * provider outage would empty the page instead of freezing it. Persisting also gives
 * `dateModified`/`lastmod` a real `updated_at` to come from (`SEO-POLICY.md` §B5 5.9, §B6 6.9)
 * rather than a build timestamp.
 *
 * ## No `slug_tr` / `slug_en`, and that is a RULING not an omission
 * Playbook §5 requires localized slugs on public entities because the web repo routes on them.
 * `DEC 2026-08-12k` D-E rules that there is **no per-event page** — ~33 000 near-identical thin
 * pages a year is the shape `SEO-POLICY.md` §12.1 (scaled content abuse) targets, and the
 * penalty lands site-wide rather than page-by-page. With no page there is no route, and with no
 * route a slug would be a column nothing resolves. Playbook §5 records the exception.
 *
 * ## No personal data, by construction
 * Coordinates, magnitude, depth, administrative names and the provider's own id. The provider's
 * `neighborhood` field is deliberately neither stored nor published (SPEC §6.2): matching an
 * event to a named neighbourhood is a location precision the page has no use for. `rms` (the
 * provider's solution-quality metric) is dropped for a different reason — it is meaningless to
 * the reader and easy to misread as an accuracy claim.
 *
 * ## E1 scope
 * Schema and contract only. Nothing writes a row in this PR: the ingest, the parsers, the
 * normalisation, the scope test and the fidelity rule are all E2 (SPEC §16).
 */
@Entity('earthquake_events')
// The MIGRATION is the truth for every index below, not these decorators: `synchronize` is off
// and the DDL is hand-authored, and the decorator form cannot express the `DESC` ordering the
// hub path depends on. They are declared anyway (the `MarinePoint` precedent) so the access
// paths are readable beside the columns — but when the two disagree, the SQL is what runs.
@Unique('UQ_earthquake_events_provider_event', ['provider', 'providerEventId'])
// The hub's main path. `provider_event_id` is IN the index, not decoration: SPEC §13 item 13
// requires a deterministic secondary sort (`occurred_at_utc DESC, provider_event_id DESC`) so
// that offset pagination cannot show one row on two pages, and an index that stops at the
// timestamp leaves that tie-break to a sort node on every page request.
@Index('IDX_earthquake_events_scope_time', ['inScope', 'occurredAtUtc', 'providerEventId'])
// The province section. Partial, because an out-of-scope row is never served on either path.
@Index('IDX_earthquake_events_plate_time', ['bindingPlateCode', 'occurredAtUtc'], {
  where: '"in_scope"',
})
// The magnitude-filtered list. D-C applies the M≥2.5 default AT DISPLAY TIME, never at ingest,
// so this index carries the filter the reader actually moves.
@Index('IDX_earthquake_events_scope_mag_time', ['inScope', 'magnitude', 'occurredAtUtc'])
export class EarthquakeEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Which source published this solution. Fixed to `'afad'` in Faz-1 and part of the natural
   * key, so a future second source cannot collide with an AFAD event id.
   */
  @Column({ name: 'provider', type: 'varchar', length: 16 })
  provider!: EarthquakeProvider;

  /**
   * AFAD's `eventID`, kept as the STRING it arrives as.
   *
   * It is the PROVIDER's key, never ours (SPEC §2). Measured 630/630 unique over seven days,
   * and increasing but with gaps — so it orders nothing and is used here only for identity and
   * as the pagination tie-break.
   */
  @Column({ name: 'provider_event_id', type: 'varchar', length: 32 })
  providerEventId!: string;

  /**
   * Origin time — the instant the source ruptured, in UTC.
   *
   * **The most expensive silent-error surface on this line.** AFAD's `date` field is UTC but
   * carries NO timezone suffix, while AFAD's own web page shows the same event under a
   * `Tarih(TS)` heading shifted +3 hours. Three independent proofs are recorded in SPEC §3.3
   * (Pazarcık M7.7, İzmit M7.4, and the same event on both surfaces). A naive
   * `new Date("2026-08-10T10:07:59")` reads that string as LOCAL time and publishes every
   * earthquake three hours wrong — and no structural invariant can see it, which is why E2
   * carries a write-path fidelity rule and a TZ-pinned unit test (SPEC §13.1, §13 item 1).
   *
   * The API publishes UTC and only UTC; converting to Turkish time is the web repo's single
   * layer (`DEC 2026-08-12k` §3). Two layers converting is the same bug applied twice.
   */
  @Column({ name: 'occurred_at_utc', type: 'timestamptz' })
  occurredAtUtc!: Date;

  /** Decimal degrees. `numeric(9,6)` matches `provinces.latitude` and `marine_points.latitude`. */
  @Column({
    name: 'latitude',
    type: 'numeric',
    precision: 9,
    scale: 6,
    transformer: decimalTransformer,
  })
  latitude!: number;

  @Column({
    name: 'longitude',
    type: 'numeric',
    precision: 9,
    scale: 6,
    transformer: decimalTransformer,
  })
  longitude!: number;

  /**
   * Focal depth in km (`GLOSSARY.md` §4 `odak derinliği`).
   *
   * **Can be negative** — −0.014 km was measured on 2026-08-11 — so it is never clamped to zero
   * and an `@IsPositive`-style guard anywhere on this field would reject real provider rows.
   * `numeric(7,3)` rather than the SPEC's `(6,3)`: the CHECK admits 1000 and `(6,3)` tops out at
   * 999.999, so the column had to be able to hold the ceiling its own constraint allows.
   */
  @Column({
    name: 'depth_km',
    type: 'numeric',
    precision: 7,
    scale: 3,
    transformer: decimalTransformer,
  })
  depthKm!: number;

  /**
   * Magnitude (`GLOSSARY.md` §4 `büyüklük`) — the energy released AT THE SOURCE, one number per
   * earthquake regardless of where you stand. **Never intensity** (`şiddet`), which varies by
   * location and which AFAD does not publish on this endpoint at all; the two are not
   * interchangeable and confusing them misinforms the reader factually.
   *
   * `numeric(4,2)` rather than the SPEC's `(3,1)`: all 630 measured values carried a single
   * decimal (range 0.6–4.5), so this is cheap insurance rather than a fix for an observed
   * defect — but under `(3,1)` a two-decimal value would be ROUNDED, and E2's fidelity rule
   * compares round-tripped values at tolerance 0, so the row would be rejected rather than
   * mis-stored. Widening later would cost a second migration.
   */
  @Column({
    name: 'magnitude',
    type: 'numeric',
    precision: 4,
    scale: 2,
    transformer: decimalTransformer,
  })
  magnitude!: number;

  /** The normalised token. Case-insensitive mapping happens in E2; see {@link MagnitudeType}. */
  @Column({ name: 'magnitude_type', type: 'varchar', length: 8 })
  magnitudeType!: MagnitudeType;

  /**
   * The provider's raw type string, untouched.
   *
   * Stored ALWAYS, so normalisation is never a lossy one-way door: a row that lands on
   * `MagnitudeType.Other` still carries what AFAD actually said, and the web repo can decide
   * what to show (SPEC §5.3).
   */
  @Column({ name: 'magnitude_type_raw', type: 'varchar', length: 16 })
  magnitudeTypeRaw!: string;

  /**
   * The provider's `country`, raw. THREE-valued in practice: `Türkiye` (615/630), a neighbouring
   * country (9/630), or `null` for genuinely open-water events (6/630, all in the Aegean or the
   * Mediterranean). A filter that keyed on this field alone would drop those six — precisely the
   * failure `QUESTIONS.md` D-1 warned about (SPEC §3.5).
   */
  @Column({ name: 'provider_country', type: 'varchar', length: 64, nullable: true })
  providerCountry!: string | null;

  /**
   * The provider's `province`, raw — **never published on its own, in any tier**.
   *
   * It means "the nearest Turkish province", not "the province this happened in"
   * ({@link EarthquakeBindingKind}). Nullable although 630/630 measured rows carried a value:
   * that is an observation of one week, not a contract, and a NOT NULL would let a provider
   * change stop the whole ingest tour.
   */
  @Column({ name: 'provider_province', type: 'varchar', length: 64, nullable: true })
  providerProvince!: string | null;

  /** The provider's `district`, raw. Nullable for the same reason as `provider_province`. */
  @Column({ name: 'provider_district', type: 'varchar', length: 64, nullable: true })
  providerDistrict!: string | null;

  /**
   * The provider's `location` string, byte-for-byte, for auditability.
   *
   * Two shapes were measured: a plain place name, and a composite
   * `<place> - [NN.NN km] <district> (<province>)` (88 of 630). The composite reads like half a
   * sentence and its `[56.72 km]` fragment is a provider-internal format that has passed no
   * reader-facing review, so it is never printed as a label — the parsed parts are published
   * instead (SPEC §5.5).
   */
  @Column({ name: 'provider_location_raw', type: 'varchar', length: 160 })
  providerLocationRaw!: string;

  /**
   * The reader-facing place name, derived: the part of `location` BEFORE the distance bracket.
   *
   * Named to match the published field `placeNameTr` rather than the SPEC's `place_label_tr`
   * (Atlas ruling Q4): a column whose name differs from the field it feeds is this repo's known
   * drift class. Derived, never authored — nobody writes this string.
   */
  @Column({ name: 'place_name_tr', type: 'varchar', length: 160 })
  placeNameTr!: string;

  /** How this event relates to its province. Non-nullable by design — see the enum's note. */
  @Column({ name: 'binding_kind', type: 'varchar', length: 24 })
  bindingKind!: EarthquakeBindingKind;

  /**
   * The plate code of the province page this event appears on, or `null` for none.
   *
   * `varchar(2)` to match `provinces.plate_code` exactly (`char(2)` blank-pads and would put the
   * foreign key across two different types). Resolved in E2 by matching the provider's province
   * NAME against the province table; a failed match writes `null` and logs a warning, so an
   * unknown name loses a cross-link instead of inventing one.
   *
   * The FK is `ON DELETE SET NULL`: the 81 province rows are a fixed set, so this should never
   * fire — but if it ever did, the row would keep a `bindingKind` asserting a binding whose
   * plate code is gone. Accepted, and stated rather than left implicit.
   */
  @Column({ name: 'binding_plate_code', type: 'varchar', length: 2, nullable: true })
  bindingPlateCode!: string | null;

  /**
   * The distance in km parsed out of the provider's bracket, or `null` when it had none.
   *
   * It is the distance to the nearest DISTRICT CENTRE, not to the border, and it appears on
   * lake and reservoir events too — so it is **not a scope signal** and the scope test never
   * reads it (SPEC §3.5). Measured range 1.57–160.82 km.
   */
  @Column({
    name: 'binding_distance_km',
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  bindingDistanceKm!: number | null;

  /**
   * The scope test's verdict. **A `false` row appears on no public endpoint** — it is stored
   * because D-C rules the magnitude threshold is applied at display time, so "show everything"
   * has to be able to find real data (SPEC §5.4).
   */
  @Column({ name: 'in_scope', type: 'boolean' })
  inScope!: boolean;

  /** The provider's own `isEventUpdate` flag. Measured true twice in seven days. */
  @Column({ name: 'is_revised', type: 'boolean', default: false })
  isRevised!: boolean;

  /** The provider's `lastUpdateDate`, parsed as UTC exactly like `occurred_at_utc`. */
  @Column({ name: 'provider_updated_at_utc', type: 'timestamptz', nullable: true })
  providerUpdatedAtUtc!: Date | null;

  /**
   * OUR count of value-changing upserts — not the provider's. Re-ingesting an unchanged payload
   * must leave it alone, which is also what keeps `updated_at` (and therefore the page's
   * advertised modification date) honest (SPEC §7.3, §13 items 16-17).
   */
  @Column({ name: 'revision_count', type: 'integer', default: 0 })
  revisionCount!: number;

  /** When WE first saw this event — distinct from when it happened and from when it changed. */
  @Column({ name: 'first_seen_at_utc', type: 'timestamptz' })
  firstSeenAtUtc!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /**
   * Feeds `dateModified` / sitemap `lastmod` (`SEO-POLICY.md` §B5 5.9, §B6 6.9), which is why
   * E2's upsert must not touch a row whose values did not change.
   */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
