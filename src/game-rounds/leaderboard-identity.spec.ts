import { describe, expect, it } from '@jest/globals';
import { toLastNameInitial } from './leaderboard-identity';

/**
 * Unit spec for {@link toLastNameInitial} (P1 PR-C plan §11) — a silent casing or
 * surrogate-splitting bug here is invisible in every structural (no-PII-shape) e2e test, so
 * this is the only place either property is actually pinned.
 */
describe('toLastNameInitial', () => {
  it('İnce -> İ (Turkish-locale upper-casing keeps the dotted capital I)', () => {
    expect(toLastNameInitial('İnce')).toBe('İ');
  });

  it('Işık -> I (Turkish-locale upper-casing keeps the dotless capital I)', () => {
    expect(toLastNameInitial('Işık')).toBe('I');
  });

  it('a non-BMP first character is read as one whole grapheme via Array.from, not split by index', () => {
    // MATHEMATICAL SANS-SERIF BOLD SMALL A (U+1D5EE) — a real surrogate pair in UTF-16, chosen
    // only to exercise the code-point-vs-code-unit boundary, not a plausible surname.
    const nonBmpFirstChar = '\u{1D5EE}';
    const surname = `${nonBmpFirstChar}bel`;

    // A naive `surname[0]` index would return an unpaired, invalid lone surrogate half.
    expect(surname[0]).not.toBe(nonBmpFirstChar);
    expect(surname[0]).toHaveLength(1);

    const result = toLastNameInitial(surname);
    expect(result).toBe(nonBmpFirstChar.toLocaleUpperCase('tr'));
    expect(Array.from(result)).toHaveLength(1);
  });

  it('an empty surname throws rather than silently returning an empty string (fail-closed guard; CHK_users_last_name makes this unreachable against a real users row)', () => {
    expect(() => toLastNameInitial('')).toThrow('leaderboard-identity: lastName is empty');
  });
});
