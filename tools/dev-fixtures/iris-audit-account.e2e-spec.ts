import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../../src/database/data-source-options';
import { pickDistrict, upsertFixtureUser } from './iris-audit-account-runner.ts';

const SYNTHETIC_HASH_1 = '$argon2id$synthetic-e2e-shape-only-1';
const SYNTHETIC_HASH_2 = '$argon2id$synthetic-e2e-shape-only-2';

/**
 * `tools/dev-fixtures/iris-audit-account.e2e-spec.ts` (TA143-M2) — the DB-touching half of
 * `iris-audit-account.ts` (`pickDistrict`'s preferred/fallback branching, `upsertFixtureUser`'s
 * `ON CONFLICT … RETURNING (xmax = 0)` idempotent upsert) against a real Postgres, mirroring
 * `test/auth-schema.e2e-spec.ts`'s Testcontainers shape. This is `.e2e-spec.ts` rather than
 * `.spec.ts` because it needs a real database (`ENGINEERING.md` §8: "the e2e job is for code
 * that genuinely needs Postgres"), even though the module under test lives in `tools/`, not
 * `test/`. Co-located next to the tool it tests, exactly like `credential-fixture.spec.ts` and
 * `local-database-guard.spec.ts` are.
 *
 * **Why this file needs its own ts-jest project (`test/jest-e2e.json`'s `tools/` transform
 * entry).** `iris-audit-account-runner.ts` imports its siblings with an explicit `.ts` extension
 * (Node's native TypeScript type-stripping requires it — the `tools/` convention
 * `ENGINEERING.md` §8 documents). That needs `allowImportingTsExtensions`, which TypeScript
 * only permits alongside `noEmit`/`emitDeclarationOnly` — a real conflict with the default e2e
 * ts-jest project, which must actually emit. `tools/tsconfig.json`'s own header names the exact
 * same tension for `pnpm typecheck`, and `tsconfig.unit-spec.json` already resolves it for the
 * unit suite via `isolatedModules` (transpile-only, no whole-program diagnostics). Routing any
 * `tools/*.ts` file through that same tsconfig from the e2e project — regardless of which spec
 * imports it — reuses that existing resolution rather than inventing a second one.
 */
