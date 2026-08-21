/**
 * The ALL-CAPS → reader's-writing conversion behind `src/reference/university.data.ts`, and the
 * independent invariants that judge its output (üyelik plan §3, PR-2).
 *
 * ## Why this exists at all — the two halves of one ruling
 * `DEC 2026-08-20m` md.6 rules that university and department names appear **in normal writing**
 * ("Boğaziçi Üniversitesi", not "BOĞAZİÇİ ÜNİVERSİTESİ") and, in the same sentence, that the
 * **source data is kept exactly as YÖK wrote it**. Both halves are honoured literally in this repo
 * and they land in different files:
 *
 * - the source form is archived byte-for-byte in `data/reference/universities.yok.json`, which
 *   nothing rewrites and `.prettierignore` protects;
 * - the published form is the committed constant in `university.data.ts`, produced from that
 *   archive by {@link toDisplayWritingForm} and re-derived on every CI run by
 *   `reference-lists.spec.ts`, which fails if the two ever disagree.
 *
 * The department list needs no conversion — its source already arrives in the reader's writing —
 * and the spec asserts that by running the same function over it and requiring a no-op. One
 * function produces the writing form of both lists, so the two cannot drift into two conventions.
 *
 * ## Why the conversion is not `toLocaleLowerCase('tr')`
 * `DEC 2026-08-20p` md.5 names the trap and NOVA measured it on the sibling ilçe list: a ready-made
 * converter puts an invisible U+0307 into 308 of those 973 names and turns `IĞDIR` into `Iğdir`.
 * The mapping below is written out character by character instead, so it depends on no ICU build
 * and no locale tag: `I` → `ı` and `İ` → `i`, and nothing else can happen.
 *
 * The same ruling names a SECOND trap — a blanket conversion destroys an initialism
 * (`ODTÜ` → `Odtü`). Measured against this artefact, neither `ODTÜ` nor `İTÜ` occurs at all (YÖK
 * publishes both institutions under their full names), but six other initialisms do, and they are
 * the whole reason {@link ACRONYM_WORDS} exists rather than a comment promising care.
 */

/**
 * Turkish upper → lower, written out because the locale-aware built-ins are the defect.
 *
 * `I` → `ı` and `İ` → `i` are the two rows that make it Turkish; the rest are here so the table is
 * total over the source alphabet and no character silently falls through to a locale default. `Â`
 * belongs to that alphabet in practice — YÖK writes `CELÂL` and `ÂLEM`, and dropping the circumflex
 * would change a name we are copying, not tidy it.
 *
 * `Q`, `W` and `X` are not Turkish letters and do not occur in this artefact. They are declared
 * anyway because a name arriving with one would otherwise pass through unchanged into the published
 * list, which is a silent wrong answer; with the row present the conversion is defined for every
 * Latin capital.
 */
export const TURKISH_UPPER_TO_LOWER: Readonly<Record<string, string>> = Object.freeze({
  A: 'a',
  B: 'b',
  C: 'c',
  Ç: 'ç',
  D: 'd',
  E: 'e',
  F: 'f',
  G: 'g',
  Ğ: 'ğ',
  H: 'h',
  I: 'ı',
  İ: 'i',
  J: 'j',
  K: 'k',
  L: 'l',
  M: 'm',
  N: 'n',
  O: 'o',
  Ö: 'ö',
  P: 'p',
  Q: 'q',
  R: 'r',
  S: 's',
  Ş: 'ş',
  T: 't',
  U: 'u',
  Ü: 'ü',
  V: 'v',
  W: 'w',
  X: 'x',
  Y: 'y',
  Z: 'z',
  Â: 'â',
});

/**
 * Words that keep the source's capitals because they are initialisms, not words.
 *
 * Each is an institution's own name for itself — `KTO` is Konya Ticaret Odası, `TOBB` the Türkiye
 * Odalar ve Borsalar Birliği, `TED` the Türk Eğitim Derneği; `MEF`, `OSTİM` and `SANKO` are the
 * same shape. Title-casing them would produce `Kto`, `Tobb`, `Ted` — the exact defect
 * `DEC 2026-08-20p` md.5 names with its `ODTÜ` → `Odtü` example.
 *
 * The set is deliberately a CLOSED list of words rather than a heuristic ("short and all-caps"),
 * because in an ALL-CAPS source every word is short and all-caps: `ADA`, `ATA`, `HAS`, `AHİ` and
 * `IŞIK` are ordinary words or surnames and must be converted. No rule can tell the two apart from
 * the string alone, so the judgement is written down once and `reference-lists.spec.ts` asserts
 * that every member still occurs in the artefact — a member that stopped occurring is a stale
 * exception, and stale exceptions are how an allowlist quietly stops describing the data.
 */
