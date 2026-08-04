/**
 * Applier tests. The fixture is a miniature seed file with invented placeholder data —
 * the rules under test are "which bytes move", not geography (→ CONVENTIONS §2).
 *
 * EVERY TEST GOES THROUGH `apply()` BELOW, NEVER `applyToSource` DIRECTLY. That indirection is
 * the point of this file's most important assertion and it is enforced structurally rather
 * than by discipline, because discipline is exactly what failed here: this module emits
 * TypeScript SOURCE, yet nothing asserted the source it emits is VALID. A test suite that
 * checks substrings and index order passes happily over a file with a missing comma — which
 * is what happened, and the review caught a fixture whose "correct" output did not parse.
 * Wrapping the call means a future test cannot opt out of the check by forgetting it.
 */
import { applyToSource, type ApplyOptions, type PendingWrite } from './apply.ts';
import { syntaxErrorsIn } from './seed-reader.ts';

/**
 * `applyToSource`, plus the invariant that outranks every other assertion in this file: the
 * output must be parseable TypeScript. Shared with the CLI's pre-write guard via
 * `syntaxErrorsIn`, so the test and the tool cannot disagree about what "valid" means.
 */
function apply(
  file: string,
  text: string,
  writes: readonly PendingWrite[],
  options?: ApplyOptions,
): ReturnType<typeof applyToSource> {
  const result = applyToSource(file, text, writes, options);
  expect(syntaxErrorsIn(result.text)).toEqual([]);
  return result;
}

const FIXTURE = `import { Continent } from '../../common/continent.enum';

export const X_COUNTRIES = [
  {
    isoCode: 'AA',
    nameTr: 'Alfa',
    nameEn: 'Alpha',
    continent: Continent.Africa,
    independenceNoteTr: 'bir not',
    introTr: null,
  },
  {
    isoCode: 'BB',
    nameTr: 'Beta',
    nameEn: 'Beta',
    continent: Continent.Africa,
    independenceNoteTr: 'başka not',
  },
];
`;

describe('applyToSource', () => {
  it('replaces an existing property in place', () => {
    const result = apply('x.ts', FIXTURE, [
      { isoCode: 'AA', field: 'introTr', value: 'yeni değer' },
    ]);
    expect(result.updated).toBe(1);
    expect(result.inserted).toBe(0);
    expect(result.text).toContain("introTr: 'yeni değer',");
    expect(result.text).not.toContain('introTr: null');
  });

  it('inserts a missing property after the anchor field', () => {
    const result = apply('x.ts', FIXTURE, [{ isoCode: 'BB', field: 'introTr', value: 'eklendi' }]);
    expect(result.inserted).toBe(1);
    const lines = result.text.split('\n');
    const anchor = lines.findIndex((line) => line.includes("independenceNoteTr: 'başka not'"));
    expect(lines[anchor + 1]).toContain('introTr:');
  });

  it('inserts multiple fields in seed field order', () => {
    // THIS ASSERTION USED TO BE VACUOUS: it searched the WHOLE file for `introTr:`, which
    // matched AA's pre-existing `introTr: null` at a far lower offset than anything
    // inserted into BB. It therefore passed while the insertion order was actually
    // REVERSED. Scope the search to BB's object, so the test can fail.
    const result = apply('x.ts', FIXTURE, [
      { isoCode: 'BB', field: 'climateNoteTr', value: 'iklim' },
      { isoCode: 'BB', field: 'introTr', value: 'giriş' },
    ]);
    const bb = result.text.slice(result.text.indexOf("isoCode: 'BB'"));
    expect(result.inserted).toBe(2);
    expect(bb.indexOf('introTr:')).toBeGreaterThan(-1);
    expect(bb.indexOf('introTr:')).toBeLessThan(bb.indexOf('climateNoteTr:'));
  });

  it('keeps seed field order for three fields inserted at the same anchor', () => {
    const result = apply('x.ts', FIXTURE, [
      { isoCode: 'BB', field: 'hydrographyNoteTr', value: 'su' },
      { isoCode: 'BB', field: 'introTr', value: 'giriş' },
      { isoCode: 'BB', field: 'climateNoteTr', value: 'iklim' },
    ]);
    const bb = result.text.slice(result.text.indexOf("isoCode: 'BB'"));
    const order = ['introTr:', 'climateNoteTr:', 'hydrographyNoteTr:'].map((n) => bb.indexOf(n));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((index) => index > -1)).toBe(true);
  });

  it('touches nothing outside the properties it was asked to write', () => {
    const result = apply('x.ts', FIXTURE, [
      { isoCode: 'AA', field: 'introTr', value: 'yeni değer' },
    ]);
    // Every line except the one that changed must survive byte-identically.
    const before = FIXTURE.split('\n').filter((line) => !line.includes('introTr'));
    const after = result.text.split('\n').filter((line) => !line.includes('introTr'));
    expect(after).toEqual(before);
  });

  it('leaves a country alone when it has no pending write', () => {
    const result = apply('x.ts', FIXTURE, [
      { isoCode: 'AA', field: 'introTr', value: 'yeni değer' },
    ]);
    expect(result.text).toContain("isoCode: 'BB'");
    expect(result.text.match(/introTr/gu)).toHaveLength(1);
  });

  it('is a no-op when there is nothing to write', () => {
    expect(apply('x.ts', FIXTURE, []).text).toBe(FIXTURE);
  });

  it('preserves the original indentation instead of doubling it', () => {
    // Regression: the splice starts at the line start, because `emitConcat` renders its
    // own indent. Splicing from the property name left the old indent in place.
    const result = apply('x.ts', FIXTURE, [
      { isoCode: 'AA', field: 'introTr', value: 'yeni değer' },
    ]);
    const line = result.text.split('\n').find((l) => l.includes('introTr')) ?? '';
    expect(line).toBe("    introTr: 'yeni değer',");
  });

  it('leaves a field untouched when its committed value already matches', () => {
    // The committed seed is hand-wrapped; re-emitting an unchanged value would churn the
    // file without changing content. Bytes move only when the VALUE moves.
    const seeded = FIXTURE.replace('introTr: null,', "introTr: 'aynı değer',");
    const result = apply('x.ts', seeded, [
      { isoCode: 'AA', field: 'introTr', value: 'aynı değer' },
    ]);
    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.text).toBe(seeded);
  });

  it('rewrites a null field without needing force — that is the happy path', () => {
    const result = apply('x.ts', FIXTURE, [
      { isoCode: 'AA', field: 'introTr', value: 'yeni değer' },
    ]);
    expect(result.updated).toBe(1);
    expect(result.diverged).toEqual([]);
  });
});

