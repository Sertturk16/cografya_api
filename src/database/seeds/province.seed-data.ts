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

/**
 * TÜİK ADNKS reference date shared by EVERY seeded province below (pilot-5 + Batch 2
 * wave-1 + wave-2). All population values are the 31.12.2025 ADNKS figures.
 */
const POPULATION_YEAR = 2025;

/**
 * Köppen short code for the MEDITERRANEAN class (MGM 2023 report, s.11-15) — the
 * common case: all of pilot-5 + wave-1 + 8/10 of wave-2. NOT universal since wave-2:
 * Kocaeli/Sakarya are Cfa (see KOPPEN_CFA below).
 */
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
 * ── Cfa (Batch 2 wave-2, Kocaeli + Sakarya ONLY) ──────────────────────────────
 * Marmara wave-2 is the FIRST batch that is not uniformly Csa: MGM's own 2023
 * Köppen table classifies Kocaeli and Sakarya as **Cfa** ("f" = her mevsim yağışlı
 * / no dry season), distinct from the 8 Csa provinces of the same wave — an
 * independently fact-checked reading (batch2-wave2-factcheck §A.5, VERIFIED per
 * `koppen.pdf` s.13-14, NOT a copy-paste from neighbouring Bursa's Csa).
 *
 * Because the shared `KOPPEN_CSA` / `CLIMATE_CLASS_TR` / `MGM_KOPPEN_CAVEAT_TR`
 * constants above hard-code "Csa (Akdeniz iklimi)" in their text, they cannot be
 * reused verbatim for a Cfa province. These Cfa siblings mirror their structure —
 * only the opening class clause changes; the methodological tail (MGM's own %65-Cs
 * admission + the Thornthwaite/Erinç divergence) is climate-code-agnostic and is
 * kept identical so the mandatory caveat reads consistently across the whole seed.
 */
const KOPPEN_CFA = 'Cfa';
/**
 * Turkish class name for Köppen Cfa: "Karadeniz iklimi" (owner ruling + NOVA
 * confirmation, 2026-07-11). Chosen as the TYT/AYT-curriculum name for the class
 * (same register as Csa→"Akdeniz iklimi"), AND on a definitional match, not just
 * pedagogy: "Karadeniz iklimi"'s standard definition ("her mevsim yağışlı") maps
 * directly onto Köppen's "f" (no dry season) that defines Cfa. NOVA sanity-checked
 * Kocaeli/Sakarya specifically — their sourced regional-climate descriptions at the
 * exact MGM stations used are consistent with Karadeniz influence (no geographic
 * red flag). Supersedes the initially-seeded "Nemli subtropikal iklim".
 */
const CLIMATE_CLASS_CFA_TR = 'Karadeniz iklimi';

/**
 * Cfa variant of the mandatory MGM Köppen caveat (see MGM_KOPPEN_CAVEAT_TR). Same
 * methodological body; the descriptor "her mevsim yağışlı" is the source brief's
 * own characterisation of the "f" class (batch2-wave2-marmara §1). No unverified
 * "real Black-Sea-climate distinction" claim is appended — the brief flags that
 * hypothesis as explicitly NOT verified this batch (§2), so asserting it would be a
 * sourceless fact.
 */
const MGM_KOPPEN_CAVEAT_CFA_TR =
  "MGM'nin 2023 Köppen sınıflandırması bu ili Cfa (Karadeniz iklimi, her mevsim yağışlı) " +
  'olarak verir. ' +
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

/**
 * BATCH 2 — WAVE 1 il seed data — Güneydoğu Anadolu (9 il): Adıyaman, Batman,
 * Diyarbakır, Gaziantep, Kilis, Mardin, Siirt, Şanlıurfa, Şırnak.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROVENANCE (traceability — CONVENTIONS §4: no sourceless facts)
 * ─────────────────────────────────────────────────────────────────────────────
 * SOURCE OF RECORD: NOVA's researched draft, INDEPENDENTLY fact-checked by a
 *   different actor — verdict "SEED-READY, ZERO corrections needed" (every value
 *   below was re-derived from its Tier-1 source and matched the draft exactly).
 *   • Draft:       Owner's Inbox/data-source-groundwork/batch2-wave1-guneydogu-anadolu.md
 *   • Fact-check:  Owner's Inbox/data-source-groundwork/batch2-wave1-factcheck.md
 *   • Ledger:      data-provenance.md (root) — Batch 2 — Dalga 1
 *   • Repo snapshot: docs/data-provenance-batch2-wave1.md
 * Per-field Tier-1 authorities (same as pilot-5):
 *   • Nüfus (31.12.2025)          → TÜİK ADNKS 2025, bülten 53899 (VERIFIED, 9/9)
 *   • Yüzölçümü (km²)             → Harita Genel Müdürlüğü (VERIFIED, 9/9)
 *   • İlçe sayısı                 → İçişleri Bakanlığı e-İçişleri (VERIFIED, 9/9)
 *   • Rakım + koordinat (il mrk.) → MGM il-merkez istasyonu (kanonik referans, 9/9)
 *   • Köppen iklim                → MGM 2023 Köppen raporu, s.11-15 (9/9 = Csa)
 *   • Komşu iller                 → Tier-2 statik coğrafi olgu (fact-check onaylı)
 *
 * MGM default-station note (fact-check §A.4 — the most sensitive check): for
 *   Diyarbakır, Gaziantep, Mardin and Şanlıurfa the MGM il-merkezi station the
 *   canonical reference resolves to is NOT "Merkez" (Bağlar / Oğuzeli / Artuklu /
 *   Eyyübiye respectively — same category as the pilot's İstanbul→Yeşilköy and
 *   Van→Edremit). Recorded as an inline comment on each `elevationM` below, exactly
 *   as the pilot did. The il-detail page footnote for these is Vera's concern.
 *
 * KÖPPEN CAVEAT: all 9 reuse the shared MGM_KOPPEN_CAVEAT_TR verbatim — the same
 *   generic note the pilot attaches to its own non-İç/Doğu provinces (İstanbul,
 *   İzmir, Antalya). NO province-specific Thornthwaite/Erinç divergence is
 *   appended: the source DELIBERATELY did not research that alternative
 *   classification for these 9 (draft Bölüm 2 / fact-check §A.5), so inventing one
 *   would be a sourceless fact.
 *
 * DELIBERATELY NULL — same as pilot-5: `landformNoteTr` AND every PR-5a detail-page
 *   field (introTr / hydrography* / urbanizationRate / netMigrationRate /
 *   settlementNoteTr / economyIndicator) stay null. This wave is BASE DATA ONLY
 *   (owner priority ruling, DEC 2026-07-10); those fields are filled in a later
 *   fact-checked content batch, never invented here.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const BATCH2_WAVE1_PROVINCES: readonly ProvinceSeed[] = [
  {
    plateCode: '02',
    nameTr: 'Adıyaman',
    slugTr: 'adiyaman',
    slugEn: 'adiyaman',
    region: GeographicRegion.GuneydoguAnadolu,
    population: 617_821,
    populationYear: POPULATION_YEAR,
    areaKm2: 7337,
    districtCount: 9,
    elevationM: 672, // MGM Merkez istasyonu
    latitude: 37.7553,
    longitude: 38.2775,
    // Malatya=44, Diyarbakır=21, Şanlıurfa=63, Gaziantep=27, Kahramanmaraş=46
    neighborPlateCodes: ['44', '21', '63', '27', '46'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    landformNoteTr: null,
  },
  {
    plateCode: '72',
    nameTr: 'Batman',
    slugTr: 'batman',
    slugEn: 'batman',
    region: GeographicRegion.GuneydoguAnadolu,
    population: 662_626,
    populationYear: POPULATION_YEAR,
    areaKm2: 4477,
    districtCount: 6,
    elevationM: 610, // MGM Merkez istasyonu
    latitude: 37.8636,
    longitude: 41.1562,
    // Diyarbakır=21, Muş=49, Bitlis=13, Siirt=56, Mardin=47
    neighborPlateCodes: ['21', '49', '13', '56', '47'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    landformNoteTr: null,
  },
  {
    plateCode: '21',
    nameTr: 'Diyarbakır',
    slugTr: 'diyarbakir',
    slugEn: 'diyarbakir',
    region: GeographicRegion.GuneydoguAnadolu,
    population: 1_852_356,
    populationYear: POPULATION_YEAR,
    areaKm2: 15_101,
    districtCount: 17,
    elevationM: 674, // MGM Bağlar istasyonu (büyükşehir — ayrı "Merkez" ilçesi yok)
    latitude: 37.9094,
    longitude: 40.2133,
    // Adıyaman=02, Batman=72, Bingöl=12, Elazığ=23, Mardin=47, Muş=49, Malatya=44, Şanlıurfa=63
    neighborPlateCodes: ['02', '72', '12', '23', '47', '49', '44', '63'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    landformNoteTr: null,
  },
  {
    plateCode: '27',
    nameTr: 'Gaziantep',
    slugTr: 'gaziantep',
    slugEn: 'gaziantep',
    region: GeographicRegion.GuneydoguAnadolu,
    population: 2_222_415,
    populationYear: POPULATION_YEAR,
    areaKm2: 6803,
    districtCount: 9,
    elevationM: 700, // MGM Oğuzeli istasyonu (şehir merkezinden ~25 km, havalimanı bölgesi)
    latitude: 36.9468,
    longitude: 37.4617,
    // Kilis=79, Şanlıurfa=63, Adıyaman=02, Kahramanmaraş=46, Osmaniye=80, Hatay=31 (+ Suriye — ülke, hariç)
    neighborPlateCodes: ['79', '63', '02', '46', '80', '31'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    landformNoteTr: null,
  },
  {
    plateCode: '79',
    nameTr: 'Kilis',
    slugTr: 'kilis',
    slugEn: 'kilis',
    region: GeographicRegion.GuneydoguAnadolu,
    population: 157_363,
    populationYear: POPULATION_YEAR,
    areaKm2: 1412,
    districtCount: 4,
    elevationM: 640, // MGM Merkez istasyonu
    latitude: 36.7085,
    longitude: 37.1123,
    // Gaziantep=27 (Türkiye içindeki TEK komşu il) (+ Suriye — ülke, hariç)
    neighborPlateCodes: ['27'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    landformNoteTr: null,
  },
  {
    plateCode: '47',
    nameTr: 'Mardin',
    slugTr: 'mardin',
    slugEn: 'mardin',
    region: GeographicRegion.GuneydoguAnadolu,
    population: 903_576,
    populationYear: POPULATION_YEAR,
    areaKm2: 8780,
    districtCount: 10,
    elevationM: 1040, // MGM Artuklu istasyonu (Artuklu = resmî merkez ilçe adı, 2012'den beri)
    latitude: 37.3103,
    longitude: 40.7284,
    // Şanlıurfa=63, Diyarbakır=21, Batman=72, Siirt=56, Şırnak=73 (+ Suriye — ülke, hariç)
    neighborPlateCodes: ['63', '21', '72', '56', '73'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    landformNoteTr: null,
  },
  {
    plateCode: '56',
    nameTr: 'Siirt',
    slugTr: 'siirt',
    slugEn: 'siirt',
    region: GeographicRegion.GuneydoguAnadolu,
    population: 332_369,
    populationYear: POPULATION_YEAR,
    areaKm2: 5717,
    districtCount: 7,
    elevationM: 895, // MGM Merkez istasyonu
    latitude: 37.9319,
    longitude: 41.9354,
    // Batman=72, Bitlis=13, Van=65, Şırnak=73, Mardin=47
    neighborPlateCodes: ['72', '13', '65', '73', '47'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    landformNoteTr: null,
  },
  {
    plateCode: '63',
    nameTr: 'Şanlıurfa',
    // Slug LOCKED to the official-name ASCII fold "sanliurfa" — never "urfa" (→ DEC 2026-07-10).
    slugTr: 'sanliurfa',
    slugEn: 'sanliurfa',
    region: GeographicRegion.GuneydoguAnadolu,
    population: 2_265_800,
    populationYear: POPULATION_YEAR,
    areaKm2: 19_242,
    districtCount: 13,
    elevationM: 550, // MGM Eyyübiye istasyonu (büyükşehir merkez metropol ilçelerinden)
    latitude: 37.1608,
    longitude: 38.7863,
    // Mardin=47, Gaziantep=27, Adıyaman=02, Diyarbakır=21 (+ Suriye — ülke, hariç)
    neighborPlateCodes: ['47', '27', '02', '21'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    landformNoteTr: null,
  },
  {
    plateCode: '73',
    nameTr: 'Şırnak',
    slugTr: 'sirnak',
    slugEn: 'sirnak',
    region: GeographicRegion.GuneydoguAnadolu,
    population: 573_666,
    populationYear: POPULATION_YEAR,
    areaKm2: 7078,
    districtCount: 7,
    elevationM: 1350, // MGM Merkez istasyonu
    latitude: 37.5209,
    longitude: 42.4523,
    // Hakkâri=30, Mardin=47, Siirt=56, Van=65 (+ Irak, Suriye — ülke, hariç)
    neighborPlateCodes: ['30', '47', '56', '65'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    landformNoteTr: null,
  },
];

/**
 * BATCH 2 — WAVE 2 il seed data — Marmara Bölgesi (10 il, İstanbul hariç):
 * Balıkesir, Bilecik, Bursa, Çanakkale, Edirne, Kırklareli, Kocaeli, Sakarya,
 * Tekirdağ, Yalova. (İstanbul is Marmara's 11th province but is already seeded in
 * PILOT_PROVINCES, so it is not repeated here.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROVENANCE (traceability — CONVENTIONS §4: no sourceless facts)
 * ─────────────────────────────────────────────────────────────────────────────
 * SOURCE OF RECORD: NOVA's researched draft, INDEPENDENTLY fact-checked by a
 *   different actor — the core data fields verdict was "10/10 VERIFIED, ZERO
 *   deviations" (population/area/district/elevation-coordinate/Köppen/MGM-station
 *   each re-derived from its Tier-1 source in a second session and matched exactly).
 *   • Draft:       Owner's Inbox/data-source-groundwork/batch2-wave2-marmara.md
 *   • Fact-check:  Owner's Inbox/data-source-groundwork/batch2-wave2-factcheck.md
 *   • Ledger:      data-provenance.md (root) — Batch 2 — Dalga 2
 *   • Repo snapshot: docs/data-provenance-batch2-wave2.md
 * Per-field Tier-1 authorities (same as pilot-5 / wave-1):
 *   • Nüfus (31.12.2025)          → TÜİK ADNKS 2025, bülten 53899 (VERIFIED, 10/10)
 *   • Yüzölçümü (km²)             → Harita Genel Müdürlüğü (VERIFIED, 10/10)
 *   • İlçe sayısı                 → İçişleri Bakanlığı e-İçişleri (VERIFIED, 10/10)
 *   • Rakım + koordinat (il mrk.) → MGM il-merkez istasyonu (VERIFIED, 10/10)
 *   • Köppen iklim                → MGM 2023 Köppen raporu, s.11-15 (8 Csa + 2 Cfa)
 *   • Komşu iller                 → Tier-2 statik coğrafi olgu (bkz. Kırklareli notu)
 *
 * KÖPPEN — MIXED THIS WAVE (fact-check §A.5, the batch's highest-risk check): 8/10
 *   are Csa, but **Kocaeli and Sakarya are Cfa** ("her mevsim yağışlı"), NOT Csa —
 *   independently re-verified against MGM's own `koppen.pdf` (their own rows, not a
 *   copy from neighbouring Bursa's Csa). They carry the Cfa constants above; the 8
 *   Csa provinces reuse the shared MGM_KOPPEN_CAVEAT_TR verbatim (as pilot/wave-1).
 *   No province-specific Thornthwaite/Erinç divergence is appended for any of the
 *   10 — the source deliberately did not research that alternative for this wave.
 *
 * MGM default-station note (fact-check §A.4): for Bursa, Kocaeli, Sakarya and
 *   Tekirdağ the canonical MGM il-merkezi station is NOT "Merkez" (Osmangazi / İzmit
 *   / Adapazarı / Süleymanpaşa respectively — none of these provinces has a district
 *   named "Merkez" anymore; same category as the pilot's İstanbul→Yeşilköy and
 *   wave-1's Diyarbakır→Bağlar). Recorded inline on each `elevationM`.
 *
 * KIRKLARELİ NEIGHBOURS — a resolved Tier-1-vs-Tier-1 conflict (fact-check §A.6.1 +
 *   Atlas's geometric addendum): two official state pages (İl Özel İdaresi + Bakanlık
 *   İl Müdürlüğü) list İstanbul (34) as a neighbour, while Wikipedia + a district-level
 *   check say only Edirne+Tekirdağ. Atlas resolved it against the real vendored
 *   boundary GeoJSON (cografya_web/data/tr-il-boundaries.geojson): known-adjacent pairs
 *   measure 0.00 km of separation, but Kırklareli↔İstanbul measures ~6.5 km — they do
 *   NOT share a border. Per Atlas's evidence-based default, İstanbul is EXCLUDED from
 *   Kırklareli's neighbours here (Edirne+Tekirdağ only). Definitive closure waits on
 *   the 81-il İçişleri/HGM boundary pass; Vera must not write a HARD "only Edirne+
 *   Tekirdağ" sentence on the il page in the interim (per fact-check §A.6.1).
 *
 * DELIBERATELY NULL — same as pilot-5 / wave-1: `landformNoteTr` AND every PR-5a
 *   detail-page field (introTr / hydrography* / urbanizationRate / netMigrationRate /
 *   settlementNoteTr / economyIndicator) stay null. BASE DATA ONLY (owner priority
 *   ruling, DEC 2026-07-10); those fields are filled in a later fact-checked content
 *   batch, never invented here.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const BATCH2_WAVE2_PROVINCES: readonly ProvinceSeed[] = [
  {
    plateCode: '10',
    nameTr: 'Balıkesir',
    slugTr: 'balikesir',
    slugEn: 'balikesir',
    region: GeographicRegion.Marmara,
    population: 1_284_517,
    populationYear: POPULATION_YEAR,
    areaKm2: 14_583,
    districtCount: 20,
    elevationM: 110, // MGM Merkez istasyonu
    latitude: 39.6551,
    longitude: 27.9207,
    // Bursa=16, Kütahya=43, Manisa=45, İzmir=35, Çanakkale=17 (+ Midilli/Yunanistan — deniz-aşırı, hariç)
    neighborPlateCodes: ['16', '43', '45', '35', '17'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    landformNoteTr: null,
  },
  {
    plateCode: '11',
    nameTr: 'Bilecik',
    slugTr: 'bilecik',
    slugEn: 'bilecik',
    region: GeographicRegion.Marmara,
    population: 228_995,
    populationYear: POPULATION_YEAR,
    areaKm2: 4179,
    districtCount: 8,
    elevationM: 539, // MGM Merkez istasyonu
    latitude: 40.1414,
    longitude: 29.9772,
    // Sakarya=54, Bolu=14, Eskişehir=26, Kütahya=43, Bursa=16
    neighborPlateCodes: ['54', '14', '26', '43', '16'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    landformNoteTr: null,
  },
  {
    plateCode: '16',
    nameTr: 'Bursa',
    slugTr: 'bursa',
    slugEn: 'bursa',
    region: GeographicRegion.Marmara,
    population: 3_263_011,
    populationYear: POPULATION_YEAR,
    areaKm2: 10_813,
    districtCount: 17,
    elevationM: 100, // MGM Osmangazi istasyonu (büyükşehir — ayrı "Merkez" ilçesi yok)
    latitude: 40.2308,
    longitude: 29.0133,
    // Yalova=77, Kocaeli=41, Sakarya=54, Bilecik=11, Kütahya=43, Balıkesir=10 (bu dalganın en çok komşulu ili, 6)
    neighborPlateCodes: ['77', '41', '54', '11', '43', '10'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    landformNoteTr: null,
  },
  {
    plateCode: '17',
    nameTr: 'Çanakkale',
    slugTr: 'canakkale',
    slugEn: 'canakkale',
    region: GeographicRegion.Marmara,
    population: 573_976,
    populationYear: POPULATION_YEAR,
    areaKm2: 9817,
    districtCount: 12,
    elevationM: 6, // MGM Merkez istasyonu
    latitude: 40.141,
    longitude: 26.3993,
    // Edirne=22 (Saros Körfezi kıyı şeridiyle kara sınırı, fact-check §A.6.2 VERIFIED), Tekirdağ=59, Balıkesir=10
    neighborPlateCodes: ['22', '59', '10'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    landformNoteTr: null,
  },
  {
    plateCode: '22',
    nameTr: 'Edirne',
    slugTr: 'edirne',
    slugEn: 'edirne',
    region: GeographicRegion.Marmara,
    population: 422_438,
    populationYear: POPULATION_YEAR,
    areaKm2: 6145,
    districtCount: 9,
    elevationM: 51, // MGM Merkez istasyonu
    latitude: 41.6767,
    longitude: 26.5508,
    // Kırklareli=39, Tekirdağ=59, Çanakkale=17 (fact-check §A.6.2) (+ Yunanistan, Bulgaristan — ülke, hariç)
    neighborPlateCodes: ['39', '59', '17'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    landformNoteTr: null,
  },
  {
    plateCode: '39',
    nameTr: 'Kırklareli',
    slugTr: 'kirklareli',
    slugEn: 'kirklareli',
    region: GeographicRegion.Marmara,
    population: 379_595,
    populationYear: POPULATION_YEAR,
    areaKm2: 6459,
    districtCount: 8,
    elevationM: 232, // MGM Merkez istasyonu
    latitude: 41.7382,
    longitude: 27.2178,
    // Edirne=22, Tekirdağ=59 ONLY — İstanbul(34) EXCLUDED per Atlas's boundary-GeoJSON
    // resolution (~6.5 km apart, not adjacent) despite 2 official pages listing it;
    // fact-check §A.6.1 [TEYİT GEREK]. (+ Bulgaristan, Karadeniz — hariç)
    neighborPlateCodes: ['22', '59'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    landformNoteTr: null,
  },
  {
    plateCode: '41',
    nameTr: 'Kocaeli',
    slugTr: 'kocaeli',
    slugEn: 'kocaeli',
    region: GeographicRegion.Marmara,
    population: 2_161_171,
    populationYear: POPULATION_YEAR,
    areaKm2: 3397,
    districtCount: 12,
    elevationM: 0, // MGM İzmit istasyonu (ilin hiç "Merkez" adlı ilçesi olmadı; 0 m = İzmit Körfezi kıyısı)
    latitude: 40.7663,
    longitude: 29.9173,
    // İstanbul=34, Bursa=16, Sakarya=54, Yalova=77 (+ Karadeniz kıyısı — hariç)
    neighborPlateCodes: ['34', '16', '54', '77'],
    // Cfa — MGM'nin kendi tablosunda Csa DEĞİL (fact-check §A.5 VERIFIED, s.13)
    climateKoppen: KOPPEN_CFA,
    climateClassTr: CLIMATE_CLASS_CFA_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_CFA_TR,
    landformNoteTr: null,
  },
  {
    plateCode: '54',
    nameTr: 'Sakarya',
    slugTr: 'sakarya',
    slugEn: 'sakarya',
    region: GeographicRegion.Marmara,
    population: 1_123_693,
    populationYear: POPULATION_YEAR,
    areaKm2: 4824,
    districtCount: 16,
    elevationM: 30, // MGM Adapazarı istasyonu (ilin hiç "Merkez" adlı ilçesi olmadı)
    latitude: 40.7676,
    longitude: 30.3934,
    // Kocaeli=41, Bursa=16, Bilecik=11, Bolu=14, Düzce=81 (+ Karadeniz kıyısı — hariç)
    neighborPlateCodes: ['41', '16', '11', '14', '81'],
    // Cfa — MGM'nin kendi tablosunda Csa DEĞİL (fact-check §A.5 VERIFIED, s.14)
    climateKoppen: KOPPEN_CFA,
    climateClassTr: CLIMATE_CLASS_CFA_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_CFA_TR,
    landformNoteTr: null,
  },
  {
    plateCode: '59',
    nameTr: 'Tekirdağ',
    slugTr: 'tekirdag',
    slugEn: 'tekirdag',
    region: GeographicRegion.Marmara,
    population: 1_208_441,
    populationYear: POPULATION_YEAR,
    areaKm2: 6190,
    districtCount: 11,
    elevationM: 4, // MGM Süleymanpaşa istasyonu (2012'den beri resmî merkez ilçe adı, eski "Merkez")
    latitude: 40.9585,
    longitude: 27.4965,
    // İstanbul=34, Kırklareli=39, Edirne=22, Çanakkale=17 (+ Marmara Denizi, Karadeniz kıyısı — hariç)
    neighborPlateCodes: ['34', '39', '22', '17'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    landformNoteTr: null,
  },
  {
    plateCode: '77',
    nameTr: 'Yalova',
    slugTr: 'yalova',
    slugEn: 'yalova',
    region: GeographicRegion.Marmara,
    population: 311_635,
    populationYear: POPULATION_YEAR,
    areaKm2: 798,
    districtCount: 6,
    elevationM: 4, // MGM Merkez istasyonu
    latitude: 40.6589,
    longitude: 29.2796,
    // Kocaeli=41, Bursa=16 (Türkiye'nin en az kara-komşulu 2. ili, Kilis'ten sonra) (+ Marmara Denizi — hariç)
    neighborPlateCodes: ['41', '16'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    landformNoteTr: null,
  },
];

/**
 * Every fact-checked province the geography seed loads, in batch order (pilot-5
 * first, then Batch 2 wave-1, then Batch 2 wave-2). This is the single list
 * `seedGeography` iterates — the seed is keyed on the unique `plate_code`, so array
 * order is cosmetic (the public list endpoint re-orders by plate code). Grows
 * batch-by-batch toward the full 81 as each wave clears an independent fact-check.
 * Currently 24 provinces: 5 pilot + 9 wave-1 + 10 wave-2.
 */
export const SEED_PROVINCES: readonly ProvinceSeed[] = [
  ...PILOT_PROVINCES,
  ...BATCH2_WAVE1_PROVINCES,
  ...BATCH2_WAVE2_PROVINCES,
];