export const ACRONYM_WORDS: ReadonlySet<string> = new Set([
  'KTO',
  'MEF',
  'OSTİM',
  'SANKO',
  'TOBB',
  'TED',
]);

/**
 * Words written lower-case inside a name — Turkish keeps the conjunction `ve` small.
 *
 * This is not a house preference: the department list arrives from its own source already in the
 * reader's writing and spells it `ve` in every one of its occurrences, so following it is what
 * keeps the two lists on ONE convention. `reference-lists.spec.ts` pins that agreement by running
 * this same function over the department source and requiring it to change nothing.
 */
export const LOWERCASE_WORDS: ReadonlySet<string> = new Set(['VE']);

/** The combining dot above, U+0307 — invisible in every editor and every review diff. */
export const COMBINING_DOT_ABOVE = '̇';

/** Fold every capital in a string to its Turkish lower-case counterpart. */
function foldToLower(value: string): string {
  let folded = '';
  for (const character of value) {
    folded += TURKISH_UPPER_TO_LOWER[character] ?? character;
  }
  return folded;
}

/** Lower → upper, the inverse of {@link TURKISH_UPPER_TO_LOWER} and built from it. */
const TURKISH_LOWER_TO_UPPER: ReadonlyMap<string, string> = new Map(
  Object.entries(TURKISH_UPPER_TO_LOWER).map(([upper, lower]) => [lower, upper]),
);

/** Fold every lower-case Turkish letter in a string to its capital. */
function foldToUpper(value: string): string {
  let folded = '';
  for (const character of value) {
    folded += TURKISH_LOWER_TO_UPPER.get(character) ?? character;
  }
  return folded;
}

/**
 * Whole-name ALL-CAPS test.
 *
 * The `!== lower` guard matters: without it a name made only of digits and punctuation equals its
 * own upper-case form and would be reported as unconverted.
 */
function isAllCaps(name: string): boolean {
  return name === foldToUpper(name) && name !== foldToLower(name);
}

/**
 * One hyphen-separated part of a word: keep the first character, fold the rest.
 *
 * ## The single-character part is the izafet suffix, and it stays small
 * `BEZM-İ ÂLEM VAKIF ÜNİVERSİTESİ` is the one name in this artefact whose hyphen joins a suffix
 * rather than a second word, and Turkish writes that suffix lower-case: `Bezm-i Âlem`. Capitalising
 * it — `Bezm-İ` — is wrong in the same way `Odtü` is wrong, and no reader would call it a style
 * choice. A part of a single character after a hyphen is always such a suffix; a part of two or
 * more is a word in its own right and is capitalised, which is what `TÜRK-ALMAN` → `Türk-Alman` and
 * `ÜNİVERSİTESİ-CERRAHPAŞA` → `Üniversitesi-Cerrahpaşa` need. Both cases are pinned literally in
 * `reference-lists.spec.ts` rather than left to this docblock.
 */
function toDisplayPart(part: string, isAfterHyphen: boolean): string {
  const characters = [...part];
  const first = characters[0];
  if (first === undefined) return part;

  const rest = foldToLower(characters.slice(1).join(''));
  if (isAfterHyphen && characters.length === 1) return foldToLower(first);
  return first + rest;
}

/** One space-separated word, with the two exception sets applied before any folding. */
function toDisplayWord(word: string): string {
  if (ACRONYM_WORDS.has(word)) return word;
  if (LOWERCASE_WORDS.has(word)) return foldToLower(word);

  return word
    .split('-')
    .map((part, index) => toDisplayPart(part, index > 0))
    .join('-');
}

/**
 * The reader's writing form of one source name.
 *
 * Pure, total and locale-independent: the same input produces the same output on any Node build,
 * which is why the published list can be a committed constant rather than something computed at
 * boot. Punctuation the source carries (the comma in `TÜRKİYE ULUSLARARASI İSLAM, BİLİM VE
 * TEKNOLOJİ ÜNİVERSİTESİ`, the digits in `İSTANBUL 29 MAYIS ÜNİVERSİTESİ`) rides through untouched,
 * because it is part of the name rather than of its casing.
 */
