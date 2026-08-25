import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * `POST /api/auth/logout`'un request body'si — `RefreshRequestDto` ile AYNI şekli taşır ama ayrı
 * bir sınıftır (parent plan §13.3'ün dondurduğu sözleşme adları; bir tip iki uçta paylaşılmaz).
 */
export class LogoutRequestDto {
  @ApiProperty({
    writeOnly: true,
    description: 'Opak refresh token (§5.2.1). Hiçbir yanıtta, örnekte ya da logda dönmez.',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
