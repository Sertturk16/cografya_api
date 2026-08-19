import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { buildEarthquakeAttributions } from './earthquake-attribution.constant';
import { resolveEarthquakeFreshness } from './earthquake-data-status';
import {
  EARTHQUAKE_READ_STORE,
  type EarthquakeListFilter,
  type EarthquakeReadStorePort,
} from './earthquake-read.store';
import {
  EARTHQUAKE_UPSTREAM_CONFIG,
  type EarthquakeUpstreamConfig,
} from './earthquake-upstream.config';
import type { EarthquakeEvent } from './entities/earthquake-event.entity';
import type { EarthquakeEventDto } from './dto/earthquake-event.dto';
import type { EarthquakeListDto } from './dto/earthquake-list.dto';
import {
  EARTHQUAKE_DEFAULT_MIN_MAGNITUDE,
  EARTHQUAKE_DEFAULT_WINDOW_DAYS,
  EARTHQUAKE_LIST_MAX_PAGE,
  EARTHQUAKE_MAX_WINDOW_DAYS,
  type EarthquakeListQueryDto,
} from './dto/earthquake-list-query.dto';
import type { EarthquakeMetaDto } from './dto/earthquake-meta.dto';

const MS_PER_DAY = 86_400_000;

/**
 * One stored row, as published.
 *
 * Exported for direct unit testing, and written by hand rather than left to a serializer: every
 * `Date` becomes an ISO string ending in `Z` HERE, once. The provider's timestamps carry no zone
 * and its own site renders them +3 hours, so "which layer converts" is this leg's most expensive
 * question (SPEC §3.3) — the API answers UTC and only UTC, and the web repo converts once.
 *
 * Three stored columns are deliberately NOT published: `providerProvince` and `providerDistrict`
 * (the provider's province means "the nearest Turkish province", so publishing it alone is how an
 * Iranian event becomes an Ağrı earthquake — the contract carries `bindingKind` + `bindingPlateCode`
 * instead), and `inScope` (an internal servability flag; no row that fails it reaches this mapper).
 */
export function toEarthquakeEventDto(row: EarthquakeEvent): EarthquakeEventDto {
  return {
    id: row.id,
    providerEventId: row.providerEventId,
    occurredAtUtc: row.occurredAtUtc.toISOString(),
    magnitude: row.magnitude,
    magnitudeType: row.magnitudeType,
    magnitudeTypeRaw: row.magnitudeTypeRaw,
    depthKm: row.depthKm,
    latitude: row.latitude,
    longitude: row.longitude,
    placeNameTr: row.placeNameTr,
    providerLocationRaw: row.providerLocationRaw,
    bindingKind: row.bindingKind,
    bindingPlateCode: row.bindingPlateCode,
    bindingDistanceKm: row.bindingDistanceKm,
    providerCountry: row.providerCountry,
    isRevised: row.isRevised,
    providerUpdatedAtUtc: row.providerUpdatedAtUtc?.toISOString() ?? null,
    revisionCount: row.revisionCount,
  };
}

/**
 * The public read path for the earthquake leg.
 *
 * ## It never contacts AFAD, on any branch
 * Every endpoint answers out of Postgres. A provider outage changes `dataStatus` and nothing else —
 * the request path has no upstream call to fail (SPEC §6.1), and the e2e proves it with a counting
 * `fetch` spy rather than by reading the code.
 *
 * ## `EARTHQUAKE_ENABLED` does not gate any of this
 * The kill switch governs the INGEST half. These endpoints stay registered and degrade honestly,
 * which is exactly why the go-live rider matters: the web `/deprem` page must not ship while the
 * flag is off (the air-quality Q5 / `QUESTIONS.md` H-7 class).
 */
@Injectable()
export class EarthquakeReadService {
  constructor(
    @Inject(EARTHQUAKE_READ_STORE) private readonly store: EarthquakeReadStorePort,
    @Inject(EARTHQUAKE_UPSTREAM_CONFIG) private readonly config: EarthquakeUpstreamConfig,
  ) {}

  /** The hub list: every servable event, newest first. */
  listEvents(query: EarthquakeListQueryDto): Promise<EarthquakeListDto> {
    return this.buildList(query, null);
  }

  /**
   * One province's section.
   *
   * A plate code naming no province is the leg's SINGLE 404 (SPEC §12) and is answered before the
   * query runs — a well-formed-but-unknown code must not look like "this province had no
   * earthquakes". The exception carries no message: reporting the miss on an unauthenticated route
   * would describe caller behaviour rather than our data (the air-quality precedent).
   *
   * All three `bindingKind` values are served here. That is the point of the token: an event across
   * the border is shown ON the province page, labelled as across the border, and the API never
   * emits the sentence — the web builds it from the token plus the plate code.
   */
  async listProvinceEvents(
    plateCode: string,
    query: EarthquakeListQueryDto,
  ): Promise<EarthquakeListDto> {
    if (!(await this.store.provinceExists(plateCode))) {
      throw new NotFoundException();
    }
    return this.buildList(query, plateCode);
  }

