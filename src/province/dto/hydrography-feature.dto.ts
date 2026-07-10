import { ApiProperty } from '@nestjs/swagger';
import { type HydrographyFeature, HydrographyFeatureType } from '../province.types';

/**
 * One hydrographic feature (dam / river / lake) in a province's `hydrographyFeatures`
 * list. `implements HydrographyFeature` so the published contract cannot drift from
 * the stored jsonb shape (a change to the interface breaks this until it follows).
 */
export class HydrographyFeatureDto implements HydrographyFeature {
  @ApiProperty({ example: 'Ömerli Barajı', description: 'Öz ad.' })
  name!: string;

  @ApiProperty({
    enum: HydrographyFeatureType,
    example: HydrographyFeatureType.Baraj,
    description: 'Özellik türü (baraj/nehir/göl) — ASCII değer; TR etiketi web tarafında.',
  })
  type!: HydrographyFeatureType;
}
