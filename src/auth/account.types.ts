/**
 * The declared account profile. This is not an authorization role: a teacher
 * declaration grants no permission by itself (`GLOSSARY.md` §7.1).
 */
export enum AccountRole {
  Student = 'STUDENT',
  Teacher = 'TEACHER',
}

/** Education axis for student accounts; teacher profiles keep it null. */
export enum EducationLevel {
  Secondary = 'SECONDARY',
  Undergraduate = 'UNDERGRADUATE',
  Graduate = 'GRADUATE',
}

/** Closed registration-form set from `GLOSSARY.md` §4.4. */
export enum GradeLevel {
  Grade5 = 'GRADE_5',
  Grade6 = 'GRADE_6',
  Grade7 = 'GRADE_7',
  Grade8 = 'GRADE_8',
  Grade9 = 'GRADE_9',
  Grade10 = 'GRADE_10',
  Grade11 = 'GRADE_11',
  Grade12 = 'GRADE_12',
  Mezun = 'MEZUN',
  Kpss = 'KPSS',
  Diger = 'DIGER',
}

/** Closed registration-form set from `GLOSSARY.md` §4.4. */
export enum StudyStream {
  Sayisal = 'SAYISAL',
  Sozel = 'SOZEL',
  EsitAgirlik = 'ESIT_AGIRLIK',
  Tyt = 'TYT',
  Dil = 'DIL',
  Lgs = 'LGS',
  Msu = 'MSU',
  AraSinif = 'ARA_SINIF',
  Kpss = 'KPSS',
  Diger = 'DIGER',
}

/** Minimal account lifecycle; verification behaviour arrives in UYELIK-02. */
export enum AccountStatus {
  Unverified = 'UNVERIFIED',
  Active = 'ACTIVE',
  Disabled = 'DISABLED',
  PendingDeletion = 'PENDING_DELETION',
}