describe('iris-audit-account (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let client: Client;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource(buildDataSourceOptions(container.getConnectionUri()));
    await dataSource.initialize();
    await dataSource.runMigrations();

    client = new Client({ connectionString: container.getConnectionUri() });
    await client.connect();
  }, 300_000);

  afterEach(async () => {
    await dataSource.query(`DELETE FROM users`);
    await dataSource.query(`DELETE FROM districts`);
    await dataSource.query(`DELETE FROM provinces`);
  });

  afterAll(async () => {
    await client?.end();
    if (dataSource?.isInitialized) await dataSource.destroy();
    await container?.stop();
  });

  async function insertProvinceAndDistrict(args: {
    plateCode: string;
    provinceNameTr: string;
    districtNameTr: string;
  }): Promise<{ provinceId: string; districtId: string }> {
    const provinces = await dataSource.query<{ id: string }[]>(
      `INSERT INTO provinces (plate_code, name_tr, slug_tr, slug_en, region)
       VALUES ($1, $2, $3, $3, 'MARMARA') RETURNING id`,
      [args.plateCode, args.provinceNameTr, `synthetic-${args.plateCode}`],
    );
    const province = provinces[0];
    if (!province) throw new Error('synthetic province insert returned no row');

    const districts = await dataSource.query<{ id: string }[]>(
      `INSERT INTO districts (province_id, name_tr) VALUES ($1, $2) RETURNING id`,
      [province.id, args.districtNameTr],
    );
    const district = districts[0];
    if (!district) throw new Error('synthetic district insert returned no row');

    return { provinceId: province.id, districtId: district.id };
  }

  describe('pickDistrict', () => {
    it('refuses loudly when districts is empty rather than picking nothing', async () => {
      await expect(pickDistrict(client)).rejects.toThrow(/districts is empty/);
    });

    it('falls back to the first district by id when Ankara/Çankaya is absent', async () => {
      const { districtId } = await insertProvinceAndDistrict({
        plateCode: '34',
        provinceNameTr: 'Synthetic Istanbul',
        districtNameTr: 'Kadıköy',
      });

      const picked = await pickDistrict(client);
      expect(picked).toEqual({
        id: districtId,
        districtNameTr: 'Kadıköy',
        provinceNameTr: 'Synthetic Istanbul',
      });
    });

    it('prefers Ankara/Çankaya (plate 06) even when another district was inserted first', async () => {
      await insertProvinceAndDistrict({
        plateCode: '34',
        provinceNameTr: 'Synthetic Istanbul',
        districtNameTr: 'Kadıköy',
      });
      const { districtId } = await insertProvinceAndDistrict({
        plateCode: '06',
        provinceNameTr: 'Ankara',
        districtNameTr: 'Çankaya',
      });

      const picked = await pickDistrict(client);
      expect(picked).toEqual({
        id: districtId,
        districtNameTr: 'Çankaya',
        provinceNameTr: 'Ankara',
      });
    });
  });

  describe('upsertFixtureUser', () => {
    it('INSERTs on the first call (inserted=true, tokenVersion=0) and UPSERTs (updates) on the second — the self-declared "hard requirement" #4', async () => {
      const { districtId: district1 } = await insertProvinceAndDistrict({
        plateCode: '06',
        provinceNameTr: 'Ankara',
        districtNameTr: 'Çankaya',
      });
      const { districtId: district2 } = await insertProvinceAndDistrict({
        plateCode: '34',
        provinceNameTr: 'Synthetic Istanbul',
        districtNameTr: 'Kadıköy',
      });

      const first = await upsertFixtureUser(client, {
        passwordHash: SYNTHETIC_HASH_1,
        districtId: district1,
      });
      expect(first.inserted).toBe(true);
      expect(first.tokenVersion).toBe(0);

      const firstRow = (
        await dataSource.query<
          {
            status: string;
            email_verified_at: Date | null;
            district_id: string;
            password_hash: string;
          }[]
        >(`SELECT status, email_verified_at, district_id, password_hash FROM users WHERE id = $1`, [
          first.id,
        ])
      )[0];
      expect(firstRow?.status).toBe('ACTIVE');
      expect(firstRow?.email_verified_at).not.toBeNull();
      expect(firstRow?.district_id).toBe(district1);
      expect(firstRow?.password_hash).toBe(SYNTHETIC_HASH_1);

      // Second run: same fixture email (upsertFixtureUser always targets it), a fresh hash and a
      // DIFFERENT district — proves the row is UPDATED in place, not duplicated, and every
      // EXCLUDED column (including district_id) actually lands.
      const second = await upsertFixtureUser(client, {
        passwordHash: SYNTHETIC_HASH_2,
        districtId: district2,
      });
      expect(second.inserted).toBe(false);
      // The row's id is stable across resets (so any video_progress under it survives).
      expect(second.id).toBe(first.id);
      // token_version is bumped on every reset, invalidating any previously-issued access token.
      expect(second.tokenVersion).toBe(first.tokenVersion + 1);

      const countRows = await dataSource.query<{ count: string }[]>(
        `SELECT count(*)::text AS count FROM users`,
      );
      expect(countRows[0]?.count).toBe('1');

      const secondRow = (
        await dataSource.query<
          {
            status: string;
            district_id: string;
            password_hash: string;
            token_version: number;
          }[]
        >(`SELECT status, district_id, password_hash, token_version FROM users WHERE id = $1`, [
          second.id,
        ])
      )[0];
      expect(secondRow?.status).toBe('ACTIVE');
      expect(secondRow?.district_id).toBe(district2);
      expect(secondRow?.password_hash).toBe(SYNTHETIC_HASH_2);
      expect(secondRow?.token_version).toBe(1);
    });
  });
});
