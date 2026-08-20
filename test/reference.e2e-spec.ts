import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource, QueryFailedError } from 'typeorm';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { INTERNAL_REQUEST_HEADER } from '../src/common/throttler/trusted-client';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import {
  readDistrictsArtifact,
  type DistrictsArtifact,
} from '../src/database/seeds/district.artifact';
import { seedGeography } from '../src/database/seeds/seed-geography';
import { seedReference, type SeedReferenceResult } from '../src/database/seeds/seed-reference';
import { Province } from '../src/province/entities/province.entity';
import { District } from '../src/reference/entities/district.entity';

/**
 * PR-1 e2e — the ilçe table, its seed and `GET /api/reference/districts`, against a REAL Postgres.
 *
 * ## Structural only (`CONVENTIONS.md` §2)
 * Nothing here asserts an ilçe fact. Not a name, not a count typed into this file. Every expected
 * number is read from the artefact or from `provinces.district_count` in the same run, because a
 * test that hardcoded `973` would have to be edited by the PR that lands a newly created ilçe —
 * which is precisely how a fidelity test turns into a rubber stamp. The fact-check record is
 * `Owner's Inbox/oturum-lite/ilce-listesi.md` and the `provenance/datasets.md` row.
 *
 * ## Phase order is state, and the destructive phases come last
 * One container, one migration run, one geography seed. The read phase runs against the fully
 * seeded table; the gate phase then deliberately breaks things and restores the table before it
 * finishes, so nothing it does can silently change what the read phase proved.
 */

/**
 * The caching contract, pinned verbatim rather than imported (the `book-read.e2e-spec.ts`
 * precedent): a change to how long a CDN may hold this list must fail a test, not slip through
 * because both sides read the same constant.
 */
const DISTRICT_CACHE_CONTROL =
  'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';

/** Turkish alphabetical order — the property the served order must have, not a list to compare to. */
const TURKISH_COLLATOR = new Intl.Collator('tr');

/**
 * 44-char dummy secret used ONLY to exercise the REAL trusted-client throttle exemption (the
 * `province.e2e-spec.ts` precedent). Not a production secret — no deployed value derives from it.
 *
 * This suite NEEDS it rather than merely preferring it: the ordering test asks every one of the 81
 * provinces for its list in one loop, which is most of the global 120 req/min window on its own.
 * Presenting the token exercises the production allow path (config read + safe-method scope +
 * constant-time compare + skip) instead of stubbing the limiter, and no test here asserts 429.
 */
const TEST_INTERNAL_TOKEN = 'e2e-trusted-client-token-0123456789-abcdefgh';

/**
 * The name every schema probe inserts and every probe cleanup deletes.
 *
 * A single constant so the cleanup cannot miss a row a probe wrote: a stray probe row would be
 * invisible to the seed's own gates (it changes a count they compare) and would turn a later test
 * red for a reason that has nothing to do with the code. It is not a Turkish ilçe and never will
 * be, so it cannot collide with real data.
 */
const PROBE_NAME = 'Denemekoy Probe';

interface ServedDistrict {
  id: string;
  nameTr: string;
}

