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
  INVISIBLE_FORMAT_CHARACTERS,
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
 *    what a correctly written Turkish name looks like, so a broken conversion fails it — but the
 *    independence is from the conversion's LOGIC, not from its data. It reads the same two lookup
 *    tables the conversion reads, `TURKISH_UPPER_TO_LOWER` and `ACRONYM_WORDS`, so a defect in
 *    EITHER table sits on both sides of the comparison and this leg cannot see it. Measured: with
 *    `I: 'ı'` flipped to `I: 'i'` — the İ/ı trap `DEC 2026-08-20p` md.5 names by name — leg 2
 *    stays green and only leg 3 fires. Leg 2 does catch other conversion defects, which is why it
 *    is here; it is leg 3 that holds this particular ground.
 * 3. **Literal pins.** A short hand-written table of the named traps — `IĞDIR`, `ŞIRNAK`, the
 *    initialisms, the hyphen cases. Written by a person reading the source, so it is the one leg
 *    that shares no code with the thing it checks.
 *
 * ## Every clean check is paired with one that fires
 * A green run proves nothing until the same check has been watched going red. Each refusal below is
 * exercised against a deliberately broken copy, and every mutation is made in memory: **no control
 * token is ever written into the artefact it measures.**
 *
 * ## What this file deliberately does NOT assert — and the three things it deliberately DOES
 * No count about the corpus is typed in as an expected value. Not "223 universities", not "16 in
 * the KKTC", not "129 state institutions": every expected count below is read from the artefact in
 * the same run. `CONVENTIONS.md` §2 keeps coverage on structural and rule-level invariants rather
 * than per-entity literal fact assertions, and the fact-check record lives elsewhere — in
 * `Owner's Inbox/oturum-lite/universite-bolum-listesi.md` and the two YÖK rows in
 * `provenance/datasets.md`. A test that retyped a count would need editing by the PR that lands a
 * newly founded university, which is precisely how a fidelity test turns into a rubber stamp.
 *
 * Three tables ARE written out by hand, each because nothing a recomputation produces can
 * discharge what it guards, and none of them asserts a fact about an institution:
 *
 * - **`COVERAGE_FLOOR`** — two numbers, and the only numbers here. §2's rule is about per-entity
 *   facts; these are a corpus floor that generalizes over every row, and why a floor is the one
 *   guard a hash pin cannot replace is argued at its own declaration. **Do not delete it on the
 *   strength of the paragraph above** — a closure that drops the corpus by one turns this red, and
 *   deleting the floor to go green is exactly the failure the floor exists to prevent.
 * - **`RULED_OUT_INSTITUTIONS`** — the owner-ruled scope boundary. No source can re-derive which
 *   institutions were ruled out of it, so nothing but a written table can hold that line.
 * - **`PINS`**, and the literal `ACRONYM_WORDS` membership beside it — the named conversion traps
 *   and the hand-made judgement list. This is the leg that shares no code with what it checks.
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

/**
 * The institutions the owner ruled OUT of this list, each with a word from its own name.
 *
 * The boundary is `FU-UNI-LISTE-EKSIK-KURUMLAR`, closed 2026-08-20 by the owner: MSÜ, Polis
 * Akademisi and JSGA out, the sixteen KKTC institutions in, the six abroad out.
 *
 * **Why this is a table of names and not a count.** The coverage floor below catches a list that
 * got SHORTER; nothing catches one that got WIDER along the ruled boundary. The live path is
 * concrete: `FU-UNI-LISTE-KAYNAK` is open, `data/reference/README.md` documents regenerating the
 * list, and the repo's own docs name a second official surface (YÖK Atlas, 228 rows) — which is
 * exactly where the six abroad live. A re-collection from that surface would restore them, move
 * the hash pin by the documented procedure, clear the floor at 229 and pass every other gate.
 *
 * This is a SCOPE pin, not a per-entity fact assertion: it verifies nothing about any institution,
 * it says the published boundary did not move, and it generalizes over every row in the artefact.
 * It is the same class as the hand-written PINS table below — the leg that shares no code with
 * what it checks.
 */
