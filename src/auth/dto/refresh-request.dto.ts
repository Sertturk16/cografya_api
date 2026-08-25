import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** `POST /api/auth/refresh`'in request body'si (D2 — refresh token gövdede, cookie'de değil). */
export class RefreshRequestDto {
  @ApiProperty({
    writeOnly: true,
    description: 'Opak refresh token (§5.2.1). Hiçbir yanıtta, örnekte ya da logda dönmez.',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
