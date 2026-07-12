import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import {
  assertKoppenCaveatInvariant,
  seedGeography,
  type SeedGeographyResult,
} from '../src/database/seeds/seed-geography';
// PILOT_PROVINCES / SEED_PROVINCES are imported ONLY to drive the seed-rollout
// phases below (a code-path input) — NOT as the oracle for the value assertions,
// which stay independent in EXPECTED_PROVINCES. (The per-wave arrays are no longer
// imported: from wave-4 on the rollout is proven with a single representative mixed
// transition — empty→pilot then the full set — not one phase per historical wave.)
import {
  PILOT_PROVINCES,
  SEED_PROVINCES,
  type ProvinceSeed,
} from '../src/database/seeds/province.seed-data';
import { GeographicRegion } from '../src/common/geographic-region.enum';
import { Province } from '../src/province/entities/province.entity';
import { computePopulationDensity } from '../src/province/province.service';
import { HydrographyFeatureType } from '../src/province/province.types';
// NOTE: AppModule is imported dynamically inside beforeAll — NOT at the top —
// because ConfigModule.forRoot validates the env eagerly at module-load time, so
// AppModule must not load until DATABASE_URL has been set to the container URL.

/**
 * Expected, fact-checked values for every seeded province (5 pilot + 9 Batch 2
 * wave-1 + 10 Batch 2 wave-2 + 7 Batch 2 wave-3 + 7 Batch 2 wave-4 + 9 wave-6d
 * Karadeniz-B + 13 wave-6b + 12 wave-6a İç Anadolu + 9 wave-6c Karadeniz-A = 81), restated
 * INDEPENDENTLY of the seed source (NOT imported from the seed arrays) so a
 * transcription regression in the seed is caught rather than tautologically passed.
 * Pilot values trace to il-data-dictionary §2.1 (fact-checked 2026-07-08); wave-1
 * values trace to batch2-wave1-factcheck.md (2026-07-10); wave-2 values trace to
 * batch2-wave2-factcheck.md (2026-07-10); wave-3 values trace to
 * batch2-wave3-factcheck.md (2026-07-11); wave-4 (Akdeniz) values trace to
 * batch2-wave4-factcheck.md (2026-07-11, core fields 7/7 VERIFIED, ZERO numeric
 * deviations — including the Kahramanmaraş elevation=572 GLOSSARY §1 exception, which
 * uses MGM's coordinate-identical Onikişubat record because the literal "Merkez"
 * default returns a broken 0 m). The 9 Batch-2 wave-1 (Güneydoğu Anadolu) il ALSO now
 * carry DEEP-CONTENT detail fields (deep-content wave-5): Tier-A (Diyarbakır 21,
 * Gaziantep 27, Şanlıurfa 63) full 8-field, plain Tier-B (Adıyaman 02, Batman 72, Kilis
 * 79, Siirt 56, Şırnak 73) 6-field, and Mardin 47 the Tier-B-but-büyükşehir exception
 * (a THIRD variant: hydrographyFeatures null but settlementNoteTr populated with the
 * single 6360 caveat sentence, → DEC 2026-07-12). These trace to
 * wave5-guneydogu-anadolu-deep-content-factcheck.md (2026-07-12, 27/27 numeric cells
 * VERIFIED, incl. the priority-reverified Siirt -33.96 ‰ net-migration record).
 * `populationDensity` is round(population / areaKm2) —
 * the server derives it, so it is computed here by hand to catch a broken derivation
 * too. Köppen is MIXED across EIGHT Köppen codes: wave-2 Kocaeli+Sakarya and wave-3
 * Afyonkarahisar are Cfa; wave-3 Kütahya is Csb (the third class); all 7 wave-4
 * provinces are Csa (no new class); wave-6d adds Cfb (the FOURTH class — Çorum 19,
 * Kastamonu 37, Bolu 14, "Karadeniz iklimi" like Cfa) plus 4×Cfa + 2×Csa; wave-6b adds the platform's first non-"C" codes (Dfb/Dsb/Dsa →
 * "Karasal iklim", BSk → "Yarı Kurak Step İklimi"); wave-6a introduces NO new code —
 * its 12 il REUSE existing codes (6× BSk, 3× Csa, 2× Csb, 1× Cfa); the rest
 * are Csa. `caveatContains` is the
 * province's OWN class code, asserting each row got the caveat that names its code
 * (Cfa/Csb/BSk caveat, not the Csa one) — the copy-paste guard.
 */
