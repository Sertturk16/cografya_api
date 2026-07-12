import { Continent } from '../../common/continent.enum';

/**
 * Shape of one seeded country. The IDENTITY fields (isoCode, TR+EN name, both slugs,
 * continent) are required — they are known for every country up front from the
 * authoritative source. Every RESEARCH-DERIVED field is optional (`?: T | null`): the
 * base-data wave provides the numeric/identity core, and later fact-checked content
 * waves fill the narrative/detail fields per country (an unverified fact stays absent,
 * never invented — CLAUDE §5). An absent (undefined) optional field reads as "not
 * authored yet" and is normalised to null against the DB in `seed-world.ts`, so an
 * absent-in-seed vs null-in-DB pair is a no-op that keeps `updated_at` frozen on
 * re-seed (SEO lastmod honesty).
 *
 * `neighborIsoCodes` is required (not optional): an empty array is the correct,
 * explicit state for an island nation ("no land neighbour"), mirroring the entity's
 * NOT-NULL `'{}'` default — it is never "unknown".
 */
export interface CountrySeed {
  /** ISO 3166-1 alpha-2 — UPPERCASE, exactly 2 letters (see entity seed discipline). */
  isoCode: string;
  nameTr: string;
  nameEn: string;
  slugTr: string;
  slugEn: string;
  continent: Continent;
  neighborIsoCodes: string[];
  isoCodeAlpha3?: string | null;
  unSubregionTr?: string | null;
  population?: number | null;
  populationYear?: number | null;
  areaKm2?: number | null;
  capitalNameTr?: string | null;
  capitalNameEn?: string | null;
  capitalLatitude?: number | null;
  capitalLongitude?: number | null;
  officialLanguagesTr?: string[] | null;
  currencyNameTr?: string | null;
  currencyCode?: string | null;
  governmentFormTr?: string | null;
  independenceNoteTr?: string | null;
  introTr?: string | null;
  landformNoteTr?: string | null;
  climateNoteTr?: string | null;
  hydrographyNoteTr?: string | null;
}

