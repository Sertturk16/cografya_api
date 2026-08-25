import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, Matches, MaxLength } from 'class-validator';
import { canonicalizeEmail } from '../email-canonicalization';

const ASCII_ONLY = /^[\x21-\x7E]+$/;

/** `POST /api/auth/password-reset/request`'in request body'si — the "forgot password" step (§6.1). */
export class PasswordResetRequestDto {
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
}
