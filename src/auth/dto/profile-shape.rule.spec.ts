import { describe, expect, it } from '@jest/globals';
import { AccountRole, EducationLevel, GradeLevel, StudyStream } from '../account.types';
import {
  isProfileComplete,
  isProfileShapeValid,
  type ProfileShapeCandidate,
} from './profile-shape.rule';

/**
 * U-PS1: the five branches' full positive matrix, plus every missing/extra-field negative per
 * branch — mirrors `CHK_users_profile_shape` (`../entities/user.entity.ts`) case for case.
 *
 * `PARENT` (UYE-P1E, `GLOSSARY.md` §7.1) reuses the STUDENT branches in full, so every STUDENT
 * describe block below has a PARENT mirror asserting the identical shape. `schoolName`
 * (`GLOSSARY.md` §7.1 `schoolName` sub-block, `DEC 2026-09-11g`) is additionally exercised on
 * every branch: rejected wherever it is not SECONDARY, accepted present or absent inside
 * SECONDARY for both STUDENT and PARENT.
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

    it('rejects a teacher carrying schoolName', () => {
      expect(isProfileShapeValid({ ...base, schoolName: 'Synthetic Lisesi' })).toBe(false);
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

    it('accepts schoolName present (optional, not required)', () => {
      expect(isProfileShapeValid({ ...base, schoolName: 'Synthetic Lisesi' })).toBe(true);
    });

    it('accepts schoolName absent (optional, not required)', () => {
      expect(isProfileShapeValid({ ...base, schoolName: undefined })).toBe(true);
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

  describe('PARENT + SECONDARY (mirrors STUDENT + SECONDARY, GLOSSARY.md §7.1)', () => {
    const base: ProfileShapeCandidate = {
      accountRole: AccountRole.Parent,
      educationLevel: EducationLevel.Secondary,
      gradeLevel: GradeLevel.Grade9,
      studyStream: StudyStream.Sayisal,
    };

    it('accepts gradeLevel + studyStream, with university/department absent', () => {
      expect(isProfileShapeValid(base)).toBe(true);
    });

    it('accepts schoolName present (optional, not required)', () => {
      expect(isProfileShapeValid({ ...base, schoolName: 'Synthetic Lisesi' })).toBe(true);
    });

    it('accepts schoolName absent (optional, not required)', () => {
      expect(isProfileShapeValid({ ...base, schoolName: undefined })).toBe(true);
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

    it('rejects an extra schoolName', () => {
      expect(isProfileShapeValid({ ...base, schoolName: 'Synthetic Lisesi' })).toBe(false);
    });
  });

  describe('PARENT + UNDERGRADUATE (mirrors STUDENT + UNDERGRADUATE, GLOSSARY.md §7.1)', () => {
    const base: ProfileShapeCandidate = {
      accountRole: AccountRole.Parent,
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

    it('rejects an extra schoolName', () => {
      expect(isProfileShapeValid({ ...base, schoolName: 'Synthetic Lisesi' })).toBe(false);
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

    it('rejects an extra schoolName', () => {
      expect(isProfileShapeValid({ ...base, schoolName: 'Synthetic Lisesi' })).toBe(false);
    });
  });

  describe('PARENT + GRADUATE (mirrors STUDENT + GRADUATE, GLOSSARY.md §7.1)', () => {
    const base: ProfileShapeCandidate = {
      accountRole: AccountRole.Parent,
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

    it('rejects an extra schoolName', () => {
      expect(isProfileShapeValid({ ...base, schoolName: 'Synthetic Lisesi' })).toBe(false);
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
      expect(isProfileShapeValid({ ...base, schoolName: 'Synthetic Lisesi' })).toBe(false);
    });
  });

  describe('PARENT (Minimal Registration, mirrors STUDENT minimal — GLOSSARY.md §7.1)', () => {
    const base: ProfileShapeCandidate = {
      accountRole: AccountRole.Parent,
    };

    it('accepts a parent with no education fields at all pending onboarding', () => {
      expect(isProfileShapeValid(base)).toBe(true);
      expect(isProfileShapeValid({ ...base, educationLevel: null })).toBe(true);
    });

    it('rejects a minimal parent carrying any education field without an educationLevel', () => {
      expect(isProfileShapeValid({ ...base, gradeLevel: GradeLevel.Grade9 })).toBe(false);
      expect(isProfileShapeValid({ ...base, studyStream: StudyStream.Sayisal })).toBe(false);
      expect(isProfileShapeValid({ ...base, universityName: 'Boğaziçi Üniversitesi' })).toBe(false);
      expect(isProfileShapeValid({ ...base, departmentName: 'Coğrafya' })).toBe(false);
      expect(isProfileShapeValid({ ...base, schoolName: 'Synthetic Lisesi' })).toBe(false);
    });
  });

  describe('malformed input', () => {
    it('rejects an accountRole outside the closed set', () => {
      expect(isProfileShapeValid({ accountRole: undefined })).toBe(false);
    });

    it('rejects a STUDENT with an unrecognized educationLevel', () => {
      expect(
        isProfileShapeValid({
          accountRole: AccountRole.Student,
          educationLevel: 'UNKNOWN' as EducationLevel,
        }),
      ).toBe(false);
    });

    it('rejects a PARENT with an unrecognized educationLevel', () => {
      expect(
        isProfileShapeValid({
          accountRole: AccountRole.Parent,
          educationLevel: 'UNKNOWN' as EducationLevel,
        }),
      ).toBe(false);
    });
  });

  describe('isProfileComplete', () => {
    it('reports true for TEACHER regardless of educationLevel', () => {
      expect(isProfileComplete(AccountRole.Teacher, null)).toBe(true);
    });

    it('reports false for STUDENT when educationLevel is null', () => {
      expect(isProfileComplete(AccountRole.Student, null)).toBe(false);
    });

    it('reports true for STUDENT when educationLevel is set', () => {
      expect(isProfileComplete(AccountRole.Student, EducationLevel.Secondary)).toBe(true);
      expect(isProfileComplete(AccountRole.Student, EducationLevel.Undergraduate)).toBe(true);
      expect(isProfileComplete(AccountRole.Student, EducationLevel.Graduate)).toBe(true);
    });

    it('reports false for PARENT when educationLevel is null', () => {
      expect(isProfileComplete(AccountRole.Parent, null)).toBe(false);
    });

    it('reports true for PARENT when educationLevel is set', () => {
      expect(isProfileComplete(AccountRole.Parent, EducationLevel.Secondary)).toBe(true);
    });
  });
});
