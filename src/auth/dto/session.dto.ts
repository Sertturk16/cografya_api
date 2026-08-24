import { ApiProperty } from '@nestjs/swagger';
import { AccountRole } from '../account.types';

/**
 * `GET /api/auth/session`'ın yanıtı — parent §7.3'ün minimum PII kümesi.
 *
 * **Yalnız** bu üç alan. `email`, `phone`, `lastName`, `districtId`, `educationLevel`,
 * `universityName`, `departmentName` **YOKTUR** — bu bir eksiklik değil, §7.3'ün kasıtlı sınırı.
 * `User` entity'si asla doğrudan serialize edilmez; bu DTO explicit allowlist'tir.
 */
export class SessionDto {
  @ApiProperty({ format: 'uuid', description: 'users.id.' })
  id!: string;

  @ApiProperty({
    example: 'Ayşe',
    description: 'Selamlama için — soyad, e-posta ya da telefon yok.',
  })
  firstName!: string;

  @ApiProperty({
    enum: AccountRole,
    example: AccountRole.Student,
    description: 'Beyan edilen hesap rolü — yetki değildir (`GLOSSARY.md` §7.1).',
  })
  accountRole!: AccountRole;
}
