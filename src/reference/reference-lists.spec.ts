import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';
import { DEPARTMENTS } from './department.data';
import { UniversityType } from './dto/university.dto';
import {
  ACRONYM_WORDS,
  COMBINING_DOT_ABOVE,
  toDisplayWritingForm,
  writingFormProblems,
} from './reference-writing-form';
import { UNIVERSITIES } from './university.data';

/**
 * The fidelity gate for the two compile-time reference lists (üyelik plan §3, PR-2).
 *
 * ## What this file is FOR
 * `university.data.ts` and `department.data.ts` are generated from the byte copies in
 * `data/reference/`. Nothing in the running app reads those copies, so without this file the
 * generated constants would be unfalsifiable — a name "corrected" by hand in the `.ts` would ship,
 * exactly the temptation the ilçe lane's SHA-256 pin exists to catch. Here both sides are committed
 * files, so the `Test (unit)` job can run the whole comparison with no Postgres and no network.
 *
 * ## Three legs, and they are deliberately not the same check three times
 * 1. **Re-derivation.** The published list is rebuilt from the archive and compared. Strong against
 *    a hand edit on either side; blind, on its own, to a bug in `toDisplayWritingForm`, because it
 *    runs that function on both sides and would agree with itself — the hazard
 *    `district.artifact.ts` names in its refusal 4.
 * 2. **Independent invariants.** `writingFormProblems` never calls the conversion; it describes
 *    what a correctly written Turkish name looks like, so a broken conversion fails it.
 * 3. **Literal pins.** A short hand-written table of the named traps — `IĞDIR`, `ŞIRNAK`, the
 *    initialisms, the hyphen cases. Written by a person reading the source, so it is the one leg
 *    that shares no code with the thing it checks.
 *
 * ## Every clean check is paired with one that fires
 * A green run proves nothing until the same check has been watched going red. Each refusal below is
 * exercised against a deliberately broken copy, and every mutation is made in memory: **no control
 * token is ever written into the artefact it measures.**
 *
 * ## What this file deliberately does NOT assert
 * No fact about the corpus is typed in as a number. Not "223 universities", not "16 in the KKTC",
 * not "129 state institutions". `CONVENTIONS.md` §2 keeps coverage on structural invariants, and
 * every expected count below is read from the artefact in the same run. The fact-check record is
 * `Owner's Inbox/oturum-lite/universite-bolum-listesi.md` and the two YÖK rows in
 * `provenance/datasets.md`. A test that retyped a count would need editing by the PR that lands a
 * newly founded university — which is precisely how a fidelity test turns into a rubber stamp.
 */

/** Where the committed byte copies live, relative to the repo root. */
function artifactPath(filename: string): string {
  return join(process.cwd(), 'data', 'reference', filename);
}

/**
 * SHA-256 of each committed byte copy, measured against the Inbox source with `sha256sum` on both
 * sides plus a byte `cmp`.
 *
 * **It catches exactly one thing:** somebody editing a committed copy by hand instead of taking the
 * change up with the source. It does **not** prove the copy still matches the Inbox artefact — that
 * file lives outside this repository and no CI job here can reach it; the `sha256sum` + `cmp` pair
 * in `data/reference/README.md` is the reviewer's, run by hand.
 */
const ARTIFACT_SHA256: Readonly<Record<string, string>> = {
  'universities.yok.json': '5b90dd8c3a6608835ead0b561a76cd81bd34facc1e98170c4a707bd01e626829',
  'departments.yokatlas.json': '6100c8f7a832b9b3c620d29f23edf9c7a970d86a4c3905d8a91783e91a8fcba0',
};

/**
 * The coverage the committed copies must never silently fall below.
 *
 * ## Why the hash pin does not already cover this
 * The pin's documented procedure for a legitimate re-collection is "the artefact and the pin move
 * together in one PR", so a TRUNCATED export — half the list, every row of it perfectly valid —
 * turns the pin red, the author updates the pin, and the truncation ships. A floor is the one thing
 * in that chain a recomputation cannot discharge: lowering it is a deliberate line in a diff saying
 * "there are now fewer of these".
 *
 * **Floors, not equalities, and the direction is asymmetric on purpose.** Universities are founded
 * and programme names are added, so equality would turn a lawful addition into a red gate while the
 * floor turns a partial export into one. The other direction is real too — an institution can close
 * — and that is what makes lowering the floor a decision somebody has to write down rather than a
 * number that drifts.
 */
