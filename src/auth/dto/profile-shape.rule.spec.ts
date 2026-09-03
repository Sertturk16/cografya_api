import { describe, expect, it } from '@jest/globals';
import { AccountRole, EducationLevel, GradeLevel, StudyStream } from '../account.types';
import { isProfileShapeValid, type ProfileShapeCandidate } from './profile-shape.rule';

/**
 * U-PS1: the four branches' full positive matrix, plus every missing/extra-field negative per
 * branch — mirrors `CHK_users_profile_shape` (`../entities/user.entity.ts`) case for case.
 */
describe('isProfileShapeValid (§6.4 profile matrix)', () => {
  describe('TEACHER', () => {
    const base: ProfileShapeCandidate = { accountRole: AccountRole.Teacher };

    it('accepts a teacher with no education field at all', () => {
      expect(isProfileShapeValid(base)).toBe(true);
    });

    it('rejects a teacher carrying any education field', () => {
      expect(isProfileShapeValid({ ...base, educationLevel: EducationLevel.Secondary })).toBe(
        false,
      );
      expect(isProfileShapeValid({ ...base, gradeLevel: GradeLevel.Grade9 })).toBe(false);
      expect(isProfileShapeValid({ ...base, studyStream: StudyStream.Sayisal })).toBe(false);
      expect(isProfileShapeValid({ ...base, universityName: 'Boğaziçi Üniversitesi' })).toBe(false);
      expect(isProfileShapeValid({ ...base, departmentName: 'Coğrafya Öğretmenliği' })).toBe(false);
    });
  });

  describe('STUDENT + SECONDARY', () => {
    const base: ProfileShapeCandidate = {
      accountRole: AccountRole.Student,
      educationLevel: EducationLevel.Secondary,
      gradeLevel: GradeLevel.Grade9,
      studyStream: StudyStream.Sayisal,
    };

    it('accepts gradeLevel + studyStream, with university/department absent', () => {
      expect(isProfileShapeValid(base)).toBe(true);
    });

    it('rejects a missing gradeLevel', () => {
      expect(isProfileShapeValid({ ...base, gradeLevel: undefined })).toBe(false);
    });

    it('rejects a missing studyStream', () => {
      expect(isProfileShapeValid({ ...base, studyStream: undefined })).toBe(false);
    });

    it('rejects an extra universityName', () => {
      expect(isProfileShapeValid({ ...base, universityName: 'Boğaziçi Üniversitesi' })).toBe(false);
    });

    it('rejects an extra departmentName', () => {
      expect(isProfileShapeValid({ ...base, departmentName: 'Coğrafya Öğretmenliği' })).toBe(false);
    });
  });

  describe('STUDENT + UNDERGRADUATE', () => {
    const base: ProfileShapeCandidate = {
      accountRole: AccountRole.Student,
      educationLevel: EducationLevel.Undergraduate,
      universityName: 'Boğaziçi Üniversitesi',
      departmentName: 'Coğrafya Öğretmenliği',
    };

    it('accepts university + department, with grade/stream absent', () => {
      expect(isProfileShapeValid(base)).toBe(true);
    });

    it('rejects a missing universityName', () => {
      expect(isProfileShapeValid({ ...base, universityName: undefined })).toBe(false);
    });

    it('rejects a missing departmentName', () => {
      expect(isProfileShapeValid({ ...base, departmentName: undefined })).toBe(false);
    });

    it('rejects an extra gradeLevel', () => {
      expect(isProfileShapeValid({ ...base, gradeLevel: GradeLevel.Grade9 })).toBe(false);
    });

    it('rejects an extra studyStream', () => {
      expect(isProfileShapeValid({ ...base, studyStream: StudyStream.Sayisal })).toBe(false);
    });
  });

  describe('STUDENT + GRADUATE', () => {
    const base: ProfileShapeCandidate = {
      accountRole: AccountRole.Student,
      educationLevel: EducationLevel.Graduate,
      universityName: 'Boğaziçi Üniversitesi',
    };

    it('accepts university alone, department omitted (optional)', () => {
      expect(isProfileShapeValid(base)).toBe(true);
    });

    it('accepts university with department also present', () => {
      expect(isProfileShapeValid({ ...base, departmentName: 'Coğrafya' })).toBe(true);
    });

    it('rejects a missing universityName', () => {
      expect(isProfileShapeValid({ ...base, universityName: undefined })).toBe(false);
    });

    it('rejects an extra gradeLevel', () => {
      expect(isProfileShapeValid({ ...base, gradeLevel: GradeLevel.Grade9 })).toBe(false);
    });

    it('rejects an extra studyStream', () => {
      expect(isProfileShapeValid({ ...base, studyStream: StudyStream.Sayisal })).toBe(false);
    });
  });

  describe('STUDENT (Minimal Registration — Decision 2-B, DEC 2026-09-03a md.1)', () => {
    const base: ProfileShapeCandidate = {
      accountRole: AccountRole.Student,
    };

    it('accepts a student with no education fields at all pending onboarding', () => {
      expect(isProfileShapeValid(base)).toBe(true);
      expect(isProfileShapeValid({ ...base, educationLevel: null })).toBe(true);
    });

    it('rejects a minimal student carrying any education field without an educationLevel', () => {
      expect(isProfileShapeValid({ ...base, gradeLevel: GradeLevel.Grade9 })).toBe(false);
      expect(isProfileShapeValid({ ...base, studyStream: StudyStream.Sayisal })).toBe(false);
      expect(isProfileShapeValid({ ...base, universityName: 'Boğaziçi Üniversitesi' })).toBe(false);
      expect(isProfileShapeValid({ ...base, departmentName: 'Coğrafya' })).toBe(false);
    });
  });

  describe('malformed input', () => {
    it('rejects an accountRole outside the closed set', () => {
      expect(isProfileShapeValid({ accountRole: undefined })).toBe(false);
    });
  });
});
