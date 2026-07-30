import { ApiProperty } from '@nestjs/swagger';

/**
 * A provider's licence + required notice, served as DATA rather than as authored prose.
 *
 * This is why the marine feature opens no i18n module on the api side: the only prose the API
 * emits is attribution text, and attribution text is a seeded row whose exact wording the
 * licence dictates. Every other string belongs to the web repo.
 *
 * **NOT IMPLEMENTED IN M1** — frozen contract only; the rows are seeded in M5 alongside the
 * `data-provenance.md` entries.
 */
export class MarineAttributionDto {
  @ApiProperty({ example: 'cmems', description: 'Stable provider key.' })
  providerId!: string;

  @ApiProperty({ example: 'Copernicus Marine Service', description: 'Provider display name.' })
  providerName!: string;

  @ApiProperty({ example: 'Copernicus Marine Service licence', description: 'Licence name.' })
  licenceName!: string;

  @ApiProperty({ example: 'https://marine.copernicus.eu/', description: 'Licence URL.' })
  licenceUrl!: string;

  @ApiProperty({
    description:
      'The notice the licence REQUIRES us to display, verbatim (TR). Not editorial copy — ' +
      'shortening or restyling it is a licence breach, so it is data, not a template.',
  })
  requiredNoticeTr!: string;

  @ApiProperty({ description: 'The required notice, verbatim (EN).' })
  requiredNoticeEn!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Product DOI when the provider issues one, else null.',
  })
  doi!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Product title as the provider names it, when required by the licence.',
  })
  productTitle!: string | null;
}
