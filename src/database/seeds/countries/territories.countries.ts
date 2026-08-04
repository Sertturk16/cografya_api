import { Continent } from '../../../common/continent.enum';
import { CountryEntityType } from '../../../common/country-entity-type.enum';
import type { CountrySeed } from '../country.seed-data';

/**
 * Dalga-1 territory/special kayıtları — Grönland (GL) ve Antarktika (AQ).
 *
 * These are the FIRST two rows in the corpus that are not sovereign states. Everything about
 * them that looks unusual next to the other 196 rows is a locked ruling, not an oversight:
 * they are `entityType` `territory` / `special`, they carry owner-approved card subtitles, and
 * AQ deliberately publishes no population at all.
 *
 * SOURCE OF RECORD:
 *   • Yapısal alanlar:  Owner's Inbox/territory-detay-dalga1/SPEC.md §3.3
 *                       (+ taslak §2.1/§2.2, aynı değerlerin doğrulama turundaki teyidi)
 *   • Anlatı prose:     Owner's Inbox/territory-detay-dalga1/dalga1-narrative-draft.md §3/§4
 *   • Doğrulama:        dalga1-factcheck.md · dalga1-sovereignty-audit.md · dalga1-fix-confirm.md
 *   • Kararlar:         DECISIONS.md — DEC 2026-08-01l/m/n/p/q, DEC 2026-08-02 (S1-S10)
 *
 * ALL NARRATIVE PROSE IN THIS FILE WAS WRITTEN BY `pnpm seed:transcribe apply`, never by hand
 * (ENGINEERING §8 — the PR #43 dropped-space bug class). Only the structural fields below were
 * hand-written, from the SPEC tables.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PER-ROW JUDGEMENT CALLS
 * ─────────────────────────────────────────────────────────────────────────────
 * GRÖNLAND (GL) — `territory`
 *   • `population` 56.740 (1 Ocak 2026, Grønlands Statistik). This SUPERSEDES the 56.542
 *     (1 Ocak 2025) figure the web card carried: same institution, newer publication — step 1
 *     of the DEC 2026-08-01l source ladder. Both surfaces now read this one field.
 *   • `populationYear` NULL, like all 196 other rows (DEC 2026-07-13: no year is asserted at
 *     world scale). Filling it only here would create an asymmetry.
 *   • `unSubregionTr` NULL — the M49 dilemma is carried in the prose, not forced into a label.
 *   • `neighborIsoCodes: ['CA']` is a REAL land border, not an approximation: the 2022
 *     Hans Adası / Tartupaluk treaty divided the island between Greenland and Canada. The
 *     neighbour grid never ships unexplained, so `governanceNoteTr` narrates it.
 *   • `independenceNoteTr` NULL (ruling S4): the concept does not apply to a territory, and
 *     guard 5 enforces it. The governance story lives in its own section instead.
 *   • `sovereigntyNoteTr` NULL (DEC 2026-08-01q) — Greenland's status is not disputed.
 *
 * ANTARKTİKA (AQ) — `special`
 *   • `population` NULL and **never 0**. "The concept does not apply here" is not "zero people
 *     live here"; a 0 would render as a real measurement. Guard 3 makes this structural.
 *   • `areaIsApproximate: true` — the only row in the corpus that sets it. 14.200.000 km² is
 *     an approximation and the ≈ belongs in the data, not hardcoded in the web (DEC 01l).
 *   • `continent: ANTARKTIKA` is the first use of the enum value PR-A added; guard 4 ties it
 *     to `special` in one direction.
 *   • Capital, languages, currency, government form, independence and sub-region are ALL
 *     explicitly `null` rather than omitted. Two reasons, and the first is mechanical: the
 *     transcription tool anchors narrative insertions on `governmentFormTr`, so a row that
 *     omits it falls back to splicing after the object's LAST property and the field order
 *     drifts. The second is editorial — an explicit null says "we decided this does not
 *     apply", an absent key says nothing at all.
 *   • `sovereigntyNoteTr` NULL (ruling S6): `entityType: 'special'` is already the honest
 *     structural signal, and the seven claimants stay unnamed by owner ruling (DEC 01q).
 */
