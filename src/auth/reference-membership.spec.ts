import { describe, expect, it } from '@jest/globals';
import { DEPARTMENTS } from '../reference/department.data';
import { UNIVERSITIES } from '../reference/university.data';
import {
  isKnownDepartmentName,
  isKnownUniversityName,
  KNOWN_DEPARTMENT_NAMES,
  KNOWN_UNIVERSITY_NAMES,
} from './reference-membership';

/**
 * U-R1: the sets are built from the real data, and a name outside the list is rejected. **No
 * count is written here** — every expected value is read from the source arrays in the same run.
 */
describe('reference-membership', () => {
  it('builds KNOWN_UNIVERSITY_NAMES from every row of UNIVERSITIES, and only those rows', () => {
    expect(KNOWN_UNIVERSITY_NAMES.size).toBeGreaterThan(0);
    for (const university of UNIVERSITIES) {
      expect(KNOWN_UNIVERSITY_NAMES.has(university.nameTr)).toBe(true);
    }
  });

  it('builds KNOWN_DEPARTMENT_NAMES from every row of DEPARTMENTS, and only those rows', () => {
    expect(KNOWN_DEPARTMENT_NAMES.size).toBeGreaterThan(0);
    for (const department of DEPARTMENTS) {
      expect(KNOWN_DEPARTMENT_NAMES.has(department.nameTr)).toBe(true);
    }
  });

  it('accepts a real university name and rejects one not on the list', () => {
    const real = UNIVERSITIES[0];
    if (!real) throw new Error('UNIVERSITIES is empty');
    expect(isKnownUniversityName(real.nameTr)).toBe(true);
    expect(isKnownUniversityName('Synthetic Nonexistent University 12345')).toBe(false);
  });

  it('accepts a real department name and rejects one not on the list', () => {
    const real = DEPARTMENTS[0];
    if (!real) throw new Error('DEPARTMENTS is empty');
    expect(isKnownDepartmentName(real.nameTr)).toBe(true);
    expect(isKnownDepartmentName('Synthetic Nonexistent Department 12345')).toBe(false);
  });

  it('rejects a non-string value without throwing', () => {
    expect(isKnownUniversityName(undefined)).toBe(false);
    expect(isKnownDepartmentName(42)).toBe(false);
  });
});
