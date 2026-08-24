import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../auth.constants';
import { canonicalizeEmail } from '../email-canonicalization';

const ASCII_ONLY = /^[\x21-\x7E]+$/;

/**
 * `POST /api/auth/login`'in request body'si (§6.1).
 *
 * `password` burada `IsPasswordPolicyCompliant()` TAŞIMAZ, kasıtlı: login mevcut bir hash'e karşı
 * doğrulama yapar, gelecekte politika sıkılaşırsa eski (ama geçerli) bir parola login'i
 * kilitlemez. Yalnız `PASSWORD_MAX_LENGTH` ile bounded — Argon2'nin `verify` çağrısına sınırsız
 * girdi verilmez.
 */
export class LoginRequestDto {
  @ApiProperty({
    example: 'reader@example.test',
    maxLength: 254,
    description: 'E-posta — trim + küçük harfe çevrilir (canonical form).',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? canonicalizeEmail(value) : value,
  )
  @IsEmail()
  @MaxLength(254)
  @Matches(ASCII_ONLY, { message: 'email must contain only visible ASCII characters' })
  email!: string;

  @ApiProperty({
    writeOnly: true,
    maxLength: PASSWORD_MAX_LENGTH,
    description: 'Hiçbir yanıtta, örnekte ya da logda dönmez.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}