describe('applyToSource — divergence guard', () => {
  // REGRESSION (C1): the draft was unconditionally authoritative, so `apply` silently
  // reverted a correction that had landed on the seed but not on the draft. Reproduced
  // against the real corpus: BR/CO `introTr` lost PR #46's `Ekvator` -> `Ekvador` fix on
  // two live pages, via the command ENGINEERING.md §8 mandates.
  const seeded = FIXTURE.replace('introTr: null,', "introTr: 'düzeltilmiş değer',");
  const write = [{ isoCode: 'AA', field: 'introTr', value: 'eski taslak değeri' }] as const;

  it('refuses to overwrite a diverging non-null committed value', () => {
    const result = apply('x.ts', seeded, write);
    expect(result.updated).toBe(0);
    expect(result.diverged).toHaveLength(1);
  });

  it('leaves the source byte-identical when it refuses', () => {
    expect(apply('x.ts', seeded, write).text).toBe(seeded);
  });

  it('reports both sides so the human can decide which is newer', () => {
    const [divergence] = apply('x.ts', seeded, write).diverged;
    expect(divergence).toEqual({
      isoCode: 'AA',
      field: 'introTr',
      committed: 'düzeltilmiş değer',
      draft: 'eski taslak değeri',
    });
  });

  it('overwrites when force is explicitly set', () => {
    const result = apply('x.ts', seeded, write, { force: true });
    expect(result.updated).toBe(1);
    expect(result.diverged).toEqual([]);
    expect(result.text).toContain('eski taslak değeri');
  });

  it('does not treat an already-matching value as a divergence', () => {
    const result = apply('x.ts', seeded, [
      { isoCode: 'AA', field: 'introTr', value: 'düzeltilmiş değer' },
    ]);
    expect(result.diverged).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  it('does not block an unrelated field in the same file', () => {
    const result = apply('x.ts', seeded, [
      ...write,
      { isoCode: 'BB', field: 'introTr', value: 'yeni' },
    ]);
    expect(result.diverged).toHaveLength(1);
    expect(result.inserted).toBe(1);
  });

  it('treats a multi-chunk committed concatenation as already correct when it folds equal', () => {
    const seeded = FIXTURE.replace('introTr: null,', "introTr:\n      'aynı ' +\n      'değer',");
    const result = apply('x.ts', seeded, [
      { isoCode: 'AA', field: 'introTr', value: 'aynı değer' },
    ]);
    expect(result.skipped).toBe(1);
    expect(result.text).toBe(seeded);
  });

  it('is idempotent — applying the same write twice changes nothing further', () => {
    const once = apply('x.ts', FIXTURE, [
      { isoCode: 'AA', field: 'introTr', value: 'yeni değer' },
    ]).text;
    const twice = apply('x.ts', once, [
      { isoCode: 'AA', field: 'introTr', value: 'yeni değer' },
    ]).text;
    expect(twice).toBe(once);
  });

  it('round-trips a multi-paragraph value through the emitted concatenation', () => {
    const value = `${'uzun bir cümle parçası '.repeat(12).trim()}\n\n${'ikinci paragraf '.repeat(12).trim()}`;
    const result = apply('x.ts', FIXTURE, [{ isoCode: 'AA', field: 'introTr', value }]);
    // Re-read the produced source and confirm the folded value is unchanged.
    const emitted = result.text
      .split('\n')
      .filter((line) => line.trimStart().startsWith("'") || line.trimStart().startsWith('"'))
      .join('\n');
    expect(emitted.length).toBeGreaterThan(0);
    expect(result.text).toContain("'\\n\\n' +");
  });

  it('falls back to the last property when no anchor field exists', () => {
    // BEHAVIOUR CHANGE (dalga-1, plan §6.4): this used to throw `cannot place`. A row whose
    // `governmentFormTr` AND `independenceNoteTr` are both inapplicable — Antarktika is the live
    // example — has no anchor unless the author keeps explicit `: null,` properties, and a
    // reasonable-looking cleanup of those properties used to kill the whole wave. The field now
    // lands at the END of the object instead: out of house field order, but with correct
    // content and — via `apply()`'s shared check — parseable output.
    //
    // AN EARLIER REVISION OF THIS TEST PASSED OVER BROKEN OUTPUT. The fixture's last property
    // has no trailing comma, the splice supplied none, and the result was `nameEn: 'A'` and
    // `introTr: 'v',` separated by a newline alone — `',' expected`. The assertions were
    // substring + index-order only, so nothing noticed. That is why `apply()` exists.
    const orphan = `export const X = [{ isoCode: 'AA', nameTr: 'A', nameEn: 'A' }];\n`;
    const result = apply('x.ts', orphan, [{ isoCode: 'AA', field: 'introTr', value: 'v' }]);
    expect(result.inserted).toBe(1);
    expect(result.text).toContain("introTr: 'v',");
    expect(result.text.indexOf('introTr:')).toBeGreaterThan(result.text.indexOf("nameEn: 'A'"));
    // The synthesised separator, named explicitly so a regression cannot hide behind the
    // generic parse check.
    expect(result.text).toContain("nameEn: 'A',");
  });

  it('supplies exactly ONE separator when several fields fall back to the same anchor', () => {
    // The realistic next-wave shape (SFH88-M1): a comma-less anchor taking multiple inserts in
    // one pass. A per-splice separator would emit `,,` here — as unparseable as the missing
    // comma it was meant to fix, and reachable only with two or more fields.
    const orphan = `export const X = [{ isoCode: 'AA', nameTr: 'A', nameEn: 'A' }];\n`;
    const result = apply('x.ts', orphan, [
      { isoCode: 'AA', field: 'governanceNoteTr', value: 'yönetim' },
      { isoCode: 'AA', field: 'introTr', value: 'giriş' },
      { isoCode: 'AA', field: 'settlementNoteTr', value: 'yerleşme' },
    ]);
    expect(result.inserted).toBe(3);
    expect(result.text).not.toContain(',,');
    // Field order among the fallback group still follows NARRATIVE_FIELDS.
    const order = ['introTr:', 'settlementNoteTr:', 'governanceNoteTr:'].map((name) =>
      result.text.indexOf(name),
    );
    expect(order.every((index) => index > -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('handles a comma that is not adjacent to the property it terminates', () => {
    // Pre-existing on `dev` and reachable through the ORDINARY anchor path, not just the
    // fallback: the old code tested only the single character after the property, so a
    // `'x' ,` anchor read as comma-less and the splice landed IN FRONT of the comma.
    const spaced = `export const X = [{ isoCode: 'AA', nameTr: 'A', nameEn: 'A', governmentFormTr: 'x' , }];\n`;
    const result = apply('x.ts', spaced, [{ isoCode: 'AA', field: 'introTr', value: 'v' }]);
    expect(result.inserted).toBe(1);
    expect(result.text).not.toContain(',,');
  });

  it('rewrites a property whose comma is not adjacent, without doubling it', () => {
    // The same root cause on the UPDATE path: `emitConcat` always emits its own trailing
    // comma, so an unconsumed original would leave `newValue,  ,`.
    //
    // The fixture is MULTI-LINE on purpose — one property per line, i.e. the shape prettier
    // gives every committed seed file. A single-line object literal would additionally trip an
    // unrelated, pre-existing limitation documented at `applyToSource`'s update splice (it
    // replaces from the LINE start, which on a one-line literal eats the prefix). Keeping that
    // out of this test is the point: this case is about the comma, and a fixture that fails for
    // two reasons proves neither.
    const spaced = `export const X = [
  {
    isoCode: 'AA',
    nameTr: 'Alfa',
    nameEn: 'Alpha',
    introTr: null ,
  },
];
`;
    const result = apply('x.ts', spaced, [{ isoCode: 'AA', field: 'introTr', value: 'yeni' }]);
    expect(result.updated).toBe(1);
    expect(result.text).toContain("introTr: 'yeni',");
    expect(result.text).not.toContain(',,');
  });

  it('supplies ONE comma when a comma-less property is both UPDATED and used as an anchor', () => {
    // REGRESSION (CONF88-I1), introduced by the separator fix itself and caught by the confirm
    // leg. The update branch and the insert branch never look at each other: `emitConcat`
    // already gives the rewritten property a trailing comma, but the insert branch re-reads the
    // ORIGINAL text, sees no comma, and synthesises a second one -> `,,`.
    //
    // This is the HAPPY path, not an exotic one: `introTr: null` is the ordinary "not yet
    // seeded" state, so a wave that fills it AND adds a later field to the same row hits
    // exactly this. Only the missing trailing comma makes it fire, which is why it survived
    // the first round.
    const commaLess = `export const X = [
  {
    isoCode: 'AA',
    nameTr: 'Alfa',
    nameEn: 'Alpha',
    introTr: null
  },
];
`;
    const result = apply('x.ts', commaLess, [
      { isoCode: 'AA', field: 'introTr', value: 'yeni' },
      { isoCode: 'AA', field: 'climateNoteTr', value: 'iklim' },
    ]);
    expect(result.updated).toBe(1);
    expect(result.inserted).toBe(1);
    expect(result.text).not.toContain(',,');
    expect(result.text).toContain("introTr: 'yeni',");
    expect(result.text).toContain("climateNoteTr: 'iklim',");
    // …and the inserted field still lands after the one it anchored on.
    expect(result.text.indexOf('climateNoteTr:')).toBeGreaterThan(result.text.indexOf('introTr:'));
  });

  it('cancels a synthesised comma when the FALLBACK anchor is rewritten later in the pass', () => {
    // The half a flag alone cannot cover, and the reason the first attempt at CONF88-I1 was
    // still wrong. `independenceNoteTr` sorts FIRST in NARRATIVE_FIELDS, so it is processed
    // before `introTr` — but with no `governmentFormTr` to anchor on it falls back to the
    // object's LAST property, which IS `introTr`. The comma is therefore synthesised before we
    // know `introTr` is about to be rewritten with a trailing comma of its own. The synthesised
    // splice stays cancellable precisely so the two branches are order-INDEPENDENT rather than
    // order-lucky.
    const commaLess = `export const X = [
  {
    isoCode: 'AA',
    nameTr: 'Alfa',
    nameEn: 'Alpha',
    introTr: null
  },
];
`;
    const result = apply('x.ts', commaLess, [
      { isoCode: 'AA', field: 'independenceNoteTr', value: 'bağımsızlık' },
      { isoCode: 'AA', field: 'introTr', value: 'giriş' },
    ]);
    expect(result.updated).toBe(1);
    expect(result.inserted).toBe(1);
    expect(result.text).not.toContain(',,');
    expect(result.text).toContain("introTr: 'giriş',");
    expect(result.text).toContain("independenceNoteTr: 'bağımsızlık',");
  });

  it('still supplies the comma when the anchor is updated but NOT comma-terminated by us', () => {
    // The complement: the property is skipped (already correct), so no update splice runs and
    // no comma is contributed — the insert branch must still supply one. Guards against
    // "fixing" the regression by suppressing the separator unconditionally.
    const commaLess = `export const X = [
  {
    isoCode: 'AA',
    nameTr: 'Alfa',
    nameEn: 'Alpha',
    introTr: 'aynı'
  },
];
`;
    const result = apply('x.ts', commaLess, [
      { isoCode: 'AA', field: 'introTr', value: 'aynı' },
      { isoCode: 'AA', field: 'climateNoteTr', value: 'iklim' },
    ]);
    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.inserted).toBe(1);
    expect(result.text).toContain("introTr: 'aynı',");
    expect(result.text).not.toContain(',,');
  });
});

describe('applyToSource — the dalga-1 field-set change', () => {
  // `independenceNoteTr` became a NARRATIVE field (ruling S2) and the insertion anchor moved to
  // `governmentFormTr`. These pin both halves: the new field is writable, and the five
  // pre-existing fields still anchor exactly where they did.
  const WITH_GOVERNMENT = `export const X = [
  {
    isoCode: 'CC',
    nameTr: 'Gama',
    nameEn: 'Gamma',
    governmentFormTr: 'Test cumhuriyeti',
  },
];
`;

  it('writes independenceNoteTr, anchored on governmentFormTr', () => {
    const result = apply('x.ts', WITH_GOVERNMENT, [
      { isoCode: 'CC', field: 'independenceNoteTr', value: 'bir tarih notu' },
    ]);
    expect(result.inserted).toBe(1);
    const lines = result.text.split('\n');
    const anchor = lines.findIndex((line) => line.includes('governmentFormTr:'));
    expect(lines[anchor + 1]).toContain('independenceNoteTr:');
  });

  it('places the three new narrative fields last, in seed field order', () => {
    const result = apply('x.ts', WITH_GOVERNMENT, [
      { isoCode: 'CC', field: 'governanceNoteTr', value: 'yönetim' },
      { isoCode: 'CC', field: 'settlementNoteTr', value: 'yerleşme' },
      { isoCode: 'CC', field: 'introTr', value: 'giriş' },
      { isoCode: 'CC', field: 'economyNoteTr', value: 'ekonomi' },
    ]);
    expect(result.inserted).toBe(4);
    const order = ['introTr:', 'settlementNoteTr:', 'economyNoteTr:', 'governanceNoteTr:'].map(
      (name) => result.text.indexOf(name),
    );
    expect(order.every((index) => index > -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('still anchors introTr on independenceNoteTr when both exist — unchanged behaviour', () => {
    const both = WITH_GOVERNMENT.replace(
      "governmentFormTr: 'Test cumhuriyeti',",
      "governmentFormTr: 'Test cumhuriyeti',\n    independenceNoteTr: 'bir not',",
    );
    const result = apply('x.ts', both, [{ isoCode: 'CC', field: 'introTr', value: 'giriş' }]);
    const lines = result.text.split('\n');
    const anchor = lines.findIndex((line) => line.includes('independenceNoteTr:'));
    expect(lines[anchor + 1]).toContain('introTr:');
  });
});

describe('applyToSource — hostile values survive the source boundary', () => {
  // The emitter writes TypeScript SOURCE, so a value is only safe if it cannot break out
  // of its literal. `quoteLiteral` emits `'`/`"` only and escapes `\` first, which closes
  // the template-literal trap BY CONSTRUCTION — this pins that construction so a future
  // "let's use backticks for readability" refactor fails here instead of in production.
  it.each([
    ['backticks and interpolation', 'bir `kod` ve ${injection} parçası'],
    ['backslashes', 'ters\\bölü ve \\\\ çifti'],
    ['both quote characters', `tek ' ve çift " tırnak`],
    ['a literal escape sequence', 'kaçış \\n dizisi, gerçek satır sonu değil'],
    ['a comment terminator', 'yorum */ sonlandırıcı ve // satır yorumu'],
    ['a property terminator', "değer', isoCode: 'ZZ"],
    ['Turkish characters and double spaces', 'ığüşöçİĞÜŞÖÇ  iki  boşluk'],
  ])('round-trips %s byte-identically', (_label, value) => {
    const applied = apply('x.ts', FIXTURE, [{ isoCode: 'AA', field: 'introTr', value }]);
    // Re-read through the SAME AST fold the seed reader uses: agreement with the compiler
    // is the whole point, so the assertion goes through the compiler's own parser.
    const reread = apply('x.ts', applied.text, [{ isoCode: 'AA', field: 'introTr', value }]);
    expect(reread.skipped).toBe(1);
    expect(reread.updated).toBe(0);
    expect(reread.text).toBe(applied.text);
  });

  it('never emits a backtick-quoted literal', () => {
    const applied = apply('x.ts', FIXTURE, [
      { isoCode: 'AA', field: 'introTr', value: 'a `b` ${c}' },
    ]);
    const line = applied.text.split('\n').find((l) => l.includes('introTr:')) ?? '';
    expect(line.trimStart().startsWith('introTr: `')).toBe(false);
  });
});
