import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { AccountRole, EducationLevel, GradeLevel, StudyStream } from '../account.types';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../auth.constants';
import { canonicalizeEmail } from '../email-canonicalization';
import type { MailLocale } from '../mail/mailer.port';
import { IsPasswordPolicyCompliant } from '../password-policy';
import { canonicalizePhone } from '../phone-canonicalization';
import { IsKnownDepartmentName, IsKnownUniversityName } from '../reference-membership';
import { ProfileShapeValid } from './profile-shape.rule';

const ASCII_ONLY = /^[\x21-\x7E]+$/;
const TURKISH_MOBILE_E164 = /^\+905[0-9]{9}$/;
const PROVINCE_PLATE_CODE = /^[0-9]{2}$/;

/**
 * `POST /api/auth/register`'s request body (§6.4, `DEC 2026-08-20g` md.1/md.2,
 * `DEC 2026-08-20h`, `GLOSSARY.md` §4.4/§7.1).
 *
 * **Shape validation only.** Two checks the decorators below deliberately do NOT make:
 * `districtId` existing and belonging to `provincePlateCode` (D15 — a DB-going check needs
 * `useContainer(app, { fallbackOnErrors: true })`, and `src/main.ts` is frozen — Y1);
 * `RegistrationService` makes that one check in one query instead. Every field carries a
 * decorator, so the global pipe's `whitelist` + `forbidNonWhitelisted` rejects an undeclared
 * field (`passwordConfirm`) by name rather than silently dropping it (§13.5 md.2/md.3).
 */
export class RegisterRequestDto {
  @ApiProperty({ example: 'Ayşe', maxLength: 100, description: 'Ad — trim edilir, boş olamaz.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({
    example: 'Yılmaz',
    maxLength: 100,
    description: 'Soyad — trim edilir, boş olamaz.',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({
    example: '+905551234567',
    description:
      'Türkiye cep telefonu, E.164. Yaygın yazımlar (0532…, 90532…, boşluk/tire/parantezli) ' +
      'kabul edilip +90 biçimine katlanır; sonuç bu biçime uymuyorsa 400.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? canonicalizePhone(value) : value,
  )
  @Matches(TURKISH_MOBILE_E164, { message: 'phone must be a Turkish mobile number in +90 form' })
  phone!: string;

  @ApiProperty({
    example: 'reader@example.test',
    maxLength: 254,
    description: 'E-posta — trim + küçük harfe çevrilir (canonical form), ASCII-only, RFC şekli.',
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
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    description:
      'En az bir küçük harf, bir büyük harf ve bir rakam içermeli (`DEC 2026-08-20g` md.1 #5). ' +
      'Hiçbir yanıtta, örnekte ya da logda dönmez.',
  })
  @IsPasswordPolicyCompliant()
  password!: string;

  @ApiProperty({
    enum: AccountRole,
    example: AccountRole.Student,
    description: 'Beyan edilen hesap rolü — yetki değildir (`GLOSSARY.md` §7.1).',
  })
  @IsEnum(AccountRole)
  @ProfileShapeValid()
  accountRole!: AccountRole;

  @ApiPropertyOptional({
    enum: EducationLevel,
    example: EducationLevel.Secondary,
    description:
      'Yalnız accountRole=STUDENT gönderir; TEACHER bu alanı hiç göndermez (profil matrisi, §6.4).',
  })
  @IsOptional()
  @IsEnum(EducationLevel)
  educationLevel?: EducationLevel;

  @ApiPropertyOptional({
    enum: GradeLevel,
    example: GradeLevel.Grade12,
    description: 'Yalnız educationLevel=SECONDARY gönderir.',
  })
  @IsOptional()
  @IsEnum(GradeLevel)
  gradeLevel?: GradeLevel;

  @ApiPropertyOptional({
    enum: StudyStream,
    example: StudyStream.Sayisal,
    description: 'Yalnız educationLevel=SECONDARY gönderir.',
  })
  @IsOptional()
  @IsEnum(StudyStream)
  studyStream?: StudyStream;

  @ApiPropertyOptional({
    example: 'Boğaziçi Üniversitesi',
    description:
      'Yalnız educationLevel=UNDERGRADUATE|GRADUATE gönderir; `GET /api/reference/universities`' +
      "'ün nameTr kümesinde olmak zorunda.",
  })
  @IsOptional()
  @IsString()
  @IsKnownUniversityName()
  universityName?: string;

  @ApiPropertyOptional({
    example: 'Coğrafya Öğretmenliği',
    description:
      'Yalnız educationLevel=UNDERGRADUATE gönderir (GRADUATE için opsiyonel); ' +
      "`GET /api/reference/departments`'ın nameTr kümesinde olmak zorunda.",
  })
  @IsOptional()
  @IsString()
  @IsKnownDepartmentName()
  departmentName?: string;

  @ApiProperty({
    format: 'uuid',
    example: '6b3f6f5a-6f5a-4f5a-8f5a-6f5a6f5a6f5a',
    description:
      "`GET /api/reference/districts?plateCode=…`'ün döndürdüğü id. Var olduğu ve " +
      'provincePlateCode ile ait olduğu RegistrationService tarafından tek sorguyla doğrulanır (D15).',
  })
  @IsUUID('4')
  districtId!: string;

  @ApiProperty({
    example: '34',
    pattern: PROVINCE_PLATE_CODE.source,
    description:
      'İlin plaka kodu, iki hane ve başı sıfırla dolgulu — districtId ile birlikte doğrulanır.',
  })
  @Matches(PROVINCE_PLATE_CODE, {
    message: 'provincePlateCode must be exactly two digits (zero-padded)',
  })
  provincePlateCode!: string;

  @ApiPropertyOptional({
    enum: ['tr', 'en'],
    default: 'tr',
    description: 'Form alanı değil — doğrulama e-postasının dili. Belirtilmezse tr.',
  })
  @IsOptional()
  @IsIn(['tr', 'en'])
  locale: MailLocale = 'tr';
}
