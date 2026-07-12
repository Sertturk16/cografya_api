import { GeographicRegion } from '../../common/geographic-region.enum';
import {
  HydrographyFeatureType,
  type EconomyIndicator,
  type HydrographyFeature,
} from '../../province/province.types';

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
 * İSTANBUL DEEP-CONTENT PILOT (plate 34): İstanbul is the FIRST province to carry the
 *   full PR-5a detail-section field set (introTr, landformNoteTr, hydrographyNoteTr +
 *   hydrographyFeatures, urbanizationRate, netMigrationRate, settlementNoteTr,
 *   economyIndicator). These were researched by NOVA and INDEPENDENTLY fact-checked with
 *   ZERO corrections — the calibration bar for the 81-il rollout. The four PROSE fields
 *   later got a style-only rewrite (owner feedback: read as AI-generated) — facts/numbers
 *   preserved, verified by an independent before/after diff; plus one small Haliç-sentence
 *   internal-consistency fix (see CONTENT-STYLE.md + the draft's "Prose revizyon notu").
 *   • Content:     Owner's Inbox/il-detay-genisletme/istanbul-deep-content-draft.md
 *   • Style rules: CONTENT-STYLE.md (orchestrator root — binding for shipped prose)
 *   • Fact-check:  Owner's Inbox/il-detay-genisletme/istanbul-deep-content-factcheck.md
 *   Load-bearing, fact-check-anchored specifics: Aydos Dağı = 538 m (Tier-1 academic,
 *   corrects an older 537 m); the KAF/seismic context is AFAD-İRAP-sourced; the 10-dam
 *   list + "Alibey" (NOT "Alibeyköy") come from İSKİ's live API; urbanizationRate = 100.00
 *   is a real TÜİK-verified LEGAL ARTIFACT of büyükşehir status (6360 sayılı Kanun), not an
 *   error — it ships WITH its methodological framing in settlementNoteTr; economyIndicator
 *   is the 2024 TÜİK GSYH-share bulletin (supersedes the older 2023 figure).
 *   `populationDensity` is untouched — still SERVER-COMPUTED from our locked population÷area
 *   (2885), deliberately NOT overridden to TÜİK's own 2943 (a known Batch-1 area-source
 *   delta; our shown density must stay consistent with our shown population and area).
 * WAVE-1 DEEP CONTENT (plates 06/35/65/07 — Ankara, İzmir, Van, Antalya): the four OTHER
 *   pilots now carry the SAME full PR-5a detail-section field set as İstanbul, from NOVA's
 *   independently fact-checked "Dalga 1" deep-content draft (verdict SEED-READY WITH
 *   CORRECTIONS — all six corrections applied before seeding, incl. the Antalya
 *   Kızlarsivrisi 3.070→3.086 m factual fix). Each il is written to its OWN geographic
 *   character (Ankara: plato/karasal + Tuz Gölü closed basin; İzmir: graben-horst/seismic +
 *   2020 Sisam quake; Van: volkanik set gölü/kapalı havza + 2011 quakes; Antalya: karstic/
 *   Akdeniz coast), NOT a palette-swapped copy of İstanbul. Same load-bearing framings as
 *   the pilot: urbanizationRate=100.00 is the 6360-Kanun büyükşehir legal artifact (all four
 *   büyükşehir since 2014), shipped WITH its methodological note in settlementNoteTr;
 *   economyIndicator is the 2024 TÜİK GSYH-share bulletin; netMigrationRate is the signed
 *   2024 TÜİK İç Göç value (Van the sole negative, -20.02 ‰). No schema/DTO/OpenAPI change
 *   (every field exists since the İstanbul pilot).
 *   • Content:     Owner's Inbox/il-detay-genisletme/wave1-pilot-deep-content-draft.md
 *   • Style rules: CONTENT-STYLE.md (orchestrator root — binding for shipped prose)
 *   • Fact-check:  Owner's Inbox/il-detay-genisletme/wave1-pilot-deep-content-factcheck.md
 *   • Ledger:      data-provenance.md (root) — "İl Detay Sayfası — Derinlik İçerik Dalga 1"
 * WAVE-2 DEEP CONTENT (plates 10/11/16/17/22/39/41/54/59/77 — the 10 Marmara il, İstanbul
 *   hariç): the whole Marmara wave now carries the SAME full PR-5a detail-section field set,
 *   from NOVA's independently fact-checked "Dalga 2" deep-content draft (verdict SEED-READY
 *   WITH CORRECTIONS — all applied: Yalova netMigration source-note fix, Kocaeli 1999 toll as
 *   a range, two introTr openings re-sequenced). This wave predates the tiered-depth model, so
 *   ALL 10 il get the FULL 7 fields (no Tier-B, unlike wave-3). Each il is written to its OWN
 *   geographic character (Kocaeli/Sakarya/Yalova: sanayi-Marmara + 1999 fay kuşağı; Bursa: buzul
 *   jeomorfolojisi/tektonik göller; Çanakkale: boğaz/UNESCO; Edirne: nehir buluşması/iki ülke
 *   sınırı; Kırklareli: Neolitik yerleşim/longoz; Balıkesir: çift deniz/2025 Sındırgı; Tekirdağ:
 *   bağcılık/Ganos Fayı; Bilecik: Söğüt/en küçük nüfus), NOT a palette-swapped copy. FIRST
 *   WAVE WITH NON-100 urbanizationRate: 5 of the 10 (Bilecik, Çanakkale, Edirne, Kırklareli,
 *   Yalova) are NOT büyükşehir, so their urbanizationRate is a GENUINE computed rate (<100),
 *   not the 6360-Kanun legal artifact — their settlementNoteTr is structurally DIFFERENT (no
 *   6360 note, by design; it does not apply). The other 5 keep the büyükşehir framing.
 *   netMigrationRate is the signed 2024 TÜİK İç Göç value (Yalova the national #1 at +15.59 ‰,
 *   Tekirdağ #2 at +13.09 ‰, Bilecik the sole negative at -0.07 ‰). No schema/DTO/OpenAPI
 *   change (every field exists since the İstanbul pilot).
 *   • Content:     Owner's Inbox/il-detay-genisletme/wave2-pilot-deep-content-draft.md
 *   • Style rules: CONTENT-STYLE.md (orchestrator root — binding for shipped prose)
 *   • Ledger:      data-provenance.md (root) — "İl Detay Sayfası — Derinlik İçerik Dalga 2"
 * DELIBERATELY NULL (not invented — deferred to a later fact-checked content batch): the
 *   REMAINING Batch 2 provinces (wave-4 Akdeniz) keep landformNoteTr AND all PR-5a
 *   detail-section fields null until their own content batch clears an independent
 *   fact-check — an unverified fact stays absent, never invented.
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
  /**
   * PR-5a il-detay-sayfası detail-section fields. OPTIONAL on the seed by design: the
   * base-data waves (pilot base + Batch 2) DELIBERATELY leave them absent (an unverified
   * fact stays absent, never invented — CLAUDE §5), and a later, independently
   * fact-checked content batch fills them per il. İstanbul is the first province to carry
   * them (the deep-content pilot). Absent (undefined) on a seed reads as "not authored yet"
   * and is normalised to null against the DB in `rowMatchesSeed` (seed-geography.ts), so an
   * absent-in-seed vs null-in-DB pair is a no-op — the whole base-data set keeps its
   * `updated_at` frozen on re-seed (SEO lastmod honesty).
   */
  introTr?: string | null;
  hydrographyNoteTr?: string | null;
  hydrographyFeatures?: HydrographyFeature[] | null;
  urbanizationRate?: number | null;
  netMigrationRate?: number | null;
  settlementNoteTr?: string | null;
  economyIndicator?: EconomyIndicator | null;
}

/**
 * TÜİK ADNKS reference date shared by EVERY seeded province below (pilot-5 + Batch 2
 * wave-1 + wave-2). All population values are the 31.12.2025 ADNKS figures.
 */
const POPULATION_YEAR = 2025;

/**
 * Köppen short code for the MEDITERRANEAN class (MGM 2023 report, s.11-15) — the
 * common case: all of pilot-5 + wave-1, 8/10 of wave-2, 5/7 of wave-3, and all 7 of
 * wave-4 (Akdeniz, uniformly Csa). NOT universal since wave-2: Kocaeli/Sakarya are Cfa
 * (see KOPPEN_CFA below); wave-3 adds Afyonkarahisar=Cfa AND the platform's third class
 * Kütahya=Csb (KOPPEN_CSB). Wave-4 introduces no new class.
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
 * ── Csb (Batch 2 wave-3, Kütahya ONLY) ────────────────────────────────────────
 * Ege wave-3 introduces the platform's THIRD Köppen class: MGM's own 2023 table
 * classifies Kütahya as **Csb** ("b" = yazı sıcak / warm-summer, one step milder
 * than Csa's "a" = yazı çok sıcak / hot-summer), while its 6 wave-mates are 5×Csa +
 * 1×Cfa — independently fact-checked (batch2-wave3-factcheck §A.5, VERIFIED per
 * `koppen.pdf` s.14: "KÜTAHYA Csb Kışı ılık, yazı sıcak ve kurak iklim", read on
 * its own row, NOT copied from a neighbour). Csb is still a "Cs" (dry-summer /
 * Mediterranean-type) climate, so — unlike Cfa — it shares the Csa methodological
 * body verbatim (the ~65%-"Cs" over-classification MGM warns about applies to it
 * literally); only the opening class clause changes.
 */
const KOPPEN_CSB = 'Csb';
/**
 * Turkish curriculum-register class name for Köppen Csb — **`Akdeniz iklimi` (owner
 * ruling, 2026-07-11 — FINAL).** Csb has no distinct TYT/AYT-curriculum name of its
 * own: unlike Cfa — which maps cleanly onto the DISTINCT type "Karadeniz iklimi" via
 * its "her mevsim yağışlı" definition — Csb is a warm-summer SUBTYPE of the same
 * dry-summer Mediterranean family as Csa, and the source explicitly places it there
 * (batch2-wave3-ege §2: still in the "kurak yaz / Akdeniz-tipi" family, only "yaz
 * sıcaklığı Csa'ya göre bir kademe daha ılıman" — a distinction the TR lise
 * curriculum does not make). So rather than coin a new label, Csb reuses the EXISTING
 * curriculum name "Akdeniz iklimi"; the distinct Köppen code (Csb) in the same field,
 * plus the "yazı sıcak ve kurak" caveat below, carry the warm-summer nuance the class
 * name elides. Same reasoning that resolved Cfa→"Karadeniz iklimi": match the Köppen
 * letter-group's real meaning to the right curriculum category, don't invent one.
 */
const CLIMATE_CLASS_CSB_TR = 'Akdeniz iklimi';
/**
 * Csb variant of the mandatory MGM Köppen caveat (see MGM_KOPPEN_CAVEAT_TR). The
 * opening clause names Csb + MGM's own row descriptor ("yazı sıcak ve kurak",
 * batch2-wave3-factcheck §A.5); the methodological tail is identical to the Csa/Cfa
 * caveats (climate-code-agnostic) so the mandatory note reads consistently across
 * the whole seed. Names its own code ("…bu ili Csb…"), so the seed-time
 * Köppen⇒caveat correspondence invariant (`seed-geography.ts`) is satisfied
 * self-maintainingly: the full 3-letter code "Csb" is absent from the Csa and Cfa
 * caveats and vice versa — the 3rd class needs ZERO change to the invariant.
 */
