import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import {
  AccountRole,
  EducationLevel,
  GradeLevel,
  InstitutionType,
  StudyStream,
  TeacherSubject,
} from '../account.types';
import { IsKnownDepartmentName, IsKnownUniversityName } from '../reference-membership';

/**
 * `PUT /api/auth/profile`'s request body (`plan-api.md` §5.3.3, §10.4).
 *
 * Full replacement semantics: all nine properties are REQUIRED-but-nullable, except
 * `accountRole`, which is required and never null. The role is a declaration with no
 * permission attached, so the member may change it here (T-103).
 * Every key must be present on every request (either a valid value or explicit `null`).
 * An omitted key fails validation with a 400 naming the missing property.
 *
 * `@ValidateIf((_, value) => value !== null)` without `@IsOptional()` ensures that:
 * - `null` skips type validation and is accepted as an explicit clear.
 * - `undefined` triggers the type validator and fails with 400.
 */
export class UpdateProfileRequestDto {
  @ApiProperty({
    enum: AccountRole,
    description: 'Beyan edilen hesap türü; bu uçla değiştirilebilir. Yetki değildir (T-103).',
  })
  @IsEnum(AccountRole)
  accountRole!: AccountRole;

  @ApiProperty({
    enum: TeacherSubject,
    nullable: true,
    description: 'Öğretmenin branşı (TEACHER için). null değeri alanı temizlemek için kullanılır.',
  })
  @ValidateIf((_, value: unknown) => value !== null)
  @IsEnum(TeacherSubject)
  teacherSubject!: TeacherSubject | null;

  @ApiProperty({
    enum: InstitutionType,
    nullable: true,
    description:
      'Öğretmenin kurum türü (TEACHER için). null değeri alanı temizlemek için kullanılır.',
  })
  @ValidateIf((_, value: unknown) => value !== null)
  @IsEnum(InstitutionType)
  institutionType!: InstitutionType | null;

  @ApiProperty({
    enum: EducationLevel,
    nullable: true,
    description: 'Eğitim düzeyi. null değeri alanı temizlemek için kullanılır.',
  })
  @ValidateIf((_, value: unknown) => value !== null)
  @IsEnum(EducationLevel)
  educationLevel!: EducationLevel | null;

  @ApiProperty({
    enum: GradeLevel,
    nullable: true,
    description: 'Sınıf seviyesi (SECONDARY için). null değeri alanı temizlemek için kullanılır.',
  })
  @ValidateIf((_, value: unknown) => value !== null)
  @IsEnum(GradeLevel)
  gradeLevel!: GradeLevel | null;

  @ApiProperty({
    enum: StudyStream,
    nullable: true,
    description: 'Öğrenim alanı (SECONDARY için). null değeri alanı temizlemek için kullanılır.',
  })
  @ValidateIf((_, value: unknown) => value !== null)
  @IsEnum(StudyStream)
  studyStream!: StudyStream | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Okul adı (SECONDARY için, isteğe bağlı, kapalı küme değil — `GLOSSARY.md` §7.1 ' +
      '`schoolName` alt bloğu, `DEC 2026-09-11g`). null değeri alanı temizlemek için kullanılır.',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  schoolName!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Üniversite adı (UNDERGRADUATE / GRADUATE için). null değeri alanı temizlemek için kullanılır.',
  })
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @IsKnownUniversityName()
  universityName!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Bölüm adı (UNDERGRADUATE / GRADUATE için). null değeri alanı temizlemek için kullanılır.',
  })
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @IsKnownDepartmentName()
  departmentName!: string | null;
}
