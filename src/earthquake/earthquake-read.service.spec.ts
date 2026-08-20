import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { EarthquakeReadService, toEarthquakeEventDto } from './earthquake-read.service';
import type {
  EarthquakeListFilter,
  EarthquakePage,
  EarthquakeReadStorePort,
} from './earthquake-read.store';
import { EARTHQUAKE_DISCLAIMER_TR } from './earthquake-disclaimer.constant';
import type { EarthquakeUpstreamConfig } from './earthquake-upstream.config';
import { AFAD_TDVMS_BUDGET } from './earthquake-upstream.config';
import { EarthquakeEvent } from './entities/earthquake-event.entity';
import { EarthquakeBindingKind, EarthquakeDataStatus, MagnitudeType } from './earthquake.types';
import {
  EARTHQUAKE_DEFAULT_MIN_MAGNITUDE,
  EARTHQUAKE_DEFAULT_WINDOW_DAYS,
  EARTHQUAKE_LIST_MAX_PAGE,
  EARTHQUAKE_MAX_WINDOW_DAYS,
  EarthquakeListQueryDto,
} from './dto/earthquake-list-query.dto';

const MS_PER_DAY = 86_400_000;
const CLOCK_SKEW_SECONDS = 300;

const CONFIG: EarthquakeUpstreamConfig = {
  enabled: false,
  ingestEnabled: false,
  baseUrl: 'https://example.invalid/apiv2',
  recentIntervalSeconds: 300,
  reconcileIntervalSeconds: 21_600,
  tourDeadlineMs: 120_000,
  recentWindowHours: 6,
  reconcileWindowDays: 7,
  clockSkewSeconds: CLOCK_SKEW_SECONDS,
  singleCallTimeoutMs: 15_000,
  tourBudgetMs: 60_000,
  responseMaxBytes: 4_194_304,
  safetyLimit: 20_000,
  scopeBufferKm: 200,
  runRetentionDays: 14,
  staleMaxSeconds: 10_800,
  budget: AFAD_TDVMS_BUDGET,
};

const OCCURRED = new Date('2026-08-19T10:31:07.000Z');

/** One stored row. Every value synthetic; only the SHAPE is real. */
function storedRow(overrides: Partial<EarthquakeEvent> = {}): EarthquakeEvent {
  return Object.assign(new EarthquakeEvent(), {
    id: '11111111-1111-4111-8111-111111111111',
    provider: 'afad',
    providerEventId: '900001',
    occurredAtUtc: OCCURRED,
    latitude: 38.05222,
    longitude: 36.63111,
    depthKm: 6.95,
    magnitude: 4.2,
    magnitudeType: MagnitudeType.Ml,
    magnitudeTypeRaw: 'ML',
    providerCountry: 'Türkiye',
    providerProvince: 'Kahramanmaraş',
    providerDistrict: 'Göksun',
    providerLocationRaw: 'Göksun (Kahramanmaraş)',
    placeNameTr: 'Göksun (Kahramanmaraş)',
    bindingKind: EarthquakeBindingKind.Inside,
    bindingPlateCode: '46',
    bindingDistanceKm: null,
    inScope: true,
    isRevised: false,
    providerUpdatedAtUtc: null,
    revisionCount: 0,
    firstSeenAtUtc: OCCURRED,
    createdAt: OCCURRED,
    updatedAt: OCCURRED,
    ...overrides,
  });
}

/** A store that records what it was asked, so the SERVICE's decisions can be observed. */
class FakeReadStore implements EarthquakeReadStorePort {
  page: EarthquakePage = { rows: [], total: 0 };
  runFinishedAt: Date | null = null;
  /** What the store holds, store-wide. Deliberately settable apart from {@link latestEventAt}. */
  storeHoldsRows = false;
  /** What THIS PATH holds — the published field. On a quiet province this is null while the
   * store-wide answer above is still true, which is the state review #121 SFH121-I2 named. */
  latestEventAt: Date | null = null;
  provinceKnown = true;

  lastFilter: EarthquakeListFilter | null = null;
  latestEventPlateCodes: (string | null)[] = [];
  findPageCalls = 0;
  hasAnyServableRowCalls = 0;

  findPage(filter: EarthquakeListFilter): Promise<EarthquakePage> {
    this.findPageCalls += 1;
    this.lastFilter = filter;
    return Promise.resolve(this.page);
  }

