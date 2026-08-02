import { ApiProperty } from '@nestjs/swagger';
import { SeaBasin } from '../marine.types';

/**
 * One marine reference point — the lean, fully-cacheable identity payload.
 *
 * Returned as a PLAIN ARRAY by `GET /api/marine/points`: a bounded, small, rarely-changing
 * set, exactly the case the repo playbook §2 exempts from the response envelope (the 81
 * provinces set the precedent). It does NOT trigger the "first unbounded list introduces the
 * envelope" rule.
 *
 * Also embedded (not duplicated) inside `MarineOverviewPointDto` and `MarineConditionsDto`, so
 * the web repo never has to join a value payload back to a point list.
 */
export class MarinePointListItemDto {
  @ApiProperty({ example: 'istanbul-marmara-aciklari', description: 'TR slug (routing key).' })
  slugTr!: string;

  @ApiProperty({ example: 'istanbul-marmara-offshore', description: 'EN slug (routing key).' })
  slugEn!: string;

  @ApiProperty({
    example: 'İstanbul – Marmara Açıkları',
    description:
      'Standalone full name, used where the point appears WITHOUT province context (the ' +
      '/deniz hub). İstanbul, Çanakkale and Balıkesir each have two points that show ' +
      'different numbers side by side, so the sea must be part of the name.',
  })
  nameTr!: string;

  @ApiProperty({
    example: 'İstanbul – Marmara Offshore',
    description: 'Standalone full name (EN).',
  })
  nameEn!: string;

  @ApiProperty({
    example: 'Marmara açıkları',
    description:
      'Province-relative short label, used INSIDE /turkiye/{il} where the province name is ' +
      'already in the heading and repeating it would be noise. GUARANTEE: derived from the ' +
      "point's seaBasin, and therefore UNIFORM across every point in a basin — the /deniz hub " +
      "relies on it, taking the first point of a group as that basin's heading. Turning this " +
      'into a per-point label would silently mislabel that heading, so it is a basin label ' +
      'that happens to be served per point, not a free-text field.',
  })
  coastLabelTr!: string;

  @ApiProperty({
    example: 'Marmara offshore',
    description: 'Province-relative short label (EN). Same per-basin uniformity guarantee.',
  })
  coastLabelEn!: string;

  @ApiProperty({
    example: '34',
    description: 'Plaka kodu of the province this point is published under (zero-padded).',
  })
  plateCode!: string;

  @ApiProperty({
    example: 40.85,
    description:
      'Requested latitude (decimal degrees). This is OUR chosen coordinate, not the model ' +
      'grid centre — the grid centre is per-provider and is served on the value payload as ' +
      'gridLatitude/gridLongitude.',
  })
  latitude!: number;

  @ApiProperty({ example: 28.8, description: 'Requested longitude (decimal degrees).' })
  longitude!: number;

  @ApiProperty({
    enum: SeaBasin,
    description:
      "The POINT's basin, never the province's. İstanbul has one black_sea point and one " +
      'marmara point; the basin also selects the CMEMS dataset, so deriving it from the ' +
      'province would query the wrong model.',
  })
  seaBasin!: SeaBasin;

  @ApiProperty({
    example: 2,
    description:
      'Presentation order on the /deniz hub — a coastal traverse (Black Sea west→east, then ' +
      'Marmara, Aegean, Mediterranean), not alphabetical.',
  })
  displayOrder!: number;
}
