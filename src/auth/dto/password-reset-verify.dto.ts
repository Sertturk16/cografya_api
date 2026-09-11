import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * `POST /api/auth/password-reset/verify`'ün request body'si (§5.4, plan-api.md §5.4).
 *
 * Token alanı `PasswordResetConfirmDto.resetToken` ile BİREBİR aynı şekilde doğrulanır —
 * bu route `confirm`'ün doğrulama yükünü TEKRARLAMAZ, yalnız TÜKETMEZ: aynı jeton `verify`'dan
 * sonra `confirm`'da hâlâ kullanılabilir olmalıdır (bu davranış §5.4's non-consumption property).
 */
export class PasswordResetVerifyDto {
  @ApiProperty({
    writeOnly: true,
    description: 'Opak şifre sıfırlama jetonu (§5.4). Hiçbir yanıtta, örnekte ya da logda dönmez.',
  })
  @IsString()
  @IsNotEmpty()
  resetToken!: string;
}
