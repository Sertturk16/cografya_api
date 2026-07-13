import { Continent } from '../../../common/continent.enum';
import type { CountrySeed } from '../country.seed-data';

/**
 * Egemenlik/tanınma kayıtları — dünya haritası base-data seed (6 kayıt). This is the
 * platform's single most politically sensitive content surface, so it is a SEPARATE lane
 * from the 4 ordinary base-data continents and was held to FULL pilot-level rigor (Tier-1
 * sourcing + a genuinely independent two-actor fact-check), NOT the lighter bulk bar
 * (→ DEC 2026-07-13 "5 sovereignty-recognition questions RULED"; CONVENTIONS §5).
 *
 * SOURCE OF RECORD:
 *   • Structured fields:   Owner's Inbox/dunya-haritasi-sovereignty/sovereignty-data-dictionary.md
 *   • sovereigntyNoteTr:   Owner's Inbox/dunya-haritasi-sovereignty/sovereignty-narrative-draft.md
 *   • Rulings:             DECISIONS.md — the two 2026-07-13 sovereignty entries
 *
 * FIELD-MAPPING DECISIONS (all owner-/Atlas-ruled; see the closing summary for the audit):
 *   1. sovereigntyNoteTr carries the owner's REQUIRED framing, transcribed VERBATIM (not
 *      paraphrased) from the narrative draft — single quotes preserved byte-for-byte
 *      ('bölünmez başkenti', 'Tek Çin'), the exact fidelity the quote-mark fix-pass ruled
 *      (→ DEC 2026-07-13). It is the ONE new field this seed populates; all other narrative
 *      prose (introTr/landform/climate/hydrography/independence) stays null and arrives in a
 *      later content wave, exactly as the 4 base-data continents deferred theirs.
 *      - İSRAİL: the field is the owner's capital-note framing (Tel Aviv is the structured
 *        capital; Kudüs is İsrail's own claim, framed neutrally).
 *      - FİLİSTİN: the owner's başkent-note and governance-note folded into one continuous
 *        prose field (→ DEC 2026-07-13 ruled these fold into this single column, not
 *        separate ones). The başkent label uses the owner's verbatim capitalisation
 *        "(İlan edilen) / (Fiili idari merkez)" — the data dictionary + DECISIONS carry it
 *        capitalised; the narrative draft had lowercased it (the same class of narrative-
 *        draft drift the quote-mark fix corrected, but this instance was missed). FLAGGED
 *        for NOVA to reconcile the draft; here the owner-verbatim form wins per the
 *        "verbatim, not verbatim-in-spirit" standard.
 *      - KOSOVA: recognition count kept as the owner's deliberately vague "100'ün üzerinde"
 *        phrasing, NOT a false-precision figure (Kosova/Sırbistan/independent trackers all
 *        disagree). The narrative draft still spells out 115-120 / ~84 / ~110; the task +
 *        CONVENTIONS §5 + the data dictionary + DEC 2026-07-13 ("owner's deliberately vague
 *        framing was already the right call") all rule the vague form. DELIBERATE, FLAGGED
 *        deviation from the draft prose — NOVA to reconcile the draft.
 *
 *   2. KKTC has no ISO 3166-1 code (unofficial state). Self-assigned `QN` from the QM-QZ
 *      private-use block (→ DEC 2026-07-13) — an INTERNAL-ONLY identifier so the NOT-NULL
 *      UNIQUE iso_code has a value, NOT a claim of international-standard recognition. `QN` is
 *      chosen to be distinct from the five specific codes the country e2e suite reserves for
 *      synthetic fixtures (ZX/ZY/ZZ, XA/XB — see test/country.e2e-spec.ts), so a real seeded
 *      KKTC row can never collide with a test fixture. (The QM–QZ block QN sits in is itself a
 *      real ISO 3166-1 private-use range — the point is that QN is not one of those five
 *      fixture codes, not that it lives in some separate "non-fixture" range.) alpha-3 is null
 *      (no code exists).
 *   3. KOSOVA uses `XK`, a genuine real-world quasi-standard code (World Bank/EU/SWIFT) —
 *      already correct, not a self-assignment (→ CONVENTIONS §5). alpha-3 left null: only
 *      XK (alpha-2) is documented in the source; XKX is not asserted here.
 *   4. TAYVAN: nameTr is the owner's required exact form "Çin Cumhuriyeti (Tayvan)".
 *      independenceNoteTr is null (→ DEC 2026-07-13, same class as İran — forcing a
 *      colonial-independence-style date onto the 1912-founding/1949-relocation ROC would
 *      itself be a political statement). slug is "tayvan"/"taiwan" (the user/SEO term), a
 *      deliberate exception to the name→slug fold rule because the owner-mandated
 *      parenthetical name folds to a nonsensical URL — the only such exception in the set.
 *   5. KIBRIS: population is the CYSTAT government-controlled-area figure (983.000), NOT the
 *      World Bank whole-island 1,36 M — consistent with the "fiilen güneyi yöneten" framing.
 *      areaKm2 5.896 is a "yaklaşık" Tier-2 figure (→ DEC 2026-07-13, CYSTAT's own primary
 *      publication doesn't cover the controlled-area km²); a low-risk supporting figure.
 *   6. NEIGHBOURS: Kıbrıs/KKTC/Tayvan are island entities → 0 land neighbours (the split of
 *      Cyprus is an intra-island line, not an inter-state land border). İSRAİL's list is 4
 *      SOVEREIGN neighbours (Mısır, Ürdün, Lübnan, Suriye) — Filistin deliberately excluded
 *      (asymmetric occupation relationship, data dictionary §7). FİLİSTİN carries [EG, JO,
 *      IL]: EG/JO are physical borders, IL is the occupation/control relationship, not an
 *      ordinary neighbour (nuance lives in the prose). IL is seeded HERE, so it also
 *      resolves the pre-existing dangling SY→IL reference from the pilot.
 *
 * COMMON TO ALL 6: populationYear null (world-scale ruling, DEC 2026-07-13); areaKm2 is
 *   whole km² (entity is integer; KKTC 3.241,68 → 3.242 rounded to nearest); slugs by the
 *   same ASCII/Turkish-fold rule as the rest of the seed (Tayvan excepted, see #4).
 */