  newestSuccessfulRunFinishedAt(): Promise<Date | null> {
    return Promise.resolve(this.runFinishedAt);
  }

  hasAnyServableRow(): Promise<boolean> {
    this.hasAnyServableRowCalls += 1;
    return Promise.resolve(this.storeHoldsRows);
  }

  latestEventOccurredAt(plateCode: string | null): Promise<Date | null> {
    this.latestEventPlateCodes.push(plateCode);
    return Promise.resolve(this.latestEventAt);
  }

  provinceExists(): Promise<boolean> {
    return Promise.resolve(this.provinceKnown);
  }
}

function query(overrides: Partial<EarthquakeListQueryDto> = {}): EarthquakeListQueryDto {
  return Object.assign(new EarthquakeListQueryDto(), overrides);
}

describe('toEarthquakeEventDto', () => {
  it('publishes every timestamp as UTC ending in Z', () => {
    const dto = toEarthquakeEventDto(
      storedRow({ providerUpdatedAtUtc: new Date('2026-08-19T11:00:00.000Z') }),
    );

    expect(dto.occurredAtUtc).toBe('2026-08-19T10:31:07.000Z');
    expect(dto.occurredAtUtc).toMatch(/Z$/);
    expect(dto.providerUpdatedAtUtc).toBe('2026-08-19T11:00:00.000Z');
  });

  it('keeps a never-revised row null rather than inventing a revision time', () => {
    expect(toEarthquakeEventDto(storedRow()).providerUpdatedAtUtc).toBeNull();
  });

  it('publishes exactly the frozen field set — no more, no less', () => {
    // The three that must NOT appear are the point: `providerProvince`/`providerDistrict` mean
    // "the nearest Turkish province", so publishing either alone is how an Iranian event becomes an
    // Ağrı earthquake, and `inScope` is an internal servability flag.
    expect(Object.keys(toEarthquakeEventDto(storedRow())).sort()).toEqual([
      'bindingDistanceKm',
      'bindingKind',
      'bindingPlateCode',
      'depthKm',
      'id',
      'isRevised',
      'latitude',
      'longitude',
      'magnitude',
      'magnitudeType',
      'magnitudeTypeRaw',
      'occurredAtUtc',
      'placeNameTr',
      'providerCountry',
      'providerEventId',
      'providerLocationRaw',
      'providerUpdatedAtUtc',
      'revisionCount',
    ]);
  });

  it('carries no future-tense field of any kind', () => {
    // A ruling, not a preference (DEC 2026-07-30k, D-6). The check is cheap and the failure it
    // guards against is a contract change nobody meant to make.
    const forbidden = /forecast|predict|expected|probabilit|risk|alert|warning/i;
    for (const key of Object.keys(toEarthquakeEventDto(storedRow()))) {
      expect(key).not.toMatch(forbidden);
    }
  });
});

