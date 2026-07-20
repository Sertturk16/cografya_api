import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Province } from './entities/province.entity';
import { computeClimateDerived } from './climate-derivations';
import { ProvinceDetailDto } from './dto/province-detail.dto';
import { ProvinceListItemDto } from './dto/province-list-item.dto';
import { ProvinceMapSummaryDto } from './dto/province-map-summary.dto';
import type { Climate } from './province.types';

/**
 * Nüfus yoğunluğu (kişi/km²) from two verified values. A single source of truth
 * for the rounding + null rule so no two consumers (hover vs detail, TR vs EN)
 * compute it differently. Null when either input is null, or if the area is 0
 * (guards against a divide-by-zero producing Infinity — no real province has a
 * zero area, but the mapper never emits a non-finite number).
 *
 * The null/zero branch is the NORMAL state of every not-yet-seeded province (43
 * of 81), so it is unit-tested directly (province.e2e-spec) — exported for that.
 */
export function computePopulationDensity(
  population: number | null,
  areaKm2: number | null,
): number | null {
  if (population === null || areaKm2 === null || areaKm2 === 0) {
    return null;
  }
  return Math.round(population / areaKm2);
}

/** Module-scoped logger for the one observable data-integrity signal `buildClimate` emits. */
const climateLogger = new Logger('ProvinceClimate');

/**
 * Build the served climate payload from a stored series: the series itself PLUS the derived
 * annual/seasonal block. A single source of truth for "does this province render a climate
 * section?" so no two consumers disagree.
 *
 * Null in two cases, both rendering NO climate section (graceful degradation, never a crash):
 *   - the province has no stored series (`climate_normals` is NULL — the normal state until the
 *     import runs, and permanently for any province MGM's page cannot cover). This is EXPECTED
 *     and silent, and
 *   - the series is present but its core pair is not derivable (a data-integrity slip the
 *     import-time all-or-nothing rule should already prevent — belt-and-braces, so a bad row
 *     degrades one section instead of 500-ing a public SEO page). This is a DEFECT, so it is
 *     logged: unreachable via the verified load path today, but any future migration,
 *     admin-CRUD write or manual SQL lands here, and without a signal the province's climate
 *     section would vanish invisibly and forever. The plate code is public data (no PII, §3.6).
 *
 * Exported for direct unit testing of the null-collapse branches (the `computePopulationDensity`
 * precedent).
 */
export function buildClimate(
  normals: Province['climateNormals'],
  plateCode: string,
): Climate | null {
  if (normals === null) {
    return null;
  }
  const derived = computeClimateDerived(normals);
  if (derived === null) {
    climateLogger.warn(
      `province ${plateCode}: climate_normals is present but not derivable (incomplete/corrupt ` +
        `core pair) — serving climate: null. The import guarantees this cannot happen via the ` +
        `load path, so this row was written by some other path and needs inspection.`,
    );
    return null;
  }
  return { ...normals, derived };
}

@Injectable()
export class ProvinceService {
  constructor(
    @InjectRepository(Province)
    private readonly provinces: Repository<Province>,
  ) {}

  /**
   * All provinces, ordered by plaka kodu.
   *
   * Returned as a plain array (no pagination envelope): the province set is a
   * bounded reference collection (exactly 81) that the il-hub + SVG map need in
   * full, so paginating it would only hurt the SEO hub. The pagination envelope
   * + helper is deferred to the first genuinely unbounded/growing list (the
   * blog/konu-anlatımı engine, Faz-1 item 2) and will be codified in the PR-3
   * playbook.
   */
  async findAll(): Promise<ProvinceListItemDto[]> {
    // Project to ONLY the columns `toListItem` returns — the same discipline PR #67
    // established (keep the query as lean as the DTO), NOT a reversal of it. The list DTO now
    // carries `climateAnnualMeanTempC`, a value DERIVED from `climate_normals`, so that jsonb
    // is now genuinely a column this DTO needs and belongs in the projection by the very rule
    // #67 set. It is the ONLY heavy column added (the narrative text fields stay out), and it
    // is derived LIVE in `toListItem` via the same `buildClimate` the detail path uses — a
    // single source of truth. The persisted-derived-column alternative was rejected on data
    // correctness: it would let the list disagree with the detail on any write to
    // `climate_normals` that bypasses the import (the documented `SET climate_normals = NULL`
    // kill-switch included), reintroducing exactly the staleness `province.types.ts` designed
    // out ("never persisted, so they cannot go stale"). This is a bounded (81), fully
    // cacheable, build/ISR-time read, so the projection weight is negligible here.
    const rows = await this.provinces.find({
      select: {
        plateCode: true,
        nameTr: true,
        region: true,
        slugTr: true,
        slugEn: true,
        climateKoppen: true,
        climateNormals: true,
      },
      order: { plateCode: 'ASC' },
    });
    return rows.map((row) => this.toListItem(row));
  }

