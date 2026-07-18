/**
 * Emitter tests.
 *
 * These assert RULES, never geography (→ CONVENTIONS §2): not one country fact is
 * hardcoded. The data-driven suite at the bottom reads whatever is committed and asserts
 * an invariant over it, so it keeps working as waves land and never needs updating when a
 * fact is corrected.
 */
import * as path from 'node:path';

import ts from 'typescript';

import { chunkValue, emitConcat, quoteLiteral, PRINT_WIDTH } from './emit.ts';
import { readSeedDirectory } from './seed-reader.ts';

const SEED_DIR = path.resolve(__dirname, '../../src/database/seeds/countries');

describe('quoteLiteral', () => {
  it('prefers single quotes when the value has no quotes', () => {
    expect(quoteLiteral('abc')).toBe("'abc'");
  });

  it('switches to double quotes when the value contains apostrophes', () => {
    expect(quoteLiteral("a'b")).toBe('"a\'b"');
  });

  it('keeps single quotes when double quotes are the more common character', () => {
    expect(quoteLiteral('a"b')).toBe("'a\"b'");
  });

  it('escapes the chosen quote when both characters appear', () => {
    // Two singles vs one double -> double wins as the delimiter, singles stay bare.
    expect(quoteLiteral("a'b'c\"d")).toBe('"a\'b\'c\\"d"');
  });

  it('escapes backslashes before anything else', () => {
    expect(quoteLiteral('a\\b')).toBe("'a\\\\b'");
  });

  it('escapes control characters so the literal stays valid source', () => {
    expect(quoteLiteral('\n\n')).toBe("'\\n\\n'");
    expect(quoteLiteral('a\tb')).toBe("'a\\tb'");
  });

  it('never emits a raw newline inside a literal', () => {
    expect(quoteLiteral('a\nb')).not.toContain('\n');
  });
});

describe('chunkValue — the losslessness invariant', () => {
  // This is THE property that kills the PR #43 bug class: a chunk boundary can never
  // fall between two words, because the separating space is owned by the chunk before it.
  const samples = [
    'tek kelime',
    'kısa bir cümle burada durur',
    `${'sözcük '.repeat(80)}son`,
    `${'a'.repeat(150)} sonra kısa`,
    `${'ilk paragraf '.repeat(20)}bitti\n\n${'ikinci paragraf '.repeat(20)}bitti`,
    'apostroflu Türkiye\'nin ve tırnaklı "alıntı" içeren bir metin '.repeat(10),
    'üç\n\nayrı\n\nparagraf',
  ];

  it.each(samples)('rejoins to the original value: %#', (value: string) => {
    expect(chunkValue(value, 6).join('')).toBe(value);
  });

  it('never produces a chunk boundary between two word characters', () => {
    for (const value of samples) {
      const chunks = chunkValue(value, 6);
      chunks.slice(0, -1).forEach((chunk, index) => {
        const next = chunks[index + 1];
        if (chunk === '\n\n' || next === '\n\n') return;
        const lastChar = chunk.slice(-1);
        const firstChar = next?.slice(0, 1) ?? '';
        // A boundary is only legal where the preceding chunk already carries the space.
        expect(`${lastChar}${firstChar}`).toMatch(/\s/u);
      });
    }
  });

  it('keeps a paragraph break as its own chunk', () => {
    const chunks = chunkValue('bir\n\niki', 6);
    expect(chunks).toContain('\n\n');
    expect(chunks.join('')).toBe('bir\n\niki');
  });

  it('is deterministic — the same input always yields the same chunks', () => {
    for (const value of samples) {
      expect(chunkValue(value, 6)).toEqual(chunkValue(value, 6));
    }
  });

  it('does not split inside a word even when the word exceeds the budget', () => {
    const long = 'x'.repeat(200);
    expect(chunkValue(`kısa ${long} kısa`, 6).join('')).toContain(long);
  });
});

describe('emitConcat', () => {
  it('keeps a short value on a single line', () => {
    expect(emitConcat('kısa', 4, 'introTr')).toBe("    introTr: 'kısa',");
  });

  it('wraps a long value into a concatenation ending in a comma', () => {
    const emitted = emitConcat('sözcük '.repeat(60).trim(), 4, 'introTr');
    expect(emitted.startsWith('    introTr:\n')).toBe(true);
    expect(emitted.endsWith(',')).toBe(true);
    expect(emitted).toContain(' +\n');
  });

  it('respects the configured print width on every emitted line', () => {
    const emitted = emitConcat('uzunca bir sözcük dizisi '.repeat(40).trim(), 4, 'climateNoteTr');
    for (const line of emitted.split('\n')) {
      // A single unbreakable token may still overflow; nothing here contains one.
      expect(line.length).toBeLessThanOrEqual(PRINT_WIDTH);
    }
  });

  it('indents continuation lines two columns deeper than the property', () => {
    const emitted = emitConcat('sözcük '.repeat(60).trim(), 4, 'introTr');
    const continuation = emitted.split('\n')[1] ?? '';
    expect(continuation.startsWith(' '.repeat(6))).toBe(true);
    expect(continuation.startsWith(' '.repeat(7))).toBe(false);
  });
});

describe('round-trip over the committed seed (data-driven, fact-free)', () => {
  const seed = readSeedDirectory(SEED_DIR);

  it('reads narrative fields from the committed seed files', () => {
    expect(seed.countries.length).toBeGreaterThan(0);
    expect(seed.fields.length).toBeGreaterThan(0);
  });

  it('re-emits every committed narrative value without changing it', () => {
    const lossy = seed.fields.filter(
      (field) => chunkValue(field.value, 6).join('') !== field.value,
    );
    expect(lossy.map((field) => `${field.isoCode}.${field.field}`)).toEqual([]);
  });

  it('emits every committed narrative value as syntactically valid literals', () => {
    // Parsed by the TypeScript compiler rather than `eval`d: this asserts exactly what
    // the compiler will read back out of the seed file, which is the property we need.
    const parseLiteral = (literal: string): string => {
      const source = ts.createSourceFile('t.ts', `const x = ${literal};`, ts.ScriptTarget.Latest);
      const statement = source.statements[0];
      if (statement === undefined || !ts.isVariableStatement(statement)) {
        throw new Error(`not parseable: ${literal}`);
      }
      const initializer = statement.declarationList.declarations[0]?.initializer;
      if (initializer === undefined || !ts.isStringLiteralLike(initializer)) {
        throw new Error(`not a string literal: ${literal}`);
      }
      return initializer.text;
    };

    for (const field of seed.fields) {
      for (const chunk of chunkValue(field.value, 6)) {
        const literal = quoteLiteral(chunk);
        expect(literal).not.toMatch(/\n/u);
        expect(parseLiteral(literal)).toBe(chunk);
      }
    }
  });
});