const RULED_OUT_INSTITUTIONS: readonly (readonly [string, string])[] = [
  // Abroad, on the YÖK Atlas surface but not on `yok.gov.tr` (dosya §5.2).
  ['Kırgızistan-Türkiye Manas Üniversitesi', 'MANAS'],
  ['Hoca Ahmet Yesevi Uluslararası Türk-Kazak Üniversitesi', 'YESEVİ'],
  ['Uluslararası Saraybosna Üniversitesi', 'SARAYBOSNA'],
  ['Uluslararası Balkan Üniversitesi', 'BALKAN'],
  ['Tiran New York Üniversitesi', 'TİRAN'],
  ['Azerbaycan Devlet Pedagoji Üniversitesi', 'PEDAGOJİ'],
  // Military and police, absent from BOTH official lists — here the ruling and the source agree
  // (dosya §7.1).
  ['Millî Savunma Üniversitesi', 'SAVUNMA'],
  ['Polis Akademisi', 'POLİS'],
  ['Jandarma ve Sahil Güvenlik Akademisi', 'JANDARMA'],
];

/** Every ruled-out institution the given source names would publish. */
function ruledOutMatches(sourceNames: readonly string[]): string[] {
  return RULED_OUT_INSTITUTIONS.filter(([, token]) =>
    sourceNames.some((name) => name.includes(token)),
  ).map(([institution]) => institution);
}

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

/**
 * Every allowlist member that no literal pin covers.
 *
 * `deadAcronyms` asserts a member still OCCURS in the source; nothing asserted that a member is
 * PINNED. The gap is reachable by a code change rather than a data change: a PR adds a seventh
 * member without a matching pin, that member is later dropped or misspelt, leg 1 agrees with
 * itself, leg 2 shares the same set and stays green, and leg 3 has nothing to say — so a
 * title-cased name ships. A member must appear as a whole word on BOTH sides of some pin;
 * requiring only the source side would accept a pin that never asserts the initialism survives.
 */
