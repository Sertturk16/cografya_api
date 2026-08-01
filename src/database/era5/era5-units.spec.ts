import { describe, expect, it } from '@jest/globals';
import {
  assertPrecipitationInRange,
  assertTemperatureInRange,
  daysInMonth,
  kelvinToCelsius,
  METRES_TO_MM,
  totalPrecipitationToMonthlyMm,
} from './era5-units';
import { Era5ContractError } from './era5.errors';

describe('kelvinToCelsius', () => {
  it('subtracts exactly 273.15', () => {
    expect(kelvinToCelsius(273.15)).toBeCloseTo(0, 10);
    expect(kelvinToCelsius(300)).toBeCloseTo(26.85, 10);
    expect(kelvinToCelsius(250)).toBeCloseTo(-23.15, 10);
  });

  it('refuses a non-finite input rather than propagating NaN into a published number', () => {
    expect(() => kelvinToCelsius(Number.NaN)).toThrow(Era5ContractError);
  });
});

describe('daysInMonth', () => {
  it('knows the ordinary months', () => {
    expect(daysInMonth(1991, 1)).toBe(31);
    expect(daysInMonth(1991, 4)).toBe(30);
    expect(daysInMonth(1991, 12)).toBe(31);
  });

  it('applies the full Gregorian leap rule, not "divisible by 4"', () => {
    expect(daysInMonth(1991, 2)).toBe(28);
    expect(daysInMonth(1992, 2)).toBe(29);
    expect(daysInMonth(2000, 2)).toBe(29); // divisible by 400
    expect(daysInMonth(1900, 2)).toBe(28); // divisible by 100, not 400
  });

  it('covers every February in the 1991–2020 window with 7 leap years', () => {
    // 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020 → 8 leap Februaries in the window.
    const leaps = Array.from({ length: 30 }, (_unused, index) => 1991 + index).filter(
      (year) => daysInMonth(year, 2) === 29,
    );
    expect(leaps).toEqual([1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020]);
  });

  it('refuses a month outside 1…12', () => {
    expect(() => daysInMonth(1991, 0)).toThrow(Era5ContractError);
    expect(() => daysInMonth(1991, 13)).toThrow(Era5ContractError);
  });
});

describe('totalPrecipitationToMonthlyMm — the `units = "m"` trap', () => {
  it('multiplies by the month length AND by 1000 (m/day → mm/month)', () => {
    // 0.005 m/day over a 31-day January = 155 mm.
    expect(totalPrecipitationToMonthlyMm(0.005, 1991, 1)).toBeCloseTo(155, 10);
  });

  it('uses 29 days for a leap February and 28 otherwise — a 3.4 % difference', () => {
    const leap = totalPrecipitationToMonthlyMm(0.005, 1992, 2);
    const ordinary = totalPrecipitationToMonthlyMm(0.005, 1991, 2);
    expect(leap).toBeCloseTo(145, 10);
    expect(ordinary).toBeCloseTo(140, 10);
    expect(leap).toBeGreaterThan(ordinary);
  });

  it('is NOT the "monthly total in metres" reading — that is 1/days of this value', () => {
    // The wrong reading (× 1000 only) is what the misleading `tp:units = "m"` attribute invites.
    // It lands ~31× low in January, which is the SPEC §11-R3 error class, pinned here.
    const correct = totalPrecipitationToMonthlyMm(0.005, 1991, 1);
    const wrongReading = 0.005 * METRES_TO_MM;
    expect(correct / wrongReading).toBeCloseTo(31, 10);
  });

  it('is NOT the "hourly accumulation" reading either — that is 24× this value', () => {
    const correct = totalPrecipitationToMonthlyMm(0.005, 1991, 1);
    const wrongReading = 0.005 * 24 * 31 * METRES_TO_MM;
    expect(wrongReading / correct).toBeCloseTo(24, 10);
  });

  it('refuses a non-finite input', () => {
    expect(() => totalPrecipitationToMonthlyMm(Number.NaN, 1991, 1)).toThrow(Era5ContractError);
  });
});

describe('physical range guards — LOUD failure, never a silent null', () => {
  it('accepts the measured real range and rejects beyond it', () => {
    expect(() => assertTemperatureInRange(-15.96, 'x')).not.toThrow();
    expect(() => assertTemperatureInRange(39.24, 'x')).not.toThrow();
    expect(() => assertTemperatureInRange(-60.1, 'x')).toThrow(Era5ContractError);
    expect(() => assertTemperatureInRange(60.1, 'x')).toThrow(Era5ContractError);
    expect(() => assertTemperatureInRange(Number.NaN, 'x')).toThrow(Era5ContractError);
  });

  it('rejects negative precipitation and the 3-orders-of-magnitude wrong multiplier', () => {
    expect(() => assertPrecipitationInRange(0.014, 'x')).not.toThrow();
    expect(() => assertPrecipitationInRange(726.6, 'x')).not.toThrow();
    expect(() => assertPrecipitationInRange(-0.1, 'x')).toThrow(Era5ContractError);
    // The `× 24 × days × 1000` misreading produces monthly values in the thousands.
    expect(() => assertPrecipitationInRange(4446, 'x')).toThrow(Era5ContractError);
  });
});
