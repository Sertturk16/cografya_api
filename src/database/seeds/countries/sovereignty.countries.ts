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
 *      service resolve the corpus default. IL and PS are ordinary World Bank rows and carry
 *      neither field.
 *
 *      CY AND QN NOW READ AS ONE PAIR (DEC 2026-08-07b + Ek-1, owner-ruled, 2026-08-07):
 *      both figures are NON-CENSUS and both are 2024 year-end, so both credit lines state
 *      their method in the same shape, `<kurum>'ın <yöntem>i`. CY gained "tahmini"/"estimate"
 *      (CYSTAT's own word); QN keeps "projeksiyonu"/"projection" (its own table heading).
 *      The method words are NOT merged: the products genuinely differ (CY updates a 2021 base
 *      with registered events, QN projects from a 2011 base on assumed trends). Before this,
 *      the bare "CYSTAT" was not neutral — with "projeksiyonu" sitting on the neighbouring
 *      row it implied CY's figure was a CENSUS.
 *
 *      QN's EN form: the provenance tag marking that value as source-unverified was REMOVED
 *      on the same date (tag name not spelled here — it is still live elsewhere in the
 *      corpus, so an auditor's sweep for unverified values must not hit this record). Its
 *      stated basis (that `TRNC` was derived from our own `nameEn`) was factually wrong — the
 *      institution prints its own English name and uses `TRNC` in its own address line. The
 *      residual nuance is recorded on the QN row itself: the contiguous string is our
 *      composition of two self-published components, not a verbatim quotation.
 *
 * COMMON TO ALL 6: populationYear null (world-scale ruling, DEC 2026-07-13); areaKm2 is
 *   whole km² (entity is integer; KKTC 3.241,68 → 3.242 rounded to nearest); slugs by the
 *   same ASCII/Turkish-fold rule as the rest of the seed (Tayvan excepted, see #4).
 */
export const SOVEREIGNTY_COUNTRIES: readonly CountrySeed[] = [
  {
    isoCode: 'CY',
    isoCodeAlpha3: 'CYP',
    nameTr: 'Güney Kıbrıs Rum Yönetimi',
    nameEn: 'Republic of Cyprus',
    slugTr: 'guney-kibris-rum-yonetimi',
    slugEn: 'republic-of-cyprus',
    continent: Continent.Asia,
    // M49 istatistik standardı Kıbrıs'ı Batı Asya'ya koyar (Avrupa değil) — bilinçli,
    //   İran'ın "Güney Asya" vakasıyla aynı kategori (data dictionary §1).
    unSubregionTr: 'Batı Asya',
    population: 983_000,
    populationYear: null,
    // Kaynak-satırı istisnası (AK-9): kısa marka adı, parantezli açılım YOK — DEC 05j'nin
    //   kendi örneği "CYSTAT"; kurum Türkçe bir öz-ad yayımlamaz (çevrilmez). "tahmini" bir
    //   AÇILIM DEĞİL, bir YÖNTEM niteleyicisidir, dolayısıyla bu satırın "parantezli açılım
    //   YOK" kuralını ihlal etmez. DİKKAT — o kural DEC 05j'nin METNİNDE YOK: 05j yalnızca
    //   kaynak satırının veri-güdümlü olmasını ve özel kaynaklı satırlarda gerçek kurum adının
    //   yazılmasını hükme bağlıyor ("ör. Kıbrıs 'nüfus CYSTAT'"). Açılım yasağı bu yorumun
    //   kendi house-style glossudur; 05j'ye atfetmek, bu PR'ın CY kredisinde düzelttiği yanlış
    //   merci atfının aynısı olurdu (→ PR #102 review, CR102-M1).
    //   YÖNTEM SÖZCÜĞÜ (DEC 2026-08-07b + Ek-1, owner-ruled): 983.000 bir SAYIM DEĞİL.
    //   CYSTAT'ın kendi cümlesi "is estimated at 983,0 thousand at the end of 2024", kendi
    //   metodoloji notu "Population estimates are based on Census results updated annually
    //   to take account of the components of change, births, deaths and net migration",
    //   taban sayım 2021 (923.381, 01.10.2021, de jure). Çıplak "CYSTAT" NÖTR DEĞİLDİ:
    //   komşu QN satırı "projeksiyonu" dediği için okura bu rakamın SAYIM olduğunu ima
    //   ediyordu — eksik niteleyici bir iddiada bulunuyordu ve iddia yanlıştı. Sözcük
    //   kurumun kendi sözcüğüdür, bizim eklediğimiz bir ihtiyat payı değil.
    //   İki satır artık aynı kalıpta: <kurum>'ın <yöntem>i. Yöntem sözcükleri BİRLEŞTİRİLMEZ
    //   ("tahmin" ve "projeksiyon" gerçek bir metodoloji farkı taşır: CY 3 yıllık tabana
    //   kayıtlı olayları işler, QN 13 yıllık tabandan varsayım temelli model üretir).
    //   Yıl girmez (AK-10): iki rakam da 2024 yıl sonu vintage'lı, yıl ya ikisine birden
    //   girer ya hiçbirine.
    populationSourceNameTr: "CYSTAT'ın tahmini",
    populationSourceNameEn: "CYSTAT's estimate",
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
      "Kıbrıs adasının güney yarısını kaplayan Güney Kıbrıs Rum Yönetimi, Akdeniz'in doğu " +
      'havzasında yükselen Troodos Dağları ve verimli güney sahil ovaları üzerinde kuruludur. ' +
      'Adanın morfolojik omurgasını oluşturan bu dağlık kütle, hem adanın mikroklimasını hem ' +
      'de yerleşim ve su kaynaklarının dağılımını belirler.' +
      '\n\n' +
      'Kıyı şeridinde Limasol, Larnaka ve Baf gibi liman kentleri uzanırken, iç kesimde ' +
      "başkent Lefkoşa'nın güney mahalleleri ile ada içi tarım alanları yer alır.",
    landformNoteTr:
      'Troodos Dağları, jeoloji biliminde okyanus kabuğunun ve üst mantonun aşınarak yüzeyde ' +
      'kusursuz biçimde korunduğu dünyanın en ünlü ofiyolit komplekslerinden biridir; adada ' +
      'antik çağlardan bu yana işletilen zengin bakır yatakları da bu magmatik yükselimin ' +
      'ürünüdür. Masifin kalbinde yükselen 1.952 metrelik Olimpos Dağı (Hionistra), kışın karla ' +
      "kaplanan kubbesiyle tüm Kıbrıs'ın doruk noktasıdır." +
      '\n\n' +
      'Dağların güney yamaçları taraçalı bağlar ve derin vadilerle Akdeniz kıyısındaki alçak ' +
      'kıyı düzlüklerine iner. Kuzey yamaçlar ise adayı doğu-batı ekseninde kesen alüvyal ' +
      "Mesarya Ovası'nın güney kenarına dayanır.",
    climateNoteTr:
      'Yazları uzun, kurak ve sıcak, kışları ise ılık ve yağışlı geçen tipik bir Akdeniz ' +
      'iklimi egemendir. İç kesimdeki Mesarya düzlüğü ve kıyı ovalarında yaz sıcaklıkları ' +
      'düzenli olarak 35 derecenin üzerine tırmanırken, yüksek Troodos yamaçları denizden ' +
      'gelen esintiler ve orografik etkiyle serinler.' +
      '\n\n' +
      'Yıllık yağışın ezici bölümü kasım-mart arasına toplanır ve yağmur bulutları doğrudan ' +
      'Troodos kütlesine çarparak doruklarda kışın kar örtüsü bırakır; bu durum kurak kıyılar ' +
      'ile serin dağ yaylaları arasında belirgin bir mikroklima karşıtlığı üretir.',
    hydrographyNoteTr:
      'Adada yıl boyu kesintisiz akan kalıcı bir akarsu ağı bulunmaz; akarsuların tamamı ' +
      "yaz kuraklığında yatağı kuruyan mevsimlik derelerdir. Troodos Dağları'ndaki Makheras " +
      "ormanlarından doğan ve Lefkoşa'dan geçerek Gazimağusa Körfezi'ne yönelen 98 kilometrelik " +
      'Pedieos (Kanlı Dere), adanın en uzun su yoludur.' +
      '\n\n' +
      'Yüzey sularının yetersizliği nedeniyle içme ve sulama suyu kış yağışlarını toplayan ' +
      'baraj göletleriyle karşılanır. Güney kıyısındaki Larnaka ve Akrotiri tuz gölleri ise ' +
      'kışın su toplayıp göçmen kuşlara durak olan, yazın ise buharlaşarak tuz tabakasına ' +
      'dönüşen sığ kıyı lagünleridir.',
    sovereigntyNoteTr:
      'Güney Kıbrıs Rum Yönetimi, uluslararası alanda adanın tamamını temsil eden devlet olarak ' +
      "tanınır. Fiilen ise yalnızca adanın güneyini yönetir. 1974'te yaşanan olayların ardından " +
      "ada fiilen ikiye bölünmüş; Birleşmiş Milletler'in denetlediği bir tampon hattı, Güney " +
      "Kıbrıs Rum Yönetimi'nin yönettiği güney kesimi kuzeydeki Kuzey Kıbrıs Türk " +
      "Cumhuriyeti'nden ayırır. Avrupa Birliği müktesebatı da yalnızca adanın güneyinde fiilen " +
      'uygulanır.',
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
    // 2024 yıl sonu revize PROJEKSİYON — data dictionary §2. Taban sayım 4 Aralık 2011:
    //   kurumun kendi Tablo B1'i (sayım yıllarına göre nüfus serisi, 1901-2011) ve 2011
    //   sayımının kendi XLS tabloları 286.257 veriyor — tabloların kendi tanımıyla "sürekli
    //   ikamet eden nüfus", yani de jure. Tablo başlığı burada TARİF ediliyor, tırnak içinde
    //   alıntılanmıyor: elimizdeki iki bağımsız kayıt başlığı birbirinden az farklı
    //   aktarıyor, dolayısıyla birebir biçim bizde doğrulanmış değil.
    //   DÜZELTİLDİ (2026-08-07, bağımsız fact-check
    //   `Owner's Inbox/kaynak-satiri/factcheck-cy-2026-08-07.md` §5): bu yorum daha önce
    //   ~8.600 kişi daha yüksek, de facto (sayım anında ülkede bulunan) bir rakam veriyordu.
    //   O rakam, fact-check'in ERİŞEBİLDİĞİ kurum yayınlarının hiçbirinde bulunamadı ve yalnız
    //   haber kaynaklarında geçiyor; burada birebir yazılmıyor ki ileride bir taramada canlı
    //   bir iddia gibi görünmesin. Tam değeri tutan kayıt `provenance/territories.md`, QN
    //   satırı, OPEN QUESTION 1; `corrections.md` satırı ise defterin kendi sırasına göre bu
    //   iş indikten SONRA açılacak — yani bugün henüz yok, borçlu.
    //   Cins bu ikilide rakamı değiştirdiği için açıkça yazılıyor: CY tarafının 923.381'i de
    //   de jure, dolayısıyla karşılaştırılabilir olan 286.257'dir.
    population: 489_308,
    populationYear: null,
    // Kaynak-satırı istisnası (AK-9, sovereignty-escalated inceleme): "projeksiyon"
    //   niteleyicisi SAKLANAN DEĞERİN İÇİNDE ve ZORUNLU kalır (AK-8 Q4) — kurumun kendi tablo
    //   başlığı zaten bu sözcüğü kullanıyor ("2024 31 Aralık (Projeksiyon)", Tablo B2).
    //   BU DEĞERİ "kaynak doğrulanamadı" DİYE İŞARETLEYEN PROVENANCE ETİKETİ KALDIRILDI
    //   (2026-08-07, bağımsız fact-check
    //   `Owner's Inbox/kaynak-satiri/factcheck-cy-2026-08-07.md` §6). Etiket adı burada
    //   birebir yazılmıyor: o etiket korpusta hâlâ CANLI olarak kullanılıyor
    //   (`africa.countries.ts`, `governmentFormTr`), ve bir denetçinin "hangi değerler hâlâ
    //   doğrulanmamış" taraması bu kaydı yanlış pozitif olarak döndürmemeli. Dayanağı
    //   "`TRNC` bizim `nameEn`'imizden türetilmiş, kurumsal iddia değil" idi; bu OLGUSAL
    //   OLARAK YANLIŞ çıktı. Kurumun İstatistik Yıllığı 2024 künyesi kendi İngilizce adını
    //   basıyor (`Turkish Republic of Northern Cyprus` / `Statistical Institute`), her sayfa
    //   üstbilgisinde `STATISTICAL INSTITUTE` geçiyor ve `TRNC` kurumun kendi adres
    //   satırındadır (`99010 Nicosia -TRNC`).
    //   KALAN NÜANS, dürüstlük gereği yazılı: `TRNC Statistical Institute` BİTİŞİK DİZGİ
    //   olarak yıllıkta hiç geçmiyor (§6.1, tam metin arandı). Değer, kurumun kendi
    //   yayımladığı iki bileşenin BİZİM birleşimimizdir. Etiketin sınıfı bu yüzden düştü
    //   (doğrulanamama → birleştirme), kayıt bu yüzden duruyor: "doğrulandı" demek yeni bir
    //   yanlış beyan olurdu.
    //   YIL BİLEREK DÜŞÜRÜLDÜ (AK-10, PR #98 filtre turu — bir kural düzeltmesi DEĞİL, bir
    //   house-style tercihi): QN korpusun 199 satırı içinde yıl taşıyan TEK satırdı. DEC
    //   2026-08-07b ile CY de yöntem sözcüğü kazandığından iki satır artık aynı kalıpta
    //   (<kurum>'ın <yöntem>i); yıl ya ikisine birden girer ya hiçbirine (bugün: hiçbirine).
    populationSourceNameTr: "KKTC İstatistik Kurumu'nun projeksiyonu",
    populationSourceNameEn: "the TRNC Statistical Institute's projection",
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
      'Kuzey Kıbrıs Türk Cumhuriyeti, Kıbrıs adasının kuzeyini kaplayan; kıyı boyunca bir set ' +
      "gibi uzanan Beşparmak Dağları, güneydeki geniş Mesarya Ovası ve Akdeniz'e bir kılıç gibi " +
      'uzanan ince Karpaz Yarımadası ile ayırt edici bir morfolojiye sahiptir.' +
      '\n\n' +
      "Başkent Lefkoşa'nın kuzey yarısı ile Girne ve Gazimağusa gibi tarihi liman kentleri " +
      'bu coğrafi omurga üzerinde yer alır; dağlar ile ova arasındaki topoğrafik ayrım adanın ' +
      'yerleşim desenini doğrudan belirler.',
    landformNoteTr:
      'Kuzey kıyı şeridine paralel uzanan Beşparmak (Girne) Dağları, Mesozoik kalkerlerden ' +
      "oluşan dik ve sarp kireçtaşı sırtlarıyla Akdeniz'e duvar çeker. Adını beş parmağı " +
      'andıran kayalık kulelerinden alan sıradağın en yüksek noktası 1.024 metrelik Selvili ' +
      "Tepe'dir; bu kireçtaşı kütle güneydeki volkanik Troodos'tan jeolojik açıdan tamamen " +
      'farklı bir yapı sergiler.' +
      '\n\n' +
      'Dağların güneyinde uzanan geniş ve düz Mesarya Ovası ile batıdaki Güzelyurt havzası, ' +
      "adanın tahıl ve narenciye üretim merkezidir. Kuzeydoğuda ise Akdeniz'in derinliklerine " +
      'sokulan 80 kilometrelik Karpaz Yarımadası, el değmemiş kumulları ve falezli burunlarıyla ' +
      'adanın en bakir kıyı peyzajını sunar.',
    climateNoteTr:
      'Yazları sıcak ve kurak, kışları ılık ve az yağışlı Akdeniz iklimi hakimdir. Beşparmak ' +
      "Dağları'nın kuzey yamaçları ve Girne sahil şeridi denizel esintilerle bir nebze " +
      "ferahlarken, deniz etkisinden yalıtılmış çanak biçimli Mesarya Ovası'nda yaz sıcaklıkları " +
      'sık sık 40 dereceyi aşar.' +
      '\n\n' +
      'Yağışlar kasım ile mart arasındaki kış aylarına toplanır; güneydeki yüksek Troodos ' +
      'kütlesine kıyasla adanın kuzeyinde yağış miktarı belirgin biçimde düşüktür ve kalıcı ' +
      'kar örtüsü görülmez.',
    hydrographyNoteTr:
      "Kuzey Kıbrıs'ta yıl boyu sürekli akan bir nehir bulunmaz; akarsular yalnızca kış " +
      'yağışlarıyla coşan mevsimlik derelerden ibarettir. Troodos eteklerinden doğup Lefkoşa ' +
      "üzerinden Gazimağusa Körfezi'ne yönelen Pedieos (Kanlı Dere) havzanın en bilinen akarsu " +
      'yatağıdır.' +
      '\n\n' +
      'Yüzey suyunun kısıtlılığı ve yeraltı su tablasının tuzlanması karşısında, 2015 yılında ' +
      "tamamlanan Kuzey Kıbrıs Su Temin Projesi ile Türkiye'deki Alaköprü Barajı'ndan Akdeniz " +
      "tabanına askılı borularla döşenen hat üzerinden Geçitköy Barajı'na yıllık 75 milyon " +
      'metreküp tatlı su aktarılarak içme ve sulama dengesi güvenceye alınmıştır.',
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
      'Doğu Akdeniz çanağının güneydoğu kıyısında yer alan İsrail; batıda Akdeniz kıyı ' +
      'ovalarından başlayıp iç kesimlerdeki tepelik yaylalara, doğudaki derin Rift çöküntüsüne ' +
      've güneydeki kurak çöl düzlüklerine kadar uzanan çok katmanlı bir fiziki dokuya sahiptir.' +
      '\n\n' +
      'Bu topoğrafik çeşitlilik, çok dar bir coğrafi şerit içerisinde kıyı Akdeniz yaşantısı ile ' +
      'sert çöl koşullarını ve derin tektonik çukurlukları bir arada barındırır.',
    landformNoteTr:
      'Ülke coğrafyası batıdan doğuya dört belirgin koridora ayrılır: Nüfusun ve sanayinin ' +
      'toplandığı verimli kıyı şeridi; kuzeydeki Celile (Galilee) tepelikleri ve Meron Dağı ' +
      "(1.208 m) ile devam eden merkezi yükselti kuşağı; Afrika Boynuzu'ndan uzanan Büyük Rift " +
      "Vadisi'nin bir parçası olan Şeria (Ürdün) çöküntüsü; ve ülke alanının yarısından " +
      'fazlasını örten üçgen biçimli Necef Çölü.' +
      '\n\n' +
      'Rift yarığının tabanında yer alan Lut Gölü (Ölü Deniz) kıyıları, deniz seviyesinin yaklaşık ' +
      '430 metre altındaki rakımıyla yeryüzü karalarının en alçak noktasıdır; Necef Platosu ise ' +
      'derin erozyon kraterleri (makhtesh) ile yarılmıştır.',
    climateNoteTr:
      'Kuzeyden güneye ve batıdan doğuya doğru keskin bir iklim derecelenmesi görülür. Kıyı ' +
      'şeridi ve kuzey yaylalarında yazları sıcak ve kurak, kışları ılık ve yağışlı tipik Akdeniz ' +
      "iklimi hüküm sürerken; Şeria Vadisi boyunca ve güneydeki Necef Çölü'nde kurak çöl iklimi " +
      'baskındır.' +
      '\n\n' +
      'Yağışın neredeyse tamamı kış aylarında düşer ve kuzeyden güneye doğru hızla azalır: Kuzey ' +
      "tepelerinde yılda 1.000 milimetreyi aşan yağış, Necef'in güney ucundaki Akabe Körfezi " +
      'kıyısında 30 milimetrenin altına iner.',
    hydrographyNoteTr:
      'Kuzeydoğuda deniz seviyesinin yaklaşık 210 metre altında yer alan Taberiye Gölü (Celile ' +
      "Denizi), ülkenin en büyük doğal tatlı su rezervuarıdır. Taberiye'den çıkarak güneye " +
      'kıvrılan ve bir kısmı boyunca Ürdün sınırını çizen Şeria Nehri, sularını yüksek tuzluluğuyla ' +
      "bilinen Lut Gölü'ne boşaltır." +
      '\n\n' +
      'Aşırı buharlaşma ve tatlı suyun tarımda kullanılması nedeniyle Lut Gölü seviyesi her yıl ' +
      'yaklaşık bir metre alçalırken, ülke içme suyu ihtiyacının ezici çoğunluğunu Akdeniz ' +
      'kıyısına kurduğu modern deniz suyu arıtma (desalinizasyon) tesislerinden karşılar.',
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
      'Doğu Akdeniz havzasında yer alan Filistin, coğrafi olarak birbiriyle doğrudan kara ' +
      'bağlantısı bulunmayan iki ayrı parçadan — doğudaki dağlık Batı Şeria ve güneybatıdaki ' +
      "sahil şeridi Gazze'den — meydana gelir." +
      '\n\n' +
      'Bu iki bölge, topoğrafik yapılarından iklim ve su kaynaklarına kadar tümüyle farklı fiziki ' +
      've beşeri dinamikler taşır; Batı Şeria bir iç yayla niteliğindeyken Gazze yoğun nüfuslu ' +
      'alçak bir kıyı koridorudur.',
    landformNoteTr:
      "Batı Şeria'nın omurgasını, kuzey-güney ekseninde uzanan kireçtaşlı Samariye ve Yahudiye " +
      'tepeleri oluşturur; Halhul yakınlarındaki 1.030 metrelik Nebi Yunus Dağı bu yaylanın en ' +
      'yüksek noktasıdır. Yaylanın doğu yamaçları dik basamaklarla Şeria Vadisi ve Lut Gölü ' +
      'çöküntüsüne iner; vadi tabanındaki Eriha kenti dünyanın en alçak ve en eski yerleşim ' +
      'alanlarındandır.' +
      '\n\n' +
      'Buna karşılık Akdeniz kıyısında dar bir şerit olan Gazze, kıyı kumulları ve alçak alüvyal ' +
      'düzlüklerden ibarettir; yükseltisi nadiren birkaç on metreyi aşar.',
    climateNoteTr:
      'Her iki bölgede de temel olarak Akdeniz iklimi görülmekle birlikte yerel topoğrafya ' +
      "belirgin farklar üretir. Batı Şeria'nın yüksek sırtlarında kışlar serin ve yağışlı, zaman " +
      'zaman kar yağışlı geçerken; dağların yağmur gölgesinde kalan doğu yamaçları ve Şeria ' +
      'Vadisi kurak çöl karakterindedir.' +
      '\n\n' +
      'Gazze Şeridi ise deniz etkisiyle ılık, nemli ve yarı kurak bir sahil iklimi yaşar; ' +
      'yağışlar kış aylarında yoğunlaşır ve güneye doğru giderek azalır.',
    hydrographyNoteTr:
      'Filistin topraklarında yıl boyu kesintisiz akan iç nehir bulunmaz; vadiler (vadi ' +
      "yatakları) yalnızca kış sellerinde su taşır. Batı Şeria'nın doğu sınırını çizen Şeria " +
      "Nehri, deniz seviyesinin 430 metre altındaki Lut Gölü'ne (Ölü Deniz) dökülür." +
      '\n\n' +
      "Yüzey sularının yok denecek düzeyde olduğu Gazze Şeridi'nde nüfus ve tarım kıyı " +
      'akiferine (yeraltı suyu) bağımlıdır; aşırı çekim nedeniyle deniz suyunun karıştığı bu ' +
      'yeraltı su tablası ciddi tuzlanma ve kirlilik baskısı altındadır.',
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
    populationSourceNameEn:
      "Taiwan's Ministry of the Interior, Department of Household Registration",
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
      "Doğu Asya'da Pasifik Okyanusu ile Tayvan Boğazı arasında yer alan Tayvan; tektonik " +
      'levhaların çarpışma kuşağında yükselen sarp sıradağları ile kıtanın batısına bakan alüvyal ' +
      'ovaları arasındaki keskin zıtlığı barındıran bir ada ülkesidir.' +
      '\n\n' +
      'Nüfusun, modern tarımın ve ileri teknoloji sanayisinin ezici çoğunluğu adanın batı ' +
      'kıyısındaki düzlüklerde toplanmıştır; doğu kesimi ise sarp doğasıyla korunmuş bir bariyer ' +
      'oluşturur.',
    landformNoteTr:
      "Adanın belkemiğini, kuzeyden güneye uzanan ve 3.000 metrenin üzerinde 200'den fazla " +
      'zirve barındıran Merkezî Sıradağlar (Zhongyang) oluşturur. Sıradağın ve Doğu Asya ' +
      'adalarının en yüksek doruğu olan 3.952 metrelik Yu Dağı (Yushan / Jade), görkemli bir ' +
      'alpin masiftir.' +
      '\n\n' +
      "Dağlar doğu kıyısında Pasifik'e neredeyse dik deniz falezleri ve derin kanyonlarla " +
      '(Taroko) inerken; batıya doğru kademeli olarak alçalan arazi nehirlerin taşıdığı alüvyonlarla ' +
      'oluşan geniş ve bereketli kıyı ovalarına açılır.',
    climateNoteTr:
      'Yengeç Dönencesi adanın ortasından geçerek kuzeydeki subtropikal iklim ile güneydeki ' +
      'tropikal iklimi birbirinden ayırır. Doğu Asya muson döngüsü iklimin temel ' +
      'belirleyicisidir: Kışın serin ve yağışlı kuzeydoğu musonu, yazın ise sıcak ve nemli ' +
      'güneybatı musonu etkili olur.' +
      '\n\n' +
      'Yaz sonu ve sonbaharda Pasifik üzerinden gelen kuvvetli tayfunlar, yüksek dağ yamaçlarında ' +
      'ani ve taşkınlara yol açan yoğun yağışlar bırakır. Yüksek dağ sırtlarında kışın kar ' +
      'görülürken kıyılarda yıl boyu don olayı yaşanmaz.',
    hydrographyNoteTr:
      "Merkezi Sıradağlar'dan doğarak kısa mesafede denize inen akarsular dik eğimli, hızlı " +
      'akışlı ve delişmen karakterdedir; debileri tayfun dönemlerinde fırlar, kurak mevsimde ise ' +
      'hızla düşer. 203 kilometrelik Zhuoshui Nehri adanın en uzun akarsuyudur.' +
      '\n\n' +
      'İç kesimde yaklaşık 750 metre rakımda yer alan Sun Moon (Güneş-Ay) Gölü, adanın en ' +
      'büyük doğal tatlı su kütlesi olup hem hidroelektrik üretiminde stratejik bir rezervuar ' +
      'hem de ülkenin önde gelen ekoturizm merkezidir.',
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
      "Güneydoğu Avrupa'da Balkan Yarımadası'nın kalbinde yer alan karayla çevrili Kosova; " +
      'etrafı yüksek dağ silsileleriyle kuşatılmış iki geniş tektonik havza — doğudaki Kosova ' +
      'Ovası ile batıdaki Metohija (Dukagini) Ovası — üzerinde kuruludur.' +
      '\n\n' +
      'Ortalama 500 ila 800 metre rakıma sahip bu bereketli havzalar, tarih boyunca bölgenin ana ' +
      'tarım ve yerleşim alanları ile stratejik geçit yollarını oluşturmuştur.',
    landformNoteTr:
      'Ülke morfolojisi iki ana havza etrafında şekillenir: Batıdaki Metohija Havzası ve ' +
      'doğudaki Kosova Ovası. Bu ovaları güneyden ve batıdan kuşatan sıradağlar ülkenin doğal ' +
      'sınırlarını çizer: Güneyde Kuzey Makedonya sınırında yükselen Šar (Şar) Dağları ile ' +
      'güneybatıda Arnavutluk ve Karadağ sınırını oluşturan kireçtaşlı Prokletije (Arnavut ' +
      'Alpleri) masifleri en sarp kesimlerdir.' +
      '\n\n' +
      "Prokletije'deki 2.656 metrelik Gjeravica Dağı ve Şar Dağları'ndaki Velika Rudoka doruğu " +
      'ülkenin en yüksek noktalarıdır; bu dağlar kış sporları ve dağ ekosistemleri açısından ' +
      'zengin bir topoğrafya sunar.',
    climateNoteTr:
      'Ilıman karasal iklimin hüküm sürdüğü ülkede topoğrafik koridorlar yerel iklim desenlerini ' +
      "belirler. Batıdaki Metohija Havzası, Ak Drin vadisi boyunca Adriyatik Denizi'nden sokulan " +
      'ılıman hava akımları sayesinde daha yumuşak ve Akdeniz etkisine açık bir karaktere ' +
      'sahiptir.' +
      '\n\n' +
      'Doğudaki Kosova Ovası ise kıtadan gelen soğuk hava dalgalarıyla kışları daha sert ve ' +
      'kar yağışlı geçer. Ülkeyi çevreleyen yüksek dağlık alanlarda kışlar uzun sürer ve kar ' +
      'örtüsü aylarca yerde kalır.',
    hydrographyNoteTr:
      "Kosova, sularını üç ayrı denize (Adriyatik, Karadeniz ve Ege) ulaştıran Balkanlar'ın " +
      "nadir hidrolojik kavşaklarından biridir. Žleb Dağı yamaçlarından doğup Metohija'yı " +
      "geçen Ak Drin (Drini i Bardhë), Arnavutluk'ta Kara Drin ile birleşerek Adriyatik " +
      "Denizi'ne dökülür." +
      '\n\n' +
      "Doğudaki Sitnica ve İbar nehirleri Tuna havzası üzerinden Karadeniz'e; güneydeki " +
      "Lepenac ise Vardar Nehri üzerinden Ege Denizi'ne akar. Doğal göllerin az olduğu ülkede, " +
      'İbar üzerindeki çok amaçlı Gazivode (Ujmani) Baraj Gölü sanayi, tarım ve enerji ' +
      'üretimi açısından hayati bir tatlı su deposudur.',
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