describe('EarthquakeReadService', () => {
  let store: FakeReadStore;
  let service: EarthquakeReadService;

  beforeEach(() => {
    store = new FakeReadStore();
    service = new EarthquakeReadService(store, CONFIG);
  });

  describe('the window', () => {
    it('defaults to the last 7 days, ending at now plus the clock-skew allowance', async () => {
      const before = Date.now();
      const body = await service.listEvents(query());
      const after = Date.now();

      const from = Date.parse(body.meta.filter.fromUtc);
      const to = Date.parse(body.meta.filter.toUtc);

      expect(to - from).toBe(EARTHQUAKE_DEFAULT_WINDOW_DAYS * MS_PER_DAY);
      // The skew allowance is what keeps an event stamped slightly ahead of our clock visible.
      expect(to).toBeGreaterThanOrEqual(before + CLOCK_SKEW_SECONDS * 1000);
      expect(to).toBeLessThanOrEqual(after + CLOCK_SKEW_SECONDS * 1000);
    });

    it('echoes an explicit window unchanged, resolved to instants', async () => {
      const fromUtc = '2026-08-01T00:00:00.000Z';
      const toUtc = '2026-08-08T00:00:00.000Z';
      const body = await service.listEvents(query({ fromUtc, toUtc }));

      expect(body.meta.filter.fromUtc).toBe(fromUtc);
      expect(body.meta.filter.toUtc).toBe(toUtc);
      expect(store.lastFilter?.fromUtc.toISOString()).toBe(fromUtc);
      expect(store.lastFilter?.toUtc.toISOString()).toBe(toUtc);
    });

    it('anchors a one-sided window on the end the caller gave', async () => {
      const toUtc = '2026-08-08T00:00:00.000Z';
      const body = await service.listEvents(query({ toUtc }));

      expect(Date.parse(body.meta.filter.toUtc) - Date.parse(body.meta.filter.fromUtc)).toBe(
        EARTHQUAKE_DEFAULT_WINDOW_DAYS * MS_PER_DAY,
      );
      expect(body.meta.filter.toUtc).toBe(toUtc);
    });

    it('refuses an inverted window', async () => {
      await expect(
        service.listEvents(
          query({ fromUtc: '2026-08-08T00:00:00.000Z', toUtc: '2026-08-01T00:00:00.000Z' }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a window wider than the ceiling, and accepts exactly the ceiling', async () => {
      const toUtc = new Date('2026-08-19T00:00:00.000Z');
      const atCeiling = new Date(toUtc.getTime() - EARTHQUAKE_MAX_WINDOW_DAYS * MS_PER_DAY);
      const pastCeiling = new Date(atCeiling.getTime() - 1);

      await expect(
        service.listEvents(
          query({ fromUtc: pastCeiling.toISOString(), toUtc: toUtc.toISOString() }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.listEvents(query({ fromUtc: atCeiling.toISOString(), toUtc: toUtc.toISOString() })),
      ).resolves.toBeDefined();
    });
  });

  describe('the envelope', () => {
    it('echoes the applied threshold and carries the attribution', async () => {
      const body = await service.listEvents(query());

      expect(body.meta.filter.minMagnitude).toBe(EARTHQUAKE_DEFAULT_MIN_MAGNITUDE);
      expect(body.meta.filter.plateCode).toBeNull();
      expect(body.meta.attributions).toHaveLength(1);
    });

    it('computes hasMore from the total, not from the page being full', async () => {
      store.page = { rows: [storedRow()], total: 51 };
      const middle = await service.listEvents(query({ page: 1, pageSize: 50 }));
      expect(middle.hasMore).toBe(true);

      store.page = { rows: [storedRow()], total: 50 };
      const last = await service.listEvents(query({ page: 1, pageSize: 50 }));
      expect(last.hasMore).toBe(false);

      store.page = { rows: [], total: 50 };
      const past = await service.listEvents(query({ page: 2, pageSize: 50 }));
      expect(past.hasMore).toBe(false);
      expect(past.items).toEqual([]);
    });

    /**
     * The envelope must not promise a page the request contract then refuses.
     *
     * At the published page ceiling with a small `pageSize`, `page * pageSize` can still be below
     * `total`, so the documented "page until hasMore is false" loop would terminate on a 400
     * instead of on the contract (review #121 CODE121-M3).
     */
    it('never promises a page past the published ceiling', async () => {
      store.page = { rows: [storedRow()], total: 10_000_000 };

      const atCeiling = await service.listEvents(
        query({ page: EARTHQUAKE_LIST_MAX_PAGE, pageSize: 3 }),
      );
      expect(atCeiling.hasMore).toBe(false);

      // One page below the ceiling the promise is still made, so the clamp is not blanket.
      const belowCeiling = await service.listEvents(
        query({ page: EARTHQUAKE_LIST_MAX_PAGE - 1, pageSize: 3 }),
      );
      expect(belowCeiling.hasMore).toBe(true);
    });

    it('passes the page window straight through to the store', async () => {
      await service.listEvents(query({ page: 3, pageSize: 25 }));
      expect(store.lastFilter?.page).toBe(3);
      expect(store.lastFilter?.pageSize).toBe(25);
    });
  });

  describe('the province path', () => {
    it('404s an unknown plate code BEFORE querying for a page', async () => {
      store.provinceKnown = false;

      await expect(service.listProvinceEvents('99', query())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      // A well-formed but unknown code must not be answerable as "this province had no
      // earthquakes", which is what a page query returning empty would have produced.
      expect(store.findPageCalls).toBe(0);
    });

    it('filters and echoes the plate code, and scopes the PUBLISHED newest-event to it', async () => {
      const body = await service.listProvinceEvents('46', query());

      expect(store.lastFilter?.plateCode).toBe('46');
      expect(body.meta.filter.plateCode).toBe('46');
      // The published field is scoped to the path, not to the request filter.
      expect(store.latestEventPlateCodes).toEqual(['46']);
    });

    /**
     * The defect review #121 SFH121-I2 named, pinned at the level where it was introduced.
     *
     * Before the fix the freshness derivation was fed `latestEventOccurredAt(plateCode)`, so a
     * province holding no bound row answered `unavailable` — "no usable ingest at all", plus
     * `Cache-Control: no-store` — while the hub served a full list from the same store. The state
     * is reachable exactly when the run ledger is empty, which the hand-run backfill used to leave
     * behind on every go-live until E4 made it write its own row (`FU-E2-BACKFILL-RUNROW`); run
     * retention and a restore from a data-only dump still reach it.
     */
    it('answers stale for a QUIET province while the store holds rows, never unavailable', async () => {
      store.runFinishedAt = null;
      store.storeHoldsRows = true;
      store.latestEventAt = null;
      store.page = { rows: [], total: 0 };

      const body = await service.listProvinceEvents('39', query());

      expect(body.meta.dataStatus).toBe(EarthquakeDataStatus.Stale);
      expect(body.meta.latestEventAtUtc).toBeNull();
      expect(body.items).toEqual([]);
    });

    it('still answers unavailable when the store itself holds nothing', async () => {
      store.runFinishedAt = null;
      store.storeHoldsRows = false;
      store.latestEventAt = null;

      const body = await service.listProvinceEvents('39', query());

      expect(body.meta.dataStatus).toBe(EarthquakeDataStatus.Unavailable);
    });

    it('asks the store-wide probe on BOTH paths, never the province-scoped one', async () => {
      await service.listEvents(query());
      await service.listProvinceEvents('46', query());

      expect(store.hasAnyServableRowCalls).toBe(2);
      // The province-scoped query is still made — for the published field only.
      expect(store.latestEventPlateCodes).toEqual([null, '46']);
    });
  });

  describe('the meta endpoint', () => {
    it('publishes the same defaults the query DTO applies, and the ingest scope buffer', async () => {
      const body = await service.getMeta();

      expect(body.minMagnitudeDefault).toBe(EARTHQUAKE_DEFAULT_MIN_MAGNITUDE);
      expect(body.defaultWindowDays).toBe(EARTHQUAKE_DEFAULT_WINDOW_DAYS);
      expect(body.maxWindowDays).toBe(EARTHQUAKE_MAX_WINDOW_DAYS);
      // From the SAME config the ingest classifies rows with: a second reading of the environment
      // is how a published scope stops describing the stored rows.
      expect(body.scopeBufferKm).toBe(CONFIG.scopeBufferKm);
      expect(body.attributions).toHaveLength(1);
    });

    /**
     * E3 asserted this field's ABSENCE; E4 landed it with its owner ruling, so the assertion is
     * inverted rather than deleted — the point of the original case was that the field may not
     * appear by accident, and that is still what this one says.
     *
     * The value is compared against the CONSTANT, never against a literal retyped here: the
     * literal lives once, in `earthquake-disclaimer.constant.spec.ts`, where the byte pin and the
     * apostrophe code point are asserted. Retyping it in a second place would create a copy that
     * can agree with itself while both drift from the ruling.
     */
    it('carries the owner-ruled disclaimer, verbatim from the constant', async () => {
      expect((await service.getMeta()).disclaimerTr).toBe(EARTHQUAKE_DISCLAIMER_TR);
    });

    /** Constant, so it does not depend on the store's health — the cold path publishes it too. */
    it('publishes the disclaimer on a cold store as well', async () => {
      store.storeHoldsRows = false;
      store.runFinishedAt = null;
      const body = await service.getMeta();

      expect(body.dataStatus).toBe(EarthquakeDataStatus.Unavailable);
      expect(body.disclaimerTr).toBe(EARTHQUAKE_DISCLAIMER_TR);
    });

    it('reports the newest event it holds, store-wide', async () => {
      store.storeHoldsRows = true;
      store.latestEventAt = OCCURRED;
      const body = await service.getMeta();

      expect(body.latestEventAtUtc).toBe(OCCURRED.toISOString());
      expect(store.latestEventPlateCodes).toEqual([null]);
    });
  });
});
