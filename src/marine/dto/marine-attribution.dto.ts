import { ApiProperty } from '@nestjs/swagger';

/**
 * A provider's licence + required notice, served as DATA rather than as authored prose.
 *
 * This is why the marine feature opens no i18n module on the api side: the only prose the API
 * emits is attribution text, and attribution text is licence-dictated wording, not copy. Every
 * other string belongs to the web repo.
 *
 * **IMPLEMENTED IN M5.** The rows are a compiled constant — `marine-attribution-catalogue.ts` —
 * not a seeded table. That is a deliberate, Atlas-approved deviation from SPEC-ADDENDUM §7.14
 * ("seeded rows"); the reasoning (a missing row is a licence breach, not a broken widget) is on
 * the catalogue module. Two rows are served on EVERY value response, including the cold
 * `dataAvailable: false` one.
 *
 * ## The shape changed in M5, and it was breaking on purpose
 * M1 froze `requiredNoticeTr` + `requiredNoticeEn`. Measuring the actual obligations showed the
 * pair was wrong in a way that invited a licence breach:
 *
 * - ECMWF's obligation has THREE parts (a year-dependent copyright line, the mandatory service
 *   sentence, and a **disclaimer**); the Copernicus Marine obligation is ONE sentence with no
 *   disclaimer at all. Folding the disclaimer into `requiredNoticeEn` would have implied CMEMS
 *   carries one too.
 * - `requiredNoticeTr` read as "the notice the licence requires, in Turkish". For ECMWF there
 *   is no such thing: the Turkish text is informational and may NOT stand in for the English
 *   (NOVA §4.1 → DEC 2026-08-02c). The old name invited a Turkish-locale consumer to render
 *   the TR field alone and breach the licence while looking correct.
 *
 * So M5 added `disclaimerEn` and renamed `requiredNoticeTr` → `explanationTr` (Atlas ruling
 * DEC 2026-08-02h S2). Breaking, and taken at the cheapest possible moment: the array was `[]`
 * on every endpoint until this PR, so the field had zero consumers.
 */
export class MarineAttributionDto {
  @ApiProperty({
    example: 'cmems',
    description:
      "Stable provider key, 'ecmwf' or 'cmems'. Joins to MarineLayerDto.attributionId, so a " +
      'renderer can name the provider behind each layer.',
  })
  providerId!: string;

  @ApiProperty({
    example: 'E.U. Copernicus Marine Service',
    description:
      'Provider display name, as the provider itself writes it in the mandated notice. Not a ' +
      'localizable label — do not translate it.',
  })
  providerName!: string;

  @ApiProperty({
    example: 'Copernicus Marine Service Commitments and Licence',
    description: 'Licence name, verbatim. The legal name of a licence is never translated.',
  })
  licenceName!: string;

  @ApiProperty({
    example: 'https://marine.copernicus.eu/user-corner/service-commitments-and-licence',
    description:
      'Canonical licence URL. Use this exact URL — a localized Creative Commons variant is not ' +
      'the same document.',
  })
  licenceUrl!: string;

  @ApiProperty({
    description:
      'The notice the licence REQUIRES us to display, VERBATIM and IN ENGLISH. Not editorial ' +
      'copy: shortening, restyling, reordering or translating it is a licence breach, so it is ' +
      'data, not a template. Render it as-is and mark it lang="en" even on the Turkish ' +
      'locale. For ECMWF it starts with a copyright line whose year comes from the data behind ' +
      'this very response; when no ECMWF cycle has been ingested that line is OMITTED rather ' +
      'than faked, and the notice begins at the mandatory service sentence.',
  })
  requiredNoticeEn!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'The liability disclaimer the licence requires, VERBATIM and IN ENGLISH, or null where ' +
      'the licence imposes none. Separate from requiredNoticeEn because the two providers ' +
      'genuinely differ: ECMWF mandates a disclaimer, the Copernicus Marine licence does not. ' +
      'Merging them into one string would tell the reader CMEMS carries a disclaimer it does ' +
      'not. Render it next to the notice, same lang="en" rule.',
  })
  disclaimerEn!: string | null;

  @ApiProperty({
    description:
      'Informational Turkish rendering of this row as a whole — the notice, plus the ' +
      'disclaimer where the licence imposes one (so the ECMWF row covers requiredNoticeEn AND ' +
      'disclaimerEn in a single paragraph, while the CMEMS row has no disclaimer to render). ' +
      'It stands ALONGSIDE requiredNoticeEn and ' +
      "MUST NEVER REPLACE IT — not even on the Turkish locale. ECMWF's terms say the wording " +
      '"shall be attached" and, unlike the Copernicus framework, offer no "or any similar ' +
      'notice" escape, so the English text is the one that discharges the obligation. This ' +
      'field exists so a Turkish reader can understand it, not so a renderer can substitute ' +
      'it. Renamed from requiredNoticeTr in M5 precisely because the old name implied the ' +
      'opposite.',
  })
  explanationTr!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Deliberately null — DOIs live in data-provenance.md (DEC 2026-08-02g §2), not on the ' +
      'page. Serving one here would hand the web the easiest possible way to break that rule, ' +
      'and a single DOI cannot represent the five CMEMS products behind these values anyway: ' +
      'picking one would be a false statement about provenance.',
  })
  doi!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Deliberately null — same reasoning as doi. Neither licence requires a product title in ' +
      'the visible notice, and the marine values are merged across several products per field.',
  })
  productTitle!: string | null;
}
