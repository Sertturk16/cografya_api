import { ApiProperty } from '@nestjs/swagger';
import {
  AccountRole,
  EducationLevel,
  GradeLevel,
  InstitutionType,
  StudyStream,
  TeacherSubject,
} from '../account.types';

/**
 * `GET /api/auth/profile`, `PUT /api/auth/profile` and `PUT /api/auth/account` response
 * representation (`plan-api.md` §5.3.2, `DEC 2026-09-03a` md.1, `GLOSSARY.md` §7.1, T-061).
 *
 * All twenty properties are required in the published schema. Nullable properties
 * use explicit `null` when undeclared or not applicable to the role/branch.
 *
 * **This is the ONLY route that publishes the personal block.** `GET /api/auth/session` stays
 * the minimum-PII set — id, firstName, accountRole and nothing else (§7.3) — because it is read
 * on ordinary navigation; the personal block travels only here, behind `AccessTokenGuard`,
 * `@NoTrustedClientExemption()` and `AuthNoStoreMiddleware`.
 */
export class ProfileDto {
  @ApiProperty({ example: 'Ayşe', maxLength: 100, description: 'Ad.' })
  firstName!: string;

  @ApiProperty({ example: 'Yılmaz', maxLength: 100, description: 'Soyad.' })
  lastName!: string;

  @ApiProperty({
    example: 'reader@example.test',
    maxLength: 254,
    description: 'E-posta — canonical (trim + küçük harf) biçimde. Bu uçtan salt-okunurdur.',
  })
  email!: string;

  @ApiProperty({
    example: '+905551234567',
    description: 'Türkiye cep telefonu, E.164 biçiminde.',
  })
  phone!: string;

  @ApiProperty({
    format: 'uuid',
    example: '6b3f6f5a-6f5a-4f5a-8f5a-6f5a6f5a6f5a',
    description: "Üyenin ilçesi — `GET /api/reference/districts?plateCode=…`'ün döndürdüğü id.",
  })
  districtId!: string;

  @ApiProperty({ example: 'Kadıköy', description: 'İlçenin adı — districtId üzerinden çözülür.' })
  districtName!: string;

  @ApiProperty({
    example: '34',
    description: 'İlin plaka kodu — ilçenin bağlı olduğu ilden türetilir, ayrıca saklanmaz.',
  })
  provincePlateCode!: string;

  @ApiProperty({ example: 'İstanbul', description: 'İlin adı.' })
  provinceName!: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-01-02T03:04:05.000Z',
    description: 'Üyeliğin oluşturulma anı (ISO 8601, UTC).',
  })
  createdAt!: string;

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
    example: 'Synthetic Lisesi',
    description:
      'Okul adı — yalnızca educationLevel = SECONDARY iken anlamlıdır, isteğe bağlıdır, ' +
      'kapalı küme değildir (`GLOSSARY.md` §7.1 `schoolName` alt bloğu, `DEC 2026-09-11g`).',
  })
  schoolName!: string | null;

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
    enum: TeacherSubject,
    nullable: true,
    example: TeacherSubject.Cografya,
    description: 'Öğretmenin branşı — yalnız TEACHER için, aksi halde null (T-103).',
  })
  teacherSubject!: TeacherSubject | null;

  @ApiProperty({
    enum: InstitutionType,
    nullable: true,
    example: InstitutionType.DevletOkulu,
    description: 'Öğretmenin kurum türü — yalnız TEACHER için, aksi halde null (T-103).',
  })
  institutionType!: InstitutionType | null;

  @ApiProperty({
    type: Boolean,
    example: true,
    description:
      'Profilin tamamlanma durumu — STUDENT/PARENT: educationLevel !== null; TEACHER: branş ve ' +
      'kurum dolu; ENTHUSIAST: her zaman true (T-103).',
  })
  isComplete!: boolean;
  @ApiProperty({
    type: Boolean,
    example: false,
    description:
      'Ticari elektronik ileti onayı var mı (T-101). Kayıtta ayrı kutuyla verilir, ' +
      '`PUT /api/auth/account` ile verilip geri alınır.',
  })
  marketingConsent!: boolean;
}
