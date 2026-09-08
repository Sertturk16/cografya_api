import { Continent } from '../../../common/continent.enum';
import { CountryEntityType } from '../../../common/country-entity-type.enum';
import type { CountrySeed } from '../country.seed-data';

/**
 * Türkiye'nin kendi `/dunya/turkiye` profili — korpustaki TEK `TR` satırı.
 *
 * Why this row exists at all, and why it is alone in its own file: the corpus deliberately had
 * no Türkiye row until this wave, because the old guard read "TR must never appear here". That
 * rule was INVERTED by DEC 2026-08-01j — Türkiye is a country like the other 195 and its
 * `/dunya` page is what eight neighbour pages already try to link to. What survived of the old
 * guard is the part that actually protected something: the `turkiye`/`turkey` slugs belong to
 * this row and no other (invariant 1). Corpus invariant 6 now additionally demands that there
 * be EXACTLY ONE of it, `country`-typed, with the `turkiye` slug intact.
 *
 * The file is separate rather than appended to a continent batch so the row is reviewable on
 * its own and so a future edit to it cannot hide inside a 55-row diff.
 *
 * SOURCE OF RECORD:
 *   • Yapısal alanlar:  Owner's Inbox/territory-detay-dalga1/SPEC.md §3.3
 *                       + brief.md §4.2 (12/12 alan tablosu)
 *   • Anlatı prose:     Owner's Inbox/territory-detay-dalga1/dalga1-narrative-draft.md §5
 *   • Doğrulama:        dalga1-factcheck.md · dalga1-sovereignty-audit.md · dalga1-fix-confirm.md
 *   • Kararlar:         DECISIONS.md — DEC 2026-08-01j/q, DEC 2026-08-02 (S8)
 *
 * ALL NARRATIVE PROSE HERE WAS WRITTEN BY `pnpm seed:transcribe apply`, never by hand
 * (ENGINEERING §8). Only the structural fields below were hand-written, from the SPEC/brief.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * JUDGEMENT CALLS
 * ─────────────────────────────────────────────────────────────────────────────
 *   • `nameEn: 'Türkiye'` — Turkish spelling, deliberately, in the ENGLISH name field.
 *     CONVENTIONS §5 makes T.C. Dışişleri Bakanlığı's official English list the canonical
 *     source for country names, and it uses "Türkiye"; the UN registry has done the same since
 *     2022. This is the same MFA source-priority the other 196 rows follow, not an exception
 *     to it.
 *   • `slugEn: 'turkey'` — the NAME and the SLUG are separate decisions (ruling S8). The slug
 *     is an ASCII transliteration and a search-reality call; it is a routing key, not a label.
 *   • `continent: ASYA` — the field holds ONE value and the corpus assigns it by the **UN M49
 *     geoscheme**, the sourced classification behind every row's `unSubregionTr` (`Owner's
 *     Inbox/dunya-haritasi-base-data/*.md`: "UN Statistics Division — M49 Standard | Kıta + BM
 *     alt-bölgesi"). M49 places Türkiye in 145 Western Asia, under region 142 Asia — hence
 *     `ASYA`, and hence `unSubregionTr: 'Batı Asya'` below. The SAME rule, not a different one,
 *     puts Rusya in AVRUPA (M49 151 Eastern Europe) though most of its landmass is in Asia, and
 *     it is what puts Kıbrıs, Bulgaristan and İran where the corpus puts them, against popular
 *     perception, with the divergence explained in prose each time. Türkiye's transcontinental
 *     character is carried by `introTr` (~%3 Trakya), which is where a one-value field cannot
 *     go. **Do not read this row as "copy the neighbours"** — GE/AM/AZ agree with it only
 *     because M49 says so.
 *   • `populationYear: null` — symmetric with all 196 other rows (DEC 2026-07-13), even though
 *     the population figure itself has a precise reference date recorded in provenance.
 *   • `statusLabelTr`/`statusLabelEn` null — required for `country` rows by guard 2. A card
 *     subtitle here would imply Türkiye is a special case; it is not.
 *   • `sovereigntyNoteTr` null — Türkiye's status is not disputed, so there is nothing for the
 *     field to say. This is the ordinary state of 190+ rows, NOT an application of
 *     DEC 2026-08-01q: that ruling decided GL's and AQ's nulls, where a reader might expect
 *     otherwise, and it does not reach this row.
 *   • `settlement/economy/governanceNoteTr` NULL, on purpose (SPEC §3.3). Those are the
 *     province layer's job, and leaving them empty is exactly what keeps this profile from
 *     becoming a duplicate of the `/turkiye` hub (DEC 2026-08-01j).
 *   • `populationSourceNameTr/En` — kaynak-satırı micro (2026-08-06, AK-8 Q1): Türkiye is the
 *     FIFTH `populationSourceName` exception (with GL/CY/QN/TW). The page previously credited
 *     the generic corpus default ("Dünya Bankası") for a TÜİK figure — the same mis-credit
 *     class DEC 2026-08-05j fixed on the other four rows, found by direct World Bank API
 *     measurement (`SP.POP.TOTL`, TUR: no 2023/2024/2025 vintage equals 86.092.168).
 */