const MGM_KOPPEN_CAVEAT_CSB_TR =
  "MGM'nin 2023 Köppen sınıflandırması bu ili Csb (Akdeniz iklimi, yazı sıcak ve kurak) " +
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
    // ── İstanbul deep-content pilot (see the İSTANBUL DEEP-CONTENT PILOT note above).
    //    Seven values transcribed from the fact-checked draft. The four prose fields
    //    (introTr, landformNoteTr, hydrographyNoteTr, settlementNoteTr) carry NOVA's
    //    2026-07-11 style-only rewrite (CONTENT-STYLE.md) — facts/numbers unchanged, plus
    //    one internal-consistency fix to the Haliç sentence (aligns landform with the
    //    hydrography framing, same fact-checked source). The structured/numeric detail
    //    fields (hydrographyFeatures, urbanizationRate, netMigrationRate, economyIndicator)
    //    are UNCHANGED from the fact-checked pilot.
    landformNoteTr:
      "İstanbul, jeomorfolojik olarak Çatalca-Kocaeli Bölümü'nde yer alır. İlin büyük bölümünü " +
      'dağlar ya da ovalar değil, aşınım yüzeyleri üzerinde gelişmiş bir plato oluşturur; bu ' +
      "plato Kocaeli Platosu'nun bir parçasıdır. İlin en yüksek noktası, Kartal, Pendik, " +
      "Sultanbeyli ve Sancaktepe sınırında yer alan 538 metrelik Aydos Dağı'dır. Onu 438 " +
      'metreyle Kayış Dağı ve 409 metreyle Alem Dağı izler.\n\n' +
      "Karadeniz'i Marmara Denizi'ne bağlayan İstanbul Boğazı, 17 deniz mili (yaklaşık 31,5 km) " +
      'uzunluğundadır. Üzerinde, güneyden kuzeye doğru üç asma köprü iki yakayı birbirine ' +
      "bağlar: 1973'te açılan 15 Temmuz Şehitler Köprüsü, 1988'de açılan Fatih Sultan Mehmet " +
      "Köprüsü ve 2016'da açılan Yavuz Sultan Selim Köprüsü.\n\n" +
      'Boğazın Avrupa yakasında yer alan Haliç, Kağıthane ve Alibeyköy derelerinin birleşip ' +
      'denizin istila ettiği bir vadi ağzından oluşmuştur. Coğrafyada bu tip kıyılara "ria" ' +
      'denir.\n\n' +
      'Tarihi yarımada — bugünkü Fatih ilçesi — şehrin en eski yerleşim çekirdeğidir ve ' +
      'geleneksel olarak yedi tepe üzerine kurulu kabul edilir. Bu tanım surlariçi bölgeyi ' +
      "kapsar; ilin toplam yüzölçümü 5.461 km²'dir.\n\n" +
      "İstanbul'un yaklaşık 20 km güneyinden Kuzey Anadolu Fayı (KAF) geçer. Dünyanın en aktif " +
      'fay sistemlerinden biri olan KAF, toplam 1.500 km uzunluğunda, sağ yanal doğrultu atımlı ' +
      'bir kırık hattıdır. Fayın Marmara Denizi içinden geçen kolu — Adalar, Silivri, ' +
      'Marmaraereğlisi ve Tekirdağ arasındaki segment — yüksek deprem üretme potansiyeli taşıyan ' +
      'bir kuşak olarak izleniyor.',
    introTr:
      "İstanbul, Karadeniz'i Marmara Denizi'ne bağlayan İstanbul Boğazı'nın iki yakasında, hem " +
      'Avrupa hem de Asya kıtası üzerinde kuruludur. Roma, Bizans ve Osmanlı imparatorluklarına ' +
      "başkentlik yapmıştır. Bugün nüfusuyla Türkiye'nin en kalabalık ilidir.",
    hydrographyNoteTr:
      "İstanbul'un içme suyu ihtiyacı, İSKİ tarafından işletilen 10 barajdan karşılanır: Asya " +
      'yakasında Ömerli, Darlık ve Elmalı; Avrupa yakasında Terkos, Büyükçekmece, Sazlıdere, ' +
      'Pabuçdere, Alibey, Kazandere ve Istrancalar. Bu barajların toplam aktif biriktirme hacmi ' +
      "yaklaşık 868 milyon m³, yıllık ortalama su verimi ise yaklaşık 905 milyon m³'tür. Ayrıca " +
      "Melen Sistemi üzerinden Düzce'den de trans-havza su aktarımı yapılır. " +
      "Karadeniz'i Marmara Denizi'ne bağlayan İstanbul Boğazı'nda, dünyada nadir görülen iki " +
      'katmanlı bir akıntı sistemi vardır: yüzeyde Karadeniz kökenli az tuzlu su ' +
      "Marmara'ya doğru, dipte ise Marmara ve Akdeniz kökenli daha tuzlu ve yoğun su " +
      "Karadeniz'e doğru akar. Boğazın Avrupa yakasında, Kağıthane ve Alibeyköy derelerinin " +
      'birleşip denizin istila ettiği bir vadi ağzı olan Haliç yer alır. ' +
      'İlin batı kesiminde, Küçükçekmece ve Büyükçekmece adlarını taşıyan iki kıyı gölü (lagün) ' +
      'bulunur. Büyükçekmece aynı zamanda bir İSKİ barajı olarak işletilir. Küçükçekmece ise ' +
      'denizle bağlantısı nedeniyle tuzlu su içerir ve içme suyu kaynağı olarak kullanılmaz.',
    hydrographyFeatures: [
      { name: 'Ömerli Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Terkos Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Büyükçekmece Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Darlık Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Sazlıdere Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Pabuçdere Barajı', type: HydrographyFeatureType.Baraj },
      // "Alibey" (NOT "Alibeyköy") — the İSKİ live-API official spelling (fact-check A.3).
      { name: 'Alibey Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Kazandere Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Elmalı Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Istrancalar Barajı', type: HydrographyFeatureType.Baraj },
    ],
    // %100 = a legal artifact of büyükşehir status (6360 sayılı Kanun), TÜİK-verified —
    // NOT an error. Ships WITH its methodological framing in settlementNoteTr (never bare).
    urbanizationRate: 100.0,
    // Signed net-göç hızı (‰), TÜİK 2024 İç Göç bülteni (net +26.032 kişi → +1,66 ‰).
    netMigrationRate: 1.66,
    settlementNoteTr:
      "Nüfus yoğunluğu (≈2.885 kişi/km², türetilmiş) ile Türkiye'nin en yoğun nüfuslu ilidir. " +
      "TÜİK'in il/ilçe merkezi nüfus oranı İstanbul için %100'dür. Bu rakam ilin fiilen tamamen " +
      'kentleştiği anlamına gelmez; büyükşehir statüsündeki illerde belde ve köylerin idari ' +
      'tüzel kişiliğinin kaldırılmasının (6360 sayılı Kanun) bir sonucudur. İstanbul 2024 ' +
      'yılında hem en çok göç alan (395.485 kişi) hem de en çok göç veren (369.453 kişi) il ' +
      'oldu; buna karşın net göç hızı +1,66 ‰ ile pozitif kaldı.',
    // A single TÜİK-anchored structured stat (never free prose — CONVENTIONS §4). `value` is
    // a string per the EconomyIndicator contract → the Turkish percent form "%29,2" (same
    // register as the EconomyIndicatorDto example "%30,2").
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%29,2',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
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
    // ── Ankara deep content (wave-1 — see the WAVE-1 DEEP CONTENT note above). Seven detail
    //    fields transcribed from NOVA's fact-checked "Dalga 1" draft. İç Anadolu / karasal
    //    framing: plato character + Tuz Gölü closed basin (landform); Sakarya/Kızılırmak +
    //    ASKİ dams (hydrography). urbanizationRate=100 is the 6360 legal artifact framed in
    //    settlementNoteTr; economyIndicator is the 2024 TÜİK GSYH share (%10,5).
    landformNoteTr:
      "Ankara, İç Anadolu Bölgesi'nin genel karakterine uygun biçimde dağlardan çok " +
      'platolarla kaplıdır; il topraklarının büyük bölümü ortalama 900-1.000 metre ' +
      'yükseklikteki Anadolu Platosu üzerinde yer alır. Ovalar sınırlıdır — başlıcaları ' +
      "Ankara Ovası ve Haymana Ovası'dır.\n\n" +
      'İlin kuzeyinde, Kızılcahamam ve Çamlıdere ilçeleri çevresinde Köroğlu-Işık Dağları ' +
      'volkanik kütlesi yükselir; bu kesim ilin en engebeli bölümüdür ve Tersiyer dönemi ' +
      'volkanizmasının izlerini taşır. Güneydoğuda Elmadağ, doğuda İdris Dağı ilin diğer ' +
      'önemli yükseltileridir.\n\n' +
      "İlin en güneydoğu ucunda, Şereflikoçhisar ilçesi sınırları içinde Tuz Gölü'nün kuzey " +
      "kıyısı yer alır. Göl büyük ölçüde komşu Aksaray ve Konya illerinde kalır; Ankara'nın " +
      "bu en güneydeki ilçesi Türkiye'nin ikinci büyük gölünü oluşturan kapalı havzanın bir " +
      'parçasıdır.',
    introTr:
      "Ankara, Türkiye'nin başkenti ve nüfus bakımından İstanbul'dan sonra ikinci büyük " +
      "ilidir. İç Anadolu Bölgesi'nin kuzeybatısında, Anadolu Platosu üzerinde kuruludur. " +
      "Şehir, 13 Ekim 1923'te başkent ilan edilmesinin ardından küçük bir Anadolu " +
      'kasabasından bugünkü büyüklüğüne ulaşmıştır.',
    hydrographyNoteTr:
      "Ankara'nın su ağı, kuzeybatısında doğan Sakarya Nehri ile ilin güneydoğusundan geçen " +
      "Kızılırmak'a dayanır. Sakarya Nehri'nin kaynağı Çamlıdere ilçesindedir; nehir buradan " +
      'kuzeybatıya akarak Sakarya iline geçer. Kızılırmak ise ilin güneydoğu kesiminden ' +
      'yaklaşık 256 kilometre boyunca geçer. Şehir merkezinden geçen Çubuk, İncesu ve Ova ' +
      "çayları birleşerek Ankara Çayı'nı oluşturur; bu çay da Sakarya Nehri'ne katılır.\n\n" +
      'İlin içme suyu ihtiyacı ASKİ tarafından işletilen barajlardan karşılanır: Çamlıdere, ' +
      'Kurtboğazı, Bayındır ile Çubuk I ve Çubuk II. Çamlıdere Barajı, yaklaşık 1,2 milyar ' +
      "m³ kapasitesiyle bu barajların en büyüğüdür. Çubuk I, 1936'da tamamlanan Cumhuriyet " +
      'döneminin ilk barajıdır. Kesikköprü ve Sarıyar barajları Kızılırmak ve Sakarya ' +
      'üzerinde enerji üretimi amacıyla işletilir.\n\n' +
      'İlin güneyinde, Gölbaşı ilçesinde yer alan Mogan ve Eymir gölleri başlıca doğal ' +
      'gölleridir. Mogan Gölü yaklaşık 5 km uzunluğunda, 4 metreyi geçmeyen bir derinliğe ' +
      "sahiptir. Eymir Gölü, Mogan Gölü'nden beslenir.",
    hydrographyFeatures: [
      { name: 'Çamlıdere Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Kurtboğazı Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Bayındır Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Çubuk I Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Çubuk II Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Kesikköprü Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Sarıyar Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Sakarya Nehri', type: HydrographyFeatureType.Nehir },
      { name: 'Kızılırmak', type: HydrographyFeatureType.Nehir },
      { name: 'Mogan Gölü', type: HydrographyFeatureType.Gol },
      { name: 'Eymir Gölü', type: HydrographyFeatureType.Gol },
    ],
    urbanizationRate: 100.0,
    netMigrationRate: 8.91,
    settlementNoteTr:
      "Ankara'da da TÜİK'in il/ilçe merkezi nüfus oranı %100 çıkıyor — büyükşehir " +
      'statüsündeki illerde belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 ' +
      'sayılı Kanun) bir sonucu, ilin fiilen tamamen kentleştiği anlamına gelmiyor. Ankara ' +
      '2024 yılında 202.402 kişi aldı, 150.373 kişi verdi; net göç hızı binde +8,91 ile ' +
      "İstanbul'un ardından Türkiye'nin en yüksek pozitif değerlerinden birine ulaştı.",
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%10,5',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
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
    // ── İzmir deep content (wave-1 — see the WAVE-1 DEEP CONTENT note above). Ege / graben-
    //    horst framing: horst-graben relief + the 30 Ekim 2020 Sisam quake (landform, dual
    //    Kandilli 6,9 / AFAD 6,6 magnitudes preserved as sourced); Gediz delta + İZSU dams
    //    (hydrography). economyIndicator is the 2024 TÜİK GSYH share (%5,7).
    landformNoteTr:
      "İzmir, Ege Bölgesi'nin karakteristik graben-horst yapısı üzerinde kuruludur. Kentin " +
      'çevresini oluşturan çöküntü alanının kuzeyinde Yamanlar Dağı, doğusunda Nif Dağı, ' +
      'güneyinde Bozdağlar yükselir. Bu dağlar arasında kalan Gediz, Küçük Menderes ve ' +
      'Bakırçay grabenleri ilin tarım ovalarını oluşturur.\n\n' +
      "İlin en yüksek noktası, Bozdağlar'ın Ödemiş yakınlarındaki 2.159 metrelik zirvesidir; " +
      'bu nokta aynı zamanda bir kayak turizmi merkezidir. Kuzeyde Bergama ve Dikili ' +
      'çevresini Madra Dağı ve Yunt Dağı kütleleri kaplar.\n\n' +
      "Bu graben-horst yapısı, İzmir'i Türkiye'nin en aktif deprem bölgelerinden birine " +
      'dönüştürür: dağları oluşturan horst blokları ile ovaları oluşturan graben ' +
      'çöküntülerinin sınırındaki fay hatları bölgenin sismik hareketliliğinin ana ' +
      "kaynağıdır. 30 Ekim 2020'de merkez üssü Sisam (Yunanistan) açıkları olan bir deprem " +
      "oldu; büyüklüğü Kandilli Rasathanesi'ne göre 6,9, AFAD'a göre 6,6 idi. Depremin en " +
      "ağır hasarı, merkez üssüne 70 km uzaklıktaki İzmir'in Bayraklı ilçesinde görüldü.",
    introTr:
      'İzmir, Ege Denizi kıyısındaki İzmir Körfezi çevresinde kurulu, nüfus bakımından ' +
      "Türkiye'nin üçüncü büyük ilidir. Kentin kökeni, Bayraklı Höyüğü'nde ortaya çıkarılan " +
      'antik Smyrna yerleşimine, MÖ 3. binyıla kadar uzanır. Bugün Türkiye gayrisafi yurt ' +
      "içi hasılasının %5,7'sini tek başına üretir.",
    hydrographyNoteTr:
      "İlin en büyük akarsuyu, Ege Bölgesi'nde Büyük Menderes'ten sonra ikinci sırada yer " +
      "alan Gediz Nehri'dir. Nehir, Karşıyaka, Çiğli, Menemen ve Foça ilçeleri sınırları " +
      "içinde Türkiye'nin dördüncü büyük deltasını oluşturarak Ege Denizi'ne dökülür; bu " +
      "delta 1998'de Ramsar Sözleşmesi kapsamına alınmıştır. İlin güneyinde Küçük Menderes " +
      'Nehri, Selçuk yakınlarında denize ulaşır; kuzeyde ise Bakırçay, Bergama ile Dikili ' +
      'arasında kendi deltasını oluşturur.\n\n' +
      'İlin içme suyu ihtiyacı İZSU tarafından işletilen barajlardan karşılanır: Tahtalı, ' +
      'Balçova, Gördes, Ürkmez ve Çeşme yarımadasındaki Alaçatı Kutlu Aktaş. Bunlardan ' +
      'Tahtalı ve Gördes kentin su ihtiyacının büyük bölümünü karşılar.',
    hydrographyFeatures: [
      { name: 'Tahtalı Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Balçova Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Gördes Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Ürkmez Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Alaçatı Kutlu Aktaş Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Gediz Nehri', type: HydrographyFeatureType.Nehir },
      { name: 'Küçük Menderes Nehri', type: HydrographyFeatureType.Nehir },
      { name: 'Bakırçay', type: HydrographyFeatureType.Nehir },
    ],
    urbanizationRate: 100.0,
    netMigrationRate: 3.53,
    settlementNoteTr:
      "Büyükşehir statüsündeki illerde olduğu gibi İzmir'in de TÜİK il/ilçe merkezi nüfus " +
      'oranı %100 görünür; belde ve köylerin idari tüzel kişiliğinin kaldırılması (6360 ' +
      'sayılı Kanun) bu rakamın kaynağıdır, ilin fiilen tamamen kentleştiği anlamına gelmez. ' +
      'İzmir 2024 yılında 117.889 kişi aldı, 102.040 kişi verdi; net göç hızı binde +3,53 ' +
      "ile pozitif ama Ankara ve Antalya'nın gerisinde kaldı.",
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%5,7',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
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
    // ── Van deep content (wave-1 — see the WAVE-1 DEEP CONTENT note above). Doğu Anadolu /
    //    volkanik + kapalı havza framing: Van Gölü as a Nemrut volcanic-dam lake + the 2011
    //    Erçiş/Edremit quakes (landform); the göl's sodalı physical properties + DSİ dams
    //    (hydrography). netMigrationRate is the sole NEGATIVE of the four (-20.02 ‰);
    //    economyIndicator is the 2024 TÜİK GSYH share (%0,5, Atlas-ruled metric choice).
    landformNoteTr:
      'Van, jeolojik olarak genç bir volkanik ve tektonik bölgede yer alır. İlin batısındaki ' +
      "Van Gölü, yaklaşık 200 bin yıl önce Nemrut Dağı'nın patlayıp lav akıntılarıyla " +
      'bölgenin drenajını tıkaması sonucu oluşmuş bir volkanik set gölüdür. Nemrut Dağı, ' +
      'tepesinde 6 kilometre çapında bir kalderası olan, 2.935 metre yükseklikte sönmüş bir ' +
      'yanardağdır.\n\n' +
      "Gölün kuzeyinde yükselen Süphan Dağı ise 4.058 metreyle Ağrı Dağı ve Cilo Dağı'nın " +
      "ardından Anadolu'nun üçüncü yüksek zirvesidir; tepesi yıl boyunca buzulla kaplıdır. Bu " +
      "iki volkanik kütle, Van Gölü Kapalı Havzası'nı çevreleyen dağ sınırının bir parçasını " +
      'oluşturur; havza güneyden Bitlis Masifi, doğu ve kuzeyden Tendürek ve diğer volkanik ' +
      'kütlelerle çevrilidir.\n\n' +
      "İl, karmaşık bir fay sistemi üzerinde bulunur. 23 Ekim 2011'de merkez üssü Erçiş " +
      'ilçesine bağlı Tabanlı köyü olan, büyüklüğü 7,2 olarak ölçülen bir deprem meydana ' +
      "geldi; 604 kişi hayatını kaybetti. Aynı yılın 9 Kasım'ında Edremit'te 5,6 büyüklüğünde " +
      'ikinci bir deprem oldu.',
    introTr:
      "Van, Doğu Anadolu Bölgesi'nin en doğusunda, Türkiye'nin en büyük gölü olan Van " +
      "Gölü'nün doğu kıyısında kuruludur. İl toprakları, denize akışı olmayan bir kapalı " +
      'havzanın parçasıdır. 2011 yılındaki iki büyük depremin ardından kent merkezi büyük ' +
      'ölçüde yeniden inşa edilmiştir.',
    hydrographyNoteTr:
      "Van Gölü, 3.713 km² yüzölçümüyle Türkiye'nin en büyük gölü ve dünyanın en büyük " +
      'sodalı gölüdür. Ortalama derinliği 171 metre, en derin noktası 451 metredir; deniz ' +
      'seviyesinden yüksekliği yaklaşık 1.646 metredir. Suyu tuzlu ve sodalıdır (binde 19 ' +
      'tuzluluk, pH 9,8); bu yüksek alkalinite, yüksek rakımına ve sert kış iklimine rağmen ' +
      'gölün donmasını engeller.\n\n' +
      "Van Gölü'nün bir çıkışı yoktur — havzaya giren tüm sular buharlaşma dışında bir yolla " +
      'denize ulaşamaz. Gölü besleyen başlıca akarsular Bendimahi, Karasu, Zilan, Deliçay ve ' +
      'Engil çaylarıdır; bunlardan Bendimahi, debisi bakımından en büyük koldur. Havzada Van ' +
      'Gölü dışında Erçek, Nazik ve Nemrut (Nemrut Dağı kalderası içinde) gölleri de yer ' +
      'alır.\n\n' +
      'DSİ tarafından işletilen Koçköprü, Sarımehmet, Morgedik ve Zernek barajları ilin ' +
      'sulama suyu ihtiyacının büyük bölümünü karşılar; Sarımehmet Barajı, Erciş ilçesinde ' +
      "Karasu Çayı üzerinde 1991'de tamamlanmıştır.",
    hydrographyFeatures: [
      { name: 'Van Gölü', type: HydrographyFeatureType.Gol },
      { name: 'Erçek Gölü', type: HydrographyFeatureType.Gol },
      { name: 'Sarımehmet Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Zernek Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Koçköprü Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Morgedik Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Bendimahi Çayı', type: HydrographyFeatureType.Nehir },
      { name: 'Karasu Çayı', type: HydrographyFeatureType.Nehir },
    ],
    urbanizationRate: 100.0,
    netMigrationRate: -20.02,
    settlementNoteTr:
      "Van'ın TÜİK il/ilçe merkezi nüfus oranı da, diğer büyükşehirlerde olduğu gibi, " +
      "%100'dür — belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı " +
      'Kanun) bir sonucu, ilin fiilen tamamen kentleştiği anlamına gelmiyor. Van, 2024 ' +
      'yılında 31.418 kişi aldı, 54.023 kişi verdi; net göç hızı binde -20,02 ile dört pilot ' +
      'il arasında tek negatif değere sahip oldu ve aldığından yaklaşık 1,7 kat fazla göç ' +
      'verdi.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,5',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
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
    // ── Antalya deep content (wave-1 — see the WAVE-1 DEEP CONTENT note above). Akdeniz /
    //    karstic framing: the Toros/Bey Dağları coastal squeeze + karst forms (düden/obruk/
    //    polye) and Kızlarsivrisi=3.086 m (the fact-check factual correction from 3.070 m);
    //    Manavgat/Aksu rivers + Avlan polje lake (hydrography). netMigrationRate=+9.09 ‰ is
    //    the HIGHEST of the four; economyIndicator is the 2024 TÜİK GSYH share (%3,4).
    landformNoteTr:
      "Antalya, Batı Toroslar'ın Akdeniz'e paralel uzanan Bey Dağları kesimiyle kıyı " +
      'arasında sıkışmış dar bir kıyı ovasından ibarettir; dağlar çoğu yerde denize 20-30 ' +
      "kilometre mesafede yükselir. İlin en yüksek noktası, Bey Dağları'nda yer alan 3.086 " +
      "metrelik Kızlarsivrisi'dir.\n\n" +
      'İl, kireçtaşı ana kayasının hâkim olduğu geniş bir karstik arazidir. Yağmur suyu, ' +
      'yüzeyde akmak yerine büyük ölçüde yer altına sızar; bu süreç düden, obruk ve polye ' +
      'gibi şekiller üretir. Düden, suyun yer altına daldığı kuyulardır; obruk, mağara tavanı ' +
      'çökmesiyle oluşan derin çukurlardır; polye ise geniş bir karstik ovadır. ' +
      'Antalya-Burdur arasındaki Kestel Polyesi ile ilin batısındaki Elmalı ve Akseki ' +
      'polyeleri bunların en büyükleridir.\n\n' +
      "Karstik yapı, ilin bilinen şelalelerinin de kaynağıdır: Düden Çayı, Toroslar'dan gelen " +
      'suyunu önce şehir merkezinde, sonra Lara kıyısında iki ayrı şelaleyle denize ' +
      "boşaltır. Manavgat Nehri'nin şelalesi ise yüksekten dökülmez; geniş bir alana yayılan " +
      'güçlü bir debiyle akar.',
    introTr:
      "Antalya, Akdeniz kıyısında, Toros Dağları'nın denize en dik indiği kesimlerden " +
      "birinde kuruludur. Nüfus bakımından Türkiye'nin beşinci büyük ilidir. Kentin kıyı " +
      "şeridi, MÖ 2. yüzyılda Bergama Kralı II. Attalos tarafından kurulan Attaleia'ya kadar " +
      'uzanan bir liman kentleri zincirine ev sahipliği yapar.',
    hydrographyNoteTr:
      'İlin en düzenli akışlı akarsuyu, Dumanlı kaynağından doğan ve dar kanyonlardan ' +
      "geçerek Akdeniz'e ulaşan 93 kilometre uzunluğundaki Manavgat Nehri'dir; üzerindeki " +
      "Oymapınar ve Manavgat barajları enerji üretiminde kullanılır. Isparta'nın Sütçüler " +
      "ilçesi yakınından doğan Köprüçay ise Toroslar'daki dar kanyonlardan akar ve rafting " +
      'sporu için tercih edilir. Aksu Nehri, ilin doğusunda tarım arazilerini sular.\n\n' +
      'İlin içme ve sulama suyu, DSİ tarafından işletilen Karacaören I ve II barajlarından ' +
      'karşılanır; bu barajlar Aksu Çayı üzerinde yer alır. Kentin büyüyen su ihtiyacı ' +
      "nedeniyle Manavgat'taki Oymapınar Barajı'ndan cazibeyle su aktarımı da " +
      'planlanmaktadır.\n\n' +
      'İlin batısında, Elmalı ilçesindeki Avlan Gölü karstik bir polye gölüdür; 1.030 metre ' +
      'rakımda, yaklaşık 850 hektarlık bir alana yayılır. 1975-1980 arasında açılan bir ' +
      "kanalla tamamen kurutulmuş, bölge halkının girişimiyle 2001'de kapaklar kapatılarak " +
      'yeniden su tutmaya başlamıştır.',
    hydrographyFeatures: [
      { name: 'Oymapınar Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Manavgat Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Karacaören I Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Karacaören II Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Manavgat Nehri', type: HydrographyFeatureType.Nehir },
      { name: 'Aksu Nehri', type: HydrographyFeatureType.Nehir },
      { name: 'Köprüçay', type: HydrographyFeatureType.Nehir },
      { name: 'Düden Çayı', type: HydrographyFeatureType.Nehir },
      { name: 'Avlan Gölü', type: HydrographyFeatureType.Gol },
    ],
    urbanizationRate: 100.0,
    netMigrationRate: 9.09,
    settlementNoteTr:
      "Antalya için de aynı yapısal desen geçerli: TÜİK'in il/ilçe merkezi nüfus oranı " +
      "%100'dür, çünkü büyükşehir statüsündeki illerde belde ve köylerin idari tüzel kişiliği " +
      "6360 sayılı Kanun'la kaldırılmıştır — ilin fiilen tamamen kentleştiği anlamına gelmez. " +
      'Antalya 2024 yılında 96.618 kişi aldı, 71.999 kişi verdi; net göç hızı binde +9,09 ile ' +
      "dört pilot il arasında en yüksek pozitif değere ulaştı ve başkent Ankara'yı bile " +
      'geride bıraktı.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%3,4',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
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
 * WAVE-5 DEEP CONTENT — TIERED (the LAST of the current 5-wave deep-content plan; after it
 *   all 37 already-live il carry deep content). Each of these 9 Güneydoğu Anadolu il now
 *   carries the PR-5a detail-section fields from NOVA's independently fact-checked "Dalga 5"
 *   deep-content draft (verdict SEED-READY WITH CORRECTIONS — both mandatory corrections
 *   applied before seeding: Diyarbakır sur 5.700→5.800 m, and the Kilis internal-note fix).
 *   Depth is split by population, same tiers as wave-3 (DEC 2026-07-11 "Tiered deep-content
 *   depth"):
 *     • Tier-A (nüfus ≥1M — Diyarbakır 21, Gaziantep 27, Şanlıurfa 63): the SAME full 8-field
 *       set as İstanbul/wave-1/wave-3-Tier-A. urbanizationRate=100.00 is the 6360-Kanun
 *       büyükşehir artifact, framed in settlementNoteTr.
 *     • Tier-B (nüfus <1M — Adıyaman 02, Batman 72, Kilis 79, Siirt 56, Şırnak 73): the
 *       6-field set only (introTr, landformNoteTr, hydrographyNoteTr, urbanizationRate,
 *       netMigrationRate, economyIndicator). `hydrographyFeatures` AND `settlementNoteTr`
 *       are DELIBERATELY OMITTED (owner-approved Tier-B scope cut, NOT "not authored yet");
 *       the keys are absent, normalised to null against the DB by withExplicitDetailNulls.
 *       These are non-büyükşehir il, so urbanizationRate is a REAL rate (69.04 / 84.12 /
 *       79.93 / 69.56 / 68.33), carrying NO 6360 methodological note. Siirt's
 *       netMigrationRate=-33.96 is the largest-magnitude value in ANY deep-content wave
 *       (fact-check re-verified it PRIORITY; not a calculation error).
 *     • Mardin 47 — THE SPECIAL EXCEPTION (→ DEC 2026-07-12 "Tier-B büyükşehir caveat
 *       exception"): Tier-B in every other respect (6 fields' depth, `hydrographyFeatures`
 *       still OMITTED), BUT because Mardin is legally büyükşehir since 2012 (6360 sayılı
 *       Kanun) its urbanizationRate=100.00 is the same legal artifact as the Tier-A büyükşehir
 *       il — so it DOES carry a `settlementNoteTr`, containing ONLY the single 6360
 *       urbanization-caveat sentence (NO migration stats, NO narrative — that number lives in
 *       the separate netMigrationRate field). This is a THIRD detail-field variant (full /
 *       Tier-B-none / Tier-B-with-one-field); the field-by-field, null-normalising comparator
 *       (`rowMatchesSeed` + `withExplicitDetailNulls`, seed-geography.ts) handles it with no
 *       change — hydrographyFeatures compares null=null, settlementNoteTr compares the
 *       populated sentence. LOCKED standing rule for any future Tier-B-but-büyükşehir il.
 *   Each il is written to its OWN geographic character (Diyarbakır: Dicle vadisi/Karacadağ
 *   bazalt; Gaziantep: plato + 6 Şubat 2023; Şanlıurfa: Atatürk Barajı/Harran/Urfa Tüneli;
 *   Adıyaman: Nemrut/Fırat; Batman: petrol/Raman; Kilis: sınır platosu; Mardin: Mardin Eşiği;
 *   Siirt: Botan Vadisi; Şırnak: Habur/Cudi) — NOT a palette-swapped copy. No factual value
 *   invented or altered; every number/name is transcribed verbatim from the fact-checked
 *   draft (economyIndicator `source` date normalised to the codebase's numeric "11.12.2025"
 *   form, same bulletin no. 53930 as every other wave). No schema/DTO/OpenAPI change (every
 *   field exists since the İstanbul pilot).
 *   • Content:     Owner's Inbox/il-detay-genisletme/wave5-guneydogu-anadolu-deep-content-draft.md
 *   • Style rules: CONTENT-STYLE.md (orchestrator root — binding for shipped prose)
 *   • Fact-check:  Owner's Inbox/il-detay-genisletme/wave5-guneydogu-anadolu-deep-content-factcheck.md
 *   • Ledger:      data-provenance.md (root) — "Dalga 5"
 * The Şanlıurfa slug stays LOCKED to "sanliurfa" (→ DEC 2026-07-10) — untouched here.
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
    // ── Adıyaman deep content (wave-5 Tier-B). 6-field set from the fact-checked "Dalga 5"
    //    draft (introTr + shortened landform/hydrography + urbanizationRate + netMigrationRate +
    //    economyIndicator). `hydrographyFeatures` + `settlementNoteTr` DELIBERATELY OMITTED
    //    (Tier-B scope, DEC 2026-07-11). urbanizationRate=69.04 is a REAL rate (Adıyaman is not a
    //    büyükşehir — no 6360 note). GSYH share %0,5.
    landformNoteTr:
      "Adıyaman, kuzeyde Toros Dağları'nın uzantısı olan dağlarla çevrilidir; başlıca " +
      "yükseltileri Akdağ, Dibek, Ulubaba, Gördük, Nemrut, Bozdağ ve Karadağ'dır. Kuzeydoğudaki " +
      "Nemrut Dağı, 2.150 metre yüksekliğiyle UNESCO Dünya Mirası Listesi'nde yer alan bir açık " +
      "hava anıt mezara ev sahipliği yapar; UNESCO'nun kayıtlarına göre zirvedeki tümülüs 50 " +
      'metre yükseklikte, 145 metre çapındadır. İlin genel yüksekliği deniz seviyesinden 669 ' +
      'metredir; başlıca ovaları Kahta, Samsat, Keysun ve İnekli ovalarıdır.',
    introTr:
      "İl sınırları içindeki Nemrut Dağı, 1987'de UNESCO Dünya Mirası Listesi'ne alınan, " +
      "Kommagene Krallığı'na ait bir açık hava anıt mezara ev sahipliği yapar. Adıyaman, " +
      "Güneydoğu Toroslar'ın güney eteklerinde, Fırat Nehri'nin batı kıyısında kuruludur; " +
      "617.821 kişilik nüfusuyla Türkiye'nin otuz dördüncü kalabalık ilidir.",
    hydrographyNoteTr:
      "İlin en önemli akarsuyu, Şanlıurfa ve Diyarbakır sınırlarını da çizen Fırat Nehri'dir; " +
      'il topraklarından 180 kilometre boyunca geçer. Çelikhan yakınlarında doğan Kahta Çayı, ' +
      "45,5 kilometrelik bir akıştan sonra Fırat'a karışır. İlin doğu ve güneydoğu sınırının " +
      'büyük bölümünü, Fırat üzerindeki Atatürk Baraj Gölü oluşturur.',
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
    // ── Batman deep content (wave-5 Tier-B). 6-field set (hydrographyFeatures + settlementNoteTr
    //    DELIBERATELY OMITTED, Tier-B scope). urbanizationRate=84.12 is a REAL rate
    //    (non-büyükşehir — no 6360 note). GSYH share %0,4. The idiomatic "adını taşıyan Batman
    //    Çayı" (a place-name origin, not the §15 bureaucratic "taşımak") is intentional.
    landformNoteTr:
      "Batman ili, Batman Çayı, Dicle Nehri ve İluh Deresi'nin biriktirdiği tortullarla " +
      'şekillenmiş bir çöküntü alanıdır. Bölgenin en belirgin yükseltisi, kalkerli ve engebeli ' +
      'yapısıyla mağaralar, derin vadiler ve sarp kayalıklar barındıran 1.288 metrelik Raman ' +
      "Dağı'dır. Aynı dağın adını taşıyan Raman sahası, Türkiye'nin ilk petrol üretiminin " +
      "yapıldığı yerdir: 1940'ta açılan Raman-1 kuyusunda petrol tespit edilmiş, 1948'de Raman-8 " +
      'kuyusundan ekonomik ölçekte üretime geçilmiştir.',
    introTr:
      "1955'te açılan Tüpraş Batman Rafinerisi, Türkiye'nin ilk modern petrol rafinerisidir. " +
      "Batman, Güneydoğu Anadolu Bölgesi'nde, Dicle Nehri'ne katılan Batman Çayı'nın aşağı " +
      "havzasında kuruludur; 662.626 kişilik nüfusuyla Türkiye'nin otuz ikinci kalabalık ilidir.",
    hydrographyNoteTr:
      "İlin adını taşıyan Batman Çayı, kuzeydeki dağlardan doğup güneye akarak Dicle Nehri'ne " +
      'karışır; bu havza, ilin tarımsal sulama ve yerleşim düzenini büyük ölçüde belirler. İlin ' +
      'güney sınırının bir bölümünü Dicle Nehri oluşturur.',
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
    // ── Diyarbakır deep content (wave-5 Tier-A). Full 8-field set from the fact-checked "Dalga 5"
    //    draft. Dicle vadisi + Karacadağ kalkan volkanı (landform); Dicle Nehri + Kralkızı/Dicle/
    //    Devegeçidi barajları (hydrography). urbanizationRate=100 is the 6360 büyükşehir artifact
    //    framed in settlementNoteTr; GSYH share %1,0. The UNESCO sur length is the fact-check's
    //    CORRECTION (5.700 → 5.800 m, whc.unesco.org/en/list/1488).
    landformNoteTr:
      'Diyarbakır, dağlarla çevrili, ortası hafif çukurlaşmış bir arazi yapısına sahiptir; bu ' +
      'çukur alanın eksenini batı-doğu doğrultulu geniş Dicle Vadisi oluşturur. Vadi tabanı, ' +
      'kent merkezinin bulunduğu kesimde deniz seviyesinden yaklaşık 600 metreye iner.\n\n' +
      'İlin batısında, Diyarbakır ile Şanlıurfa arasında yükselen Karacadağ, Kolubaba zirvesiyle ' +
      "1.957 metreye ulaşan, sönmüş bir kalkan volkanıdır. MTA'nın kayıtlarına göre Geç " +
      "Miyosen'den Kuvaterner'e uzanan bir süreçte etkinlik göstermiş olan Karacadağ, yaklaşık " +
      "10.000 km²'lik bir alanı kaplayan bazalt lav örtüsüyle Akdeniz çevresindeki en geniş taban " +
      "alanına sahip volkanlardan biridir. Bu bazalt örtü doğu yönünde Dicle Vadisi'ne kadar " +
      'uzanır ve kent merkezindeki tarihi surların yapı malzemesini oluşturur.',
    introTr:
      "Diyarbakır'ın kent merkezini çevreleyen 5.800 metre uzunluğundaki bazalt sur, Dicle " +
      "kıyısındaki Hevsel Bahçeleri ile birlikte 2015'te UNESCO Dünya Mirası Listesi'ne " +
      "alınmıştır. İl, Güneydoğu Anadolu Bölgesi'nin ortasında, Dicle Nehri vadisinin batı " +
      "kıyısında kuruludur. 1.852.356 kişilik nüfusuyla Türkiye'nin on ikinci kalabalık ilidir.",
    hydrographyNoteTr:
      "İlin en önemli akarsuyu, Elazığ sınırları içinden doğan Dicle Nehri'dir. Toplam uzunluğu " +
      '1.900 kilometre olan nehrin 523 kilometresi Türkiye topraklarından geçer; Diyarbakır kent ' +
      'merkezinin bulunduğu bazalt sahanlığın doğu kesimine paralel akar. Nehir üzerindeki ' +
      'Kralkızı ve Dicle barajları, Güneydoğu Anadolu Projesi (GAP) kapsamında sulama ve enerji ' +
      'üretimi amacıyla işletilir; Dicle Barajı, Kralkızı baraj ekseninin 22 kilometre mansabında ' +
      'yer alır.\n\n' +
      'Kentin içme ve sulama suyu ihtiyacının bir bölümü, Devegeçidi Çayı üzerindeki Devegeçidi ' +
      "Barajı'ndan karşılanır. Kar sularının eridiği ilkbahar aylarında, Dicle ve Kralkızı " +
      "barajlarındaki su DİSKİ tarafından Devegeçidi Barajı'na aktarılır.",
    hydrographyFeatures: [
      { name: 'Dicle Nehri', type: HydrographyFeatureType.Nehir },
      { name: 'Kralkızı Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Dicle Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Devegeçidi Barajı', type: HydrographyFeatureType.Baraj },
    ],
    urbanizationRate: 100.0,
    netMigrationRate: -4.04,
    settlementNoteTr:
      "Diyarbakır'ın TÜİK il/ilçe merkezi nüfus oranı, büyükşehir statüsündeki illerde olduğu " +
      "gibi %100'dür — belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı " +
      "Kanun) bir sonucu, ilin fiilen tamamen kentleştiği anlamına gelmiyor. TÜİK'in 2024 iç göç " +
      'verilerine göre il aynı yıl 43.561 kişi aldı, 50.981 kişi verdi; net göç hızı binde -4,04 ' +
      'oldu.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,0',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
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
    // ── Gaziantep deep content (wave-5 Tier-A). Full 8-field set from the fact-checked "Dalga 5"
    //    draft. Gaziantep Platosu + 6 Şubat 2023 deprem paragrafı (landform, factual/short, AFAD +
    //    resmi açıklama sourced — Hatay/wave-4 emsali); Fırat/Nizip/Karasu + Kayacık Barajı
    //    (hydrography). urbanizationRate=100 is the 6360 büyükşehir artifact; netMigrationRate is
    //    the sole POSITIVE of the wave's Tier-A (+3,09); GSYH share %1,9 (highest of the nine il).
    landformNoteTr:
      "Gaziantep topraklarının yaklaşık %52'si dağlarla, %27'si ovalarla kaplıdır. İlin batı " +
      "sınırını Amanos (Nur) Dağları çizer; ilin geri kalanı, Güneydoğu Toroslar'ın uzantısı olan " +
      'Sof Dağları ile Dülükbaba, Sam, Ganibaba ve Sarıkaya tepelerinin sınırladığı, ' +
      'Pliyo-Kuvaterner volkanizması ve akarsu aşındırmasıyla şekillenmiş geniş ve hafif eğimli ' +
      'bir plato — Gaziantep Platosu — üzerinde yer alır.\n\n' +
      "İlin başlıca ovaları İslahiye, Barak, Araban, Yavuzeli ve Oğuzeli'dir; Barak Ovası, Nizip " +
      "ve Karkamış ilçeleri arasında, Fırat'a yakın kesimde uzanır.\n\n" +
      "Gaziantep, 6 Şubat 2023'te merkez üssü komşu Kahramanmaraş olan büyük depremlerden " +
      "etkilenen illerden biridir. Cumhurbaşkanı Yardımcısı Fuat Oktay'ın aynı gün yaptığı " +
      'açıklamaya göre depremlerde ilde 309 kişi hayatını kaybetti, 1.597 kişi yaralandı ve 581 ' +
      'bina yıkıldı; hasar en çok Nurdağı ve İslahiye ilçelerinde yoğunlaştı.',
    introTr:
      "TÜİK'in 2025 verilerine göre Gaziantep'in Şahinbey ilçesi, 957.792 kişiyle Türkiye'nin en " +
      'kalabalık ikinci ilçesidir; Şehitkamil ilçesi de 905.880 kişiyle beşinci sırada yer alır. ' +
      "İl, Güneydoğu Anadolu Bölgesi'nin batı ucunda, Fırat Nehri'nin batısındaki Gaziantep " +
      "Platosu üzerinde kuruludur ve 2.222.415 kişilik nüfusuyla Türkiye'nin dokuzuncu kalabalık " +
      'ilidir.',
    hydrographyNoteTr:
      "İlin doğu sınırını Fırat Nehri çizer; nehir, Gaziantep'i Şanlıurfa'dan ayırır. İl " +
      "topraklarından çıkmadan Fırat'a karışan son önemli akarsu Nizip Çayı'dır; Karasu ise Araban " +
      "Ovası'ndan geçtikten sonra batıdan Fırat'a katılır. Bunların dışında ilde çok sayıda pınar " +
      'bulunmasına karşın doğal göl yoktur.\n\n' +
      'Oğuzeli ilçesinde Ayfinar Çayı üzerindeki Kayacık Barajı, 13.680 hektarlık bir alanı ' +
      "sulamanın yanı sıra Gaziantep ile Kilis'in bir bölümüne su sağlar. Kentin içme suyu " +
      "ihtiyacının önemli bir kısmı ise, Kahramanmaraş'ın Pazarcık ilçesindeki Kartalkaya " +
      "Barajı'ndan 53,7 kilometrelik bir isale hattıyla aktarılır.",
    hydrographyFeatures: [
      { name: 'Fırat Nehri', type: HydrographyFeatureType.Nehir },
      { name: 'Nizip Çayı', type: HydrographyFeatureType.Nehir },
      { name: 'Karasu', type: HydrographyFeatureType.Nehir },
      { name: 'Kayacık Barajı', type: HydrographyFeatureType.Baraj },
    ],
    urbanizationRate: 100.0,
    netMigrationRate: 3.09,
    settlementNoteTr:
      "Gaziantep'in TÜİK il/ilçe merkezi nüfus oranı, büyükşehir statüsündeki illerde olduğu gibi " +
      "%100'dür — belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı Kanun) " +
      "bir sonucu, ilin fiilen tamamen kentleştiği anlamına gelmiyor. TÜİK'in 2024 iç göç " +
      'verilerine göre il aynı yıl 56.097 kişi aldı, 49.330 kişi verdi; net göç hızı binde +3,09 ' +
      'oldu — bölgedeki komşu illerin çoğunun aksine Gaziantep göç açısından pozitif bir tablo ' +
      'çiziyor.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,9',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
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
    // ── Kilis deep content (wave-5 Tier-B). 6-field set (hydrographyFeatures + settlementNoteTr
    //    DELIBERATELY OMITTED, Tier-B scope). urbanizationRate=79.93 is a REAL rate
    //    (non-büyükşehir — no 6360 note). GSYH share %0,1 (lowest of the nine il — pure scale, a
    //    non-sensitive figure). All landform/hydrography numbers from the Kilis Valiliği page.
    landformNoteTr:
      'Kilis, kuzeyde daha sarp bir dağlık alanın, güneyde Suriye sınırına doğru alçalan bir ' +
      'platonun üzerinde yer alır; ilin ortalama yüksekliği 680 metredir. Sınır boyunca Darmik ' +
      "Dağı'ndan başlayıp kuzeye Hazil, Karruca, Kartal, Büyük Arapdede ve Sof Dağları'yla devam " +
      "eden kuşağın en yüksek noktası, 1.496 metrelik Sof Dağı'dır.",
    introTr:
      "Kilis, Güneydoğu Anadolu Bölgesi'nin batısında, Gaziantep Platosu'nun güneybatı ucunda, " +
      "Türkiye-Suriye sınırı boyunca kuruludur. 157.363 kişilik nüfusuyla Türkiye'nin nüfus " +
      'bakımından en küçük beşinci ilidir; Gaziantep, ilin Türkiye içindeki tek sınır komşusudur.',
    hydrographyNoteTr:
      'İlin su ağı ikiye ayrılır: batı kesimi, Afrin Çayı ve kolları aracılığıyla Amik Ovası ' +
      "üzerinden Asi Nehri'ne ve oradan Akdeniz'e bağlanırken; doğu kesimindeki küçük akarsular " +
      "Halep'in güneyindeki kapalı bir havzaya boşalır. İlde doğal göl bulunmaz.",
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
    // ── Mardin deep content (wave-5 Tier-B, SPECIAL EXCEPTION → DEC 2026-07-12 "Tier-B büyükşehir
    //    caveat exception"). Tier-B depth (shortened landform/hydrography, `hydrographyFeatures`
    //    still OMITTED), BUT Mardin is legally büyükşehir since 2012 (6360 sayılı Kanun), so
    //    urbanizationRate=100 is the SAME legal artifact as the Tier-A büyükşehir il — it therefore
    //    carries a `settlementNoteTr` holding ONLY the single 6360 caveat sentence (NO migration
    //    stats, NO narrative; the number lives in netMigrationRate). This is the THIRD detail-field
    //    variant (full / Tier-B-none / Tier-B-with-one-field); the field-by-field null-normalising
    //    comparator handles it unchanged. GSYH share %0,5. LOCKED rule for future Tier-B-but-
    //    büyükşehir il.
    landformNoteTr:
      'İlin kuzey kesimini kaplayan Mardin Dağları, güneydeki Mezopotamya ovasından 600-1.000 ' +
      'metre, yer yer 1.200 metreye varan bir yükseklikle ayrılan, doğu-batı doğrultulu geniş bir ' +
      "kütledir; bu yükselti, Güneydoğu Anadolu Bölgesi'nin belirgin coğrafi eşiklerinden biri " +
      "olan Mardin Eşiği'ni oluşturur. Dağların kalkerli kesimleri aşınarak platolara dönüşmüş; " +
      'bu platolar güneyde Mardin, Nusaybin ve Kızıltepe ovalarına doğru alçalır.',
    introTr:
      "Mardin, Mezopotamya ovasına kuzeyden egemen bir konumda, Mardin Dağları'nın (Mardin Eşiği) " +
      "üzerinde kuruludur. Nüfus bakımından Türkiye'nin yirmi altıncı büyük ilidir. Kentin tarihi " +
      'merkezi, ovadan 600-1.000 metre yükseklikteki bu sırtın üzerine kuruludur.',
    hydrographyNoteTr:
      "İlin en büyük akarsuyu, Batman ile aradaki sınırın bir bölümünü çizen Dicle Nehri'dir. " +
      'Nusaybin ilçesinden geçen Çağçağ suyu ile Savur Çayı, ildeki diğer önemli akarsulardır. ' +
      "Mardin'de doğal göl bulunmaz; Buğur Çayı üzerindeki küçük bir gölet sulama amacıyla " +
      'işletilir.',
    urbanizationRate: 100.0,
    netMigrationRate: -5.65,
    settlementNoteTr:
      "Mardin'in TÜİK il/ilçe merkezi nüfus oranı, büyükşehir statüsündeki illerde olduğu gibi " +
      "%100'dür — belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı Kanun) " +
      'bir sonucu, ilin fiilen tamamen kentleştiği anlamına gelmiyor.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,5',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
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
    // ── Siirt deep content (wave-5 Tier-B). 6-field set (hydrographyFeatures + settlementNoteTr
    //    DELIBERATELY OMITTED, Tier-B scope). urbanizationRate=69.56 is a REAL rate
    //    (non-büyükşehir — no 6360 note). netMigrationRate=-33.96 is the LARGEST-magnitude value
    //    in ANY deep-content wave (prev record Van -20.02) — read straight from the raw TÜİK 54082
    //    table and PRIORITY-reverified by the independent fact-check, NOT a calc error. GSYH %0,2.
    landformNoteTr:
      "İl topraklarının büyük bölümünü, doğuda Hakkari dağlarına bağlanan Güneydoğu Toroslar'ın " +
      "uzantıları kaplar; ilin en yüksek noktası, 2.838 metrelik Yazlıca (Herekul) Dağı'dır. Botan " +
      "Çayı, Doğruyol, Koran ve Kapılı dağları arasında, Türkiye'nin en sarp ve derin vadilerinden " +
      "biri olan Botan Vadisi'ni oluşturur; vadinin bir bölümü 2019'da millî park ilan edilmiştir.",
    introTr:
      "İlin güneyinden geçen Botan Çayı, Türkiye'nin en sarp ve derin vadilerinden birini oyar. " +
      "Siirt, Güneydoğu Toroslar'ın Hakkari dağlarına bağlandığı, doğuya doğru yükselen dağlık bir " +
      "arazi üzerinde kuruludur; 332.369 kişilik nüfusuyla Türkiye'nin elli sekizinci kalabalık " +
      'ilidir.',
    hydrographyNoteTr:
      "İlin başlıca akarsuyu, Bitlis güneyindeki yüksek dağlardan doğan Botan Çayı'dır; Kezer ve " +
      "Başur çaylarıyla birleştikten sonra batıya, ardından kuzeybatıya yönelerek Dicle Nehri'ne " +
      'katılır. İlin düzlük alanları sınırlıdır; Kurtalan Ovası bunların başında gelir.',
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
    // ── Şanlıurfa deep content (wave-5 Tier-A). Full 8-field set from the fact-checked "Dalga 5"
    //    draft. Arap Platformu/karstik plato + Karacadağ bazalt (landform); Fırat + Atatürk/Birecik/
    //    Karkamış barajları + Urfa Tüneli (hydrography). urbanizationRate=100 is the 6360 büyükşehir
    //    artifact; settlementNoteTr also carries the pure-demographic "en genç nüfuslu il" (21,8
    //    ortanca yaş) TÜİK figure. GSYH share %1,1. Slug stays LOCKED "sanliurfa" (DEC 2026-07-10).
    landformNoteTr:
      "Şanlıurfa, kuzeyde Arap Platformu'nun kuzey kesimleri ile Güneydoğu Toroslar'ın orta " +
      'bölümünün güney eteklerinde, genel olarak plato görünümünde bir arazi üzerinde yer alır. ' +
      'Karacadağ ile Fırat Nehri arasında uzanan Şanlıurfa Platosu, güneyde Suriye sınırına doğru ' +
      'alçalır; Hilvan-Viranşehir çizgisinin doğusunda kalan kesimi Karacadağ kaynaklı bazalt ' +
      'lavlarla, batı kesimi ise kireçtaşıyla kaplıdır.\n\n' +
      'Kireçtaşı örtülü kesimlerde geniş bir karstik arazi gelişmiştir; Çaykuyu, Arat, Tektek ve ' +
      "Baziki platoları bu yapının en belirgin örnekleridir. Tektek Dağları'nda geniş bir alana " +
      'yayılan yabani fıstık ağaçları, bölgenin doğal bitki örtüsünün en dikkat çekici ' +
      'unsurudur.\n\n' +
      'İlin başlıca ovaları Harran, Suruç, Viranşehir, Hilvan, Ceylanpınar, Bozova ve Siverek ' +
      "ovalarıdır; bunlardan Harran Ovası, GAP'ın sulama yatırımlarıyla tarımsal üretimin en " +
      'yoğunlaştığı alandır.',
    introTr:
      "Güneydoğu Anadolu Projesi'nin (GAP) en büyük barajı olan Atatürk Barajı'nın gövdesi, " +
      "Şanlıurfa sınırları içinde yer alır. İl, Güneydoğu Anadolu Bölgesi'nin güneyinde, Fırat " +
      'Nehri ile Suriye sınırı arasında geniş bir plato üzerinde kuruludur; 2.265.800 kişilik ' +
      "nüfusuyla Türkiye'nin sekizinci kalabalık ilidir.",
    hydrographyNoteTr:
      "İlin en önemli akarsuyu, batı sınırını çizen Fırat Nehri'dir. Nehir üzerindeki Atatürk " +
      "Barajı, 817 km²'lik göl alanı ve 48,5 milyar m³'lük su hacmiyle GAP'ın en büyük barajıdır; " +
      "gövdesinin temelden yüksekliği 169 metre, toplam kurulu gücü 2.400 MW'tır. İl sınırları " +
      'içinde, Gaziantep sınırına yakın kesimde ayrıca Birecik ve Karkamış barajları yer alır.\n\n' +
      "Atatürk Barajı'ndan çıkan su, 26,4 kilometre uzunluğundaki iki paralel Urfa Tüneli " +
      "aracılığıyla Harran Ovası'na ulaştırılır. 9 Kasım 1994'te suyla buluşan tüneller, cazibeyle " +
      '358.000 hektar, pompajla 118.000 hektar olmak üzere toplam 476.000 hektar araziyi ' +
      'sulamaktadır.',
    hydrographyFeatures: [
      { name: 'Fırat Nehri', type: HydrographyFeatureType.Nehir },
      { name: 'Atatürk Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Birecik Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Karkamış Barajı', type: HydrographyFeatureType.Baraj },
    ],
    urbanizationRate: 100.0,
    netMigrationRate: -8.52,
    settlementNoteTr:
      "Şanlıurfa'nın TÜİK il/ilçe merkezi nüfus oranı, büyükşehir statüsündeki illerde olduğu " +
      "gibi %100'dür — belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı " +
      "Kanun) bir sonucu, ilin fiilen tamamen kentleştiği anlamına gelmiyor. TÜİK'in 2024 iç göç " +
      'verilerine göre il aynı yıl 41.771 kişi aldı, 60.925 kişi verdi; net göç hızı binde -8,52 ' +
      "oldu. TÜİK'in ADNKS verilerine göre Şanlıurfa, 21,8 ortanca yaşla Türkiye'nin en genç " +
      'nüfuslu ilidir.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,1',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
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
    // ── Şırnak deep content (wave-5 Tier-B). 6-field set (hydrographyFeatures + settlementNoteTr
    //    DELIBERATELY OMITTED, Tier-B scope). urbanizationRate=68.33 is a REAL rate and the LOWEST
    //    of the nine il (non-büyükşehir — no 6360 note). Habur Sınır Kapısı / Cudi Dağı / Dicle
    //    havzası framed strictly as infrastructure/geography (task's geography-angle-only note).
    //    GSYH share %0,4.
    landformNoteTr:
      'Şırnak toprakları, batıdan doğuya belirgin bir yükselme gösterir: batıdaki Cizre ve Silopi ' +
      'ilçeleri 400-550 metre dolayında alçak ovalarla kaplıyken, merkez ilçe ve doğudaki ' +
      'Uludere-Beytüşşebap kesimi 1.000 metrenin üzerinde, sarp ve dağlık bir arazi yapısındadır. ' +
      "İlin başlıca dağları Cudi, Gabar, Namaz ve Altın dağlarıdır; elips biçimindeki Cudi Dağı'nın " +
      'üzerinde 2.000 metreyi aşan dört doruk bulunur, bunların en yükseği 2.114 metredir.',
    introTr:
      "İlin güneyindeki Habur Sınır Kapısı, Türkiye'nin Irak'a açılan başlıca kara sınır " +
      "kapısıdır. Şırnak, Güneydoğu Toroslar'ın en dağlık kesiminde, Türkiye'nin Irak ve Suriye " +
      "ile sınır komşusu olduğu bölgede kuruludur; 573.666 kişilik nüfusuyla Türkiye'nin otuz " +
      'dokuzuncu kalabalık ilidir.',
    hydrographyNoteTr:
      "İlin akarsuları, Türkiye'nin dördüncü büyük su toplama havzası olan Dicle havzasının bir " +
      'parçasıdır; Kızılsu, Hezil ve Habur çayları bu havzanın Şırnak sınırları içindeki başlıca ' +
      'kollarıdır. Habur Çayı, aynı zamanda Türkiye-Irak sınırının bir bölümünü de çizer.',
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
 * DEEP CONTENT THIS WAVE: all 10 il now carry the full PR-5a detail-section field set
 *   (introTr / landformNoteTr / hydrographyNoteTr + hydrographyFeatures / urbanizationRate /
 *   netMigrationRate / settlementNoteTr / economyIndicator), transcribed from NOVA's
 *   independently fact-checked "Dalga 2" deep-content draft — see the WAVE-2 DEEP CONTENT
 *   note at the top of this file for the load-bearing specifics and the non-büyükşehir
 *   urbanizationRate nuance (5 of the 10 il carry a genuine <100 rate, no 6360 note).
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
    // ── Balıkesir deep content (wave-2 — see the WAVE-2 DEEP CONTENT note above). Çift deniz
    //    (Marmara + Ege) kimliği + 2025 Sındırgı depremleri (Kandilli/AFAD 6,1 çift-teyit).
    //    Büyükşehir: urbanizationRate=100 is the 6360 legal artifact, framed in settlementNoteTr.
    landformNoteTr:
      "İlin güneybatısında, Balıkesir ile Edremit körfezi arasında yükselen Kazdağı'nın (İda " +
      "Dağı) en yüksek noktası, 1.774 metrelik Karataş Tepesi'dir. Madra ve Alaçam dağları " +
      'ilin diğer önemli yükseltileridir. Balıkesir Ovası (140 kilometrekare) ve Manyas ' +
      'Ovası (110 kilometrekare), ilin tarıma elverişli düzlükleridir.\n\n' +
      "10 Ağustos 2025'te merkez üssü Sındırgı olan, Kandilli Rasathanesi'ne göre 6,1, AFAD'a " +
      "göre de 6,1 büyüklüğünde bir deprem meydana geldi. 27 Ekim 2025'te aynı bölgede, bu " +
      'kez Aktaş mevkiinde merkezlenen 6,0 büyüklüğünde ikinci bir deprem oldu; iki deprem ' +
      'arasındaki dönemde bölgede çok sayıda küçük artçı sarsıntı kaydedildi.',
    introTr:
      'Balıkesir, 2025 yılı boyunca Sındırgı ilçesi çevresinde art arda yaşanan depremlerle ' +
      "sismik olarak gündeme geldi: 10 Ağustos'ta büyüklüğü 6,1, 27 Ekim'de ise 6,0 olan iki " +
      "ayrı deprem kaydedildi. İl, kuzeyde Marmara Denizi'ne, güney ve batıda Ege Denizi'ne " +
      "kıyısı olan, iki denizi birden kucaklayan Türkiye'nin az sayıdaki ilinden biridir; " +
      'toplam kıyı uzunluğu 290,5 kilometredir. Marmara kıyısında Bandırma 60, Ege kıyısında ' +
      'ise Ayvalık 54 kilometrelik bir kıyı şeridine sahiptir.',
    hydrographyNoteTr:
      "İlin kuzeyindeki Manyas Gölü (Kuş Gölü), 13 Temmuz 1994'te Ramsar Sözleşmesi kapsamına " +
      "alınmış, 15 Nisan 1998'de koruma alanı 20.400 hektara genişletilmiştir; göl " +
      'kıyısındaki Kuşcenneti Milli Parkı, 24.047 hektarlık toplam alanıyla kuş göç ' +
      "yollarının önemli bir durağıdır. Gölü besleyen ve Susurluk Çayı'na bağlanan sistem, " +
      "Marmara Denizi'ne dökülmeden önce yukarı havzadaki sanayi tesislerinden kaynaklanan " +
      "kirlilikle karşı karşıyadır — bu konu Tarım ve Orman Bakanlığı'nın havza yönetim " +
      'planlarında ayrıca ele alınır.\n\n' +
      'İlin Ege kıyısına akan Madra ve Havran çayları, Marmara tarafındaki Susurluk sistemine ' +
      'tamamen bağımsız, ayrı bir su ağı oluşturur; bu çaylar Edremit ve Çandarlı ' +
      'körfezlerine dökülür.',
    hydrographyFeatures: [
      { name: 'Manyas Gölü', type: HydrographyFeatureType.Gol },
      { name: 'Susurluk Çayı', type: HydrographyFeatureType.Nehir },
      { name: 'Madra Çayı', type: HydrographyFeatureType.Nehir },
    ],
    urbanizationRate: 100.0,
    netMigrationRate: 3.5,
    settlementNoteTr:
      "Balıkesir'de de büyükşehir statüsünün getirdiği yapısal sonuç geçerlidir: TÜİK il/ilçe " +
      "merkezi nüfus oranı %100'dür, çünkü belde ve köylerin idari tüzel kişiliği 6360 sayılı " +
      "Kanun'la kaldırılmıştır. 2024 yılında 44.834 kişi aldı, 40.371 kişi verdi; net göç " +
      "hızı binde +3,50'dir.",
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,3',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
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
    // ── Bilecik deep content (wave-2). Söğüt/Ertuğrul (TDV kaynak-eleştirisiyle) + en küçük
    //    nüfus + denize kıyısı olmayan tek Marmara ili. NON-büyükşehir: urbanizationRate=84.11
    //    is a GENUINE computed rate — settlementNoteTr carries NO 6360 note (it does not apply).
    //    netMigrationRate is this wave's sole NEGATIVE (-0.07 ‰); reel GSYH düşüşü moved to introTr.
    landformNoteTr:
      'İl toprakları, klasik anlamda dağlık değil, derin ve dik vadilerle yarılmış bir yayla ' +
      "görünümündedir; ortalama rakım 500 metre dolayındadır. En yüksek nokta, Bozüyük'ün " +
      "güneybatısındaki 1.906 metrelik Kala Dağı'dır. İlin büyük bölümü, Sakarya Nehri'nin " +
      'yukarı ve orta havzasında yer alır; nehir, il sınırları içinde yaklaşık 80 kilometre ' +
      'boyunca akar.\n\n' +
      'Rakamlı bir deprem geçmişi zayıf olsa da il, güncel tehlike haritalarında birinci ' +
      'derece deprem kuşağında sınıflandırılır; kayıtlara geçen tarihsel sarsıntılar arasında ' +
      "1862'de Söğüt ve 1897'de Osmaneli'nde hissedilen depremler bulunur. İl, 1956 Eskişehir " +
      've 1999 Kocaeli depremlerinden etkilenmiş, ama bu iki depremin merkez üssü Bilecik ' +
      'sınırları dışında kalmıştır.',
    introTr:
      "Bilecik'e bağlı Söğüt, Osmanlı Beyliği'nin geleneksel olarak ilk yurdu kabul edilir; " +
      "TDV İslam Ansiklopedisi'nin Ertuğrul Gazi maddesi, döneme dair bilgilerin büyük ölçüde " +
      'sonraki yüzyıllarda yazılmış, efsanevi unsurlar taşıyan kaynaklara dayandığını, çağdaş ' +
      "bir Bizans ya da İslam kroniğinde Ertuğrul'dan söz edilmediğini belirtir. İl, bu " +
      'ilçelerin bulunduğu bölgede nüfus bakımından küçük kalır — 2025 sonu itibarıyla 228.995 ' +
      "kişi, komşusu Bursa'nın nüfusunun onda birinden azdır — ve Marmara Bölgesi'nde denize " +
      "kıyısı olmayan tek ildir. TÜİK'in 2024 verilerine göre, gayrisafi yurt içi hasılası bir " +
      "önceki yıla göre reel olarak %2,4 gerileyen tek il de Bilecik'tir; bu, 81 il arasındaki " +
      'en yüksek düşüş oranıdır.',
    hydrographyNoteTr:
      "Sakarya Nehri'nin yanı sıra, Bozüyük çevresinde Karasu adlı bir kol nehre katılır. " +
      'Söğüt ilçesinde, Söğüt Çayı üzerinde 1994-2000 arasında inşa edilen Kızıldamlar ' +
      'Barajı, 10,70 milyon metreküplük hacmiyle çevredeki tarım arazilerini sular; aynı ' +
      'zamanda bir kuş barınağıdır.',
    hydrographyFeatures: [
      { name: 'Sakarya Nehri', type: HydrographyFeatureType.Nehir },
      { name: 'Karasu', type: HydrographyFeatureType.Nehir },
      { name: 'Kızıldamlar Barajı', type: HydrographyFeatureType.Baraj },
    ],
    urbanizationRate: 84.11,
    netMigrationRate: -0.07,
    settlementNoteTr:
      "Bilecik'te büyükşehir statüsü bulunmadığından TÜİK'in il/ilçe merkezi nüfus oranı " +
      "gerçek bir kentleşme düzeyi gösterir: 2025 verilerine göre nüfusun %84,11'i il ve ilçe " +
      'merkezlerinde yaşıyor. 2024 yılında 10.023 kişi aldı, 10.038 kişi verdi; net göç hızı ' +
      'binde -0,07 ile aradaki 15 kişilik farkla aldığından hafifçe daha fazla göç verdi.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,3',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
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
    // ── Bursa deep content (wave-2). Uludağ buzul-jeomorfolojisi + 1855 depremleri (SHEEC
    //    katalog değeri) + tektonik göller (İznik/Uluabat). "Horst" terimi bilinçli KULLANILMADI
    //    (MTA: metamorfik çekirdek karmaşığı). Büyükşehir: urbanizationRate=100 = 6360 artifact.
    landformNoteTr:
      'Uludağ, kuzey yamaçlarında sirk vadileri ve sirk gölleriyle (Karagöl, Aynalıgöl, ' +
      "Kilimligöl, Buzlu Göl) Türkiye'de buzul döneminin izlerinin görüldüğü ilk yerlerden " +
      "biridir; dağın 12.762 hektarlık bölümü 1961'de milli park ilan edilmiştir. İlin " +
      "dağlık kesimini Uludağ'ın yanı sıra Samanlı, Mudanya ve Katırlı dağları oluşturur; " +
      'Bursa, İnegöl, Karacabey, Orhangazi, İznik ve Yenişehir ovaları ise il topraklarının ' +
      'önemli bir bölümünü kaplar.\n\n' +
      "28 Şubat 1855'te, merkez üssü Mustafakemalpaşa yakınlarında olan ve büyüklüğü " +
      'yaklaşık 7,0 olarak kaydedilen bir deprem meydana geldi; yaklaşık 300 kişi hayatını ' +
      "kaybetti. Altı hafta sonra, 11 Nisan 1855'te Gemlik-Mudanya yakınlarında merkezlenen " +
      'ikinci bir deprem (6,7 büyüklüğünde) yaklaşık 1.300 kişinin daha ölümüne yol açtı. ' +
      "1999 İzmit depreminde Bursa'nın kendisi merkez üssünden uzak kaldı; bölgeden nakledilen " +
      'çok sayıda yaralı, kentteki hastanelerde tedavi gördü.',
    introTr:
      "Bursa, 2.543 metrelik Uludağ ile Marmara Bölgesi'nin en yüksek noktasına sahiptir. " +
      "Kent, 1326'da Orhan Gazi tarafından fethedilmiş ve kısa süre sonra ilk Osmanlı başkenti " +
      "olmuştur; başkentlik unvanı 1363'te Edirne'ye taşınana kadar sürmüştür. Bugün nüfus " +
      "bakımından Türkiye'nin dördüncü büyük ilidir.",
    hydrographyNoteTr:
      "İznik Gölü, 298 kilometrekarelik yüzölçümüyle Türkiye'nin doğal gölleri arasında " +
      "beşinci, Marmara Bölgesi'nde ise en büyüğüdür; tektonik kökenli bir çöküntü gölü olup " +
      "en derin noktası 65 metreye ulaşır. Antik adı Ascania Limne olan göl, Homeros'un " +
      "İlyada'sında da anılır. İlin batısındaki Uluabat Gölü ise sığdır — derinliği 2-4 " +
      'metreyi geçmez — ve nilüfer yataklarıyla kaplı, tümüyle koruma altındaki bir sulak ' +
      'alandır.\n\n' +
      "Nilüfer Çayı, Uludağ'daki Aras Şelalesi'nden doğar, Bursa Ovası'nı geçerek Susurluk " +
      "Çayı'na katılır ve Karacabey üzerinden Marmara Denizi'ne ulaşır; adını Orhan Gazi'nin " +
      "eşi Nilüfer Hatun'dan alır. İçme suyu ihtiyacının büyük bölümü, birlikte ilin su " +
      "ihtiyacının yaklaşık %85'ini karşılayan Doğancı ve Nilüfer barajlarından sağlanır.",
    hydrographyFeatures: [
      { name: 'İznik Gölü', type: HydrographyFeatureType.Gol },
      { name: 'Uluabat Gölü', type: HydrographyFeatureType.Gol },
      { name: 'Nilüfer Çayı', type: HydrographyFeatureType.Nehir },
      { name: 'Doğancı Barajı', type: HydrographyFeatureType.Baraj },
    ],
    urbanizationRate: 100.0,
    netMigrationRate: 4.71,
    settlementNoteTr:
      "Bursa'da da büyükşehir statüsünün getirdiği yapısal sonuç geçerlidir: TÜİK il/ilçe " +
      "merkezi nüfus oranı %100'dür, çünkü belde ve köylerin idari tüzel kişiliği 6360 sayılı " +
      "Kanun'la kaldırılmıştır. 2024 yılında 81.656 kişi aldı, 66.440 kişi verdi; net göç " +
      'hızı binde +4,71 ile ölçülü ama istikrarlı bir göç kazancı gösteriyor.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%3,8',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
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
    // ── Çanakkale deep content (wave-2). Boğaz/iki yarımada + UNESCO Truva + Gelibolu. Boğaz
    //    en dar noktası bilinçli olarak bir ARALIK (1,2-1,4 km); Kazdağı zirve rakamı Balıkesir
    //    tarafında olduğu için YAZILMADI. NON-büyükşehir: urbanizationRate=62.03, genuine rate.
    landformNoteTr:
      'Çanakkale, 671 kilometrelik kıyı şeridiyle Ege Denizi, Marmara Denizi, Çanakkale ' +
      "Boğazı ve iç göllere aynı anda kıyısı olan ender illerden biridir. Anadolu'nun en batı " +
      "noktası olan Baba Burnu ile Türkiye'nin en batı noktası olan, Gökçeada'daki İncir " +
      'Burnu il sınırları içindedir. İlin güneyinde, Balıkesir sınırında yükselen Kaz Dağı ' +
      "(İda Dağı), Kazdağı Milli Parkı'nın da bulunduğu ormanlık bir kütledir.\n\n" +
      'Çanakkale Boğazı, yaklaşık 61 kilometre uzunluğundadır; genişliği kuzey ağzında 3,2 ' +
      'kilometreye ulaşırken orta kesimde 8 kilometreyi bulur, Çanakkale kenti hizasında ise ' +
      '1,2-1,4 kilometreye kadar daralır. Ortalama derinliği 55 metre, Kilitbahir ' +
      'açıklarındaki en derin noktası 103 metredir.',
    introTr:
      "Çanakkale, Ege Denizi'ni Marmara Denizi'ne bağlayan Çanakkale Boğazı'nın iki yakasına " +
      "kuruludur; il toprakları Avrupa'daki Gelibolu Yarımadası ile Anadolu'daki Biga " +
      "Yarımadası'ndan oluşur. İlin güneyinde, kent merkezinin yaklaşık 30 kilometre " +
      "içerisinde, 1998'de UNESCO Dünya Mirası Listesi'ne alınan Truva Ören Yeri bulunur; " +
      'kesintisiz 3.000 yılı aşkın bir süreye yayılan 10 yerleşim katmanı taşır. Boğazın ' +
      "Avrupa yakasındaki Gelibolu Yarımadası'nın büyük bölümü, 1915 Çanakkale Savaşları'nın " +
      'anı ve mezarlık alanlarına ayrılmıştır.',
    hydrographyNoteTr:
      'Kent merkezinden geçen Sarıçay, boğaza ulaştığı ağızda kıyı şeridini şekillendirir. ' +
      "Gelibolu Yarımadası'nda Tuzla Gölü, Biga ilçesinde ise Hoyrat ve Ece gölleri ilin " +
      "başlıca göletleridir. İlin tek içme suyu kaynağı Atikhisar Barajı'dır; sulama amaçlı " +
      'işletilen Bayramiç Barajı ise ilin bir diğer önemli su yapısıdır.',
    hydrographyFeatures: [
      { name: 'Atikhisar Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Bayramiç Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Sarıçay', type: HydrographyFeatureType.Nehir },
      { name: 'Tuzla Gölü', type: HydrographyFeatureType.Gol },
    ],
    urbanizationRate: 62.03,
    netMigrationRate: 6.18,
    settlementNoteTr:
      'Çanakkale, büyükşehir olmayan bir il olarak gerçek bir kentleşme oranı gösterir: 2025 ' +
      "TÜİK verilerine göre nüfusun %62,03'ü il ve ilçe merkezlerinde, kalan bölüm belde ve " +
      'köylerde yaşıyor. 2024 yılında 24.714 kişi aldı, 21.211 kişi verdi; net göç hızı binde ' +
      "+6,18'dir.",
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,6',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
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
    // ── Edirne deep content (wave-2). İki ülke sınırı (Bulgaristan/Yunanistan) + nehir buluşması
    //    (Meriç/Tunca/Arda/Ergene) + Gala Gölü Milli Parkı (Edirne'de, Çanakkale'de DEĞİL). Kadıköy
    //    Barajı Edirne'ye ait (Tier-1 SYGM). NON-büyükşehir: urbanizationRate=77.06, genuine rate.
    landformNoteTr:
      'İlin toplam sınır uzunluğu 292 kilometredir; kalan kesim Kırklareli, Tekirdağ ve Saros ' +
      "Körfezi kıyısıyla Çanakkale'ye komşudur. İlin dağlık kesimini kuzeyde Istranca, " +
      'güneyde Uzunköprü, Koru ve Çandır dağları oluşturur; en yüksek nokta, 720 metrelik ' +
      "Korudağ'dır. Geri kalan topraklar, ayçiçeği, çeltik ve tahıl tarımına elverişli " +
      'alüvyonlu Ergene, Meriç, Kazanova ve İpsala ovalarıyla kaplıdır.',
    introTr:
      "Fatih Sultan Mehmed, İstanbul kuşatmasını planladığı söylenen bir dönemde Edirne'de " +
      "doğmuştur. Kent, 1361'de I. Murad tarafından fethedildikten sonra Osmanlı başkenti " +
      "olmuş; İstanbul'un fethine kadar bu konumunu korumuştur. Edirne bugün, kuzeyde " +
      "Bulgaristan'a 88 kilometre, batıda Yunanistan'a 204 kilometre sınırı olan, Türkiye'nin " +
      'iki komşu ülkeye birden kara sınırı bulunan illerinden biridir.',
    hydrographyNoteTr:
      'Edirne, Meriç, Tunca, Arda ve Ergene nehirlerinin buluştuğu bir il merkezine sahiptir. ' +
      "Meriç Nehri, Bulgaristan'daki Rila Dağı eteklerinden doğar; Edirne'de " +
      'Türkiye-Yunanistan sınırını 185 kilometre boyunca çizdikten sonra Enez yakınlarında ' +
      "Ege Denizi'ne dökülür. Bulgaristan'dan gelen Tunca Nehri, kent merkezinde Meriç'e " +
      "katılır. Ergene Nehri ise Bulgaristan'dan değil, komşu Tekirdağ'ın Saray ilçesi " +
      'çevresinden doğar; il sınırları içinde yaklaşık 72 kilometre akan nehir, aşağı ' +
      "havzadaki sanayi ve yerleşim kirliliği nedeniyle 2011'den bu yana bir devlet eylem " +
      'planı kapsamındadır.\n\n' +
      "İlin güneyinde, Enez ve İpsala ilçeleri sınırlarındaki Gala Gölü, 2005'te Türkiye'nin " +
      '36. milli parkı ilan edilmiştir; 6.090 hektarlık alanın 3.090 hektarı sulak alan, ' +
      'kalanı Hisarlı Dağı eteklerindeki ormandır. İçme suyu ihtiyacı, kent merkezinin 36 ' +
      "kilometre kuzeydoğusundaki Süloğlu Barajı ile Kadıköy Barajı'ndan karşılanır.",
    hydrographyFeatures: [
      { name: 'Meriç Nehri', type: HydrographyFeatureType.Nehir },
      { name: 'Tunca Nehri', type: HydrographyFeatureType.Nehir },
      { name: 'Ergene Nehri', type: HydrographyFeatureType.Nehir },
      { name: 'Gala Gölü', type: HydrographyFeatureType.Gol },
      { name: 'Süloğlu Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Kadıköy Barajı', type: HydrographyFeatureType.Baraj },
    ],
    urbanizationRate: 77.06,
    netMigrationRate: 2.4,
    settlementNoteTr:
      "Edirne'de büyükşehir statüsü bulunmadığı için TÜİK'in il/ilçe merkezi nüfus oranı " +
      "gerçek bir kentleşme düzeyini yansıtır: 2025 verilerine göre nüfusun %77,06'sı il ve " +
      'ilçe merkezlerinde yaşıyor. 2024 yılında 17.332 kişi aldı, 16.323 kişi verdi; net göç ' +
      "hızı binde +2,40'tır.",
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,4',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
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
    // ── Kırklareli deep content (wave-2). Neolitik Aşağıpınar Höyüğü + Yıldız Dağları/İğneada
    //    longoz ormanı. hydrographyFeatures BİLİNÇLİ olarak TEK maddeye indirildi (İstanbul
    //    su-transferi iddiası doğrulanamadı). NON-büyükşehir: urbanizationRate=74.04, genuine.
    landformNoteTr:
      'İlin kuzeyini, Bulgaristan sınırı boyunca uzanan Yıldız Dağları (Istrancalar) kaplar; ' +
      "bu kütledeki, Pınarhisar'a bağlı Evciler köyü ile Vize'ye bağlı Sergen kasabası " +
      'arasındaki Mahya Tepesi, 1.031 metreyle ilin en yüksek noktasıdır. En alçak kesim, ' +
      'Karadeniz kıyısında 10 metreye kadar iner. Kuzeydeki dağlık kuşak ile güneydeki ' +
      'Ergene Ovası arasında, il topraklarının büyük bölümünü oluşturan tepelik ve platoluk ' +
      'bir geçiş kuşağı yer alır.\n\n' +
      "Demirköy ilçesinde, Yıldız Dağları'nın Karadeniz'e indiği kesimde bulunan İğneada " +
      "Longoz Ormanları, 2007'de 3.155 hektarlık bir alanda milli park ilan edilmiştir; tatlı " +
      've tuzlu suyun iç içe geçtiği bu taşkın ormanı, altı gölü ve kıyı kumullarıyla dünyada ' +
      'benzerine az rastlanan bir ekosistemdir.',
    introTr:
      "Kırklareli'nin güneyinde yer alan Aşağıpınar Höyüğü, arkeolog Mehmet Özdoğan'ın " +
      "1993'te başlattığı kazılarla MÖ 6200'e tarihlenen bir yerleşim katmanı ortaya çıkardı; " +
      "araştırmacılar, tarımın Anadolu'dan Trakya üzerinden Avrupa'ya bu güzergâhtan " +
      "yayıldığını öne sürer. İl, kuzeyde 159 kilometrelik bir sınırla Bulgaristan'a, doğuda " +
      "58 kilometrelik bir kıyı şeridiyle Karadeniz'e komşudur. Resmi deprem bölgesi " +
      'sınıflamasında il, dördüncü (en düşük riskli) derece kuşakta yer alır.',
    hydrographyNoteTr:
      "İlin başlıca su yapısı, Şeytan Deresi üzerindeki Kırklareli Barajı'dır; sulama, taşkın " +
      "koruma ve içme suyu amacıyla işletilir. Trakya'nın turizme açılan tek mağarası olan " +
      'Dupnisa, Demirköy ilçesinde, birbirine bağlı kuru ve sulu galerilerden oluşan çok ' +
      'katlı bir karstik sistemdir.',
    hydrographyFeatures: [{ name: 'Kırklareli Barajı', type: HydrographyFeatureType.Baraj }],
    urbanizationRate: 74.04,
    netMigrationRate: 3.0,
    settlementNoteTr:
      "Kırklareli'de büyükşehir statüsü bulunmadığından TÜİK'in il/ilçe merkezi nüfus oranı " +
      "gerçek bir kentleşme düzeyi gösterir: 2025 verilerine göre nüfusun %74,04'ü il ve ilçe " +
      'merkezlerinde yaşıyor. 2024 yılında 15.265 kişi aldı, 14.128 kişi verdi; net göç hızı ' +
      "binde +3,00'dür.",
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,5',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
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
    // ── Kocaeli deep content (wave-2). İzmit Körfezi/KAF kuzey kolu + 1999 depremi (Kandilli
    //    7,4 / USGS 7,6 çift-rakam, ulusal toll bir ARALIK: 17.480-18.373). Kişi başına GSYH
    //    ulusal #2 introTr'da. Büyükşehir: urbanizationRate=100 = 6360 artifact.
    landformNoteTr:
      "İlin kuzeyi İzmit Körfezi'nin kıyı şeridinden oluşur; körfez, kuzeyindeki Kocaeli " +
      'Yarımadası ile güneyindeki Samanlı Dağları arasında uzanan tektonik bir çöküntüdür. ' +
      'Samanlı Dağları, ilin güneyinde Kartepe ve çevresinde 1.500 metreyi aşan bir kütle ' +
      'halinde yükselir. İlin tek Karadeniz kıyısı, 52 kilometrelik bir şeritle Kandıra ' +
      'ilçesindedir; buradaki Babadağı 400 metreye ulaşır.\n\n' +
      "Kuzey Anadolu Fayı'nın kuzey kolu, İzmit Körfezi'nin altından geçer. 17 Ağustos " +
      "1999'da merkez üssü Gölcük olan bir deprem meydana geldi; büyüklüğü Kandilli " +
      "Rasathanesi'ne göre 7,4, ABD Jeoloji Araştırmaları Kurumu'na (USGS) göre 7,6 olarak " +
      'ölçüldü. Deprem, ülke genelinde resmi kayıtlara göre 17.480 ile 18.373 arasında ' +
      "değişen sayıda kişinin ölümüne yol açtı; bunların büyük bölümü Kocaeli'nde yaşanmıştır.",
    introTr:
      "Kocaeli, İzmit Körfezi kıyısında, Marmara Bölgesi'nin sanayi ağırlıklı kesiminde " +
      "kuruludur. İlin adı, 14. yüzyılda Orhan Gazi'nin oğlu Süleyman Paşa'nın bölgeyi sancak " +
      "beyi olarak yönettiği döneme dayanır; 1888'de bağımsız bir sancak haline gelmiştir. " +
      "2024 yılında kişi başına gayrisafi yurt içi hasılada İstanbul'un ardından ikinci " +
      "sırada yer aldı — TÜİK'in rakamlarına göre Ankara'yı yalnızca 14 liralık bir farkla " +
      'geride bırakarak.',
    hydrographyNoteTr:
      'İlin su kaynaklarının merkezinde İzmit Körfezi yer alır; körfezin kıyısında kurulu ' +
      'olan İzmit ile Gölcük, Değirmendere ve Karamürsel ilçeleri kıyı şeridini paylaşır. ' +
      "İlin doğu sınırında, Sapanca Gölü'nün küçük bir bölümü Kocaeli topraklarında kalır; " +
      'gölün büyük bölümü komşu Sakarya ilindedir.\n\n' +
      "İçme suyu ihtiyacının büyük bölümü Yuvacık Barajı'ndan karşılanır; baraj, Kocaeli, " +
      'Sakarya ve Bursa sınırları içindeki 258 kilometrekarelik bir havzadan beslenir. ' +
      'Namazgâh Barajı, ilin diğer önemli içme suyu kaynağıdır. Kentin su ihtiyacı ' +
      "yükseldiğinde, Yuvacık'tan Sapanca Gölü'ne suyun geri pompalandığı bir sistem de " +
      'devreye girer.',
    hydrographyFeatures: [
      { name: 'Yuvacık Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Namazgâh Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Sapanca Gölü', type: HydrographyFeatureType.Gol },
    ],
    urbanizationRate: 100.0,
    netMigrationRate: 8.11,
    settlementNoteTr:
      "Kocaeli'nde de TÜİK'in il/ilçe merkezi nüfus oranı %100'dür — büyükşehir statüsündeki " +
      "illerde belde ve köylerin idari tüzel kişiliğinin 6360 sayılı Kanun'la kaldırılmasının " +
      'bir sonucudur, ilin fiilen tamamen kentleştiği anlamına gelmez. 2024 yılında 80.804 ' +
      'kişi aldı, 63.593 kişi verdi; net göç hızı binde +8,11 ile sanayi istihdamının çektiği ' +
      'net bir göç kazancına işaret ediyor.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%3,8',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
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
    // ── Sakarya deep content (wave-2). Ad nehirden gelir (savaştan DEĞİL) + Adapazarı 1999
    //    zemin sıvılaşması (Kocaeli'nin fay-yakınlığından kasıtlı farklı) + tektonik Sapanca
    //    Gölü. Büyükşehir: urbanizationRate=100 = 6360 artifact.
    landformNoteTr:
      "Sakarya'nın tek dağlık kesimi, Köroğlu Dağları'nın batı uzantısı olan Samanlı " +
      "Dağları'dır; ilin en yüksek noktası bu kütledeki 1.543 metrelik Keremali Dağı'dır. " +
      'İlin yüzölçümünün büyük bölümünü ise ovalar oluşturur: 650 kilometrekarelik Adapazarı ' +
      'Ovası ilin en büyük düzlüğüdür, güneydoğuda kalan Pamukova Ovası ise yaklaşık 170 ' +
      'kilometrekaredir.\n\n' +
      "İl, Kuzey Anadolu Fayı'nın kuzey kolu üzerindedir. 17 Ağustos 1999 depreminde " +
      "Adapazarı, alüvyonlu zemini ve yüksek yeraltı su seviyesi nedeniyle Türkiye'nin " +
      'mühendislik literatüründe zemin sıvılaşmasının en ağır görüldüğü yerleşim olarak kayda ' +
      'geçti — bina hasarının önemli bir bölümü doğrudan fay kırığından değil, bu zemin ' +
      "sıvılaşmasından kaynaklandı. Aynı yılın 12 Kasım'ında, komşu Düzce'de merkezlenen " +
      'ikinci bir deprem ilin doğu kesimini de etkiledi.',
    introTr:
      "Sakarya, adını ilin ortasından geçen Sakarya Nehri'nden alır. Sık karıştırılan 1921 " +
      'Sakarya Meydan Muharebesi, bugünkü Ankara sınırları içinde, Polatlı ile Haymana ' +
      "arasında yaşanmıştır. İl, Adapazarı'nın 17 Haziran 1954'te kabul edilen bir yasayla " +
      'ayrı bir il merkezi haline getirilmesiyle kuruldu; yeni ilin sınırları o dönem Akyazı, ' +
      'Geyve, Hendek ve Karasu ilçelerini kapsıyordu.',
    hydrographyNoteTr:
      "Sakarya Nehri, Türkiye'nin üçüncü uzun akarsuyu olup toplam 824 kilometrelik " +
      'uzunluğunun yaklaşık 159,5 kilometresi il sınırları içinden geçer; Mudurnu Çayı ve ' +
      "Sapanca Gölü'nü boşaltan Çark Suyu ile birleştikten sonra Karasu ilçesinden Karadeniz'e " +
      'dökülür.\n\n' +
      "Sapanca Gölü, Kuzey Anadolu Fayı'nın kuzey kolu üzerinde bir çöküntü havzasında " +
      "oluşmuş, 47 kilometrekarelik bir göldür; Prof. Dr. Sırrı Erinç'in 156 noktada yaptığı " +
      'ölçümlere göre en derin noktası 61 metredir. Göl yüzeyi deniz seviyesinden yalnızca ' +
      '30-31 metre yukarıdadır, taban kotu ise deniz seviyesinin altına iner. İlin sulama ve ' +
      "içme suyu ihtiyacının bir bölümü, Pamukova ilçesindeki Çilekli Barajı'ndan karşılanır.",
    hydrographyFeatures: [
      { name: 'Sakarya Nehri', type: HydrographyFeatureType.Nehir },
      { name: 'Sapanca Gölü', type: HydrographyFeatureType.Gol },
      { name: 'Çark Suyu', type: HydrographyFeatureType.Nehir },
      { name: 'Pamukova Çilekli Barajı', type: HydrographyFeatureType.Baraj },
    ],
    urbanizationRate: 100.0,
    netMigrationRate: 5.97,
    settlementNoteTr:
      "Büyükşehir statüsündeki illerde olduğu gibi Sakarya'nın da TÜİK il/ilçe merkezi nüfus " +
      "oranı %100 görünür; bu, belde ve köylerin idari tüzel kişiliğinin 6360 sayılı Kanun'la " +
      'kaldırılmasının bir sonucudur, ilin fiilen tamamen kentleştiği anlamına gelmez. 2024 ' +
      'yılında 37.116 kişi aldı, 30.501 kişi verdi; net göç hızı binde +5,97 ile pozitif bir ' +
      'dengeye işaret ediyor.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,2',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
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
    // ── Tekirdağ deep content (wave-2). Trakya bağcılık merkezi (Şarköy %89) + Ganos Fayı/1912
    //    Mürefte depremi. Kadıköy Barajı BİLİNÇLİ olarak listede DEĞİL (Edirne'ye ait). Büyükşehir:
    //    urbanizationRate=100 = 6360 artifact. netMigrationRate national #2 (+13.09 ‰, Yalova sonrası).
    landformNoteTr:
      "İlin dağlık omurgasını, Kumbağ'dan Gelibolu berzahına kadar yaklaşık 60 kilometre " +
      'uzanan Tekir Dağları oluşturur; bu sıradağın en yüksek noktası, 945 metrelik Ganos ' +
      "(Işıklar) Dağı'dır. İl, kuzeyde Yıldız Dağları'nın güney eteklerine, güneyde Ganos ve " +
      "Koru dağlarına yaslanır; bu iki kuşak arasında kalan orta kesim, Ergene Havzası'nın su " +
      'bölümü çizgisini oluşturur.\n\n' +
      "Ganos Fayı, Kuzey Anadolu Fayı'nın Marmara Denizi'nden karaya çıktığı Şarköy-Gaziköy " +
      "kesiminden geçer. 9 Ağustos 1912'de merkez üssü Mürefte olan, büyüklüğü akademik " +
      'kaynaklara göre 7,4 olan bir deprem meydana geldi; resmi deprem bölgesi haritasında ' +
      'bugün de Şarköy ve Mürefte en yüksek risk derecesinde, il merkezi bir alt derecede ' +
      'sınıflandırılır.',
    introTr:
      "Tekirdağ, Trakya'nın bağcılık merkezidir: 2024 tarım verilerine göre ildeki şaraplık " +
      "üzüm alanının %89'u tek başına Şarköy ilçesinde yer alır. İl, 2024 TÜİK göç " +
      "istatistiklerinde Yalova'nın ardından Türkiye'nin en yüksek ikinci net göç hızına " +
      "ulaştı. Marmara Denizi kıyısında, İstanbul'a en yakın komşu illerden biri olarak sanayi " +
      've tarımın iç içe geçtiği bir yapı taşır.',
    hydrographyNoteTr:
      'İlde büyük bir akarsu yoktur; kıyıya dökülen Işıklar, Bağlar, Kovan, Ova ve Gölcük ' +
      "dereleri ilin başlıca su yollarıdır. Şarköy ilçesinde, 2021'de inşaatına başlanan " +
      'Eriklice Barajı tamamlandığında bölgenin sulama ve içme suyu ihtiyacının bir bölümünü ' +
      'karşılayacaktır; bu arada Malkara ve Şarköy çevresindeki küçük göletler tarımsal ' +
      'sulamayı destekler.',
    hydrographyFeatures: [
      { name: 'Eriklice Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Işıklar Deresi', type: HydrographyFeatureType.Nehir },
    ],
    urbanizationRate: 100.0,
    netMigrationRate: 13.09,
    settlementNoteTr:
      "Tekirdağ'da da büyükşehir statüsünün getirdiği yapısal sonuç geçerlidir: TÜİK il/ilçe " +
      "merkezi nüfus oranı %100'dür, çünkü belde ve köylerin idari tüzel kişiliği 6360 sayılı " +
      "Kanun'la kaldırılmıştır. 2024 yılında 53.439 kişi aldı, 37.996 kişi verdi; net göç " +
      "hızı binde +13,09 ile Yalova'nın ardından Türkiye'nin en yüksek ikinci net göç hızına " +
      'ulaştı.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,6',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
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
    // ── Yalova deep content (wave-2). Türkiye'nin en küçük ili (798 km²) + 1995 kuruluşu +
    //    1999 ağır hasarı. NON-büyükşehir: urbanizationRate=72.35, genuine rate — no 6360 note.
    //    netMigrationRate is the NATIONAL #1 (+15.59 ‰, all 81 il), asserted in settlementNoteTr.
    landformNoteTr:
      "İlin büyük bölümü, güneyde Samanlı Dağları'nın uzantılarıyla kaplı dağlık bir " +
      'arazidir; doğuda kalan kıyı kesimi ise düzlüktür. İlin en yüksek noktası, 926 metrelik ' +
      "Beşpınar Tepesi'dir. Marmara Denizi kıyısı, kumluk plajlarla kaplı 105 kilometrelik " +
      'bir şerit oluşturur; Çınarcık ve Esenköy çevresinde bu şerit yer yer çakıllı bir ' +
      'kıyıya dönüşür.\n\n' +
      "İl, Kuzey Anadolu Fayı'nın Marmara Denizi altından geçen kollarına yakın konumdadır. " +
      '17 Ağustos 1999 depreminde Yalova ağır hasar gördü; ilde 33.708 konut ve işyeri ' +
      'hasarlı bulundu, en ağır yıkım kent merkezindeki Bahçelievler ile Çiftlikköy ve ' +
      "Çınarcık'taki yazlık yerleşimlerde yaşandı.",
    introTr:
      "Yalova, 798 kilometrekarelik yüzölçümüyle Türkiye'nin en küçük ilidir. İl, 5 Haziran " +
      "1995'te yürürlüğe giren bir kanun hükmünde kararnameyle 77. il olarak kuruldu; o " +
      "tarihe kadar 1930'dan beri İstanbul'un bir ilçesiydi. Kuruluşla birlikte Armutlu " +
      "ilçesi Bursa'dan, Altınova ise Kocaeli'nden Yalova'ya bağlandı.",
    hydrographyNoteTr:
      "İlin en büyük akarsuyu, Samanlı Dağları'ndan doğan ve yıllık yaklaşık 120 milyon " +
      "metreküp su taşıyan 40 kilometrelik Sellimandıra Deresi'dir. Altınova ilçesinde " +
      "Yalakdere, Hersek Deltası'nı oluşturarak denize ulaşır. Çınarcık'taki Delmece Yaylası " +
      'yakınında yer alan Dipsiz Göl, ilin doğal gölüdür.\n\n' +
      "İçme suyu, 1988'de tamamlanan Gökçe Barajı'ndan karşılanır; barajın suyu Termal " +
      "beldesi yakınından alınır. Armutlu'daki Sarpdere Barajı ise 2017'de tamamlanmış, " +
      'öncelikli olarak sulama amacıyla işletilen küçük bir barajdır.',
    hydrographyFeatures: [
      { name: 'Gökçe Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Sarpdere Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Sellimandıra Deresi', type: HydrographyFeatureType.Nehir },
      { name: 'Dipsiz Göl', type: HydrographyFeatureType.Gol },
    ],
    urbanizationRate: 72.35,
    netMigrationRate: 15.59,
    settlementNoteTr:
      "Yalova, büyükşehir olmayan bir il olduğu için TÜİK'in il/ilçe merkezi nüfus oranı " +
      "burada %100'ün altındadır: 2025 verilerine göre nüfusun %72,35'i il ve ilçe " +
      'merkezlerinde, kalanı belde ve köylerde yaşıyor. 2024 yılında 17.812 kişi aldı, 13.049 ' +
      "kişi verdi; net göç hızı binde +15,59 ile Türkiye'nin 81 ili arasında en yüksek değere " +
      'ulaştı.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,3',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
];

