import { ApiProperty } from '@nestjs/swagger';
import { MarineAttributionDto } from './marine-attribution.dto';
import { MarineConditionsDto } from './marine-conditions.dto';

/**
 * Every marine point of one province, with series — the payload for the "Deniz Durumu" section
 * on `/turkiye/{il}`.
 *
 * ## Why this is a separate endpoint and not a field on `ProvinceDetailDto`
 * The province detail endpoint is a pure Postgres read today. Embedding marine data would tie
 * a province page's response time and failure surface to an external provider — the exact
 * inverse of the repo rule that a provider outage degrades the widget and never the page.
 * Separate endpoint means separate cache, TTL, fail-soft and measurement.
 *
 * ## Why `marinePoints` is PLURAL
 * İstanbul, Çanakkale and Balıkesir have two points each. A singular field would have forced
 * the web repo to make two calls for those provinces, or to filter the hub overview — which
 * carries no series and so cannot render the chart the province page wants.
 *
 * **NOT IMPLEMENTED IN M1** — frozen contract only; the endpoint lands in M4.
 */
export class MarineProvinceConditionsDto {
  @ApiProperty({ example: '34', description: 'Plaka kodu (zero-padded).' })
  plateCode!: string;

  @ApiProperty({
    type: MarineConditionsDto,
    isArray: true,
    description:
      'One entry per marine point of this province, in displayOrder. Two entries for the ' +
      'three two-sea provinces; they legitimately disagree and must be labelled by sea.',
  })
  marinePoints!: MarineConditionsDto[];

  @ApiProperty({ type: MarineAttributionDto, isArray: true })
  attributions!: MarineAttributionDto[];
}
