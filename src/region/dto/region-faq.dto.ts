import { ApiProperty } from '@nestjs/swagger';

/**
 * FAQ item in region detail page (Bölüm 14).
 */
export class RegionFaqDto {
  @ApiProperty({
    example: "Marmara Bölgesi'nde kaç il var?",
    description: 'Soru metni.',
  })
  question!: string;

  @ApiProperty({
    example: "Marmara Bölgesi'nde 11 il bulunur...",
    description: 'Cevap metni.',
  })
  answer!: string;
}
