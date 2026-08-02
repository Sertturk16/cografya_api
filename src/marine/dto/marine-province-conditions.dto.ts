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
 * ## Why there is NO `dataAvailable` flag here, unlike `MarineOverviewDto` (M5 plan §6)
 * Asked at W2b and answered deliberately: the asymmetry is correct and the flag will not be
 * added.
 *
 * `MarineOverviewDto.dataAvailable` is a PAGE-LEVEL publishing gate. It belongs on `/deniz`
 * because `/deniz` is marine data end to end: committing a cold response there would make an
 * empty page indexable, which is the one failure the marine contract must prevent.
 *
 * `/turkiye/{il}` is a different animal. Marine is one SECTION of a page whose other content
 * (climate, geography) is real Postgres data. A page-level gate here would mean a provider
 * outage takes down the PAGE — the exact inverse of the repo rule that a provider outage
 * degrades the widget and never the page (`ENGINEERING.md` §3.5). And the cold state is
 * already honest at the resolution the province surface actually needs: every field carries
 * `status: 'unavailable'`, per point, which is what the web gates its section on.
 *
 * Steel-man for adding it: with a flag the web could hide the whole section in one check.
 * Counter: that condition is DERIVABLE from the field statuses already in `marinePoints`, and
 * the web derives it in exactly one place today. A second flag whose meaning at page level is
 * ambiguous would add an interpretation gap, not a capability. **Winner: current shape** — the
 * gate already exists at field level, which is the right level for a section.
 *
 * **IMPLEMENTED IN M4b**; `attributions` filled in M5.
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
