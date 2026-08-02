import { ApiProperty } from '@nestjs/swagger';

/**
 * Provider attribution + disclaimer — DATA, not prose (SPEC §13.2): the attribution and
 * disclaimer sentences are legally required VERBATIM strings from the Copernicus framework
 * terms and are never translated or paraphrased. Everything editorial (model-nature notice,
 * resolution notice, "our translation" label) travels as i18n KEYS whose texts the web repo
 * owns.
 *
 * Served by `GET /api/air-quality/provinces/{plateCode}` from A2b on. The values live in
 * `air-quality-attribution.constant.ts` — a compiled constant, byte-pinned by its own spec,
 * because a missing attribution row is a LICENCE BREACH rather than a degraded widget.
 */
export class AirQualityAttributionDto {
  @ApiProperty({ type: String, example: 'Copernicus Atmosphere Monitoring Service (CAMS)' })
  providerName!: string;

  @ApiProperty({ type: String, example: 'CAMS European air quality forecasts' })
  productName!: string;

  @ApiProperty({
    type: String,
    example: 'https://ads.atmosphere.copernicus.eu/datasets/cams-europe-air-quality-forecasts',
  })
  datasetUrl!: string;

  @ApiProperty({
    type: String,
    example: 'Creative Commons Attribution 4.0 International (CC-BY-4.0)',
    description: 'The licence the dataset actually requires (measured: cc-by, revision 1).',
  })
  licenceName!: string;

  @ApiProperty({ type: String, example: 'https://creativecommons.org/licenses/by/4.0/' })
  licenceUrl!: string;

  @ApiProperty({
    type: String,
    // LOWERCASE "information" — the licensor's own template (DEC 2026-08-02c-1, from NOVA's
    // first-hand read of CC-BY-4.0 §3(a) plus the cc-by rev.1 licence attached to the dataset).
    // A1 shipped a capital I here; A2b corrects it and a byte-for-byte test pins it.
    example: 'Contains modified Copernicus Atmosphere Monitoring Service information 2026',
    description: 'Verbatim required attribution line — never translated. The year is the run’s.',
  })
  attributionText!: string;

  @ApiProperty({
    type: String,
    example:
      'Neither the European Commission nor ECMWF is responsible for any use that may be ' +
      'made of the Copernicus information or data it contains.',
    description: 'Verbatim required disclaimer — never translated.',
  })
  disclaimerText!: string;

  @ApiProperty({
    type: String,
    isArray: true,
    example: [
      'airQuality.notice.modelOutput',
      'airQuality.notice.gridResolution',
      'airQuality.notice.categoryTranslation',
    ],
    description:
      'i18n keys for the editorial notices (model nature, grid resolution, category-name ' +
      'translation). The API ships KEYS only; the texts are authored on the web side. Adding a ' +
      'key is additive; removing or renaming one is a breaking contract change.',
  })
  noticeKeys!: string[];
}