const COVERAGE_FLOOR = {
  universities: 223,
  departments: 345,
} as const;

/**
 * The artefact's own `tur` value → the published enum member.
 *
 * This mapping IS the derivation, so it lives here and nowhere else: `university.data.ts` was
 * generated through it and this file rebuilds the list through it. The four keys are YÖK's own
 * four-way split and the strict schema below refuses a fifth, so a re-collection that introduced a
 * new institution type would fail loudly instead of being silently dropped or mis-filed.
 */
const TYPE_BY_SOURCE_VALUE: Readonly<Record<string, UniversityType>> = {
  Devlet: UniversityType.Devlet,
  Vakıf: UniversityType.Vakif,
  'Vakıf MYO': UniversityType.VakifMyo,
  KKTC: UniversityType.Kktc,
};

/**
 * The source row, declared strictly.
 *
 * `il`, `ilKaynakBicimi` and `kktcSehir` are validated and then DISCARDED — the published DTO
 * carries neither. Declaring them is the point: `z.strictObject` refuses unknown keys, so a
 * re-collection that started shipping a logo URL, a founding year or a programme pairing would fail
 * here rather than being quietly ignored. That is the plan's kabul ölçütü 4 made structural instead
 * of promised.
 */
const universitySourceSchema = z.strictObject({
  ad: z.string().min(1),
  tur: z.enum(['Devlet', 'Vakıf', 'Vakıf MYO', 'KKTC']),
  kapsam: z.enum(['Türkiye', 'KKTC']),
  il: z.string().min(1).nullable(),
  ilKaynakBicimi: z.string().min(1),
  kktcSehir: z.string().min(1).optional(),
});

const universitiesSourceSchema = z.array(universitySourceSchema).min(1);
const departmentsSourceSchema = z.array(z.string().min(1)).min(1);

type UniversitySource = z.infer<typeof universitySourceSchema>;

