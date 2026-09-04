import { GeographicRegion } from '../../common/geographic-region.enum';

export interface RegionFaqItem {
  question: string;
  answer: string;
}

export interface RegionSeed {
  region: GeographicRegion;
  slug: string;
  nameTr: string;
  headingName: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  introTr: string;
  highestPointName: string | null;
  highestPointElevationM: number | null;
  highestPointProvince: string | null;
  coastalSeas: string[];
  neighborRegions: string[];
  neighborCountries: string[];
  subregions: string[];
  gdpShareApproxPercent: number | null;
  locationAndBordersTr: string;
  landformsTr: string;
  climateAndVegetationTr: string;
  hydrographyTr: string;
  settlementAndPopulationTr: string;
  economyTr: string;
  subregionsTr: string;
  disasterAndEarthquakeTr: string;
  comparisonTr: string;
  faqs: RegionFaqItem[];
  sourcesNoteTr: string;
  footnotes: string[];
}

export const SEED_REGIONS: readonly RegionSeed[] = [
  {
    region: GeographicRegion.Marmara,
    slug: 'marmara',
    nameTr: 'Marmara Bölgesi',
    headingName: 'Marmara',
    metaTitle: 'Marmara Bölgesi: 11 İl, İklim ve Ekonomik Ağırlık',
    metaDescription:
      "Marmara Bölgesi'nin 11 ilinde 26,7 milyon kişi yaşar; bu, Türkiye nüfusunun yaklaşık üçte biridir. Bölgenin illeri, iklimi, bölümleri ve ekonomik ağırlığı bir arada.",
    h1: 'Marmara Bölgesi',
    introTr:
      "Marmara Bölgesi, adını ortasındaki denizden alır ve Türkiye'nin Avrupa'daki topraklarının tamamını içine alır. On bir ili, 26,7 milyon kişilik nüfusuyla ülke nüfusunun yaklaşık üçte birini barındırır. Boğazlar bölgeyi ikiye böler ve aynı anda birbirine bağlar: kuzeyde Karadeniz, ortada Marmara Denizi, güneybatıda Ege Denizi kıyısı vardır.",
    highestPointName: 'Uludağ',
    highestPointElevationM: 2543,
    highestPointProvince: 'Bursa',
    coastalSeas: ['Karadeniz', 'Marmara Denizi', 'Ege Denizi'],
    neighborRegions: ['Ege', 'Karadeniz', 'İç Anadolu'],
    neighborCountries: ['Bulgaristan', 'Yunanistan'],
    subregions: [
      'Yıldız Dağları Bölümü',
      'Ergene Bölümü',
      'Çatalca-Kocaeli Bölümü',
      'Güney Marmara Bölümü',
    ],
    gdpShareApproxPercent: 43.0,
    locationAndBordersTr:
      "Marmara Bölgesi Türkiye'nin kuzeybatısında yer alır ve ülkenin Avrupa'daki topraklarının\ntamamını kapsar. Kuzeyde Karadeniz, güneybatıda Ege Denizi kıyısı vardır; bölgenin ortasında\nise adını verdiği Marmara Denizi bulunur.\n\nKara sınırı iki ülkeyle paylaşılır. Kırklareli kuzeyde 159 kilometrelik bir hatla\nBulgaristan'a komşudur. Edirne ise iki komşu ülkeye birden sınırdır: kuzeyde 88 kilometre\nBulgaristan, batıda 204 kilometre Yunanistan.\n\nİç sınırlarda bölge üç komşu tanır. Balıkesir, Bursa ve Bilecik güneyde Ege Bölgesi'nden\nKütahya, Manisa ve İzmir ile ayrılır. Sakarya ve Bilecik doğuda Karadeniz Bölgesi'ne, Bilecik\nayrıca güneydoğuda İç Anadolu Bölgesi'nden [Eskişehir](/v2/turkiye/eskisehir) ile\nkomşudur. Bölgenin Akdeniz, Doğu Anadolu ve Güneydoğu Anadolu bölgeleriyle kara sınırı yoktur.",
    landformsTr:
      "Bölgenin belirleyici yer şekli bir dağ sırası değil, iki boğazdır. İstanbul Boğazı 17 deniz\nmili, yani yaklaşık 31,5 kilometre uzunluğundadır ve Karadeniz'i Marmara Denizi'ne bağlar.\nÇanakkale Boğazı yaklaşık 61 kilometredir; ortalama derinliği 55 metre, Kilitbahir\naçıklarındaki en derin noktası 103 metredir. İkisi birlikte Marmara Denizi'ni iki açık denize\naçar ve bölgeyi Avrupa ile Asya arasında bir geçiş alanı yapar.\n\nYükseltiler kenarlarda toplanır. Bölgenin en yüksek noktası, [Bursa](/v2/turkiye/bursa)\nsınırlarındaki 2.543 metrelik Uludağ'dır; dağın kuzey yamaçlarındaki sirk vadileri ve sirk\ngölleri, Türkiye'de buzul döneminin izlerinin görüldüğü ilk yerler arasındadır. Trakya'nın\nkuzeyinde Yıldız Dağları Bulgaristan sınırı boyunca uzanır ve 1.031 metrelik Mahya Tepesi ile\nKırklareli'nin en yüksek noktasını verir. Güneybatıda Kaz Dağı, Çanakkale ile Balıkesir\nsınırında ormanlık bir kütle olarak yükselir.\n\nBu iki kuşağın arasında kalan alan büyük ölçüde platodur. İstanbul'un neredeyse tamamı,\naşınım yüzeyleri üzerinde gelişmiş Kocaeli Platosu'nun bir parçası üzerine kuruludur; ilin en\nyüksek noktası olan Aydos Dağı 538 metrededir. Trakya'nın iç kesiminde ise Ergene Ovası,\nayçiçeği, çeltik ve tahıl tarımına elverişli alüvyonlu bir düzlük olarak uzanır.\n\nBölgeyi doğu-batı yönünde Kuzey Anadolu Fayı keser. Fay, Marmara Denizi'nden Şarköy-Gaziköy\nkesiminde karaya çıkar ve Tekirdağ'ın omurgasını oluşturan Tekir Dağları'nı, 945 metrelik\nGanos (Işıklar) Dağı üzerinden izler.",
    climateAndVegetationTr:
      "Marmara tek bir iklime sahip değildir ve bu, bölgeyi tanımlayan özelliklerden biridir. MEB\ncoğrafya müfredatının iklim adlarıyla bakıldığında bölgenin on bir ili **üç ayrı** adla\nanılır. Yedi il Marmara geçiş iklimi taşır. Edirne ve Kırklareli'de Trakya karasal iklimi,\nKocaeli ve Sakarya'da ise Karadeniz iklimi görülür.\n\nKöppen sınıflandırması da aynı ayrımı başka bir eksende gösterir: dokuz il `Csa`, Kocaeli ile\nSakarya `Cfa` sınıfındadır. Aradaki fark yaz kuraklığındadır. `Csa` yazı kurak geçen bir\nAkdeniz tipini, `Cfa` ise her mevsimi yağışlı bir tipi tanımlar.\n\nBitki örtüsü bölgenin geçiş karakterini yineler. MEB coğrafya müfredatı Türkiye'yi bitki\nörtüsüne göre beş kuşağa ayırır: ormanlar, makiler, bozkırlar, antropojen step ve fundalıklar,\ndağ çayırları. Marmara bu kuşaklardan birine tek başına girmez.\n\nAyrım yamacın hangi yöne baktığında düğümlenir. Bölgenin güneye bakan yüzlerinde maki\ngörülür; kuzey eteklerde ise yerini psödomakiye, yani yalancı makiye bırakır. Maki burada\nTürkiye'deki en alçak üst sınırına iner: Akdeniz kıyılarında 700-800 metreye, Ege kıyılarında\n400-600 metreye çıkan topluluk, Marmara kıyılarında 300-400 metreyi geçmez.\n\nMaki bir ilk örtü değildir. Eskiden ormanlık olan alanların yangınla ya da insan eliyle yok\nedilmesinden sonra yerleşen ikincil bir topluluktur.\n\nDers kitabı adı ile Köppen kodu illerin çoğunda örtüşmez; ikisi farklı ölçütlerle kurulmuş iki\nayrı sınıflandırmadır.",
    hydrographyTr:
      "Bölgenin en büyük gölü, [Bursa](/v2/turkiye/bursa) sınırlarındaki İznik Gölü'dür. 298\nkilometrekarelik yüzölçümüyle Türkiye'nin doğal gölleri arasında beşinci sıradadır; tektonik\nkökenli bir çöküntü gölü olan gölün en derin noktası 65 metreye ulaşır. Aynı ilin batısındaki\nUluabat Gölü ise sığdır, derinliği 2-4 metreyi geçmez ve tümüyle koruma altındaki bir sulak\nalandır.\n\nTrakya'nın su ağını üç nehir kurar. Meriç Nehri Bulgaristan'daki Rila Dağı eteklerinden doğar,\nEdirne'de Türkiye-Yunanistan sınırını 185 kilometre boyunca çizer ve Enez yakınlarında Ege\nDenizi'ne dökülür. Tunca Nehri Bulgaristan'dan gelir ve Edirne'nin kent merkezinde Meriç'e\nkatılır. Ergene Nehri ise Bulgaristan'dan değil, Tekirdağ'ın Saray ilçesi çevresinden doğar;\naşağı havzasındaki sanayi ve yerleşim kirliliği nedeniyle 2011'den bu yana bir devlet eylem\nplanı kapsamındadır.\n\nDoğu kanatta Sakarya Nehri bölgeye [Bilecik](/v2/turkiye/bilecik) üzerinden girer ve\n[Sakarya](/v2/turkiye/sakarya)'da Karadeniz'e ulaşır. İki ilin paylaştığı ikinci su varlığı\nSapanca Gölü'dür; göl Kocaeli ile Sakarya sınırında yer alır.\n\nİstanbul'un içme suyu, İSKİ tarafından işletilen on barajdan karşılanır ve bu barajların\ntoplam aktif biriktirme hacmi yaklaşık 868 milyon metreküptür. Bursa'nın içme suyu ihtiyacının\nyaklaşık %85'i ise Doğancı ve Nilüfer barajlarından gelir.",
    settlementAndPopulationTr:
      "Marmara, Türkiye'nin en kalabalık ve en yoğun bölgesidir. On bir ilde 26.711.525 kişi yaşar\nve bu, ülke nüfusunun %31,03'üne karşılık gelir. Kilometrekareye 368 kişi düşer; Türkiye\nortalaması 110 kişidir.\n\nBölge içindeki dağılım son derece dengesizdir. [İstanbul](/v2/turkiye/istanbul) tek başına\n15.754.053 kişiyle bölge nüfusunun yarısından fazlasını taşır. En küçük il olan Bilecik'in\nnüfusu 228.995'tir, yani aradaki fark yaklaşık 69 kattır. Yüzölçümünde sıralama tersine döner:\nen geniş il 14.583 kilometrekareyle Balıkesir, en küçüğü 798 kilometrekareyle Yalova'dır.\n\nBölge göç alır. 2024 iç göç verilerinde Türkiye'nin en yüksek net göç hızına sahip iki ili de\nMarmara'dadır: [Yalova](/v2/turkiye/yalova) binde +15,59 ile birinci, Tekirdağ binde +13,09\nile ikinci sıradadır.\n\nŞehirleşme oranında dikkat edilmesi gereken bir tanım farkı vardır. On bir ilin altısı\nbüyükşehir statüsündedir ve büyükşehirlerde belde ile köylerin idari tüzel kişiliği 6360\nsayılı Kanun'la kaldırıldığı için TÜİK il/ilçe merkezi nüfus oranı %100 görünür. İdari bir\ntanımdan doğan bu oran, fiilî kentleşme düzeyini ölçmez.",
    economyTr:
      "Marmara, Türkiye ekonomisinde nüfus payından da büyük bir yer tutar. On bir ilin gayrisafi\nyurt içi hasıladan aldığı paylar toplandığında bölge, ülke hasılasının yaklaşık %43'ünü\nüretir. Bu, %31,03'lük nüfus payının belirgin biçimde üzerindedir.\n\nAğırlık birkaç ilde toplanır. İstanbul tek başına %29,2 pay alır; onu %3,8 ile Bursa ve yine\n%3,8 ile [Kocaeli](/v2/turkiye/kocaeli) izler. Trakya kanadında Tekirdağ %1,6 ile öne çıkar.\nKalan yedi ilin her birinin payı %1,3'ün altındadır.\n\nSanayi ve ticaretin yoğunlaşması doğrudan boğaz ve liman coğrafyasına dayanır. İki kıtayı\nbağlayan boğazlar ile korunaklı Marmara Denizi kıyısı, deniz ulaşımı ve transit ticaret\naltyapısı sunarak İstanbul ile Kocaeli kıyılarında imalat sanayisini ve hizmet sektörünü\ntoplar. İzmit Körfezi kıyısındaki liman tesisleri bu yapının ana çıkış kapısıdır.\n\nTarımsal faaliyet yer şekillerine göre çeşitlenir. Trakya'nın iç kesimindeki Ergene Havzası,\ngeniş alüvyon tabanıyla ayçiçeği, çeltik ve buğday tarımına ayrılır; Edirne'de Meriç ve Tunca\nvadileri çeltik tarlalarını sular. Güney Marmara'da Bursa ve Balıkesir ovaları sebzecilik ve\nmeyvecilikte öne çıkarken, Tekirdağ'ın Şarköy yamaçları ile Çanakkale kıyılarında bağcılık ve\nzeytincilik yapılır. İki boğaz ile Marmara Denizi ayrıca göçmen balık geçişi sunarak kıyı\nbalıkçılığına imkân tanır.",
    subregionsTr:
      "Türkiye'nin yedi coğrafi bölgesi, 1941'de Ankara'da toplanan Birinci Coğrafya Kongresi'nde\nbelirlendi ve aynı toplantıda yirmi bir bölüme ayrıldı. Marmara Bölgesi bunların dördünü\ntaşır: Yıldız Dağları Bölümü, Ergene Bölümü, Çatalca-Kocaeli Bölümü ve Güney Marmara Bölümü.\n\nYıldız Dağları Bölümü, Trakya'nın kuzeyinde Bulgaristan sınırı boyunca uzanan ormanlık\nyükseltiyi kapsar. Ergene Bölümü, bu yükseltinin güneyindeki alüvyonlu tarım düzlüğüdür.\nÇatalca-Kocaeli Bölümü boğazın iki yakasındaki plato kuşağını içine alır; İstanbul\njeomorfolojik olarak bu bölümde yer alır. Güney Marmara Bölümü ise denizin güneyinde kalan,\nUludağ'dan Biga Yarımadası'na uzanan çeşitli araziyi kapsar.\n\nBölüm sınırları il sınırlarıyla çakışmaz. Bu yüzden bu sayfada hangi ilin hangi bölümde\nolduğuna dair bir liste verilmez; bölümler kapsadıkları arazi üzerinden tanımlanır.",
    disasterAndEarthquakeTr:
      "Kuzey Anadolu Fayı'nın kuzey kolu Marmara Denizi'ni boydan boya geçer ve bölgenin deprem\ntarihini belirler. Fay, Şarköy-Gaziköy kesiminde karaya çıkar.\n\nBölgenin yakın tarihinde üç yıkıcı deprem öne çıkar. 28 Şubat 1855'te merkez üssü\nMustafakemalpaşa yakınlarında olan ve büyüklüğü yaklaşık 7,0 olarak kaydedilen deprem\nyaklaşık 300 kişinin ölümüne yol açtı. Altı hafta sonra, 11 Nisan 1855'te Gemlik-Mudanya\nyakınlarında 6,7 büyüklüğünde ikinci bir deprem yaklaşık 1.300 kişinin daha ölümüne neden\noldu. 9 Ağustos 1912'de ise merkez üssü Mürefte olan, büyüklüğü akademik kaynaklara göre 7,4\nolan bir deprem Trakya kıyısını vurdu.\n\nRisk bölge içinde eşit dağılmaz. Fayın karaya çıktığı Tekirdağ kıyısı ile Marmara Denizi'ne\nbakan güney kıyı en yüksek yer ivmesi değerlerini taşırken, Trakya'nın kuzeyi belirgin biçimde\ndaha düşük değerlerdedir.",
    comparisonTr:
      "Marmara nüfusta ve yoğunlukta birinci, yüzölçümünde ise yedi bölgenin en küçüğüdür. Alanın\nonda birinden azında ülke nüfusunun neredeyse üçte biri yaşar; bölgeyi diğer altısından ayıran\ntek sayı budur.\n\n| Bölge | İl | Nüfus | Nüfus payı | Yüzölçümü (km²) | Yoğunluk |\n|---|---|---|---|---|---|\n| **Marmara** | **11** | **26.711.525** | **%31,03** | **72.666** | **368** |\n| [İç Anadolu](/v2/turkiye/bolge/ic-anadolu) | 13 | 13.809.574 | %16,04 | 187.227 | 74 |\n| [Akdeniz](/v2/turkiye/bolge/akdeniz) | 8 | 11.028.175 | %12,81 | 89.516 | 123 |\n| [Ege](/v2/turkiye/bolge/ege) | 8 | 11.011.261 | %12,79 | 89.339 | 123 |\n| [Güneydoğu Anadolu](/v2/turkiye/bolge/guneydogu-anadolu) | 9 | 9.587.992 | %11,14 | 75.947 | 126 |\n| [Karadeniz](/v2/turkiye/bolge/karadeniz) | 18 | 8.041.038 | %9,34 | 116.379 | 69 |\n| [Doğu Anadolu](/v2/turkiye/bolge/dogu-anadolu) | 14 | 5.902.603 | %6,86 | 148.966 | 40 |\n\n*Nüfus TÜİK ADNKS, 31 Aralık 2025; yüzölçümü Harita Genel Müdürlüğü. Değerler her bölgedeki\nillerin toplamıdır. Paylar 86.092.168 kişilik ve 780.040 km²'lik 81 il toplamı üzerinden\nhesaplanmıştır.*",
    faqs: [
      {
        question: "Marmara Bölgesi'nde kaç il var?",
        answer:
          "Marmara Bölgesi'nde 11 il bulunur: Balıkesir, Bilecik, Bursa, Çanakkale, Edirne, İstanbul, Kırklareli, Kocaeli, Sakarya, Tekirdağ ve Yalova.",
      },
      {
        question: "Marmara Bölgesi'nin nüfusu ne kadar?",
        answer:
          "On bir ilin 31 Aralık 2025 itibarıyla toplam nüfusu 26.711.525 kişidir. Bu, Türkiye nüfusunun %31,03'üne karşılık gelir.",
      },
      {
        question: 'Marmara Bölgesi kaç bölüme ayrılır?',
        answer:
          "Dört bölüme ayrılır: Yıldız Dağları, Ergene, Çatalca-Kocaeli ve Güney Marmara. Bu ayrım 1941'de toplanan Birinci Coğrafya Kongresi'nde yapılmıştır.",
      },
      {
        question: "Marmara Bölgesi'nin en yüksek noktası neresidir?",
        answer: "Bursa sınırlarındaki 2.543 metrelik Uludağ'dır.",
      },
      {
        question: 'Marmara Bölgesi hangi denizlere kıyıdır?',
        answer:
          'Üç denize kıyısı vardır: kuzeyde Karadeniz, ortada Marmara Denizi, güneybatıda Ege Denizi.',
      },
      {
        question: "Marmara Bölgesi'nde hangi iklim tipleri görülür?",
        answer:
          "MEB coğrafya müfredatının adlarıyla üç tip görülür. Yedi ilde Marmara geçiş iklimi, Edirne ile Kırklareli'de Trakya karasal iklimi, Kocaeli ile Sakarya'da Karadeniz iklimi.",
      },
    ],
    sourcesNoteTr:
      'Sayfanın altında `V2SourcesSection scope="turkiye"` bileşeni kullanılır; TÜİK ADNKS, HGM, MGM,\nERA5-Land, AFAD, ACAG ve OpenStreetMap satırlarını zaten taşıyor.\n\nBu sayfaya özgü olarak iki satır eklenir:\n\nBölge toplamları, bölgedeki illerin tek tek değerlerinin toplanmasıyla elde edilmiştir. TÜİK\nbölgesel istatistiklerini İBBS Düzey-1 sınıflandırmasına göre yayımlar; o sınıflandırma 12\nbölgeden oluşur ve buradaki yedili coğrafi bölge ayrımından ayrıdır.\n\nCoğrafi bölge ve bölüm ayrımı: Birinci Coğrafya Kongresi, 6-21 Haziran 1941, Raporlar,\nMüzakereler, Kararlar. T.C. Maarif Vekilliği.',
    footnotes: [
      'Nüfus ve yüzölçümü değerleri, bölgedeki 11 ilin tek tek değerlerinin toplamıdır. TÜİK bölgesel istatistiklerini İBBS Düzey-1 sınıflandırmasına göre yayımlar; o sınıflandırma 12 bölgeden oluşur ve buradaki yedili coğrafi bölge ayrımından ayrıdır.',
      "Alan payı, 81 ilin yüzölçümü toplamı olan 780.040 km² üzerinden hesaplanmıştır. Türkiye'nin resmî izdüşüm alanı 783.562 km²'dir.",
    ],
  },
  {
    region: GeographicRegion.Ege,
    slug: 'ege',
    nameTr: 'Ege Bölgesi',
    headingName: 'Ege',
    metaTitle: "Ege Bölgesi'nin İlleri, İklimi ve Bölümleri",
    metaDescription:
      "Denizli'deki 2.571 metrelik Honaz Dağı, Ege Bölgesi'nin en yüksek noktasıdır. Sekiz ilin nüfusu, kıyıya dik graben ovaları, iklim tipleri ve iki coğrafi bölümü.",
    h1: 'Ege Bölgesi',
    introTr:
      "Ege Bölgesi, Türkiye'nin batısında, Ege Denizi kıyısından İç Anadolu eşiğine kadar uzanır. Sekiz ilinde 11 milyon kişi yaşar. Bölgeyi tanımlayan yer şekli, kıyıya dik uzanan dağ sıralarıyla aralarındaki çöküntü ovalarının oluşturduğu düzendir; bu düzen hem tarım alanlarını hem deprem kuşaklarını aynı hatlar üzerinde toplar.",
    highestPointName: 'Honaz Dağı',
    highestPointElevationM: 2571,
    highestPointProvince: 'Denizli',
    coastalSeas: ['Ege Denizi'],
    neighborRegions: ['Marmara', 'İç Anadolu', 'Akdeniz'],
    neighborCountries: [],
    subregions: ['Ege Bölümü (Asıl Ege)', 'İç Batı Anadolu Bölümü'],
    gdpShareApproxPercent: 11.9,
    locationAndBordersTr:
      "Ege Bölgesi Türkiye'nin batısında yer alır ve batıda Ege Denizi kıyısıyla sonlanır. Kıyı\nşeridi yarımadalar ve körfezlerle derin biçimde girintilidir; yalnız Muğla'nın kıyısı\nyaklaşık 1.480 kilometreyle Türkiye'nin en uzun il kıyısıdır.\n\nBölgenin komşu bir ülkeyle kara sınırı yoktur.\n\nKara komşuluğu üç bölgeyle kurulur. Kuzeyde İzmir, Manisa ve Kütahya, Marmara Bölgesi'nden\nBalıkesir, Bursa ve Bilecik ile ayrılır. Doğuda Afyonkarahisar ve Kütahya, İç Anadolu\nBölgesi'nden [Eskişehir](/v2/turkiye/eskisehir) ve [Konya](/v2/turkiye/konya) ile komşudur.\nGüneyde Muğla, Denizli ve Afyonkarahisar, Akdeniz Bölgesi'nden Antalya, Burdur ve Isparta ile\nsınırdaştır.",
    landformsTr:
      "Bölgenin arazisi, birbirine paralel yükselti ve çöküntü şeritlerinin sıralanmasıyla oluşur.\nYükselen bloklar dağ sıralarını, çöken bloklar ise aralarındaki ovaları meydana getirir. Bu\nşeritler kıyıya dik uzandığı için deniz karaya derin körfezler hâlinde girer ve tarım\novaları içeriye doğru koridorlar biçiminde devam eder.\n\nKuzeyden güneye üç büyük çöküntü sıralanır. Bakırçay ovası Bergama ile Dikili arasında yer\nalır. [İzmir](/v2/turkiye/izmir)'in kuzeyinde Yamanlar, doğusunda Nif, güneyinde Bozdağlar\nyükselir ve bunların arasında Gediz ile Küçük Menderes ovaları uzanır. En güneyde, Aydın\nDağları ile Menteşe Dağları arasına sıkışan Büyük Menderes çöküntüsü batıdan doğuya yaklaşık\n140 kilometre gider.\n\nBu yapının hâlâ çalıştığı ölçülmüştür. Uydu tabanlı bir jeoloji çalışması, Gediz çöküntüsünün\ntabanının yılda yaklaşık 26 milimetre çöktüğünü, kuzey kenarındaki Bozdağlar bloğunun ise\nyılda 3 milimetre yükseldiğini saptamıştır.\n\nBölgenin en yüksek noktası, [Denizli](/v2/turkiye/denizli) sınırlarındaki 2.571 metrelik\nHonaz Dağı'dır. İç kesimde yükselti genel olarak artar: Kütahya'nın Murat Dağı 2.312 metreye,\nUşak'ın aynı kütledeki Kartal Tepe zirvesi 2.309 metreye ulaşır. Manisa'nın en yüksek noktası\nBozdağlar üzerindeki 2.070 metrelik Kumpınar Tepe, İzmir'inki ise yine Bozdağlar'daki 2.159\nmetrelik zirvedir.\n\nDenizli'deki Pamukkale, bu tektonik düzenin yarattığı bir yan üründür. Yer altından yükselen\nve sıcaklığı 35 santigrat derecenin üzerinde olan kalsiyum bikarbonatlı su, yüzeyde\nkarbondioksit kaybederek kalsiyum karbonatı çökeltir ve basamaklı beyaz teraslar oluşturur.\nAlan 1.077 hektarı kaplar ve Orta Pleyistosen'den bu yana biçimlenmektedir.",
    climateAndVegetationTr:
      "Bölge kıyıdan iç kesime doğru belirgin biçimde değişir. MEB coğrafya müfredatının iklim\nadlarıyla bakıldığında sekiz il üç ayrı adla anılır: beş ilde Akdeniz iklimi, Afyonkarahisar\nile Kütahya'da İç Anadolu karasal iklimi, Denizli'de Göller Yöresi geçiş iklimi.\n\nKöppen sınıflandırması aynı ayrımı başka bir eksende verir. Altı il `Csa`, Afyonkarahisar\n`Cfa`, Kütahya `Csb` sınıfındadır.\n\nSayısal aralık bu ayrımı doğrular. Bölgedeki illerin 1991-2020 dönemi yıllık ortalama\nsıcaklığı 10,0 ile 17,9 santigrat derece arasındadır; en düşük değer Kütahya'da, en yüksek\ndeğer Aydın'dadır. Yıllık toplam yağış 457 milimetre ile 1.041 milimetre arasında değişir.\nEn kurak il Denizli, en yağışlı il Muğla'dır. İl merkezlerinin rakımı da aynı yönde ayrışır:\nİzmir 29 metrede, Afyonkarahisar 1.034 metrededir.\n\nBitki örtüsü bu ayrımı yerde görünür kılar. MEB coğrafya müfredatı Türkiye'yi bitki örtüsüne\ngöre beş kuşağa ayırır: ormanlar, makiler, bozkırlar, antropojen step ve fundalıklar, dağ\nçayırları. Ege'nin kıyı kuşağı bunlardan maki alanına girer.\n\nMakinin nerede bittiği bölgeden bölgeye değişir ve Ege'yi komşularından ayıran sayı budur.\nAkdeniz kıyılarında 700-800 metreye kadar çıkan maki, Ege kıyılarında 400-600 metrede kalır;\nMarmara kıyılarında ise 300-400 metreyi geçmez. Kıyıdan bu yükseltiye kadar olan kesimde\ntipik Akdeniz makisi yaygındır. Topluluk vadiler boyunca iç kesimlere de sokulur ve bölgenin\nçöküntü ovaları kıyıdan içeriye doğru uzanan vadiler açar.\n\nMaki bir ilk örtü değildir. Eskiden ormanlık olan alanların yangınla ya da insan eliyle yok\nedilmesinden sonra yerleşen ikincil bir topluluktur. Maki de tahrip edilirse yerini garig\nalır: kireçli topraklar üzerinde yetişen, cılız ve bodur kalan bir çalı topluluğu.\n\nDers kitabı adı ile Köppen kodu illerin çoğunda örtüşmez; ikisi farklı ölçütlerle kurulmuş\niki ayrı sınıflandırmadır.",
    hydrographyTr:
      "Bölgenin akarsuları çöküntü ovalarını izler ve batıya, Ege Denizi'ne akar. En büyüğü Büyük\nMenderes Nehri'dir; Afyonkarahisar'ın Dinar ilçesindeki Suçıkan kaynağından doğar,\n[Uşak](/v2/turkiye/usak) ve Denizli'den geçer, Aydın'da Nazilli, Aydın ve Söke ovalarını\nsular ve antik Milet kalıntılarına yakın bir noktadan denize ulaşır. Nehrin Aydın\ntopraklarındaki kıvrımlı akışı, İngilizcedeki \"meander\" sözcüğünün kaynağıdır.\n\nİkinci sırada Gediz Nehri gelir. Toplam 386 kilometrelik uzunluğunun 204 kilometresi\n[Manisa](/v2/turkiye/manisa) sınırları içindedir; nehir Salihli ve Turgutlu ovalarını\nsuladıktan sonra İzmir'in Menemen ilçesi yakınlarında Türkiye'nin dördüncü büyük deltasını\noluşturur. Delta 1998'de Ramsar Sözleşmesi kapsamına alınmıştır. Küçük Menderes Selçuk\nyakınlarında, Bakırçay ise Bergama ile Dikili arasında kendi ağzını açar.\n\nİç kesimde su ağı farklı çalışır. Uşak'ın Banaz Çayı, Murat Dağı'ndan doğar ve 165 kilometre\naktıktan sonra Büyük Menderes'e katılır. Kütahya'nın Simav Çayı ise kuzeye yönelir ve\nMarmara Denizi'ne dökülen akarsular arasında en büyüğüdür. Aynı ilden doğan Porsuk Çayı'nın\nkolları [Eskişehir](/v2/turkiye/eskisehir)'e geçer.\n\nAfyonkarahisar bu tablonun dışında durur. Afyon Ovası dışarıya su akışı olmayan kapalı bir\nhavzadır; Akarçay ovayı kateder ve Eber Gölü'ne dökülür. 150 kilometrekarelik yüzölçümüyle\nEber, Türkiye'nin on ikinci büyük gölüdür.\n\nBölgenin doğal gölleri küçük ama çeşitlidir. Bafa Gölü, Büyük Menderes'in taşıdığı alüvyonun\neski bir koyu denizden ayırmasıyla oluşmuştur; yaklaşık 60 kilometrekarelik yüzeyinin büyük\nbölümü Aydın'ın Söke ilçesinde, doğu kıyıları [Muğla](/v2/turkiye/mugla)'nın Milas ilçesinde\nkalır. Muğla'nın Köyceğiz Gölü dar bir kanalla denize bağlı bir haliç gölüdür. Manisa'nın\nMarmara Gölü ile Denizli'nin Işıklı Gölü sulak alan statüsündedir.",
    settlementAndPopulationTr:
      "Bölgede 11.011.261 kişi yaşar ve bu, ülke nüfusunun %12,79'una karşılık gelir.\nKilometrekareye 123 kişi düşer; Türkiye ortalaması 110 kişidir.\n\nNüfus kıyıda ve büyük ovalarda toplanır. [İzmir](/v2/turkiye/izmir) 4.504.185 kişiyle bölge\nnüfusunun yaklaşık %41'ini taşır ve Türkiye'nin üçüncü büyük ilidir. En küçük il Uşak\n374.405 kişidir. Yüzölçümünde sıralama değişir: en geniş il 14.016 kilometrekareyle\nAfyonkarahisar, en küçüğü 5.555 kilometrekareyle yine Uşak'tır.\n\nŞehirleşme oranı iki gruba ayrılır. Beş il büyükşehir statüsündedir ve büyükşehirlerde belde\nile köylerin idari tüzel kişiliği 6360 sayılı Kanun'la kaldırıldığı için TÜİK il/ilçe merkezi\nnüfus oranı %100 görünür. İdari bir tanımdan doğan bu oran, fiilî kentleşme düzeyini ölçmez.\nKalan üç ilde oran gerçek bir hesaptır: Afyonkarahisar %62,2, Kütahya %74,6, Uşak %77,1.\n\nGöç, bölgeyi aynı hat boyunca ikiye böler. 2024 net göç hızı, kıyıya açılan beş ilde\npozitiftir: [Muğla](/v2/turkiye/mugla) binde +11,64 ile başı çeker, ardından Aydın binde\n+4,31 ve İzmir binde +3,53 gelir. İç kesimdeki üç il ise göç verir: Afyonkarahisar binde\n-5,63, Kütahya binde -3,74, Uşak binde -2,22. Bölünme, şehirleşme oranındaki bölünmeyle\nbirebir aynı üç ili ayırır.",
    economyTr:
      "Bölgenin sekiz ili, Türkiye gayrisafi yurt içi hasılasının yaklaşık %11,9'unu üretir. Bu\ndeğer, bölgenin %12,79'luk nüfus payının biraz altındadır.\n\nAğırlık tek ilde toplanır. İzmir tek başına %5,7 pay alır, yani bölge toplamının neredeyse\nyarısı. Onu %1,5 ile Manisa ve %1,3 ile Muğla izler. İç kesimdeki üç ilin payı toplamda\n%1,4'te kalır.\n\nTarımsal üretim, doğu-batı uzantılı çöküntü ovalarının verimli alüvyon tabanı ile ılıman\nAkdeniz ikliminin birleştiği alanlarda toplanır. Gediz, Bakırçay, Küçük Menderes ve Büyük\nMenderes havzalarında zeytin, incir, bağcılık ve pamuk tarımı bölgenin ayırt edici niteliğidir.\nDağların kıyıya dik uzanması Akdeniz etkisini vadiler boyunca içeriye taşır ve bu ürünlerin\niç kısımlara kadar yayılmasını sağlar.\n\nYeraltı zenginlikleri ve enerji kaynakları da arazinin tektonik yapısıyla bağlantılıdır.\nÇöküntü havzalarında linyit yatakları yer alır; Manisa'nın Soma ve Muğla'nın Yatağan\nhavzaları linyit çıkarımı ve termik santrallerle öne çıkar. Fay hatları boyunca yüzeye çıkan\nsıcak su kaynakları ise Denizli ve Aydın çevresinde jeotermal enerji üretimine ve seracılığa\nimkân tanır. Kıyı şeridinin girintili yapısı, koyları ve antik kent kalıntıları bölgeyi kıyı ve\nkültür turizminin merkezlerinden biri yapar.",
    subregionsTr:
      "Türkiye'nin yedi coğrafi bölgesi 1941'de Ankara'da toplanan Birinci Coğrafya Kongresi'nde\nbelirlendi ve aynı toplantıda yirmi bir bölüme ayrıldı. Ege Bölgesi bunların ikisini taşır:\nEge Bölümü ve İç Batı Anadolu Bölümü.\n\nEge Bölümü kıyı kuşağını ve ona açılan çöküntü ovalarını kapsar. Edremit, Bakırçay, Gediz,\nİzmir, Küçük Menderes, Büyük Menderes ve Menteşe yöreleri bu bölümün içinde yer alır. İç\nBatı Anadolu Bölümü ise doğudaki yüksek plato kuşağını kapsar; ortalama yükseltisi 1.000\nmetrenin üzerindedir ve iklimi kıyıdan belirgin biçimde ayrılır.\n\nBölüm sınırları il sınırlarıyla çakışmaz. Bu sayfada hangi ilin hangi bölümde olduğuna dair\nbir liste verilmez; bölümler kapsadıkları arazi üzerinden tanımlanır.",
    disasterAndEarthquakeTr:
      "Bölgenin deprem riski doğrudan arazi yapısından doğar. Yükselen blokları çöküntülerden ayıran\nhatlar birer fay hattıdır; ovaların kenarları bu yüzden bölgenin en hareketli kuşaklarıdır.\n\nYakın tarihli iki olay bu düzeni gösterir. 30 Ekim 2020'de merkez üssü Sisam açıkları olan\ndepremin büyüklüğü Kandilli Rasathanesi'ne göre 6,9, AFAD'a göre 6,6 olarak verildi. En ağır\nhasar, merkez üssüne 70 kilometre uzaklıktaki İzmir'in Bayraklı ilçesinde görüldü; yani hasar\nmerkez üssünün değil, zeminin belirlediği bir dağılım izledi. Manisa'da ise 1969 Alaşehir\ndepreminden bu yana yüzeyde çatlak ve çökme izleri oluşmayı sürdürüyor.",
    comparisonTr:
      "Ege ile Akdeniz, yedi bölge arasında birbirine en çok benzeyen ikilidir. Nüfusları arasında\n16.914 kişi, yüzölçümleri arasında 177 kilometrekare fark vardır; nüfus yoğunlukları ise\naynıdır.\n\n| Bölge | İl | Nüfus | Nüfus payı | Yüzölçümü (km²) | Yoğunluk |\n|---|---|---|---|---|---|\n| Marmara | 11 | 26.711.525 | %31,03 | 72.666 | 368 |\n| [İç Anadolu](/v2/turkiye/bolge/ic-anadolu) | 13 | 13.809.574 | %16,04 | 187.227 | 74 |\n| [Akdeniz](/v2/turkiye/bolge/akdeniz) | 8 | 11.028.175 | %12,81 | 89.516 | 123 |\n| **Ege** | **8** | **11.011.261** | **%12,79** | **89.339** | **123** |\n| [Güneydoğu Anadolu](/v2/turkiye/bolge/guneydogu-anadolu) | 9 | 9.587.992 | %11,14 | 75.947 | 126 |\n| [Karadeniz](/v2/turkiye/bolge/karadeniz) | 18 | 8.041.038 | %9,34 | 116.379 | 69 |\n| [Doğu Anadolu](/v2/turkiye/bolge/dogu-anadolu) | 14 | 5.902.603 | %6,86 | 148.966 | 40 |\n\n*Nüfus TÜİK ADNKS, 31 Aralık 2025; yüzölçümü Harita Genel Müdürlüğü. Değerler her bölgedeki\nillerin toplamıdır. Paylar 86.092.168 kişilik ve 780.040 km²'lik 81 il toplamı üzerinden\nhesaplanmıştır.*",
    faqs: [
      {
        question: "Ege Bölgesi'nde kaç il var?",
        answer:
          'Sekiz il bulunur: Afyonkarahisar, Aydın, Denizli, İzmir, Kütahya, Manisa, Muğla ve Uşak.',
      },
      {
        question: "Ege Bölgesi'nin nüfusu ne kadar?",
        answer:
          "Sekiz ilin 31 Aralık 2025 itibarıyla toplam nüfusu 11.011.261 kişidir. Bu, Türkiye nüfusunun %12,79'una karşılık gelir.",
      },
      {
        question: 'Ege Bölgesi kaç bölüme ayrılır?',
        answer:
          "İki bölüme ayrılır: Ege Bölümü ve İç Batı Anadolu Bölümü. Bu ayrım 1941'de toplanan Birinci Coğrafya Kongresi'nde yapılmıştır.",
      },
      {
        question: "Ege Bölgesi'nin en yüksek noktası neresidir?",
        answer: "Denizli sınırlarındaki 2.571 metrelik Honaz Dağı'dır.",
      },
      {
        question: "Ege Bölgesi'nde hangi iklim tipleri görülür?",
        answer:
          "MEB coğrafya müfredatının adlarıyla üç tip görülür. Beş ilde Akdeniz iklimi, Afyonkarahisar ile Kütahya'da İç Anadolu karasal iklimi, Denizli'de Göller Yöresi geçiş iklimi.",
      },
      {
        question: "Ege Bölgesi'nin en büyük akarsuyu hangisidir?",
        answer: "Büyük Menderes Nehri'dir. Onu Gediz Nehri izler.",
      },
    ],
    sourcesNoteTr:
      '`V2SourcesSection scope="turkiye"` bileşeni (TÜİK ADNKS, HGM, MGM, ERA5-Land, AFAD, ACAG,\nOpenStreetMap) artı bu sayfaya özgü iki satır:\n\n*Bölge toplamları, bölgedeki illerin tek tek değerlerinin toplanmasıyla elde edilmiştir.*\n\n*Coğrafi bölge ve bölüm ayrımı: Birinci Coğrafya Kongresi, 6-21 Haziran 1941, Raporlar,\nMüzakereler, Kararlar. T.C. Maarif Vekilliği.*',
    footnotes: [
      'Nüfus ve yüzölçümü değerleri, bölgedeki illerin tek tek değerlerinin toplamıdır. TÜİK bölgesel istatistiklerini İBBS Düzey-1 sınıflandırmasına göre yayımlar; o sınıflandırma 12 bölgeden oluşur ve buradaki yedili coğrafi bölge ayrımından ayrıdır. Alan payı, 81 ilin yüzölçümü toplamı olan 780.040 km² üzerinden hesaplanmıştır.',
    ],
  },
  {
    region: GeographicRegion.Akdeniz,
    slug: 'akdeniz',
    nameTr: 'Akdeniz Bölgesi',
    headingName: 'Akdeniz',
    metaTitle: 'Akdeniz Bölgesi: Toroslar, Kıyı Ovaları ve 8 İl',
    metaDescription:
      "Akdeniz Bölgesi'nin 8 ilinde 11 milyon kişi yaşar ve sekizinin de Köppen sınıfı Csa'dır. Toroslar, karstik arazi, akarsular ve bölgenin iki coğrafi bölümü.",
    h1: 'Akdeniz Bölgesi',
    introTr:
      "Akdeniz Bölgesi, Türkiye'nin güneyinde, Toros Dağları ile denizin arasına sıkışan dar bir kuşaktan ve onun ardındaki yüksek iç kesimden oluşur. Sekiz ilinde 11 milyon kişi yaşar. Dağların çoğu yerde kıyıya paralel uzanması, bölgenin hem tarımını hem yerleşme düzenini tek bir kurala bağlar: düzlük neredeyse yalnız akarsu ağızlarında bulunur.",
    highestPointName: 'Medetsiz Tepesi',
    highestPointElevationM: 3524,
    highestPointProvince: 'Mersin',
    coastalSeas: ['Akdeniz'],
    neighborRegions: ['Ege', 'İç Anadolu', 'Güneydoğu Anadolu', 'Doğu Anadolu'],
    neighborCountries: ['Suriye'],
    subregions: ['Antalya Bölümü', 'Adana Bölümü'],
    gdpShareApproxPercent: 10.9,
    locationAndBordersTr:
      "Akdeniz Bölgesi Türkiye'nin güneyinde yer alır ve güneyde Akdeniz kıyısıyla sonlanır. Kıyı\nşeridi batıda Muğla sınırından doğuda Hatay'a kadar uzanır; yalnız Mersin'in kıyısı 321\nkilometredir.\n\nBölgenin bir komşu ülkeyle kara sınırı vardır. [Hatay](/v2/turkiye/hatay), Akdeniz kıyısının\nTürkiye sınırları içindeki en güneydoğu ucunda yer alır ve güneyden Suriye topraklarıyla\nkomşudur.\n\nKara komşuluğu dört bölgeyle kurulur ve bu, yedi bölge içindeki en geniş komşuluktur. Batıda\nAntalya, Burdur ve Isparta, Ege Bölgesi'nden Muğla, Denizli ve Afyonkarahisar ile ayrılır.\nKuzeyde Antalya, Isparta, Mersin, Adana ve Kahramanmaraş, İç Anadolu Bölgesi'nden Konya,\nKaraman, Niğde, Kayseri ve Sivas ile sınırdaştır. Doğuda Hatay, Osmaniye ve Kahramanmaraş,\nGüneydoğu Anadolu Bölgesi'nden Gaziantep ve Adıyaman ile komşudur. Kahramanmaraş ayrıca\nkuzeydoğuda Doğu Anadolu Bölgesi'nden [Malatya](/v2/turkiye/malatya) ile sınırdaştır.",
    landformsTr:
      "Bölgenin arazisini tek bir kural belirler: Toros Dağları kıyıya paralel uzanır ve çoğu yerde\ndenize 20-30 kilometre mesafede yükselir. Bunun sonucu, kesintili ve dar bir kıyı ovası\nzinciridir. [Antalya](/v2/turkiye/antalya) bu düzenin en açık örneğidir; ilin düzlüğü Bey\nDağları ile deniz arasına sıkışmış ince bir şerittir. Mersin'de kural daha da keskindir: il\nyüzölçümünün yaklaşık %87'sini dağlar kaplar ve düzlük yalnız il merkezi, Tarsus ve Silifke\nçevresinde gelişir.\n\nKuralın tek büyük istisnası doğuda bulunur. Seyhan, Ceyhan ve Tarsus çaylarının taşıdığı\nalüvyonla dolan Çukurova, [Adana](/v2/turkiye/adana) yüzölçümünün yaklaşık dörtte birini\nkaplar ve Türkiye'nin en geniş ovalarından biridir. Misis Tepeleri ovayı kuzeydeki Yukarı Ova\nile güneydeki asıl Çukurova'ya ayırır. Hatay'da benzer bir düzlük, Amanos Dağları'nın\ndoğusundaki çöküntüde 119.350 hektarlık Amik Ovası olarak uzanır.\n\nAna kaya büyük ölçüde kireçtaşıdır ve bu, bölgeye kendi şekil ailesini kazandırır. Yağmur\nsuyu yüzeyde akmak yerine yer altına sızar; süreç düden, obruk ve polye üretir. Düden, suyun\nyer altına daldığı kuyudur. Obruk, mağara tavanının çökmesiyle oluşan derin çukurdur. Polye\nise geniş bir karstik ovadır. Antalya ile Burdur arasındaki Kestel Polyesi, Elmalı ve Akseki\npolyeleri bunların en büyükleridir. Silifke yakınlarındaki Cennet Obruğu 250'ye 110 metrelik\nağzı ve 70 metrelik derinliğiyle, Cehennem Obruğu ise 128 metreye inen dikey duvarlarıyla\nayırt edilir.\n\nYükseltiler batıdan doğuya kesintisiz sıralanır. Sekiz ilin kendi zirveleri\nkarşılaştırıldığında en yükseği, Bolkar Dağları üzerindeki 3.524 metrelik Medetsiz\nTepesi'dir. Onu Kahramanmaraş'taki 3.090 metrelik Nurhak Dağı ve Antalya'daki 3.086 metrelik\nKızlarsivrisi izler. Batıda Isparta'yı çevreleyen Anamas kütlesinin 2.992 metrelik Dedegöl\nDağı zirvesi, aynı zamanda Batı Toroslar'ın en yüksek noktasıdır.",
    climateAndVegetationTr:
      "Akdeniz, yedi bölge içinde Köppen sınıflandırmasına göre tek parça olan iki bölgeden biridir.\nSekiz ilin sekizi de `Csa` sınıfındadır; yani yazı kurak ve sıcak, kışı ılık ve yağışlı geçen\nbir tip. Diğeri Güneydoğu Anadolu'dur. Kalan beş bölgenin her birinde en az iki farklı Köppen\nsınıfı bulunur.\n\nMEB coğrafya müfredatının adları ise bir ayrım getirir. Altı ilde Akdeniz iklimi, Isparta ile\nBurdur'da Göller Yöresi geçiş iklimi görülür. Ayrımı yükselti açıklar: iki ilin de il merkezi\nrakımı 950 metrenin üzerindedir, kıyı illerininki ise 100 metrenin altındadır.\n\nSayısal aralık bunu doğrular. Bölgedeki illerin 1991-2020 dönemi yıllık ortalama sıcaklığı\n10,4 ile 18,2 santigrat derece arasındadır; en düşük değer Isparta'da, en yüksek değer\nAdana'dadır. Yıllık toplam yağış 665 milimetre ile 1.215 milimetre arasında değişir. En kurak\nil Kahramanmaraş, en yağışlı il Antalya'dır. İl merkezlerinin rakımı 7 metre ile 997 metre\narasında dağılır.\n\nDers kitabı adı ile Köppen kodu illerin çoğunda örtüşmez; ikisi farklı ölçütlerle kurulmuş\niki ayrı sınıflandırmadır.\n\nBitki örtüsü iklim ve yükselti basamaklarını izler. MEB coğrafya müfredatının beşli bitki\nörtüsü sınıflandırmasında bölgenin kıyı kuşağı makilerle kaplıdır. Akdeniz kıyılarında maki\ntopluluğu 700-800 metreye kadar yükselir ve bu, Türkiye'deki en yüksek maki üst sınırıdır.\nKıyı kuşağının doğal orman örtüsünü kızılçamlar oluşturur; kızılçam ormanlarının tahrip\nedildiği alanlarda maki, makinin tahrip edildiği kireçtaşlı kurak arazilerde ise garig\ntoplulukları gelişir.\n\nToros Dağları'nın daha yüksek yamaçlarında iğne yapraklı orman kuşağı başlar. Kızılçamın\nyerini karaçam, Toros sediri ve köknar toplulukları alır. Dağların en yüksek kesimlerinde ve\nGöller Yöresi'nin iç platolarında ise dağ çayırları ve bozkır alanlarına geçilir.",
    hydrographyTr:
      "Bölgenin su ağı ikiye ayrılır. Doğuda büyük ve düzenli nehirler Çukurova'yı besler; batıda\nkarstik arazi yüzey akışını yer altına çeker.\n\nDoğu kanadın omurgası iki nehirdir. Ceyhan Nehri 509 kilometre uzunluğuyla bölgenin en uzun\nakarsuyudur; [Kahramanmaraş](/v2/turkiye/kahramanmaras)'ta doğar, Osmaniye topraklarının\nyaklaşık 75 kilometrelik bölümünden geçer ve Adana'nın doğusundan denize ulaşır. Seyhan\nNehri, Kayseri'nin Uzunyayla bölgesinde doğar ve son 30 kilometresinde Adana ile\n[Mersin](/v2/turkiye/mersin) sınırını çizer. Adana'nın hemen kuzeyindeki Seyhan Barajı 8\nNisan 1956'da hizmete girmiş, yaklaşık 850 bin dekar araziyi sulayan bir toprak dolgu\nbarajdır.\n\nHatay'ın ana akarsuyu ayrı bir güzergâh izler. Asi Nehri Lübnan'daki Bekaa Vadisi'nde doğar,\nSuriye topraklarından geçer, bir süre Türkiye-Suriye sınırını çizer, sonra yön değiştirip\nTürkiye'ye girer ve Samandağ'da bir delta oluşturarak denize dökülür. Toplam uzunluğu 556\nkilometredir.\n\nBatı kanatta akarsular kısa ve kanyonludur. Manavgat Nehri, Dumanlı kaynağından doğar ve 93\nkilometre boyunca dar kanyonlardan geçer; bölgenin en düzenli akışlı akarsuyudur. Isparta'nın\nSütçüler ilçesi yakınından doğan Köprüçay da aynı arazide akar. Mersin'de Göksu Nehri, 10.000\nkilometrekarelik bir havzayı toplayarak Silifke'nin güneyinde 15.000 hektarlık bir delta\nkurar.\n\nGöller batıda yoğunlaşır ve çoğu karstik kökenlidir. [Isparta](/v2/turkiye/isparta)'daki\nEğirdir Gölü, kaynaklara göre 468 ile 482 kilometrekare arasında değişen yüzölçümüyle\nTürkiye'nin dördüncü büyük gölüdür; en derin noktası 16-17 metre civarındadır.\n[Burdur](/v2/turkiye/burdur) Gölü ise dışa akışı olmayan kapalı bir havza gölüdür ve 842\nmetre rakımdadır. Göl 1970'ten bu yana sürekli küçülüyor: su seviyesi 2015 itibarıyla\nyaklaşık 17 metre gerilemişti, güncel kaynaklara göre bu düşüş bugün 20 metrenin üzerindedir.\nSeviye düşüşü gölün tuzluluğunu da belirgin biçimde artırmıştır.\n\nBölgede kurutulmuş bir göl de vardır. Amik Ovası'nın ortasındaki Amik Gölü, 1954'te başlayıp\n1966-1975 arasında Devlet Su İşleri tarafından yürütülen bir projeyle tamamen kurutulmuştur;\ngöl artık mevcut değildir. Antalya'nın Elmalı ilçesindeki Avlan Gölü ise 1975-1980 arasında\nkurutulmuş, 2001'de kapaklar kapatılarak yeniden su tutmaya başlamıştır.",
    settlementAndPopulationTr:
      "Bölgede 11.028.175 kişi yaşar ve bu, ülke nüfusunun %12,81'ine karşılık gelir.\nKilometrekareye 123 kişi düşer; Türkiye ortalaması 110 kişidir.\n\nNüfus kıyıda ve Çukurova'da toplanır. Antalya 2.777.677 kişiyle bölgenin en kalabalık ili ve\nTürkiye'nin beşinci büyük ilidir; Adana 2.283.609, Mersin 1.956.428 kişidir. En küçük il\nBurdur 277.226 kişidir. Yüzölçümünde sıralama değişmez ölçüde kalır: en geniş il 20.177\nkilometrekareyle Antalya, en küçüğü 3.320 kilometrekareyle Osmaniye'dir.\n\nBölge, ilçe başına düşen nüfusta Marmara'nın ardından ikinci sıradadır. 104 ilçeye 11 milyon\nkişi düşer, yani ilçe başına yaklaşık 106 bin kişi; Türkiye genelinde bu değer 88 bindir.\n\nŞehirleşme oranı iki gruba ayrılır. Beş il büyükşehir statüsündedir ve büyükşehirlerde belde\nile köylerin idari tüzel kişiliği 6360 sayılı Kanun'la kaldırıldığı için TÜİK il/ilçe merkezi\nnüfus oranı %100 görünür. İdari bir tanımdan doğan bu oran, fiilî kentleşme düzeyini ölçmez.\nKalan üç ilde oran gerçek bir hesaptır: Osmaniye %78,2, Isparta %75,8, Burdur %71,0.\n\nGöç, kıyı ile iç kesimi ayırır. 2024 net göç hızı sekiz ilin dördünde pozitiftir: Antalya\nbinde +9,09, Kahramanmaraş binde +6,31, Mersin binde +3,01, Hatay binde +1,51. Dördünde\nnegatiftir: Burdur binde -6,52, Isparta binde -3,31, Osmaniye binde -1,26, Adana binde -0,34.\nAntalya'nın değeri, aynı yıl başkent Ankara'nın binde +8,91'lik oranının da üzerindedir.",
    economyTr:
      "Bölgenin sekiz ili, Türkiye gayrisafi yurt içi hasılasının yaklaşık %10,9'unu üretir. Bu\ndeğer, bölgenin %12,81'lik nüfus payının altındadır.\n\nAğırlık üç ile yayılır. Antalya %3,4, Mersin %2,1 ve Adana %2,0 pay alır; üçü birlikte bölge\ntoplamının yaklaşık yarısıdır. Hatay %1,4 ile dördüncü sıradadır. Batıdaki iki Göller Yöresi\nili Isparta ve Burdur, birlikte %0,7'de kalır.\n\nTarım sektörü arazinin biçimine ve kış ılıklığına göre iki belirgin alana ayrılır. Çukurova,\nAmik Ovası, Silifke ve Antalya kıyı düzlüklerinin verimli alüvyon tabanı, turfanda sebzecilik,\nörtü altı seracılık, narenciye, muz ve pamuk tarımına elverişli bir zemin sunar. Kış\nmevsiminin ılık geçmesi don riskini azaltır ve yıl boyunca birden fazla ürün alınmasını\nsağlar.\n\nDağlık Toros kuşağı ise farklı bir ekonomik faaliyet yürütür. Eğimin yüksek olduğu dağ\nyamaçlarında yaylacılık ve küçükbaş, özellikle kıl keçisi yetiştiriciliği öne çıkar; yaz\naylarında ovalardan yaylalara doğru geleneksel bir hareketlilik yaşanır. Kıyı şeridi,\nkarstik mağaralar, kanyonlar ve korunaklı koylar bölgeyi kıyı turizminin merkezi yapar;\nsanayi ve dış ticaret ise Mersin Limanı ve İskenderun Körfezi kıyısındaki tesislerde yoğunlaşır.",
    subregionsTr:
      "Türkiye'nin yedi coğrafi bölgesi 1941'de Ankara'da toplanan Birinci Coğrafya Kongresi'nde\nbelirlendi ve aynı toplantıda yirmi bir bölüme ayrıldı. Akdeniz Bölgesi bunların ikisini\ntaşır: Adana Bölümü ve Antalya Bölümü.\n\nAdana Bölümü doğu kanadı kapsar. Çukurova ile onu çevreleyen Toros yamaçları, Amanos\nDağları'nın iki yanı ve kuzeydeki Maraş çevresi bu bölümün içinde yer alır. Antalya Bölümü\nise batı kanadı kapsar; Antalya kıyı ovası, Göller yöresi, Teke yarımadası ve Taşeli platosu\nbu bölümün alanlarıdır.\n\nBölüm sınırları il sınırlarıyla çakışmaz. Bu sayfada hangi ilin hangi bölümde olduğuna dair\nbir liste verilmez; bölümler kapsadıkları arazi üzerinden tanımlanır.",
    disasterAndEarthquakeTr:
      "Bölgenin doğu kanadı, Anadolu ve Arap levhalarının sınırını oluşturan Doğu Anadolu Fay Hattı\nüzerindedir. Türkiye'nin yakın tarihindeki en yıkıcı deprem dizisi burada gerçekleşmiştir.\n\nAFAD'ın deprem raporuna göre 6 Şubat 2023 sabahı saat 04.17'de, merkez üssü\nKahramanmaraş'ın Pazarcık ilçesi olan Mw 7,7 büyüklüğünde bir deprem meydana geldi. Aynı gün\nsaat 13.24'te, merkez üssü yine Kahramanmaraş'ın Elbistan ilçesi olan Mw 7,6 büyüklüğünde\nikinci bir deprem oldu. İki deprem fayın farklı kollarında gerçekleşti: Pazarcık depremi sol\nyanal doğrultu atımlı Ölüdeniz Fay Zonu'nun kuzey ucundaki Narlı Segmenti'nde, Elbistan\ndepremi ise faydan ayrılan Çardak Fayı üzerinde.\n\nİçişleri Bakanlığı'nın açıklamasına göre depremlerde bölge genelinde toplam 53.537 kişi\nhayatını kaybetti. Kahramanmaraş ile Hatay en ağır hasar gören iki il oldu. Nüfus verisi\netkinin ölçeğini gösterir: TÜİK'e göre Hatay'ın nüfusu 2022'de 1.686.043 iken 2023'te\n1.544.640'a geriledi.\n\nBölgenin batı kanadında baskın risk farklıdır. Karstik arazide obruk oluşumu ve yer altı\nboşluklarının çökmesi kendi başına bir zemin riski üretir; Burdur Gölü'nün seviye düşüşü de\naynı havzada süregelen bir çevresel değişimdir.",
    comparisonTr:
      "Yedi bölgenin üçü nüfus payında birbirine çok yakındır. Akdeniz %12,81, Ege %12,79 ve\nGüneydoğu Anadolu %11,14 ile aralarında yalnız 1,7 puanlık bir fark bırakır; kalan dördü bu\naralığın belirgin biçimde dışındadır.\n\n| Bölge | İl | Nüfus | Nüfus payı | Yüzölçümü (km²) | Yoğunluk |\n|---|---|---|---|---|---|\n| [Marmara](/v2/turkiye/bolge/marmara) | 11 | 26.711.525 | %31,03 | 72.666 | 368 |\n| [İç Anadolu](/v2/turkiye/bolge/ic-anadolu) | 13 | 13.809.574 | %16,04 | 187.227 | 74 |\n| **Akdeniz** | **8** | **11.028.175** | **%12,81** | **89.516** | **123** |\n| [Ege](/v2/turkiye/bolge/ege) | 8 | 11.011.261 | %12,79 | 89.339 | 123 |\n| [Güneydoğu Anadolu](/v2/turkiye/bolge/guneydogu-anadolu) | 9 | 9.587.992 | %11,14 | 75.947 | 126 |\n| [Karadeniz](/v2/turkiye/bolge/karadeniz) | 18 | 8.041.038 | %9,34 | 116.379 | 69 |\n| [Doğu Anadolu](/v2/turkiye/bolge/dogu-anadolu) | 14 | 5.902.603 | %6,86 | 148.966 | 40 |\n\n*Nüfus TÜİK ADNKS, 31 Aralık 2025; yüzölçümü Harita Genel Müdürlüğü. Değerler her bölgedeki\nillerin toplamıdır. Paylar 86.092.168 kişilik ve 780.040 km²'lik 81 il toplamı üzerinden\nhesaplanmıştır.*",
    faqs: [
      {
        question: "Akdeniz Bölgesi'nde kaç il var?",
        answer:
          'Sekiz il bulunur: Adana, Antalya, Burdur, Hatay, Isparta, Kahramanmaraş, Mersin ve Osmaniye.',
      },
      {
        question: "Akdeniz Bölgesi'nin nüfusu ne kadar?",
        answer:
          "Sekiz ilin 31 Aralık 2025 itibarıyla toplam nüfusu 11.028.175 kişidir. Bu, Türkiye nüfusunun %12,81'ine karşılık gelir.",
      },
      {
        question: 'Akdeniz Bölgesi kaç bölüme ayrılır?',
        answer:
          "İki bölüme ayrılır: Adana Bölümü ve Antalya Bölümü. Bu ayrım 1941'de toplanan Birinci Coğrafya Kongresi'nde yapılmıştır.",
      },
      {
        question: "Akdeniz Bölgesi'nin en yüksek noktası neresidir?",
        answer:
          "Bölgedeki illerin kendi zirveleri karşılaştırıldığında en yükseği, Mersin'deki Bolkar Dağları üzerinde yer alan 3.524 metrelik Medetsiz Tepesi'dir.",
      },
      {
        question: 'Akdeniz Bölgesi hangi ülkeyle sınır komşusudur?',
        answer: 'Hatay üzerinden Suriye ile kara sınırı vardır.',
      },
      {
        question: "Akdeniz Bölgesi'nin en uzun akarsuyu hangisidir?",
        answer: "509 kilometrelik Ceyhan Nehri'dir.",
      },
    ],
    sourcesNoteTr:
      '`V2SourcesSection scope="turkiye"` artı iki satır:\n\n*Bölge toplamları, bölgedeki illerin tek tek değerlerinin toplanmasıyla elde edilmiştir.*\n\n*Coğrafi bölge ve bölüm ayrımı: Birinci Coğrafya Kongresi, 6-21 Haziran 1941, Raporlar,\nMüzakereler, Kararlar. T.C. Maarif Vekilliği.*',
    footnotes: [
      'Nüfus ve yüzölçümü değerleri, bölgedeki illerin tek tek değerlerinin toplamıdır. TÜİK bölgesel istatistiklerini İBBS Düzey-1 sınıflandırmasına göre yayımlar; o sınıflandırma 12 bölgeden oluşur ve buradaki yedili coğrafi bölge ayrımından ayrıdır. Alan payı, 81 ilin yüzölçümü toplamı olan 780.040 km² üzerinden hesaplanmıştır.',
    ],
  },
  {
    region: GeographicRegion.IcAnadolu,
    slug: 'ic-anadolu',
    nameTr: 'İç Anadolu Bölgesi',
    headingName: 'İç Anadolu',
    metaTitle: 'İç Anadolu Bölgesi: Platolar, Kapalı Havzalar, 13 İl',
    metaDescription:
      'İç Anadolu Bölgesi 187.227 km² ile yedi bölgenin en genişidir. On üç ilin nüfusu, kapalı havzaları, yıllık 338-571 mm arasındaki yağışı ve dört bölümü.',
    h1: 'İç Anadolu Bölgesi',
    introTr:
      "İç Anadolu Bölgesi, Türkiye'nin ortasında, çevresini kuşatan dağ sıralarının içinde kalan geniş bir plato alanıdır. On üç ilinde 13,8 milyon kişi yaşar. Bölgeyi tanımlayan şey yükselti değil kapalılıktır: çevre dağları denizden gelen nemi büyük ölçüde tutar ve Türkiye'nin en az yağış alan illeri bu alanda toplanır.",
    highestPointName: 'Erciyes',
    highestPointElevationM: 3917,
    highestPointProvince: 'Kayseri',
    coastalSeas: [],
    neighborRegions: ['Karadeniz', 'Akdeniz', 'Ege', 'Marmara', 'Doğu Anadolu'],
    neighborCountries: [],
    subregions: [
      'Konya Bölümü',
      'Yukarı Sakarya Bölümü',
      'Orta Kızılırmak Bölümü',
      'Yukarı Kızılırmak Bölümü',
    ],
    gdpShareApproxPercent: 17.9,
    locationAndBordersTr:
      "İç Anadolu Bölgesi Türkiye'nin ortasındadır ve yedi bölge içinde denize kıyısı olmayan tek\nbölgedir. Sınırlarının tamamı kara sınırıdır ve hiçbiri bir komşu ülkeye açılmaz.\n\nBuna karşılık iç komşuluğu en geniş bölge budur: diğer altı bölgenin beşiyle sınırdaştır.\nKuzeyde Çankırı, Çorum yönünde, Ankara ve Eskişehir Bolu yönünde, Sivas ve Yozgat ise Tokat\nve Amasya yönünde Karadeniz Bölgesi'ne komşudur. Güneyde Konya, Karaman, Niğde, Kayseri ve\nSivas, Akdeniz Bölgesi'nden Antalya, Mersin, Adana ve Kahramanmaraş ile ayrılır. Batıda\nEskişehir ve Konya, Ege Bölgesi'nden Afyonkarahisar ve Kütahya ile sınırdaştır. Kuzeybatıda\nEskişehir, Marmara Bölgesi'nden [Bilecik](/v2/turkiye/bilecik) ile komşudur. Doğuda ise\n[Sivas](/v2/turkiye/sivas), Doğu Anadolu Bölgesi'nden Erzincan ve Malatya ile sınırdaştır.\n\nBölgenin sınırdaş olmadığı tek bölge Güneydoğu Anadolu'dur.",
    landformsTr:
      "Bölgenin arazisi dağdan çok platodur. Yükselti genel olarak 900 ile 1.300 metre arasında\ndalgalanır ve bu yüksekliği yaratan tek tek dağlar değil, geniş bir yükselmiş düzlüktür.\n[Ankara](/v2/turkiye/ankara)'nın toprakları 900-1.000 metrelik Anadolu Platosu üzerindedir;\n[Konya](/v2/turkiye/konya)'da ortalama 1.000-1.050 metre, Yozgat ve Nevşehir'de 1.200-1.300\nmetre bandına çıkar. İl merkezlerinin rakımı da bunu gösterir: en alçağı 751 metreyle\nKırıkkale, en yükseği 1.301 metreyle Yozgat'tır.\n\nBu düzlüğün üzerine volkanlar oturur ve bölgenin en tanınmış manzaraları oradan doğar.\n[Kayseri](/v2/turkiye/kayseri)'nin 25 kilometre güneybatısındaki 3.917 metrelik Erciyes, bir\nstratovolkandır ve bölgenin en yüksek noktasıdır. Yaklaşık 2,5-3 milyon yıl önce başlayan\nvolkanik faaliyet Holosen'de de sürmüştür; bilinen son püskürme MÖ 6880 dolaylarındadır ve\nMTA dağı Türkiye'nin aktif volkanları arasında sayar. Batıda, Aksaray ile Niğde sınırındaki\n3.268 metrelik Hasan Dağı aynı ailedendir. Konya'nın doğusunda Karacadağ, güneyinde Karaman\nsınırındaki Karadağ, platoya serpilmiş daha küçük volkanik kütlelerdir.\n\nKapadokya bu volkanizmanın doğrudan ürünüdür. Erciyes ve Hasan Dağı'nın milyonlarca yıl\nönceki kül ve tüf püskürtmeleri yumuşak bir kayaç örtüsü bıraktı; rüzgâr ve suyun bu tüf\ntabakasını aşındırması Göreme, Ürgüp ve Avanos çevresindeki peribacalarını ortaya çıkardı.\nAynı tüf, Derinkuyu ve Kaymaklı'daki çok katlı yeraltı şehirlerinin oyulmasını da mümkün\nkılmıştır. Aksaray'da Melendiz Çayı aynı arazide 18 kilometrelik Ihlara Vadisi'ni ortalama\n150 metre derinlik ve 200 metre genişlikte bir kanyon hâlinde oymuştur.\n\nBölgenin kenarları ortasından farklıdır. Konya'nın güneyinde Toros Dağları'nın kuzey\nuzantıları başlar ve Seydişehir, Hadim ile Taşkent'te 2.000 metreyi aşar. Niğde'nin güneyinde\nBolkar Dağları ile Aladağlar 3.500 metreyi geçen zirveler taşır. Kuzeyde Çankırı'nın\nKastamonu sınırındaki Ilgaz Dağı 2.587 metreye çıkar, Ankara'nın kuzeyinde ise Köroğlu-Işık\nDağları volkanik kütlesi ilin en engebeli kesimini oluşturur.",
    climateAndVegetationTr:
      "İç Anadolu, MEB coğrafya müfredatının iklim adlarına göre tek parça olan iki bölgeden\nbiridir. On üç ilin on üçü de İç Anadolu karasal iklimi adıyla anılır; diğeri Doğu\nAnadolu'dur. Kalan beş bölgenin her birinde en az iki farklı müfredat adı görülür.\n\nKöppen sınıflandırması ise bölgeyi dörde böler. Altı il `BSk` (yarı kurak step), dört il\n`Csa`, iki il `Csb`, Çankırı ise `Cfa` sınıfındadır. `BSk`'nın altı ille en yoğun göründüğü\nbölge burasıdır ve bu, bölgenin kuraklığının sınıflandırmadaki karşılığıdır.\n\nYağış bu bölgenin ayırt edici büyüklüğüdür. Bölgedeki illerin 1991-2020 dönemi yıllık toplam\nyağışı 338 milimetre ile 571 milimetre arasındadır; en kurak il Aksaray, en yağışlı il\nKayseri'dir. Türkiye'nin en az yağış alan üç ili de bu bölgededir: Aksaray 338, Karaman 362,\nKonya 376 milimetre. Yıllık ortalama sıcaklık 8,0 ile 13,0 santigrat derece arasında\ndağılır. En düşük değer Sivas'ta, en yüksek değer Karaman'dadır.\n\nDers kitabı adı ile Köppen kodu illerin çoğunda örtüşmez; ikisi farklı ölçütlerle kurulmuş\niki ayrı sınıflandırmadır.\n\nDoğal bitki örtüsü yarı kurak iklim koşullarının ürünüdür. MEB coğrafya müfredatı Türkiye'yi\nbeş bitki kuşağına ayırır ve İç Anadolu'nun büyük bölümü bozkırlar ile antropojen step kuşağına\ngirer. İlkbahar yağışlarıyla yeşeren ot toplulukları, yaz kuraklığının başlamasıyla sararır ve\nkurur.\n\nİnsan eliyle ormanların tahrip edildiği alanlarda bu otsu örtü genişlemiş ve antropojen bozkıra\ndönüşmüştür. 1.200 metre üzerindeki dağ yamaçlarında ve tepelerde meşe ile karaçam kalıntıları\ngörülür; bu kuru orman izleri bölgenin geçmişte daha geniş bir ağaç varlığına sahip olduğunu\nkanıtlar.",
    hydrographyTr:
      "Bölgenin su ağını iki farklı düzen paylaşır. Batı ve güneyde sular denize hiç ulaşmaz;\ndoğuda ve kuzeyde ise Kızılırmak bölgeyi baştan başa geçerek Karadeniz'e akar.\n\nKızılırmak, Türkiye sınırları içinde tamamen akan en uzun nehirdir. Kaynağı\n[Sivas](/v2/turkiye/sivas)'ın İmranlı ilçesinde, Kızıldağ'ın 2.000 metreyi aşan\nyükseltilerindedir. Nehir Sivas'tan sonra Kayseri, Kırşehir, Kırıkkale, Ankara, Aksaray,\nNevşehir ve Çorum'dan geçer, Samsun'da denize dökülür. Uzunluğu için iki resmî değer\ndolaşımdadır ve ikisi de kendi kurumuyla anılır: Su Yönetimi Genel Müdürlüğü 1.151 kilometre,\nMillî Eğitim Bakanlığı'nın müfredat kaynakları 1.355 kilometre verir. Bölgedeki on üç ilin\nyedisi bu nehrin havzasındadır.\n\nSakarya Nehri bölgenin kuzeybatı köşesini alır. Kaynağı Ankara'nın Çamlıdere ilçesindedir;\nnehir kuzeybatıya akarak Marmara Bölgesi'ne geçer. Eskişehir'in ortasından geçen Porsuk Çayı,\nKütahya'dan doğar ve 448 kilometrelik uzunluğuyla Sakarya'nın en uzun kolu sayılır.\n\nKapalı havzalar bölgenin ikinci yüzüdür. Konya, Türkiye'nin en büyük kapalı havzalarından\nbirinin merkezindedir ve ilin akarsuları denize ulaşmaz; iç göllerde ya da sulama\nkanallarında sonlanır. Çarşamba Çayı, Beyşehir Gölü'nden çıkarak Çumra Ovası'nı sular.\n1907-1913 arasında inşa edilen bu sulama bugün 59.560 hektarlık bir alanı kapsar.\nKaraman'ın kuzeyi, Niğde'nin kuzeyi ve Nevşehir de aynı karakterdedir. Nevşehir'in büyük\nakarsuyu yoktur.\n\nGöller bu iki düzenin kesiştiği yerde toplanır. Konya'nın batı sınırındaki Beyşehir Gölü,\n651 kilometrekarelik yüzölçümüyle Türkiye'nin en büyük tatlı su gölüdür. Tuz Gölü ise\nTürkiye'nin ikinci büyük gölüdür ve üç ile birden değer: Ankara'nın Şereflikoçhisar ilçesinde\nkuzey kıyısı, Konya'da güney kıyı şeridi, Aksaray'da güneybatı kıyısı kalır. Kayseri'nin\nkuzeyindeki Sultansazlığı, tatlı ve tuzlu su kütlelerinin bir arada bulunduğu bir sulak alan\nkompleksidir ve 13 Temmuz 1994'te Ramsar Sözleşmesi listesine alınmıştır. Kırşehir'in\nkuzeydoğusundaki Seyfe Gölü sığ ve tuzlu bir step gölüdür; 1994'te aynı listeye girmiş,\ndönem dönem 300 binin üzerinde flamingoya ev sahipliği yapmıştır.",
    settlementAndPopulationTr:
      "Bölgede 13.809.574 kişi yaşar ve bu, ülke nüfusunun %16,04'üne karşılık gelir. Alan payı ise\n%24,00'tür; yani bölge, Türkiye'nin dörtte birine yakın bir alanda nüfusun altıda birini\nbarındırır. Kilometrekareye 74 kişi düşer, Türkiye ortalaması 110 kişidir.\n\nNüfus tek bir ilde yoğunlaşır. [Ankara](/v2/turkiye/ankara) 5.910.320 kişiyle bölge\nnüfusunun yaklaşık %43'ünü taşır ve Türkiye'nin ikinci büyük ilidir. Onu 2.343.409 ile Konya\nve 1.458.991 ile Kayseri izler. En küçük il Çankırı 200.549 kişidir. Yüzölçümünde sıralama\nbaşkadır: Konya 40.838 kilometrekareyle Türkiye'nin en büyük ilidir, Sivas 28.164\nkilometrekareyle onu izler; en küçük il 4.791 kilometrekareyle Kırıkkale'dir.\n\nŞehirleşme oranı iki gruba ayrılır. Dört il büyükşehir statüsündedir ve büyükşehirlerde belde\nile köylerin idari tüzel kişiliği 6360 sayılı Kanun'la kaldırıldığı için TÜİK il/ilçe merkezi\nnüfus oranı %100 görünür. İdari bir tanımdan doğan bu oran, fiilî kentleşme düzeyini ölçmez.\nKalan dokuz ilde oran gerçek bir hesaptır ve %62,9 ile %88,2 arasında değişir; en yüksek\ndeğer Kırıkkale'de, en düşük değer Niğde'dedir.\n\nGöç yönü açıktır. 2024 net göç hızı on üç ilin dördünde pozitif, dokuzunda negatiftir.\nPozitif olanlar Ankara binde +8,91, Eskişehir binde +7,43, Nevşehir binde +4,05 ve Kayseri\nbinde +0,92'dir. Negatif ucunda Çankırı binde -27,69, Sivas binde -21,14 ve Yozgat binde\n-20,23 yer alır.",
    economyTr:
      "Bölgenin on üç ili, Türkiye gayrisafi yurt içi hasılasının yaklaşık %17,9'unu üretir. Bu\ndeğer, bölgenin %16,04'lük nüfus payının üzerindedir.\n\nAğırlık ezici biçimde başkenttedir. Ankara tek başına %10,5 pay alır ve İstanbul'dan sonra\nTürkiye'nin en büyük ikinci payıdır; bu, bölge toplamının yarısından fazlasıdır. Konya %2,1,\nKayseri %1,4 ve Eskişehir %1,1 ile onu izler. Kalan dokuz ilin payı toplamda %2,8'dir.\n\nBölgenin geniş plato düzlükleri ve kapalı havzaları, Türkiye'nin temel tahıl üretim sahasını\noluşturur. Yarı kurak iklim ve bozkır arazisi buğday ve arpa tarımı için doğal koşul sunar;\nsulanabilen ova kesimlerinde ise şeker pancarı yetiştiriciliği yaygındır. Kurak step alanları\naynı zamanda küçükbaş hayvancılığın, özellikle koyun yetiştiriciliğinin merkezidir.\n\nMadencilik ve sanayi belirli merkezlerde toplanır. Tuz Gölü havzası Türkiye'nin sofra ve sanayi\ntuzu ihtiyacının büyük bölümünü karşılar. Ankara savunma sanayisi, idari hizmetler ve teknoloji\nalanında öne çıkarken, Eskişehir havacılık ve raylı sistemler, Kayseri imalat ve mobilya,\nKonya ise tarım makineleri ve gıda sanayisinde bölgesel merkez niteliği taşır.",
    subregionsTr:
      "Türkiye'nin yedi coğrafi bölgesi 1941'de Ankara'da toplanan Birinci Coğrafya Kongresi'nde\nbelirlendi ve aynı toplantıda yirmi bir bölüme ayrıldı. İç Anadolu Bölgesi bunların dördünü\ntaşır: Konya Bölümü, Yukarı Sakarya Bölümü, Orta Kızılırmak Bölümü ve Yukarı Kızılırmak\nBölümü.\n\nKonya Bölümü güneybatı kanadı kapsar; Obruk Yaylası ile Konya-Ereğli düzlükleri bu bölümün\nalanlarıdır. Yukarı Sakarya Bölümü kuzeybatıda, Sakarya ve Porsuk vadilerinin çevresinde yer\nalır. Ankara ve Sündiken çevresi bu bölümdedir. Orta Kızılırmak Bölümü, nehrin büyük\nkavsinin içinde kalan orta kesimi kapsar. Yukarı Kızılırmak Bölümü ise nehrin kaynağına yakın\ndoğu kesimidir ve bölgenin en yüksek plato alanlarını içerir.\n\nBölüm sınırları il sınırlarıyla çakışmaz. Bu sayfada hangi ilin hangi bölümde olduğuna dair\nbir liste verilmez; bölümler kapsadıkları arazi üzerinden tanımlanır.",
    disasterAndEarthquakeTr:
      "Bölgenin risk profili, çevresindeki bölgelerden farklıdır. Kuzey ve doğu kenarları büyük fay\nkuşaklarına yaklaşır; orta plato ise bu kuşakların dışındadır. Kuzey kesim Kuzey Anadolu Fay\nZonu'nun etki alanındadır; Çankırı ve Sivas'ın kuzey kesimleri bu kuşağa komşudur. Batı\nsınırında ise 1956 Eskişehir depremi gibi sarsıntılar bölgenin batı havzalarını etkileyen\ntarihsel olaylar arasındadır.\n\nBölgeye özgü ikinci bir risk ailesi volkanizmadan doğar. MTA, Kayseri'deki Erciyes'i ve\nKonya'daki Karapınar volkanik alanını Türkiye'nin aktif volkanları arasında sayar.\nKarapınar'da Nasuhpınarı çevresinde ve Acıgöl maarında volkanik kökenli gaz çıkışları\nbulunur. Bu, bir püskürme beklentisi değil, alanın sınıflandırmadaki yeridir.\n\nÜçüncü risk ailesi zemin kaynaklıdır ve bölgenin hidrolojik dengesinden gelir. Kapalı\nhavzalarda yer altı suyu çekimi zemin çökmelerini ve obruk oluşumunu hızlandırır; Konya kapalı\nhavzası bu sürecin yoğunlaştığı ana sahadır. Yaz kuraklığı ve düşük yağış ortalamaları ise\nkuraklık ve çölleşme riskini bölgenin kalıcı çevresel tehdidi hâline getirir. Çankırı'nın tuz ve\njips yatakları da benzer bir çözünme arazisi üretir.",
    comparisonTr:
      "İç Anadolu, yedi bölgenin en genişidir. 187.227 kilometrekareyle 81 il alanının %24,00'ünü\nkaplar, yani Türkiye'nin illerle kaplı yüzeyinin neredeyse dörtte biri. Nüfusta ise ikinci\nsıradadır ve payı %16,04'te kalır; alan payı ile nüfus payı arasındaki bu sekiz puanlık\naçıklık, bölgenin düşük yoğunluğunun sayısal karşılığıdır.\n\n| Bölge | İl | Nüfus | Nüfus payı | Yüzölçümü (km²) | Yoğunluk |\n|---|---|---|---|---|---|\n| [Marmara](/v2/turkiye/bolge/marmara) | 11 | 26.711.525 | %31,03 | 72.666 | 368 |\n| **İç Anadolu** | **13** | **13.809.574** | **%16,04** | **187.227** | **74** |\n| [Akdeniz](/v2/turkiye/bolge/akdeniz) | 8 | 11.028.175 | %12,81 | 89.516 | 123 |\n| [Ege](/v2/turkiye/bolge/ege) | 8 | 11.011.261 | %12,79 | 89.339 | 123 |\n| [Güneydoğu Anadolu](/v2/turkiye/bolge/guneydogu-anadolu) | 9 | 9.587.992 | %11,14 | 75.947 | 126 |\n| [Karadeniz](/v2/turkiye/bolge/karadeniz) | 18 | 8.041.038 | %9,34 | 116.379 | 69 |\n| [Doğu Anadolu](/v2/turkiye/bolge/dogu-anadolu) | 14 | 5.902.603 | %6,86 | 148.966 | 40 |\n\n*Nüfus TÜİK ADNKS, 31 Aralık 2025; yüzölçümü Harita Genel Müdürlüğü. Değerler her bölgedeki\nillerin toplamıdır. Paylar 86.092.168 kişilik ve 780.040 km²'lik 81 il toplamı üzerinden\nhesaplanmıştır.*",
    faqs: [
      {
        question: "İç Anadolu Bölgesi'nde kaç il var?",
        answer:
          'On üç il bulunur: Aksaray, Ankara, Çankırı, Eskişehir, Karaman, Kayseri, Kırıkkale, Kırşehir, Konya, Nevşehir, Niğde, Sivas ve Yozgat.',
      },
      {
        question: "İç Anadolu Bölgesi'nin nüfusu ne kadar?",
        answer:
          "On üç ilin 31 Aralık 2025 itibarıyla toplam nüfusu 13.809.574 kişidir. Bu, Türkiye nüfusunun %16,04'üne karşılık gelir.",
      },
      {
        question: 'İç Anadolu Bölgesi kaç bölüme ayrılır?',
        answer:
          "Dört bölüme ayrılır: Konya, Yukarı Sakarya, Orta Kızılırmak ve Yukarı Kızılırmak bölümleri. Bu ayrım 1941'de toplanan Birinci Coğrafya Kongresi'nde yapılmıştır.",
      },
      {
        question: "İç Anadolu Bölgesi'nin en yüksek noktası neresidir?",
        answer: "Kayseri sınırlarındaki 3.917 metrelik Erciyes'tir.",
      },
      {
        question: 'İç Anadolu Bölgesi neden az yağış alır?',
        answer:
          "Bölgeyi çevreleyen dağ sıraları denizden gelen nemi büyük ölçüde tutar. Türkiye'nin en az yağış alan üç ili de bu bölgededir: Aksaray, Karaman ve Konya.",
      },
      {
        question: "İç Anadolu Bölgesi'nin denize kıyısı var mı?",
        answer: 'Yoktur. Denize kıyısı olmayan tek coğrafi bölge budur.',
      },
    ],
    sourcesNoteTr:
      '`V2SourcesSection scope="turkiye"` artı iki satır:\n\n*Bölge toplamları, bölgedeki illerin tek tek değerlerinin toplanmasıyla elde edilmiştir.*\n\n*Coğrafi bölge ve bölüm ayrımı: Birinci Coğrafya Kongresi, 6-21 Haziran 1941, Raporlar,\nMüzakereler, Kararlar. T.C. Maarif Vekilliği.*',
    footnotes: [
      'Nüfus ve yüzölçümü değerleri, bölgedeki illerin tek tek değerlerinin toplamıdır. TÜİK bölgesel istatistiklerini İBBS Düzey-1 sınıflandırmasına göre yayımlar; o sınıflandırma 12 bölgeden oluşur ve buradaki yedili coğrafi bölge ayrımından ayrıdır. Alan payı, 81 ilin yüzölçümü toplamı olan 780.040 km² üzerinden hesaplanmıştır.',
    ],
  },
  {
    region: GeographicRegion.Karadeniz,
    slug: 'karadeniz',
    nameTr: 'Karadeniz Bölgesi',
    headingName: 'Karadeniz',
    metaTitle: "Karadeniz Bölgesi'nin 18 İli ve Yağış Rejimi",
    metaDescription:
      "Rize'de yıllık yağış 2.223 milimetreye ulaşır, Amasya'da 563 milimetrede kalır. Karadeniz Bölgesi'nin 18 ili, dağ kuşağı, akarsuları ve üç coğrafi bölümü.",
    h1: 'Karadeniz Bölgesi',
    introTr:
      "Karadeniz Bölgesi, Türkiye'nin kuzeyinde, denizle ona paralel uzanan dağ kuşağı arasında uzun ve dar bir şerit hâlinde uzanır. On sekiz ili, yedi bölge içindeki en kalabalık il kümesidir. Dağların kıyıya paralel duruşu bölgenin yağışını da belirler: denizden gelen nemi ilk karşılayan yamaçlar Türkiye'nin en yağışlı yerleridir, aynı kuşağın güney yüzü ise belirgin biçimde kuraktır.",
    highestPointName: 'Kaçkar Dağı',
    highestPointElevationM: 3937,
    highestPointProvince: 'Artvin',
    coastalSeas: ['Karadeniz'],
    neighborRegions: ['İç Anadolu', 'Doğu Anadolu', 'Marmara'],
    neighborCountries: ['Gürcistan'],
    subregions: ['Batı Karadeniz Bölümü', 'Orta Karadeniz Bölümü', 'Doğu Karadeniz Bölümü'],
    gdpShareApproxPercent: 6.4,
    locationAndBordersTr:
      "Karadeniz Bölgesi Türkiye'nin kuzeyinde yer alır ve kuzeyde adını aldığı denizle sonlanır.\nKıyı şeridi batıda Sakarya sınırından doğuda Gürcistan sınırına kadar kesintisiz uzanır.\nAnadolu'nun en kuzeydeki kara parçası olan İnceburun, [Sinop](/v2/turkiye/sinop) sınırları\niçindedir.\n\nBölgenin bir komşu ülkeyle kara sınırı vardır. [Artvin](/v2/turkiye/artvin)'de Şavşat ile\nBorçka ilçeleri arasındaki Karçal Dağları Gürcistan sınırına kadar uzanır; ilin ortasından\ngeçen Çoruh Nehri de aynı sınıra doğru akar.\n\nKara komşuluğu üç bölgeyle kurulur. Güneyde Çorum, Bolu, Kastamonu, Karabük, Amasya, Tokat,\nOrdu ve Giresun, İç Anadolu Bölgesi'nden Çankırı, Ankara, Eskişehir, Kırıkkale, Yozgat ve\nSivas ile ayrılır. Doğuda Artvin, Rize, Bayburt, Gümüşhane ve Giresun, Doğu Anadolu\nBölgesi'nden Ardahan, Erzurum ve Erzincan ile sınırdaştır. Batıda Bolu ve\n[Düzce](/v2/turkiye/duzce), Marmara Bölgesi'nden Sakarya ve Bilecik ile komşudur.",
    landformsTr:
      "Bölgeyi tek bir yapı belirler: kıyıya paralel uzanan dağ kuşağı. Dağlar denize yaklaştıkça\ndüzlük daralır ve çoğu yerde yalnız akarsu ağızlarında birer şerit hâlinde kalır.\n[Trabzon](/v2/turkiye/trabzon)'da kıyı düzlükleri yalnız akarsu ağızlarında genişler;\n[Rize](/v2/turkiye/rize)'de kıyı ile dağlık kesim arasındaki düzlük neredeyse yok denecek\nkadar dardır. [Artvin](/v2/turkiye/artvin) bu eğilimin ucudur: il topraklarının yaklaşık\n%79'u dağlarla, yalnızca %1'i düzlüklerle kaplıdır.\n\nKuralın büyük istisnası orta kesimdedir. [Samsun](/v2/turkiye/samsun)'da Kızılırmak'ın\noluşturduğu Bafra Ovası kıyı boyunca 69 kilometre, Yeşilırmak'ın oluşturduğu Çarşamba Ovası\n88 kilometre uzanır; iki delta ovası Anadolu'nun kıyı ovaları arasında en büyükler arasında\nsayılır.\n\nYükseltiler doğuya doğru artar. On sekiz ilin kendi zirveleri karşılaştırıldığında en yükseği\nArtvin'in güneydoğusundaki 3.937 metrelik Kaçkar Dağı'dır; korpus bu zirveyi Karadeniz\nDağları'nın en yüksek noktası olarak kaydeder. Onu aynı ildeki 3.428 metrelik Karçal Dağları,\nGiresun ile Gümüşhane sınırındaki 3.331 metrelik Abdal Musa Tepesi ve Ordu'daki 3.107\nmetrelik Karagöl Tepesi izler. Batıya gidildikçe kuşak alçalır: Kastamonu'da Ilgaz Dağı 2.587\nmetre, Bolu'da Köroğlu Dağları 2.499 metre, Çorum'da Köse Dağı 2.087 metredir.\n\nYüksek kesim buzul izleri taşır. Giresun Dağları üzerindeki Karagöl, 2.760 metre yükseklikte\nbir buzul gölüdür. Aynı yükseklik kuşağında Kulakkaya, Kümbet ve Bektaş yaylaları yer alır.\n\nKıyının kendisi de yer yer biçim değiştirir. Sinop kent merkezinin kurulduğu Boztepe Burnu\nüst Kretase yaşlı volkanik kayaçlardan oluşur ve Sinop Körfezi, karayla önündeki bir adanın\nbirleşmesiyle oluşmuş bir tombolodur. Giresun Adası ise Karadeniz'in Türkiye kıyılarındaki\ntek doğal adasıdır.",
    climateAndVegetationTr:
      "Bölgenin iklimi tek bir başlık altında toplanamaz ve bunun nedeni dağ kuşağıdır. MEB\ncoğrafya müfredatının adlarıyla on sekiz il üç ayrı adla anılır: on beş ilde Karadeniz\niklimi, [Gümüşhane](/v2/turkiye/gumushane) ile Bayburt'ta Doğu Anadolu karasal iklimi,\nÇorum'da İç Anadolu karasal iklimi. Üçü de aynı bölgenin içindedir ve ayrımı yapan şey\nillerin dağ kuşağının hangi yüzünde kaldığıdır.\n\nKöppen sınıflandırması bölgeyi beşe böler ve bu, yedi bölge içindeki en parçalı dağılımdır.\nSekiz il `Cfa`, dört il `Cfb`, dört il `Csa`, biri `Csb`, biri `Dsb` sınıfındadır.\n\nYağış aralığı bölgenin en çarpıcı sayısıdır. İllerin 1991-2020 dönemi yıllık toplam yağışı\n563 milimetre ile 2.223 milimetre arasındadır; en yağışlı il Rize, en kurak il Amasya'dır.\nAradaki oran dörde yakındır ve yedi bölge içindeki en geniş iç aralıktır. Türkiye'nin en çok\nyağış alan dört ili de bu bölgededir: Rize 2.223, Trabzon 2.169, Artvin 2.104 ve Giresun\n1.919 milimetre. Yıllık ortalama sıcaklık 5,2 ile 14,0 santigrat derece arasında dağılır. En\ndüşük değer Gümüşhane'de, en yüksek değer Sinop'tadır. İl merkezlerinin rakımı 3 metre ile\n1.584 metre arasında değişir.\n\nRize'de yağışın yılın her mevsimine dağılması ve kurak bir dönem oluşturmaması, ilin\nekonomisinin temelini oluşturan çay tarımının doğrudan doğal koşuludur.\n\nBitki örtüsü bu bölgede iki katman hâlinde okunur. MEB coğrafya müfredatı Türkiye'yi bitki\nörtüsüne göre beş kuşağa ayırır: ormanlar, makiler, bozkırlar, antropojen step ve fundalıklar,\ndağ çayırları. Karadeniz'in baskın kuşağı ormandır.\n\nOrmanın altında ikinci bir katman vardır ve bölgeyi güneydeki komşularından ayırır. Kıyı\nkuşağında görülen çalı topluluğu, Akdeniz ve Ege'deki maki değil çoğunlukla psödomaki, yani\nyalancı makidir. Bu topluluk Doğu Karadeniz Bölümü'nde de sürer, ama orada maki\nelemanlarının sayısı beş ya da altı türü geçmez. Aynı topluluk Marmara'da yalnız kuzeye bakan\neteklerde görülürken burada kıyının genel örtüsüdür.\n\nDers kitabı adı ile Köppen kodu illerin çoğunda örtüşmez; ikisi farklı ölçütlerle kurulmuş\niki ayrı sınıflandırmadır.",
    hydrographyTr:
      "Bölgenin akarsu ağı iki farklı ölçekte çalışır. Doğuda ve batıda kısa, dik eğimli dereler\ndoğrudan denize iner; ortada ise iki büyük nehir kendi deltalarını kurar.\n\nKızılırmak, Türkiye sınırları içinde tamamen akan en uzun nehirdir ve Samsun'un Bafra ilçesi\nyakınlarında Karadeniz'e dökülür. Uzunluğu için iki resmî değer dolaşımdadır ve ikisi de\nkendi kurumuyla anılmalıdır: Su Yönetimi Genel Müdürlüğü 1.151 kilometre, Millî Eğitim\nBakanlığı'nın müfredat kaynakları 1.355 kilometre verir. Nehrin taşıdığı alüvyonların\noluşturduğu Kızılırmak Deltası 1998'de Ramsar Sözleşmesi'ne dahil edilmiştir ve Anadolu'nun\nikinci büyük Ramsar alanıdır; alanda 358 kuş türü tespit edilmiştir.\n\nYeşilırmak ikinci büyük havzayı toplar. [Tokat](/v2/turkiye/tokat)'ta Kelkit Irmağı ile\nbirleşir, [Amasya](/v2/turkiye/amasya)'nın dar ve derin vadisinden geçer ve Samsun'un\nÇarşamba ilçesi yakınlarında kendi deltasını oluşturur. Gümüşhane'nin güneyindeki Kelkit\nÇayı da Karadeniz'e değil bu havzaya bağlanır; bu, ilin su ağının iki ayrı havzaya\nbölündüğü anlamına gelir.\n\nDoğuda Çoruh Nehri ayrı bir yön izler. Nehir [Bayburt](/v2/turkiye/bayburt) il merkezinin\ngüneyinde Pullur ve Sakızlı derelerinin birleşmesiyle oluşur, 376 kilometrelik uzunluğunun\nyaklaşık 150 kilometresini Artvin sınırları içinde geçirir ve Gürcistan yönüne akar. Nehir\nüzerindeki Deriner Barajı, 249 metrelik gövde yüksekliğiyle Türkiye'nin en yüksek barajıdır\nve 2012'de enerji üretimine başlamıştır.\n\nBatıda Filyos Çayı, Karabük'te Soğanlı ve Araç çaylarının birleşmesiyle oluşur ve\nZonguldak'ta denize ulaşır. Bartın Çayı'nın 2.059 kilometrekarelik havzası sekiz alt havzadan\nbeslenir ve kuzeybatıya akar. Kastamonu'nun Gökırmak'ı ise denize değil Kızılırmak'a bağlanır.\n\nDik eğimli kısa dereler bölgenin kendi risk ailesini de üretir. Rize'de Fırtına Deresi,\nKaçkar Dağları'ndan inen çok sayıda derenin birleşmesiyle oluşur ve yaklaşık 57 kilometre\nsonra Ardeşen yakınlarında denize ulaşır. Giresun'da Aksu Çayı'nın havzası 898, Batlama\nDeresi'ninki 161 kilometrekaredir; ikisi de dik eğimli ve kısa havzaları nedeniyle ani sel\nve taşkınlara yol açabilen akarsular arasında sayılır.\n\nGöller azdır ve çoğu küçüktür. Bolu'daki Abant Gölü 1.325 metre rakımda, 125 hektarlık\nyüzölçümüyle dışa akışı olmayan kapalı bir havza gölüdür. Düzce Ovası'nı besleyen Küçük\nMelen, Asarsu ve Aksu çayları Efteni Gölü'ne dökülür.",
    settlementAndPopulationTr:
      "Bölgede 8.041.038 kişi yaşar ve bu, ülke nüfusunun %9,34'üne karşılık gelir. Alan payı\n%14,92'dir. Kilometrekareye 69 kişi düşer; Türkiye ortalaması 110 kişidir.\n\nYerleşme düzeni bölgenin en ayırt edici özelliğidir. On sekiz il ve 197 ilçeyle Karadeniz,\nhem il hem ilçe sayısında yedi bölgenin en yüksek değerlerini taşır; buna karşılık nüfusta\naltıncı sıradadır. İlçe başına yaklaşık 41 bin kişi düşer, Türkiye genelinde bu değer 88\nbindir. Dağınık ve parçalı yerleşme, dik vadi yamaçlarına sıkışan tarım arazisinin doğrudan\nsonucudur.\n\nNüfus kıyıda toplanır. Samsun 1.392.403 kişiyle bölgenin en kalabalık ili, Trabzon 823.323\nkişiyle ikincisidir. En küçük il Bayburt 82.836 kişidir ve aynı zamanda Türkiye'nin en az\nnüfuslu ilidir. Yüzölçümünde en geniş il 13.064 kilometrekareyle Kastamonu, en küçüğü 2.330\nkilometrekareyle Bartın'dır.\n\nŞehirleşme oranı iki gruba ayrılır. Üç il büyükşehir statüsündedir ve büyükşehirlerde belde\nile köylerin idari tüzel kişiliği 6360 sayılı Kanun'la kaldırıldığı için TÜİK il/ilçe merkezi\nnüfus oranı %100 görünür. İdari bir tanımdan doğan bu oran, fiilî kentleşme düzeyini ölçmez.\nKalan on beş ilde oran gerçek bir hesaptır ve %49,7 ile %77,7 arasında değişir; en düşük\ndeğer Bartın'da, en yüksek değer Karabük'tedir.\n\nGöç yönü tektir. 2024 net göç hızı on sekiz ilin on dördünde negatiftir. Türkiye'nin en düşük\niki değeri de bu bölgededir: Gümüşhane binde -42,80 ve Bayburt binde -35,16. Pozitif olan\ndört il Tokat binde +10,41, Düzce binde +3,89, Samsun binde +2,60 ve Bolu binde +1,55'tir.",
    economyTr:
      "Bölgenin on sekiz ili, Türkiye gayrisafi yurt içi hasılasının yaklaşık %6,4'ünü üretir. Bu\ndeğer, bölgenin %9,34'lük nüfus payının belirgin biçimde altındadır ve yedi bölge içindeki en\nbüyük negatif açıklıktır.\n\nAğırlık dağınıktır ve hiçbir il baskın değildir. Samsun %1,2 ile en yüksek paya sahiptir; onu\n%0,6 ile Trabzon, %0,5 ile Ordu ve Zonguldak izler. Kalan on dört ilin her birinin payı\n%0,4 ve altındadır. Dördünün payı %0,1'dir.\n\nBölgenin iki ili kendi sanayi kimliğini taşır. [Zonguldak](/v2/turkiye/zonguldak) Türkiye'nin\ntaşkömürü yataklarına sahip tek ilidir; Ereğli ilçesinde 1829'da bulunan kömür damarları ilin\nekonomik kimliğini belirlemiş, kok kömürüyle beslenen Ereğli Demir Çelik Fabrikaları bu\njeolojik mirasın sanayiye dönüşmüş hâli olmuştur. [Karabük](/v2/turkiye/karabuk)'te ise Demir\nve Çelik Fabrikaları'nın temeli 3 Nisan 1937'de atılmıştır.\n\nBölgenin tarım ve ormancılık yapısı, her mevsim yağışlı iklim ile dik yamaç arazisinin\nbir sonucudur. Doğu ve Orta Karadeniz kıyılarında eğimli yamaçlar ve nemli hava fındık tarımı\niçin doğal alan oluşturur; Ordu, Giresun ve Trabzon yamaçlarında fındık başlıca geçim kaynağıdır.\nRize kıyılarında ise kış ılıklığı ve kurak dönemsiz bol yağış çay tarımını besler. Geniş orman\nörtüsü ormancılık sektörüne hammadde sağlarken, uzun kıyı şeridi Karadeniz balıkçılığını ayakta\ntutar. Samsun'un Bafra ve Çarşamba deltaları ise mısır, çeltik ve sebze üretiminin yapıldığı\nender düzlüklerdir.",
    subregionsTr:
      "Türkiye'nin yedi coğrafi bölgesi 1941'de Ankara'da toplanan Birinci Coğrafya Kongresi'nde\nbelirlendi ve aynı toplantıda yirmi bir bölüme ayrıldı. Karadeniz Bölgesi bunların üçünü\ntaşır: Batı Karadeniz Bölümü, Orta Karadeniz Bölümü ve Doğu Karadeniz Bölümü.\n\nBatı Karadeniz Bölümü, Sakarya sınırından başlayan ve Küre Dağları'na kadar uzanan kesimi\nkapsar; ormanlık plato arazisi ve dar kıyı şeridi bu bölümün karakteridir. Orta Karadeniz\nBölümü, Kızılırmak ile Yeşilırmak deltalarının açıldığı geniş kıyı ovalarını ve arkalarındaki\nCanik Dağları'nı içine alır. Doğu Karadeniz Bölümü, Ordu'dan Gürcistan sınırına uzanan en dik\nve en yağışlı kesimdir. Güneyde Yukarı Kelkit ve Çoruh vadileri de bu bölümün alanlarıdır.\n\nBölüm sınırları il sınırlarıyla çakışmaz. Bu sayfada hangi ilin hangi bölümde olduğuna dair\nbir liste verilmez; bölümler kapsadıkları arazi üzerinden tanımlanır.",
    disasterAndEarthquakeTr:
      "Bölgenin batı kesimi Kuzey Anadolu Fayı'nın kuzey kolu üzerindedir ve buradaki risk ölçülmüş\nbir olayla kayıtlıdır. 12 Kasım 1999'da Mw 7,2 büyüklüğünde bir deprem, 17 Ağustos 1999\nGölcük depreminden 87 gün sonra Düzce'nin altındaki fay hattının doğu kesimini kırdı. En büyük\ndüşey yer değiştirme, Efteni Gölü'nün güneyinde ölçülmüştür.\n\nDüzce Ovası'nın kendisi bu tektoniğin ürünüdür. Havzayı güneyden çevreleyen Elmacık Dağı\nkütlesi, Kuvaterner döneminde Kuzey Anadolu Fayı ile Düzce Fayı arasında yükselmiştir; ova\nise komşu Hendek Ovası'ndan 250-300 metrelik bir sırtla ayrılan bir çöküntü alanıdır.\n\nBölgenin ikinci ve daha yaygın risk ailesi sudan gelir. Dik eğimli ve kısa havzalı dereler,\nyoğun yağışta hızla kabarır. Giresun'un Aksu Çayı ile Batlama Deresi bu nedenle ani sel ve\ntaşkınlara yol açabilen akarsular arasında sayılır. Ordu'da kıyı boyunca sıralanan çok sayıda\nküçük dere aynı özelliği taşır. Trabzon'da kent merkezinden geçen Değirmendere tarihsel olarak\ntaşkın riski taşıyan bir vadi koridorudur ve bu vadide taşkın kontrolü çalışmaları yürütülür.\n\nBölgenin en yaygın ve karakteristik kütle hareketi heyelandır. Dik yamaç eğimi, yüksek\nyıllık yağış miktarı, geçirimsiz killi tabakalar ve ayrışmış kaya yapısı, özellikle Doğu\nKaradeniz yamaçlarında toprak kaymalarını ve heyelanları sıkça tetikler. Aşırı yağış\ndönemlerinde suya doyan yamaç örtüsü yerleşim alanlarını ve ulaşım koridorlarını etkileyen\ndoğal bir risk oluşturur.",
    comparisonTr:
      "Karadeniz, yedi bölge içinde en çok ile ve en çok ilçeye sahip olan bölgedir: 18 il ve 197\nilçe. Nüfusta ise altıncı sıradadır. İlçe başına düşen nüfus bu yüzden yaklaşık 41 bindir ve\nyedi bölgenin en düşük değeridir; Marmara'da aynı değer 169 bindir.\n\n| Bölge | İl | Nüfus | Nüfus payı | Yüzölçümü (km²) | Yoğunluk |\n|---|---|---|---|---|---|\n| [Marmara](/v2/turkiye/bolge/marmara) | 11 | 26.711.525 | %31,03 | 72.666 | 368 |\n| [İç Anadolu](/v2/turkiye/bolge/ic-anadolu) | 13 | 13.809.574 | %16,04 | 187.227 | 74 |\n| [Akdeniz](/v2/turkiye/bolge/akdeniz) | 8 | 11.028.175 | %12,81 | 89.516 | 123 |\n| [Ege](/v2/turkiye/bolge/ege) | 8 | 11.011.261 | %12,79 | 89.339 | 123 |\n| [Güneydoğu Anadolu](/v2/turkiye/bolge/guneydogu-anadolu) | 9 | 9.587.992 | %11,14 | 75.947 | 126 |\n| **Karadeniz** | **18** | **8.041.038** | **%9,34** | **116.379** | **69** |\n| [Doğu Anadolu](/v2/turkiye/bolge/dogu-anadolu) | 14 | 5.902.603 | %6,86 | 148.966 | 40 |\n\n*Nüfus TÜİK ADNKS, 31 Aralık 2025; yüzölçümü Harita Genel Müdürlüğü. Değerler her bölgedeki\nillerin toplamıdır. Paylar 86.092.168 kişilik ve 780.040 km²'lik 81 il toplamı üzerinden\nhesaplanmıştır.*",
    faqs: [
      {
        question: "Karadeniz Bölgesi'nde kaç il var?",
        answer:
          'On sekiz il bulunur: Amasya, Artvin, Bartın, Bayburt, Bolu, Çorum, Düzce, Giresun, Gümüşhane, Karabük, Kastamonu, Ordu, Rize, Samsun, Sinop, Tokat, Trabzon ve Zonguldak.',
      },
      {
        question: "Karadeniz Bölgesi'nin nüfusu ne kadar?",
        answer:
          "On sekiz ilin 31 Aralık 2025 itibarıyla toplam nüfusu 8.041.038 kişidir. Bu, Türkiye nüfusunun %9,34'üne karşılık gelir.",
      },
      {
        question: 'Karadeniz Bölgesi kaç bölüme ayrılır?',
        answer:
          "Üç bölüme ayrılır: Batı Karadeniz, Orta Karadeniz ve Doğu Karadeniz bölümleri. Bu ayrım 1941'de toplanan Birinci Coğrafya Kongresi'nde yapılmıştır.",
      },
      {
        question: "Karadeniz Bölgesi'nin en yüksek noktası neresidir?",
        answer:
          "Bölgedeki illerin kendi zirveleri karşılaştırıldığında en yükseği, Artvin'deki 3.937 metrelik Kaçkar Dağı'dır.",
      },
      {
        question: "Türkiye'nin en yağışlı ili hangisidir?",
        answer:
          "Rize'dir. 1991-2020 dönemi yıllık toplam yağışı 2.223 milimetredir. Onu Trabzon, Artvin ve Giresun izler; dördü de Karadeniz Bölgesi'ndedir.",
      },
      {
        question: 'Karadeniz Bölgesi hangi ülkeyle sınır komşusudur?',
        answer: 'Artvin üzerinden Gürcistan ile kara sınırı vardır.',
      },
    ],
    sourcesNoteTr:
      '`V2SourcesSection scope="turkiye"` artı iki satır:\n\n*Bölge toplamları, bölgedeki illerin tek tek değerlerinin toplanmasıyla elde edilmiştir.*\n\n*Coğrafi bölge ve bölüm ayrımı: Birinci Coğrafya Kongresi, 6-21 Haziran 1941, Raporlar,\nMüzakereler, Kararlar. T.C. Maarif Vekilliği.*',
    footnotes: [
      'Nüfus ve yüzölçümü değerleri, bölgedeki illerin tek tek değerlerinin toplamıdır. TÜİK bölgesel istatistiklerini İBBS Düzey-1 sınıflandırmasına göre yayımlar; o sınıflandırma 12 bölgeden oluşur ve buradaki yedili coğrafi bölge ayrımından ayrıdır. Alan payı, 81 ilin yüzölçümü toplamı olan 780.040 km² üzerinden hesaplanmıştır.',
    ],
  },
  {
    region: GeographicRegion.DoguAnadolu,
    slug: 'dogu-anadolu',
    nameTr: 'Doğu Anadolu Bölgesi',
    headingName: 'Doğu Anadolu',
    metaTitle: "Doğu Anadolu Bölgesi'nin 14 İli ve Karasal İklimi",
    metaDescription:
      "Doğu Anadolu Bölgesi'nde kilometrekareye 40 kişi düşer; Türkiye ortalaması 110'dur. On dört ilin yükseltisi, iklimi, akarsu kaynakları ve dört coğrafi bölümü.",
    h1: 'Doğu Anadolu Bölgesi',
    introTr:
      "Doğu Anadolu Bölgesi, Türkiye'nin doğusunda, yedi bölgenin en yükseğidir. On dört ilinde 5,9 milyon kişi yaşar. Yükselti burada bir ayrıntı değil, her şeyi belirleyen değişkendir: Türkiye'nin en yüksek beş il merkezi de bu bölgededir ve aynı yükselti hem iklimi hem yerleşme düzenini hem de nüfus yoğunluğunu tek başına açıklar.",
    highestPointName: 'Ağrı Dağı',
    highestPointElevationM: 5137,
    highestPointProvince: 'Ağrı',
    coastalSeas: [],
    neighborRegions: ['Güneydoğu Anadolu', 'Karadeniz', 'İç Anadolu', 'Akdeniz'],
    neighborCountries: [],
    subregions: [
      'Erzurum-Kars Bölümü',
      'Yukarı Fırat Bölümü',
      'Yukarı Murat-Van Bölümü',
      'Hakkari Bölümü',
    ],
    gdpShareApproxPercent: 3.8,
    locationAndBordersTr:
      "Doğu Anadolu Bölgesi Türkiye'nin doğusundadır ve denize kıyısı yoktur. Bölgenin doğu kenarı\nülkenin kara sınırıyla çakışır.\n\nİki ilin sınır konumu kaynaklı olarak kayıtlıdır. [Ardahan](/v2/turkiye/ardahan), Gürcistan ve\nErmenistan sınırına yakın yüksek bir plato üzerinde kuruludur. [Hakkari](/v2/turkiye/hakkari)\nise Güneydoğu Toroslar'ın en sarp bölümünde, Irak ve İran sınırına bitişik yer alır; ilin\nakarsuları güneye, Irak topraklarına doğru akar.\n\nKara komşuluğu dört bölgeyle kurulur. Güneyde Malatya, Elazığ, Bingöl, Muş, Bitlis, Van ve\nHakkari, Güneydoğu Anadolu Bölgesi'nden Adıyaman, Diyarbakır, Batman, Siirt ve Şırnak ile\nayrılır. Kuzeyde Ardahan, Erzurum ve Erzincan, Karadeniz Bölgesi'nden Artvin, Rize, Bayburt,\nGümüşhane ve Giresun ile sınırdaştır. Batıda Erzincan ve Malatya, İç Anadolu Bölgesi'nden\n[Sivas](/v2/turkiye/sivas) ile komşudur. Güneybatıda ise Malatya, Akdeniz Bölgesi'nden\nKahramanmaraş ile sınırdaştır.\n\n[Erzurum](/v2/turkiye/erzurum) dokuz ayrı ille sınır komşusudur ve bu özelliğiyle Türkiye'nin\nen çok komşuya sahip ilidir.",
    landformsTr:
      "Bölgenin arazisini iki süreç kurmuştur: tektonik yükselme ve volkanizma. Sonuç, geniş yüksek\nplatolar ile onların üzerine oturan volkanik konilerin oluşturduğu bir düzendir.\n[Erzurum](/v2/turkiye/erzurum)'un platoları ortalama 2.000 metreyi bulur ve üzerlerinde\nyükselen dağların çoğu 3.000 metreyi aşar; kentin güneyindeki Palandöken Dağları'nın Büyük\nEjder Tepesi 3.176 metredir ve sıradağ doğu-batı doğrultusunda yaklaşık 70 kilometre uzanır.\n\nTürkiye'nin en yüksek zirvesi burada yükselir. [Ağrı](/v2/turkiye/agri)'nın kuzeydoğusundaki\n5.137 metrelik Ağrı Dağı, ana zirve Büyük Ağrı ile güneydoğusundaki 3.896 metrelik Küçük\nAğrı'dan oluşan bileşik bir stratovolkandır. Zirvede yaklaşık 10 kilometrekarelik bir buzul\nörtüsü bulunur ve kalıcı kar sınırı 4.300 metre civarındadır; dağ, ülkenin sürekli buzul\nörtüsü bulunan tek zirvesidir.\n\nVolkanik kütleler bölgenin ortasında sıralanır. [Van](/v2/turkiye/van) Gölü'nün kuzeyindeki\nSüphan Dağı 4.058 metreyle Ağrı Dağı ve Cilo Dağı'nın ardından Anadolu'nun üçüncü en yüksek\nzirvesidir ve tepesi yıl boyunca buzulla kaplıdır. Gölün batısındaki Nemrut Dağı, tepesinde 6\nkilometre çapında bir kalderası olan 2.935 metrelik bir yanardağdır; uyuyan aktif bir volkan\nolarak sınıflandırılır ve bilinen son lav çıkışı 1441 yılındadır. Güneydoğuda ise Hakkari'nin\nCilo-Sat Dağları 4.168 metreye ulaşır ve Türkiye'nin en yüksek dağ kütlelerinden biridir.\n\nYüksek arazinin arasına çöküntü ovaları serpilir ve nüfus bu ovalarda toplanır. Muş Ovası 80\nkilometre uzunluğu ve 30 kilometre genişliğiyle Türkiye'nin en büyük ovalarından biridir;\nMiyosen döneminde bir çöküntü alanına dönüşmüş, sonra alüvyonlarla dolmuştur. Kars Ovası\n1.750 metre ortalama yüksekliğiyle bölgenin en geniş ovasıdır. Iğdır Ovası ise tersine bir\nistisnadır: çevresini saran yüksek dağlara karşın 850 metre ortalama yükseltisiyle bölgenin en\nalçak düzlüğüdür ve bu, ona daha ılıman bir mikroklima kazandırır.\n\nBölgenin batısı fay kuşaklarıyla parçalanmıştır. [Bingöl](/v2/turkiye/bingol)'ün Karlıova\nilçesi, Kuzey Anadolu Fayı ile Doğu Anadolu Fayı'nın kesiştiği noktadır; Karlıova Havzası bu\niki fay ile Varto fay zonunun kesişiminde, yoğun tektonik hareketlilikle oluşmuş yükselti ve\nçöküntü alanlarından oluşur.",
    climateAndVegetationTr:
      "Doğu Anadolu, MEB coğrafya müfredatının iklim adlarına göre tek parça olan iki bölgeden\nbiridir. On dört ilin on dördü de Doğu Anadolu karasal iklimi adıyla anılır; diğeri İç\nAnadolu'dur.\n\nKöppen sınıflandırması ise bölgeyi beşe böler ve bu, Karadeniz'le birlikte yedi bölge\niçindeki en parçalı dağılımdır. Dört il `Csa`, üç il `Dsa`, üç il `BSk`, iki il `Dsb`, iki il\n`Dfb` sınıfındadır. `D` grubu, yani soğuk kışlı sınıflar yalnız bu bölgede yedi ille\nbaskındır.\n\nSayısal aralık bölgenin iç farkını gösterir. İllerin 1991-2020 dönemi yıllık ortalama\nsıcaklığı 4,2 ile 14,3 santigrat derece arasındadır; en düşük değer Ardahan'da, en yüksek\ndeğer Elazığ'dadır. Türkiye'nin yıllık ortalama sıcaklığı en düşük iki ili de bu bölgededir:\nArdahan 4,2 ve Erzurum 4,8 santigrat derece. Yıllık toplam yağış 449 milimetre ile 1.078\nmilimetre arasında değişir. En kurak il Van, en yağışlı il Bingöl'dür.\n\nYükselti bu tablonun tek açıklayıcısıdır. İl merkezlerinin rakımı 856 metre ile 1.860 metre\narasında dağılır ve Türkiye'nin en yüksek beş il merkezi de bu bölgededir. Iğdır'ın 850\nmetrelik ovası, bölgenin diğer illerine kıyasla daha ılıman bir mikroklima taşır ve kayısı,\nşeftali ile üzüm yetiştiriciliğine imkân tanır.\n\nDers kitabı adı ile Köppen kodu illerin çoğunda örtüşmez; ikisi farklı ölçütlerle kurulmuş\niki ayrı sınıflandırmadır.\n\nDoğal bitki örtüsü, yüksek rakım ve sert kış koşullarına uyum sağlamış topluluklardan oluşur.\nMEB coğrafya müfredatının beşli bitki örtüsü ayrımında Erzurum-Kars platosu ve yüksek dağlık\nalanlar dağ çayırları kuşağına girer. Yaz aylarında düşen yağışlar sayesinde yeşil kalan bu\ngür otlaklar ve meralar, bölgenin tipik örtüsünü meydana getirir.\n\nÇöküntü havzalarında ve plato tabanlarında karasal bozkır toplulukları yaygındır. Kars'ın\ngüneybatısında, Sarıkamış çevresinde yüksek rakıma ve soğuğa dayanıklı sarıçam ormanları yer\nalır; korunaklı vadi içlerinde ise yerel meşe ve ardıç kalıntılarına rastlanır.",
    hydrographyTr:
      "Bölge, Türkiye'nin en büyük akarsularının doğduğu yerdir. Fırat ve Dicle'nin kaynak kolları,\nAras ve Kura havzalarının Türkiye kesimi, Çoruh'un yukarı kolları ve kapalı Van havzası aynı\nyükselti kuşağını paylaşır.\n\nFırat iki ana kaynak kolundan doğar. [Erzincan](/v2/turkiye/erzincan)'ın ortasından geçen\nKarasu bunlardan biridir ve Erzincan Ovası boyunca batıya akar. İkincisi Murat Irmağı'dır;\nkaynak kollarından biri Ağrı'nın Diyadin ilçesi yakınlarından doğar, [Muş](/v2/turkiye/mus)\nOvası'nı kuzeyden güneye kat eder, Bingöl ve Elazığ üzerinden Fırat sistemine katılır.\n[Elazığ](/v2/turkiye/elazig)'da nehir Keban Baraj Gölü'ne dökülür. Murat vadisi boyunca 125\nkilometre uzanan bu göl Türkiye'nin en büyük yapay gölüdür. Keban Barajı'nın kurulu gücü\n1.330 megavat, yıllık ortalama enerji üretimi 6,6 milyar kilovatsaattir.\n\nDicle'nin kaynakları da bu bölgededir. Elazığ'ın Hazar Gölü'nden süzülen sular Behremaz\nDeresi'yle birleşerek Dicle'nin kaynak kollarından birini oluşturur; il böylece hem Fırat hem\nDicle havzalarına su verir. Bitlis Çayı güneye akarak aynı sisteme katılır. Hakkari'nin\nakarsuları ise Dicle'nin önemli bir kolu olan Büyük Zap'ı besler.\n\nKuzeydoğuda Aras havzası uzanır. Nehrin başlıca kaynak kollarından biri Erzurum'un Tekman\nilçesi yaylalarından doğar, Pasinler Ovası'nı geçer ve Kars-Erzurum platosuna yönelir;\n[Kars](/v2/turkiye/kars)'ta Kars Çayı ile Arpaçayı ona katılır. Aras, kışın donmayan tek\nakarsu olma özelliğiyle diğerlerinden ayrılır. Debisi nisanda saniyede 180-200 metreküpe\nçıkarken temmuz ve ağustosta 20-25 metreküpe iner. [Iğdır](/v2/turkiye/igdir)'da nehir ovayı\nikiye bölerek doğuya akar. Ardahan toprakları ise kuzeyde Kura, güneyde Aras havzaları\narasında kalır.\n\nVan havzası bunların hiçbirine bağlanmaz. Van Gölü 3.713 kilometrekare yüzölçümüyle\nTürkiye'nin en büyük gölü ve dünyanın en büyük sodalı gölüdür. Ortalama derinliği 171 metre,\nen derin noktası 451 metre, deniz seviyesinden yüksekliği yaklaşık 1.646 metredir. Suyu binde\n19 tuzlulukta ve pH 9,8'dir; bu yüksek alkalinite, yüksek rakımına ve sert kış iklimine rağmen\ngölün donmasını engeller. Gölün bir çıkışı yoktur ve havzaya giren sular buharlaşma dışında\nbir yolla denize ulaşamaz. Göl, yaklaşık 200 bin yıl önce Nemrut Dağı'nın patlayıp lav\nakıntılarıyla bölgenin drenajını tıkaması sonucu oluşmuş bir volkanik set gölüdür.\n\nBölgenin diğer gölleri de büyük ölçüde volkanik ya da tektonik kökenlidir. Ardahan'ın Çıldır\nGölü 123 kilometrekareyle bölgenin en büyük tatlı su gölüdür ve bir lav akıntısı ile moloz\nkonisinin birlikte oluşturduğu doğal bir set gölüdür; en derin noktası 42 metredir. Nemrut\nDağı'nın kraterindeki göl, Bitlis'in Nazik Gölü ve Van'ın Erçek Gölü aynı volkanik ailedendir.\nTunceli'de Munzur Dağları'nın 2.000-3.000 metrelik zirvelerinde krater gölleri bulunur.",
    settlementAndPopulationTr:
      "Bölgede 5.902.603 kişi yaşar ve bu, ülke nüfusunun %6,86'sıdır; yedi bölgenin en düşük payı\nbudur. Alan payı ise %19,10'dur. Kilometrekareye 40 kişi düşer, Türkiye ortalaması 110\nkişidir. Bu da yedi bölgenin en düşük yoğunluğudur.\n\nNüfus ovalarda ve büyük il merkezlerinde toplanır. Van 1.112.013 kişiyle bölgenin en kalabalık\nilidir; onu 755.854 ile Malatya ve 736.877 ile Erzurum izler. En küçük il\n[Tunceli](/v2/turkiye/tunceli) 85.083 kişidir ve Türkiye'nin en az nüfuslu ikinci ilidir.\n[Ardahan](/v2/turkiye/ardahan) 90.392 kişiyle üçüncüdür. Yüzölçümünde en geniş il 25.006\nkilometrekareyle Erzurum, en küçüğü 3.664 kilometrekareyle Iğdır'dır.\n\nŞehirleşme oranı iki gruba ayrılır. Üç il büyükşehir statüsündedir ve büyükşehirlerde belde\nile köylerin idari tüzel kişiliği 6360 sayılı Kanun'la kaldırıldığı için TÜİK il/ilçe merkezi\nnüfus oranı %100 görünür. İdari bir tanımdan doğan bu oran, fiilî kentleşme düzeyini ölçmez.\nKalan on bir ilde oran gerçek bir hesaptır ve %45,2 ile %80,1 arasında değişir; en düşük\ndeğer Ardahan'da, en yüksek değer Elazığ'dadır. Ardahan'ın %45,2'lik oranı, büyükşehir olmayan 51 ilin tamamı içinde de en\ndüşük değerdir.\n\nGöç yönü bölgenin en keskin sayısıdır. 2024 net göç hızı on dört ilin **on üçünde**\nnegatiftir; pozitif olan tek il binde +6,88 ile Malatya'dır. Ağrı binde -32,59, Muş binde\n-27,33 ve Kars binde -25,28 ile en düşük değerleri taşır. Van 2024'te 31.418 kişi almış,\n54.023 kişi vermiştir.",
    economyTr:
      "Bölgenin on dört ili, Türkiye gayrisafi yurt içi hasılasının yaklaşık %3,8'ini üretir. Bu,\nyedi bölgenin en düşük payıdır ve bölgenin %6,86'lık nüfus payının da altındadır.\n\nAğırlık dağınıktır. Malatya %0,6 ile en yüksek paya sahiptir; onu %0,5 ile Erzurum, Elazığ ve\nVan izler. Kalan on ilin her birinin payı %0,2 ve altındadır.\n\nBölgenin kaynaklı iki üretim kalemi vardır. [Malatya](/v2/turkiye/malatya) dünya kuru kayısı\nüretiminin yaklaşık %85'ini karşılar. Iğdır'da tarım arazilerinin yarısından fazlasında\ntahıl, özellikle buğday ve arpa yetiştirilir.\n\nBölge ekonomisinin temeli, yüksek platolar ve gür dağ çayırlarının beslediği hayvancılık\nfaaliyetlerine dayanır. Erzurum-Kars platosu başta olmak üzere yaz yağışlarıyla yeşil kalan\nmeralar büyükbaş ve küçükbaş hayvancılık için doğal otlak alanı sunar; et ve canlı hayvan\nüretimi kırsal nüfusun temel geçim kaynağıdır.\n\nEnerji ve madencilik sektörü de bölgenin coğrafi yapısıyla şekillenir. Fırat Nehri üzerindeki\nKeban Barajı, 1.330 megavatlık kurulu gücü ve yıllık ortalama 6,6 milyar kilovatsaatlik\nenerji üretimiyle Türkiye'nin en büyük hidroelektrik santralleri arasındadır.",
    subregionsTr:
      "Türkiye'nin yedi coğrafi bölgesi 1941'de Ankara'da toplanan Birinci Coğrafya Kongresi'nde\nbelirlendi ve aynı toplantıda yirmi bir bölüme ayrıldı. Doğu Anadolu Bölgesi bunların dördünü\ntaşır: Yukarı Fırat Bölümü, Erzurum-Kars Bölümü, Yukarı Murat-Van Bölümü ve Hakkari Bölümü.\n\nYukarı Fırat Bölümü batı kanadı kapsar; Fırat'ın iki kaynak kolunun havzası, Erzincan ve\nMalatya ovaları ile Munzur kütlesi bu bölümün alanlarıdır. Erzurum-Kars Bölümü kuzeydoğudaki\nyüksek plato kuşağıdır ve bölgenin en yüksek il merkezleri buradadır. Yukarı Murat-Van Bölümü\nortadaki volkanik kuşağı ve Van'ın kapalı havzasını içine alır. Hakkari Bölümü ise\ngüneydoğudaki en sarp kesimdir. Cilo-Sat kütlesi bu bölümün merkezindedir.\n\nBölüm sınırları il sınırlarıyla çakışmaz. Bu sayfada hangi ilin hangi bölümde olduğuna dair\nbir liste verilmez; bölümler kapsadıkları arazi üzerinden tanımlanır.",
    disasterAndEarthquakeTr:
      "Bölge, Türkiye'nin iki büyük fay kuşağının da geçtiği alandır ve deprem tarihi bunu ölçülmüş\nolaylarla kaydeder.\n\n27 Aralık 1939'da merkez üssü Erzincan olan deprem, Kandilli Rasathanesi kayıtlarına göre 7,9\nbüyüklüğündeydi; resmi kayıtlara göre 32.968 kişi hayatını kaybetti. Bu, Türkiye'nin 20.\nyüzyılda yaşadığı en yıkıcı doğal afetlerden biridir. 23 Ekim 2011'de ise merkez üssü Van'ın\nTabanlı köyü olan 7,2 büyüklüğünde bir deprem meydana geldi ve 604 kişi hayatını kaybetti. En\nağır yıkım Erciş ilçesinde yaşandı. Aynı yılın 9 Kasım'ında Edremit'te 5,6 büyüklüğünde ikinci\nbir deprem oldu ve Van kent merkezi bu iki depremin ardından büyük ölçüde yeniden inşa edildi.\n\nBingöl'ün Karlıova ilçesi bu risk coğrafyasının kavşak noktasıdır. Türkiye'nin en aktif iki\nfay hattı olan Kuzey Anadolu Fayı ile Doğu Anadolu Fayı burada kesişir; dünyada benzerine az\nrastlanan bir tektonik kavşaktır.\n\nBölgenin ikinci risk ailesi volkanizmadır. Van Gölü'nün batısındaki Nemrut Dağı uyuyan aktif\nbir volkan olarak sınıflandırılır ve bilinen son lav çıkışı 1441 yılındadır.\n\nBölgenin yüksek dağlık arazisi ve sert kış koşulları, meteorolojik ve morfolojik riskler de\nüretir. Dik ve sarp dağ yamaçlarında biriken kalın kar örtüsü, kış ve ilkbahar aylarında çığ\ntehlikesini bölgenin karakteristik doğal afeti hâline getirir; özellikle Hakkari, Bitlis,\nMuş ve Van gibi dağlık yörelerde vadi geçişleri ve yerleşim yerleri bu risk altındadır.\nUzun süren kar örtüsü ve şiddetli don olayları ise ulaşımı ve günlük yaşamı dönemsel olarak\nkısıtlar.",
    comparisonTr:
      "Doğu Anadolu, alan payı ile nüfus payı arasındaki açıklığın en büyük olduğu bölgedir. 81 il\nalanının %19,10'unu kaplar, nüfusun ise %6,86'sını barındırır. Aradaki 12,2 puanlık fark,\nyedi bölgenin en büyüğüdür. Kilometrekareye düşen 40 kişi de yine yedi bölgenin en düşük\ndeğeridir.\n\n| Bölge | İl | Nüfus | Nüfus payı | Yüzölçümü (km²) | Yoğunluk |\n|---|---|---|---|---|---|\n| [Marmara](/v2/turkiye/bolge/marmara) | 11 | 26.711.525 | %31,03 | 72.666 | 368 |\n| [İç Anadolu](/v2/turkiye/bolge/ic-anadolu) | 13 | 13.809.574 | %16,04 | 187.227 | 74 |\n| [Akdeniz](/v2/turkiye/bolge/akdeniz) | 8 | 11.028.175 | %12,81 | 89.516 | 123 |\n| [Ege](/v2/turkiye/bolge/ege) | 8 | 11.011.261 | %12,79 | 89.339 | 123 |\n| [Güneydoğu Anadolu](/v2/turkiye/bolge/guneydogu-anadolu) | 9 | 9.587.992 | %11,14 | 75.947 | 126 |\n| [Karadeniz](/v2/turkiye/bolge/karadeniz) | 18 | 8.041.038 | %9,34 | 116.379 | 69 |\n| **Doğu Anadolu** | **14** | **5.902.603** | **%6,86** | **148.966** | **40** |\n\n*Nüfus TÜİK ADNKS, 31 Aralık 2025; yüzölçümü Harita Genel Müdürlüğü. Değerler her bölgedeki\nillerin toplamıdır. Paylar 86.092.168 kişilik ve 780.040 km²'lik 81 il toplamı üzerinden\nhesaplanmıştır.*",
    faqs: [
      {
        question: "Doğu Anadolu Bölgesi'nde kaç il var?",
        answer:
          'On dört il bulunur: Ağrı, Ardahan, Bingöl, Bitlis, Elazığ, Erzincan, Erzurum, Hakkari, Iğdır, Kars, Malatya, Muş, Tunceli ve Van.',
      },
      {
        question: "Doğu Anadolu Bölgesi'nin nüfusu ne kadar?",
        answer:
          "On dört ilin 31 Aralık 2025 itibarıyla toplam nüfusu 5.902.603 kişidir. Bu, Türkiye nüfusunun %6,86'sına karşılık gelir ve yedi bölgenin en düşük payıdır.",
      },
      {
        question: 'Doğu Anadolu Bölgesi kaç bölüme ayrılır?',
        answer:
          "Dört bölüme ayrılır: Yukarı Fırat, Erzurum-Kars, Yukarı Murat-Van ve Hakkari bölümleri. Bu ayrım 1941'de toplanan Birinci Coğrafya Kongresi'nde yapılmıştır.",
      },
      {
        question: "Türkiye'nin en yüksek dağı hangi bölgededir?",
        answer:
          "Doğu Anadolu Bölgesi'ndedir. Ağrı ilinin kuzeydoğusundaki Ağrı Dağı 5.137 metredir ve ülkenin sürekli buzul örtüsü bulunan tek zirvesidir.",
      },
      {
        question: "Türkiye'nin en büyük gölü hangi bölgededir?",
        answer:
          "Doğu Anadolu Bölgesi'ndedir. Van Gölü 3.713 kilometrekare yüzölçümüyle Türkiye'nin en büyük gölü ve dünyanın en büyük sodalı gölüdür.",
      },
      {
        question: "Doğu Anadolu Bölgesi'nde hangi iller ülke sınırındadır?",
        answer:
          'Ardahan, Gürcistan ve Ermenistan sınırına yakın bir plato üzerinde kuruludur. Hakkari ise Irak ve İran sınırına bitişiktir.',
      },
    ],
    sourcesNoteTr:
      '`V2SourcesSection scope="turkiye"` artı iki satır:\n\n*Bölge toplamları, bölgedeki illerin tek tek değerlerinin toplanmasıyla elde edilmiştir.*\n\n*Coğrafi bölge ve bölüm ayrımı: Birinci Coğrafya Kongresi, 6-21 Haziran 1941, Raporlar,\nMüzakereler, Kararlar. T.C. Maarif Vekilliği.*',
    footnotes: [
      'Nüfus ve yüzölçümü değerleri, bölgedeki illerin tek tek değerlerinin toplamıdır. TÜİK bölgesel istatistiklerini İBBS Düzey-1 sınıflandırmasına göre yayımlar; o sınıflandırma 12 bölgeden oluşur ve buradaki yedili coğrafi bölge ayrımından ayrıdır. Alan payı, 81 ilin yüzölçümü toplamı olan 780.040 km² üzerinden hesaplanmıştır.',
    ],
  },
  {
    region: GeographicRegion.GuneydoguAnadolu,
    slug: 'guneydogu-anadolu',
    nameTr: 'Güneydoğu Anadolu Bölgesi',
    headingName: 'Güneydoğu Anadolu',
    metaTitle: 'Güneydoğu Anadolu Bölgesi: 9 İl ve Sulama Coğrafyası',
    metaDescription:
      "Güneydoğu Anadolu Bölgesi'nin dokuz ilinde 9,6 milyon kişi yaşar. Fırat ve Dicle havzaları, plato arazisi, iklimi ve bölgenin iki coğrafi bölümü bir arada.",
    h1: 'Güneydoğu Anadolu Bölgesi',
    introTr:
      "Güneydoğu Anadolu Bölgesi, Türkiye'nin güneydoğusunda, Güneydoğu Toroslar'ın güney eteğinden ülke sınırına inen geniş bir plato alanıdır. Dokuz ilinde 9,6 milyon kişi yaşar. Bölgeyi tanımlayan iki nehir Fırat ve Dicle'dir; ikisi de bölgenin kuzeyindeki dağlardan gelir ve aralarındaki plato, sulama yatırımlarıyla bölgenin tarım coğrafyasını yeniden kurmuştur.",
    highestPointName: 'Yazlıca (Herekul) Dağı',
    highestPointElevationM: 2838,
    highestPointProvince: 'Siirt',
    coastalSeas: [],
    neighborRegions: ['Doğu Anadolu', 'Akdeniz'],
    neighborCountries: ['Suriye (Kilis', 'Şanlıurfa', 'Şırnak)', 'Irak'],
    subregions: ['Orta Fırat Bölümü', 'Dicle Bölümü'],
    gdpShareApproxPercent: 6.1,
    locationAndBordersTr:
      "Güneydoğu Anadolu Bölgesi Türkiye'nin güneydoğusundadır ve denize kıyısı yoktur. Bölgenin\ngüney kenarı ülkenin kara sınırıyla çakışır.\n\nÜç ilin sınır konumu kaynaklı olarak kayıtlıdır. [Kilis](/v2/turkiye/kilis), Gaziantep\nPlatosu'nun güneybatı ucunda, Türkiye-Suriye sınırı boyunca kuruludur.\n[Şanlıurfa](/v2/turkiye/sanliurfa) Fırat Nehri ile Suriye sınırı arasında geniş bir plato\nüzerinde yer alır ve Şanlıurfa Platosu güneyde bu sınıra doğru alçalır.\n[Şırnak](/v2/turkiye/sirnak) ise Türkiye'nin Irak ve Suriye ile sınır komşusu olduğu bölgede\nkuruludur; ilin güneyindeki Habur Sınır Kapısı, Türkiye'nin Irak'a açılan başlıca kara sınır\nkapısıdır ve Habur Çayı Türkiye-Irak sınırının bir bölümünü çizer.\n\nKara komşuluğu yalnız iki bölgeyle kurulur ve bu, yedi bölge içindeki en dar iç komşuluktur.\nKuzeyde Adıyaman, Diyarbakır, Batman, Siirt ve Şırnak, Doğu Anadolu Bölgesi'nden Malatya,\nElazığ, Bingöl, Muş, Bitlis, Van ve Hakkari ile ayrılır. Batıda Gaziantep ve Adıyaman,\nAkdeniz Bölgesi'nden Hatay, Osmaniye ve Kahramanmaraş ile sınırdaştır.\n\nKilis'in Türkiye içindeki tek il komşusu Gaziantep'tir.",
    landformsTr:
      "Bölgenin arazisi kuzeyden güneye alçalan bir plato düzenidir. Kuzey kenarı Güneydoğu\nToroslar'ın güney etekleridir; güneye gidildikçe yükselti düşer ve ülke sınırına doğru geniş\ndüzlükler açılır. Şanlıurfa Platosu, Karacadağ ile Fırat Nehri arasında uzanır ve güneyde\nalçalır. Gaziantep Platosu, Sof Dağları ile çevresindeki tepelerin sınırladığı, Pliyo-Kuvaterner\nvolkanizması ve akarsu aşındırmasıyla şekillenmiş hafif eğimli bir yüzeydir.\n\nBu düzenin ortasında bir volkan durur. [Diyarbakır](/v2/turkiye/diyarbakir) ile Şanlıurfa\narasında yükselen Karacadağ, Kolubaba zirvesiyle 1.957 metreye ulaşan bir kalkan volkanıdır.\nVolkanik faaliyet Geç Miyosen'de başlar, Geç Pliyosen ve Kuvaterner'de sürer; MTA bazı\nlavların Holosen'e ait olduğunu değerlendirir ve dağı Türkiye'nin aktif volkanları arasında\nsayar. Yaklaşık 10.000 kilometrekarelik bazalt lav örtüsü, dağı Akdeniz çevresindeki en geniş\ntaban alanına sahip volkanlardan biri yapar. Bu örtü doğuda Dicle Vadisi'ne kadar uzanır ve\nDiyarbakır'ın tarihî surlarının yapı malzemesini oluşturur.\n\nOvalar ve eşikler bölgenin ikinci belirleyicisidir. [Mardin](/v2/turkiye/mardin) Dağları,\ngüneydeki Mezopotamya ovasından 600-1.000 metre, yer yer 1.200 metreye varan bir yükseklikle\nayrılır; bu yükselti Mardin Eşiği adıyla anılan belirgin bir coğrafi sınırdır. Şanlıurfa'nın\nHarran, Suruç, Viranşehir ve Ceylanpınar ovaları ile Gaziantep'in İslahiye, Barak ve Araban\novaları bölgenin başlıca düzlükleridir.\n\nDoğuya gidildikçe arazi sertleşir. [Siirt](/v2/turkiye/siirt)'in en yüksek noktası 2.838\nmetrelik Yazlıca (Herekul) Dağı'dır ve Botan Çayı burada Türkiye'nin en sarp ve derin\nvadilerinden birini oyar; vadinin bir bölümü 2019'da millî park ilan edilmiştir. Şırnak'ta\nyükselti batıdan doğuya belirgin biçimde artar: Cizre ve Silopi 400-550 metre dolayında alçak\novalarla kaplıyken, merkez ile Uludere-Beytüşşebap kesimi 1.000 metrenin üzerinde sarp bir\narazidir. Elips biçimindeki Cudi Dağı'nın üzerinde 2.000 metreyi aşan dört doruk bulunur ve en\nyükseği 2.114 metredir.\n\nKireçtaşı örtülü kesimlerde karstik arazi gelişmiştir. Şanlıurfa'nın Çaykuyu, Arat, Tektek ve\nBaziki platoları bu yapının en belirgin örnekleridir.",
    climateAndVegetationTr:
      "Güneydoğu Anadolu, Köppen sınıflandırmasına göre tek parça olan iki bölgeden biridir. Dokuz\nilin dokuzu da `Csa` sınıfındadır; diğeri Akdeniz Bölgesi'dir.\n\nMEB coğrafya müfredatının adları ise bir ayrım getirir. Yedi ilde Güneydoğu Anadolu karasal\niklimi, batıdaki Gaziantep ile Kilis'te Akdeniz iklimi görülür. İki adın da aynı\nKöppen sınıfına karşılık gelmesi, ders kitabı adı ile Köppen kodunun neden ayrı ölçütlere\ndayandığını gösteren açık bir örnektir.\n\nSayısal aralık bölgenin iç farkını verir. İllerin 1991-2020 dönemi yıllık ortalama sıcaklığı\n12,6 ile 17,4 santigrat derece arasındadır; en düşük değer Şırnak'ta, en yüksek değer\nŞanlıurfa'dadır. Yıllık toplam yağış 388 milimetre ile 833 milimetre arasında değişir. En\nkurak il Kilis, en yağışlı il Siirt'tir. İl merkezlerinin rakımı 550 metre ile 1.350 metre\narasında dağılır.\n\nDoğal bitki örtüsü şiddetli yaz kuraklığı ve yüksek buharlaşma koşullarına uyum sağlamış\nkurakçıl bitkilerden oluşur. MEB coğrafya müfredatı Türkiye'yi beş kuşağa ayırır ve bölgenin\nbüyük kısmı antropojen bozkır alanına girer. İnsan etkisi ve aşırı otlatmayla orman örtüsünün\nyok olduğu platolarda otsu step türleri ile kurakçıl çalılar yaygınlaşmıştır.\n\nToroslar'a komşu yüksek dağ eteklerinde meşe kalıntılarından oluşan kuru orman izleri görülür.\nŞanlıurfa'nın Tektek Dağları'nda geniş bir alana yayılan yabani fıstık ağaçları ise bölgenin\ngeçmişteki doğal bitki varlığını simgeleyen en belirgin yerel topluluktur.",
    hydrographyTr:
      "Bölgenin su ağını iki büyük nehir kurar ve ikisi de bölgenin kuzeyindeki dağlardan gelir.\nFırat batı kanadı, Dicle doğu kanadı toplar; aralarındaki plato ise bölgenin tarım alanıdır.\n\nFırat, Şanlıurfa'nın batı sınırını çizer ve [Adıyaman](/v2/turkiye/adiyaman) topraklarından\n180 kilometre boyunca geçer. Nehir üzerindeki Atatürk Barajı, 817 kilometrekarelik göl alanı\nve 48,5 milyar metreküplük su hacmiyle Güneydoğu Anadolu Projesi'nin en büyük barajıdır;\ngövdesinin temelden yüksekliği 169 metre, toplam kurulu gücü 2.400 megavattır. Baraj gölü\nAdıyaman'ın doğu ve güneydoğu sınırının büyük bölümünü oluşturur. Gaziantep sınırına yakın\nkesimde Birecik ve Karkamış barajları yer alır.\n\nBu suyun ovaya taşınması bölgenin kendi mühendislik hikâyesidir. Atatürk Barajı'ndan çıkan su,\n26,4 kilometre uzunluğundaki iki paralel Urfa Tüneli aracılığıyla Harran Ovası'na ulaştırılır.\n9 Kasım 1994'te suyla buluşan tüneller, cazibeyle 358.000 hektar ve pompajla 118.000 hektar\nolmak üzere toplam 476.000 hektar araziyi sulamaktadır.\n\nDicle doğu kanadı toplar. Toplam uzunluğu 1.900 kilometre olan nehrin 523 kilometresi Türkiye\ntopraklarından geçer. Nehir Elazığ sınırları içinden doğar, Diyarbakır'ın bazalt sahanlığına paralel\nakar, Batman ile Mardin arasındaki sınırın bir bölümünü çizer. Nehir üzerindeki Kralkızı ve\nDicle barajları aynı proje kapsamında sulama ve enerji üretimi amacıyla işletilir.\n[Batman](/v2/turkiye/batman) Çayı kuzeydeki dağlardan doğup güneye akarak Dicle'ye karışır;\nSiirt'in Botan Çayı ise Kezer ve Başur çaylarıyla birleştikten sonra aynı nehre katılır.\nŞırnak'ın Kızılsu, Hezil ve Habur çayları da bu havzanın kollarıdır.\n\nBölgenin doğal gölü yok denecek kadar azdır. Mardin'de doğal göl bulunmaz ve sulama küçük bir\ngöletle yapılır. Gaziantep'te çok sayıda pınar bulunmasına karşın doğal göl yoktur. Kilis'in\nsu ağı ise ikiye ayrılır: batı kesimi Afrin Çayı ve kolları aracılığıyla Amik Ovası üzerinden\nAsi Nehri'ne bağlanır, doğu kesimindeki küçük akarsular ise kapalı bir havzaya boşalır.",
    settlementAndPopulationTr:
      "Bölgede 9.587.992 kişi yaşar ve bu, ülke nüfusunun %11,14'üne karşılık gelir. Alan payı\n%9,74'tür. Kilometrekareye 126 kişi düşer; Türkiye ortalaması 110 kişidir.\n\nYerleşme az sayıda büyük merkezde toplanır. Bölgede 82 ilçe vardır ve bu, yedi bölgenin en az\nilçe sayısıdır; buna karşılık ilçe başına yaklaşık 117 bin kişi düşer ve bu değer, Marmara'nın\nardından ikinci sıradadır. Türkiye genelinde ilçe başına 88 bin kişi düşer.\n\nNüfus üç ilde yoğunlaşır. Şanlıurfa 2.265.800, Gaziantep 2.222.415 ve Diyarbakır 1.852.356\nkişidir. Üçü birlikte bölge nüfusunun yaklaşık üçte ikisini taşır. En küçük il Kilis 157.363\nkişidir ve nüfus bakımından Türkiye'nin en küçük beşinci ilidir. Gaziantep'in Şahinbey\nilçesi, 957.792 kişiyle Türkiye'nin en kalabalık ikinci ilçesidir; aynı ilin Şehitkamil\nilçesi 905.880 kişiyle beşinci sıradadır. Yüzölçümünde en geniş il 19.242 kilometrekareyle\nŞanlıurfa, en küçüğü 1.412 kilometrekareyle Kilis'tir.\n\nBölgenin yaş yapısı da ayrışır. Şanlıurfa, 21,8 ortanca yaşla Türkiye'nin en genç nüfuslu\nilidir.\n\nŞehirleşme oranı iki gruba ayrılır. Dört il büyükşehir statüsündedir ve büyükşehirlerde belde\nile köylerin idari tüzel kişiliği 6360 sayılı Kanun'la kaldırıldığı için TÜİK il/ilçe merkezi\nnüfus oranı %100 görünür. İdari bir tanımdan doğan bu oran, fiilî kentleşme düzeyini ölçmez.\nKalan beş ilde oran gerçek bir hesaptır ve %68,3 ile %84,1 arasında değişir; en düşük değer\nŞırnak'ta, en yüksek değer Batman'dadır.\n\nGöç yönü ağırlıklı olarak dışarıyadır. 2024 net göç hızı dokuz ilin yedisinde negatiftir; en\ndüşük değerler Siirt'te binde -33,96, Şırnak'ta binde -14,08 ve Şanlıurfa'da binde -8,52'dir.\nPozitif olan iki il Gaziantep binde +3,09 ve Adıyaman binde +1,86'dır.",
    economyTr:
      "Bölgenin dokuz ili, Türkiye gayrisafi yurt içi hasılasının yaklaşık %6,1'ini üretir. Bu değer,\nbölgenin %11,14'lük nüfus payının belirgin biçimde altındadır.\n\nAğırlık batı ucunda toplanır. [Gaziantep](/v2/turkiye/gaziantep) %1,9 ile bölgenin en yüksek\npayına sahiptir; onu %1,1 ile Şanlıurfa ve %1,0 ile Diyarbakır izler. Kalan altı ilin payı\ntoplamda %2,1'dir.\n\nBölgenin iki kaynaklı sanayi olgusu vardır ve ikisi de Batman'dadır. Raman Dağı'nın adını\ntaşıyan Raman sahası, Türkiye'nin ilk petrol üretiminin yapıldığı yerdir: 1940'ta açılan\nRaman-1 kuyusunda petrol tespit edilmiş, 1948'de Raman-8 kuyusundan ekonomik ölçekte üretime\ngeçilmiştir. 1955'te açılan Batman Rafinerisi ise Türkiye'nin ilk modern petrol rafinerisidir.\n\nBölgenin tarımsal yapısı, Güneydoğu Anadolu Projesi (GAP) kapsamında inşa edilen Atatürk\nBarajı ve Urfa Tünelleri sayesinde köklü bir dönüşüm geçirmiştir. Tüneller aracılığıyla\nHarran Ovası ve çevre ovalarda sulanan 476.000 hektarlık tarım arazisi, pamuk, mısır, buğday\nve kırmızı mercimek üretiminin temel sahasıdır. Şanlıurfa ve Gaziantep'in kurak plato\nyamaçlarında ise antep fıstığı ve zeytin tarımı yaygın bir ekonomik etkinliktir.\n\nSanayi ve enerji üretimi iki ayrı merkezde yoğunlaşır. Gaziantep, dokuma, gıda ve imalat\nsanayisiyle bölgenin en gelişmiş sanayi ve ihracat üssüdür. Batman ise Türkiye'nin petrol\nhavzasıdır: 1940'ta Raman-1 kuyusunda petrol bulunmuş, 1948'de Raman-8 kuyusuyla üretime\ngeçilmiştir. 1955'te açılan Batman Rafinerisi ise Türkiye'nin ilk modern petrol rafinerisi\nolarak ham petrolü işleyen stratejik bir sanayi tesisidir.",
    subregionsTr:
      "Türkiye'nin yedi coğrafi bölgesi 1941'de Ankara'da toplanan Birinci Coğrafya Kongresi'nde\nbelirlendi ve aynı toplantıda yirmi bir bölüme ayrıldı. Güneydoğu Anadolu Bölgesi bunların\nikisini taşır: Orta Fırat Bölümü ve Dicle Bölümü.\n\nOrta Fırat Bölümü batı kanadı kapsar. Fırat'ın orta havzası, Gaziantep ve Şanlıurfa platoları\nile Adıyaman çevresindeki dağ etekleri bu bölümün alanlarıdır. Dicle Bölümü ise doğu kanadı\nkapsar; Diyarbakır havzası, Mardin Eşiği'nin güneyi ve Batman, Siirt, Şırnak'ın Dicle'ye\nbakan kesimleri bu bölümdedir.\n\nBölüm sınırları il sınırlarıyla çakışmaz. Bu sayfada hangi ilin hangi bölümde olduğuna dair\nbir liste verilmez; bölümler kapsadıkları arazi üzerinden tanımlanır.",
    disasterAndEarthquakeTr:
      "Bölgenin batı ucu, Anadolu ve Arap levhalarının sınırını oluşturan Doğu Anadolu Fay Hattı'nın\netki alanındadır ve 2023 deprem dizisi buraya da ulaşmıştır.\n\n6 Şubat 2023'te merkez üssü komşu Kahramanmaraş olan iki büyük depremden Gaziantep de\netkilendi. Cumhurbaşkanı Yardımcısı Fuat Oktay'ın aynı gün yaptığı açıklamaya göre ilde 309\nkişi hayatını kaybetti, 1.597 kişi yaralandı ve 581 bina yıkıldı; hasar en çok Nurdağı ve\nİslahiye ilçelerinde yoğunlaştı.\n\nBölgenin ikinci risk ailesi volkanizmadır ve tek bir alanda toplanır. Diyarbakır ile Şanlıurfa\narasındaki Karacadağ'ı MTA, Türkiye'nin aktif volkanları arasında sayar; kurumun\ndeğerlendirmesine göre bazı lavlar Holosen'e aittir.\n\nBölgenin üçüncü karakteristik risk ailesi şiddetli yaz kuraklığı ve aşırı buharlaşmadır.\nTürkiye'nin en yüksek yaz sıcaklıklarının ve buharlaşma değerlerinin kaydedildiği bölgede,\nyetersiz kış ve ilkbahar yağışları tarımsal kuraklığı tetikler; sulama yapılmayan plato\nsahalarında ürün kaybı ve toprak erozyonu kalıcı bir çevresel tehdit oluşturur.",
    comparisonTr:
      "Güneydoğu Anadolu, denize kıyısı olmayan iki bölgeden biridir. Buna karşın nüfus yoğunluğu\nkilometrekareye 126 kişiyle iki kıyı bölgesinin, Ege ile Akdeniz'in üzerindedir. Diğer\ndenize kıyısı olmayan bölge olan İç Anadolu'da aynı değer 74 kişidir.\n\n| Bölge | İl | Nüfus | Nüfus payı | Yüzölçümü (km²) | Yoğunluk |\n|---|---|---|---|---|---|\n| [Marmara](/v2/turkiye/bolge/marmara) | 11 | 26.711.525 | %31,03 | 72.666 | 368 |\n| [İç Anadolu](/v2/turkiye/bolge/ic-anadolu) | 13 | 13.809.574 | %16,04 | 187.227 | 74 |\n| [Akdeniz](/v2/turkiye/bolge/akdeniz) | 8 | 11.028.175 | %12,81 | 89.516 | 123 |\n| [Ege](/v2/turkiye/bolge/ege) | 8 | 11.011.261 | %12,79 | 89.339 | 123 |\n| **Güneydoğu Anadolu** | **9** | **9.587.992** | **%11,14** | **75.947** | **126** |\n| [Karadeniz](/v2/turkiye/bolge/karadeniz) | 18 | 8.041.038 | %9,34 | 116.379 | 69 |\n| [Doğu Anadolu](/v2/turkiye/bolge/dogu-anadolu) | 14 | 5.902.603 | %6,86 | 148.966 | 40 |\n\n*Nüfus TÜİK ADNKS, 31 Aralık 2025; yüzölçümü Harita Genel Müdürlüğü. Değerler her bölgedeki\nillerin toplamıdır. Paylar 86.092.168 kişilik ve 780.040 km²'lik 81 il toplamı üzerinden\nhesaplanmıştır.*",
    faqs: [
      {
        question: "Güneydoğu Anadolu Bölgesi'nde kaç il var?",
        answer:
          'Dokuz il bulunur: Adıyaman, Batman, Diyarbakır, Gaziantep, Kilis, Mardin, Siirt, Şanlıurfa ve Şırnak.',
      },
      {
        question: "Güneydoğu Anadolu Bölgesi'nin nüfusu ne kadar?",
        answer:
          "Dokuz ilin 31 Aralık 2025 itibarıyla toplam nüfusu 9.587.992 kişidir. Bu, Türkiye nüfusunun %11,14'üne karşılık gelir.",
      },
      {
        question: 'Güneydoğu Anadolu Bölgesi kaç bölüme ayrılır?',
        answer:
          "İki bölüme ayrılır: Orta Fırat Bölümü ve Dicle Bölümü. Bu ayrım 1941'de toplanan Birinci Coğrafya Kongresi'nde yapılmıştır.",
      },
      {
        question: "Güneydoğu Anadolu Bölgesi'nden hangi nehirler geçer?",
        answer:
          'Fırat ve Dicle. Fırat bölgenin batı kanadını, Dicle doğu kanadını toplar; ikisi de bölgenin kuzeyindeki dağlardan gelir.',
      },
      {
        question: "Güneydoğu Anadolu Bölgesi'nde hangi iller ülke sınırındadır?",
        answer:
          "Kilis ve Şanlıurfa Suriye sınırı boyunca kuruludur. Şırnak ise Irak ve Suriye sınırındadır; ilin güneyindeki Habur Sınır Kapısı Türkiye'nin Irak'a açılan başlıca kara sınır kapısıdır.",
      },
      {
        question: "Türkiye'nin en genç nüfuslu ili hangisidir?",
        answer: "Şanlıurfa'dır. TÜİK'in ADNKS verilerine göre ortanca yaşı 21,8'dir.",
      },
    ],
    sourcesNoteTr:
      '`V2SourcesSection scope="turkiye"` artı iki satır:\n\n*Bölge toplamları, bölgedeki illerin tek tek değerlerinin toplanmasıyla elde edilmiştir.*\n\n*Coğrafi bölge ve bölüm ayrımı: Birinci Coğrafya Kongresi, 6-21 Haziran 1941, Raporlar,\nMüzakereler, Kararlar. T.C. Maarif Vekilliği.*',
    footnotes: [
      'Nüfus ve yüzölçümü değerleri, bölgedeki illerin tek tek değerlerinin toplamıdır. TÜİK bölgesel istatistiklerini İBBS Düzey-1 sınıflandırmasına göre yayımlar; o sınıflandırma 12 bölgeden oluşur ve buradaki yedili coğrafi bölge ayrımından ayrıdır. Alan payı, 81 ilin yüzölçümü toplamı olan 780.040 km² üzerinden hesaplanmıştır.',
    ],
  },
];
