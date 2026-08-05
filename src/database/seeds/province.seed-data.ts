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
  /**
   * MÜFREDAT iklim adı (the `climate_curriculum_name_tr` column) — REQUIRED on the seed, one
   * of the eight canonical names, while the DB column stays nullable.
   *
   * The asymmetry is deliberate and is the entity's standing rule: only structural
   * identity/routing fields are NOT NULL in the schema, and a research-derived field stays
   * nullable there even when today's data happens to fill all 81 rows (`climate_koppen` is
   * the same shape). The obligation lives one level up, where it can produce a NAMED error:
   * required here makes "a new province row without a curriculum name" a compile error, and
   * `assertCurriculumMappingInvariant` (seed-geography.ts) makes a wrong or empty value a
   * loud seed abort rather than a DB constraint violation.
   *
   * TYPED as the closed union, not `string`: a typo is a compile error, not a page.
   */
  climateCurriculumNameTr: CurriculumClimateNameTr;
  /**
   * Müfredat adına eşlik eden açıklama notu (the `climate_curriculum_note_tr` column) —
   * OPTIONAL, exactly like the PR-5a detail fields below. Absent (undefined) reads as "this
   * province needs no explanation" and is normalised to null in `rowMatchesSeed` /
   * `withExplicitDetailNulls`.
   *
   * Fourteen provinces carry it (→ DEC 2026-08-05f #3/#4); the rest are null BY DESIGN, not
   * by omission — see the entity column's note. Transcribed through the P5 prose lane
   * (`tools/seed-transcription/oneoff-p5-province-prose.ts`), never hand-typed.
   */
  climateCurriculumNoteTr?: string | null;
  landformNoteTr: string | null;
  /**
   * Climate NARRATIVE (the `climate_narrative_tr` column, exposed since PR A2) — the
   * per-province prose that explains the climate MECHANISM. This is NOT `climateNoteTr`:
   * that column holds the locked, class-level MGM Köppen methodological caveat. OPTIONAL on
   * the seed exactly like the PR-5a detail fields below — absent (undefined) reads as "not
   * authored yet" and is normalised to null in `rowMatchesSeed` / `withExplicitDetailNulls`
   * (seed-geography.ts), so a base-data re-seed of a province that lacks it stays a no-op.
   *
   * ## Currently NO province sets it, and that is deliberate — not an oversight
   * The N1 (9 provinces) and N2 (10 provinces) narrative waves were written AGAINST THE MGM
   * SERIES and quoted it: "ocak ortalaması 0,4 derecedir", "yıllık toplam 392,2 milimetre",
   * "şubatta güneşli süre günde bir saatin altına düşer". The published series is now ERA5-Land
   * 1991-2020 (→ DEC 2026-07-30l, DEC 2026-08-01o), whose numbers differ, and two of those
   * sentences describe measures the contract no longer even carries (sunshine hours, monthly
   * records). Leaving the prose in place would have been the one genuinely unacceptable outcome:
   * a page whose chart and whose paragraph state different facts about the same province.
   *
   * So the 19 blocks were REMOVED in the same PR that swapped the series (→ DEC 2026-08-04c, Q3
   * accepted: the site is not deployed, and the launch gate already requires the narratives to be
   * rewritten before publication, so no real reader ever sees the interim empty state). The
   * rewrite is a content-line job, run as fresh NOVA waves against the ERA5 numbers with their own
   * fact-check round — deliberately NOT a find-and-replace over the old text. Until those waves
   * land, "0 provinces carry a narrative" is the asserted, declared state, not a gap.
   */
  climateNarrativeTr?: string | null;
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
 *
 * ## THE A-2 SENTENCE (2026-08-06, Atlas ruling AK-4 / AT-10)
 * The final sentence — "Köppen sınıflandırması ile ders kitaplarındaki bölgesel iklim adları
 * iki ayrı sistemdir…" — was added to the SHARED, code-agnostic body of ALL EIGHT caveat
 * constants when the curriculum climate name shipped (`climateCurriculumNameTr`). It is the
 * ONE place the Köppen-vs-curriculum tension is stated, for all 81 provinces at once.
 *
 * Why it belongs here and not in 81 per-province notes: the existing body already names the
 * limitation but scopes it to "İç Anadolu ile Doğu Anadolu gibi bölgeler", which does not
 * cover the reverse direction (Çankırı/Çorum/Afyonkarahisar read as Köppen "Karadeniz iklimi"
 * while the curriculum calls them karasal) nor the coastal Csa rows (Trabzon, Sinop). Those
 * five are exactly the provinces whose `climateCurriculumNoteTr` is deliberately NULL.
 *
 * It is written to be CODE-AGNOSTIC and stays that way: it names no province, no number and
 * no Köppen code, so all eight constants carry it VERBATIM and
 * `assertKoppenCaveatInvariant`'s "each note names its own code" correspondence check is
 * untouched (the opening clause still carries the only code in each string). The invariant
 * itself was NOT modified by this change. Both properties are pinned by tests in
 * `test/province.e2e-spec.ts`.
 *
 * Source of the text: NOVA's `Owner's Inbox/koppen-sablon-gecisi/cumle-taslaklari.md` §3,
 * transcribed with the seed-transcription emitter's own chunker — never retyped by hand.
 */
const MGM_KOPPEN_CAVEAT_TR =
  "MGM'nin 2023 Köppen sınıflandırması bu ili Csa (Akdeniz iklimi) olarak verir. " +
  "Ancak MGM'nin kendi raporu, bu basitleştirilmiş yöntemin (üçüncü-harf kuralı) " +
  "Türkiye'deki 254 istasyonun yaklaşık %65'ini 'Cs' (Akdeniz tipi) çıkardığını ve " +
  'İç Anadolu ile Doğu Anadolu gibi bölgelerde ayırt ediciliğinin sınırlı kaldığını ' +
  'belirtir; Thornthwaite, Erinç, De Martonne ve Aydeniz gibi diğer sınıflandırmalarda ' +
  'bu iller farklı iklim tiplerine ayrışabilir. ' +
  'Köppen sınıflandırması ile ders kitaplarındaki bölgesel iklim adları iki ayrı sistemdir ve ' +
  'her zaman örtüşmez: bir ilin Köppen kodu Akdeniz tipini gösterirken müfredat aynı ili karasal ' +
  'ya da Karadeniz iklimi alanında sayabilir, tersi de görülür.';

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
  'bu iller farklı iklim tiplerine ayrışabilir. ' +
  'Köppen sınıflandırması ile ders kitaplarındaki bölgesel iklim adları iki ayrı sistemdir ve ' +
  'her zaman örtüşmez: bir ilin Köppen kodu Akdeniz tipini gösterirken müfredat aynı ili karasal ' +
  'ya da Karadeniz iklimi alanında sayabilir, tersi de görülür.';

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
  'bu iller farklı iklim tiplerine ayrışabilir. ' +
  'Köppen sınıflandırması ile ders kitaplarındaki bölgesel iklim adları iki ayrı sistemdir ve ' +
  'her zaman örtüşmez: bir ilin Köppen kodu Akdeniz tipini gösterirken müfredat aynı ili karasal ' +
  'ya da Karadeniz iklimi alanında sayabilir, tersi de görülür.';

/**
 * ── Cfb (Batch 2 wave-6d, Karadeniz-B iç/yüksek-rakımlı iller) ─────────────────
 * Wave-6d (the first BRAND-NEW base-data batch since the deep-content waves) is the
 * FIRST batch to hit Köppen **Cfb**: MGM's own 2023 table classifies the three
 * inland/highland Karadeniz-B il (Bolu 743 m, Çorum 776 m, Kastamonu 800 m) as Cfb
 * ("b" = yazı serin / cool-summer — warmest month < 22°C, milder than the coastal il's
 * Cfa "a" = yazı çok sıcak / hot-summer), while their wave-mates split 4×Cfa + 2×Csa —
 * independently fact-checked (wave6d-karadeniz-b-factcheck, VERIFIED per `koppen.pdf`
 * on each il's own row, NOT copied from a coastal Cfa neighbour).
 *
 * Cfb is still a "Cf" (kurak-mevsimsiz / her mevsim yağışlı) climate — the SAME
 * family as the coastal Cfa, only a rakım-driven cooler-summer SUBTYPE, NOT a
 * different family. So it reuses the SAME curriculum-register TR label as Cfa,
 * "Karadeniz iklimi" (owner ruling, → DEC 2026-07-12; MEB lise müfredatı teaches
 * "Karadeniz iklimi" as one regional type and does NOT split Cfa/Cfb at YKS/KPSS
 * level). The cool-summer nuance the shared label elides is carried in the caveat's
 * opening clause ("…her mevsim yağışlı, yazı serin…").
 *
 * INVARIANT PRECONDITION (seed-geography.ts `assertKoppenCaveatInvariant`): the
 * note-contains-its-own-code correspondence check is sound only while no full Köppen
 * code is a substring of another. Adding "Cfb" keeps that true — Csa/Cfa/Csb/Cfb are
 * all 3 chars and pairwise non-substring — so the substring guard needs ZERO change
 * (the Cfb caveat names "Cfb", absent from the Csa/Cfa/Csb caveats and vice versa).
 */
const KOPPEN_CFB = 'Cfb';
/** Turkish class name for Köppen Cfb — same as Cfa: "Karadeniz iklimi" (→ DEC 2026-07-12). */
const CLIMATE_CLASS_CFB_TR = 'Karadeniz iklimi';
/**
 * Cfb variant of the mandatory MGM Köppen caveat (see MGM_KOPPEN_CAVEAT_TR). The
 * opening clause names Cfb + the cool-summer subtype note ("her mevsim yağışlı, yazı
 * serin"); the methodological tail is identical to the Csa/Cfa/Csb caveats
 * (climate-code-agnostic) so the mandatory note reads consistently across the whole
 * seed. Names its own code ("…bu ili Cfb…"), so the seed-time Köppen⇒caveat
 * correspondence invariant is satisfied self-maintainingly.
 *
 * KÖPPEN "b" CORRECTNESS (→ Atlas ruling 2026-07-12, applied during the wave-6c rebase):
 * the third Köppen letter "b" means warm/cool summer (warmest month < 22°C), NOT hot — so
 * this caveat reads "yazı serin", never "yazı sıcak" (that is the "a" suffix, e.g. Cfa).
 * This corrects the wording PR #19 (wave-6d) first merged; because the constant is shared,
 * the fix also covers the already-shipped wave-6d Cfb il (Bolu/Çorum/Kastamonu).
 */
const MGM_KOPPEN_CAVEAT_CFB_TR =
  "MGM'nin 2023 Köppen sınıflandırması bu ili Cfb (Karadeniz iklimi, her mevsim yağışlı, " +
  'yazı serin) olarak verir. ' +
  "Ancak MGM'nin kendi raporu, bu basitleştirilmiş yöntemin (üçüncü-harf kuralı) " +
  "Türkiye'deki 254 istasyonun yaklaşık %65'ini 'Cs' (Akdeniz tipi) çıkardığını ve " +
  'İç Anadolu ile Doğu Anadolu gibi bölgelerde ayırt ediciliğinin sınırlı kaldığını ' +
  'belirtir; Thornthwaite, Erinç, De Martonne ve Aydeniz gibi diğer sınıflandırmalarda ' +
  'bu iller farklı iklim tiplerine ayrışabilir. ' +
  'Köppen sınıflandırması ile ders kitaplarındaki bölgesel iklim adları iki ayrı sistemdir ve ' +
  'her zaman örtüşmez: bir ilin Köppen kodu Akdeniz tipini gösterirken müfredat aynı ili karasal ' +
  'ya da Karadeniz iklimi alanında sayabilir, tersi de görülür.';

/**
 * ── D-group + BSk (Batch 2 wave-6b, Doğu Anadolu) ─────────────────────────────
 * Wave-6b (the 13 remaining Doğu Anadolu il) introduces the platform's FIRST
 * non-"C"-group Köppen classes: FOUR new codes at once (all previously-seeded 44 il
 * were Csa/Cfa/Csb). MGM's own 2023 table (koppen.pdf s.11-15) reads, per il:
 *   • Dfb — Erzurum 25, Kars 36             ("Kışı Şiddetli, her mevsim yağışlı, Yazı Serin")
 *   • Dsb — Ağrı 04, Ardahan 75             ("Kışı Şiddetli, Yazı Kurak ve Serin")
 *   • Dsa — Bitlis 13, Hakkari 30, Muş 49   ("Kışı Şiddetli, Yazı Kurak ve sıcak")
 *   • BSk — Elazığ 23, Iğdır 76, Malatya 44 ("Yarı Kurak Step İklimi(soğuk)")
 * (Bingöl 12, Erzincan 24, Tunceli 62 are Csa — they reuse the shared Csa constants.)
 *
 * TURKISH CLASS NAMES ARE LOCKED (→ DEC 2026-07-12, Atlas/owner ruling, same
 * mechanism as Cfa→"Karadeniz iklimi" / Csb→"Akdeniz iklimi", 2026-07-11):
 *   • ALL THREE D-group codes (Dfb/Dsb/Dsa) → the SINGLE family name **"Karasal
 *     iklim"** — DELIBERATE, unlike the C-group's Akdeniz/Karadeniz split. Köppen's D
 *     group ("kışı şiddetli/sert") maps definitionally onto the MEB curriculum's
 *     "karasal iklim" family; the sub-letter (f/s/a/b) nuance rides in each code's own
 *     climateNoteTr (as Csa vs Csb do), not in the class name. (The taiga label
 *     "Kar-orman iklimi" was considered and REJECTED — it belongs to the colder Dfc/Dfd
 *     subtypes, misleading for the milder Dfb.)
 *   • BSk → **"Yarı Kurak Step İklimi"** (MGM's own row wording carries "Step İklimi").
 *
 * Same structure as the Cfa/Csb siblings: the shared Csa constants hard-code
 * "Csa (Akdeniz iklimi)" so they cannot be reused; each code below mirrors the
 * MGM_KOPPEN_CAVEAT_TR body verbatim (the code-agnostic ~65%-"Cs" admission +
 * Thornthwaite/Erinç divergence — which explicitly names Doğu Anadolu, apt here), only
 * the opening class clause changes. Each caveat NAMES its own 3-letter code, so the
 * Köppen⇒caveat correspondence invariant (`assertKoppenCaveatInvariant`, seed-geography.ts)
 * is satisfied self-maintainingly — "Dfb"/"Dsb"/"Dsa"/"BSk" cross-match none of the
 * existing Csa/Cfa/Csb caveats and vice versa.
 */
const KOPPEN_DFB = 'Dfb';
const KOPPEN_DSB = 'Dsb';
const KOPPEN_DSA = 'Dsa';
const KOPPEN_BSK = 'BSk';
/** Shared Turkish curriculum-register name for the whole Köppen D group (→ DEC 2026-07-12). */
const CLIMATE_CLASS_D_GROUP_TR = 'Karasal iklim';
/** Turkish class name for Köppen BSk (→ DEC 2026-07-12). */
const CLIMATE_CLASS_BSK_TR = 'Yarı Kurak Step İklimi';

const MGM_KOPPEN_CAVEAT_DFB_TR =
  "MGM'nin 2023 Köppen sınıflandırması bu ili Dfb (Karasal iklim, kışı şiddetli, her mevsim " +
  'yağışlı, yazı serin) olarak verir. ' +
  "Ancak MGM'nin kendi raporu, bu basitleştirilmiş yöntemin (üçüncü-harf kuralı) " +
  "Türkiye'deki 254 istasyonun yaklaşık %65'ini 'Cs' (Akdeniz tipi) çıkardığını ve " +
  'İç Anadolu ile Doğu Anadolu gibi bölgelerde ayırt ediciliğinin sınırlı kaldığını ' +
  'belirtir; Thornthwaite, Erinç, De Martonne ve Aydeniz gibi diğer sınıflandırmalarda ' +
  'bu iller farklı iklim tiplerine ayrışabilir. ' +
  'Köppen sınıflandırması ile ders kitaplarındaki bölgesel iklim adları iki ayrı sistemdir ve ' +
  'her zaman örtüşmez: bir ilin Köppen kodu Akdeniz tipini gösterirken müfredat aynı ili karasal ' +
  'ya da Karadeniz iklimi alanında sayabilir, tersi de görülür.';

const MGM_KOPPEN_CAVEAT_DSB_TR =
  "MGM'nin 2023 Köppen sınıflandırması bu ili Dsb (Karasal iklim, kışı şiddetli, yazı kurak " +
  've serin) olarak verir. ' +
  "Ancak MGM'nin kendi raporu, bu basitleştirilmiş yöntemin (üçüncü-harf kuralı) " +
  "Türkiye'deki 254 istasyonun yaklaşık %65'ini 'Cs' (Akdeniz tipi) çıkardığını ve " +
  'İç Anadolu ile Doğu Anadolu gibi bölgelerde ayırt ediciliğinin sınırlı kaldığını ' +
  'belirtir; Thornthwaite, Erinç, De Martonne ve Aydeniz gibi diğer sınıflandırmalarda ' +
  'bu iller farklı iklim tiplerine ayrışabilir. ' +
  'Köppen sınıflandırması ile ders kitaplarındaki bölgesel iklim adları iki ayrı sistemdir ve ' +
  'her zaman örtüşmez: bir ilin Köppen kodu Akdeniz tipini gösterirken müfredat aynı ili karasal ' +
  'ya da Karadeniz iklimi alanında sayabilir, tersi de görülür.';

const MGM_KOPPEN_CAVEAT_DSA_TR =
  "MGM'nin 2023 Köppen sınıflandırması bu ili Dsa (Karasal iklim, kışı şiddetli, yazı kurak " +
  've sıcak) olarak verir. ' +
  "Ancak MGM'nin kendi raporu, bu basitleştirilmiş yöntemin (üçüncü-harf kuralı) " +
  "Türkiye'deki 254 istasyonun yaklaşık %65'ini 'Cs' (Akdeniz tipi) çıkardığını ve " +
  'İç Anadolu ile Doğu Anadolu gibi bölgelerde ayırt ediciliğinin sınırlı kaldığını ' +
  'belirtir; Thornthwaite, Erinç, De Martonne ve Aydeniz gibi diğer sınıflandırmalarda ' +
  'bu iller farklı iklim tiplerine ayrışabilir. ' +
  'Köppen sınıflandırması ile ders kitaplarındaki bölgesel iklim adları iki ayrı sistemdir ve ' +
  'her zaman örtüşmez: bir ilin Köppen kodu Akdeniz tipini gösterirken müfredat aynı ili karasal ' +
  'ya da Karadeniz iklimi alanında sayabilir, tersi de görülür.';

const MGM_KOPPEN_CAVEAT_BSK_TR =
  "MGM'nin 2023 Köppen sınıflandırması bu ili BSk (Yarı Kurak Step İklimi, soğuk alt-tipi) " +
  'olarak verir. ' +
  "Ancak MGM'nin kendi raporu, bu basitleştirilmiş yöntemin (üçüncü-harf kuralı) " +
  "Türkiye'deki 254 istasyonun yaklaşık %65'ini 'Cs' (Akdeniz tipi) çıkardığını ve " +
  'İç Anadolu ile Doğu Anadolu gibi bölgelerde ayırt ediciliğinin sınırlı kaldığını ' +
  'belirtir; Thornthwaite, Erinç, De Martonne ve Aydeniz gibi diğer sınıflandırmalarda ' +
  'bu iller farklı iklim tiplerine ayrışabilir. ' +
  'Köppen sınıflandırması ile ders kitaplarındaki bölgesel iklim adları iki ayrı sistemdir ve ' +
  'her zaman örtüşmez: bir ilin Köppen kodu Akdeniz tipini gösterirken müfredat aynı ili karasal ' +
  'ya da Karadeniz iklimi alanında sayabilir, tersi de görülür.';

/**
 * ── MÜFREDAT İKLİM ADLARI (MEB Coğrafya 9, Harita 1.39) — the eight canonical names ────────
 *
 * A SEPARATE EDITORIAL LAYER, not a second spelling of the MGM class name above. The two
 * differ on 38 of 81 provinces and the difference is the point: MGM's simplified Köppen rule
 * puts Ankara, Sivas, Van and Diyarbakır in the "Akdeniz iklimi" class, while every Turkish
 * textbook calls them karasal. The header the web renders shows BOTH
 * ("<müfredat adı> · Köppen: <kod>", → DEC 2026-08-05c) so the page stops contradicting the
 * curriculum without touching, softening, or re-labelling MGM's attributed value (K1).
 *
 * WHERE THE VALUES COME FROM — no name below was invented here. NOVA derived all 81 rows in
 * `Owner's Inbox/koppen-mufredat-eslemesi/brief.md`: the textbook's own type list (§2.1), the
 * per-province derivation rule (§2.3: MEB body text wins; else the province's MGM il-merkezi
 * station's polygon on Harita 1.39; cross-checked against MGM's Şekil 4), and the 81-row
 * tables of §3. Seventy-one rows are NET; the ten the two maps disagree on are BELİRSİZ and
 * were ruled individually (Isparta/Burdur → DEC 2026-08-05f #1; Kütahya, Amasya, Tokat →
 * DEC 2026-08-06a; the other five follow NOVA's §5 recommendations under DEC 2026-08-05f #3).
 *
 * THE MAPPING HAS ITS OWN FIDELITY GATE, because no range/ordering invariant can see a
 * plausible-but-wrong name ("Çorum → Karadeniz iklimi" would satisfy every structural rule
 * and still be false on the page). ENGINEERING §5 requires a write-path check on any line
 * that publishes values, so the brief's §3 tables are re-parsed and compared against this
 * seed — including the Köppen column, 81/81 — by:
 *
 *   node tools/seed-transcription/oneoff-m1-province-curriculum.ts check \
 *     "../Owner's Inbox/koppen-mufredat-eslemesi/brief.md"
 *
 * WHY EXPORTED CONSTANTS RATHER THAN INLINE STRINGS: eight values repeated across 81 rows is
 * the archetypal typo surface, and a typo here is a wrong public label that no test can spot.
 * The cost is real and is accepted with open eyes — a constant reference is NOT a foldable
 * string-literal chain, so the AST-folding transcription lanes structurally cannot verify
 * this field, which is exactly why the checker above exists instead.
 *
 * SPELLING follows brief §2.1: only proper nouns are capitalised ("İç Anadolu karasal
 * iklimi", not "İç Anadolu Karasal İklimi").
 *
 * EN equivalents are deliberately NOT added this wave: six of the eight carry `[TEYİT GEREK]`
 * in brief §7.4, and an unverified translation must stay absent (Atlas ruling AK-1).
 */
export const CURRICULUM_AKDENIZ = 'Akdeniz iklimi';
export const CURRICULUM_KARADENIZ = 'Karadeniz iklimi';
export const CURRICULUM_IC_ANADOLU = 'İç Anadolu karasal iklimi';
export const CURRICULUM_DOGU_ANADOLU = 'Doğu Anadolu karasal iklimi';
export const CURRICULUM_GUNEYDOGU_ANADOLU = 'Güneydoğu Anadolu karasal iklimi';
export const CURRICULUM_TRAKYA = 'Trakya karasal iklimi';
export const CURRICULUM_MARMARA_GECIS = 'Marmara geçiş iklimi';
export const CURRICULUM_GOLLER_YORESI = 'Göller Yöresi geçiş iklimi';

/**
 * The closed vocabulary, as data AND as a type.
 *
 * The array is the RUNTIME half — `assertCurriculumMappingInvariant` (seed-geography.ts)
 * membership-tests against it, so a value that reaches the column through any path other
 * than this file still fails. The union is the COMPILE-TIME half. Neither replaces the
 * other: the type cannot see a value written by a future admin endpoint, and the array
 * cannot stop a typo before it runs.
 */
export const CURRICULUM_CLIMATE_NAMES_TR = [
  CURRICULUM_AKDENIZ,
  CURRICULUM_KARADENIZ,
  CURRICULUM_IC_ANADOLU,
  CURRICULUM_DOGU_ANADOLU,
  CURRICULUM_GUNEYDOGU_ANADOLU,
  CURRICULUM_TRAKYA,
  CURRICULUM_MARMARA_GECIS,
  CURRICULUM_GOLLER_YORESI,
] as const;

/** One of the eight canonical müfredat climate names. */
export type CurriculumClimateNameTr = (typeof CURRICULUM_CLIMATE_NAMES_TR)[number];

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
    climateCurriculumNameTr: CURRICULUM_MARMARA_GECIS,
    // ── İstanbul deep-content pilot (see the İSTANBUL DEEP-CONTENT PILOT note above).
    //    Seven values transcribed from the fact-checked draft. The four prose fields
    //    (introTr, landformNoteTr, hydrographyNoteTr, settlementNoteTr) carry NOVA's
    //    2026-07-11 style-only rewrite (CONTENT-STYLE.md) — facts/numbers unchanged, plus
    //    one internal-consistency fix to the Haliç sentence (aligns landform with the
    //    hydrography framing, same fact-checked source). The structured/numeric detail
    //    fields (hydrographyFeatures, urbanizationRate, netMigrationRate, economyIndicator)
    //    are UNCHANGED from the fact-checked pilot.
    //    P3 CONTENT FIX (2026-08-05, AT-8, B18): two repetitions removed, no fact touched.
    //    (1) The Haliç/ria explanation was told TWICE — the full definition stays in
    //    landformNoteTr, where "ria" is a coastal-geomorphology term and belongs; the
    //    hydrography note now just states that the two streams meet there. (2) The
    //    "Karadeniz'i Marmara Denizi'ne bağlayan" apposition appeared THREE times (landform,
    //    intro, hydrography); it now survives only in introTr, the first place a reader
    //    meets it. Dam list, 868/905 million m³, the two-layer current and the lagoon
    //    paragraph are byte-identical. The hydrography field is still one long block —
    //    splitting it into `\n\n` paragraphs is AÇIK-7, deliberately NOT done here.
    landformNoteTr:
      "İstanbul, jeomorfolojik olarak Çatalca-Kocaeli Bölümü'nde yer alır. İlin büyük bölümünü " +
      'dağlar ya da ovalar değil, aşınım yüzeyleri üzerinde gelişmiş bir plato oluşturur; bu ' +
      "plato Kocaeli Platosu'nun bir parçasıdır. İlin en yüksek noktası, Kartal, Pendik, " +
      "Sultanbeyli ve Sancaktepe sınırında yer alan 538 metrelik Aydos Dağı'dır. Onu 438 " +
      'metreyle Kayış Dağı ve 409 metreyle Alem Dağı izler.' +
      '\n\n' +
      'İstanbul Boğazı, 17 deniz mili (yaklaşık 31,5 km) uzunluğundadır. Üzerinde, güneyden ' +
      "kuzeye doğru üç asma köprü iki yakayı birbirine bağlar: 1973'te açılan 15 Temmuz Şehitler " +
      "Köprüsü, 1988'de açılan Fatih Sultan Mehmet Köprüsü ve 2016'da açılan Yavuz Sultan Selim " +
      'Köprüsü.' +
      '\n\n' +
      'Boğazın Avrupa yakasında yer alan Haliç, Kağıthane ve Alibeyköy derelerinin birleşip ' +
      'denizin istila ettiği bir vadi ağzından oluşmuştur. Coğrafyada bu tip kıyılara "ria" ' +
      'denir.' +
      '\n\n' +
      'Tarihi yarımada — bugünkü Fatih ilçesi — şehrin en eski yerleşim çekirdeğidir ve ' +
      'geleneksel olarak yedi tepe üzerine kurulu kabul edilir. Bu tanım surlariçi bölgeyi ' +
      "kapsar; ilin toplam yüzölçümü 5.461 km²'dir." +
      '\n\n' +
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
      "Melen Sistemi üzerinden Düzce'den de trans-havza su aktarımı yapılır. İstanbul " +
      "Boğazı'nda, dünyada nadir görülen iki katmanlı bir akıntı sistemi vardır: yüzeyde " +
      "Karadeniz kökenli az tuzlu su Marmara'ya doğru, dipte ise Marmara ve Akdeniz kökenli daha " +
      "tuzlu ve yoğun su Karadeniz'e doğru akar. Boğazın Avrupa yakasında Kağıthane ve Alibeyköy " +
      "dereleri Haliç'te birleşir. İlin batı kesiminde, Küçükçekmece ve Büyükçekmece adlarını " +
      'taşıyan iki kıyı gölü (lagün) bulunur. Büyükçekmece aynı zamanda bir İSKİ barajı olarak ' +
      'işletilir. Küçükçekmece ise denizle bağlantısı nedeniyle tuzlu su içerir ve içme suyu ' +
      'kaynağı olarak kullanılmaz.',
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
    climateCurriculumNameTr: CURRICULUM_IC_ANADOLU,
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
      "Ankara'da da TÜİK'in il/ilçe merkezi nüfus oranı %100 çıkıyor — büyükşehir statüsündeki " +
      'illerde belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı Kanun) bir ' +
      'sonucudur. Bu oran, ilin fiilen tamamen kentleştiği anlamına gelmez. Ankara 2024 yılında ' +
      "202.402 kişi aldı, 150.373 kişi verdi; net göç hızı binde +8,91 ile İstanbul'un ardından " +
      "Türkiye'nin en yüksek pozitif değerlerinden birine ulaştı.",
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
    climateCurriculumNameTr: CURRICULUM_AKDENIZ,
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
      "Büyükşehir statüsündeki illerde olduğu gibi İzmir'in de TÜİK il/ilçe merkezi nüfus oranı " +
      '%100 görünür; belde ve köylerin idari tüzel kişiliğinin kaldırılması (6360 sayılı Kanun) ' +
      'bu rakamın kaynağıdır. Bu oran, ilin fiilen tamamen kentleştiği anlamına gelmez. İzmir ' +
      '2024 yılında 117.889 kişi aldı, 102.040 kişi verdi. Net göç hızı binde +3,53 ile pozitif ' +
      "ama Ankara ve Antalya'nın gerisinde kaldı.",
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
    climateCurriculumNameTr: CURRICULUM_DOGU_ANADOLU,
    // ── Van deep content (wave-1 — see the WAVE-1 DEEP CONTENT note above). Doğu Anadolu /
    //    volkanik + kapalı havza framing: Van Gölü as a Nemrut volcanic-dam lake + the 2011
    //    2011 Tabanlı/Edremit quakes (landform); the göl's sodalı physical properties + DSİ
    //    dams (hydrography). economyIndicator is the 2024 TÜİK GSYH share (%0,5, Atlas-ruled
    //    metric choice).
    //    P3 CONTENT FIX (2026-08-05, AT-6/AT-8): the landform note said Nemrut was "sönmüş"
    //    while /turkiye/bitlis called the same volcano "uykuda" — the site contradicted
    //    itself. Now aligned on the two official sources (Tatvan Kaymakamlığı + Kültür
    //    Portalı: uyuyan aktif, last lava 1441). Also `Erçiş` -> `Erciş` AND the epicentre's
    //    district attribution: Tabanlı is Tuşba/Van Merkez, never Erciş (Tuşba Kaymakamlığı
    //    mahalle list); AFAD names the event "Van-Erciş merkezli" because the HEAVIEST DAMAGE
    //    was in Erciş, which the prose now says instead. netMigrationRate (-20.02 ‰) is NOT
    //    described as "the sole negative" any more: that held only inside the four-province
    //    pilot set, and the corpus itself carries Gümüşhane -42,80 / Bayburt -35,16 /
    //    Siirt -33,96. Do not reintroduce a superlative here without a national-set check.
    landformNoteTr:
      'Van, jeolojik olarak genç bir volkanik ve tektonik bölgede yer alır. İlin batısındaki Van ' +
      "Gölü, yaklaşık 200 bin yıl önce Nemrut Dağı'nın patlayıp lav akıntılarıyla bölgenin " +
      'drenajını tıkaması sonucu oluşmuş bir volkanik set gölüdür. Nemrut Dağı, tepesinde 6 ' +
      'kilometre çapında bir kalderası olan 2.935 metrelik bir yanardağdır. Uyuyan aktif bir ' +
      'volkan olarak sınıflandırılır; bilinen son lav çıkışı 1441 yılında gerçekleşmiştir.' +
      '\n\n' +
      "Gölün kuzeyinde yükselen Süphan Dağı ise 4.058 metreyle Ağrı Dağı ve Cilo Dağı'nın " +
      "ardından Anadolu'nun üçüncü en yüksek zirvesidir; tepesi yıl boyunca buzulla kaplıdır. Bu " +
      "iki volkanik kütle, Van Gölü Kapalı Havzası'nı çevreleyen dağ sınırının bir parçasını " +
      'oluşturur. Havza güneyden Bitlis Masifi, doğu ve kuzeyden Tendürek ve diğer volkanik ' +
      'kütlelerle çevrilidir.' +
      '\n\n' +
      "İl, karmaşık bir fay sistemi üzerinde bulunur. 23 Ekim 2011'de merkez üssü Tabanlı köyü " +
      'olan, büyüklüğü 7,2 olarak ölçülen bir deprem meydana geldi; 604 kişi hayatını kaybetti. ' +
      "En ağır yıkım Erciş ilçesinde yaşandı. Aynı yılın 9 Kasım'ında Edremit'te 5,6 " +
      'büyüklüğünde ikinci bir deprem oldu.',
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
      "Van'ın TÜİK il/ilçe merkezi nüfus oranı da, diğer büyükşehirlerde olduğu gibi, %100'dür. " +
      'Bu oran ilin fiilen tamamen kentleştiği anlamına gelmez; büyükşehir statüsündeki illerde ' +
      'belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı Kanun) bir ' +
      'sonucudur. Van 2024 yılında 31.418 kişi aldı, 54.023 kişi verdi — aldığının yaklaşık 1,7 ' +
      'katı. Net göç hızı binde -20,02 ile negatif kaldı.',
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
    climateCurriculumNameTr: CURRICULUM_AKDENIZ,
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
    // CROSS-ROW COUPLING, DELIBERATE AND DECLARED (PR #95 review, CR95). The prose below cites
    // Ankara's rate ("binde +8,91") as a comparison. That figure is NOT Antalya's own — it is
    // copied from the ANKARA row's `netMigrationRate: 8.91` (plateCode '06'), both from the same
    // TÜİK 2024 iç göç release. If a later wave revises Ankara's figure, THIS SENTENCE GOES
    // STALE IN SILENCE: nothing joins the two rows, and no gate can see it, because the
    // transcription check only proves the seed matches its own draft. Left as prose rather than
    // computed — a seed is a flat published record and a derived value here would be machinery
    // nothing else needs — but recorded so whoever edits Ankara knows to grep for "+8,91". The
    // comparison is the point of the sentence: it replaced an internal "dört pilot il" jargon
    // leak with a real, checkable fact.
    settlementNoteTr:
      "Antalya'nın TÜİK il/ilçe merkezi nüfus oranı %100'dür, çünkü büyükşehir statüsündeki " +
      "illerde belde ve köylerin idari tüzel kişiliği 6360 sayılı Kanun'la kaldırılmıştır — bu " +
      'oran ilin fiilen tamamen kentleştiği anlamına gelmez. Antalya 2024 yılında 96.618 kişi ' +
      "aldı, 71.999 kişi verdi. Net göç hızı binde +9,09 ile başkent Ankara'nın binde +8,91'lik " +
      'oranının da üzerine çıktı.',
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
    climateCurriculumNameTr: CURRICULUM_GUNEYDOGU_ANADOLU,
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
    climateCurriculumNameTr: CURRICULUM_GUNEYDOGU_ANADOLU,
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
    climateCurriculumNameTr: CURRICULUM_GUNEYDOGU_ANADOLU,
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
      "Kanun) bir sonucudur. Bu oran, ilin fiilen tamamen kentleştiği anlamına gelmez. TÜİK'in " +
      '2024 iç göç verilerine göre il aynı yıl 43.561 kişi aldı, 50.981 kişi verdi; net göç hızı ' +
      'binde -4,04 oldu.',
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
    climateCurriculumNameTr: CURRICULUM_AKDENIZ,
    climateCurriculumNoteTr:
      "Gaziantep, Güneydoğu Anadolu Bölgesi'nde yer alır; iklim bakımından Akdeniz iklimi " +
      'alanının doğu ucundadır. Ders kitabı bu alanı tarif ederken sınırı Gaziantep ve Kilis ' +
      'çevresinden başlatır. Bölgenin diğer illerinden yedisi Güneydoğu Anadolu karasal iklimi ' +
      'adını alır.',
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
      "Gaziantep'in TÜİK il/ilçe merkezi nüfus oranı, büyükşehir statüsündeki illerde olduğu " +
      "gibi %100'dür — belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı " +
      "Kanun) bir sonucudur. Bu oran, ilin fiilen tamamen kentleştiği anlamına gelmez. TÜİK'in " +
      '2024 iç göç verilerine göre il aynı yıl 56.097 kişi aldı, 49.330 kişi verdi; net göç hızı ' +
      'binde +3,09 oldu — bölgedeki komşu illerin çoğunun aksine Gaziantep göç açısından pozitif ' +
      'bir tablo çiziyor.',
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
    climateCurriculumNameTr: CURRICULUM_AKDENIZ,
    climateCurriculumNoteTr:
      "MEB'in TYT konu özeti, Akdeniz iklimi görülen iller arasında Kilis'i adıyla sayar. Ders " +
      'kitabı da bu alanın doğu sınırını Kilis ile Gaziantep çevresinden başlatır. Kilis ' +
      "Güneydoğu Anadolu Bölgesi'ndedir, iklim adı ise bölgenin adını taşımaz. Türkiye içindeki " +
      'tek komşusu Gaziantep de aynı adı alır.',
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
    climateCurriculumNameTr: CURRICULUM_GUNEYDOGU_ANADOLU,
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
      'bir sonucudur. Bu oran, ilin fiilen tamamen kentleştiği anlamına gelmez.',
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
    climateCurriculumNameTr: CURRICULUM_GUNEYDOGU_ANADOLU,
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
    climateCurriculumNameTr: CURRICULUM_GUNEYDOGU_ANADOLU,
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
      "Kanun) bir sonucudur. Bu oran, ilin fiilen tamamen kentleştiği anlamına gelmez. TÜİK'in " +
      '2024 iç göç verilerine göre il aynı yıl 41.771 kişi aldı, 60.925 kişi verdi; net göç hızı ' +
      "binde -8,52 oldu. TÜİK'in ADNKS verilerine göre Şanlıurfa, 21,8 ortanca yaşla Türkiye'nin " +
      'en genç nüfuslu ilidir.',
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
    climateCurriculumNameTr: CURRICULUM_GUNEYDOGU_ANADOLU,
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
    climateCurriculumNameTr: CURRICULUM_MARMARA_GECIS,
    climateCurriculumNoteTr:
      "Balıkesir'in iki denize açılan kıyıları iki ayrı iklim alanına da denk gelir: Edremit " +
      'Körfezi çevresi ders kitabı haritasında Akdeniz iklimi alanına, Marmara kıyısı geçiş ' +
      'alanına düşer. Her iki harita da il merkezini geçiş alanı içinde gösterir. Buradaki ad bu ' +
      'ortak okumaya dayanır.',
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
    climateCurriculumNameTr: CURRICULUM_MARMARA_GECIS,
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
    climateCurriculumNameTr: CURRICULUM_MARMARA_GECIS,
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
    climateCurriculumNameTr: CURRICULUM_MARMARA_GECIS,
    climateCurriculumNoteTr:
      "MGM, Marmara geçiş iklimini Marmara Bölgesi'nin kuzey Ege'yi de içine alan güney " +
      'kesiminde tanımlar. Çanakkale tam bu tarifin içine düşer. Ders kitabı haritasında ise ' +
      'ilin güney kıyı şeridi Akdeniz iklimi alanına yaklaşır, kuzey yakası geçiş alanında ' +
      'kalır.',
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
    climateCurriculumNameTr: CURRICULUM_TRAKYA,
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
    climateCurriculumNameTr: CURRICULUM_TRAKYA,
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
    // MGM İzmit istasyonu (ilin hiç "Merkez" adlı ilçesi olmadı). Rakım: MGM'nin WMO/OSCAR
    // kaydı, WIGOS 0-792-0-17066 → 74 m (erişim 2026-08-04). Tahmin servisinin 0'ı ölçüm değil,
    // boş-değer kodlaması; koordinat-özdeş Derince kaydı da 74 m veriyor (→ AN-1).
    elevationM: 74,
    latitude: 40.7663,
    longitude: 29.9173,
    // İstanbul=34, Bursa=16, Sakarya=54, Yalova=77 (+ Karadeniz kıyısı — hariç)
    neighborPlateCodes: ['34', '16', '54', '77'],
    // Cfa — MGM'nin kendi tablosunda Csa DEĞİL (fact-check §A.5 VERIFIED, s.13)
    climateKoppen: KOPPEN_CFA,
    climateClassTr: CLIMATE_CLASS_CFA_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_CFA_TR,
    climateCurriculumNameTr: CURRICULUM_KARADENIZ,
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
      'bir sonucudur. Bu oran, ilin fiilen tamamen kentleştiği anlamına gelmez. 2024 yılında ' +
      '80.804 kişi aldı, 63.593 kişi verdi; net göç hızı binde +8,11 ile sanayi istihdamının ' +
      'çektiği net bir göç kazancına işaret ediyor.',
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
    climateCurriculumNameTr: CURRICULUM_KARADENIZ,
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
      'kaldırılmasının bir sonucudur. Bu oran, ilin fiilen tamamen kentleştiği anlamına gelmez. ' +
      '2024 yılında 37.116 kişi aldı, 30.501 kişi verdi. Net göç hızı binde +5,97 ile pozitif ' +
      'bir dengeye işaret ediyor.',
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
    climateCurriculumNameTr: CURRICULUM_MARMARA_GECIS,
    climateCurriculumNoteTr:
      "Tekirdağ, Trakya'nın iki iklim alanı arasında bölünür. Yıldız Dağları'na yaslanan kuzey " +
      'kesimi ders kitabı haritasında Trakya karasal iklimi alanına düşer, Marmara kıyısındaki ' +
      'güney şeridi ise geçiş alanında kalır. Sayfadaki ad il merkezine göre belirlendi.',
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
    climateCurriculumNameTr: CURRICULUM_MARMARA_GECIS,
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
    climateCurriculumNameTr: CURRICULUM_IC_ANADOLU,
    climateCurriculumNoteTr:
      "Afyonkarahisar, 1.034 metredeki merkeziyle kıyı Ege'den yüksek bir eşikle ayrılır. Ege " +
      "Bölgesi'nde olmasına karşın ders kitabı ve MGM haritalarının ikisi de ili İç Anadolu " +
      'karasal iklimi alanına koyar. Aynı ad, kuzey komşusu Kütahya için de kullanılır.',
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
    climateCurriculumNameTr: CURRICULUM_AKDENIZ,
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
      "Aydın'da TÜİK'in il/ilçe merkezi nüfus oranı %100'e ulaşır; büyükşehir statüsündeki " +
      'illerde belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı Kanun) bir ' +
      "sonucudur. Bu oran, ilin fiilen tamamen kentleştiği anlamına gelmez. 2024'te Aydın 40.849 " +
      'kişi aldı, 35.832 kişi verdi. Net göç hızı binde +4,31 oldu.',
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
    climateCurriculumNameTr: CURRICULUM_AKDENIZ,
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
      "Denizli için TÜİK'in il/ilçe merkezi nüfus oranı %100'dür; büyükşehir statüsündeki " +
      'illerde belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı Kanun) bir ' +
      "sonucudur. Bu oran, ilin fiilen tamamen kentleştiği anlamına gelmez. Denizli 2024'te " +
      '25.866 kişi aldı, 24.816 kişi verdi. Net göç hızı binde +0,99 ile dengeye yakın bir ' +
      'değerde kaldı.',
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
    climateCurriculumNameTr: CURRICULUM_IC_ANADOLU,
    climateCurriculumNoteTr:
      "Başlıktaki iklim adı, Kütahya'nın doğusundaki İç Anadolu'yu işaret eder; ilin kendisi Ege " +
      "Bölgesi'ndedir. İki kaynak ili farklı alanlara koyar: ders kitabı haritası Marmara geçiş " +
      'alanının güney ucuna, MGM haritası İç Anadolu karasal alanının batı ucuna. Sayfada ikinci ' +
      'okuma izlendi, çünkü 969 metredeki il merkezi ve ortalama 1.200 metrelik yayla ili kıyı ' +
      "Ege'den ayırır. Aynı ad, güney komşusu Afyonkarahisar için de kullanılır.",
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
    climateCurriculumNameTr: CURRICULUM_AKDENIZ,
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
      'sonucudur. Bu oran, ilin fiilen tamamen kentleştiği anlamına gelmez. Manisa 2024 yılında ' +
      '37.649 kişi aldı, 37.328 kişi verdi; net göç hızı binde +0,22 ile hemen hemen dengede ' +
      'kaldı.',
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
    climateCurriculumNameTr: CURRICULUM_AKDENIZ,
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
      "Muğla'da TÜİK'in il/ilçe merkezi nüfus oranı %100'dür. Bu oran ilin fiilen tamamen " +
      'kentleştiği anlamına gelmez; büyükşehir statüsündeki illerde belde ve köylerin idari ' +
      "tüzel kişiliğinin kaldırılmasının (6360 sayılı Kanun) bir sonucudur. Muğla 2024'te 48.895 " +
      'kişi aldı, 36.378 kişi verdi. Net göç hızı binde +11,64 ile pozitif kaldı.',
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
    climateCurriculumNameTr: CURRICULUM_AKDENIZ,
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
      "Uşak, Ege Bölgesi'nin nüfusu en az ilidir ve İç Ege'ye geçiş karakteriyle öne çıkar. İl, " +
      'Osmanlı döneminden bu yana süregelen halı dokumacılığı geleneğiyle tanınır. Kuzeyindeki ' +
      'Elmadağ, ilin en belirgin yer şekillerinden biri olan eski bir volkanik kütledir.',
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
    climateCurriculumNameTr: CURRICULUM_AKDENIZ,
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
      "Adana'da da, büyükşehir statüsündeki illerin çoğunda olduğu gibi, TÜİK il/ilçe merkezi " +
      'nüfus oranı %100 çıkıyor; bu, belde ve köylerin idari tüzel kişiliğinin kaldırılmasının ' +
      '(6360 sayılı Kanun) bir sonucudur. Bu oran, ilin fiilen tamamen kentleştiği anlamına ' +
      'gelmez. 2024 yılında il 55.342 kişi aldı, 56.108 kişi verdi. Net göç hızı binde -0,34 ile ' +
      'sıfıra çok yakın kaldı.',
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
    climateCurriculumNameTr: CURRICULUM_GOLLER_YORESI,
    climateCurriculumNoteTr:
      'Ders kitabı haritasında Burdur Gölü çevresi, Göller Yöresi geçiş iklimi alanı olarak ayrı ' +
      "işaretlenir. MEB'in TYT konu özeti Burdur'u Akdeniz iklimi listesine koyar, MGM'nin bölge " +
      'haritasında ise ayrı bir Göller Yöresi alanı bulunmaz. İki MEB kaynağı arasındaki bu ' +
      'farkta, en ayrıntılı olan ders kitabı haritası esas alındı. Isparta da aynı adı taşır.',
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
    climateCurriculumNameTr: CURRICULUM_AKDENIZ,
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
      "Hatay'ın TÜİK il/ilçe merkezi nüfus oranı, diğer büyükşehirlerde olduğu gibi %100'dür — " +
      'belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı Kanun) bir ' +
      "sonucudur. Bu oran, ilin fiilen tamamen kentleştiği anlamına gelmez. TÜİK'in 2024 iç göç " +
      'verilerine göre il aynı yıl 52.193 kişi aldı, 49.835 kişi verdi; net göç hızı binde +1,51 ' +
      'oldu — 2023 depremlerinin ardından yaşanan büyük nüfus kaybından sonraki ilk pozitif net ' +
      'göç yıllarından biri.',
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
    climateCurriculumNameTr: CURRICULUM_GOLLER_YORESI,
    climateCurriculumNoteTr:
      "Isparta, Eğirdir Gölü kıyısında, Göller Yöresi'nin ortasındadır. Ders kitabı haritası bu " +
      "yöreyi ayrı bir geçiş alanı olarak ayırır ve sayfadaki ad bu haritaya dayanır. MEB'in TYT " +
      "konu özeti ise Isparta'yı Akdeniz iklimi görülen iller arasında adıyla sayar. MGM Akdeniz " +
      "iklimini Toros Dağları'nın güneye bakan kesimlerinde tanımlar; 997 metredeki Isparta " +
      'merkezi bu kıyı yamaçlarının gerisindedir. Aynı ad, yörenin diğer ili Burdur için de ' +
      'geçerlidir.',
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
    climateCurriculumNameTr: CURRICULUM_AKDENIZ,
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
      "Büyükşehir statüsündeki illerin ortak özelliği burada da geçerli: Kahramanmaraş'ın TÜİK " +
      "il/ilçe merkezi nüfus oranı %100'dür; belde ve köylerin idari tüzel kişiliğinin " +
      'kaldırılmasının (6360 sayılı Kanun) bir sonucudur. Bu oran, ilin fiilen tamamen ' +
      'kentleştiği anlamına gelmez. İl 2024 yılında 37.523 kişi aldı, 30.393 kişi verdi. Net göç ' +
      'hızı binde +6,31 ile pozitif kaldı.',
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
    climateCurriculumNameTr: CURRICULUM_AKDENIZ,
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
      'illerde belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı Kanun) bir ' +
      'sonucudur. Bu oran, ilin fiilen tamamen kentleştiği anlamına gelmez. Mersin 2024 yılında ' +
      '60.574 kişi aldı, 54.703 kişi verdi. Net göç hızı binde +3,01 ile pozitif kaldı.',
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
    climateCurriculumNameTr: CURRICULUM_AKDENIZ,
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
 * ─────────────────────────────────────────────────────────────────────────────
 * WAVE 6d (Karadeniz-B) — 9 BRAND-NEW il — base data + Tier-B deep content
 * ─────────────────────────────────────────────────────────────────────────────
 * The FIRST wave to seed WHOLE NEW provinces (not add deep-content fields to already-
 * seeded rows like the deep-content waves 1-5): Tokat 60, Çorum 19, Sinop 57,
 * Kastamonu 37, Zonguldak 67, Bartın 74, Karabük 78, Düzce 81, Bolu 14 — the west/
 * central 9 of the Karadeniz region's 18 il (the east group is a parallel wave). These
 * are ALSO the platform's FIRST Karadeniz-region rows (the `geographic_region` enum has
 * carried KARADENIZ since the init migration, so NO schema change). Each row carries
 * FULL base data PLUS the 6-field Tier-B deep-content set from day one.
 *
 * SOURCE OF RECORD: NOVA's researched draft, INDEPENDENTLY fact-checked (verdict
 *   "SEED-READY WITH CORRECTIONS" — every base-data cell re-derived from its Tier-1
 *   source in a second pass with zero deviation; two production-blocking corrections
 *   applied before this seed: Bartın's wrong "en küçük il" claim fixed to "üçüncü en
 *   küçük" (after Yalova + Kilis), and internal-project jargon scrubbed from Bolu's
 *   introTr).
 *   • Draft:       Owner's Inbox/data-source-groundwork/wave6d-karadeniz-b-draft.md
 *   • Fact-check:  Owner's Inbox/data-source-groundwork/wave6d-karadeniz-b-factcheck.md
 *   • Ledger:      data-provenance.md (root) — wave-6d section
 * Per-field Tier-1 authorities (same as prior waves): Nüfus → TÜİK ADNKS 2025 (bülten
 *   53899); Yüzölçümü → HGM; İlçe sayısı → HGM satır sayımı (Tokat/Zonguldak WebSearch
 *   cross-checked); Rakım + koordinat → MGM il-merkez istasyonu ("Merkez", 9/9);
 *   Köppen → MGM 2023 raporu; Komşu iller → full 81-il GeoJSON `shapely` adjacency scan.
 *
 * KÖPPEN — MIXED, introduces the platform's FOURTH class (Cfb, see KOPPEN_CFB): 4×Cfa
 *   (Zonguldak 67, Bartın 74, Karabük 78, Düzce 81 — coastal), 3×Cfb (Çorum 19,
 *   Kastamonu 37, Bolu 14 — inland/highland warm-summer subtype), 2×Csa (Sinop 57,
 *   Tokat 60 — a GENUINE MGM reading, NOT forced to "Karadeniz": Sinop is the region's
 *   least-rainy coast, Tokat an inland rain-shadow valley; both ship the Csa "Akdeniz
 *   iklimi" label). Each il's caveat names its OWN code — the copy-paste guard.
 *
 * SİNOP ELEVATION — CLOSED by AN-1 (2026-08-04); seeded value is 32 m, not 0.
 *   THE WAVE-6d RECORD, KEPT AS SUPERSEDED (not deleted): MGM's literal "Merkez" record
 *   returns 0 m, and unlike Kahramanmaraş (wave-4) the GLOSSARY §1 same-coordinate
 *   exception could NOT be applied — Sinop's district dropdown has no coordinate-identical,
 *   non-broken "alias" record for Merkez (the OTHER 0 m record, Türkeli, shares ITS
 *   coordinate with Ayancık, a different point). So the literal 0 was seeded AS-IS and a
 *   sourced editorial correction was left an OPEN owner/Atlas call.
 *   WHAT CHANGED: that reasoning rested on "only Tier-2 alternatives exist", and a Tier-1
 *   one was then found — the SAME institution's own WMO/OSCAR station record (WIGOS
 *   0-20000-0-17026, station number 17026 in both records) gives 32 m. The forecast
 *   service's 0 is a null-value encoding, not a measurement: of the 81 provinces, 62 match an
 *   OSCAR station and 56 of those agree exactly. Exactly FOUR deviate by more than 15 m —
 *   these three 0 m rows AND Şırnak (plate 73, seeded 1.350 vs OSCAR 1.269), which is
 *   deliberately NOT touched here and remains a separate open board item. The same
 *   correction lands on Kocaeli (0→74) and Rize (0→3) in this PR.
 *
 * DEEP CONTENT — ALL 9 Tier-B (nüfus <1M, none büyükşehir → no Mardin-type exception).
 *   The 6-field set: introTr + (shortened) landformNoteTr + hydrographyNoteTr +
 *   urbanizationRate + netMigrationRate + economyIndicator. `hydrographyFeatures` AND
 *   `settlementNoteTr` are DELIBERATELY OMITTED (owner-approved Tier-B scope cut,
 *   DEC 2026-07-11 — absent keys normalised to null by withExplicitDetailNulls). All 9
 *   urbanizationRate values are REAL non-büyükşehir rates (none the 100.00 6360
 *   artifact). Each il opens on its OWN hook (kervan yolu / Hitit / en kuzey nokta /
 *   orman-dağ / kömür / nehir vadisi / demir-çelik / deprem / göl-otoyol), NOT a
 *   palette-swapped copy.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const WAVE6D_KARADENIZ_B_PROVINCES: readonly ProvinceSeed[] = [
  {
    plateCode: '60',
    nameTr: 'Tokat',
    slugTr: 'tokat',
    slugEn: 'tokat',
    region: GeographicRegion.Karadeniz,
    population: 614_141,
    populationYear: POPULATION_YEAR,
    areaKm2: 10_042,
    districtCount: 12,
    elevationM: 611, // MGM "Merkez" istasyonu
    latitude: 40.3312,
    longitude: 36.5577,
    // Amasya=05, Ordu=52, Samsun=55, Sivas=58, Yozgat=66 — 5 komşu (hiçbiri henüz seed edilmedi)
    neighborPlateCodes: ['05', '52', '55', '58', '66'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    climateCurriculumNameTr: CURRICULUM_KARADENIZ,
    climateCurriculumNoteTr:
      "Tokat'ın güneyi, Karadeniz ile İç Anadolu'yu ayıran dağlık kuşak üzerindedir; iklim " +
      'sınırı da bu kuşak boyunca geçer. Ders kitabı haritası il merkezini Karadeniz iklimi ' +
      'alanının güney kenarında gösterir. Kuzeydeki Niksar ve Erbaa ovaları, Yeşilırmak ve ' +
      'Kelkit vadileriyle kıyıya bağlanır. Komşu Amasya için de aynı ad kullanıldı.',
    // ── Tokat deep content (wave-6d Tier-B). 6-field set; hydrographyFeatures + settlementNoteTr
    //    DELIBERATELY omitted (Tier-B scope cut). Kervan yolu / Yeşilırmak-Kelkit vadisi hook.
    //    urbanizationRate 66.55 is a REAL non-büyükşehir rate; netMigrationRate +10.41 is the
    //    wave's highest positive. GSYH share %0,4.
    landformNoteTr:
      "İlin yer şekillerini Yeşilırmak ve Kelkit Irmağı vadileri belirler; iki ırmak Erbaa Ovası'nın " +
      'kuzeybatı kesiminde birleşir. Kazova, Turhal, Erbaa, Niksar ve Artova ovaları bu vadi ' +
      "tabanındaki başlıca düzlüklerdir. İlin güneyi, Karadeniz'i İç Anadolu'dan ayıran dağlık " +
      'kuşağın bir parçasıdır.',
    introTr:
      "Tokat, Kelkit Irmağı ile Yeşilırmak'ın birleştiği ova zincirinde kurulu bir Orta Karadeniz " +
      "ilidir. Osmanlı döneminde İran'dan gelen kervan yolunun Karadeniz limanlarına bağlandığı " +
      'güzergâh üzerinde bulunması, kenti tarihî bir ticaret ve konaklama merkezine dönüştürmüştür. ' +
      'Kazova, Erbaa ve Niksar ovaları bu ırmak vadisinin tarıma en elverişli kesimleridir.',
    hydrographyNoteTr:
      "İl topraklarını Yeşilırmak ve Kelkit Irmağı sular; iki ırmak Erbaa Ovası'nın kuzeybatısında " +
      "birleşerek Karadeniz'e doğru akışını sürdürür. Kelkit vadisinin genişlediği kesimlerde Niksar " +
      've Erbaa ovaları, birer çöküntü alanı olarak şekillenmiştir.',
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
    plateCode: '19',
    nameTr: 'Çorum',
    slugTr: 'corum',
    slugEn: 'corum',
    region: GeographicRegion.Karadeniz,
    population: 519_590,
    populationYear: POPULATION_YEAR,
    areaKm2: 12_428,
    districtCount: 14,
    elevationM: 776, // MGM "Merkez" istasyonu
    latitude: 40.5461,
    longitude: 34.9362,
    // Amasya=05, Çankırı=18, Kastamonu=37, Samsun=55, Sinop=57, Yozgat=66, Kırıkkale=71 — 7 komşu.
    // Tokat (60) DEĞİL: GeoJSON mesafesi ~0,18° (~20 km) — Amasya araya giriyor (draft Bölüm 1).
    neighborPlateCodes: ['05', '18', '37', '55', '57', '66', '71'],
    climateKoppen: KOPPEN_CFB,
    climateClassTr: CLIMATE_CLASS_CFB_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_CFB_TR,
    climateCurriculumNameTr: CURRICULUM_IC_ANADOLU,
    climateCurriculumNoteTr:
      'Çorum, 776 metredeki merkeziyle Kızılırmak havzasına açılan yüksek bir platodadır. İl ' +
      "Karadeniz Bölgesi'ndedir, iklim adı ise güneydeki İç Anadolu'yu gösterir. Her iki iklim " +
      'haritasında da Çorum, İç Anadolu karasal iklimi alanının kuzey ucunda kalır.',
    // ── Çorum deep content (wave-6d Tier-B). Cfb (inland/highland, warm-summer subtype). Hitit /
    //    Hattuşa UNESCO hook. GSYH share %0,4; netMigrationRate -12.82.
    landformNoteTr:
      "Karadeniz Bölgesi'nin karakteristik dağlık yapısı ilin kuzeyinde belirgindir; güneye doğru " +
      'geniş ova ve platolara bırakır. Kaldırım Tepe (1.776 m) ve Köse Dağı (2.087 m, ilin en yüksek ' +
      "noktası) başlıca yükseltilerdir. Çorum Ovası ile Kızılırmak'ın iki yakasındaki Dedesli Ovası, " +
      'alüvyonlu ve tarıma elverişli düzlüklerdir.',
    introTr:
      "Çorum, Kızılırmak'ın kollarıyla sulanan geniş bir plato üzerinde, Karadeniz ile İç Anadolu " +
      'arasındaki geçiş kuşağında yer alır. Boğazkale ilçesindeki Hattuşa, Hitit ' +
      "İmparatorluğu'nun başkenti olarak 1986'da UNESCO Dünya Mirası Listesi'ne girmiştir. İlin en " +
      "yüksek noktası, İskilip ile Kargı arasındaki 2.087 metrelik Köse Dağı'dır.",
    hydrographyNoteTr:
      'Türkiye topraklarında doğup denize dökülen en uzun akarsu olan Kızılırmak, güzergâhının ' +
      "bir bölümünü Çorum'da geçirir. Su Yönetimi Genel Müdürlüğü nehrin uzunluğunu 1.151 " +
      "kilometre verir. Millî Eğitim Bakanlığı'nın müfredat kaynaklarında yerleşik değer ise " +
      "1.355 kilometredir. İlin güneyini kateden Delice Irmağı, Kızılırmak'a katılan başlıca " +
      'koldur; ildeki ruhsatlı çeltik alanlarının beşte dördü ise kuzeydeki Kızılırmak boyunca ' +
      'uzanır.',
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
    plateCode: '57',
    nameTr: 'Sinop',
    slugTr: 'sinop',
    slugEn: 'sinop',
    region: GeographicRegion.Karadeniz,
    population: 225_848,
    populationYear: POPULATION_YEAR,
    areaKm2: 5717,
    districtCount: 9,
    // MGM Merkez istasyonu. Rakım: MGM'nin WMO/OSCAR kaydı, WIGOS 0-20000-0-17026 → 32 m
    // (erişim 2026-08-04; istasyon no 17026 iki kayıtta da aynı). Tahmin servisinin 0'ı ölçüm
    // değil, boş-değer kodlaması; wave-6d'nin "editoryal düzeltme OPEN" notu superseded (→ AN-1).
    elevationM: 32,
    latitude: 42.0299,
    longitude: 35.1545,
    // Çorum=19, Kastamonu=37, Samsun=55 — 3 komşu (+ kuzeyde Karadeniz kıyısı, kara komşusu değil).
    neighborPlateCodes: ['19', '37', '55'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    climateCurriculumNameTr: CURRICULUM_KARADENIZ,
    // ── Sinop deep content (wave-6d Tier-B). Csa (region's least-rainy coast — genuine MGM reading,
    //    NOT forced). En kuzey nokta / İnceburun hook. GSYH share %0,2 (wave's lowest).
    landformNoteTr:
      "Sinop kent merkezinin kurulduğu Boztepe Burnu'nda üst Kretase yaşlı volkanik kayaçlar " +
      'bulunur; Sinop Körfezi, karayla önündeki bir adanın birleşmesiyle oluşmuş bir tombolodur. ' +
      'İlin en kuzeyindeki İnceburun Yarımadası ise bataklık, göl ve düz arazilerden oluşan alçak ' +
      'bir kıyı şerididir.',
    introTr:
      "Sinop, Anadolu'nun en kuzeyindeki kara parçası olan İnceburun'un bulunduğu ildir. Kent " +
      'merkezi, Karadeniz kıyı şeridinin en çok sivrilerek uzandığı Boztepe Yarımadası üzerinde ' +
      'kuruludur; doğal limanı, kıyı boyunca sıralanan koylarla birleşerek bölgenin en eski yerleşim ' +
      "alanlarından birini oluşturmuştur. TÜİK'in 2025 verilerine göre Sinop, Türkiye'nin en yüksek " +
      'ortanca yaşına (44) sahip ilidir.',
    hydrographyNoteTr:
      "İnceburun Yarımadası'nın iç kesimindeki Sülük Gölü, eski bir volkanik kütlenin kalıntısıdır. " +
      "İlin akarsu ağı kısa ve dik eğimli derelerden oluşur; bunlar doğrudan Karadeniz'e dökülür.",
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
    plateCode: '37',
    nameTr: 'Kastamonu',
    slugTr: 'kastamonu',
    slugEn: 'kastamonu',
    region: GeographicRegion.Karadeniz,
    population: 379_934,
    populationYear: POPULATION_YEAR,
    areaKm2: 13_064,
    districtCount: 20,
    elevationM: 800, // MGM "Merkez" istasyonu
    latitude: 41.371,
    longitude: 33.7756,
    // Çankırı=18, Çorum=19, Sinop=57, Bartın=74, Karabük=78 — 5 komşu (+ kuzeyde Karadeniz kıyısı).
    neighborPlateCodes: ['18', '19', '57', '74', '78'],
    climateKoppen: KOPPEN_CFB,
    climateClassTr: CLIMATE_CLASS_CFB_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_CFB_TR,
    climateCurriculumNameTr: CURRICULUM_KARADENIZ,
    // ── Kastamonu deep content (wave-6d Tier-B). Cfb (highland, 800 m). Küre/Ilgaz orman-dağ geçiş
    //    kuşağı hook. netMigrationRate -12.90 (wave's highest negative alongside Karabük). GSYH %0,3.
    landformNoteTr:
      'Karadeniz sahiline paralel uzanan Küre Dağları il merkezinin kuzeyinde, doğu-batı doğrultulu ' +
      'Ilgaz Dağları ise güneyinde yer alır. Bu iki dağ sırası arasında ve eteklerinde, büyük bölümü ' +
      'ormanlarla kaplı yayla ve yarılmış platolar bulunur. Ilgaz yöresinin arazi yapısı büyük ölçüde ' +
      'serpantin, şist ve volkanik kayaçlardan oluşur.',
    introTr:
      'Kastamonu, Küre (İsfendiyar) Dağları ile Ilgaz Dağları arasında, Karadeniz kıyısı ile iç ' +
      'plato arasındaki geçiş kuşağında yer alan, topraklarının yaklaşık dörtte üçü dağlarla kaplı ' +
      "bir ildir. İlin en yüksek noktası, 2.587 metrelik Ilgaz Dağı'dır (Büyük Hacet Tepesi). Kıyı ve " +
      'iç kesimdeki yaylalar geniş ölçüde ormanlarla örtülüdür.',
    hydrographyNoteTr:
      'İlin başlıca akarsuyu Gökırmak, Küre ve Ilgaz dağları arasındaki plato ve vadilerden ' +
      "beslenerek Kastamonu Ovası'nı sular ve Kızılırmak'a bağlanır. Devrez Çayı ise Ilgaz Dağları " +
      'ile Devrez Vadisi arasındaki Tosya ormanlarını besleyen ikinci önemli koldur.',
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
    plateCode: '67',
    nameTr: 'Zonguldak',
    slugTr: 'zonguldak',
    slugEn: 'zonguldak',
    region: GeographicRegion.Karadeniz,
    population: 585_203,
    populationYear: POPULATION_YEAR,
    areaKm2: 3342,
    districtCount: 8,
    elevationM: 135, // MGM "Merkez" istasyonu
    latitude: 41.4492,
    longitude: 31.7779,
    // Bolu=14, Bartın=74, Karabük=78, Düzce=81 — 4 komşu (+ kuzeyde Karadeniz kıyısı).
    neighborPlateCodes: ['14', '74', '78', '81'],
    climateKoppen: KOPPEN_CFA,
    climateClassTr: CLIMATE_CLASS_CFA_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_CFA_TR,
    climateCurriculumNameTr: CURRICULUM_KARADENIZ,
    // ── Zonguldak deep content (wave-6d Tier-B). Cfa (coastal). Taşkömürü jeolojisi / Ereğli hook.
    //    GSYH share %0,5 (wave's highest); netMigrationRate -5.93.
    landformNoteTr:
      'İlin arazisi, vadilerle derin biçimde parçalanmış dağlık bir yapı gösterir; bu parçalı ' +
      'topografya, kömür damarlarının yüzeye yakın noktalarda ortaya çıkmasını da kolaylaştırmıştır. ' +
      'Kıyı şeridi dar ve kayalıktır, iç kesimlere doğru rakım hızla artar.',
    introTr:
      "Zonguldak, Türkiye'nin taşkömürü yataklarına sahip tek ilidir; Ereğli ilçesinde 1829'da " +
      'bulunan kömür damarları, ilin ekonomik kimliğini belirlemiştir. Kestaneci köyünden Uzun ' +
      "Mehmet'in bulduğu kabul edilen bu yataklar, Karbonifer döneminde göllerde biriken bitki " +
      'kalıntılarından oluşmuştur. Kok kömürüyle beslenen Ereğli Demir Çelik Fabrikaları, bu ' +
      'jeolojik mirasın sanayiye dönüşmüş hâlidir.',
    hydrographyNoteTr:
      'İlin en önemli akarsuyu Filyos Çayı, Karabük sınırından gelerek Zonguldak topraklarında ' +
      "Karadeniz'e ulaşır. Bol yağış alan yeşil doğa örtüsü, ilin vadilerle parçalanmış dağlık " +
      'yapısıyla birlikte akarsu ağının yoğunluğunu artırır.',
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
    plateCode: '74',
    nameTr: 'Bartın',
    slugTr: 'bartin',
    slugEn: 'bartin',
    region: GeographicRegion.Karadeniz,
    population: 206_663,
    populationYear: POPULATION_YEAR,
    areaKm2: 2330,
    districtCount: 4,
    elevationM: 33, // MGM "Merkez" istasyonu
    latitude: 41.6248,
    longitude: 32.3569,
    // Kastamonu=37, Zonguldak=67, Karabük=78 — 3 komşu (+ kuzeyde Karadeniz kıyısı); wave'in en az
    // komşulu + yüzölçümü en küçük ili.
    neighborPlateCodes: ['37', '67', '78'],
    climateKoppen: KOPPEN_CFA,
    climateClassTr: CLIMATE_CLASS_CFA_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_CFA_TR,
    climateCurriculumNameTr: CURRICULUM_KARADENIZ,
    // ── Bartın deep content (wave-6d Tier-B). Cfa (coastal). Bartın Çayı vadisi hook; introTr carries
    //    the fact-check CORRECTION ("üçüncü en küçük il", after Yalova + Kilis — NOT "en küçük").
    //    urbanizationRate 49.73 is the wave's lowest; netMigrationRate -0.63 the most balanced.
    landformNoteTr:
      "Bartın Çayı'nın 2.059 km²'lik su toplama havzası, kolların yarmasıyla oluşmuş üç farklı " +
      'seviyede plato alanına ayrılır: 750-1.000 m arası en yüksek platolar, 500-750 m arası yüksek ' +
      'platolar ve 200-500 m arası alçak platolar. Ulus ilçesi, Ulus ve Eldeş çaylarının birleştiği ' +
      'bir vadi tabanında kuruludur.',
    introTr:
      'Bartın, kimliğini büyük ölçüde aynı adı taşıyan çayın oluşturduğu vadiden alır. Yüzölçümü ' +
      "bakımından Türkiye'nin üçüncü en küçük ilidir; bu sıralamada yalnızca Yalova ve Kilis daha " +
      "küçüktür. Amasra ilçesi, dik yamaçların Karadeniz'le buluştuğu yedi tepe ve beş yarımada " +
      'üzerinde kurulu tarihî bir liman kentidir. Kurucaşile ise antik dönemden bu yana geleneksel ' +
      'ahşap tekne yapımıyla tanınır.',
    hydrographyNoteTr:
      "Bartın Çayı, havzasının genel eğim yönü olan kuzeybatıya doğru akarak Karadeniz'e dökülür; 8 " +
      "alt havzadan beslenir. Amasra kıyısındaki koylar ve Kurucaşile'nin zeytin ile sandal " +
      'burunlarına bitişik limanları, çayın taşıdığı alüvyonla şekillenen kıyı çizgisinin parçasıdır.',
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
    plateCode: '78',
    nameTr: 'Karabük',
    slugTr: 'karabuk',
    slugEn: 'karabuk',
    region: GeographicRegion.Karadeniz,
    population: 249_614,
    populationYear: POPULATION_YEAR,
    areaKm2: 4142,
    districtCount: 6,
    elevationM: 485, // MGM "Merkez" istasyonu
    latitude: 41.2327,
    longitude: 32.6294,
    // Çankırı=18, Kastamonu=37, Bartın=74, Zonguldak=67, Bolu=14 — 5 komşu.
    neighborPlateCodes: ['18', '37', '74', '67', '14'],
    climateKoppen: KOPPEN_CFA,
    climateClassTr: CLIMATE_CLASS_CFA_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_CFA_TR,
    climateCurriculumNameTr: CURRICULUM_KARADENIZ,
    // ── Karabük deep content (wave-6d Tier-B). Cfa (coastal-influenced). Demir-çelik sanayii hook.
    //    urbanizationRate 77.69 is the wave's highest; netMigrationRate -14.31 the wave's highest
    //    negative. GSYH share %0,2.
    landformNoteTr:
      'İlin coğrafi yapısı ormanlık alanlar, akarsu vadileri ve yüksek platolardan oluşur. Yenice ' +
      'ilçesindeki geniş orman örtüsü, kayın, gürgen, dişbudak, Türk fındığı ve porsuk gibi türlerle ' +
      'zengin bir biyolojik çeşitlilik barındırır.',
    introTr:
      'Karabük, Cumhuriyet döneminin en önemli ağır sanayi atılımlarından biri olan Demir ve Çelik ' +
      "Fabrikaları'nın 3 Nisan 1937'de temeli atılan ilidir. Aynı zamanda Yenice ilçesindeki Yenice " +
      "Ormanları, Türkiye'nin en büyük blok ormanı olarak 1999'da WWF tarafından " +
      '"acil korunması gereken 100 sıcak nokta"dan biri ilan edilmiştir. İl, Karadeniz limanları ile ' +
      'İç Anadolu arasında bir geçiş noktası oluşturur.',
    hydrographyNoteTr:
      'Filyos Çayı (yukarı havzada Soğanlı ve Araç çaylarının birleşimiyle oluşur), Karabük ' +
      "topraklarından geçerek Zonguldak'a ulaşır ve Demir Çelik Fabrikaları'nın su ihtiyacında da rol " +
      'oynar. Yenice Ormanları, bu akarsu ağının besleyici etkisiyle yüksek nem oranını korur.',
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
    plateCode: '81',
    nameTr: 'Düzce',
    slugTr: 'duzce',
    slugEn: 'duzce',
    region: GeographicRegion.Karadeniz,
    population: 415_622,
    populationYear: POPULATION_YEAR,
    areaKm2: 2492,
    districtCount: 8,
    elevationM: 146, // MGM "Merkez" istasyonu
    latitude: 40.8437,
    longitude: 31.1488,
    // Bolu=14, Sakarya=54, Zonguldak=67 — 3 komşu (+ kuzeyde kısa Karadeniz kıyı şeridi, Akçakoca).
    // Sakarya (Marmara Bölgesi) ile komşuluk = bölgeler-arası kenar durumu (GeoJSON ile doğrulandı).
    neighborPlateCodes: ['14', '54', '67'],
    climateKoppen: KOPPEN_CFA,
    climateClassTr: CLIMATE_CLASS_CFA_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_CFA_TR,
    climateCurriculumNameTr: CURRICULUM_KARADENIZ,
    // ── Düzce deep content (wave-6d Tier-B). Cfa (coastal-influenced). 1999 Kuzey Anadolu Fayı /
    //    deprem kuşağı hook. urbanizationRate 70.60; netMigrationRate +3.89; GSYH share %0,4.
    landformNoteTr:
      "Düzce Ovası, komşu Hendek Ovası'ndan (Sakarya) 250-300 metrelik bir sırtla ayrılır; bu çöküntü " +
      'alanı neotektonik dönemde şekillenmiştir. Havzayı güneyden çevreleyen Elmacık Dağı kütlesi, ' +
      'Kuvaterner döneminde Kuzey Anadolu Fayı ile Düzce Fayı arasında yükselmiştir.',
    introTr:
      "Düzce, Kuzey Anadolu Fay zonunun kuzey kolu üzerinde yer alır; 12 Kasım 1999'da Mw 7,2 " +
      'büyüklüğünde bir deprem, 17 Ağustos 1999 Gölcük depreminden 87 gün sonra ilin altındaki fay ' +
      "hattının doğu kesimini kırmıştır. İl, Bolu ve Zonguldak'ın yanı sıra Sakarya (Marmara Bölgesi) " +
      'ile de komşudur — Karadeniz ile Marmara arasındaki geçiş konumunu yansıtan bir sınır ilidir.',
    hydrographyNoteTr:
      "Küçük Melen, Asarsu ve Aksu çayları Düzce Ovası'nı besleyen başlıca akarsulardır; üçü de " +
      "havzanın güneybatısındaki Efteni Gölü'ne dökülür. 1999 depreminde en büyük düşey yer " +
      "değiştirme, Efteni Gölü'nün güneyinde ölçülmüştür.",
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
    plateCode: '14',
    nameTr: 'Bolu',
    slugTr: 'bolu',
    slugEn: 'bolu',
    region: GeographicRegion.Karadeniz,
    population: 327_173,
    populationYear: POPULATION_YEAR,
    areaKm2: 8313,
    districtCount: 9,
    elevationM: 743, // MGM "Merkez" istasyonu
    latitude: 40.7329,
    longitude: 31.6022,
    // Ankara=06, Bilecik=11, Düzce=81, Eskişehir=26, Karabük=78, Sakarya=54, Zonguldak=67,
    // Çankırı=18 — 8 komşu (wave'in en fazla komşulu ili). Ankara/Bilecik/Sakarya bu 8'i ZATEN
    // kendi neighborPlateCodes'unda listeler (tam-komşu-seti-per-il modeli — çift yönlü giriş
    // gerektirmez), bkz. closing-summary "neighbor bidirectionality".
    neighborPlateCodes: ['06', '11', '81', '26', '78', '54', '67', '18'],
    climateKoppen: KOPPEN_CFB,
    climateClassTr: CLIMATE_CLASS_CFB_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_CFB_TR,
    climateCurriculumNameTr: CURRICULUM_KARADENIZ,
    // ── Bolu deep content (wave-6d Tier-B). Cfb (highland, 743 m). Göl / otoyol geçiş kuşağı hook;
    //    introTr is the JARGON-SCRUBBED version (internal "bu dalgadaki 9 il" phrasing removed by the
    //    fact-check, fact 8-komşu preserved). urbanizationRate 74.19; netMigrationRate +1.55; GSYH %0,4.
    landformNoteTr:
      'Köroğlu Dağları, 2.499 metrelik zirvesiyle ilin en yüksek dağ sırasıdır; neojen volkanik ' +
      'seriden oluşur, lav yapısında andezit ağırlıklıdır. Abant Dağları ise 1.785 metre ' +
      'yükseklikte, kireçtaşı ana kayalı bir silsile olup Karadeniz kıyısına bağlı öksin flora ile İç ' +
      "Anadolu'ya bağlı step (İran-Turan) florası arasında bir geçiş sınırı oluşturur.",
    introTr:
      "Bolu, İstanbul ile Ankara'yı bağlayan D-100 karayolu ve TEM otoyolunun geçtiği, Marmara ile " +
      'Karadeniz bölgeleri arasındaki en işlek geçiş kuşaklarından birinde yer alır. Abant Dağları ' +
      'üzerindeki krater/birikinti kökenli Abant Gölü, 1.325 metre rakımda, 125 hektarlık ' +
      "yüzölçümüyle ilin en tanınan doğal alanıdır. İl, sekiz komşusuyla Türkiye'deki illerin " +
      'çoğundan daha fazla komşuya sahiptir.',
    hydrographyNoteTr:
      "Abant Gölü'nün dışında ilin su varlığı, Köroğlu ve Abant dağlarından inen kısa akarsu ağıyla " +
      'sınırlıdır; bu dereler Sakarya Nehri havzasına bağlanır. Gölün kendisi dışa akışı olmayan ' +
      'kapalı bir havza karakterindedir.',
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
];

/**
 * BATCH 2 — WAVE 6b il seed data — Doğu Anadolu (13 il, Van hariç): Ağrı, Ardahan,
 * Bingöl, Bitlis, Elazığ, Erzincan, Erzurum, Hakkari, Iğdır, Kars, Malatya, Muş, Tunceli.
 * (Van is Doğu Anadolu's 14th province but is already seeded in PILOT_PROVINCES with its
 * wave-1 deep content, so it is not repeated here.) This batch COMPLETES the Doğu Anadolu
 * region and — landing alongside its three wave-6 siblings (6a/6c/6d, disjoint provinces) —
 * brings the platform to all 81 il.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROVENANCE (traceability — CONVENTIONS §4: no sourceless facts)
 * ─────────────────────────────────────────────────────────────────────────────
 * SOURCE OF RECORD: NOVA's researched draft, INDEPENDENTLY fact-checked — verdict
 *   "SEED-READY WITH CORRECTIONS" (all three applied before seeding): (1) Malatya introTr
 *   kayısı stat reframed to "dünya kuru kayısı üretiminin yaklaşık %85'i" (the source says
 *   "dünya", not "Türkiye"); (2) Tunceli neighbor Sivas 58 REMOVED (geojson + both il's own
 *   Wikipedia pages disagree — Erzincan/Elazığ sit between); (3) Elazığ Keban Barajı figures
 *   corrected to 1.330 MW installed / 6,6 milyar kWh annual (EÜAŞ + TR Wikipedia — the
 *   Belediye source's 134 MW / 7,5 milyar kWh were both wrong).
 *   • Draft:      Owner's Inbox/data-source-groundwork/wave6b-dogu-anadolu-draft.md
 *   • Fact-check: Owner's Inbox/data-source-groundwork/wave6b-dogu-anadolu-factcheck.md
 *   • Ledger:     data-provenance.md (root) — wave-6b
 * Per-field Tier-1 authorities (same as every prior batch): Nüfus 31.12.2025 → TÜİK ADNKS
 *   2025 (bülten 53899); Yüzölçümü → HGM; İlçe sayısı → e-İçişleri; Rakım+koordinat →
 *   MGM il-merkez istasyonu; Köppen → MGM 2023 raporu; Komşu iller → Tier-2, SYMMETRICALLY
 *   cross-validated against the already-locked neighborPlateCodes of Van (04/13/30), Batman
 *   (49/13), Diyarbakır (12/23/44/49), Siirt (13), Şırnak (30), Adıyaman (44), Kahramanmaraş
 *   (44) — every wave-6b↔seeded and wave-6b↔wave-6b adjacency confirmed bidirectional.
 *
 * MGM default-station notes: Erzurum → Yakutiye (no "Merkez" ilçe since 2012; the city is
 *   split into Aziziye/Palandöken/Yakutiye metropol ilçeler — same category as Diyarbakır/
 *   Bağlar). Malatya → the MGM service still labels its station "Merkez" although Malatya has
 *   no "Merkez" ilçe (real merkez ilçeler Battalgazi/Yeşilyurt) — a historical MGM label
 *   remnant, NOT a broken-record case (the 950 m elevation is physically sound, so the
 *   GLOSSARY §1 exception does NOT fire). Recorded inline on each elevationM.
 *
 * KÖPPEN — FOUR new codes this batch (see the D-group/BSk constants above): Dfb/Dsb/Dsa →
 *   "Karasal iklim" (a single family name — deliberate, unlike the C-group split), BSk →
 *   "Yarı Kurak Step İklimi", all LOCKED (→ DEC 2026-07-12). Bingöl/Erzincan/Tunceli are Csa
 *   and reuse the shared Csa constants. Each row's climateNoteTr names its own code, so the
 *   Köppen⇒caveat invariant holds (assertKoppenCaveatInvariant, seed-geography.ts).
 *
 * DEPTH — ALL 13 are Tier-B (every il <1M pop): the 6-field set (introTr, shortened landform/
 *   hydrography, urbanizationRate, netMigrationRate, economyIndicator); hydrographyFeatures is
 *   OMITTED for all (→ null via withExplicitDetailNulls). TWO carry the büyükşehir-exception
 *   settlementNoteTr (→ DEC 2026-07-12, Mardin precedent): Erzurum 25 and Malatya 44 are legal
 *   büyükşehir despite <1M pop, so their urbanizationRate=100 is the 6360-Kanun artifact and
 *   each gets ONLY the single 6360 caveat sentence (no migration narrative — that number lives
 *   in netMigrationRate). The other 11 have a REAL (<100) urbanizationRate and NO
 *   settlementNoteTr. Malatya is the wave's SOLE positive net migration (+6.88 ‰); Ağrı's
 *   -32.59 ‰ is among the wave's most negative. No factual value invented; every number/name
 *   transcribed from the fact-checked draft. No schema/DTO/OpenAPI change (every field exists
 *   since the İstanbul pilot).
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const WAVE6B_DOGU_ANADOLU_PROVINCES: readonly ProvinceSeed[] = [
  {
    plateCode: '04',
    nameTr: 'Ağrı',
    slugTr: 'agri',
    slugEn: 'agri',
    region: GeographicRegion.DoguAnadolu,
    population: 491_489,
    populationYear: POPULATION_YEAR,
    areaKm2: 11_099,
    districtCount: 8,
    elevationM: 1646, // MGM Merkez istasyonu
    latitude: 39.7253,
    longitude: 43.0522,
    // Kars=36, Iğdır=76, Erzurum=25, Muş=49, Bitlis=13, Van=65 (+ İran — ülke, hariç)
    neighborPlateCodes: ['36', '76', '25', '49', '13', '65'],
    climateKoppen: KOPPEN_DSB,
    climateClassTr: CLIMATE_CLASS_D_GROUP_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_DSB_TR,
    climateCurriculumNameTr: CURRICULUM_DOGU_ANADOLU,
    // ── Ağrı deep content (wave-6b Tier-B). 6-field set (hydrographyFeatures + settlementNoteTr
    //    OMITTED). urbanizationRate=62.76 is a REAL rate (non-büyükşehir). netMigrationRate
    //    -32.59 is among the wave's most-negative (near Siirt's -33.96 record). GSYH share %0,2.
    landformNoteTr:
      'Ağrı Dağı, ana zirve Büyük Ağrı ile güneydoğusundaki 3.896 metrelik Küçük ' +
      "Ağrı'dan oluşan bir volkanik kütledir. Zirvede yaklaşık 10 km²'lik bir buzul örtüsü " +
      'bulunur; kalıcı kar sınırı 4.300 metre civarındadır. İlin batısında Aras vadisine ' +
      'açılan düzlükler, doğusunda ise Tendürek volkanik kütlesinin uzantıları yer alır.',
    introTr:
      "Türkiye'nin en yüksek zirvesi olan 5.137 metrelik Ağrı Dağı, ilin kuzeydoğusunda " +
      'yükselir. Bileşik bir stratovolkan olan dağ, ülkenin sürekli buzul örtüsü bulunan tek ' +
      "zirvesidir. İl, Murat ve Aras nehir havzaları arasında, Doğu Anadolu Bölgesi'nin " +
      'doğusunda yer alır.',
    hydrographyNoteTr:
      "Murat Nehri'nin kaynak kollarından biri, ilin Diyadin ilçesi yakınlarından doğar; " +
      'nehir buradan batıya, Muş yönüne akar. İlin kuzeyinde Aras Nehri, Doğubayazıt ve ' +
      "Tuzluca arasındaki vadiyi izleyerek Iğdır'a geçer.",
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
    plateCode: '75',
    nameTr: 'Ardahan',
    slugTr: 'ardahan',
    slugEn: 'ardahan',
    region: GeographicRegion.DoguAnadolu,
    population: 90_392,
    populationYear: POPULATION_YEAR,
    areaKm2: 4934,
    districtCount: 6,
    elevationM: 1827, // MGM Merkez istasyonu
    latitude: 41.1061,
    longitude: 42.7055,
    // Artvin=08, Erzurum=25, Kars=36 (+ Gürcistan, Ermenistan — ülke, hariç)
    neighborPlateCodes: ['08', '25', '36'],
    climateKoppen: KOPPEN_DSB,
    climateClassTr: CLIMATE_CLASS_D_GROUP_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_DSB_TR,
    climateCurriculumNameTr: CURRICULUM_DOGU_ANADOLU,
    // ── Ardahan deep content (wave-6b Tier-B). 6-field set. urbanizationRate=45.19 is the
    //    wave's LOWEST — a REAL (non-büyükşehir) rate, not a legal artifact. GSYH share %0,1.
    landformNoteTr:
      "İlin en yüksek noktası, Çıldır Gölü'nün güneybatısında yer alan 3.197 metrelik Kısır " +
      "Dağı'dır. Gölün kuzeydoğusunda 3.033 metrelik Keldağ, doğusunda ise 3.026 metrelik " +
      'Akbaba Dağı yükselir. Çıldır Gölü, bir lav akıntısı ile moloz konisinin birlikte ' +
      'oluşturduğu doğal bir set gölüdür; en derin noktası 42 metredir.',
    introTr:
      "Ardahan, 90.392 kişilik nüfusuyla Türkiye'nin en az nüfuslu üçüncü ilidir. İlin " +
      "doğusunda yer alan Çıldır Gölü, 123 km² yüzölçümüyle Doğu Anadolu Bölgesi'nin en büyük " +
      'tatlı su gölüdür. İl, Gürcistan ve Ermenistan sınırına yakın, yüksek bir plato üzerinde ' +
      'kuruludur.',
    hydrographyNoteTr:
      "İl toprakları, kuzeyde Kura, güneyde Aras nehir havzaları arasında kalır. Çıldır Gölü'nü " +
      "besleyen sular, Arpaçayı aracılığıyla Aras Irmağı'na ulaşır.",
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
    plateCode: '12',
    nameTr: 'Bingöl',
    slugTr: 'bingol',
    slugEn: 'bingol',
    region: GeographicRegion.DoguAnadolu,
    population: 282_299,
    populationYear: POPULATION_YEAR,
    areaKm2: 8003,
    districtCount: 8,
    elevationM: 1139, // MGM Merkez istasyonu
    latitude: 38.8847,
    longitude: 40.5007,
    // Muş=49, Erzincan=24, Erzurum=25, Tunceli=62, Elazığ=23, Diyarbakır=21
    neighborPlateCodes: ['49', '24', '25', '62', '23', '21'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    climateCurriculumNameTr: CURRICULUM_DOGU_ANADOLU,
    // ── Bingöl deep content (wave-6b Tier-B). 6-field set. Karlıova is the KAF-DAF fault
    //    junction, framed strictly as geology (Erzincan/İzmir/Kocaeli precedent). urbanizationRate
    //    70.55 is a REAL rate (non-büyükşehir). GSYH share %0,2.
    landformNoteTr:
      'İlin doğusunda Bingöl Dağları, batısında Şerafettin Dağları yükselir. Karlıova Havzası, ' +
      'Kuzey Anadolu, Doğu Anadolu ve Varto fay zonlarının kesiştiği bölgede, yoğun tektonik ' +
      'hareketlilikle oluşmuş yükselti ve çöküntü alanlarından oluşur.',
    introTr:
      "Bingöl'ün Karlıova ilçesi, Türkiye'nin en aktif iki fay hattı olan Kuzey Anadolu Fayı " +
      "ile Doğu Anadolu Fayı'nın kesiştiği noktada yer alır; dünyada benzerine az rastlanan bir " +
      "tektonik kavşaktır. İl, Doğu Anadolu Bölgesi'nin batısında, Bingöl ve Şerafettin dağları " +
      'arasında kuruludur.',
    hydrographyNoteTr:
      'Peri Suyu, Karagöl ve Bingöl dağlarındaki kaynak sularının ' +
      "Karlıova'nın kuzeybatısında birleşmesiyle oluşur; vadisi, Bingöl ile Tunceli arasındaki " +
      'doğal sınırı çizer. Karlıova çevresindeki göllerin en büyüğü, Kargapazar köyü ' +
      "yakınındaki Gölbahri Gölü'dür.",
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
    plateCode: '13',
    nameTr: 'Bitlis',
    slugTr: 'bitlis',
    slugEn: 'bitlis',
    region: GeographicRegion.DoguAnadolu,
    population: 360_423,
    populationYear: POPULATION_YEAR,
    areaKm2: 8294,
    districtCount: 7,
    elevationM: 1789, // MGM Merkez istasyonu
    latitude: 38.475,
    longitude: 42.1625,
    // Muş=49, Ağrı=04, Van=65, Siirt=56, Batman=72
    neighborPlateCodes: ['49', '04', '65', '56', '72'],
    climateKoppen: KOPPEN_DSA,
    climateClassTr: CLIMATE_CLASS_D_GROUP_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_DSA_TR,
    climateCurriculumNameTr: CURRICULUM_DOGU_ANADOLU,
    // ── Bitlis deep content (wave-6b Tier-B). 6-field set. The Nemrut Dağı here is the Bitlis
    //    crater-lake volcano — a DIFFERENT, homonymous mountain from Adıyaman's UNESCO Nemrut
    //    (wave-5). urbanizationRate 66.88 is a REAL rate. GSYH share %0,2.
    landformNoteTr:
      'İl toprakları dört coğrafi bölüme ayrılır: kuzeyde Ahlat Düzlüğü, onun güneyinde Nemrut ' +
      'Stratovolkanı, ortada Van-Muş havzasının bir kesimi ve güneyde Bitlis Masifi. ' +
      "Nemrut'un krater gölü ile kuzeyindeki Nazik Gölü, bu volkanik kütlenin iki gölüdür.",
    introTr:
      "Nemrut Dağı'nın krater gölü, Ahlat, Güroymak ve Tatvan ilçe sınırları içinde, Van " +
      "Gölü'nün batısında yer alır. Uykuda bir yanardağ olan Nemrut, son olarak 1441'de lav " +
      "çıkarmıştır. İl, Van Gölü'nün güneybatı kıyısından güneye, Bitlis Masifi'ne uzanan " +
      'dağlık bir arazi üzerinde kuruludur.',
    hydrographyNoteTr:
      "İlin kuzeyinde Van Gölü'nün bir kesimi yer alır; göl suyu tuzlu ve sodalıdır. Bitlis " +
      'kent merkezinden geçen Bitlis Çayı ise güneye akarak Dicle Nehri sistemine katılır. İl ' +
      "toprakları böylece hem Van'ın kapalı havzasına hem Dicle'nin açık havzasına su verir.",
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
    plateCode: '23',
    nameTr: 'Elazığ',
    slugTr: 'elazig',
    slugEn: 'elazig',
    region: GeographicRegion.DoguAnadolu,
    population: 605_678,
    populationYear: POPULATION_YEAR,
    areaKm2: 9383,
    districtCount: 11,
    elevationM: 881, // MGM Merkez istasyonu
    latitude: 38.6058,
    longitude: 39.2973,
    // Bingöl=12, Tunceli=62, Erzincan=24, Malatya=44, Diyarbakır=21
    neighborPlateCodes: ['12', '62', '24', '44', '21'],
    climateKoppen: KOPPEN_BSK,
    climateClassTr: CLIMATE_CLASS_BSK_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_BSK_TR,
    climateCurriculumNameTr: CURRICULUM_DOGU_ANADOLU,
    // ── Elazığ deep content (wave-6b Tier-B). 6-field set. Keban Barajı figures are the
    //    fact-check CORRECTION (1.330 MW / 6,6 milyar kWh per EÜAŞ — the Belediye source's
    //    134 MW / 7,5 milyar kWh were both wrong). urbanizationRate 80.09 is a REAL rate. GSYH %0,5.
    landformNoteTr:
      'İl merkezinin güneydoğusunda, yaklaşık 25 kilometre uzaklıktaki Hazar Gölü, tektonik ' +
      "kökenli bir göldür. Gölün güneydoğusundan süzülen sular, Behremaz Deresi'yle " +
      "birleşerek Dicle Nehri'nin kaynak kollarından birini oluşturur — Elazığ toprakları " +
      'böylece hem Fırat hem Dicle havzalarına su verir.',
    introTr:
      "Keban Baraj Gölü, Murat vadisi boyunca 125 kilometre uzunluğuyla Türkiye'nin en büyük " +
      "yapay gölüdür. İlin güney kesimi dışında tamamı Fırat Havzası'nda kalan Elazığ, " +
      "Doğu Anadolu Bölgesi'nin batı ucunda kuruludur.",
    hydrographyNoteTr:
      "Fırat Nehri, ilk kaynaklarını Van Gölü'nün kuzeyindeki Aladağ'ın kuzey eteklerinden alır " +
      "ve batıya akarak Palu ilçesinden geçtikten sonra Keban Baraj Gölü'ne dökülür. " +
      "1965'te inşasına başlanan Keban Barajı, 1974-1981 arasında kademeli olarak devreye " +
      "girmiş; kurulu gücü 1.330 MW, yıllık ortalama enerji üretimi 6,6 milyar kWh'tir.",
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
    plateCode: '24',
    nameTr: 'Erzincan',
    slugTr: 'erzincan',
    slugEn: 'erzincan',
    region: GeographicRegion.DoguAnadolu,
    population: 239_625,
    populationYear: POPULATION_YEAR,
    areaKm2: 11_815,
    districtCount: 9,
    elevationM: 1216, // MGM Merkez istasyonu
    latitude: 39.7523,
    longitude: 39.4868,
    // Erzurum=25, Sivas=58, Tunceli=62, Bingöl=12, Elazığ=23, Malatya=44, Gümüşhane=29, Bayburt=69, Giresun=28
    neighborPlateCodes: ['25', '58', '62', '12', '23', '44', '29', '69', '28'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    climateCurriculumNameTr: CURRICULUM_DOGU_ANADOLU,
    // ── Erzincan deep content (wave-6b Tier-B). 6-field set. The 1939 quake is handled factual/
    //    short (Kandilli/AFAD-sourced, KAF context — Kocaeli/İzmir precedent). urbanizationRate
    //    75.99 is a REAL rate (non-büyükşehir). GSYH share %0,2.
    landformNoteTr:
      'Erzincan, Kuzey Anadolu Fay Hattı üzerinde yer alan tektonik bir çöküntü ovasında ' +
      'kuruludur; ova, deniz seviyesinden yaklaşık 1.200 metre yükseklikte, kuzeyde ve güneyde ' +
      "yüksek dağ sıralarıyla çevrilidir. Batıda Munzur Dağları, güneyde Bingöl Dağları'nın " +
      'uzantıları ilin dağlık kesimlerini oluşturur.',
    introTr:
      "27 Aralık 1939'da merkez üssü Erzincan olan, Kandilli Rasathanesi kayıtlarına göre 7,9 " +
      "büyüklüğündeki deprem, Türkiye'nin 20. yüzyılda yaşadığı en yıkıcı doğal afetlerden " +
      'biridir; resmi kayıtlara göre 32.968 kişi hayatını kaybetmiştir. İl, Kuzey Anadolu Fay ' +
      "Hattı'nın doğu ucuna yakın bir tektonik çöküntü ovasında kuruludur. TÜİK'in 2025 " +
      "verilerine göre kilometrekareye 21 kişi düşen Erzincan, Türkiye'nin en düşük nüfus " +
      'yoğunluğuna sahip illerinden biridir.',
    hydrographyNoteTr:
      "İlin ortasından geçen Karasu, Fırat Nehri'nin iki ana kaynak kolundan biridir; Erzincan " +
      'Ovası boyunca batıya akar.',
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
    plateCode: '25',
    nameTr: 'Erzurum',
    slugTr: 'erzurum',
    slugEn: 'erzurum',
    region: GeographicRegion.DoguAnadolu,
    population: 736_877,
    populationYear: POPULATION_YEAR,
    areaKm2: 25_006,
    districtCount: 20,
    elevationM: 1860, // MGM Yakutiye istasyonu (büyükşehir — ayrı "Merkez" ilçesi yok, 3 metropol ilçe)
    latitude: 39.9058,
    longitude: 41.2544,
    // Bayburt=69, Erzincan=24, Bingöl=12, Muş=49, Ağrı=04, Kars=36, Ardahan=75, Artvin=08, Rize=53
    neighborPlateCodes: ['69', '24', '12', '49', '04', '36', '75', '08', '53'],
    climateKoppen: KOPPEN_DFB,
    climateClassTr: CLIMATE_CLASS_D_GROUP_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_DFB_TR,
    climateCurriculumNameTr: CURRICULUM_DOGU_ANADOLU,
    // ── Erzurum deep content (wave-6b Tier-B + büyükşehir EXCEPTION → DEC 2026-07-12, Mardin
    //    precedent). Tier-B depth (hydrographyFeatures OMITTED), BUT büyükşehir, so
    //    urbanizationRate=100 is the 6360 legal artifact carrying ONLY the single-sentence
    //    settlementNoteTr (no migration narrative). Türkiye's most-neighboured il (9). GSYH %0,5.
    landformNoteTr:
      'Erzurum, ortalama yüksekliği 2.000 metreyi bulan geniş platolar üzerinde yer alır; bu ' +
      'platoların üzerinde yükselen dağların çoğu 3.000 metreyi aşar. Kentin güneyinde uzanan ' +
      'Palandöken Dağları, 3.176 metrelik Büyük Ejder Tepesi ile ilin en yüksek noktalarından ' +
      'birini oluşturur; doğu-batı doğrultusunda yaklaşık 70 kilometre uzanır. İlin ' +
      'kuzeydoğusunda Allahuekber Dağları, doğusunda Kargapazarı Dağı yükselir; bu dağlık ' +
      'çevrenin ortasında Erzurum ve Pasinler ovaları kalır.',
    introTr:
      "Erzurum kent merkezi, 1.860 metre rakımıyla Türkiye'nin en yüksek rakımlı büyük " +
      "şehirlerinden biridir. İl, Doğu Anadolu Bölgesi'nin kuzeydoğusunda, geniş platolar " +
      'üzerinde kuruludur. Dokuz ayrı ille sınır komşusu olan Erzurum, bu özelliğiyle ' +
      "Türkiye'nin en çok komşuya sahip ilidir.",
    hydrographyNoteTr:
      "Aras Nehri'nin başlıca kaynak kollarından biri, ilin Tekman ilçesi yaylalarından doğar; " +
      "nehir buradan Pasinler Ovası'nı geçerek kuzeydoğuya, Kars-Erzurum platosuna yönelir. " +
      'İlin kuzeyinde, İspir ve Tortum ilçeleri çevresinde doğan Çoruh Nehri ise ' +
      "Karadeniz'e ulaşan ayrı bir akarsu sistemidir.",
    urbanizationRate: 100.0,
    netMigrationRate: -15.86,
    settlementNoteTr:
      "Erzurum'un TÜİK il/ilçe merkezi nüfus oranı, büyükşehir statüsündeki illerde olduğu gibi " +
      "%100'dür — belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı Kanun) " +
      'bir sonucudur. Bu oran, ilin fiilen tamamen kentleştiği anlamına gelmez.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,5',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    plateCode: '30',
    nameTr: 'Hakkari',
    slugTr: 'hakkari',
    slugEn: 'hakkari',
    region: GeographicRegion.DoguAnadolu,
    population: 279_681,
    populationYear: POPULATION_YEAR,
    areaKm2: 7095,
    districtCount: 5,
    elevationM: 1727, // MGM Merkez istasyonu
    latitude: 37.5744,
    longitude: 43.7388,
    // Van=65, Şırnak=73 (+ İran, Irak — ülke, hariç)
    neighborPlateCodes: ['65', '73'],
    climateKoppen: KOPPEN_DSA,
    climateClassTr: CLIMATE_CLASS_D_GROUP_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_DSA_TR,
    climateCurriculumNameTr: CURRICULUM_DOGU_ANADOLU,
    // ── Hakkari deep content (wave-6b Tier-B). 6-field set. Türkiye içinde SADECE 2 komşu (Van,
    //    Şırnak — both symmetric). Cilo-Sat is stated as "one of the highest massifs", no exact
    //    ranking claim (deliberate). urbanizationRate 66.55 is a REAL rate. GSYH share %0,2.
    landformNoteTr:
      'Cilo kütlesinin güneybatısına doğru uzanan engebeli arazide 3.000 metreyi aşan çok ' +
      'sayıda doruk yer alır; bunların başlıcaları 3.250 metrelik Beridalo ve Yekboy dağları ' +
      "ile 3.460 metrelik Gare Dağı'dır. Sat Dağları kütlesinde ise 3.540 metrelik Sat Dağı ve " +
      '3.356 metrelik Gevaroki Dağı öne çıkar.',
    introTr:
      "Hakkari, il geneli ortalama yükseklik bakımından Türkiye'nin en yüksek rakımlı " +
      'illerinden biridir; toprakların neredeyse tamamı 1.500 metrenin üzerindedir. İlin ' +
      'kuzeyindeki Cilo-Sat ' +
      "Dağları, 4.168 metreye ulaşan zirveleriyle Türkiye'nin en yüksek dağ kütlelerinden " +
      "biridir. İl, Güneydoğu Toroslar'ın en sarp bölümünde, Irak ve İran sınırına bitişik " +
      'kuruludur.',
    hydrographyNoteTr:
      "İlin akarsuları, Dicle Nehri'nin önemli bir kolu olan Büyük Zap'ı besler; bu akarsular " +
      'Cilo-Sat kütlesinin buzul ve kar sularıyla beslenir, güneye Irak topraklarına doğru akar.',
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
    plateCode: '76',
    nameTr: 'Iğdır',
    slugTr: 'igdir',
    slugEn: 'igdir',
    region: GeographicRegion.DoguAnadolu,
    population: 205_071,
    populationYear: POPULATION_YEAR,
    areaKm2: 3664,
    districtCount: 4,
    elevationM: 856, // MGM Merkez istasyonu
    latitude: 39.9227,
    longitude: 44.0523,
    // Ağrı=04, Kars=36 (+ Ermenistan, Nahçıvan-Azerbaycan — ülke, hariç) — Türkiye içinde SADECE 2 komşu
    neighborPlateCodes: ['04', '36'],
    climateKoppen: KOPPEN_BSK,
    climateClassTr: CLIMATE_CLASS_BSK_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_BSK_TR,
    climateCurriculumNameTr: CURRICULUM_DOGU_ANADOLU,
    // ── Iğdır deep content (wave-6b Tier-B). 6-field set. Türkiye içinde SADECE 2 komşu (both
    //    symmetric). The Iğdır Ovası microclimate makes it Doğu Anadolu's lowest plain.
    //    urbanizationRate 59.56 is a REAL rate (non-büyükşehir). GSYH share %0,1.
    landformNoteTr:
      'Tarihte Sürmeli Çukuru olarak da anılan Iğdır Ovası, Batı Iğdır, Doğu Iğdır ve Dil ' +
      'Ovası olmak üzere üç kesimden oluşur; batıda Çalpala köyü dolaylarında 910 metreye çıkan ' +
      "yükseklik, doğuda Dil Ucu'nda 795 metreye iner. Ovanın güneyinde, Türkiye'nin en yüksek " +
      "zirvesi Ağrı Dağı'nın kuzey yamaçları yükselir.",
    introTr:
      'Iğdır Ovası, çevresini saran yüksek dağlara karşın 850 metre ortalama yükseklikle Doğu ' +
      "Anadolu Bölgesi'nin en alçak düzlüğüdür. Aras Nehri'nin ikiye ayırdığı ova, bölgenin " +
      'diğer illerine kıyasla daha ılıman bir mikroklimaya sahiptir; bu iklim kayısı, şeftali ' +
      've üzüm gibi meyve yetiştiriciliğine imkân tanır.',
    hydrographyNoteTr:
      "İlin tek büyük akarsuyu Aras Nehri'dir; ovayı ikiye bölerek doğuya akar ve verimli " +
      'alüvyonlu topraklar bırakır. Tarım arazilerinin yarısından fazlasında tahıl, özellikle ' +
      'buğday ve arpa yetiştirilir.',
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
    plateCode: '36',
    nameTr: 'Kars',
    slugTr: 'kars',
    slugEn: 'kars',
    region: GeographicRegion.DoguAnadolu,
    population: 268_991,
    populationYear: POPULATION_YEAR,
    areaKm2: 10_193,
    districtCount: 8,
    elevationM: 1795, // MGM Merkez istasyonu
    latitude: 40.6042,
    longitude: 43.1073,
    // Ardahan=75, Ağrı=04, Iğdır=76, Erzurum=25 (+ Ermenistan — ülke, hariç)
    neighborPlateCodes: ['75', '04', '76', '25'],
    climateKoppen: KOPPEN_DFB,
    climateClassTr: CLIMATE_CLASS_D_GROUP_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_DFB_TR,
    climateCurriculumNameTr: CURRICULUM_DOGU_ANADOLU,
    // ── Kars deep content (wave-6b Tier-B). 6-field set. hydrographyNoteTr from the Tier-1 Kars
    //    İl Kültür ve Turizm Müdürlüğü "Akarsular" page. urbanizationRate 55.19 is a REAL rate.
    //    GSYH share %0,2.
    landformNoteTr:
      "Kars'ın dağları, kuzeyde Kuzey Anadolu kıvrım sistemine, güneyde Güney Anadolu kıvrım " +
      "sistemine bağlı kütlelerden oluşur; Kars Ovası'nın temelini volkanik malzemeler " +
      'oluşturur. İlin güneybatısında, Sarıkamış çevresinde geniş çam ormanları yer alır.',
    introTr:
      "Kars Ovası, 1.750 metre ortalama yüksekliğiyle Doğu Anadolu Bölgesi'nin en geniş " +
      'ovasıdır. İl, Allahuekber Dağları ile Sarıkamış-Kars Platosu arasında, doğuya açılan bir ' +
      'çöküntü oluğu üzerinde kuruludur. Yüksek rakımı nedeniyle kışları uzun ve sert geçer.',
    hydrographyNoteTr:
      "İlin başlıca akarsuları Kars Çayı, Arpaçayı ve Aras Irmağı'dır. Kars Çayı, Soğanlı " +
      'Dağı geçidindeki Yaycı ve Kırkpınar yaylalarından doğar; Arpaçayı ile birleştikten sonra ' +
      "Tekelibağ yakınlarında Aras'a katılır. Aras Irmağı, kışın donmayan tek akarsu olma " +
      'özelliğiyle diğerlerinden ayrılır; debisi nisanda 180-200 m³/saniyeye çıkarken ' +
      'temmuz-ağustosta 20-25 m³/saniyeye düşer.',
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
    plateCode: '44',
    nameTr: 'Malatya',
    slugTr: 'malatya',
    slugEn: 'malatya',
    region: GeographicRegion.DoguAnadolu,
    population: 755_854,
    populationYear: POPULATION_YEAR,
    areaKm2: 12_259,
    districtCount: 13,
    elevationM: 950, // MGM "Merkez" etiketli istasyon (büyükşehir — gerçek merkez ilçeler Battalgazi/Yeşilyurt; MGM etiket kalıntısı)
    latitude: 38.35,
    longitude: 38.25,
    // Elazığ=23, Erzincan=24, Sivas=58, Kahramanmaraş=46, Adıyaman=02, Diyarbakır=21
    neighborPlateCodes: ['23', '24', '58', '46', '02', '21'],
    climateKoppen: KOPPEN_BSK,
    climateClassTr: CLIMATE_CLASS_BSK_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_BSK_TR,
    climateCurriculumNameTr: CURRICULUM_DOGU_ANADOLU,
    // ── Malatya deep content (wave-6b Tier-B + büyükşehir EXCEPTION → DEC 2026-07-12, Mardin
    //    precedent). Tier-B depth (hydrographyFeatures OMITTED), BUT büyükşehir, so
    //    urbanizationRate=100 carries ONLY the single-sentence settlementNoteTr. The wave's SOLE
    //    positive net migration (+6.88 ‰). introTr kayısı stat = fact-check CORRECTION ("dünya
    //    kuru kayısı üretiminin ~%85'i", not "Türkiye"). GSYH share %0,6 (wave's highest).
    landformNoteTr:
      "Güneydoğu Toroslar'ın bir kolu olan Malatya Dağları, ilin batı-doğu doğrultusundaki " +
      "omurgasını oluşturur; bunların en yükseği, kenti gören 2.544 metrelik Beydağı'dır. " +
      "Sultansuyu Vadisi'nin batısındaki Nurhak Dağları'nda ise en yüksek nokta 2.428 metrelik " +
      "Derbent Dağı'dır. Malatya Ovası, bu dağlık çevrenin ortasında tarımsal üretimin " +
      'merkezidir.',
    introTr:
      "Malatya, dünya kuru kayısı üretiminin yaklaşık %85'ini karşılar. İl, Fırat Nehri " +
      "vadisinin doğusunda, Doğu Anadolu Bölgesi'nin batı ucunda kuruludur; Akdeniz'e Sultansuyu " +
      "ve Sürgü vadileriyle, İç Anadolu'ya Tohma Vadisi'yle açılan bir geçiş bölgesidir.",
    hydrographyNoteTr:
      'İlin su kaynaklarının büyük bölümünü Fırat Nehri ve kolları oluşturur. Kayısı ' +
      "yetiştiriciliğine elverişli iklim koşulları, 900 metre rakımdaki Malatya Ovası'nda " +
      'en yağışlı mevsim olan ilkbaharla birlikte şekillenir.',
    urbanizationRate: 100.0,
    netMigrationRate: 6.88,
    settlementNoteTr:
      "Malatya'nın TÜİK il/ilçe merkezi nüfus oranı, büyükşehir statüsündeki illerde olduğu gibi " +
      "%100'dür — belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı Kanun) " +
      'bir sonucudur. Bu oran, ilin fiilen tamamen kentleştiği anlamına gelmez.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,6',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    plateCode: '49',
    nameTr: 'Muş',
    slugTr: 'mus',
    slugEn: 'mus',
    region: GeographicRegion.DoguAnadolu,
    population: 389_127,
    populationYear: POPULATION_YEAR,
    areaKm2: 8718,
    districtCount: 6,
    elevationM: 1316, // MGM Merkez istasyonu
    latitude: 38.7509,
    longitude: 41.5023,
    // Bitlis=13, Bingöl=12, Erzurum=25, Ağrı=04, Diyarbakır=21, Batman=72
    neighborPlateCodes: ['13', '12', '25', '04', '21', '72'],
    climateKoppen: KOPPEN_DSA,
    climateClassTr: CLIMATE_CLASS_D_GROUP_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_DSA_TR,
    climateCurriculumNameTr: CURRICULUM_DOGU_ANADOLU,
    // ── Muş deep content (wave-6b Tier-B). 6-field set. The Nemrut here only bounds the Muş Ovası;
    //    the mountain itself is administratively in Bitlis (not presented as Muş's landform).
    //    urbanizationRate 51.26 is a REAL rate (non-büyükşehir). GSYH share %0,2.
    landformNoteTr:
      'Muş Ovası, jeolojik olarak Miyosen döneminde bir çöküntü alanına dönüşmüş, sonraki ' +
      'dönemlerde alüvyonlarla dolarak verimli bir düzlük halini almıştır. Ovanın doğu ucuna ' +
      "Nemrut Dağı'nın batı yamaçları uzanır; batı ucu ise dağlık bir araziyle sınırlanır. İlin " +
      'doğusunda Bulanık ve Malazgirt ovaları, Murat Irmağı boyunca uzanan dar şeritler ' +
      'oluşturur.',
    introTr:
      "Muş Ovası, 80 kilometre uzunluğu ve 30 kilometre genişliğiyle Türkiye'nin en büyük " +
      'ovalarından biridir. İlin ortasından geçen Murat Irmağı, ovanın kuzey kesimini sular. ' +
      "İl, Doğu Anadolu Bölgesi'nin güneybatısında, dağlarla çevrili bir çöküntü alanında yer " +
      'alır.',
    hydrographyNoteTr:
      'Murat Irmağı, ilin kuzeydoğusundan girer ve ovayı kuzeyden güneye kat ederek birkaç ' +
      "küçük dereyle birleşir. Irmak, Muş'tan sonra batıya yönelerek Bingöl ve Elazığ üzerinden " +
      'Fırat sistemine katılır.',
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
    plateCode: '62',
    nameTr: 'Tunceli',
    slugTr: 'tunceli',
    slugEn: 'tunceli',
    region: GeographicRegion.DoguAnadolu,
    population: 85_083,
    populationYear: POPULATION_YEAR,
    areaKm2: 7582,
    districtCount: 8,
    elevationM: 981, // MGM Merkez istasyonu
    latitude: 39.1058,
    longitude: 39.5408,
    // Erzincan=24, Bingöl=12, Elazığ=23 — 3 komşu (Sivas=58 fact-check'te ÇIKARILDI)
    neighborPlateCodes: ['24', '12', '23'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    climateCurriculumNameTr: CURRICULUM_DOGU_ANADOLU,
    // ── Tunceli deep content (wave-6b Tier-B). 6-field set. Türkiye's least-populous il after
    //    Bayburt (85.083). neighborPlateCodes is 3 (Sivas 58 removed by the fact-check — geojson +
    //    both il's own Wikipedia pages disagree). urbanizationRate 67.04 is a REAL rate. GSYH %0,1.
    landformNoteTr:
      'Kuzeyde 3.300 metreye ulaşan Munzur Dağları, Mercan ve Munzur suyu vadileriyle ' +
      'parçalanmış, metamorfik, volkanik ve tortul kayaçlardan oluşan bir kütledir. İlin ' +
      'ortasında yükselen Bağırpaşa Dağı, batıdan Pülümür Çayı, kuzeyden Karasu, güneyden Peri ' +
      'Suyu vadileriyle çevrilidir.',
    introTr:
      'İl merkezinin 8 kilometre kuzeyinden başlayan Munzur Vadisi Milli Parkı, 42.674 ' +
      "hektarlık alanıyla Munzur Dağları'na kadar uzanır. Tunceli, 85.083 kişilik nüfusuyla " +
      "Türkiye'nin en az nüfuslu ikinci ilidir. İl, Fırat Nehri'nin yukarı havzasında, dağlık " +
      'bir arazi üzerinde kuruludur.',
    hydrographyNoteTr:
      "Munzur Dağları'nın 2.000-3.000 metrelik zirvelerinde krater gölleri, Ovacık düzlüğünde " +
      'ise kaynayan gözeler bulunur. Peri Suyu vadisi, Tunceli ile Bingöl arasındaki doğal ' +
      'sınırı oluşturur; ilin sularının büyük bölümü Munzur Suyu ve Peri Suyu aracılığıyla ' +
      "Fırat'a katılır.",
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
];

/**
 * ── WAVE 6a — İç Anadolu (remaining 12 il) — BRAND-NEW rows, base + tiered deep content ──
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROVENANCE (traceability — CONVENTIONS §4: no sourceless facts)
 * ─────────────────────────────────────────────────────────────────────────────
 * SOURCE OF RECORD: NOVA's researched draft, INDEPENDENTLY fact-checked by a different
 *   actor — verdict "SEED-READY WITH CORRECTIONS" (all 4 factual + 1 style correction
 *   applied before seeding). A from-scratch single-pass wave (same shape as wave-6b/6d,
 *   already merged): these 12 il had NO prior seed row — base data + tiered deep content
 *   are authored together here.
 *   • Draft:       Owner's Inbox/data-source-groundwork/wave6a-ic-anadolu-draft.md
 *   • Fact-check:  Owner's Inbox/data-source-groundwork/wave6a-ic-anadolu-factcheck.md
 *   • Ledger:      data-provenance.md (root) — wave-6a section
 * Per-field Tier-1 authorities (same registry as every prior wave):
 *   • Nüfus (31.12.2025)          → TÜİK ADNKS 2025, bülten 53899
 *   • Yüzölçümü (km²)             → Harita Genel Müdürlüğü (il_ilce_alanlari.xlsx)
 *   • Rakım + koordinat (il mrk.) → MGM servis API (servis.mgm.gov.tr/web/merkezler)
 *   • Köppen iklim                → MGM 2023 Köppen raporu, s.11-15 (12/12 re-verified)
 *   • GSYH payı                   → TÜİK İl Bazında GSYH 2024, bülten 53930
 *   • Net göç hızı                → TÜİK İç Göç 2024, bülten 54082
 *   • İlçe sayısı + komşu iller   → Tier-2 çok-kaynaklı çapraz kontrol + 2 bağımsız GeoJSON
 *     il-sınırı veri setinin `shapely` geometrik analizi (Karaman/Kırıkkale komşuluk
 *     düzeltmeleri bu geometrik yöntemle yapıldı — aşağıda ilgili il yorumlarına bkz.).
 *
 * KÖPPEN — 12 il resolve to 6× BSk (Konya/Eskişehir/Niğde/Aksaray/Karaman/Kırıkkale),
 *   3× Csa (Kayseri/Kırşehir/Nevşehir), 2× Csb (Sivas/Yozgat), 1× Cfa (Çankırı). BSk is
 *   NOT new here — it was introduced by wave-6b (Elazığ/Iğdır/Malatya) and these 6 il REUSE
 *   the already-merged KOPPEN_BSK / CLIMATE_CLASS_BSK_TR ("Yarı Kurak Step İklimi") /
 *   MGM_KOPPEN_CAVEAT_BSK_TR constants verbatim (canonical "soğuk alt-tipi" wording,
 *   → DEC 2026-07-12); no BSk constant is redefined. The rest reuse Csa/Csb/Cfa constants.
 *
 * ANKARA (İç Anadolu's 13th il, plate 06) is DELIBERATELY untouched — it was seeded at
 *   founding with full wave-1 deep content. Its existing neighborPlateCodes
 *   (['18','71','40','68','42','26','14']) already list all SIX of its wave-6a neighbours
 *   (Çankırı/Kırıkkale/Kırşehir/Aksaray/Konya/Eskişehir), so no back-reference edit is
 *   needed — bidirectionality holds by construction (each il carries its FULL real-world
 *   adjacency regardless of seed order; verified against the whole 50-il set).
 *
 * DEEP CONTENT — TIERED (owner-approved tiered depth, DEC 2026-07-11), THREE variants here:
 *   • Tier-A (nüfus ≥1M): Konya 42, Kayseri 38 — the FULL 8-field set.
 *   • Tier-B (nüfus <1M): Sivas, Yozgat, Kırşehir, Nevşehir, Niğde, Aksaray, Karaman,
 *       Kırıkkale, Çankırı — a 6-field set; hydrographyFeatures AND settlementNoteTr are
 *       DELIBERATELY OMITTED (permanent Tier-B scope cut → null, asserted null in the e2e).
 *   • Tier-B-but-büyükşehir EXCEPTION (→ DEC 2026-07-12): Eskişehir 26. Nüfus 927,956 (<1M,
 *       so Tier-B depth: no hydrographyFeatures), BUT it is legally büyükşehir since 1993, so
 *       urbanizationRate=100 is the SAME 6360 legal artifact as a Tier-A büyükşehir — it
 *       therefore carries a SINGLE-SENTENCE settlementNoteTr holding ONLY the 6360 caveat (no
 *       migration stats, no narrative). Identical shape to wave-5's Mardin — the locked rule
 *       for any Tier-B-but-büyükşehir il. Konya (Tier-A, büyükşehir since 1989) keeps the FULL
 *       settlementNoteTr with migration prose. No fact is invented; every value traces to the
 *       fact-checked draft.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const WAVE6A_IC_ANADOLU_PROVINCES: readonly ProvinceSeed[] = [
  {
    plateCode: '42',
    nameTr: 'Konya',
    slugTr: 'konya',
    slugEn: 'konya',
    region: GeographicRegion.IcAnadolu,
    population: 2_343_409,
    populationYear: POPULATION_YEAR,
    areaKm2: 40_838, // HGM — bu platformda seed edilmiş illerin en büyük yüzölçümlüsü
    districtCount: 31,
    elevationM: 1029, // MGM Meram istasyonu (büyükşehir — ayrı "Merkez" ilçesi yok; kent 3 metropol ilçeye bölünmüş)
    latitude: 37.8687,
    longitude: 32.4713,
    // Ankara=06, Aksaray=68, Niğde=51, Mersin=33, Karaman=70, Antalya=07, Isparta=32,
    // Afyonkarahisar=03, Eskişehir=26 (9 komşu — bu partinin en çok kara-komşulu ili)
    neighborPlateCodes: ['06', '68', '51', '33', '70', '07', '32', '03', '26'],
    climateKoppen: KOPPEN_BSK,
    climateClassTr: CLIMATE_CLASS_BSK_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_BSK_TR,
    climateCurriculumNameTr: CURRICULUM_IC_ANADOLU,
    // ── Konya deep content (wave-6a Tier-A). Full 8-field set. Bozkır platosu + Toros
    //    uzantıları + Karacadağ/Karadağ volkanik kütleleri (landform); Türkiye'nin en büyük
    //    kapalı havzası, Çarşamba Çayı/Çumra Sulaması + Beyşehir/Tuz gölleri (hydrography).
    //    urbanizationRate=100 is the 6360 büyükşehir artifact framed in settlementNoteTr
    //    (büyükşehir since 1989); net göç -0,97 ‰; GSYH share %2,1.
    landformNoteTr:
      "Konya toprakları, İç Anadolu'nun bozkır platosu karakterini taşıyan geniş, düz " +
      'ovalardan oluşur; ilin ortalama yükseltisi 1.000-1.050 metre bandındadır. Çumra ve ' +
      'Ereğli ovaları, ilin en geniş tarım alanlarını oluşturur.\n\n' +
      "İlin güneyinde, Toros Dağları'nın kuzey uzantıları başlar — Seydişehir, Hadim ve " +
      'Taşkent ilçelerinde 2.000 metreyi aşan yükseltiler görülür. Kuzeydoğuda, Aksaray ' +
      'sınırındaki Karacadağ ve Karadağ (Hotamış) volkanik kütleleri, ilin platosuna serpilmiş ' +
      'sönmüş yanardağlardır.',
    introTr:
      "Konya, 40.838 kilometrekarelik yüzölçümüyle Türkiye'nin en büyük ilidir. İç Anadolu " +
      "Bölgesi'nin güneyinde, geniş bir bozkır platosu üzerinde kuruludur. İl merkezindeki " +
      "Çumra ilçesi sınırlarında yer alan Çatalhöyük, MÖ 7.400'lere uzanan tarihiyle 2012'de " +
      "UNESCO Dünya Mirası Listesi'ne girmiştir.",
    hydrographyNoteTr:
      "Konya, Türkiye'nin en büyük kapalı havzalarından birinin merkezindedir; ilin " +
      'akarsuları denize ulaşmaz, iç göllerde ya da sulama kanallarında sonlanır. Çarşamba ' +
      "Çayı, Beyşehir Gölü'nden çıkarak Çumra Ovası'nı sular; 1907-1913 arasında Osmanlı " +
      'döneminde inşa edilen Çumra Sulaması, bugün 59.560 hektarlık bir alanı kapsar.\n\n' +
      'Çarşamba Çayı üzerindeki Apa Barajı, 1957-1962 arasında inşa edilmiş, yaklaşık 169 ' +
      "milyon m³ kapasiteyle Çumra Ovası'nın sulamasına katkı sağlar. Altınapa Barajı ise " +
      'Meram ilçesinin içme suyu ihtiyacının bir bölümünü karşılar.\n\n' +
      "İlin batı sınırındaki Beyşehir Gölü, 651 kilometrekarelik yüzölçümüyle Türkiye'nin en " +
      'büyük tatlı su gölüdür; gölün küçük bir kısmı Isparta sınırları içinde kalır. İlin ' +
      "kuzeydoğu ucunda, Şereflikoçhisar'daki (Ankara) kapalı havzanın parçası olan Tuz " +
      "Gölü'nün güney kıyı şeridi Konya topraklarına girer.",
    hydrographyFeatures: [
      { name: 'Çarşamba Çayı', type: HydrographyFeatureType.Nehir },
      { name: 'Apa Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Altınapa Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Beyşehir Gölü', type: HydrographyFeatureType.Gol },
      { name: 'Tuz Gölü', type: HydrographyFeatureType.Gol },
    ],
    urbanizationRate: 100.0,
    netMigrationRate: -0.97,
    settlementNoteTr:
      "Konya'da da TÜİK'in il/ilçe merkezi nüfus oranı %100 çıkıyor — büyükşehir statüsündeki " +
      'illerde belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı Kanun) bir ' +
      'sonucudur. Bu oran, ilin fiilen tamamen kentleştiği anlamına gelmez. Konya 2024 yılında ' +
      '53.971 kişi aldı, 56.234 kişi verdi; net göç hızı binde -0,97 ile hafif negatif kaldı.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%2,1',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    plateCode: '38',
    nameTr: 'Kayseri',
    slugTr: 'kayseri',
    slugEn: 'kayseri',
    region: GeographicRegion.IcAnadolu,
    population: 1_458_991,
    populationYear: POPULATION_YEAR,
    areaKm2: 16_970, // HGM
    districtCount: 16,
    elevationM: 1094, // MGM Melikgazi istasyonu (büyükşehir — ayrı "Merkez" ilçesi yok)
    latitude: 38.687,
    longitude: 35.5,
    // Yozgat=66, Sivas=58, Kahramanmaraş=46, Adana=01, Niğde=51, Nevşehir=50 (6 komşu)
    neighborPlateCodes: ['66', '58', '46', '01', '51', '50'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    climateCurriculumNameTr: CURRICULUM_IC_ANADOLU,
    // ── Kayseri deep content (wave-6a Tier-A). Full 8-field set. Erciyes stratovolkanı
    //    (3.917 m, İç Anadolu'nun en yüksek noktası; volkanizma yaşı ~2,5-3 milyon yıl, MTA
    //    kaynaklı fact-check düzeltmesi) + Sultansazlığı (landform); Zamantı/Sarımsaklı +
    //    Sultansazlığı Ramsar 13 Temmuz 1994 (hydrography, tescil tarihi fact-check ile
    //    düzeltildi). urbanizationRate=100 6360 büyükşehir artifact; net göç +0,92 ‰; GSYH %1,4.
    landformNoteTr:
      "Kayseri'nin en belirgin yer şekli, kentin 25 kilometre güneybatısında yükselen " +
      "Erciyes'tir — sönmüş bir stratovolkan olan dağ, 3.917 metreyle İç Anadolu Bölgesi'nin " +
      'en yüksek noktasıdır. Yaklaşık 2,5-3 milyon yıl önce başlayan ve günümüze yakın ' +
      'dönemlere kadar süren volkanik faaliyet sonucu oluşan Erciyes, günümüzde kayak ' +
      'turizmine ev sahipliği yapar.\n\n' +
      'İlin geri kalanı, ortalama 1.050 metre yükseklikteki bir plato üzerindedir. Kuzeyde ' +
      'Sultansazlığı bataklık-göl kompleksinin çevresindeki düzlükler, güneyde ise ' +
      "Erciyes'in eteklerinden başlayıp Niğde sınırına uzanan step arazisi ilin diğer ana " +
      'yer şekli gruplarıdır.',
    introTr:
      "Kayseri, İç Anadolu'nun sanayi ağırlıklı illerinden biridir; kentin güneybatısında " +
      "yükselen 3.917 metrelik Erciyes, bölgenin en yüksek dağıdır. Erciyes'in " +
      "milyonlarca yıl önceki kül ve tüf püskürtmeleri, komşu Nevşehir'e uzanan " +
      "Kapadokya'nın peribacalarını oluşturan yumuşak kayaçların kaynağıdır. Kayseri OSB'de " +
      'yoğunlaşan mobilya ve metal ürünleri imalatı, ilin ekonomisinin bel kemiğini ' +
      'oluşturur.',
    hydrographyNoteTr:
      'İlin güneyinden doğan Zamantı Irmağı, Kayseri topraklarında güneye akarak Adana ' +
      'sınırından Seyhan havzasına katılır. Kentin içinden geçen Sarımsaklı Deresi ise ' +
      'kuzeydeki step arazisinde kaybolan mevsimlik bir akarsudur.\n\n' +
      "Kayseri'nin kuzeyindeki Sultansazlığı, tatlı ve tuzlu su kütlelerinin bir arada " +
      'bulunduğu geniş bir sulak alan kompleksidir; kuş göç yollarının kesişim noktasında ' +
      "yer alması nedeniyle 13 Temmuz 1994'te Ramsar Sözleşmesi listesine dahil " +
      'edilmiştir.',
    hydrographyFeatures: [
      { name: 'Zamantı Irmağı', type: HydrographyFeatureType.Nehir },
      { name: 'Sarımsaklı Deresi', type: HydrographyFeatureType.Nehir },
      { name: 'Sultansazlığı', type: HydrographyFeatureType.Gol },
    ],
    urbanizationRate: 100.0,
    netMigrationRate: 0.92,
    settlementNoteTr:
      "Kayseri'de de TÜİK'in il/ilçe merkezi nüfus oranı %100 çıkıyor — büyükşehir statüsündeki " +
      'illerde belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı Kanun) bir ' +
      'sonucudur. Bu oran, ilin fiilen tamamen kentleştiği anlamına gelmez. Kayseri 2024 yılında ' +
      '37.960 kişi aldı, 36.622 kişi verdi; net göç hızı binde +0,92 ile hemen hemen dengede ' +
      'kaldı.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,4',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    plateCode: '26',
    nameTr: 'Eskişehir',
    slugTr: 'eskisehir',
    slugEn: 'eskisehir',
    region: GeographicRegion.IcAnadolu,
    population: 927_956,
    populationYear: POPULATION_YEAR,
    areaKm2: 13_960, // HGM
    districtCount: 14,
    elevationM: 801, // MGM Odunpazarı istasyonu (büyükşehir — 2 merkez ilçeden varsayılan)
    latitude: 39.7656,
    longitude: 30.5502,
    // Ankara=06, Kütahya=43, Bilecik=11, Afyonkarahisar=03, Konya=42, Bolu=14 (6 komşu)
    neighborPlateCodes: ['06', '43', '11', '03', '42', '14'],
    climateKoppen: KOPPEN_BSK,
    climateClassTr: CLIMATE_CLASS_BSK_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_BSK_TR,
    climateCurriculumNameTr: CURRICULUM_IC_ANADOLU,
    // ── Eskişehir deep content (wave-6a Tier-B + büyükşehir EXCEPTION → DEC 2026-07-12).
    //    Nüfus 927,956 (<1M → Tier-B depth: shortened landform/hydrography, NO
    //    hydrographyFeatures), BUT büyükşehir since 1993, so urbanizationRate=100 is the 6360
    //    legal artifact — it carries a SINGLE-SENTENCE settlementNoteTr (ONLY the 6360 caveat,
    //    no migration prose; the number lives in netMigrationRate). Same shape as wave-5's
    //    Mardin. net göç +7,43 ‰ (bu partinin en yüksek pozitifi); GSYH share %1,1.
    landformNoteTr:
      'Eskişehir, kuzeyde Sakarya Nehri havzası ile güneyde Porsuk Çayı vadisinin kesiştiği ' +
      'bir plato üzerindedir; il topraklarının büyük bölümü 800-1.000 metre yükseklik ' +
      'bandındadır. İlin kuzeybatısındaki Türkmen Dağı ve güneyindeki Sündiken Dağları ilin ' +
      'başlıca yükseltileridir.',
    introTr:
      "Eskişehir, İç Anadolu Bölgesi'nde kentin ortasından akan Porsuk Çayı'yla bölgenin " +
      'genel kurak karakterinden ayrılan bir ildir. Anadolu Üniversitesi ve Eskişehir ' +
      "Osmangazi Üniversitesi'nin varlığı, kenti Türkiye'nin önde gelen öğrenci " +
      'şehirlerinden birine dönüştürmüştür.',
    hydrographyNoteTr:
      "Kentin ortasından geçen Porsuk Çayı, Kütahya'dan doğar ve Eskişehir Ovası'nı " +
      "sulayarak Sakarya Nehri'ne katılır; 448 kilometrelik uzunluğuyla Sakarya'nın en uzun " +
      "kolu kabul edilir. 1948 ve 1971'de iki aşamada tamamlanan Porsuk Barajı, kent " +
      'merkezinin hemen yukarısında 23,4 kilometrekarelik bir baraj gölü oluşturur.',
    urbanizationRate: 100.0,
    netMigrationRate: 7.43,
    settlementNoteTr:
      "TÜİK'in il/ilçe merkezi nüfus oranı Eskişehir için de %100'dür — büyükşehir statüsündeki " +
      'illerde belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı Kanun) bir ' +
      'sonucudur. Bu oran, ilin fiilen tamamen kentleştiği anlamına gelmez.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,1',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    plateCode: '58',
    nameTr: 'Sivas',
    slugTr: 'sivas',
    slugEn: 'sivas',
    region: GeographicRegion.IcAnadolu,
    population: 631_401,
    populationYear: POPULATION_YEAR,
    areaKm2: 28_164, // HGM — İç Anadolu'nun Konya'dan sonra 2. büyük ili
    districtCount: 17,
    elevationM: 1294, // MGM Merkez istasyonu
    latitude: 39.7437,
    longitude: 37.002,
    // Malatya=44, Kahramanmaraş=46, Kayseri=38, Yozgat=66, Tokat=60, Ordu=52, Giresun=28,
    // Erzincan=24 (8 komşu)
    neighborPlateCodes: ['44', '46', '38', '66', '60', '52', '28', '24'],
    climateKoppen: KOPPEN_CSB,
    climateClassTr: CLIMATE_CLASS_CSB_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_CSB_TR,
    climateCurriculumNameTr: CURRICULUM_IC_ANADOLU,
    // ── Sivas deep content (wave-6a Tier-B). 6-field set (hydrographyFeatures +
    //    settlementNoteTr DELIBERATELY OMITTED, Tier-B scope — non-büyükşehir, no 6360 note).
    //    Kızılırmak yukarı havzası, Türkiye'nin en yüksek il merkezlerinden biri (1.294 m) +
    //    Divriği Ulu Cami 1985 UNESCO. urbanizationRate=77.38 REAL rate; net göç -21,14 ‰;
    //    GSYH share %0,5.
    landformNoteTr:
      "Sivas, Kızılırmak'ın yukarı havzasında, ortalama 1.200-1.300 metre yükseklikteki bir " +
      "plato üzerindedir — bu, Türkiye'nin en yüksek rakımlı il merkezlerinden biri olmasının " +
      "nedenidir. İlin kuzeyi Karadeniz'e geçiş bölgesindeki dağlık arazi, güneyi ise İç " +
      'Anadolu step karakterindeki düzlüklerdir.',
    introTr:
      "Sivas, 1.294 metre rakımıyla Türkiye'nin en yüksek il merkezlerinden biridir. " +
      "Türkiye'nin en uzun nehri Kızılırmak, ilin doğusundaki İmranlı ilçesinde, Kızıldağ'ın " +
      '2.000 metreyi aşan yükseltilerinden doğar. Divriği ilçesindeki Ulu Cami ve Darüşşifa, ' +
      "1985'te Türkiye'den UNESCO Dünya Mirası Listesi'ne giren ilk mimari eserdir.",
    hydrographyNoteTr:
      'Kızılırmak, İmranlı ilçesindeki Kızıldağ kaynaklarından doğar ve Türkiye sınırları içinde ' +
      'tamamen akan en uzun nehirdir. Sivas topraklarından geçtikten sonra Kayseri, Kırşehir, ' +
      "Kırıkkale, Ankara, Aksaray, Nevşehir, Çorum ve Samsun'dan geçerek Karadeniz'e dökülür. " +
      'Millî Eğitim Bakanlığı müfredat kaynakları bu güzergâh için 1.355 kilometre rakamını ' +
      'kullanır.',
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
    plateCode: '66',
    nameTr: 'Yozgat',
    slugTr: 'yozgat',
    slugEn: 'yozgat',
    region: GeographicRegion.IcAnadolu,
    population: 413_208,
    populationYear: POPULATION_YEAR,
    areaKm2: 13_690, // HGM
    districtCount: 14,
    elevationM: 1301, // MGM Merkez istasyonu
    latitude: 39.8243,
    longitude: 34.8159,
    // Çorum=19, Amasya=05, Tokat=60, Sivas=58, Kayseri=38, Nevşehir=50, Kırşehir=40,
    // Kırıkkale=71 (8 komşu)
    neighborPlateCodes: ['19', '05', '60', '58', '38', '50', '40', '71'],
    climateKoppen: KOPPEN_CSB,
    climateClassTr: CLIMATE_CLASS_CSB_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_CSB_TR,
    climateCurriculumNameTr: CURRICULUM_IC_ANADOLU,
    // ── Yozgat deep content (wave-6a Tier-B). 6-field set (hydrographyFeatures +
    //    settlementNoteTr omitted, Tier-B). Yozgat Çamlığı = Türkiye'nin ilk milli parkı
    //    (5 Şubat 1958). introTr opening re-sequenced by fact-check so it does NOT share
    //    Sivas's "[İl], [X] metre rakımıyla…" skeleton (CONTENT-STYLE.md §9/§12). net göç
    //    -20,23 ‰; GSYH share %0,3.
    landformNoteTr:
      'Yozgat, Kızılırmak ile Çekerek Irmağı arasındaki, ortalama 1.200-1.300 metre ' +
      'yükseklikteki bir plato üzerindedir. İlin kuzeyinde step-orman geçiş kuşağı, ' +
      "güneyinde ise İç Anadolu'nun tipik bozkır arazisi hakimdir.",
    introTr:
      "Kent merkezine birkaç kilometre uzaklıktaki Yozgat Çamlığı, 5 Şubat 1958'de " +
      "Türkiye'nin ilk milli parkı ilan edilmiştir. İl, 1.301 metre rakımıyla İç Anadolu'nun " +
      'yüksek platolarından birinde yer alır.',
    hydrographyNoteTr:
      "İlin başlıca akarsuyu Çekerek Irmağı'dır; Yozgat'ın kuzeyinden geçerek Tokat " +
      "üzerinden Yeşilırmak'a katılır. Kızılırmak'ın bir bölümü de ilin batı-güneybatı " +
      'sınırını çizer.',
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
    plateCode: '40',
    nameTr: 'Kırşehir',
    slugTr: 'kirsehir',
    slugEn: 'kirsehir',
    region: GeographicRegion.IcAnadolu,
    population: 242_777,
    populationYear: POPULATION_YEAR,
    areaKm2: 6584, // HGM
    districtCount: 7,
    elevationM: 1007, // MGM Merkez istasyonu
    latitude: 39.1639,
    longitude: 34.1561,
    // Kırıkkale=71, Yozgat=66, Nevşehir=50, Aksaray=68, Ankara=06 (5 komşu)
    neighborPlateCodes: ['71', '66', '50', '68', '06'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    climateCurriculumNameTr: CURRICULUM_IC_ANADOLU,
    // ── Kırşehir deep content (wave-6a Tier-B). 6-field set (hydrographyFeatures +
    //    settlementNoteTr omitted, Tier-B). Ahilik merkezi + Kaman-Kalehöyük (intro);
    //    Hirfanlı Baraj Gölü + Seyfe Gölü (1994 Ramsar, ~320.000 flamingo). net göç -4,57 ‰;
    //    GSYH share %0,2.
    landformNoteTr:
      "Kırşehir, Kızılırmak'ın batı kesiminde, ortalama 1.000-1.100 metre yükseklikteki bir " +
      'plato üzerindedir. İlin güneydoğusundaki Kaman-Kırşehir ovası, çevresindeki step ' +
      'arazisine göre nispeten daha verimli tarım alanlarına sahiptir.',
    introTr:
      "Kırşehir, Ahi Evran'ın 13. yüzyılda kurduğu esnaf-zanaat dayanışma geleneği Ahiliğin " +
      'merkezi olarak bilinir. Kaman ilçesindeki Kalehöyük kazı alanı, Japon Ortadoğu Kültür ' +
      'Merkezi tarafından yürütülen uzun soluklu bir arkeolojik araştırmaya ev sahipliği ' +
      'yapmaktadır.',
    hydrographyNoteTr:
      'Kızılırmak, ilin güney sınırından geçer; Kaman ve Kırşehir Merkez ilçeleri arasında ' +
      "kalan bölümü Hirfanlı Baraj Gölü'nün su kütlesine dahildir. İlin " +
      "kuzeydoğusundaki Seyfe Gölü, sığ ve tuzlu bir step gölüdür; 1994'te Ramsar " +
      'Sözleşmesi listesine alınmış, dönem dönem 300 binin üzerinde flamingoya ev sahipliği ' +
      'yapan önemli bir kuş alanıdır.',
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
    plateCode: '50',
    nameTr: 'Nevşehir',
    slugTr: 'nevsehir',
    slugEn: 'nevsehir',
    region: GeographicRegion.IcAnadolu,
    population: 320_150,
    populationYear: POPULATION_YEAR,
    areaKm2: 5485, // HGM
    districtCount: 8,
    elevationM: 1260, // MGM Merkez istasyonu
    latitude: 38.6163,
    longitude: 34.7025,
    // Aksaray=68, Kırşehir=40, Yozgat=66, Kayseri=38, Niğde=51 (5 komşu)
    neighborPlateCodes: ['68', '40', '66', '38', '51'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    climateCurriculumNameTr: CURRICULUM_IC_ANADOLU,
    // ── Nevşehir deep content (wave-6a Tier-B). 6-field set (hydrographyFeatures +
    //    settlementNoteTr omitted, Tier-B). Kapadokya peribacaları + Göreme Milli Parkı 1985
    //    UNESCO + Derinkuyu/Kaymaklı yeraltı şehirleri; İç Anadolu'nun en kurak illerinden
    //    biri (Damsa Barajı). net göç +4,05 ‰; GSYH share %0,3.
    landformNoteTr:
      "Nevşehir toprakları, Erciyes (Kayseri sınırında) ve Hasan Dağı'nın (Aksaray-Niğde " +
      'sınırında) milyonlarca yıl önceki kül ve tüf püskürtmeleriyle oluşan yumuşak volkanik ' +
      'kayaç örtüsü üzerindedir; rüzgar ve suyun bu tüf tabakasını aşındırmasıyla Göreme, ' +
      'Ürgüp ve Avanos çevresindeki peribacaları ortaya çıkmıştır. İlin ortalama yükseltisi ' +
      '1.200-1.300 metre bandındadır.',
    introTr:
      "Nevşehir, Kapadokya'nın peribacaları ve yeraltı şehirleriyle özdeşleşen ildir; " +
      "Göreme Milli Parkı ve Kapadokya Kaya Siteleri, 1985'te UNESCO Dünya Mirası Listesi'ne " +
      'alınmıştır. Derinkuyu ve Kaymaklı ilçelerindeki çok katlı yeraltı şehirleri, Erciyes ' +
      "ve Hasan Dağı'nın volkanik tüf katmanları içine oyulmuştur.",
    hydrographyNoteTr:
      "Nevşehir, İç Anadolu'nun en kurak illerinden biridir; büyük akarsuları yoktur. " +
      'Kızılırmak, ilin kuzey ucundan kısa bir mesafe geçer; Damsa Barajı ise il merkezinin ' +
      'içme suyu ihtiyacının bir bölümünü karşılar.',
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
    plateCode: '51',
    nameTr: 'Niğde',
    slugTr: 'nigde',
    slugEn: 'nigde',
    region: GeographicRegion.IcAnadolu,
    population: 374_492,
    populationYear: POPULATION_YEAR,
    areaKm2: 7234, // HGM
    districtCount: 6,
    elevationM: 1211, // MGM Merkez istasyonu
    latitude: 37.9587,
    longitude: 34.6795,
    // Aksaray=68, Nevşehir=50, Kayseri=38, Konya=42, Mersin=33, Adana=01 (6 komşu)
    neighborPlateCodes: ['68', '50', '38', '42', '33', '01'],
    climateKoppen: KOPPEN_BSK,
    climateClassTr: CLIMATE_CLASS_BSK_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_BSK_TR,
    climateCurriculumNameTr: CURRICULUM_IC_ANADOLU,
    // ── Niğde deep content (wave-6a Tier-B). 6-field set (hydrographyFeatures +
    //    settlementNoteTr omitted, Tier-B). Patates üretiminde Türkiye 1.si (2024 rekoltesi
    //    >1 milyon ton) + Hasan Dağı (kuzey volkanik) / Bolkar-Aladağlar (güney Toros).
    //    net göç -13,92 ‰; GSYH share %0,3.
    landformNoteTr:
      "Niğde'nin kuzeyi, Aksaray sınırındaki 3.268 metrelik Hasan Dağı'nın volkanik " +
      "tüf arazisiyle Kapadokya'nın güney ucunu oluşturur. İlin güneyi ise Toros " +
      "Dağları'nın bir kolu olan Bolkar Dağları ile Adana/Mersin sınırındaki Aladağlar'ın " +
      'oluşturduğu dik, yüksek bir dağlık kuşaktır — bu kesimde 3.500 metreyi aşan zirveler ' +
      'bulunur.',
    introTr:
      "Niğde, patates üretiminde Türkiye'nin ilk sırasında yer alan ildir — 2024 rekoltesi 1 " +
      "milyon tonu aşmıştır. İlin güneyinde Bolkar Dağları, kuzeyinde ise Hasan Dağı'nın " +
      'volkanik tüf arazisi ilin iki farklı coğrafi kimliğini oluşturur.',
    hydrographyNoteTr:
      "Niğde'nin güneyindeki Bolkar Dağları ve Aladağlar'dan doğan dereler, Adana yönünde " +
      "Seyhan havzasına akar; ilin kuzey kesimi ise İç Anadolu'nun kapalı havza karakterine " +
      'uygun biçimde büyük akarsulardan yoksundur.',
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
    plateCode: '68',
    nameTr: 'Aksaray',
    slugTr: 'aksaray',
    slugEn: 'aksaray',
    region: GeographicRegion.IcAnadolu,
    population: 441_136,
    populationYear: POPULATION_YEAR,
    areaKm2: 7659, // HGM
    districtCount: 8,
    elevationM: 970, // MGM Merkez istasyonu
    latitude: 38.3705,
    longitude: 33.9987,
    // Nevşehir=50, Niğde=51, Konya=42, Ankara=06, Kırşehir=40 (5 komşu)
    neighborPlateCodes: ['50', '51', '42', '06', '40'],
    climateKoppen: KOPPEN_BSK,
    climateClassTr: CLIMATE_CLASS_BSK_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_BSK_TR,
    climateCurriculumNameTr: CURRICULUM_IC_ANADOLU,
    // ── Aksaray deep content (wave-6a Tier-B). 6-field set (hydrographyFeatures +
    //    settlementNoteTr omitted, Tier-B). Ihlara Vadisi + Tuz Gölü güneybatı kıyısı (intro);
    //    Hasan Dağı volkanik tüf + Melendiz Çayı'nın oyduğu kanyon. net göç -2,10 ‰;
    //    GSYH share %0,4.
    landformNoteTr:
      'İlin kuzeybatısı, Ankara-Konya-Aksaray üçlü sınırının kesiştiği Tuz Gölü kapalı ' +
      'havzasının bir parçasıdır. Güneyde ise Aksaray-Niğde sınırındaki 3.268 metrelik Hasan ' +
      "Dağı ve çevresindeki volkanik tüf arazisi, Ihlara Vadisi'ni oluşturan Melendiz " +
      "Çayı'nın aşındırdığı kanyonlarla kaplıdır.",
    introTr:
      "Aksaray, Kapadokya'nın en uzun kanyonlarından biri olan Ihlara Vadisi'ne ev sahipliği " +
      "yapar. İlin kuzeydoğu ucu, Türkiye'nin ikinci büyük gölü Tuz Gölü'nün güneybatı " +
      'kıyısına kadar uzanır.',
    hydrographyNoteTr:
      "Melendiz Çayı, Ihlara Vadisi'ni 18 kilometre boyunca, ortalama 150 metre derinlik " +
      "ve 200 metre genişlikte bir kanyon halinde oyarak akar; vadi boyunca 30'a yakın " +
      "menderes çizer. İlin kuzeydoğusunda, Tuz Gölü'nün güneybatı kıyı şeridi Aksaray " +
      'sınırları içindedir.',
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
    plateCode: '70',
    nameTr: 'Karaman',
    slugTr: 'karaman',
    slugEn: 'karaman',
    region: GeographicRegion.IcAnadolu,
    population: 262_355,
    populationYear: POPULATION_YEAR,
    areaKm2: 8678, // HGM
    districtCount: 6,
    elevationM: 1018, // MGM Merkez istasyonu
    latitude: 37.1932,
    longitude: 33.2202,
    // Konya=42, Antalya=07, Mersin=33 (3 komşu) — Niğde ve Adana fact-check'te GeoJSON
    // geometrik analizle ÇIKARILDI (Karaman-Niğde ~19-33 km, Karaman-Adana ~53-62 km; sınır
    // komşusu değil).
    neighborPlateCodes: ['42', '07', '33'],
    climateKoppen: KOPPEN_BSK,
    climateClassTr: CLIMATE_CLASS_BSK_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_BSK_TR,
    climateCurriculumNameTr: CURRICULUM_IC_ANADOLU,
    // ── Karaman deep content (wave-6a Tier-B). 6-field set (hydrographyFeatures +
    //    settlementNoteTr omitted, Tier-B). 1989'da Konya'dan ayrıldı + Karamanoğulları +
    //    Karadağ/Binbirkilise; step-Toros geçiş kuşağı; Ermenek Çayı (Akdeniz havzası).
    //    net göç -5,79 ‰; GSYH share %0,3.
    landformNoteTr:
      "Karaman, kuzeyde İç Anadolu'nun step platosu ile güneyde Toros Dağları'nın başladığı " +
      'bir geçiş kuşağındadır. İlin kuzeyindeki Karadağ, sönmüş bir volkanik kütledir; ' +
      "güneydeki Ermenek ve Sarıveliler ilçelerinde ise Toros'un dik, ormanlık dağlık arazisi " +
      'başlar.',
    introTr:
      "Karaman, 1989'da Konya'dan ayrılarak ayrı bir il olmuştur; 13-16. yüzyıllar arasında " +
      "Anadolu'nun güçlü beyliklerinden Karamanoğulları'na başkentlik yapmıştır. İlin " +
      "kuzeyinde yükselen Karadağ'daki Binbirkilise ören yeri, Bizans döneminden kalma " +
      'yüzlerce kilise ve manastır kalıntısını barındırır.',
    hydrographyNoteTr:
      "Karaman'ın yüzey suyu kaynakları sınırlıdır; ilin kuzey kesimi kapalı iç havza " +
      "karakterindedir. Güneydeki Ermenek ilçesinden doğan Ermenek Çayı, Toros'un derin " +
      'vadilerinden geçerek Mersin yönünde Akdeniz havzasına akar.',
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
    plateCode: '71',
    nameTr: 'Kırıkkale',
    slugTr: 'kirikkale',
    slugEn: 'kirikkale',
    region: GeographicRegion.IcAnadolu,
    population: 282_830,
    populationYear: POPULATION_YEAR,
    areaKm2: 4791, // HGM — İç Anadolu'nun bu platformda seed edilmiş illeri arasında en küçüğü
    districtCount: 9,
    elevationM: 751, // MGM Merkez istasyonu
    latitude: 39.8433,
    longitude: 33.5181,
    // Ankara=06, Yozgat=66, Çankırı=18, Kırşehir=40, Çorum=19 (5 komşu) — Bolu fact-check'te
    // GeoJSON geometrik analizle ÇIKARILDI (Kırıkkale-Bolu ~107-117 km; Çankırı/Ankara arada,
    // sınır komşusu değil; Kırıkkale Valiliği resmi sayfası da 5 komşu sayar).
    neighborPlateCodes: ['06', '66', '18', '40', '19'],
    climateKoppen: KOPPEN_BSK,
    climateClassTr: CLIMATE_CLASS_BSK_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_BSK_TR,
    climateCurriculumNameTr: CURRICULUM_IC_ANADOLU,
    // ── Kırıkkale deep content (wave-6a Tier-B). 6-field set (hydrographyFeatures +
    //    settlementNoteTr omitted, Tier-B). 1925 Top ve Tüfek Fabrikası ile kurulan planlı
    //    savunma sanayii şehri (MKE); Kızılırmak + Delice Irmağı. net göç -11,58 ‰;
    //    GSYH share %0,3.
    landformNoteTr:
      "Kırıkkale, Kızılırmak'ın Ankara'ya yakın kesiminden geçtiği, ortalama 700-850 metre " +
      "yükseklikteki dar bir plato şeridi üzerindedir. İl, İç Anadolu Bölgesi'nin bu " +
      'platformda seed edilmiş illeri arasında en küçük yüzölçümüne sahiptir.',
    introTr:
      "Kırıkkale, 1925'te Top ve Tüfek Fabrikası'nın temellerinin atılmasıyla kurulan, planlı " +
      'bir savunma sanayii şehridir. Bugün MKE (Makine ve Kimya Endüstrisi) fabrikaları, ilin ' +
      'ekonomisinin ve kentleşmesinin belirleyici unsuru olmaya devam eder.',
    hydrographyNoteTr:
      "Kızılırmak, ilin ortasından geçerek Kırıkkale'nin su ağının omurgasını oluşturur; " +
      "Delice ilçesi yakınında Delice Irmağı'nı (Kızılırmak'ın bir kolu) alır.",
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
    plateCode: '18',
    nameTr: 'Çankırı',
    slugTr: 'cankiri',
    slugEn: 'cankiri',
    region: GeographicRegion.IcAnadolu,
    population: 200_549,
    populationYear: POPULATION_YEAR,
    areaKm2: 7542, // HGM
    districtCount: 12,
    elevationM: 755, // MGM Merkez istasyonu
    latitude: 40.6082,
    longitude: 33.6102,
    // Karabük=78, Kastamonu=37, Çorum=19, Kırıkkale=71, Ankara=06, Bolu=14 (6 komşu)
    neighborPlateCodes: ['78', '37', '19', '71', '06', '14'],
    climateKoppen: KOPPEN_CFA,
    climateClassTr: CLIMATE_CLASS_CFA_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_CFA_TR,
    climateCurriculumNameTr: CURRICULUM_IC_ANADOLU,
    // ── Çankırı deep content (wave-6a Tier-B). 6-field set (hydrographyFeatures +
    //    settlementNoteTr omitted, Tier-B). Karadeniz'e geçiş kuşağı (Cfa) + Kaya Tuzu
    //    Mağarası; Ilgaz Dağı Milli Parkı (Büyükhacet 2.587 m) + tuz/jips platosu;
    //    Kızılırmak + Devrez Çayı. net göç -27,69 ‰ (bu partinin en negatif değeri);
    //    GSYH share %0,2.
    landformNoteTr:
      "Çankırı'nın kuzeyinde, Kastamonu sınırında yükselen Ilgaz Dağı'nın 2.587 " +
      'metrelik Büyükhacet Tepesi, milli park statüsündeki dağlık kütlenin en yüksek ' +
      'noktasıdır — milli parkın küçük bir bölümü (yaklaşık 338 hektar) Çankırı sınırları ' +
      "içindedir. İlin geri kalanı, Kızılırmak'ın kollarıyla parçalanmış, tuz ve jips " +
      'yataklarıyla bilinen bir plato arazisidir.',
    introTr:
      "Çankırı, İç Anadolu'nun Karadeniz'e geçiş kuşağındaki ilidir — Cfa Köppen sınıfı, ilin " +
      'bu geçiş karakterini yansıtır. Kent merkezine yakın Kaya Tuzu Mağarası, Hititler ' +
      'döneminden beri işletilen bir tuz yatağı üzerine kuruludur.',
    hydrographyNoteTr:
      'Kızılırmak, ilin güney kesiminden geçer; adını taşıyan Kızılırmak ilçesi bu güzergah ' +
      "üzerindedir. Devrez Çayı ise Ilgaz Dağı'ndan doğarak ilin kuzeyinden geçer ve " +
      "Kastamonu yönünde Gökırmak'a katılır.",
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
];

/**
 * ── Wave-6c — Karadeniz-A (9 il, BRAND-NEW from scratch) ──────────────────────
 * The platform's FIRST provinces in the Karadeniz region (`GeographicRegion.Karadeniz`).
 * Unlike every prior wave (base data first, deep content later — or deep content onto
 * already-seeded base rows), this batch produces BOTH layers in ONE pass — base data +
 * population-tiered deep content — from NOVA's independently fact-checked "Dalga 6c" draft
 * (verdict SEED-READY WITH CORRECTIONS: the sole mandatory fix — all 9 `netMigrationRate`
 * values re-read from TÜİK's own official "Net göç hızı" column instead of a manual
 * recompute — is applied here).
 *   • Content/base: Owner's Inbox/data-source-groundwork/wave6c-karadeniz-a-draft.md
 *   • Fact-check:   Owner's Inbox/data-source-groundwork/wave6c-karadeniz-a-factcheck.md
 *   • Style rules:  CONTENT-STYLE.md (orchestrator root — binding for shipped prose)
 *   • Ledger:       data-provenance.md (root) — Wave-6c
 *
 * TIER split (→ DEC 2026-07-11 threshold 1M): Samsun 55 is the SOLE Tier-A (full 8-field
 * set incl. hydrographyFeatures). Trabzon 61 and Ordu 52 are Tier-B by population BUT are
 * legally büyükşehir, so — exactly like wave-5's Mardin (→ DEC 2026-07-12) — each carries a
 * MINIMAL single-sentence `settlementNoteTr` (the 6360 %100 caveat ONLY), while staying
 * Tier-B for every other field (hydrographyFeatures absent → null). The other six (Giresun
 * 28, Rize 53, Artvin 08, Gümüşhane 29, Bayburt 69, Amasya 05) are plain Tier-B (6-field
 * set: hydrographyFeatures + settlementNoteTr absent → null).
 *
 * KÖPPEN — five classes across the nine, ALL reusing constants introduced by earlier or
 * sibling waves (wave-6c adds NO new Köppen code of its own — the merge order landed both
 * Cfb and the D-group ahead of it):
 *   • Csa (Trabzon 61, Amasya 05) → shared MGM_KOPPEN_CAVEAT_TR. Trabzon is Csa DESPITE
 *     being a coast il (MGM's own row; its summers run drier than neighbouring Rize's) —
 *     a concrete case of MGM's own "third-letter rule has limited discriminating power"
 *     warning, shipped WITH that caveat exactly like Ankara/Van. NOT "corrected" to Cfa.
 *   • Cfa (Samsun 55, Ordu 52, Giresun 28, Rize 53) → CLIMATE_CLASS_CFA_TR + Cfa caveat.
 *   • Csb (Gümüşhane 29) → existing CLIMATE_CLASS_CSB_TR (the wave-3 third class).
 *   • Cfb (Artvin 08) → "Karadeniz iklimi" (same as Cfa, → DEC 2026-07-12). REUSES the
 *     KOPPEN_CFB constants introduced by the sibling wave-6d (PR #19, merged first) — this
 *     rebase corrected their caveat wording "yazı sıcak" → "yazı serin" (a "b"-suffix climate
 *     has a cool/warm summer, not a hot one; the fix also covers wave-6d's own Cfb il).
 *   • Dsb (Bayburt 69) → "Karasal iklim" (whole D-group, → DEC 2026-07-12). REUSES the
 *     KOPPEN_DSB + CLIMATE_CLASS_D_GROUP_TR + MGM_KOPPEN_CAVEAT_DSB_TR constants introduced by
 *     the sibling wave-6b (PR #20, Doğu Anadolu, merged first) — Bayburt is NOT the platform's
 *     first D-group il (wave-6b's Ağrı/Ardahan preceded it), only wave-6c's first.
 *
 * NET MIGRATION — this batch holds the platform's TWO largest magnitudes: Gümüşhane
 * -42.80 ‰ (new record, prev Siirt -33.96) and Bayburt -35.16 ‰ (2nd) — BOTH transcribed
 * from TÜİK's corrected official column (superseding the draft's earlier -43.74 / -35.79
 * manual-calc values). Samsun +2.60 ‰ is the batch's SOLE positive.
 *
 * CONTENT CORRECTIONS APPLIED (Atlas ruling 2026-07-12 — the three items surfaced at PR review;
 * all are jargon/geographic fixes, no fact invented; none was pinned by a test token so CI is
 * unaffected):
 *   (1) Gümüşhane introTr — DROPPED the "platformda gördüğü ikinci Köppen sınıfı (Csb)" clause
 *       (platform-content-rollout ordinal is internal-process leakage into customer-facing text);
 *       the sentence now states only the real climate characteristics (kurak yazlı, ılıman-serin,
 *       unlike its coastal neighbours).
 *   (2) Artvin landformNoteTr — "Akdeniz kıyısına paralel" → "Karadeniz kıyısına paralel": the
 *       Kaçkar/Karadeniz Dağları parallel the BLACK SEA coast, not the Mediterranean.
 *   (3) Samsun settlementNoteTr + Bayburt introTr — REMOVED the internal-batch reference
 *       ("bu partideki dokuz il", same class of jargon-leak as wave-6d's Bolu catch); each now
 *       states only customer-relevant facts (Samsun's +2,60 ‰ positive rate; Bayburt's elevation).
 *   Jargon sweep of all 9 il's prose for parti/dalga/batch/wave: CLEAN. (NB: 5 PRE-EXISTING
 *   "bu dalga(da)" instances remain in the already-merged wave-3/4 prose — Muğla, Uşak, Adana,
 *   Kahramanmaraş, Mersin — flagged to Atlas as out-of-scope for this PR.)
 *   CLOSED 2026-08-05: all five are fixed — Muğla + Uşak in PR #95, Adana + Kahramanmaraş +
 *   Mersin in PR #96 (AT-11b). Each carried TWO faults that could not be fixed separately: the
 *   internal wave name, and a superlative that was only true INSIDE that wave. Dropping the
 *   leak alone would have promoted a false claim to national scale, so both went together and
 *   no replacement superlative was asserted (the Van precedent, PR #95). National ranks, from
 *   our own 81 rows: Mersin 20th, Kahramanmaraş 10th, Adana 3rd by absolute value. A corpus
 *   re-scan for parti/dalga/batch/wave now returns NOTHING in customer-facing prose.
 */
export const WAVE6C_KARADENIZ_A_PROVINCES: readonly ProvinceSeed[] = [
  {
    plateCode: '05',
    nameTr: 'Amasya',
    slugTr: 'amasya',
    slugEn: 'amasya',
    region: GeographicRegion.Karadeniz,
    population: 342_242,
    populationYear: POPULATION_YEAR,
    areaKm2: 5628,
    districtCount: 7,
    elevationM: 409, // MGM Merkez istasyonu
    latitude: 40.6668,
    longitude: 35.8353,
    // Samsun=55, Tokat=60, Yozgat=66, Çorum=19
    neighborPlateCodes: ['55', '60', '66', '19'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    climateCurriculumNameTr: CURRICULUM_KARADENIZ,
    climateCurriculumNoteTr:
      "Amasya, Karadeniz Bölgesi'nin iç kesiminde, Yeşilırmak vadisinin açtığı koridordadır. " +
      'Ders kitabı haritasında Karadeniz iklimi alanının iç sınırına çok yakın okunur; sınırın ' +
      'hemen güneyi İç Anadolu karasal iklimi alanıdır. Haritanın ölçeği bu sınırı il düzeyinde ' +
      'kesinleştirmeye elvermez. Sayfadaki ad ilin bölge içindeki konumuna dayanır.',
    // ── Amasya deep content (wave-6c plain Tier-B). 6-field set (hydrographyFeatures +
    //    settlementNoteTr DELIBERATELY OMITTED → null, Tier-B scope). urbanizationRate=75.80 is
    //    a REAL rate (non-büyükşehir) and the highest Tier-B rate of the batch; net göç -1,65 is
    //    the batch's smallest-magnitude negative. GSYH share %0,3.
    landformNoteTr:
      "İlin arazisi, Yeşilırmak'ın vadisi boyunca uzanan dar bir koridor ile bu koridoru " +
      'çevreleyen daha yüksek platolardan oluşur. Harşena Dağı, vadinin kuzeyinde yaklaşık 300 ' +
      'metre yükselen kalker bir kütledir; kayalıklara oyulmuş mezarlar bu kütlenin güney ' +
      'yamacında yer alır.',
    introTr:
      "Amasya, Yeşilırmak'ın açtığı dar ve derin bir vadide kuruludur; kent merkezi, nehrin iki " +
      'yakasını dik kayalıklar arasında birbirine bağlar. Vadinin kuzey yamacındaki Harşena ' +
      "Dağı'nın eteklerine oyulmuş Pontus Kral Kaya Mezarları, MÖ 302-26 yılları arasında Pontus " +
      "Krallığı'na başkentlik yapan kentin bu döneme ait en görünür izidir; 2015'te UNESCO Dünya " +
      "Mirası Geçici Listesi'ne alınmıştır.",
    hydrographyNoteTr:
      'Yeşilırmak, ilin ana su kaynağı ve aynı zamanda kent dokusunu şekillendiren temel ' +
      "unsurdur; nehir, Amasya'dan sonra kuzeye yönelip Samsun'daki deltasında Karadeniz'e " +
      'ulaşır. İlin sınır komşuluklarının çoğu (Samsun, Tokat, Çorum) da aynı Yeşilırmak havzası ' +
      'içinde yer alır.',
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
    plateCode: '08',
    nameTr: 'Artvin',
    slugTr: 'artvin',
    slugEn: 'artvin',
    region: GeographicRegion.Karadeniz,
    population: 167_531,
    populationYear: POPULATION_YEAR,
    areaKm2: 7393,
    districtCount: 9,
    elevationM: 613, // MGM Merkez istasyonu
    latitude: 41.1752,
    longitude: 41.8187,
    // Rize=53, Erzurum=25, Ardahan=75 (+ Gürcistan — ülke, hariç)
    neighborPlateCodes: ['53', '25', '75'],
    climateKoppen: KOPPEN_CFB,
    climateClassTr: CLIMATE_CLASS_CFB_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_CFB_TR,
    climateCurriculumNameTr: CURRICULUM_KARADENIZ,
    // ── Artvin deep content (wave-6c plain Tier-B). The platform's FIRST Cfb il (→ "Karadeniz
    //    iklimi", same label as Cfa, DEC 2026-07-12). 6-field set (hydrographyFeatures +
    //    settlementNoteTr null). urbanizationRate=65.27 REAL; net göç -16,00; GSYH share %0,1.
    //    NB (fixed per Atlas ruling 2026-07-12): landformNoteTr said "Akdeniz kıyısına paralel"
    //    → corrected to "Karadeniz kıyısına paralel" (the range parallels the Black Sea coast).
    landformNoteTr:
      "İlin güneydoğusunda yükselen Kaçkar Dağı, 3.937 metreyle Karadeniz Dağları'nın en yüksek " +
      'noktasıdır ve Karadeniz kıyısına paralel uzanan sıradağın bir parçasıdır. Şavşat ile Borçka ' +
      'ilçeleri arasında, Gürcistan sınırına kadar uzanan Karçal Dağları ise 3.428 metreye ' +
      "ulaşır; bu kütle, Doğu Karadeniz'in ılıman-nemli karışık ormanlarının en iyi korunmuş " +
      'örneklerinden bazılarını barındırır.',
    introTr:
      "Artvin, Karadeniz Bölgesi'nin en dağlık ve en ormanlık ilidir; topraklarının yaklaşık " +
      "%79'u dağlarla, yalnızca %1'i düzlüklerle kaplıdır. İlin ortasından geçen Çoruh Nehri, " +
      'derin ve dar bir vadi oyarak Gürcistan sınırına doğru akar; bu vadi, ilin yerleşim ' +
      'düzenini ve ulaşım ağını doğrudan belirler.',
    hydrographyNoteTr:
      "Çoruh Nehri'nin toplam 376 kilometrelik uzunluğunun yaklaşık 150 kilometresi Artvin " +
      'sınırları içinden geçer. Nehir üzerinde inşa edilen Deriner Barajı, 249 metrelik gövde ' +
      "yüksekliğiyle Türkiye'nin en yüksek barajıdır; 2012'de enerji üretimine başlamıştır.",
    urbanizationRate: 65.27,
    netMigrationRate: -16.0,
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,1',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    plateCode: '69',
    nameTr: 'Bayburt',
    slugTr: 'bayburt',
    slugEn: 'bayburt',
    region: GeographicRegion.Karadeniz,
    population: 82_836,
    populationYear: POPULATION_YEAR,
    areaKm2: 3746,
    districtCount: 3,
    elevationM: 1584, // MGM Merkez istasyonu (batch's highest il centre)
    latitude: 40.2547,
    longitude: 40.2207,
    // Trabzon=61, Gümüşhane=29, Rize=53, Erzurum=25, Erzincan=24
    neighborPlateCodes: ['61', '29', '53', '25', '24'],
    climateKoppen: KOPPEN_DSB,
    climateClassTr: CLIMATE_CLASS_D_GROUP_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_DSB_TR,
    climateCurriculumNameTr: CURRICULUM_DOGU_ANADOLU,
    climateCurriculumNoteTr:
      "Bayburt idari olarak Karadeniz Bölgesi'ndedir, iklim adı ise Doğu Anadolu'yu anar. İki " +
      "sınıflandırma burada aynı yönü gösterir: MGM'nin Köppen kodu da ili kışı şiddetli karasal " +
      "gruba koyar. İl merkezi 1.584 metre yükseklikte, Çoruh'un yukarı havzasındadır. Adı " +
      'belirsiz bırakan tek nokta, ders kitabı haritasında ilin iki alanın sınırında ' +
      'okunmasıdır.',
    // ── Bayburt deep content (wave-6c plain Tier-B). The platform's FIRST Dsb / "D" main-group il
    //    (→ "Karasal iklim", DEC 2026-07-12). 6-field set (hydrographyFeatures + settlementNoteTr
    //    null). urbanizationRate=65.95 REAL; net göç -35,16 is the platform's 2ND-largest magnitude
    //    (surpasses the old Siirt -33.96 record). GSYH share %0,1. Türkiye's least-populous il.
    //    NB (fixed per Atlas ruling 2026-07-12): introTr's "bu partideki dokuz il" internal-batch
    //    reference REMOVED — the closing sentence now just states the 1.584 m elevation.
    landformNoteTr:
      'İlin güneyinde, Erzurum yolu üzerinde yükselen Kop Dağı 2.918 metreye ulaşır; Karadeniz ' +
      "Bölgesi'ni Doğu Anadolu'ya bağlayan tarihi bir geçit güzergâhı üzerindedir. İlin diğer " +
      'önemli yükseltileri arasında Çoşan Dağı (2.963 m) ve Otlukbeli Dağı (2.520 m) yer alır. ' +
      "Bu yüksek, dağlık çevre, Bayburt'un kıyı illerine göre çok daha az yağış alan, karasal " +
      'özellikte bir iklime sahip olmasının başlıca nedenidir.',
    introTr:
      "Bayburt, 82.836 kişilik nüfusuyla Türkiye'nin en az nüfuslu ilidir. Çoruh Nehri, il " +
      'sınırları içinde Pullur ve Sakızlı derelerinin birleşmesiyle asıl akarsu hüviyetini ' +
      "kazanır; bu nedenle Çoruh'un yukarı havzası Bayburt'un coğrafyasıyla doğrudan bağlantılıdır. " +
      'İl merkezinin rakımı 1.584 metredir.',
    hydrographyNoteTr:
      'Çoruh Nehri, Bayburt il merkezinin güneyinde Pullur ve Sakızlı derelerinin birleşmesiyle ' +
      "oluşur; buradan kuzeydoğuya, Erzurum ve Artvin üzerinden Gürcistan'a doğru akar. İlin " +
      "diğer akarsuları Karasu (Fırat'ın bir kolu değil, Çoruh'un bir kolu) ile besleniyor; bu " +
      "iki nehir arasındaki su bölümü çizgisi Kop Dağı'ndan geçer.",
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
    plateCode: '28',
    nameTr: 'Giresun',
    slugTr: 'giresun',
    slugEn: 'giresun',
    region: GeographicRegion.Karadeniz,
    population: 455_074,
    populationYear: POPULATION_YEAR,
    areaKm2: 6972,
    districtCount: 16,
    elevationM: 38, // MGM Merkez istasyonu
    latitude: 40.9227,
    longitude: 38.3878,
    // Trabzon=61, Gümüşhane=29, Erzincan=24, Sivas=58, Ordu=52
    neighborPlateCodes: ['61', '29', '24', '58', '52'],
    climateKoppen: KOPPEN_CFA,
    climateClassTr: CLIMATE_CLASS_CFA_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_CFA_TR,
    climateCurriculumNameTr: CURRICULUM_KARADENIZ,
    // ── Giresun deep content (wave-6c plain Tier-B, Cfa). 6-field set (hydrographyFeatures +
    //    settlementNoteTr null). urbanizationRate=67.73 REAL; net göç -12,17; GSYH share %0,3.
    landformNoteTr:
      'Kıyı ile güneydeki Kelkit Vadisi arasında yükselen Giresun Dağları, ilin ana yer şeklidir; ' +
      "kütlenin Giresun-Gümüşhane sınırındaki en yüksek noktası Abdal Musa Tepesi'dir, 3.331 " +
      'metreye ulaşır. Aynı kütle üzerindeki Karagöl, 2.760 metre yükseklikte bir buzul gölüdür ' +
      've dağın en büyük gölüdür. Kulakkaya, Kümbet ve Bektaş gibi yaylalar bu yüksek kütlenin ' +
      'üzerinde yer alır.',
    introTr:
      'Giresun, adını dünyaya yayan fındığın kültüre alındığı bölgelerden biri olarak bilinir; ' +
      'il, dar bir kıyı şeridiyle güneyindeki Giresun Dağları arasında dik bir topografyaya ' +
      "sahiptir. Kıyıdaki Giresun Adası, Karadeniz'in Türkiye kıyılarındaki tek doğal adasıdır.",
    hydrographyNoteTr:
      'İlin doğusunda Aksu Çayı, batısında Batlama Deresi ilin başlıca akarsularıdır; Aksu ' +
      "Çayı'nın havzası 898 kilometrekare, Batlama Deresi'ninki 161 kilometrekaredir. Her ikisi " +
      'de dik eğimli, kısa havzaları nedeniyle ani sel ve taşkınlara yol açabilen akarsular ' +
      'arasında sayılır.',
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
    plateCode: '29',
    nameTr: 'Gümüşhane',
    slugTr: 'gumushane',
    slugEn: 'gumushane',
    region: GeographicRegion.Karadeniz,
    population: 138_807,
    populationYear: POPULATION_YEAR,
    areaKm2: 6668,
    districtCount: 6,
    elevationM: 1216, // MGM Merkez istasyonu
    latitude: 40.4598,
    longitude: 39.4653,
    // Trabzon=61, Giresun=28, Bayburt=69, Erzincan=24
    neighborPlateCodes: ['61', '28', '69', '24'],
    climateKoppen: KOPPEN_CSB,
    climateClassTr: CLIMATE_CLASS_CSB_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_CSB_TR,
    climateCurriculumNameTr: CURRICULUM_DOGU_ANADOLU,
    climateCurriculumNoteTr:
      'MGM Karadeniz iklimini kıyı şeridi ile dağların kuzeye bakan kesimlerinde tanımlar. ' +
      "Gümüşhane bu sıradağların güney yüzünde kaldığı için, Karadeniz Bölgesi'nde bulunmasına " +
      "karşın Doğu Anadolu'nun karasal iklim alanına girer. Ders kitabı haritası ili iki alanın " +
      'tam sınırında gösterir; 1.216 metredeki il merkezi ve güneydeki Kelkit yaylası ile ' +
      'karasal taraf ağır basar. Aynı ad, doğu komşusu Bayburt için de kullanılır.',
    // ── Gümüşhane deep content (wave-6c plain Tier-B, Csb — the wave-3 third class). 6-field set
    //    (hydrographyFeatures + settlementNoteTr null). urbanizationRate=61.03 REAL and the LOWEST
    //    of the batch; net göç -42,80 is the platform's LARGEST-magnitude value (new record). GSYH
    //    share %0,1. NB (fixed per Atlas ruling 2026-07-12): introTr's "platformda gördüğü ikinci
    //    Köppen sınıfı (Csb)" platform-meta clause REMOVED — the sentence now states only the real
    //    climate characteristics (kurak yazlı, ılıman-serin, unlike its coastal neighbours).
    landformNoteTr:
      'İlin kuzey kesimi (Merkez, Torul, Kürtün) sarp ve dağlıktır; buradaki Giresun-Gümüşhane ' +
      'sınırındaki Abdal Musa Tepesi, 3.331 metreyle ilin en yüksek noktasıdır. Güney kesimi ' +
      '(Kelkit, Köse, Şiran) ise 1.450-1.750 metre yükseklikte bir yayla karakterine sahiptir; ' +
      'Kelkit Ovası olarak bilinen bu düzlük yaklaşık 280 kilometrekaredir.',
    introTr:
      "Gümüşhane, Doğu Karadeniz'in iç kesiminde, kıyıdaki nemli iklimden Doğu Anadolu'nun " +
      'karasal iklimine geçiş bölgesinde yer alır; il merkezinin rakımı 1.216 metredir. Bu geçiş ' +
      'karakteri, ilin komşusu kıyı illerin çoğunun aksine kurak yazlı, ılıman-serin bir iklim ' +
      'tipine sahip olmasını açıklar.',
    hydrographyNoteTr:
      "İlin başlıca akarsuyu, doğu sınırındaki dağlardan doğan ve Torul ile Kürtün'ü geçip " +
      "Tirebolu (Giresun) yakınından Karadeniz'e dökülen 160 kilometrelik Harşit Çayı'dır. İlin " +
      "güneyindeki Kelkit Çayı ise Karadeniz'e değil, Yeşilırmak havzasına bağlanan ayrı bir akış " +
      "yönü izler — bu, ilin su ağının kuzey (Karadeniz'e akan) ve güney (Yeşilırmak'a akan) " +
      'olmak üzere iki ayrı havzaya bölündüğünü gösterir.',
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
    plateCode: '52',
    nameTr: 'Ordu',
    slugTr: 'ordu',
    slugEn: 'ordu',
    region: GeographicRegion.Karadeniz,
    population: 768_087,
    populationYear: POPULATION_YEAR,
    areaKm2: 5914,
    districtCount: 19,
    elevationM: 5, // MGM Altınordu istasyonu (büyükşehir; ayrı "Merkez" ilçesi yok)
    latitude: 40.9838,
    longitude: 37.8858,
    // Samsun=55, Giresun=28, Tokat=60, Sivas=58
    neighborPlateCodes: ['55', '28', '60', '58'],
    climateKoppen: KOPPEN_CFA,
    climateClassTr: CLIMATE_CLASS_CFA_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_CFA_TR,
    climateCurriculumNameTr: CURRICULUM_KARADENIZ,
    // ── Ordu deep content (wave-6c Tier-B + büyükşehir EXCEPTION → DEC 2026-07-12, same as Mardin).
    //    Tier-B depth (hydrographyFeatures null) BUT legally büyükşehir, so urbanizationRate=100 is
    //    the 6360 legal artifact and carries a settlementNoteTr holding ONLY the single 6360 caveat
    //    sentence (NO migration narrative — that lives in netMigrationRate=-7.25). GSYH share %0,5.
    landformNoteTr:
      "İlin en yüksek noktası, güneydoğusundaki Karagöl Dağları'nda 3.107 metreye ulaşan Karagöl " +
      "Tepesi'dir; aynı kütledeki Kırklar Tepesi 3.039 metreye çıkar. Kıyıdan güneye doğru arazi " +
      'hızla yükselir, tarım arazileri dar ve parçalı vadi yamaçlarına sıkışmıştır — bu, hem ' +
      'fındık bahçelerinin karakteristik teraslanmış görünümünü hem de dağınık, yayla-tipi ' +
      'yerleşim düzenini açıklar.',
    introTr:
      'Ordu, dar bir kıyı şeridiyle güneyindeki sarp Karagöl Dağları arasında uzanan, Türkiye ' +
      'fındık üretiminin ağırlık merkezlerinden biri olan bir ildir. Fındık, Karadeniz kıyısının ' +
      "hemen her yerinde yetişse de en yoğun biçimde Ordu ve komşusu Giresun'da üretilir; iki il " +
      "birlikte Türkiye'nin — dolayısıyla dünyanın önemli bir bölümünün — fındık arzını karşılar.",
    hydrographyNoteTr:
      "İlin en büyük akarsuyu, Karagöl Dağları'ndan doğup kent merkezinin doğusundan " +
      "Karadeniz'e dökülen Melet Irmağı'dır. Kıyı boyunca sıralanan çok sayıda küçük dere, dik " +
      'eğimli havzalarından kaynaklanan ani taşkınlarla bilinir; bu derelerin havza yapısı, ' +
      "DSİ'nin bölgedeki yüzey suyu araştırmalarının (Melet Irmağı Havzası Yüzey Araştırması) " +
      'konusunu oluşturuyor.',
    urbanizationRate: 100.0,
    netMigrationRate: -7.25,
    settlementNoteTr:
      "Ordu'nun TÜİK il/ilçe merkezi nüfus oranı, büyükşehir statüsündeki illerde olduğu gibi " +
      "%100'dür. Bu oran ilin fiilen tamamen kentleştiği anlamına gelmez; belde ve köylerin " +
      "idari tüzel kişiliğinin 6360 sayılı Kanun'la kaldırılmasının bir sonucudur.",
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,5',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    plateCode: '53',
    nameTr: 'Rize',
    slugTr: 'rize',
    slugEn: 'rize',
    region: GeographicRegion.Karadeniz,
    population: 346_947,
    populationYear: POPULATION_YEAR,
    areaKm2: 3835,
    districtCount: 12,
    // MGM Merkez istasyonu. Rakım: MGM'nin WMO/OSCAR kaydı, WIGOS 0-20000-0-17040 → 3 m
    // (erişim 2026-08-04). Tahmin servisinin 0'ı ölçüm değil, boş-değer kodlaması; eski
    // "Kocaeli/İzmit emsali" gerekçesi düştü — o satırın 0'ı da aynı kusurdu (→ AN-1).
    elevationM: 3,
    latitude: 41.04,
    longitude: 40.5013,
    // Trabzon=61, Artvin=08, Bayburt=69, Erzurum=25
    neighborPlateCodes: ['61', '08', '69', '25'],
    climateKoppen: KOPPEN_CFA,
    climateClassTr: CLIMATE_CLASS_CFA_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_CFA_TR,
    climateCurriculumNameTr: CURRICULUM_KARADENIZ,
    // ── Rize deep content (wave-6c plain Tier-B, Cfa). 6-field set (hydrographyFeatures +
    //    settlementNoteTr null). urbanizationRate=68.02 REAL; net göç -11,87; GSYH share %0,3.
    //    Türkiye's rainiest il — the natural condition for its tea agriculture.
    //    P3 CONTENT FIX (2026-08-05, AT-7 option A): the prose used to publish ">2.250 mm",
    //    a Tier-2 figure that matched NEITHER our own published series (ERA5-Land 1991-2020,
    //    Rize 2.222,8 mm — the climate table on this very page) NOR MGM's own station table
    //    (1927-2025, 2.091,7 mm). Three numbers, one page. The FIGURE is gone from introTr
    //    and hydrographyNoteTr; the QUALITATIVE claim stays, verified against all 81
    //    provinces in `data/era5-land/era5-province-series.json` (Rize 1st, then Trabzon
    //    2.169,2 · Artvin 2.103,8 · Giresun 1.919,3). Do not put a millimetre figure back in
    //    the prose: the page's own table already publishes one (→ DEC 2026-08-04c retires
    //    the MGM series, so it must not gain a new prose citation either).
    landformNoteTr:
      "İlin güneyi, Kaçkar Dağları'nın kuzeybatı uzantılarıyla hızla yükselir; kıyı ile dağlık " +
      'kesim arasındaki düzlük neredeyse yok denecek kadar dardır. Çamlıhemşin ilçesindeki ' +
      "Fırtına Deresi, Kaçkar Dağları'ndan inen çok sayıda derenin birleşmesiyle oluşur ve " +
      "yaklaşık 57 kilometre sonra Ardeşen yakınlarında Karadeniz'e ulaşır; derin ve dar " +
      'kanyonuyla bölgenin dik topografyasının tipik bir örneğidir.',
    introTr:
      "Rize, Türkiye'nin en yağışlı ilidir. Yıllık yağış yılın her mevsimine dağılır ve kurak " +
      'bir dönem oluşturmaz; bu rejim, ilin ekonomisinin temelini oluşturan çay tarımının ' +
      'doğrudan doğal koşuludur. Kıyı şeridinden iç kesimlere doğru dik yamaçlar boyunca ' +
      'sıralanan çay bahçeleri, ilin en tanınan manzarasını oluşturur.',
    hydrographyNoteTr:
      'Yıl boyunca süren yüksek yağış, ile yoğun bir akarsu ağı ve bol yeraltı suyu kazandırır; ' +
      "Fırtına Deresi'nin yanı sıra çok sayıda küçük dere kıyı boyunca doğrudan Karadeniz'e " +
      'dökülür. Bu bol su kaynağı, çay ve fındık tarımının yanında ilin başlıca geçim ' +
      'kaynaklarından birini oluşturan küçük ölçekli hidroelektrik ve içme suyu tesislerinin de ' +
      'altyapısını oluşturur.',
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
    plateCode: '55',
    nameTr: 'Samsun',
    slugTr: 'samsun',
    slugEn: 'samsun',
    region: GeographicRegion.Karadeniz,
    population: 1_392_403,
    populationYear: POPULATION_YEAR,
    areaKm2: 9725,
    districtCount: 17,
    elevationM: 4, // MGM Atakum istasyonu (büyükşehir; ayrı "Merkez" ilçesi yok)
    latitude: 41.3442,
    longitude: 36.2564,
    // Sinop=57, Ordu=52, Amasya=05, Tokat=60, Çorum=19 (+ Karadeniz — deniz, hariç)
    neighborPlateCodes: ['57', '52', '05', '60', '19'],
    climateKoppen: KOPPEN_CFA,
    climateClassTr: CLIMATE_CLASS_CFA_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_CFA_TR,
    climateCurriculumNameTr: CURRICULUM_KARADENIZ,
    // ── Samsun deep content (wave-6c Tier-A — the batch's SOLE ≥1M il). FULL 8-field set incl.
    //    hydrographyFeatures. Büyükşehir → urbanizationRate=100 is the 6360 artifact, framed in a
    //    FULL settlementNoteTr (unlike the Trabzon/Ordu minimal-caveat exception). netMigrationRate
    //    +2,60 is the batch's SOLE positive. GSYH share %1,2 (highest of the nine). NB (fixed per
    //    Atlas ruling 2026-07-12): settlementNoteTr's "bu partideki dokuz il" internal-batch
    //    reference REMOVED — it now states only that the +2,60 ‰ rate stayed positive.
    landformNoteTr:
      "İlin kıyı kesimi, batıda Kızılırmak'ın oluşturduğu Bafra Ovası ile doğuda Yeşilırmak'ın " +
      "oluşturduğu Çarşamba Ovası arasında geniş bir düzlük oluşturur; Bafra Ovası'nın kıyı " +
      "boyunca uzunluğu 69 kilometreye, Çarşamba Ovası'nınki 88 kilometreye ulaşır. Bu iki delta " +
      "ovası, Anadolu'nun kıyı ovaları arasında en büyükler arasında sayılır.\n\n" +
      "İlin güneyi, Canik Dağları'nın kuzey yamaçlarıyla kıyı ovasından iç kesimlere doğru " +
      'yükselir; kıyıdan güneye gidildikçe arazi giderek daha engebeli bir yapıya bürünür.',
    introTr:
      "Samsun, Kızılırmak ve Yeşilırmak'ın Karadeniz'e ulaştığı geniş kıyı ovasında kuruludur; " +
      'bu iki deltanın oluşturduğu düzlük, ilin Karadeniz kıyısındaki en geniş tarım arazisidir. ' +
      'Antik adı Amisos olan kent, MÖ 6. yüzyılda Milet kolonistleri tarafından kurulmuştur. ' +
      "19 Mayıs 1919'da Mustafa Kemal'in Samsun'a çıkışı, Kurtuluş Savaşı'nın fiilen başladığı " +
      'tarih olarak kabul edilir.',
    hydrographyNoteTr:
      "Türkiye'nin en uzun akarsuyu Kızılırmak, Bafra ilçesi yakınlarında Karadeniz'e dökülür; " +
      "nehrin taşıdığı alüvyonların oluşturduğu Kızılırmak Deltası, 1998'de Ramsar " +
      "Sözleşmesi'ne dahil edilmiş, Anadolu'nun ikinci büyük Ramsar alanıdır. Delta içindeki " +
      'Balık, Uzun, Cernek, Liman, Karaboğaz ve Mülk gölleri acı su özelliği taşır; alanda 358 ' +
      'kuş türü tespit edilmiştir.\n\n' +
      'İlin doğusunda Yeşilırmak, Çarşamba ilçesi yakınlarında kendi deltasını oluşturarak ' +
      'denize ulaşır. İçme suyu ihtiyacının büyük bölümü, Abdal Deresi üzerinde 1985-1988 ' +
      "arasında inşa edilen ve yaklaşık 580 milyon m³ kapasiteli Çakmak Barajı'ndan " +
      'karşılanır.',
    hydrographyFeatures: [
      { name: 'Kızılırmak', type: HydrographyFeatureType.Nehir },
      { name: 'Yeşilırmak', type: HydrographyFeatureType.Nehir },
      { name: 'Çakmak Barajı', type: HydrographyFeatureType.Baraj },
      { name: 'Liman Gölü', type: HydrographyFeatureType.Gol },
    ],
    urbanizationRate: 100.0,
    netMigrationRate: 2.6,
    settlementNoteTr:
      "Samsun'da da büyükşehir statüsünün yapısal sonucu geçerlidir: TÜİK il/ilçe merkezi nüfus " +
      "oranı %100'dür, çünkü belde ve köylerin idari tüzel kişiliği 6360 sayılı Kanun'la " +
      'kaldırılmıştır. 2024 yılında 46.841 kişi aldı, 43.246 kişi verdi; net göç hızı binde ' +
      '+2,60 ile pozitif kaldı.',
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%1,2',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
  {
    plateCode: '61',
    nameTr: 'Trabzon',
    slugTr: 'trabzon',
    slugEn: 'trabzon',
    region: GeographicRegion.Karadeniz,
    population: 823_323,
    populationYear: POPULATION_YEAR,
    areaKm2: 4628,
    districtCount: 18,
    elevationM: 39, // MGM Ortahisar istasyonu (büyükşehir; ayrı "Merkez" ilçesi yok)
    latitude: 40.9985,
    longitude: 39.7649,
    // Rize=53, Giresun=28, Gümüşhane=29, Bayburt=69 (+ Karadeniz — deniz, hariç)
    neighborPlateCodes: ['53', '28', '29', '69'],
    climateKoppen: KOPPEN_CSA,
    climateClassTr: CLIMATE_CLASS_TR,
    climateNoteTr: MGM_KOPPEN_CAVEAT_TR,
    climateCurriculumNameTr: CURRICULUM_KARADENIZ,
    // ── Trabzon deep content (wave-6c Tier-B + büyükşehir EXCEPTION → DEC 2026-07-12, same as
    //    Mardin/Ordu). Tier-B depth (hydrographyFeatures null) BUT legally büyükşehir, so
    //    urbanizationRate=100 is the 6360 artifact and carries a settlementNoteTr holding ONLY the
    //    single 6360 caveat sentence. Csa DESPITE being a coast il (see block header). GSYH %0,6.
    landformNoteTr:
      'İlin yüzölçümünün büyük bölümünü dağlar oluşturur; kıyı düzlükleri yalnızca akarsu ' +
      "ağızlarında dar şeritler halinde genişler. Güneydoğuda Soğanlı Dağları'nın en yüksek " +
      "noktası olan Çakırgöl Dağı 3.063 metreye, güneybatıda Zigana Dağları'ndaki Zigana Geçidi " +
      "2.356 metreye ulaşır. İlin en yüksek kesimi ise güneydoğu ucundaki Haldizen Dağları'dır, " +
      '3.000 metrenin üzerinde zirvelere sahiptir.',
    introTr:
      'Trabzon, Doğu Karadeniz kıyı şeridinin en kalabalık ilidir; dar bir sahil şeridiyle ' +
      'güneyindeki sarp dağlık kütle arasında sıkışmış bir topografyaya sahiptir. Maçka ' +
      "ilçesindeki Altındere Vadisi'nde, Karadağ'ın dik bir kayalığına oyularak inşa edilmiş " +
      'Sümela Manastırı, bu dik yamaçlı arazi yapısının en bilinen örneğidir; manastır deniz ' +
      'seviyesinden yaklaşık 1.150 metre yükseklikte yer alır.',
    hydrographyNoteTr:
      'İlin su ağı, güneydeki dağlardan kısa ve dik eğimli vadilerle kıyıya inen çok sayıda ' +
      'derenin (Solaklı, Yomra, Değirmendere, Sera, Foldere) oluşturduğu bir örüntüdür. İçme ve ' +
      "kullanma suyu ihtiyacının önemli bir bölümü Atasu Barajı'ndan karşılanır. Kent merkezinden " +
      'geçen Değirmendere, tarihsel olarak taşkın riski taşıyan bir vadi koridorudur; DSİ ve ' +
      'Trabzon Büyükşehir Belediyesi bu vadide taşkın kontrolü çalışmaları yürütüyor.',
    urbanizationRate: 100.0,
    netMigrationRate: -3.78,
    settlementNoteTr:
      "Trabzon'un TÜİK il/ilçe merkezi nüfus oranı, büyükşehir statüsündeki illerde olduğu gibi " +
      "%100'dür. Bu oran ilin fiilen tamamen kentleştiği anlamına gelmez; belde ve köylerin " +
      "idari tüzel kişiliğinin 6360 sayılı Kanun'la kaldırılmasının bir sonucudur.",
    economyIndicator: {
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%0,6',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    },
  },
];

/**
 * Every fact-checked province the geography seed loads, in batch order (pilot-5 first,
 * then Batch 2 wave-1, wave-2, wave-3, wave-4, then wave-6d Karadeniz-B, then wave-6b
 * Doğu Anadolu, wave-6a İç Anadolu, then wave-6c Karadeniz-A — the batch that completes
 * all 81). This is the
 * single list `seedGeography` iterates — the seed is keyed on the unique `plate_code`,
 * so array order is cosmetic (the public list endpoint re-orders by plate code). Grows
 * batch-by-batch toward the full 81 as each wave clears an independent fact-check.
 * Currently ALL 81 provinces: 5 pilot + 9 wave-1 + 10 wave-2 + 7 wave-3 + 7 wave-4 + 9 wave-6c +
 * 9 wave-6d + 13 wave-6b Doğu Anadolu + 12 wave-6a İç Anadolu.
 */
export const SEED_PROVINCES: readonly ProvinceSeed[] = [
  ...PILOT_PROVINCES,
  ...BATCH2_WAVE1_PROVINCES,
  ...BATCH2_WAVE2_PROVINCES,
  ...BATCH2_WAVE3_PROVINCES,
  ...BATCH2_WAVE4_PROVINCES,
  ...WAVE6D_KARADENIZ_B_PROVINCES,
  ...WAVE6B_DOGU_ANADOLU_PROVINCES,
  ...WAVE6A_IC_ANADOLU_PROVINCES,
  ...WAVE6C_KARADENIZ_A_PROVINCES,
];
