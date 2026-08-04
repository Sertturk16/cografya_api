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
    // Kıta alanı BM M49'a göre atanır (korpus geneli: kıta = unSubregionTr'nin M49 üst bölgesi,
    //   istisnasız). TR M49'da 145 "Batı Asya" → 142 ASYA; aynı kural RU'yu "Doğu Avrupa" →
    //   AVRUPA yapar. Kıtalararasılık anlatıya taşınır (CY/BG/İR emsali).
    continent: Continent.Asia,
    entityType: CountryEntityType.Country,
    // country ⇒ ikisi de null (guard 2).
    statusLabelTr: null,
    statusLabelEn: null,
    unSubregionTr: 'Batı Asya',
    population: 86_092_168,
    populationYear: null,
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
      'Türkiye, 36-42 kuzey enlemleri ile 26-45 doğu boylamları arasında yer alır. Topraklarının ' +
      "yaklaşık yüzde 3'ü Avrupa kıtasındaki Trakya'da, geri kalanı Asya kıtasındaki Anadolu " +
      "Yarımadası'ndadır. Bu iki parçayı İstanbul ve Çanakkale boğazları birbirinden ayırır." +
      '\n\n' +
      'Ülke üç yanından denizle çevrilidir: kuzeyde Karadeniz, batıda Ege Denizi, güneyde ' +
      'Akdeniz. Marmara Denizi ise bütünüyle Türkiye sınırları içinde kalır. İki boğaz, ' +
      "Karadeniz'i Akdeniz'e bağlayan tek deniz yolunu oluşturur." +
      '\n\n' +
      'Sekiz ülkeyle kara sınırı vardır. 31 Aralık 2025 itibarıyla nüfus 86.092.168 kişidir; bu, ' +
      "Türkiye'yi dünyanın en kalabalık yirmi ülkesi arasına koyar." +
      '\n\n' +
      "Türkiye'nin coğrafi bağlantıları kendi bölgesiyle sınırlı değildir. 1996'dan bu yana " +
      "Antarktika Antlaşması'na taraf olan ülkeler arasındadır ve Horseshoe Adası'ndaki geçici " +
      "Türk Bilimsel Araştırma Kampı'nda bilim seferleri yürütür.",
    landformNoteTr:
      'Türkiye, Alp-Himalaya orojenik kuşağı üzerinde yer alır. Ülkenin genel yapısı batıdan ' +
      'doğuya yükselen bir eşiğe benzer: kıyı ovalarından iç platolara, oradan da doğudaki ' +
      'yüksek dağlık kütlelere geçilir.' +
      '\n\n' +
      'Kuzeyde Kuzey Anadolu Dağları, güneyde Toros Dağları kıyıya paralel uzanır. İki sıradağ ' +
      'kuşağının arasında İç Anadolu ve Doğu Anadolu platoları kalır. Ülkenin en yüksek noktası, ' +
      "doğudaki volkanik kütlelerden biri olan Ağrı Dağı'dır." +
      '\n\n' +
      "Kuzey Anadolu Fayı ülkenin kuzeyini batıdan doğuya boydan boya kat eder. Türkiye'nin " +
      'deprem coğrafyasını büyük ölçüde bu hat ile güneydoğuda uzanan Doğu Anadolu Fayı ' +
      'belirler.',
    climateNoteTr:
      "Türkiye'de üç ana iklim tipi görülür: kıyılarda Akdeniz ve Karadeniz iklimleri, iç " +
      'kesimlerde karasal iklim. Bu çeşitliliği üreten şey, ülkenin denize göre konumu ile dağ ' +
      'sıralarının kıyıya paralel uzanmasıdır; dağlar deniz etkisinin iç bölgelere geçmesini ' +
      'büyük ölçüde engeller.' +
      '\n\n' +
      'Uzun yıllar ortalamasına göre yıllık yağış 574 milimetredir. En çok yağış alan yer, yılda ' +
      "1.200 ile 2.500 milimetre arasında yağış alan Doğu Karadeniz'dir. En kurak kesim ise Tuz " +
      'Gölü çevresidir; buradaki yıllık yağış 250-300 milimetrede kalır.' +
      '\n\n' +
      'Akdeniz ve Güney Ege kıyı yerleşmeleri dışında ülkenin her yerinde kışın kar yağar. ' +
      'Yükselti bu tabloyu ayrıca keskinleştirir: aynı enlemdeki iki yerden biri deniz ' +
      'kıyısında, öbürü yaylada olduğunda kış sıcaklıkları belirgin biçimde ayrışır.',
    hydrographyNoteTr:
      'Türkiye 25 akarsu havzasına ayrılır. Akarsuların çoğu ülke sınırları içinde doğar ve yine ' +
      "Türkiye kıyılarından denize dökülür; bunların en uzunu Kızılırmak'tır." +
      '\n\n' +
      "Bir bölümü ise Türkiye'de doğar ama denize başka ülkelerin kıyılarından ulaşır. Fırat'ın " +
      "Türkiye sınırları içinde kalan bölümü 1.263 kilometre, Dicle'ninki 512 kilometredir; " +
      'ikisi de güneye, Mezopotamya ovasına doğru akar. Doğuda Aras Nehri 548 kilometrelik bir ' +
      'kesimi Türkiye içinde kat eder. Bu kesimin bir bölümünde nehir, doğu sınırı boyunca akar.' +
      '\n\n' +
      "Tersi de olur. Meriç Nehri Türkiye dışında doğar ve son 187 kilometresini Türkiye'de " +
      "tamamlayarak Ege Denizi'ne dökülür. Bu son kesimin bir bölümünde nehir, Türkiye ile " +
      'Yunanistan arasındaki sınırı çizer. Asi Nehri de güneyden ülkeye girer ve 88 kilometre ' +
      "sonra Akdeniz'e ulaşır." +
      '\n\n' +
      'Ülkede 320 doğal göl bulunur. Bunların bir bölümü mevsimliktir: kış yağışlarıyla dolar, ' +
      "yaz kuraklığında çekilir. Göllerin en büyüğü 3.713 kilometrekarelik Van Gölü'dür. Sığ ve " +
      'tuzlu bir kapalı havza gölü olan Tuz Gölü yaklaşık 1.300 kilometrekareyle ikinci ' +
      'sıradadır, ama kapladığı alan mevsime göre belirgin biçimde değişir.' +
      '\n\n' +
      'Karadeniz, Marmara, Ege ve Akdeniz kıyıları ülkenin su coğrafyasını tamamlar. Marmara, ' +
      "İstanbul ve Çanakkale boğazları arasında kalan bir iç denizdir; Karadeniz'in daha az " +
      "tuzlu suyu ile Akdeniz'in daha tuzlu suyu bu dar geçitlerde üst üste iki katman hâlinde " +
      'akar.',
    // sovereigntyNoteTr: null — statü tartışmalı değil (korpusun olağan hâli; GL/AQ'nun
    //   null'ını karara bağlayan DEC 2026-08-01q bu satırı kapsamaz).
    sovereigntyNoteTr: null,
    // settlement/economy/governanceNoteTr: NULL — il katmanının işi (SPEC §3.3).
    settlementNoteTr: null,
    economyNoteTr: null,
    governanceNoteTr: null,
  },
];