export const TURKIYE_COUNTRY: readonly CountrySeed[] = [
  {
    isoCode: 'TR',
    isoCodeAlpha3: 'TUR',
    nameTr: 'Türkiye',
    // MFA'nın resmî İngilizce listesi "Türkiye" der (CONVENTIONS §5); BM tescili 2022'den beri
    //   aynı. Ad ile slug ayrı kararlardır — slug ASCII `turkey` kalır (S8).
    nameEn: 'Türkiye',
    slugTr: 'turkiye',
    slugEn: 'turkey',
    // Kıta alanı BM M49'a göre atanır (korpus geneli: kıta = unSubregionTr'nin M49 üst bölgesi;
    //   her alt-bölge tek bir kıtaya gider). TR M49'da 145 "Batı Asya" → 142 ASYA; aynı kural
    //   RU'yu "Doğu Avrupa" → AVRUPA yapar. Kıtalararasılık anlatıya taşınır (CY/BG/İR emsali).
    //   Tek incelik Amerika'da: korpus M49'un tek 019 bölgesini yaygın yedi-kıta ayrımına uyarak
    //   KUZEY/GUNEY_AMERIKA diye ikiye böler. TR'yi etkilemez.
    continent: Continent.Asia,
    entityType: CountryEntityType.Country,
    // country ⇒ ikisi de null (guard 2).
    statusLabelTr: null,
    statusLabelEn: null,
    unSubregionTr: 'Batı Asya',
    population: 86_092_168,
    populationYear: null,
    // Kaynak-satırı istisnası (kaynak-satırı micro, 2026-08-06, AK-8 Q1): TÜİK ADNKS 2025,
    //   Bülten no. 53899 — hiçbir World Bank SP.POP.TOTL vintage'ı bu değeri yayımlamaz
    //   (ölçüldü, bkz. plan §1.3). İl sayfasının mevcut kredi biçimiyle (ProvinceDetail.sources)
    //   birebir aynı — platform içi tutarlılık.
    populationSourceNameTr: 'TÜİK (ADNKS)',
    populationSourceNameEn: 'TÜİK (ADNKS)',
    areaKm2: 783_562,
    capitalNameTr: 'Ankara',
    capitalNameEn: 'Ankara',
    capitalLatitude: 39.9334,
    capitalLongitude: 32.8597,
    // Sekizi de seed'li — sekiz gerçek çapraz link.
    neighborIsoCodes: ['GR', 'BG', 'GE', 'AM', 'AZ', 'IR', 'IQ', 'SY'],
    officialLanguagesTr: ['Türkçe'],
    currencyNameTr: 'Türk Lirası',
    currencyCode: 'TRY',
    governmentFormTr: 'Cumhurbaşkanlığı hükümet sistemi (üniter cumhuriyet)',
    independenceNoteTr:
      "29 Ekim 1923'te cumhuriyet ilan edildi; Ankara 13 Ekim 1923'te başkent olmuştu.",
    introTr:
      'Türkiye, Asya ile Avrupa kıtalarını birbirine bağlayan Anadolu ve Trakya toprakları ' +
      'üzerinde, Karadeniz, Ege ve Akdeniz ile kuşatılmış stratejik bir kavşakta yer alır. ' +
      'İstanbul ve Çanakkale boğazları yalnızca iki kıtayı birbirinden ayırmakla kalmaz; ' +
      'Karadeniz havzasını açık denizlere bağlayan yegane su yolu olarak binlerce yıllık beşeri ' +
      've ticari hareketliliği yönetir.' +
      '\n\n' +
      'Üç yanını çevreleyen denizler, kıyı ovaları ve komşu havzalarla kurduğu kara bağlantıları, ' +
      'ülkeyi Avrasya ve Akdeniz jeopolitiğinin merkezine taşır. Aynı zamanda Antarktika ' +
      'Antlaşması çerçevesinde kutup bölgelerinde yürüttüğü bilimsel seferlerle coğrafi araştırma ' +
      'ufkunu küresel ölçeğe genişletir.',
    landformNoteTr:
      'Alp-Himalaya kıvrım kuşağında yer alan Türkiye morfolojisi, Avrasya ile Afrika-Arap ' +
      'levhalarının sıkışma rejiminde batıdan doğuya doğru kademeli yükselen genç ve dinamik ' +
      'bir topoğrafyaya sahiptir. Kuzeyde kıyıya paralel uzanan Kuzey Anadolu Dağları ile güneyde ' +
      "Akdeniz'i kuşatan Toros Sıradağları, iç kesimlerdeki plato basamaklarını denizel " +
      'etkilerden yalıtır.' +
      '\n\n' +
      'Doğuya doğru gidildikçe dağ sıraları birbirine yaklaşarak daralır ve yerini ortalama ' +
      '2.000 metreyi aşan volkanik yaylalar ile Ağrı Dağı gibi görkemli dorukların yükseldiği sarp ' +
      "bir dağlık kütleye bırakır. Batı Anadolu'da ise gerilme tektoniğinin açtığı graben vadileri " +
      've horst blokları kıyıya dik uzanır. Bu genç jeolojik yapı, ülkeyi baştan başa kat eden ' +
      'Kuzey Anadolu ve Doğu Anadolu fay hatlarıyla dinamik bir sismik karakter kazanır.',
    climateNoteTr:
      'Dağ sıralarının kıyılara paralel uzanışı ve ani yükselti basamakları, kıyı kuşakları ile ' +
      'iç bölgeler arasında keskin iklim zıtlıkları üretir. Kıyılarda denizel etkilerin belirlediği ' +
      'ılıman Akdeniz ve her mevsim nemli Karadeniz iklimleri hüküm sürerken; dağların yağmur ' +
      'gölgesinde kalan iç platolarda sıcaklık farklarının belirginleştiği karasal iklim egemendir.' +
      '\n\n' +
      "Doğu Karadeniz'in dik yamaçları denizden gelen nemli hava kütlelerini yakalayarak orografik " +
      'etkiyle ülkenin en yüksek yağışını toplarken; etrafı dağlarla çevrili kapalı Tuz Gölü havzası ' +
      'yılda 300 milimetrenin altında yağış alarak kurak bozkır çehresine bürünür. Yükseltinin doğuya ' +
      'doğru artması kış sıcaklıklarını dondurucu seviyelere çekerken kar örtüsünün yerde kalma ' +
      'süresini uzatır.',
    hydrographyNoteTr:
      "Yüksek ve engebeli topoğrafya, Türkiye'yi çevre denizlere ve komşu havzalara su sağlayan " +
      "stratejik bir hidrolojik kavşak konumuna getirir. Ülke içinden doğarak Karadeniz'e dökülen " +
      "Kızılırmak ve Yeşilırmak ile Ege'ye inen akarsular kıyılarda geniş tarımsal deltalar kurar. " +
      'Anadolu yaylalarından beslenen Fırat ve Dicle nehirleri ise Mezopotamya düzlüklerine can ' +
      "vererek Basra Körfezi'ne ulaşır; doğuda Aras Nehri Hazar Denizi kapalı havzasına yönelir. " +
      'Meriç ve Asi nehirleri ise sınır aşarak Türkiye kıyılarından denize dökülür.' +
      '\n\n' +
      'Tektonik ve volkanik çöküntüler zengin bir göl varlığı barındırır: Ülkenin en büyük su ' +
      'kütlesi olan sodalı Van Gölü ile kurak dönemlerde alanı daralan sığ Tuz Gölü iki dev kapalı ' +
      'havza oluşturur. Karadeniz ile Akdeniz arasındaki tuzluluk ve yoğunluk farkı ise Marmara ' +
      "Denizi ve Türk Boğazları boyunca üstte Karadeniz'den Akdeniz'e, dipte ise Akdeniz'den " +
      "Karadeniz'e akan kesintisiz bir çift katmanlı akıntı sistemi işletir.",
    // sovereigntyNoteTr: null — statü tartışmalı değil (korpusun olağan hâli; GL/AQ'nun
    //   null'ını karara bağlayan DEC 2026-08-01q bu satırı kapsamaz).
    sovereigntyNoteTr: null,
    // settlement/economy/governanceNoteTr: NULL — il katmanının işi (SPEC §3.3).
    settlementNoteTr: null,
    economyNoteTr: null,
    governanceNoteTr: null,
  },
];
