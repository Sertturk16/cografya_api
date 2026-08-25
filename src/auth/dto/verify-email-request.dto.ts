import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, Matches, MaxLength } from 'class-validator';
import { canonicalizeEmail } from '../email-canonicalization';

const ASCII_ONLY = /^[\x21-\x7E]+$/;
const SIX_DIGIT_CODE = /^[0-9]{6}$/;

/** `POST /api/auth/verify-email`'s request body (§6.1, §5.3). */
export class VerifyEmailRequestDto {
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
    description: 'Tam 6 haneli doğrulama kodu (§5.3). Hiçbir yanıtta, örnekte ya da logda dönmez.',
  })
  @Matches(SIX_DIGIT_CODE, { message: 'code must be exactly 6 digits' })
  code!: string;
}
