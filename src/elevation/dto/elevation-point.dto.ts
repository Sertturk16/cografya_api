import { ApiProperty } from '@nestjs/swagger';

/**
 * One geographic point of the profile contract.
 *
 * The field names are `GLOSSARY.md` §3's (`koordinat` = `latitude`/`longitude`), which is also
 * what `ProvinceDetailDto` and `ProvinceListItemDto` publish — so a consumer can hand a province's
 * point straight to this endpoint without renaming anything.
 */
export class ElevationPointDto {
  @ApiProperty({
    type: Number,
    example: 41.287,
    description:
      'Enlem (decimal degrees), 3 ondalığa yuvarlanmış hâliyle — profilin gerçekten ölçüldüğü ' +
      'nokta budur, istemcinin gönderdiği ham değer değil.',
  })
  latitude!: number;

  @ApiProperty({
    type: Number,
    example: 36.33,
    description: 'Boylam (decimal degrees), aynı yuvarlama ile.',
  })
  longitude!: number;
}
