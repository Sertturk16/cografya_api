import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * `DELETE /api/auth/account`'s request body (T-101). Like `PasswordChangeRequestDto.currentPassword`
 * it carries no policy validator: a password older than today's policy must still be accepted.
 */
export class DeleteAccountRequestDto {
  @ApiProperty({
    writeOnly: true,
    description:
      'Üyenin bugünkü şifresi — hesabın gerçekten sahibinin isteğiyle silindiğinin kanıtı. ' +
      'Hiçbir yanıtta, örnekte ya da logda dönmez.',
  })
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;
}
