import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AccountRole, EducationLevel, GradeLevel, StudyStream } from './account.types';
import { AUTH_ERROR_KEYS } from './auth-error-keys';
import { assertDistrictBelongsToProvince } from './district-membership';
import type { ProfileDto } from './dto/profile.dto';
import {
  isProfileComplete,
  isProfileShapeValid,
  PROFILE_SHAPE_MESSAGE,
} from './dto/profile-shape.rule';
import type { UpdateAccountRequestDto } from './dto/update-account-request.dto';
import type { UpdateProfileRequestDto } from './dto/update-profile-request.dto';
import { User } from './entities/user.entity';

/**
 * The joined row {@link ProfileService.readProfileRow} returns — SQL column aliases, not entity
 * property names. Exported because `profile.service.spec.ts` builds fixtures of this exact
 * shape, and a fixture typed as `unknown` would let a renamed column pass its own test.
 */
export interface ProfileRow {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  account_role: AccountRole;
  education_level: EducationLevel | null;
  grade_level: GradeLevel | null;
  study_stream: StudyStream | null;
  school_name: string | null;
  university_name: string | null;
  department_name: string | null;
  created_at: Date;
  district_id: string;
  district_name: string;
  province_plate_code: string;
  province_name: string;
}

/**
 * Service managing the authenticated caller's own profile: the education block
 * (`plan-api.md` §5.4, `DEC 2026-09-03a` md.1, `GLOSSARY.md` §7.1) and, since T-061, the
 * personal block beside it.
 *
 * **Why the read is one raw query and not a repository `findOne`.** `users.district_id` is a
 * plain column, not a `@ManyToOne` — the house pattern this module already follows — so there
 * is no relation for a query builder to join through. Two `findOne` calls would answer the
 * same question in two round trips and leave a window where the district read disagrees with
 * the user read. `FK_users_district` (ON DELETE RESTRICT) and `FK_districts_province`
 * guarantee both joined rows exist, which is what makes INNER JOIN honest here: a member
 * whose district vanished is not a state the schema permits, so an empty result means the
 * USER is gone and `unauthenticated` is the right answer.
 *
 * Scoped strictly to the authenticated caller's own record. Never spreads DTOs into
 * persistence calls; always updates explicitly by column name.
 */
@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Reads the caller's own profile: the personal block, the education block and the derived
   * `isComplete`. The select list is explicit and `password_hash` is not in it — the column
   * also carries `select: false` at the entity level, but a raw query does not consult that,
   * so its absence here is the actual guarantee and `profile.service.spec.ts` asserts it.
   */
  async getProfile(userId: string): Promise<ProfileDto> {
    return this.toDto(await this.readProfileRow(userId));
  }

  /**
   * Replaces the caller's personal block (full replacement, idempotent).
   *
   * Order matters and is pinned by a test: district membership is checked BEFORE the write,
   * so a request naming a district in the wrong province changes nothing at all.
   */
  async replaceAccount(userId: string, dto: UpdateAccountRequestDto): Promise<ProfileDto> {
    await assertDistrictBelongsToProvince(this.dataSource, dto.districtId, dto.provincePlateCode);

    const result = await this.users.update(
      { id: userId },
      {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        districtId: dto.districtId,
      },
    );

    if (!result.affected) {
      throw new UnauthorizedException(AUTH_ERROR_KEYS.unauthenticated);
    }

    // Re-read rather than patch the request onto a stale row: the response then carries the
    // district and province NAMES the new districtId resolves to, which the request never sent.
    return this.getProfile(userId);
  }

  /**
   * Replaces the caller's entire declared education profile (idempotent full replacement).
   *
   * 1. Reads the persisted `accountRole`.
   * 2. Normalizes the 6 fields into local constants (defaulting undefined to null defensively).
   * 3. Validates candidate shape against the persisted accountRole (NEVER from the request).
   * 4. Updates exactly the six education columns.
   * 5. Returns the re-read representation with derived `isComplete`.
   */
  async replaceProfile(userId: string, dto: UpdateProfileRequestDto): Promise<ProfileDto> {
    const rows = await this.dataSource.query<{ account_role: AccountRole }[]>(
      `SELECT u.account_role FROM users u WHERE u.id = $1`,
      [userId],
    );
    const persisted = rows[0];
    if (!persisted) {
      throw new UnauthorizedException(AUTH_ERROR_KEYS.unauthenticated);
    }

    const educationLevel = dto.educationLevel ?? null;
    const gradeLevel = dto.gradeLevel ?? null;
    const studyStream = dto.studyStream ?? null;
    const universityName = dto.universityName ?? null;
    const departmentName = dto.departmentName ?? null;
    const schoolName = dto.schoolName ?? null;

    const valid = isProfileShapeValid({
      accountRole: persisted.account_role, // from DB, NEVER from request
      educationLevel,
      gradeLevel,
      studyStream,
      universityName,
      departmentName,
      schoolName,
    });

    if (!valid) {
      throw new BadRequestException(PROFILE_SHAPE_MESSAGE);
    }

    const result = await this.users.update(
      { id: userId },
      {
        educationLevel,
        gradeLevel,
        studyStream,
        universityName,
        departmentName,
        schoolName,
      },
    );

    if (!result.affected) {
      throw new UnauthorizedException(AUTH_ERROR_KEYS.unauthenticated);
    }

    return this.getProfile(userId);
  }

  private async readProfileRow(userId: string): Promise<ProfileRow> {
    const rows = await this.dataSource.query<ProfileRow[]>(
      `SELECT u.first_name,
              u.last_name,
              u.email,
              u.phone,
              u.account_role,
              u.education_level,
              u.grade_level,
              u.study_stream,
              u.school_name,
              u.university_name,
              u.department_name,
              u.created_at,
              u.district_id,
              d.name_tr    AS district_name,
              p.plate_code AS province_plate_code,
              p.name_tr    AS province_name
         FROM users u
         INNER JOIN districts d ON d.id = u.district_id
         INNER JOIN provinces p ON p.id = d.province_id
        WHERE u.id = $1`,
      [userId],
    );

    const row = rows[0];
    if (!row) {
      throw new UnauthorizedException(AUTH_ERROR_KEYS.unauthenticated);
    }
    return row;
  }

  private toDto(row: ProfileRow): ProfileDto {
    return {
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      accountRole: row.account_role,
      educationLevel: row.education_level,
      gradeLevel: row.grade_level,
      studyStream: row.study_stream,
      schoolName: row.school_name,
      universityName: row.university_name,
      departmentName: row.department_name,
      districtId: row.district_id,
      districtName: row.district_name,
      provincePlateCode: row.province_plate_code,
      provinceName: row.province_name,
      createdAt: new Date(row.created_at).toISOString(),
      isComplete: isProfileComplete(row.account_role, row.education_level),
    };
  }
}
