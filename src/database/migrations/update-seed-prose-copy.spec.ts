import { describe, expect, it } from '@jest/globals';
import { SEED_COUNTRIES } from '../seeds/country.seed-data';
import { SEED_PROVINCES } from '../seeds/province.seed-data';
import { SEED_REGIONS } from '../seeds/region.seed-data';
import { SEED_COPY_CHANGES } from './1790208000000-UpdateSeedProseCopy';
import { SEED_FACT_CHANGES } from './1790553600000-FixSeedProseFacts';

/**
 * The prose migrations and the seed files carry the same prose twice: the migrations for
 * databases seeded earlier, the seeds for fresh ones. This keeps the copies from drifting apart.
 * A later migration may rewrite a column an earlier one already rewrote; then it must start from
 * the earlier one's `after`, and only the last `after` has to match the seed.
 */
type ProseChange = {
  readonly table: keyof typeof KEY_PROPERTY;
  readonly key: string | number;
  readonly property: string;
  readonly column: string;
  readonly before: unknown;
  readonly after: unknown;
};

/** Every data migration that rewrites seed prose, oldest first. */
const PROSE_MIGRATIONS: ReadonlyArray<readonly [string, readonly ProseChange[]]> = [
  ['UpdateSeedProseCopy', SEED_COPY_CHANGES],
  ['FixSeedProseFacts', SEED_FACT_CHANGES],
];

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

const id = (change: ProseChange) => `${change.table}/${String(change.key)}/${change.column}`;

describe('seed prose migrations', () => {
  it('end on exactly what the seed files now hold', () => {
    const last = new Map<string, ProseChange>();
    for (const [, changes] of PROSE_MIGRATIONS) for (const c of changes) last.set(id(c), c);
    for (const change of last.values()) {
      expect({
        change: id(change),
        value: seedRow(change.table, change.key)[change.property] ?? null,
      }).toEqual({ change: id(change), value: change.after });
    }
  });

  it('start each rewrite from the text the previous migration left', () => {
    const current = new Map<string, unknown>();
    for (const [name, changes] of PROSE_MIGRATIONS) {
      for (const change of changes) {
        if (current.has(id(change))) {
          expect({ migration: name, change: id(change), before: change.before }).toEqual({
            migration: name,
            change: id(change),
            before: current.get(id(change)),
          });
        }
        current.set(id(change), change.after);
      }
    }
  });

  it.each(PROSE_MIGRATIONS)(
    '%s changes each column of each row at most once, and only to a different value',
    (_name, changes) => {
      const seen = new Set<string>();
      for (const change of changes) {
        expect(seen.has(id(change))).toBe(false);
        seen.add(id(change));
        expect(change.after).not.toEqual(change.before);
      }
    },
  );
});
