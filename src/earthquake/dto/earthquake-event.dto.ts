import { ApiProperty } from '@nestjs/swagger';
import { EarthquakeBindingKind, MagnitudeType } from '../earthquake.types';

/**
 * One earthquake, as published.
 *
 * **NOT SERVED BY ANY E1 ENDPOINT** — a frozen contract published for codegen; the public
 * endpoints land in E3 (SPEC §16). There is no Detail tier and no per-event page: `DEC
 * 2026-08-12k` D-E rules the hub is the only indexable surface, so "the full payload" and "the
 * list item" are the same thing (SPEC §6.2). If D-E is ever reopened, a Detail tier is born in
 * that PR.
 *
 * ## What this payload deliberately does NOT carry
 * - **No local-time field.** UTC only, always with a `Z`. Formatting is the web repo's single
 *   layer (`DEC 2026-08-12k` §3); if both layers converted, the provider's timezone-less string
 *   would be shifted twice.
 * - **No intensity (`şiddet`).** AFAD does not publish it on this endpoint, so it is neither
 *   invented nor derived. It is not a synonym for magnitude (`GLOSSARY.md` §4).
 * - **No `rms`, no `neighborhood`** — see the entity.
 * - **No future-tense field of any kind**: no prediction, probability, risk score, alert level
 *   or "expected" anything. A ruling, not a design preference (DEC 2026-07-30k, D-6), and one
 *   this class is structurally unable to satisfy without being edited.
 * - **No colour, band or badge.** The API carries `magnitude` + `magnitudeType`; whether that is
 *   red or orange is `DESIGN.md`'s and Vera's (SPEC §4.3).
 */
export class EarthquakeEventDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'Our identifier. Stable across revisions of the same event.',
  })
  id!: string;

  @ApiProperty({
    type: String,
    example: '725329',
    description:
      "The provider's own event id, as a string. Increasing but with gaps — it orders nothing.",
  })
  providerEventId!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-08-11T11:03:34.000Z',
    description:
      'Origin time — when the source ruptured — in UTC, ALWAYS ending in "Z". Never a local ' +
      'time: the provider publishes UTC without a timezone suffix while its own web page shows ' +
      'the same event shifted +3 hours, so reading it as local time would publish every ' +
      'earthquake three hours wrong. Converting to Turkish time is the web layer, once.',
  })
  occurredAtUtc!: string;

  @ApiProperty({
    type: Number,
    minimum: -1,
    maximum: 10,
    example: 1.8,
    description:
      'Magnitude — the energy released at the source. One number per earthquake, independent ' +
      'of where it is measured. NOT intensity, which varies by place and is not published here.',
  })
  magnitude!: number;

  @ApiProperty({
    enum: MagnitudeType,
    example: MagnitudeType.Ml,
    description:
      'Normalised magnitude-type token. "other" is part of the set, not an error state: a ' +
      'method we have not seen before is published rather than rejected.',
  })
  magnitudeType!: MagnitudeType;

  @ApiProperty({
    type: String,
    example: 'ML',
    description:
      "The provider's raw type string, untouched — the provider's casing is inconsistent " +
      '("ML", "MW", "Md" all measured), so the normalised token is never the only record.',
  })
  magnitudeTypeRaw!: string;

  @ApiProperty({
    type: Number,
    example: 6.95,
    description:
      'Focal depth in km. CAN BE NEGATIVE (−0.014 km measured) — do not treat a negative value ' +
      'as invalid and do not clamp it to zero.',
  })
  depthKm!: number;

  @ApiProperty({ type: Number, minimum: -90, maximum: 90, example: 38.05222 })
  latitude!: number;

  @ApiProperty({ type: Number, minimum: -180, maximum: 180, example: 36.63111 })
  longitude!: number;

  @ApiProperty({
    type: String,
    example: 'Göksun (Kahramanmaraş)',
    description:
      'Reader-facing place name, parsed from the provider\'s "location" — the part before its ' +
      'distance bracket. Derived data, not authored copy.',
  })
  placeNameTr!: string;

  @ApiProperty({
    type: String,
    example: 'Ege Denizi - [56.72 km] Bodrum (Muğla)',
    description:
      'The provider\'s "location" string verbatim, for auditability. Do NOT print it: the ' +
      '"[56.72 km]" fragment is a provider-internal format, not a reader-facing label.',
  })
  providerLocationRaw!: string;

  @ApiProperty({
    enum: EarthquakeBindingKind,
    example: EarthquakeBindingKind.Inside,
    description:
      'HOW this event relates to the province it is filed under, and it is mandatory. The ' +
      'provider\'s province field means "the nearest Turkish province", not "where this ' +
      'happened": an Iranian event arrives tagged "Ağrı" and an Azerbaijani one 137 km away ' +
      'as "Iğdır". Rendering either as "an earthquake in <province>" is factually wrong.',
  })
  bindingKind!: EarthquakeBindingKind;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '46',
    description:
      'Zero-padded plate code of the province page this event appears on, or null for none. ' +
      'Read together with bindingKind, never alone.',
  })
  bindingPlateCode!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 11.15,
    description:
      "Distance in km parsed from the provider's bracket, or null when it carried none. It is " +
      'the distance to the nearest district CENTRE, not to a border, and it is not a scope ' +
      'signal.',
  })
  bindingDistanceKm!: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Türkiye',
    description:
      "The provider's country. Three-valued: Türkiye, a neighbouring country, or null for " +
      'genuinely open-water events.',
  })
  providerCountry!: string | null;

  @ApiProperty({
    type: Boolean,
    example: false,
    description:
      'Whether the provider has revised this solution. Revisions are real and can be late — ' +
      'measured at 8.5 hours and 3 days for the two 2023 M7+ events.',
  })
  isRevised!: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-08-06T12:56:14.719Z',
    description: 'When the provider last revised it, UTC. Null if never revised.',
  })
  providerUpdatedAtUtc!: string | null;

  @ApiProperty({
    type: Number,
    minimum: 0,
    example: 0,
    description:
      'How many times WE have seen a value change on this event. Re-ingesting an unchanged ' +
      'payload does not move it.',
  })
  revisionCount!: number;
}
