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
 *   7. POPULATION SOURCE NAME (kaynak-satırı micro, 2026-08-06, AK-9): CY/QN/TW are three of
 *      the corpus's five `populationSourceNameTr/En` exceptions (the other two are GL and
 *      TR, seeded elsewhere) — the `population` figures above were never a World Bank
 *      publication, so the row now carries its own institution's name rather than letting the
 *      service resolve the corpus default. QN's pair additionally carries the mandatory
 *      "projection" qualifier INSIDE the stored value (not a separate note), and its EN form
 *      is a platform-consistency derivation from our own `nameEn`, not a verified
 *      self-designation — see the field-level comment on the QN row and
 *      `nova-q2-teyit.md` §A.3. IL and PS are ordinary World Bank rows and carry neither field.
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
    // Kaynak-satırı istisnası (AK-9): kısa marka adı, parantezli açılım YOK — DEC 05j'nin
    //   kendi örneği "CYSTAT"; kurum Türkçe bir öz-ad yayımlamaz (çevrilmez).
    populationSourceNameTr: 'CYSTAT',
    populationSourceNameEn: 'CYSTAT',
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
    introTr:
      "Kıbrıs Cumhuriyeti, Doğu Akdeniz'in Sicilya ve Sardinya'dan sonra en büyük üçüncü adası " +
      "olan Kıbrıs'ın güney kesiminde yer alır. Ülke topraklarının çatısını, adanın tümüne " +
      'yüksekliğiyle egemen olan Troodos Dağları oluşturur. Dağların eteklerinde ve güney ' +
      "kıyısında ise verimli ovalar ile alçak kıyı düzlükleri Akdeniz'e iner.",
    landformNoteTr:
      'Ülkenin ve tüm adanın en yüksek noktası, Troodos kütlesinin ortasında yükselen 1.952 ' +
      'metrelik Olimpos Dağı\'dır (Rumca Hionistra, "kar kubbesi"). Kışın karla kaplanan bu ' +
      'zirvenin çevresinde küçük bir kayak merkezi işletilir. Troodos, jeolojik açıdan okyanus ' +
      'kabuğunun ve üst mantonun yeryüzüne çıkmış eksiksiz bir kesiti olan Troodos ' +
      'ofiyolitiyle tanınır; adanın antik çağlardan beri bilinen bakır yatakları da bu kütleye ' +
      'bağlıdır. Dağların kuzey eteğinde, adayı doğu-batı doğrultusunda kesen Mesarya ' +
      "Ovası'nın güney kenarı başlar. Güneyde ise Limasol ve Larnaka çevresindeki alçak kıyı " +
      'ovaları denize doğru alçalır.',
    climateNoteTr:
      "Kıbrıs Cumhuriyeti'nde yazları sıcak ve kurak, kışları ılık ve yağışlı geçen tipik bir " +
      'Akdeniz iklimi görülür. Kıyı ovalarında yaz sıcaklıkları düzenli olarak 35 santigrat ' +
      'derecenin üzerine çıkar; iç kesimdeki Mesarya Ovası yazın adanın en sıcak noktasıdır. ' +
      "Yağışın büyük bölümü kasım ile mart arasında düşer ve asıl olarak Troodos'un yüksek " +
      'kesimlerinde toplanır. Zirve çevresi yılın birkaç ayı kar altında kalır, bu da kurak ' +
      'ovalarla serin dağlar arasında belirgin bir iklim karşıtlığı yaratır.',
    hydrographyNoteTr:
      "Kıbrıs'ta yıl boyu kesintisiz akan bir akarsu yoktur; adanın bütün dereleri, yağışın " +
      'kesildiği yaz aylarında büyük ölçüde kuruyan mevsimlik akarsulardır. Adanın en uzun ' +
      "akarsuyu olan 98 kilometrelik Pedieos (Kanlı Dere), Troodos Dağları'ndaki Makheras " +
      "ormanlarında doğar, Mesarya Ovası boyunca akıp Lefkoşa'nın içinden geçer ve kuzeydoğuda " +
      "Gazimağusa Körfezi'ne yönelir. Sürekli akarsuların olmaması nedeniyle ülke, su " +
      'ihtiyacını büyük ölçüde barajlarda toplanan kış yağışlarına dayandırır. Güney ' +
      "kıyısında, Larnaka ve Akrotiri'deki tuz gölleri kışın suyla dolup yazın kuruyan sığ " +
      'çanaklardır.',
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
    // Kaynak-satırı istisnası (AK-9, sovereignty-escalated inceleme): "projeksiyon"
    //   niteleyicisi SAKLANAN DEĞERİN İÇİNDE. EN biçimi kurumun kendi öz-adlandırması
    //   DEĞİL — [KAYNAK DOĞRULANAMADI]: `TRNC` kendi `nameEn`'imizden türetilmiş
    //   platform-içi tutarlılık kararıdır, kurumsal iddia değil (nova-q2-teyit.md §A.3).
    populationSourceNameTr: "KKTC İstatistik Kurumu'nun 2024 projeksiyonu",
    populationSourceNameEn: "the TRNC Statistical Institute's 2024 projection",
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
    introTr:
      'Kuzey Kıbrıs Türk Cumhuriyeti, Kıbrıs adasının kuzey kesiminde yer alır. Coğrafyasına, ' +
      'kuzey kıyısı boyunca ince bir şerit hâlinde uzanan Beşparmak (Girne) Dağları ile bu ' +
      "sıradağın güneyindeki geniş Mesarya Ovası damga vurur. Kuzeydoğuda, adadan Akdeniz'e " +
      'doğru uzanan ince Karpaz Yarımadası ülkenin en uç noktasını oluşturur.',
    landformNoteTr:
      'Ülkenin kuzey kıyısı boyunca, doğu-batı doğrultusunda yaklaşık 160 kilometre uzanan ' +
      'Beşparmak Dağları (Girne Sıradağları) yükselir; adına kaynaklık eden, beş parmağa ' +
      'benzeyen kayalık zirvesiyle tanınır. Bu kireçtaşı sıradağın ve ülkenin en yüksek ' +
      "noktası 1.024 metrelik Selvili Tepe'dir (Rumca Kiparisóvuno). Beşparmak Dağları, adanın " +
      'güneybatısındaki çok daha yüksek Troodos kütlesinden bağımsız, ayrı bir jeolojik ' +
      "yapıdır; adanın 1.952 metreye ulaşan en yüksek noktası güneyde, Troodos'tadır. Dağlarla " +
      'kuzey kıyısı arasında yalnızca dar bir kıyı şeridi kalır. Güneyde ise düz ve geniş ' +
      'Mesarya Ovası ile batıdaki Güzelyurt Ovası, tarımın yoğunlaştığı düzlükleri oluşturur.',
    climateNoteTr:
      "Kuzey Kıbrıs'ta yazları sıcak ve kurak, kışları ılık ve yağışlı Akdeniz iklimi " +
      'egemendir. Mesarya Ovası yaz aylarında bunaltıcı sıcaklara ulaşırken, Beşparmak ' +
      "Dağları'nın kuzey yamaçları ve Girne kıyısı deniz etkisiyle bir miktar daha ılıman " +
      'kalır. Yağışın neredeyse tamamı kasım ile mart arasında toplanır; yaz ayları uzun ve ' +
      "kuraktır. Güneydeki yüksek Troodos'un aksine adanın kuzeyinde kalıcı bir dağ karı " +
      'örtüsü görülmez.',
    hydrographyNoteTr:
      "Kıbrıs'ın kuzeyinde de yıl boyu akan sürekli bir akarsu bulunmaz; dereler kışın yağışla " +
      'canlanıp yazın kurur. Adanın en uzun akarsuyu Pedieos (Kanlı Dere), kaynağını güneydeki ' +
      "Troodos Dağları'ndan alır; Lefkoşa'yı geçtikten sonra kuzeydoğuya, Mesarya üzerinden " +
      "Gazimağusa Körfezi'ne yönelir. Sürekli tatlı su kaynaklarının azlığı nedeniyle ülke " +
      "uzun süre yeraltı suyuna ve barajlara bağımlı kalmıştır. 2015'te tamamlanan Kuzey " +
      "Kıbrıs Su Temin Projesi ile Türkiye'nin Akdeniz kıyısından denizin altına döşenen bir " +
      'boru hattı üzerinden adaya içme ve sulama suyu ulaştırılmaya başlanmıştır.',
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
    introTr:
      "İsrail, Doğu Akdeniz'in güneydoğu kıyısında yer alan bir ülkedir. Topraklar batıdan " +
      'doğuya dört farklı coğrafi kuşağa ayrılır: Akdeniz boyunca uzanan bir kıyı ovası, ' +
      "ortada kuzey-güney doğrultulu tepelik yükseltiler, doğuda Şeria (Ürdün) Vadisi'nin " +
      'derin çöküntüsü ve güneyde ülkenin yarısından fazlasını kaplayan Necef Çölü.',
    landformNoteTr:
      'Ülkenin batısını, Akdeniz kıyısı boyunca uzanan ve nüfusun büyük bölümünün toplandığı ' +
      'verimli kıyı ovası oluşturur. Bu ovanın doğusunda arazi yükselir: kuzeydeki Celile ' +
      '(Galilee) dağlık bölgesi, ülkenin uluslararası kabul gören sınırları içindeki en yüksek ' +
      "noktası olan 1.208 metrelik Meron Dağı'nı barındırır. Güney yarıyı ise üçgen biçimli " +
      'Necef Çölü kaplar; yaklaşık 12.000 kilometrekarelik bu kurak bölge, İsrail ' +
      'topraklarının yarısından fazlasına karşılık gelir. Doğu sınırı boyunca, Afrika ve Asya ' +
      "kıta levhalarının ayrılmasıyla oluşan Büyük Rift Vadisi'nin bir parçası olan Şeria " +
      'Vadisi uzanır. Bu çöküntünün ortasındaki Lut Gölü (Ölü Deniz) kıyısı, deniz seviyesinin ' +
      '430 metreden fazla altındaki yüzeyiyle yeryüzü kara alanının en alçak noktasıdır.',
    climateNoteTr:
      "İsrail'de kuzeyden güneye belirgin bir iklim geçişi görülür. Akdeniz kıyısı ile " +
      'kuzeydeki dağlık kesimlerde yazları sıcak ve kurak, kışları ılık ve yağışlı bir Akdeniz ' +
      'iklimi egemendir. Güneye inildikçe iklim hızla kuraklaşır; Necef Çölü ve Şeria ' +
      "Vadisi'nin güneyi yarı kurak ve çöl iklimine geçer. Yağışın neredeyse tamamı kış " +
      'aylarında düşer ve kuzeyden güneye doğru azalır: kuzeyde yılda 1.000 milimetreyi aşan ' +
      "yağış, Necef'in güneyinde 30 milimetrenin altına iner.",
    hydrographyNoteTr:
      "İsrail'in en önemli tatlı su kaynağı, kuzeydoğuda deniz seviyesinin yaklaşık 210 metre " +
      "altında yer alan Celile Denizi'dir (Taberiye Gölü / Kineret); ülkenin en büyük tatlı su " +
      "gölüdür. Bu gölden çıkan Şeria (Ürdün) Nehri güneye doğru akarak Lut Gölü'ne dökülür ve " +
      'yolunun bir bölümünde ülkenin doğu sınırını çizer. Yaklaşık 320 kilometrelik Şeria ' +
      'Nehri bölgenin en uzun akarsuyudur, ancak suyunun büyük bölümü sulama ve içme amacıyla ' +
      'çekildiğinden alt kesimlerinde debisi belirgin biçimde azalır. Lut Gölü, deniz suyunun ' +
      'yaklaşık on katı tuzluluğuyla dünyanın en tuzlu su kütlelerinden biridir; su seviyesi ' +
      'her yıl yaklaşık bir metre düşmektedir.',
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
    introTr:
      'Filistin, Doğu Akdeniz kıyısında, birbirinden ayrı iki toprak parçasından oluşur. ' +
      'Doğudaki Batı Şeria, Şeria (Ürdün) Nehri ile Akdeniz kıyı ovası arasında yer alan, orta ' +
      'kesimi dağlık bir yayla ülkesidir. Güneybatıdaki Gazze Şeridi ise Akdeniz boyunca uzanan ' +
      'dar, alçak ve kumul bir kıyı şerididir. İki bölge coğrafi olarak birbirine komşu ' +
      'değildir.',
    landformNoteTr:
      "Batı Şeria'nın omurgasını, kuzey-güney doğrultusunda uzanan orta dağlık yüksek yayla " +
      "oluşturur; kireçtaşından oluşan bu yayla Filistin'in en yüksek kesimidir. Bölgenin ve " +
      "ülkenin en yüksek noktası, Halhul yakınlarındaki 1.030 metrelik Nebi Yunus Dağı'dır. " +
      "Yaylanın doğusunda arazi hızla alçalarak Şeria Vadisi'nin çöküntüsüne iner; Eriha " +
      '(Jericho) çevresi, deniz seviyesinin yüzlerce metre altında kalan bu vadinin en alçak ' +
      'yerlerindendir. Gazze Şeridi ise bütünüyle alçak kıyı ovası ve kum tepelerinden oluşur; ' +
      'en yüksek noktası birkaç on metreyi geçmez.',
    climateNoteTr:
      "Filistin'in iki bölgesinde de temelde Akdeniz iklimi görülür; yazlar sıcak ve kurak, " +
      "kışlar ılık ve yağışlıdır. Batı Şeria'nın yüksek dağlık kuşağında kışlar serin geçer ve " +
      "zaman zaman kar yağar. Doğuya, Şeria Vadisi'ne inildikçe iklim hızla kuraklaşarak yarı " +
      "kurak ve çöl özelliği kazanır. Gazze Şeridi'nde ise deniz etkisiyle ılıman ve nispeten " +
      'nemli bir kıyı iklimi egemendir. Yağışın büyük bölümü kış aylarında düşer.',
    hydrographyNoteTr:
      'Filistin topraklarında yıl boyu akan sürekli bir nehir yoktur; iç kesimdeki vadiler ' +
      "yalnızca kış yağışlarıyla akar. Bölgenin başlıca akarsuyu, Batı Şeria'nın doğu sınırını " +
      "çizen Şeria Nehri'dir; kuzeyden güneye akarak Lut Gölü'ne (Ölü Deniz) dökülür. Batı " +
      "Şeria'nın güneydoğu kenarı, deniz seviyesinin 430 metreden fazla altındaki yüzeyiyle " +
      "yeryüzünün en alçak noktası olan Lut Gölü kıyısına kadar iner. Gazze Şeridi'nde yüzey " +
      'suyu yok denecek kadar azdır; bölge, içme ve sulama suyunu büyük ölçüde kıyı akiferinden, ' +
      'yani yeraltı suyundan sağlar.',
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
    // Kaynak-satırı istisnası (AK-9): EN, dairenin kendi İngilizce öz-adlandırmasından
    //   türetildi (ris.gov.tw/app/en — "Dept. of Household Registration. Ministry of the
    //   Interior."), nova-q2-teyit.md §A.4 ile teyitli.
    populationSourceNameTr: 'Tayvan İçişleri Bakanlığı Nüfus Kayıt Dairesi',
    populationSourceNameEn: "Taiwan's Ministry of the Interior, Department of Household Registration",
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
    introTr:
      "Tayvan, Doğu Asya'da, Çin anakarasından Tayvan Boğazı ile ayrılan bir ada ülkesidir. " +
      'Adanın omurgasını, kuzeyden güneye uzanan yüksek sıradağlar oluşturur; bu dağlar adayı ' +
      'sarp ve dik bir doğu kıyısı ile geniş ve alçak batı ovalarına böler. Nüfusun ve tarımın ' +
      'büyük bölümü batıdaki ovalarda toplanır.',
    landformNoteTr:
      "Adayı boydan boya kat eden Merkezî Sıradağlar (Zhongyang), Tayvan'ın çatısını oluşturur " +
      've 3.000 metrenin üzerinde iki yüzden fazla zirve barındırır. Adanın en yüksek noktası, ' +
      "bu sıradağda yükselen 3.952 metrelik Yu Dağı'dır (Jade / Yushan) ve Kuzeydoğu Asya'nın " +
      'en yüksek zirvelerinden biri kabul edilir. Dağlar adanın doğusunda denize dik inerek ' +
      'yer yer yüzlerce metre yükseklikte deniz falezleri oluşturur. Batıda ise arazi kademeli ' +
      'olarak alçalır ve geniş alüvyal ovalara dönüşür; ülke nüfusunun ve tarımının çekirdeği ' +
      'bu batı ovalarındadır.',
    climateNoteTr:
      "Yengeç Dönencesi adanın ortasından geçer ve Tayvan'ı iki iklim kuşağına böler: " +
      'dönencenin güneyi tropikal, kuzeyi ise subtropikal iklime girer. Ada genelinde muson ' +
      'belirleyicidir; kışın kuzeydoğu, yazın güneybatı musonu yağış getirir. Yaz sonu ile ' +
      "sonbahar, Pasifik'ten gelen tayfunların en sık görüldüğü dönemdir ve adaya kısa sürede " +
      'çok yüksek miktarda yağış bırakır. Yüksek dağlık iç kesimler, kıyılara göre belirgin ' +
      'biçimde serin ve yağışlıdır.',
    hydrographyNoteTr:
      "Tayvan'ın akarsuları, yüksek dağlardan kısa mesafede denize indikleri için kısa, hızlı " +
      've dik eğimlidir; debileri mevsime göre büyük ölçüde değişir. Adanın en uzun nehri, ' +
      "Merkezî Sıradağlar'daki Hehuan Dağı çevresinden doğup batıya, Tayvan Boğazı'na dökülen " +
      "203 kilometrelik Zhuoshui Nehri'dir. Adanın en büyük gölü ise iç kesimde, yaklaşık 750 " +
      "metre yükseklikteki Sun Moon (Güneş-Ay) Gölü'dür; hidroelektrik üretiminde kullanılan " +
      'bu göl aynı zamanda ülkenin önemli bir turizm merkezidir.',
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
    introTr:
      "Kosova, Balkan Yarımadası'nın ortasında, denize kıyısı olmayan bir ülkedir. Ülke " +
      'toprakları, çevrelerini yüksek dağların kuşattığı iki ana ovadan oluşur: doğuda Kosova ' +
      'Ovası, batıda Metohija (Dukagini) Ovası. Arazinin yaklaşık dörtte üçü 500 ile 1.500 ' +
      'metre arasında yer alır.',
    landformNoteTr:
      'Ülkenin iç kesimini, birbirinden alçak tepelerle ayrılan iki geniş ova oluşturur: ' +
      'doğudaki Kosova Ovası ile batıdaki Metohija Ovası. Bu ovaları güneyden ve batıdan ' +
      'yüksek sıradağlar çevreler. Güneyde, Kuzey Makedonya sınırı boyunca Şar Dağları (Šar ' +
      "Planina) yükselir. Güneybatıda ise Dinar Alpleri'nin bir parçası olan, Arnavutluk ve " +
      'Karadağ sınırına yaslanmış Prokletije dağları (Arnavut Alpleri / Bjeshkët e Nemuna) ' +
      'uzanır. Ülkenin resmî olarak en yüksek noktası, bu dağlardaki 2.656 metrelik ' +
      "Gjeravica'dır; Şar Dağları'ndaki Velika Rudoka ise son ölçümlere göre birkaç metre daha " +
      'yüksek kabul edilir.',
    climateNoteTr:
      "Kosova'da temel olarak karasal iklim görülür; yazlar sıcak, kışlar soğuk ve kar " +
      "yağışlıdır. Batıdaki Metohija Ovası, Adriyatik'ten Ak Drin vadisi boyunca sızan hava " +
      'akımları nedeniyle daha ılıman ve Akdeniz etkisine açıktır; doğudaki Kosova Ovası ise ' +
      'daha belirgin bir karasal karaktere sahiptir. Çevredeki yüksek dağlarda kışlar uzun ve ' +
      'bol kar yağışlı geçer, bu kesimler yılın önemli bir bölümünü kar altında geçirir.',
    hydrographyNoteTr:
      "Kosova'nın en önemli akarsuyu, Peja'nın (İpek) kuzeyindeki Žleb Dağı'nın yamaçlarından " +
      "doğan Ak Drin'dir (Drini i Bardhë / Beli Drim). Metohija Ovası'nı geçtikten sonra " +
      "Arnavutluk'a girer, Kara Drin'le birleşerek Drin Nehri'ni oluşturur ve Adriyatik " +
      "Denizi'ne ulaşır. Kosova, sularını üç ayrı denize gönderen ender bölgelerden biridir: " +
      "Ak Drin batıda Adriyatik'e, Kosova Ovası'ndan geçen Sitnica (İbar üzerinden) kuzeyde " +
      "Karadeniz havzasına, güneydeki Lepenac ise Vardar üzerinden Ege Denizi'ne akar. Doğal " +
      'göllerin azlığı nedeniyle ülkenin büyük su kütlelerinin çoğu, Gazivode (Ujmani) gibi ' +
      'yapay baraj gölleridir.',
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
