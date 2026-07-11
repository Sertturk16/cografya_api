import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
// which stay independent in EXPECTED_PROVINCES.
import {
  BATCH2_WAVE1_PROVINCES,
  BATCH2_WAVE2_PROVINCES,
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
 * wave-1 + 10 Batch 2 wave-2 + 7 Batch 2 wave-3 = 31), restated INDEPENDENTLY of the
 * seed source (NOT imported from the seed arrays) so a transcription regression in the
 * seed is caught rather than tautologically passed. Pilot values trace to
 * il-data-dictionary §2.1 (fact-checked 2026-07-08); wave-1 values trace to
 * batch2-wave1-factcheck.md (2026-07-10); wave-2 values trace to
 * batch2-wave2-factcheck.md (2026-07-10); wave-3 values trace to
 * batch2-wave3-factcheck.md (2026-07-11, core fields 7/7 VERIFIED, zero deviations —
 * the cleanest wave yet). `populationDensity` is round(population / areaKm2) — the
 * server derives it, so it is computed here by hand to catch a broken derivation too.
 * Köppen is MIXED across three classes now: wave-2 Kocaeli+Sakarya and wave-3
 * Afyonkarahisar are Cfa; wave-3 Kütahya is Csb (the third class); the rest are Csa.
 * `caveatContains` is the province's OWN class code, asserting each row got the caveat
 * that names its code (Cfa/Csb caveat, not the Csa one) — the copy-paste guard.
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
  },
] as const;

/**
 * Real-Postgres e2e (Testcontainers): proves the migrations run clean, the
 * `db:seed:geography` seed lands ALL 31 fact-checked provinces (5 pilot + 9 Batch 2
 * wave-1 + 10 Batch 2 wave-2 + 7 Batch 2 wave-3) IDEMPOTENTLY (no duplicate rows, no
 * `updated_at` bump on a no-op re-seed), and the public read endpoints serve that data
 * under the `/api` prefix. Runs on CI only (needs Docker); locally we run tsc + eslint
 * per CONVENTIONS §2.
 */
