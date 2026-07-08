import { GeographicRegion } from '../../common/geographic-region.enum';

/**
 * PILOT-5 il seed data — İstanbul, Ankara, İzmir, Van, Antalya.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROVENANCE (traceability — CONVENTIONS §4: no sourceless facts)
 * ─────────────────────────────────────────────────────────────────────────────
 * SOURCE OF RECORD: NOVA's il-level data dictionary, status
 *   "SEED-READY (fact-checked 2026-07-08)" — an independent fact-check pass (a
 *   different actor from the drafter) verified every value below.
 *   • Owner-home:  Owner's Inbox/data-source-groundwork/il-data-dictionary.md (§2.1)
 *   • Fact-check:  Owner's Inbox/data-source-groundwork/pilot-5-factcheck.md
 *   • Ledger:      data-provenance.md (root) — Batch 1
 *   • Repo snapshot of Batch 1: docs/data-provenance-pilot5.md
 * Per-field Tier-1 authorities:
 *   • Nüfus (31.12.2025)          → TÜİK ADNKS 2025 (VERIFIED, 5/5)
 *   • Yüzölçümü (km²)             → Harita Genel Müdürlüğü (VERIFIED, 5/5)
 *   • İlçe sayısı                 → İçişleri Bakanlığı e-İçişleri (VERIFIED, 5/5)
 *   • Rakım + koordinat (il mrk.) → MGM il-merkez istasyonu (kanonik referans)
 *   • Köppen iklim                → MGM 2023 Köppen raporu, s.11-15 (5/5 = Csa)
 *   • Komşu iller                 → Tier-2 statik coğrafi olgu (fact-check onaylı)
 *
 * DELIBERATELY NULL (not invented — dictionary defers these to the production batch):
 *   • landformNoteTr → yer şekli/jeoloji notu is only PARTIAL in the pilot
 *     (dictionary Bölüm 1 note on field 12); left null until fact-checked.
 * DERIVED, NOT STORED HERE: centroid / bounding-box (from boundary GeoJSON at
 *   build time, dictionary field #9) — see the entity's header note.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Shape of one seeded province row (strict — no `any`, matches entity columns). */
export interface ProvinceSeed {
  plateCode: string;
  nameTr: string;
  slugTr: string;
  slugEn: string;
  region: GeographicRegion;
  population: number;
  populationYear: number;
  areaKm2: number;
  districtCount: number;
  elevationM: number;
  latitude: number;
  longitude: number;
  neighborPlateCodes: string[];
  climateKoppen: string;
  climateClassTr: string;
  climateNoteTr: string;
  landformNoteTr: string | null;
}

/** TÜİK ADNKS reference date for every pilot population value below. */
const POPULATION_YEAR = 2025;

/** Köppen short code shared by all 5 pilot provinces (MGM 2023 report, s.11-15). */
const KOPPEN_CSA = 'Csa';
/** MGM's Turkish class name for Csa (dictionary §2.1: "Csa (Akdeniz iklimi)"). */
const CLIMATE_CLASS_TR = 'Akdeniz iklimi';

/**
 * The MANDATORY MGM methodological caveat that ships with every Köppen value
 * (dictionary §2.1). Faithfully paraphrases MGM's own 2023 report admission:
 * the simplified third-letter rule classifies ~65% of Türkiye's 254 stations as
 * "Cs", so its discriminating power is limited in Central/Eastern Anatolia; other
 * classifications (Thornthwaite/Erinç/De Martonne/Aydeniz) diverge. NOT invented —
 * every clause is sourced from the fact-checked dictionary. Province-specific
 * divergences (Ankara, Van) are appended per-province below.
 */
const MGM_KOPPEN_CAVEAT_TR =
  "MGM'nin 2023 Köppen sınıflandırması bu ili Csa (Akdeniz iklimi) olarak verir. " +
  "Ancak MGM'nin kendi raporu, bu basitleştirilmiş yöntemin (üçüncü-harf kuralı) " +
  "Türkiye'deki 254 istasyonun yaklaşık %65'ini 'Cs' (Akdeniz tipi) çıkardığını ve " +
  'İç Anadolu ile Doğu Anadolu gibi bölgelerde ayırt ediciliğinin sınırlı kaldığını ' +
  'belirtir; Thornthwaite, Erinç, De Martonne ve Aydeniz gibi diğer sınıflandırmalarda ' +
  'bu iller farklı iklim tiplerine ayrışabilir.';

