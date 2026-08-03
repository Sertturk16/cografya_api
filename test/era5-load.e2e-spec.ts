import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import {
  ERA5_MANIFEST_FILE_NAME,
  ERA5_SERIES_FILE_NAME,
  loadEra5ClimateNormals,
} from '../src/database/era5/era5-load';
import { Era5LoadError } from '../src/database/era5/era5-load-assertions';
import {
  ERA5_DATASET_URL,
  ERA5_FIRST_YEAR,
  ERA5_LAST_YEAR,
} from '../src/database/era5/era5-request';
import { seedGeography } from '../src/database/seeds/seed-geography';
import { Province } from '../src/province/entities/province.entity';
import {
  CLIMATE_MONTH_COUNT,
  CLIMATE_SOURCE_ERA5_LAND_MONTHLY,
} from '../src/province/province.types';

/**
 * Real-Postgres e2e for `db:import:era5 --phase=load` — the offline path a deploy actually runs,
 * against the COMMITTED artifacts, not a fixture.
 *
 * ## What only a real database can prove here
 * **The jsonb key-order lesson.** Postgres `jsonb` decomposes a document and re-serialises its
 * keys by (length, then lexical) order, so a document written with `source` first comes back with
 * `months` first. A loader comparing with plain `JSON.stringify` therefore sees all 81 provinces
 * as changed on every single re-run, bumps 81 `updated_at` values, and tells Google 81 pages
 * changed when nothing did — silently, with exit code 0. No in-memory unit test can reproduce
 * that; it needs the round-trip. The retired MGM load suite existed for this, and carrying the
 * lesson (not the code) onto the new line is an acceptance criterion of this PR.
 *
 * **The 30 s pool-wide `statement_timeout`.** This suite builds its DataSource through
 * `buildDataSourceOptions`, so the load runs under the exact ceiling production carries. A
 * statement that overran it would fail here with SQLSTATE `57014` rather than being discovered in
 * production. (By construction it cannot come close: the write is 81 independent single-row
 * updates of a ~730-byte document each.)
 *
 * Per CONVENTIONS §2 everything asserted is STRUCTURAL. No province's temperature or rainfall is
 * pinned to a value anywhere in this file.
 */

const ARTIFACT_DIR = join(__dirname, '..', 'data', 'era5-land');