/**
 * BATCH 2 — WAVE 3 il seed data — Ege Bölgesi (7 il, İzmir hariç): Afyonkarahisar,
 * Aydın, Denizli, Kütahya, Manisa, Muğla, Uşak. (İzmir is Ege's 8th province but is
 * already seeded in PILOT_PROVINCES, so it is not repeated here.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROVENANCE (traceability — CONVENTIONS §4: no sourceless facts)
 * ─────────────────────────────────────────────────────────────────────────────
 * SOURCE OF RECORD: NOVA's researched draft, INDEPENDENTLY fact-checked by a
 *   different actor — verdict "7/7 VERIFIED, ZERO deviations, the cleanest wave
 *   yet" (population/area/district/elevation-coordinate/Köppen/MGM-station/neighbours
 *   each re-derived from its Tier-1 source in a second session and matched exactly).
 *   • Draft:       Owner's Inbox/data-source-groundwork/batch2-wave3-ege.md
 *   • Fact-check:  Owner's Inbox/data-source-groundwork/batch2-wave3-factcheck.md
 *   • Ledger:      data-provenance.md (root) — Batch 2 — Dalga 3
 *   • Repo snapshot: docs/data-provenance-batch2-wave3.md
 * Per-field Tier-1 authorities (same as pilot-5 / wave-1 / wave-2):
 *   • Nüfus (31.12.2025)          → TÜİK ADNKS 2025, bülten 53899 (VERIFIED, 7/7)
 *   • Yüzölçümü (km²)             → Harita Genel Müdürlüğü (VERIFIED, 7/7)
 *   • İlçe sayısı                 → İçişleri Bakanlığı e-İçişleri (VERIFIED, 7/7)
 *   • Rakım + koordinat (il mrk.) → MGM il-merkez istasyonu (VERIFIED, 7/7)
 *   • Köppen iklim                → MGM 2023 Köppen raporu, s.11-15 (5 Csa + 1 Cfa + 1 Csb)
 *   • Komşu iller                 → Tier-2, full 81-il GeoJSON adjacency scan (7/7 VERIFIED)
 *
 * KÖPPEN — MIXED, THREE CLASSES THIS WAVE (fact-check §A.5, the batch's highest-risk
 *   check): 5/7 are Csa, **Afyonkarahisar is Cfa** (KOPPEN_CFA constants, same as
 *   wave-2's Kocaeli/Sakarya), and **Kütahya is Csb** — the platform's THIRD Köppen
 *   class, carrying the new KOPPEN_CSB constants above. Each was read on its own MGM
 *   `koppen.pdf` row (s.11 / s.14), not copied from a neighbour. No province-specific
 *   Thornthwaite/Erinç divergence is appended for any of the 7 — the source
 *   deliberately did not research that alternative for this wave.
 *
 * MGM default-station note (fact-check §A.4): for Aydın, Denizli and Manisa the
 *   canonical MGM il-merkezi station is NOT a plain "Merkez" record —
 *   Aydın→"Merkez" is a confirmed ALIAS of Efeler (same station, identical
 *   elevation/coordinate — no data conflict), Denizli→Pamukkale and Manisa→Yunusemre
 *   are the page-load defaults for those büyükşehir provinces (which no longer have a
 *   district named "Merkez"; Manisa's separate legacy "Merkez" record carries a
 *   different, unresolved longitude and is NOT the default). Muğla→Menteşe is simply
 *   the official merkez-district name since 2012. Recorded inline on each `elevationM`.
 *
 * NEIGHBOURS — the fact-check ran a full 81-province GeoJSON adjacency scan (not just
 *   spot-checks) and confirmed every list exactly as drafted. Two non-obvious results
 *   verified: Denizli does NOT border Isparta (Burdur intrudes, ~17.5 km gap — Isparta
 *   EXCLUDED), and Manisa DOES border Denizli (0.00 km shared border via Sarıgöl/Çivril,
 *   despite looking separated on a coarse map).
 *
 * WAVE-3 DEEP CONTENT — TIERED (the platform's FIRST tiered depth batch, DEC 2026-07-11
 *   "Tiered deep-content depth"): each of the 7 il now carries the PR-5a detail-section
 *   fields from NOVA's independently fact-checked "Dalga 3" deep-content draft (verdict
 *   SEED-READY WITH CORRECTIONS — all five corrections applied before seeding). Depth is
 *   split by population, NOT uniform:
 *     • Tier-A (nüfus ≥1M — Manisa 45, Aydın 09, Denizli 20, Muğla 48): the SAME full
 *       8-field set as İstanbul/wave-1 (introTr, landformNoteTr, hydrographyNoteTr,
 *       hydrographyFeatures, urbanizationRate, netMigrationRate, settlementNoteTr,
 *       economyIndicator). urbanizationRate=100.00 is the 6360-Kanun büyükşehir artifact,
 *       framed in settlementNoteTr (all four büyükşehir since 2014).
 *     • Tier-B (nüfus <1M — Afyonkarahisar 03, Kütahya 43, Uşak 64): a 6-field set only
 *       (introTr, landformNoteTr, hydrographyNoteTr, urbanizationRate, netMigrationRate,
 *       economyIndicator). `hydrographyFeatures` AND `settlementNoteTr` are DELIBERATELY
 *       OMITTED — an owner-approved permanent scope cut for the <1M il, NOT "not authored
 *       yet". The keys are absent (never a bare null/[] in this file); withExplicitDetailNulls
 *       normalises the omission to null at seed time. These are also the platform's FIRST
 *       non-büyükşehir il, so their urbanizationRate is a REAL rate (62.20 / 74.57 / 77.11),
 *       carrying NO 6360 methodological note — the structural pattern of the ~51 non-metropolitan
 *       il to come, the mirror image of wave-1's uniform %100.
 *   Each il is written to its OWN geographic character (Manisa: Spil/Gediz grabeni; Aydın:
 *   Büyük Menderes grabeni; Denizli: Pamukkale/Honaz; Muğla: karstik parçalı kıyı; Afyon:
 *   kapalı havza/termal; Kütahya: çini/plato; Uşak: least-populous/İç Ege) — NOT a
 *   palette-swapped copy. No factual value invented or altered; every number/name is
 *   transcribed verbatim from the fact-checked draft. No schema/DTO/OpenAPI change (every
 *   field exists since the İstanbul pilot).
 *   • Content:     Owner's Inbox/il-detay-genisletme/wave3-ege-deep-content-draft.md
 *   • Style rules: CONTENT-STYLE.md (orchestrator root — binding for shipped prose)
 *   • Fact-check:  Owner's Inbox/il-detay-genisletme/wave3-ege-deep-content-factcheck.md
 *   • Ledger:      data-provenance.md (root) §4.7 — "İl Detay Sayfası — Derinlik İçerik Dalga 3"
 * DELIBERATELY NULL — every OTHER Batch 2 province keeps landformNoteTr AND all PR-5a
 *   detail-section fields null until its own content batch clears an independent fact-check
 *   (owner priority ruling, DEC 2026-07-10) — an unverified fact stays absent, never invented.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const BATCH2_WAVE3_PROVINCES: readonly ProvinceSeed[] = [
  {
    plateCode: '03',
    nameTr: 'Afyonkarahisar',
    slugTr: 'afyonkarahisar',
    slugEn: 'afyonkarahisar',
    region: GeographicRegion.Ege,
    population: 751_808,
    populationYear: POPULATION_YEAR,
    areaKm2: 14_016,
    districtCount: 18,
    elevationM: 1034, // MGM Merkez istasyonu
    latitude: 38.738,
    longitude: 30.5604,
    // Eskişehir=26, Kütahya=43, Uşak=64, Denizli=20, Burdur=15, Isparta=32, Konya=42
    // (7 komşu — bu dalganın Kütahya ile birlikte en çok komşulu ili)
    neighborPlateCodes: ['26', '43', '64', '20', '15', '32', '42'],
    // Cfa — MGM'nin kendi tablosunda Csa DEĞİL (fact-check §A.5 VERIFIED, s.11)
    climateKoppen: KOPPEN_CFA,
    climateClassTr: CLIMATE_CLASS_CFA_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_CFA_TR,
    // ── Afyonkarahisar deep content (wave-3 Tier-B). The tiered 6-field set from the
    //    fact-checked "Dalga 3" draft: introTr + (shortened) landformNoteTr + hydrographyNoteTr +
    //    urbanizationRate + netMigrationRate + economyIndicator. `hydrographyFeatures` AND
    //    `settlementNoteTr` are DELIBERATELY OMITTED (owner-approved Tier-B scope, DEC 2026-07-11
    //    — a permanent design cut for <1M-nüfus il, NOT "not authored yet"): the keys are absent,
    //    normalised to null against the DB by withExplicitDetailNulls. NOTE: urbanizationRate=62.20
    //    is a REAL urbanization rate — Afyonkarahisar is NOT a büyükşehir, so this is the platform's
    //    first non-100 rate and carries no 6360 methodological note. GSYH share %0,6.
    landformNoteTr:
      'İl toprakları, yüksekliği çoğu yerde 1.000 metreyi aşan bir yayla görünümündedir; kuzeyde ' +
      'Ağın Dağı, doğuda Emir Dağları, güneydoğuda Sultan Dağları, güneyde Kumalar Dağı, ' +
      'güneybatıda Akdağ ve batıda Ahır Dağları ili çevreler. Dağlık kesimlerin arasında Afyon, ' +
      'Şuhut, Sandıklı ve Sincanlı gibi tektonik-karstik kökenli verimli ovalar yer alır. Bölgenin ' +
      'genç volkanik geçmişi, kalker ve traverten oluşumlarının yanı sıra ildeki çok sayıda termal ' +
      'kaynağın da kökenini oluşturur.',
    introTr:
      'Afyonkarahisar, İç Ege ile İç Anadolu arasındaki geçiş kuşağında, ortalama 1.000-1.500 ' +
      'metre yükseklikteki bir yayla görünümündedir. İl, kaplıca ve termal turizmiyle tanınır; ' +
      'Sandıklı, Gazlıgöl ve Heybeli gibi jeotermal sahalar bu zenginliğin başlıca kaynaklarıdır. ' +
      'Kent merkezinin ortasında yükselen volkanik kayalık üzerindeki Afyonkarahisar Kalesi, ilin ' +
      'adını da bu kayalıktan (Kara Hisar) almasını sağlayan tarihî simgesidir.',
    hydrographyNoteTr:
      "Afyon Ovası, dışarıya su akışı olmayan kapalı bir havzadır; Ahır Dağı'nın kuzey " +
      "yamaçlarından doğan Akarçay, ovayı kateder ve Eber Gölü'ne dökülür. Eber Gölü, 150 km²'lik " +
      "yüzölçümüyle Türkiye'nin 12. büyük gölüdür; Akşehir Gölü ile birlikte Sultan Dağları ile " +
      'Emir Dağları arasındaki çöküntü alanında yer alır. İlin kuzeydoğusundaki Bayat ilçesi, ' +
      "Sakarya Nehri'nin kollarından birinin doğduğu yükseltilerden biridir.",
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
    plateCode: '09',
    nameTr: 'Aydın',
    slugTr: 'aydin',
    slugEn: 'aydin',
    region: GeographicRegion.Ege,
    population: 1_172_107,
    populationYear: POPULATION_YEAR,
    areaKm2: 8116,
    districtCount: 17,
    elevationM: 56, // MGM "Merkez" istasyonu = Efeler ile birebir aynı kayıt (idari ilçe adı Efeler; "Merkez" MGM arayüzünde eski/takma ad)
    latitude: 37.8402,
    longitude: 27.8379,
    // İzmir=35, Manisa=45, Denizli=20, Muğla=48 (+ Ege Denizi kıyısı, batı — hariç)
    neighborPlateCodes: ['35', '45', '20', '48'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    // ── Aydın deep content (wave-3 Tier-A). Full 8-field detail set from the fact-checked
    //    "Dalga 3" draft. Büyük Menderes grabeni + Madran Dağı (landform); Büyük Menderes /
    //    Çine Çayı + Çine (Adnan Menderes) barajı + Bafa Gölü (hydrography). urbanizationRate=100
    //    is the 6360 büyükşehir artifact framed in settlementNoteTr; GSYH share %1,0.
    landformNoteTr:
      'Aydın topraklarının büyük bölümü, kuzeyde Aydın Dağları (Messogis) ile güneyde Menteşe ' +
      "Dağları arasında sıkışmış Büyük Menderes Grabeni'nden oluşur; erken Miyosen'den bu yana " +
      'aktif olan bu çöküntü, batıdan doğuya yaklaşık 140 kilometre uzanır. Graben tabanı, ' +
      'Nazilli, Aydın ve Söke ovalarını barındıran ilin en verimli tarım alanıdır.\n\n' +
      'Çine, Bozdoğan ve Yenipazar ilçeleri sınırlarında yükselen 1.792 metrelik Madran Dağı, ' +
      'ilin en yüksek dağlarından biridir; zirvesi Madranbaba adıyla da anılır. İlin kıyı şeridi ' +
      "dar bir alana sıkışır — Kuşadası ve Söke çevresi dışında Aydın'ın karakteri, dağlık iç " +
      'kesim ile geniş graben ovasının bileşimidir.',
    introTr:
      "Büyük Menderes Nehri'nin Aydın topraklarındaki kıvrımlı akışı, İngilizce'deki " +
      '"meander" (kıvrım) sözcüğünün kaynağıdır. ' +
      "İl, Ege Bölgesi'nde nüfus bakımından İzmir ve Manisa'nın ardından üçüncü büyük ildir. Söke " +
      'ilçesindeki Priene ile Karacasu ilçesindeki Aphrodisias antik kentleri ilin arkeolojik ' +
      "zenginliğinin iki ayrı ucunu oluşturur; Aphrodisias 9 Temmuz 2017'de UNESCO Dünya Mirası " +
      "Listesi'ne girmiştir.",
    hydrographyNoteTr:
      "Büyük Menderes Nehri, Afyonkarahisar'ın Dinar ilçesindeki Suçıkan kaynağından doğar ve Uşak " +
      "ile Denizli'den geçtikten sonra Aydın topraklarına girer; burada Nazilli, Aydın ve Söke " +
      "ovalarını sular. Çine ilçesinden gelen Çine Çayı, Koçarlı yakınlarında Büyük Menderes'e " +
      "katılır; nehir son olarak antik Milet kalıntılarına yakın bir noktadan Ege Denizi'ne " +
      'ulaşır.\n\n' +
      "DSİ 21. Bölge Müdürlüğü'nün kayıtlarına göre ildeki barajların en büyüğü, Çine Çayı üzerinde " +
      "2010'da tamamlanan Çine (Adnan Menderes) Barajı'dır; 136,5 metre yüksekliğiyle sulama, " +
      'enerji üretimi ve taşkın koruması amacıyla işletilir. Bozdoğan ilçesindeki Kemer Barajı ' +
      '(1958) ve Topçam Barajı (1985) ilin diğer büyük su yapılarıdır.\n\n' +
      "İlin güneybatısındaki Bafa Gölü, Büyük Menderes'in taşıdığı alüvyonun eski bir Ege koyunu " +
      "denizden ayırmasıyla oluşmuştur; yaklaşık 60 km²'lik yüzeyinin büyük bölümü Aydın'ın Söke " +
      "ilçesinde, doğu kıyıları ise Muğla'nın Milas ilçesinde kalır.",
    hydrographyFeatures: [
      { name: 'Büyük Menderes Nehri', type: HydrographyFeatureType.Nehir },
      { name: 'Çine Çayı', type: HydrographyFeatureType.Nehir },
      { name: 'Çine (Adnan Menderes) Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Kemer Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Topçam Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Bafa Gölü', type: HydrographyFeatureType.Gol },
    ],
    urbanizationRate: 100.0,
    netMigrationRate: 4.31,
    settlementNoteTr:
      "Aydın'da TÜİK'in il/ilçe merkezi nüfus oranı %100'e ulaşır; büyükşehir statüsündeki illerde " +
      'belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı Kanun) bir ' +
      "sonucudur, ilin fiilen tamamen kentleştiği anlamına gelmez. 2024'te Aydın 40.849 kişi aldı, " +
      '35.832 kişi verdi; net göç hızı binde +4,31 oldu.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,0',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    plateCode: '20',
    nameTr: 'Denizli',
    slugTr: 'denizli',
    slugEn: 'denizli',
    region: GeographicRegion.Ege,
    population: 1_060_975,
    populationYear: POPULATION_YEAR,
    areaKm2: 12_134,
    districtCount: 19,
    elevationM: 425, // MGM Pamukkale istasyonu (büyükşehir — ayrı "Merkez" ilçesi yok; kent Merkezefendi+Pamukkale)
    latitude: 37.762,
    longitude: 29.0921,
    // Uşak=64, Afyonkarahisar=03, Burdur=15, Muğla=48, Aydın=09, Manisa=45 —
    // Isparta(32) EXCLUDED: Burdur araya giriyor, ~17,5 km boşluk (fact-check §A.6.1)
    neighborPlateCodes: ['64', '03', '15', '48', '09', '45'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    // ── Denizli deep content (wave-3 Tier-A). Full 8-field detail set from the fact-checked
    //    "Dalga 3" draft. Pamukkale traverten + Honaz Dağı 2.571 m (Ege's highest point) +
    //    Çürüksu grabeni (landform); Büyük Menderes / Çürüksu + Adıgüzel/Cindere barajları +
    //    Işıklı Gölü/Acıgöl (hydrography). urbanizationRate=100 is the 6360 artifact; GSYH %1,0.
    landformNoteTr:
      "Pamukkale'nin beyaz traverten basamakları, yer altından yükselen 35 santigrat derecenin " +
      'üzerindeki kalsiyum bikarbonatlı termal suyun yüzeyde karbondioksit kaybederek kalsiyum ' +
      "karbonatı çökeltmesiyle oluşur; UNESCO'nun kayıtlarına göre alan 1.077 hektarlık bir sahayı " +
      "kaplar ve Orta Pleyistosen'den bu yana biçimlenmektedir.\n\n" +
      'İlin güneyinde, Honaz, Pamukkale ve Serinhisar ilçeleri sınırlarında yer alan Honaz Dağı ' +
      "Milli Parkı'nın 2.571 metrelik zirvesi, Ege Bölgesi'nin en yüksek noktasıdır. İl toprakları, " +
      "kuzeyde Büyük Menderes'in bir kolu tarafından drene edilen Çürüksu Grabeni (Denizli Havzası) " +
      "ile güneydeki dağlık kesimin bileşiminden oluşur; MEB'in il coğrafyası kaynaklarına göre " +
      "yüzölçümünün yaklaşık %47'sini dağlar, %28'ini ovalar oluşturur.",
    introTr:
      "Denizli, dünyaca tanınan traverten teraslarıyla ünlü Pamukkale'nin bulunduğu ildir. " +
      'Pamukkale, kalsiyum karbonatça zengin termal suların basamaklı çökeltileriyle oluşan bu ' +
      "görünümüyle, bitişiğindeki antik Hierapolis kentiyle birlikte 1988'de UNESCO Dünya Mirası " +
      "Listesi'ne alınmıştır. İlin güneyinde yükselen 2.571 metrelik Honaz Dağı, Ege Bölgesi'nin " +
      'en yüksek noktasını oluşturur.',
    hydrographyNoteTr:
      "Büyük Menderes Nehri, Afyonkarahisar'ın Dinar ilçesindeki Suçıkan kaynağından doğduktan " +
      'sonra Denizli topraklarına girer ve Çivril, Çal ve Baklan ovalarını sular. İlin kendi kolu ' +
      'Çürüksu Çayı, Honaz Dağı ve çevresindeki kaynaklardan beslenerek Sarayköy yakınlarında ' +
      "Büyük Menderes'e katılır.\n\n" +
      "DSİ 21. Bölge Müdürlüğü'nün işlettiği barajların en büyüğü, Büyük Menderes üzerinde 1990'da " +
      "tamamlanan Adıgüzel Barajı'dır; sulama, taşkın koruması ve enerji üretimi amacıyla " +
      "kullanılır. Güney ilçesindeki Cindere Barajı ise aynı nehir üzerinde 2007'de tamamlanmış, " +
      'hidroelektrik enerji üretimine ayrılmış bir başka büyük yapıdır.\n\n' +
      "Çivril ilçesindeki Işıklı Gölü, DSİ tarafından 1953'te bir bent inşa edilerek rezervuara " +
      "dönüştürülmüş doğal bir göldür; Büyük Menderes'i Işıklı ve Kufi dereleri aracılığıyla besler " +
      've önemli bir kuş alanı olarak korunur. İlin Afyonkarahisar sınırındaki Acıgöl ise ' +
      "Türkiye'nin büyük tuz göllerinden biridir.",
    hydrographyFeatures: [
      { name: 'Büyük Menderes Nehri', type: HydrographyFeatureType.Nehir },
      { name: 'Çürüksu Çayı', type: HydrographyFeatureType.Nehir },
      { name: 'Adıgüzel Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Cindere Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Işıklı Gölü', type: HydrographyFeatureType.Gol },
      { name: 'Acıgöl', type: HydrographyFeatureType.Gol },
    ],
    urbanizationRate: 100.0,
    netMigrationRate: 0.99,
    settlementNoteTr:
      "Denizli için TÜİK'in il/ilçe merkezi nüfus oranı %100'dür; büyükşehir statüsündeki illerde " +
      'belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı Kanun) bir ' +
      "sonucudur, ilin fiilen tamamen kentleştiği anlamına gelmez. Denizli 2024'te 25.866 kişi " +
      'aldı, 24.816 kişi verdi; net göç hızı binde +0,99 ile dengeye yakın bir değerde kaldı.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,0',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    plateCode: '43',
    nameTr: 'Kütahya',
    slugTr: 'kutahya',
    slugEn: 'kutahya',
    region: GeographicRegion.Ege,
    population: 570_478,
    populationYear: POPULATION_YEAR,
    areaKm2: 11_634,
    districtCount: 13,
    elevationM: 969, // MGM Merkez istasyonu
    latitude: 39.4171,
    longitude: 29.9891,
    // Bursa=16, Bilecik=11, Eskişehir=26, Afyonkarahisar=03, Uşak=64, Manisa=45, Balıkesir=10 (7 komşu)
    neighborPlateCodes: ['16', '11', '26', '03', '64', '45', '10'],
    // Csb — platformun ÜÇÜNCÜ Köppen sınıfı; MGM tablosunda kendi satırında (fact-check §A.5 VERIFIED, s.14)
    climateKoppen: KOPPEN_CSB,
    climateClassTr: CLIMATE_CLASS_CSB_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_CSB_TR,
    // ── Kütahya deep content (wave-3 Tier-B). Tiered 6-field set from the fact-checked "Dalga 3"
    //    draft (introTr + shortened landform/hydrography + urbanizationRate + netMigrationRate +
    //    economyIndicator). `hydrographyFeatures` + `settlementNoteTr` DELIBERATELY OMITTED
    //    (Tier-B scope, DEC 2026-07-11). urbanizationRate=74.57 is a REAL rate (Kütahya is not a
    //    büyükşehir — no 6360 note). GSYH share %0,5. The locked Csb/"Akdeniz iklimi" climate
    //    fields (DEC 2026-07-10) are UNTOUCHED here; no prose below contradicts them.
    landformNoteTr:
      "İl topraklarının yaklaşık %57'sini dağlar, %31'ini platolar, %11'ini ovalar oluşturur; " +
      'ortalama yükseklik 1.200 metredir. Kenti kuzeydoğudan Türkmen Dağı, batıdan Karlık Tepe ve ' +
      'Eğrigöz Dağı (2.181 m), güneybatıdan Şaphane Dağı (2.121 m), güneyden ise ilin en yüksek ' +
      'noktası olan 2.312 metrelik Murat Dağı çevreler. Kütahya Ovası, Simav Ovası ve Altıntaş ' +
      'Ovası bu dağlık çerçeve içindeki başlıca tarım alanlarıdır.',
    introTr:
      'Kütahya, Osmanlı ve Selçuklu döneminden bu yana kesintisiz üretilen çini ve porselen ' +
      'sanatıyla tanınan bir Ege iç kesim ilidir. Ortalama yüksekliği 1.200 metreye ulaşan yayla ' +
      'topraklarının yarıdan fazlası dağlarla kaplıdır. İlin güneyindeki Murat Dağı, hem yüksek ' +
      'zirvesiyle hem de kayak turizmiyle bölgenin öne çıkan yükseltisidir.',
    hydrographyNoteTr:
      "Porsuk Çayı'nın başlangıç kolları, Kütahya-Uşak sınırındaki Murat Dağı'nın kuzey " +
      "yamaçlarından doğar; çay ilin kuzeydoğusundan Eskişehir'e geçer ve orada Porsuk Barajı'nı " +
      "besler. Barajın gövdesi Eskişehir'de yer alır; geniş gölü ise büyük ölçüde Kütahya " +
      'topraklarındadır. İlin tek doğal gölü olan Simav Gölü, Simav ilçesinin kuzeybatısında yer ' +
      "alan, yaklaşık 5 km²'lik tektonik kökenli bir göldür. Simav Çayı, Şaphane Dağları'ndan " +
      "doğar, kuzeye akar ve Marmara Denizi'ne dökülen akarsular arasında en büyüğüdür.",
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
    plateCode: '45',
    nameTr: 'Manisa',
    slugTr: 'manisa',
    slugEn: 'manisa',
    region: GeographicRegion.Ege,
    population: 1_477_756,
    populationYear: POPULATION_YEAR,
    areaKm2: 13_339,
    districtCount: 17,
    elevationM: 71, // MGM Yunusemre istasyonu (büyükşehir — ayrı "Merkez" ilçesi yok; sayfa-yükleme varsayılanı Yunusemre, ayrı legacy "Merkez" kaydı farklı boylam verir ama varsayılan değil)
    latitude: 38.6153,
    longitude: 27.4049,
    // Balıkesir=10, İzmir=35, Kütahya=43, Uşak=64, Aydın=09, Denizli=20 —
    // Manisa-Denizli komşuluğu 0,00 km ortak sınırla GeoJSON'da DOĞRULANDI (fact-check §A.6.2)
    neighborPlateCodes: ['10', '35', '43', '64', '09', '20'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    // ── Manisa deep content (wave-3 Tier-A — see the WAVE-3 DEEP CONTENT note above). The
    //    full 8-field detail set, transcribed from NOVA's fact-checked "Dalga 3" draft.
    //    Spil Dağı milli parkı + Gediz (Alaşehir) grabeni (landform); Gediz Nehri + Demirköprü
    //    barajı + Marmara Gölü (hydrography). urbanizationRate=100 is the 6360 büyükşehir legal
    //    artifact framed in settlementNoteTr; economyIndicator is the 2024 TÜİK GSYH share (%1,5).
    landformNoteTr:
      'İlin güneyinde, kent merkezine yakın konumda yükselen Spil Dağı, 1.513 metrelik zirvesiyle ' +
      "1968'de milli park ilan edilmiştir; 6.860 hektarlık park alanı kireçtaşı kökenli kanyonlar, " +
      'dolinler ve mağaralarla kaplıdır. Antik mitolojide taşa dönüşen Niobe efsanesiyle özdeşleşen ' +
      'kaya oluşumu, park sınırları içindeki Çaybaşı mevkiindedir.\n\n' +
      'Manisa, aktif olarak çöken Gediz (Alaşehir) Grabeni üzerinde yer alır. Grabenin kuzey ' +
      'sınırını oluşturan Bozdağlar horst bloğu üzerinde, ilin en yüksek noktası olan 2.070 ' +
      'metrelik Kumpınar Tepe yükselir. Uydu tabanlı bir jeoloji çalışması, graben tabanının yılda ' +
      'yaklaşık 26 milimetre çöktüğünü, horst bloğunun ise yılda 3 milimetre yükseldiğini ' +
      'ölçmüştür; bu hareketlilik, 1969 Alaşehir depreminden bu yana yüzeyde çatlak ve çökme izleri ' +
      'üretmeyi sürdürüyor.',
    introTr:
      "Manisa, Ege Bölgesi'nde İzmir'in ardından nüfusu en kalabalık ikinci ildir. Kentin " +
      "güneyinde yükselen Spil Dağı ile ilin doğusunu boydan boya kateden Gediz Ovası, Manisa'nın " +
      'yer şekillerini belirleyen iki ana unsurdur. Salihli ilçesindeki Sardes antik kenti — ' +
      "dünyanın ilk sikke parasını basan Lidya Krallığı'nın başkenti — Bin Tepeler Lidya " +
      "Tümülüsleri'yle birlikte 2025'te UNESCO Dünya Mirası Listesi'ne girdi.",
    hydrographyNoteTr:
      "Gediz Nehri, Manisa'nın su ağının omurgasıdır; Manisa Valiliği'nin kayıtlarına göre 386 " +
      'kilometrelik toplam uzunluğunun 204 kilometresi il sınırları içinden geçer. Nehir, Salihli ' +
      "ve Turgutlu ovalarını sulayarak Manisa'nın kendi merkezinden geçer ve İzmir'in Menemen " +
      "ilçesi yakınlarında Ege Denizi'ne ulaşır.\n\n" +
      "İlin en büyük barajı Demirköprü'dür; Gediz üzerinde Salihli yakınında 1954-1960 arasında " +
      'inşa edilmiş, hem sulama hem enerji üretimi amacıyla işletilir. Gördes Çayı üzerindeki ' +
      "Gördes Barajı ise Manisa toprakları içinde yer almasına karşın esas olarak İzmir'in içme " +
      'suyu ihtiyacını karşılamak için işletilir.\n\n' +
      "İlin doğusundaki Marmara Gölü (Gölmarmara), 2017'de Ulusal Öneme Haiz Sulak Alan olarak " +
      'tescillenmiştir; Bin Tepeler Lidya nekropolü gölün güney kıyısında yer alır. Gölün su ' +
      "seviyesi Gördes ve Gediz'den gelen regülatörlerle yönetilir ve kuraklık dönemlerinde " +
      'belirgin biçimde küçülür.',
    hydrographyFeatures: [
      { name: 'Gediz Nehri', type: HydrographyFeatureType.Nehir },
      { name: 'Demirköprü Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Gördes Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Alaşehir Kavaklıdere Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Sarıgöl Buldan Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Marmara Gölü', type: HydrographyFeatureType.Gol },
    ],
    urbanizationRate: 100.0,
    netMigrationRate: 0.22,
    settlementNoteTr:
      "TÜİK'in il/ilçe merkezi nüfus oranı Manisa için de %100'dür — büyükşehir statüsündeki " +
      'illerde belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı Kanun) bir ' +
      'sonucudur, ilin fiilen tamamen kentleştiği anlamına gelmez. Manisa 2024 yılında 37.649 kişi ' +
      'aldı, 37.328 kişi verdi; net göç hızı binde +0,22 ile hemen hemen dengede kaldı.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,5',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    plateCode: '48',
    nameTr: 'Muğla',
    slugTr: 'mugla',
    slugEn: 'mugla',
    region: GeographicRegion.Ege,
    population: 1_099_547,
    populationYear: POPULATION_YEAR,
    areaKm2: 12_654,
    districtCount: 13,
    elevationM: 646, // MGM Menteşe istasyonu (2012'den beri resmî merkez ilçe adı)
    latitude: 37.2095,
    longitude: 28.3668,
    // Aydın=09, Denizli=20, Burdur=15, Antalya=07 (+ Ege/Akdeniz kıyısı — hariç)
    neighborPlateCodes: ['09', '20', '15', '07'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    // ── Muğla deep content (wave-3 Tier-A). Full 8-field detail set from the fact-checked
    //    "Dalga 3" draft. Ege/Akdeniz geçiş kuşağı + parçalı karstik kıyı (landform); Dalaman /
    //    Eşen Çayı + Akköprü barajı + Köyceğiz haliç gölü (hydrography). netMigrationRate=+11,64
    //    is the HIGHEST of the wave's seven; urbanizationRate=100 is the 6360 artifact; GSYH %1,3.
    landformNoteTr:
      "Muğla'nın engebeli kıyı çizgisi iki süreçle biçimlenmiştir: kıyıya yakın kesimde, Akdeniz'e " +
      "özgü kıyıya paralel dağ uzanımı yerini Batı Anadolu'ya özgü kıyıya dik uzanıma bırakır; buna " +
      "ek olarak Üçüncü Zaman sonu ile Dördüncü Zaman'daki yoğun tektonik hareketler, çökme ve " +
      'yükselmelerle yeni koy ve burunlar oluşturmuştur. Fethiye-Katrancı, Göcek ve Datça ' +
      'çevresindeki koylar bu sürecin en belirgin örnekleridir; dağ sıraları yer yer doğrudan ' +
      'denize iner.\n\n' +
      'İl toprakları, Toros kıvrım sistemi ile Batı Anadolu kıvrım sisteminin üst üste bindiği ' +
      'kireçtaşı ağırlıklı, karstik bir arazidir; bu geçirimli yapı yüzeysel akarsu gelişimini ' +
      'sınırlar. Boncuk Dağları, Sandras (Çiçekbaba) Dağı ve Akdağlar ilin başlıca yükseltileridir; ' +
      'en yüksek nokta konusunda kaynaklar arasında kesin bir mutabakat yoktur, Antalya sınırındaki ' +
      'Akdağlar kütlesinde 3.000 metreyi aşan zirveler bildirilir.',
    introTr:
      'Muğla, Ege ve Akdeniz bölgelerinin coğrafi olarak iç içe geçtiği bir geçiş kuşağında yer ' +
      'alır. Bodrum, Marmaris, Datça ve Fethiye yarımadalarıyla parçalanmış kıyı şeridi, yaklaşık ' +
      "1.480 kilometreyle Türkiye'nin en uzun il kıyısını oluşturur. Bu parçalı kıyı yapısı, " +
      "Muğla'nın kıyı turizminin coğrafi temelidir.",
    hydrographyNoteTr:
      'İl topraklarının kalkerli, karstik yapısı yüzeysel akarsu ağının gelişimini sınırlar; Muğla ' +
      "İl Çevre Durum Raporu'na göre ilin başlıca üç akarsuyu Çine Çayı, Eşen Çayı ve Dalaman " +
      "Çayı'dır. Boncuk Dağları'nın kuzey yamaçlarından doğan Dalaman Çayı, 190 kilometrelik toplam " +
      "uzunluğunun 65 kilometresini Muğla sınırları içinde kat eder; Akdağlar'dan beslenen Eşen " +
      'Çayı ise 128 kilometrelik uzunluğunun 80 kilometresini il topraklarında geçirir ve Saklıkent ' +
      "Kanyonu'ndaki karstik kaynaklarla beslenir.\n\n" +
      'Dalaman Çayı üzerindeki Akköprü Barajı, 1995-2012 arasında inşa edilmiş, 384,5 milyon m³ ' +
      "rezervuar hacmiyle, elektrik üretim kapasitesi bakımından Türkiye'nin altıncı büyük " +
      'barajıdır; sulama, enerji üretimi ve taşkın koruması amacıyla işletilir. Milas ilçesindeki ' +
      "Geyik Barajı ise Yeniköy Termik Santrali'ne soğutma suyu sağlamanın yanında Bodrum " +
      "Yarımadası'nın içme suyu ihtiyacının bir bölümünü karşılar.\n\n" +
      "İlin en büyük doğal gölü olan Köyceğiz Gölü, dar bir kanalla Akdeniz'e bağlı bir haliç " +
      "gölüdür; 1988'de özel çevre koruma bölgesi ilan edilmiştir. Gölü denize bağlayan Dalyan " +
      'Kanalı kıyısındaki İztuzu Kumsalı, deniz kaplumbağalarının (Caretta caretta) önemli ' +
      'yumurtlama alanlarından biridir.',
    hydrographyFeatures: [
      { name: 'Dalaman Çayı', type: HydrographyFeatureType.Nehir },
      { name: 'Eşen Çayı', type: HydrographyFeatureType.Nehir },
      { name: 'Akköprü Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Geyik Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Mumcular Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Köyceğiz Gölü', type: HydrographyFeatureType.Gol },
    ],
    urbanizationRate: 100.0,
    netMigrationRate: 11.64,
    settlementNoteTr:
      "Muğla'da TÜİK'in il/ilçe merkezi nüfus oranı %100'dür; büyükşehir statüsündeki illerde belde " +
      've köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı Kanun) bir sonucudur, ilin ' +
      "fiilen tamamen kentleştiği anlamına gelmez. Muğla 2024'te 48.895 kişi aldı, 36.378 kişi " +
      "verdi; net göç hızı binde +11,64 ile Ege'nin bu dalgada incelenen yedi ili arasındaki en " +
      'yüksek pozitif değere ulaştı.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,3',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    plateCode: '64',
    nameTr: 'Uşak',
    slugTr: 'usak',
    slugEn: 'usak',
    region: GeographicRegion.Ege,
    population: 374_405,
    populationYear: POPULATION_YEAR,
    areaKm2: 5555,
    districtCount: 6,
    elevationM: 919, // MGM Merkez istasyonu
    latitude: 38.6712,
    longitude: 29.404,
    // Kütahya=43, Afyonkarahisar=03, Denizli=20, Manisa=45 (4 komşu — bu dalganın en az komşulu ili)
    neighborPlateCodes: ['43', '03', '20', '45'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    // ── Uşak deep content (wave-3 Tier-B). Tiered 6-field set from the fact-checked "Dalga 3"
    //    draft (introTr + shortened landform/hydrography + urbanizationRate + netMigrationRate +
    //    economyIndicator). `hydrographyFeatures` + `settlementNoteTr` DELIBERATELY OMITTED
    //    (Tier-B scope, DEC 2026-07-11). Uşak is the LEAST-populous of the wave's seven il;
    //    urbanizationRate=77.11 is a REAL rate (not a büyükşehir — no 6360 note). GSYH share %0,3.
    landformNoteTr:
      'İl topraklarının büyük bölümünü, ortalama 1.170-1.200 metre yükseklikteki Uşak ve Banaz ' +
      'ovalarını çevreleyen platolar ve dağlar oluşturur. Güneyde, Kütahya sınırındaki Murat ' +
      "Dağı'nın Kartal Tepe zirvesi 2.309 metreyle ilin en yüksek noktalarından biridir. Kuzeyde, " +
      'eski bir volkanik kütle olan Elmadağ (1.805 m) geniş yaylalarıyla dikkat çeker; Ahır Dağı ' +
      '(1.915 m) ilin diğer önemli yükseltisidir.',
    introTr:
      "Uşak, bu dalgada incelenen yedi il arasında nüfusu en az olan ildir ve İç Ege'ye geçiş " +
      'karakteriyle öne çıkar. İl, Osmanlı döneminden bu yana süregelen halı dokumacılığı ' +
      'geleneğiyle tanınır. Kuzeyindeki Elmadağ, ilin en belirgin yer şekillerinden biri olan eski ' +
      'bir volkanik kütledir.',
    hydrographyNoteTr:
      "İlin en önemli akarsuyu, Murat Dağı'ndan doğan ve kuzeyden güneye 165 kilometre akan Banaz " +
      "Çayı'dır; il topraklarını geçtikten sonra Büyük Menderes Nehri'ne katılır. Gediz Nehri'nin " +
      "yukarı kolları da ilin kuzeyinden geçer. DSİ, 2003'ten bu yana Uşak'ta Kozviran, Halaçlar, " +
      'Bahadır ve Karaköse gibi barajlar inşa ederek Banaz ilçesindeki tarım arazilerinin büyük ' +
      'bölümünü sulamaya açmıştır.',
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
];

/**
 * BATCH 2 — WAVE 4 il seed data — Akdeniz Bölgesi (7 il, Antalya hariç): Adana,
 * Burdur, Hatay, Isparta, Kahramanmaraş, Mersin, Osmaniye. (Antalya is Akdeniz's 8th
 * province but is already seeded in PILOT_PROVINCES, so it is not repeated here.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROVENANCE (traceability — CONVENTIONS §4: no sourceless facts)
 * ─────────────────────────────────────────────────────────────────────────────
 * SOURCE OF RECORD: NOVA's researched draft, INDEPENDENTLY fact-checked by a
 *   different actor — verdict "7/7 VERIFIED, ZERO numeric deviations" (population/
 *   area/district/elevation-coordinate/Köppen/MGM-station/neighbours each re-derived
 *   from its Tier-1 source in a second session and matched the draft exactly).
 *   • Draft:       Owner's Inbox/data-source-groundwork/batch2-wave4-akdeniz.md
 *   • Fact-check:  Owner's Inbox/data-source-groundwork/batch2-wave4-factcheck.md
 *   • Ledger:      data-provenance.md (root) — Batch 2 — Dalga 4
 *   • Repo snapshot: docs/data-provenance-batch2-wave4.md
 * Per-field Tier-1 authorities (same as pilot-5 / wave-1 / wave-2 / wave-3):
 *   • Nüfus (31.12.2025)          → TÜİK ADNKS 2025, bülten 53899 (VERIFIED, 7/7)
 *   • Yüzölçümü (km²)             → Harita Genel Müdürlüğü (VERIFIED, 7/7)
 *   • İlçe sayısı                 → İçişleri Bakanlığı e-İçişleri (VERIFIED, 7/7)
 *   • Rakım + koordinat (il mrk.) → MGM il-merkez istasyonu (VERIFIED, 7/7)
 *   • Köppen iklim                → MGM 2023 Köppen raporu, s.11-14 (7/7 = Csa)
 *   • Komşu iller                 → Tier-2, full 81-il GeoJSON scan + Vikipedi (7/7)
 *
 * KÖPPEN — UNIFORM Csa THIS WAVE (fact-check §A.5): 7/7 resolve to Csa, read on each
 *   il's own MGM `koppen.pdf` row (Hatay is represented by its default-station row
 *   "ANTAKYA", s.11 — MGM's table has no "HATAY" line, consistent with MGM's own il/
 *   ilçe tool). No new climate class this wave; all 7 reuse the shared
 *   MGM_KOPPEN_CAVEAT_TR verbatim. No province-specific Thornthwaite/Erinç divergence
 *   is appended — the source deliberately did not research that alternative here.
 *
 * MGM default-station note (fact-check §A.4): for Adana, Hatay and Mersin the
 *   canonical MGM il-merkezi station is NOT "Merkez" (Seyhan / Antakya / Akdeniz —
 *   all three are büyükşehir provinces with no district named "Merkez"; same category
 *   as the pilot's İstanbul→Yeşilköy and wave-2's Bursa→Osmangazi). Burdur, Isparta
 *   and Osmaniye default to "Merkez". Recorded inline on each `elevationM`.
 *
 * KAHRAMANMARAŞ ELEVATION — GLOSSARY §1 EXCEPTION (locked, → Atlas kararı 2026-07-11):
 *   MGM's literal default "Merkez" record for Kahramanmaraş returns elevation = 0 m,
 *   which is physically impossible for this inland/highland province (broken/
 *   unrepresentative reading, verified by NOVA AND the independent fact-check via
 *   direct MGM navigation). Per the GLOSSARY §1 same-coordinate exception, the seeded
 *   value uses MGM's OWN coordinate-identical "Onikişubat" record instead: **572 m**
 *   (latitude/longitude are IDENTICAL to the "Merkez" record — 37.576 / 36.915). This
 *   is NOT an invented value: it is the same authoritative source's working record for
 *   the identical physical location, independently TRIPLE-verified (Onikişubat
 *   Kaymakamlığı's official page confirms ~568 m, consistent). A separate "Dulkadiroğlu"
 *   record (525 m, DIFFERENT coordinate) is a genuinely distinct station and is NOT
 *   used. Vera's il page needs a STRONGER footnote here than the plain rename notes
 *   (Adana/Hatay/Mersin): the shown elevation/coordinate is the Onikişubat record's,
 *   not the literal "Merkez" record's (fact-check §A.4.1 / draft Bölüm 3).
 *
 * NEIGHBOURS — Tier-2, cross-checked (fact-check §A.6, 7/7 VERIFIED via a full 81-il
 *   GeoJSON adjacency scan AND independent Vikipedi text extraction). Non-obvious
 *   results that survived double-verification: Hatay does NOT border Kahramanmaraş
 *   (~0.35° gap; a self-contradicting haberturk article was wrong), Isparta does NOT
 *   border Denizli (Burdur intrudes — mirrors wave-3's Denizli-side finding), and
 *   Adana DOES border both Kayseri and Hatay (a source list had omitted them).
 *   Country/sea adjacencies (Hatay→Suriye, Adana/Mersin/Hatay→Akdeniz kıyısı) are NOT
 *   provinces and are excluded from `neighborPlateCodes`.
 *
 * DEEP CONTENT — TIERED (wave-4, owner-approved tiered depth model, DEC 2026-07-11).
 *   Unlike pilot-5 / wave-1 (uniform full depth), this wave fills the PR-5a detail-page
 *   fields at TWO depths from NOVA's independently fact-checked "Dalga 4" draft (verdict
 *   SEED-READY WITH CORRECTIONS — all applied):
 *     • Tier-A (nüfus ≥1M): Adana, Hatay, Kahramanmaraş, Mersin — the FULL 8-field set
 *       (introTr, landformNoteTr, hydrographyNoteTr + hydrographyFeatures, urbanizationRate,
 *       netMigrationRate, settlementNoteTr, economyIndicator), same rigor as wave-1.
 *     • Tier-B (nüfus <1M): Burdur, Isparta, Osmaniye — a 6-field set; hydrographyFeatures
 *       AND settlementNoteTr are DELIBERATELY OMITTED (a permanent Tier-B scope cut, NOT
 *       "not authored yet"): the keys are absent, normalised to null against the DB by
 *       withExplicitDetailNulls, and asserted null in the e2e suite.
 *   Tier-B also introduces the wave's first NON-100 urbanizationRate values (Burdur 71.04,
 *   Isparta 75.77, Osmaniye 78.24) — these il are NOT büyükşehir, so the rate is real and
 *   carries no 6360 methodological note (contrast the four Tier-A büyükşehir at 100). No
 *   fact is invented here; every value traces to the fact-checked draft.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const BATCH2_WAVE4_PROVINCES: readonly ProvinceSeed[] = [
  {
    plateCode: '01',
    nameTr: 'Adana',
    slugTr: 'adana',
    slugEn: 'adana',
    region: GeographicRegion.Akdeniz,
    population: 2_283_609,
    populationYear: POPULATION_YEAR,
    areaKm2: 13_844,
    districtCount: 15,
    elevationM: 20, // MGM Seyhan istasyonu (büyükşehir — ayrı "Merkez" ilçesi yok; tarihi kent çekirdeği Seyhan)
    latitude: 36.9838,
    longitude: 35.298,
    // Kayseri=38, Kahramanmaraş=46, Osmaniye=80, Hatay=31, Mersin=33, Niğde=51
    // (6 komşu — bu dalganın Kahramanmaraş ile birlikte en çok kara-komşulu ili) (+ Akdeniz kıyısı, güney — hariç)
    neighborPlateCodes: ['38', '46', '80', '31', '33', '51'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    // ── Adana deep content (wave-4 Tier-A). Full 8-field detail set from the fact-checked
    //    "Dalga 4" (Akdeniz) draft. Çukurova alüvyal ovası + Aladağlar (landform); Seyhan/
    //    Ceyhan nehirleri + Seyhan/Çatalan barajları + Akyatan/Tuzla lagünleri (hydrography).
    //    urbanizationRate=100 is the 6360 büyükşehir artifact framed in settlementNoteTr;
    //    netMigrationRate -0.34 ‰ is this wave's closest-to-zero value; GSYH share %2,0.
    landformNoteTr:
      'Adana, yüzölçümünün yaklaşık dörtte birini oluşturan Çukurova ovası ile kuzeyde ' +
      'yükselen Toros dağları arasında ikiye ayrılır. Seyhan, Ceyhan ve Tarsus (Berdan) ' +
      "çaylarının taşıdığı alüvyonlarla dolan Çukurova, Türkiye'nin en geniş ve en verimli " +
      'ovalarından biridir; Misis Tepeleri bu ovayı kuzeydeki Yukarı Ova ile güneydeki asıl ' +
      "Çukurova'ya ayırır.\n\n" +
      "İlin kuzey kesimi, Orta Toroslar'ın bir parçası olan Aladağlar kütlesine uzanır; " +
      'Tufanbeyli, Saimbeyli ve Feke ilçeleri bu dağlık bölgenin içindedir. ' +
      "Aladağlar'ın 3.700 metreyi aşan zirveleri (Demirkazık, Kızılkaya) ağırlıklı olarak " +
      "komşu Niğde tarafında yükselir; Adana'nın kendi sınırları içinde kalan kesimi " +
      "Karanfil Dağı çevresinde 3.000 metrenin üzerine çıkar. Bu yüksek kesimde, 1995'te " +
      'kurulan Aladağlar Milli Parkı yer alır.',
    introTr:
      "Adana, Çukurova'nın ortasında, Seyhan ve Ceyhan nehirlerinin taşıdığı alüvyonlarla " +
      "oluşan geniş bir ovanın üzerinde kuruludur. Nüfus bakımından Türkiye'nin yedinci " +
      'büyük ilidir. Kentin kuzeyi Toros dağlarına, güneyi Akdeniz kıyısına uzanır; bu iki ' +
      "farklı coğrafya, ili Türkiye'nin en önemli tarım ve sanayi merkezlerinden biri " +
      'hâline getirir.',
    hydrographyNoteTr:
      "Adana'nın su ağı, ilin ortasından geçerek Akdeniz'e dökülen Seyhan ve Ceyhan " +
      "nehirlerine dayanır. Seyhan Nehri, Kayseri'nin Uzunyayla bölgesinde doğar ve son 30 " +
      'kilometrelik bölümünde Adana-Mersin il sınırını çizer. Ceyhan Nehri ise 509 ' +
      "kilometre uzunluğuyla bölgenin en uzun akarsuyudur; Kahramanmaraş'ta doğar, " +
      "Adana'nın doğusundan geçerek Akdeniz'e ulaşır.\n\n" +
      "Şehir merkezinin hemen kuzeyinde yer alan Seyhan Barajı, 8 Nisan 1956'da hizmete " +
      'giren ve yaklaşık 850 bin dekar araziyi sulayan bir toprak dolgu barajdır; aynı ' +
      "zamanda Adana'yı Seyhan'ın taşkınlarından korur. Çatalan Barajı ise ASKİ'nin " +
      "Çatalan İçme Suyu Projesi'nin ana kaynağıdır ve kentin içme suyu ihtiyacının büyük " +
      'bölümünü karşılar.\n\n' +
      'İlin güney kıyısında Akyatan ve Tuzla gibi kıyı gölleri (lagünler) yer alır. ' +
      'Akyatan Gölü, deniz kaplumbağalarının yumurtlama alanlarından biridir; göl ile ' +
      "Akdeniz arasında kalan yaklaşık 2.500 hektarlık kumul alan 1960'lardan bu yana " +
      'ağaçlandırılmaktadır.',
    hydrographyFeatures: [
      { name: 'Seyhan Nehri', type: HydrographyFeatureType.Nehir },
      { name: 'Ceyhan Nehri', type: HydrographyFeatureType.Nehir },
      { name: 'Seyhan Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Çatalan Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Akyatan Gölü', type: HydrographyFeatureType.Gol },
      { name: 'Tuzla Gölü', type: HydrographyFeatureType.Gol },
    ],
    urbanizationRate: 100.0,
    netMigrationRate: -0.34,
    settlementNoteTr:
      "Adana'da da, büyükşehir statüsündeki illerin çoğunda olduğu gibi, TÜİK il/ilçe " +
      'merkezi nüfus oranı %100 çıkıyor; bu, belde ve köylerin idari tüzel kişiliğinin ' +
      'kaldırılmasının (6360 sayılı Kanun) bir sonucudur, ilin fiilen tamamen kentleştiği ' +
      'anlamına gelmez. 2024 yılında il 55.342 kişi aldı, 56.108 kişi verdi; net göç hızı ' +
      'binde -0,34 ile bu dalganın sıfıra en yakın değeriydi.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%2,0',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    plateCode: '15',
    nameTr: 'Burdur',
    slugTr: 'burdur',
    slugEn: 'burdur',
    region: GeographicRegion.Akdeniz,
    population: 277_226,
    populationYear: POPULATION_YEAR,
    areaKm2: 7175,
    districtCount: 11,
    elevationM: 957, // MGM Merkez istasyonu
    latitude: 37.722,
    longitude: 30.294,
    // Antalya=07, Denizli=20, Muğla=48, Afyonkarahisar=03, Isparta=32
    neighborPlateCodes: ['07', '20', '48', '03', '32'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    // ── Burdur deep content (wave-4 Tier-B). The tiered 6-field set from the fact-checked
    //    "Dalga 4" draft: introTr + (shortened) landformNoteTr + hydrographyNoteTr +
    //    urbanizationRate + netMigrationRate + economyIndicator. `hydrographyFeatures` AND
    //    `settlementNoteTr` are DELIBERATELY OMITTED (Tier-B scope — see block header), so the
    //    keys are absent and normalise to null against the DB. urbanizationRate=71.04 is a REAL
    //    rate (Burdur is NOT a büyükşehir), no 6360 note; net göç -6,52 ‰ is this wave's most
    //    negative; GSYH share %0,3.
    landformNoteTr:
      "Burdur, Batı Toroslar'ın uzantıları arasında kalan, dağlarla çevrili bir çöküntü " +
      'ovasıdır. İlin dört yanını Söğüt, Dedegöl, Akdağ ve Eşeler dağları gibi 2.200-2.600 ' +
      'metre aralığında yükselen dağlar çevirir. İlin ortasındaki çöküntü alanını Burdur ' +
      'Gölü doldurur.',
    introTr:
      "Burdur, Göller Bölgesi'nin batısında, aynı adı taşıyan Burdur Gölü'nün güneydoğu " +
      "kıyısında kuruludur. Nüfus bakımından Türkiye'nin altmış beşinci ilidir. İl, Akdeniz " +
      "Bölgesi'nden Ege ve İç Anadolu bölgelerine geçiş kuşağında yer alır.",
    hydrographyNoteTr:
      'Burdur Gölü, deniz seviyesinden yaklaşık 842 metre yükseklikte yer alan, dışa akışı ' +
      "olmayan kapalı bir havza gölüdür. Göl, 1970'ten bu yana artan sulu tarım kullanımı ve " +
      'barajlarla azalan besleyici dere akışı nedeniyle sürekli küçülmekte; su seviyesi 2015 ' +
      'itibarıyla yaklaşık 17 metre gerilemişken, güncel kaynaklara göre bu düşüş bugün 20 ' +
      'metrenin üzerine çıkmıştır. Su seviyesindeki bu düşüş gölün tuzluluk oranını da ' +
      'belirgin biçimde artırmıştır.',
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
    plateCode: '31',
    nameTr: 'Hatay',
    slugTr: 'hatay',
    slugEn: 'hatay',
    region: GeographicRegion.Akdeniz,
    population: 1_577_531,
    populationYear: POPULATION_YEAR,
    areaKm2: 5524,
    districtCount: 15,
    elevationM: 82, // MGM Antakya istasyonu (büyükşehir — "Merkez" ilçesi yok; resmî merkez ilçe Antakya; MGM Köppen tablosunda da ANTAKYA satırıyla temsil edilir)
    latitude: 36.3615,
    longitude: 36.2829,
    // Osmaniye=80, Adana=01, Gaziantep=27 — Kahramanmaraş KOMŞU DEĞİL (~0,35° boşluk, fact-check §A.6.1)
    // (+ Suriye — ülke; Akdeniz kıyısı, batı — hariç)
    neighborPlateCodes: ['80', '01', '27'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    // ── Hatay deep content (wave-4 Tier-A). Full 8-field set from the fact-checked "Dalga 4"
    //    draft. Amanos Dağları/Amik Ovası + the 6 Şubat 2023 depremleri paragraph (landform,
    //    AFAD-sourced, same factual register as İstanbul's KAF / İzmir's Sisam quake); Asi
    //    Nehri + kurutulan Amik Gölü + DSİ barajları (hydrography). urbanizationRate=100 is the
    //    6360 büyükşehir artifact; net göç +1,51 ‰ (post-2023 recovery); GSYH share %1,4.
    landformNoteTr:
      'Hatay, kuzeydoğu-güneybatı yönünde uzanan Amanos Dağları ile bu dağların doğusundaki ' +
      'çöküntü alanında yer alan Amik Ovası arasında ikiye ayrılır. Yaklaşık 175 kilometre ' +
      'uzunluğundaki Amanos Dağları (Nur Dağları), İskenderun Körfezi ile Amik Ovası ' +
      'arasında bir set gibi yükselir; ilin en yüksek noktası, Hassa ilçesinin batısındaki ' +
      "2.240 metrelik Mığır Tepe'dir. 119.350 hektarlık Amik Ovası ilin en geniş ve en " +
      "verimli tarım alanını oluşturur; ovanın güneyinde, Asi Nehri'nin Suriye'den " +
      "Türkiye'ye geçtiği kesimde yükseltisi 400-900 metre arasında değişen Kuseyr Platosu " +
      'yer alır.\n\n' +
      'İl, Anadolu ve Arap levhalarının sınırını oluşturan Doğu Anadolu Fay Hattı üzerinde ' +
      "bulunur. AFAD'ın deprem raporuna göre, 6 Şubat 2023 sabahı 04.17'de merkez üssü " +
      "Kahramanmaraş'ın Pazarcık ilçesi olan Mw 7,7 büyüklüğünde bir deprem, öğleden sonra " +
      "13.24'te ise merkez üssü yine Kahramanmaraş'ın Elbistan ilçesi olan Mw 7,6 " +
      'büyüklüğünde ikinci bir deprem meydana geldi. Hatay, bu iki depremden en ağır hasar ' +
      "gören illerin başında geldi: TÜİK verilerine göre ilin nüfusu 2022'de 1.686.043 iken " +
      "2023'te 1.544.640'a geriledi. İçişleri Bakanlığı'nın açıklamasına göre depremlerde " +
      'bölge genelinde toplam 53.537 kişi hayatını kaybetti.',
    introTr:
      "Hatay, Amanos Dağları ile Suriye sınırı arasında, Asi Nehri'nin oluşturduğu Amik " +
      "Ovası çevresinde kuruludur. Nüfus bakımından Türkiye'nin on üçüncü büyük ilidir. " +
      'Akdeniz kıyısının Türkiye sınırları içindeki en güneydoğu ucunda yer alan il, ' +
      'kuzeyden Anadolu, güneyden Suriye topraklarıyla komşudur.',
    hydrographyNoteTr:
      "İlin ana akarsuyu Asi Nehri'dir. Nehir Lübnan'daki Bekaa Vadisi'nde doğar, Suriye " +
      'topraklarından geçtikten sonra bir süre Türkiye-Suriye sınırını çizer, ardından yön ' +
      "değiştirip Türkiye'ye girer; Antakya'dan geçtikten sonra Samandağ'da bir delta " +
      "oluşturarak Akdeniz'e dökülür. Toplam uzunluğu 556 kilometredir.\n\n" +
      "Amik Ovası'nın ortasında bulunan Amik Gölü, 1954'te başlayıp 1966-1975 arasında " +
      'Devlet Su İşleri tarafından yürütülen bir kurutma projesiyle tarım alanı kazanmak, ' +
      'taşkınları önlemek ve sıtmayı ortadan kaldırmak amacıyla tamamen kurutulmuştur; göl ' +
      'artık mevcut değildir.\n\n' +
      "İlin sulama ve içme suyu ihtiyacı DSİ'nin işlettiği barajlardan karşılanır: Antakya, " +
      "Defne ve Samandağ'ın içme suyunu sağlayan 54 milyon m³ kapasiteli Karaçay Barajı, " +
      "Gaziantep'in İslahiye ile Hatay'ın Hassa ve Kırıkhan ilçelerini ve Amik Ovası'nı " +
      'sulayan 454 milyon m³ kapasiteli Tahtaköprü Barajı ve ' +
      "Altınözü'nde tarımsal sulamada kullanılan 55 milyon m³ kapasiteli Yarseli Barajı.",
    hydrographyFeatures: [
      { name: 'Asi Nehri', type: HydrographyFeatureType.Nehir },
      { name: 'Karaçay Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Tahtaköprü Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Yarseli Barajı', type: HydrographyFeatureType.Baraj },
    ],
    urbanizationRate: 100.0,
    netMigrationRate: 1.51,
    settlementNoteTr:
      "Hatay'ın TÜİK il/ilçe merkezi nüfus oranı, diğer büyükşehirlerde olduğu gibi " +
      "%100'dür — belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı " +
      "Kanun) bir sonucu, ilin fiilen tamamen kentleştiği anlamına gelmiyor. TÜİK'in 2024 " +
      'iç göç verilerine göre il aynı yıl 52.193 kişi aldı, 49.835 kişi verdi; net göç hızı ' +
      'binde +1,51 oldu — 2023 depremlerinin ardından yaşanan büyük nüfus kaybından sonraki ' +
      'ilk pozitif net göç yıllarından biri.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,4',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    plateCode: '32',
    nameTr: 'Isparta',
    slugTr: 'isparta',
    slugEn: 'isparta',
    region: GeographicRegion.Akdeniz,
    population: 445_303,
    populationYear: POPULATION_YEAR,
    areaKm2: 8946,
    districtCount: 13,
    elevationM: 997, // MGM Merkez istasyonu
    latitude: 37.7848,
    longitude: 30.7679,
    // Burdur=15, Afyonkarahisar=03, Konya=42, Antalya=07 — Denizli(20) KOMŞU DEĞİL
    // (Burdur araya giriyor; wave-3'ün Denizli tarafı bulgusunu Isparta tarafı da doğruluyor, fact-check §A.6.1)
    neighborPlateCodes: ['15', '03', '42', '07'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    // ── Isparta deep content (wave-4 Tier-B). 6-field set (hydrographyFeatures +
    //    settlementNoteTr DELIBERATELY OMITTED, Tier-B scope — see block header). Batı Toroslar
    //    + Dedegöl Dağı 2.992 m (landform); Eğirdir Gölü (hydrography, area/depth given as
    //    fact-checked safe RANGES). urbanizationRate=75.77 is REAL (not büyükşehir); net göç
    //    -3,31 ‰; GSYH share %0,4.
    landformNoteTr:
      "Isparta, Batı Toroslar'ın Isparta uzantıları üzerinde, 3.000 metreye yaklaşan yüksek " +
      'dağlarla çevrilidir. İlin en yüksek noktası, hem Anamas (Dedegöl) ' +
      "Dağları'nın hem de Batı Toroslar'ın en yüksek zirvesi olan 2.992 metrelik Dedegöl " +
      "Dağı'dır. Doğuda Sultan Dağları, Konya sınırını oluşturur.",
    introTr:
      "Isparta, Göller Bölgesi'nin merkezinde, Eğirdir Gölü'nün güney kıyısında kuruludur. " +
      "Nüfus bakımından Türkiye'nin kırk beşinci ilidir. İl, Türkiye'nin yağ gülü " +
      'üretiminin büyük bölümünü karşılayan tarım alanlarıyla da tanınır.',
    hydrographyNoteTr:
      'İlin en büyük gölü, yüzölçümü kaynaklara göre 468-482 km² arasında değişen, ' +
      "Türkiye'nin dördüncü büyük gölü olan Eğirdir Gölü'dür; en derin noktası 16-17 metre " +
      'civarındadır. Tatlı sulu bu göl, çevresindeki tarım alanlarının sulanmasında ve ' +
      'balıkçılıkta kullanılır.',
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
    plateCode: '46',
    nameTr: 'Kahramanmaraş',
    slugTr: 'kahramanmaras',
    slugEn: 'kahramanmaras',
    region: GeographicRegion.Akdeniz,
    population: 1_146_278,
    populationYear: POPULATION_YEAR,
    areaKm2: 14_520,
    districtCount: 11,
    // GLOSSARY §1 EXCEPTION (locked, Atlas kararı 2026-07-11): MGM'nin literal varsayılan "Merkez"
    // kaydı rakım=0 döndürür (iç/yayla şehri için fiziksel olarak imkânsız/bozuk). Koordinat-özdeş
    // Onikişubat kaydının 572 m değeri kullanıldı (enlem/boylam "Merkez" ile birebir aynı); üçüncü
    // kaynakla teyitli (Onikişubat Kaymakamlığı ~568 m). Uydurma DEĞİL — aynı otoriter MGM kaynağının
    // kendi çalışan kaydı. Ayrı "Dulkadiroğlu" kaydı (525 m, FARKLI koordinat) kullanılmadı. Bkz. header PROVENANCE.
    elevationM: 572,
    latitude: 37.576,
    longitude: 36.915,
    // Kayseri=38, Malatya=44, Adıyaman=02, Sivas=58, Gaziantep=27, Osmaniye=80, Adana=01
    // (7 komşu — bu dalganın en çok kara-komşulu ili; deniz kıyısı yok)
    neighborPlateCodes: ['38', '44', '02', '58', '27', '80', '01'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    // ── Kahramanmaraş deep content (wave-4 Tier-A). Full 8-field set from the fact-checked
    //    "Dalga 4" draft. Ahır/Nurhak dağları + Elbistan Ovası + the 6 Şubat 2023 depremleri
    //    (landform, AFAD-sourced fault-segment detail — this il was the true epicentre). NB:
    //    the prose's "il merkezi 568 metre" (Kahramanmaraş Barosu) and the base-data
    //    elevationM=572 (MGM Onikişubat, GLOSSARY §1) are two readings of the SAME city-centre
    //    elevation, reconciled by NOVA; the "3.090 metrelik Nurhak Dağı" is a DIFFERENT fact (a
    //    named peak). Ceyhan + Kılavuzlu/Menzelet/Sır barajları (hydrography). net göç +6,31 ‰
    //    is this wave's HIGHEST positive; GSYH share %0,9.
    landformNoteTr:
      "Kahramanmaraş, kuzeyi Güneydoğu Toroslar'ın uzantılarıyla kaplı, güneyi Maraş " +
      "Ovası'na açılan bir geçiş bölgesidir; il merkezi 568 metre rakımdadır. İl merkezinin " +
      'hemen kuzeyinde yükselen Ahır Dağı (2.301 m), kuzeydoğusunda Engizek Dağı, kuzeyinde ' +
      'ise Nurhak ve Binboğa dağları ilin başlıca yükseltileridir; il sınırları içindeki en ' +
      'yüksek nokta, Elbistan ve Nurhak ilçeleri arasındaki 3.090 metrelik Nurhak ' +
      "Dağı'dır. Kuzeyde, Nurhak, Binboğa, Engizek ve Berit dağları arasında kalan Elbistan " +
      'Ovası, ilin bir diğer geniş tarım alanıdır.\n\n' +
      "AFAD'ın deprem raporuna göre, 6 Şubat 2023'teki iki büyük depremin merkez üssü de " +
      "Kahramanmaraş sınırları içindeydi: sabah 04.17'de Pazarcık ilçesinde Mw 7,7, öğleden " +
      "sonra 13.24'te ise Elbistan ilçesinde Mw 7,6 büyüklüğünde iki deprem meydana geldi. " +
      "Depremler Doğu Anadolu Fay Hattı'nın farklı segmentlerinde gerçekleşti: Pazarcık " +
      "depremi, sol yanal doğrultu atımlı Ölüdeniz Fay Zonu'nun kuzey ucundaki Narlı " +
      "Segmenti'nde; Elbistan depremi ise faydan ayrılan bir kol olan Çardak Fayı üzerinde. " +
      'İl, komşu Hatay ile birlikte depremlerden en ağır hasar gören iki il arasında yer ' +
      'aldı.',
    introTr:
      "Kahramanmaraş, Güneydoğu Toroslar'ın güney eteklerinde, Ahır Dağı'nın hemen " +
      "güneyindeki Maraş Ovası üzerinde kuruludur. Nüfus bakımından Türkiye'nin yirminci " +
      'büyük ilidir. İl, Akdeniz, Güneydoğu Anadolu ve Doğu Anadolu bölgelerinin kesiştiği ' +
      'bir geçiş noktasında yer alır.',
    hydrographyNoteTr:
      "Kahramanmaraş'ın ana akarsuyu, ilin kuzeyinden doğup güneybatıya akan Ceyhan " +
      "Nehri'dir; nehir, Adana'ya geçmeden önce ilin batı sınırını uzun bir bölüm boyunca " +
      "çizer. Ahır Dağı'nın güneyinden doğan Aksu Çayı, Sarayköy yakınında Gölbaşı çöküntü " +
      "alanına açılır ve buradan güneybatıya yönelerek Pazarcık'taki Kartalkaya Barajı'na " +
      'dökülür.\n\n' +
      'İl merkezinin içme suyu ihtiyacı, kuzeybatıda Ceyhan Nehri üzerindeki Kılavuzlu ' +
      "Barajı'ndan karşılanır; 1994'te inşaatına başlanan baraj 2014'te işletmeye " +
      'alınmıştır. Aynı nehir üzerindeki Menzelet ve Sır barajları ise enerji üretimi ' +
      "amacıyla işletilir: Menzelet Barajı yılda yaklaşık 515 GWh, 1991'de üretime başlayan " +
      'Sır Barajı ise 725 GWh elektrik üretir.',
    hydrographyFeatures: [
      { name: 'Ceyhan Nehri', type: HydrographyFeatureType.Nehir },
      { name: 'Aksu Çayı', type: HydrographyFeatureType.Nehir },
      { name: 'Kılavuzlu Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Menzelet Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Sır Barajı', type: HydrographyFeatureType.Baraj },
    ],
    urbanizationRate: 100.0,
    netMigrationRate: 6.31,
    settlementNoteTr:
      'Büyükşehir statüsündeki illerin ortak özelliği burada da geçerli: ' +
      "Kahramanmaraş'ın TÜİK il/ilçe merkezi nüfus oranı %100'dür, belde ve köylerin idari " +
      'tüzel kişiliğinin kaldırılmasının (6360 sayılı Kanun) bir sonucudur, ilin fiilen ' +
      'tamamen kentleştiği anlamına gelmez. İl 2024 yılında 37.523 kişi aldı, 30.393 kişi ' +
      'verdi; net göç hızı binde +6,31 ile bu dalganın en yüksek pozitif değerine ulaştı.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,9',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    plateCode: '33',
    nameTr: 'Mersin',
    slugTr: 'mersin',
    slugEn: 'mersin',
    region: GeographicRegion.Akdeniz,
    population: 1_956_428,
    populationYear: POPULATION_YEAR,
    areaKm2: 16_010,
    districtCount: 13,
    elevationM: 7, // MGM Akdeniz istasyonu (büyükşehir — ayrı "Merkez" ilçesi yok; tarihi kent çekirdeği/liman bölgesi Akdeniz)
    latitude: 36.812,
    longitude: 34.6411,
    // Adana=01, Niğde=51, Konya=42, Karaman=70, Antalya=07 (+ Akdeniz kıyısı — hariç)
    neighborPlateCodes: ['01', '51', '42', '70', '07'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    // ── Mersin deep content (wave-4 Tier-A). Full 8-field set from the fact-checked "Dalga 4"
    //    draft. ~%87 dağlık Toros kıyısı + Medetsiz Tepesi 3.524 m + Cennet/Cehennem karstic
    //    obrukları (landform); Göksu deltası + Berdan Çayı/Barajı (hydrography). Two fact-check
    //    corrections applied: Medetsiz 3.585→3.524 m and Berdan Barajı 185→87,5 milyon m³.
    //    urbanizationRate=100 is the 6360 artifact; net göç +3,01 ‰ (2nd highest); GSYH %2,1.
    landformNoteTr:
      "Mersin, yüzölçümünün yaklaşık %87'sini kaplayan Batı ve Orta Toroslar'ın Akdeniz'e " +
      'indiği bir kıyı ilidir; düzlük alanlar yalnızca il merkezi, Tarsus ve Silifke ' +
      'çevresinde gelişmiştir. İlin en yüksek noktası, Bolkar Dağları üzerindeki 3.524 ' +
      "metrelik Medetsiz Tepesi'dir. Dağların denize dik indiği Anamur, Bozyazı ve Aydıncık " +
      'çevresinde ise kıyı boyunca dar ve birbirinden kopuk küçük ovalar yer alır.\n\n' +
      "İlin kireçtaşı ana kayası, Antalya'dakine benzer bir karstik arazi üretir. " +
      "Silifke'nin yaklaşık 25 kilometre güneydoğusundaki Cennet ve Cehennem obrukları " +
      'bunun en bilinen örnekleridir: Cennet Obruğu 250x110 metrelik ağzı ve 70 metrelik ' +
      'derinliğiyle, Cehennem Obruğu ise 128 metreye inen dikey duvarlarıyla dikkat çeker. ' +
      "Cennet Obruğu'nun güney ucundaki mağara girişinde, Bizans döneminden kalma küçük bir " +
      'şapel bulunur.',
    introTr:
      "Mersin, Toros dağlarının Akdeniz'e en dik indiği kesimlerden birinde, geniş bir " +
      "liman kenti olarak kuruludur. Nüfus bakımından Türkiye'nin on birinci büyük ilidir. " +
      "İlin 321 kilometrelik kıyı şeridi, batıda Anamur'dan doğuda Adana sınırına kadar " +
      'uzanır.',
    hydrographyNoteTr:
      "İlin en büyük akarsuyu, Silifke'nin güneyinde geniş bir delta oluşturarak Akdeniz'e " +
      "dökülen Göksu Nehri'dir. 10.000 km²'lik bir havzayı toplayan nehrin deltası, kumul, " +
      'tatlı su bataklığı ve tuzcul çayır gibi farklı ekosistemleri bir arada barındırır ve ' +
      "toplam 15.000 hektarlık alana yayılır. Tarsus'un su kaynağı olan Berdan Çayı ise ilin " +
      'ikinci büyük akarsuyudur.\n\n' +
      "MESKİ'nin işlettiği Berdan Barajı, Mersin ve Tarsus'un içme ve kullanma suyu " +
      'ihtiyacının büyük bölümünü karşılar; barajın normal su kotundaki göl hacmi yaklaşık ' +
      "87,5 milyon m³'tür.",
    hydrographyFeatures: [
      { name: 'Göksu Nehri', type: HydrographyFeatureType.Nehir },
      { name: 'Berdan Çayı', type: HydrographyFeatureType.Nehir },
      { name: 'Berdan Barajı', type: HydrographyFeatureType.Baraj },
    ],
    urbanizationRate: 100.0,
    netMigrationRate: 3.01,
    settlementNoteTr:
      "TÜİK il/ilçe merkezi nüfus oranı Mersin'de de %100 çıkıyor; büyükşehir statüsündeki " +
      'illerde belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı ' +
      'Kanun) bir sonucu, ilin fiilen tamamen kentleştiği anlamına gelmiyor. Mersin 2024 ' +
      'yılında 60.574 kişi aldı, 54.703 kişi verdi; net göç hızı binde +3,01 ile dalganın ' +
      'en yüksek ikinci pozitif değeriydi.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%2,1',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    plateCode: '80',
    nameTr: 'Osmaniye',
    slugTr: 'osmaniye',
    slugEn: 'osmaniye',
    region: GeographicRegion.Akdeniz,
    population: 564_123,
    populationYear: POPULATION_YEAR,
    areaKm2: 3320,
    districtCount: 7,
    elevationM: 94, // MGM Merkez istasyonu
    latitude: 37.1021,
    longitude: 36.2539,
    // Gaziantep=27, Hatay=31, Adana=01, Kahramanmaraş=46 (4 komşu — bu dalganın en az kara-komşulu ili)
    neighborPlateCodes: ['27', '31', '01', '46'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    // ── Osmaniye deep content (wave-4 Tier-B). 6-field set (hydrographyFeatures +
    //    settlementNoteTr DELIBERATELY OMITTED, Tier-B scope — see block header). Amanos/Toros
    //    yükseltileri + Düldül Dağı 2.400 m (landform, Osmaniye Valiliği Tier-1); Ceyhan Nehri
    //    (hydrography, dam names generalised per Tier-B). urbanizationRate=78.24 is REAL (not
    //    büyükşehir); net göç -1,26 ‰; GSYH share %0,4.
    landformNoteTr:
      'Osmaniye toprakları güneyden kuzeye ve doğuya doğru yükselir; güneyde Amanos (Nur) ' +
      "Dağları, kuzeybatıda ise Toroslar'ın uzantıları yer alır. İlin en yüksek noktası, " +
      "2.400 metrelik Düldül Dağı'dır. Düzlük alanlar il merkezi ile Toprakkale, Kadirli ve " +
      'Düziçi ilçeleri çevresinde gelişmiştir.',
    introTr:
      "Osmaniye, Çukurova'nın doğu ucunda, Nur (Amanos) Dağları ile Ceyhan Nehri arasında " +
      "kuruludur. Nüfus bakımından Türkiye'nin kırk birinci ilidir. İl, 1996'da 4200 sayılı " +
      "Kanun'la Adana'dan ayrılarak Türkiye'nin seksen ilinden biri olmuş, Akdeniz " +
      "Bölgesi'nin en küçük yüzölçümüne sahip ilidir.",
    hydrographyNoteTr:
      "İlin başlıca akarsuyu, Kahramanmaraş'tan gelerek topraklarının yaklaşık 75 " +
      "kilometrelik bölümünden geçen Ceyhan Nehri'dir. Karaçay, Savrun ve Hamıs gibi daha " +
      'küçük çaylar da bu ana havzaya katılır. Nehir üzerindeki barajlar ilin sulama ve ' +
      'enerji ihtiyacının bir bölümünü karşılar.',
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
];

/**
 * Every fact-checked province the geography seed loads, in batch order (pilot-5
 * first, then Batch 2 wave-1, wave-2, wave-3, wave-4). This is the single list
 * `seedGeography` iterates — the seed is keyed on the unique `plate_code`, so array
 * order is cosmetic (the public list endpoint re-orders by plate code). Grows
 * batch-by-batch toward the full 81 as each wave clears an independent fact-check.
 * Currently 38 provinces: 5 pilot + 9 wave-1 + 10 wave-2 + 7 wave-3 + 7 wave-4.
 */
export const SEED_PROVINCES: readonly ProvinceSeed[] = [
  ...PILOT_PROVINCES,
  ...BATCH2_WAVE1_PROVINCES,
  ...BATCH2_WAVE2_PROVINCES,
  ...BATCH2_WAVE3_PROVINCES,
  ...BATCH2_WAVE4_PROVINCES,
];
