import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildDataSourceOptions } from './data-source-options';

/**
 * The mechanical half of "entity change → migration" (`CLAUDE.md` Hard rules), checked without a
 * database so it fails in seconds instead of at the end of the e2e lane:
 *
 * - every file in `migrations/` is registered in `data-source-options.ts`, in timestamp order,
 *   and nothing else is;
 * - every `*.entity.ts` class is registered in `entities`;
 * - the two ordered lists in `test/province.e2e-spec.ts` and `test/country.e2e-spec.ts` name
 *   exactly those migrations. The e2e suites still assert the list against a real migration
 *   run; this only makes a forgotten copy fail before Testcontainers starts.
 *
 * Reading the generated SQL stays a human step.
 */

const SRC = join(__dirname, '..');
const ROOT = join(SRC, '..');
const MIGRATIONS_DIR = join(__dirname, 'migrations');
const MIGRATION_FILE = /^(\d{13})-([A-Za-z0-9]+)\.ts$/;
const E2E_LISTS = ['test/province.e2e-spec.ts', 'test/country.e2e-spec.ts'];

const options: unknown = buildDataSourceOptions('postgresql://user:pass@localhost:5432/db');

function registeredNames(key: 'migrations' | 'entities'): string[] {
  const list: unknown = (options as Record<string, unknown>)[key];
  if (!Array.isArray(list)) throw new Error(`\`${key}\` is not an explicit array`);
  return list.map((item: unknown) => {
    if (typeof item !== 'function') throw new Error(`\`${key}\` holds a non-class entry`);
    return item.name;
  });
}

/** `1790467200000-AddBookContentKindAndVideoGroup.ts` → `AddBookContentKindAndVideoGroup1790467200000`. */
function migrationFileClassNames(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
    .map((file) => {
      const [, timestamp, name] = MIGRATION_FILE.exec(file) ?? [];
      if (!timestamp || !name) {
        throw new Error(`migrations/${file} is not named <13-digit timestamp>-<Name>.ts`);
      }
      return { timestamp, name: `${name}${timestamp}` };
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map((m) => m.name);
}

function entityFileClassNames(): string[] {
  const names: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.entity.ts')) {
        const [, name] = /^export class (\w+)/m.exec(readFileSync(path, 'utf8')) ?? [];
        if (!name) throw new Error(`${relative(ROOT, path)} exports no entity class`);
        names.push(name);
      }
    }
  };
  walk(SRC);
  return names.sort();
}

/** The string literals inside `expect(appliedMigrationNames).toEqual([ ... ])`. */
function e2eMigrationList(file: string): string[] {
  const source = readFileSync(join(ROOT, file), 'utf8');
  const start = source.indexOf('expect(appliedMigrationNames).toEqual([');
  if (start === -1) throw new Error(`${file} no longer asserts appliedMigrationNames`);
  const body = source.slice(start, source.indexOf(']);', start));
  // Every quoted line must be a plain `'Name1234567890123',` entry: a line the pattern skipped
  // would otherwise be reported as missing from a file that does contain it.
  return body
    .split('\n')
    .filter((line) => line.includes("'") && !line.trim().startsWith('//'))
    .map((line) => {
      const [, name] = /^\s*'([A-Za-z0-9]+)',\s*$/.exec(line) ?? [];
      if (!name) throw new Error(`${file}: unexpected line in the migration list: ${line.trim()}`);
      return name;
    });
}

describe('migration and entity registry', () => {
  it('registers every migration file, in timestamp order, and nothing else', () => {
    expect(registeredNames('migrations')).toEqual(migrationFileClassNames());
  });

  it('registers every entity class', () => {
    expect([...registeredNames('entities')].sort()).toEqual(entityFileClassNames());
  });

  it.each(E2E_LISTS)('%s lists exactly the registered migrations, in order', (file) => {
    expect(e2eMigrationList(file)).toEqual(registeredNames('migrations'));
  });
});