describe('Reference — districts (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;

  let artifact: DistrictsArtifact;
  let firstSeed: SeedReferenceResult;
  let reSeed: SeedReferenceResult;
  let updatedAtAfterFirstSeed: string[];
  let updatedAtAfterReSeed: string[];
  let provinces: Province[];

  const provinceByPlate = (plateCode: string): Province => {
    const province = provinces.find((candidate) => candidate.plateCode === plateCode);
    if (!province) throw new Error(`no province row for plate ${plateCode}`);
    return province;
  };

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();

    process.env.DATABASE_URL = url;
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    process.env.INTERNAL_REQUEST_TOKEN = TEST_INTERNAL_TOKEN;

    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    await dataSource.runMigrations();

    // Districts hang off provinces, so the geography seed is a precondition rather than a
    // convenience — the reference seed's first gate refuses a run with no province rows.
    await seedGeography(dataSource);

    artifact = await readDistrictsArtifact();

    // Phase 1 — empty table: every row inserts.
    firstSeed = await seedReference(dataSource);
    updatedAtAfterFirstSeed = await readUpdatedAt();
    // Phase 2 — a routine re-run: pure no-op, and no `updated_at` may move.
    reSeed = await seedReference(dataSource);
    updatedAtAfterReSeed = await readUpdatedAt();

    provinces = await dataSource.getRepository(Province).find();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appModule = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [appModule.AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyGlobalPrefix(app);
    // `main.ts` is not run in tests, so the global pipe is applied here with the SAME options —
    // every 400 asserted below is that pipe doing its job, not a hand-written check.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    // Every request presents the internal token exactly as the web SSG build will, so the
    // PRODUCTION guard path is what this suite covers — not a fake ThrottlerStorage.
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.headers[INTERNAL_REQUEST_HEADER] = TEST_INTERNAL_TOKEN;
      next();
    });
    await app.init();
  }, 300_000);

  afterAll(async () => {
    await app?.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    await container?.stop();
  });

  async function readUpdatedAt(): Promise<string[]> {
    const rows = await dataSource.getRepository(District).find({ order: { id: 'ASC' } });
    return rows.map((row) => row.updatedAt.toISOString());
  }

  async function countDistricts(): Promise<number> {
    return dataSource.getRepository(District).count();
  }

  /** A deep copy of the committed artefact, safe to break. */
  function mutableArtifact(): {
    provinces: { plateCode: string; provinceNameTr: string; districtNamesTr: string[] }[];
    districtCount: number;
  } {
    return {
      provinces: artifact.provinces.map((province) => ({
        plateCode: province.plateCode,
        provinceNameTr: province.provinceNameTr,
        districtNamesTr: [...province.districtNamesTr],
      })),
      districtCount: artifact.districtCount,
    };
  }

  describe('the seed', () => {
    it('inserts every ilçe the artefact declares, across every province', async () => {
      expect(firstSeed.inserted).toBe(artifact.districtCount);
      expect(firstSeed.unchanged).toBe(0);
      expect(firstSeed.removed).toBe(0);
      expect(firstSeed.provinces).toBe(artifact.provinces.length);
      await expect(countDistricts()).resolves.toBe(artifact.districtCount);
    });

    it('is a pure no-op on a re-run, and moves no updated_at', () => {
      expect(reSeed.inserted).toBe(0);
      expect(reSeed.removed).toBe(0);
      expect(reSeed.unchanged).toBe(artifact.districtCount);
      // Not "roughly the same": every timestamp, unchanged. A seed that rewrote identical values
      // would report `unchanged` and still churn this column.
      expect(updatedAtAfterReSeed).toEqual(updatedAtAfterFirstSeed);
      expect(updatedAtAfterFirstSeed).toHaveLength(artifact.districtCount);
    });

    it('writes each province exactly its published district_count rows', async () => {
      // The gate's own claim, verified from outside it: the two numbers the site can state about
      // one il must be one number.
      const rows: { province_id: string; count: string }[] = await dataSource
        .createQueryBuilder(District, 'district')
        .select('district.province_id', 'province_id')
        .addSelect('COUNT(*)', 'count')
        .groupBy('district.province_id')
        .getRawMany();

      expect(rows).toHaveLength(provinces.length);
      const byId = new Map(rows.map((row) => [row.province_id, Number(row.count)]));
      for (const province of provinces) {
        expect(byId.get(province.id)).toBe(province.districtCount);
      }
    });
  });

  describe('GET /api/reference/districts', () => {
    it("returns one province's ilçe as a plain array, with the long cache window", async () => {
      const istanbul = provinceByPlate('34');
      const response = await request(app.getHttpServer())
        .get('/api/reference/districts')
        .query({ plateCode: istanbul.plateCode })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      const body = response.body as ServedDistrict[];
      // No envelope: the bounded-set rule. Asserted as "the body IS the array", not by counting
      // keys on an object that would not exist if this regressed.
      expect(body).toHaveLength(istanbul.districtCount ?? -1);
      expect(response.headers['cache-control']).toBe(DISTRICT_CACHE_CONTROL);
    });

    it('serves exactly id and nameTr — no foreign key, no timestamps', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/reference/districts')
        .query({ plateCode: '01' })
        .expect(200);

      for (const district of response.body as ServedDistrict[]) {
        expect(Object.keys(district).sort()).toEqual(['id', 'nameTr']);
      }
    });

    it('serves every province in Turkish alphabetical order, and really re-orders', async () => {
      // ONE loop over all 81 provinces rather than two, because the global rate limit is a real
      // constraint on this suite even with the trusted-client exemption in place.
      //
      // Two claims, and the second is the first's positive control:
      //   1. the RULE — no name may sort before its predecessor under Turkish collation, asserted
      //      over the whole corpus rather than against one retyped list;
      //   2. that the service actually sorted. Claim 1 would pass just as happily if the rows came
      //      back untouched and the database happened to agree, so at least one province must come
      //      back in a DIFFERENT order than `ORDER BY name_tr` produced. Turkish collation
      //      disagrees with the database's order wherever a name starts with ç/ğ/ı/ö/ş/ü.
      let reordered = 0;

      for (const province of provinces) {
        const stored = await dataSource.getRepository(District).find({
          where: { provinceId: province.id },
          order: { nameTr: 'ASC' },
        });
        const response = await request(app.getHttpServer())
          .get('/api/reference/districts')
          .query({ plateCode: province.plateCode })
          .expect(200);

        const servedNames = (response.body as ServedDistrict[]).map((district) => district.nameTr);
        const storedNames = stored.map((row) => row.nameTr);

        for (let index = 1; index < servedNames.length; index += 1) {
          const previous = servedNames[index - 1] ?? '';
          const current = servedNames[index] ?? '';
          expect(TURKISH_COLLATOR.compare(previous, current)).toBeLessThanOrEqual(0);
        }

        // Whatever the order, it is the same SET — sorting must never drop or duplicate a row.
        expect([...servedNames].sort()).toEqual([...storedNames].sort());
        if (servedNames.join('|') !== storedNames.join('|')) reordered += 1;
      }

      expect(reordered).toBeGreaterThan(0);
    });

    it('needs no credentials — it is public content by design', async () => {
      // The "unauthenticated path" half of playbook §8's authz rule. There is no role-forbidden
      // path to assert because this route carries no guard at all, which is the deliberate posture
      // recorded at the controller: the registration form reads this list BEFORE anybody has an
      // account.
      await request(app.getHttpServer())
        .get('/api/reference/districts')
        .query({ plateCode: '06' })
        .expect(200);
    });

    it('answers 400 when plateCode is missing', async () => {
      await request(app.getHttpServer()).get('/api/reference/districts').expect(400);
    });

    it('answers 400 when plateCode is not exactly two zero-padded digits', async () => {
      // `6` is not a lenient spelling of `06`: `provinces.plate_code` is a two-character string so
      // that its lexical ordering stays correct, which makes an unpadded code a different key.
      for (const malformed of ['6', '345', 'ab', '3 4', '']) {
        await request(app.getHttpServer())
          .get('/api/reference/districts')
          .query({ plateCode: malformed })
          .expect(400);
      }
    });

    it('answers 400 to the RETIRED provinceId parameter instead of ignoring it', async () => {
      // Half of `DEC 2026-08-21c` is that the old call shape must not be silently accepted. Without
      // a query DTO an unknown parameter is dropped and the request degrades to "no filter at all";
      // with one, `forbidNonWhitelisted` refuses it by name. Asserted with a real province uuid so
      // the rejection cannot be blamed on the value being nonsense — it is the PARAMETER that is
      // gone.
      const istanbul = provinceByPlate('34');
      const response = await request(app.getHttpServer())
        .get('/api/reference/districts')
        .query({ provinceId: istanbul.id })
        .expect(400);

      const body = response.body as { message: string[] };
      expect(body.message).toEqual(expect.arrayContaining([expect.stringContaining('provinceId')]));
    });

    it('answers 400 on an unknown query parameter rather than ignoring it', async () => {
      await request(app.getHttpServer())
        .get('/api/reference/districts')
        .query({ plateCode: '34', utm_source: 'x' })
        .expect(400);
    });

    it('answers 200 with an empty array for a well-formed plate code that names no province', async () => {
      // A query parameter is a FILTER, not a resource id: "no ilçe matched" is a legitimate answer,
      // and 404 would claim the route does not exist. `99` is well-formed and Türkiye has 81
      // provinces — deliberately NOT pinned to 01–81 in the pattern, because a contract tighter
      // than the data would 400 a lawful 82nd plate code before its seed could land.
      const response = await request(app.getHttpServer())
        .get('/api/reference/districts')
        .query({ plateCode: '99' })
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('the schema constraints', () => {
    /**
     * Each rejected INSERT runs on its own connection in autocommit, NOT inside a shared
     * transaction — deliberately. Postgres aborts a transaction on the first failed statement, so a
     * loop of bad inserts inside one transaction would see every one after the first fail with
     * "current transaction is aborted", and the assertions would pass for the wrong reason. A
     * failed autocommit INSERT writes nothing, so there is nothing to roll back.
     */
    const insert = (provinceId: string, nameTr: string): Promise<unknown> =>
      dataSource.query('INSERT INTO "districts" ("province_id", "name_tr") VALUES ($1, $2)', [
        provinceId,
        nameTr,
      ]);

    afterEach(async () => {
      // Every probe row leaves with the test that wrote it, whatever casing or combining mark it
      // carried — a stray one would be invisible to the seed's own gates (it changes a count they
      // compare) and would turn a later test red for an unrelated reason. `ILIKE` because one probe
      // deliberately inserts an ALL-CAPS variant; no Turkish ilçe contains "probe".
      await dataSource.query('DELETE FROM "districts" WHERE "name_tr" ILIKE $1', ['%probe%']);
      await expect(countDistricts()).resolves.toBe(artifact.districtCount);
    });

    it('refuses a padded, empty or whitespace-only name at the database level', async () => {
      const provinceId = provinceByPlate('34').id;

      // Positive control FIRST: a normally-written name IS accepted, so the rejections below cannot
      // be the constraint refusing everything. It landing is asserted by the row count, not by the
      // driver's return value.
      await insert(provinceId, PROBE_NAME);
      await expect(countDistricts()).resolves.toBe(artifact.districtCount + 1);

      for (const bad of [` ${PROBE_NAME}`, `${PROBE_NAME} `, '', '   ', `\t${PROBE_NAME}`]) {
        await expect(insert(provinceId, bad)).rejects.toBeInstanceOf(QueryFailedError);
      }
      // None of the five wrote anything.
      await expect(countDistricts()).resolves.toBe(artifact.districtCount + 1);
    });

    it('admits the writing forms the load phase — not the column — is responsible for', async () => {
      // Stated as an ACCEPTANCE, so the next reader can tell "allowed on purpose" from "not
      // considered": an ALL-CAPS name and a name carrying the invisible U+0307 both satisfy this
      // column. They are refused in `district.artifact.ts`, where the message can name the source
      // and the row, because both are defects of the source TRANSFORMATION rather than of the value.
      const provinceId = provinceByPlate('34').id;

      await insert(provinceId, PROBE_NAME.toLocaleUpperCase('tr'));
      await insert(provinceId, `\u0307${PROBE_NAME}`);
      await expect(countDistricts()).resolves.toBe(artifact.districtCount + 2);
    });

    it('refuses two ilçe of the same name in one province, and allows them in different ones', async () => {
      const istanbul = provinceByPlate('34').id;
      const ankara = provinceByPlate('06').id;

      await insert(istanbul, PROBE_NAME);
      // Positive control: the same name under a DIFFERENT province is legal — 25 ilçe names really
      // do repeat across provinces, `Merkez` 51 times.
      await insert(ankara, PROBE_NAME);
      await expect(countDistricts()).resolves.toBe(artifact.districtCount + 2);

      await expect(insert(istanbul, PROBE_NAME)).rejects.toBeInstanceOf(QueryFailedError);
      await expect(countDistricts()).resolves.toBe(artifact.districtCount + 2);
    });

    it('refuses a district whose province does not exist', async () => {
      await expect(
        insert('00000000-0000-4000-8000-000000000000', PROBE_NAME),
      ).rejects.toBeInstanceOf(QueryFailedError);
    });
  });

  describe('the seed gates (destructive — restores the table before finishing)', () => {
    it('writes NOTHING when a single province disagrees with its published district_count', async () => {
      // The plan's PR-1 acceptance criterion 4, exercised: "bir il bile tutmazsa tohum hiçbir şey
      // yazmadan hata verir". One province loses one ilçe; 80 of 81 still agree.
      const broken = mutableArtifact();
      const target = broken.provinces[0];
      if (!target) throw new Error('the artefact carries no provinces');
      target.districtNamesTr = target.districtNamesTr.slice(0, -1);
      broken.districtCount -= 1;

      await expect(seedReference(dataSource, { artifact: broken })).rejects.toThrow(
        /provinces\.district_count says/,
      );
      await expect(countDistricts()).resolves.toBe(artifact.districtCount);
    });

    it('writes NOTHING when the plate↔il mapping disagrees with the province table', async () => {
      const broken = mutableArtifact();
      const target = broken.provinces[0];
      if (!target) throw new Error('the artefact carries no provinces');
      target.provinceNameTr = `${target.provinceNameTr} (yanlış)`;

      await expect(seedReference(dataSource, { artifact: broken })).rejects.toThrow(
        /the plate↔il mapping disagrees/,
      );
      await expect(countDistricts()).resolves.toBe(artifact.districtCount);
    });

    it('refuses to DELETE a published ilçe unless the operator authorises it, then does', async () => {
      // A RENAME is the only mutation that keeps every count gate satisfied while still removing a
      // row, so it is the case that isolates the removal refusal from the count refusal.
      const renamed = mutableArtifact();
      const target = renamed.provinces[0];
      const original = target?.districtNamesTr[0];
      if (!target || original === undefined) throw new Error('the artefact carries no districts');
      target.districtNamesTr = ['Denemeköy', ...target.districtNamesTr.slice(1)];

      await expect(seedReference(dataSource, { artifact: renamed })).rejects.toThrow(
        /Deleting a published ilçe is an operator decision/,
      );
      await expect(countDistricts()).resolves.toBe(artifact.districtCount);

      const authorised = await seedReference(dataSource, {
        artifact: renamed,
        allowRemovals: true,
      });
      expect(authorised.removed).toBe(1);
      expect(authorised.inserted).toBe(1);
      await expect(countDistricts()).resolves.toBe(artifact.districtCount);

      // Restore: the committed artefact is authoritative again, and putting it back is itself a
      // removal, so it needs the same authorisation.
      const restored = await seedReference(dataSource, { allowRemovals: true });
      expect(restored.removed).toBe(1);
      expect(restored.inserted).toBe(1);
      await expect(countDistricts()).resolves.toBe(artifact.districtCount);

      const names = await dataSource
        .getRepository(District)
        .find({ where: { provinceId: provinceByPlate(target.plateCode).id } });
      expect(names.map((row) => row.nameTr)).toContain(original);
      expect(names.map((row) => row.nameTr)).not.toContain('Denemeköy');
    });
  });
});