describe('Province (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;

  // Captured in beforeAll (setup MUST run there), asserted in named it() blocks
  // so a red run points at the exact failed check. FIVE seed phases model the FULL
  // incremental rollout history (empty → pilot-5 → +wave-1 → +wave-2 → +wave-3 →
  // re-run), so ALL THREE mixed transitions — including THIS PR's real one (24
  // present → +7) — are exercised, not just the homogeneous all-insert/all-no-op
  // extremes. NOTE (next engineer): this per-wave chain is deliberately kept through
  // wave-3, but it must NOT grow one phase per remaining wave forever. CONCRETE
  // TRIGGER — at wave-4, stop adding per-wave phases and collapse to a representative
  // set (empty→first all-insert + ONE multi-batch mixed [the latest transition] +
  // full no-op), since per-row independence doesn't actually care how many prior
  // batches the no-op set spans.
  let appliedMigrationNames: string[];
  let pilotOnlySeed: SeedGeographyResult;
  let wave1MixedSeed: SeedGeographyResult;
  let wave2MixedSeed: SeedGeographyResult;
  let wave3MixedSeed: SeedGeographyResult;
  let reSeed: SeedGeographyResult;
  let istanbulUpdatedAtAfterPilotInsert: string;
  let istanbulUpdatedAtAfterWave1: string;
  let istanbulUpdatedAtAfterWave2: string;
  let istanbulUpdatedAtAfterWave3: string;
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

    // 2) Seed in the REAL rollout order so every mixed insert/no-op path the platform
    //    has actually shipped is exercised — not just the two homogeneous extremes:
    //      Phase 1 — empty DB seeded with the pilot-5 ONLY: the state PR-4a left
    //        (all-insert). Snapshot İstanbul's updated_at.
    //      Phase 2 — wave-1's shipped rollout: re-seed the SAME DB with pilot+wave-1
    //        (14). The 5 pilot rows already match (no-op) and the 9 wave-1 rows are
    //        new (insert) → a MIXED batch. İstanbul's updated_at must be UNCHANGED.
    //      Phase 3 — wave-2's shipped rollout: re-seed with pilot+wave-1+wave-2 (24).
    //        The 14 already-present rows are no-ops and the 10 wave-2 rows are new
    //        (insert) → the second MIXED batch. İstanbul's updated_at STILL unchanged.
    //      Phase 4 — THIS PR's shipped rollout: re-seed with the full 31-list
    //        (SEED_PROVINCES). The 24 already-present rows (spanning THREE prior
    //        batches) are no-ops and the 7 wave-3 rows are new (insert) → the third,
    //        largest MIXED batch. İstanbul's updated_at must STILL be unchanged (a
    //        mixed batch never touches the rows it leaves alone, at any scale, no
    //        matter how many prior batches the no-op set spans).
    //      Phase 5 — a routine re-run over the complete 31: pure no-op, proving
    //        idempotency AND no updated_at churn (SEO lastmod honesty, §6).
    //    PILOT_PROVINCES / PILOT_PLUS_WAVE1 / PILOT_PLUS_WAVE1_WAVE2 / SEED_PROVINCES
    //    drive the phases here; value correctness is asserted independently from
    //    EXPECTED_PROVINCES.
    const PILOT_PLUS_WAVE1 = [...PILOT_PROVINCES, ...BATCH2_WAVE1_PROVINCES];
    const PILOT_PLUS_WAVE1_WAVE2 = [
      ...PILOT_PROVINCES,
      ...BATCH2_WAVE1_PROVINCES,
      ...BATCH2_WAVE2_PROVINCES,
    ];
    const repo = dataSource.getRepository(Province);
    pilotOnlySeed = await seedGeography(dataSource, PILOT_PROVINCES);
    istanbulUpdatedAtAfterPilotInsert = (
      await repo.findOneByOrFail({ plateCode: '34' })
    ).updatedAt.toISOString();
    wave1MixedSeed = await seedGeography(dataSource, PILOT_PLUS_WAVE1);
    istanbulUpdatedAtAfterWave1 = (
      await repo.findOneByOrFail({ plateCode: '34' })
    ).updatedAt.toISOString();
    wave2MixedSeed = await seedGeography(dataSource, PILOT_PLUS_WAVE1_WAVE2);
    istanbulUpdatedAtAfterWave2 = (
      await repo.findOneByOrFail({ plateCode: '34' })
    ).updatedAt.toISOString();
    wave3MixedSeed = await seedGeography(dataSource, SEED_PROVINCES);
    istanbulUpdatedAtAfterWave3 = (
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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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

  it('phase 2 — re-seeding pilot+wave-1 (14) over the pilot-5 is a MIXED batch', () => {
    // Wave-1's shipped rollout: the 5 pilot rows are already present (no-ops) and the
    // 9 wave-1 rows are new (inserts) — a genuine mixed batch that guards per-row
    // independence (a shared-state regression would mis-count HERE while the
    // homogeneous all-insert/all-no-op cases stayed green).
    expect(wave1MixedSeed).toEqual({ inserted: 9, updated: 0, unchanged: 5, total: 14 });
    // A mixed batch must NOT touch the updated_at of the rows it leaves alone.
    expect(istanbulUpdatedAtAfterWave1).toBe(istanbulUpdatedAtAfterPilotInsert);
  });

  it('phase 3 — re-seeding pilot+wave-1+wave-2 (24) over the 14 is a MIXED batch', () => {
    // Wave-2's shipped rollout: 14 rows already present (5 pilot + 9 wave-1, all
    // no-ops) and the 10 wave-2 rows are new (inserts) — the second mixed transition,
    // proving per-row independence when the no-op set spans TWO prior batches.
    expect(wave2MixedSeed).toEqual({ inserted: 10, updated: 0, unchanged: 14, total: 24 });
    // Still frozen: a mixed batch never touches the rows it leaves alone.
    expect(istanbulUpdatedAtAfterWave2).toBe(istanbulUpdatedAtAfterWave1);
  });

  it("phase 4 — re-seeding the full 31 over the 24 is THIS PR's MIXED batch", () => {
    // The realistic rollout THIS PR ships: 24 rows already present (5 pilot + 9 wave-1
    // + 10 wave-2, all no-ops) and the 7 wave-3 rows are new (inserts). The largest,
    // third mixed transition — proves per-row independence still holds when the no-op
    // set spans THREE prior batches, not just one or two.
    expect(wave3MixedSeed).toEqual({ inserted: 7, updated: 0, unchanged: 24, total: 31 });
    // Still frozen: a mixed batch never touches the rows it leaves alone, at any scale.
    expect(istanbulUpdatedAtAfterWave3).toBe(istanbulUpdatedAtAfterWave2);
  });

  it('phase 5 — re-seed is a no-op: no duplicates, no writes, no updated_at churn', async () => {
    // Every row already matches → all 31 unchanged, none updated/inserted.
    expect(reSeed).toEqual({ inserted: 0, updated: 0, unchanged: 31, total: 31 });
    // Still exactly 31 rows.
    const count = await dataSource.getRepository(Province).count();
    expect(count).toBe(31);
    // updated_at was NOT bumped by the no-op re-seed.
    expect(istanbulUpdatedAtAfterReseed).toBe(istanbulUpdatedAtAfterWave3);
  });

  it('round-trips a seeded Province (transformer + array + deliberate nulls)', async () => {
    const istanbul = await dataSource.getRepository(Province).findOneByOrFail({ plateCode: '34' });
    // numeric(9,6) comes back through the transformer as a real number
    expect(istanbul.latitude).toBe(40.9819);
    expect(istanbul.longitude).toBe(28.8208);
    // varchar[] round-trips as an array
    expect(istanbul.neighborPlateCodes).toEqual(['59', '41']);
    // the MGM caveat travels with the Köppen value (never a bare code)
    expect(istanbul.climateKoppen).toBe('Csa');
    expect(istanbul.climateNoteTr).toContain('MGM');
    // unseeded research field stays null (never invented for the pilot)
    expect(istanbul.landformNoteTr).toBeNull();
    // NEW detail-section fields ship as SCHEMA ONLY — no content this PR, so every
    // one stays null for the pilot (deliberately unpopulated, never invented).
    expect(istanbul.introTr).toBeNull();
    expect(istanbul.hydrographyNoteTr).toBeNull();
    expect(istanbul.hydrographyFeatures).toBeNull();
    expect(istanbul.urbanizationRate).toBeNull();
    expect(istanbul.netMigrationRate).toBeNull();
    expect(istanbul.settlementNoteTr).toBeNull();
    expect(istanbul.economyIndicator).toBeNull();
  });

  it('GET /api/provinces returns all 31, plate-ordered, lean (no detail leak)', async () => {
    const res = await request(app.getHttpServer()).get('/api/provinces').expect(200);
    const body = res.body as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(31);
    // lexical plate order across all four batches (pilot + wave-1 + wave-2 + wave-3).
    expect(body.map((p) => p.plateCode)).toEqual([
      '02',
      '03',
      '06',
      '07',
      '09',
      '10',
      '11',
      '16',
      '17',
      '20',
      '21',
      '22',
      '27',
      '34',
      '35',
      '39',
      '41',
      '43',
      '45',
      '47',
      '48',
      '54',
      '56',
      '59',
      '63',
      '64',
      '65',
      '72',
      '73',
      '77',
      '79',
    ]);
    // first row is still Adıyaman (02) — a wave-1 province sorts ahead of the pilots.
    expect(body[0]).toMatchObject({
      plateCode: '02',
      nameTr: 'Adıyaman',
      region: 'GUNEYDOGU_ANADOLU',
      slugTr: 'adiyaman',
      slugEn: 'adiyaman',
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
    expect(body).toHaveLength(31);
    // same plate order as the list endpoint (all 31, four batches)
    expect(body.map((p) => p.plateCode)).toEqual([
      '02',
      '03',
      '06',
      '07',
      '09',
      '10',
      '11',
      '16',
      '17',
      '20',
      '21',
      '22',
      '27',
      '34',
      '35',
      '39',
      '41',
      '43',
      '45',
      '47',
      '48',
      '54',
      '56',
      '59',
      '63',
      '64',
      '65',
      '72',
      '73',
      '77',
      '79',
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
  // `finally` so the other tests still see exactly the 31 seeded rows.
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
      // Clean up unconditionally so the 31-row count assumed by the other tests
      // holds even if an assertion above throws.
      await repo.delete({ plateCode: '00' });
    }
  });

  // I1/M4: assert EVERY seeded province's key fact-checked fields (all 31, four
  // batches — not just İstanbul) so a transcription regression in any row fails CI.
  // The province-specific MGM caveat (Ankara/Van divergence), the Cfa caveat
  // (Kocaeli/Sakarya/Afyonkarahisar, caveatContains: 'Cfa') and the wave-3 Csb caveat
  // (Kütahya, caveatContains: 'Csb') are asserted here too.
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
        // deferred/unpopulated fields — schema ships this PR, content later; every
        // one must be null for the pilot (never invented).
        landformNoteTr: null,
        introTr: null,
        hydrographyNoteTr: null,
        hydrographyFeatures: null,
        urbanizationRate: null,
        netMigrationRate: null,
        settlementNoteTr: null,
        economyIndicator: null,
      });
      expect(body.latitude).toBe(expected.latitude);
      expect(body.longitude).toBe(expected.longitude);

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

  it('GET /api/provinces/:slug returns 404 for an unseeded slug', async () => {
    // A real, valid province NOT in the seeded 24 → 404 (web renders notFound()).
    // NB: 'bursa' USED to be the unseeded example — it is now seeded (wave-2), so
    // this uses 'trabzon' (a real Karadeniz province still awaiting its wave).
    await request(app.getHttpServer()).get('/api/provinces/trabzon').expect(404);
    await request(app.getHttpServer()).get('/api/provinces/atlantis').expect(404);
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
 * branch, which is the NORMAL state of every not-yet-seeded province (50 of 81).
 * The e2e above only exercises the value branch (all 31 seeded provinces have
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
