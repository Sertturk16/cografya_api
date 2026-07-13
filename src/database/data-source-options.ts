import type { DataSourceOptions } from 'typeorm';
import { Country } from '../country/entities/country.entity';
import { Province } from '../province/entities/province.entity';
import { InitProvince1783382400000 } from './migrations/1783382400000-InitProvince';
import { AddProvinceClimateNote1783513986800 } from './migrations/1783513986800-AddProvinceClimateNote';
import { AddProvinceDetailSections1783701664849 } from './migrations/1783701664849-AddProvinceDetailSections';
import { InitCountry1784001600000 } from './migrations/1784001600000-InitCountry';
import { AddCountryHydrographyNote1784102400000 } from './migrations/1784102400000-AddCountryHydrographyNote';
import { AddCountrySovereigntyNote1784188800000 } from './migrations/1784188800000-AddCountrySovereigntyNote';

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
    entities: [Province, Country],
    migrations: [
      InitProvince1783382400000,
      AddProvinceClimateNote1783513986800,
      AddProvinceDetailSections1783701664849,
      InitCountry1784001600000,
      AddCountryHydrographyNote1784102400000,
      AddCountrySovereigntyNote1784188800000,
    ],
    synchronize: false,
    migrationsRun: false,
  };
}
