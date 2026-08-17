import { describe, expect, it } from '@jest/globals';
import { EarthquakeBindingKind } from '../earthquake.types';
import { isWaterBodyName, normaliseProvinceName, resolveBindingKind } from './earthquake-binding';

describe('resolveBindingKind', () => {
  it('files an event on Turkish soil with a plain location as inside', () => {
    expect(
      resolveBindingKind({
        providerCountry: 'Türkiye',
        hasDistanceBracket: false,
        placeNameTr: 'Göksun (Kahramanmaraş)',
      }),
    ).toBe(EarthquakeBindingKind.Inside);
  });

  it('files a foreign event across the border', () => {
    expect(
      resolveBindingKind({
        providerCountry: 'İran',
        hasDistanceBracket: true,
        placeNameTr: 'Maku, West Azarbaijan (İran)',
      }),
    ).toBe(EarthquakeBindingKind.AcrossBorder);
  });

  it('files open water — the null country — as offshore', () => {
    expect(
      resolveBindingKind({
        providerCountry: null,
        hasDistanceBracket: false,
        placeNameTr: 'Ege Denizi',
      }),
    ).toBe(EarthquakeBindingKind.OffshoreNear);
  });

  it('files a bracketed Turkish WATER event as offshore', () => {
    expect(
      resolveBindingKind({
        providerCountry: 'Türkiye',
        hasDistanceBracket: true,
        placeNameTr: 'Keban Barajı',
      }),
    ).toBe(EarthquakeBindingKind.OffshoreNear);
  });

  it('files the residual case — Turkish, bracketed, on land — as inside', () => {
    // The combination the SPEC's original table did not cover, ruled `inside` by Atlas on
    // 2026-08-12. The alternative would label a land event "offshore", which is precisely the
    // factual error this field exists to prevent.
    expect(
      resolveBindingKind({
        providerCountry: 'Türkiye',
        hasDistanceBracket: true,
        placeNameTr: 'Sinanpaşa',
      }),
    ).toBe(EarthquakeBindingKind.Inside);
  });

  it('NEVER calls a non-Turkish event inside — swept over the whole input space', () => {
    // A property, run as an exhaustive sweep rather than with a random generator: the input space
    // is three small dimensions, so every combination can simply be enumerated. This is the
    // invariant that stops an Iranian earthquake from being published as a Turkish one.
    const countries = [null, 'Türkiye', 'İran', 'Gürcistan', 'Suriye', 'Azerbaycan', 'Yunanistan'];
    const brackets = [true, false];
    const places = [
      'Ege Denizi',
      'Van Gölü',
      'Keban Barajı',
      'Sinanpaşa',
      'Maku',
      'İstanbul Boğazı',
    ];

    let inside = 0;
    for (const providerCountry of countries) {
      for (const hasDistanceBracket of brackets) {
        for (const placeNameTr of places) {
          const kind = resolveBindingKind({ providerCountry, hasDistanceBracket, placeNameTr });
          if (kind === EarthquakeBindingKind.Inside) {
            inside += 1;
            expect(providerCountry).toBe('Türkiye');
          }
        }
      }
    }
    // The control for the sweep: it really did reach the `inside` branch, so the assertion above
    // was exercised rather than vacuously skipped.
    expect(inside).toBeGreaterThan(0);
  });
});

describe('isWaterBodyName', () => {
  it.each([
    ['Ege Denizi', true],
    ['Akdeniz', false],
    ['Van Gölü', true],
    ['Keban Barajı', true],
    ['İstanbul Boğazı', true],
    ['Saros Körfezi', true],
    ['Sinanpaşa', false],
    ['Göksun (Kahramanmaraş)', false],
  ])('%s → %s', (name, expected) => {
    expect(isWaterBodyName(name)).toBe(expected);
  });

  it('matches whole words only, so a place is not water for containing one', () => {
    // `Gölbaşı` and `Denizli` are settlements. A substring match would file both as offshore.
    expect(isWaterBodyName('Gölbaşı')).toBe(false);
    expect(isWaterBodyName('Denizli')).toBe(false);
  });
});

describe('normaliseProvinceName', () => {
  it('folds case in the TURKISH locale', () => {
    // `'I'.toLowerCase()` is `'i'` in the invariant locale and `'ı'` in Turkish. Getting this
    // wrong puts `Iğdır` in a bucket the province table never lands in, and the event silently
    // loses its cross-link.
    expect(normaliseProvinceName('IĞDIR')).toBe(normaliseProvinceName('Iğdır'));
    expect(normaliseProvinceName('İSTANBUL')).toBe(normaliseProvinceName('İstanbul'));
  });

  it('collapses surrounding and repeated whitespace', () => {
    expect(normaliseProvinceName('  Kahramanmaraş  ')).toBe('kahramanmaraş');
    expect(normaliseProvinceName('Afyon   karahisar')).toBe('afyon karahisar');
  });

  it('keeps two different provinces apart', () => {
    expect(normaliseProvinceName('Van')).not.toBe(normaliseProvinceName('Muş'));
  });
});
