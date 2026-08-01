import { ApiProperty } from '@nestjs/swagger';

/**
 * Provider attribution + disclaimer — DATA, not prose (SPEC §13.2): the attribution and
 * disclaimer sentences are legally required VERBATIM strings from the Copernicus framework
 * terms and are never translated or paraphrased. Everything editorial (model-nature notice,
 * resolution notice, "our translation" label) travels as i18n KEYS whose texts the web repo
 * owns.
 *
 * **NOT SERVED BY ANY A1 ENDPOINT** — frozen contract, published for codegen; served by A2
 * (the constant carrying the actual values also lands in A2, with the endpoints).
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
    example: 'Contains modified Copernicus Atmosphere Monitoring Service Information 2026',
    description: 'Verbatim required attribution line — never translated.',
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
    description:
      'i18n keys for the editorial notices (model nature, grid resolution, category-name ' +
      'translation). The API ships KEYS only; the texts are authored on the web side.',
  })
  noticeKeys!: string[];
}