describe('ERA5-Land load phase (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource(buildDataSourceOptions(container.getConnectionUri()));
    await dataSource.initialize();
    await dataSource.runMigrations();
    await seedGeography(dataSource);
  }, 180_000);

  afterAll(async () => {
    await dataSource?.destroy();
    await container?.stop();
  });

  it('writes all 81 provinces from the committed artifacts', async () => {
    const result = await loadEra5ClimateNormals(dataSource, { inputDir: ARTIFACT_DIR });
    expect(result).toEqual({ updated: 81, unchanged: 0 });

    const provinces = await dataSource.getRepository(Province).find();
    expect(provinces).toHaveLength(81);
    // Completeness is absolute on this line — 81 of 81, never "most of them".
    expect(provinces.filter((province) => province.climateNormals === null)).toEqual([]);
  });

  it('stores the narrowed contract shape, and only it', async () => {
    const provinces = await dataSource.getRepository(Province).find();
    for (const province of provinces) {
      const normals = province.climateNormals;
      expect(normals).not.toBeNull();
      if (normals === null) continue; // narrowing; the assertion above is the real guard

      // Exact key set, read back through jsonb: an extra key here would be SERVED verbatim.
      expect(Object.keys(normals).sort()).toEqual([
        'months',
        'periodEndYear',
        'periodStartYear',
        'source',
        'sourceUrl',
      ]);
      expect(normals.source).toBe(CLIMATE_SOURCE_ERA5_LAND_MONTHLY);
      expect(normals.sourceUrl).toBe(ERA5_DATASET_URL);
      expect(normals.periodStartYear).toBe(ERA5_FIRST_YEAR);
      expect(normals.periodEndYear).toBe(ERA5_LAST_YEAR);

      expect(normals.months).toHaveLength(CLIMATE_MONTH_COUNT);
      for (const [index, month] of normals.months.entries()) {
        expect(Object.keys(month).sort()).toEqual(['month', 'precipitationMm', 'tempMeanC']);
        expect(month.month).toBe(index + 1);
        expect(typeof month.tempMeanC).toBe('number');
        expect(typeof month.precipitationMm).toBe('number');
        expect(Number.isFinite(month.tempMeanC)).toBe(true);
        expect(Number.isFinite(month.precipitationMm)).toBe(true);
      }
    }
  });

  it('IS IDEMPOTENT: a second run writes nothing and does not move updated_at', async () => {
    // The jsonb key-order lesson, proved where it can actually fail. `updated_at` is what the
    // page's `dateModified` and the sitemap `lastmod` are built from, so "no-op means no write" is
    // a publishing-honesty rule, not an optimisation.
    const repo = dataSource.getRepository(Province);
    const before = new Map(
      (await repo.find()).map((province) => [province.plateCode, province.updatedAt.getTime()]),
    );

    const result = await loadEra5ClimateNormals(dataSource, { inputDir: ARTIFACT_DIR });
    expect(result).toEqual({ updated: 0, unchanged: 81 });

    const after = await repo.find();
    expect(after).toHaveLength(81);
    for (const province of after) {
      expect(province.updatedAt.getTime()).toBe(before.get(province.plateCode));
    }
  });

  it('DOES move updated_at for a province whose stored series genuinely differs', async () => {
    // The positive direction of the same rule: idempotency must not be "never writes", which a
    // broken loader would also satisfy. Restores by re-running the load.
    const repo = dataSource.getRepository(Province);
    const target = await repo.findOneByOrFail({ plateCode: '34' });
    const original = target.climateNormals;
    if (original === null) throw new Error('fixture: 34 has no series');
    const before = target.updatedAt.getTime();

    const tampered = {
      ...original,
      months: original.months.map((month, index) =>
        index === 0 ? { ...month, tempMeanC: month.tempMeanC + 5 } : month,
      ),
    };
    await repo.update({ plateCode: '34' }, { climateNormals: tampered });

    const result = await loadEra5ClimateNormals(dataSource, { inputDir: ARTIFACT_DIR });
    expect(result).toEqual({ updated: 1, unchanged: 80 });

    const restored = await repo.findOneByOrFail({ plateCode: '34' });
    expect(restored.climateNormals).toEqual(original);
    expect(restored.updatedAt.getTime()).toBeGreaterThan(before);
  });

  it('is ALL-OR-NOTHING: a corrupt artifact writes nothing at all', async () => {
    // The expensive lesson from the retired MGM loader: coverage used to be detected inside the
    // transaction, so 80 provinces committed — and bumped their updated_at — before the run
    // reported failure. Every gate now resolves before the transaction opens.
    const repo = dataSource.getRepository(Province);
    const before = new Map(
      (await repo.find()).map((province) => [
        province.plateCode,
        {
          updatedAt: province.updatedAt.getTime(),
          normals: JSON.stringify(province.climateNormals),
        },
      ]),
    );

    const scratch = await mkdtemp(join(tmpdir(), 'era5-load-e2e-'));
    const manifest = JSON.parse(
      await readFile(join(ARTIFACT_DIR, ERA5_MANIFEST_FILE_NAME), 'utf8'),
    ) as Record<string, unknown>;
    // Break the artifact pair's identity link — the check that keeps the manifest cross-check
    // from comparing numbers derived from one download against evidence recorded for another.
    manifest.rawFile = { ...(manifest.rawFile as Record<string, unknown>), sha256: 'f'.repeat(64) };
    await writeFile(join(scratch, ERA5_MANIFEST_FILE_NAME), JSON.stringify(manifest), 'utf8');
    await writeFile(
      join(scratch, ERA5_SERIES_FILE_NAME),
      await readFile(join(ARTIFACT_DIR, ERA5_SERIES_FILE_NAME), 'utf8'),
      'utf8',
    );

    await expect(loadEra5ClimateNormals(dataSource, { inputDir: scratch })).rejects.toThrow(
      Era5LoadError,
    );

    const after = await repo.find();
    for (const province of after) {
      const previous = before.get(province.plateCode);
      expect(previous).toBeDefined();
      expect(province.updatedAt.getTime()).toBe(previous?.updatedAt);
      expect(JSON.stringify(province.climateNormals)).toBe(previous?.normals);
    }
  });

  it('REFUSES, by name, an artifact province that is not in the database', async () => {
    // Direction 1 of the coverage check. An operator must be told WHICH province and what to run,
    // rather than being handed a bare TypeORM error from inside a transaction — a climate series
    // written for a province that does not exist is otherwise a silent no-op.
    const repo = dataSource.getRepository(Province);
    const removed = await repo.findOneByOrFail({ plateCode: '01' });
    await repo.delete({ plateCode: '01' });
    try {
      await expect(loadEra5ClimateNormals(dataSource, { inputDir: ARTIFACT_DIR })).rejects.toThrow(
        /01.*db:seed:geography/s,
      );
    } finally {
      await repo.insert(removed);
      await seedGeography(dataSource);
      await loadEra5ClimateNormals(dataSource, { inputDir: ARTIFACT_DIR });
    }
  });

  it('REFUSES, by name, a database province the artifact does not cover', async () => {
    // Direction 2, which nothing on the retired line checked until late: a province the artifact
    // omits would keep a NULL series forever, with no error at any layer. Manufactured by adding a
    // province the artifact cannot know about — deleting a real one exercises direction 1 instead.
    const repo = dataSource.getRepository(Province);
    const template = await repo.findOneByOrFail({ plateCode: '34' });
    const extra = repo.create({
      ...template,
      plateCode: '99',
      nameTr: 'Test Vilayeti',
      slugTr: 'test-vilayeti',
      slugEn: 'test-province',
      climateNormals: null,
    });
    // The primary key is generated, so it must not be carried over from the template row.
    delete (extra as Partial<Province>).id;
    await repo.insert(extra);
    try {
      await expect(loadEra5ClimateNormals(dataSource, { inputDir: ARTIFACT_DIR })).rejects.toThrow(
        /missing 99/,
      );
    } finally {
      await repo.delete({ plateCode: '99' });
    }
    // And the real 81 are untouched by the refusal.
    const result = await loadEra5ClimateNormals(dataSource, { inputDir: ARTIFACT_DIR });
    expect(result).toEqual({ updated: 0, unchanged: 81 });
  });
});
