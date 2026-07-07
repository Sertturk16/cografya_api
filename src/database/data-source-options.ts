import type { DataSourceOptions } from 'typeorm';
import { Province } from '../province/entities/province.entity';
import { InitProvince1783382400000 } from './migrations/1783382400000-InitProvince';

/**
 * Single source of truth for the TypeORM connection shape. Consumed by:
 *  - the Nest app (`TypeOrmModule.forRootAsync`),
 *  - the e2e tests (a standalone `DataSource` pointed at a Testcontainers PG),
 *  - the migration CLI (`src/database/data-source.ts` → compiled `dist/…`).
 *
 * Entities and migrations are listed EXPLICITLY (no globs): explicit imports
 * resolve identically whether the code runs from TS (ts-jest) or compiled JS
 * (`node dist/…`), avoiding the classic `.ts`/`.js` glob-path drift. It also
 * matches the hand-review discipline — every new migration is added here on
 * purpose, never auto-discovered.
 *
 * `synchronize` is always false: schema changes ship as reviewed migrations.
 */
export function buildDataSourceOptions(url: string): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: [Province],
    migrations: [InitProvince1783382400000],
    synchronize: false,
    migrationsRun: false,
  };
}
