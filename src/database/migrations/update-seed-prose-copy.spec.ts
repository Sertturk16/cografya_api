import { describe, expect, it } from '@jest/globals';
import { SEED_COUNTRIES } from '../seeds/country.seed-data';
import { SEED_PROVINCES } from '../seeds/province.seed-data';
import { SEED_REGIONS } from '../seeds/region.seed-data';
import { SEED_COPY_CHANGES } from './1790208000000-UpdateSeedProseCopy';

/**
 * The migration and the seed files carry the same prose twice: the migration for databases
 * seeded earlier, the seeds for fresh ones. This keeps the two copies from drifting apart.
 */
const KEY_PROPERTY = { regions: 'region', provinces: 'plateCode', countries: 'isoCode' } as const;
const CORPUS: Record<keyof typeof KEY_PROPERTY, readonly object[]> = {
  regions: SEED_REGIONS,
  provinces: SEED_PROVINCES,
  countries: SEED_COUNTRIES,
};

function seedRow(table: keyof typeof KEY_PROPERTY, key: string | number): Record<string, unknown> {
  const keyProperty = KEY_PROPERTY[table];
  const row = CORPUS[table].find((r) => (r as Record<string, unknown>)[keyProperty] === key);
  if (!row) throw new Error(`${table}: no seed row for ${String(key)}`);
  return row as Record<string, unknown>;
}

describe('UpdateSeedProseCopy', () => {
  it('writes exactly what the seed files now hold', () => {
    for (const change of SEED_COPY_CHANGES) {
      expect({
        change: `${change.table}/${String(change.key)}/${change.property}`,
        value: seedRow(change.table, change.key)[change.property] ?? null,
      }).toEqual({
        change: `${change.table}/${String(change.key)}/${change.property}`,
        value: change.after,
      });
    }
  });

  it('changes each column of each row at most once, and only to a different value', () => {
    const seen = new Set<string>();
    for (const change of SEED_COPY_CHANGES) {
      const id = `${change.table}/${String(change.key)}/${change.column}`;
      expect(seen.has(id)).toBe(false);
      seen.add(id);
      expect(change.after).not.toEqual(change.before);
    }
  });
});
