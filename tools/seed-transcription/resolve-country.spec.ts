/**
 * Resolver tests. The fixtures are invented placeholder countries on purpose — the rules
 * under test are about heading shapes and failure modes, not about geography
 * (→ CONVENTIONS §2).
 */
import { foldName, headingCandidates, nameVariants, resolveCountry } from './resolve-country.ts';
import type { SeededCountry } from './seed-reader.ts';

const countries: SeededCountry[] = [
  { isoCode: 'AA', nameTr: 'Alfa', nameEn: 'Alpha', file: 'x.countries.ts' },
  { isoCode: 'BB', nameTr: 'Beta Cumhuriyeti (Beta)', nameEn: 'Republic of Beta', file: 'x.ts' },
  { isoCode: 'CC', nameTr: 'Çeta', nameEn: 'Cheta', file: 'x.countries.ts' },
  { isoCode: 'DD', nameTr: 'İlkada', nameEn: 'Firstisle', file: 'x.countries.ts' },
];

describe('foldName', () => {
  it('folds Turkish dotted and dotless i to the same key', () => {
    expect(foldName('İLKADA')).toBe(foldName('ilkada'));
    expect(foldName('Iğdır')).toBe(foldName('ığdır'));
  });

  it('strips diacritics, spacing and punctuation', () => {
    expect(foldName('Çeta')).toBe('ceta');
    expect(foldName('  Bosna-Hersek ')).toBe('bosnahersek');
  });
});

describe('headingCandidates', () => {
  it('drops the wave-local ordinal prefix', () => {
    expect(headingCandidates('3. TANZANYA')).toEqual(['TANZANYA']);
  });

  it('yields both the parenthetical and the text before it', () => {
    expect(headingCandidates('3. ALFA (Alpha)').sort()).toEqual(['ALFA', 'Alpha']);
  });

  it('splits slash-separated alternate names', () => {
    expect(headingCandidates('8. UZUN AD / KISA AD (Long Name)').sort()).toEqual([
      'KISA AD',
      'Long Name',
      'UZUN AD',
    ]);
  });

  it('returns no empty candidates', () => {
    expect(headingCandidates('5.  ( ) ')).toEqual([]);
  });
});

describe('nameVariants', () => {
  it('expands a parenthetical seed name into its halves', () => {
    expect(nameVariants('Beta Cumhuriyeti (Beta)').sort()).toEqual([
      'Beta',
      'Beta Cumhuriyeti',
      'Beta Cumhuriyeti (Beta)',
    ]);
  });

  it('leaves a plain name alone', () => {
    expect(nameVariants('Alfa')).toEqual(['Alfa']);
  });
});

describe('resolveCountry', () => {
  it('matches on the Turkish name', () => {
    expect(resolveCountry('1. ALFA', countries)).toMatchObject({ ok: true, isoCode: 'AA' });
  });

  it('matches on the English name in parentheses', () => {
    expect(resolveCountry('1. ALFA (Alpha)', countries)).toMatchObject({ ok: true, isoCode: 'AA' });
  });

  it('matches a half of a parenthetical seed name', () => {
    expect(resolveCountry('2. BETA', countries)).toMatchObject({ ok: true, isoCode: 'BB' });
  });

  it('prefers an explicit ISO code in the heading over any name heuristic', () => {
    // Names deliberately point nowhere; only the code can resolve this.
    expect(resolveCountry('5. BİLİNMEYEN AD / BAŞKA AD (CC)', countries)).toMatchObject({
      ok: true,
      isoCode: 'CC',
    });
  });

  it('fails loudly when nothing matches — never guesses a nearest name', () => {
    const result = resolveCountry('9. TAMAMEN BAŞKA', countries);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('no seeded country matches');
  });

  it('fails loudly when a heading matches two different countries', () => {
    const ambiguous: SeededCountry[] = [
      { isoCode: 'AA', nameTr: 'Ortak', nameEn: 'Alpha', file: 'x.ts' },
      { isoCode: 'ZZ', nameTr: 'Zeta', nameEn: 'Ortak', file: 'x.ts' },
    ];
    const result = resolveCountry('1. ORTAK', ambiguous);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('ambiguous');
  });

  it('does not resolve an ISO-shaped token that is not a seeded code', () => {
    expect(resolveCountry('1. ZZ', countries).ok).toBe(false);
  });
});
