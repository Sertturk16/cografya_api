/**
 * The declared account profile. This is not an authorization role: no value grants a
 * permission. Collected so the owners can read their audience (T-103).
 */
export enum AccountRole {
  Student = 'STUDENT',
  Teacher = 'TEACHER',
  /**
   * "Veli". The education columns of a PARENT describe their CHILD: one secondary-school grade
   * and stream, never a university or a school name (T-103).
   */
  Parent = 'PARENT',
  /** "Coğrafya meraklısı": carries no education or teacher field (T-103). */
  Enthusiast = 'ENTHUSIAST',
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

/** Teacher's branch (T-103). Present only on a TEACHER, together with `InstitutionType`. */
export enum TeacherSubject {
  Cografya = 'COGRAFYA',
  SosyalBilgiler = 'SOSYAL_BILGILER',
  Diger = 'DIGER',
}

/** Where a teacher works (T-103). Present only on a TEACHER, together with `TeacherSubject`. */
export enum InstitutionType {
  DevletOkulu = 'DEVLET_OKULU',
  OzelOkul = 'OZEL_OKUL',
  DershaneKurs = 'DERSHANE_KURS',
  Diger = 'DIGER',
}

/** "Bizi nereden duydun?" (T-103). Optional for every role, collected at registration only. */
export enum ReferralSource {
  Ogretmen = 'OGRETMEN',
  Arkadas = 'ARKADAS',
  Youtube = 'YOUTUBE',
  Instagram = 'INSTAGRAM',
  Google = 'GOOGLE',
  Kitap = 'KITAP',
  Diger = 'DIGER',
}

/** Minimal account lifecycle; verification behaviour arrives in UYELIK-02. */
export enum AccountStatus {
  Unverified = 'UNVERIFIED',
  Active = 'ACTIVE',
  Disabled = 'DISABLED',
  PendingDeletion = 'PENDING_DELETION',
}
