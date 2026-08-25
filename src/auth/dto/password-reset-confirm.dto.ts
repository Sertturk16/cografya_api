import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../auth.constants';
import { IsPasswordPolicyCompliant } from '../password-policy';

/**
 * `POST /api/auth/password-reset/confirm`'ün request body'si (§6.1, §5.4.3).
 *
 * §6.2'nin anti-enumeration matrisi gereği şifre politikası kontrolü JETONDAN ÖNCE çalışır —
 * bu sıra `PasswordResetService`'in işidir, DTO'nun değil; DTO yalnız iki alanı da doğrular.
 */
export class PasswordResetConfirmDto {
  @ApiProperty({
    writeOnly: true,
    description: 'Opak şifre sıfırlama jetonu (§5.4). Hiçbir yanıtta, örnekte ya da logda dönmez.',
  })
  @IsString()
  @IsNotEmpty()
  resetToken!: string;

  @ApiProperty({
    writeOnly: true,
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    description:
      'Yeni şifre — aynı politika register ile paylaşılır (`DEC 2026-08-20g` md.1 #5). ' +
      'Hiçbir yanıtta, örnekte ya da logda dönmez.',
  })
  @IsPasswordPolicyCompliant()
  password!: string;
}
