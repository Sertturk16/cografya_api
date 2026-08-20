import { ApiProperty } from '@nestjs/swagger';
import { EarthquakeDataStatus } from '../earthquake.types';
import { EARTHQUAKE_DISCLAIMER_TR } from '../earthquake-disclaimer.constant';
import { EarthquakeAttributionDto } from './earthquake-attribution.dto';

/**
 * The leg's standing facts, served by `GET /api/earthquakes/meta`: what the defaults are, how wide
 * the scope is, how fresh the store is, and who the data belongs to.
 *
 * Distinct from `EarthquakeListMetaDto` despite the shared word: that one is a LIST response's
 * extension to the shared envelope (it echoes the filter that was applied to that request), while
 * this is a standalone payload about the endpoint family itself. A page renders this once and the
 * list per query.
 *
 * ## Structural values only — the labels are the web repo's
 * SPEC §10 splits it exactly here: the API ships `scopeBufferKm` and `minMagnitudeDefault`, and the
 * sentence a reader sees ("Türkiye ve çevresi", an empty-state line, a freshness phrase) is
 * authored copy that belongs to Vera and `CONTENT-STYLE.md` §22. The API also ships no i18n key on
 * this leg: it carries the structural token and the web picks the words.
 *
 * ## `disclaimerTr` landed here in E4, additively, and the sequencing was the point
 * The early-warning disclaimer is a liability text (untouchable class), so it waited for its owner
 * ruling (`DEC 2026-08-19l`) rather than shipping as a draft into an artifact the web repo
 * codegens from. It arrives as an ADDITIVE field, api before web — no consumer breaks, and the
 * web `/deprem` page cannot render the note before the field exists to carry it.
 *
 * ## Nothing future-tense, by construction
 * No prediction, probability, risk score or alert level, here or anywhere on this leg — a ruling
 * (DEC 2026-07-30k, `QUESTIONS.md` D-6), not a design preference.
 */
export class EarthquakeMetaDto {
  @ApiProperty({
    type: Number,
    example: 2.5,
    description:
      'The magnitude floor applied when a list request names none. Published so the web repo can ' +
      'say what the reader is looking at without hardcoding the number.',
  })
  minMagnitudeDefault!: number;

  @ApiProperty({
    type: Number,
    example: 200,
    description:
      'How far beyond the national outline of Türkiye, in km, an event still belongs on these ' +
      'pages. This is ' +
      'the SAME buffer the stored rows were classified with, not a second copy of it — the ' +
      'structural half of the scope label the web repo writes.',
  })
  scopeBufferKm!: number;

  @ApiProperty({
    type: Number,
    example: 7,
    description: 'Width in days of the window a list request gets when it names neither end.',
  })
  defaultWindowDays!: number;

  @ApiProperty({
    type: Number,
    example: 366,
    description: 'The widest window a single list request may ask for; wider is a 400.',
  })
  maxWindowDays!: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-08-19T11:55:00.000Z',
    description:
      'When our last ingest tour that actually LANDED data finished, UTC; null when no such tour ' +
      'has run. A tour that reached the provider but stored nothing does NOT refresh it, so a ' +
      'frozen value points at our own pipeline rather than at the provider. This — not build ' +
      'time — is what a dateModified or a sitemap lastmod derives from.',
  })
  dataUpdatedAtUtc!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-08-19T10:31:07.000Z',
    description:
      'Origin time of the newest event we hold, UTC; null when the store holds none. A concrete ' +
      'fact for a page description, not a freshness claim — a quiet hour and an outage look ' +
      'identical from this field alone, which is why dataUpdatedAtUtc exists beside it.',
  })
  latestEventAtUtc!: string | null;

  @ApiProperty({
    enum: EarthquakeDataStatus,
    example: EarthquakeDataStatus.Ok,
    description:
      'Structural freshness verdict for the store as a whole. "stale" still serves data — stale ' +
      'data is shown with its age, never hidden.',
  })
  dataStatus!: EarthquakeDataStatus;

  @ApiProperty({
    type: String,
    example: EARTHQUAKE_DISCLAIMER_TR,
    description:
      'The early-warning disclaimer, in Turkish, owner-ruled and VERBATIM (DEC 2026-08-19l). ' +
      'Render it wherever earthquake data is shown; never translate, shorten or re-word it. It ' +
      'is a liability note rather than interface copy, which is why the API publishes the ' +
      'sentence itself while every other reader-facing string on this leg is the web repo to ' +
      'author. Constant, so it is served on the cold path too.',
  })
  disclaimerTr!: string;

  @ApiProperty({
    type: EarthquakeAttributionDto,
    isArray: true,
    description:
      'Required provider attribution, populated on EVERY response including this one and ' +
      'including the cold path. A licence notice that blinks with provider health does not ' +
      'discharge the obligation.',
  })
  attributions!: EarthquakeAttributionDto[];
}