function acronymsWithoutPin(
  allowlist: ReadonlySet<string>,
  pins: readonly (readonly [string, string])[],
): string[] {
  return [...allowlist].filter(
    (acronym) =>
      !pins.some(
        ([source, expected]) =>
          source.split(' ').includes(acronym) && expected.split(' ').includes(acronym),
      ),
  );
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

  it('carries none of the institutions the owner ruled out — the boundary, not the count', () => {
    // Read on the ARCHIVE, in the source's own writing: the archive is what a re-collection
    // replaces, and the leg above already proves the published list equals its derivation.
    const sourceNames = universitySource.map((row) => row.ad);
    expect(sourceNames.length).toBeGreaterThan(0);
    expect(ruledOutMatches(sourceNames)).toEqual([]);

    // The control: one fabricated row carrying one of the tokens must be reported by name. Built
    // in memory — the token never enters `data/reference/universities.yok.json`.
    const widened = [...sourceNames, 'KIRGIZISTAN-TÜRKİYE MANAS ÜNİVERSİTESİ'];
    expect(ruledOutMatches(widened)).toEqual(['Kırgızistan-Türkiye Manas Üniversitesi']);
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

describe('the published constants — frozen to the ROW, not only to the array', () => {
  it('freezes the container AND every row, and can tell a container-only freeze apart', () => {
    // `Object.freeze([...])` alone freezes the container: `push` throws, but every row stays
    // writable. Both handlers return these arrays BY REFERENCE, so a row write would corrupt the
    // published list for the lifetime of the process. This is the gate on that guarantee: without
    // it a regeneration could drop `.map(Object.freeze)` and nothing would notice.
    const published: readonly (readonly object[])[] = [UNIVERSITIES, DEPARTMENTS];
    for (const list of published) {
      expect(list.length).toBeGreaterThan(0);
      expect(Object.isFrozen(list)).toBe(true);
      expect(list.filter((row) => !Object.isFrozen(row))).toEqual([]);
    }

    // The control: a copy frozen the way the container-only form freezes it. The same predicate
    // must report its row, or "frozen" above would also be the answer for a check that had stopped
    // looking past the container. The row is a copy-local fabrication and never enters a shipped
    // constant.
    const containerOnly = Object.freeze([{ nameTr: 'Zzzq Üniversitesi' }]);
    expect(Object.isFrozen(containerOnly)).toBe(true);
    expect(containerOnly.filter((row) => !Object.isFrozen(row))).toHaveLength(1);
  });
});

describe('the conversion itself — the traps, pinned by hand', () => {
  /**
   * Written by reading the source, not by running the conversion. This is the leg that shares no
   * code with what it checks; every other assertion in this file would survive a conversion that
   * was wrong in a self-consistent way.
   *
   * **Do not prune this table as duplication.** It is the ONLY guard over `TURKISH_UPPER_TO_LOWER`
   * and `ACRONYM_WORDS`: legs 1 and 2 both read those tables, so a defect in one is invisible to
   * both (see the file docblock's leg 2). An edit to the İ/ı rows with this table shortened would
   * ship `Igdir Üniversitesi` with the whole suite green.
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

  it('emits none of the invisible zero-width or format characters', () => {
    const all = [...UNIVERSITIES.map((row) => row.nameTr), ...DEPARTMENTS.map((row) => row.nameTr)];
    for (const [character] of INVISIBLE_FORMAT_CHARACTERS) {
      expect(all.filter((name) => name.includes(character))).toEqual([]);
    }

    // The control: the same scan over a copy carrying one, so a clean result cannot also mean the
    // scan stopped looking. In memory; nothing is written to a published constant.
    const tampered = [...all, `Bo\u200bğaziçi Üniversitesi`];
    expect(tampered.filter((name) => name.includes('\u200b'))).toHaveLength(1);
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

  it('pins the allowlist itself, so a membership change is a line in a diff', () => {
    // The test above guards ONE direction — a member the source stopped containing. The other
    // direction is likelier and it reaches the reader: an ORDINARY word admitted as an initialism
    // ships ALL-CAPS. `reference-writing-form.ts` names five words that would do exactly that
    // (`ADA`, `ATA`, `HAS`, `AHİ`, `IŞIK`) and nothing was watching for them. This list is a
    // hand-made judgement, so every change to it should be a deliberate line here.
    expect([...ACRONYM_WORDS].sort()).toEqual(['KTO', 'MEF', 'OSTİM', 'SANKO', 'TED', 'TOBB']);

    // The control: one ordinary word added must break the same expectation. In memory — `ATA`
    // never enters the allowlist the app ships.
    expect([...new Set([...ACRONYM_WORDS, 'ATA'])].sort()).not.toEqual([
      'KTO',
      'MEF',
      'OSTİM',
      'SANKO',
      'TED',
      'TOBB',
    ]);
  });

  it('gives every allowlist member a literal pin, so leg 3 covers the whole set', () => {
    expect(acronymsWithoutPin(ACRONYM_WORDS, PINS)).toEqual([]);

    // The control: a member with no pin must be named. The token is a copy-local fabrication and
    // never enters the shipped allowlist.
    expect(acronymsWithoutPin(new Set([...ACRONYM_WORDS, 'ZZZQ']), PINS)).toEqual(['ZZZQ']);
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

  it('rejects every invisible character it lists — each member watched failing', () => {
    // Fed INSIDE a word, which is the placement nothing else reaches: before this rule existed
    // `writingFormProblems` returned [] for exactly this shape. (Two other placements happen to be
    // caught by the interior-capital rule, which is luck, not coverage.)
    for (const [character, description] of INVISIBLE_FORMAT_CHARACTERS) {
      expect(writingFormProblems(`Bo${character}ğaziçi Üniversitesi`).join('\n')).toContain(
        description,
      );
    }

    // The negative control: the same sentence without the character stays clean, so what fires
    // above is the character and not the shape of the name.
    expect(writingFormProblems('Boğaziçi Üniversitesi')).toEqual([]);
  });

  it('rejects padding, a doubled space and an exotic space', () => {
    expect(writingFormProblems(' Boğaziçi Üniversitesi').join('\n')).toContain('whitespace');
    expect(writingFormProblems('Boğaziçi  Üniversitesi').join('\n')).toContain('doubled space');
    expect(writingFormProblems('Boğaziçi\u00a0Üniversitesi').join('\n')).toContain(
      'not a plain space',
    );
  });
});
