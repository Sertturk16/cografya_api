import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { seedGeography } from '../src/database/seeds/seed-geography';
import { SEED_PROVINCES } from '../src/database/seeds/province.seed-data';
import { Province } from '../src/province/entities/province.entity';
import { CLIMATE_MONTH_COUNT, CLIMATE_SOURCE_MGM_GENERAL } from '../src/province/province.types';
import type {
  ClimateManifestArtifact,
  ClimateNormalsArtifact,
} from '../src/database/climate/climate-artifact.types';
import { loadClimateNormals } from '../src/database/climate/load-climate';
import { buildMgmUrl } from '../src/database/climate/mgm-fetch';
import { parseMgmGeneralStatisticsPage } from '../src/database/climate/mgm-parser';

/**
 * Real-Postgres e2e for the climate LOAD phase.
 *
 * ## Why this suite must use a real database (it is the test's design condition)
 * The defect it exists to pin is that Postgres `jsonb` does not preserve object key order: it
 * re-serializes keys by (length, then lexical). The load phase decides "did this province's
 * series change?" in order to leave `updated_at` — and therefore the page's `dateModified` and
 * the sitemap's `lastmod` — untouched on a no-op. That comparison used to be plain
 * `JSON.stringify` equality between the artifact (declaration order) and the stored document
 * (Postgres order), so after the first load EVERY re-run reported all 81 provinces as updated
 * while nothing had changed, silently, with exit code 0.
 *
 * **An in-memory test cannot see this.** Comparing two JavaScript objects never reorders
 * anything, so a unit test would pass against the broken code. The reordering only exists on
 * the way back out of Postgres — which is why this suite writes, reads back through TypeORM,
 * and re-runs.
 *
 * Per CONVENTIONS §2 everything here is STRUCTURAL: the artifacts are built by running the
 * real parser over the committed fixtures, and nothing asserts a per-province fact.
 */

const FIXTURE_DIR = join(__dirname, 'fixtures', 'mgm');
const FIXTURES = [
  { file: 'k-a-icel.tables.html', mgmKey: 'ICEL' },
  { file: 'k-a-ardahan.tables.html', mgmKey: 'ARDAHAN' },
] as const;

/**
 * Build a COMPLETE, internally consistent pair of artifacts covering every seeded province.
 *
 * Complete because the load phase now refuses a partial artifact (a province absent from it
 * would keep a NULL series forever with nothing reporting it). The two committed fixtures are
 * alternated across the provinces so the set is not uniform — a shared-state regression in the
 * per-province loop would show up as the wrong series on the wrong province rather than
 * passing everywhere identically.
 */
function buildArtifacts(generatedAtUtc: string): {
  normals: ClimateNormalsArtifact;
  manifest: ClimateManifestArtifact;
} {
  const parsedFixtures = FIXTURES.map((fixture) => ({
    mgmKey: fixture.mgmKey,
    html: readFileSync(join(FIXTURE_DIR, fixture.file), 'utf8'),
  }));

  const normals: ClimateNormalsArtifact = {
    generatedAtUtc,
    source: CLIMATE_SOURCE_MGM_GENERAL,
    entries: [],
  };
  const manifest: ClimateManifestArtifact = {
    generatedAtUtc,
    source: CLIMATE_SOURCE_MGM_GENERAL,
    userAgent: 'CografyaPlatformBot/1.0 (e2e fixture)',
    anomalies: [],
    entries: [],
  };

  SEED_PROVINCES.forEach((province, index) => {
    const fixture = parsedFixtures[index % parsedFixtures.length];
    if (fixture === undefined) throw new Error('fixture list is empty');

    // The parser cross-checks `mgmKey` against the table's own header cell, so the key stays
    // the fixture's; only the URL is made per-province, which is what the artifacts pair on.
    const url = buildMgmUrl(fixture.mgmKey);
    const parsed = parseMgmGeneralStatisticsPage(fixture.html, {
      mgmKey: fixture.mgmKey,
      sourceUrl: url,
    });

    normals.entries.push({ plateCode: province.plateCode, normals: parsed.normals });
    manifest.entries.push({
      plateCode: province.plateCode,
      mgmKey: fixture.mgmKey,
      mgmNameTr: province.nameTr,
      url,
      fetchedAtUtc: generatedAtUtc,
      httpStatus: 200,
      pageSha256: '0'.repeat(64),
      periodStartYear: parsed.normals.periodStartYear,
      periodEndYear: parsed.normals.periodEndYear,
      rawMetricRows: parsed.raw.metricRows,
      rawRecordCells: parsed.raw.recordCells,
    });
  });

  return { normals, manifest };
}

