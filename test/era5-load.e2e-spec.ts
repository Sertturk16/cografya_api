import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { canonicalJson } from '../src/database/climate/canonical-json';
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
 * updates, the largest document measuring 811 B and the whole run 63.0 KiB.)
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

  it('PREMISE: Postgres really does reorder jsonb keys — so canonicalJson is load-bearing', async () => {
    // Carried over from the deleted MGM load suite (review #87, CR87-M4). Without it the
    // idempotency test below could pass VACUOUSLY: if Postgres ever stopped reordering keys, a
    // naive `JSON.stringify` comparison would start working, the test would still be green, and
    // `canonicalJson`'s necessity would silently become unproven. This asserts the premise
    // directly, so the two facts fail independently.
    const written = {
      source: CLIMATE_SOURCE_ERA5_LAND_MONTHLY,
      sourceUrl: ERA5_DATASET_URL,
      periodStartYear: ERA5_FIRST_YEAR,
      periodEndYear: ERA5_LAST_YEAR,
      months: [{ month: 1, tempMeanC: 6.2, precipitationMm: 77.8 }],
    };
    const rows: unknown = await dataSource.query('SELECT $1::jsonb::text AS round_tripped', [
      JSON.stringify(written),
    ]);
    const text: unknown = Array.isArray(rows)
      ? (rows[0] as { round_tripped?: unknown } | undefined)?.round_tripped
      : undefined;
    if (typeof text !== 'string') throw new Error('jsonb round-trip did not return text');
    const readBack: unknown = JSON.parse(text);

    // The premise: the SAME document comes back with a different key order …
    expect(Object.keys(readBack as Record<string, unknown>)).not.toEqual(Object.keys(written));
    // … so the naive comparison the loader must NOT use reports a false difference …
    expect(JSON.stringify(readBack)).not.toBe(JSON.stringify(written));
    // … while the comparison it does use sees them as the identical document they are.
    expect(canonicalJson(readBack)).toBe(canonicalJson(written));
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

  it('PRE-FLIGHT: a corrupt artifact is refused before the transaction opens, writing nothing', async () => {
    // Named for what it actually proves (review #87, PTA87-I1). The sha256 corruption below is
    // rejected by `assertEra5LoadIsSafe`'s FIRST check, so no write is ever attempted — this is
    // the "every gate resolves before the transaction opens" half of the all-or-nothing claim.
    // The other half — that the transaction really does roll back a partial run — is a separate
    // property and is proved by the next test, because the two can regress independently.
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

  it('ROLLS BACK a genuine mid-transaction failure: 80 writes undone by the 81st', async () => {
    // The half the pre-flight test cannot reach, and the one the retired MGM loader got wrong
    // once: it detected coverage INSIDE the transaction loop, so 80 provinces committed — and
    // bumped their updated_at — before the run reported failure (this suite's own docblock and
    // `era5-load.ts`'s both cite it). Nothing in the suite could previously tell "all 81 writes
    // are in ONE transaction" apart from "81 independent transactions", so a refactor to per-row
    // transactions, or a write accidentally moved outside the block, would have passed everything.
    //
    // The failure is injected in Postgres itself rather than through a seam in production code: a
    // BEFORE UPDATE trigger raises on the LAST province in artifact order, so the loop genuinely
    // saves the preceding 80 rows first and only then hits a real database error. That also keeps
    // the test honest about what it exercises — TypeORM's transaction wrapper against a real
    // server, not a mock that agrees with us.
    const repo = dataSource.getRepository(Province);
    const seriesOrder = (
      JSON.parse(await readFile(join(ARTIFACT_DIR, ERA5_SERIES_FILE_NAME), 'utf8')) as {
        provinces: { plateCode: string }[];
      }
    ).provinces.map((province) => province.plateCode);
    const lastPlate = seriesOrder[seriesOrder.length - 1];
    if (lastPlate === undefined) throw new Error('fixture: empty series');

    // Make every province genuinely dirty, so the idempotency skip cannot quietly turn this into
    // a zero-write run — the loop must actually reach `repo.save` for the first 80.
    for (const province of await repo.find()) {
      const normals = province.climateNormals;
      if (normals === null) throw new Error(`fixture: ${province.plateCode} has no series`);
      await repo.update(
        { plateCode: province.plateCode },
        {
          climateNormals: {
            ...normals,
            months: normals.months.map((month, index) =>
              index === 0 ? { ...month, tempMeanC: month.tempMeanC + 7 } : month,
            ),
          },
        },
      );
    }
    const tampered = new Map(
      (await repo.find()).map((province) => [
        province.plateCode,
        JSON.stringify(province.climateNormals),
      ]),
    );

    await dataSource.query(
      `CREATE FUNCTION e2e_block_last_province() RETURNS trigger AS $$
       BEGIN RAISE EXCEPTION 'e2e injected failure on plate %', OLD.plate_code; END;
       $$ LANGUAGE plpgsql`,
    );
    // Single-quoted rather than dollar-quoted: `$$…$$` in a statement `pg` also scans for `$n`
    // placeholders is needless ambiguity. The value is a 2-char plate code read from our own
    // committed artifact, not input.
    await dataSource.query(
      `CREATE TRIGGER e2e_block_last_province BEFORE UPDATE ON provinces
       FOR EACH ROW WHEN (OLD.plate_code = '${lastPlate}')
       EXECUTE FUNCTION e2e_block_last_province()`,
    );

    try {
      await expect(loadEra5ClimateNormals(dataSource, { inputDir: ARTIFACT_DIR })).rejects.toThrow(
        /e2e injected failure/,
      );

      // THE assertion: every one of the 80 rows the loop had already saved is back to its
      // tampered value. A single row holding the artifact value would mean that write survived
      // its transaction — i.e. the writes are not atomic together.
      const after = await repo.find();
      expect(after).toHaveLength(81);
      for (const province of after) {
        expect(JSON.stringify(province.climateNormals)).toBe(tampered.get(province.plateCode));
      }
    } finally {
      await dataSource.query('DROP TRIGGER IF EXISTS e2e_block_last_province ON provinces');
      await dataSource.query('DROP FUNCTION IF EXISTS e2e_block_last_province()');
    }

    // With the injected fault gone, the same call restores all 81 — proving the rollback left the
    // table in a state the loader can still work from, not a wedged one.
    const restored = await loadEra5ClimateNormals(dataSource, { inputDir: ARTIFACT_DIR });
    expect(restored).toEqual({ updated: 81, unchanged: 0 });
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
