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
 * wave-1 + 10 Batch 2 wave-2 + 7 Batch 2 wave-3 + 7 Batch 2 wave-4 = 38), restated
 * INDEPENDENTLY of the seed source (NOT imported from the seed arrays) so a
 * transcription regression in the seed is caught rather than tautologically passed.
 * Pilot values trace to il-data-dictionary §2.1 (fact-checked 2026-07-08); wave-1
 * values trace to batch2-wave1-factcheck.md (2026-07-10); wave-2 values trace to
 * batch2-wave2-factcheck.md (2026-07-10); wave-3 values trace to
 * batch2-wave3-factcheck.md (2026-07-11); wave-4 (Akdeniz) values trace to
 * batch2-wave4-factcheck.md (2026-07-11, core fields 7/7 VERIFIED, ZERO numeric
 * deviations — including the Kahramanmaraş elevation=572 GLOSSARY §1 exception, which
 * uses MGM's coordinate-identical Onikişubat record because the literal "Merkez"
 * default returns a broken 0 m). `populationDensity` is round(population / areaKm2) —
 * the server derives it, so it is computed here by hand to catch a broken derivation
 * too. Köppen is MIXED across three classes: wave-2 Kocaeli+Sakarya and wave-3
 * Afyonkarahisar are Cfa; wave-3 Kütahya is Csb (the third class); all 7 wave-4
 * provinces are Csa (no new class); the rest are Csa. `caveatContains` is the
 * province's OWN class code, asserting each row got the caveat that names its code
 * (Cfa/Csb caveat, not the Csa one) — the copy-paste guard.
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
] as const;