const EXPECTED_PROVINCES = [
  {
    slug: 'istanbul',
    plateCode: '34',
    nameTr: 'İstanbul',
    region: 'MARMARA',
    population: 15_754_053,
    populationYear: 2025,
    areaKm2: 5461,
    districtCount: 39,
    // populationDensity = round(15_754_053 / 5461) — server-computed, not stored.
    populationDensity: 2885,
    elevationM: 33,
    latitude: 40.9819,
    longitude: 28.8208,
    neighborPlateCodes: ['59', '41'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── İstanbul deep-content pilot (this PR): the FIRST province with the PR-5a
    //    detail-section fields populated. Restated INDEPENDENTLY here (NOT imported from
    //    the seed) from the fact-checked draft (istanbul-deep-content-{draft,factcheck}.md,
    //    zero corrections). Structured/scalar fields asserted EXACTLY; the four prose fields
    //    are asserted by distinctive-token `toContain` in the dedicated İstanbul detail test
    //    below — the same discipline the climate caveat uses (no brittle full-prose match).
    urbanizationRate: 100,
    netMigrationRate: 1.66,
    hydrographyFeatures: [
      { name: 'Ömerli Barajı', type: 'baraj' },
      { name: 'Terkos Barajı', type: 'baraj' },
      { name: 'Büyükçekmece Barajı', type: 'baraj' },
      { name: 'Darlık Barajı', type: 'baraj' },
      { name: 'Sazlıdere Barajı', type: 'baraj' },
      { name: 'Pabuçdere Barajı', type: 'baraj' },
      { name: 'Alibey Barajı', type: 'baraj' },
      { name: 'Kazandere Barajı', type: 'baraj' },
      { name: 'Elmalı Barajı', type: 'baraj' },
      { name: 'Istrancalar Barajı', type: 'baraj' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%29,2',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'ankara',
    plateCode: '06',
    nameTr: 'Ankara',
    region: 'IC_ANADOLU',
    population: 5_910_320,
    populationYear: 2025,
    areaKm2: 25_632,
    districtCount: 25,
    populationDensity: 231, // round(5_910_320 / 25_632)
    elevationM: 891,
    latitude: 39.9727,
    longitude: 32.8637,
    neighborPlateCodes: ['18', '71', '40', '68', '42', '26', '14'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'yarı-kurak step',
    // ── Ankara wave-1 deep content — restated INDEPENDENTLY from the fact-checked draft
    //    (wave1-pilot-deep-content-{draft,factcheck}.md). Structured fields asserted EXACTLY
    //    in the it.each below; prose gets distinctive-token checks in the wave-1 detail test.
    urbanizationRate: 100,
    netMigrationRate: 8.91,
    hydrographyFeatures: [
      { name: 'Çamlıdere Barajı', type: 'baraj' },
      { name: 'Kurtboğazı Barajı', type: 'baraj' },
      { name: 'Bayındır Barajı', type: 'baraj' },
      { name: 'Çubuk I Barajı', type: 'baraj' },
      { name: 'Çubuk II Barajı', type: 'baraj' },
      { name: 'Kesikköprü Barajı', type: 'baraj' },
      { name: 'Sarıyar Barajı', type: 'baraj' },
      { name: 'Sakarya Nehri', type: 'nehir' },
      { name: 'Kızılırmak', type: 'nehir' },
      { name: 'Mogan Gölü', type: 'gol' },
      { name: 'Eymir Gölü', type: 'gol' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%10,5',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'izmir',
    plateCode: '35',
    nameTr: 'İzmir',
    region: 'EGE',
    population: 4_504_185,
    populationYear: 2025,
    areaKm2: 11_891,
    districtCount: 30,
    populationDensity: 379, // round(4_504_185 / 11_891)
    elevationM: 29,
    latitude: 38.4049,
    longitude: 27.1895,
    neighborPlateCodes: ['10', '45', '09'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── İzmir wave-1 deep content — independent restatement of the fact-checked draft.
    urbanizationRate: 100,
    netMigrationRate: 3.53,
    hydrographyFeatures: [
      { name: 'Tahtalı Barajı', type: 'baraj' },
      { name: 'Balçova Barajı', type: 'baraj' },
      { name: 'Gördes Barajı', type: 'baraj' },
      { name: 'Ürkmez Barajı', type: 'baraj' },
      { name: 'Alaçatı Kutlu Aktaş Barajı', type: 'baraj' },
      { name: 'Gediz Nehri', type: 'nehir' },
      { name: 'Küçük Menderes Nehri', type: 'nehir' },
      { name: 'Bakırçay', type: 'nehir' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%5,7',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'van',
    plateCode: '65',
    nameTr: 'Van',
    region: 'DOGU_ANADOLU',
    population: 1_112_013,
    populationYear: 2025,
    areaKm2: 20_921,
    districtCount: 13,
    populationDensity: 53, // round(1_112_013 / 20_921)
    elevationM: 1675,
    latitude: 38.4693,
    longitude: 43.346,
    neighborPlateCodes: ['04', '13', '56', '30', '73'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'karasal/göl-etkili',
    // ── Van wave-1 deep content — independent restatement. netMigrationRate is the sole
    //    NEGATIVE of the four pilots; economyIndicator is the Atlas-ruled GSYH-share metric.
    urbanizationRate: 100,
    netMigrationRate: -20.02,
    hydrographyFeatures: [
      { name: 'Van Gölü', type: 'gol' },
      { name: 'Erçek Gölü', type: 'gol' },
      { name: 'Sarımehmet Barajı', type: 'baraj' },
      { name: 'Zernek Barajı', type: 'baraj' },
      { name: 'Koçköprü Barajı', type: 'baraj' },
      { name: 'Morgedik Barajı', type: 'baraj' },
      { name: 'Bendimahi Çayı', type: 'nehir' },
      { name: 'Karasu Çayı', type: 'nehir' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,5',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'antalya',
    plateCode: '07',
    nameTr: 'Antalya',
    region: 'AKDENIZ',
    population: 2_777_677,
    populationYear: 2025,
    areaKm2: 20_177,
    districtCount: 19,
    populationDensity: 138, // round(2_777_677 / 20_177)
    elevationM: 47,
    latitude: 36.8851,
    longitude: 30.6828,
    neighborPlateCodes: ['48', '15', '32', '42', '70', '33'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Antalya wave-1 deep content — independent restatement. netMigrationRate is the
    //    HIGHEST positive of the four pilots (+9.09 ‰, ahead of Ankara).
    urbanizationRate: 100,
    netMigrationRate: 9.09,
    hydrographyFeatures: [
      { name: 'Oymapınar Barajı', type: 'baraj' },
      { name: 'Manavgat Barajı', type: 'baraj' },
      { name: 'Karacaören I Barajı', type: 'baraj' },
      { name: 'Karacaören II Barajı', type: 'baraj' },
      { name: 'Manavgat Nehri', type: 'nehir' },
      { name: 'Aksu Nehri', type: 'nehir' },
      { name: 'Köprüçay', type: 'nehir' },
      { name: 'Düden Çayı', type: 'nehir' },
      { name: 'Avlan Gölü', type: 'gol' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%3,4',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  // ── Batch 2 — wave 1 (Güneydoğu Anadolu, 9 il), alphabetical by nameTr ──
  {
    slug: 'adiyaman',
    plateCode: '02',
    nameTr: 'Adıyaman',
    region: 'GUNEYDOGU_ANADOLU',
    population: 617_821,
    populationYear: 2025,
    areaKm2: 7337,
    districtCount: 9,
    populationDensity: 84, // round(617_821 / 7337)
    elevationM: 672,
    latitude: 37.7553,
    longitude: 38.2775,
    neighborPlateCodes: ['44', '21', '63', '27', '46'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Adıyaman wave-5 Tier-B deep content — the 6-field set (NO hydrographyFeatures, NO
    //    settlementNoteTr; both DELIBERATELY absent → null, asserted null in the detail test).
    //    urbanizationRate=69.04 is a REAL rate (non-büyükşehir). Independent restatement.
    urbanizationRate: 69.04,
    netMigrationRate: 1.86,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,5',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'batman',
    plateCode: '72',
    nameTr: 'Batman',
    region: 'GUNEYDOGU_ANADOLU',
    population: 662_626,
    populationYear: 2025,
    areaKm2: 4477,
    districtCount: 6,
    populationDensity: 148, // round(662_626 / 4477)
    elevationM: 610,
    latitude: 37.8636,
    longitude: 41.1562,
    neighborPlateCodes: ['21', '49', '13', '56', '47'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Batman wave-5 Tier-B deep content — 6-field set (hydrographyFeatures + settlementNoteTr
    //    absent/null). urbanizationRate=84.12 is a REAL rate (non-büyükşehir). Independent restatement.
    urbanizationRate: 84.12,
    netMigrationRate: -2.95,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,4',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'diyarbakir',
    plateCode: '21',
    nameTr: 'Diyarbakır',
    region: 'GUNEYDOGU_ANADOLU',
    population: 1_852_356,
    populationYear: 2025,
    areaKm2: 15_101,
    districtCount: 17,
    populationDensity: 123, // round(1_852_356 / 15_101)
    elevationM: 674,
    latitude: 37.9094,
    longitude: 40.2133,
    neighborPlateCodes: ['02', '72', '12', '23', '47', '49', '44', '63'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Diyarbakır wave-5 Tier-A deep content — independent restatement of the fact-checked draft.
    urbanizationRate: 100,
    netMigrationRate: -4.04,
    hydrographyFeatures: [
      { name: 'Dicle Nehri', type: 'nehir' },
      { name: 'Kralkızı Barajı', type: 'baraj' },
      { name: 'Dicle Barajı', type: 'baraj' },
      { name: 'Devegeçidi Barajı', type: 'baraj' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,0',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'gaziantep',
    plateCode: '27',
    nameTr: 'Gaziantep',
    region: 'GUNEYDOGU_ANADOLU',
    population: 2_222_415,
    populationYear: 2025,
    areaKm2: 6803,
    districtCount: 9,
    populationDensity: 327, // round(2_222_415 / 6803)
    elevationM: 700,
    latitude: 36.9468,
    longitude: 37.4617,
    neighborPlateCodes: ['79', '63', '02', '46', '80', '31'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Gaziantep wave-5 Tier-A deep content — independent restatement. netMigrationRate is the
    //    sole POSITIVE Tier-A of the wave (+3,09); GSYH share %1,9 (highest of the nine il).
    urbanizationRate: 100,
    netMigrationRate: 3.09,
    hydrographyFeatures: [
      { name: 'Fırat Nehri', type: 'nehir' },
      { name: 'Nizip Çayı', type: 'nehir' },
      { name: 'Karasu', type: 'nehir' },
      { name: 'Kayacık Barajı', type: 'baraj' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,9',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'kilis',
    plateCode: '79',
    nameTr: 'Kilis',
    region: 'GUNEYDOGU_ANADOLU',
    population: 157_363,
    populationYear: 2025,
    areaKm2: 1412,
    districtCount: 4,
    populationDensity: 111, // round(157_363 / 1412)
    elevationM: 640,
    latitude: 36.7085,
    longitude: 37.1123,
    neighborPlateCodes: ['27'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Kilis wave-5 Tier-B deep content — 6-field set (hydrographyFeatures + settlementNoteTr
    //    absent/null). urbanizationRate=79.93 is a REAL rate; GSYH share %0,1 (lowest of the nine).
    urbanizationRate: 79.93,
    netMigrationRate: -3.43,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,1',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'mardin',
    plateCode: '47',
    nameTr: 'Mardin',
    region: 'GUNEYDOGU_ANADOLU',
    population: 903_576,
    populationYear: 2025,
    areaKm2: 8780,
    districtCount: 10,
    populationDensity: 103, // round(903_576 / 8780)
    elevationM: 1040,
    latitude: 37.3103,
    longitude: 40.7284,
    neighborPlateCodes: ['63', '21', '72', '56', '73'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Mardin wave-5 Tier-B SPECIAL EXCEPTION (→ DEC 2026-07-12). Tier-B depth (hydrographyFeatures
    //    absent → null) BUT büyükşehir since 2012, so urbanizationRate=100 carries a settlementNoteTr
    //    holding ONLY the single 6360 caveat sentence — the THIRD detail-field variant. The exact
    //    settlement content is asserted in its own dedicated test below; here only the three scalars.
    urbanizationRate: 100,
    netMigrationRate: -5.65,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,5',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'siirt',
    plateCode: '56',
    nameTr: 'Siirt',
    region: 'GUNEYDOGU_ANADOLU',
    population: 332_369,
    populationYear: 2025,
    areaKm2: 5717,
    districtCount: 7,
    populationDensity: 58, // round(332_369 / 5717)
    elevationM: 895,
    latitude: 37.9319,
    longitude: 41.9354,
    neighborPlateCodes: ['72', '13', '65', '73', '47'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Siirt wave-5 Tier-B deep content — 6-field set (hydrographyFeatures + settlementNoteTr
    //    absent/null). netMigrationRate=-33.96 is the largest-magnitude value of ANY deep-content
    //    wave (prev record Van -20.02); urbanizationRate=69.56 is a REAL rate. Independent restatement.
    urbanizationRate: 69.56,
    netMigrationRate: -33.96,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,2',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'sanliurfa',
    plateCode: '63',
    nameTr: 'Şanlıurfa',
    region: 'GUNEYDOGU_ANADOLU',
    population: 2_265_800,
    populationYear: 2025,
    areaKm2: 19_242,
    districtCount: 13,
    populationDensity: 118, // round(2_265_800 / 19_242)
    elevationM: 550,
    latitude: 37.1608,
    longitude: 38.7863,
    neighborPlateCodes: ['47', '27', '02', '21'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Şanlıurfa wave-5 Tier-A deep content — independent restatement. Slug stays 'sanliurfa'
    //    (locked, DEC 2026-07-10). netMigrationRate -8,52 is the most-negative Tier-A of the wave.
    urbanizationRate: 100,
    netMigrationRate: -8.52,
    hydrographyFeatures: [
      { name: 'Fırat Nehri', type: 'nehir' },
      { name: 'Atatürk Barajı', type: 'baraj' },
      { name: 'Birecik Barajı', type: 'baraj' },
      { name: 'Karkamış Barajı', type: 'baraj' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,1',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'sirnak',
    plateCode: '73',
    nameTr: 'Şırnak',
    region: 'GUNEYDOGU_ANADOLU',
    population: 573_666,
    populationYear: 2025,
    areaKm2: 7078,
    districtCount: 7,
    populationDensity: 81, // round(573_666 / 7078)
    elevationM: 1350,
    latitude: 37.5209,
    longitude: 42.4523,
    neighborPlateCodes: ['30', '47', '56', '65'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Şırnak wave-5 Tier-B deep content — 6-field set (hydrographyFeatures + settlementNoteTr
    //    absent/null). urbanizationRate=68.33 is a REAL rate and the LOWEST of the nine il. GSYH %0,4.
    urbanizationRate: 68.33,
    netMigrationRate: -14.08,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,4',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  // ── Batch 2 — wave 2 (Marmara, 10 il, İstanbul hariç), alphabetical by nameTr ──
  {
    slug: 'balikesir',
    plateCode: '10',
    nameTr: 'Balıkesir',
    region: 'MARMARA',
    population: 1_284_517,
    populationYear: 2025,
    areaKm2: 14_583,
    districtCount: 20,
    populationDensity: 88, // round(1_284_517 / 14_583)
    elevationM: 110,
    latitude: 39.6551,
    longitude: 27.9207,
    neighborPlateCodes: ['16', '43', '45', '35', '17'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // Balıkesir wave-2 deep content — restated INDEPENDENTLY from the fact-checked draft.
    // Büyükşehir → urbanizationRate 100 (6360 artifact). Structured fields asserted EXACTLY.
    urbanizationRate: 100,
    netMigrationRate: 3.5,
    hydrographyFeatures: [
      { name: 'Manyas Gölü', type: 'gol' },
      { name: 'Susurluk Çayı', type: 'nehir' },
      { name: 'Madra Çayı', type: 'nehir' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,3',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'bilecik',
    plateCode: '11',
    nameTr: 'Bilecik',
    region: 'MARMARA',
    population: 228_995,
    populationYear: 2025,
    areaKm2: 4179,
    districtCount: 8,
    populationDensity: 55, // round(228_995 / 4179)
    elevationM: 539,
    latitude: 40.1414,
    longitude: 29.9772,
    neighborPlateCodes: ['54', '14', '26', '43', '16'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // Bilecik wave-2 deep content — NON-büyükşehir: urbanizationRate is a GENUINE computed
    // rate (84.11, <100), NOT the 6360 legal artifact. netMigrationRate is the sole NEGATIVE.
    urbanizationRate: 84.11,
    netMigrationRate: -0.07,
    hydrographyFeatures: [
      { name: 'Sakarya Nehri', type: 'nehir' },
      { name: 'Karasu', type: 'nehir' },
      { name: 'Kızıldamlar Barajı', type: 'baraj' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,3',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'bursa',
    plateCode: '16',
    nameTr: 'Bursa',
    region: 'MARMARA',
    population: 3_263_011,
    populationYear: 2025,
    areaKm2: 10_813,
    districtCount: 17,
    populationDensity: 302, // round(3_263_011 / 10_813)
    elevationM: 100,
    latitude: 40.2308,
    longitude: 29.0133,
    neighborPlateCodes: ['77', '41', '54', '11', '43', '10'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // Bursa wave-2 deep content — büyükşehir (urbanizationRate 100 = 6360 artifact).
    urbanizationRate: 100,
    netMigrationRate: 4.71,
    hydrographyFeatures: [
      { name: 'İznik Gölü', type: 'gol' },
      { name: 'Uluabat Gölü', type: 'gol' },
      { name: 'Nilüfer Çayı', type: 'nehir' },
      { name: 'Doğancı Barajı', type: 'baraj' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%3,8',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'canakkale',
    plateCode: '17',
    nameTr: 'Çanakkale',
    region: 'MARMARA',
    population: 573_976,
    populationYear: 2025,
    areaKm2: 9817,
    districtCount: 12,
    populationDensity: 58, // round(573_976 / 9817)
    elevationM: 6,
    latitude: 40.141,
    longitude: 26.3993,
    neighborPlateCodes: ['22', '59', '10'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // Çanakkale wave-2 deep content — NON-büyükşehir: genuine urbanizationRate 62.03 (<100).
    urbanizationRate: 62.03,
    netMigrationRate: 6.18,
    hydrographyFeatures: [
      { name: 'Atikhisar Barajı', type: 'baraj' },
      { name: 'Bayramiç Barajı', type: 'baraj' },
      { name: 'Sarıçay', type: 'nehir' },
      { name: 'Tuzla Gölü', type: 'gol' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,6',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'edirne',
    plateCode: '22',
    nameTr: 'Edirne',
    region: 'MARMARA',
    population: 422_438,
    populationYear: 2025,
    areaKm2: 6145,
    districtCount: 9,
    populationDensity: 69, // round(422_438 / 6145)
    elevationM: 51,
    latitude: 41.6767,
    longitude: 26.5508,
    neighborPlateCodes: ['39', '59', '17'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // Edirne wave-2 deep content — NON-büyükşehir: genuine urbanizationRate 77.06 (<100).
    urbanizationRate: 77.06,
    netMigrationRate: 2.4,
    hydrographyFeatures: [
      { name: 'Meriç Nehri', type: 'nehir' },
      { name: 'Tunca Nehri', type: 'nehir' },
      { name: 'Ergene Nehri', type: 'nehir' },
      { name: 'Gala Gölü', type: 'gol' },
      { name: 'Süloğlu Barajı', type: 'baraj' },
      { name: 'Kadıköy Barajı', type: 'baraj' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,4',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'kirklareli',
    plateCode: '39',
    nameTr: 'Kırklareli',
    region: 'MARMARA',
    population: 379_595,
    populationYear: 2025,
    areaKm2: 6459,
    districtCount: 8,
    populationDensity: 59, // round(379_595 / 6459)
    elevationM: 232,
    latitude: 41.7382,
    longitude: 27.2178,
    // İstanbul(34) deliberately EXCLUDED — Atlas boundary-GeoJSON resolution (see seed).
    neighborPlateCodes: ['22', '59'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // Kırklareli wave-2 deep content — NON-büyükşehir: genuine urbanizationRate 74.04 (<100).
    // Single-item hydrographyFeatures by design (İstanbul su-transferi claim unverified).
    urbanizationRate: 74.04,
    netMigrationRate: 3.0,
    hydrographyFeatures: [{ name: 'Kırklareli Barajı', type: 'baraj' }],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,5',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'kocaeli',
    plateCode: '41',
    nameTr: 'Kocaeli',
    region: 'MARMARA',
    population: 2_161_171,
    populationYear: 2025,
    areaKm2: 3397,
    districtCount: 12,
    populationDensity: 636, // round(2_161_171 / 3397)
    elevationM: 0, // İzmit Körfezi kıyısı — 0 m is a real value, not a missing one
    latitude: 40.7663,
    longitude: 29.9173,
    neighborPlateCodes: ['34', '16', '54', '77'],
    // Cfa this wave — NOT Csa; the caveat must be the Cfa variant.
    climateKoppen: 'Cfa',
    climateClassTr: 'Karadeniz iklimi',
    caveatContains: 'Cfa',
    // Kocaeli wave-2 deep content — büyükşehir (urbanizationRate 100 = 6360 artifact).
    urbanizationRate: 100,
    netMigrationRate: 8.11,
    hydrographyFeatures: [
      { name: 'Yuvacık Barajı', type: 'baraj' },
      { name: 'Namazgâh Barajı', type: 'baraj' },
      { name: 'Sapanca Gölü', type: 'gol' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%3,8',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'sakarya',
    plateCode: '54',
    nameTr: 'Sakarya',
    region: 'MARMARA',
    population: 1_123_693,
    populationYear: 2025,
    areaKm2: 4824,
    districtCount: 16,
    populationDensity: 233, // round(1_123_693 / 4824)
    elevationM: 30,
    latitude: 40.7676,
    longitude: 30.3934,
    neighborPlateCodes: ['41', '16', '11', '14', '81'],
    // Cfa this wave — NOT Csa; the caveat must be the Cfa variant.
    climateKoppen: 'Cfa',
    climateClassTr: 'Karadeniz iklimi',
    caveatContains: 'Cfa',
    // Sakarya wave-2 deep content — büyükşehir (urbanizationRate 100 = 6360 artifact).
    urbanizationRate: 100,
    netMigrationRate: 5.97,
    hydrographyFeatures: [
      { name: 'Sakarya Nehri', type: 'nehir' },
      { name: 'Sapanca Gölü', type: 'gol' },
      { name: 'Çark Suyu', type: 'nehir' },
      { name: 'Pamukova Çilekli Barajı', type: 'baraj' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,2',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'tekirdag',
    plateCode: '59',
    nameTr: 'Tekirdağ',
    region: 'MARMARA',
    population: 1_208_441,
    populationYear: 2025,
    areaKm2: 6190,
    districtCount: 11,
    populationDensity: 195, // round(1_208_441 / 6190)
    elevationM: 4,
    latitude: 40.9585,
    longitude: 27.4965,
    neighborPlateCodes: ['34', '39', '22', '17'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // Tekirdağ wave-2 deep content — büyükşehir (urbanizationRate 100 = 6360 artifact).
    // netMigrationRate is the national #2 (+13.09 ‰, behind Yalova).
    urbanizationRate: 100,
    netMigrationRate: 13.09,
    hydrographyFeatures: [
      { name: 'Eriklice Barajı', type: 'baraj' },
      { name: 'Işıklar Deresi', type: 'nehir' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,6',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'yalova',
    plateCode: '77',
    nameTr: 'Yalova',
    region: 'MARMARA',
    population: 311_635,
    populationYear: 2025,
    areaKm2: 798,
    districtCount: 6,
    populationDensity: 391, // round(311_635 / 798)
    elevationM: 4,
    latitude: 40.6589,
    longitude: 29.2796,
    neighborPlateCodes: ['41', '16'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // Yalova wave-2 deep content — NON-büyükşehir: genuine urbanizationRate 72.35 (<100).
    // netMigrationRate is the NATIONAL #1 (+15.59 ‰, all 81 il).
    urbanizationRate: 72.35,
    netMigrationRate: 15.59,
    hydrographyFeatures: [
      { name: 'Gökçe Barajı', type: 'baraj' },
      { name: 'Sarpdere Barajı', type: 'baraj' },
      { name: 'Sellimandıra Deresi', type: 'nehir' },
      { name: 'Dipsiz Göl', type: 'gol' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,3',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  // ── Batch 2 — wave 3 (Ege, 7 il, İzmir hariç), alphabetical by nameTr ──
  {
    slug: 'afyonkarahisar',
    plateCode: '03',
    nameTr: 'Afyonkarahisar',
    region: 'EGE',
    population: 751_808,
    populationYear: 2025,
    areaKm2: 14_016,
    districtCount: 18,
    populationDensity: 54, // round(751_808 / 14_016) = 53.64
    elevationM: 1034,
    latitude: 38.738,
    longitude: 30.5604,
    neighborPlateCodes: ['26', '43', '64', '20', '15', '32', '42'],
    // Cfa this wave (like wave-2 Kocaeli/Sakarya) — NOT Csa; caveat must be the Cfa variant.
    climateKoppen: 'Cfa',
    climateClassTr: 'Karadeniz iklimi',
    caveatContains: 'Cfa',
    // ── Afyonkarahisar wave-3 Tier-B deep content — the 6-field set (NO hydrographyFeatures,
    //    NO settlementNoteTr — those two are DELIBERATELY absent/null and asserted so in the
    //    detail test). urbanizationRate=62.20 is a REAL rate (non-büyükşehir), NOT a 6360
    //    artifact — the platform's first non-100 urbanization figure. Independent restatement.
    urbanizationRate: 62.2,
    netMigrationRate: -5.63,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,6',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'aydin',
    plateCode: '09',
    nameTr: 'Aydın',
    region: 'EGE',
    population: 1_172_107,
    populationYear: 2025,
    areaKm2: 8116,
    districtCount: 17,
    populationDensity: 144, // round(1_172_107 / 8116)
    elevationM: 56,
    latitude: 37.8402,
    longitude: 27.8379,
    neighborPlateCodes: ['35', '45', '20', '48'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Aydın wave-3 Tier-A deep content — independent restatement of the fact-checked draft.
    urbanizationRate: 100,
    netMigrationRate: 4.31,
    hydrographyFeatures: [
      { name: 'Büyük Menderes Nehri', type: 'nehir' },
      { name: 'Çine Çayı', type: 'nehir' },
      { name: 'Çine (Adnan Menderes) Barajı', type: 'baraj' },
      { name: 'Kemer Barajı', type: 'baraj' },
      { name: 'Topçam Barajı', type: 'baraj' },
      { name: 'Bafa Gölü', type: 'gol' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,0',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'denizli',
    plateCode: '20',
    nameTr: 'Denizli',
    region: 'EGE',
    population: 1_060_975,
    populationYear: 2025,
    areaKm2: 12_134,
    districtCount: 19,
    populationDensity: 87, // round(1_060_975 / 12_134)
    elevationM: 425,
    latitude: 37.762,
    longitude: 29.0921,
    // Isparta(32) deliberately EXCLUDED — Burdur intrudes, ~17.5 km gap (fact-check §A.6.1).
    neighborPlateCodes: ['64', '03', '15', '48', '09', '45'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Denizli wave-3 Tier-A deep content — independent restatement of the fact-checked draft.
    urbanizationRate: 100,
    netMigrationRate: 0.99,
    hydrographyFeatures: [
      { name: 'Büyük Menderes Nehri', type: 'nehir' },
      { name: 'Çürüksu Çayı', type: 'nehir' },
      { name: 'Adıgüzel Barajı', type: 'baraj' },
      { name: 'Cindere Barajı', type: 'baraj' },
      { name: 'Işıklı Gölü', type: 'gol' },
      { name: 'Acıgöl', type: 'gol' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,0',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'kutahya',
    plateCode: '43',
    nameTr: 'Kütahya',
    region: 'EGE',
    population: 570_478,
    populationYear: 2025,
    areaKm2: 11_634,
    districtCount: 13,
    populationDensity: 49, // round(570_478 / 11_634)
    elevationM: 969,
    latitude: 39.4171,
    longitude: 29.9891,
    neighborPlateCodes: ['16', '11', '26', '03', '64', '45', '10'],
    // Csb — the platform's THIRD climate class; caveat must name Csb (not Csa/Cfa).
    climateKoppen: 'Csb',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csb',
    // ── Kütahya wave-3 Tier-B deep content — 6-field set (hydrographyFeatures + settlementNoteTr
    //    absent/null). urbanizationRate=74.57 is a REAL rate (non-büyükşehir). Independent restatement.
    urbanizationRate: 74.57,
    netMigrationRate: -3.74,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,5',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'manisa',
    plateCode: '45',
    nameTr: 'Manisa',
    region: 'EGE',
    population: 1_477_756,
    populationYear: 2025,
    areaKm2: 13_339,
    districtCount: 17,
    populationDensity: 111, // round(1_477_756 / 13_339)
    elevationM: 71,
    latitude: 38.6153,
    longitude: 27.4049,
    // Denizli(20) DOES border Manisa (0.00 km via Sarıgöl/Çivril, fact-check §A.6.2).
    neighborPlateCodes: ['10', '35', '43', '64', '09', '20'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Manisa wave-3 Tier-A deep content — restated INDEPENDENTLY from the fact-checked
    //    "Dalga 3" draft (wave3-ege-deep-content-draft.md). Structured fields asserted EXACTLY in
    //    the it.each below; prose gets distinctive-token checks in the wave-3 detail test.
    urbanizationRate: 100,
    netMigrationRate: 0.22,
    hydrographyFeatures: [
      { name: 'Gediz Nehri', type: 'nehir' },
      { name: 'Demirköprü Barajı', type: 'baraj' },
      { name: 'Gördes Barajı', type: 'baraj' },
      { name: 'Alaşehir Kavaklıdere Barajı', type: 'baraj' },
      { name: 'Sarıgöl Buldan Barajı', type: 'baraj' },
      { name: 'Marmara Gölü', type: 'gol' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,5',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'mugla',
    plateCode: '48',
    nameTr: 'Muğla',
    region: 'EGE',
    population: 1_099_547,
    populationYear: 2025,
    areaKm2: 12_654,
    districtCount: 13,
    populationDensity: 87, // round(1_099_547 / 12_654)
    elevationM: 646,
    latitude: 37.2095,
    longitude: 28.3668,
    neighborPlateCodes: ['09', '20', '15', '07'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Muğla wave-3 Tier-A deep content — independent restatement. netMigrationRate=+11,64 is
    //    the HIGHEST of the wave's seven il.
    urbanizationRate: 100,
    netMigrationRate: 11.64,
    hydrographyFeatures: [
      { name: 'Dalaman Çayı', type: 'nehir' },
      { name: 'Eşen Çayı', type: 'nehir' },
      { name: 'Akköprü Barajı', type: 'baraj' },
      { name: 'Geyik Barajı', type: 'baraj' },
      { name: 'Mumcular Barajı', type: 'baraj' },
      { name: 'Köyceğiz Gölü', type: 'gol' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,3',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'usak',
    plateCode: '64',
    nameTr: 'Uşak',
    region: 'EGE',
    population: 374_405,
    populationYear: 2025,
    areaKm2: 5555,
    districtCount: 6,
    populationDensity: 67, // round(374_405 / 5555)
    elevationM: 919,
    latitude: 38.6712,
    longitude: 29.404,
    neighborPlateCodes: ['43', '03', '20', '45'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Uşak wave-3 Tier-B deep content — 6-field set (hydrographyFeatures + settlementNoteTr
    //    absent/null). Least-populous of the wave; urbanizationRate=77.11 is a REAL rate
    //    (non-büyükşehir). Independent restatement.
    urbanizationRate: 77.11,
    netMigrationRate: -2.22,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,3',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  // ── Batch 2 — wave 4 (Akdeniz, 7 il, Antalya hariç), alphabetical by nameTr ──
  {
    slug: 'adana',
    plateCode: '01',
    nameTr: 'Adana',
    region: 'AKDENIZ',
    population: 2_283_609,
    populationYear: 2025,
    areaKm2: 13_844,
    districtCount: 15,
    populationDensity: 165, // round(2_283_609 / 13_844)
    elevationM: 20,
    latitude: 36.9838,
    longitude: 35.298,
    neighborPlateCodes: ['38', '46', '80', '31', '33', '51'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Adana wave-4 Tier-A deep content — restated INDEPENDENTLY from the fact-checked
    //    "Dalga 4" draft. Structured fields asserted EXACTLY in the it.each below; prose gets
    //    distinctive-token checks in the wave-4 Tier-A detail test.
    urbanizationRate: 100,
    netMigrationRate: -0.34,
    hydrographyFeatures: [
      { name: 'Seyhan Nehri', type: 'nehir' },
      { name: 'Ceyhan Nehri', type: 'nehir' },
      { name: 'Seyhan Barajı', type: 'baraj' },
      { name: 'Çatalan Barajı', type: 'baraj' },
      { name: 'Akyatan Gölü', type: 'gol' },
      { name: 'Tuzla Gölü', type: 'gol' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%2,0',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'burdur',
    plateCode: '15',
    nameTr: 'Burdur',
    region: 'AKDENIZ',
    population: 277_226,
    populationYear: 2025,
    areaKm2: 7175,
    districtCount: 11,
    populationDensity: 39, // round(277_226 / 7175)
    elevationM: 957,
    latitude: 37.722,
    longitude: 30.294,
    neighborPlateCodes: ['07', '20', '48', '03', '32'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Burdur wave-4 Tier-B deep content — 6-field set (no hydrographyFeatures /
    //    settlementNoteTr; those are asserted null in the it.each Tier-B branch). urbanizationRate
    //    71.04 is a REAL (non-büyükşehir) rate — the wave's first non-100 value.
    urbanizationRate: 71.04,
    netMigrationRate: -6.52,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,3',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'hatay',
    plateCode: '31',
    nameTr: 'Hatay',
    region: 'AKDENIZ',
    population: 1_577_531,
    populationYear: 2025,
    areaKm2: 5524,
    districtCount: 15,
    populationDensity: 286, // round(1_577_531 / 5524)
    elevationM: 82,
    latitude: 36.3615,
    longitude: 36.2829,
    // Kahramanmaraş(46) deliberately EXCLUDED — ~0.35° gap, not adjacent (fact-check §A.6.1).
    neighborPlateCodes: ['80', '01', '27'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Hatay wave-4 Tier-A deep content — independent restatement of the fact-checked draft.
    //    landformNoteTr carries the 6 Şubat 2023 depremleri paragraph (AFAD-sourced).
    urbanizationRate: 100,
    netMigrationRate: 1.51,
    hydrographyFeatures: [
      { name: 'Asi Nehri', type: 'nehir' },
      { name: 'Karaçay Barajı', type: 'baraj' },
      { name: 'Tahtaköprü Barajı', type: 'baraj' },
      { name: 'Yarseli Barajı', type: 'baraj' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,4',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'isparta',
    plateCode: '32',
    nameTr: 'Isparta',
    region: 'AKDENIZ',
    population: 445_303,
    populationYear: 2025,
    areaKm2: 8946,
    districtCount: 13,
    populationDensity: 50, // round(445_303 / 8946)
    elevationM: 997,
    latitude: 37.7848,
    longitude: 30.7679,
    // Denizli(20) deliberately EXCLUDED — Burdur intrudes (fact-check §A.6.1).
    neighborPlateCodes: ['15', '03', '42', '07'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Isparta wave-4 Tier-B deep content — 6-field set (no hydrographyFeatures /
    //    settlementNoteTr, asserted null in the it.each Tier-B branch). urbanizationRate 75.77 is
    //    a REAL (non-büyükşehir) rate.
    urbanizationRate: 75.77,
    netMigrationRate: -3.31,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,4',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'kahramanmaras',
    plateCode: '46',
    nameTr: 'Kahramanmaraş',
    region: 'AKDENIZ',
    population: 1_146_278,
    populationYear: 2025,
    areaKm2: 14_520,
    districtCount: 11,
    populationDensity: 79, // round(1_146_278 / 14_520)
    // GLOSSARY §1 exception: 572 m from MGM's coordinate-identical Onikişubat record —
    // the literal "Merkez" default returns a broken 0 m (physically impossible inland).
    elevationM: 572,
    latitude: 37.576,
    longitude: 36.915,
    neighborPlateCodes: ['38', '44', '02', '58', '27', '80', '01'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Kahramanmaraş wave-4 Tier-A deep content — independent restatement. landformNoteTr
    //    carries the AFAD fault-segment quake detail (true epicentre) + the CORRECTED Nurhak
    //    Dağı 3.090 m (was 3.081 in an earlier draft; Kahramanmaraş Valiliği Tier-1).
    urbanizationRate: 100,
    netMigrationRate: 6.31,
    hydrographyFeatures: [
      { name: 'Ceyhan Nehri', type: 'nehir' },
      { name: 'Aksu Çayı', type: 'nehir' },
      { name: 'Kılavuzlu Barajı', type: 'baraj' },
      { name: 'Menzelet Barajı', type: 'baraj' },
      { name: 'Sır Barajı', type: 'baraj' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,9',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'mersin',
    plateCode: '33',
    nameTr: 'Mersin',
    region: 'AKDENIZ',
    population: 1_956_428,
    populationYear: 2025,
    areaKm2: 16_010,
    districtCount: 13,
    populationDensity: 122, // round(1_956_428 / 16_010)
    elevationM: 7,
    latitude: 36.812,
    longitude: 34.6411,
    neighborPlateCodes: ['01', '51', '42', '70', '07'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Mersin wave-4 Tier-A deep content — independent restatement. Carries the two
    //    fact-check corrections: Medetsiz Tepesi 3.524 m (was 3.585) in landformNoteTr and
    //    Berdan Barajı 87,5 milyon m³ (was 185) in hydrographyNoteTr.
    urbanizationRate: 100,
    netMigrationRate: 3.01,
    hydrographyFeatures: [
      { name: 'Göksu Nehri', type: 'nehir' },
      { name: 'Berdan Çayı', type: 'nehir' },
      { name: 'Berdan Barajı', type: 'baraj' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%2,1',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'osmaniye',
    plateCode: '80',
    nameTr: 'Osmaniye',
    region: 'AKDENIZ',
    population: 564_123,
    populationYear: 2025,
    areaKm2: 3320,
    districtCount: 7,
    populationDensity: 170, // round(564_123 / 3320)
    elevationM: 94,
    latitude: 37.1021,
    longitude: 36.2539,
    neighborPlateCodes: ['27', '31', '01', '46'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Osmaniye wave-4 Tier-B deep content — 6-field set (no hydrographyFeatures /
    //    settlementNoteTr, asserted null in the it.each Tier-B branch). urbanizationRate 78.24 is
    //    a REAL (non-büyükşehir) rate.
    urbanizationRate: 78.24,
    netMigrationRate: -1.26,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,4',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  // ── Batch 2 — WAVE 6d (Karadeniz-B, 9 BRAND-NEW il), plate order. ALL Tier-B (6-field:
  //    NO hydrographyFeatures, NO settlementNoteTr). climateKoppen MIXED: Csa (Tokat 60,
  //    Sinop 57), Cfa (Zonguldak 67, Bartın 74, Karabük 78, Düzce 81), Cfb (Çorum 19,
  //    Kastamonu 37, Bolu 14 — the platform's FOURTH class, "Karadeniz iklimi" like Cfa).
  //    Restated INDEPENDENTLY from wave6d-karadeniz-b-factcheck (NOT imported from the seed).
  {
    slug: 'tokat',
    plateCode: '60',
    nameTr: 'Tokat',
    region: 'KARADENIZ',
    population: 614_141,
    populationYear: 2025,
    areaKm2: 10_042,
    districtCount: 12,
    populationDensity: 61, // round(614_141 / 10_042)
    elevationM: 611,
    latitude: 40.3312,
    longitude: 36.5577,
    neighborPlateCodes: ['05', '52', '55', '58', '66'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // Tier-B: 6 fields; the two Tier-B omissions (hydrographyFeatures, settlementNoteTr) are absent
    // → asserted null in the detail loop. netMigrationRate +10.41 is the wave's highest positive.
    urbanizationRate: 66.55,
    netMigrationRate: 10.41,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,4',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'corum',
    plateCode: '19',
    nameTr: 'Çorum',
    region: 'KARADENIZ',
    population: 519_590,
    populationYear: 2025,
    areaKm2: 12_428,
    districtCount: 14,
    populationDensity: 42, // round(519_590 / 12_428)
    elevationM: 776,
    latitude: 40.5461,
    longitude: 34.9362,
    neighborPlateCodes: ['05', '18', '37', '55', '57', '66', '71'],
    // Cfb — the FOURTH class; caveat must be the Cfb variant (caveatContains 'Cfb').
    climateKoppen: 'Cfb',
    climateClassTr: 'Karadeniz iklimi',
    caveatContains: 'Cfb',
    urbanizationRate: 76.82,
    netMigrationRate: -12.82,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,4',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'sinop',
    plateCode: '57',
    nameTr: 'Sinop',
    region: 'KARADENIZ',
    population: 225_848,
    populationYear: 2025,
    areaKm2: 5717,
    districtCount: 9,
    populationDensity: 40, // round(225_848 / 5717)
    // MGM "Merkez" istasyonu literal 0 m — GLOSSARY §1 istisnası UYGULANAMADI (draft Bölüm 3).
    elevationM: 0,
    latitude: 42.0299,
    longitude: 35.1545,
    neighborPlateCodes: ['19', '37', '55'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    urbanizationRate: 63.89,
    netMigrationRate: -9.52,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,2',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'kastamonu',
    plateCode: '37',
    nameTr: 'Kastamonu',
    region: 'KARADENIZ',
    population: 379_934,
    populationYear: 2025,
    areaKm2: 13_064,
    districtCount: 20,
    populationDensity: 29, // round(379_934 / 13_064)
    elevationM: 800,
    latitude: 41.371,
    longitude: 33.7756,
    neighborPlateCodes: ['18', '19', '57', '74', '78'],
    climateKoppen: 'Cfb',
    climateClassTr: 'Karadeniz iklimi',
    caveatContains: 'Cfb',
    urbanizationRate: 65.04,
    netMigrationRate: -12.9,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,3',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'zonguldak',
    plateCode: '67',
    nameTr: 'Zonguldak',
    region: 'KARADENIZ',
    population: 585_203,
    populationYear: 2025,
    areaKm2: 3342,
    districtCount: 8,
    populationDensity: 175, // round(585_203 / 3342)
    elevationM: 135,
    latitude: 41.4492,
    longitude: 31.7779,
    neighborPlateCodes: ['14', '74', '78', '81'],
    climateKoppen: 'Cfa',
    climateClassTr: 'Karadeniz iklimi',
    caveatContains: 'Cfa',
    urbanizationRate: 64.21,
    netMigrationRate: -5.93,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,5',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'bartin',
    plateCode: '74',
    nameTr: 'Bartın',
    region: 'KARADENIZ',
    population: 206_663,
    populationYear: 2025,
    areaKm2: 2330,
    districtCount: 4,
    populationDensity: 89, // round(206_663 / 2330)
    elevationM: 33,
    latitude: 41.6248,
    longitude: 32.3569,
    neighborPlateCodes: ['37', '67', '78'],
    climateKoppen: 'Cfa',
    climateClassTr: 'Karadeniz iklimi',
    caveatContains: 'Cfa',
    // urbanizationRate 49.73 = wave's lowest; netMigrationRate -0.63 = most balanced.
    urbanizationRate: 49.73,
    netMigrationRate: -0.63,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,1',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'karabuk',
    plateCode: '78',
    nameTr: 'Karabük',
    region: 'KARADENIZ',
    population: 249_614,
    populationYear: 2025,
    areaKm2: 4142,
    districtCount: 6,
    populationDensity: 60, // round(249_614 / 4142)
    elevationM: 485,
    latitude: 41.2327,
    longitude: 32.6294,
    neighborPlateCodes: ['18', '37', '74', '67', '14'],
    climateKoppen: 'Cfa',
    climateClassTr: 'Karadeniz iklimi',
    caveatContains: 'Cfa',
    // urbanizationRate 77.69 = wave's highest; netMigrationRate -14.31 = wave's highest negative.
    urbanizationRate: 77.69,
    netMigrationRate: -14.31,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,2',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'duzce',
    plateCode: '81',
    nameTr: 'Düzce',
    region: 'KARADENIZ',
    population: 415_622,
    populationYear: 2025,
    areaKm2: 2492,
    districtCount: 8,
    populationDensity: 167, // round(415_622 / 2492)
    elevationM: 146,
    latitude: 40.8437,
    longitude: 31.1488,
    neighborPlateCodes: ['14', '54', '67'],
    climateKoppen: 'Cfa',
    climateClassTr: 'Karadeniz iklimi',
    caveatContains: 'Cfa',
    urbanizationRate: 70.6,
    netMigrationRate: 3.89,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,4',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'bolu',
    plateCode: '14',
    nameTr: 'Bolu',
    region: 'KARADENIZ',
    population: 327_173,
    populationYear: 2025,
    areaKm2: 8313,
    districtCount: 9,
    populationDensity: 39, // round(327_173 / 8313)
    elevationM: 743,
    latitude: 40.7329,
    longitude: 31.6022,
    // 8 neighbours (wave's most) — Ankara/Bilecik/Sakarya ALREADY list Bolu (14) in their own
    // neighborPlateCodes (complete-per-province model), so no existing row needs a bidir edit.
    neighborPlateCodes: ['06', '11', '81', '26', '78', '54', '67', '18'],
    climateKoppen: 'Cfb',
    climateClassTr: 'Karadeniz iklimi',
    caveatContains: 'Cfb',
    urbanizationRate: 74.19,
    netMigrationRate: 1.55,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,4',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  // ── Batch 2 — wave 6b (Doğu Anadolu, 13 il, Van hariç), alphabetical by nameTr ──
  // All Tier-B; FOUR new Köppen classes this wave (Dfb/Dsb/Dsa → "Karasal iklim",
  // BSk → "Yarı Kurak Step İklimi", → DEC 2026-07-12). Erzurum 25 + Malatya 44 are the
  // Tier-B-but-büyükşehir exception (urbanizationRate 100; settlement content in their own
  // dedicated tests). Values traced INDEPENDENTLY to wave6b-dogu-anadolu-draft.md (fact-checked).
  {
    slug: 'agri',
    plateCode: '04',
    nameTr: 'Ağrı',
    region: 'DOGU_ANADOLU',
    population: 491_489,
    populationYear: 2025,
    areaKm2: 11_099,
    districtCount: 8,
    populationDensity: 44, // round(491_489 / 11_099)
    elevationM: 1646,
    latitude: 39.7253,
    longitude: 43.0522,
    neighborPlateCodes: ['36', '76', '25', '49', '13', '65'],
    climateKoppen: 'Dsb',
    climateClassTr: 'Karasal iklim',
    caveatContains: 'Dsb',
    // Tier-B, non-büyükşehir: urbanizationRate 62.76 is a REAL rate. netMigrationRate -32.59 is
    // among the wave's most negative. GSYH share %0,2.
    urbanizationRate: 62.76,
    netMigrationRate: -32.59,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,2',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'ardahan',
    plateCode: '75',
    nameTr: 'Ardahan',
    region: 'DOGU_ANADOLU',
    population: 90_392,
    populationYear: 2025,
    areaKm2: 4934,
    districtCount: 6,
    populationDensity: 18, // round(90_392 / 4934)
    elevationM: 1827,
    latitude: 41.1061,
    longitude: 42.7055,
    neighborPlateCodes: ['08', '25', '36'],
    climateKoppen: 'Dsb',
    climateClassTr: 'Karasal iklim',
    caveatContains: 'Dsb',
    // Tier-B, non-büyükşehir: urbanizationRate 45.19 is the wave's LOWEST (REAL rate). GSYH share %0,1.
    urbanizationRate: 45.19,
    netMigrationRate: -20.27,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,1',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'bingol',
    plateCode: '12',
    nameTr: 'Bingöl',
    region: 'DOGU_ANADOLU',
    population: 282_299,
    populationYear: 2025,
    areaKm2: 8003,
    districtCount: 8,
    populationDensity: 35, // round(282_299 / 8003)
    elevationM: 1139,
    latitude: 38.8847,
    longitude: 40.5007,
    neighborPlateCodes: ['49', '24', '25', '62', '23', '21'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // Tier-B, non-büyükşehir: urbanizationRate 70.55 is a REAL rate. GSYH share %0,2.
    urbanizationRate: 70.55,
    netMigrationRate: -13.2,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,2',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'bitlis',
    plateCode: '13',
    nameTr: 'Bitlis',
    region: 'DOGU_ANADOLU',
    population: 360_423,
    populationYear: 2025,
    areaKm2: 8294,
    districtCount: 7,
    populationDensity: 43, // round(360_423 / 8294)
    elevationM: 1789,
    latitude: 38.475,
    longitude: 42.1625,
    neighborPlateCodes: ['49', '04', '65', '56', '72'],
    climateKoppen: 'Dsa',
    climateClassTr: 'Karasal iklim',
    caveatContains: 'Dsa',
    // Tier-B, non-büyükşehir: urbanizationRate 66.88 is a REAL rate. GSYH share %0,2.
    urbanizationRate: 66.88,
    netMigrationRate: -12.42,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,2',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'elazig',
    plateCode: '23',
    nameTr: 'Elazığ',
    region: 'DOGU_ANADOLU',
    population: 605_678,
    populationYear: 2025,
    areaKm2: 9383,
    districtCount: 11,
    populationDensity: 65, // round(605_678 / 9383)
    elevationM: 881,
    latitude: 38.6058,
    longitude: 39.2973,
    neighborPlateCodes: ['12', '62', '24', '44', '21'],
    climateKoppen: 'BSk',
    climateClassTr: 'Yarı Kurak Step İklimi',
    caveatContains: 'BSk',
    // Tier-B, non-büyükşehir: urbanizationRate 80.09 is a REAL rate. Keban figures corrected by the
    // fact-check (1.330 MW / 6,6 milyar kWh). GSYH share %0,5.
    urbanizationRate: 80.09,
    netMigrationRate: -5.42,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,5',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'erzincan',
    plateCode: '24',
    nameTr: 'Erzincan',
    region: 'DOGU_ANADOLU',
    population: 239_625,
    populationYear: 2025,
    areaKm2: 11_815,
    districtCount: 9,
    populationDensity: 20, // round(239_625 / 11_815)
    elevationM: 1216,
    latitude: 39.7523,
    longitude: 39.4868,
    neighborPlateCodes: ['25', '58', '62', '12', '23', '44', '29', '69', '28'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // Tier-B, non-büyükşehir: urbanizationRate 75.99 is a REAL rate. introTr cites TÜİK's own 21
    // kişi/km² density figure; our populationDensity=20 stays consistent with our pop÷area
    // (same prose-vs-computed pattern as İstanbul). GSYH share %0,2.
    urbanizationRate: 75.99,
    netMigrationRate: -11.95,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,2',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'erzurum',
    plateCode: '25',
    nameTr: 'Erzurum',
    region: 'DOGU_ANADOLU',
    population: 736_877,
    populationYear: 2025,
    areaKm2: 25_006,
    districtCount: 20,
    populationDensity: 29, // round(736_877 / 25_006)
    elevationM: 1860,
    latitude: 39.9058,
    longitude: 41.2544,
    neighborPlateCodes: ['69', '24', '12', '49', '04', '36', '75', '08', '53'],
    climateKoppen: 'Dfb',
    climateClassTr: 'Karasal iklim',
    caveatContains: 'Dfb',
    // Tier-B-but-büyükşehir EXCEPTION (→ DEC 2026-07-12): urbanizationRate=100 is the 6360 artifact,
    // carrying the single-sentence settlementNoteTr (asserted in the dedicated test below); here only
    // the three scalars. Türkiye's most-neighboured il (9). GSYH share %0,5.
    urbanizationRate: 100,
    netMigrationRate: -15.86,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,5',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'hakkari',
    plateCode: '30',
    nameTr: 'Hakkari',
    region: 'DOGU_ANADOLU',
    population: 279_681,
    populationYear: 2025,
    areaKm2: 7095,
    districtCount: 5,
    populationDensity: 39, // round(279_681 / 7095)
    elevationM: 1727,
    latitude: 37.5744,
    longitude: 43.7388,
    neighborPlateCodes: ['65', '73'],
    climateKoppen: 'Dsa',
    climateClassTr: 'Karasal iklim',
    caveatContains: 'Dsa',
    // Tier-B, non-büyükşehir: urbanizationRate 66.55 is a REAL rate. Türkiye içinde SADECE 2 komşu.
    // GSYH share %0,2.
    urbanizationRate: 66.55,
    netMigrationRate: -19.77,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,2',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'igdir',
    plateCode: '76',
    nameTr: 'Iğdır',
    region: 'DOGU_ANADOLU',
    population: 205_071,
    populationYear: 2025,
    areaKm2: 3664,
    districtCount: 4,
    populationDensity: 56, // round(205_071 / 3664)
    elevationM: 856,
    latitude: 39.9227,
    longitude: 44.0523,
    neighborPlateCodes: ['04', '36'],
    climateKoppen: 'BSk',
    climateClassTr: 'Yarı Kurak Step İklimi',
    caveatContains: 'BSk',
    // Tier-B, non-büyükşehir: urbanizationRate 59.56 is a REAL rate. Türkiye içinde SADECE 2 komşu.
    // GSYH share %0,1.
    urbanizationRate: 59.56,
    netMigrationRate: -18.1,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,1',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'kars',
    plateCode: '36',
    nameTr: 'Kars',
    region: 'DOGU_ANADOLU',
    population: 268_991,
    populationYear: 2025,
    areaKm2: 10_193,
    districtCount: 8,
    populationDensity: 26, // round(268_991 / 10_193)
    elevationM: 1795,
    latitude: 40.6042,
    longitude: 43.1073,
    neighborPlateCodes: ['75', '04', '76', '25'],
    climateKoppen: 'Dfb',
    climateClassTr: 'Karasal iklim',
    caveatContains: 'Dfb',
    // Tier-B, non-büyükşehir: urbanizationRate 55.19 is a REAL rate. GSYH share %0,2.
    urbanizationRate: 55.19,
    netMigrationRate: -25.28,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,2',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'malatya',
    plateCode: '44',
    nameTr: 'Malatya',
    region: 'DOGU_ANADOLU',
    population: 755_854,
    populationYear: 2025,
    areaKm2: 12_259,
    districtCount: 13,
    populationDensity: 62, // round(755_854 / 12_259)
    elevationM: 950,
    latitude: 38.35,
    longitude: 38.25,
    neighborPlateCodes: ['23', '24', '58', '46', '02', '21'],
    climateKoppen: 'BSk',
    climateClassTr: 'Yarı Kurak Step İklimi',
    caveatContains: 'BSk',
    // Tier-B-but-büyükşehir EXCEPTION (→ DEC 2026-07-12): urbanizationRate=100 with the
    // single-sentence settlementNoteTr (dedicated test below). The wave's SOLE positive net
    // migration (+6.88 ‰). GSYH share %0,6 (wave's highest).
    urbanizationRate: 100,
    netMigrationRate: 6.88,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,6',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'mus',
    plateCode: '49',
    nameTr: 'Muş',
    region: 'DOGU_ANADOLU',
    population: 389_127,
    populationYear: 2025,
    areaKm2: 8718,
    districtCount: 6,
    populationDensity: 45, // round(389_127 / 8718)
    elevationM: 1316,
    latitude: 38.7509,
    longitude: 41.5023,
    neighborPlateCodes: ['13', '12', '25', '04', '21', '72'],
    climateKoppen: 'Dsa',
    climateClassTr: 'Karasal iklim',
    caveatContains: 'Dsa',
    // Tier-B, non-büyükşehir: urbanizationRate 51.26 is a REAL rate. GSYH share %0,2.
    urbanizationRate: 51.26,
    netMigrationRate: -27.33,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,2',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'tunceli',
    plateCode: '62',
    nameTr: 'Tunceli',
    region: 'DOGU_ANADOLU',
    population: 85_083,
    populationYear: 2025,
    areaKm2: 7582,
    districtCount: 8,
    populationDensity: 11, // round(85_083 / 7582)
    elevationM: 981,
    latitude: 39.1058,
    longitude: 39.5408,
    neighborPlateCodes: ['24', '12', '23'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // Tier-B, non-büyükşehir: urbanizationRate 67.04 is a REAL rate. neighborPlateCodes is 3 (Sivas
    // 58 removed by the fact-check). Türkiye's 2nd least-populous il. GSYH share %0,1.
    urbanizationRate: 67.04,
    netMigrationRate: -24.28,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,1',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  // ── Wave 6a (İç Anadolu, 12 brand-new il) — restated INDEPENDENTLY from the fact-checked
  //    wave6a-ic-anadolu draft (SEED-READY WITH CORRECTIONS). Köppen is MIXED: 6× BSk
  //    (Konya/Eskişehir/Niğde/Aksaray/Karaman/Kırıkkale, caveatContains 'BSk' — BSk was
  //    introduced by wave-6b, these reuse it), 3× Csa, 2× Csb, 1× Cfa. Konya + Kayseri are Tier-A (full 8-field);
  //    Eskişehir is the Tier-B-but-büyükşehir exception (→ DEC 2026-07-12, mirrors Mardin); the
  //    other 9 are plain Tier-B (hydrographyFeatures + settlementNoteTr null). ──
  {
    slug: 'konya',
    plateCode: '42',
    nameTr: 'Konya',
    region: 'IC_ANADOLU',
    population: 2_343_409,
    populationYear: 2025,
    areaKm2: 40_838,
    districtCount: 31,
    populationDensity: 57, // round(2_343_409 / 40_838)
    elevationM: 1029,
    latitude: 37.8687,
    longitude: 32.4713,
    neighborPlateCodes: ['06', '68', '51', '33', '70', '07', '32', '03', '26'],
    climateKoppen: 'BSk',
    climateClassTr: 'Yarı Kurak Step İklimi',
    caveatContains: 'BSk',
    // ── Konya wave-6a Tier-A — the FULL 8-field set. urbanizationRate=100 is the 6360
    //    büyükşehir artifact (framed in settlementNoteTr); net göç -0,97 ‰; GSYH %2,1.
    urbanizationRate: 100,
    netMigrationRate: -0.97,
    hydrographyFeatures: [
      { name: 'Çarşamba Çayı', type: 'nehir' },
      { name: 'Apa Barajı', type: 'baraj' },
      { name: 'Altınapa Barajı', type: 'baraj' },
      { name: 'Beyşehir Gölü', type: 'gol' },
      { name: 'Tuz Gölü', type: 'gol' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%2,1',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'kayseri',
    plateCode: '38',
    nameTr: 'Kayseri',
    region: 'IC_ANADOLU',
    population: 1_458_991,
    populationYear: 2025,
    areaKm2: 16_970,
    districtCount: 16,
    populationDensity: 86, // round(1_458_991 / 16_970)
    elevationM: 1094,
    latitude: 38.687,
    longitude: 35.5,
    neighborPlateCodes: ['66', '58', '46', '01', '51', '50'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Kayseri wave-6a Tier-A — FULL 8-field set. urbanizationRate=100 is the 6360
    //    büyükşehir artifact; net göç +0,92 ‰; GSYH %1,4.
    urbanizationRate: 100,
    netMigrationRate: 0.92,
    hydrographyFeatures: [
      { name: 'Zamantı Irmağı', type: 'nehir' },
      { name: 'Sarımsaklı Deresi', type: 'nehir' },
      { name: 'Sultansazlığı', type: 'gol' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,4',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'eskisehir',
    plateCode: '26',
    nameTr: 'Eskişehir',
    region: 'IC_ANADOLU',
    population: 927_956,
    populationYear: 2025,
    areaKm2: 13_960,
    districtCount: 14,
    populationDensity: 66, // round(927_956 / 13_960)
    elevationM: 801,
    latitude: 39.7656,
    longitude: 30.5502,
    neighborPlateCodes: ['06', '43', '11', '03', '42', '14'],
    climateKoppen: 'BSk',
    climateClassTr: 'Yarı Kurak Step İklimi',
    caveatContains: 'BSk',
    // ── Eskişehir wave-6a Tier-B-but-büyükşehir EXCEPTION (→ DEC 2026-07-12, mirrors Mardin):
    //    hydrographyFeatures null (Tier-B) BUT settlementNoteTr POPULATED with the single 6360
    //    caveat sentence (urbanizationRate=100 is the büyükşehir legal artifact). net göç +7,43 ‰
    //    (this wave's highest positive); GSYH %1,1. Exact one-sentence content asserted in the
    //    dedicated Eskişehir exception test.
    urbanizationRate: 100,
    netMigrationRate: 7.43,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,1',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'sivas',
    plateCode: '58',
    nameTr: 'Sivas',
    region: 'IC_ANADOLU',
    population: 631_401,
    populationYear: 2025,
    areaKm2: 28_164,
    districtCount: 17,
    populationDensity: 22, // round(631_401 / 28_164)
    elevationM: 1294,
    latitude: 39.7437,
    longitude: 37.002,
    neighborPlateCodes: ['44', '46', '38', '66', '60', '52', '28', '24'],
    climateKoppen: 'Csb',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csb',
    // ── Sivas wave-6a plain Tier-B (non-büyükşehir): hydrographyFeatures + settlementNoteTr null.
    //    urbanizationRate=77.38 REAL rate; net göç -21,14 ‰; GSYH %0,5.
    urbanizationRate: 77.38,
    netMigrationRate: -21.14,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,5',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'yozgat',
    plateCode: '66',
    nameTr: 'Yozgat',
    region: 'IC_ANADOLU',
    population: 413_208,
    populationYear: 2025,
    areaKm2: 13_690,
    districtCount: 14,
    populationDensity: 30, // round(413_208 / 13_690)
    elevationM: 1301,
    latitude: 39.8243,
    longitude: 34.8159,
    neighborPlateCodes: ['19', '05', '60', '58', '38', '50', '40', '71'],
    climateKoppen: 'Csb',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csb',
    // ── Yozgat wave-6a plain Tier-B: hydrographyFeatures + settlementNoteTr null.
    //    urbanizationRate=66.93; net göç -20,23 ‰; GSYH %0,3.
    urbanizationRate: 66.93,
    netMigrationRate: -20.23,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,3',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'kirsehir',
    plateCode: '40',
    nameTr: 'Kırşehir',
    region: 'IC_ANADOLU',
    population: 242_777,
    populationYear: 2025,
    areaKm2: 6584,
    districtCount: 7,
    populationDensity: 37, // round(242_777 / 6584)
    elevationM: 1007,
    latitude: 39.1639,
    longitude: 34.1561,
    neighborPlateCodes: ['71', '66', '50', '68', '06'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Kırşehir wave-6a plain Tier-B: hydrographyFeatures + settlementNoteTr null.
    //    urbanizationRate=81.81; net göç -4,57 ‰; GSYH %0,2.
    urbanizationRate: 81.81,
    netMigrationRate: -4.57,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,2',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'nevsehir',
    plateCode: '50',
    nameTr: 'Nevşehir',
    region: 'IC_ANADOLU',
    population: 320_150,
    populationYear: 2025,
    areaKm2: 5485,
    districtCount: 8,
    populationDensity: 58, // round(320_150 / 5485)
    elevationM: 1260,
    latitude: 38.6163,
    longitude: 34.7025,
    neighborPlateCodes: ['68', '40', '66', '38', '51'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // ── Nevşehir wave-6a plain Tier-B: hydrographyFeatures + settlementNoteTr null.
    //    urbanizationRate=66.42; net göç +4,05 ‰; GSYH %0,3.
    urbanizationRate: 66.42,
    netMigrationRate: 4.05,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,3',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'nigde',
    plateCode: '51',
    nameTr: 'Niğde',
    region: 'IC_ANADOLU',
    population: 374_492,
    populationYear: 2025,
    areaKm2: 7234,
    districtCount: 6,
    populationDensity: 52, // round(374_492 / 7234)
    elevationM: 1211,
    latitude: 37.9587,
    longitude: 34.6795,
    neighborPlateCodes: ['68', '50', '38', '42', '33', '01'],
    climateKoppen: 'BSk',
    climateClassTr: 'Yarı Kurak Step İklimi',
    caveatContains: 'BSk',
    // ── Niğde wave-6a plain Tier-B (BSk): hydrographyFeatures + settlementNoteTr null.
    //    urbanizationRate=62.92; net göç -13,92 ‰; GSYH %0,3.
    urbanizationRate: 62.92,
    netMigrationRate: -13.92,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,3',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'aksaray',
    plateCode: '68',
    nameTr: 'Aksaray',
    region: 'IC_ANADOLU',
    population: 441_136,
    populationYear: 2025,
    areaKm2: 7659,
    districtCount: 8,
    populationDensity: 58, // round(441_136 / 7659)
    elevationM: 970,
    latitude: 38.3705,
    longitude: 33.9987,
    neighborPlateCodes: ['50', '51', '42', '06', '40'],
    climateKoppen: 'BSk',
    climateClassTr: 'Yarı Kurak Step İklimi',
    caveatContains: 'BSk',
    // ── Aksaray wave-6a plain Tier-B (BSk): hydrographyFeatures + settlementNoteTr null.
    //    urbanizationRate=74.20; net göç -2,10 ‰; GSYH %0,4.
    urbanizationRate: 74.2,
    netMigrationRate: -2.1,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,4',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'karaman',
    plateCode: '70',
    nameTr: 'Karaman',
    region: 'IC_ANADOLU',
    population: 262_355,
    populationYear: 2025,
    areaKm2: 8678,
    districtCount: 6,
    populationDensity: 30, // round(262_355 / 8678)
    elevationM: 1018,
    latitude: 37.1932,
    longitude: 33.2202,
    // 3 komşu — Niğde ve Adana fact-check GeoJSON geometrik analiziyle ÇIKARILDI.
    neighborPlateCodes: ['42', '07', '33'],
    climateKoppen: 'BSk',
    climateClassTr: 'Yarı Kurak Step İklimi',
    caveatContains: 'BSk',
    // ── Karaman wave-6a plain Tier-B (BSk): hydrographyFeatures + settlementNoteTr null.
    //    urbanizationRate=77.02; net göç -5,79 ‰; GSYH %0,3.
    urbanizationRate: 77.02,
    netMigrationRate: -5.79,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,3',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'kirikkale',
    plateCode: '71',
    nameTr: 'Kırıkkale',
    region: 'IC_ANADOLU',
    population: 282_830,
    populationYear: 2025,
    areaKm2: 4791,
    districtCount: 9,
    populationDensity: 59, // round(282_830 / 4791)
    elevationM: 751,
    latitude: 39.8433,
    longitude: 33.5181,
    // 5 komşu — Bolu fact-check GeoJSON geometrik analiziyle ÇIKARILDI.
    neighborPlateCodes: ['06', '66', '18', '40', '19'],
    climateKoppen: 'BSk',
    climateClassTr: 'Yarı Kurak Step İklimi',
    caveatContains: 'BSk',
    // ── Kırıkkale wave-6a plain Tier-B (BSk): hydrographyFeatures + settlementNoteTr null.
    //    urbanizationRate=88.16; net göç -11,58 ‰; GSYH %0,3.
    urbanizationRate: 88.16,
    netMigrationRate: -11.58,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,3',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'cankiri',
    plateCode: '18',
    nameTr: 'Çankırı',
    region: 'IC_ANADOLU',
    population: 200_549,
    populationYear: 2025,
    areaKm2: 7542,
    districtCount: 12,
    populationDensity: 27, // round(200_549 / 7542)
    elevationM: 755,
    latitude: 40.6082,
    longitude: 33.6102,
    neighborPlateCodes: ['78', '37', '19', '71', '06', '14'],
    climateKoppen: 'Cfa',
    climateClassTr: 'Karadeniz iklimi',
    caveatContains: 'Cfa',
    // ── Çankırı wave-6a plain Tier-B (Cfa — Karadeniz'e geçiş kuşağı): hydrographyFeatures +
    //    settlementNoteTr null. urbanizationRate=69.39; net göç -27,69 ‰ (this wave's most
    //    negative); GSYH %0,2.
    urbanizationRate: 69.39,
    netMigrationRate: -27.69,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,2',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  // ── wave-6c (Karadeniz-A, 9 il), alphabetical by nameTr. FIRST provinces in the
  //    Karadeniz region. Values restated INDEPENDENTLY from wave6c-karadeniz-a-factcheck.md
  //    (2026-07-12, SEED-READY WITH CORRECTIONS — netMigrationRate re-read from TÜİK's own
  //    "Net göç hızı" column). Samsun 55 Tier-A (full, hydrographyFeatures); Trabzon 61 + Ordu
  //    52 the Tier-B-but-büyükşehir exception (settlementNoteTr populated, asserted in their
  //    dedicated tests); the other six plain Tier-B. Two NEW Köppen classes: Artvin 08 = Cfb
  //    (caveatContains 'Cfb', climateClassTr 'Karadeniz iklimi'), Bayburt 69 = Dsb ('Dsb',
  //    'Karasal iklim'). Trabzon 61 is Csa despite being coastal (MGM's own row). Gümüşhane 29
  //    = Csb (existing 3rd class). Gümüşhane -42,80 ‰ + Bayburt -35,16 ‰ are the platform's two
  //    largest net-migration magnitudes.
  {
    slug: 'amasya',
    plateCode: '05',
    nameTr: 'Amasya',
    region: 'KARADENIZ',
    population: 342_242,
    populationYear: 2025,
    areaKm2: 5628,
    districtCount: 7,
    populationDensity: 61, // round(342_242 / 5628)
    elevationM: 409,
    latitude: 40.6668,
    longitude: 35.8353,
    neighborPlateCodes: ['55', '60', '66', '19'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // Plain Tier-B — 6-field set (no hydrographyFeatures / settlementNoteTr, asserted null in the
    // it.each Tier-B branch). urbanizationRate 75.80 is a REAL rate (non-büyükşehir), batch's highest.
    urbanizationRate: 75.8,
    netMigrationRate: -1.65,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,3',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'artvin',
    plateCode: '08',
    nameTr: 'Artvin',
    region: 'KARADENIZ',
    population: 167_531,
    populationYear: 2025,
    areaKm2: 7393,
    districtCount: 9,
    populationDensity: 23, // round(167_531 / 7393)
    elevationM: 613,
    latitude: 41.1752,
    longitude: 41.8187,
    neighborPlateCodes: ['53', '25', '75'],
    climateKoppen: 'Cfb',
    climateClassTr: 'Karadeniz iklimi',
    caveatContains: 'Cfb',
    // Plain Tier-B — the platform's FIRST Cfb il (4th Köppen class; "Karadeniz iklimi", same label
    // as Cfa, DEC 2026-07-12). urbanizationRate 65.27 REAL; net göç -16,00. GSYH share %0,1.
    urbanizationRate: 65.27,
    netMigrationRate: -16,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,1',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'bayburt',
    plateCode: '69',
    nameTr: 'Bayburt',
    region: 'KARADENIZ',
    population: 82_836,
    populationYear: 2025,
    areaKm2: 3746,
    districtCount: 3,
    populationDensity: 22, // round(82_836 / 3746)
    elevationM: 1584,
    latitude: 40.2547,
    longitude: 40.2207,
    neighborPlateCodes: ['61', '29', '53', '25', '24'],
    climateKoppen: 'Dsb',
    climateClassTr: 'Karasal iklim',
    caveatContains: 'Dsb',
    // Plain Tier-B — the platform's FIRST Dsb / "D" main-group il ("Karasal iklim", DEC 2026-07-12).
    // netMigrationRate -35.16 is the platform's 2ND-largest magnitude (surpasses old Siirt -33.96).
    urbanizationRate: 65.95,
    netMigrationRate: -35.16,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,1',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'giresun',
    plateCode: '28',
    nameTr: 'Giresun',
    region: 'KARADENIZ',
    population: 455_074,
    populationYear: 2025,
    areaKm2: 6972,
    districtCount: 16,
    populationDensity: 65, // round(455_074 / 6972)
    elevationM: 38,
    latitude: 40.9227,
    longitude: 38.3878,
    neighborPlateCodes: ['61', '29', '24', '58', '52'],
    climateKoppen: 'Cfa',
    climateClassTr: 'Karadeniz iklimi',
    caveatContains: 'Cfa',
    // Plain Tier-B, Cfa. urbanizationRate 67.73 REAL; net göç -12,17. GSYH share %0,3.
    urbanizationRate: 67.73,
    netMigrationRate: -12.17,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,3',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'gumushane',
    plateCode: '29',
    nameTr: 'Gümüşhane',
    region: 'KARADENIZ',
    population: 138_807,
    populationYear: 2025,
    areaKm2: 6668,
    districtCount: 6,
    populationDensity: 21, // round(138_807 / 6668)
    elevationM: 1216,
    latitude: 40.4598,
    longitude: 39.4653,
    neighborPlateCodes: ['61', '28', '69', '24'],
    climateKoppen: 'Csb',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csb',
    // Plain Tier-B, Csb (the existing wave-3 3rd class). urbanizationRate 61.03 REAL, batch's lowest.
    // netMigrationRate -42.80 is the platform's LARGEST-magnitude value (new record). GSYH share %0,1.
    urbanizationRate: 61.03,
    netMigrationRate: -42.8,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,1',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'ordu',
    plateCode: '52',
    nameTr: 'Ordu',
    region: 'KARADENIZ',
    population: 768_087,
    populationYear: 2025,
    areaKm2: 5914,
    districtCount: 19,
    populationDensity: 130, // round(768_087 / 5914)
    elevationM: 5,
    latitude: 40.9838,
    longitude: 37.8858,
    neighborPlateCodes: ['55', '28', '60', '58'],
    climateKoppen: 'Cfa',
    climateClassTr: 'Karadeniz iklimi',
    caveatContains: 'Cfa',
    // Tier-B-but-büyükşehir EXCEPTION (→ DEC 2026-07-12, like Mardin): urbanizationRate 100 is the
    // 6360 artifact + a single-sentence settlementNoteTr (asserted in the dedicated Ordu test).
    // hydrographyFeatures still null (Tier-B). net göç -7,25. GSYH share %0,5.
    urbanizationRate: 100,
    netMigrationRate: -7.25,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,5',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'rize',
    plateCode: '53',
    nameTr: 'Rize',
    region: 'KARADENIZ',
    population: 346_947,
    populationYear: 2025,
    areaKm2: 3835,
    districtCount: 12,
    populationDensity: 90, // round(346_947 / 3835)
    elevationM: 0,
    latitude: 41.04,
    longitude: 40.5013,
    neighborPlateCodes: ['61', '08', '69', '25'],
    climateKoppen: 'Cfa',
    climateClassTr: 'Karadeniz iklimi',
    caveatContains: 'Cfa',
    // Plain Tier-B, Cfa. Türkiye's rainiest il. urbanizationRate 68.02 REAL; net göç -11,87. GSYH %0,3.
    urbanizationRate: 68.02,
    netMigrationRate: -11.87,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,3',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'samsun',
    plateCode: '55',
    nameTr: 'Samsun',
    region: 'KARADENIZ',
    population: 1_392_403,
    populationYear: 2025,
    areaKm2: 9725,
    districtCount: 17,
    populationDensity: 143, // round(1_392_403 / 9725)
    elevationM: 4,
    latitude: 41.3442,
    longitude: 36.2564,
    neighborPlateCodes: ['57', '52', '05', '60', '19'],
    climateKoppen: 'Cfa',
    climateClassTr: 'Karadeniz iklimi',
    caveatContains: 'Cfa',
    // Tier-A (the batch's SOLE ≥1M il) — FULL 8-field set incl. hydrographyFeatures. Büyükşehir →
    // urbanizationRate 100 (6360 artifact, framed in a FULL settlementNoteTr). netMigrationRate
    // +2.60 is the batch's SOLE positive; GSYH share %1,2 (highest of the nine).
    urbanizationRate: 100,
    netMigrationRate: 2.6,
    hydrographyFeatures: [
      { name: 'Kızılırmak', type: 'nehir' },
      { name: 'Yeşilırmak', type: 'nehir' },
      { name: 'Çakmak Barajı', type: 'baraj' },
      { name: 'Liman Gölü', type: 'gol' },
    ],
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,2',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    slug: 'trabzon',
    plateCode: '61',
    nameTr: 'Trabzon',
    region: 'KARADENIZ',
    population: 823_323,
    populationYear: 2025,
    areaKm2: 4628,
    districtCount: 18,
    populationDensity: 178, // round(823_323 / 4628)
    elevationM: 39,
    latitude: 40.9985,
    longitude: 39.7649,
    neighborPlateCodes: ['53', '28', '29', '69'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'Csa',
    // Tier-B-but-büyükşehir EXCEPTION (→ DEC 2026-07-12, like Mardin/Ordu): urbanizationRate 100 is
    // the 6360 artifact + a single-sentence settlementNoteTr (asserted in the dedicated Trabzon
    // test). Csa DESPITE being coastal (MGM's own row). hydrographyFeatures null. GSYH share %0,6.
    urbanizationRate: 100,
    netMigrationRate: -3.78,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,6',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
] as const;

/**
 * Real-Postgres e2e (Testcontainers): proves the migrations run clean, the
 * `db:seed:geography` seed lands ALL 81 fact-checked provinces (5 pilot + 9 Batch 2
 * wave-1 + 10 Batch 2 wave-2 + 7 Batch 2 wave-3 + 7 Batch 2 wave-4 + 9 wave-6d
 * Karadeniz-B + 13 wave-6b Doğu Anadolu + 12 wave-6a İç Anadolu) IDEMPOTENTLY (no
 * duplicate rows, no `updated_at` bump on a no-op re-seed), and the public read
 * endpoints serve that data under the `/api` prefix. Runs on CI only (needs Docker);
 * locally we run tsc + eslint per CONVENTIONS §2.
 */
describe('Province (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;

  // Captured in beforeAll (setup MUST run there), asserted in named it() blocks so a
  // red run points at the exact failed check. THREE seed phases — the wave-4 collapse
  // of the old per-wave chain (empty → pilot → +wave-1 → +wave-2 → +wave-3 → re-run),
  // per the concrete trigger the earlier waves recorded: at wave-4, stop adding one
  // phase per wave and keep a REPRESENTATIVE set — empty→first all-insert + ONE
  // multi-batch mixed transition + full no-op — since per-row independence does not
  // care how many prior batches the no-op set spans. The three phases still exercise
  // all three homogeneous+mixed seed paths (all-insert, mixed insert/no-op, full
  // no-op); the `updated` path is covered separately by the drift + retraction tests
  // below.
  let appliedMigrationNames: string[];
  let pilotOnlySeed: SeedGeographyResult;
  let fullMixedSeed: SeedGeographyResult;
  let reSeed: SeedGeographyResult;
  let istanbulUpdatedAtAfterPilotInsert: string;
  let istanbulUpdatedAtAfterFullInsert: string;
  let istanbulUpdatedAtAfterReseed: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();

    // The app reads these from the env at boot (zod-validated).
    process.env.DATABASE_URL = url;
    process.env.WEB_ORIGIN = 'http://localhost:3000';

    // 1) Migrations must run clean against a real Postgres, creating the schema.
    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    const applied = await dataSource.runMigrations();
    appliedMigrationNames = applied.map((m) => m.name);

    // 2) Seed in a REPRESENTATIVE set of rollout phases (the wave-4 collapse) so every
    //    homogeneous+mixed insert/no-op path the platform can hit is exercised, without
    //    growing one phase per historical wave:
    //      Phase 1 — empty DB seeded with the pilot-5 ONLY: the state PR-4a left
    //        (all-insert). Snapshot İstanbul's updated_at.
    //      Phase 2 — re-seed the SAME DB with the FULL 72-list (SEED_PROVINCES). The 5
    //        pilot rows already match (no-op) and the other 76 are new (insert) → a
    //        MIXED batch, the largest this repo ships. İstanbul's updated_at must be
    //        UNCHANGED (a mixed batch never touches the rows it leaves alone — and, per
    //        the earlier waves' agreed trigger, the number of prior batches the no-op
    //        set spans does not change what this proves, so one mixed transition stands
    //        in for the old +wave-1/+wave-2/+wave-3 chain).
    //      Phase 3 — a routine re-run over the complete 72: pure no-op, proving
    //        idempotency AND no updated_at churn (SEO lastmod honesty, §6).
    //    PILOT_PROVINCES + SEED_PROVINCES drive the phases here; value correctness is
    //    asserted independently from EXPECTED_PROVINCES.
    const repo = dataSource.getRepository(Province);
    pilotOnlySeed = await seedGeography(dataSource, PILOT_PROVINCES);
    istanbulUpdatedAtAfterPilotInsert = (
      await repo.findOneByOrFail({ plateCode: '34' })
    ).updatedAt.toISOString();
    fullMixedSeed = await seedGeography(dataSource, SEED_PROVINCES);
    istanbulUpdatedAtAfterFullInsert = (
      await repo.findOneByOrFail({ plateCode: '34' })
    ).updatedAt.toISOString();
    reSeed = await seedGeography(dataSource);
    istanbulUpdatedAtAfterReseed = (
      await repo.findOneByOrFail({ plateCode: '34' })
    ).updatedAt.toISOString();

    // 3) Boot the real app against the same DB (no synchronize; schema exists).
    //    Load AppModule now — after DATABASE_URL is set — so its eager env
    //    validation sees the real container URL. A typed require (not a static
    //    import) defers module load to here.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    // Neutralise the global 120 req/min rate limit FOR THIS TEST RUN ONLY. The suite fires
    // one HTTP request per seeded province (72) plus every per-wave detail assertion from a
    // single in-memory client inside one ~25 s window — far above the production 120/min limit,
    // which would otherwise 429 the later tests as the seed grows. The guard is registered as an
    // APP_GUARD via `useClass` (app.module.ts), so `overrideGuard(ThrottlerGuard)` does NOT reach
    // it (the DI token is APP_GUARD, not the guard class). Instead we override the `ThrottlerStorage`
    // provider the guard injects with a stub that always reports zero hits — so `canActivate`
    // never exceeds the limit. This is TEST-ONLY: the production posture (app.module.ts
    // THROTTLE_LIMIT=120) is untouched, no security control is weakened, and no assertion is
    // dropped. No test asserts 429 behaviour, so nothing depends on the limiter being live here.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: (): Promise<{
          totalHits: number;
          timeToExpire: number;
          isBlocked: boolean;
          timeToBlockExpire: number;
        }> =>
          Promise.resolve({
            totalHits: 0,
            timeToExpire: 0,
            isBlocked: false,
            timeToBlockExpire: 0,
          }),
      })
      .compile();
    app = moduleRef.createNestApplication();
    applyGlobalPrefix(app);
    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  it('runs all migrations clean, in order', () => {
    expect(appliedMigrationNames).toEqual([
      'InitProvince1783382400000',
      'AddProvinceClimateNote1783513986800',
      'AddProvinceDetailSections1783701664849',
    ]);
  });

  it('phase 1 — seeding the pilot-5 into an empty DB inserts exactly those 5', () => {
    expect(pilotOnlySeed).toEqual({ inserted: 5, updated: 0, unchanged: 0, total: 5 });
  });

  it('phase 2 — re-seeding the full 81 over the pilot-5 is a MIXED batch', () => {
    // The representative mixed transition (the wave-4 collapse of the old per-wave
    // chain): the 5 pilot rows are already present (no-ops) and the other 76 are new
    // (inserts) — a genuine mixed batch that guards per-row independence. A shared-state
    // regression would mis-count HERE while the homogeneous all-insert (phase 1) and
    // all-no-op (phase 3) cases stayed green. The no-op set spanning one prior batch
    // rather than three does not change what this proves.
    expect(fullMixedSeed).toEqual({ inserted: 76, updated: 0, unchanged: 5, total: 81 });
    // A mixed batch must NOT touch the updated_at of the rows it leaves alone.
    expect(istanbulUpdatedAtAfterFullInsert).toBe(istanbulUpdatedAtAfterPilotInsert);
  });

  it('phase 3 — re-seed is a no-op: no duplicates, no writes, no updated_at churn', async () => {
    // Every row already matches → all 81 unchanged, none updated/inserted.
    expect(reSeed).toEqual({ inserted: 0, updated: 0, unchanged: 81, total: 81 });
    // Still exactly 72 rows.
    const count = await dataSource.getRepository(Province).count();
    expect(count).toBe(81);
    // updated_at was NOT bumped by the no-op re-seed.
    expect(istanbulUpdatedAtAfterReseed).toBe(istanbulUpdatedAtAfterFullInsert);
  });

  it('re-seed detects a DETAIL-ONLY drift and UPDATES (isolates the new comparison lines)', async () => {
    // ISOLATION (review PR#9 IMPORTANT-2): drift EXACTLY ONE new detail field —
    // `economyIndicator` — and leave `landformNoteTr` (which was ALREADY in the comparator
    // before this PR) untouched. So the ONLY thing that can flag drift here is one of the 7
    // comparison lines this PR added: with the old comparator (base + landform only) landform
    // still matches → the row would be mis-counted `unchanged` and the stale null never
    // refreshed. This is the forward-looking case the fix actually guards (a detail-only
    // correction to a province whose landform is already populated), not İstanbul's own
    // null→content landform flip (which drifts under the old code too). Restores at the end.
    const repo = dataSource.getRepository(Province);
    await repo.update({ plateCode: '34' }, { economyIndicator: null });

    const result = await seedGeography(dataSource);
    // Only İstanbul drifted (via the economyIndicator comparison) → 1 updated, 59 untouched.
    expect(result).toEqual({ inserted: 0, updated: 1, unchanged: 80, total: 81 });

    // The drifted field was actually re-written from the seed.
    const istanbul = await repo.findOneByOrFail({ plateCode: '34' });
    expect(istanbul.economyIndicator).toEqual({
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%29,2',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    });
    // Still exactly 72 rows — an UPDATE, never an insert/delete.
    expect(await repo.count()).toBe(81);
  });

  it('re-seed CLEARS a retracted optional field (merge/compare stay coherent)', async () => {
    // RETRACTION (review PR#9 IMPORTANT-1): a future seed that DROPS a previously-published
    // optional key (to clear a stale value, not replace it) must actually null the column —
    // not just re-flag the row as drifted forever. `withExplicitDetailNulls` makes the omit
    // write an explicit null so `merge` clears it; without that fix `merge` would leave the
    // stale value and the row would churn `updated` on every re-seed. Uses a real seed list
    // with İstanbul's `economyIndicator` key removed, then restores.
    const repo = dataSource.getRepository(Province);
    const istanbulSeed = SEED_PROVINCES.find((p) => p.plateCode === '34');
    if (!istanbulSeed) throw new Error('İstanbul seed (plate 34) not found');
    const istanbulRetracted: ProvinceSeed = { ...istanbulSeed };
    delete istanbulRetracted.economyIndicator; // omit the key entirely (a retraction)
    const retractedList = SEED_PROVINCES.map((p) => (p.plateCode === '34' ? istanbulRetracted : p));

    const result = await seedGeography(dataSource, retractedList);
    // İstanbul drifts (economyIndicator retracted → null) → 1 updated, 59 unchanged.
    expect(result).toEqual({ inserted: 0, updated: 1, unchanged: 80, total: 81 });

    // The retracted field is actually CLEARED in the DB (the coherence fix works).
    const istanbul = await repo.findOneByOrFail({ plateCode: '34' });
    expect(istanbul.economyIndicator).toBeNull();
    // The retraction is a genuine no-op on re-run (does not churn `updated` forever).
    const rerun = await seedGeography(dataSource, retractedList);
    expect(rerun).toEqual({ inserted: 0, updated: 0, unchanged: 81, total: 81 });

    // Restore the canonical, fully-populated İstanbul for the later tests.
    const restore = await seedGeography(dataSource);
    expect(restore).toEqual({ inserted: 0, updated: 1, unchanged: 80, total: 81 });
    expect((await repo.findOneByOrFail({ plateCode: '34' })).economyIndicator).not.toBeNull();
    expect(await repo.count()).toBe(81);
  });

  it('round-trips a seeded Province (transformer + array + İstanbul deep-content jsonb)', async () => {
    const repo = dataSource.getRepository(Province);
    const istanbul = await repo.findOneByOrFail({ plateCode: '34' });
    // numeric(9,6) comes back through the transformer as a real number
    expect(istanbul.latitude).toBe(40.9819);
    expect(istanbul.longitude).toBe(28.8208);
    // varchar[] round-trips as an array
    expect(istanbul.neighborPlateCodes).toEqual(['59', '41']);
    // the MGM caveat travels with the Köppen value (never a bare code)
    expect(istanbul.climateKoppen).toBe('Csa');
    expect(istanbul.climateNoteTr).toContain('MGM');
    // İstanbul is the deep-content pilot — every detail-section field is populated and
    // survives the DB round-trip: prose (text), the numeric-rate transformer, the jsonb
    // array and the jsonb object all come back intact.
    expect(istanbul.introTr).toContain('Avrupa');
    expect(istanbul.landformNoteTr).toContain('Aydos');
    expect(istanbul.hydrographyNoteTr).toContain('İSKİ');
    expect(istanbul.settlementNoteTr).toContain('6360');
    expect(istanbul.urbanizationRate).toBe(100);
    expect(istanbul.netMigrationRate).toBe(1.66);
    expect(istanbul.hydrographyFeatures).toEqual([
      { name: 'Ömerli Barajı', type: 'baraj' },
      { name: 'Terkos Barajı', type: 'baraj' },
      { name: 'Büyükçekmece Barajı', type: 'baraj' },
      { name: 'Darlık Barajı', type: 'baraj' },
      { name: 'Sazlıdere Barajı', type: 'baraj' },
      { name: 'Pabuçdere Barajı', type: 'baraj' },
      { name: 'Alibey Barajı', type: 'baraj' },
      { name: 'Kazandere Barajı', type: 'baraj' },
      { name: 'Elmalı Barajı', type: 'baraj' },
      { name: 'Istrancalar Barajı', type: 'baraj' },
    ]);
    expect(istanbul.economyIndicator).toEqual({
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%29,2',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    });

    // A base-data-only province WOULD keep EVERY detail field null — deep-content updates are
    // surgical and must NOT leak into sibling rows. Discovered dynamically (self-maintaining
    // "until none remain base-only"). Wave-5 is that terminal wave: every seeded il now carries
    // deep content, so this set is empty today and the loop is a no-op — the no-leak guarantee
    // is still actively enforced per row by the value-loop's Tier-B / Mardin null-field branches
    // and the dedicated Tier-B tests. Kept (not deleted) so it reactivates the day a future
    // not-yet-waved il is seeded, asserting every such row round-trips with all detail nulls.
    const baseOnlyProvinces = EXPECTED_PROVINCES.filter((p): boolean => !('economyIndicator' in p));
    for (const baseOnlyExpected of baseOnlyProvinces) {
      const baseOnly = await repo.findOneByOrFail({ plateCode: baseOnlyExpected.plateCode });
      expect(baseOnly.introTr).toBeNull();
      expect(baseOnly.landformNoteTr).toBeNull();
      expect(baseOnly.hydrographyNoteTr).toBeNull();
      expect(baseOnly.hydrographyFeatures).toBeNull();
      expect(baseOnly.urbanizationRate).toBeNull();
      expect(baseOnly.netMigrationRate).toBeNull();
      expect(baseOnly.settlementNoteTr).toBeNull();
      expect(baseOnly.economyIndicator).toBeNull();
    }
  });

  it('GET /api/provinces returns all 81, plate-ordered, lean (no detail leak)', async () => {
    const res = await request(app.getHttpServer()).get('/api/provinces').expect(200);
    const body = res.body as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(81);
    // lexical plate order across all nine batches (pilot + wave-1..4 + wave-6d + wave-6b + wave-6a
    // + wave-6c) — the complete 81.
    expect(body.map((p) => p.plateCode)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
      '18',
      '19',
      '20',
      '21',
      '22',
      '23',
      '24',
      '25',
      '26',
      '27',
      '28',
      '29',
      '30',
      '31',
      '32',
      '33',
      '34',
      '35',
      '36',
      '37',
      '38',
      '39',
      '40',
      '41',
      '42',
      '43',
      '44',
      '45',
      '46',
      '47',
      '48',
      '49',
      '50',
      '51',
      '52',
      '53',
      '54',
      '55',
      '56',
      '57',
      '58',
      '59',
      '60',
      '61',
      '62',
      '63',
      '64',
      '65',
      '66',
      '67',
      '68',
      '69',
      '70',
      '71',
      '72',
      '73',
      '74',
      '75',
      '76',
      '77',
      '78',
      '79',
      '80',
      '81',
    ]);
    // first row is now Adana (01) — a wave-4 province sorts ahead of everything else.
    expect(body[0]).toMatchObject({
      plateCode: '01',
      nameTr: 'Adana',
      region: 'AKDENIZ',
      slugTr: 'adana',
      slugEn: 'adana',
    });
    // lean payload must NOT carry detail-only fields
    expect(body[0]).not.toHaveProperty('population');
    expect(body[0]).not.toHaveProperty('latitude');
    expect(body[0]).not.toHaveProperty('climateNoteTr');
  });

  it('GET /api/provinces/map-summary returns hover-card data for all provinces', async () => {
    // The static `map-summary` path must resolve to this endpoint, NOT be captured
    // by the `:slug` route (which would 404) — a 200 array proves the route order.
    const res = await request(app.getHttpServer()).get('/api/provinces/map-summary').expect(200);
    const body = res.body as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(81);
    // same plate order as the list endpoint (all 81, nine batches)
    expect(body.map((p) => p.plateCode)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
      '18',
      '19',
      '20',
      '21',
      '22',
      '23',
      '24',
      '25',
      '26',
      '27',
      '28',
      '29',
      '30',
      '31',
      '32',
      '33',
      '34',
      '35',
      '36',
      '37',
      '38',
      '39',
      '40',
      '41',
      '42',
      '43',
      '44',
      '45',
      '46',
      '47',
      '48',
      '49',
      '50',
      '51',
      '52',
      '53',
      '54',
      '55',
      '56',
      '57',
      '58',
      '59',
      '60',
      '61',
      '62',
      '63',
      '64',
      '65',
      '66',
      '67',
      '68',
      '69',
      '70',
      '71',
      '72',
      '73',
      '74',
      '75',
      '76',
      '77',
      '78',
      '79',
      '80',
      '81',
    ]);

    // every province's summary numbers must round-trip (not just İstanbul) — guards
    // the pass-through `toMapSummary` mapper against a silent per-row field swap.
    for (const expected of EXPECTED_PROVINCES) {
      const row = body.find((p) => p.plateCode === expected.plateCode);
      expect(row).toMatchObject({
        nameTr: expected.nameTr,
        region: expected.region,
        slugTr: expected.slug,
        slugEn: expected.slug,
        population: expected.population,
        populationYear: expected.populationYear,
        areaKm2: expected.areaKm2,
        districtCount: expected.districtCount,
      });
    }

    // purpose-sized payload: identity + the 4 summary numbers ONLY — no detail leak,
    // and NO derived density (density is a detail-page concern, not the hover-card).
    const istanbul = body.find((p) => p.plateCode === '34');
    expect(istanbul).not.toHaveProperty('latitude');
    expect(istanbul).not.toHaveProperty('climateNoteTr');
    expect(istanbul).not.toHaveProperty('neighborPlateCodes');
    expect(istanbul).not.toHaveProperty('populationDensity');
  });

  // Mechanism proof for the jsonb columns + the numeric-rate transformer: every
  // seeded row leaves them null (base data only), so nothing else exercises a
  // NON-null jsonb round-trip through Postgres. A throwaway fixture row (plate '00',
  // not a real province) is inserted, read back through the API, then deleted in
  // `finally` so the other tests still see exactly the 81 seeded rows.
  it('round-trips non-null jsonb + numeric-rate fields through the DB and API', async () => {
    const repo = dataSource.getRepository(Province);
    const fixture = repo.create({
      plateCode: '00',
      nameTr: 'Test İli',
      slugTr: 'jsonb-roundtrip-fixture',
      slugEn: 'jsonb-roundtrip-fixture-en',
      region: GeographicRegion.Marmara,
      population: 1000,
      areaKm2: 4,
      hydrographyFeatures: [
        { name: 'Test Barajı', type: HydrographyFeatureType.Baraj },
        { name: 'Test Nehri', type: HydrographyFeatureType.Nehir },
      ],
      economyIndicator: { label: 'Test payı', value: '%1,5', year: 2024, source: 'TÜİK Test' },
      urbanizationRate: 93.5,
      netMigrationRate: -12.34,
    });
    await repo.save(fixture);

    try {
      const res = await request(app.getHttpServer())
        .get('/api/provinces/jsonb-roundtrip-fixture')
        .expect(200);
      const body = res.body as Record<string, unknown>;

      // jsonb array + nested objects survive the Postgres round-trip intact (order,
      // nested keys, ASCII enum value) — the exact shape the web codegen relies on.
      expect(body.hydrographyFeatures).toEqual([
        { name: 'Test Barajı', type: 'baraj' },
        { name: 'Test Nehri', type: 'nehir' },
      ]);
      expect(body.economyIndicator).toEqual({
        label: 'Test payı',
        value: '%1,5',
        year: 2024,
        source: 'TÜİK Test',
      });
      // numeric(5,2) comes back through decimalTransformer as a real, signed number
      expect(body.urbanizationRate).toBe(93.5);
      expect(body.netMigrationRate).toBe(-12.34);
      // computed density on real inputs: round(1000 / 4) = 250
      expect(body.populationDensity).toBe(250);
    } finally {
      // Clean up unconditionally so the 72-row count assumed by the other tests
      // holds even if an assertion above throws.
      await repo.delete({ plateCode: '00' });
    }
  });

  // I1/M4: assert EVERY seeded province's key fact-checked fields (all 81, nine
  // batches — not just İstanbul) so a transcription regression in any row fails CI.
  // The province-specific MGM caveat (Ankara/Van divergence), the Cfa caveat
  // (Kocaeli/Sakarya/Afyonkarahisar, caveatContains: 'Cfa') and the wave-3 Csb caveat
  // (Kütahya, caveatContains: 'Csb') are asserted here too; the 7 wave-4 Akdeniz
  // provinces are all Csa (including Kahramanmaraş's elevation=572 GLOSSARY §1 case).
  it.each(EXPECTED_PROVINCES)(
    'GET /api/provinces/$slug returns the full, fact-checked detail',
    async (expected) => {
      const res = await request(app.getHttpServer())
        .get(`/api/provinces/${expected.slug}`)
        .expect(200);
      const body = res.body as Record<string, unknown>;

      expect(body).toMatchObject({
        plateCode: expected.plateCode,
        nameTr: expected.nameTr,
        region: expected.region,
        population: expected.population,
        populationYear: expected.populationYear,
        areaKm2: expected.areaKm2,
        districtCount: expected.districtCount,
        // server-computed derived field: round(population / areaKm2), single-sourced
        populationDensity: expected.populationDensity,
        elevationM: expected.elevationM,
        neighborPlateCodes: expected.neighborPlateCodes,
        climateKoppen: expected.climateKoppen,
        climateClassTr: expected.climateClassTr,
      });
      expect(body.latitude).toBe(expected.latitude);
      expect(body.longitude).toBe(expected.longitude);

      // Detail-section fields — FOUR variants coexist across the seed (the tiered model was
      // introduced by wave-3, extended by wave-4, and given its THIRD variant by wave-5's Mardin):
      //   • FULL (8 fields): İstanbul 34 + the wave-1 four (06/35/65/07) + the wave-3 Tier-A four
      //     (Manisa 45, Aydın 09, Denizli 20, Muğla 48) + the 10 wave-2 Marmara il
      //     (10/11/16/17/22/39/41/54/59/77 — full 7-field, no Tier-B that wave) + the wave-4 Tier-A
      //     four (Adana 01, Hatay 31, Kahramanmaraş 46, Mersin 33) + the wave-5 Tier-A three
      //     (Diyarbakır 21, Gaziantep 27, Şanlıurfa 63) + the wave-6a Tier-A two (Konya 42, Kayseri
      //     38) + the wave-6c Tier-A one (Samsun 55). Structured fields asserted EXACTLY here; the
      //     4 prose fields get distinctive-token checks below.
      //   • TIER-B-NONE (6 fields): the wave-3 <1M il (Afyonkarahisar 03, Kütahya 43, Uşak 64) +
      //     the wave-4 <1M il (Burdur 15, Isparta 32, Osmaniye 80) + the wave-5 plain Tier-B five
      //     (Adıyaman 02, Batman 72, Kilis 79, Siirt 56, Şırnak 73) + ALL 9 wave-6d Karadeniz-B
      //     (60/19/57/37/67/74/78/81/14) + the 11 wave-6b Doğu Anadolu (04/12/13/23/24/30/36/49/62/
      //     75/76) + the 9 wave-6a İç Anadolu plain Tier-B (58/66/40/50/51/68/70/71/18) + the wave-6c
      //     plain Tier-B six (Amasya 05, Artvin 08, Giresun 28, Gümüşhane 29, Rize 53, Bayburt 69).
      //     hydrographyFeatures AND settlementNoteTr are DELIBERATELY absent → null (owner-approved
      //     scope cut, DEC 2026-07-11); asserted null HERE, while the other six are populated (3
      //     non-empty prose + urbanizationRate/netMigrationRate/economyIndicator). This populated+null
      //     MIX within one row is the shape wave-3 introduced and every wave since continues.
      //   • TIER-B-WITH-ONE-FIELD (the wave-5 third variant): the Tier-B-but-büyükşehir exception
      //     (→ DEC 2026-07-12) — Mardin 47 (wave-5), Erzurum 25 and Malatya 44 (wave-6b), Eskişehir 26
      //     (wave-6a), Trabzon 61 and Ordu 52 (wave-6c). Like Tier-B, hydrographyFeatures is null — but
      //     UNLIKE Tier-B, settlementNoteTr is POPULATED (the single 6360 caveat sentence; its %100
      //     urbanizationRate is a real büyükşehir legal artifact). Handled in its own branch below,
      //     with each il's exact one-sentence content asserted in its dedicated test.
      //   • BASE-DATA: every OTHER il keeps all 8 detail fields null — no deep-content leak.
      // The `=== || ===` chains (not Array.includes) are DELIBERATE: they discriminate `expected`
      // by its literal plateCode so the exact-value reads below (expected.hydrographyFeatures etc.)
      // narrow to members that actually carry those keys and typecheck under strict.
      if (
        expected.plateCode === '34' ||
        expected.plateCode === '06' ||
        expected.plateCode === '35' ||
        expected.plateCode === '65' ||
        expected.plateCode === '07' ||
        expected.plateCode === '45' ||
        expected.plateCode === '09' ||
        expected.plateCode === '20' ||
        expected.plateCode === '48' ||
        expected.plateCode === '10' ||
        expected.plateCode === '11' ||
        expected.plateCode === '16' ||
        expected.plateCode === '17' ||
        expected.plateCode === '22' ||
        expected.plateCode === '39' ||
        expected.plateCode === '41' ||
        expected.plateCode === '54' ||
        expected.plateCode === '59' ||
        expected.plateCode === '77' ||
        expected.plateCode === '01' ||
        expected.plateCode === '31' ||
        expected.plateCode === '46' ||
        expected.plateCode === '33' ||
        expected.plateCode === '21' ||
        expected.plateCode === '27' ||
        expected.plateCode === '63' ||
        // wave-6a Tier-A (İç Anadolu): Konya 42, Kayseri 38 — full 8-field set.
        expected.plateCode === '42' ||
        expected.plateCode === '38' ||
        // wave-6c Tier-A (Karadeniz-A): Samsun 55 — full 8-field set incl. hydrographyFeatures.
        expected.plateCode === '55'
      ) {
        expect(body).toMatchObject({
          urbanizationRate: expected.urbanizationRate,
          netMigrationRate: expected.netMigrationRate,
          hydrographyFeatures: expected.hydrographyFeatures,
          economyIndicator: expected.economyIndicator,
        });
        for (const prose of [
          body.introTr,
          body.landformNoteTr,
          body.hydrographyNoteTr,
          body.settlementNoteTr,
        ]) {
          expect(typeof prose).toBe('string');
          expect((prose as string).length).toBeGreaterThan(0);
        }
      } else if (
        expected.plateCode === '03' ||
        expected.plateCode === '43' ||
        expected.plateCode === '64' ||
        expected.plateCode === '15' ||
        expected.plateCode === '32' ||
        expected.plateCode === '80' ||
        expected.plateCode === '02' ||
        expected.plateCode === '72' ||
        expected.plateCode === '79' ||
        expected.plateCode === '56' ||
        expected.plateCode === '73' ||
        // wave-6d Karadeniz-B (all 9 Tier-B — the FULL-new-province batch)
        expected.plateCode === '60' ||
        expected.plateCode === '19' ||
        expected.plateCode === '57' ||
        expected.plateCode === '37' ||
        expected.plateCode === '67' ||
        expected.plateCode === '74' ||
        expected.plateCode === '78' ||
        expected.plateCode === '81' ||
        expected.plateCode === '14' ||
        // wave-6b plain Tier-B (11 il — Erzurum 25 + Malatya 44 are the büyükşehir exception below)
        expected.plateCode === '04' ||
        expected.plateCode === '12' ||
        expected.plateCode === '13' ||
        expected.plateCode === '23' ||
        expected.plateCode === '24' ||
        expected.plateCode === '30' ||
        expected.plateCode === '36' ||
        expected.plateCode === '49' ||
        expected.plateCode === '62' ||
        expected.plateCode === '75' ||
        expected.plateCode === '76' ||
        // wave-6a plain Tier-B (İç Anadolu, non-büyükşehir): Sivas 58, Yozgat 66, Kırşehir 40,
        // Nevşehir 50, Niğde 51, Aksaray 68, Karaman 70, Kırıkkale 71, Çankırı 18.
        expected.plateCode === '58' ||
        expected.plateCode === '66' ||
        expected.plateCode === '40' ||
        expected.plateCode === '50' ||
        expected.plateCode === '51' ||
        expected.plateCode === '68' ||
        expected.plateCode === '70' ||
        expected.plateCode === '71' ||
        expected.plateCode === '18' ||
        // wave-6c Karadeniz-A plain Tier-B (Amasya 05, Artvin 08, Giresun 28, Gümüşhane 29, Rize 53, Bayburt 69)
        expected.plateCode === '05' ||
        expected.plateCode === '08' ||
        expected.plateCode === '28' ||
        expected.plateCode === '29' ||
        expected.plateCode === '53' ||
        expected.plateCode === '69'
      ) {
        // Tier-B: the six authored fields are present; the two Tier-B-omitted keys come back
        // null (omitted-in-seed → normalised to null by withExplicitDetailNulls → serialised
        // as null). This is the mixed-tier serialisation/idempotency guard.
        expect(body).toMatchObject({
          urbanizationRate: expected.urbanizationRate,
          netMigrationRate: expected.netMigrationRate,
          economyIndicator: expected.economyIndicator,
          // The two Tier-B omissions must surface as null (never a bare [] or empty note).
          hydrographyFeatures: null,
          settlementNoteTr: null,
        });
        // The three authored Tier-B prose fields are present and non-empty.
        for (const prose of [body.introTr, body.landformNoteTr, body.hydrographyNoteTr]) {
          expect(typeof prose).toBe('string');
          expect((prose as string).length).toBeGreaterThan(0);
        }
      } else if (
        expected.plateCode === '47' ||
        expected.plateCode === '25' ||
        expected.plateCode === '44' ||
        expected.plateCode === '26' ||
        expected.plateCode === '61' ||
        expected.plateCode === '52'
      ) {
        // Tier-B-but-büyükşehir variant (→ DEC 2026-07-12): Mardin 47 (wave-5), Erzurum 25 and
        // Malatya 44 (wave-6b), Eskişehir 26 (wave-6a), Trabzon 61 and Ordu 52 (wave-6c). Tier-B depth,
        // so hydrographyFeatures is null like the plain Tier-B il — BUT settlementNoteTr is POPULATED
        // (unlike them), because its %100 urbanizationRate is the 6360 büyükşehir legal artifact. The
        // three scalars are asserted exactly; hydrographyFeatures null; settlementNoteTr a NON-empty
        // string (its exact one-sentence content is asserted in the dedicated Mardin exception test).
        // This branch is what proves the serializer emits a row where ONE of the two normally-omitted
        // Tier-B fields is present and the other null — the case neither FULL nor TIER-B-NONE covers.
        expect(body).toMatchObject({
          urbanizationRate: expected.urbanizationRate,
          netMigrationRate: expected.netMigrationRate,
          economyIndicator: expected.economyIndicator,
          hydrographyFeatures: null,
        });
        expect(typeof body.settlementNoteTr).toBe('string');
        expect((body.settlementNoteTr as string).length).toBeGreaterThan(0);
        // The three authored Tier-B prose fields are present and non-empty.
        for (const prose of [body.introTr, body.landformNoteTr, body.hydrographyNoteTr]) {
          expect(typeof prose).toBe('string');
          expect((prose as string).length).toBeGreaterThan(0);
        }
      } else {
        expect(body).toMatchObject({
          landformNoteTr: null,
          introTr: null,
          hydrographyNoteTr: null,
          hydrographyFeatures: null,
          urbanizationRate: null,
          netMigrationRate: null,
          settlementNoteTr: null,
          economyIndicator: null,
        });
      }

      // Köppen⇒caveat invariant at the API boundary: a present Köppen code must
      // carry a non-empty caveat that CORRESPONDS to the province's class —
      // `caveatContains` is the class code itself ('Csa'/'Cfa', fully discriminating
      // since the Cfa caveat contains no 'Csa' and vice versa), or Ankara/Van's
      // province-specific divergence phrase.
      expect(typeof body.climateNoteTr).toBe('string');
      expect((body.climateNoteTr as string).length).toBeGreaterThan(0);
      expect(body.climateNoteTr).toContain(expected.caveatContains);
    },
  );

  it('GET /api/provinces/istanbul serves the deep-content pilot fields with the fact-checked corrections', async () => {
    const res = await request(app.getHttpServer()).get('/api/provinces/istanbul').expect(200);
    const body = res.body as Record<string, unknown>;

    // Prose fields carry the load-bearing, fact-checked facts — asserted by distinctive
    // token (the same discipline the climate caveat uses), not a brittle full-prose match.
    expect(body.introTr).toContain('Avrupa');
    expect(body.introTr).toContain('Asya');
    // landform: the CORRECTED Aydos altitude (537 → 538) + the AFAD-İRAP-anchored KAF /
    // seismic context Atlas called out explicitly.
    expect(body.landformNoteTr).toContain('Aydos');
    expect(body.landformNoteTr).toContain('538');
    expect(body.landformNoteTr).toContain('Kuzey Anadolu Fayı');
    // The style-only prose rewrite landed (owner feedback: the draft read as AI-generated):
    // the old ALL-CAPS emphasis "DEĞİL" is gone (CONTENT-STYLE.md §2 forbids ALL CAPS in
    // shipped prose). The distinctive fact tokens above survive BOTH the old and rewritten
    // prose, so this negative assertion is what actually proves the rewrite was applied.
    expect(body.landformNoteTr).not.toContain('DEĞİL');
    // hydrography: İSKİ live-data narrative; the "Alibey" (NOT "Alibeyköy") dam-name fix is
    // the fact-check's specific correction — the corrected form is present in the structured
    // list and the old form is absent.
    expect(body.hydrographyNoteTr).toContain('İSKİ');
    const damNames = (body.hydrographyFeatures as Array<{ name: string }>).map((f) => f.name);
    expect(damNames).toHaveLength(10);
    expect(damNames).toContain('Alibey Barajı');
    expect(damNames).not.toContain('Alibeyköy Barajı');
    // settlement: %100 urbanization is a legal artifact of 6360 and MUST ship WITH its
    // methodological framing; the signed net-migration value is positive.
    expect(body.settlementNoteTr).toContain('6360');
    expect(body.settlementNoteTr).toContain('%100');
    expect(body.urbanizationRate).toBe(100);
    expect(body.netMigrationRate).toBe(1.66);
    // economy: a single TÜİK-anchored structured stat (2024 GSYH share); `value` is the
    // Turkish percent string the EconomyIndicator contract requires (value: string).
    expect(body.economyIndicator).toEqual({
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%29,2',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    });
    // populationDensity stays SERVER-COMPUTED from our locked population÷area (2885), NOT
    // overridden to TÜİK's own published 2943 (a known Batch-1 area-source delta; our shown
    // density must stay consistent with the population and area we actually display).
    expect(body.populationDensity).toBe(2885);
  });

  // Wave-1 deep content (Ankara/İzmir/Van/Antalya): each prose field carries the
  // load-bearing, fact-checked facts, asserted by distinctive token (the same discipline the
  // İstanbul detail test uses) — not a brittle full-prose match. The tokens are deliberately
  // distinct because each il is written to its OWN geographic character (İç Anadolu plato /
  // Ege graben-horst / Doğu Anadolu volkanik-kapalı havza / Akdeniz karstic).
  it.each([
    {
      slug: 'ankara',
      intro: ['başkent', '13 Ekim 1923'],
      landform: ['Anadolu Platosu', 'Tuz Gölü'],
      hydrography: ['Sakarya Nehri', 'ASKİ', 'Çamlıdere'],
      settlement: ['6360', '%100', '+8,91'],
    },
    {
      slug: 'izmir',
      intro: ['Smyrna', '%5,7'],
      landform: ['graben-horst', 'Bayraklı', '2020'],
      hydrography: ['Gediz', 'İZSU', 'Ramsar'],
      settlement: ['6360', '+3,53'],
    },
    {
      slug: 'van',
      intro: ['Van Gölü', '2011'],
      landform: ['Nemrut', 'Süphan', 'volkanik set'],
      hydrography: ['sodalı', '3.713', 'Bendimahi'],
      settlement: ['6360', '-20,02'],
    },
    {
      slug: 'antalya',
      intro: ['Attaleia', 'II. Attalos'],
      landform: ['karstik', 'Kızlarsivrisi', '3.086'],
      hydrography: ['Manavgat', 'Avlan', 'Karacaören'],
      settlement: ['6360', '+9,09'],
    },
  ])(
    'GET /api/provinces/$slug serves the wave-1 deep-content prose (fact-checked tokens)',
    async ({ slug, intro, landform, hydrography, settlement }) => {
      const res = await request(app.getHttpServer()).get(`/api/provinces/${slug}`).expect(200);
      const body = res.body as Record<string, string>;
      for (const token of intro) expect(body.introTr).toContain(token);
      for (const token of landform) expect(body.landformNoteTr).toContain(token);
      for (const token of hydrography) expect(body.hydrographyNoteTr).toContain(token);
      for (const token of settlement) expect(body.settlementNoteTr).toContain(token);
      // No ALL-CAPS emphasis in shipped prose (CONTENT-STYLE.md §2) — the same negative guard
      // the İstanbul detail test applies to prove the house style holds across the wave.
      expect(body.landformNoteTr).not.toContain('DEĞİL');
    },
  );

  it('GET /api/provinces/antalya carries the fact-check altitude CORRECTION (3.086, not 3.070)', async () => {
    // The independent fact-check's single factual fix: Kızlarsivrisi 3.070 → 3.086 m. The
    // corrected value must be present and the superseded one absent — mirrors İstanbul's
    // Alibey/Alibeyköy correction assertion (the corrected form in, the old form out).
    const res = await request(app.getHttpServer()).get('/api/provinces/antalya').expect(200);
    const body = res.body as Record<string, string>;
    expect(body.landformNoteTr).toContain('3.086');
    expect(body.landformNoteTr).not.toContain('3.070');
  });

  // Wave-3 Tier-A deep content (Manisa/Aydın/Denizli/Muğla — nüfus ≥1M): the FULL 4-prose set
  // (incl. settlementNoteTr, since all four are büyükşehir), asserted by distinctive fact token —
  // the same discipline as the İstanbul/wave-1 detail tests. Tokens are deliberately distinct
  // because each il is written to its OWN geographic character (Manisa Spil/Gediz grabeni;
  // Aydın Büyük Menderes grabeni + meander etymology; Denizli Pamukkale/Honaz; Muğla karstik kıyı).
  it.each([
    {
      slug: 'manisa',
      intro: ['Sardes', '2025'],
      landform: ['Spil Dağı', '1.513', 'Kumpınar Tepe'],
      hydrography: ['Gediz Nehri', 'Demirköprü', 'Marmara Gölü'],
      settlement: ['6360', '%100', '+0,22'],
    },
    {
      slug: 'aydin',
      intro: ['meander', 'Aphrodisias'],
      landform: ['Büyük Menderes Grabeni', 'Madran', '140 kilometre'],
      hydrography: ['Suçıkan', 'Bafa Gölü', 'Çine'],
      settlement: ['6360', '+4,31'],
    },
    {
      slug: 'denizli',
      intro: ['Pamukkale', 'Honaz Dağı', '2.571'],
      landform: ['traverten', 'Çürüksu Grabeni', '1.077'],
      hydrography: ['Adıgüzel', 'Cindere', 'Işıklı Gölü'],
      settlement: ['6360', '+0,99'],
    },
    {
      slug: 'mugla',
      intro: ['geçiş kuşağı', '1.480'],
      landform: ['karstik', 'Boncuk Dağları', '3.000 metreyi'],
      hydrography: ['Dalaman Çayı', 'Akköprü', 'Caretta caretta'],
      settlement: ['6360', '+11,64'],
    },
  ])(
    'GET /api/provinces/$slug serves the wave-3 Tier-A deep-content prose (fact-checked tokens)',
    async ({ slug, intro, landform, hydrography, settlement }) => {
      const res = await request(app.getHttpServer()).get(`/api/provinces/${slug}`).expect(200);
      const body = res.body as Record<string, string>;
      for (const token of intro) expect(body.introTr).toContain(token);
      for (const token of landform) expect(body.landformNoteTr).toContain(token);
      for (const token of hydrography) expect(body.hydrographyNoteTr).toContain(token);
      for (const token of settlement) expect(body.settlementNoteTr).toContain(token);
      // No ALL-CAPS emphasis in shipped prose (CONTENT-STYLE.md §2), same as every wave before.
      expect(body.landformNoteTr).not.toContain('DEĞİL');
    },
  );

  // Wave-2 deep content (the 10 Marmara il): each prose field carries the load-bearing,
  // fact-checked facts, asserted by distinctive token (the same discipline İstanbul/wave-1
  // use) — not a brittle full-prose match. Kept tight/table-driven despite being the biggest
  // batch. `settlementAbsent` encodes THIS WAVE'S structural split: the 5 NON-büyükşehir il
  // (Bilecik/Çanakkale/Edirne/Kırklareli/Yalova) carry a GENUINE <100 urbanizationRate and
  // their settlementNoteTr must NOT contain the 6360 büyükşehir note (it does not apply); the
  // 5 büyükşehir il keep the 6360/%100 framing (settlementAbsent: []).
  it.each([
    {
      slug: 'balikesir',
      intro: ['Sındırgı', '290,5'],
      landform: ['Kazdağı', 'Karataş', '1.774'],
      hydrography: ['Manyas', 'Ramsar', 'Kuşcenneti'],
      settlement: ['6360', '%100', '+3,50'],
      settlementAbsent: [],
    },
    {
      slug: 'bilecik',
      intro: ['Söğüt', 'Ertuğrul', '%2,4'],
      landform: ['Kala Dağı', '1.906', 'Sakarya Nehri'],
      hydrography: ['Kızıldamlar', 'Karasu'],
      settlement: ['%84,11', '-0,07'],
      settlementAbsent: ['6360'],
    },
    {
      slug: 'bursa',
      intro: ['Uludağ', '2.543', '1326'],
      landform: ['sirk', '1855', 'milli park'],
      hydrography: ['İznik Gölü', 'Uluabat', 'Nilüfer Çayı'],
      settlement: ['6360', '%100', '+4,71'],
      settlementAbsent: [],
    },
    {
      slug: 'canakkale',
      intro: ['Truva', 'UNESCO', 'Gelibolu'],
      landform: ['Boğazı', '671', 'Baba Burnu'],
      hydrography: ['Atikhisar', 'Sarıçay'],
      settlement: ['%62,03', '+6,18'],
      settlementAbsent: ['6360'],
    },
    {
      slug: 'edirne',
      intro: ['Fatih', '1361', 'Bulgaristan'],
      landform: ['292', 'Korudağ', 'Ergene'],
      hydrography: ['Meriç', 'Gala Gölü', 'Kadıköy'],
      settlement: ['%77,06', '+2,40'],
      settlementAbsent: ['6360'],
    },
    {
      slug: 'kirklareli',
      intro: ['Aşağıpınar', 'Özdoğan', 'Bulgaristan'],
      landform: ['Yıldız Dağları', 'Mahya', 'İğneada'],
      hydrography: ['Kırklareli Barajı', 'Dupnisa'],
      settlement: ['%74,04', '+3,00'],
      settlementAbsent: ['6360'],
    },
    {
      slug: 'kocaeli',
      intro: ['İzmit Körfezi', 'Süleyman Paşa'],
      landform: ['Samanlı', '17.480', '1999'],
      hydrography: ['Yuvacık', 'Sapanca'],
      settlement: ['6360', '%100', '+8,11'],
      settlementAbsent: [],
    },
    {
      slug: 'sakarya',
      intro: ['Sakarya Nehri', 'Adapazarı', '1954'],
      landform: ['Keremali', 'sıvılaşma', 'Adapazarı'],
      hydrography: ['824', 'Sapanca Gölü', 'Çilekli'],
      settlement: ['6360', '%100', '+5,97'],
      settlementAbsent: [],
    },
    {
      slug: 'tekirdag',
      intro: ['bağcılık', 'Şarköy', '%89'],
      landform: ['Ganos', '945', '1912'],
      hydrography: ['Eriklice', 'Işıklar'],
      settlement: ['6360', '%100', '+13,09'],
      settlementAbsent: [],
    },
    {
      slug: 'yalova',
      intro: ['en küçük', '798', '1995'],
      landform: ['Beşpınar', '926', '1999'],
      hydrography: ['Sellimandıra', 'Gökçe', 'Sarpdere'],
      settlement: ['%72,35', '+15,59'],
      settlementAbsent: ['6360'],
    },
  ])(
    'GET /api/provinces/$slug serves the wave-2 deep-content prose (fact-checked tokens)',
    async ({ slug, intro, landform, hydrography, settlement, settlementAbsent }) => {
      const res = await request(app.getHttpServer()).get(`/api/provinces/${slug}`).expect(200);
      const body = res.body as Record<string, string>;
      for (const token of intro) expect(body.introTr).toContain(token);
      for (const token of landform) expect(body.landformNoteTr).toContain(token);
      for (const token of hydrography) expect(body.hydrographyNoteTr).toContain(token);
      for (const token of settlement) expect(body.settlementNoteTr).toContain(token);
      // The 5 non-büyükşehir il carry a genuine <100 rate and NO 6360 note (structural split).
      for (const token of settlementAbsent) expect(body.settlementNoteTr).not.toContain(token);
      // No ALL-CAPS emphasis in shipped prose (CONTENT-STYLE.md §2) — same guard as wave-1.
      expect(body.landformNoteTr).not.toContain('DEĞİL');
    },
  );

  // Wave-3 Tier-B (Afyonkarahisar/Kütahya/Uşak — nüfus <1M): the platform's FIRST tiered il.
  // This is the genuinely NEW case the suite had not covered before — a row where SOME detail
  // fields are populated while `hydrographyFeatures` AND `settlementNoteTr` are DELIBERATELY
  // absent → null (owner-approved scope cut, DEC 2026-07-11), NOT "not authored yet". This test
  // proves BOTH halves at once: the two omitted fields serialize as null (never a bare [] or
  // empty note), while the other six are populated — incl. a REAL, non-100 urbanizationRate
  // (these are non-büyükşehir il, so no 6360 methodological framing applies).
  it.each([
    {
      slug: 'afyonkarahisar',
      intro: ['jeotermal', 'Kara Hisar'],
      landform: ['yayla', 'Sultan Dağları', 'termal'],
      hydrography: ['Akarçay', 'Eber Gölü', 'kapalı bir havza'],
      urbanizationRate: 62.2,
      netMigrationRate: -5.63,
      economyValue: '%0,6',
    },
    {
      slug: 'kutahya',
      intro: ['çini', 'Murat Dağı'],
      landform: ['%57', 'Murat Dağı', '2.312'],
      hydrography: ['Porsuk', 'Simav Gölü', 'Marmara Denizi'],
      urbanizationRate: 74.57,
      netMigrationRate: -3.74,
      economyValue: '%0,5',
    },
    {
      slug: 'usak',
      intro: ['en az olan', 'halı'],
      landform: ['Kartal Tepe', '2.309', 'Elmadağ'],
      hydrography: ['Banaz Çayı', '165 kilometre', 'DSİ'],
      urbanizationRate: 77.11,
      netMigrationRate: -2.22,
      economyValue: '%0,3',
    },
  ])(
    'GET /api/provinces/$slug serves the wave-3 Tier-B set: 6 fields populated, hydrographyFeatures + settlementNoteTr null',
    async ({
      slug,
      intro,
      landform,
      hydrography,
      urbanizationRate,
      netMigrationRate,
      economyValue,
    }) => {
      const res = await request(app.getHttpServer()).get(`/api/provinces/${slug}`).expect(200);
      const body = res.body as Record<string, unknown>;

      // The three authored Tier-B prose fields carry their fact-checked tokens.
      for (const token of intro) expect(body.introTr).toContain(token);
      for (const token of landform) expect(body.landformNoteTr).toContain(token);
      for (const token of hydrography) expect(body.hydrographyNoteTr).toContain(token);
      expect(body.landformNoteTr).not.toContain('DEĞİL');

      // The three authored structured/scalar fields. urbanizationRate is a REAL rate (<100),
      // proving the non-büyükşehir path (no 6360 artifact) — a first for the platform's tests.
      expect(body.urbanizationRate).toBe(urbanizationRate);
      expect(body.netMigrationRate).toBe(netMigrationRate);
      expect((body.economyIndicator as { value: string }).value).toBe(economyValue);

      // THE new-case assertion (task requirement): the two Tier-B omissions surface as null —
      // present-but-null, not populated, and not a bare empty array / empty string.
      expect(body.hydrographyFeatures).toBeNull();
      expect(body.settlementNoteTr).toBeNull();
    },
  );

  // Wave-4 Tier-A deep content (Adana/Hatay/Kahramanmaraş/Mersin): full-depth prose asserted by
  // distinctive token (same discipline as İstanbul/wave-1). Hatay + Kahramanmaraş carry their
  // own 6 Şubat 2023 depremleri paragraph in landformNoteTr (AFAD-sourced, factual register).
  it.each([
    {
      slug: 'adana',
      intro: ['Çukurova', 'yedinci'],
      landform: ['Aladağlar', 'Misis', '1995'],
      hydrography: ['Seyhan Barajı', 'ASKİ', 'Akyatan'],
      settlement: ['6360', '%100', '-0,34'],
    },
    {
      slug: 'hatay',
      intro: ['Amik Ovası', 'on üçüncü'],
      landform: ['Amanos', 'Mığır Tepe', '6 Şubat 2023', '53.537'],
      hydrography: ['Asi Nehri', 'Amik Gölü', 'Tahtaköprü'],
      settlement: ['6360', '+1,51'],
    },
    {
      slug: 'kahramanmaras',
      intro: ['Maraş Ovası', 'yirminci'],
      landform: ['Nurhak', '3.090', 'Pazarcık', 'Çardak Fayı'],
      hydrography: ['Ceyhan', 'Kılavuzlu', 'Menzelet'],
      settlement: ['6360', '+6,31'],
    },
    {
      slug: 'mersin',
      intro: ['liman', 'on birinci', '321'],
      landform: ['Medetsiz', '3.524', 'Cennet', 'Cehennem'],
      hydrography: ['Göksu', 'Berdan', '87,5'],
      settlement: ['6360', '+3,01'],
    },
  ])(
    'GET /api/provinces/$slug serves the wave-4 Tier-A deep-content prose (fact-checked tokens)',
    async ({ slug, intro, landform, hydrography, settlement }) => {
      const res = await request(app.getHttpServer()).get(`/api/provinces/${slug}`).expect(200);
      const body = res.body as Record<string, string>;
      for (const token of intro) expect(body.introTr).toContain(token);
      for (const token of landform) expect(body.landformNoteTr).toContain(token);
      for (const token of hydrography) expect(body.hydrographyNoteTr).toContain(token);
      for (const token of settlement) expect(body.settlementNoteTr).toContain(token);
      expect(body.landformNoteTr).not.toContain('DEĞİL');
    },
  );

  // Wave-5 Tier-A deep content (Diyarbakır/Gaziantep/Şanlıurfa — nüfus ≥1M): the FULL 4-prose set
  // (incl. settlementNoteTr; all three büyükşehir), asserted by distinctive fact token — the same
  // discipline as every prior wave. Tokens are deliberately distinct because each il is written to
  // its OWN geographic character (Diyarbakır Dicle vadisi/Karacadağ bazalt; Gaziantep plato + 6
  // Şubat 2023; Şanlıurfa Atatürk Barajı/Urfa Tüneli/Harran).
  it.each([
    {
      slug: 'diyarbakir',
      intro: ['5.800', 'Hevsel'],
      landform: ['Karacadağ', 'Kolubaba', 'bazalt'],
      hydrography: ['Dicle', 'Kralkızı', 'DİSKİ'],
      settlement: ['6360', '%100', '-4,04'],
    },
    {
      slug: 'gaziantep',
      intro: ['Şahinbey', 'Şehitkamil'],
      landform: ['Amanos', '6 Şubat 2023', 'Nurdağı'],
      hydrography: ['Nizip Çayı', 'Kayacık', 'Kartalkaya'],
      settlement: ['6360', '%100', '+3,09'],
    },
    {
      slug: 'sanliurfa',
      intro: ['Atatürk Barajı', 'GAP'],
      landform: ['karstik', 'Tektek', 'Harran'],
      hydrography: ['Urfa Tüneli', '476.000', 'Birecik'],
      settlement: ['6360', '-8,52', '21,8'],
    },
  ])(
    'GET /api/provinces/$slug serves the wave-5 Tier-A deep-content prose (fact-checked tokens)',
    async ({ slug, intro, landform, hydrography, settlement }) => {
      const res = await request(app.getHttpServer()).get(`/api/provinces/${slug}`).expect(200);
      const body = res.body as Record<string, string>;
      for (const token of intro) expect(body.introTr).toContain(token);
      for (const token of landform) expect(body.landformNoteTr).toContain(token);
      for (const token of hydrography) expect(body.hydrographyNoteTr).toContain(token);
      for (const token of settlement) expect(body.settlementNoteTr).toContain(token);
      // No ALL-CAPS emphasis in shipped prose (CONTENT-STYLE.md §2), same guard as every wave.
      expect(body.landformNoteTr).not.toContain('DEĞİL');
    },
  );

  // Wave-4 Tier-B deep content (Burdur/Isparta/Osmaniye): the three authored prose fields carry
  // their distinctive tokens, AND the two Tier-B-omitted fields (hydrographyFeatures,
  // settlementNoteTr) MUST serialise as null — the explicit Tier-B null-fields assertion.
  it.each([
    {
      slug: 'burdur',
      intro: ['Göller Bölgesi', 'altmış beşinci'],
      landform: ['Batı Toroslar', 'çöküntü', 'Burdur Gölü'],
      hydrography: ['842', '20 metrenin', 'tuzluluk'],
    },
    {
      slug: 'isparta',
      intro: ['Eğirdir', 'kırk beşinci', 'yağ gülü'],
      landform: ['Dedegöl', '2.992', 'Sultan Dağları'],
      hydrography: ['468-482', 'dördüncü büyük', '16-17'],
    },
    {
      slug: 'osmaniye',
      intro: ['Çukurova', 'kırk birinci', '4200'],
      landform: ['Düldül', '2.400', 'Kadirli'],
      hydrography: ['Ceyhan', '75', 'Karaçay'],
    },
  ])(
    'GET /api/provinces/$slug serves wave-4 Tier-B prose AND nulls the two omitted fields',
    async ({ slug, intro, landform, hydrography }) => {
      const res = await request(app.getHttpServer()).get(`/api/provinces/${slug}`).expect(200);
      const body = res.body as Record<string, unknown>;
      for (const token of intro) expect(body.introTr).toContain(token);
      for (const token of landform) expect(body.landformNoteTr).toContain(token);
      for (const token of hydrography) expect(body.hydrographyNoteTr).toContain(token);
      // Tier-B deliberately omits these two — they must come back null, never a stray value or
      // an empty array leaking from a sibling row.
      expect(body.hydrographyFeatures).toBeNull();
      expect(body.settlementNoteTr).toBeNull();
      expect(body.landformNoteTr).not.toContain('DEĞİL');
    },
  );

  it('carries the wave-4 fact-check CORRECTIONS (Nurhak 3.090, Medetsiz 3.524, Berdan 87,5)', async () => {
    // The three ZORUNLU numeric fixes from the independent fact-check — corrected value present,
    // superseded value absent (mirrors the İstanbul Alibey / Antalya 3.086 correction guards).
    const maras = await request(app.getHttpServer())
      .get('/api/provinces/kahramanmaras')
      .expect(200);
    const marasBody = maras.body as Record<string, string>;
    expect(marasBody.landformNoteTr).toContain('3.090'); // Nurhak Dağı (was 3.081)
    expect(marasBody.landformNoteTr).not.toContain('3.081');

    const mersin = await request(app.getHttpServer()).get('/api/provinces/mersin').expect(200);
    const mersinBody = mersin.body as Record<string, string>;
    expect(mersinBody.landformNoteTr).toContain('3.524'); // Medetsiz Tepesi (was 3.585)
    expect(mersinBody.landformNoteTr).not.toContain('3.585');
    expect(mersinBody.hydrographyNoteTr).toContain('87,5'); // Berdan Barajı (was 185)
    expect(mersinBody.hydrographyNoteTr).not.toContain('185 milyon');
  });

  it('carries the wave-6b fact-check CORRECTIONS (Elazığ Keban 1.330 MW/6,6 milyar kWh, Malatya dünya kuru kayısı)', async () => {
    // The wave-6b independent fact-check's numeric/framing fixes — corrected value present,
    // superseded value absent (mirrors the wave-4 Nurhak/Medetsiz/Berdan guard). A silent revert
    // of either fix would otherwise pass CI under the generic non-empty prose check alone.
    const elazig = await request(app.getHttpServer()).get('/api/provinces/elazig').expect(200);
    const elazigBody = elazig.body as Record<string, string>;
    // Keban Barajı: EÜAŞ figures replace the Belediye source's wrong 134 MW / 7,5 milyar kWh.
    expect(elazigBody.hydrographyNoteTr).toContain('1.330 MW');
    expect(elazigBody.hydrographyNoteTr).toContain('6,6 milyar kWh');
    expect(elazigBody.hydrographyNoteTr).not.toContain('134 MW');
    expect(elazigBody.hydrographyNoteTr).not.toContain('7,5 milyar');

    const malatya = await request(app.getHttpServer()).get('/api/provinces/malatya').expect(200);
    const malatyaBody = malatya.body as Record<string, string>;
    // Kayısı stat: the source says "dünya kuru kayısı üretimi", NOT "Türkiye" — the draft's first
    // reading was wrong; the corrected qualifier ("dünya") must stay and the wrong one must not.
    expect(malatyaBody.introTr).toContain('dünya kuru kayısı üretiminin');
    expect(malatyaBody.introTr).not.toContain("Türkiye'nin kayısı");
  });

  // Wave-5 plain Tier-B (Adıyaman/Batman/Kilis/Siirt/Şırnak — nüfus <1M): 6 fields populated,
  // hydrographyFeatures + settlementNoteTr null (owner-approved scope cut, DEC 2026-07-11) — same
  // shape as wave-3 Tier-B. Siirt's netMigrationRate=-33.96 is the largest-magnitude value in ANY
  // wave. (Mardin — the Tier-B-but-büyükşehir exception with a POPULATED settlementNoteTr — is
  // deliberately NOT in this list; it gets its own dedicated test below.)
  it.each([
    {
      slug: 'adiyaman',
      intro: ['Nemrut Dağı', 'Kommagene'],
      landform: ['2.150', 'tümülüs', 'Kahta'],
      hydrography: ['Kahta Çayı', 'Atatürk Baraj Gölü'],
      urbanizationRate: 69.04,
      netMigrationRate: 1.86,
      economyValue: '%0,5',
    },
    {
      slug: 'batman',
      intro: ['Tüpraş', 'petrol rafinerisi'],
      landform: ['Raman Dağı', '1940', 'Raman-8'],
      hydrography: ['Batman Çayı', 'Dicle Nehri'],
      urbanizationRate: 84.12,
      netMigrationRate: -2.95,
      economyValue: '%0,4',
    },
    {
      slug: 'kilis',
      intro: ['en küçük beşinci', 'Gaziantep'],
      landform: ['Sof Dağı', '1.496', 'Darmik'],
      hydrography: ['Afrin Çayı', 'Asi Nehri'],
      urbanizationRate: 79.93,
      netMigrationRate: -3.43,
      economyValue: '%0,1',
    },
    {
      slug: 'siirt',
      intro: ['Botan Çayı', 'Hakkari'],
      landform: ['Yazlıca', '2.838', 'millî park'],
      hydrography: ['Kezer', 'Başur', 'Kurtalan'],
      urbanizationRate: 69.56,
      netMigrationRate: -33.96,
      economyValue: '%0,2',
    },
    {
      slug: 'sirnak',
      intro: ['Habur Sınır Kapısı', 'Irak'],
      landform: ['Cizre', 'Cudi', '2.114'],
      hydrography: ['Kızılsu', 'Habur Çayı'],
      urbanizationRate: 68.33,
      netMigrationRate: -14.08,
      economyValue: '%0,4',
    },
  ])(
    'GET /api/provinces/$slug serves the wave-5 Tier-B set: 6 fields populated, hydrographyFeatures + settlementNoteTr null',
    async ({
      slug,
      intro,
      landform,
      hydrography,
      urbanizationRate,
      netMigrationRate,
      economyValue,
    }) => {
      const res = await request(app.getHttpServer()).get(`/api/provinces/${slug}`).expect(200);
      const body = res.body as Record<string, unknown>;

      for (const token of intro) expect(body.introTr).toContain(token);
      for (const token of landform) expect(body.landformNoteTr).toContain(token);
      for (const token of hydrography) expect(body.hydrographyNoteTr).toContain(token);
      expect(body.landformNoteTr).not.toContain('DEĞİL');

      expect(body.urbanizationRate).toBe(urbanizationRate);
      expect(body.netMigrationRate).toBe(netMigrationRate);
      expect((body.economyIndicator as { value: string }).value).toBe(economyValue);

      // The two Tier-B omissions surface as null (never a bare [] or empty note).
      expect(body.hydrographyFeatures).toBeNull();
      expect(body.settlementNoteTr).toBeNull();
    },
  );

  // Wave-6d (Karadeniz-B, 9 BRAND-NEW il — the FIRST full-new-province batch): all 9 Tier-B, 6
  // fields populated, hydrographyFeatures + settlementNoteTr null (owner-approved scope cut,
  // DEC 2026-07-11) — same shape as the wave-3/4/5 Tier-B il. climateKoppen is MIXED (Csa/Cfa/Cfb)
  // and asserted in the value-loop above; here the prose carries the load-bearing facts by
  // distinctive token (same discipline as prior waves). Two fact-check guards ride along: Bartın's
  // introTr carries the CORRECTION ("üçüncü en küçük", after Yalova + Kilis — NOT "en küçük"), and
  // no shipped intro carries the scrubbed internal wave jargon ("dalga", esp. Bolu).
  it.each([
    {
      slug: 'tokat',
      intro: ['Kelkit Irmağı', 'kervan yolu', 'Orta Karadeniz'],
      landform: ['Kazova', 'Artova', 'Erbaa Ovası'],
      hydrography: ['Kelkit vadisinin', 'çöküntü', 'Niksar'],
      urbanizationRate: 66.55,
      netMigrationRate: 10.41,
      economyValue: '%0,4',
    },
    {
      slug: 'corum',
      intro: ['Hattuşa', 'Hitit', '2.087'],
      landform: ['Kaldırım Tepe', 'Köse Dağı', '1.776'],
      hydrography: ['Kızılırmak', 'Delice', 'çeltik'],
      urbanizationRate: 76.82,
      netMigrationRate: -12.82,
      economyValue: '%0,4',
    },
    {
      slug: 'sinop',
      intro: ['İnceburun', 'Boztepe', 'ortanca yaş'],
      landform: ['tombolo', 'Kretase', 'İnceburun Yarımadası'],
      hydrography: ['Sülük Gölü', 'volkanik'],
      urbanizationRate: 63.89,
      netMigrationRate: -9.52,
      economyValue: '%0,2',
    },
    {
      slug: 'kastamonu',
      intro: ['Ilgaz', '2.587', 'Küre'],
      landform: ['serpantin', 'şist', 'Küre Dağları'],
      hydrography: ['Gökırmak', 'Devrez', 'Tosya'],
      urbanizationRate: 65.04,
      netMigrationRate: -12.9,
      economyValue: '%0,3',
    },
    {
      slug: 'zonguldak',
      intro: ['taşkömürü', '1829', 'Uzun'],
      landform: ['kömür damar', 'kayalık'],
      hydrography: ['Filyos Çayı'],
      urbanizationRate: 64.21,
      netMigrationRate: -5.93,
      economyValue: '%0,5',
    },
    {
      slug: 'bartin',
      intro: ['üçüncü en küçük', 'Yalova ve Kilis', 'Amasra'],
      landform: ['2.059', 'plato', 'Ulus'],
      hydrography: ['Bartın Çayı', 'Amasra'],
      urbanizationRate: 49.73,
      netMigrationRate: -0.63,
      economyValue: '%0,1',
    },
    {
      slug: 'karabuk',
      intro: ['3 Nisan 1937', 'Yenice', 'WWF'],
      landform: ['kayın', 'porsuk'],
      hydrography: ['Filyos', 'Soğanlı'],
      urbanizationRate: 77.69,
      netMigrationRate: -14.31,
      economyValue: '%0,2',
    },
    {
      slug: 'duzce',
      intro: ['12 Kasım 1999', 'Mw 7,2', '87 gün'],
      landform: ['Elmacık', 'Hendek', 'neotektonik'],
      hydrography: ['Efteni Gölü', 'Küçük Melen'],
      urbanizationRate: 70.6,
      netMigrationRate: 3.89,
      economyValue: '%0,4',
    },
    {
      slug: 'bolu',
      intro: ['Abant Gölü', '1.325', 'sekiz komşu'],
      landform: ['Köroğlu', '2.499', 'andezit'],
      hydrography: ['Abant Gölü', 'Sakarya Nehri'],
      urbanizationRate: 74.19,
      netMigrationRate: 1.55,
      economyValue: '%0,4',
    },
  ])(
    'GET /api/provinces/$slug serves the wave-6d Tier-B set: 6 fields populated, hydrographyFeatures + settlementNoteTr null',
    async ({
      slug,
      intro,
      landform,
      hydrography,
      urbanizationRate,
      netMigrationRate,
      economyValue,
    }) => {
      const res = await request(app.getHttpServer()).get(`/api/provinces/${slug}`).expect(200);
      const body = res.body as Record<string, unknown>;

      for (const token of intro) expect(body.introTr).toContain(token);
      for (const token of landform) expect(body.landformNoteTr).toContain(token);
      for (const token of hydrography) expect(body.hydrographyNoteTr).toContain(token);
      // No fact-check note or internal wave jargon leaked into shipped prose.
      expect(body.landformNoteTr).not.toContain('DEĞİL');
      expect(body.introTr).not.toContain('dalga');

      expect(body.urbanizationRate).toBe(urbanizationRate);
      expect(body.netMigrationRate).toBe(netMigrationRate);
      expect((body.economyIndicator as { value: string }).value).toBe(economyValue);

      // The two Tier-B omissions surface as null (never a bare [] or empty note).
      expect(body.hydrographyFeatures).toBeNull();
      expect(body.settlementNoteTr).toBeNull();
    },
  );

  // Wave-5 Mardin — THE special exception (→ DEC 2026-07-12 "Tier-B büyükşehir caveat exception").
  // Mardin is Tier-B by population (<1M) but legally büyükşehir since 2012, so its %100
  // urbanizationRate is a 6360 legal artifact that MUST ship with its methodological framing — unlike
  // the plain Tier-B il above (whose settlementNoteTr is null), Mardin's is POPULATED, but with ONLY
  // the single caveat sentence (no migration stats — that number lives in netMigrationRate). This is
  // the THIRD detail-field variant (full / Tier-B-none / Tier-B-with-one-field); the test proves both
  // halves of the exception: settlementNoteTr populated-single-sentence, hydrographyFeatures STILL null.
  it('GET /api/provinces/mardin serves the Tier-B-but-büyükşehir settlementNoteTr EXCEPTION (single caveat sentence; hydrographyFeatures still null)', async () => {
    const res = await request(app.getHttpServer()).get('/api/provinces/mardin').expect(200);
    const body = res.body as Record<string, unknown>;

    // settlementNoteTr is POPULATED (unlike the plain Tier-B il) — the büyükşehir-caveat exception.
    expect(typeof body.settlementNoteTr).toBe('string');
    const note = body.settlementNoteTr as string;
    // It IS the 6360 %100 büyükşehir caveat, identical opening pattern to the Tier-A büyükşehir il.
    expect(note).toContain('6360');
    expect(note).toContain('%100');
    expect(note).toContain('büyükşehir statüsündeki illerde');
    // ONLY the single caveat sentence: the draft's explicit "tek cümle" constraint. The migration
    // note that every Tier-A settlementNoteTr carries ('göç' marker + the signed rate) is ABSENT —
    // Mardin's migration figure lives in the numeric field, not restated in prose.
    expect(note).not.toContain('göç');
    expect(note).not.toContain('-5,65');
    // Exactly one sentence: a single terminal period, no interior '. ' sentence break.
    expect(note.trim().endsWith('.')).toBe(true);
    expect(note.split('. ')).toHaveLength(1);

    // The exception is scoped to settlementNoteTr ALONE — hydrographyFeatures stays null (Mardin is
    // Tier-B for every other detail field), unlike a Tier-A il which carries the dam/river list.
    expect(body.hydrographyFeatures).toBeNull();
    // The scalars: %100 urbanization (the artifact the caveat frames) + the signed migration rate in
    // its own numeric field + the GSYH-share economyIndicator.
    expect(body.urbanizationRate).toBe(100);
    expect(body.netMigrationRate).toBe(-5.65);
    expect((body.economyIndicator as { value: string }).value).toBe('%0,5');
    // The three authored Tier-B prose fields are present and non-empty.
    for (const prose of [body.introTr, body.landformNoteTr, body.hydrographyNoteTr]) {
      expect(typeof prose).toBe('string');
      expect((prose as string).length).toBeGreaterThan(0);
    }
    expect(body.landformNoteTr).not.toContain('DEĞİL');
  });

  it('GET /api/provinces/erzurum serves the wave-6b büyükşehir settlementNoteTr EXCEPTION (single caveat sentence; hydrographyFeatures still null)', async () => {
    const res = await request(app.getHttpServer()).get('/api/provinces/erzurum').expect(200);
    const body = res.body as Record<string, unknown>;

    // settlementNoteTr is POPULATED (unlike the plain Tier-B il) — the büyükşehir-caveat exception
    // (→ DEC 2026-07-12), even though Erzurum's population (736.877) is well below 1M.
    expect(typeof body.settlementNoteTr).toBe('string');
    const note = body.settlementNoteTr as string;
    // It IS the 6360 %100 büyükşehir caveat, identical opening pattern to the Tier-A büyükşehir il.
    expect(note).toContain('6360');
    expect(note).toContain('%100');
    expect(note).toContain('büyükşehir statüsündeki illerde');
    // ONLY the single caveat sentence (the draft's explicit "tek cümle" constraint): NO migration
    // narrative — the figure lives in netMigrationRate, not restated in prose.
    expect(note).not.toContain('göç');
    expect(note).not.toContain('-15,86');
    expect(note.trim().endsWith('.')).toBe(true);
    expect(note.split('. ')).toHaveLength(1);

    // Exception scoped to settlementNoteTr ALONE — hydrographyFeatures stays null (Tier-B depth).
    expect(body.hydrographyFeatures).toBeNull();
    // Scalars: %100 urbanization (the artifact the caveat frames) + the signed migration rate +
    // GSYH-share economyIndicator.
    expect(body.urbanizationRate).toBe(100);
    expect(body.netMigrationRate).toBe(-15.86);
    expect((body.economyIndicator as { value: string }).value).toBe('%0,5');
    // Distinctive, Erzurum-specific prose tokens guard against a cross-province copy-paste.
    expect(body.landformNoteTr).toContain('Palandöken');
    expect(body.introTr).toContain('komşu');
    // The three authored Tier-B prose fields are present and non-empty.
    for (const prose of [body.introTr, body.landformNoteTr, body.hydrographyNoteTr]) {
      expect(typeof prose).toBe('string');
      expect((prose as string).length).toBeGreaterThan(0);
    }
  });

  it('GET /api/provinces/malatya serves the wave-6b büyükşehir settlementNoteTr EXCEPTION (single caveat sentence; the wave sole positive net migration)', async () => {
    const res = await request(app.getHttpServer()).get('/api/provinces/malatya').expect(200);
    const body = res.body as Record<string, unknown>;

    // settlementNoteTr POPULATED — the büyükşehir-caveat exception (→ DEC 2026-07-12), despite
    // Malatya's population (755.854) being below 1M.
    expect(typeof body.settlementNoteTr).toBe('string');
    const note = body.settlementNoteTr as string;
    expect(note).toContain('6360');
    expect(note).toContain('%100');
    expect(note).toContain('büyükşehir statüsündeki illerde');
    // ONLY the single caveat sentence: no migration narrative (the +6,88 figure lives in the field).
    expect(note).not.toContain('göç');
    expect(note).not.toContain('6,88');
    expect(note.trim().endsWith('.')).toBe(true);
    expect(note.split('. ')).toHaveLength(1);

    // hydrographyFeatures null (Tier-B depth); the exception is scoped to settlementNoteTr.
    expect(body.hydrographyFeatures).toBeNull();
    expect(body.urbanizationRate).toBe(100);
    // Malatya is the wave's SOLE positive net migration — assert the sign explicitly.
    expect(body.netMigrationRate).toBe(6.88);
    expect(body.netMigrationRate as number).toBeGreaterThan(0);
    expect((body.economyIndicator as { value: string }).value).toBe('%0,6');
    // Distinctive, Malatya-specific prose tokens guard against a cross-province copy-paste
    // (kayısı token tightened to the corrected "dünya kuru kayısı" qualifier — see the
    // dedicated wave-6b correction-guard test for the full toContain/not.toContain pair).
    expect(body.introTr).toContain('dünya kuru kayısı');
    expect(body.landformNoteTr).toContain('Beydağı');
    for (const prose of [body.introTr, body.landformNoteTr, body.hydrographyNoteTr]) {
      expect(typeof prose).toBe('string');
      expect((prose as string).length).toBeGreaterThan(0);
    }
  });

  // Wave-6a Tier-A deep content (Konya/Kayseri — nüfus ≥1M): the FULL 4-prose set (incl.
  // settlementNoteTr; both büyükşehir), asserted by distinctive fact token. Tokens are distinct
  // because each il is written to its OWN character (Konya: bozkır platosu/kapalı havza/Beyşehir;
  // Kayseri: Erciyes stratovolkanı/Sultansazlığı Ramsar). Konya is a BSk il — its climate caveat
  // is asserted via caveatContains in the it.each value loop above; here we cover the prose.
  it.each([
    {
      slug: 'konya',
      intro: ['40.838', 'Çatalhöyük'],
      landform: ['bozkır', 'Toros', 'Karacadağ'],
      hydrography: ['Çarşamba', 'Beyşehir', 'Tuz Gölü'],
      settlement: ['6360', '%100', '-0,97'],
    },
    {
      slug: 'kayseri',
      intro: ['Erciyes', 'OSB'],
      landform: ['3.917', 'stratovolkan', '2,5-3 milyon'],
      hydrography: ['Zamantı', 'Sultansazlığı', '13 Temmuz 1994'],
      settlement: ['6360', '%100', '+0,92'],
    },
  ])(
    'GET /api/provinces/$slug serves the wave-6a Tier-A deep-content prose (fact-checked tokens)',
    async ({ slug, intro, landform, hydrography, settlement }) => {
      const res = await request(app.getHttpServer()).get(`/api/provinces/${slug}`).expect(200);
      const body = res.body as Record<string, string>;
      for (const token of intro) expect(body.introTr).toContain(token);
      for (const token of landform) expect(body.landformNoteTr).toContain(token);
      for (const token of hydrography) expect(body.hydrographyNoteTr).toContain(token);
      for (const token of settlement) expect(body.settlementNoteTr).toContain(token);
      // No ALL-CAPS emphasis in shipped prose (CONTENT-STYLE.md §2), same guard as every wave.
      expect(body.landformNoteTr).not.toContain('DEĞİL');
    },
  );

  // Wave-6a plain Tier-B (Sivas/Yozgat/Kırşehir/Nevşehir/Niğde/Aksaray/Karaman/Kırıkkale/Çankırı —
  // nüfus <1M, none büyükşehir): 6 fields populated, hydrographyFeatures + settlementNoteTr null
  // (Tier-B scope cut) — same shape as wave-3/wave-5 Tier-B. Çankırı's -27.69 ‰ is this wave's most
  // negative net-migration. (Eskişehir — the Tier-B-but-büyükşehir exception with a POPULATED
  // settlementNoteTr — is covered in its own test below, NOT here.)
  it.each([
    {
      slug: 'sivas',
      intro: ['1.294', 'Kızılırmak', 'Divriği'],
      landform: ['plato', 'Karadeniz'],
      hydrography: ['İmranlı', '1.355'],
      urbanizationRate: 77.38,
      netMigrationRate: -21.14,
      economyValue: '%0,5',
    },
    {
      slug: 'yozgat',
      intro: ['Yozgat Çamlığı', '5 Şubat 1958'],
      landform: ['Çekerek', 'bozkır'],
      hydrography: ['Çekerek', 'Yeşilırmak'],
      urbanizationRate: 66.93,
      netMigrationRate: -20.23,
      economyValue: '%0,3',
    },
    {
      slug: 'kirsehir',
      intro: ['Ahi Evran', 'Kalehöyük'],
      landform: ['Kaman-Kırşehir', 'plato'],
      hydrography: ['Hirfanlı', 'Seyfe', 'Ramsar'],
      urbanizationRate: 81.81,
      netMigrationRate: -4.57,
      economyValue: '%0,2',
    },
    {
      slug: 'nevsehir',
      intro: ['Kapadokya', 'Göreme', 'Derinkuyu'],
      landform: ['tüf', 'peribacaları', 'Hasan Dağı'],
      hydrography: ['Kızılırmak', 'Damsa'],
      urbanizationRate: 66.42,
      netMigrationRate: 4.05,
      economyValue: '%0,3',
    },
    {
      slug: 'nigde',
      intro: ['patates', 'Hasan Dağı'],
      landform: ['3.268', 'Bolkar', 'Aladağlar'],
      hydrography: ['Seyhan', 'kapalı havza'],
      urbanizationRate: 62.92,
      netMigrationRate: -13.92,
      economyValue: '%0,3',
    },
    {
      slug: 'aksaray',
      intro: ['Ihlara', 'Tuz Gölü'],
      landform: ['Hasan Dağı', 'Melendiz', 'kanyon'],
      hydrography: ['Melendiz', '18 kilometre', 'menderes'],
      urbanizationRate: 74.2,
      netMigrationRate: -2.1,
      economyValue: '%0,4',
    },
    {
      slug: 'karaman',
      intro: ['1989', 'Karamanoğulları', 'Binbirkilise'],
      landform: ['Karadağ', 'Toros', 'Ermenek'],
      hydrography: ['Ermenek', 'Akdeniz'],
      urbanizationRate: 77.02,
      netMigrationRate: -5.79,
      economyValue: '%0,3',
    },
    {
      slug: 'kirikkale',
      intro: ['1925', 'MKE'],
      landform: ['Kızılırmak', 'en küçük'],
      hydrography: ['Delice', 'Kızılırmak'],
      urbanizationRate: 88.16,
      netMigrationRate: -11.58,
      economyValue: '%0,3',
    },
    {
      slug: 'cankiri',
      intro: ['Cfa', 'Kaya Tuzu', 'Hititler'],
      landform: ['Ilgaz', '2.587', 'jips'],
      hydrography: ['Kızılırmak', 'Devrez'],
      urbanizationRate: 69.39,
      netMigrationRate: -27.69,
      economyValue: '%0,2',
    },
  ])(
    'GET /api/provinces/$slug serves the wave-6a Tier-B set: 6 fields populated, hydrographyFeatures + settlementNoteTr null',
    async ({
      slug,
      intro,
      landform,
      hydrography,
      urbanizationRate,
      netMigrationRate,
      economyValue,
    }) => {
      const res = await request(app.getHttpServer()).get(`/api/provinces/${slug}`).expect(200);
      const body = res.body as Record<string, unknown>;

      // The three authored Tier-B prose fields carry their fact-checked tokens.
      for (const token of intro) expect(body.introTr).toContain(token);
      for (const token of landform) expect(body.landformNoteTr).toContain(token);
      for (const token of hydrography) expect(body.hydrographyNoteTr).toContain(token);
      expect(body.landformNoteTr).not.toContain('DEĞİL');

      // The three authored structured/scalar fields — urbanizationRate is a REAL rate (<100),
      // proving the non-büyükşehir path (no 6360 artifact).
      expect(body.urbanizationRate).toBe(urbanizationRate);
      expect(body.netMigrationRate).toBe(netMigrationRate);
      expect((body.economyIndicator as { value: string }).value).toBe(economyValue);

      // The two Tier-B omissions surface as null (never a bare [] or empty note).
      expect(body.hydrographyFeatures).toBeNull();
      expect(body.settlementNoteTr).toBeNull();
    },
  );

  // Wave-6a Eskişehir — the Tier-B-but-büyükşehir exception (→ DEC 2026-07-12), the SECOND province
  // (after wave-5's Mardin) to take this shape. Nüfus 927,956 (<1M → Tier-B: hydrographyFeatures
  // null) BUT büyükşehir since 1993, so its %100 urbanizationRate is a 6360 legal artifact that MUST
  // ship with its methodological framing — its settlementNoteTr is POPULATED (unlike the 9 plain
  // Tier-B il above), but with ONLY the single caveat sentence (no migration stats — that number
  // lives in netMigrationRate). Also a BSk il. This test proves both halves: settlementNoteTr
  // populated-single-sentence, hydrographyFeatures STILL null — the same discipline as Mardin's.
  it('GET /api/provinces/eskisehir serves the Tier-B-but-büyükşehir settlementNoteTr EXCEPTION (single caveat sentence; hydrographyFeatures still null)', async () => {
    const res = await request(app.getHttpServer()).get('/api/provinces/eskisehir').expect(200);
    const body = res.body as Record<string, unknown>;

    // settlementNoteTr is POPULATED (unlike the plain Tier-B il) — the büyükşehir-caveat exception.
    expect(typeof body.settlementNoteTr).toBe('string');
    const note = body.settlementNoteTr as string;
    // It IS the 6360 %100 büyükşehir caveat, identical framing to every büyükşehir il.
    expect(note).toContain('6360');
    expect(note).toContain('%100');
    expect(note).toContain('büyükşehir statüsündeki illerde');
    // ONLY the single caveat sentence: the draft's explicit "tek cümle" constraint. The migration
    // note that every Tier-A settlementNoteTr carries ('göç' marker + the signed rate) is ABSENT —
    // Eskişehir's migration figure lives in the numeric field, not restated in prose.
    expect(note).not.toContain('göç');
    expect(note).not.toContain('+7,43');
    // Exactly one sentence: a single terminal period, no interior '. ' sentence break.
    expect(note.trim().endsWith('.')).toBe(true);
    expect(note.split('. ')).toHaveLength(1);

    // The exception is scoped to settlementNoteTr ALONE — hydrographyFeatures stays null (Eskişehir
    // is Tier-B for every other detail field), unlike a Tier-A il which carries the dam/river list.
    expect(body.hydrographyFeatures).toBeNull();
    // The scalars: %100 urbanization (the artifact the caveat frames) + the signed migration rate in
    // its own numeric field + the GSYH-share economyIndicator.
    expect(body.urbanizationRate).toBe(100);
    expect(body.netMigrationRate).toBe(7.43);
    expect((body.economyIndicator as { value: string }).value).toBe('%1,1');
    // The three authored Tier-B prose fields are present and non-empty.
    for (const prose of [body.introTr, body.landformNoteTr, body.hydrographyNoteTr]) {
      expect(typeof prose).toBe('string');
      expect((prose as string).length).toBeGreaterThan(0);
    }
    expect(body.landformNoteTr).not.toContain('DEĞİL');
    // Eskişehir is the platform's fourth-class BSk il — the caveat names its own code.
    expect(body.climateNoteTr).toContain('BSk');
    expect(body.climateClassTr).toBe('Yarı Kurak Step İklimi');
  });

  // Wave-6c Tier-A deep content (Samsun — the batch's SOLE ≥1M il): the FULL 4-prose set (incl.
  // settlementNoteTr; büyükşehir), asserted by distinctive fact token — same discipline as every
  // prior wave. Tokens avoid the "bu parti(deki)" clause flagged to Atlas (a later terminology
  // correction must not break CI); the structured fields are asserted in the EXPECTED_PROVINCES loop.
  it('GET /api/provinces/samsun serves the wave-6c Tier-A deep-content prose (fact-checked tokens)', async () => {
    const res = await request(app.getHttpServer()).get('/api/provinces/samsun').expect(200);
    const body = res.body as Record<string, string>;
    for (const token of ['Amisos', '19 Mayıs', 'Kızılırmak']) expect(body.introTr).toContain(token);
    for (const token of ['Bafra Ovası', 'Çarşamba', 'Canik']) {
      expect(body.landformNoteTr).toContain(token);
    }
    for (const token of ['Ramsar', 'Çakmak', '358']) {
      expect(body.hydrographyNoteTr).toContain(token);
    }
    for (const token of ['6360', '%100', '+2,60']) expect(body.settlementNoteTr).toContain(token);
    // No ALL-CAPS emphasis in shipped prose (CONTENT-STYLE.md §2), same guard as every wave.
    expect(body.landformNoteTr).not.toContain('DEĞİL');
  });

  // Wave-6c plain Tier-B (Amasya/Artvin/Bayburt/Giresun/Gümüşhane/Rize — nüfus <1M, NOT büyükşehir):
  // 6 fields populated, hydrographyFeatures + settlementNoteTr null (owner-approved scope cut) — same
  // shape as wave-3/4/5 Tier-B. Gümüşhane's -42.80 ‰ is the platform's largest net-migration
  // magnitude. Two NEW Köppen classes here: Artvin Cfb, Bayburt Dsb. Tokens deliberately avoid the
  // clauses flagged to Atlas (Artvin's "Akdeniz kıyısına paralel", Bayburt's "bu parti", Gümüşhane's
  // "ikinci Köppen sınıfı") so a later content correction won't churn CI. (Trabzon 61 + Ordu 52 — the
  // Tier-B-but-büyükşehir exception with a POPULATED settlementNoteTr — get their own dedicated tests.)
  it.each([
    {
      slug: 'amasya',
      intro: ['Pontus', 'Harşena', 'UNESCO'],
      landform: ['Harşena Dağı', '300', 'kalker'],
      hydrography: ['Yeşilırmak', 'havzası'],
      urbanizationRate: 75.8,
      netMigrationRate: -1.65,
      economyValue: '%0,3',
    },
    {
      slug: 'artvin',
      intro: ['ormanlık', 'Çoruh', '%79'],
      landform: ['Kaçkar', '3.937', 'Karçal'],
      hydrography: ['Deriner', '249', 'Çoruh'],
      urbanizationRate: 65.27,
      netMigrationRate: -16,
      economyValue: '%0,1',
    },
    {
      slug: 'bayburt',
      intro: ['en az nüfuslu', 'Çoruh'],
      landform: ['Kop Dağı', '2.918', 'Çoşan'],
      hydrography: ['Pullur', 'Sakızlı', 'Karasu'],
      urbanizationRate: 65.95,
      netMigrationRate: -35.16,
      economyValue: '%0,1',
    },
    {
      slug: 'giresun',
      intro: ['fındığın', 'Giresun Adası'],
      landform: ['Giresun Dağları', 'Abdal Musa', '3.331'],
      hydrography: ['Aksu', 'Batlama', '898'],
      urbanizationRate: 67.73,
      netMigrationRate: -12.17,
      economyValue: '%0,3',
    },
    {
      slug: 'gumushane',
      intro: ['iç kesiminde', '1.216'],
      landform: ['Abdal Musa', 'Kelkit Ovası', '280'],
      hydrography: ['Harşit', '160', 'Kelkit Çayı'],
      urbanizationRate: 61.03,
      netMigrationRate: -42.8,
      economyValue: '%0,1',
    },
    {
      slug: 'rize',
      intro: ['en yağışlı', '2.250', 'çay'],
      landform: ['Kaçkar', 'Fırtına', '57'],
      hydrography: ['2.250', 'Fırtına', 'hidroelektrik'],
      urbanizationRate: 68.02,
      netMigrationRate: -11.87,
      economyValue: '%0,3',
    },
  ])(
    'GET /api/provinces/$slug serves the wave-6c Tier-B set: 6 fields populated, hydrographyFeatures + settlementNoteTr null',
    async ({
      slug,
      intro,
      landform,
      hydrography,
      urbanizationRate,
      netMigrationRate,
      economyValue,
    }) => {
      const res = await request(app.getHttpServer()).get(`/api/provinces/${slug}`).expect(200);
      const body = res.body as Record<string, unknown>;

      for (const token of intro) expect(body.introTr).toContain(token);
      for (const token of landform) expect(body.landformNoteTr).toContain(token);
      for (const token of hydrography) expect(body.hydrographyNoteTr).toContain(token);
      expect(body.landformNoteTr).not.toContain('DEĞİL');

      expect(body.urbanizationRate).toBe(urbanizationRate);
      expect(body.netMigrationRate).toBe(netMigrationRate);
      expect((body.economyIndicator as { value: string }).value).toBe(economyValue);

      // The two Tier-B omissions surface as null (never a bare [] or empty note).
      expect(body.hydrographyFeatures).toBeNull();
      expect(body.settlementNoteTr).toBeNull();
    },
  );

  // Wave-6c Trabzon + Ordu — the Tier-B-but-büyükşehir EXCEPTION (→ DEC 2026-07-12), same variant as
  // wave-5's Mardin: Tier-B by population (<1M) but legally büyükşehir, so %100 urbanizationRate is a
  // 6360 legal artifact carried by a MINIMAL single-sentence settlementNoteTr (no migration stats).
  // Two dedicated tests (mirroring Mardin's) prove both halves of the exception per il:
  // settlementNoteTr populated-single-sentence, hydrographyFeatures STILL null.
  it.each([
    { slug: 'trabzon', rate: -3.78, rateTr: '-3,78', economyValue: '%0,6' },
    { slug: 'ordu', rate: -7.25, rateTr: '-7,25', economyValue: '%0,5' },
  ])(
    'GET /api/provinces/$slug serves the Tier-B-but-büyükşehir settlementNoteTr EXCEPTION (single caveat sentence; hydrographyFeatures still null)',
    async ({ slug, rate, rateTr, economyValue }) => {
      const res = await request(app.getHttpServer()).get(`/api/provinces/${slug}`).expect(200);
      const body = res.body as Record<string, unknown>;

      // settlementNoteTr is POPULATED (unlike the plain Tier-B il) — the büyükşehir-caveat exception.
      expect(typeof body.settlementNoteTr).toBe('string');
      const note = body.settlementNoteTr as string;
      // It IS the 6360 %100 büyükşehir caveat, identical opening pattern to the Tier-A büyükşehir il.
      expect(note).toContain('6360');
      expect(note).toContain('%100');
      expect(note).toContain('büyükşehir statüsündeki illerde');
      // ONLY the single caveat sentence (the draft's explicit "tek cümle" constraint): the migration
      // note every Tier-A settlementNoteTr carries ('göç' marker + the signed rate) is ABSENT — the
      // migration figure lives in the numeric field, not restated in prose.
      expect(note).not.toContain('göç');
      expect(note).not.toContain(rateTr);
      // Exactly one sentence: a single terminal period, no interior '. ' sentence break.
      expect(note.trim().endsWith('.')).toBe(true);
      expect(note.split('. ')).toHaveLength(1);

      // The exception is scoped to settlementNoteTr ALONE — hydrographyFeatures stays null (Tier-B for
      // every other detail field), unlike a Tier-A il which carries the dam/river list.
      expect(body.hydrographyFeatures).toBeNull();
      // The scalars: %100 urbanization (the artifact the caveat frames) + the signed migration rate in
      // its own numeric field + the GSYH-share economyIndicator.
      expect(body.urbanizationRate).toBe(100);
      expect(body.netMigrationRate).toBe(rate);
      expect((body.economyIndicator as { value: string }).value).toBe(economyValue);
      // The three authored Tier-B prose fields are present and non-empty.
      for (const prose of [body.introTr, body.landformNoteTr, body.hydrographyNoteTr]) {
        expect(typeof prose).toBe('string');
        expect((prose as string).length).toBeGreaterThan(0);
      }
      expect(body.landformNoteTr).not.toContain('DEĞİL');
    },
  );

  it('GET /api/provinces/:slug returns 404 for an unknown slug', async () => {
    // All 81 real provinces are now seeded (wave-6c closed the rollout), so there is no longer a
    // "real, valid, but unseeded" province to use here — earlier examples ('bursa', then 'trabzon',
    // then 'hakkari'/'konya') have all been seeded by later waves. The endpoint must still 404 for a
    // slug that matches no province (a plain-ASCII fake that passes any slug shape validation).
    await request(app.getHttpServer()).get('/api/provinces/atlantis').expect(404);
    await request(app.getHttpServer()).get('/api/provinces/narnia').expect(404);
  });

  it('GET /health stays bare (excluded from the /api prefix)', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });
});

/**
 * M1: the Köppen⇒caveat invariant must actually FIRE on a violation, not just be
 * satisfied by the (currently-clean) pilot data — this is what stops the 81-province
 * scale-up from silently shipping a bare OR mismatched Köppen caveat. Pure function,
 * no DB. Since wave-2 the invariant also asserts CORRESPONDENCE (the caveat must name
 * its own code), so a Csa-flavoured caveat on a Cfa row fails — the copy-paste class
 * of bug the mixed-climate waves make possible. Wave-3 adds a THIRD code (Csb): the
 * self-maintaining substring check handles it with zero changes (Csb is absent from
 * the Csa/Cfa caveats and vice versa — no 3-letter code cross-matches), proven below.
 */
describe('assertKoppenCaveatInvariant', () => {
  const VALID_SEED: ProvinceSeed = {
    plateCode: '99',
    nameTr: 'Test',
    slugTr: 'test',
    slugEn: 'test',
    region: GeographicRegion.Marmara,
    population: 1,
    populationYear: 2025,
    areaKm2: 1,
    districtCount: 1,
    elevationM: 1,
    latitude: 40,
    longitude: 30,
    neighborPlateCodes: [],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    // The caveat must NAME its own code (correspondence check) — a real caveat always
    // does ("…bu ili Csa …"), so the fixture mirrors that, not a code-free stub.
    climateNoteTr: "MGM'nin 2023 Köppen sınıflandırması bu ili Csa olarak verir (uyarı).",
    landformNoteTr: null,
  };

  it('passes when a Köppen code carries a corresponding caveat', () => {
    expect(() => assertKoppenCaveatInvariant([VALID_SEED])).not.toThrow();
  });

  it('passes for a Cfa row whose caveat names Cfa (the wave-2 second class)', () => {
    expect(() =>
      assertKoppenCaveatInvariant([
        {
          ...VALID_SEED,
          climateKoppen: 'Cfa',
          climateClassTr: 'Karadeniz iklimi',
          climateNoteTr: "MGM'nin 2023 Köppen sınıflandırması bu ili Cfa olarak verir (uyarı).",
        },
      ]),
    ).not.toThrow();
  });

  it('passes for a Csb row whose caveat names Csb (the wave-3 third class)', () => {
    // Proves the self-maintaining substring check accepts a 3rd code with zero extra
    // work — its caveat names "Csb" and that alone satisfies correspondence.
    expect(() =>
      assertKoppenCaveatInvariant([
        {
          ...VALID_SEED,
          climateKoppen: 'Csb',
          climateClassTr: 'Akdeniz iklimi',
          climateNoteTr: "MGM'nin 2023 Köppen sınıflandırması bu ili Csb olarak verir (uyarı).",
        },
      ]),
    ).not.toThrow();
  });

  it('passes for a Cfb row whose caveat names Cfb (the wave-6d fourth class)', () => {
    // The platform's FOURTH climate class (Cfb, wave-6d Karadeniz-B) — the self-maintaining
    // substring check accepts it with zero extra work: its caveat names "Cfb", and Cfb is
    // pairwise non-substring with Csa/Cfa/Csb so no 4-code set member cross-matches.
    expect(() =>
      assertKoppenCaveatInvariant([
        {
          ...VALID_SEED,
          climateKoppen: 'Cfb',
          climateClassTr: 'Karadeniz iklimi',
          climateNoteTr: "MGM'nin 2023 Köppen sınıflandırması bu ili Cfb olarak verir (uyarı).",
        },
      ]),
    ).not.toThrow();
  });

  it('throws when the caveat does NOT name its code (Cfa caveat on a Cfb row)', () => {
    // Copy-paste guard for the 4th class: a Cfb province that kept a Cfa-flavoured caveat.
    // "Cfa" does NOT substring-satisfy a "Cfb" row (they differ only in the third letter),
    // so correspondence must fail even though a caveat is present.
    expect(() =>
      assertKoppenCaveatInvariant([
        {
          ...VALID_SEED,
          climateKoppen: 'Cfb',
          climateNoteTr: "MGM'nin 2023 Köppen sınıflandırması bu ili Cfa olarak verir (uyarı).",
        },
      ]),
    ).toThrow(/Köppen⇒caveat invariant violated/);
  });

  it.each([
    { code: 'Dfb', className: 'Karasal iklim' },
    { code: 'Dsb', className: 'Karasal iklim' },
    { code: 'Dsa', className: 'Karasal iklim' },
    { code: 'BSk', className: 'Yarı Kurak Step İklimi' },
  ])(
    'passes for a $code row whose caveat names $code (a wave-6b new class)',
    ({ code, className }) => {
      // The FOUR wave-6b codes are the platform's first non-"C" group. The self-maintaining
      // substring check accepts each with zero extra work — its caveat names the code and that
      // alone satisfies correspondence (the three D-codes share ONE class name but each caveat
      // still names its own 3-letter code).
      expect(() =>
        assertKoppenCaveatInvariant([
          {
            ...VALID_SEED,
            climateKoppen: code,
            climateClassTr: className,
            climateNoteTr: `MGM'nin 2023 Köppen sınıflandırması bu ili ${code} olarak verir (uyarı).`,
          },
        ]),
      ).not.toThrow();
    },
  );

  it('throws when the caveat does NOT name its code (Dsb caveat on a Dsa row)', () => {
    // The three D-codes share the SINGLE class name "Karasal iklim", so a copy-paste between
    // them is the wave-6b-specific hazard. Correspondence must still discriminate: a Dsa row
    // that kept a Dsb-flavoured caveat fails, because "Dsa" is absent from the Dsb caveat.
    expect(() =>
      assertKoppenCaveatInvariant([
        {
          ...VALID_SEED,
          climateKoppen: 'Dsa',
          climateClassTr: 'Karasal iklim',
          climateNoteTr: "MGM'nin 2023 Köppen sınıflandırması bu ili Dsb olarak verir (uyarı).",
        },
      ]),
    ).toThrow(/Köppen⇒caveat invariant violated/);
  });

  it('passes for a Dsb row whose caveat names Dsb (the platform first D-group class)', () => {
    // Dsb (Bayburt) → "Karasal iklim" (whole D-group label, DEC 2026-07-12). First non-"C" main
    // group; "Dsb" is pairwise non-substring with Csa/Cfa/Csb/Cfb, so correspondence holds.
    expect(() =>
      assertKoppenCaveatInvariant([
        {
          ...VALID_SEED,
          climateKoppen: 'Dsb',
          climateClassTr: 'Karasal iklim',
          climateNoteTr: "MGM'nin 2023 Köppen sınıflandırması bu ili Dsb olarak verir (uyarı).",
        },
      ]),
    ).not.toThrow();
  });

  it('throws when a Cfa caveat sits on a Cfb row (the wave-6c copy-paste guard)', () => {
    // Cfb and Cfa share the "Karadeniz iklimi" LABEL but are DISTINCT codes — a Cfb row that kept a
    // Cfa-flavoured caveat must fail correspondence (label-equality must NOT mask a code mismatch).
    expect(() =>
      assertKoppenCaveatInvariant([
        {
          ...VALID_SEED,
          climateKoppen: 'Cfb',
          climateClassTr: 'Karadeniz iklimi',
          climateNoteTr: "MGM'nin 2023 Köppen sınıflandırması bu ili Cfa olarak verir (uyarı).",
        },
      ]),
    ).toThrow(/Köppen⇒caveat invariant violated/);
  });

  it('throws when a Köppen code has an empty caveat (bare code)', () => {
    expect(() => assertKoppenCaveatInvariant([{ ...VALID_SEED, climateNoteTr: '' }])).toThrow(
      /Köppen⇒caveat invariant violated/,
    );
  });

  it('throws when the caveat is whitespace-only', () => {
    expect(() => assertKoppenCaveatInvariant([{ ...VALID_SEED, climateNoteTr: '   ' }])).toThrow();
  });

  it('throws when the caveat does NOT name its code (Csa caveat on a Cfa row)', () => {
    // The copy-paste bug the mixed-climate waves make possible: a Cfa province that
    // kept a Csa-flavoured caveat. Presence alone would pass; correspondence must fail.
    expect(() =>
      assertKoppenCaveatInvariant([
        {
          ...VALID_SEED,
          climateKoppen: 'Cfa',
          climateNoteTr: "MGM'nin 2023 Köppen sınıflandırması bu ili Csa olarak verir (uyarı).",
        },
      ]),
    ).toThrow(/Köppen⇒caveat invariant violated/);
  });

  it('throws when the caveat does NOT name its code (Csa caveat on a Csb row)', () => {
    // Same copy-paste bug for the wave-3 third class: a Csb province that kept a
    // Csa-flavoured caveat. Proves "Csa" does NOT substring-satisfy a "Csb" row —
    // the 3rd code is discriminated correctly, not accidentally waved through.
    expect(() =>
      assertKoppenCaveatInvariant([
        {
          ...VALID_SEED,
          climateKoppen: 'Csb',
          climateNoteTr: "MGM'nin 2023 Köppen sınıflandırması bu ili Csa olarak verir (uyarı).",
        },
      ]),
    ).toThrow(/Köppen⇒caveat invariant violated/);
  });

  it('does not require a caveat when there is no Köppen code', () => {
    expect(() =>
      assertKoppenCaveatInvariant([{ ...VALID_SEED, climateKoppen: '', climateNoteTr: '' }]),
    ).not.toThrow();
  });
});

/**
 * Pure, DB-free coverage of the density derivation — critically the NULL/zero
 * branch, which is the NORMAL state of an unseeded province — 0 of 81 now that the seed is
 * COMPLETE, but the unit test still guards the null/zero branch for correctness.
 * The e2e above only exercises the value branch (all 81 seeded provinces have
 * population + area), so without this a regression in the guard (dropped
 * null-check, removed `areaKm2 === 0` guard) could serve a wrong "0" or a
 * non-finite number on a public SEO page with CI staying green. Mirrors the
 * `assertKoppenCaveatInvariant` block.
 */
describe('computePopulationDensity', () => {
  it('rounds population / area to the nearest integer (kişi/km²)', () => {
    expect(computePopulationDensity(15_754_053, 5461)).toBe(2885);
    expect(computePopulationDensity(1000, 3)).toBe(333); // 333.33… → 333
    expect(computePopulationDensity(1000, 8)).toBe(125); // exact
  });

  it('returns null when population is null (an unseeded province — never 0)', () => {
    expect(computePopulationDensity(null, 5461)).toBeNull();
  });

  it('returns null when area is null', () => {
    expect(computePopulationDensity(15_754_053, null)).toBeNull();
  });

  it('returns null when both inputs are null', () => {
    expect(computePopulationDensity(null, null)).toBeNull();
  });

  it('returns null — never Infinity — when area is 0', () => {
    expect(computePopulationDensity(1000, 0)).toBeNull();
  });
});