async function writeArtifacts(
  dir: string,
  artifacts: { normals: ClimateNormalsArtifact; manifest: ClimateManifestArtifact },
): Promise<void> {
  await writeFile(join(dir, 'climate-normals.json'), JSON.stringify(artifacts.normals), 'utf8');
  await writeFile(join(dir, 'climate-manifest.json'), JSON.stringify(artifacts.manifest), 'utf8');
}

describe('Climate load phase (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let inputDir: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource(buildDataSourceOptions(container.getConnectionUri()));
    await dataSource.initialize();
    await dataSource.runMigrations();
    await seedGeography(dataSource);
    inputDir = await mkdtemp(join(tmpdir(), 'climate-load-'));
  }, 180_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (container) await container.stop();
  });

  it('first load writes every province, and the stored document survives the round-trip', async () => {
    await writeArtifacts(inputDir, buildArtifacts('2026-07-18T00:00:00.000Z'));

    const result = await loadClimateNormals(dataSource, { inputDir });
    expect(result).toEqual({ updated: SEED_PROVINCES.length, unchanged: 0 });

    const artifact = JSON.parse(
      await readFile(join(inputDir, 'climate-normals.json'), 'utf8'),
    ) as ClimateNormalsArtifact;
    const expected = artifact.entries[0];
    if (expected === undefined) throw new Error('artifact has no entries');

    const stored = await dataSource
      .getRepository(Province)
      .findOneOrFail({ where: { plateCode: expected.plateCode } });
    // Deep equality: the CONTENT must survive intact, independently of key order.
    expect(stored.climateNormals).toEqual(expected.normals);
  });

  it('Postgres really does reorder the jsonb keys — the premise of the next test', async () => {
    // Not a tautology and not decoration: it proves the regression test below is exercising
    // the actual failure mode rather than passing for an unrelated reason. If a future
    // Postgres preserved insertion order, this assertion would fail LOUDLY and tell the next
    // engineer why the guard can be simplified — instead of the guard quietly becoming
    // untested.
    const row: { climate_normals: unknown }[] = await dataSource.query(
      'SELECT climate_normals FROM provinces WHERE climate_normals IS NOT NULL LIMIT 1',
    );
    const storedDocument = row[0]?.climate_normals;
    expect(storedDocument).toBeDefined();

    const storedKeys = Object.keys(storedDocument as Record<string, unknown>);
    const artifact = JSON.parse(
      await readFile(join(inputDir, 'climate-normals.json'), 'utf8'),
    ) as ClimateNormalsArtifact;
    const artifactKeys = Object.keys(artifact.entries[0]?.normals ?? {});

    expect(storedKeys.slice().sort()).toEqual(artifactKeys.slice().sort()); // same key SET
    expect(storedKeys).not.toEqual(artifactKeys); // different key ORDER
  });

  it('REGRESSION (C1): re-loading the identical artifact writes nothing and moves no updated_at', async () => {
    const repo = dataSource.getRepository(Province);
    const before = await repo.find({ select: { plateCode: true, updatedAt: true } });

    const result = await loadClimateNormals(dataSource, { inputDir });

    // The defect reported all 81 as `updated` here, because the stored document came back
    // with its keys sorted and the naive string comparison saw two different strings.
    expect(result).toEqual({ updated: 0, unchanged: SEED_PROVINCES.length });

    const after = await repo.find({ select: { plateCode: true, updatedAt: true } });
    expect(after.map((province) => province.updatedAt.toISOString())).toEqual(
      before.map((province) => province.updatedAt.toISOString()),
    );
  });

  it('a genuinely changed value IS written — the no-op guard has not become a no-write guard', async () => {
    const artifacts = buildArtifacts('2026-07-18T01:00:00.000Z');
    const target = artifacts.normals.entries[0];
    const targetManifest = artifacts.manifest.entries[0];
    const month = target?.normals.months[0];
    if (target === undefined || targetManifest === undefined || month === undefined) {
      throw new Error('artifact fixture is malformed');
    }

    // `rainyDays` is mutated in BOTH artifacts so the decimal round-trip stays satisfied — the
    // point of this test is the change-detection path, not the validation path. The field is
    // chosen because it carries no ordering invariant against its neighbours.
    month.rainyDays = 7;
    const rawRow = targetManifest.rawMetricRows.find(
      (row) => row.label === 'Ortalama Yağışlı Gün Sayısı',
    );
    if (rawRow === undefined) throw new Error('expected a rainy-days raw row');
    rawRow.rawMonthlyCells[0] = '7';

    await writeArtifacts(inputDir, artifacts);
    const result = await loadClimateNormals(dataSource, { inputDir });
    expect(result).toEqual({ updated: 1, unchanged: SEED_PROVINCES.length - 1 });

    const stored = await dataSource
      .getRepository(Province)
      .findOneOrFail({ where: { plateCode: target.plateCode } });
    expect(stored.climateNormals?.months[0]?.rainyDays).toBe(7);
  });

  it('an artifact naming an unknown province aborts BEFORE writing anything', async () => {
    const repo = dataSource.getRepository(Province);
    const before = await repo.find({ select: { plateCode: true, updatedAt: true } });

    const artifacts = buildArtifacts('2026-07-18T02:00:00.000Z');
    const donor = artifacts.normals.entries[0];
    const donorManifest = artifacts.manifest.entries[0];
    if (donor === undefined || donorManifest === undefined) throw new Error('malformed fixture');
    // '99' is not a Turkish plate code — the artifact covers a province the database has not.
    artifacts.normals.entries.push({ plateCode: '99', normals: donor.normals });
    artifacts.manifest.entries.push({ ...donorManifest, plateCode: '99' });
    await writeArtifacts(inputDir, artifacts);

    await expect(loadClimateNormals(dataSource, { inputDir })).rejects.toThrow(
      /not in the database/,
    );

    // The whole point of moving this check ahead of the transaction: a failed load must not
    // leave 80 provinces written. Previously the throw fired after the commit.
    const after = await repo.find({ select: { plateCode: true, updatedAt: true } });
    expect(after.map((province) => province.updatedAt.toISOString())).toEqual(
      before.map((province) => province.updatedAt.toISOString()),
    );
  });

  it('an artifact that omits a seeded province is refused, not silently partially applied', async () => {
    const artifacts = buildArtifacts('2026-07-18T03:00:00.000Z');
    const dropped = artifacts.normals.entries.pop();
    if (dropped === undefined) throw new Error('malformed fixture');
    artifacts.manifest.entries = artifacts.manifest.entries.filter(
      (entry) => entry.plateCode !== dropped.plateCode,
    );
    await writeArtifacts(inputDir, artifacts);

    // The load-side backstop for a fetch run that dropped a province: without it that
    // province keeps `climate_normals = NULL` forever with no error at any layer.
    await expect(loadClimateNormals(dataSource, { inputDir })).rejects.toThrow(
      new RegExp(`missing ${dropped.plateCode}`),
    );
  });

  it('a DECLARED-unpublishable province is accepted, and its stored series is CLEARED', async () => {
    // The load half of I1's ruling. An undeclared gap is still refused (the test above); a
    // declared one is a recorded decision and must be honoured — including actively clearing the
    // series, not merely skipping it. Skipping would leave last year's chart on the page while
    // this year's manifest says we refused to publish one, i.e. the database quietly disagreeing
    // with the artifact.
    await writeArtifacts(inputDir, buildArtifacts('2026-07-18T04:00:00.000Z'));
    await loadClimateNormals(dataSource, { inputDir });

    const artifacts = buildArtifacts('2026-07-18T05:00:00.000Z');
    const withheld = artifacts.normals.entries.pop();
    if (withheld === undefined) throw new Error('malformed fixture');
    artifacts.manifest.unpublishable = [
      { plateCode: withheld.plateCode, reason: 'core pair incomplete: precipitationMm[1]' },
    ];
    await writeArtifacts(inputDir, artifacts);

    const result = await loadClimateNormals(dataSource, { inputDir });
    expect(result.updated + result.unchanged).toBe(SEED_PROVINCES.length);

    const stored = await dataSource
      .getRepository(Province)
      .findOneOrFail({ where: { plateCode: withheld.plateCode } });
    expect(stored.climateNormals).toBeNull();
  });

  it('clearing an unpublishable province is idempotent — a re-run moves no updated_at', async () => {
    // Same publishing-honesty rule the whole load phase is built on: `updated_at` feeds
    // `dateModified` and the sitemap `lastmod`, so a no-op re-run must not tell Google a page
    // changed. The clear path is a write, so it needed its own proof.
    const artifacts = buildArtifacts('2026-07-18T06:00:00.000Z');
    const withheld = artifacts.normals.entries.pop();
    if (withheld === undefined) throw new Error('malformed fixture');
    artifacts.manifest.unpublishable = [
      { plateCode: withheld.plateCode, reason: 'core pair incomplete: precipitationMm[1]' },
    ];
    await writeArtifacts(inputDir, artifacts);
    await loadClimateNormals(dataSource, { inputDir });

    const repo = dataSource.getRepository(Province);
    const before = await repo.findOneOrFail({ where: { plateCode: withheld.plateCode } });

    const result = await loadClimateNormals(dataSource, { inputDir });

    expect(result.updated).toBe(0);
    const after = await repo.findOneOrFail({ where: { plateCode: withheld.plateCode } });
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
  });

  /**
   * The artifacts every test above uses are BUILT — real parser output, but assembled in the
   * test. This one loads the actual committed `data/climate/` files, which is the thing that
   * will really be deployed. It is the only test that can catch an artifact which is valid in
   * the abstract but wrong on disk (a hand-edit, a bad merge, a partial regeneration).
   *
   * Structural only, per CONVENTIONS §2: it asserts coverage and invariants, never that any
   * province has a particular temperature.
   */
  it('the COMMITTED artifact loads cleanly and covers every seeded province', async () => {
    const committedDir = join(__dirname, '..', 'data', 'climate');

    const result = await loadClimateNormals(dataSource, { inputDir: committedDir });
    expect(result.updated + result.unchanged).toBe(SEED_PROVINCES.length);

    const stored = await dataSource.getRepository(Province).find({
      select: { plateCode: true, climateNormals: true },
    });
    expect(stored).toHaveLength(SEED_PROVINCES.length);

    for (const province of stored) {
      const normals = province.climateNormals;
      expect(normals).not.toBeNull();
      if (normals === null) continue;

      expect(normals.months).toHaveLength(CLIMATE_MONTH_COUNT);
      expect(normals.periodStartYear).toBeLessThan(normals.periodEndYear);
      // PLAN §1's all-or-nothing rule, checked on what actually reached the database.
      for (const month of normals.months) {
        expect(typeof month.tempMeanC).toBe('number');
        expect(typeof month.precipitationMm).toBe('number');
      }
      // No published magnitude may be negative — the anomaly sweep runs before this point.
      for (const record of Object.values(normals.records)) {
        if (record !== null) expect(record.value).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('re-loading the COMMITTED artifact is a no-op — it is genuinely idempotent', async () => {
    const committedDir = join(__dirname, '..', 'data', 'climate');
    await loadClimateNormals(dataSource, { inputDir: committedDir });

    const result = await loadClimateNormals(dataSource, { inputDir: committedDir });

    expect(result.updated).toBe(0);
    expect(result.unchanged).toBe(SEED_PROVINCES.length);
  });
});