  /**
   * Purpose-sized bulk payload for the homepage SVG map hover-card: all provinces
   * with the identity fields + the 4 hover-card summary numbers, plate-ordered.
   * A bounded set (81) the map pre-embeds at build/ISR time — returned as a plain
   * array (no envelope), same rationale as `findAll`.
   *
   * Projected to ONLY the hover-card columns `toMapSummary` returns — the query is as lean
   * as the response, so the fat `climate_normals` jsonb (~0.45 MB/call) and the narrative
   * text fields are never read just to be dropped in the mapper. (No serialized-output
   * change: the map-summary DTO never exposed those columns.)
   */
  async findMapSummary(): Promise<ProvinceMapSummaryDto[]> {
    const rows = await this.provinces.find({
      select: {
        plateCode: true,
        nameTr: true,
        region: true,
        slugTr: true,
        slugEn: true,
        population: true,
        populationYear: true,
        areaKm2: true,
        districtCount: true,
      },
      order: { plateCode: 'ASC' },
    });
    return rows.map((row) => this.toMapSummary(row));
  }

  /**
   * One province by either its TR or EN slug (the web repo routes both locales).
   * Unknown slug → 404 with a stable key; the web renders its own localized
   * `notFound()` page from that status.
   */
  async findBySlug(slug: string): Promise<ProvinceDetailDto> {
    const row = await this.provinces.findOne({
      where: [{ slugTr: slug }, { slugEn: slug }],
    });

    if (!row) {
      // Stable message key (not a localized literal). Full i18n wiring lands
      // when the first end-user-facing API messages appear (auth/panels, Faz 3).
      throw new NotFoundException('errors.province.notFound');
    }

    return this.toDetail(row);
  }

  private toListItem(row: Province): ProvinceListItemDto {
    return {
      plateCode: row.plateCode,
      nameTr: row.nameTr,
      region: row.region,
      slugTr: row.slugTr,
      slugEn: row.slugEn,
      climateKoppen: row.climateKoppen,
      // The SAME derived value the detail DTO exposes: both read
      // `buildClimate(...)?.derived.annualMeanTempC`, so the list and the detail can never
      // round or null it differently (one source of truth — climate-derivations.ts). Null
      // when the province has no publishable series (or, defensively, one not derivable).
      climateAnnualMeanTempC:
        buildClimate(row.climateNormals, row.plateCode)?.derived.annualMeanTempC ?? null,
    };
  }

  private toMapSummary(row: Province): ProvinceMapSummaryDto {
    return {
      plateCode: row.plateCode,
      nameTr: row.nameTr,
      region: row.region,
      slugTr: row.slugTr,
      slugEn: row.slugEn,
      population: row.population,
      populationYear: row.populationYear,
      areaKm2: row.areaKm2,
      districtCount: row.districtCount,
    };
  }

  private toDetail(row: Province): ProvinceDetailDto {
    return {
      plateCode: row.plateCode,
      nameTr: row.nameTr,
      slugTr: row.slugTr,
      slugEn: row.slugEn,
      region: row.region,
      introTr: row.introTr,
      population: row.population,
      populationYear: row.populationYear,
      areaKm2: row.areaKm2,
      districtCount: row.districtCount,
      populationDensity: computePopulationDensity(row.population, row.areaKm2),
      elevationM: row.elevationM,
      latitude: row.latitude,
      longitude: row.longitude,
      neighborPlateCodes: row.neighborPlateCodes,
      climateKoppen: row.climateKoppen,
      climateClassTr: row.climateClassTr,
      climateNoteTr: row.climateNoteTr,
      climate: buildClimate(row.climateNormals, row.plateCode),
      climateNarrativeTr: row.climateNarrativeTr,
      landformNoteTr: row.landformNoteTr,
      hydrographyNoteTr: row.hydrographyNoteTr,
      hydrographyFeatures: row.hydrographyFeatures,
      urbanizationRate: row.urbanizationRate,
      netMigrationRate: row.netMigrationRate,
      settlementNoteTr: row.settlementNoteTr,
      economyIndicator: row.economyIndicator,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
