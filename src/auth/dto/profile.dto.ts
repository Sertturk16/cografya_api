import { ApiProperty } from '@nestjs/swagger';
import { AccountRole, EducationLevel, GradeLevel, StudyStream } from '../account.types';

/**
 * `GET /api/auth/profile` and `PUT /api/auth/profile` response representation
 * (`plan-api.md` §5.3.2, `DEC 2026-09-03a` md.1, `GLOSSARY.md` §7.1).
 *
 * All seven properties are required in the published schema. Nullable properties
 * use explicit `null` when undeclared or not applicable to the role/branch.
 */
export class ProfileDto {
  @ApiProperty({
    enum: AccountRole,
    example: AccountRole.Student,
    description: 'Beyan edilen hesap rolü — yetki değildir (`GLOSSARY.md` §7.1).',
  })
  accountRole!: AccountRole;

  @ApiProperty({
    enum: EducationLevel,
    nullable: true,
    example: EducationLevel.Secondary,
    description: 'Eğitim düzeyi — null: henüz beyan edilmedi veya öğretmen hesabı.',
  })
  educationLevel!: EducationLevel | null;

  @ApiProperty({
    enum: GradeLevel,
    nullable: true,
    example: GradeLevel.Grade12,
    description: 'Sınıf seviyesi — yalnızca educationLevel = SECONDARY iken geçerlidir.',
  })
  gradeLevel!: GradeLevel | null;

  @ApiProperty({
    enum: StudyStream,
    nullable: true,
    example: StudyStream.Sayisal,
    description: 'Öğrenim alanı / kolu — yalnızca educationLevel = SECONDARY iken geçerlidir.',
  })
  studyStream!: StudyStream | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Boğaziçi Üniversitesi',
    description: 'Üniversite adı — yalnızca UNDERGRADUATE / GRADUATE iken geçerlidir.',
  })
  universityName!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Coğrafya Öğretmenliği',
    description: 'Bölüm / program adı — UNDERGRADUATE için zorunlu, GRADUATE için isteğe bağlıdır.',
  })
  departmentName!: string | null;

  @ApiProperty({
    type: Boolean,
    example: true,
    description:
      'Profilin tamamlanma durumu — TEACHER için true, STUDENT için educationLevel !== null.',
  })
  isComplete!: boolean;
}