/**
 * DÜNYA HARİTASI PILOT — 8-country seed batch (Türkiye's land neighbours).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROVENANCE (traceability — CONVENTIONS §4: no sourceless facts)
 * ─────────────────────────────────────────────────────────────────────────────
 * SOURCE OF RECORD: NOVA's dünya-haritası pilot pack, status "SEED-READY" — an
 *   INDEPENDENT fact-check pass (a different actor from the drafter) verified every value,
 *   its corrections were folded back, and the owner calibrated the sourcing discipline the
 *   same day.
 *   • Structured fields: Owner's Inbox/dunya-haritasi-pilot/country-data-dictionary.md
 *   • Narrative prose:   Owner's Inbox/dunya-haritasi-pilot/country-deep-content-draft.md
 *   • Decision trail:    DECISIONS.md — two 2026-07-13 "World-map pilot" entries
 * Per-field Tier-1 / Tier-2 authorities:
 *   • Ad TR/EN + başkent TR/EN + ISO alpha-2/3  → T.C. Dışişleri Bakanlığı (MFA), 2026
 *   • Nüfus                                      → Dünya Bankası (World Bank) — year
 *       DELIBERATELY NOT asserted at world scale (owner ruling, 2026-07-13); the sole
 *       exception is Georgia, re-attributed to Geostat's 2024 census (a corrected mis-cite)
 *   • Yüzölçümü (km²)                            → Dünya Bankası (AG.LND.TOTL.K2, 2023)
 *   • Kıta + BM alt-bölgesi (M49)                → UNSD M49 standard
 *   • Komşu ülkeler, yönetim biçimi, para birimi, resmi dil, bağımsızlık, fiziki coğrafya
 *                                                → CIA Factbook / Britannica-class (Tier-2,
 *       multi-source cross-checked) — the same confidence tier as the province "komşu iller"
 *   • Bulgaristan Euro geçişi (2026-01-01)       → Avrupa Merkez Bankası (ECB)
 *
 * FIELD-MAPPING DECISIONS (this batch → the Country entity shape from PR #23):
 *   1. PROSE SPLIT. NOVA's draft merged relief + climate into one `landformClimateNoteTr`
 *      section (an explicitly NON-BINDING naming suggestion) and kept a THIRD
 *      `hydrographyNoteTr` section. The Country entity instead has SEPARATE `landformNoteTr`
 *      and `climateNoteTr` prose fields (owner-ruled climate = woven prose, no structured
 *      Köppen code). So each draft section is split at its clean paragraph boundary: the
 *      relief paragraph(s) → `landformNoteTr`, the final climate paragraph → `climateNoteTr`.
 *      NOVA's wording is transcribed verbatim (no rewriting) — only the cut is editorial.
 *   2. HYDROGRAPHY — SCHEMA + DATA NOW BOTH LANDED. NOVA authored a fact-checked
 *      `hydrographyNoteTr` (nehir/göl/deniz) section for all 8 countries. The Country entity
 *      carries a `hydrography_note_tr` column (added in the schema fast-follow →
 *      DEC 2026-07-13, mirroring the Province `hydrography_note_tr` field). The schema landed
 *      first (PR #25); this data-only follow-up PR populates the field for all 8 rows, kept
 *      separate from the schema change so each stays reviewable independently. The draft kept
 *      hydrography as its OWN section, so the prose transcribes verbatim into `hydrographyNoteTr`
 *      — it was never force-fitted into `landformNoteTr` (the house pattern keeps relief and
 *      hydrography in separate fields).
 *   3. populationYear = null for all 8 — the owner ruling declines to assert a reference
 *      year at world scale (province-grade TÜİK-year precision is above this batch's bar).
 *   4. independenceNoteTr filled for 7 of 8. BG/GE/AM/IQ/SY have a single, multi-source-
 *      consistent date. GR + AZ have MULTIPLE real candidate dates with no single objective
 *      answer, so — per DEC 2026-07-13's resolution rule — each is anchored on the country's
 *      OWN officially-designated Independence Day (GR 25 Mart; AZ 28 Mayıs) with the other
 *      historically-relevant dates woven into the same free-text prose as context (not a
 *      forced single value). Left NULL only for IR: the field is conceptually inapplicable
 *      to a continuous ancient state (no colonial/Soviet exit date) — an undecided fact
 *      stays absent, not invented (CLAUDE §5).
 *   5. governmentFormTr = null for Syria — a genuinely fluid, owner-open item (post-2024
 *      transitional government), explicitly out of scope of the fact-check round.
 *   6. areaKm2 stored as whole km² (entity is integer): Armenia 28.199,44 → 28199.
 *   7. neighborIsoCodes is EXCLAVE-INCLUSIVE: Azerbaijan's list includes TR (via the
 *      Nahçıvan exclave, ~17 km) and Armenia's two AZ border segments count AZ once — the
 *      derived `neighborCount` (service) reads array length, never a hardcoded number.
 *
 * DERIVED, NOT STORED HERE: neighborCount (service, from array length); centroid /
 *   bounding-box (from boundary GeoJSON at build time — see the entity header note).
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const SEED_COUNTRIES: readonly CountrySeed[] = [
  {
    isoCode: 'GR',
    isoCodeAlpha3: 'GRC',
    nameTr: 'Yunanistan',
    nameEn: 'Greece',
    slugTr: 'yunanistan',
    slugEn: 'greece',
    continent: Continent.Europe,
    unSubregionTr: 'Güney Avrupa',
    population: 10_413_962,
    populationYear: null,
    areaKm2: 128_900,
    capitalNameTr: 'Atina',
    capitalNameEn: 'Athens',
    capitalLatitude: 37.9838,
    capitalLongitude: 23.7275,
    // Arnavutluk, Kuzey Makedonya, Bulgaristan, Türkiye (4)
    neighborIsoCodes: ['AL', 'MK', 'BG', 'TR'],
    officialLanguagesTr: ['Yunanca'],
    currencyNameTr: 'Euro',
    currencyCode: 'EUR',
    governmentFormTr: 'Parlamenter cumhuriyet',
    // Multi-candidate date → anchor on the country's own official Independence Day, weave
    //   the other relevant dates in as context (DEC 2026-07-13 resolution rule).
    independenceNoteTr:
      "Yunanistan, 1821'de başlayan Bağımsızlık Savaşı'nın başlangıcını simgeleyen 25 Mart'ı " +
      'resmî Bağımsızlık Günü (ulusal bayram) olarak kutlar. Ülkenin bağımsızlığı 1830 Londra ' +
      'Protokolü ile uluslararası düzeyde tanındı, sınırları ise 1832 Konstantinopolis ' +
      "Antlaşması'yla kesinleşti.",
    introTr:
      "Yunanistan, Balkan Yarımadası'nın en güneyinde, binlerce adaya yayılan bir Akdeniz " +
      'ülkesidir. Kuzeyde Arnavutluk, Kuzey Makedonya ve Bulgaristan, doğuda ise Türkiye ile ' +
      'komşudur.',
    landformNoteTr:
      'Yunanistan topraklarının yaklaşık dörtte üçü dağlıktır. Ülkenin ana sırtını, ' +
      "kuzeybatıdan güneydoğuya uzanan Pindus Dağları oluşturur; bu sıradağ Epir'i Teselya ve " +
      "Makedonya bölgesinden ayırır, en yüksek noktası 2.637 metredir. Pindus'un " +
      'kuzeydoğusunda yükselen Olimpos Dağı, 2.918 metrelik zirvesiyle ülkenin en yüksek ' +
      "noktasıdır — Balkan Yarımadası'nda yalnızca Bulgaristan'daki Musala'dan daha alçaktır." +
      '\n\n' +
      "Ege Denizi'ndeki binlerce ada, ülkenin kara parçası kadar belirleyici bir coğrafi " +
      'kimlik taşır; Girit, Eğriboz, Midilli ve Rodos büyük adalardan birkaçıdır.',
    climateNoteTr:
      'Kıyı kesimler ve adalar, sıcak-kurak yaz ile ılık-yağışlı kışın görüldüğü tipik ' +
      "Akdeniz ikliminin etkisindedir. Pindus'un iç ve kuzey kesimlerinde ise yükseklik " +
      'nedeniyle kışlar daha soğuk ve karlı geçer, yaz-kış sıcaklık farkı belirginleşir.',
    hydrographyNoteTr:
      "Yunanistan'ın akarsuları genelde kısa ve mevsimsel rejime sahiptir. En uzun nehri, " +
      "yaklaşık 300 kilometrelik Aliakmon'dur; Aheloos, Evros ve Pinios diğer önemli " +
      "nehirlerdir. Evros Nehri, Yunanistan'ın Türkiye ve Bulgaristan ile sınırının önemli bir " +
      'bölümünü çizer.' +
      '\n\n' +
      "Ülkenin en büyük doğal gölü Trihonis Gölü'dür; Vegoritis ve Volvi gölleri de önemli iç " +
      'su kütleleridir. Arnavutluk ve Kuzey Makedonya ile paylaşılan Prespa Gölleri, sınır ' +
      "ötesi bir ekosistem olarak Avrupa'nın önemli sulak alanları arasında sayılır.",
  },
  {
    isoCode: 'BG',
    isoCodeAlpha3: 'BGR',
    nameTr: 'Bulgaristan',
    nameEn: 'Bulgaria',
    slugTr: 'bulgaristan',
    slugEn: 'bulgaria',
    continent: Continent.Europe,
    unSubregionTr: 'Doğu Avrupa',
    population: 6_433_302,
    populationYear: null,
    areaKm2: 108_560,
    capitalNameTr: 'Sofya',
    capitalNameEn: 'Sofia',
    capitalLatitude: 42.6977,
    capitalLongitude: 23.3219,
    // Sırbistan, Kuzey Makedonya, Yunanistan, Türkiye, Romanya (5)
    neighborIsoCodes: ['RS', 'MK', 'GR', 'TR', 'RO'],
    officialLanguagesTr: ['Bulgarca'],
    // Euro (EUR) — 1 Ocak 2026'dan itibaren 21. eurozone üyesi (ECB); önceki para birimi Leva.
    currencyNameTr: 'Euro',
    currencyCode: 'EUR',
    governmentFormTr: 'Parlamenter cumhuriyet',
    independenceNoteTr:
      "1908'de Osmanlı İmparatorluğu'ndan tam bağımsızlığını ilan etti (1878 Berlin " +
      'Antlaşması ile kazanılan özerkliğin ardından, iki aşamalı bir süreçle).',
    introTr:
      "Kuzeyde Tuna Nehri'nin çizdiği sınırla Romanya'dan ayrılan Bulgaristan, Balkan " +
      "Yarımadası'nın doğusunda, Karadeniz'e kıyısı olan bir ülkedir. Batısında Sırbistan ve " +
      'Kuzey Makedonya, güneyinde Yunanistan ve Türkiye yer alır.',
    landformNoteTr:
      'Ülkeyi doğu-batı yönünde ikiye bölen Balkan Dağları (Stara Planina), yaklaşık 560 ' +
      "kilometre uzunluğunda bir sırt oluşturur ve kuzeydeki Tuna Ovası'nı güneydeki Trakya " +
      "Ovası'ndan ayırır; en yüksek noktası Botev Tepesi 2.376 metredir. Ülkenin " +
      "güneybatısında yükselen Rila ve Pirin dağları, Balkan Yarımadası'nın en yüksek zirvesi " +
      "olan 2.925 metrelik Musala Tepesi'ni barındırır; bu iki sıradağ kayalık zirveleri ve " +
      'yüzlerce buzul gölüyle tanınır.',
    climateNoteTr:
      "Kuzeyde Tuna Ovası'nda ve iç kesimlerde karasal bir iklim görülür, kışlar soğuk ve " +
      'yazlar sıcak geçer. Karadeniz kıyısında deniz etkisiyle sıcaklık farkları yumuşar. ' +
      'Güneyde, Trakya Ovası ve Rodop eteklerine doğru inildikçe Akdeniz ikliminin etkisi ' +
      'hissedilmeye başlar.',
    hydrographyNoteTr:
      'Ülkenin en uzun ve en önemli akarsuyu, kuzey sınırının büyük bölümünü Romanya ile ' +
      "paylaşan Tuna Nehri'dir — Avrupa'nın ikinci en uzun nehridir. Balkan Dağları'nın " +
      "güneyinde doğan Meriç Nehri, Trakya Ovası'ndan geçerek Türkiye-Yunanistan sınırına " +
      'ulaşır.' +
      '\n\n' +
      "Karadeniz kıyısı, Durankulak'tan Rezovska Nehri ağzına kadar yaklaşık 378 kilometre " +
      'uzunluğundadır. Kuzey kesimi geniş kumsallar ve kıyı gölleriyle, Kaliakra Burnu çevresi ' +
      'ise 70 metreyi bulan dik kayalıklarla karakterize olur.',
  },
  {
    isoCode: 'GE',
    isoCodeAlpha3: 'GEO',
    nameTr: 'Gürcistan',
    nameEn: 'Georgia',
    slugTr: 'gurcistan',
    slugEn: 'georgia',
    continent: Continent.Asia,
    unSubregionTr: 'Batı Asya',
    // Nüfus: Geostat 2024 Nüfus ve Tarım Sayımı (World Bank DEĞİL — corrected mis-cite).
    population: 3_935_766,
    populationYear: null,
    areaKm2: 69_490,
    capitalNameTr: 'Tiflis',
    capitalNameEn: 'Tbilisi',
    capitalLatitude: 41.7151,
    capitalLongitude: 44.8271,
    // Rusya, Azerbaycan, Ermenistan, Türkiye (4)
    neighborIsoCodes: ['RU', 'AZ', 'AM', 'TR'],
    officialLanguagesTr: ['Gürcüce'],
    currencyNameTr: 'Gürcistan larisi',
    currencyCode: 'GEL',
    governmentFormTr: 'Parlamenter cumhuriyet',
    independenceNoteTr: "9 Nisan 1991'de Sovyetler Birliği'nden bağımsızlığını ilan etti.",
    introTr:
      "Kafkas Dağları'nın güney eteklerinden Karadeniz kıyısına uzanan Gürcistan, kuzeyde " +
      'Rusya, güneyde Türkiye ve Ermenistan, güneydoğuda ise Azerbaycan ile komşudur.',
    landformNoteTr:
      "Ülke topraklarının yaklaşık %85'i dağlıktır. Kuzey sınırını çizen Büyük Kafkas " +
      "Dağları, Gürcistan'ın en yüksek zirvelerini barındırır: Rusya sınırındaki 5.193 " +
      'metrelik Şhara ülkenin en yüksek noktasıdır, tamamıyla Gürcistan sınırları içinde ' +
      "kalan en yüksek zirve ise 5.054 metrelik Kazbek'tir. Ülkenin batısında, Karadeniz " +
      'kıyısında Kolhis Ovası uzanır; bu alçak ve nemli ova, dağlık iç kesimlerle keskin bir ' +
      'kontrast oluşturur.',
    climateNoteTr:
      'Bu yükselti ve konum farkı iklime doğrudan yansır. Batıda, Kolhis Ovası ve Karadeniz ' +
      'kıyısında nemli subtropikal bir iklim egemendir, yıl boyu bol yağış düşer. Doğuda, ' +
      'başkent Tiflis ve İç Kartli bölgesinde dağların yağış gölgesi etkisiyle daha kurak ve ' +
      'karasal bir iklim görülür. Yüksek Kafkas kesimlerinde ise alp iklimi ve yıl boyu kar ' +
      'örtüsü hakimdir.',
    hydrographyNoteTr:
      "Ülkenin en uzun akarsuyu, Türkiye'de doğup Gürcistan'ın doğu ovalarından geçen ve " +
      "başkent Tiflis'in ortasından akan Kura (Mtkvari) Nehri'dir; nehir Azerbaycan " +
      "topraklarına geçerek Hazar Denizi'ne dökülür. Karadeniz kıyısındaki başlıca limanlar " +
      "Poti ve Batum'dur.",
  },
  {
    isoCode: 'AM',
    isoCodeAlpha3: 'ARM',
    nameTr: 'Ermenistan',
    nameEn: 'Armenia',
    slugTr: 'ermenistan',
    slugEn: 'armenia',
    continent: Continent.Asia,
    unSubregionTr: 'Batı Asya',
    population: 3_086_700,
    populationYear: null,
    areaKm2: 28_199,
    capitalNameTr: 'Erivan',
    capitalNameEn: 'Yerevan',
    capitalLatitude: 40.1792,
    capitalLongitude: 44.4991,
    // Gürcistan, Azerbaycan, İran, Türkiye (4). AZ borders in two segments (ana gövde +
    //   Nahçıvan) but counts ONCE — same country.
    neighborIsoCodes: ['GE', 'AZ', 'IR', 'TR'],
    officialLanguagesTr: ['Ermenice'],
    currencyNameTr: 'Ermeni dramı',
    currencyCode: 'AMD',
    governmentFormTr: 'Parlamenter cumhuriyet',
    independenceNoteTr: "21 Eylül 1991'de Sovyetler Birliği'nden bağımsızlığını ilan etti.",
    introTr:
      "Güney Kafkasya'nın dağlık iç kesiminde yer alan Ermenistan, bölgenin denize kıyısı " +
      'olmayan tek ülkesidir. Kuzeyde Gürcistan, doğuda Azerbaycan, güneyde İran, batıda ' +
      'Türkiye ile sınır komşusudur.',
    landformNoteTr:
      "Ermenistan'ın coğrafyasına Küçük Kafkas Dağları hakimdir; bu sıradağ ülkenin " +
      'kuzeyinden geçerek Sevan Gölü ile Azerbaycan sınırı arasında güneydoğuya uzanır ve ' +
      'İran sınırına kadar devam eder. Ülkenin en yüksek noktası, sönmüş bir yanardağ olan ' +
      "4.090 metrelik Aragats Dağı'dır." +
      '\n\n' +
      'Ülke topraklarının neredeyse tamamı engebeli dağlar ve derin vadilerden oluşur; düzlük ' +
      "alanlar sınırlıdır, en genişi güneybatıdaki Ararat Ovası'dır.",
    climateNoteTr:
      'Yükseklik, Ermenistan ikliminin belirleyici unsurudur. Yayla ve dağlık kesimlerde ' +
      'sert, kar yağışlı kışlar ve serin yazlar görülür. Ararat Ovası gibi daha alçak ' +
      'kesimlerde ise yaz sıcaklıkları yükselir, yarı-kurak ve bozkır karakterli bir iklim ' +
      'egemen olur.',
    hydrographyNoteTr:
      'Ülkenin en büyük su kütlesi, deniz seviyesinden yaklaşık 2.000 metre yükseklikte yer ' +
      "alan Sevan Gölü'dür. Aras Nehri, güneyde Türkiye ve İran ile doğal sınır oluşturur; " +
      'Debed Nehri ülkenin kuzeyindeki başlıca akarsulardandır.',
  },
  {
    isoCode: 'AZ',
    isoCodeAlpha3: 'AZE',
    nameTr: 'Azerbaycan',
    nameEn: 'Azerbaijan',
    slugTr: 'azerbaycan',
    slugEn: 'azerbaijan',
    continent: Continent.Asia,
    unSubregionTr: 'Batı Asya',
    population: 10_246_996,
    populationYear: null,
    areaKm2: 82_650,
    capitalNameTr: 'Bakü',
    capitalNameEn: 'Baku',
    capitalLatitude: 40.4093,
    capitalLongitude: 49.8671,
    // Rusya, Gürcistan, Ermenistan, İran, Türkiye (5). TR ONLY via the Nahçıvan exclave
    //   (~17 km) — EXCLAVE-INCLUSIVE per the locked rule.
    neighborIsoCodes: ['RU', 'GE', 'AM', 'IR', 'TR'],
    officialLanguagesTr: ['Azerbaycan Türkçesi'],
    currencyNameTr: 'Azerbaycan manatı',
    currencyCode: 'AZN',
    governmentFormTr: 'Üniter yarı-başkanlık cumhuriyeti',
    // Multi-candidate date → anchor on Azerbaijan's own official Independence Day (28 May,
    //   named by its 2021 law), weave the other relevant dates in as context (DEC 2026-07-13
    //   resolution rule; source language from data-dictionary §5).
    independenceNoteTr:
      "Azerbaycan, 1918'de kurulan Azerbaycan Demokratik Cumhuriyeti'nin ilan tarihi olan 28 " +
      "Mayıs'ı resmî Bağımsızlık Günü olarak anar (ülkenin 2021 tarihli kanunuyla). " +
      "Sovyetler Birliği'nin dağılma sürecinde bağımsızlık, 30 Ağustos 1991 Bağımsızlık " +
      'Bildirgesi ve 18 Ekim 1991 Devlet Bağımsızlığı Anayasal Kanunu ile yeniden kazanıldı.',
    introTr:
      "Hazar Denizi'nin batı kıyısında uzanan Azerbaycan, kuzeyde Rusya, kuzeybatıda " +
      'Gürcistan, batıda Ermenistan, güneyde İran ile komşudur; ülkenin Nahçıvan Özerk ' +
      'Cumhuriyeti ise ayrı bir toprak parçası olarak Türkiye ve Ermenistan ile sınır ' +
      'oluşturur.',
    landformNoteTr:
      "Kuzeydoğuda, Rusya'nın Dağıstan bölgesiyle sınırda Büyük Kafkas Dağları yükselir; " +
      'ülkenin en yüksek noktası olan 4.485 metrelik Bazardüzü de bu sırada, Rusya sınırında ' +
      'yer alır. Batıda, Ermenistan sınırında Küçük Kafkas Dağları uzanır; güneydoğu ucunda ' +
      'ise İran sınırını izleyen Talış Dağları bulunur. Bu dağlık kuşakların arasında kalan ' +
      'ülke merkezini geniş ovalar kaplar.' +
      '\n\n' +
      'Hazar kıyısındaki bazı kesimler deniz seviyesinin altında kalır. Başkent Bakü, deniz ' +
      'seviyesinin altında kurulu dünyanın en büyük şehri ve en alçak konumdaki başkenttir.',
    climateNoteTr:
      'Coğrafi çeşitlilik iklime de yansır: Hazar kıyısı ovalarında yarı-kurak, bozkır ' +
      'karakterli bir iklim görülür; güneydoğudaki Talış bölgesinde nemli subtropikal iklim ' +
      "egemendir; Büyük Kafkas'ın yüksek kesimlerinde ise alp iklimi ve kalıcı kar örtüsü " +
      'hakimdir.',
    hydrographyNoteTr:
      "Kafkasya'nın en büyük akarsuyu olan Kura Nehri, Gürcistan'dan Azerbaycan'a geçer; " +
      "ülkenin ikinci büyük nehri Aras, Kura'nın başlıca kolu olup ikisi birleşerek Hazar " +
      "Denizi'ne dökülür. Ülkenin Hazar kıyısı 713 kilometre uzunluğundadır.",
  },
  {
    isoCode: 'IR',
    isoCodeAlpha3: 'IRN',
    nameTr: 'İran',
    nameEn: 'Iran',
    slugTr: 'iran',
    slugEn: 'iran',
    continent: Continent.Asia,
    unSubregionTr: 'Güney Asya',
    population: 92_417_681,
    populationYear: null,
    areaKm2: 1_622_500,
    capitalNameTr: 'Tahran',
    capitalNameEn: 'Tehran',
    capitalLatitude: 35.6892,
    capitalLongitude: 51.389,
    // Ermenistan, Azerbaycan, Türkmenistan, Afganistan, Pakistan, Irak, Türkiye (7) —
    //   pilottaki en fazla kara komşusuna sahip ülke.
    neighborIsoCodes: ['AM', 'AZ', 'TM', 'AF', 'PK', 'IQ', 'TR'],
    officialLanguagesTr: ['Farsça'],
    currencyNameTr: 'İran riyali',
    currencyCode: 'IRR',
    governmentFormTr: 'Teokratik-cumhuriyet karma sistem (İslam Cumhuriyeti)',
    // independenceNoteTr: NULL — the field is conceptually inapplicable to a continuous
    //   ancient state (no colonial/Soviet exit date). Systemic open item (data-dictionary §6).
    introTr:
      "Kuzeyde Hazar Denizi'ne, güneyde Basra Körfezi ve Umman Denizi'ne kıyısı olan İran, " +
      "Güneybatı Asya'nın en büyük ülkelerinden biridir. Ermenistan, Azerbaycan, Türkmenistan, " +
      'Afganistan, Pakistan, Irak ve Türkiye ile toplam yedi ülkeyle kara sınırı paylaşır.',
    landformNoteTr:
      'İran topraklarının büyük bölümü, yüksek kenar dağlarıyla çevrili bir iç plato ' +
      'karakterindedir. Ülkeyi kuzeybatıdan güneydoğuya kat eden Zagros Dağları birbirine ' +
      'paralel sıralardan oluşur; güney-orta kesimde birçok zirve 4.000 metrenin üzerine ' +
      "çıkar. Hazar Denizi kıyısını izleyen dar ama yüksek Elburz Dağları'nın ortasında " +
      "yükselen 5.610 metrelik Damavend, İran'ın en yüksek noktasıdır ve Hindukuş'un " +
      "batısında Avrasya'nın en yüksek ikinci zirvesidir; sönmüş bir yanardağdır." +
      '\n\n' +
      'Bu dağ kuşaklarının içinde kalan Merkezi Plato, birbirinden ayrık kapalı havzalardan ' +
      'oluşur. Bunların en bilineni, yaz aylarında dünyanın en sıcak yerlerinden biri haline ' +
      'gelen tuzlu-kumlu Deşt-i Kevir çölüdür.',
    climateNoteTr:
      'İklim, dağ-plato-kıyı üçlüsüne göre keskin biçimde değişir. Hazar kıyısı şeridinde ' +
      "nemli, yıl boyu yağışlı bir iklim görülür. Merkezi Plato'da kurak ve yarı-kurak çöl " +
      'iklimi egemendir, yaz-kış ve gündüz-gece sıcaklık farkları büyüktür. Batıdaki Zagros ' +
      'yüksek kesimlerinde ise karasal-dağlık iklim, soğuk ve karlı kışlarla kendini gösterir.',
    hydrographyNoteTr:
      "İran'ın çoğu akarsuyu kısa ve mevsimsel rejime sahiptir; ülkenin gemilerle ulaşılabilen " +
      "tek nehri, güneybatıdaki 830 kilometrelik Karun'dur. Hazar Denizi, dünyanın en büyük " +
      "kapalı su kütlesi olarak İran'ın kuzey sınırını oluşturur; ülkenin güneyinde ise Basra " +
      'Körfezi ve Umman Denizi kıyıları uzanır.',
  },
  {
    isoCode: 'IQ',
    isoCodeAlpha3: 'IRQ',
    nameTr: 'Irak',
    nameEn: 'Iraq',
    slugTr: 'irak',
    slugEn: 'iraq',
    continent: Continent.Asia,
    unSubregionTr: 'Batı Asya',
    population: 47_020_774,
    populationYear: null,
    areaKm2: 434_130,
    capitalNameTr: 'Bağdat',
    capitalNameEn: 'Baghdad',
    capitalLatitude: 33.3152,
    capitalLongitude: 44.3661,
    // Türkiye, İran, Kuveyt, Suudi Arabistan, Ürdün, Suriye (6)
    neighborIsoCodes: ['TR', 'IR', 'KW', 'SA', 'JO', 'SY'],
    // İKİ resmi dil (anayasal) — array, not a single value.
    officialLanguagesTr: ['Arapça', 'Kürtçe'],
    currencyNameTr: 'Irak dinarı',
    currencyCode: 'IQD',
    governmentFormTr: 'Federal parlamenter cumhuriyet',
    independenceNoteTr:
      "3 Ekim 1932'de İngiliz manda yönetiminden bağımsız oldu (Milletler Cemiyeti " +
      'üyeliğiyle).',
    introTr:
      'Dicle ve Fırat nehirlerinin birleştiği Mezopotamya ovası üzerinde kurulu Irak, ' +
      'kuzeyde Türkiye, doğuda İran, güneydoğuda Kuveyt, güneyde Suudi Arabistan, güneybatıda ' +
      'Ürdün, batıda ise Suriye ile komşudur.',
    landformNoteTr:
      'Ülkenin kuzeydoğusunda, Musul ve Kerkük arasındaki kesimde Hamrin ve Zagros ' +
      "dağlarının uzantıları yer alır; bu bölge Irak'ın en engebeli kesimidir. Ülkenin en " +
      'yüksek noktası, İran sınırındaki 3.611 metrelik Çeyxa Dar bu dağ kuşağındadır. Batı ve ' +
      "güneybatıda, Suudi Arabistan ve Ürdün sınırları boyunca Arap Yarımadası'nın devamı " +
      'niteliğindeki geniş bir çöl uzanır.' +
      '\n\n' +
      'Ülkenin kalbini, Dicle ve Fırat nehirlerinin arasında kalan Mezopotamya Ovası ' +
      "oluşturur. Bağdat'ın kuzeyinden Basra Körfezi'ne kadar uzanan Aşağı Mezopotamya " +
      "kesimi, geniş bataklıklar ve Irak'ın en büyük gölü olan Tharthar Gölü'nü barındıran " +
      'alüvyal bir ovadır.',
    climateNoteTr:
      'İklim, kuzeydeki dağlık bölgede daha soğuk kışlı, yarı-kurak bir karakterdedir; orta ' +
      've güney Mezopotamya ovasında ise yazları aşırı sıcak, kışları ılık geçen kurak bir ' +
      'çöl iklimi egemendir.',
    hydrographyNoteTr:
      "Dicle (1.900 km) ve Fırat (2.800 km) nehirleri, Irak'ın en uzun ve coğrafi kimliğini " +
      'belirleyen akarsularıdır; başkent Bağdat dahil büyük şehirlerin çoğu bu iki nehrin ' +
      'kıyısında kuruludur. Nehirlerin arasında kalan toprakların "iki nehir arası" anlamına ' +
      'gelen Mezopotamya adını taşıması, bu coğrafyanın en eski yerleşim izlerine kadar uzanır.',
  },
  {
    isoCode: 'SY',
    isoCodeAlpha3: 'SYR',
    nameTr: 'Suriye',
    nameEn: 'Syria',
    slugTr: 'suriye',
    slugEn: 'syria',
    continent: Continent.Asia,
    unSubregionTr: 'Batı Asya',
    population: 25_620_427,
    populationYear: null,
    areaKm2: 183_630,
    capitalNameTr: 'Şam',
    capitalNameEn: 'Damascus',
    capitalLatitude: 33.5138,
    capitalLongitude: 36.2765,
    // Türkiye, Irak, Ürdün, Lübnan, İsrail (5)
    neighborIsoCodes: ['TR', 'IQ', 'JO', 'LB', 'IL'],
    officialLanguagesTr: ['Arapça'],
    // Para birimi hâlâ SYP; 2026'da yeni banknot serisi çıktı ama birim değişmedi.
    currencyNameTr: 'Suriye lirası',
    currencyCode: 'SYP',
    // governmentFormTr: NULL — post-2024 geçiş hükümeti, genuinely fluid; owner-open item
    //   explicitly out of scope of the fact-check round (data-dictionary §8).
    independenceNoteTr: "17 Nisan 1946'da Fransız manda yönetiminden bağımsız oldu.",
    introTr:
      'Doğu Akdeniz kıyısında dar bir şeritle denize açılan Suriye, kuzeyde Türkiye, doğuda ' +
      'Irak, güneyde Ürdün, güneybatıda İsrail, batıda Lübnan ile komşudur.',
    landformNoteTr:
      'Akdeniz kıyısı boyunca dar bir kıyı ovasının ardından Suriye Kıyı Sıradağları ' +
      'yükselir; bu sıradağ, kıyı bölgesini iç kesimlerden ayıran doğal bir set oluşturur. ' +
      'Ülkenin güneybatısında, Lübnan sınırında Anti-Lübnan Dağları uzanır. Bu kütlenin ' +
      'Suriye-Lübnan-İsrail sınır bölgesine yakın kesiminde yükselen Hermon Dağı (2.814 m) ' +
      'bölgenin bilinen zirvelerindendir; tamamen Suriye idaresindeki Anti-Lübnan kesiminde ' +
      'ise Talat Musa Tepesi (2.613 m) ülkenin tartışmasız yüksek noktalarından biridir.' +
      '\n\n' +
      'Ülkenin doğusu, Ürdün ve Irak sınırlarına kadar uzanan Bâdiye (Suriye Çölü) ile ' +
      'kaplıdır; bu geniş çöl-bozkır kuşağı ülke topraklarının yarısından fazlasını oluşturur.',
    climateNoteTr:
      'İklim de bu batı-doğu kademelenmesini izler: kıyı şeridinde ılık-yağışlı kış ve ' +
      'sıcak-kurak yazın görüldüğü tipik Akdeniz iklimi hakimdir; Şam ve Halep gibi iç kesim ' +
      "şehirlerinde yarı-kurak bozkır iklimi egemendir; doğudaki Bâdiye'de ise tam kurak çöl " +
      'iklimi görülür, yıllık yağış çok düşük seviyelerde kalır.',
    hydrographyNoteTr:
      "Ülkenin en önemli ve gemilerle ulaşılabilen tek nehri, Türkiye'de doğup ülkenin " +
      "doğusunu güneydoğu yönünde kat eden Fırat Nehri'dir. Kıyı şeridindeki dar ovalar " +
      "dışında, Suriye'nin büyük bölümünde kalıcı yüzey suyu kaynağı sınırlıdır — bu da iç " +
      'kesim ve doğu bölgelerindeki yerleşimlerin tarih boyunca nehir vadilerine ve vahalara ' +
      'yoğunlaşmasının başlıca nedenidir.',
  },
];
