import { describe, expect, it } from '@jest/globals';
import {
  AccountRole,
  EducationLevel,
  GradeLevel,
  InstitutionType,
  StudyStream,
  TeacherSubject,
} from '../account.types';
import {
  isProfileComplete,
  isProfileShapeValid,
  type ProfileShapeCandidate,
} from './profile-shape.rule';

/**
 * U-PS1: the four-role matrix's full positive matrix, plus every missing/extra-field negative
 * per branch — mirrors `CHK_users_profile_shape` (`../entities/user.entity.ts`) case for case.
 *
 * `PARENT` (T-103) is its own branch: minimal, or SECONDARY with grade + stream and no school;
 * UNDERGRADUATE/GRADUATE are rejected. TEACHER carries both teacher fields or neither;
 * ENTHUSIAST carries nothing.
 */
describe('isProfileShapeValid (§6.4 profile matrix)', () => {
  describe('TEACHER', () => {
    const base: ProfileShapeCandidate = { accountRole: AccountRole.Teacher };
    const full: ProfileShapeCandidate = {
      ...base,
      teacherSubject: TeacherSubject.Cografya,
      institutionType: InstitutionType.DevletOkulu,
    };

    it('accepts a minimal teacher (no teacher field, no education field)', () => {
      expect(isProfileShapeValid(base)).toBe(true);
    });

    it('accepts a teacher with both teacher fields', () => {
      expect(isProfileShapeValid(full)).toBe(true);
    });

    it('rejects a teacher with only one of the two teacher fields', () => {
      expect(isProfileShapeValid({ ...base, teacherSubject: TeacherSubject.Diger })).toBe(false);
      expect(isProfileShapeValid({ ...base, institutionType: InstitutionType.OzelOkul })).toBe(
        false,
      );
    });

    it('rejects a teacher carrying any education field', () => {
      expect(isProfileShapeValid({ ...full, educationLevel: EducationLevel.Secondary })).toBe(
        false,
      );
      expect(isProfileShapeValid({ ...full, gradeLevel: GradeLevel.Grade9 })).toBe(false);
      expect(isProfileShapeValid({ ...full, studyStream: StudyStream.Sayisal })).toBe(false);
      expect(isProfileShapeValid({ ...full, universityName: 'Boğaziçi Üniversitesi' })).toBe(false);
      expect(isProfileShapeValid({ ...full, departmentName: 'Coğrafya Öğretmenliği' })).toBe(false);
      expect(isProfileShapeValid({ ...full, schoolName: 'Synthetic Lisesi' })).toBe(false);
    });
  });

  describe('ENTHUSIAST', () => {
    const base: ProfileShapeCandidate = { accountRole: AccountRole.Enthusiast };

    it('accepts an enthusiast with no field at all', () => {
      expect(isProfileShapeValid(base)).toBe(true);
    });

    it('rejects an enthusiast carrying any education or teacher field', () => {
      expect(isProfileShapeValid({ ...base, educationLevel: EducationLevel.Secondary })).toBe(
        false,
      );
      expect(isProfileShapeValid({ ...base, gradeLevel: GradeLevel.Grade9 })).toBe(false);
      expect(isProfileShapeValid({ ...base, schoolName: 'Synthetic Lisesi' })).toBe(false);
      expect(isProfileShapeValid({ ...base, teacherSubject: TeacherSubject.Cografya })).toBe(false);
      expect(isProfileShapeValid({ ...base, institutionType: InstitutionType.Diger })).toBe(false);
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

  describe('PARENT + SECONDARY (the child, T-103)', () => {
    const base: ProfileShapeCandidate = {
      accountRole: AccountRole.Parent,
      educationLevel: EducationLevel.Secondary,
      gradeLevel: GradeLevel.Grade12,
      studyStream: StudyStream.EsitAgirlik,
    };

    it("accepts the child's grade + stream", () => {
      expect(isProfileShapeValid(base)).toBe(true);
    });

    it('rejects a school name: the child is not identified', () => {
      expect(isProfileShapeValid({ ...base, schoolName: 'Synthetic Lisesi' })).toBe(false);
    });

    it('rejects a missing gradeLevel or studyStream', () => {
      expect(isProfileShapeValid({ ...base, gradeLevel: undefined })).toBe(false);
      expect(isProfileShapeValid({ ...base, studyStream: undefined })).toBe(false);
    });

    it('rejects university, department or teacher fields', () => {
      expect(isProfileShapeValid({ ...base, universityName: 'Boğaziçi Üniversitesi' })).toBe(false);
      expect(isProfileShapeValid({ ...base, departmentName: 'Coğrafya Öğretmenliği' })).toBe(false);
      expect(isProfileShapeValid({ ...base, teacherSubject: TeacherSubject.Cografya })).toBe(false);
    });
  });

  describe('PARENT + UNDERGRADUATE / GRADUATE (T-103: rejected)', () => {
    it('rejects a parent declaring a higher-education level', () => {
      expect(
        isProfileShapeValid({
          accountRole: AccountRole.Parent,
          educationLevel: EducationLevel.Undergraduate,
          universityName: 'Boğaziçi Üniversitesi',
          departmentName: 'Coğrafya Öğretmenliği',
        }),
      ).toBe(false);
      expect(
        isProfileShapeValid({
          accountRole: AccountRole.Parent,
          educationLevel: EducationLevel.Graduate,
          universityName: 'Boğaziçi Üniversitesi',
        }),
      ).toBe(false);
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

    it('rejects a student carrying a teacher field', () => {
      expect(
        isProfileShapeValid({
          accountRole: AccountRole.Student,
          teacherSubject: TeacherSubject.Diger,
        }),
      ).toBe(false);
    });
  });

  describe('PARENT (Minimal Registration, T-103)', () => {
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

  describe('isProfileComplete (T-103)', () => {
    const none = { educationLevel: null, teacherSubject: null, institutionType: null };

    it('STUDENT and PARENT are complete once an education level is declared', () => {
      for (const accountRole of [AccountRole.Student, AccountRole.Parent]) {
        expect(isProfileComplete({ ...none, accountRole })).toBe(false);
        expect(
          isProfileComplete({ ...none, accountRole, educationLevel: EducationLevel.Secondary }),
        ).toBe(true);
      }
    });

    it('TEACHER is complete only with both teacher fields', () => {
      expect(isProfileComplete({ ...none, accountRole: AccountRole.Teacher })).toBe(false);
      expect(
        isProfileComplete({
          ...none,
          accountRole: AccountRole.Teacher,
          teacherSubject: TeacherSubject.Cografya,
          institutionType: InstitutionType.DershaneKurs,
        }),
      ).toBe(true);
    });

    it('ENTHUSIAST is always complete', () => {
      expect(isProfileComplete({ ...none, accountRole: AccountRole.Enthusiast })).toBe(true);
    });
  });
});