export function toDisplayWritingForm(sourceName: string): string {
  return sourceName.split(' ').map(toDisplayWord).join(' ');
}

/**
 * Everything wrong with a published name, judged WITHOUT reference to the conversion above.
 *
 * ## Why a second, independent judgement exists
 * `reference-lists.spec.ts` re-derives the committed list from the archived source and compares.
 * That check is strong against a hand-edit and weak against one thing: a bug in
 * {@link toDisplayWritingForm} itself, because both sides would run it and agree with each other —
 * the "a lane that agrees with itself" hazard `district.artifact.ts` names in its refusal 4. These
 * rules never call the conversion; they describe what a correctly-written Turkish name looks like,
 * so a broken conversion fails them. The spec's literal pins for the named traps are the third,
 * fully hand-written leg.
 *
 * Each rule is a defect somebody measured on the sibling ilçe list, not a hypothetical:
 *
 * 1. **Padding, an empty name, an exotic space or a doubled space** — invisible on screen, and a
 *    different string from the same name typed normally for every comparison anything will ever do.
 * 2. **U+0307** — {@link COMBINING_DOT_ABOVE}. A ready-made converter puts it in 308 of the 973
 *    ilçe names; it is the signature of `İ` lower-cased under English rules.
 * 3. **Not in Unicode NFC** — the class U+0307 belongs to. A decomposed `ğ` or `ö` looks identical
 *    and compares unequal.
 * 4. **An ALL-CAPS leftover, whole or partial.** The whole-name test catches a name the conversion
 *    never touched; the interior test catches `KADIköy`, which a half-working conversion produces
 *    and which the whole-name test cannot see. An interior capital is admitted only where a name
 *    legitimately has one — at the start of a word, after a hyphen, or inside an
 *    {@link ACRONYM_WORDS} member.
 */
export function writingFormProblems(name: string): readonly string[] {
  const problems: string[] = [];
  const label = JSON.stringify(name);

  if (name === '' || name !== name.trim()) {
    return [`${label} — is empty or carries leading/trailing whitespace`];
  }
  if (/[^\S ]/.test(name)) {
    problems.push(`${label} — carries a whitespace character that is not a plain space`);
  }
  if (name.includes('  ')) {
    problems.push(`${label} — carries a doubled space`);
  }
  if (name.includes(COMBINING_DOT_ABOVE)) {
    problems.push(
      `${label} — carries the invisible combining dot above (U+0307): the name was lowercased ` +
        'with English casing rules instead of the İ→i / I→ı mapping',
    );
  }
  if (name !== name.normalize('NFC')) {
    problems.push(
      `${label} — is not in Unicode NFC: a Turkish letter arrived decomposed (base letter + a ` +
        'combining mark), which is invisible on screen but is a different string from the same ' +
        'name typed normally',
    );
  }

  if (isAllCaps(name)) {
    problems.push(
      `${label} — is still in the source's ALL-CAPS form; DEC 2026-08-20m md.6 rules the reader ` +
        'sees normal writing',
    );
    return problems;
  }

  for (const word of name.split(' ')) {
    if (ACRONYM_WORDS.has(word)) continue;
    const isLowercaseWord = LOWERCASE_WORDS.has(foldToUpper(word));

    word.split('-').forEach((part, index) => {
      const characters = [...part];
      const first = characters[0];
      const interior = characters.slice(1).join('');

      if (interior !== foldToLower(interior)) {
        problems.push(
          `${label} — the word ${JSON.stringify(word)} carries a capital that neither starts a ` +
            'word nor follows a hyphen, so the ALL-CAPS source was only PARTLY converted',
        );
      }

      // A small initial is legitimate in exactly two places: the conjunction `ve`, and the
      // single-character izafet suffix after a hyphen (`Bezm-i`). Anywhere else it means the name
      // was lower-cased wholesale rather than converted — the opposite failure to an ALL-CAPS
      // leftover, and one the test above cannot see.
      const isSmallInitial = first !== undefined && TURKISH_LOWER_TO_UPPER.has(first);
      const allowed = isLowercaseWord || (index > 0 && characters.length === 1);
      if (isSmallInitial && !allowed) {
        problems.push(
          `${label} — the word ${JSON.stringify(word)} starts with a small letter, so the name was ` +
            'lower-cased rather than converted to the reader’s writing',
        );
      }
    });
  }

  return problems;
}
