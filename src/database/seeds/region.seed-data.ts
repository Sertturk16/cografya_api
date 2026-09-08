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
      "Marmara Bölgesi, Türkiye'nin kuzeybatısında Asya ile Avrupa kıtalarını birbirine bağlayan doğal bir köprü konumundadır. Karadeniz, Marmara Denizi ve Ege Denizi ile çevrili olması, bölgeyi üç farklı denizel etkiye açarken aynı zamanda Türkiye'nin Avrupa kıtasındaki (Trakya) tüm topraklarını bünyesinde toplar.\n\nBölgenin uluslararası sınırları Trakya üzerinden Balkanlar'a açılır. Kırklareli kuzeyde Bulgaristan ile, Edirne ise hem Bulgaristan hem de batıda Meriç Nehri hattı boyunca Yunanistan ile komşudur. Kapıkule ve İpsala gibi sınır kapıları, Anadolu'nun Avrupa ile kara yolu ve demir yolu transit ticaretinin ana koridorlarını oluşturur.\n\nİç sınırlarda bölge; güneyde Balıkesir, Bursa ve Bilecik üzerinden Ege Bölgesi'yle; doğuda Sakarya ve Bilecik üzerinden Karadeniz Bölgesi'yle; güneydoğuda ise Bilecik üzerinden İç Anadolu Bölgesi'yle komşudur. Bu geniş geçiş konumu, bölgenin iç ve dış ulaşım ağlarının kesişim noktası olmasını sağlamıştır.",
    landformsTr:
      "Marmara, Türkiye'nin ortalama yükseltisi en az olan ve engebesi en düşük coğrafi bölgesidir. Bölgenin ana morfolojik omurgasını dağ sıralarından ziyade İstanbul ve Çanakkale boğazları ile Marmara Denizi çöküntü çanağı belirler. Karadeniz ile Akdeniz su sistemini birbirine bağlayan boğazlar, dördüncü jeolojik zamanda (Kuvaterner) eski akarsu vadilerinin deniz suları altında kalmasıyla (riya tipi kıyı) oluşmuş ve iki kıtayı birbirinden ayırmıştır.\n\nYükseltiler bölgenin kenarlarında toplanır. Güneyde 2.543 metreye ulaşan Uludağ, bölgenin en yüksek noktasıdır; kuzey yamaçlarındaki sirk gölleri, Türkiye'de buzul aşındırmasının en batıdaki izlerini taşır. Trakya'nın Karadeniz kıyısı boyunca uzanan Yıldız Dağları (Mahya Tepesi 1.031 m), Karadeniz'in nemli hava kütlelerini kıyıda tutarak iç kesimdeki Ergene çöküntüsünü kuraklaştırır. Güneybatıda ise Kaz Dağları, Biga Yarımadası ile Ege arasında ormanlık yüksek bir kütle oluşturur.\n\nDağlık kenarların arasında kalan geniş sahalar ise alçak plato ve aşınım düzlükleridir. İstanbul ve Kocaeli, aşınmış Kocaeli Platosu üzerinde gelişmiştir; en yüksek tepe olan Aydos ancak 538 metreye ulaşır. Trakya'nın iç çanağında uzanan Ergene Havzası ise akarsu alüvyonlarıyla dolmuş, tarıma son derece elverişli dalgalı bir düzlüktür.\n\nBölgeyi boydan boya kesen Kuzey Anadolu Fay Hattı, Marmara Denizi tabanındaki 1.000 metreyi aşan derin çukurlukları oluşturduktan sonra Şarköy-Gaziköy hattından karaya çıkarak Ganos Dağları üzerinden Saros Körfezi'ne bağlanır.",
    climateAndVegetationTr:
      "Marmara, tek bir iklim tipinin değil; Karadeniz, Akdeniz ve karasal iklimlerin karşılaştığı bir geçiş sahasıdır. Bu iklim mozaiği, yer şekillerinin alçak olması ve üç denizin farklı hava kütlelerinin iç içe geçmesinden kaynaklanır.\n\nKuzeyde Karadeniz kıyı kuşağı (Kocaeli, Sakarya ve Yıldız Dağları'nın kuzey yamaçları) her mevsim yağışlı ve ılımandır. Güney Marmara kıyıları (Bursa, Balıkesir, Çanakkale) yazları sıcak ve kurak geçen tipik Akdeniz karakteri taşır. Yıldız Dağları'nın arkasında kalan Ergene Havzası (Edirne, Tekirdağ, Kırklareli) ise deniz etkisine kapalı olduğu için kışları sert, yazları sıcak ve kurak bir karasal iklim yaşar.\n\nBitki örtüsü de bu iklim geçişini doğrudan yansıtır. Karadeniz'e bakan yamaçlarda kayın, kestane ve meşelerden oluşan nemli ormanlar ile nemcil çalılar (psödomaki) yer alır. Güney kıyılarda ise zeytinlikler ve maki toplulukları hâkimdir. Ancak enlem etkisi ve sıcaklıkların düşmesi nedeniyle maki üst sınırı, Akdeniz kıyılarındaki 800 metreden Marmara'da 300-400 metreye kadar iner. İç kısımdaki Ergene çanağında ise ormanların tahrip edildiği düzlüklerde bozkırlar (antropojen step) uzanır.",
    hydrographyTr:
      "Bölgenin hidrografik yapısı, alçak düzlükleri sulayan akarsular ve tektonik çöküntü göllerinden oluşur.\n\nTrakya'nın su ağını Meriç, Tunca ve Ergene nehirleri örer. Bulgaristan'dan doğup Türkiye-Yunanistan sınırını çizen Meriç Nehri, Edirne'de Tunca ile birleşerek geniş taşkın ovaları oluşturur; bu alüvyal zemin Türkiye'nin en büyük pirinç (çeltik) üretim sahasıdır. Trakya'nın iç kesimini toplayan Ergene Nehri ise Meriç'e katılarak Enez yakınlarında Ege'ye dökülür.\n\nDoğu kanatta Sakarya Nehri, İç Anadolu'dan taşıdığı suları Bilecik üzerinden geçirerek Sakarya'da Karadeniz'e ulaştırır ve ağzında tarımsal açıdan verimli bir taşkın ovası meydana getirir.\n\nBölgenin büyük gölleri Güney Marmara'daki tektonik fay çukurluklarında sıralanır. Bursa sınırlarındaki İznik Gölü (298 km²), bölgenin en büyük doğal gölü olup tatlı suyuyla çevresindeki zeytin ve meyve bahçelerini besler. Uluabat Gölü ise sığ yapısı ve zengin biyolojik çeşitliliğiyle uluslararası öneme sahip bir sulak alandır. Kocaeli ve Sakarya sınırındaki Sapanca Gölü ise hem bölgesel içme suyu temininde hem de sanayi kullanımında kritik bir tatlı su rezervidir.",
    settlementAndPopulationTr:
      "Marmara, 26,7 milyonu aşan nüfusuyla Türkiye nüfusunun yaklaşık üçte birini (%31,03) barındırır. Kilometrekareye düşen 368 kişilik nüfus yoğunluğu, 110 kişilik Türkiye ortalamasının üç katından fazladır ve bölgeyi açık ara ülkenin en yoğun yerleşim alanı yapar.\n\nBu yoğunluk bölge geneline eşit dağılmaz; fiziki coğrafyanın sunduğu ulaşım ve liman avantajlarına göre keskin bir kümelenme gösterir. İstanbul tek başına 15,7 milyonu aşan nüfusuyla bölgenin yarısından fazlasını toplar. İzmit Körfezi, Çorlu-Çerkezköy hattı ve Bursa Ovası sanayi, liman ve kara yolu bağlantıları sayesinde yoğun göç alarak hızla şehirleşmiştir; nitekim Yalova ve Tekirdağ Türkiye'nin en yüksek net göç hızına sahip illeri arasındadır.\n\nBuna karşılık ulaşım koridorlarının uzağında kalan, arazisi dağlık ve ormanlık olan Yıldız Dağları kesimi ile Biga Yarımadası'nın engebeli iç sahaları bölgenin en tenha alanları olarak kalmıştır.",
    economyTr:
      "Marmara Bölgesi, Türkiye gayrisafi yurt içi hasılasının yaklaşık %43'ünü üreterek ülke ekonomisinin üretim ve finans omurgasını oluşturur. Bu ekonomik güç, iki kıtayı bağlayan jeostratejik konumu, korunaklı deniz limanları ve düz topoğrafyasının sağladığı kesintisiz ulaşım ağlarına dayanır.\n\nİmalat sanayisi, lojistik ve finans hizmetleri İstanbul, Kocaeli ve Bursa ekseninde kümelenmiştir. İzmit Körfezi boyunca uzanan limanlar ve tesisler Türkiye dış ticaretinin en büyük kapısıdır. Tekirdağ ve Çorlu çevresi ise tekstil ve kimya sanayisiyle Trakya'nın üretim merkezidir.\n\nTarımsal üretim arazinin jeomorfolojik çeşitliliğine uyum sağlamıştır. Ergene Havzası'nın düz tabanı ayçiçeği ve buğday tarımına ayrılmışken, Meriç taşkın sahalarında çeltik üretilir. Güney Marmara'nın verimli çöküntü ovalarında (Bursa, Balıkesir) sebze, meyve ve konserve sanayisi gelişmiştir; Marmara ve Ege kıyı yamaçlarında ise zeytincilik ve bağcılık yaygındır. Ayrıca boğazlar ve Marmara Denizi, balık göç yolları üzerinde yer alarak kıyı balıkçılığına olanak tanır.",
    subregionsTr:
      "Türkiye'nin 1941 Birinci Coğrafya Kongresi'nde belirlenen tasnifine göre Marmara Bölgesi, yer şekilleri ve iklim farklarına dayanan dört coğrafi bölüme ayrılır:\n\n1. **Yıldız Dağları Bölümü:** Trakya'nın Karadeniz kıyısı boyunca uzanan, nemli ve ormanlık dağlık arazidir; nüfusu seyrektir.\n2. **Ergene Bölümü:** Yıldız Dağları'nın güneyinde, Ergene Nehri'nin suladığı alüvyonlu dalgalı tahıl ve ayçiçeği düzlüğüdür.\n3. **Çatalca-Kocaeli Bölümü:** İstanbul ve Çanakkale boğazlarının iki yakasındaki alçak platoları kapsar; Türkiye'nin en yoğun sanayi, ticaret ve kentleşme aksıdır.\n4. **Güney Marmara Bölümü:** Samanlı Dağları'ndan Biga Yarımadası ve Uludağ'a kadar uzanan; tektonik göller, verimli tarım ovaları ve zeytinliklerle kaplı engebeli güney kuşağıdır.",
    disasterAndEarthquakeTr:
      "Marmara'nın başlıca doğal afet gerçeği sismik hareketliliktir. Kuzey Anadolu Fay Hattı'nın kuzey kolu Marmara Denizi tabanındaki derin çukurluklardan geçer ve Şarköy üzerinden Saros Körfezi'ne uzanır. Tarihsel süreçte 1855 Bursa, 1912 Mürefte ve 1999 Gölcük depremleri gibi büyük sarsıntılar bu fay sisteminin hareketleriyle meydana gelmiştir.\n\nRisk yalnızca fay hattına yakınlıktan değil, nüfus ve sanayinin alüvyon dolgulu zeminler ve kıyı düzlüklerinde toplanmasından kaynaklanır. Özellikle çöküntü havzalarında gevşek zemin üzerine inşa edilmiş yoğun yerleşimler, deprem dalgalarının büyütülmesi nedeniyle yüksek hasar riski taşır.\n\nKuzey kesimlerdeki dik vadilerde aşırı yağış dönemlerinde sel ve taşkınlar, eğimli yamaçlarda ise yer yer heyelanlar ikincil riskler olarak ortaya çıkar.",
    comparisonTr:
      "Marmara, Türkiye yüzölçümünün onda birinden az bir alan kaplamasına (%9,32) karşın, ülke nüfusunun neredeyse üçte birini (%31,03) ve milli hasılanın %43'ünü barındırır. Kilometrekareye düşen 368 kişilik nüfus yoğunluğu, düz yer şekilleri ve kıtalararası ticaret aksının yarattığı devasa beşeri yığılmayı özetler.",
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
      'Bölgeye ait demografik ve mekânsal veriler, TÜİK Adrese Dayalı Nüfus Kayıt Sistemi (ADNKS 2025) ile Harita Genel Müdürlüğü (HGM) resmi il yüzölçümü tescillerinden konsolide edilmiştir.\n\nTÜİK bölgesel bültenlerini İBBS Düzey-1 (12 bölge) normunda yayımlamaktadır; buradaki toplamlar ise Cumhuriyet döneminin temel coğrafi tasnifi olan 7 klasik coğrafi bölgeye göre illerin değerleri toplanarak elde edilmiştir. Bölge ve alt bölüm sınırlarının tespitinde 6-21 Haziran 1941 tarihli Birinci Türk Coğrafya Kongresi kararları esas alınmıştır.',
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
      "Ege Bölgesi, Anadolu Yarımadası'nın batısında, Ege Denizi kıyılarından İç Anadolu eşiğine kadar uzanır. Bölgenin batı sınırını çizen kıyı şeridi; çok sayıda koy, körfez, yarımada ve ada ile Türkiye'nin en girintili çıkıntılı deniz cephesini oluşturur; yalnızca Muğla kıyıları yaklaşık 1.480 kilometreyle Türkiye'nin en uzun il kıyı şerididir.\n\nBölgenin hiçbir yabancı ülkeyle kara sınırı bulunmaz; buna karşılık Ege Denizi üzerinden Yunanistan'a bağlı adalarla yakın bir deniz komşuluğu paylaşır.\n\nİç sınırlarda bölge üç komşuya açılır: Kuzeyde İzmir, Manisa ve Kütahya üzerinden Marmara Bölgesi'yle; doğuda Afyonkarahisar ve Kütahya üzerinden İç Anadolu Bölgesi'yle; güneyde ise Muğla, Denizli ve Afyonkarahisar üzerinden Akdeniz Bölgesi'yle sınırdaştır. Doğu-batı doğrultusunda uzanan vadi olukları, kıyı şeridini Anadolu'nun iç kesimlerine kesintisiz bağlayan doğal ulaşım koridorları sunar.",
    landformsTr:
      "Ege Bölgesi'nin morfolojik omurgasını, yer kabuğunun kırılmasıyla (faylanma) oluşan dağ ve çöküntü düzeni (horst-graben sistemi) belirler. Yan basınçlarla gerilen yer kabuğunun kırılması sonucu yüksekte kalan kütleler (horstlar) kıyıya dik uzanan Madra, Yunt, Bozdağlar ve Aydın dağlarını; çöken bloklar (grabenler) ise Bakırçay, Gediz, Küçük Menderes ve Büyük Menderes ovalarını oluşturmuştur.\n\nDağların kıyıya dik uzanması bölgenin coğrafi kaderini belirleyen temel unsurdur. Deniz suları çöken vadilerin ağızlarına sokularak derin körfezler (Edremit, Çandarlı, İzmir, Kuşadası, Güllük) ve yarımadalar yaratmış; kıyıda enine kıyı tipi gelişmiştir. Denizel ılıman hava kütleleri bu vadi koridorları boyunca yaklaşık 150-200 kilometre içeriye sokularak İç Ege eşiğine kadar yayılır.\n\nBu kuralın tek istisnası güneydeki Menteşe Yöresi'dir. Burada dağlar kıyıya paralel ve karmaşık uzanır; arazinin aşırı dağlık ve sarp olması ulaşımı güçleştirmiş ve yöreyi kıyı Ege'nin işlek ticaret aksından ayırmıştır.\n\nİç kesimlere doğru yükselti basamaklar hâlinde artar: Denizli'deki Honaz Dağı (2.571 m) bölgenin en yüksek zirvesidir. Kütahya'daki Murat Dağı (2.312 m) ise İç Batı Anadolu platosunun engebeli çatısını oluşturur. Pamukkale'deki dünyaca ünlü traverten basamakları da bu yoğun faylanma ağından yüzeye çıkan kalsiyum bikarbonatlı termal suların kirecini çökelterek yüzeyi kaplamasıyla oluşmuştur.",
    climateAndVegetationTr:
      "Ege Bölgesi, dağların uzanış doğrultusu ve kıyıdan iç kesime doğru artan yükselti nedeniyle belirgin bir iklim geçişine sahne olur.\n\nKıyı Ege'de (İzmir, Aydın, Manisa, Muğla) sıcak ve kurak yazlar ile ılık ve yağışlı kışların yaşandığı tipik Akdeniz iklimi egemendir. Dağların kıyıya dik uzanması sayesinde Akdeniz ikliminin ılımanlaştırıcı etkisi ve zeytin tarımı Gediz ve Menderes grabenleri boyunca Afyon ve Uşak sınırına kadar sokulur. Ancak yükseltinin 1.000 metreyi aştığı İç Batı Anadolu platosuna (Kütahya, Afyonkarahisar, Uşak) geçildiğinde deniz etkisi tamamen kesilir; yerini kışları karlı ve don olaylı, yazları kurak geçen sert karasal iklime bırakır.\n\nBitki örtüsü de bu coğrafi geçişi izler. Kıyı kuşağında kızılçam ormanlarının tahrip edildiği sahalarda zeytin, defne, mersin ve lavantadan oluşan maki ile kireçli arazilerde garig toplulukları yaygındır. Ege'de maki üst sınırı enlem etkisiyle 400-600 metre bandında kalır. Dik yamaçları denizden gelen nemli hava kütlelerini yakalayan Menteşe Dağları ise Türkiye'nin en bol yağış alan sahalarından biri olup gür kızılçam ve karaçam ormanlarıyla kaplıdır. İç kısımdaki yüksek platolarda ise otsu bozkırlar (step) geniş alan tutar.",
    hydrographyTr:
      "Bölgenin akarsu ağını, graben vadileri boyunca doğudan batıya akıp Ege Denizi'ne dökülen nehirler kurar. Bu nehirlerin en uzunu Afyonkarahisar'dan doğan Büyük Menderes (584 km), ikincisi ise Manisa ovalarını sulayan Gediz'dir (386 km). Küçük Menderes ve Bakırçay da aynı kırık vadilerini izler.\n\nVadi tabanlarında eğimin azalması nedeniyle bu nehirler geniş büklümler (menderesler) çizerek akar ve taşıdıkları bol alüvyonla deniz kıyısında geniş deltalar oluştururlar. Gediz'in oluşturduğu Menemen Deltası (İzmir Kuş Cenneti) ile Büyük Menderes Deltası Türkiye'nin en önemli sulak alanları arasındadır. Bu alüvyal yığılma tarihte o kadar hızlı gerçekleşmiştir ki; antik çağın en önemli liman kentleri olan Efes ve Milet, denizden kilometrelerce içeride kalarak liman işlevlerini kaybetmiştir.\n\nDoğal göller bakımından bölge zengin değildir ancak özgün oluşumlar barındırır. Aydın ve Muğla sınırındaki Bafa (Çamiçi) Gölü, Büyük Menderes'in taşıdığı alüvyonların eski bir deniz koyunun önünü kapatmasıyla oluşmuş bir alüvyal set gölüdür. Köyceğiz Gölü ise lagün kökenli olup dar bir kanalla Akdeniz'e bağlanan hassas bir ekosistemdir. İç kesimdeki Afyon Ovası ise dışa akışı olmayan kapalı bir çanak niteliğindedir; sularını Eber ve Akşehir göllerine boşaltır.",
    settlementAndPopulationTr:
      "Ege Bölgesi, 11 milyonu aşan nüfusuyla ülke nüfusunun %12,79'unu barındırır. Kilometrekareye düşen 123 kişilik nüfus yoğunluğu Türkiye ortalamasının (110 kişi/km²) üzerindedir.\n\nNüfus ve şehirleşme, graben ovalarının sunduğu verimli tarım toprakları ve işlek ulaşım koridorları boyunca toplanmıştır. İzmir tek başına 4,5 milyonu aşan nüfusuyla bölge toplamının %41'ini barındırır ve Türkiye'nin üçüncü büyük metropolüdür. Gediz Vadisi üzerinde Manisa, Büyük Menderes üzerinde Aydın ve Denizli önemli sanayi ve tarım merkezleri olarak gelişmiştir. Kıyı şeridinde yer alan Muğla, Aydın ve İzmir dışarıdan sürekli net göç alarak nüfusunu artırmaktadır.\n\nBuna karşın dağlık ve engebeli Menteşe Yöresi ile karasal iklimin ve sert kış koşullarının hüküm sürdüğü İç Batı Anadolu illeri (Afyonkarahisar, Kütahya, Uşak) net göç veren ve nüfus yoğunluğu belirgin biçimde daha düşük kalan alanlardır.",
    economyTr:
      "Ege Bölgesi, Türkiye gayrisafi yurt içi hasılasının yaklaşık %11,9'unu üreterek Marmara ve İç Anadolu'nun ardından üçüncü sırada yer alır. Ekonominin omurgasını tarıma dayalı sanayi, dış ticaret, turizm ve enerji üretimi oluşturur.\n\nGraben tabanlarındaki alüvyal topraklar ve ılıman iklim, bölgeyi Türkiye'nin en kaliteli tarımsal ihracat üssü yapmıştır. Çekirdeksiz kuru üzüm, incir, zeytin, tütün ve pamuk üretiminde Ege ilk sıradadır. İzmir Limanı ve Aliağa tesisleri, bu tarımsal ve sanayi üretimini dünya pazarlarına bağlar. Manisa beyaz eşya ve otomotiv yan sanayisiyle, Denizli ise dokuma ve tekstil ihracatıyla öne çıkar.\n\nYer şekilleri ve tektonik yapı bölgeye zengin enerji kaynakları sunar. Graben kenarlarındaki zengin linyit havzaları Soma ve Yatağan termik santrallerini beslerken; fay hatlarından çıkan jeotermal kaynaklar Denizli (Sarayköy) ve Aydın'da elektrik üretimi, konut ısıtması ve seracılıkta kullanılır. Girintili koyları, yat turizmine uygun doğal marinaları ve zengin antik kent mirası (Efes, Bergama, Pamukkale-Hierapolis) sayesinde kıyı şeridi (Bodrum, Marmaris, Çeşme, Kuşadası) Türkiye'nin önde gelen turizm merkezidir.",
    subregionsTr:
      '1941 Coğrafya Kongresi kararlarına göre Ege Bölgesi iki ana coğrafi bölüme ayrılır:\n\n1. **Ege Bölümü (Asıl Ege):** Batıdaki kıyı kuşağını ve içeriye sokulan Bakırçay, Gediz, Küçük ve Büyük Menderes graben ovaları ile güneydeki Menteşe dağlık yöresini kapsar. Tipik Akdeniz iklimi, zengin tarım, yoğun sanayi, turizm ve yüksek nüfus bu bölümün belirleyici niteliğidir.\n2. **İç Batı Anadolu Bölümü:** Doğuda ortalama 1.000 metrenin üzerinde uzanan yüksek plato ve dağlık kuşağı (Afyonkarahisar, Kütahya, Uşak sahası) içine alır. Karasal iklim koşullarının hâkim olduğu bu bölümde tahıl tarımı, haşhaş ve şeker pancarı üretimi ile madencilik ve hayvancılık ön plandadır.',
    disasterAndEarthquakeTr:
      "Bölgenin başlıca doğal afet riski, Batı Anadolu Fay Sistemi'nin (BASZ) yarattığı yüksek tektonik hareketliliktir. Horstları grabenlerden ayıran fay kırıkları doğrudan yerleşim alanlarının ve verimli ovaların kenarından geçer.\n\n30 Ekim 2020 Sisam açıklarında meydana gelen Mw 6,9 büyüklüğündeki deprem bu zemin riskini çarpıcı biçimde göstermiştir: Merkez üssüne 70 kilometre uzaklıkta olmasına karşın en büyük can kaybı ve yıkım, Bayraklı ve Bornova'daki gevşek alüvyon dolgulu eski delta zeminleri üzerinde yaşanmıştır. Benzer şekilde 1969 Alaşehir ve 1970 Gediz depremleri de bu fay hatlarının tarihsel yıkıcılığını kaydeder.\n\nİkincil bir afet riski ise kuru ve sıcak yaz aylarında Menteşe Yöresi ve kıyı kuşağındaki yoğun kızılçam ormanlarında ortaya çıkan büyük orman yangınlarıdır.",
    comparisonTr:
      'Ege ile Akdeniz, yedi coğrafi bölge arasında mekânsal büyüklük ve demografik hacim bakımından birbirine en yakın ikilidir. İki bölgenin nüfusları arasında yalnızca yaklaşık 17 bin kişi, yüzölçümleri arasında ise sadece 177 kilometrekarelik bir fark bulunur; kilometrekareye düşen 123 kişilik aritmetik nüfus yoğunlukları birebir aynıdır.',
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
      'Bölgeye ait demografik ve mekânsal veriler, TÜİK Adrese Dayalı Nüfus Kayıt Sistemi (ADNKS 2025) ile Harita Genel Müdürlüğü (HGM) resmi il yüzölçümü tescillerinden konsolide edilmiştir.\n\nTÜİK bölgesel bültenlerini İBBS Düzey-1 (12 bölge) normunda yayımlamaktadır; buradaki toplamlar ise Cumhuriyet döneminin temel coğrafi tasnifi olan 7 klasik coğrafi bölgeye göre illerin değerleri toplanarak elde edilmiştir. Bölge ve alt bölüm sınırlarının tespitinde 6-21 Haziran 1941 tarihli Birinci Türk Coğrafya Kongresi kararları esas alınmıştır.',
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
      "Akdeniz Bölgesi, Türkiye'nin güneyinde, Toros Dağları ile Akdeniz kıyısı arasında uzanan uzun ve yay biçimli bir coğrafi şerittir. Batıda Muğla sınırından başlayıp doğuda Hatay üzerinden Suriye sınırına kadar kesintisiz uzanır; yalnızca Mersin kıyıları 320 kilometreyi aşan uzunluğuyla bölgenin ana deniz cephelerinden biridir.\n\nBölgenin uluslararası tek kara sınırı güneydoğu ucunda yer alır: Hatay, Suriye ile komşudur ve Yayladağı ile Cilvegözü sınır kapıları üzerinden Orta Doğu ticaret ve ulaşım hatlarına bağlanır.\n\nİç sınırlarda bölge dört farklı coğrafi bölgeyle komşudur: Batıda Antalya, Burdur ve Isparta üzerinden Ege Bölgesi'yle; kuzeyde Toros Dağları boyunca uzanan sınırlarla İç Anadolu Bölgesi'yle; doğuda Hatay, Osmaniye ve Kahramanmaraş üzerinden Güneydoğu Anadolu Bölgesi'yle; Kahramanmaraş'ın kuzeydoğusunda ise Doğu Anadolu Bölgesi'yle sınırdaştır. Kıyıya paralel yükselen Toros Dağları iç kesimlerle bağlantıyı zorlaştırdığı için ulaşım; Çubuk, Gülek, Sertavul ve Belen gibi tarihsel dağ geçitleri üzerinden sağlanır.",
    landformsTr:
      "Akdeniz Bölgesi'nin morfolojisini Toros Dağları'nın kıyıya paralel uzanışı ve kireçtaşı (kalker) ana kayanın oluşturduğu karstik yer şekilleri belirler. Alp-Himalaya kıvrım kuşağının parçası olan Batı ve Orta Toroslar çoğu yerde denizden hemen sonra aniden yükselir; bu durum kıyı şeridinin dar kalmasına, dik falezlerin (yalıyar) gelişmesine ve boyuna kıyı tipinin ortaya çıkmasına yol açmıştır.\n\nKıyı düzlükleri yalnızca nehirlerin taşıdığı alüvyonlarla oluşmuş delta ovalarında genişler. Seyhan ve Ceyhan nehirlerinin binlerce yılda doldurduğu Çukurova, Türkiye'nin en geniş delta ovası olup Adana'nın tarımsal kalbidir. Göksu'nun denize ulaştığı Silifke Deltası, Antalya kıyı düzlüğü ve Amanos Dağları eteğindeki tektonik Amik Ovası bölgenin diğer ana tarım düzlükleridir.\n\nKalkerli arazinin yağmur ve yer altı sularıyla erimesi sonucu bölge, Türkiye'nin en zengin karst topoğrafyasına kavuşmuştur. Arazide lapya, dolin, uvala ve mağaralar (Damlataş, Karain, Cennet-Cehennem obrukları) yaygındır. Dağlık kesimde karstik erimeyle açılan geniş çanaklar (polyeler; Elmalı, Kestel, Korkuteli, Tefenni), kayalık ve sarp dağlar arasında yerleşme ve tarımın yapılabildiği vaha benzeri düzlükler oluşturur.\n\nBölgenin en yüksek noktası, Mersin sınırlarındaki Bolkar Dağları üzerinde yer alan 3.524 metrelik Medetsiz Tepesi'dir. Batı Toroslar'da Dedegöl (2.992 m) ve Bey Dağları (Kızlarsivrisi 3.086 m), Orta Toroslar'da Aladağlar ve doğuda Nur Dağları (Amanoslar) bölgenin heybetli dağ sıralarını meydana getirir.",
    climateAndVegetationTr:
      "Akdeniz Bölgesi kıyılarında sıcak ve kurak yazlar ile ılık ve bol yağışlı kışların hüküm sürdüğü tipik Akdeniz iklimi görülür. Kış mevsiminin ılık geçmesi ve don olaylarının çok ender yaşanması, bölgede narenciye, muz ve örtü altı seracılığın gelişmesini sağlayan en belirleyici doğal faktördür.\n\nToros Dağları'nın güneye bakan dik yamaçları, Akdeniz'den gelen nemli hava kütlelerini zorunlu yükselmeye uğratarak Türkiye'nin en yüksek orografik (yamaç) yağışlarını alır; Antalya kıyılarında yıllık yağış 1.200 milimetreyi aşar. Buna karşılık Toroslar'ın arkasında kalan Göller Yöresi'nde (Isparta, Burdur) yükseltinin 950 metrenin üzerine çıkması ve deniz etkisinin dağlarca kesilmesi nedeniyle kışları soğuk ve kar yağışlı bir geçiş iklimi hüküm sürer.\n\nBitki örtüsü de yükselti basamaklarını izler. Kıyıdan 700-800 metre yüksekliğe kadar kızılçam ormanlarının tahrip edildiği alanlarda zeytin, defne, keçiboynuzu ve mersinden oluşan maki toplulukları yer alır; enlemin getirdiği sıcaklık avantajı nedeniyle Türkiye'de maki üst sınırının en yükseğe çıktığı bölge burasıdır. Daha yüksek yamaçlarda karaçam, Toros sediri ve köknar ormanları başlar; 2.000 metrenin üzerinde ise alpin çayırlar ve dağ bozkırları görülür.",
    hydrographyTr:
      "Bölgenin hidrografik düzeni; doğuda deltalar kuran büyük nehirler ile batıda karstik kaynaklarla beslenen düzenli akarsulardan meydana gelir.\n\nDoğu kanadın ana su yolları Ceyhan (509 km) ve Seyhan nehirleridir. İç kısımlardaki dağlardan beslenip Çukurova'yı baştan başa sulayan bu iki nehir, tarımsal sulama ve taşkın kontrolü sağlayan Seyhan Barajı gibi tesislerle düzenlenmiştir. Lübnan ve Suriye'den geçerek Hatay'a giren Asi Nehri (556 km) ise Amik Ovası'nı suladıktan sonra Samandağ'da denize dökülür.\n\nBatı Akdeniz'de ise kireçtaşlı arazi suları yer altına çektiği için yüzey akışı kanyon vadilerle sınırlıdır. Manavgat ve Köprüçay gibi akarsular, yer altındaki zengin karstik voklüz kaynaklarından beslendikleri için yaz kuraklığında bile debisi düşmeyen, Türkiye'nin akış rejimi en düzenli nehirleridir. Mersin'de Göksu Nehri ise derin kanyonlardan geçerek Silifke Deltası'nı oluşturur.\n\nGöller Yöresi (Isparta, Burdur), tektonik-karstik çanaklarda oluşmuş zengin bir göl bölgesidir. Eğirdir Gölü (yaklaşık 480 km²), Türkiye'nin ikinci büyük tatlı su gölü olup içme ve sulama suyu sağlar. Dışa akışı olmayan Burdur Gölü ise aşırı yer altı suyu çekimi ve havza üzerindeki barajlar nedeniyle su seviyesi son elli yılda 20 metreden fazla gerilemiş ve tuzluluk oranı hızla artmış hassas bir kapalı havzadır. Geçmişte tarım arazisi kazanmak amacıyla kurutulan Amik Gölü ise bölgenin hidrolojik dengesinin bozulmasına ve taşkın riskinin artmasına yol açmıştır.",
    settlementAndPopulationTr:
      "Akdeniz Bölgesi, 11 milyonu aşan nüfusuyla ülke nüfusunun %12,81'ini barındırır. Kilometrekareye düşen 123 kişilik nüfus yoğunluğu Türkiye ortalamasının (110 kişi/km²) üzerindedir.\n\nNüfus ve şehirleşme, verimli tarım toprakları ve turizm olanaklarının toplandığı kıyı düzlüklerinde kümelenmiştir. Bölgenin en büyük ili Antalya (2,77 milyon), uluslararası turizm ve örtü altı tarımın yarattığı istihdam sayesinde Türkiye'nin en yüksek net göç hızına sahip illeri arasındadır. Çukurova'nın merkezindeki Adana ve sanayi-liman kenti Mersin diğer büyük nüfus odaklarıdır.\n\nBuna karşılık karstik kireçtaşı arazisiyle kaplı, toprak örtüsü ince ve su tutmayan Teke ve Taşeli platoları ile engebeli Toros yamaçları, Türkiye'nin nüfus yoğunluğu en düşük yöreleri arasındadır. Bu dağlık alanlarda yerleşimler karstik polyelerin (Elmalı, Korkuteli) tabanında küçük adacıklar hâlinde toplanmıştır.",
    economyTr:
      "Akdeniz Bölgesi, Türkiye gayrisafi yurt içi hasılasının yaklaşık %10,9'unu üretir. Ekonomik yapı turfanda tarım, örtü altı seracılık, dış ticaret ve turizm sektörlerine dayanır.\n\nKış ılıklığı sayesinde Türkiye'nin sera ve örtü altı sebze üretiminin büyük kısmı Antalya ve Mersin kıyılarında yapılır; narenciye, muz ve erken hasat turfanda ürünlerde bölge rakipsizdir. Çukurova ve Amik ovalarında ise mısır, pamuk, buğday ve soya gibi katma değeri yüksek endüstriyel tarım ürünleri yetiştirilir. Dağlık Toros kuşağında ise karstik araziye uyum sağlamış geleneksel yaylacılık ve kıl keçisi yetiştiriciliği kırsal ekonomiyi ayakta tutar.\n\nTurizm sektöründe Antalya ve ilçeleri (Alanya, Manavgat, Kemer, Kaş); uzun güneşlenme süresi, korunaklı plajları, kanyonları ve zengin antik miraslarıyla (Perge, Aspendos, Phaselis) Türkiye'nin uluslararası turizm başkentidir. Sanayi ve lojistikte ise Türkiye'nin en büyük konteyner limanlarından biri olan Mersin Uluslararası Limanı ile İskenderun Körfezi'ndeki ağır sanayi (demir-çelik, petrokimya ve enerji santralleri) bölgenin dış ticaret lokomotifidir.",
    subregionsTr:
      "1941 Coğrafya Kongresi kararlarına göre Akdeniz Bölgesi iki ana bölüme ayrılır:\n\n1. **Adana Bölümü:** Doğu kanattaki geniş alüvyal Çukurova ve Amik ovalarını, bunları çevreleyen Orta Toros ve Amanos dağlarını kapsar. Geniş ölçekli endüstriyel tarım, sanayi, Mersin ve İskenderun limanları ile yüksek nüfus yoğunluğu bu bölümü niteler.\n2. **Antalya Bölümü:** Batı kanattaki dar kıyı kuşağını, engebeli Teke ve Taşeli platolarını ile Göller Yöresi'ni içine alır. Karstik yer şekilleri, örtü altı seracılık, ormancılık ve uluslararası deniz turizmi bu bölümün belirleyici unsurlarıdır.",
    disasterAndEarthquakeTr:
      "Bölgenin doğu kanadı, Anadolu ile Arap levhalarının sınırını oluşturan Doğu Anadolu Fay Hattı ve Ölüdeniz Fay Zonu üzerinde yer alır. 6 Şubat 2023 tarihinde Kahramanmaraş merkezli meydana gelen Mw 7,7 ve Mw 7,6 büyüklüğündeki iki büyük deprem, başta Hatay ve Kahramanmaraş olmak üzere bölgenin doğusunda Cumhuriyet tarihinin en büyük yıkımına ve can kaybına yol açmıştır. Hatay'da Amik Ovası'nın alüvyal zemininde ve fay hatları boyunca sıvılaşma ve zemin çökmesi hasarı katlamıştır.\n\nBölgenin batı kanadında ise kireçtaşlı karstik arazinin yer altı sularıyla erimesi sonucu oluşan derin obruk çökmeleri ve zemin boşlukları özgün bir jeolojik risk oluşturur. Ayrıca sıcak ve kurak geçen yaz aylarında fön rüzgârlarının da etkisiyle Toroslar'ın güney yamaçlarındaki yoğun kızılçam ormanlarında geniş çaplı orman yangınları yaşanabilmektedir.",
    comparisonTr:
      'Yedi bölgenin üçü ulusal nüfus payında birbirine son derece yakın bir bantta toplanır: Akdeniz (%12,81), Ege (%12,79) ve Güneydoğu Anadolu (%11,14). Akdeniz, 89.516 kilometrekarelik yüzölçümü ve kilometrekareye düşen 123 kişilik nüfus yoğunluğu ile kıyı kuşağının en dinamik nüfus ve tarım havzalarından birini temsil eder.',
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
      'Bölgeye ait demografik ve mekânsal veriler, TÜİK Adrese Dayalı Nüfus Kayıt Sistemi (ADNKS 2025) ile Harita Genel Müdürlüğü (HGM) resmi il yüzölçümü tescillerinden konsolide edilmiştir.\n\nTÜİK bölgesel bültenlerini İBBS Düzey-1 (12 bölge) normunda yayımlamaktadır; buradaki toplamlar ise Cumhuriyet döneminin temel coğrafi tasnifi olan 7 klasik coğrafi bölgeye göre illerin değerleri toplanarak elde edilmiştir. Bölge ve alt bölüm sınırlarının tespitinde 6-21 Haziran 1941 tarihli Birinci Türk Coğrafya Kongresi kararları esas alınmıştır.',
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
      "İç Anadolu Bölgesi, Anadolu Yarımadası'nın merkezinde yer alır ve çevresini kuşatan yüksek dağ sıralarının ortasında geniş bir kapalı çanak oluşturur. Yedi coğrafi bölge içinde denize kıyısı olmayan iki bölgeden biridir ve hiçbir komşu ülkeyle kara sınırı bulunmaz.\n\nBuna karşılık Türkiye içinde coğrafi geçiş konumu en yüksek bölgedir: Güneydoğu Anadolu hariç, diğer beş bölgenin tamamıyla sınırdaştır. Kuzeyde Karadeniz, batıda Ege ve Marmara, güneyde Akdeniz, doğuda ise Doğu Anadolu bölgeleriyle çevrilidir. Bu merkezi konumu; doğu-batı ve kuzey-güney doğrultulu ana kara yolu, yüksek hızlı tren ve demir yolu akslarının bölgede kesişmesini sağlamış, Ankara'yı ülkenin idari ve lojistik kalbi yapmıştır.",
    landformsTr:
      "İç Anadolu'nun arazisini yüksek dağ sıralarından ziyade ortalama 900 ile 1.300 metre arasında dalgalanan geniş platolar ve tektonik çöküntü ovaları belirler. Haymana, Cihanbeyli, Obruk ve Bozok platoları akarsularla yarılmış dalgalı düzlükler hâlinde uzanırken; tabanlarında Konya ve Ereğli ovaları ile Tuz Gölü çöküntüsü yer alır. Bu düz ve açık topoğrafya, Türkiye'de tarımda makineleşmenin en kolay uygulandığı sahayı yaratmıştır.\n\nBu geniş plato yüzeyinin üzerinde Neojen ve Kuvaterner dönemlerinde püskürmüş sönmüş volkanik koniler yükselir. Kayseri'nin simgesi olan 3.917 metrelik Erciyes Dağı, bölgenin en yüksek noktası ve ana stratovolkanıdır; doruğunda sirk buzulu kalıntıları taşır. Aksaray ve Niğde sınırındaki Hasan Dağı (3.268 m), Melendiz, Karacadağ ve Karadağ platoya serpilmiş diğer volkanik kütlelerdir.\n\nKapadokya'nın dünyaca ünlü morfolojisi bu volkanik mirasın ürünüdür. Erciyes ve Hasan Dağı'ndan püsküren kalın tüf ve kül tabakaları, rüzgâr ve sel sularının aşındırmasıyla Göreme, Ürgüp ve Uçhisar çevresinde peribacalarına dönüşmüştür. Tüfün kolay oyulabilir fiziksel yapısı ise geçmişte Derinkuyu ve Kaymaklı gibi çok katlı yeraltı şehirlerinin ve kaya yerleşimlerinin inşa edilmesini sağlamıştır. Aksaray'daki Melendiz Çayı ise tüf tabakasını yararak 18 kilometrelik derin Ihlara Kanyonu'nu açmıştır.\n\nBölgenin sınırlarını kenarlarda yükselen dağlar çizer: Güneyde Toros Dağları'nın kuzey yamaçları (Bolkar ve Aladağlar), kuzeyde Ilgaz ve Köroğlu dağları, doğuda ise Tecer ve Akdağlar bölgeyi çevreler.",
    climateAndVegetationTr:
      "İç Anadolu'nun iklimini belirleyen temel coğrafi faktör, deniz etkisine tamamen kapalı olmasıdır (karasallık). Kuzeydeki Kuzey Anadolu Dağları ile güneydeki Toroslar, deniz üzerinden gelen nemli hava kütlelerinin iç kesimlere sokulmasını engeller. Yağışını kıyı yamaçlarında bırakan hava kütleleri içeriye fön etkisiyle kuru olarak iner; bu durum İç Anadolu'yu Türkiye'nin en az yağış alan bölgesi hâline getirir.\n\nBölge genelinde yıllık yağış 330 ile 500 milimetre arasında kalır; Tuz Gölü çevresi (Aksaray, Karaman, Konya) Türkiye'nin kuraklık merkezidir. Kışlar soğuk, karlı ve don olaylı; yazlar sıcak ve kurak geçer; günlük ve mevsimlik sıcaklık farkları çok yüksektir. En çok yağış ilkbaharda yükselim (konveksiyonel - kırkikindi) yağışları şeklinde düşer.\n\nDoğal bitki örtüsü bu yarı kurak iklimin ürünü olan bozkırdır (step). İlkbahar yağışlarıyla yeşeren geven, yavşan otu ve gelincikler, yaz kuraklığıyla sararır ve kurur. İnsan faaliyetleriyle meşe ve karaçam ormanlarının tahrip edildiği sahalarda bozkırlar genişleyerek antropojen bozkıra dönüşmüştür; orman kalıntılarına ancak 1.200 metrenin üzerindeki yağış alan dağ yamaçlarında rastlanır.",
    hydrographyTr:
      "Bölgenin hidrografisi iki zıt sisteme ayrılır: Dışa akışı olan açık havzalar ile suların denize ulaşamadığı kapalı havzalar.\n\nAçık havzaların en büyüğü, Türkiye sınırları içinde doğup denize dökülen en uzun nehir olan Kızılırmak'tır (1.355 km). Sivas'ın Kızıldağ eteklerinden doğan nehir; Kayseri, Nevşehir, Kırşehir, Kırıkkale, Ankara ve Çankırı topraklarından geçerek geniş bir kavis çizer ve Karadeniz'e yönelir. Nehir üzerindeki Hirfanlı ve Kesikköprü barajları bölgenin sulama ve enerji ihtiyacını karşılar. Batı kesimde ise Sakarya Nehri ve onun ana kolu olan Porsuk Çayı, Eskişehir ve Ankara düzlüklerini sulayarak Marmara'ya akar.\n\nBuna karşılık güney ve orta kesimler dışa akışı olmayan kapalı havzalardan oluşur. Türkiye'nin en büyük kapalı havzası olan Konya-Tuz Gölü Havzası'nda sular denize ulaşamaz. Sığ bir tektonik çanakta toplanan Tuz Gölü (yaklaşık 1.300-1.500 km²), yaz aylarında şiddetli buharlaşmayla küçülür ve üzerinde kalın bir tuz tabakası bırakır; Türkiye'nin tuz ihtiyacının büyük bölümü buradan çıkarılır. Konya'nın batısındaki Beyşehir Gölü (651 km²) ise Türkiye'nin en büyük tatlı su gölü olup tarihi Çumra sulama kanalıyla Konya Ovası'nı sular. Kayseri'deki Sultansazlığı ile Kırşehir'deki Seyfe Gölü zengin kuş popülasyonuna ev sahipliği yapan uluslararası öneme sahip Ramsar sulak alanlarıdır.",
    settlementAndPopulationTr:
      "İç Anadolu, 13,8 milyonu aşan nüfusuyla Marmara'nın ardından Türkiye'nin en kalabalık ikinci bölgesidir. Ancak 187.227 kilometrekarelik devasa yüzölçümüyle Türkiye topraklarının neredeyse dörtte birini kapladığı için (%24), kilometrekareye düşen 74 kişilik nüfus yoğunluğu Türkiye ortalamasının (110 kişi/km²) belirgin biçimde altındadır.\n\nNüfus belirli sanayi, ulaşım ve ticaret merkezlerinde yoğunlaşmıştır. Türkiye'nin başkenti Ankara, 5,9 milyonu aşan nüfusuyla bölge toplamının yaklaşık %43'ünü barındırır. Konya (2,34 milyon), Kayseri (1,46 milyon) ve Eskişehir (yaklaşık 900 bin) diğer büyük metropollerdir. Su kaynaklarının kıt ve arazinin düz olması nedeniyle kırsal kesimde evlerin kuyu veya çeşme çevrelerinde toplandığı 'toplu yerleşme' dokusu egemendir.\n\nİç göç dinamiklerinde Ankara, Eskişehir ve Kayseri dışarıdan göç alıp büyürken; tarımsal olanakların daraldığı ve sanayileşmenin sınırlı kaldığı Çankırı, Sivas ve Yozgat gibi iller dışarıya sürekli net göç vermektedir.",
    economyTr:
      "İç Anadolu Bölgesi, Türkiye gayrisafi yurt içi hasılasının yaklaşık %17,9'unu üreterek Marmara'dan sonra ikinci sırada yer alır. Bölge ekonomisi 'tahıl ambarı' niteliğindeki tarım arazileri ile başkent merkezli gelişmiş sanayi ve hizmet sektörlerinin dengeli birleşimine dayanır.\n\nUçsuz bucaksız plato düzlükleri ve karasal iklim koşulları tahıl tarımı için ideal ortam sunar. Buğday, arpa, çavdar ve kuru baklagil üretiminde Türkiye'nin lideridir; sulama yapılabilen Konya, Aksaray ve Eskişehir ovalarında ise şeker pancarı, ayçiçeği, mısır ve patates üretimi yoğunlaşmıştır. Geniş step meraları küçükbaş hayvancılığı (özellikle akkaraman koyunu) teşvik ederken, Ankara çevresinde tiftik keçisi yetiştiriciliği tarihsel bir değer taşır.\n\nSanayi sektörü belirli teknoloji ve üretim havzalarında kümelenmiştir. Başkent Ankara; Türk savunma ve havacılık sanayisinin (ASELSAN, TUSAŞ, ROKETSAN), kamu yönetiminin, yazılım ve Ar-Ge ekosisteminin merkezidir. Eskişehir havacılık motorları, demir yolu lokomotif sanayisi ve beyaz eşyada; Kayseri mobilya, çelik kapı ve ev aletleri üretiminde; Konya ise tarım makineleri, otomotiv döküm sanayisi ve gıda imalatında Türkiye'nin başlıca ihracat üsleridir.",
    subregionsTr:
      "1941 Coğrafya Kongresi kararlarına göre İç Anadolu Bölgesi dört ana coğrafi bölüme ayrılır:\n\n1. **Konya Bölümü:** Güneybatıdaki geniş Konya-Ereğli ovalarını, Tuz Gölü'nün güneyini ve Obruk Platosu'nu kapsar. Türkiye'nin en kurak ve en düz tahıl ve şeker pancarı sahasıdır.\n2. **Yukarı Sakarya Bölümü:** Kuzeybatıda Ankara ve Eskişehir platoları ile Sakarya ve Porsuk vadilerini içine alır. Bölgenin en gelişmiş sanayi, teknoloji, ulaşım ve nüfus merkezidir.\n3. **Orta Kızılırmak Bölümü:** Kızılırmak'ın çizdiği büyük yayın içinde kalan Nevşehir, Kırşehir, Yozgat, Niğde ve Kayseri yörelerini kapsar. Volkanik Kapadokya arazisi, patates ve meyve tarımı ile Erciyes eteğindeki sanayi bu bölümü niteler.\n4. **Yukarı Kızılırmak Bölümü:** Nehrin kaynaklandığı Sivas çevresindeki engebeli ve yüksek plato kuşağıdır. Yükseltinin 1.300 metreyi aştığı, kışların en sert geçtiği ve küçükbaş-büyükbaş hayvancılığın öne çıktığı bölümdür.",
    disasterAndEarthquakeTr:
      "İç Anadolu'nun orta kesimleri Türkiye'nin sismik hareketliliği en düşük ve deprem tehlikesi en az sahaları arasında kabul edilir. Ancak kuzey kenarı Kuzey Anadolu Fay Zonu'na (Çankırı, Sivas), batısı Eskişehir fayına, doğusu ise Ecemiş fay koridoruna komşudur.\n\nBölgeye özgü en çarpıcı jeolojik ve çevresel risk obruk oluşumlarıdır. Konya ve Karaman havzalarında kuraklığa bağlı olarak yer altı su seviyesinin aşırı düşmesi ve kireçtaşlı zeminlerin erimesi sonucu derin karstik obruklar açılmaktadır; son yıllarda tarım arazilerinde ve yerleşim sınırlarında aniden çöken obruk sayısı yüzleri aşmıştır.\n\nBunun yanı sıra düşük yağış ortalamaları ve şiddetli rüzgârlar, rüzgâr erozyonu ve çölleşme tehdidini bölgenin en kritik uzun vadeli çevresel afeti hâline getirmiştir; Karapınar çevresi rüzgâr erozyonuna karşı Türkiye'nin ilk erozyon önleme sahası olarak tescillenmiştir.",
    comparisonTr:
      "İç Anadolu, 187.227 kilometrekarelik genişliğiyle Türkiye'nin iller bazındaki yüzölçümünün neredeyse dörtte birini (%24,00) kaplar ve alan bakımından yedi bölgenin en büyüğüdür. Nüfus büyüklüğünde 13,8 milyon kişiyle (%16,04) ikinci sırada yer almasına karşın, geniş bozkır ve plato arazisi nedeniyle nüfus yoğunluğu kilometrekareye 74 kişide kalmakta ve ülke ortalamasının belirgin şekilde altında seyretmektedir.",
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
      'Bölgeye ait demografik ve mekânsal veriler, TÜİK Adrese Dayalı Nüfus Kayıt Sistemi (ADNKS 2025) ile Harita Genel Müdürlüğü (HGM) resmi il yüzölçümü tescillerinden konsolide edilmiştir.\n\nTÜİK bölgesel bültenlerini İBBS Düzey-1 (12 bölge) normunda yayımlamaktadır; buradaki toplamlar ise Cumhuriyet döneminin temel coğrafi tasnifi olan 7 klasik coğrafi bölgeye göre illerin değerleri toplanarak elde edilmiştir. Bölge ve alt bölüm sınırlarının tespitinde 6-21 Haziran 1941 tarihli Birinci Türk Coğrafya Kongresi kararları esas alınmıştır.',
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
      "Karadeniz Bölgesi, Türkiye'nin kuzeyinde Karadeniz kıyı çizgisi boyunca Sakarya sınırından Gürcistan sınırına kadar kesintisiz uzanan yay biçimli dar bir kuşaktır. Anadolu'nun en kuzey noktası olan İnceburun (Sinop) bu kıyı kuşağı üzerinde yer alır.\n\nBölgenin uluslararası tek kara sınırı doğu ucundadır: Artvin üzerinden Gürcistan ile komşudur ve Sarp Sınır Kapısı, Türkiye'nin Kafkasya ve Orta Asya'ya açılan en işlek kara yolu transit kapılarından biridir.\n\nİç sınırlarda bölge üç komşuya açılır: Güneyde uzun bir hat boyunca İç Anadolu Bölgesi'yle; doğuda Artvin, Rize, Bayburt ve Gümüşhane üzerinden Doğu Anadolu Bölgesi'yle; batıda ise Düzce ve Bolu üzerinden Marmara Bölgesi'yle sınırdaştır. Kuzey Anadolu Dağları'nın kıyıya paralel yüksek duvarı iç kesimlerle bağlantıyı zorlaştırdığı için ulaşım; Zigana, Kop, Ilgaz, Cankurtaran ve Bolu Dağı gibi kritik dağ geçitleri ve tüneller üzerinden sağlanır.",
    landformsTr:
      "Karadeniz Bölgesi'nin morfolojik karakterini, Alp-Himalaya kıvrım kuşağının parçası olan ve kıyıya paralel birbirini izleyen sıralar hâlinde uzanan Kuzey Anadolu Dağları belirler. Dağların denize hemen paralel ve dik yükselmesi; kıyı şeridinin çok dar kalmasına, dik falezlerin (yalıyar) yaygınlaşmasına ve doğal limanların seyrekleşmesine yol açmıştır. Sinop doğal bir limana sahip olmasına karşın, ardındaki Küre Dağları'nın ulaşımı engellemesi (hinterland darlığı) nedeniyle gelişememiştir.\n\nBu dağlık duvarın en belirgin istisnası Orta Karadeniz'dedir. Burada Canik Dağları'nın yükseltisi 1.000-1.500 metreye kadar iner ve kıyıdan içeriye çekilir. Bu morfolojik açıklık sayesinde Kızılırmak ve Yeşilırmak nehirleri denize ulaştıkları yerde Türkiye'nin en büyük kıyı deltaları olan Bafra ve Çarşamba ovalarını oluşturmuş, aynı zamanda iç kesimlerle ulaşımı kolaylaştırmıştır.\n\nYükseltiler doğuya gidildikçe hızla artar: Rize ve Artvin sınırındaki Kaçkar Dağı (3.937 m) Karadeniz Dağları'nın en yüksek zirvesidir. Kaçkar ve Giresun dağlarının yüksek zirvelerinde dördüncü zaman buzullaşmasının ürünü olan sirk gölleri, buzul vadileri ve zengin yaylalar sıralanır. Batı Karadeniz'de ise Ilgaz Dağı (2.587 m) ve Köroğlu Dağları (2.499 m) ile Küre kireçtaşı kanyonları engebeli plato ve dağ kuşağını meydana getirir.",
    climateAndVegetationTr:
      "Karadeniz Bölgesi'nin iklimini belirleyen ana etken, denizden gelen nemli hava kütlelerinin kıyıya paralel uzanan dağ yamaçlarına çarparak yükselmesi (orografik / yamaç yağışı) mekanizmasıdır.\n\nKuzey yamaçlar her mevsim yağışlı, ılıman ve nemli Karadeniz iklimine sahiptir. Dağların en yüksek ve denize en yakın olduğu Doğu Karadeniz kıyıları Türkiye'nin en çok yağış alan sahasıdır; Rize yıllık 2.200 milimetreyi aşan yağışıyla başı çeker. Yıl boyunca kurak dönemin olmaması çay tarımını mümkün kılan temel doğal koşuldur. Buna karşılık dağ sıralarının arkasında kalan iç vadi ve çanaklarda (Gümüşhane, Bayburt, Çorum) deniz etkisi kesildiği için yıllık yağış 500-600 milimetreye düşer ve sert karasal iklim koşulları başlar.\n\nBitki örtüsü yükselti basamaklarına göre dikey kuşaklar oluşturur. Kıyı kuşağında geniş yapraklı nemli ormanlar (kayın, kestane, gürgen, meşe) ile nemcil çalı toplulukları (psödomaki) yer alır. Yükseldikçe karışık ormanlar, 1.200-1.500 metrenin üzerinde ise iğne yapraklı Doğu Karadeniz ladini ve köknar ormanları hâkim olur. 2.000 metrenin üzerindeki ağaç sınırında ise zengin alpin dağ çayırları ve yaylalar uzanır; Karadeniz Türkiye'nin orman varlığı en zengin bölgesidir.",
    hydrographyTr:
      "Bölgenin hidrografik yapısı iki ayrı ölçekte çalışır: İç bölgelerden doğup kıyıda delta açan büyük nehirler ile dağların denize bakan yamaçlarından hızla inen dik dereler.\n\nKızılırmak ve Yeşilırmak, iç bölgelerden taşıdıkları bol alüvyonla Samsun kıyılarında Bafra ve Çarşamba deltalarını kurmuştur. Bafra Deltası, barındırdığı yüzlerce kuş türüyle uluslararası Ramsar koruma alanıdır. Doğuda Çoruh Nehri (376 km), Mescit Dağları'ndan doğup derin kanyonlar boyunca hızla akar; nehir üzerindeki Deriner ve Yusufeli barajları Türkiye'nin en yüksek kemer barajları olarak devasa hidroelektrik enerji üretir.\n\nKıyı dağlarından doğrudan denize inen Fırtına Deresi, İkizdere, Aksu, Melet ve Harşit çayları ise boyları kısa, akış hızları ve aşındırma güçleri çok yüksek akarsulardır. Bu dereler zengin su potansiyeline sahip olmakla birlikte, aşırı yağış dönemlerinde hızla kabararak ani sel ve taşkınlara yol açar. Batıda Filyos ve Bartın çayları ormanlık platoları drene ederken; Bolu'daki Abant ve Yedigöller heyelan set gölleri bölgenin eşsiz doğal sulak alanlarıdır.",
    settlementAndPopulationTr:
      "Karadeniz Bölgesi, 8 milyonu aşan nüfusuyla ülke nüfusunun %9,34'ünü barındırır. Kilometrekareye düşen 69 kişilik nüfus yoğunluğu Türkiye ortalamasının (110 kişi/km²) oldukça altındadır.\n\nYerleşme dokusu bölgenin engebeli coğrafyasının doğrudan sonucudur. 18 il ve 197 ilçe ile Türkiye'nin en çok mülki birimine sahip bölgesi olmasına karşın, ilçe başına düşen ortalama 41 binlik nüfus Türkiye'nin en düşük değeridir. Dik yamaçlar, arazinin aşırı parçalı olması ve su kaynaklarının bolluğu, kırsal kesimde evlerin yamaçlara serpiştirildiği 'dağınık yerleşme' tipini zorunlu kılmıştır.\n\nNüfus, tarıma ve ulaşıma elverişli dar kıyı şeridinde ve delta ovalarında toplanmıştır (Samsun 1,39 milyon, Trabzon 823 bin, Ordu 770 bin). Buna karşılık tarım alanlarının kısıtlı, sanayinin yetersiz olduğu iç vadi ve dağlık kesimler (Gümüşhane, Bayburt, Artvin) dışarıya sürekli yoğun göç vermektedir; nitekim Gümüşhane ve Bayburt Türkiye'nin net göç verme hızında ilk sıralarda yer alır.",
    economyTr:
      "Karadeniz Bölgesi, Türkiye gayrisafi yurt içi hasılasının yaklaşık %6,4'ünü üretir. Bölge ekonomisi fındık ve çay başta olmak üzere uzmanlaşmış tarıma, taşkömürüne dayalı ağır sanayiye, ormancılığa ve deniz balıkçılığına dayanır.\n\nNemli iklim ve dik yamaç topoğrafyası dünya çapında iki tekel ürün doğurmuştur: Ordu, Giresun ve Trabzon'un eğimli yamaçlarında Türkiye üretiminin ve dünya ihracatının büyük kısmını karşılayan fındık yetiştirilir. Rize ve Artvin kıyılarında ise bol yağış sayesinde Türkiye'nin tüm çay üretimi gerçekleştirilir. Samsun'un Bafra ve Çarşamba deltalarında ise mısır, çeltik, sebze ve meyve tarımı yoğunlaşmıştır.\n\nSanayi ve madencilik Batı Karadeniz'de köklü bir geçmişe sahiptir. Türkiye'nin tek taşkömürü havzası olan Zonguldak; Ereğli ve Karabük Demir Çelik Fabrikaları'nın kuruluşuyla Türkiye'nin ağır sanayi temellerinin atıldığı merkez olmuştur. Geniş orman örtüsü ahşap, kâğıt ve kereste sanayisini beslerken; uzun kıyı şeridi Türkiye deniz balıkçılığı avcılığının yarısından fazlasını karşılar. Doğu Karadeniz yaylaları ise (Ayder, Uzungöl) son yıllarda doğa ve yayla turizminin çekim merkezi hâline gelmiştir.",
    subregionsTr:
      "1941 Coğrafya Kongresi kararlarına göre Karadeniz Bölgesi üç ana coğrafi bölüme ayrılır:\n\n1. **Batı Karadeniz Bölümü:** Sakarya sınırından Sinop'a kadar uzanan ormanlık dağlar (Küre, Ilgaz, Bolu), taşkömürü havzası (Zonguldak, Karabük) ve dalgalı platoları kapsar. Sanayi ve ormancılık ön plandadır.\n2. **Orta Karadeniz Bölümü:** Canik Dağları'nın alçaldığı, Kızılırmak ve Yeşilırmak deltalarının yer aldığı geniş tarım sahasıdır (Samsun, Tokat, Çorum, Amasya). Ulaşım iç kesimlere kolayca bağlanır; tarım ve gıda sanayisi ağırlıklıdır.\n3. **Doğu Karadeniz Bölümü:** Ordu'dan Gürcistan sınırına kadar uzanan en dik, en yüksek ve en bol yağış alan kesimdir. Çay, fındık, balıkçılık, yaylacılık ve dağınık kırsal yerleşme bu bölümün ayırt edici niteliğidir.",
    disasterAndEarthquakeTr:
      "Karadeniz Bölgesi'nin en yaygın ve yıkıcı doğal afeti kütle hareketleridir (heyelan). Dik yamaç eğimi, yüksek yıllık yağış miktarı, geçirimsiz killi tabakalar ve orman örtüsünün yol/yerleşim gerekçesiyle tahrip edilmesi, özellikle Doğu Karadeniz'de heyelanları sürekli bir tehdit yapar; Türkiye'de en çok heyelan bu bölgede meydana gelir.\n\nİkinci büyük risk, dik eğimli ve kısa havzalı derelerin aşırı sağanaklarda hızla taşmasıyla oluşan ani sel, taşkın ve moloz akmalarıdır (Kastamonu Bozkurt, Rize, Giresun taşkınları). Dar vadi tabanlarına yapılan kontrolsüz yerleşimler bu riski afete dönüştürmektedir.\n\nSismik açıdan ise Batı Karadeniz'in güneyi Kuzey Anadolu Fay Zonu üzerindedir; 12 Kasım 1999 Mw 7,2 Düzce depremi bu fayın bölgedeki yıkıcı kırılmalarının en somut örneğidir.",
    comparisonTr:
      "Karadeniz, 18 il ve 197 ilçe ile Türkiye'nin en çok idari mülki birimine sahip coğrafi bölgesidir. Buna karşılık toplam nüfusta 8 milyon kişiyle (%9,34) altıncı sırada yer alır. İlçe başına düşen ortalama nüfus yaklaşık 41 bindir ve bu değer yedi bölge arasındaki en düşük düzeydir; bu durum dağlık arazinin parçalı ve dağınık yerleşme yapısını yansıtır.",
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
      'Bölgeye ait demografik ve mekânsal veriler, TÜİK Adrese Dayalı Nüfus Kayıt Sistemi (ADNKS 2025) ile Harita Genel Müdürlüğü (HGM) resmi il yüzölçümü tescillerinden konsolide edilmiştir.\n\nTÜİK bölgesel bültenlerini İBBS Düzey-1 (12 bölge) normunda yayımlamaktadır; buradaki toplamlar ise Cumhuriyet döneminin temel coğrafi tasnifi olan 7 klasik coğrafi bölgeye göre illerin değerleri toplanarak elde edilmiştir. Bölge ve alt bölüm sınırlarının tespitinde 6-21 Haziran 1941 tarihli Birinci Türk Coğrafya Kongresi kararları esas alınmıştır.',
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
      "Doğu Anadolu Bölgesi, Anadolu Yarımadası'nın doğusunda yer alır ve yedi bölge içinde ortalama yükseltisi en fazla olan, en geniş ikinci coğrafi sahadır. Denize kıyısı bulunmayan bölge, Türkiye'nin Kafkasya ve Orta Doğu'ya uzanan en uzun uluslararası kara sınırlarını bünyesinde toplar.\n\nBölge; kuzeydoğuda Ardahan ve Kars üzerinden Gürcistan ve Ermenistan'la, Iğdır üzerinden Azerbaycan (Nahçıvan) ve Ermenistan'la, doğuda Ağrı, Van ve Hakkari boyunca İran'la, güneyde ise Hakkari üzerinden Irak'la sınırdaştır. Gürbulak, Kapıköy, Esendere ve Dilucu gibi sınır kapıları, Türkiye'nin doğu komşularıyla ticaret koridorlarını oluşturur.\n\nİç sınırlarda bölge dört komşu bölgeyle çevrilidir: Kuzeyde Karadeniz Bölgesi'yle; batıda İç Anadolu ve Akdeniz bölgeleriyle; güneyde ise Toroslar'ın güney etekleri boyunca Güneydoğu Anadolu Bölgesi'yle sınırdaştır. Erzurum, dokuz ayrı ille komşu olarak Türkiye'nin en çok il sınırına sahip kavşak kentidir.",
    landformsTr:
      "Doğu Anadolu'nun topoğrafyasını Avrasya ve Arap levhalarının sıkıştırmasıyla gerçekleşen tektonik yükselme ve yoğun volkanik faaliyetler şekillendirmiştir. Bölgenin ortalama yükseltisi 2.000 metreyi aşar ve bu yükseklik batıdan doğuya basamaklar hâlinde artarak Türkiye'nin çatısını oluşturur.\n\nBölgenin morfolojik omurgasını lav platoları ve bunların üzerinde yükselen dev stratovolkanlar kurar. Ağrı'nın kuzeydoğusundaki Ağrı Dağı (5.137 m), doruğundaki takke buzuluyla Türkiye'nin en yüksek zirvesidir. Güneydoğudaki Cilo-Sat Dağları (Uludoruk 4.168 m), Van Gölü'nün kuzeyindeki Süphan Dağı (4.058 m), Tendürek Dağı ve tepesinde 6 kilometre çapında dev kalderası bulunan uyuyan volkan Nemrut Dağı (2.935 m) bu görkemli dağ kuşağını tamamlar. Erzurum-Kars Platosu ise binlerce kilometrekarelik bazalt ve andezit lav tabakasıyla kaplı yüksek bir aşınım düzlüğüdür.\n\nBu dağlık ve engebeli çatının arasına fay hatları boyunca sıralanmış çöküntü ovaları serpilir: Erzincan, Erzurum, Pasinler, Muş ve Elazığ ovaları yerleşmenin ve tarımın toplandığı tektonik düzlüklerdir. Bu düzlüklerin en çarpıcı morfolojik istisnası Iğdır Ovası'dır: Çevresini saran 3.000-5.000 metrelik dağların ortasında 850 metre rakıma kadar inen bu korunaklı çanak, rüzgârlara kapalı derin bir mikroklima sahası oluşturmuştur.\n\nBölgenin batısında Bingöl'ün Karlıova ilçesi, Kuzey Anadolu Fayı ile Doğu Anadolu Fayı'nın kesiştiği dünyadaki ender tektonik kavşak noktalarından biridir.",
    climateAndVegetationTr:
      "Doğu Anadolu'nun iklimini belirleyen temel değişken aşırı yükselti ve deniz etkisinden bütünüyle yalıtılmış olmasıdır. Bölgede Türkiye'nin en sert ve en uzun kışlarının yaşandığı şiddetli karasal iklim egemendir.\n\nKış mevsimi 5 ile 6 ay sürer; kar örtüsü yerde 120-150 gün boyunca kalır ve dondurucu don olayları günlük yaşamı belirler. Nitekim Türkiye'nin yıllık ortalama sıcaklığı en düşük illeri Ardahan (4,2°C) ve Erzurum'dur (4,8°C). Yükseltinin azaldığı ve derin vadi çanaklarında yer alan Malatya, Elazığ ve özellikle Iğdır ovaları ise daha ılıman mikroklima özellikleri gösterir; Iğdır'da pamuk, şeftali ve kayısı gibi sıcaklık isteyen ürünlerin yetişmesi bu yerel çukurlaşmanın doğrudan sonucudur.\n\nBitki örtüsü yükselti ve yağış rejimine göre şekillenir. Erzurum-Kars platosu en çok yağışını ilkbahar sonu ve yaz aylarında konveksiyonel olarak alır. Bu yaz yağışları otların kurumasını engelleyerek zengin dağ çayırlarının (alpin çayırlar) ve altında dünyanın en verimli organik toprakları olan çernezyomların (kara toprak) gelişmesini sağlamıştır. Çöküntü havzalarında kurakçıl bozkırlar egemenken, Kars Sarıkamış çevresinde yüksek soğuğa uyum sağlamış sarıçam ormanları, korunaklı vadilerde ise meşe kalıntıları yer alır.",
    hydrographyTr:
      "Doğu Anadolu, yüksek topoğrafyası ve kalın kar birikimi sayesinde Türkiye'nin ana 'su kulesi' ve hidroelektrik enerji deposudur. Kar ve buzul erimeleriyle beslenen akarsuların akış hızları, debileri ve hidroelektrik potansiyelleri son derece yüksektir.\n\nBasra Körfezi'ne dökülen Fırat ve Dicle nehirleri bu topraklardan doğar. Fırat'ın ana kolları olan Karasu (Erzincan Ovası'ndan geçer) ve Murat Nehri (Ağrı ve Muş ovalarını kat eder), Elazığ'da birleşerek Keban Baraj Gölü'nü doldurur; Keban Türkiye'nin en büyük yapay gölüdür. Dicle'nin yukarı kolları ile Hakkari'deki Büyük Zap Çayı da aynı dağlık havzayı drene eder. Kuzeydoğuda ise Aras ve Kura nehirleri Ermenistan ve Azerbaycan sınırlarını çizerek Hazar Denizi kapalı havzasına dökülür.\n\nBölgenin gölleri volkanik setleşmelerin ürünüdür. Van Gölü (3.713 km²), yaklaşık 200 bin yıl önce Nemrut Dağı'ndan çıkan lavların Muş havzasına giden su yolunu tıkamasıyla oluşmuş dünyanın en büyük sodalı gölü ve Türkiye'nin en büyük doğal su kütlesidir. Yüksek sodalı yapısı kış aylarında donmasını engeller ve endemik inci kefaline ev sahipliği yapar. Ardahan'daki Çıldır Gölü (123 km²) ise lav seti kökenli tatlı su gölü olup kış aylarında tamamen buz tutmasıyla bilinir. Nemrut kalderasındaki krater gölleri, Nazik ve Erçek gölleri de aynı volkanik kökene sahiptir.",
    settlementAndPopulationTr:
      "Doğu Anadolu, 5,9 milyonluk nüfusuyla yedi coğrafi bölge içinde en az nüfus barındıran alandır (%6,86). Türkiye yüzölçümünün neredeyse beşte birini kaplamasına karşın (%19,10), kilometrekareye düşen 40 kişilik nüfus yoğunluğu Türkiye ortalamasının (110 kişi/km²) üçte birinde kalır ve bölgeyi açık ara Türkiye'nin en seyrek yerleşim alanı yapar.\n\nNüfus, sert kış şartları ve engebeli araziden kaçınarak dağlar arasındaki korunaklı çöküntü ovalarında kümelenmiştir (Van 1,11 milyon, Malatya 755 bin, Erzurum 736 bin). Tunceli (85 bin) ve Ardahan (90 bin) ise Türkiye'nin en az nüfuslu illeri arasındadır. Kırsal kesimde tarım arazisinin darlığı ve hayvancılık faaliyetleri nedeniyle mezra ve kom gibi geçici/dağınık yerleşme birimleri yaygındır.\n\nİç göç dinamiklerinde Doğu Anadolu Türkiye'nin en yoğun göç veren bölgesidir. 14 ilin 13'ünde net göç hızı sert biçimde negatiftir; Ağrı, Muş ve Kars illerinde göç kaybı binde -25 ile -32 seviyelerine kadar ulaşmaktadır.",
    economyTr:
      "Doğu Anadolu Bölgesi, Türkiye gayrisafi yurt içi hasılasının yaklaşık %3,8'ini üreterek yedi bölge içinde son sırada yer alır. Bölge ekonomisinin temel direği hayvancılık, hidroelektrik enerji üretimi ve yerel mikroklima tarımıdır.\n\nErzurum-Kars platosundaki yaz yağışlarıyla yeşil kalan gür meralar, büyükbaş mera hayvancılığı (sığır ve tosun besiciliği) için Türkiye'nin en elverişli doğal ortamını sunar; et, süt, peynir (Kars kaşarı) ve canlı hayvan ticareti kırsal nüfusun temel gelir kaynağıdır. Daha güneydeki Van, Muş ve Ağrı platolarında ise küçükbaş koyun yetiştiriciliği öne çıkar.\n\nTarımsal üretim belirli mikroklima çanaklarında yoğunlaşır: Malatya dünya kuru kayısı üretiminin ve ihracatının yaklaşık %85'ini tek başına karşılar. Alçak Iğdır ve Elazığ ovalarında tahıl, sebze, meyve ve bağcılık yapılır. Sanayi genellikle tarım ve hayvansal ürünlerin işlenmesiyle sınırlıdır. Buna karşılık Fırat üzerindeki Keban Barajı gibi dev tesisler Türkiye'nin hidroelektrik enerjisini besler; zengin krom ve demir yatakları madencilikte değer taşır. Erzurum Palandöken ve Kars Sarıkamış'taki kristal kar kalitesi ise kış turizmini canlandırmaktadır.",
    subregionsTr:
      "1941 Coğrafya Kongresi kararlarına göre Doğu Anadolu Bölgesi dört ana coğrafi bölüme ayrılır:\n\n1. **Yukarı Fırat Bölümü:** Batıda Fırat'ın yukarı kollarını, Erzincan ve Malatya çöküntü ovalarını ve Keban Barajı'nı kapsar. Sanayi, ticaret, ulaşım ve nüfus yoğunluğu bakımından bölgenin en gelişmiş bölümüdür.\n2. **Erzurum-Kars Bölümü:** Kuzeydoğudaki yüksek lav platolarını içine alır. Türkiye'nin en sert kışlarının yaşandığı, yaz yağışları ve gür çayırlarla büyükbaş hayvancılığın merkezi olan bölümdür.\n3. **Yukarı Murat-Van Bölümü:** Ortadaki volkanik dağlar kuşağını, Muş ve Ağrı ovalarını ile Van Gölü kapalı havzasını kapsar. Küçükbaş hayvancılık ve yerel ova tarımı hâkimdir.\n4. **Hakkari Bölümü:** Güneydoğudaki sarp Cilo-Sat dağları ve derin vadi oluklarını içine alan en engebeli, ulaşımı en zor ve nüfusu en seyrek bölümdür.",
    disasterAndEarthquakeTr:
      "Doğu Anadolu, tektonik kavşak konumu ve sarp topoğrafyası nedeniyle çoklu afet riskine sahiptir.\n\nKuzey Anadolu Fayı ile Doğu Anadolu Fayı'nın Karlıova'da birleşmesi ve bölgeyi kat eden ikincil kırık hatları, tarihsel süreçte büyük sismik yıkımlara sahne olmuştur: 1939 Erzincan (Mw 7,9), 1966 Varto ve 2011 Van (Mw 7,2) depremleri binlerce can kaybına ve zemin sıvılaşması kaynaklı ağır yıkımlara yol açmıştır. Nemrut Dağı ise uyuyan aktif volkan sınıfında izlenmektedir.\n\nBölgenin morfolojik ve meteorolojik afet gerçeği ise çığdır. Sarp ve dik dağ yamaçlarında biriken kalın kar örtüsü, kış ve ilkbahar aylarında Hakkari, Bitlis, Muş ve Van illerinde çığ felaketlerini tetikleyerek ulaşım arterlerini ve yerleşimleri tehdit eder. Aşırı don olayları, heyelanlar ve ilkbaharda kar erimeleriyle oluşan taşkınlar ikincil risklerdir.",
    comparisonTr:
      "Doğu Anadolu, alan payı ile nüfus payı arasındaki makasın en açık olduğu coğrafi bölgedir. Türkiye yüzölçümünün %19,10'unu kaplamasına karşın, ülke nüfusunun yalnızca %6,86'sını barındırır. Kilometrekareye düşen 40 kişilik nüfus yoğunluğu, zorlu iklim ve engebeli yüksek dağ topoğrafyasının etkisiyle Türkiye'nin açık ara en düşük değeridir.",
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
      'Bölgeye ait demografik ve mekânsal veriler, TÜİK Adrese Dayalı Nüfus Kayıt Sistemi (ADNKS 2025) ile Harita Genel Müdürlüğü (HGM) resmi il yüzölçümü tescillerinden konsolide edilmiştir.\n\nTÜİK bölgesel bültenlerini İBBS Düzey-1 (12 bölge) normunda yayımlamaktadır; buradaki toplamlar ise Cumhuriyet döneminin temel coğrafi tasnifi olan 7 klasik coğrafi bölgeye göre illerin değerleri toplanarak elde edilmiştir. Bölge ve alt bölüm sınırlarının tespitinde 6-21 Haziran 1941 tarihli Birinci Türk Coğrafya Kongresi kararları esas alınmıştır.',
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
    neighborCountries: ['Suriye', 'Irak'],
    subregions: ['Orta Fırat Bölümü', 'Dicle Bölümü'],
    gdpShareApproxPercent: 6.1,
    locationAndBordersTr:
      "Güneydoğu Anadolu Bölgesi, Türkiye'nin güneydoğusunda, Güneydoğu Toroslar'ın güney eteklerinden Suriye ve Irak sınırına doğru uzanan geniş bir plato sahasıdır. Denize kıyısı bulunmayan bölge, güney sınırları boyunca Orta Doğu coğrafyasıyla doğrudan bütünleşir.\n\nBölgenin güney kenarı Türkiye'nin en uzun uluslararası kara sınırlarından birini oluşturur. Kilis, Gaziantep, Şanlıurfa, Mardin ve Şırnak boyunca Suriye ile komşudur; Şırnak'ın en güney ucunda ise Irak ile kara sınırı bulunur. Şırnak Silopi'deki Habur Sınır Kapısı, Habur Çayı üzerindeki köprülerle Türkiye'nin Irak'a ve Körfez bölgesine açılan en stratejik transit ticaret kapısıdır; Kilis Öncüpınar ve Gaziantep Karkamış kapıları da Suriye koridorunu sağlar.\n\nİç sınırlarda bölge yalnızca iki coğrafi komşuya sahiptir ve bu, yedi bölge içindeki en dar iç komşuluktur: Kuzeyde Güneydoğu Toroslar boyunca Doğu Anadolu Bölgesi'yle; batıda ise Gaziantep ve Adıyaman üzerinden Akdeniz Bölgesi'yle sınırdaştır.",
    landformsTr:
      "Güneydoğu Anadolu'nun morfolojisini kuzeydeki dağ eteklerinden güneydeki Mezopotamya düzlüklerine doğru hafif eğimle alçalan geniş ve açık platolar belirler. Gaziantep ve Şanlıurfa platoları, akarsu aşındırması ve kireçtaşı tabakaları üzerinde gelişmiş dalgalı tarım yüzeyleridir.\n\nBu açık plato morfolojisinin ortasında sönmüş dev bir kalkan volkan olan Karacadağ (Kolubaba Tepesi 1.957 m) yükselir. Akıcı bazalt lavlarının yüzlerce kilometrekareye yayılmasıyla oluşan yaklaşık 10.000 kilometrekarelik lav kalkanı, Akdeniz havzasının taban alanı en geniş volkanlarından biridir; taşlık ve kayalık bir arazi yaratan bu bazalt örtü doğuda Dicle Vadisi'ne kadar sokularak Diyarbakır'ın tarihi surlarının siyah yapı taşını sağlamıştır.\n\nBölgenin güneyinde yükselen Mardin Dağları (Mardin Eşiği), güneydeki Suriye düzlüklerinden 600-1.000 metre aniden yükselen kireçtaşlı bir basamak oluşturur. Bu eşiğin eteklerinde alüvyonlarla dolmuş dev tarım ovaları sıralanır: Harran, Suruç, Ceylanpınar, Viranşehir ve Araban ovaları bölgenin temel tahıl ve endüstriyel tarım düzlükleridir.\n\nDoğuya gidildikçe arazi hızla engebelenir: Siirt'teki Yazlıca (Herekul) Dağı 2.838 metreye ulaşırken Botan Çayı Türkiye'nin en derin kanyon vadilerinden birini oyar. Şırnak'ta ise Cudi Dağı (2.114 m) sarp doruklarıyla Mezopotamya ovasının kuzey sınırını çizer.",
    climateAndVegetationTr:
      "Güneydoğu Anadolu'nun iklimini belirleyen en temel etken, güneyden sokulan çöl hava kütleleri ve şiddetli buharlaşmadır. Bölgede yaz mevsimi Türkiye'nin en sıcak, en kurak ve buharlaşma şiddetinin en yüksek olduğu dönemdir.\n\nBasra alçak basıncının güneyden taşıdığı kuru ve sıcak hava (samyeli), yaz aylarında sıcaklıkları gölgede 40-45 derecenin üzerine çıkarır. Yetersiz yağış ve aşırı buharlaşma topraktaki nemi hızla tüketir. Kış mevsimi ise Doğu Anadolu kadar sert olmamakla birlikte soğuk ve yer yer don olaylı geçer. Yalnızca batıdaki Gaziantep ve Kilis yöreleri Akdeniz'den gelen nemli hava kütlelerine açık olduğu için kışları daha ılık geçer ve zeytin ile antep fıstığı tarımına elverişli bir mikroklima sunar.\n\nDoğal bitki örtüsü bu şiddetli kuraklığa uyum sağlamış kurakçıl otsu türlerden (antropojen step) oluşur. Aşırı otlatma ve orman tahribatıyla genişleyen bozkırlarda geven, yavşan otu ve devedikeni yaygındır. Toroslar'ın eteklerinde seyrek meşe çalıları görülürken, Şanlıurfa Tektek Dağları ve Gaziantep platolarında yabani fıstık (menengiç/çitlembik) çalıları bölgenin karakteristik yerel florasını oluşturur.",
    hydrographyTr:
      "Bölgenin hidrografik can damarını, kuzeydeki Doğu Anadolu dağlarından doğup Basra Körfezi'ne yönelen Fırat ve Dicle nehirleri oluşturur. Bu iki nehir karların erimesiyle beslendiği için bölgedeki şiddetli yaz kuraklığına rağmen yüksek debiyle akmayı sürdürür.\n\nBatı kanadı drene eden Fırat Nehri, Adıyaman ve Şanlıurfa sınırları boyunca akar. Nehir üzerinde inşa edilen Atatürk Barajı (817 km² göl alanı ve 48,5 milyar m³ su hacmi), Güneydoğu Anadolu Projesi'nin (GAP) kalbidir ve 2.400 megavatlık kurulu gücüyle Türkiye'nin en büyük hidroelektrik santralidir. Baraj gölünden alınan su, 26,4 kilometre uzunluğundaki dev Şanlıurfa Sulama Tünelleri aracılığıyla kurak Harran Ovası'na ve çevre ovalara aktarılarak yüz binlerce hektar araziyi sulamaktadır. Fırat üzerinde daha güneyde Birecik ve Karkamış barajları yer alır.\n\nDoğu kanadı toplayan Dicle Nehri ise Diyarbakır'ın bazalt platosunu yararak Hevsel Bahçeleri'ni sular, Batman ve Ilısu (Veysel Eroğlu) barajlarıyla güneye akar. Batman Çayı, Siirt Botan Çayı ve Şırnak Habur Çayı Dicle'nin ana kollarını oluşturur.\n\nBölgede doğal göl yok denecek kadar azdır; su ihtiyacı Atatürk, Kralkızı, Dicle ve Batman gibi dev baraj gölleri ile yer altı su kuyularından karşılanır.",
    settlementAndPopulationTr:
      "Güneydoğu Anadolu Bölgesi, 9,6 milyona yaklaşan nüfusuyla ülke nüfusunun %11,14'ünü barındırır. Kilometrekareye düşen 126 kişilik nüfus yoğunluğu Türkiye ortalamasının (110 kişi/km²) üzerindedir ve kıyı bölgeleri olan Ege ile Akdeniz'le yarışır.\n\nNüfus ve şehirleşme, Fırat ve Dicle havzalarındaki işlek ticaret koridorlarında ve sulanan tarım vahalarında yoğunlaşmıştır. Bölge nüfusunun yaklaşık üçte ikisi Şanlıurfa (2,26 milyon), Gaziantep (2,22 milyon) ve Diyarbakır (1,85 milyon) metropollerinde toplanmıştır. Gaziantep'in Şahinbey ve Şehitkamil ilçeleri Türkiye'nin en kalabalık ilçeleri arasındadır. Şanlıurfa, 21,8 ortanca yaş değeriyle Türkiye'nin en genç nüfuslu ilidir.\n\nBölge 82 ilçe ile Türkiye'nin en az mülki birimine sahip olmasına karşın, ilçe başına düşen 117 binlik nüfusla Marmara'dan sonra ikinci sıradadır. Göç dinamiklerinde Gaziantep sanayi istihdamı sayesinde dışarıdan net göç alırken, Siirt, Şırnak ve Şanlıurfa'nın kırsal ilçeleri iş olanaklarının sınırlılığı nedeniyle dışarıya net göç vermektedir.",
    economyTr:
      "Güneydoğu Anadolu Bölgesi, Türkiye gayrisafi yurt içi hasılasının yaklaşık %6,1'ini üretir. Bölge ekonomisi GAP sulamalarıyla dönüşen endüstriyel tarıma, Gaziantep merkezli güçlü imalat sanayisine ve Batman'daki petrol üretimine dayanır.\n\nAtatürk Barajı ve sulama kanalları Harran, Ceylanpınar ve Suruç ovalarını sulayarak bölgeyi Türkiye'nin en büyük ham pamuk, mısır, buğday ve kırmızı mercimek üretim üssü hâline getirmiştir; Türkiye pamuk üretiminin yarısından fazlası bu topraklardan sağlanır. Kuru tarım yapılan platolarda ise antep fıstığı ve zeytin yetiştiriciliği bölgenin marka değeridir.\n\nSanayi ve dış ticaretin lideri Gaziantep'tir; makine halısı, dokuma, gıda, ambalaj ve kimya sektörlerinde Türkiye'nin en büyük organize sanayi bölgelerine sahip olan kent, Orta Doğu ve dünya pazarlarına yönelik devasa bir ihracat merkezidir. Batman ise Türkiye'nin petrol başkentidir: 1940'ta Raman-1 kuyusunda petrol keşfedilmiş, 1948'de Raman-8 kuyusuyla ticari üretime geçilmiş ve 1955'te Türkiye'nin ilk modern petrol rafinerisi olan Batman Rafinerisi kurularak yerli petrol işlenmeye başlanmıştır.",
    subregionsTr:
      "1941 Coğrafya Kongresi kararlarına göre Güneydoğu Anadolu Bölgesi iki ana coğrafi bölüme ayrılır:\n\n1. **Orta Fırat Bölümü:** Batıda Fırat Nehri havzasını, Gaziantep ve Şanlıurfa platolarını, Harran Ovası'nı ve Adıyaman yöresini kapsar. GAP sulu tarımı, gelişmiş sanayi, ticaret ve yüksek nüfus yoğunluğu ile bölgenin ekonomik lokomotifidir.\n2. **Dicle Bölümü:** Doğuda Dicle Nehri havzasını, Diyarbakır çanağını, Mardin Eşiği'ni, Batman, Siirt ve Şırnak dağlık sahalarını içine alır. Karacadağ bazalt platosu, petrol çıkarımı, vadi tarımı ve küçükbaş hayvancılık bu bölümün ana karakteridir.",
    disasterAndEarthquakeTr:
      "Bölgenin batı kesimi Doğu Anadolu Fay Zonu'nun doğrudan etki alanındadır. 6 Şubat 2023 Kahramanmaraş merkezli depremlerde Gaziantep'in Nurdağı ve İslahiye ilçeleri fay hattı üzerinde yer almaları nedeniyle ağır can kaybı ve yıkım yaşamıştır.\n\nBölgenin ikinci jeolojik unsuru ortada yükselen sönmüş Karacadağ kalkan volkanıdır; MTA tarafından Türkiye'nin genç aktif volkanları arasında sınıflandırılmaktadır.\n\nBölgenin en kritik ve sürekli çevresel afeti ise şiddetli yaz kuraklığı ve aşırı buharlaşmadır. Yetersiz yağışlar tarımsal kuraklığı tetiklerken, rüzgâr erozyonu verimli toprakları aşındırır. Ayrıca GAP sahasında aşırı ve vahşi sulama yapılan tarım arazilerinde yer altı su seviyesinin yüzeye yaklaşmasıyla toprakta çoraklaşma ve tuzlanma tehlikesi ortaya çıkmaktadır.",
    comparisonTr:
      "Güneydoğu Anadolu, denize kıyısı bulunmayan iki iç bölgeden biridir. Buna karşın kilometrekareye 126 kişi düşen nüfus yoğunluğuyla, kıyı bölgeleri olan Ege ve Akdeniz'in üzerinde bir yoğunluğa sahiptir. Genç nüfus yapısı ve GAP sulama projeleriyle genişleyen tarımsal vahalar, bölgenin demografik canlılığını beslemektedir.",
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
      'Bölgeye ait demografik ve mekânsal veriler, TÜİK Adrese Dayalı Nüfus Kayıt Sistemi (ADNKS 2025) ile Harita Genel Müdürlüğü (HGM) resmi il yüzölçümü tescillerinden konsolide edilmiştir.\n\nTÜİK bölgesel bültenlerini İBBS Düzey-1 (12 bölge) normunda yayımlamaktadır; buradaki toplamlar ise Cumhuriyet döneminin temel coğrafi tasnifi olan 7 klasik coğrafi bölgeye göre illerin değerleri toplanarak elde edilmiştir. Bölge ve alt bölüm sınırlarının tespitinde 6-21 Haziran 1941 tarihli Birinci Türk Coğrafya Kongresi kararları esas alınmıştır.',
    footnotes: [
      'Nüfus ve yüzölçümü değerleri, bölgedeki illerin tek tek değerlerinin toplamıdır. TÜİK bölgesel istatistiklerini İBBS Düzey-1 sınıflandırmasına göre yayımlar; o sınıflandırma 12 bölgeden oluşur ve buradaki yedili coğrafi bölge ayrımından ayrıdır. Alan payı, 81 ilin yüzölçümü toplamı olan 780.040 km² üzerinden hesaplanmıştır.',
    ],
  },
];