function readArtifactBytes(filename: string): Buffer {
  return readFileSync(artifactPath(filename));
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const universitySource: UniversitySource[] = universitiesSourceSchema.parse(
  JSON.parse(readArtifactBytes('universities.yok.json').toString('utf8')),
);
const departmentSource: string[] = departmentsSourceSchema.parse(
  JSON.parse(readArtifactBytes('departments.yokatlas.json').toString('utf8')),
);

/** Rebuild the published üniversite list from the archive — the derivation, restated. */
function deriveUniversities(
  source: readonly UniversitySource[],
): { nameTr: string; type: UniversityType }[] {
  return source.map((row) => {
    const type = TYPE_BY_SOURCE_VALUE[row.tur];
    if (type === undefined) throw new Error(`no published type for tur=${row.tur}`);
    return { nameTr: toDisplayWritingForm(row.ad), type };
  });
}

/** Turkish alphabetical order — the property the published order must have, not a list to sort. */
const TURKISH_COLLATOR = new Intl.Collator('tr');

/** True when no name sorts before its predecessor. Used on the published lists AND on broken copies. */
function isTurkishSorted(names: readonly string[]): boolean {
  for (let index = 1; index < names.length; index += 1) {
    const previous = names[index - 1] ?? '';
    const current = names[index] ?? '';
    if (TURKISH_COLLATOR.compare(previous, current) > 0) return false;
  }
  return true;
}

/** Every acronym the allowlist claims but the source no longer contains — a stale exception. */
function deadAcronyms(allowlist: ReadonlySet<string>, sourceNames: readonly string[]): string[] {
  const words = new Set(sourceNames.flatMap((name) => name.split(' ')));
  return [...allowlist].filter((acronym) => !words.has(acronym));
}

describe('reference lists — the committed byte copies', () => {
  it('are byte-identical to what the pins claim', () => {
    for (const [filename, expected] of Object.entries(ARTIFACT_SHA256)) {
      expect(sha256(readArtifactBytes(filename))).toBe(expected);
    }
  });

  it('detects a single changed byte — the pin above is not decorative', () => {
    // The control token is appended to an in-memory copy. Nothing is written to disk.
    const tampered = Buffer.concat([readArtifactBytes('universities.yok.json'), Buffer.from(' ')]);
    expect(sha256(tampered)).not.toBe(ARTIFACT_SHA256['universities.yok.json']);
  });

  it('carry at least the coverage each list is known to have', () => {
    expect(universitySource.length).toBeGreaterThanOrEqual(COVERAGE_FLOOR.universities);
    expect(departmentSource.length).toBeGreaterThanOrEqual(COVERAGE_FLOOR.departments);
  });

  it('carry no field beyond the six the collector took — no logo, score, quota or pairing', () => {
    // The clean side: the real artefact parsed through the strict schema at module load.
    expect(universitySource.length).toBeGreaterThan(0);

    // The side that must fire: one extra key, and the strict schema refuses the whole document.
    const withLogo = universitySource.map((row, index) =>
      index === 0 ? { ...row, logoUrl: 'https://example.invalid/logo.png' } : row,
    );
    expect(() => universitiesSourceSchema.parse(withLogo)).toThrow();
  });
});

describe('UNIVERSITIES (published constant)', () => {
  it('is exactly what the archive derives — row for row, in order', () => {
    expect(UNIVERSITIES).toEqual(deriveUniversities(universitySource));
  });

  it('would notice a single hand-edited name', () => {
    const [first, ...rest] = deriveUniversities(universitySource);
    if (first === undefined) throw new Error('empty derivation');
    const edited = [{ ...first, nameTr: `${first.nameTr} Kampüsü` }, ...rest];
    expect(UNIVERSITIES).not.toEqual(edited);
  });

  it('publishes exactly nameTr and type — the city and the source spelling stay behind', () => {
    expect(UNIVERSITIES.length).toBeGreaterThan(0);
    for (const row of UNIVERSITIES) {
      expect(Object.keys(row).sort()).toEqual(['nameTr', 'type']);
    }
  });

  it('names every institution exactly once', () => {
    expect(new Set(UNIVERSITIES.map((row) => row.nameTr)).size).toBe(UNIVERSITIES.length);
  });

  it('marks the KKTC institutions, and marks nothing else', () => {
    // Both sides are counted in this run: the published marking against the artefact's OWN second
    // field. `kapsam` is a different column from `tur`, so this is a witness rather than a restatement.
    const publishedKktc = UNIVERSITIES.filter((row) => row.type === UniversityType.Kktc);
    const sourceKktc = universitySource.filter((row) => row.kapsam === 'KKTC');
    expect(publishedKktc).toHaveLength(sourceKktc.length);
    expect(sourceKktc.length).toBeGreaterThan(0);

    // And it is the same SET, not merely the same size.
    expect(publishedKktc.map((row) => row.nameTr).sort()).toEqual(
      sourceKktc.map((row) => toDisplayWritingForm(row.ad)).sort(),
    );
  });

  it('is served in Turkish alphabetical order, and the check can tell a wrong order apart', () => {
    const names = UNIVERSITIES.map((row) => row.nameTr);
    // The ORDER IS ASSERTED, never produced: nothing here sorts the list and compares. The
    // artefact's own order is what ships, and this says it has the property it claims.
    expect(isTurkishSorted(names)).toBe(true);

    // The control: a copy with two neighbours swapped must fail the same predicate. Without this,
    // "true" would also be the answer for a predicate that had stopped looking.
    const swapped = [...names];
    const [a, b] = [swapped[0], swapped[1]];
    if (a === undefined || b === undefined) throw new Error('list too short to swap');
    swapped[0] = b;
    swapped[1] = a;
    expect(isTurkishSorted(swapped)).toBe(false);
  });

  it('carries no name that fails the independent writing-form rules', () => {
    const problems = UNIVERSITIES.flatMap((row) => writingFormProblems(row.nameTr));
    expect(problems).toEqual([]);
  });
});

describe('DEPARTMENTS (published constant)', () => {
  it('is exactly what the archive derives — row for row, in order', () => {
    expect(DEPARTMENTS).toEqual(departmentSource.map((name) => ({ nameTr: name })));
  });

  it('needed no conversion: its source already arrives in the reader’s writing', () => {
    // This is what pins the two lists to ONE writing convention. If the department source ever
    // starts arriving in ALL-CAPS, or the conversion starts mangling `ve`, this is where it shows.
    for (const name of departmentSource) {
      expect(toDisplayWritingForm(name)).toBe(name);
    }
  });

  it('publishes exactly nameTr', () => {
    expect(DEPARTMENTS.length).toBeGreaterThan(0);
    for (const row of DEPARTMENTS) {
      expect(Object.keys(row)).toEqual(['nameTr']);
    }
  });

  it('names every programme exactly once', () => {
    expect(new Set(DEPARTMENTS.map((row) => row.nameTr)).size).toBe(DEPARTMENTS.length);
  });

  it('is served in Turkish alphabetical order', () => {
    expect(isTurkishSorted(DEPARTMENTS.map((row) => row.nameTr))).toBe(true);
  });

  it('carries no name that fails the independent writing-form rules', () => {
    expect(DEPARTMENTS.flatMap((row) => writingFormProblems(row.nameTr))).toEqual([]);
  });
});

describe('the conversion itself — the traps, pinned by hand', () => {
  /**
   * Written by reading the source, not by running the conversion. This is the leg that shares no
   * code with what it checks; every other assertion in this file would survive a conversion that
   * was wrong in a self-consistent way.
   */
  const PINS: readonly (readonly [string, string])[] = [
    // The İ/ı trap, both directions. A ready-made converter answers `Iğdir` and `Şirnak`.
    ['IĞDIR ÜNİVERSİTESİ', 'Iğdır Üniversitesi'],
    ['ŞIRNAK ÜNİVERSİTESİ', 'Şırnak Üniversitesi'],
    // A leading `I` that must STAY a dotless capital, next to one that must become `ı`.
    ['ISPARTA UYGULAMALI BİLİMLER ÜNİVERSİTESİ', 'Isparta Uygulamalı Bilimler Üniversitesi'],
    ['IŞIK ÜNİVERSİTESİ', 'Işık Üniversitesi'],
    // The initialisms — the `ODTÜ` → `Odtü` defect, in the forms this corpus actually contains.
    ['KTO KARATAY ÜNİVERSİTESİ', 'KTO Karatay Üniversitesi'],
    ['TOBB EKONOMİ VE TEKNOLOJİ ÜNİVERSİTESİ', 'TOBB Ekonomi ve Teknoloji Üniversitesi'],
    ['OSTİM TEKNİK ÜNİVERSİTESİ', 'OSTİM Teknik Üniversitesi'],
    ['MEF ÜNİVERSİTESİ', 'MEF Üniversitesi'],
    ['TED ÜNİVERSİTESİ', 'TED Üniversitesi'],
    ['SANKO ÜNİVERSİTESİ', 'SANKO Üniversitesi'],
    // The hyphen, both readings: a second word is capitalised, a one-letter suffix is not.
    ['TÜRK-ALMAN ÜNİVERSİTESİ', 'Türk-Alman Üniversitesi'],
    ['İSTANBUL ÜNİVERSİTESİ-CERRAHPAŞA', 'İstanbul Üniversitesi-Cerrahpaşa'],
    ['BEZM-İ ÂLEM VAKIF ÜNİVERSİTESİ', 'Bezm-i Âlem Vakıf Üniversitesi'],
    // The circumflex is part of the name and is neither dropped nor "normalised" away.
    ['MANİSA CELÂL BAYAR ÜNİVERSİTESİ', 'Manisa Celâl Bayar Üniversitesi'],
    // Digits and a comma ride through untouched; `VE` goes small.
    ['İSTANBUL 29 MAYIS ÜNİVERSİTESİ', 'İstanbul 29 Mayıs Üniversitesi'],
    [
      'TÜRKİYE ULUSLARARASI İSLAM, BİLİM VE TEKNOLOJİ ÜNİVERSİTESİ',
      'Türkiye Uluslararası İslam, Bilim ve Teknoloji Üniversitesi',
    ],
  ];

  for (const [source, expected] of PINS) {
    it(`converts ${source}`, () => {
      expect(toDisplayWritingForm(source)).toBe(expected);
    });
  }

  it('every pinned source name really occurs in the artefact', () => {
    // Otherwise the table above could drift into pinning names nobody publishes — a green test over
    // data that is not there. This is the positive control for the pins themselves.
    const sourceNames = new Set(universitySource.map((row) => row.ad));
    for (const [source] of PINS) {
      expect(sourceNames.has(source)).toBe(true);
    }
  });

  it('never emits the invisible combining dot above', () => {
    const all = [...UNIVERSITIES.map((row) => row.nameTr), ...DEPARTMENTS.map((row) => row.nameTr)];
    expect(all.filter((name) => name.includes(COMBINING_DOT_ABOVE))).toEqual([]);

    // The control: the defect this rule exists for, produced on purpose by the ready-made converter
    // the ruling warns about. If `'İ'.toLowerCase()` ever stopped emitting U+0307 this would fail,
    // and the rule above would silently be guarding nothing.
    expect('ONİKİŞUBAT'.toLowerCase().includes(COMBINING_DOT_ABOVE)).toBe(true);
  });

  it('keeps no acronym in the allowlist that the source no longer contains', () => {
    expect(
      deadAcronyms(
        ACRONYM_WORDS,
        universitySource.map((row) => row.ad),
      ),
    ).toEqual([]);

    // The control: a member that is not in the source must be reported. The token is a copy-local
    // fabrication and never enters the allowlist the app ships.
    const withGhost = new Set([...ACRONYM_WORDS, 'ZZZQ']);
    expect(
      deadAcronyms(
        withGhost,
        universitySource.map((row) => row.ad),
      ),
    ).toEqual(['ZZZQ']);
  });
});

describe('writingFormProblems — each rule, watched failing', () => {
  it('passes a correctly written name', () => {
    expect(writingFormProblems('Boğaziçi Üniversitesi')).toEqual([]);
    expect(writingFormProblems('TOBB Ekonomi ve Teknoloji Üniversitesi')).toEqual([]);
    expect(writingFormProblems('Bezm-i Âlem Vakıf Üniversitesi')).toEqual([]);
    expect(writingFormProblems('İstanbul 29 Mayıs Üniversitesi')).toEqual([]);
  });

  it('rejects an ALL-CAPS leftover', () => {
    expect(writingFormProblems('BOĞAZİÇİ ÜNİVERSİTESİ').join('\n')).toContain('ALL-CAPS form');
  });

  it('rejects a half-converted name the whole-name test cannot see', () => {
    expect(writingFormProblems('BOĞAZiçi Üniversitesi').join('\n')).toContain('PARTLY converted');
  });

  it('rejects a wholesale lower-casing', () => {
    expect(writingFormProblems('boğaziçi üniversitesi').join('\n')).toContain(
      'lower-cased rather than converted',
    );
  });

  it('rejects the invisible combining dot above', () => {
    // `i` + U+0307, exactly what `'İ'.toLowerCase()` emits. Written as an escape so the
    // defect is visible in this file instead of being a character no reviewer can see.
    expect(writingFormProblems('Oni\u0307kişubat Üniversitesi').join('\n')).toContain('U+0307');
  });

  it('rejects a decomposed Turkish letter', () => {
    // `ğ` written as `g` + U+0306. Identical on screen, a different string to everything else.
    expect(writingFormProblems('Bog\u0306aziçi Üniversitesi').join('\n')).toContain('NFC');
  });

  it('rejects padding, a doubled space and an exotic space', () => {
    expect(writingFormProblems(' Boğaziçi Üniversitesi').join('\n')).toContain('whitespace');
    expect(writingFormProblems('Boğaziçi  Üniversitesi').join('\n')).toContain('doubled space');
    expect(writingFormProblems('Boğaziçi\u00a0Üniversitesi').join('\n')).toContain(
      'not a plain space',
    );
  });
});
