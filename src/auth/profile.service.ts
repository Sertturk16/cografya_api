import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AUTH_ERROR_KEYS } from './auth-error-keys';
import type { ProfileDto } from './dto/profile.dto';
import {
  isProfileComplete,
  isProfileShapeValid,
  PROFILE_SHAPE_MESSAGE,
} from './dto/profile-shape.rule';
import type { UpdateProfileRequestDto } from './dto/update-profile-request.dto';
import { User } from './entities/user.entity';

/**
 * Service managing user profile read and full-replacement update
 * (`plan-api.md` §5.4, `DEC 2026-09-03a` md.1, `GLOSSARY.md` §7.1).
 *
 * Scoped strictly to the authenticated caller's own record.
 * Never spreads DTOs into persistence calls; always updates explicitly by column name.
 */
@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  /**
   * Reads the caller's own declared profile.
   * Uses a narrow column select to ensure no PII outside the education profile is touched.
   */
  async getProfile(userId: string): Promise<ProfileDto> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: {
        accountRole: true,
        educationLevel: true,
        gradeLevel: true,
        studyStream: true,
        universityName: true,
        departmentName: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException(AUTH_ERROR_KEYS.unauthenticated);
    }

    return {
      accountRole: user.accountRole,
      educationLevel: user.educationLevel,
      gradeLevel: user.gradeLevel,
      studyStream: user.studyStream,
      universityName: user.universityName,
      departmentName: user.departmentName,
      isComplete: isProfileComplete(user.accountRole, user.educationLevel),
    };
  }

  /**
   * Replaces the caller's entire declared education profile (idempotent full replacement).
   *
   * 1. Loads user `{ id, accountRole }`.
   * 2. Normalizes the 5 fields into local constants (defaulting undefined to null for defensive coding).
   * 3. Validates candidate shape against persisted accountRole (NEVER from request).
   * 4. Updates exactly the five education columns.
   * 5. Returns the updated representation with derived `isComplete`.
   */
  async replaceProfile(userId: string, dto: UpdateProfileRequestDto): Promise<ProfileDto> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: {
        id: true,
        accountRole: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException(AUTH_ERROR_KEYS.unauthenticated);
    }

    const educationLevel = dto.educationLevel ?? null;
    const gradeLevel = dto.gradeLevel ?? null;
    const studyStream = dto.studyStream ?? null;
    const universityName = dto.universityName ?? null;
    const departmentName = dto.departmentName ?? null;

    const valid = isProfileShapeValid({
      accountRole: user.accountRole, // from DB, NEVER from request
      educationLevel,
      gradeLevel,
      studyStream,
      universityName,
      departmentName,
    });

    if (!valid) {
      throw new BadRequestException(PROFILE_SHAPE_MESSAGE);
    }

    await this.users.update(
      { id: userId },
      {
        educationLevel,
        gradeLevel,
        studyStream,
        universityName,
        departmentName,
      },
    );

    return {
      accountRole: user.accountRole,
      educationLevel,
      gradeLevel,
      studyStream,
      universityName,
      departmentName,
      isComplete: isProfileComplete(user.accountRole, educationLevel),
    };
  }
}