export const SOVEREIGNTY_COUNTRIES: readonly CountrySeed[] = [
  {
    isoCode: 'CY',
    isoCodeAlpha3: 'CYP',
    nameTr: 'Kıbrıs Cumhuriyeti',
    nameEn: 'Republic of Cyprus',
    slugTr: 'kibris-cumhuriyeti',
    slugEn: 'republic-of-cyprus',
    continent: Continent.Asia,
    // M49 istatistik standardı Kıbrıs'ı Batı Asya'ya koyar (Avrupa değil) — bilinçli,
    //   İran'ın "Güney Asya" vakasıyla aynı kategori (data dictionary §1).
    unSubregionTr: 'Batı Asya',
    population: 983_000,
    populationYear: null,
    areaKm2: 5_896,
    capitalNameTr: 'Lefkoşa',
    capitalNameEn: 'Nicosia',
    capitalLatitude: 35.1856,
    capitalLongitude: 33.3823,
    neighborIsoCodes: [],
    officialLanguagesTr: ['Yunanca', 'Türkçe'],
    currencyNameTr: 'Euro',
    currencyCode: 'EUR',
    governmentFormTr: 'Başkanlık cumhuriyeti',
    sovereigntyNoteTr:
      'Kıbrıs Cumhuriyeti, uluslararası alanda adanın tamamını temsilen tanınan ancak ' +
      "fiilen güneyi yöneten devlettir. 1974'te yaşanan olayların ardından ada fiilen ikiye " +
      "bölünmüş; Birleşmiş Milletler'in denetlediği bir tampon hattı, Kıbrıs Cumhuriyeti'nin " +
      "yönettiği güney kesimi kuzeydeki Kuzey Kıbrıs Türk Cumhuriyeti'nden ayırır. Avrupa " +
      'Birliği müktesebatı da yalnızca adanın güneyinde fiilen uygulanır.',
  },
  {
    isoCode: 'QN',
    isoCodeAlpha3: null,
    nameTr: 'Kuzey Kıbrıs Türk Cumhuriyeti',
    nameEn: 'Turkish Republic of Northern Cyprus',
    slugTr: 'kuzey-kibris-turk-cumhuriyeti',
    slugEn: 'turkish-republic-of-northern-cyprus',
    continent: Continent.Asia,
    unSubregionTr: 'Batı Asya',
    // 2024 yıl sonu revize PROJEKSİYON (son gerçek sayım 2011: 294.906) — data dictionary §2.
    population: 489_308,
    populationYear: null,
    areaKm2: 3_242,
    capitalNameTr: 'Lefkoşa',
    capitalNameEn: 'Nicosia',
    capitalLatitude: 35.1856,
    capitalLongitude: 33.3823,
    neighborIsoCodes: [],
    officialLanguagesTr: ['Türkçe'],
    currencyNameTr: 'Türk Lirası',
    currencyCode: 'TRY',
    governmentFormTr: 'Yarı başkanlık sistemiyle yönetilen cumhuriyet',
    sovereigntyNoteTr:
      'KKTC, yalnızca Türkiye Cumhuriyeti tarafından resmen tanınan, de facto (fiili) ' +
      "bağımsız bir devlettir. Birleşmiş Milletler Güvenlik Konseyi, 1983'teki bağımsızlık " +
      'ilanını 541 sayılı kararıyla hukuken geçersiz saymış ve üye devletleri ' +
      "KKTC'yi tanımamaya çağırmıştır. Kendi anayasası, cumhurbaşkanı, meclisi ve hükümeti " +
      'olan KKTC, günlük yaşamda Türkiye ile güçlü ekonomik ve idari bağlarla iç içe ' +
      'geçmiştir.',
  },
  {
    isoCode: 'IL',
    isoCodeAlpha3: 'ISR',
    nameTr: 'İsrail',
    nameEn: 'Israel',
    slugTr: 'israil',
    slugEn: 'israel',
    continent: Continent.Asia,
    unSubregionTr: 'Batı Asya',
    population: 10_002_200,
    populationYear: null,
    areaKm2: 21_640,
    // Yapılandırılmış başkent alanı = Tel Aviv (uluslararası kabul); Kudüs İsrail'in kendi
    //   ilanı olarak sovereigntyNoteTr'de nötr biçimde açıklanır (owner ruling, DEC 2026-07-13).
    capitalNameTr: 'Tel Aviv',
    capitalNameEn: 'Tel Aviv',
    capitalLatitude: 32.0853,
    capitalLongitude: 34.7818,
    // Mısır, Ürdün, Lübnan, Suriye (4) — egemen devlet temelinde. Filistin BİLİNÇLİ olarak
    //   hariç (data dictionary §7).
    neighborIsoCodes: ['EG', 'JO', 'LB', 'SY'],
    officialLanguagesTr: ['İbranice'],
    currencyNameTr: 'Yeni İsrail Şekeli',
    currencyCode: 'ILS',
    governmentFormTr: 'Parlamenter cumhuriyet',
    // Owner'ın başkent-notu, kelimesi kelimesine (verbatim).
    sovereigntyNoteTr:
      "İsrail Kudüs'ü 'bölünmez başkenti' ilan etmiş olsa da, Birleşmiş Milletler ve " +
      "ülkelerin büyük çoğunluğu bunu tanımamakta ve büyükelçiliklerini Tel Aviv'de " +
      "bulundurmaktadır. Türkiye de resmi olarak Tel Aviv'i başkent kabul etmektedir.",
  },
  {
    isoCode: 'PS',
    isoCodeAlpha3: 'PSE',
    nameTr: 'Filistin',
    nameEn: 'Palestine',
    slugTr: 'filistin',
    slugEn: 'palestine',
    continent: Continent.Asia,
    unSubregionTr: 'Batı Asya',
    population: 5_289_152,
    populationYear: null,
    areaKm2: 6_025,
    // Yapılandırılmış başkent = Doğu Kudüs (ilan edilen); Ramallah'ın fiili idari merkez
    //   olduğu sovereigntyNoteTr'de açıklanır.
    capitalNameTr: 'Doğu Kudüs',
    capitalNameEn: 'East Jerusalem',
    capitalLatitude: 31.769,
    capitalLongitude: 35.2163,
    // EG/JO fiziksel sınır; IL komşu DEĞİL, işgal/kontrol ilişkisi (nüans prose'da). data
    //   dictionary §7.
    neighborIsoCodes: ['EG', 'JO', 'IL'],
    officialLanguagesTr: ['Arapça'],
    // Kendi para birimi yok — fiilen ILS ve JOD dolaşımda (owner ruling: currency null).
    currencyNameTr: null,
    currencyCode: null,
    governmentFormTr: 'Yarı başkanlık sistemiyle yönetilen cumhuriyet',
    // Owner'ın başkent-notu + yönetim-notu tek alanda birleştirildi (verbatim; başkent
    //   etiketi owner'ın büyük harfli "(İlan edilen)/(Fiili idari merkez)" formunda).
    sovereigntyNoteTr:
      "Filistin'in başkenti Doğu Kudüs (İlan edilen) / Ramallah (Fiili idari merkez) olarak " +
      "sunulur. Filistin, Doğu Kudüs'ü başkenti ilan eder; ancak İsrail'in 1967'den beri bu " +
      "bölgeyi fiilen ilhak etmiş olması nedeniyle Filistin Ulusal Yönetimi'nin gerçek idari " +
      "merkezi Batı Şeria'daki Ramallah'tır." +
      '\n\n' +
      'Filistin, yarı başkanlık sistemiyle yönetilen bir cumhuriyettir. Ancak bu yönetim ' +
      "yapısı, 2007'den beri fiilen ikiye bölünmüş durumdadır. Batı Şeria'da Mahmud Abbas " +
      'başkanlığındaki Filistin Ulusal Yönetimi ile Fetih hareketi yönetimi elinde tutar; ' +
      "Gazze Şeridi'nde ise 2006 seçimlerini kazanan ve 2007'de Fetih'le güç mücadelesini " +
      "kazanan Hamas, bölgeyi fiilen kontrol eder. İki yönetim arasında 2007'den bu yana tam " +
      'bir siyasi birleşme sağlanamamıştır.' +
      '\n\n' +
      "Filistin'in egemenliği, İsrail'in işgal altındaki toprak üzerindeki askeri ve idari " +
      "kontrolüyle de sınırlıdır. Batı Şeria, Oslo Anlaşmaları'nın öngördüğü A/B/C bölgelerine " +
      "ayrılmış durumdadır; İsrail, C Bölgesi'nde (Batı Şeria'nın yaklaşık %60'ı) doğrudan " +
      "güvenlik ve idari yetkiyi elinde tutar. Gazze Şeridi'nde ise İsrail 2005'te " +
      'yerleşimlerini ve askerlerini çekmiş olsa da, kara, hava ve deniz sınırlarının ' +
      'kontrolünü sürdürür.',
  },
  {
    isoCode: 'TW',
    isoCodeAlpha3: 'TWN',
    // Owner'ın zorunlu resmi adı, birebir.
    nameTr: 'Çin Cumhuriyeti (Tayvan)',
    nameEn: 'Republic of China (Taiwan)',
    slugTr: 'tayvan',
    slugEn: 'taiwan',
    continent: Continent.Asia,
    unSubregionTr: 'Doğu Asya',
    population: 23_299_132,
    populationYear: null,
    areaKm2: 36_197,
    capitalNameTr: 'Taipei',
    capitalNameEn: 'Taipei',
    capitalLatitude: 25.0531,
    capitalLongitude: 121.5264,
    neighborIsoCodes: [],
    officialLanguagesTr: ['Mandarin Çincesi'],
    currencyNameTr: 'Yeni Tayvan Doları',
    currencyCode: 'TWD',
    governmentFormTr: 'Yarı başkanlık sistemiyle yönetilen cumhuriyet',
    // independenceNoteTr: NULL — İran ile aynı sınıf (kesintisiz devlet, kopuş tarihi yok);
    //   bir tarih dayatmak siyasi bir ifade olurdu (DEC 2026-07-13).
    independenceNoteTr: null,
    sovereigntyNoteTr:
      'Tayvan, kendi anayasası, ordusu ve demokratik hükümeti olan fiilen (de facto) ' +
      "bağımsız bir devlet olmakla birlikte, Çin Halk Cumhuriyeti'nin 'Tek Çin' politikası " +
      "nedeniyle uluslararası alanda sınırlı diplomatik tanınmaya sahiptir. Dünya'nın en " +
      'büyük ekonomilerinden birine ve gelişmiş bir demokratik sisteme sahip olmasına karşın, ' +
      'yalnızca 12 ülke (11 Birleşmiş Milletler üyesi devlet ve Vatikan) Tayvan ile resmi ' +
      "diplomatik ilişki sürdürür. Türkiye de dahil olmak üzere dünyanın geri kalanı, 1971'de " +
      "Birleşmiş Milletler'in Çin'i temsil yetkisini Pekin'e devretmesinden bu yana Çin Halk " +
      "Cumhuriyeti'ni tanır ve Tayvan ile yalnızca gayriresmî temsilcilik düzeyinde ilişki " +
      'kurar.',
  },
  {
    isoCode: 'XK',
    isoCodeAlpha3: null,
    nameTr: 'Kosova',
    nameEn: 'Kosovo',
    slugTr: 'kosova',
    slugEn: 'kosovo',
    continent: Continent.Europe,
    unSubregionTr: 'Güney Avrupa',
    population: 1_594_353,
    populationYear: null,
    areaKm2: 10_908,
    capitalNameTr: 'Priştine',
    capitalNameEn: 'Pristina',
    capitalLatitude: 42.6629,
    capitalLongitude: 21.1655,
    // Sırbistan, Kuzey Makedonya, Arnavutluk, Karadağ (4).
    neighborIsoCodes: ['RS', 'MK', 'AL', 'ME'],
    officialLanguagesTr: ['Arnavutça', 'Sırpça'],
    // Euro — tek taraflı benimsenmiş (ne AB ne eurozone üyesi); yapılandırılmış alan EUR.
    currencyNameTr: 'Euro',
    currencyCode: 'EUR',
    governmentFormTr: 'Parlamenter cumhuriyet',
    // Tanınma sayısı owner'ın kasıtlı olarak muğlak "100'ün üzerinde" ifadesiyle — spesifik
    //   (115-120/84/110) rakam bilinçli olarak KULLANILMADI (task + CONVENTIONS §5 + DEC
    //   2026-07-13). Narrative draft hâlâ spesifik rakamları içeriyor — FLAGGED, NOVA
    //   taslağı uyumlayacak.
    sovereigntyNoteTr:
      "Kosova, 2008 yılında Sırbistan'dan bağımsızlığını ilan eden, uluslararası alanda " +
      "kısmen tanınan bir cumhuriyettir. Uluslararası Adalet Divanı, 2010'da verdiği bir " +
      'danışma görüşünde bağımsızlık ilanının uluslararası hukuka aykırı olmadığını ' +
      "belirtmiştir. Kosova'yı tanıyan ülke sayısı konusunda kesin bir mutabakat yoktur; " +
      "bağımsız kaynaklar sayıyı genellikle 100'ün üzerinde verir. Avrupa Birliği üyelerinin " +
      "dörtte üçünden fazlası ve NATO üyelerinin büyük çoğunluğu Kosova'yı tanır; Türkiye, " +
      'bağımsızlık ilanının hemen ertesi günü tanıyan ilk ülkeler arasındadır. Kosova, ' +
      "Birleşmiş Milletler'e üye değildir — Rusya ve Çin'in Güvenlik Konseyi'ndeki veto " +
      'tehdidi üyeliği engellemektedir.',
  },
];