  /** The leg's standing facts plus the store's freshness. */
  async getMeta(): Promise<EarthquakeMetaDto> {
    const now = new Date();
    const [runFinishedAt, holdsServableRow, latestEventAt] = await Promise.all([
      this.store.newestSuccessfulRunFinishedAt(),
      this.store.hasAnyServableRow(),
      this.store.latestEventOccurredAt(null),
    ]);

    const freshness = resolveEarthquakeFreshness({
      runFinishedAt,
      holdsServableRow,
      now,
      staleMaxSeconds: this.config.staleMaxSeconds,
    });

    return {
      minMagnitudeDefault: EARTHQUAKE_DEFAULT_MIN_MAGNITUDE,
      // From the SAME config object the ingest classified rows with, never a second reading of the
      // environment: two sources for one number is how a published scope stops describing the
      // stored rows.
      scopeBufferKm: this.config.scopeBufferKm,
      defaultWindowDays: EARTHQUAKE_DEFAULT_WINDOW_DAYS,
      maxWindowDays: EARTHQUAKE_MAX_WINDOW_DAYS,
      dataUpdatedAtUtc: freshness.dataUpdatedAtUtc,
      latestEventAtUtc: latestEventAt?.toISOString() ?? null,
      dataStatus: freshness.dataStatus,
      attributions: buildEarthquakeAttributions(),
    };
  }

  private async buildList(
    query: EarthquakeListQueryDto,
    plateCode: string | null,
  ): Promise<EarthquakeListDto> {
    const now = new Date();
    const { fromUtc, toUtc } = this.resolveWindow(query, now);

    const filter: EarthquakeListFilter = {
      minMagnitude: query.minMagnitude,
      fromUtc,
      toUtc,
      plateCode,
      page: query.page,
      pageSize: query.pageSize,
    };

    // Four independent reads, so they go in parallel: none of them feeds another.
    const [page, runFinishedAt, holdsServableRow, latestEventAt] = await Promise.all([
      this.store.findPage(filter),
      this.store.newestSuccessfulRunFinishedAt(),
      // STORE-WIDE, on both paths. The freshness verdict answers "do we hold anything at all", and
      // scoping that to the requested province made a quiet province indistinguishable from a cold
      // deployment — `unavailable` plus `no-store` — while the hub served a full list from the same
      // store (review #121 SFH121-I2).
      this.store.hasAnyServableRow(),
      // PATH-SCOPED, and published as `meta.latestEventAtUtc` only. Not scoped to the request's
      // filter: a request that filters everything out must still report what the path holds.
      this.store.latestEventOccurredAt(plateCode),
    ]);

    const freshness = resolveEarthquakeFreshness({
      runFinishedAt,
      holdsServableRow,
      now,
      staleMaxSeconds: this.config.staleMaxSeconds,
    });

    return {
      items: page.rows.map(toEarthquakeEventDto),
      page: query.page,
      pageSize: query.pageSize,
      total: page.total,
      // A page past the end is an empty `items` with `hasMore: false` and a 200 — never a 404.
      //
      // Clamped at the published page ceiling as well, so the envelope cannot promise a page the
      // request contract then refuses: at `page = EARTHQUAKE_LIST_MAX_PAGE` with a small
      // `pageSize`, `page * pageSize` can still be below `total`, and the documented "page until
      // hasMore is false" loop would terminate on a 400 instead of on the contract
      // (review #121 CODE121-M3).
      hasMore: query.page < EARTHQUAKE_LIST_MAX_PAGE && query.page * query.pageSize < page.total,
      meta: {
        filter: {
          minMagnitude: query.minMagnitude,
          plateCode,
          // The window ACTUALLY applied, resolved to real instants — never echoed as "the last 7
          // days". A reader looking at five events cannot otherwise tell whether the window was a
          // week or an hour (SPEC §13 item 14).
          fromUtc: fromUtc.toISOString(),
          toUtc: toUtc.toISOString(),
        },
        dataUpdatedAtUtc: freshness.dataUpdatedAtUtc,
        latestEventAtUtc: latestEventAt?.toISOString() ?? null,
        dataStatus: freshness.dataStatus,
        attributions: buildEarthquakeAttributions(),
      },
    };
  }

  /**
   * The window, resolved and bounded.
   *
   * The default upper bound is `now + clockSkewSeconds` rather than `now`: the ingest writes events
   * up to that same allowance ahead, so a provider clock running a few seconds fast would otherwise
   * make the NEWEST earthquake the one row a "latest earthquakes" list cannot show.
   *
   * Both cross-field rules live here rather than in a decorator because neither is expressible as
   * one: `class-validator` sees one property at a time. The messages are technical and English on
   * purpose — they join the global `ValidationPipe`'s own output, are read by a developer or by the
   * SSG build, and are never the copy a reader sees (the web authors that from `dataStatus`).
   */
  private resolveWindow(query: EarthquakeListQueryDto, now: Date): { fromUtc: Date; toUtc: Date } {
    const toUtc =
      query.toUtc === undefined
        ? new Date(now.getTime() + this.config.clockSkewSeconds * 1000)
        : new Date(query.toUtc);
    const fromUtc =
      query.fromUtc === undefined
        ? new Date(toUtc.getTime() - EARTHQUAKE_DEFAULT_WINDOW_DAYS * MS_PER_DAY)
        : new Date(query.fromUtc);

    // Belt to the DTO's braces: `@IsISO8601` has already refused anything unparseable, so this can
    // only fire if that guard is ever loosened — at which point an Invalid Date would otherwise
    // reach SQL as `NaN` and match nothing, silently.
    if (Number.isNaN(fromUtc.getTime()) || Number.isNaN(toUtc.getTime())) {
      throw new BadRequestException('fromUtc and toUtc must be valid ISO-8601 instants');
    }

    if (fromUtc.getTime() > toUtc.getTime()) {
      throw new BadRequestException('fromUtc must not be later than toUtc');
    }

    if (toUtc.getTime() - fromUtc.getTime() > EARTHQUAKE_MAX_WINDOW_DAYS * MS_PER_DAY) {
      throw new BadRequestException(
        `the window may span at most ${String(EARTHQUAKE_MAX_WINDOW_DAYS)} days`,
      );
    }

    return { fromUtc, toUtc };
  }
}
