import { ApiProperty } from '@nestjs/swagger';

/**
 * Province summary item in region detail page (Bölüm 11).
 */
export class RegionProvinceItemDto {
  @ApiProperty({ example: '34', description: 'Plaka kodu.' })
  plateCode!: string;

  @ApiProperty({ example: 'İstanbul', description: 'İl adı.' })
  nameTr!: string;

  @ApiProperty({ example: 'istanbul', description: 'İl URL slugı.' })
  slugTr!: string;

  @ApiProperty({ type: Number, nullable: true, example: 15754053, description: 'İl nüfusu.' })
  population!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 5461, description: 'İl yüzölçümü (km²).' })
  areaKm2!: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Marmara geçiş iklimi',
    description: 'Müfredat iklim adı.',
  })
  climateNameTr!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Csa',
    description: 'Köppen iklim kodu.',
  })
  climateKoppen!: string | null;
}
