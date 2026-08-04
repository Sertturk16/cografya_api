import { ApiProperty } from '@nestjs/swagger';
import { Continent } from '../../common/continent.enum';
import { CountryEntityType } from '../../common/country-entity-type.enum';

/**
 * Purpose-sized bulk payload for the /dunya interactive SVG map hover-card (the
 * country-scale analog of the province `map-summary`). Served by
 * `GET /api/countries/map-summary` for every country at once, so the web repo can
 * pre-embed the whole set at build/ISR time and show a hover-card with ZERO per-hover
 * network request (CWV/INP).
 *
 * A DEDICATED DTO, not extra fields on `CountryListItemDto`: the hover-card and the hub
 * list have different needs, so their contracts stay decoupled and can evolve
 * independently — same rationale as `ProvinceMapSummaryDto`.
 *
 * The three hover stats (SPEC §3.2): Nüfus / Yüzölçümü / Komşu ülke sayısı. The last
 * (`neighborCount`) is SERVER-DERIVED from the stored neighbour array — the "ilçe
 * sayısı" replacement (owner-ruled → DEC 2026-07-13), never a stored column. The
 * numeric stats are `nullable` because they are filled progressively after fact-check
 * (an unverified fact stays absent, never invented).
 */
export class CountryMapSummaryDto {
  @ApiProperty({ example: 'TR', description: 'ISO 3166-1 alpha-2 kodu (stable, unique).' })
  isoCode!: string;

  @ApiProperty({ example: 'Türkiye', description: 'Ülke adı (TR).' })
  nameTr!: string;

  @ApiProperty({ example: 'Türkiye', description: 'Ülke adı (EN).' })
  nameEn!: string;

  @ApiProperty({ enum: Continent, description: 'Kıta.' })
  continent!: Continent;

  @ApiProperty({ example: 'turkiye', description: 'TR slug (routing key — kart tıklaması).' })
  slugTr!: string;

  @ApiProperty({ example: 'turkey', description: 'EN slug (routing key).' })
  slugEn!: string;

  @ApiProperty({
    enum: CountryEntityType,
    example: CountryEntityType.Country,
    description:
      'Varlık türü — `country` / `territory` / `special`. Kartın "ülke varsayan" davranışları ' +
      '(alt başlık, komşu sayısı satırı, "kalıcı nüfus yok" satırı) buna dallanır.',
  })
  entityType!: CountryEntityType;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description:
      'Onaylı kart alt başlığı (TR). `country` satırlarında null; `territory`/`special` ' +
      'satırlarında daima dolu — kıta adına düşmeyin (DEC 2026-08-01m).',
  })
  statusLabelTr!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description: 'Onaylı kart alt başlığı (EN). `statusLabelTr` ile aynı kural.',
  })
  statusLabelEn!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 85372000,
    description: 'Nüfus (World Bank / UN). Null until fact-checked.',
  })
  population!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 2024,
    description: 'Nüfus referans yılı.',
  })
  populationYear!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 783562,
    description: 'Yüzölçümü (km², World Bank / UN).',
  })
  areaKm2!: number | null;

  @ApiProperty({
    type: Boolean,
    example: false,
    description:
      '`areaKm2` yaklaşık mı? `true` ise kartta "≈" ile gösterilmelidir (DEC 2026-08-01l). ' +
      'Tek kaynak burasıdır — istemcide sabitlemeyin.',
  })
  areaIsApproximate!: boolean;

  @ApiProperty({
    type: Number,
    example: 8,
    description:
      'Komşu ülke sayısı — SERVER-DERIVED from the neighbour ISO-code array length ' +
      '(the "ilçe sayısı" replacement). Always present (0 for island nations).',
  })
  neighborCount!: number;
}
