import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../auth.constants';
import { IsPasswordPolicyCompliant } from '../password-policy';

/**
 * `POST /api/auth/password/change`'s request body (T-061).
 *
 * **Only `newPassword` carries the policy validator, and that asymmetry is deliberate.**
 * `currentPassword` is a value the member ALREADY has; running today's policy over it would
 * lock out anyone whose password predates a policy tightening — they would be told their
 * current password is invalid by the very form meant to replace it. Its only shape rule is
 * that it is a non-empty string; whether it is correct is answered by an Argon2 verify, not
 * by a decorator.
 */
export class PasswordChangeRequestDto {
  @ApiProperty({
    writeOnly: true,
    description:
      'Üyenin bugünkü şifresi. Politika denetiminden GEÇMEZ — bugünkü politikadan eski bir ' +
      'şifre de sunulabilmelidir. Hiçbir yanıtta, örnekte ya da logda dönmez.',
  })
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({
    writeOnly: true,
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    description:
      'En az bir küçük harf, bir büyük harf ve bir rakam içermeli (`DEC 2026-08-20g` md.1 #5). ' +
      'Hiçbir yanıtta, örnekte ya da logda dönmez.',
  })
  @IsPasswordPolicyCompliant()
  newPassword!: string;
}