/**
 * Real-Postgres e2e (Testcontainers): proves the migrations run clean, the
 * `db:seed:geography` seed lands ALL 38 fact-checked provinces (5 pilot + 9 Batch 2
 * wave-1 + 10 Batch 2 wave-2 + 7 Batch 2 wave-3 + 7 Batch 2 wave-4) IDEMPOTENTLY (no
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
    //      Phase 2 — re-seed the SAME DB with the FULL 38-list (SEED_PROVINCES). The 5
    //        pilot rows already match (no-op) and the other 33 are new (insert) → a
    //        MIXED batch, the largest this repo ships. İstanbul's updated_at must be
    //        UNCHANGED (a mixed batch never touches the rows it leaves alone — and, per
    //        the earlier waves' agreed trigger, the number of prior batches the no-op
    //        set spans does not change what this proves, so one mixed transition stands
    //        in for the old +wave-1/+wave-2/+wave-3 chain).
    //      Phase 3 — a routine re-run over the complete 38: pure no-op, proving
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

  it('phase 2 — re-seeding the full 38 over the pilot-5 is a MIXED batch', () => {
    // The representative mixed transition (the wave-4 collapse of the old per-wave
    // chain): the 5 pilot rows are already present (no-ops) and the other 33 are new
    // (inserts) — a genuine mixed batch that guards per-row independence. A shared-state
    // regression would mis-count HERE while the homogeneous all-insert (phase 1) and
    // all-no-op (phase 3) cases stayed green. The no-op set spanning one prior batch
    // rather than three does not change what this proves.
    expect(fullMixedSeed).toEqual({ inserted: 33, updated: 0, unchanged: 5, total: 38 });
    // A mixed batch must NOT touch the updated_at of the rows it leaves alone.
    expect(istanbulUpdatedAtAfterFullInsert).toBe(istanbulUpdatedAtAfterPilotInsert);
  });

  it('phase 3 — re-seed is a no-op: no duplicates, no writes, no updated_at churn', async () => {
    // Every row already matches → all 38 unchanged, none updated/inserted.
    expect(reSeed).toEqual({ inserted: 0, updated: 0, unchanged: 38, total: 38 });
    // Still exactly 38 rows.
    const count = await dataSource.getRepository(Province).count();
    expect(count).toBe(38);
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
    // Only İstanbul drifted (via the economyIndicator comparison) → 1 updated, 37 untouched.
    expect(result).toEqual({ inserted: 0, updated: 1, unchanged: 37, total: 38 });

    // The drifted field was actually re-written from the seed.
    const istanbul = await repo.findOneByOrFail({ plateCode: '34' });
    expect(istanbul.economyIndicator).toEqual({
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%29,2',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    });
    // Still exactly 38 rows — an UPDATE, never an insert/delete.
    expect(await repo.count()).toBe(38);
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
    // İstanbul drifts (economyIndicator retracted → null) → 1 updated, 37 unchanged.
    expect(result).toEqual({ inserted: 0, updated: 1, unchanged: 37, total: 38 });

    // The retracted field is actually CLEARED in the DB (the coherence fix works).
    const istanbul = await repo.findOneByOrFail({ plateCode: '34' });
    expect(istanbul.economyIndicator).toBeNull();
    // The retraction is a genuine no-op on re-run (does not churn `updated` forever).
    const rerun = await seedGeography(dataSource, retractedList);
    expect(rerun).toEqual({ inserted: 0, updated: 0, unchanged: 38, total: 38 });

    // Restore the canonical, fully-populated İstanbul for the later tests.
    const restore = await seedGeography(dataSource);
    expect(restore).toEqual({ inserted: 0, updated: 1, unchanged: 37, total: 38 });
    expect((await repo.findOneByOrFail({ plateCode: '34' })).economyIndicator).not.toBeNull();
    expect(await repo.count()).toBe(38);
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

    // A base-data-only province keeps EVERY detail field null: the deep-content updates are
    // surgical and must NOT leak into sibling rows. Picked DYNAMICALLY as an EXPECTED row with
    // no deep-content set (Bursa used to be the example but is now a wave-2 deep-content il) —
    // self-maintaining so this stays correct as later waves fill their provinces, until none
    // remain base-only. Today the wave-4 Akdeniz rows are the base-data-only ones here.
    const baseOnlyExpected = EXPECTED_PROVINCES.find((p) => !('economyIndicator' in p));
    if (!baseOnlyExpected) throw new Error('expected at least one base-data-only province');
    const baseOnly = await repo.findOneByOrFail({ plateCode: baseOnlyExpected.plateCode });
    expect(baseOnly.introTr).toBeNull();
    expect(baseOnly.landformNoteTr).toBeNull();
    expect(baseOnly.hydrographyNoteTr).toBeNull();
    expect(baseOnly.hydrographyFeatures).toBeNull();
    expect(baseOnly.urbanizationRate).toBeNull();
    expect(baseOnly.netMigrationRate).toBeNull();
    expect(baseOnly.settlementNoteTr).toBeNull();
    expect(baseOnly.economyIndicator).toBeNull();
  });

  it('GET /api/provinces returns all 38, plate-ordered, lean (no detail leak)', async () => {
    const res = await request(app.getHttpServer()).get('/api/provinces').expect(200);
    const body = res.body as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(38);
    // lexical plate order across all five batches (pilot + wave-1 + wave-2 + wave-3 + wave-4).
    expect(body.map((p) => p.plateCode)).toEqual([
      '01',
      '02',
      '03',
      '06',
      '07',
      '09',
      '10',
      '11',
      '15',
      '16',
      '17',
      '20',
      '21',
      '22',
      '27',
      '31',
      '32',
      '33',
      '34',
      '35',
      '39',
      '41',
      '43',
      '45',
      '46',
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
      '80',
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
    expect(body).toHaveLength(38);
    // same plate order as the list endpoint (all 38, five batches)
    expect(body.map((p) => p.plateCode)).toEqual([
      '01',
      '02',
      '03',
      '06',
      '07',
      '09',
      '10',
      '11',
      '15',
      '16',
      '17',
      '20',
      '21',
      '22',
      '27',
      '31',
      '32',
      '33',
      '34',
      '35',
      '39',
      '41',
      '43',
      '45',
      '46',
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
      '80',
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
  // `finally` so the other tests still see exactly the 38 seeded rows.
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
      // Clean up unconditionally so the 38-row count assumed by the other tests
      // holds even if an assertion above throws.
      await repo.delete({ plateCode: '00' });
    }
  });

  // I1/M4: assert EVERY seeded province's key fact-checked fields (all 38, five
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

      // Detail-section fields — THREE tiers coexist across the seed (tiered model introduced by
      // wave-3, extended by wave-4):
      //   • FULL (8 fields): İstanbul 34 + the wave-1 four (06/35/65/07) + the wave-3 Tier-A
      //     four (Manisa 45, Aydın 09, Denizli 20, Muğla 48) + the 10 wave-2 Marmara il
      //     (10/11/16/17/22/39/41/54/59/77 — full 7-field, no Tier-B that wave) + the wave-4
      //     Tier-A four (Adana 01, Hatay 31, Kahramanmaraş 46, Mersin 33). Structured fields
      //     asserted EXACTLY here; the 4 prose fields get distinctive-token checks below.
      //   • TIER-B (6 fields): the wave-3 <1M il (Afyonkarahisar 03, Kütahya 43, Uşak 64) +
      //     the wave-4 <1M il (Burdur 15, Isparta 32, Osmaniye 80). hydrographyFeatures AND
      //     settlementNoteTr are DELIBERATELY absent → null (owner-approved scope cut,
      //     DEC 2026-07-11); asserted null HERE, while the other six are populated (3 non-empty
      //     prose + urbanizationRate/netMigrationRate/economyIndicator). This populated+null MIX
      //     within one row is the shape wave-3 introduced and wave-4 continues.
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
        expected.plateCode === '33'
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
        expected.plateCode === '80'
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

  it('GET /api/provinces/:slug returns 404 for an unseeded slug', async () => {
    // A real, valid province NOT in the seeded 38 → 404 (web renders notFound()).
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
 * branch, which is the NORMAL state of every not-yet-seeded province (43 of 81).
 * The e2e above only exercises the value branch (all 38 seeded provinces have
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