/**
 * Pilot 5 provinces. Neighbour names come from the dictionary (§2.1); they are
 * converted here to their IMMUTABLE İçişleri plaka codes (schema field #2, a
 * fixed Tier-1 registry) — the name→code map is spelled out inline so the
 * transformation is auditable, not a hidden lookup. Sea/border adjacencies
 * (İstanbul→deniz, Van→İran) are NOT provinces and are intentionally omitted from
 * `neighborPlateCodes` (which holds province neighbours only).
 */
export const PILOT_PROVINCES: readonly ProvinceSeed[] = [
  {
    plateCode: '34',
    nameTr: 'İstanbul',
    slugTr: 'istanbul',
    slugEn: 'istanbul',
    region: GeographicRegion.Marmara,
    population: 15_754_053,
    populationYear: POPULATION_YEAR,
    areaKm2: 5461,
    districtCount: 39,
    elevationM: 33, // MGM Bakırköy/Yeşilköy istasyonu
    latitude: 40.9819,
    longitude: 28.8208,
    // Tekirdağ=59, Kocaeli=41  (+ deniz: Marmara/Karadeniz/Boğaz — il değil, hariç)
    neighborPlateCodes: ['59', '41'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    landformNoteTr: null,
  },
  {
    plateCode: '06',
    nameTr: 'Ankara',
    slugTr: 'ankara',
    slugEn: 'ankara',
    region: GeographicRegion.IcAnadolu,
    population: 5_910_320,
    populationYear: POPULATION_YEAR,
    areaKm2: 25_632,
    districtCount: 25,
    elevationM: 891, // MGM Keçiören istasyonu
    latitude: 39.9727,
    longitude: 32.8637,
    // Çankırı=18, Kırıkkale=71, Kırşehir=40, Aksaray=68, Konya=42, Eskişehir=26, Bolu=14
    neighborPlateCodes: ['18', '71', '40', '68', '42', '26', '14'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr:
      MGM_KOPPEN_CAVEAT_TR +
      ' Ankara, bu alternatif sınıflandırmalarda yarı-kurak step iklimi olarak ayrışır.',
    landformNoteTr: null,
  },
  {
    plateCode: '35',
    nameTr: 'İzmir',
    slugTr: 'izmir',
    slugEn: 'izmir',
    region: GeographicRegion.Ege,
    population: 4_504_185,
    populationYear: POPULATION_YEAR,
    areaKm2: 11_891,
    districtCount: 30,
    elevationM: 29, // MGM Konak istasyonu
    latitude: 38.4049,
    longitude: 27.1895,
    // Balıkesir=10, Manisa=45, Aydın=09  (+ Ege Denizi, batı — hariç)
    neighborPlateCodes: ['10', '45', '09'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    landformNoteTr: null,
  },
  {
    plateCode: '65',
    nameTr: 'Van',
    slugTr: 'van',
    slugEn: 'van',
    region: GeographicRegion.DoguAnadolu,
    population: 1_112_013,
    populationYear: POPULATION_YEAR,
    areaKm2: 20_921,
    districtCount: 13,
    elevationM: 1675, // MGM Edremit istasyonu
    latitude: 38.4693,
    longitude: 43.346,
    // Ağrı=04, Bitlis=13, Siirt=56, Hakkâri=30, Şırnak=73  (+ İran sınırı, doğu — hariç)
    neighborPlateCodes: ['04', '13', '56', '30', '73'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr:
      MGM_KOPPEN_CAVEAT_TR +
      ' Van, bu alternatif sınıflandırmalarda karasal/göl-etkili iklim olarak ayrışır.',
    landformNoteTr: null,
  },
  {
    plateCode: '07',
    nameTr: 'Antalya',
    slugTr: 'antalya',
    slugEn: 'antalya',
    region: GeographicRegion.Akdeniz,
    population: 2_777_677,
    populationYear: POPULATION_YEAR,
    areaKm2: 20_177,
    districtCount: 19,
    elevationM: 47, // MGM Muratpaşa istasyonu
    latitude: 36.8851,
    longitude: 30.6828,
    // Muğla=48, Burdur=15, Isparta=32, Konya=42, Karaman=70, Mersin=33  (+ Akdeniz, güney — hariç)
    neighborPlateCodes: ['48', '15', '32', '42', '70', '33'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    landformNoteTr: null,
  },
];