export const TERRITORY_COUNTRIES: readonly CountrySeed[] = [
  {
    isoCode: 'GL',
    isoCodeAlpha3: 'GRL',
    nameTr: 'Grönland',
    nameEn: 'Greenland',
    slugTr: 'gronland',
    slugEn: 'greenland',
    continent: Continent.NorthAmerica,
    entityType: CountryEntityType.Territory,
    // Kart alt başlığı owner-onaylı içeriktir (DEC 2026-08-01n/p), türden TÜRETİLMEZ.
    statusLabelTr: 'Danimarka Özerk Bölgesi',
    statusLabelEn: 'Danish Autonomous Territory',
    // M49 ikilemi anlatıya taşınır; uydurma bir alt-bölge etiketi üretilmez.
    unSubregionTr: null,
    population: 56_740,
    populationYear: null,
    areaKm2: 2_166_086,
    capitalNameTr: 'Nuuk',
    capitalNameEn: 'Nuuk',
    capitalLatitude: 64.1836,
    capitalLongitude: -51.7214,
    // Hans Adası/Tartupaluk 2022 antlaşması — gerçek kara sınırı (Tier-1).
    neighborIsoCodes: ['CA'],
    officialLanguagesTr: ['Grönlandca (Kalaallisut)'],
    currencyNameTr: 'Danimarka Kronu',
    currencyCode: 'DKK',
    governmentFormTr: 'Danimarka Krallığı içinde özerk yönetim',
    // independenceNoteTr: null — S4 + guard 5 (territory'de kavram uygulanmaz).
    independenceNoteTr: null,
    introTr:
      "Grönland, 2.166.086 kilometrekarelik yüzölçümüyle dünyanın en büyük adasıdır. Kanada'nın " +
      'kuzeydoğusunda, Arktik Okyanusu ile Kuzey Atlantik arasında uzanır. Bu geniş alanın ' +
      'yalnızca 410.449 kilometrekaresi buzsuzdur; kalanını iç buzul ve buzullar örter.' +
      '\n\n' +
      'Ada kuzeyden güneye 2.670 kilometre boyunca uzanır. Kuzey ucundaki Oodaap Qeqertaa, Kuzey ' +
      "Kutbu'na yalnızca 706 kilometre uzaklıktadır. Güney ucu ise aşağı yukarı Oslo ile aynı " +
      'enlemdedir.' +
      '\n\n' +
      '56.740 kişilik nüfus, buzsuz kıyı şeridine dizilmiş kasaba ve yerleşmelere dağılmıştır. ' +
      "Grönland, Danimarka Krallığı içinde geniş özerkliğe sahiptir; başkenti Nuuk'tur.",
    landformNoteTr:
      "Grönland'ın yer şekillerini tek bir yapı belirler: iç kesimi dolduran buz örtüsü. Buzun " +
      'ağırlığı altında adanın ortası çanak gibi bastırılmıştır, yükseltiler ise kıyı kuşağında ' +
      "toplanır. Adanın en yüksek noktası olan Gunnbjørn Fjeld doğu Grönland'dadır." +
      '\n\n' +
      'Buz örtüsünü delip yüzeye çıkan kayalık zirvelere nunatak denir. Sözcük Inuit dilindeki ' +
      '"nunataq"tan gelir ve buradan bilim diline geçmiştir; buzul coğrafyasında dünyanın her ' +
      'yerinde aynı adla anılır.' +
      '\n\n' +
      'Kıyı, buzul vadilerinin denizle dolmasıyla oluşmuş fiyortlarla derin derin yarılmıştır. ' +
      'Girinti ve çıkıntılarıyla birlikte kıyı çizgisi 44.087 kilometreyi bulur.',
    climateNoteTr:
      'Grönland kutup ve tundra ikliminin ders kitabı örneğidir. Kuzeyde iklim Yüksek Arktik ' +
      'karakterdedir: yazlar serindir ve gece olmaz, kışın ise kutup gecesi bir aydan beş aya ' +
      'kadar sürer. Orta ve güney kesimlerde Alçak Arktik koşullar egemendir.' +
      '\n\n' +
      "Güney Grönland'ın derin fiyortlarında iklim subarktiğe yaklaşır ve sınırlı da olsa ağaç " +
      "yetişmesine izin verir. Nuuk'ta 2025 yılının ocak ortalaması −5,2 santigrat derece, " +
      'temmuz ortalaması ise 7,9 santigrat derece olarak ölçüldü.' +
      '\n\n' +
      "Ölçülmüş en yüksek sıcaklık, temmuz 2013'te batı kıyısında görülen 25,9 santigrat " +
      'derecedir. En düşük değer ise iç buzul üzerinde kaydedilen eksi 69,6 dereceye iner. Bu ' +
      'iki uç, kıyı ile buz örtüsü arasındaki farkın ne kadar büyük olduğunu gösterir.',
    hydrographyNoteTr:
      "Grönland'da klasik anlamda büyük bir akarsu ağı yoktur. Adanın hidrografyasını buzul " +
      'erime suları, fiyortlar ve her yıl denize bırakılan buzdağları belirler.' +
      '\n\n' +
      'Buz örtüsü yaklaşık 1,7 milyon kilometrekare alan kaplar ve içinde 2,9 milyon ' +
      'kilometreküp buz vardır. Kalınlığı yer yer 3 kilometreyi aşar. Bu buzun tamamı erise ' +
      'dünya deniz seviyesi yaklaşık 7,4 metre yükselirdi. Grönland ve Antarktika buz örtüleri ' +
      "birlikte, yeryüzündeki tatlı su buzunun yüzde 99'undan fazlasını tutar." +
      '\n\n' +
      "Batı kıyısındaki Ilulissat Buz Fiyordu 2004'te UNESCO Dünya Mirası Listesi'ne alındı. " +
      'Fiyordu besleyen Sermeq Kujalleq, dünyanın en hızlı hareket eden ve en etkin ' +
      'buzullarından biridir. Yılda 35 kilometreküpten fazla buzdağı üretir; Antarktika dışında ' +
      'bu üretime ulaşan başka bir buzul yoktur. Doğu kıyısında ise kollarıyla birlikte karaya ' +
      'derinlemesine sokulan Scoresby Sund fiyort sistemi bulunur.',
    // sovereigntyNoteTr: null — DEC 2026-08-01q (statü tartışmalı değil).
    sovereigntyNoteTr: null,
    settlementNoteTr:
      "Grönland'da yerleşme tek bir kurala uyar: buzun bittiği yerde başlar. Bütün kasaba ve " +
      'köyler buzsuz kıyı şeridindedir, nüfusun büyük bölümü de güneybatı kıyısında ' +
      'toplanmıştır.' +
      '\n\n' +
      "Nüfusun yüzde 35,8'i tek başına başkent Nuuk'ta yaşar. En büyük beş kasaba olan Nuuk, " +
      "Sisimiut, Ilulissat, Aasiaat ve Qaqortoq birlikte nüfusun yüzde 65'inden fazlasını " +
      'barındırır. 2026 başında kasabalarda 50.407, küçük yerleşmelerde 6.255 kişi kayıtlıydı.' +
      '\n\n' +
      'Kasabalar arasında karayolu bağlantısı yoktur; ulaşım deniz ve hava yoluyla sağlanır. ' +
      'Kuzeydoğudaki yaklaşık 972.000 kilometrekarelik millî park dünyanın en büyük millî ' +
      'parkıdır ve orada yalnızca Sirius devriyesinin üyeleriyle meteoroloji istasyonu ' +
      'görevlileri bulunur.',
    economyNoteTr:
      "Grönland ekonomisi tek bir sektörün üzerinde durur. Mal ihracatının yüzde 90'ından " +
      'fazlasını balıkçılık ürünleri oluşturur; başlıca türler morina, Grönland pisisi, uskumru, ' +
      "yengeç ve karidestir. Bu yapı, Grönland'ın gelirini uluslararası balık fiyatlarına " +
      'doğrudan bağlar.' +
      '\n\n' +
      "Kamu hizmetleri büyük ölçüde vergilerle ve Danimarka'dan gelen blok hibeyle finanse " +
      "edilir. Hibe, Grönland'ın Danimarka'dan devraldığı sorumluluk alanlarının giderlerini " +
      "karşılamak üzere verilir ve ön verilere göre 2024'te 4.323,7 milyon Danimarka kronu " +
      "olarak gerçekleşti. Grönland'ın kendi para birimi yoktur, ödemelerde Danimarka kronu " +
      'kullanılır.' +
      '\n\n' +
      "1990'lardan bu yana kurulan beş hidroelektrik santrali Nuuk, Qaqortoq ve Narsaq, " +
      "Sisimiut, Ilulissat ile Tasiilaq'a elektrik sağlar. Küçük kasabalar ve yerleşmeler ise " +
      'hâlâ tamamen fosil yakıtlara bağlıdır.',
    governanceNoteTr:
      'Grönland, Danimarka Krallığı içinde özerk bir yönetime sahiptir. Bugünkü düzenin temeli, ' +
      "1979'da kurulan Home Rule yönetiminin yerini alan 2009 tarihli Özerklik Yasası'dır. Yasa, " +
      "25 Kasım 2008'de yapılan halk oylamasında yüzde 75,5 evet oyu çıktıktan sonra kabul " +
      "edildi ve 21 Haziran 2009'da yürürlüğe girdi." +
      '\n\n' +
      'Yasanın başlangıç bölümünde Grönland halkı, uluslararası hukuk uyarınca kendi kaderini ' +
      'tayin hakkına sahip bir halk olarak tanınır. Aynı yasa Grönlandcayı (Kalaallisut) resmî ' +
      'dil sayar. Anayasa, vatandaşlık, yüksek mahkeme, dış politika, savunma ve güvenlik ' +
      "politikası ile kur ve para politikası Danimarka'da kalır; bunlar Grönland'a " +
      'devredilemeyen alanlardır.' +
      '\n\n' +
      "Grönland, Danimarka ile birlikte 1973'te Avrupa Topluluklarına katıldı. 1982'deki halk " +
      "oylamasının ardından 1 Şubat 1985'te ayrıldı, Danimarka ise üye kaldı." +
      '\n\n' +
      "Adanın tek kara sınırı 2022'de çizildi. 14 Haziran 2022'de Kanada ile Danimarka Krallığı, " +
      "Grönland'ın da katılımıyla, Tartupaluk (Hans Adası) üzerindeki elli yılı aşkın sınır " +
      'sorununu bir anlaşmayla çözdü. Sınır, adayı kuzeyden güneye boydan boya kesen doğal ' +
      'yarığı izler.',
  },
  {
    isoCode: 'AQ',
    isoCodeAlpha3: 'ATA',
    nameTr: 'Antarktika',
    nameEn: 'Antarctica',
    slugTr: 'antarktika',
    slugEn: 'antarctica',
    continent: Continent.Antarctica,
    entityType: CountryEntityType.Special,
    statusLabelTr: 'Tarafsız Kıta',
    statusLabelEn: 'Neutral Continent',
    unSubregionTr: null,
    // ASLA 0 — "kavram uygulanmaz" ile "sıfır kişi yaşıyor" aynı şey değildir (guard 3).
    population: null,
    populationYear: null,
    areaKm2: 14_200_000,
    // Korpustaki TEK yaklaşık alan; ≈ imi veriye ait, web'e gömülmez (DEC 2026-08-01l).
    areaIsApproximate: true,
    capitalNameTr: null,
    capitalNameEn: null,
    capitalLatitude: null,
    capitalLongitude: null,
    neighborIsoCodes: [],
    officialLanguagesTr: null,
    currencyNameTr: null,
    currencyCode: null,
    // AÇIKÇA null: transkripsiyon aracının anchor alanı budur (bkz. dosya başlığı).
    governmentFormTr: null,
    independenceNoteTr: null,
    introTr:
      "Antarktika, Güney Kutbu'nu çevreleyen ve yaklaşık 14,2 milyon kilometrekare yüzölçümüyle " +
      'yeryüzünün en güneydeki kıtasıdır. Yüzeyinin yalnızca yüzde 0,4 kadarı kar ve buzdan ' +
      'yoksundur; kalan her yerini buz örtüsü kaplar.' +
      '\n\n' +
      'Kıtanın kalıcı nüfusu yoktur. Burada bulunanlar, araştırma istasyonlarında dönüşümlü ' +
      'olarak görev yapan bilim insanları ve destek personelidir.' +
      '\n\n' +
      "Antarktika'nın hukuki düzeni de başka hiçbir kıtaya benzemez. 1959 tarihli Antarktika " +
      'Antlaşması kıtayı barışa ve bilime ayırdı; askerî üsler, tatbikatlar ve silah denemeleri ' +
      'yasaklandı.',
    landformNoteTr:
      "Antarktika'yı boydan boya kesen Transantarktik Dağları kıtayı ikiye ayırır: doğuda geniş " +
      've yüksek bir buzul platosu, batıda daha alçak ve parçalı bir kesim. Kıtanın en yüksek ' +
      "noktası yaklaşık 4.900 metrelik Vinson Massifi'dir." +
      '\n\n' +
      'Buz örtüsünün kalınlığı nedeniyle Antarktika, ortalama yükseltisi en fazla olan kıtadır. ' +
      "Güney Kutbu'nun kendisi de deniz seviyesinden 2.800 metre yukarıda, kutup platosunun " +
      'üzerindedir ve en yakın kıyıdan 1.235 kilometre içeridedir.' +
      '\n\n' +
      'Kayanın yüzeye çıktığı yerler çok sınırlıdır. Bu buzsuz noktalardan biri, dünyanın en ' +
      "güneydeki etkin yanardağı olan Erebus Dağı'dır; zirvesindeki lav gölü on yıllardır " +
      'sönmeden durmaktadır.',
    climateNoteTr:
      "Yeryüzünde ölçülmüş en düşük hava sıcaklığı Antarktika'da kaydedildi: 21 Temmuz 1983'te " +
      "Vostok İstasyonu'nda eksi 89,2 santigrat derece. Bu değer Dünya Meteoroloji Örgütü'nün uç " +
      'değer arşivinde hâlâ dünya rekoru olarak durur.' +
      '\n\n' +
      'Uydu ölçümlerinde zaman zaman eksi 93 derecenin altına inen değerler görülür. Bunlar kar ' +
      'yüzeyinin sıcaklığıdır, standart ölçüm yüksekliğindeki hava sıcaklığı değildir. İkisini ' +
      'karıştırmak yaygın bir hatadır ve rekor listesini değiştirmez.' +
      '\n\n' +
      'İç kesimde yıllık yağış son derece azdır. Antarktika bu yüzden, buzla kaplı olmasına ' +
      'rağmen bir çöl sayılır: yağan kar erimeden kaldığı ve binlerce yıl üst üste biriktiği ' +
      'için buz örtüsü bugünkü kalınlığına ulaşmıştır.',
    hydrographyNoteTr:
      'Antarktika buz örtüsü yaklaşık 14 milyon kilometrekare alan kaplar ve içinde yaklaşık 30 ' +
      'milyon kilometreküp buz vardır. Kalınlığı yer yer 4,9 kilometreye yaklaşır. Bu buzun ' +
      'tamamı erise deniz seviyesi yaklaşık 58 metre yükselirdi; Grönland buz örtüsü için aynı ' +
      'hesap 7,4 metre verir.' +
      '\n\n' +
      "Yeryüzündeki yüzey tatlı suyunun yaklaşık yüzde 90'ı bu buz örtüsünde tutulur. " +
      "Grönland'la birlikte iki buz örtüsü, dünyadaki tatlı su buzunun yüzde 99'undan fazlasını " +
      'barındırır.' +
      '\n\n' +
      'Buz örtüsü kıyıya vardığı yerlerde denizin üzerine taşarak buz sahanlıklarını oluşturur. ' +
      'Bunların en büyüğü olan Ross Buz Sahanlığı yaklaşık yarım milyon kilometrekare kaplar ve ' +
      'bir ucundan öbürüne 800 kilometre uzanır.' +
      '\n\n' +
      'Buzun altında sıvı su da vardır. Kilometrelerce buzun altında kalan Vostok Gölü, bilinen ' +
      'en büyük buzul altı göldür.',
    sovereigntyNoteTr: null,
    settlementNoteTr:
      "Antarktika'da kimse kalıcı olarak yaşamaz. Kıtadaki insan varlığı, ülkelerin işlettiği " +
      'araştırma istasyonlarından ibarettir; bunların bir bölümü yıl boyu açıktır, bir bölümü ' +
      'yalnızca yaz mevsiminde çalışır.' +
      '\n\n' +
      'Nüfus mevsime göre değişir. Kışı kıtada geçirenlerin sayısı bin kişi civarındadır, yaz ' +
      'aylarında bu sayı birkaç katına çıkar. Ulaşım ve ikmal deniz buzunun durumuna bağlı ' +
      'olduğu için istasyonların çalışma takvimi de mevsime göre kurulur.' +
      '\n\n' +
      "Türkiye 24 Ocak 1996'da Antarktika Antlaşması'na taraf oldu; Çevre Protokolü Türkiye " +
      "bakımından 27 Ekim 2017'de yürürlüğe girdi. Ulusal Antarktika Bilim Seferleri " +
      'Cumhurbaşkanlığı himayesinde, Sanayi ve Teknoloji Bakanlığı sorumluluğunda ve TÜBİTAK ' +
      'Marmara Araştırma Merkezi Kutup Araştırmaları Enstitüsü koordinasyonunda yürütülür. Türk ' +
      "bilim ekiplerinin kullandığı geçici araştırma kampı Horseshoe Adası'ndadır.",
    governanceNoteTr:
      'Antarktika üzerinde hiçbir devletin genel kabul görmüş egemenliği yoktur. Kıtanın ' +
      'kesimleri üzerinde yedi ülkenin ileri sürdüğü toprak iddiaları bulunur ve bu iddialar ' +
      "antlaşma düzeninde askıdadır. 1959 Antlaşması'nın IV. maddesi bu iddiaları ne tanır ne " +
      'reddeder; antlaşma yürürlükte kaldığı sürece yeni iddia ileri sürülemez, mevcut iddialar ' +
      'genişletilemez ve mevcut durum olduğu yerde donar.' +
      '\n\n' +
      "Antlaşma 1 Aralık 1959'da Washington'da imzalandı ve 1961'de yürürlüğe girdi. İmzacılar, " +
      "1957-58 Uluslararası Jeofizik Yılı'nda kıtada çalışan on iki ülkeydi. Antlaşma, 60 derece " +
      'güney enleminin güneyinde kalan bütün alanda geçerlidir. Bugün sisteme taraf olan ülke ' +
      "sayısı 58'dir; bunların 29'u karar alma yetkisine sahip danışman taraftır." +
      '\n\n' +
      "1991'de kabul edilen ve 1998'de yürürlüğe giren Çevre Protokolü, Antarktika'yı \"barışa " +
      've bilime adanmış doğal rezerv" ilan eder. Protokolün 7. maddesi, bilimsel araştırma ' +
      'dışında her türlü mineral kaynak faaliyetini yasaklar.' +
      '\n\n' +
      'Bu yasağın bir süre sınırı yoktur. "2048\'de madencilik serbest kalacak" biçimindeki ' +
      'yaygın bilgi yanlıştır: 2048, protokolün genel gözden geçirme konferansının talep ' +
      'edilebileceği tarihtir, yasağın kendiliğinden sona ereceği tarih değil.',
  },
];
