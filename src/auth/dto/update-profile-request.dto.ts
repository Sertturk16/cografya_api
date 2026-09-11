import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { EducationLevel, GradeLevel, StudyStream } from '../account.types';
import { IsKnownDepartmentName, IsKnownUniversityName } from '../reference-membership';

/**
 * `PUT /api/auth/profile`'s request body (`plan-api.md` §5.3.3, §10.4).
 *
 * Full replacement semantics: all six properties are REQUIRED-but-nullable.
 * Every key must be present on every request (either a valid value or explicit `null`).
 * An omitted key fails validation with a 400 naming the missing property.
 *
 * `@ValidateIf((_, value) => value !== null)` without `@IsOptional()` ensures that:
 * - `null` skips type validation and is accepted as an explicit clear.
 * - `undefined` triggers the type validator and fails with 400.
 */
export class UpdateProfileRequestDto {
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
