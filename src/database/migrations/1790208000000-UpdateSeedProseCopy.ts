import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Data-only migration: carries the seed prose edits of this change into databases that were
 * seeded before it. Deploys run migrations only, never the seed CLIs, so without this the
 * edited seed text would reach new databases and never the existing one.
 *
 * Each change rewrites ONE column of ONE row, and only while that column still holds exactly
 * the old text (`IS NOT DISTINCT FROM`), so a row that was edited some other way is left
 * alone rather than overwritten. `down()` applies the same guard in the other direction.
 * `updated_at` is set by hand because raw SQL bypasses `@UpdateDateColumn`.
 */
type SeedCopyChange = {
  readonly table: 'regions' | 'provinces' | 'countries';
  readonly keyColumn: 'region' | 'plate_code' | 'iso_code';
  readonly key: string | number;
  readonly property: string;
  readonly column: string;
  readonly kind: 'scalar' | 'jsonb' | 'textarray';
  readonly before: unknown;
  readonly after: unknown;
};

export const SEED_COPY_CHANGES: readonly SeedCopyChange[] = [
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'MARMARA',
    property: 'locationAndBordersTr',
    column: 'location_and_borders_tr',
    kind: 'scalar',
    before:
      "Marmara Bölgesi, Türkiye'nin kuzeybatısında Asya ile Avrupa kıtalarını birbirine bağlayan doğal bir köprü konumundadır. Karadeniz, Marmara Denizi ve Ege Denizi ile çevrili olması, bölgeyi üç farklı denizel etkiye açarken aynı zamanda Türkiye'nin Avrupa kıtasındaki (Trakya) tüm topraklarını bünyesinde toplar.\n\nBölgenin uluslararası sınırları Trakya üzerinden Balkanlar'a açılır. [Kırklareli](/v2/turkiye/kirklareli) kuzeyde Bulgaristan ile, [Edirne](/v2/turkiye/edirne) ise hem Bulgaristan hem de batıda Meriç Nehri hattı boyunca Yunanistan ile komşudur. Kapıkule ve İpsala gibi sınır kapıları, Anadolu'nun Avrupa ile kara yolu ve demir yolu transit ticaretinin ana koridorlarını oluşturur.\n\nİç sınırlarda bölge; güneyde [Balıkesir](/v2/turkiye/balikesir), [Bursa](/v2/turkiye/bursa) ve [Bilecik](/v2/turkiye/bilecik) üzerinden Ege Bölgesi'yle; doğuda [Sakarya](/v2/turkiye/sakarya) ve Bilecik üzerinden Karadeniz Bölgesi'yle; güneydoğuda ise Bilecik üzerinden İç Anadolu Bölgesi'yle komşudur. Bu geniş geçiş konumu, bölgenin iç ve dış ulaşım ağlarının kesişim noktası olmasını sağlamıştır.",
    after:
      "Marmara Bölgesi, Türkiye'nin kuzeybatısında Asya ile Avrupa kıtalarını birbirine bağlayan doğal bir köprü konumundadır. Karadeniz, Marmara Denizi ve Ege Denizi ile çevrili olması, bölgeyi üç ayrı denizin etkisine açar; bölge ayrıca Türkiye'nin Avrupa kıtasındaki (Trakya) tüm topraklarını içine alır.\n\nBölgenin uluslararası sınırları Trakya üzerinden Balkanlar'a açılır. [Kırklareli](/turkiye/kirklareli) kuzeyde Bulgaristan ile, [Edirne](/turkiye/edirne) ise hem Bulgaristan hem de batıda Meriç Nehri hattı boyunca Yunanistan ile komşudur. Kapıkule ve İpsala gibi sınır kapıları, Anadolu'nun Avrupa ile kara yolu ve demir yolu transit ticaretinin ana koridorlarını oluşturur.\n\nİç sınırlarda bölge; güneyde [Balıkesir](/turkiye/balikesir), [Bursa](/turkiye/bursa) ve [Bilecik](/turkiye/bilecik) üzerinden Ege Bölgesi'yle; doğuda [Sakarya](/turkiye/sakarya) ve Bilecik üzerinden Karadeniz Bölgesi'yle; güneydoğuda ise Bilecik üzerinden İç Anadolu Bölgesi'yle komşudur. Bu geniş geçiş konumu, bölgenin iç ve dış ulaşım ağlarının kesişim noktası olmasını sağlamıştır.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'MARMARA',
    property: 'landformsTr',
    column: 'landforms_tr',
    kind: 'scalar',
    before:
      "Marmara, Türkiye'nin ortalama yükseltisi en az olan ve engebesi en düşük coğrafi bölgesidir. Bölgenin ana morfolojik omurgasını dağ sıralarından ziyade [İstanbul](/v2/turkiye/istanbul) ve [Çanakkale](/v2/turkiye/canakkale) boğazları ile Marmara Denizi çöküntü çanağı belirler. Karadeniz ile Akdeniz su sistemini birbirine bağlayan boğazlar, dördüncü jeolojik zamanda (Kuvaterner) eski akarsu vadilerinin deniz suları altında kalmasıyla (riya tipi kıyı) oluşmuş ve iki kıtayı birbirinden ayırmıştır.\n\nYükseltiler bölgenin kenarlarında toplanır. Güneyde 2.543 metreye ulaşan Uludağ, bölgenin en yüksek noktasıdır; kuzey yamaçlarındaki sirk gölleri, Türkiye'de buzul aşındırmasının en batıdaki izlerini taşır. Trakya'nın Karadeniz kıyısı boyunca uzanan Yıldız Dağları (Mahya Tepesi 1.031 m), Karadeniz'in nemli hava kütlelerini kıyıda tutarak iç kesimdeki Ergene çöküntüsünü kuraklaştırır. Güneybatıda ise Kaz Dağları, Biga Yarımadası ile Ege arasında ormanlık yüksek bir kütle oluşturur.\n\nDağlık kenarların arasında kalan geniş sahalar ise alçak plato ve aşınım düzlükleridir. İstanbul ve [Kocaeli](/v2/turkiye/kocaeli), aşınmış Kocaeli Platosu üzerinde gelişmiştir; en yüksek tepe olan Aydos ancak 538 metreye ulaşır. Trakya'nın iç çanağında uzanan Ergene Havzası ise akarsu alüvyonlarıyla dolmuş, tarıma son derece elverişli dalgalı bir düzlüktür.\n\nBölgeyi boydan boya kesen Kuzey Anadolu Fay Hattı, Marmara Denizi tabanındaki 1.000 metreyi aşan derin çukurlukları oluşturduktan sonra Şarköy-Gaziköy hattından karaya çıkarak Ganos Dağları üzerinden Saros Körfezi'ne bağlanır.",
    after:
      "Marmara, Türkiye'nin ortalama yükseltisi en az olan ve engebesi en düşük coğrafi bölgesidir. Bölgenin yer şekillerini dağ sıralarından çok [İstanbul](/turkiye/istanbul) ve [Çanakkale](/turkiye/canakkale) boğazları ile Marmara Denizi çöküntü çanağı belirler. Karadeniz ile Akdeniz su sistemini birbirine bağlayan boğazlar, dördüncü jeolojik zamanda (Kuvaterner) eski akarsu vadilerinin deniz suları altında kalmasıyla (riya tipi kıyı) oluşmuş ve iki kıtayı birbirinden ayırmıştır.\n\nYükseltiler bölgenin kenarlarında toplanır. Güneyde 2.543 metreye ulaşan Uludağ, bölgenin en yüksek noktasıdır; kuzey yamaçlarındaki sirk gölleri, Türkiye'de buzul aşındırmasının en batıdaki izlerini taşır. Trakya'nın Karadeniz kıyısı boyunca uzanan Yıldız Dağları (Mahya Tepesi 1.031 m), Karadeniz'in nemli hava kütlelerini kıyıda tutarak iç kesimdeki Ergene çöküntüsünü kuraklaştırır. Güneybatıda ise Kaz Dağları, Biga Yarımadası ile Ege arasında ormanlık yüksek bir kütle oluşturur.\n\nDağlık kenarların arasında kalan geniş sahalar ise alçak plato ve aşınım düzlükleridir. İstanbul ve [Kocaeli](/turkiye/kocaeli), aşınmış Kocaeli Platosu üzerinde gelişmiştir; en yüksek tepe olan Aydos ancak 538 metreye ulaşır. Trakya'nın iç çanağında uzanan Ergene Havzası ise akarsu alüvyonlarıyla dolmuş, tarıma son derece elverişli dalgalı bir düzlüktür.\n\nBölgeyi boydan boya kesen Kuzey Anadolu Fay Hattı, Marmara Denizi tabanındaki 1.000 metreyi aşan derin çukurlukları oluşturduktan sonra Şarköy-Gaziköy hattından karaya çıkarak Ganos Dağları üzerinden Saros Körfezi'ne bağlanır.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'MARMARA',
    property: 'climateAndVegetationTr',
    column: 'climate_and_vegetation_tr',
    kind: 'scalar',
    before:
      "Marmara, tek bir iklim tipinin değil; Karadeniz, Akdeniz ve karasal iklimlerin karşılaştığı bir geçiş sahasıdır. Bu iklim mozaiği, yer şekillerinin alçak olması ve üç denizin farklı hava kütlelerinin iç içe geçmesinden kaynaklanır.\n\nKuzeyde Karadeniz kıyı kuşağı (Kocaeli, Sakarya ve Yıldız Dağları'nın kuzey yamaçları) her mevsim yağışlı ve ılımandır. Güney Marmara kıyıları (Bursa, Balıkesir, Çanakkale) yazları sıcak ve kurak geçen tipik Akdeniz karakteri taşır. Yıldız Dağları'nın arkasında kalan Ergene Havzası (Edirne, [Tekirdağ](/v2/turkiye/tekirdag), Kırklareli) ise deniz etkisine kapalı olduğu için kışları sert, yazları sıcak ve kurak bir karasal iklim yaşar.\n\nBitki örtüsü de bu iklim geçişini doğrudan yansıtır. Karadeniz'e bakan yamaçlarda kayın, kestane ve meşelerden oluşan nemli ormanlar ile nemcil çalılar (psödomaki) yer alır. Güney kıyılarda ise zeytinlikler ve maki toplulukları hâkimdir. Ancak enlem etkisi ve sıcaklıkların düşmesi nedeniyle maki üst sınırı, Akdeniz kıyılarındaki 800 metreden Marmara'da 300-400 metreye kadar iner. İç kısımdaki Ergene çanağında ise ormanların tahrip edildiği düzlüklerde bozkırlar (antropojen step) uzanır.",
    after:
      "Marmara, tek bir iklim tipinin değil; Karadeniz, Akdeniz ve karasal iklimlerin karşılaştığı bir geçiş sahasıdır. Bu iklim mozaiği, yer şekillerinin alçak olması ve üç denizin farklı hava kütlelerinin iç içe geçmesinden kaynaklanır.\n\nKuzeyde Karadeniz kıyı kuşağı (Kocaeli, Sakarya ve Yıldız Dağları'nın kuzey yamaçları) her mevsim yağışlı ve ılımandır. Güney Marmara kıyıları (Bursa, Balıkesir, Çanakkale) yazları sıcak ve kurak geçen tipik Akdeniz karakteri taşır. Yıldız Dağları'nın arkasında kalan Ergene Havzası (Edirne, [Tekirdağ](/turkiye/tekirdag), Kırklareli) ise deniz etkisine kapalı olduğu için kışları sert, yazları sıcak ve kurak bir karasal iklim yaşar.\n\nBitki örtüsü de bu iklim geçişini doğrudan yansıtır. Karadeniz'e bakan yamaçlarda kayın, kestane ve meşelerden oluşan nemli ormanlar ile nemcil çalılar (psödomaki) yer alır. Güney kıyılarda ise zeytinlikler ve maki toplulukları hâkimdir. Ancak enlem etkisi ve sıcaklıkların düşmesi nedeniyle maki üst sınırı, Akdeniz kıyılarındaki 800 metreden Marmara'da 300-400 metreye kadar iner. İç kısımdaki Ergene çanağında ise ormanların yok edildiği düzlüklerde insan eliyle oluşmuş bozkırlar (antropojen step) uzanır.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'MARMARA',
    property: 'hydrographyTr',
    column: 'hydrography_tr',
    kind: 'scalar',
    before:
      "Bölgenin hidrografik yapısı, alçak düzlükleri sulayan akarsular ve tektonik çöküntü göllerinden oluşur.\n\nTrakya'nın su ağını Meriç, Tunca ve Ergene nehirleri örer. Bulgaristan'dan doğup Türkiye-Yunanistan sınırını çizen Meriç Nehri, Edirne'de Tunca ile birleşerek geniş taşkın ovaları oluşturur; bu alüvyal zemin Türkiye'nin en büyük pirinç (çeltik) üretim sahasıdır. Trakya'nın iç kesimini toplayan Ergene Nehri ise Meriç'e katılarak Enez yakınlarında Ege'ye dökülür.\n\nDoğu kanatta Sakarya Nehri, İç Anadolu'dan taşıdığı suları Bilecik üzerinden geçirerek Sakarya'da Karadeniz'e ulaştırır ve ağzında tarımsal açıdan verimli bir taşkın ovası meydana getirir.\n\nBölgenin büyük gölleri Güney Marmara'daki tektonik fay çukurluklarında sıralanır. Bursa sınırlarındaki İznik Gölü (298 km²), bölgenin en büyük doğal gölü olup tatlı suyuyla çevresindeki zeytin ve meyve bahçelerini besler. Uluabat Gölü ise sığ yapısı ve zengin biyolojik çeşitliliğiyle uluslararası öneme sahip bir sulak alandır. Kocaeli ve Sakarya sınırındaki Sapanca Gölü ise hem bölgesel içme suyu temininde hem de sanayi kullanımında kritik bir tatlı su rezervidir.",
    after:
      "Bölgenin suları, alçak düzlükleri sulayan akarsulardan ve tektonik çöküntü göllerinden oluşur.\n\nTrakya'nın su ağını Meriç, Tunca ve Ergene nehirleri örer. Bulgaristan'dan doğup Türkiye-Yunanistan sınırını çizen Meriç Nehri, Edirne'de Tunca ile birleşerek geniş taşkın ovaları oluşturur; bu alüvyal zemin Türkiye'nin en büyük pirinç (çeltik) üretim sahasıdır. Trakya'nın iç kesimini toplayan Ergene Nehri ise Meriç'e katılarak Enez yakınlarında Ege'ye dökülür.\n\nDoğu kanatta Sakarya Nehri, İç Anadolu'dan taşıdığı suları Bilecik üzerinden geçirerek Sakarya'da Karadeniz'e ulaştırır ve ağzında tarımsal açıdan verimli bir taşkın ovası meydana getirir.\n\nBölgenin büyük gölleri Güney Marmara'daki tektonik fay çukurluklarında sıralanır. Bursa sınırlarındaki İznik Gölü (298 km²), bölgenin en büyük doğal gölü olup tatlı suyuyla çevresindeki zeytin ve meyve bahçelerini besler. Uluabat Gölü ise sığ yapısı ve zengin biyolojik çeşitliliğiyle uluslararası öneme sahip bir sulak alandır. Kocaeli ve Sakarya sınırındaki Sapanca Gölü ise hem bölgesel içme suyu temininde hem de sanayi kullanımında kritik bir tatlı su rezervidir.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'MARMARA',
    property: 'settlementAndPopulationTr',
    column: 'settlement_and_population_tr',
    kind: 'scalar',
    before:
      "Marmara, 26,7 milyonu aşan nüfusuyla Türkiye nüfusunun yaklaşık üçte birini (%31,03) barındırır. Kilometrekareye düşen 368 kişilik nüfus yoğunluğu, 110 kişilik Türkiye ortalamasının üç katından fazladır ve bölgeyi açık ara ülkenin en yoğun yerleşim alanı yapar.\n\nBu yoğunluk bölge geneline eşit dağılmaz; fiziki coğrafyanın sunduğu ulaşım ve liman avantajlarına göre keskin bir kümelenme gösterir. İstanbul tek başına 15,7 milyonu aşan nüfusuyla bölgenin yarısından fazlasını toplar. İzmit Körfezi, Çorlu-Çerkezköy hattı ve Bursa Ovası sanayi, liman ve kara yolu bağlantıları sayesinde yoğun göç alarak hızla şehirleşmiştir; nitekim [Yalova](/v2/turkiye/yalova) ve Tekirdağ Türkiye'nin en yüksek net göç hızına sahip illeri arasındadır.\n\nBuna karşılık ulaşım koridorlarının uzağında kalan, arazisi dağlık ve ormanlık olan Yıldız Dağları kesimi ile Biga Yarımadası'nın engebeli iç sahaları bölgenin en tenha alanları olarak kalmıştır.",
    after:
      "Marmara, 26,7 milyonu aşan nüfusuyla Türkiye nüfusunun yaklaşık üçte birini (%31,03) barındırır. Kilometrekareye düşen 368 kişilik nüfus yoğunluğu, 110 kişilik Türkiye ortalamasının üç katından fazladır ve bölgeyi açık ara ülkenin en yoğun yerleşim alanı yapar.\n\nBu yoğunluk bölge geneline eşit dağılmaz; fiziki coğrafyanın sunduğu ulaşım ve liman avantajlarına göre keskin bir kümelenme gösterir. İstanbul tek başına 15,7 milyonu aşan nüfusuyla bölgenin yarısından fazlasını toplar. İzmit Körfezi, Çorlu-Çerkezköy hattı ve Bursa Ovası sanayi, liman ve kara yolu bağlantıları sayesinde yoğun göç alarak hızla şehirleşmiştir; nitekim [Yalova](/turkiye/yalova) ve Tekirdağ Türkiye'nin en yüksek net göç hızına sahip illeri arasındadır.\n\nBuna karşılık ulaşım koridorlarının uzağında kalan, arazisi dağlık ve ormanlık olan Yıldız Dağları kesimi ile Biga Yarımadası'nın engebeli iç sahaları bölgenin en tenha alanları olarak kalmıştır.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'MARMARA',
    property: 'economyTr',
    column: 'economy_tr',
    kind: 'scalar',
    before:
      "Marmara Bölgesi, Türkiye gayrisafi yurt içi hasılasının yaklaşık %43'ünü üreterek ülke ekonomisinin üretim ve finans omurgasını oluşturur. Bu ekonomik güç, iki kıtayı bağlayan jeostratejik konumu, korunaklı deniz limanları ve düz topoğrafyasının sağladığı kesintisiz ulaşım ağlarına dayanır.\n\nİmalat sanayisi, lojistik ve finans hizmetleri İstanbul, Kocaeli ve Bursa ekseninde kümelenmiştir. İzmit Körfezi boyunca uzanan limanlar ve tesisler Türkiye dış ticaretinin en büyük kapısıdır. Tekirdağ ve Çorlu çevresi ise tekstil ve kimya sanayisiyle Trakya'nın üretim merkezidir.\n\nTarımsal üretim arazinin jeomorfolojik çeşitliliğine uyum sağlamıştır. Ergene Havzası'nın düz tabanı ayçiçeği ve buğday tarımına ayrılmışken, Meriç taşkın sahalarında çeltik üretilir. Güney Marmara'nın verimli çöküntü ovalarında (Bursa, Balıkesir) sebze, meyve ve konserve sanayisi gelişmiştir; Marmara ve Ege kıyı yamaçlarında ise zeytincilik ve bağcılık yaygındır. Ayrıca boğazlar ve Marmara Denizi, balık göç yolları üzerinde yer alarak kıyı balıkçılığına olanak tanır.",
    after:
      "Marmara Bölgesi, Türkiye gayrisafi yurt içi hasılasının yaklaşık %43'ünü üreterek ülke ekonomisinin üretim ve finans omurgasını oluşturur. Bu ekonomik güç, iki kıtayı bağlayan stratejik konumu, korunaklı deniz limanları ve düz topoğrafyasının sağladığı kesintisiz ulaşım ağlarına dayanır.\n\nİmalat sanayisi, lojistik ve finans hizmetleri İstanbul, Kocaeli ve Bursa ekseninde kümelenmiştir. İzmit Körfezi boyunca uzanan limanlar ve tesisler Türkiye dış ticaretinin en büyük kapısıdır. Tekirdağ ve Çorlu çevresi ise tekstil ve kimya sanayisiyle Trakya'nın üretim merkezidir.\n\nTarımsal üretim, arazinin farklı yer şekillerine uyum sağlamıştır. Ergene Havzası'nın düz tabanı ayçiçeği ve buğday tarımına ayrılmışken, Meriç taşkın sahalarında çeltik üretilir. Güney Marmara'nın verimli çöküntü ovalarında (Bursa, Balıkesir) sebze, meyve ve konserve sanayisi gelişmiştir; Marmara ve Ege kıyı yamaçlarında ise zeytincilik ve bağcılık yaygındır. Ayrıca boğazlar ve Marmara Denizi, balık göç yolları üzerinde yer alarak kıyı balıkçılığına olanak tanır.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'MARMARA',
    property: 'disasterAndEarthquakeTr',
    column: 'disaster_and_earthquake_tr',
    kind: 'scalar',
    before:
      "Marmara'nın başlıca doğal afet gerçeği sismik hareketliliktir. Kuzey Anadolu Fay Hattı'nın kuzey kolu Marmara Denizi tabanındaki derin çukurluklardan geçer ve Şarköy üzerinden Saros Körfezi'ne uzanır. Tarihsel süreçte 1855 Bursa, 1912 Mürefte ve 1999 Gölcük depremleri gibi büyük sarsıntılar bu fay sisteminin hareketleriyle meydana gelmiştir.\n\nRisk yalnızca fay hattına yakınlıktan değil, nüfus ve sanayinin alüvyon dolgulu zeminler ve kıyı düzlüklerinde toplanmasından kaynaklanır. Özellikle çöküntü havzalarında gevşek zemin üzerine inşa edilmiş yoğun yerleşimler, deprem dalgalarının büyütülmesi nedeniyle yüksek hasar riski taşır.\n\nKuzey kesimlerdeki dik vadilerde aşırı yağış dönemlerinde sel ve taşkınlar, eğimli yamaçlarda ise yer yer heyelanlar ikincil riskler olarak ortaya çıkar.",
    after:
      "Marmara'nın başlıca doğal afet riski depremdir. Kuzey Anadolu Fay Hattı'nın kuzey kolu Marmara Denizi tabanındaki derin çukurluklardan geçer ve Şarköy üzerinden Saros Körfezi'ne uzanır. Tarihsel süreçte 1855 Bursa, 1912 Mürefte ve 1999 Gölcük depremleri gibi büyük sarsıntılar bu fay sisteminin hareketleriyle meydana gelmiştir.\n\nRisk yalnızca fay hattına yakınlıktan değil, nüfus ve sanayinin alüvyon dolgulu zeminler ve kıyı düzlüklerinde toplanmasından kaynaklanır. Özellikle çöküntü havzalarında gevşek zemin üzerine inşa edilmiş yoğun yerleşimler, deprem dalgalarının büyütülmesi nedeniyle yüksek hasar riski taşır.\n\nKuzey kesimlerdeki dik vadilerde aşırı yağış dönemlerinde sel ve taşkınlar, eğimli yamaçlarda ise yer yer heyelanlar ikincil riskler olarak ortaya çıkar.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'MARMARA',
    property: 'comparisonTr',
    column: 'comparison_tr',
    kind: 'scalar',
    before:
      "Marmara, Türkiye yüzölçümünün onda birinden az bir alan kaplamasına (%9,32) karşın, ülke nüfusunun neredeyse üçte birini (%31,03) ve milli hasılanın %43'ünü barındırır. Kilometrekareye düşen 368 kişilik nüfus yoğunluğu, düz yer şekilleri ve kıtalararası ticaret aksının yarattığı devasa beşeri yığılmayı özetler.",
    after:
      "Marmara, Türkiye yüzölçümünün onda birinden az bir alan kaplamasına (%9,32) karşın, ülke nüfusunun neredeyse üçte birini (%31,03) ve milli hasılanın %43'ünü barındırır. Kilometrekareye düşen 368 kişilik nüfus yoğunluğu, düz yer şekillerinin ve kıtalar arası ticaret yolunun yarattığı devasa nüfus yığılmasını özetler.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'EGE',
    property: 'locationAndBordersTr',
    column: 'location_and_borders_tr',
    kind: 'scalar',
    before:
      "Ege Bölgesi, Anadolu Yarımadası'nın batısında, Ege Denizi kıyılarından İç Anadolu eşiğine kadar uzanır. Bölgenin batı sınırını çizen kıyı şeridi; çok sayıda koy, körfez, yarımada ve ada ile Türkiye'nin en girintili çıkıntılı deniz cephesini oluşturur; yalnızca [Muğla](/v2/turkiye/mugla) kıyıları yaklaşık 1.480 kilometreyle Türkiye'nin en uzun il kıyı şerididir.\n\nBölgenin hiçbir yabancı ülkeyle kara sınırı bulunmaz; buna karşılık Ege Denizi üzerinden Yunanistan'a bağlı adalarla yakın bir deniz komşuluğu paylaşır.\n\nİç sınırlarda bölge üç komşuya açılır: Kuzeyde [İzmir](/v2/turkiye/izmir), [Manisa](/v2/turkiye/manisa) ve [Kütahya](/v2/turkiye/kutahya) üzerinden Marmara Bölgesi'yle; doğuda [Afyonkarahisar](/v2/turkiye/afyonkarahisar) ve Kütahya üzerinden İç Anadolu Bölgesi'yle; güneyde ise Muğla, [Denizli](/v2/turkiye/denizli) ve Afyonkarahisar üzerinden Akdeniz Bölgesi'yle sınırdaştır. Doğu-batı doğrultusunda uzanan vadi olukları, kıyı şeridini Anadolu'nun iç kesimlerine kesintisiz bağlayan doğal ulaşım koridorları sunar.",
    after:
      "Ege Bölgesi, Anadolu Yarımadası'nın batısında, Ege Denizi kıyılarından İç Anadolu eşiğine kadar uzanır. Bölgenin batı sınırını çizen kıyı şeridi; çok sayıda koy, körfez, yarımada ve ada ile Türkiye'nin en girintili çıkıntılı deniz cephesini oluşturur; yalnızca [Muğla](/turkiye/mugla) kıyıları yaklaşık 1.480 kilometreyle Türkiye'nin en uzun il kıyı şerididir.\n\nBölgenin hiçbir yabancı ülkeyle kara sınırı bulunmaz; buna karşılık Ege Denizi üzerinden Yunanistan'a bağlı adalarla yakın bir deniz komşuluğu paylaşır.\n\nİç sınırlarda bölge üç komşuya açılır: Kuzeyde [İzmir](/turkiye/izmir), [Manisa](/turkiye/manisa) ve [Kütahya](/turkiye/kutahya) üzerinden Marmara Bölgesi'yle; doğuda [Afyonkarahisar](/turkiye/afyonkarahisar) ve Kütahya üzerinden İç Anadolu Bölgesi'yle; güneyde ise Muğla, [Denizli](/turkiye/denizli) ve Afyonkarahisar üzerinden Akdeniz Bölgesi'yle sınırdaştır. Doğu-batı doğrultusunda uzanan vadi olukları, kıyı şeridini Anadolu'nun iç kesimlerine kesintisiz bağlayan doğal ulaşım koridorları sunar.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'EGE',
    property: 'landformsTr',
    column: 'landforms_tr',
    kind: 'scalar',
    before:
      "Ege Bölgesi'nin morfolojik omurgasını, yer kabuğunun kırılmasıyla (faylanma) oluşan dağ ve çöküntü düzeni (horst-graben sistemi) belirler. Yan basınçlarla gerilen yer kabuğunun kırılması sonucu yüksekte kalan kütleler (horstlar) kıyıya dik uzanan Madra, Yunt, Bozdağlar ve [Aydın](/v2/turkiye/aydin) dağlarını; çöken bloklar (grabenler) ise Bakırçay, Gediz, Küçük Menderes ve Büyük Menderes ovalarını oluşturmuştur.\n\nDağların kıyıya dik uzanması bölgenin coğrafi kaderini belirleyen temel unsurdur. Deniz suları çöken vadilerin ağızlarına sokularak derin körfezler (Edremit, Çandarlı, İzmir, Kuşadası, Güllük) ve yarımadalar yaratmış; kıyıda enine kıyı tipi gelişmiştir. Denizel ılıman hava kütleleri bu vadi koridorları boyunca yaklaşık 150-200 kilometre içeriye sokularak İç Ege eşiğine kadar yayılır.\n\nBu kuralın tek istisnası güneydeki Menteşe Yöresi'dir. Burada dağlar kıyıya paralel ve karmaşık uzanır; arazinin aşırı dağlık ve sarp olması ulaşımı güçleştirmiş ve yöreyi kıyı Ege'nin işlek ticaret aksından ayırmıştır.\n\nİç kesimlere doğru yükselti basamaklar hâlinde artar: Denizli'deki Honaz Dağı (2.571 m) bölgenin en yüksek zirvesidir. Kütahya'daki Murat Dağı (2.312 m) ise İç Batı Anadolu platosunun engebeli çatısını oluşturur. Pamukkale'deki dünyaca ünlü traverten basamakları da bu yoğun faylanma ağından yüzeye çıkan kalsiyum bikarbonatlı termal suların kirecini çökelterek yüzeyi kaplamasıyla oluşmuştur.",
    after:
      "Ege Bölgesi'nin yer şekillerini, yer kabuğunun kırılmasıyla (faylanma) oluşan dağ ve çöküntü düzeni (horst-graben sistemi) belirler. Kuzey-güney yönünde gerilen (açılan) yer kabuğunun kırılması sonucu yüksekte kalan kütleler (horstlar) kıyıya dik uzanan Madra, Yunt, Bozdağlar ve [Aydın](/turkiye/aydin) dağlarını; çöken bloklar (grabenler) ise Bakırçay, Gediz, Küçük Menderes ve Büyük Menderes ovalarını oluşturmuştur.\n\nDağların kıyıya dik uzanması bölgenin coğrafi kaderini belirleyen temel unsurdur. Deniz suları çöken vadilerin ağızlarına sokularak derin körfezler (Edremit, Çandarlı, İzmir, Kuşadası, Güllük) ve yarımadalar yaratmış; kıyıda enine kıyı tipi gelişmiştir. Denizden gelen ılıman hava kütleleri bu vadi koridorları boyunca yaklaşık 150-200 kilometre içeriye sokularak İç Ege eşiğine kadar yayılır.\n\nBu kuralın tek istisnası güneydeki Menteşe Yöresi'dir. Burada dağlar kıyıya paralel ve karmaşık uzanır; arazinin aşırı dağlık ve sarp olması ulaşımı güçleştirmiş ve yöreyi kıyı Ege'nin işlek ticaret aksından ayırmıştır.\n\nİç kesimlere doğru yükselti basamaklar hâlinde artar: Denizli'deki Honaz Dağı (2.571 m) bölgenin en yüksek zirvesidir. Kütahya'daki Murat Dağı (2.312 m) ise İç Batı Anadolu platosunun engebeli çatısını oluşturur. Pamukkale'deki dünyaca ünlü traverten basamakları da bu yoğun faylanma ağından yüzeye çıkan kireçli (kalsiyum bikarbonatlı) sıcak suların, taşıdıkları kireci biriktirerek yüzeyi kaplamasıyla oluşmuştur.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'EGE',
    property: 'climateAndVegetationTr',
    column: 'climate_and_vegetation_tr',
    kind: 'scalar',
    before:
      "Ege Bölgesi, dağların uzanış doğrultusu ve kıyıdan iç kesime doğru artan yükselti nedeniyle belirgin bir iklim geçişine sahne olur.\n\nKıyı Ege'de (İzmir, Aydın, Manisa, Muğla) sıcak ve kurak yazlar ile ılık ve yağışlı kışların yaşandığı tipik Akdeniz iklimi egemendir. Dağların kıyıya dik uzanması sayesinde Akdeniz ikliminin ılımanlaştırıcı etkisi ve zeytin tarımı Gediz ve Menderes grabenleri boyunca Afyon ve [Uşak](/v2/turkiye/usak) sınırına kadar sokulur. Ancak yükseltinin 1.000 metreyi aştığı İç Batı Anadolu platosuna (Kütahya, Afyonkarahisar, Uşak) geçildiğinde deniz etkisi tamamen kesilir; yerini kışları karlı ve don olaylı, yazları kurak geçen sert karasal iklime bırakır.\n\nBitki örtüsü de bu coğrafi geçişi izler. Kıyı kuşağında kızılçam ormanlarının tahrip edildiği sahalarda zeytin, defne, mersin ve lavantadan oluşan maki ile kireçli arazilerde garig toplulukları yaygındır. Ege'de maki üst sınırı enlem etkisiyle 400-600 metre bandında kalır. Dik yamaçları denizden gelen nemli hava kütlelerini yakalayan Menteşe Dağları ise Türkiye'nin en bol yağış alan sahalarından biri olup gür kızılçam ve karaçam ormanlarıyla kaplıdır. İç kısımdaki yüksek platolarda ise otsu bozkırlar (step) geniş alan tutar.",
    after:
      "Ege Bölgesi, dağların uzanış doğrultusu ve kıyıdan iç kesime doğru artan yükselti nedeniyle belirgin bir iklim geçişine sahne olur.\n\nKıyı Ege'de (İzmir, Aydın, Manisa, Muğla) sıcak ve kurak yazlar ile ılık ve yağışlı kışların yaşandığı tipik Akdeniz iklimi egemendir. Dağların kıyıya dik uzanması sayesinde Akdeniz ikliminin ılımanlaştırıcı etkisi ve zeytin tarımı Gediz ve Menderes grabenleri boyunca Afyon ve [Uşak](/turkiye/usak) sınırına kadar sokulur. Ancak yükseltinin 1.000 metreyi aştığı İç Batı Anadolu platosuna (Kütahya, Afyonkarahisar, Uşak) geçildiğinde deniz etkisi tamamen kesilir; yerini kışları karlı ve don olaylı, yazları kurak geçen sert karasal iklime bırakır.\n\nBitki örtüsü de bu coğrafi geçişi izler. Kıyı kuşağında kızılçam ormanlarının tahrip edildiği sahalarda zeytin, defne, mersin ve lavantadan oluşan maki ile kireçli arazilerde garig toplulukları yaygındır. Ege'de maki üst sınırı enlem etkisiyle 400-600 metre bandında kalır. Dik yamaçları denizden gelen nemli hava kütlelerini yakalayan Menteşe Dağları ise Türkiye'nin en bol yağış alan sahalarından biri olup gür kızılçam ve karaçam ormanlarıyla kaplıdır. İç kısımdaki yüksek platolarda ise otsu bozkırlar (step) geniş alan tutar.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'EGE',
    property: 'hydrographyTr',
    column: 'hydrography_tr',
    kind: 'scalar',
    before:
      "Bölgenin akarsu ağını, graben vadileri boyunca doğudan batıya akıp Ege Denizi'ne dökülen nehirler kurar. Bu nehirlerin en uzunu Afyonkarahisar'dan doğan Büyük Menderes (584 km), ikincisi ise Manisa ovalarını sulayan Gediz'dir (386 km). Küçük Menderes ve Bakırçay da aynı kırık vadilerini izler.\n\nVadi tabanlarında eğimin azalması nedeniyle bu nehirler geniş büklümler (menderesler) çizerek akar ve taşıdıkları bol alüvyonla deniz kıyısında geniş deltalar oluştururlar. Gediz'in oluşturduğu Menemen Deltası (İzmir Kuş Cenneti) ile Büyük Menderes Deltası Türkiye'nin en önemli sulak alanları arasındadır. Bu alüvyal yığılma tarihte o kadar hızlı gerçekleşmiştir ki; antik çağın en önemli liman kentleri olan Efes ve Milet, denizden kilometrelerce içeride kalarak liman işlevlerini kaybetmiştir.\n\nDoğal göller bakımından bölge zengin değildir ancak özgün oluşumlar barındırır. Aydın ve Muğla sınırındaki Bafa (Çamiçi) Gölü, Büyük Menderes'in taşıdığı alüvyonların eski bir deniz koyunun önünü kapatmasıyla oluşmuş bir alüvyal set gölüdür. Köyceğiz Gölü ise lagün kökenli olup dar bir kanalla Akdeniz'e bağlanan hassas bir ekosistemdir. İç kesimdeki Afyon Ovası ise dışa akışı olmayan kapalı bir çanak niteliğindedir; sularını Eber ve Akşehir göllerine boşaltır.",
    after:
      "Bölgenin akarsu ağını, graben vadileri boyunca doğudan batıya akıp Ege Denizi'ne dökülen nehirler kurar. Bu nehirlerin en uzunu Afyonkarahisar'dan doğan Büyük Menderes (584 km), ikincisi ise Manisa ovalarını sulayan Gediz'dir (386 km). Küçük Menderes ve Bakırçay da aynı kırık vadilerini izler.\n\nVadi tabanlarında eğimin azalması nedeniyle bu nehirler geniş büklümler (menderesler) çizerek akar ve taşıdıkları bol alüvyonla deniz kıyısında geniş deltalar oluştururlar. Gediz'in oluşturduğu Menemen Deltası (İzmir Kuş Cenneti) ile Büyük Menderes Deltası Türkiye'nin en önemli sulak alanları arasındadır. Bu alüvyon birikimi tarihte o kadar hızlı gerçekleşmiştir ki antik çağın en önemli liman kentleri olan Efes ve Milet, denizden kilometrelerce içeride kalarak liman işlevlerini kaybetmiştir.\n\nDoğal göller bakımından bölge zengin değildir ancak özgün oluşumlar barındırır. Aydın ve Muğla sınırındaki Bafa (Çamiçi) Gölü, Büyük Menderes'in taşıdığı alüvyonların eski bir deniz koyunun önünü kapatmasıyla oluşmuş bir alüvyal set gölüdür. Köyceğiz Gölü ise lagün kökenli olup dar bir kanalla Akdeniz'e bağlanan hassas bir ekosistemdir. İç kesimdeki Afyon Ovası ise dışa akışı olmayan kapalı bir çanak niteliğindedir; sularını Eber ve Akşehir göllerine boşaltır.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'EGE',
    property: 'economyTr',
    column: 'economy_tr',
    kind: 'scalar',
    before:
      "Ege Bölgesi, Türkiye gayrisafi yurt içi hasılasının yaklaşık %11,9'unu üreterek Marmara ve İç Anadolu'nun ardından üçüncü sırada yer alır. Ekonominin omurgasını tarıma dayalı sanayi, dış ticaret, turizm ve enerji üretimi oluşturur.\n\nGraben tabanlarındaki alüvyal topraklar ve ılıman iklim, bölgeyi Türkiye'nin en kaliteli tarımsal ihracat üssü yapmıştır. Çekirdeksiz kuru üzüm, incir, zeytin, tütün ve pamuk üretiminde Ege ilk sıradadır. İzmir Limanı ve Aliağa tesisleri, bu tarımsal ve sanayi üretimini dünya pazarlarına bağlar. Manisa beyaz eşya ve otomotiv yan sanayisiyle, Denizli ise dokuma ve tekstil ihracatıyla öne çıkar.\n\nYer şekilleri ve tektonik yapı bölgeye zengin enerji kaynakları sunar. Graben kenarlarındaki zengin linyit havzaları Soma ve Yatağan termik santrallerini beslerken; fay hatlarından çıkan jeotermal kaynaklar Denizli (Sarayköy) ve Aydın'da elektrik üretimi, konut ısıtması ve seracılıkta kullanılır. Girintili koyları, yat turizmine uygun doğal marinaları ve zengin antik kent mirası (Efes, Bergama, Pamukkale-Hierapolis) sayesinde kıyı şeridi (Bodrum, Marmaris, Çeşme, Kuşadası) Türkiye'nin önde gelen turizm merkezidir.",
    after:
      "Ege Bölgesi, Türkiye gayrisafi yurt içi hasılasının yaklaşık %11,9'unu üreterek Marmara ve İç Anadolu'nun ardından üçüncü sırada yer alır. Ekonominin omurgasını tarıma dayalı sanayi, dış ticaret, turizm ve enerji üretimi oluşturur.\n\nGraben tabanlarındaki alüvyal topraklar ve ılıman iklim, bölgeyi Türkiye'nin en kaliteli tarımsal ihracat üssü yapmıştır. Çekirdeksiz kuru üzüm, incir, zeytin ve tütün üretiminde Ege ilk sıradadır; pamukta da önemli bir üreticidir. İzmir Limanı ve Aliağa tesisleri, bu tarımsal ve sanayi üretimini dünya pazarlarına bağlar. Manisa beyaz eşya ve otomotiv yan sanayisiyle, Denizli ise dokuma ve tekstil ihracatıyla öne çıkar.\n\nYer şekilleri ve tektonik yapı bölgeye zengin enerji kaynakları sunar. Graben kenarlarındaki zengin linyit havzaları Soma ve Yatağan termik santrallerini beslerken; fay hatlarından çıkan jeotermal kaynaklar Denizli (Sarayköy) ve Aydın'da elektrik üretimi, konut ısıtması ve seracılıkta kullanılır. Girintili koyları, yat turizmine uygun doğal marinaları ve zengin antik kent mirası (Efes, Bergama, Pamukkale-Hierapolis) sayesinde kıyı şeridi (Bodrum, Marmaris, Çeşme, Kuşadası) Türkiye'nin önde gelen turizm merkezidir.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'EGE',
    property: 'comparisonTr',
    column: 'comparison_tr',
    kind: 'scalar',
    before:
      'Ege ile Akdeniz, yedi coğrafi bölge arasında mekânsal büyüklük ve demografik hacim bakımından birbirine en yakın ikilidir. İki bölgenin nüfusları arasında yalnızca yaklaşık 17 bin kişi, yüzölçümleri arasında ise sadece 177 kilometrekarelik bir fark bulunur; kilometrekareye düşen 123 kişilik aritmetik nüfus yoğunlukları birebir aynıdır.',
    after:
      'Ege ile Akdeniz, yedi coğrafi bölge arasında yüzölçümü ve nüfus bakımından birbirine en yakın ikilidir. İki bölgenin nüfusları arasında yalnızca yaklaşık 17 bin kişi, yüzölçümleri arasında ise sadece 177 kilometrekarelik bir fark bulunur; kilometrekareye düşen 123 kişilik aritmetik nüfus yoğunlukları birebir aynıdır.',
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'AKDENIZ',
    property: 'locationAndBordersTr',
    column: 'location_and_borders_tr',
    kind: 'scalar',
    before:
      "Akdeniz Bölgesi, Türkiye'nin güneyinde, Toros Dağları ile Akdeniz kıyısı arasında uzanan uzun ve yay biçimli bir coğrafi şerittir. Batıda Muğla sınırından başlayıp doğuda [Hatay](/v2/turkiye/hatay) üzerinden Suriye sınırına kadar kesintisiz uzanır; yalnızca [Mersin](/v2/turkiye/mersin) kıyıları 320 kilometreyi aşan uzunluğuyla bölgenin ana deniz cephelerinden biridir.\n\nBölgenin uluslararası tek kara sınırı güneydoğu ucunda yer alır: Hatay, Suriye ile komşudur ve Yayladağı ile Cilvegözü sınır kapıları üzerinden Orta Doğu ticaret ve ulaşım hatlarına bağlanır.\n\nİç sınırlarda bölge dört farklı coğrafi bölgeyle komşudur: Batıda [Antalya](/v2/turkiye/antalya), [Burdur](/v2/turkiye/burdur) ve [Isparta](/v2/turkiye/isparta) üzerinden Ege Bölgesi'yle; kuzeyde Toros Dağları boyunca uzanan sınırlarla İç Anadolu Bölgesi'yle; doğuda Hatay, [Osmaniye](/v2/turkiye/osmaniye) ve [Kahramanmaraş](/v2/turkiye/kahramanmaras) üzerinden Güneydoğu Anadolu Bölgesi'yle; Kahramanmaraş'ın kuzeydoğusunda ise Doğu Anadolu Bölgesi'yle sınırdaştır. Kıyıya paralel yükselen Toros Dağları iç kesimlerle bağlantıyı zorlaştırdığı için ulaşım; Çubuk, Gülek, Sertavul ve Belen gibi tarihsel dağ geçitleri üzerinden sağlanır.",
    after:
      "Akdeniz Bölgesi, Türkiye'nin güneyinde, Toros Dağları ile Akdeniz kıyısı arasında uzanan uzun ve yay biçimli bir coğrafi şerittir. Batıda Muğla sınırından başlayıp doğuda [Hatay](/turkiye/hatay) üzerinden Suriye sınırına kadar kesintisiz uzanır; yalnızca [Mersin](/turkiye/mersin) kıyıları 320 kilometreyi aşan uzunluğuyla bölgenin ana deniz cephelerinden biridir.\n\nBölgenin uluslararası tek kara sınırı güneydoğu ucunda yer alır: Hatay, Suriye ile komşudur ve Yayladağı ile Cilvegözü sınır kapıları üzerinden Orta Doğu ticaret ve ulaşım hatlarına bağlanır.\n\nİç sınırlarda bölge dört farklı coğrafi bölgeyle komşudur: Batıda [Antalya](/turkiye/antalya), [Burdur](/turkiye/burdur) ve [Isparta](/turkiye/isparta) üzerinden Ege Bölgesi'yle; kuzeyde Toros Dağları boyunca uzanan sınırlarla İç Anadolu Bölgesi'yle; doğuda Hatay, [Osmaniye](/turkiye/osmaniye) ve [Kahramanmaraş](/turkiye/kahramanmaras) üzerinden Güneydoğu Anadolu Bölgesi'yle; Kahramanmaraş'ın kuzeydoğusunda ise Doğu Anadolu Bölgesi'yle sınırdaştır. Kıyıya paralel yükselen Toros Dağları iç kesimlerle bağlantıyı zorlaştırdığı için ulaşım; Çubuk, Gülek, Sertavul ve Belen gibi tarihsel dağ geçitleri üzerinden sağlanır.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'AKDENIZ',
    property: 'landformsTr',
    column: 'landforms_tr',
    kind: 'scalar',
    before:
      "Akdeniz Bölgesi'nin morfolojisini Toros Dağları'nın kıyıya paralel uzanışı ve kireçtaşı (kalker) ana kayanın oluşturduğu karstik yer şekilleri belirler. Alp-Himalaya kıvrım kuşağının parçası olan Batı ve Orta Toroslar çoğu yerde denizden hemen sonra aniden yükselir; bu durum kıyı şeridinin dar kalmasına, dik falezlerin (yalıyar) gelişmesine ve boyuna kıyı tipinin ortaya çıkmasına yol açmıştır.\n\nKıyı düzlükleri yalnızca nehirlerin taşıdığı alüvyonlarla oluşmuş delta ovalarında genişler. Seyhan ve Ceyhan nehirlerinin binlerce yılda doldurduğu Çukurova, Türkiye'nin en geniş delta ovası olup [Adana](/v2/turkiye/adana)'nın tarımsal kalbidir. Göksu'nun denize ulaştığı Silifke Deltası, Antalya kıyı düzlüğü ve Amanos Dağları eteğindeki tektonik Amik Ovası bölgenin diğer ana tarım düzlükleridir.\n\nKalkerli arazinin yağmur ve yer altı sularıyla erimesi sonucu bölge, Türkiye'nin en zengin karst topoğrafyasına kavuşmuştur. Arazide lapya, dolin, uvala ve mağaralar (Damlataş, Karain, Cennet-Cehennem obrukları) yaygındır. Dağlık kesimde karstik erimeyle açılan geniş çanaklar (polyeler; Elmalı, Kestel, Korkuteli, Tefenni), kayalık ve sarp dağlar arasında yerleşme ve tarımın yapılabildiği vaha benzeri düzlükler oluşturur.\n\nBölgenin en yüksek noktası, Mersin sınırlarındaki Bolkar Dağları üzerinde yer alan 3.524 metrelik Medetsiz Tepesi'dir. Batı Toroslar'da Dedegöl (2.992 m) ve Bey Dağları (Kızlarsivrisi 3.086 m), Orta Toroslar'da Aladağlar ve doğuda Nur Dağları (Amanoslar) bölgenin heybetli dağ sıralarını meydana getirir.",
    after:
      "Akdeniz Bölgesi'nin yer şekillerini Toros Dağları'nın kıyıya paralel uzanışı ve kireçtaşı (kalker) ana kayanın oluşturduğu karstik yer şekilleri belirler. Alp-Himalaya kıvrım kuşağının parçası olan Batı ve Orta Toroslar çoğu yerde denizden hemen sonra aniden yükselir; bu durum kıyı şeridinin dar kalmasına, dik falezlerin (yalıyar) gelişmesine ve boyuna kıyı tipinin ortaya çıkmasına yol açmıştır.\n\nKıyı düzlükleri yalnızca nehirlerin taşıdığı alüvyonlarla oluşmuş delta ovalarında genişler. Seyhan ve Ceyhan nehirlerinin binlerce yılda doldurduğu Çukurova, Türkiye'nin en geniş delta ovası olup [Adana](/turkiye/adana)'nın tarımsal kalbidir. Göksu'nun denize ulaştığı Silifke Deltası, Antalya kıyı düzlüğü ve Amanos Dağları eteğindeki tektonik Amik Ovası bölgenin diğer ana tarım düzlükleridir.\n\nKalkerli arazinin yağmur ve yer altı sularıyla erimesi sonucu bölge, Türkiye'nin en zengin karst topoğrafyasına kavuşmuştur. Arazide lapya, dolin, uvala ve mağaralar (Damlataş, Karain, Cennet-Cehennem obrukları) yaygındır. Dağlık kesimde karstik erimeyle açılan geniş çanaklar (polyeler; Elmalı, Kestel, Korkuteli, Tefenni), kayalık ve sarp dağlar arasında yerleşme ve tarımın yapılabildiği vaha benzeri düzlükler oluşturur.\n\nBölgenin en yüksek noktası, Mersin sınırlarındaki Bolkar Dağları üzerinde yer alan 3.524 metrelik Medetsiz Tepesi'dir. Batı Toroslar'da Dedegöl (2.992 m) ve Bey Dağları (Kızlarsivrisi 3.086 m), Orta Toroslar'da Aladağlar ve doğuda Nur Dağları (Amanoslar) bölgenin heybetli dağ sıralarını meydana getirir.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'AKDENIZ',
    property: 'climateAndVegetationTr',
    column: 'climate_and_vegetation_tr',
    kind: 'scalar',
    before:
      "Akdeniz Bölgesi kıyılarında sıcak ve kurak yazlar ile ılık ve bol yağışlı kışların hüküm sürdüğü tipik Akdeniz iklimi görülür. Kış mevsiminin ılık geçmesi ve don olaylarının çok ender yaşanması, bölgede narenciye, muz ve örtü altı seracılığın gelişmesini sağlayan en belirleyici doğal faktördür.\n\nToros Dağları'nın güneye bakan dik yamaçları, Akdeniz'den gelen nemli hava kütlelerini zorunlu yükselmeye uğratarak Türkiye'nin en yüksek orografik (yamaç) yağışlarını alır; Antalya kıyılarında yıllık yağış 1.200 milimetreyi aşar. Buna karşılık Toroslar'ın arkasında kalan Göller Yöresi'nde (Isparta, Burdur) yükseltinin 950 metrenin üzerine çıkması ve deniz etkisinin dağlarca kesilmesi nedeniyle kışları soğuk ve kar yağışlı bir geçiş iklimi hüküm sürer.\n\nBitki örtüsü de yükselti basamaklarını izler. Kıyıdan 700-800 metre yüksekliğe kadar kızılçam ormanlarının tahrip edildiği alanlarda zeytin, defne, keçiboynuzu ve mersinden oluşan maki toplulukları yer alır; enlemin getirdiği sıcaklık avantajı nedeniyle Türkiye'de maki üst sınırının en yükseğe çıktığı bölge burasıdır. Daha yüksek yamaçlarda karaçam, Toros sediri ve köknar ormanları başlar; 2.000 metrenin üzerinde ise alpin çayırlar ve dağ bozkırları görülür.",
    after:
      "Akdeniz Bölgesi kıyılarında sıcak ve kurak yazlar ile ılık ve bol yağışlı kışların hüküm sürdüğü tipik Akdeniz iklimi görülür. Kış mevsiminin ılık geçmesi ve don olaylarının çok ender yaşanması, bölgede narenciye, muz ve örtü altı seracılığın gelişmesini sağlayan en belirleyici doğal faktördür.\n\nToros Dağları'nın güneye bakan dik yamaçları, Akdeniz'den gelen nemli hava kütlelerini zorunlu yükselmeye uğratarak bol orografik (yamaç) yağışı bıraktırır; Antalya'da yıllık yağış 1.000 milimetreyi aşar. Buna karşılık Toroslar'ın arkasında kalan Göller Yöresi'nde (Isparta, Burdur) yükseltinin 950 metrenin üzerine çıkması ve deniz etkisinin dağlarca kesilmesi nedeniyle kışları soğuk ve kar yağışlı bir geçiş iklimi hüküm sürer.\n\nBitki örtüsü de yükselti basamaklarını izler. Kıyıdan 700-800 metre yüksekliğe kadar kızılçam ormanlarının tahrip edildiği alanlarda zeytin, defne, keçiboynuzu ve mersinden oluşan maki toplulukları yer alır; enlemin getirdiği sıcaklık avantajı nedeniyle Türkiye'de maki üst sınırının en yükseğe çıktığı bölge burasıdır. Daha yüksek yamaçlarda karaçam, Toros sediri ve köknar ormanları başlar; 2.000 metrenin üzerinde ise alpin çayırlar ve dağ bozkırları görülür.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'AKDENIZ',
    property: 'hydrographyTr',
    column: 'hydrography_tr',
    kind: 'scalar',
    before:
      "Bölgenin hidrografik düzeni; doğuda deltalar kuran büyük nehirler ile batıda karstik kaynaklarla beslenen düzenli akarsulardan meydana gelir.\n\nDoğu kanadın ana su yolları Ceyhan (509 km) ve Seyhan nehirleridir. İç kısımlardaki dağlardan beslenip Çukurova'yı baştan başa sulayan bu iki nehir, tarımsal sulama ve taşkın kontrolü sağlayan Seyhan Barajı gibi tesislerle düzenlenmiştir. Lübnan ve Suriye'den geçerek Hatay'a giren Asi Nehri (556 km) ise Amik Ovası'nı suladıktan sonra Samandağ'da denize dökülür.\n\nBatı Akdeniz'de ise kireçtaşlı arazi suları yer altına çektiği için yüzey akışı kanyon vadilerle sınırlıdır. Manavgat ve Köprüçay gibi akarsular, yer altındaki zengin karstik voklüz kaynaklarından beslendikleri için yaz kuraklığında bile debisi düşmeyen, Türkiye'nin akış rejimi en düzenli nehirleridir. Mersin'de Göksu Nehri ise derin kanyonlardan geçerek Silifke Deltası'nı oluşturur.\n\nGöller Yöresi (Isparta, Burdur), tektonik-karstik çanaklarda oluşmuş zengin bir göl bölgesidir. Eğirdir Gölü (yaklaşık 480 km²), Türkiye'nin ikinci büyük tatlı su gölü olup içme ve sulama suyu sağlar. Dışa akışı olmayan Burdur Gölü ise aşırı yer altı suyu çekimi ve havza üzerindeki barajlar nedeniyle su seviyesi son elli yılda 20 metreden fazla gerilemiş ve tuzluluk oranı hızla artmış hassas bir kapalı havzadır. Geçmişte tarım arazisi kazanmak amacıyla kurutulan Amik Gölü ise bölgenin hidrolojik dengesinin bozulmasına ve taşkın riskinin artmasına yol açmıştır.",
    after:
      "Bölgenin akarsu düzeni, doğuda deltalar kuran büyük nehirler ile batıda karstik kaynaklarla beslenen düzenli akarsulardan meydana gelir.\n\nDoğu kanadın ana su yolları Seyhan (560 km) ve Ceyhan (509 km) nehirleridir. İç kısımlardaki dağlardan beslenip Çukurova'yı baştan başa sulayan bu iki nehir, tarımsal sulama ve taşkın kontrolü sağlayan Seyhan Barajı gibi tesislerle düzenlenmiştir. Lübnan ve Suriye'den geçerek Hatay'a giren Asi Nehri (556 km) ise Amik Ovası'nı suladıktan sonra Samandağ'da denize dökülür.\n\nBatı Akdeniz'de ise kireçtaşlı arazi suları yer altına çektiği için yüzey akışı kanyon vadilerle sınırlıdır. Manavgat ve Köprüçay gibi akarsular, yer altındaki zengin karst kaynaklarından (voklüz) beslendikleri için yaz kuraklığında bile debisi düşmeyen, Türkiye'nin akış rejimi en düzenli nehirleridir. Mersin'de Göksu Nehri ise derin kanyonlardan geçerek Silifke Deltası'nı oluşturur.\n\nGöller Yöresi (Isparta, Burdur), tektonik-karstik çanaklarda oluşmuş zengin bir göl bölgesidir. Eğirdir Gölü (yaklaşık 480 km²), Türkiye'nin ikinci büyük tatlı su gölü olup içme ve sulama suyu sağlar. Dışa akışı olmayan Burdur Gölü ise aşırı yer altı suyu çekimi ve havza üzerindeki barajlar nedeniyle su seviyesi son elli yılda 20 metreden fazla gerilemiş ve tuzluluk oranı hızla artmış hassas bir kapalı havzadır. Geçmişte tarım arazisi kazanmak amacıyla kurutulan Amik Gölü ise bölgenin su dengesinin bozulmasına ve taşkın riskinin artmasına yol açmıştır.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'AKDENIZ',
    property: 'faqs',
    column: 'faqs',
    kind: 'jsonb',
    before: [
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
    after: [
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
        answer: "560 kilometrelik Seyhan Nehri'dir; onu 509 kilometrelik Ceyhan izler.",
      },
    ],
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'IC_ANADOLU',
    property: 'locationAndBordersTr',
    column: 'location_and_borders_tr',
    kind: 'scalar',
    before:
      "İç Anadolu Bölgesi, Anadolu Yarımadası'nın merkezinde yer alır ve çevresini kuşatan yüksek dağ sıralarının ortasında geniş bir kapalı çanak oluşturur. Yedi coğrafi bölge içinde denize kıyısı olmayan iki bölgeden biridir ve hiçbir komşu ülkeyle kara sınırı bulunmaz.\n\nBuna karşılık Türkiye içinde coğrafi geçiş konumu en yüksek bölgedir: Güneydoğu Anadolu hariç, diğer beş bölgenin tamamıyla sınırdaştır. Kuzeyde Karadeniz, batıda Ege ve Marmara, güneyde Akdeniz, doğuda ise Doğu Anadolu bölgeleriyle çevrilidir. Bu merkezi konumu; doğu-batı ve kuzey-güney doğrultulu ana kara yolu, yüksek hızlı tren ve demir yolu akslarının bölgede kesişmesini sağlamış, [Ankara](/v2/turkiye/ankara)'yı ülkenin idari ve lojistik kalbi yapmıştır.",
    after:
      "İç Anadolu Bölgesi, Anadolu Yarımadası'nın merkezinde yer alır ve çevresini kuşatan yüksek dağ sıralarının ortasında geniş bir kapalı çanak oluşturur. Yedi coğrafi bölge içinde denize kıyısı olmayan üç bölgeden biridir ve hiçbir komşu ülkeyle kara sınırı bulunmaz.\n\nBuna karşılık Türkiye içinde coğrafi geçiş konumu en yüksek bölgedir: Güneydoğu Anadolu hariç, diğer beş bölgenin tamamıyla sınırdaştır. Kuzeyde Karadeniz, batıda Ege ve Marmara, güneyde Akdeniz, doğuda ise Doğu Anadolu bölgeleriyle çevrilidir. Bu merkezi konumu; doğu-batı ve kuzey-güney doğrultulu ana kara yolu, yüksek hızlı tren ve demir yolu akslarının bölgede kesişmesini sağlamış, [Ankara](/turkiye/ankara)'yı ülkenin idari ve lojistik kalbi yapmıştır.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'IC_ANADOLU',
    property: 'landformsTr',
    column: 'landforms_tr',
    kind: 'scalar',
    before:
      "İç Anadolu'nun arazisini yüksek dağ sıralarından ziyade ortalama 900 ile 1.300 metre arasında dalgalanan geniş platolar ve tektonik çöküntü ovaları belirler. Haymana, Cihanbeyli, Obruk ve Bozok platoları akarsularla yarılmış dalgalı düzlükler hâlinde uzanırken; tabanlarında [Konya](/v2/turkiye/konya) ve Ereğli ovaları ile Tuz Gölü çöküntüsü yer alır. Bu düz ve açık topoğrafya, Türkiye'de tarımda makineleşmenin en kolay uygulandığı sahayı yaratmıştır.\n\nBu geniş plato yüzeyinin üzerinde Neojen ve Kuvaterner dönemlerinde püskürmüş sönmüş volkanik koniler yükselir. [Kayseri](/v2/turkiye/kayseri)'nin simgesi olan 3.917 metrelik Erciyes Dağı, bölgenin en yüksek noktası ve ana stratovolkanıdır; doruğunda sirk buzulu kalıntıları taşır. [Aksaray](/v2/turkiye/aksaray) ve [Niğde](/v2/turkiye/nigde) sınırındaki Hasan Dağı (3.268 m), Melendiz, Karacadağ ve Karadağ platoya serpilmiş diğer volkanik kütlelerdir.\n\nKapadokya'nın dünyaca ünlü morfolojisi bu volkanik mirasın ürünüdür. Erciyes ve Hasan Dağı'ndan püsküren kalın tüf ve kül tabakaları, rüzgâr ve sel sularının aşındırmasıyla Göreme, Ürgüp ve Uçhisar çevresinde peribacalarına dönüşmüştür. Tüfün kolay oyulabilir fiziksel yapısı ise geçmişte Derinkuyu ve Kaymaklı gibi çok katlı yeraltı şehirlerinin ve kaya yerleşimlerinin inşa edilmesini sağlamıştır. Aksaray'daki Melendiz Çayı ise tüf tabakasını yararak 18 kilometrelik derin Ihlara Kanyonu'nu açmıştır.\n\nBölgenin sınırlarını kenarlarda yükselen dağlar çizer: Güneyde Toros Dağları'nın kuzey yamaçları (Bolkar ve Aladağlar), kuzeyde Ilgaz ve Köroğlu dağları, doğuda ise Tecer ve Akdağlar bölgeyi çevreler.",
    after:
      "İç Anadolu'nun arazisini yüksek dağ sıralarından ziyade ortalama 900 ile 1.300 metre arasında dalgalanan geniş platolar ve tektonik çöküntü ovaları belirler. Haymana, Cihanbeyli, Obruk ve Bozok platoları akarsularla yarılmış dalgalı düzlükler hâlinde uzanırken; tabanlarında [Konya](/turkiye/konya) ve Ereğli ovaları ile Tuz Gölü çöküntüsü yer alır. Bu düz ve açık topoğrafya, Türkiye'de tarımda makineleşmenin en kolay uygulandığı sahayı yaratmıştır.\n\nBu geniş plato yüzeyinin üzerinde Neojen ve Kuvaterner dönemlerinde püskürmüş volkanik koniler yükselir. [Kayseri](/turkiye/kayseri)'nin simgesi olan 3.917 metrelik Erciyes Dağı, bölgenin en yüksek noktası ve ana tabakalı volkanıdır (stratovolkan); doruğunda sirk buzulu kalıntıları taşır. [Aksaray](/turkiye/aksaray) ve [Niğde](/turkiye/nigde) sınırındaki Hasan Dağı (3.268 m), Melendiz, Karacadağ ve Karadağ platoya serpilmiş diğer volkanik kütlelerdir.\n\nKapadokya'nın dünyaca ünlü yer şekilleri bu volkanik mirasın ürünüdür. Erciyes ve Hasan Dağı'ndan püsküren kalın tüf ve kül tabakaları, rüzgâr ve sel sularının aşındırmasıyla Göreme, Ürgüp ve Uçhisar çevresinde peribacalarına dönüşmüştür. Tüfün kolay oyulabilmesi ise geçmişte Derinkuyu ve Kaymaklı gibi çok katlı yeraltı şehirlerinin ve kaya yerleşimlerinin inşa edilmesini sağlamıştır. Aksaray'daki Melendiz Çayı ise tüf tabakasını yararak 18 kilometrelik derin Ihlara Kanyonu'nu açmıştır.\n\nBölgenin sınırlarını kenarlarda yükselen dağlar çizer: Güneyde Toros Dağları'nın kuzey yamaçları (Bolkar ve Aladağlar), kuzeyde Ilgaz ve Köroğlu dağları, doğuda ise Tecer ve Akdağlar bölgeyi çevreler.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'IC_ANADOLU',
    property: 'climateAndVegetationTr',
    column: 'climate_and_vegetation_tr',
    kind: 'scalar',
    before:
      "İç Anadolu'nun iklimini belirleyen temel coğrafi faktör, deniz etkisine tamamen kapalı olmasıdır (karasallık). Kuzeydeki Kuzey Anadolu Dağları ile güneydeki Toroslar, deniz üzerinden gelen nemli hava kütlelerinin iç kesimlere sokulmasını engeller. Yağışını kıyı yamaçlarında bırakan hava kütleleri içeriye fön etkisiyle kuru olarak iner; bu durum İç Anadolu'yu Türkiye'nin en az yağış alan bölgesi hâline getirir.\n\nBölge genelinde yıllık yağış 330 ile 500 milimetre arasında kalır; Tuz Gölü çevresi (Aksaray, [Karaman](/v2/turkiye/karaman), Konya) Türkiye'nin kuraklık merkezidir. Kışlar soğuk, karlı ve don olaylı; yazlar sıcak ve kurak geçer; günlük ve mevsimlik sıcaklık farkları çok yüksektir. En çok yağış ilkbaharda yükselim (konveksiyonel - kırkikindi) yağışları şeklinde düşer.\n\nDoğal bitki örtüsü bu yarı kurak iklimin ürünü olan bozkırdır (step). İlkbahar yağışlarıyla yeşeren geven, yavşan otu ve gelincikler, yaz kuraklığıyla sararır ve kurur. İnsan faaliyetleriyle meşe ve karaçam ormanlarının tahrip edildiği sahalarda bozkırlar genişleyerek antropojen bozkıra dönüşmüştür; orman kalıntılarına ancak 1.200 metrenin üzerindeki yağış alan dağ yamaçlarında rastlanır.",
    after:
      "İç Anadolu'nun iklimini belirleyen temel coğrafi faktör, deniz etkisine tamamen kapalı olmasıdır (karasallık). Kuzeydeki Kuzey Anadolu Dağları ile güneydeki Toroslar, deniz üzerinden gelen nemli hava kütlelerinin iç kesimlere sokulmasını engeller. Yağışını kıyı yamaçlarında bırakan hava kütleleri içeriye fön etkisiyle kuru olarak iner; bu durum İç Anadolu'yu Türkiye'nin en az yağış alan bölgesi hâline getirir.\n\nBölge genelinde yıllık yağış 330 ile 500 milimetre arasında kalır; Tuz Gölü çevresi (Aksaray, [Karaman](/turkiye/karaman), Konya) Türkiye'nin kuraklık merkezidir. Kışlar soğuk, karlı ve don olaylı; yazlar sıcak ve kurak geçer; günlük ve mevsimlik sıcaklık farkları çok yüksektir. En çok yağış ilkbaharda yükselim (kırkikindi) yağışları şeklinde düşer.\n\nDoğal bitki örtüsü bu yarı kurak iklimin ürünü olan bozkırdır (step). İlkbahar yağışlarıyla yeşeren geven, yavşan otu ve gelincikler, yaz kuraklığıyla sararır ve kurur. İnsan faaliyetleriyle meşe ve karaçam ormanlarının yok edildiği sahalarda insan eliyle oluşmuş bozkırlar (antropojen bozkır) genişlemiştir; orman kalıntılarına ancak 1.200 metrenin üzerindeki yağış alan dağ yamaçlarında rastlanır.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'IC_ANADOLU',
    property: 'hydrographyTr',
    column: 'hydrography_tr',
    kind: 'scalar',
    before:
      "Bölgenin hidrografisi iki zıt sisteme ayrılır: Dışa akışı olan açık havzalar ile suların denize ulaşamadığı kapalı havzalar.\n\nAçık havzaların en büyüğü, Türkiye sınırları içinde doğup denize dökülen en uzun nehir olan Kızılırmak'tır (1.355 km). [Sivas](/v2/turkiye/sivas)'ın Kızıldağ eteklerinden doğan nehir; Kayseri, [Nevşehir](/v2/turkiye/nevsehir), [Kırşehir](/v2/turkiye/kirsehir), [Kırıkkale](/v2/turkiye/kirikkale), Ankara ve [Çankırı](/v2/turkiye/cankiri) topraklarından geçerek geniş bir kavis çizer ve Karadeniz'e yönelir. Nehir üzerindeki Hirfanlı ve Kesikköprü barajları bölgenin sulama ve enerji ihtiyacını karşılar. Batı kesimde ise Sakarya Nehri ve onun ana kolu olan Porsuk Çayı, [Eskişehir](/v2/turkiye/eskisehir) ve Ankara düzlüklerini sulayarak Marmara'ya akar.\n\nBuna karşılık güney ve orta kesimler dışa akışı olmayan kapalı havzalardan oluşur. Türkiye'nin en büyük kapalı havzası olan Konya-Tuz Gölü Havzası'nda sular denize ulaşamaz. Sığ bir tektonik çanakta toplanan Tuz Gölü (yaklaşık 1.300-1.500 km²), yaz aylarında şiddetli buharlaşmayla küçülür ve üzerinde kalın bir tuz tabakası bırakır; Türkiye'nin tuz ihtiyacının büyük bölümü buradan çıkarılır. Konya'nın batısındaki Beyşehir Gölü (651 km²) ise Türkiye'nin en büyük tatlı su gölü olup tarihi Çumra sulama kanalıyla Konya Ovası'nı sular. Kayseri'deki Sultansazlığı ile Kırşehir'deki Seyfe Gölü zengin kuş popülasyonuna ev sahipliği yapan uluslararası öneme sahip Ramsar sulak alanlarıdır.",
    after:
      "Bölgenin akarsu ve gölleri iki zıt sisteme ayrılır: Dışa akışı olan açık havzalar ile suların denize ulaşamadığı kapalı havzalar.\n\nAçık havzaların en büyüğü, Türkiye sınırları içinde doğup denize dökülen en uzun nehir olan Kızılırmak'tır (1.355 km). [Sivas](/turkiye/sivas)'ın Kızıldağ eteklerinden doğan nehir; Kayseri, [Nevşehir](/turkiye/nevsehir), [Kırşehir](/turkiye/kirsehir), [Kırıkkale](/turkiye/kirikkale), Ankara ve [Çankırı](/turkiye/cankiri) topraklarından geçerek geniş bir kavis çizer ve Karadeniz'e yönelir. Nehir üzerindeki Hirfanlı ve Kesikköprü barajları bölgenin sulama ve enerji ihtiyacını karşılar. Batı kesimde ise Sakarya Nehri ve onun ana kolu olan Porsuk Çayı, [Eskişehir](/turkiye/eskisehir) ve Ankara düzlüklerini sulayarak Marmara'ya akar.\n\nBuna karşılık güney ve orta kesimler dışa akışı olmayan kapalı havzalardan oluşur. Türkiye'nin en büyük kapalı havzası olan Konya-Tuz Gölü Havzası'nda sular denize ulaşamaz. Sığ bir tektonik çanakta toplanan Tuz Gölü (yaklaşık 1.300-1.500 km²), yaz aylarında şiddetli buharlaşmayla küçülür ve üzerinde kalın bir tuz tabakası bırakır; Türkiye'nin tuz ihtiyacının büyük bölümü buradan çıkarılır. Konya'nın batısındaki Beyşehir Gölü (651 km²) ise Türkiye'nin en büyük tatlı su gölü olup tarihi Çumra sulama kanalıyla Konya Ovası'nı sular. Kayseri'deki Sultansazlığı ile Kırşehir'deki Seyfe Gölü çok sayıda kuşa ev sahipliği yapan uluslararası öneme sahip Ramsar sulak alanlarıdır.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'IC_ANADOLU',
    property: 'settlementAndPopulationTr',
    column: 'settlement_and_population_tr',
    kind: 'scalar',
    before:
      "İç Anadolu, 13,8 milyonu aşan nüfusuyla Marmara'nın ardından Türkiye'nin en kalabalık ikinci bölgesidir. Ancak 187.227 kilometrekarelik devasa yüzölçümüyle Türkiye topraklarının neredeyse dörtte birini kapladığı için (%24), kilometrekareye düşen 74 kişilik nüfus yoğunluğu Türkiye ortalamasının (110 kişi/km²) belirgin biçimde altındadır.\n\nNüfus belirli sanayi, ulaşım ve ticaret merkezlerinde yoğunlaşmıştır. Türkiye'nin başkenti Ankara, 5,9 milyonu aşan nüfusuyla bölge toplamının yaklaşık %43'ünü barındırır. Konya (2,34 milyon), Kayseri (1,46 milyon) ve Eskişehir (yaklaşık 900 bin) diğer büyük metropollerdir. Su kaynaklarının kıt ve arazinin düz olması nedeniyle kırsal kesimde evlerin kuyu veya çeşme çevrelerinde toplandığı 'toplu yerleşme' dokusu egemendir.\n\nİç göç dinamiklerinde Ankara, Eskişehir ve Kayseri dışarıdan göç alıp büyürken; tarımsal olanakların daraldığı ve sanayileşmenin sınırlı kaldığı Çankırı, Sivas ve [Yozgat](/v2/turkiye/yozgat) gibi iller dışarıya sürekli net göç vermektedir.",
    after:
      "İç Anadolu, 13,8 milyonu aşan nüfusuyla Marmara'nın ardından Türkiye'nin en kalabalık ikinci bölgesidir. Ancak 187.227 kilometrekarelik devasa yüzölçümüyle Türkiye topraklarının neredeyse dörtte birini kapladığı için (%24), kilometrekareye düşen 74 kişilik nüfus yoğunluğu Türkiye ortalamasının (110 kişi/km²) belirgin biçimde altındadır.\n\nNüfus belirli sanayi, ulaşım ve ticaret merkezlerinde yoğunlaşmıştır. Türkiye'nin başkenti Ankara, 5,9 milyonu aşan nüfusuyla bölge toplamının yaklaşık %43'ünü barındırır. Konya (2,34 milyon), Kayseri (1,46 milyon) ve Eskişehir (yaklaşık 900 bin) diğer büyük metropollerdir. Su kaynaklarının kıt ve arazinin düz olması nedeniyle kırsal kesimde evlerin kuyu veya çeşme çevrelerinde toplandığı 'toplu yerleşme' dokusu egemendir.\n\nİç göç dinamiklerinde Ankara, Eskişehir ve Kayseri dışarıdan göç alıp büyürken; tarımsal olanakların daraldığı ve sanayileşmenin sınırlı kaldığı Çankırı, Sivas ve [Yozgat](/turkiye/yozgat) gibi iller dışarıya sürekli net göç vermektedir.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'IC_ANADOLU',
    property: 'faqs',
    column: 'faqs',
    kind: 'jsonb',
    before: [
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
    after: [
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
        answer:
          "Yoktur. Denize kıyısı olmayan üç coğrafi bölgeden biridir; diğer ikisi Doğu Anadolu ve Güneydoğu Anadolu'dur.",
      },
    ],
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'KARADENIZ',
    property: 'locationAndBordersTr',
    column: 'location_and_borders_tr',
    kind: 'scalar',
    before:
      "Karadeniz Bölgesi, Türkiye'nin kuzeyinde Karadeniz kıyı çizgisi boyunca Sakarya sınırından Gürcistan sınırına kadar kesintisiz uzanan yay biçimli dar bir kuşaktır. Anadolu'nun en kuzey noktası olan İnceburun ([Sinop](/v2/turkiye/sinop)) bu kıyı kuşağı üzerinde yer alır.\n\nBölgenin uluslararası tek kara sınırı doğu ucundadır: [Artvin](/v2/turkiye/artvin) üzerinden Gürcistan ile komşudur ve Sarp Sınır Kapısı, Türkiye'nin Kafkasya ve Orta Asya'ya açılan en işlek kara yolu transit kapılarından biridir.\n\nİç sınırlarda bölge üç komşuya açılır: Güneyde uzun bir hat boyunca İç Anadolu Bölgesi'yle; doğuda Artvin, [Rize](/v2/turkiye/rize), [Bayburt](/v2/turkiye/bayburt) ve [Gümüşhane](/v2/turkiye/gumushane) üzerinden Doğu Anadolu Bölgesi'yle; batıda ise [Düzce](/v2/turkiye/duzce) ve [Bolu](/v2/turkiye/bolu) üzerinden Marmara Bölgesi'yle sınırdaştır. Kuzey Anadolu Dağları'nın kıyıya paralel yüksek duvarı iç kesimlerle bağlantıyı zorlaştırdığı için ulaşım; Zigana, Kop, Ilgaz, Cankurtaran ve Bolu Dağı gibi kritik dağ geçitleri ve tüneller üzerinden sağlanır.",
    after:
      "Karadeniz Bölgesi, Türkiye'nin kuzeyinde Karadeniz kıyı çizgisi boyunca Sakarya sınırından Gürcistan sınırına kadar kesintisiz uzanan yay biçimli dar bir kuşaktır. Anadolu'nun en kuzey noktası olan İnceburun ([Sinop](/turkiye/sinop)) bu kıyı kuşağı üzerinde yer alır.\n\nBölgenin uluslararası tek kara sınırı doğu ucundadır: [Artvin](/turkiye/artvin) üzerinden Gürcistan ile komşudur ve Sarp Sınır Kapısı, Türkiye'nin Kafkasya ve Orta Asya'ya açılan en işlek kara yolu transit kapılarından biridir.\n\nİç sınırlarda bölge üç komşuya açılır: Güneyde uzun bir hat boyunca İç Anadolu Bölgesi'yle; doğuda Artvin, [Rize](/turkiye/rize), [Bayburt](/turkiye/bayburt) ve [Gümüşhane](/turkiye/gumushane) üzerinden Doğu Anadolu Bölgesi'yle; batıda ise [Düzce](/turkiye/duzce) ve [Bolu](/turkiye/bolu) üzerinden Marmara Bölgesi'yle sınırdaştır. Kuzey Anadolu Dağları'nın kıyıya paralel yüksek duvarı iç kesimlerle bağlantıyı zorlaştırdığı için ulaşım; Zigana, Kop, Ilgaz, Cankurtaran ve Bolu Dağı gibi kritik dağ geçitleri ve tüneller üzerinden sağlanır.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'KARADENIZ',
    property: 'landformsTr',
    column: 'landforms_tr',
    kind: 'scalar',
    before:
      "Karadeniz Bölgesi'nin morfolojik karakterini, Alp-Himalaya kıvrım kuşağının parçası olan ve kıyıya paralel birbirini izleyen sıralar hâlinde uzanan Kuzey Anadolu Dağları belirler. Dağların denize hemen paralel ve dik yükselmesi; kıyı şeridinin çok dar kalmasına, dik falezlerin (yalıyar) yaygınlaşmasına ve doğal limanların seyrekleşmesine yol açmıştır. Sinop doğal bir limana sahip olmasına karşın, ardındaki Küre Dağları'nın ulaşımı engellemesi (hinterland darlığı) nedeniyle gelişememiştir.\n\nBu dağlık duvarın en belirgin istisnası Orta Karadeniz'dedir. Burada Canik Dağları'nın yükseltisi 1.000-1.500 metreye kadar iner ve kıyıdan içeriye çekilir. Bu morfolojik açıklık sayesinde Kızılırmak ve Yeşilırmak nehirleri denize ulaştıkları yerde Türkiye'nin en büyük kıyı deltaları olan Bafra ve Çarşamba ovalarını oluşturmuş, aynı zamanda iç kesimlerle ulaşımı kolaylaştırmıştır.\n\nYükseltiler doğuya gidildikçe hızla artar: Rize ve Artvin sınırındaki Kaçkar Dağı (3.937 m) Karadeniz Dağları'nın en yüksek zirvesidir. Kaçkar ve [Giresun](/v2/turkiye/giresun) dağlarının yüksek zirvelerinde dördüncü zaman buzullaşmasının ürünü olan sirk gölleri, buzul vadileri ve zengin yaylalar sıralanır. Batı Karadeniz'de ise Ilgaz Dağı (2.587 m) ve Köroğlu Dağları (2.499 m) ile Küre kireçtaşı kanyonları engebeli plato ve dağ kuşağını meydana getirir.",
    after:
      "Karadeniz Bölgesi'nin yer şekillerini, Alp-Himalaya kıvrım kuşağının parçası olan ve kıyıya paralel birbirini izleyen sıralar hâlinde uzanan Kuzey Anadolu Dağları belirler. Dağların denize hemen paralel ve dik yükselmesi; kıyı şeridinin çok dar kalmasına, dik falezlerin (yalıyar) yaygınlaşmasına ve doğal limanların seyrekleşmesine yol açmıştır. Sinop doğal bir limana sahip olmasına karşın, ardındaki Küre Dağları iç kesimle ulaşımı engellediği, yani ard bölgesi dar kaldığı için gelişememiştir.\n\nBu dağlık duvarın en belirgin istisnası Orta Karadeniz'dedir. Burada Canik Dağları'nın yükseltisi 1.000-1.500 metreye kadar iner ve kıyıdan içeriye çekilir. Bu açıklık sayesinde Kızılırmak ve Yeşilırmak nehirleri denize ulaştıkları yerde Türkiye'nin en büyük kıyı deltaları olan Bafra ve Çarşamba ovalarını oluşturmuş, aynı zamanda iç kesimlerle ulaşımı kolaylaştırmıştır.\n\nYükseltiler doğuya gidildikçe hızla artar: Rize ve Artvin sınırındaki Kaçkar Dağı (3.937 m) Karadeniz Dağları'nın en yüksek zirvesidir. Kaçkar ve [Giresun](/turkiye/giresun) dağlarının yüksek zirvelerinde dördüncü zaman buzullaşmasının ürünü olan sirk gölleri, buzul vadileri ve zengin yaylalar sıralanır. Batı Karadeniz'de ise Ilgaz Dağı (2.587 m) ve Köroğlu Dağları (2.499 m) ile Küre kireçtaşı kanyonları engebeli plato ve dağ kuşağını meydana getirir.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'KARADENIZ',
    property: 'climateAndVegetationTr',
    column: 'climate_and_vegetation_tr',
    kind: 'scalar',
    before:
      "Karadeniz Bölgesi'nin iklimini belirleyen ana etken, denizden gelen nemli hava kütlelerinin kıyıya paralel uzanan dağ yamaçlarına çarparak yükselmesi (orografik / yamaç yağışı) mekanizmasıdır.\n\nKuzey yamaçlar her mevsim yağışlı, ılıman ve nemli Karadeniz iklimine sahiptir. Dağların en yüksek ve denize en yakın olduğu Doğu Karadeniz kıyıları Türkiye'nin en çok yağış alan sahasıdır; Rize yıllık 2.200 milimetreyi aşan yağışıyla başı çeker. Yıl boyunca kurak dönemin olmaması çay tarımını mümkün kılan temel doğal koşuldur. Buna karşılık dağ sıralarının arkasında kalan iç vadi ve çanaklarda (Gümüşhane, Bayburt, [Çorum](/v2/turkiye/corum)) deniz etkisi kesildiği için yıllık yağış 500-600 milimetreye düşer ve sert karasal iklim koşulları başlar.\n\nBitki örtüsü yükselti basamaklarına göre dikey kuşaklar oluşturur. Kıyı kuşağında geniş yapraklı nemli ormanlar (kayın, kestane, gürgen, meşe) ile nemcil çalı toplulukları (psödomaki) yer alır. Yükseldikçe karışık ormanlar, 1.200-1.500 metrenin üzerinde ise iğne yapraklı Doğu Karadeniz ladini ve köknar ormanları hâkim olur. 2.000 metrenin üzerindeki ağaç sınırında ise zengin alpin dağ çayırları ve yaylalar uzanır; Karadeniz Türkiye'nin orman varlığı en zengin bölgesidir.",
    after:
      "Karadeniz Bölgesi'nin iklimini belirleyen ana etken, denizden gelen nemli hava kütlelerinin kıyıya paralel uzanan dağ yamaçlarına çarparak yükselmesi ve yağış bırakmasıdır; buna orografik (yamaç) yağış denir.\n\nKuzey yamaçlar her mevsim yağışlı, ılıman ve nemli Karadeniz iklimine sahiptir. Dağların en yüksek ve denize en yakın olduğu Doğu Karadeniz kıyıları Türkiye'nin en çok yağış alan sahasıdır; Rize yıllık 2.200 milimetreyi aşan yağışıyla başı çeker. Yıl boyunca kurak dönemin olmaması çay tarımını mümkün kılan temel doğal koşuldur. Buna karşılık dağ sıralarının arkasında kalan iç vadi ve çanaklarda (Gümüşhane, Bayburt, [Çorum](/turkiye/corum)) deniz etkisi kesildiği için yıllık yağış 500-600 milimetreye düşer ve sert karasal iklim koşulları başlar.\n\nBitki örtüsü yükselti basamaklarına göre dikey kuşaklar oluşturur. Kıyı kuşağında geniş yapraklı nemli ormanlar (kayın, kestane, gürgen, meşe) ile nemcil çalı toplulukları (psödomaki) yer alır. Yükseldikçe karışık ormanlar, 1.200-1.500 metrenin üzerinde ise iğne yapraklı Doğu Karadeniz ladini ve köknar ormanları hâkim olur. 2.000 metrenin üzerindeki ağaç sınırında ise zengin alpin dağ çayırları ve yaylalar uzanır; Karadeniz Türkiye'nin orman varlığı en zengin bölgesidir.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'KARADENIZ',
    property: 'hydrographyTr',
    column: 'hydrography_tr',
    kind: 'scalar',
    before:
      "Bölgenin hidrografik yapısı iki ayrı ölçekte çalışır: İç bölgelerden doğup kıyıda delta açan büyük nehirler ile dağların denize bakan yamaçlarından hızla inen dik dereler.\n\nKızılırmak ve Yeşilırmak, iç bölgelerden taşıdıkları bol alüvyonla [Samsun](/v2/turkiye/samsun) kıyılarında Bafra ve Çarşamba deltalarını kurmuştur. Bafra Deltası, barındırdığı yüzlerce kuş türüyle uluslararası Ramsar koruma alanıdır. Doğuda Çoruh Nehri (376 km), Mescit Dağları'ndan doğup derin kanyonlar boyunca hızla akar; nehir üzerindeki Deriner ve Yusufeli barajları Türkiye'nin en yüksek kemer barajları olarak devasa hidroelektrik enerji üretir.\n\nKıyı dağlarından doğrudan denize inen Fırtına Deresi, İkizdere, Aksu, Melet ve Harşit çayları ise boyları kısa, akış hızları ve aşındırma güçleri çok yüksek akarsulardır. Bu dereler zengin su potansiyeline sahip olmakla birlikte, aşırı yağış dönemlerinde hızla kabararak ani sel ve taşkınlara yol açar. Batıda Filyos ve [Bartın](/v2/turkiye/bartin) çayları ormanlık platoları drene ederken; Bolu'daki Abant ve Yedigöller heyelan set gölleri bölgenin eşsiz doğal sulak alanlarıdır.",
    after:
      "Bölgenin akarsuları iki gruba ayrılır: İç bölgelerden doğup kıyıda delta açan büyük nehirler ile dağların denize bakan yamaçlarından hızla inen dik dereler.\n\nKızılırmak ve Yeşilırmak, iç bölgelerden taşıdıkları bol alüvyonla [Samsun](/turkiye/samsun) kıyılarında Bafra ve Çarşamba deltalarını kurmuştur. Bafra Deltası, barındırdığı yüzlerce kuş türüyle uluslararası Ramsar koruma alanıdır. Doğuda Çoruh Nehri (376 km), Mescit Dağları'ndan doğup derin kanyonlar boyunca hızla akar; nehir üzerindeki Deriner ve Yusufeli barajları Türkiye'nin en yüksek kemer barajları olarak devasa hidroelektrik enerji üretir.\n\nKıyı dağlarından doğrudan denize inen Fırtına Deresi, İkizdere, Aksu, Melet ve Harşit çayları ise boyları kısa, akış hızları ve aşındırma güçleri çok yüksek akarsulardır. Bu dereler zengin su potansiyeline sahip olmakla birlikte, aşırı yağış dönemlerinde hızla kabararak ani sel ve taşkınlara yol açar. Batıda Filyos ve [Bartın](/turkiye/bartin) çayları ormanlık platoların sularını toplar; Bolu'daki Abant ve Yedigöller heyelan set gölleri bölgenin eşsiz doğal sulak alanlarıdır.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'KARADENIZ',
    property: 'settlementAndPopulationTr',
    column: 'settlement_and_population_tr',
    kind: 'scalar',
    before:
      "Karadeniz Bölgesi, 8 milyonu aşan nüfusuyla ülke nüfusunun %9,34'ünü barındırır. Kilometrekareye düşen 69 kişilik nüfus yoğunluğu Türkiye ortalamasının (110 kişi/km²) oldukça altındadır.\n\nYerleşme dokusu bölgenin engebeli coğrafyasının doğrudan sonucudur. 18 il ve 197 ilçe ile Türkiye'nin en çok mülki birimine sahip bölgesi olmasına karşın, ilçe başına düşen ortalama 41 binlik nüfus Türkiye'nin en düşük değeridir. Dik yamaçlar, arazinin aşırı parçalı olması ve su kaynaklarının bolluğu, kırsal kesimde evlerin yamaçlara serpiştirildiği 'dağınık yerleşme' tipini zorunlu kılmıştır.\n\nNüfus, tarıma ve ulaşıma elverişli dar kıyı şeridinde ve delta ovalarında toplanmıştır (Samsun 1,39 milyon, [Trabzon](/v2/turkiye/trabzon) 823 bin, [Ordu](/v2/turkiye/ordu) 770 bin). Buna karşılık tarım alanlarının kısıtlı, sanayinin yetersiz olduğu iç vadi ve dağlık kesimler (Gümüşhane, Bayburt, Artvin) dışarıya sürekli yoğun göç vermektedir; nitekim Gümüşhane ve Bayburt Türkiye'nin net göç verme hızında ilk sıralarda yer alır.",
    after:
      "Karadeniz Bölgesi, 8 milyonu aşan nüfusuyla ülke nüfusunun %9,34'ünü barındırır. Kilometrekareye düşen 69 kişilik nüfus yoğunluğu Türkiye ortalamasının (110 kişi/km²) oldukça altındadır.\n\nYerleşme dokusu bölgenin engebeli coğrafyasının doğrudan sonucudur. 18 il ve 197 ilçe ile Türkiye'nin en çok mülki birimine sahip bölgesi olmasına karşın, ilçe başına düşen ortalama 41 binlik nüfus Türkiye'nin en düşük değeridir. Dik yamaçlar, arazinin aşırı parçalı olması ve su kaynaklarının bolluğu, kırsal kesimde evlerin yamaçlara serpiştirildiği 'dağınık yerleşme' tipini zorunlu kılmıştır.\n\nNüfus, tarıma ve ulaşıma elverişli dar kıyı şeridinde ve delta ovalarında toplanmıştır (Samsun 1,39 milyon, [Trabzon](/turkiye/trabzon) 823 bin, [Ordu](/turkiye/ordu) 770 bin). Buna karşılık tarım alanlarının kısıtlı, sanayinin yetersiz olduğu iç vadi ve dağlık kesimler (Gümüşhane, Bayburt, Artvin) dışarıya sürekli yoğun göç vermektedir; nitekim Gümüşhane ve Bayburt Türkiye'nin net göç verme hızında ilk sıralarda yer alır.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'KARADENIZ',
    property: 'economyTr',
    column: 'economy_tr',
    kind: 'scalar',
    before:
      "Karadeniz Bölgesi, Türkiye gayrisafi yurt içi hasılasının yaklaşık %6,4'ünü üretir. Bölge ekonomisi fındık ve çay başta olmak üzere uzmanlaşmış tarıma, taşkömürüne dayalı ağır sanayiye, ormancılığa ve deniz balıkçılığına dayanır.\n\nNemli iklim ve dik yamaç topoğrafyası dünya çapında iki tekel ürün doğurmuştur: Ordu, Giresun ve Trabzon'un eğimli yamaçlarında Türkiye üretiminin ve dünya ihracatının büyük kısmını karşılayan fındık yetiştirilir. Rize ve Artvin kıyılarında ise bol yağış sayesinde Türkiye'nin tüm çay üretimi gerçekleştirilir. Samsun'un Bafra ve Çarşamba deltalarında ise mısır, çeltik, sebze ve meyve tarımı yoğunlaşmıştır.\n\nSanayi ve madencilik Batı Karadeniz'de köklü bir geçmişe sahiptir. Türkiye'nin tek taşkömürü havzası olan [Zonguldak](/v2/turkiye/zonguldak); Ereğli ve [Karabük](/v2/turkiye/karabuk) Demir Çelik Fabrikaları'nın kuruluşuyla Türkiye'nin ağır sanayi temellerinin atıldığı merkez olmuştur. Geniş orman örtüsü ahşap, kâğıt ve kereste sanayisini beslerken; uzun kıyı şeridi Türkiye deniz balıkçılığı avcılığının yarısından fazlasını karşılar. Doğu Karadeniz yaylaları ise (Ayder, Uzungöl) son yıllarda doğa ve yayla turizminin çekim merkezi hâline gelmiştir.",
    after:
      "Karadeniz Bölgesi, Türkiye gayrisafi yurt içi hasılasının yaklaşık %6,4'ünü üretir. Bölge ekonomisi fındık ve çay başta olmak üzere uzmanlaşmış tarıma, taşkömürüne dayalı ağır sanayiye, ormancılığa ve deniz balıkçılığına dayanır.\n\nNemli iklim ve dik yamaç topoğrafyası dünya çapında iki tekel ürün doğurmuştur: Ordu, Giresun ve Trabzon'un eğimli yamaçlarında Türkiye üretiminin ve dünya ihracatının büyük kısmını karşılayan fındık yetiştirilir. Rize başta olmak üzere Trabzon, Artvin ve Giresun kıyılarında ise bol yağış sayesinde Türkiye'nin tüm çay üretimi gerçekleştirilir. Samsun'un Bafra ve Çarşamba deltalarında ise mısır, çeltik, sebze ve meyve tarımı yoğunlaşmıştır.\n\nSanayi ve madencilik Batı Karadeniz'de köklü bir geçmişe sahiptir. Türkiye'nin tek taşkömürü havzası olan [Zonguldak](/turkiye/zonguldak); Ereğli ve [Karabük](/turkiye/karabuk) Demir Çelik Fabrikaları'nın kuruluşuyla Türkiye'nin ağır sanayi temellerinin atıldığı merkez olmuştur. Geniş orman örtüsü ahşap, kâğıt ve kereste sanayisini beslerken; uzun kıyı şeridi Türkiye deniz balıkçılığı avcılığının yarısından fazlasını karşılar. Doğu Karadeniz yaylaları ise (Ayder, Uzungöl) son yıllarda doğa ve yayla turizminin çekim merkezi hâline gelmiştir.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'KARADENIZ',
    property: 'subregionsTr',
    column: 'subregions_tr',
    kind: 'scalar',
    before:
      "1941 Coğrafya Kongresi kararlarına göre Karadeniz Bölgesi üç ana coğrafi bölüme ayrılır:\n\n1. **Batı Karadeniz Bölümü:** Sakarya sınırından Sinop'a kadar uzanan ormanlık dağlar (Küre, Ilgaz, Bolu), taşkömürü havzası (Zonguldak, Karabük) ve dalgalı platoları kapsar. Sanayi ve ormancılık ön plandadır.\n2. **Orta Karadeniz Bölümü:** Canik Dağları'nın alçaldığı, Kızılırmak ve Yeşilırmak deltalarının yer aldığı geniş tarım sahasıdır (Samsun, [Tokat](/v2/turkiye/tokat), Çorum, [Amasya](/v2/turkiye/amasya)). Ulaşım iç kesimlere kolayca bağlanır; tarım ve gıda sanayisi ağırlıklıdır.\n3. **Doğu Karadeniz Bölümü:** Ordu'dan Gürcistan sınırına kadar uzanan en dik, en yüksek ve en bol yağış alan kesimdir. Çay, fındık, balıkçılık, yaylacılık ve dağınık kırsal yerleşme bu bölümün ayırt edici niteliğidir.",
    after:
      "1941 Coğrafya Kongresi kararlarına göre Karadeniz Bölgesi üç ana coğrafi bölüme ayrılır:\n\n1. **Batı Karadeniz Bölümü:** Sakarya sınırından Sinop'a kadar uzanan ormanlık dağlar (Küre, Ilgaz, Bolu), taşkömürü havzası (Zonguldak, Karabük) ve dalgalı platoları kapsar. Sanayi ve ormancılık ön plandadır.\n2. **Orta Karadeniz Bölümü:** Canik Dağları'nın alçaldığı, Kızılırmak ve Yeşilırmak deltalarının yer aldığı geniş tarım sahasıdır (Samsun, [Tokat](/turkiye/tokat), Çorum, [Amasya](/turkiye/amasya)). Ulaşım iç kesimlere kolayca bağlanır; tarım ve gıda sanayisi ağırlıklıdır.\n3. **Doğu Karadeniz Bölümü:** Ordu'dan Gürcistan sınırına kadar uzanan en dik, en yüksek ve en bol yağış alan kesimdir. Çay, fındık, balıkçılık, yaylacılık ve dağınık kırsal yerleşme bu bölümün ayırt edici niteliğidir.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'KARADENIZ',
    property: 'disasterAndEarthquakeTr',
    column: 'disaster_and_earthquake_tr',
    kind: 'scalar',
    before:
      "Karadeniz Bölgesi'nin en yaygın ve yıkıcı doğal afeti kütle hareketleridir (heyelan). Dik yamaç eğimi, yüksek yıllık yağış miktarı, geçirimsiz killi tabakalar ve orman örtüsünün yol/yerleşim gerekçesiyle tahrip edilmesi, özellikle Doğu Karadeniz'de heyelanları sürekli bir tehdit yapar; Türkiye'de en çok heyelan bu bölgede meydana gelir.\n\nİkinci büyük risk, dik eğimli ve kısa havzalı derelerin aşırı sağanaklarda hızla taşmasıyla oluşan ani sel, taşkın ve moloz akmalarıdır ([Kastamonu](/v2/turkiye/kastamonu) Bozkurt, Rize, Giresun taşkınları). Dar vadi tabanlarına yapılan kontrolsüz yerleşimler bu riski afete dönüştürmektedir.\n\nSismik açıdan ise Batı Karadeniz'in güneyi Kuzey Anadolu Fay Zonu üzerindedir; 12 Kasım 1999 Mw 7,2 Düzce depremi bu fayın bölgedeki yıkıcı kırılmalarının en somut örneğidir.",
    after:
      "Karadeniz Bölgesi'nin en yaygın ve yıkıcı doğal afeti kütle hareketleridir (heyelan). Dik yamaç eğimi, yüksek yıllık yağış miktarı, geçirimsiz killi tabakalar ve orman örtüsünün yol/yerleşim gerekçesiyle tahrip edilmesi, özellikle Doğu Karadeniz'de heyelanları sürekli bir tehdit yapar; Türkiye'de en çok heyelan bu bölgede meydana gelir.\n\nİkinci büyük risk, dik eğimli ve kısa havzalı derelerin aşırı sağanaklarda hızla taşmasıyla oluşan ani sel, taşkın ve moloz akmalarıdır ([Kastamonu](/turkiye/kastamonu) Bozkurt, Rize, Giresun taşkınları). Dar vadi tabanlarına yapılan kontrolsüz yerleşimler bu riski afete dönüştürmektedir.\n\nSismik açıdan ise Batı Karadeniz'in güneyi Kuzey Anadolu Fay Zonu üzerindedir; 12 Kasım 1999 Mw 7,2 Düzce depremi bu fayın bölgedeki yıkıcı kırılmalarının en somut örneğidir.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'DOGU_ANADOLU',
    property: 'neighborCountries',
    column: 'neighbor_countries',
    kind: 'textarray',
    before: [],
    after: ['Gürcistan', 'Ermenistan', 'Azerbaycan', 'İran', 'Irak'],
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'DOGU_ANADOLU',
    property: 'locationAndBordersTr',
    column: 'location_and_borders_tr',
    kind: 'scalar',
    before:
      "Doğu Anadolu Bölgesi, Anadolu Yarımadası'nın doğusunda yer alır ve yedi bölge içinde ortalama yükseltisi en fazla olan, en geniş ikinci coğrafi sahadır. Denize kıyısı bulunmayan bölge, Türkiye'nin Kafkasya ve Orta Doğu'ya uzanan en uzun uluslararası kara sınırlarını bünyesinde toplar.\n\nBölge; kuzeydoğuda [Ardahan](/v2/turkiye/ardahan) ve [Kars](/v2/turkiye/kars) üzerinden Gürcistan ve Ermenistan'la, [Iğdır](/v2/turkiye/igdir) üzerinden Azerbaycan (Nahçıvan) ve Ermenistan'la, doğuda [Ağrı](/v2/turkiye/agri), [Van](/v2/turkiye/van) ve [Hakkari](/v2/turkiye/hakkari) boyunca İran'la, güneyde ise Hakkari üzerinden Irak'la sınırdaştır. Gürbulak, Kapıköy, Esendere ve Dilucu gibi sınır kapıları, Türkiye'nin doğu komşularıyla ticaret koridorlarını oluşturur.\n\nİç sınırlarda bölge dört komşu bölgeyle çevrilidir: Kuzeyde Karadeniz Bölgesi'yle; batıda İç Anadolu ve Akdeniz bölgeleriyle; güneyde ise Toroslar'ın güney etekleri boyunca Güneydoğu Anadolu Bölgesi'yle sınırdaştır. [Erzurum](/v2/turkiye/erzurum), dokuz ayrı ille komşu olarak Türkiye'nin en çok il sınırına sahip kavşak kentidir.",
    after:
      "Doğu Anadolu Bölgesi, Anadolu Yarımadası'nın doğusunda yer alır ve yedi bölge içinde ortalama yükseltisi en fazla olan, en geniş ikinci coğrafi sahadır. Denize kıyısı bulunmayan bölge, Türkiye'nin Kafkasya ve Orta Doğu'ya uzanan en uzun uluslararası kara sınırlarını bünyesinde toplar.\n\nBölge; kuzeydoğuda [Ardahan](/turkiye/ardahan) ve [Kars](/turkiye/kars) üzerinden Gürcistan ve Ermenistan'la, [Iğdır](/turkiye/igdir) üzerinden Azerbaycan (Nahçıvan) ve Ermenistan'la, doğuda [Ağrı](/turkiye/agri), [Van](/turkiye/van) ve [Hakkari](/turkiye/hakkari) boyunca İran'la, güneyde ise Hakkari üzerinden Irak'la sınırdaştır. Gürbulak, Kapıköy, Esendere ve Dilucu gibi sınır kapıları, Türkiye'nin doğu komşularıyla ticaret koridorlarını oluşturur.\n\nİç sınırlarda bölge dört komşu bölgeyle çevrilidir: Kuzeyde Karadeniz Bölgesi'yle; batıda İç Anadolu ve Akdeniz bölgeleriyle; güneyde ise Toroslar'ın güney etekleri boyunca Güneydoğu Anadolu Bölgesi'yle sınırdaştır. [Erzurum](/turkiye/erzurum), dokuz ayrı ille komşu olarak Konya ve Erzincan'la birlikte Türkiye'nin en çok il sınırına sahip illerindendir.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'DOGU_ANADOLU',
    property: 'landformsTr',
    column: 'landforms_tr',
    kind: 'scalar',
    before:
      "Doğu Anadolu'nun topoğrafyasını Avrasya ve Arap levhalarının sıkıştırmasıyla gerçekleşen tektonik yükselme ve yoğun volkanik faaliyetler şekillendirmiştir. Bölgenin ortalama yükseltisi 2.000 metreyi aşar ve bu yükseklik batıdan doğuya basamaklar hâlinde artarak Türkiye'nin çatısını oluşturur.\n\nBölgenin morfolojik omurgasını lav platoları ve bunların üzerinde yükselen dev stratovolkanlar kurar. Ağrı'nın kuzeydoğusundaki Ağrı Dağı (5.137 m), doruğundaki takke buzuluyla Türkiye'nin en yüksek zirvesidir. Güneydoğudaki Cilo-Sat Dağları (Uludoruk 4.168 m), Van Gölü'nün kuzeyindeki Süphan Dağı (4.058 m), Tendürek Dağı ve tepesinde 6 kilometre çapında dev kalderası bulunan uyuyan volkan Nemrut Dağı (2.935 m) bu görkemli dağ kuşağını tamamlar. Erzurum-Kars Platosu ise binlerce kilometrekarelik bazalt ve andezit lav tabakasıyla kaplı yüksek bir aşınım düzlüğüdür.\n\nBu dağlık ve engebeli çatının arasına fay hatları boyunca sıralanmış çöküntü ovaları serpilir: [Erzincan](/v2/turkiye/erzincan), Erzurum, Pasinler, [Muş](/v2/turkiye/mus) ve [Elazığ](/v2/turkiye/elazig) ovaları yerleşmenin ve tarımın toplandığı tektonik düzlüklerdir. Bu düzlüklerin en çarpıcı morfolojik istisnası Iğdır Ovası'dır: Çevresini saran 3.000-5.000 metrelik dağların ortasında 850 metre rakıma kadar inen bu korunaklı çanak, rüzgârlara kapalı derin bir mikroklima sahası oluşturmuştur.\n\nBölgenin batısında [Bingöl](/v2/turkiye/bingol)'ün Karlıova ilçesi, Kuzey Anadolu Fayı ile Doğu Anadolu Fayı'nın kesiştiği dünyadaki ender tektonik kavşak noktalarından biridir.",
    after:
      "Doğu Anadolu'nun topoğrafyasını Avrasya ve Arap levhalarının sıkıştırmasıyla gerçekleşen tektonik yükselme ve yoğun volkanik faaliyetler şekillendirmiştir. Bölgenin ortalama yükseltisi 2.000 metreyi aşar ve bu yükseklik batıdan doğuya basamaklar hâlinde artarak Türkiye'nin çatısını oluşturur.\n\nBölgenin yer şekillerinin omurgasını lav platoları ve bunların üzerinde yükselen dev tabakalı volkanlar (stratovolkan) kurar. Ağrı'nın kuzeydoğusundaki Ağrı Dağı (5.137 m), doruğundaki takke buzuluyla Türkiye'nin en yüksek zirvesidir. Güneydoğudaki Cilo-Sat Dağları (Uludoruk 4.168 m), Van Gölü'nün kuzeyindeki Süphan Dağı (4.058 m), Tendürek Dağı ve tepesinde 6 kilometre çapında dev kalderası bulunan uyuyan volkan Nemrut Dağı (2.935 m) bu görkemli dağ kuşağını tamamlar. Erzurum-Kars Platosu ise binlerce kilometrekarelik bazalt ve andezit lav tabakasıyla kaplı yüksek bir aşınım düzlüğüdür.\n\nBu dağlık ve engebeli çatının arasına fay hatları boyunca sıralanmış çöküntü ovaları serpilir: [Erzincan](/turkiye/erzincan), Erzurum, Pasinler, [Muş](/turkiye/mus) ve [Elazığ](/turkiye/elazig) ovaları yerleşmenin ve tarımın toplandığı tektonik düzlüklerdir. Bu düzlüklerin en çarpıcı istisnası Iğdır Ovası'dır: Çevresini saran 3.000-5.000 metrelik dağların ortasında 850 metre rakıma kadar inen bu korunaklı çanak, rüzgârlara kapalı, kendine özgü yerel iklimi (mikroklima) olan derin bir saha oluşturmuştur.\n\nBölgenin batısında [Bingöl](/turkiye/bingol)'ün Karlıova ilçesi, Kuzey Anadolu Fayı ile Doğu Anadolu Fayı'nın kesiştiği dünyadaki ender tektonik kavşak noktalarından biridir.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'DOGU_ANADOLU',
    property: 'climateAndVegetationTr',
    column: 'climate_and_vegetation_tr',
    kind: 'scalar',
    before:
      "Doğu Anadolu'nun iklimini belirleyen temel değişken aşırı yükselti ve deniz etkisinden bütünüyle yalıtılmış olmasıdır. Bölgede Türkiye'nin en sert ve en uzun kışlarının yaşandığı şiddetli karasal iklim egemendir.\n\nKış mevsimi 5 ile 6 ay sürer; kar örtüsü yerde 120-150 gün boyunca kalır ve dondurucu don olayları günlük yaşamı belirler. Nitekim Türkiye'nin yıllık ortalama sıcaklığı en düşük illeri Ardahan (4,2°C) ve Erzurum'dur (4,8°C). Yükseltinin azaldığı ve derin vadi çanaklarında yer alan [Malatya](/v2/turkiye/malatya), Elazığ ve özellikle Iğdır ovaları ise daha ılıman mikroklima özellikleri gösterir; Iğdır'da pamuk, şeftali ve kayısı gibi sıcaklık isteyen ürünlerin yetişmesi bu yerel çukurlaşmanın doğrudan sonucudur.\n\nBitki örtüsü yükselti ve yağış rejimine göre şekillenir. Erzurum-Kars platosu en çok yağışını ilkbahar sonu ve yaz aylarında konveksiyonel olarak alır. Bu yaz yağışları otların kurumasını engelleyerek zengin dağ çayırlarının (alpin çayırlar) ve altında dünyanın en verimli organik toprakları olan çernezyomların (kara toprak) gelişmesini sağlamıştır. Çöküntü havzalarında kurakçıl bozkırlar egemenken, Kars Sarıkamış çevresinde yüksek soğuğa uyum sağlamış sarıçam ormanları, korunaklı vadilerde ise meşe kalıntıları yer alır.",
    after:
      "Doğu Anadolu'nun iklimini belirleyen temel değişken aşırı yükselti ve deniz etkisinden bütünüyle yalıtılmış olmasıdır. Bölgede Türkiye'nin en sert ve en uzun kışlarının yaşandığı şiddetli karasal iklim egemendir.\n\nKış mevsimi 5 ile 6 ay sürer; kar örtüsü yerde 120-150 gün boyunca kalır ve dondurucu don olayları günlük yaşamı belirler. Nitekim Türkiye'nin yıllık ortalama sıcaklığı en düşük illeri Ardahan (4,2°C) ve Erzurum'dur (4,8°C). Yükseltinin azaldığı ve derin vadi çanaklarında yer alan [Malatya](/turkiye/malatya), Elazığ ve özellikle Iğdır ovaları ise daha ılıman bir yerel iklim gösterir; Iğdır'da pamuk, şeftali ve kayısı gibi sıcaklık isteyen ürünlerin yetişmesi bu yerel çukurlaşmanın doğrudan sonucudur.\n\nBitki örtüsü yükselti ve yağış rejimine göre şekillenir. Erzurum-Kars platosu en çok yağışını ilkbahar sonu ve yaz aylarında yükselim (kırkikindi) yağışı olarak alır. Bu yaz yağışları otların kurumasını engelleyerek zengin dağ çayırlarının (alpin çayırlar) ve altında dünyanın en verimli organik toprakları olan çernezyomların (kara toprak) gelişmesini sağlamıştır. Çöküntü havzalarında kurakçıl bozkırlar egemenken, Kars Sarıkamış çevresinde yüksek soğuğa uyum sağlamış sarıçam ormanları, korunaklı vadilerde ise meşe kalıntıları yer alır.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'DOGU_ANADOLU',
    property: 'hydrographyTr',
    column: 'hydrography_tr',
    kind: 'scalar',
    before:
      "Doğu Anadolu, yüksek topoğrafyası ve kalın kar birikimi sayesinde Türkiye'nin ana 'su kulesi' ve hidroelektrik enerji deposudur. Kar ve buzul erimeleriyle beslenen akarsuların akış hızları, debileri ve hidroelektrik potansiyelleri son derece yüksektir.\n\nBasra Körfezi'ne dökülen Fırat ve Dicle nehirleri bu topraklardan doğar. Fırat'ın ana kolları olan Karasu (Erzincan Ovası'ndan geçer) ve Murat Nehri (Ağrı ve Muş ovalarını kat eder), Elazığ'da birleşerek Keban Baraj Gölü'nü doldurur; Keban Türkiye'nin en büyük yapay gölüdür. Dicle'nin yukarı kolları ile Hakkari'deki Büyük Zap Çayı da aynı dağlık havzayı drene eder. Kuzeydoğuda ise Aras ve Kura nehirleri Ermenistan ve Azerbaycan sınırlarını çizerek Hazar Denizi kapalı havzasına dökülür.\n\nBölgenin gölleri volkanik setleşmelerin ürünüdür. Van Gölü (3.713 km²), yaklaşık 200 bin yıl önce Nemrut Dağı'ndan çıkan lavların Muş havzasına giden su yolunu tıkamasıyla oluşmuş dünyanın en büyük sodalı gölü ve Türkiye'nin en büyük doğal su kütlesidir. Yüksek sodalı yapısı kış aylarında donmasını engeller ve endemik inci kefaline ev sahipliği yapar. Ardahan'daki Çıldır Gölü (123 km²) ise lav seti kökenli tatlı su gölü olup kış aylarında tamamen buz tutmasıyla bilinir. Nemrut kalderasındaki krater gölleri, Nazik ve Erçek gölleri de aynı volkanik kökene sahiptir.",
    after:
      "Doğu Anadolu, yüksek topoğrafyası ve kalın kar birikimi sayesinde Türkiye'nin ana 'su kulesi' ve hidroelektrik enerji deposudur. Kar ve buzul erimeleriyle beslenen akarsuların akış hızları, debileri ve hidroelektrik potansiyelleri son derece yüksektir.\n\nBasra Körfezi'ne dökülen Fırat ve Dicle nehirleri bu topraklardan doğar. Fırat'ın ana kolları olan Karasu (Erzincan Ovası'ndan geçer) ve Murat Nehri (Ağrı ve Muş ovalarını kat eder), Elazığ'da birleşerek Keban Baraj Gölü'nü doldurur; Keban, Atatürk Baraj Gölü'nden sonra Türkiye'nin en büyük ikinci yapay gölüdür. Dicle'nin yukarı kolları ile Hakkari'deki Büyük Zap Çayı da aynı dağlık havzanın sularını toplar. Kuzeydoğuda ise Aras, Ermenistan ve Nahçıvan sınırını çizerek, Kura ise Gürcistan'dan geçerek Hazar Denizi kapalı havzasına ulaşır.\n\nBölgenin gölleri, lavların su yollarının önünü kapatmasıyla oluşmuş volkanik set gölleridir. Van Gölü (3.713 km²), yaklaşık 200 bin yıl önce Nemrut Dağı'ndan çıkan lavların Muş havzasına giden su yolunu tıkamasıyla oluşmuş dünyanın en büyük sodalı gölü ve Türkiye'nin en büyük doğal su kütlesidir. Yüksek sodalı yapısı kış aylarında donmasını engeller ve endemik inci kefaline ev sahipliği yapar. Ardahan'daki Çıldır Gölü (123 km²) ise lav seti kökenli tatlı su gölü olup kış aylarında tamamen buz tutmasıyla bilinir. Nemrut kalderasındaki krater gölleri, Nazik ve Erçek gölleri de aynı volkanik kökene sahiptir.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'DOGU_ANADOLU',
    property: 'settlementAndPopulationTr',
    column: 'settlement_and_population_tr',
    kind: 'scalar',
    before:
      "Doğu Anadolu, 5,9 milyonluk nüfusuyla yedi coğrafi bölge içinde en az nüfus barındıran alandır (%6,86). Türkiye yüzölçümünün neredeyse beşte birini kaplamasına karşın (%19,10), kilometrekareye düşen 40 kişilik nüfus yoğunluğu Türkiye ortalamasının (110 kişi/km²) üçte birinde kalır ve bölgeyi açık ara Türkiye'nin en seyrek yerleşim alanı yapar.\n\nNüfus, sert kış şartları ve engebeli araziden kaçınarak dağlar arasındaki korunaklı çöküntü ovalarında kümelenmiştir (Van 1,11 milyon, Malatya 755 bin, Erzurum 736 bin). [Tunceli](/v2/turkiye/tunceli) (85 bin) ve Ardahan (90 bin) ise Türkiye'nin en az nüfuslu illeri arasındadır. Kırsal kesimde tarım arazisinin darlığı ve hayvancılık faaliyetleri nedeniyle mezra ve kom gibi geçici/dağınık yerleşme birimleri yaygındır.\n\nİç göç dinamiklerinde Doğu Anadolu Türkiye'nin en yoğun göç veren bölgesidir. 14 ilin 13'ünde net göç hızı sert biçimde negatiftir; Ağrı, Muş ve Kars illerinde göç kaybı binde -25 ile -32 seviyelerine kadar ulaşmaktadır.",
    after:
      "Doğu Anadolu, 5,9 milyonluk nüfusuyla yedi coğrafi bölge içinde en az nüfus barındıran alandır (%6,86). Türkiye yüzölçümünün neredeyse beşte birini kaplamasına karşın (%19,10), kilometrekareye düşen 40 kişilik nüfus yoğunluğu Türkiye ortalamasının (110 kişi/km²) üçte birinde kalır ve bölgeyi açık ara Türkiye'nin en seyrek yerleşim alanı yapar.\n\nNüfus, sert kış şartları ve engebeli araziden kaçınarak dağlar arasındaki korunaklı çöküntü ovalarında kümelenmiştir (Van 1,11 milyon, Malatya 755 bin, Erzurum 736 bin). [Tunceli](/turkiye/tunceli) (85 bin) ve Ardahan (90 bin) ise Türkiye'nin en az nüfuslu illeri arasındadır. Kırsal kesimde tarım arazisinin darlığı ve hayvancılık faaliyetleri nedeniyle mezra ve kom gibi geçici/dağınık yerleşme birimleri yaygındır.\n\nİç göç dinamiklerinde Doğu Anadolu Türkiye'nin en yoğun göç veren bölgesidir. 14 ilin 13'ünde net göç hızı sert biçimde negatiftir; Ağrı, Muş ve Kars illerinde göç kaybı binde -25 ile -32 seviyelerine kadar ulaşmaktadır.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'DOGU_ANADOLU',
    property: 'disasterAndEarthquakeTr',
    column: 'disaster_and_earthquake_tr',
    kind: 'scalar',
    before:
      "Doğu Anadolu, tektonik kavşak konumu ve sarp topoğrafyası nedeniyle çoklu afet riskine sahiptir.\n\nKuzey Anadolu Fayı ile Doğu Anadolu Fayı'nın Karlıova'da birleşmesi ve bölgeyi kat eden ikincil kırık hatları, tarihsel süreçte büyük sismik yıkımlara sahne olmuştur: 1939 Erzincan (Mw 7,9), 1966 Varto ve 2011 Van (Mw 7,2) depremleri binlerce can kaybına ve zemin sıvılaşması kaynaklı ağır yıkımlara yol açmıştır. Nemrut Dağı ise uyuyan aktif volkan sınıfında izlenmektedir.\n\nBölgenin morfolojik ve meteorolojik afet gerçeği ise çığdır. Sarp ve dik dağ yamaçlarında biriken kalın kar örtüsü, kış ve ilkbahar aylarında Hakkari, [Bitlis](/v2/turkiye/bitlis), Muş ve Van illerinde çığ felaketlerini tetikleyerek ulaşım arterlerini ve yerleşimleri tehdit eder. Aşırı don olayları, heyelanlar ve ilkbaharda kar erimeleriyle oluşan taşkınlar ikincil risklerdir.",
    after:
      "Doğu Anadolu, tektonik kavşak konumu ve sarp topoğrafyası nedeniyle çoklu afet riskine sahiptir.\n\nKuzey Anadolu Fayı ile Doğu Anadolu Fayı'nın Karlıova'da birleşmesi ve bölgeyi kat eden ikincil kırık hatları, tarihsel süreçte büyük sismik yıkımlara sahne olmuştur: 1939 Erzincan (Mw 7,9), 1966 Varto ve 2011 Van (Mw 7,2) depremleri binlerce can kaybına ve zemin sıvılaşması kaynaklı ağır yıkımlara yol açmıştır. Nemrut Dağı ise uyuyan aktif volkan sınıfında izlenmektedir.\n\nYer şekilleri ve iklimin birlikte doğurduğu afet ise çığdır. Sarp ve dik dağ yamaçlarında biriken kalın kar örtüsü, kış ve ilkbahar aylarında Hakkari, [Bitlis](/turkiye/bitlis), Muş ve Van illerinde çığ felaketlerini tetikleyerek ulaşım yollarını ve yerleşimleri tehdit eder. Aşırı don olayları, heyelanlar ve ilkbaharda kar erimeleriyle oluşan taşkınlar ikincil risklerdir.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'DOGU_ANADOLU',
    property: 'faqs',
    column: 'faqs',
    kind: 'jsonb',
    before: [
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
    after: [
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
          "Doğu Anadolu Bölgesi'ndedir. Ağrı ilinin kuzeydoğusundaki Ağrı Dağı 5.137 metredir; doruğu, Türkiye'nin en büyük buzulu olan bir takke buzuluyla örtülüdür.",
      },
      {
        question: "Türkiye'nin en büyük gölü hangi bölgededir?",
        answer:
          "Doğu Anadolu Bölgesi'ndedir. Van Gölü 3.713 kilometrekare yüzölçümüyle Türkiye'nin en büyük gölü ve dünyanın en büyük sodalı gölüdür.",
      },
      {
        question: "Doğu Anadolu Bölgesi'nde hangi iller ülke sınırındadır?",
        answer:
          "Ardahan ve Kars Gürcistan ve Ermenistan'la; Iğdır Ermenistan, Nahçıvan ve İran'la; Ağrı ve Van İran'la; Hakkari ise İran ve Irak'la sınırdaştır.",
      },
    ],
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'GUNEYDOGU_ANADOLU',
    property: 'locationAndBordersTr',
    column: 'location_and_borders_tr',
    kind: 'scalar',
    before:
      "Güneydoğu Anadolu Bölgesi, Türkiye'nin güneydoğusunda, Güneydoğu Toroslar'ın güney eteklerinden Suriye ve Irak sınırına doğru uzanan geniş bir plato sahasıdır. Denize kıyısı bulunmayan bölge, güney sınırları boyunca Orta Doğu coğrafyasıyla doğrudan bütünleşir.\n\nBölgenin güney kenarı Türkiye'nin en uzun uluslararası kara sınırlarından birini oluşturur. [Kilis](/v2/turkiye/kilis), [Gaziantep](/v2/turkiye/gaziantep), [Şanlıurfa](/v2/turkiye/sanliurfa), [Mardin](/v2/turkiye/mardin) ve [Şırnak](/v2/turkiye/sirnak) boyunca Suriye ile komşudur; Şırnak'ın en güney ucunda ise Irak ile kara sınırı bulunur. Şırnak Silopi'deki Habur Sınır Kapısı, Habur Çayı üzerindeki köprülerle Türkiye'nin Irak'a ve Körfez bölgesine açılan en stratejik transit ticaret kapısıdır; Kilis Öncüpınar ve Gaziantep Karkamış kapıları da Suriye koridorunu sağlar.\n\nİç sınırlarda bölge yalnızca iki coğrafi komşuya sahiptir ve bu, yedi bölge içindeki en dar iç komşuluktur: Kuzeyde Güneydoğu Toroslar boyunca Doğu Anadolu Bölgesi'yle; batıda ise Gaziantep ve [Adıyaman](/v2/turkiye/adiyaman) üzerinden Akdeniz Bölgesi'yle sınırdaştır.",
    after:
      "Güneydoğu Anadolu Bölgesi, Türkiye'nin güneydoğusunda, Güneydoğu Toroslar'ın güney eteklerinden Suriye ve Irak sınırına doğru uzanan geniş bir plato sahasıdır. Denize kıyısı bulunmayan bölge, güney sınırları boyunca Orta Doğu coğrafyasıyla doğrudan bütünleşir.\n\nBölgenin güney kenarı Türkiye'nin en uzun uluslararası kara sınırlarından birini oluşturur. [Kilis](/turkiye/kilis), [Gaziantep](/turkiye/gaziantep), [Şanlıurfa](/turkiye/sanliurfa), [Mardin](/turkiye/mardin) ve [Şırnak](/turkiye/sirnak) boyunca Suriye ile komşudur; Şırnak'ın en güney ucunda ise Irak ile kara sınırı bulunur. Şırnak Silopi'deki Habur Sınır Kapısı, Habur Çayı üzerindeki köprülerle Türkiye'nin Irak'a ve Körfez bölgesine açılan en stratejik transit ticaret kapısıdır; Kilis Öncüpınar ve Gaziantep Karkamış kapıları da Suriye koridorunu sağlar.\n\nİç sınırlarda bölge yalnızca iki coğrafi komşuya sahiptir ve bu, yedi bölge içindeki en dar iç komşuluktur: Kuzeyde Güneydoğu Toroslar boyunca Doğu Anadolu Bölgesi'yle; batıda ise Gaziantep ve [Adıyaman](/turkiye/adiyaman) üzerinden Akdeniz Bölgesi'yle sınırdaştır.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'GUNEYDOGU_ANADOLU',
    property: 'landformsTr',
    column: 'landforms_tr',
    kind: 'scalar',
    before:
      "Güneydoğu Anadolu'nun morfolojisini kuzeydeki dağ eteklerinden güneydeki Mezopotamya düzlüklerine doğru hafif eğimle alçalan geniş ve açık platolar belirler. Gaziantep ve Şanlıurfa platoları, akarsu aşındırması ve kireçtaşı tabakaları üzerinde gelişmiş dalgalı tarım yüzeyleridir.\n\nBu açık plato morfolojisinin ortasında sönmüş dev bir kalkan volkan olan Karacadağ (Kolubaba Tepesi 1.957 m) yükselir. Akıcı bazalt lavlarının yüzlerce kilometrekareye yayılmasıyla oluşan yaklaşık 10.000 kilometrekarelik lav kalkanı, Akdeniz havzasının taban alanı en geniş volkanlarından biridir; taşlık ve kayalık bir arazi yaratan bu bazalt örtü doğuda Dicle Vadisi'ne kadar sokularak [Diyarbakır](/v2/turkiye/diyarbakir)'ın tarihi surlarının siyah yapı taşını sağlamıştır.\n\nBölgenin güneyinde yükselen Mardin Dağları (Mardin Eşiği), güneydeki Suriye düzlüklerinden 600-1.000 metre aniden yükselen kireçtaşlı bir basamak oluşturur. Bu eşiğin eteklerinde alüvyonlarla dolmuş dev tarım ovaları sıralanır: Harran, Suruç, Ceylanpınar, Viranşehir ve Araban ovaları bölgenin temel tahıl ve endüstriyel tarım düzlükleridir.\n\nDoğuya gidildikçe arazi hızla engebelenir: [Siirt](/v2/turkiye/siirt)'teki Yazlıca (Herekul) Dağı 2.838 metreye ulaşırken Botan Çayı Türkiye'nin en derin kanyon vadilerinden birini oyar. Şırnak'ta ise Cudi Dağı (2.114 m) sarp doruklarıyla Mezopotamya ovasının kuzey sınırını çizer.",
    after:
      "Güneydoğu Anadolu'nun yer şekillerini kuzeydeki dağ eteklerinden güneydeki Mezopotamya düzlüklerine doğru hafif eğimle alçalan geniş ve açık platolar belirler. Gaziantep ve Şanlıurfa platoları, akarsu aşındırması ve kireçtaşı tabakaları üzerinde gelişmiş dalgalı tarım yüzeyleridir.\n\nBu açık platoların ortasında uzun süredir püskürmemiş dev bir kalkan volkan olan Karacadağ (Kolubaba Tepesi 1.957 m) yükselir. Akıcı bazalt lavlarının yüzlerce kilometrekareye yayılmasıyla oluşan yaklaşık 10.000 kilometrekarelik lav kalkanı, Akdeniz havzasının taban alanı en geniş volkanlarından biridir; taşlık ve kayalık bir arazi yaratan bu bazalt örtü doğuda Dicle Vadisi'ne kadar sokularak [Diyarbakır](/turkiye/diyarbakir)'ın tarihi surlarının siyah yapı taşını sağlamıştır.\n\nBölgenin güneyinde yükselen Mardin Dağları (Mardin Eşiği), güneydeki Suriye düzlüklerinden 600-1.000 metre aniden yükselen kireçtaşlı bir basamak oluşturur. Bu eşiğin eteklerinde alüvyonlarla dolmuş dev tarım ovaları sıralanır: Harran, Suruç, Ceylanpınar, Viranşehir ve Araban ovaları bölgenin temel tahıl ve endüstriyel tarım düzlükleridir.\n\nDoğuya gidildikçe arazi hızla engebelenir: [Siirt](/turkiye/siirt)'teki Yazlıca (Herekul) Dağı 2.838 metreye ulaşırken Botan Çayı Türkiye'nin en derin kanyon vadilerinden birini oyar. Şırnak'ta ise Cudi Dağı (2.114 m) sarp doruklarıyla Mezopotamya ovasının kuzey sınırını çizer.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'GUNEYDOGU_ANADOLU',
    property: 'climateAndVegetationTr',
    column: 'climate_and_vegetation_tr',
    kind: 'scalar',
    before:
      "Güneydoğu Anadolu'nun iklimini belirleyen en temel etken, güneyden sokulan çöl hava kütleleri ve şiddetli buharlaşmadır. Bölgede yaz mevsimi Türkiye'nin en sıcak, en kurak ve buharlaşma şiddetinin en yüksek olduğu dönemdir.\n\nBasra alçak basıncının güneyden taşıdığı kuru ve sıcak hava (samyeli), yaz aylarında sıcaklıkları gölgede 40-45 derecenin üzerine çıkarır. Yetersiz yağış ve aşırı buharlaşma topraktaki nemi hızla tüketir. Kış mevsimi ise Doğu Anadolu kadar sert olmamakla birlikte soğuk ve yer yer don olaylı geçer. Yalnızca batıdaki Gaziantep ve Kilis yöreleri Akdeniz'den gelen nemli hava kütlelerine açık olduğu için kışları daha ılık geçer ve zeytin ile antep fıstığı tarımına elverişli bir mikroklima sunar.\n\nDoğal bitki örtüsü bu şiddetli kuraklığa uyum sağlamış kurakçıl otsu türlerden (antropojen step) oluşur. Aşırı otlatma ve orman tahribatıyla genişleyen bozkırlarda geven, yavşan otu ve devedikeni yaygındır. Toroslar'ın eteklerinde seyrek meşe çalıları görülürken, Şanlıurfa Tektek Dağları ve Gaziantep platolarında yabani fıstık (menengiç/çitlembik) çalıları bölgenin karakteristik yerel florasını oluşturur.",
    after:
      "Güneydoğu Anadolu'nun iklimini belirleyen en temel etken, güneyden sokulan çöl hava kütleleri ve şiddetli buharlaşmadır. Bölgede yaz mevsimi Türkiye'nin en sıcak, en kurak ve buharlaşma şiddetinin en yüksek olduğu dönemdir.\n\nBasra alçak basıncının güneyden taşıdığı kuru ve sıcak hava (samyeli), yaz aylarında sıcaklıkları gölgede 40-45 derecenin üzerine çıkarır. Yetersiz yağış ve aşırı buharlaşma topraktaki nemi hızla tüketir. Kış mevsimi ise Doğu Anadolu kadar sert olmamakla birlikte soğuk ve yer yer don olaylı geçer. Yalnızca batıdaki Gaziantep ve Kilis yöreleri Akdeniz'den gelen nemli hava kütlelerine açık olduğu için kışları daha ılık geçer ve zeytin ile antep fıstığı tarımına elverişli bir mikroklima sunar.\n\nDoğal bitki örtüsü bu şiddetli kuraklığa uyum sağlamış kurakçıl otlardan oluşur. Aşırı otlatma ve orman tahribatıyla genişleyen bu insan kaynaklı bozkırlarda (antropojen step) geven, yavşan otu ve devedikeni yaygındır. Toroslar'ın eteklerinde seyrek meşe çalıları görülürken, Şanlıurfa Tektek Dağları ve Gaziantep platolarında yabani fıstık (menengiç/çitlembik) çalıları bölgeye özgü bitki örtüsünü oluşturur.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'GUNEYDOGU_ANADOLU',
    property: 'hydrographyTr',
    column: 'hydrography_tr',
    kind: 'scalar',
    before:
      "Bölgenin hidrografik can damarını, kuzeydeki Doğu Anadolu dağlarından doğup Basra Körfezi'ne yönelen Fırat ve Dicle nehirleri oluşturur. Bu iki nehir karların erimesiyle beslendiği için bölgedeki şiddetli yaz kuraklığına rağmen yüksek debiyle akmayı sürdürür.\n\nBatı kanadı drene eden Fırat Nehri, Adıyaman ve Şanlıurfa sınırları boyunca akar. Nehir üzerinde inşa edilen Atatürk Barajı (817 km² göl alanı ve 48,5 milyar m³ su hacmi), Güneydoğu Anadolu Projesi'nin (GAP) kalbidir ve 2.400 megavatlık kurulu gücüyle Türkiye'nin en büyük hidroelektrik santralidir. Baraj gölünden alınan su, 26,4 kilometre uzunluğundaki dev Şanlıurfa Sulama Tünelleri aracılığıyla kurak Harran Ovası'na ve çevre ovalara aktarılarak yüz binlerce hektar araziyi sulamaktadır. Fırat üzerinde daha güneyde Birecik ve Karkamış barajları yer alır.\n\nDoğu kanadı toplayan Dicle Nehri ise Diyarbakır'ın bazalt platosunu yararak Hevsel Bahçeleri'ni sular, [Batman](/v2/turkiye/batman) ve Ilısu (Veysel Eroğlu) barajlarıyla güneye akar. Batman Çayı, Siirt Botan Çayı ve Şırnak Habur Çayı Dicle'nin ana kollarını oluşturur.\n\nBölgede doğal göl yok denecek kadar azdır; su ihtiyacı Atatürk, Kralkızı, Dicle ve Batman gibi dev baraj gölleri ile yer altı su kuyularından karşılanır.",
    after:
      "Bölgenin can damarını, kuzeydeki Doğu Anadolu dağlarından doğup Basra Körfezi'ne yönelen Fırat ve Dicle nehirleri oluşturur. Bu iki nehir karların erimesiyle beslendiği için bölgedeki şiddetli yaz kuraklığına rağmen yüksek debiyle akmayı sürdürür.\n\nBatı kanadın sularını toplayan Fırat Nehri, Adıyaman ve Şanlıurfa sınırları boyunca akar. Nehir üzerinde inşa edilen Atatürk Barajı (817 km² göl alanı ve 48,5 milyar m³ su hacmi), Güneydoğu Anadolu Projesi'nin (GAP) kalbidir ve 2.400 megavatlık kurulu gücüyle Türkiye'nin en büyük hidroelektrik santralidir. Baraj gölünden alınan su, 26,4 kilometre uzunluğundaki dev Şanlıurfa Sulama Tünelleri aracılığıyla kurak Harran Ovası'na ve çevre ovalara aktarılarak yüz binlerce hektar araziyi sulamaktadır. Fırat üzerinde daha güneyde Birecik ve Karkamış barajları yer alır.\n\nDoğu kanadı toplayan Dicle Nehri ise Diyarbakır'ın bazalt platosunu yararak Hevsel Bahçeleri'ni sular, [Batman](/turkiye/batman) ve Ilısu (Veysel Eroğlu) barajlarıyla güneye akar. Batman Çayı, Siirt Botan Çayı ve Şırnak Habur Çayı Dicle'nin ana kollarını oluşturur.\n\nBölgede doğal göl yok denecek kadar azdır; su ihtiyacı Atatürk, Kralkızı, Dicle ve Batman gibi dev baraj gölleri ile yer altı su kuyularından karşılanır.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'GUNEYDOGU_ANADOLU',
    property: 'disasterAndEarthquakeTr',
    column: 'disaster_and_earthquake_tr',
    kind: 'scalar',
    before:
      "Bölgenin batı kesimi Doğu Anadolu Fay Zonu'nun doğrudan etki alanındadır. 6 Şubat 2023 Kahramanmaraş merkezli depremlerde Gaziantep'in Nurdağı ve İslahiye ilçeleri fay hattı üzerinde yer almaları nedeniyle ağır can kaybı ve yıkım yaşamıştır.\n\nBölgenin ikinci jeolojik unsuru ortada yükselen sönmüş Karacadağ kalkan volkanıdır; MTA tarafından Türkiye'nin genç aktif volkanları arasında sınıflandırılmaktadır.\n\nBölgenin en kritik ve sürekli çevresel afeti ise şiddetli yaz kuraklığı ve aşırı buharlaşmadır. Yetersiz yağışlar tarımsal kuraklığı tetiklerken, rüzgâr erozyonu verimli toprakları aşındırır. Ayrıca GAP sahasında aşırı ve vahşi sulama yapılan tarım arazilerinde yer altı su seviyesinin yüzeye yaklaşmasıyla toprakta çoraklaşma ve tuzlanma tehlikesi ortaya çıkmaktadır.",
    after:
      "Bölgenin batı kesimi Doğu Anadolu Fay Zonu'nun doğrudan etki alanındadır. 6 Şubat 2023 Kahramanmaraş merkezli depremlerde Gaziantep'in Nurdağı ve İslahiye ilçeleri fay hattı üzerinde yer almaları nedeniyle ağır can kaybı ve yıkım yaşamıştır.\n\nBölgenin ikinci jeolojik unsuru ortada yükselen Karacadağ kalkan volkanıdır; uzun süredir püskürmemiş olsa da MTA tarafından Türkiye'nin aktif volkanları arasında sayılır.\n\nBölgenin en kritik ve sürekli çevresel afeti ise şiddetli yaz kuraklığı ve aşırı buharlaşmadır. Yetersiz yağışlar tarımsal kuraklığı tetiklerken, rüzgâr erozyonu verimli toprakları aşındırır. Ayrıca GAP sahasında aşırı ve vahşi sulama yapılan tarım arazilerinde yer altı su seviyesinin yüzeye yaklaşmasıyla toprakta çoraklaşma ve tuzlanma tehlikesi ortaya çıkmaktadır.",
  },
  {
    table: 'regions',
    keyColumn: 'region',
    key: 'GUNEYDOGU_ANADOLU',
    property: 'comparisonTr',
    column: 'comparison_tr',
    kind: 'scalar',
    before:
      "Güneydoğu Anadolu, denize kıyısı bulunmayan iki iç bölgeden biridir. Buna karşın kilometrekareye 126 kişi düşen nüfus yoğunluğuyla, kıyı bölgeleri olan Ege ve Akdeniz'in üzerinde bir yoğunluğa sahiptir. Genç nüfus yapısı ve GAP sulama projeleriyle genişleyen tarımsal vahalar, bölgenin demografik canlılığını beslemektedir.",
    after:
      "Güneydoğu Anadolu, denize kıyısı bulunmayan üç iç bölgeden biridir. Buna karşın kilometrekareye 126 kişi düşen nüfus yoğunluğuyla, kıyı bölgeleri olan Ege ve Akdeniz'in üzerinde bir yoğunluğa sahiptir. Genç nüfus yapısı ve GAP sulama projeleriyle genişleyen tarımsal vahalar, bölgenin demografik canlılığını beslemektedir.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '34',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "İstanbul, jeomorfolojik olarak Çatalca-Kocaeli Bölümü'nde yer alır. İlin büyük bölümünü dağlar ya da ovalar değil, aşınım yüzeyleri üzerinde gelişmiş bir plato oluşturur; bu plato Kocaeli Platosu'nun bir parçasıdır. İlin en yüksek noktası, Kartal, Pendik, Sultanbeyli ve Sancaktepe sınırında yer alan 538 metrelik Aydos Dağı'dır. Onu 438 metreyle Kayış Dağı ve 409 metreyle Alem Dağı izler.\n\nİstanbul Boğazı, 17 deniz mili (yaklaşık 31,5 km) uzunluğundadır. Üzerinde, güneyden kuzeye doğru üç asma köprü iki yakayı birbirine bağlar: 1973'te açılan 15 Temmuz Şehitler Köprüsü, 1988'de açılan Fatih Sultan Mehmet Köprüsü ve 2016'da açılan Yavuz Sultan Selim Köprüsü.\n\nBoğazın Avrupa yakasında yer alan Haliç, Kağıthane ve Alibeyköy derelerinin birleşip denizin istila ettiği bir vadi ağzından oluşmuştur. Coğrafyada bu tip kıyılara \"ria\" denir.\n\nTarihi yarımada — bugünkü Fatih ilçesi — şehrin en eski yerleşim çekirdeğidir ve geleneksel olarak yedi tepe üzerine kurulu kabul edilir. Bu tanım surlariçi bölgeyi kapsar; ilin toplam yüzölçümü 5.461 km²'dir.\n\nİstanbul'un yaklaşık 20 km güneyinden Kuzey Anadolu Fayı (KAF) geçer. Dünyanın en aktif fay sistemlerinden biri olan KAF, toplam 1.500 km uzunluğunda, sağ yanal doğrultu atımlı bir kırık hattıdır. Fayın Marmara Denizi içinden geçen kolu — Adalar, Silivri, Marmaraereğlisi ve Tekirdağ arasındaki segment — yüksek deprem üretme potansiyeli taşıyan bir kuşak olarak izlenir.",
    after:
      "İstanbul, yer şekilleri bakımından Çatalca-Kocaeli Bölümü'nde yer alır. İlin büyük bölümünü dağlar ya da ovalar değil, aşınım yüzeyleri üzerinde gelişmiş bir plato oluşturur; bu plato Kocaeli Platosu'nun bir parçasıdır. İlin en yüksek noktası, Kartal, Pendik, Sultanbeyli ve Sancaktepe sınırında yer alan 538 metrelik Aydos Dağı'dır. Onu 438 metreyle Kayış Dağı ve 409 metreyle Alem Dağı izler.\n\nİstanbul Boğazı, 17 deniz mili (yaklaşık 31,5 km) uzunluğundadır. Üzerinde, güneyden kuzeye doğru üç asma köprü iki yakayı birbirine bağlar: 1973'te açılan 15 Temmuz Şehitler Köprüsü, 1988'de açılan Fatih Sultan Mehmet Köprüsü ve 2016'da açılan Yavuz Sultan Selim Köprüsü.\n\nBoğazın Avrupa yakasında yer alan Haliç, Kağıthane ve Alibeyköy derelerinin birleşip denizin istila ettiği bir vadi ağzından oluşmuştur. Coğrafyada bu tip kıyılara \"ria\" denir.\n\nTarihi yarımada — bugünkü Fatih ilçesi — şehrin en eski yerleşim çekirdeğidir ve geleneksel olarak yedi tepe üzerine kurulu kabul edilir. Bu tanım surlariçi bölgeyi kapsar; ilin toplam yüzölçümü 5.461 km²'dir.\n\nİstanbul'un yaklaşık 20 km güneyinden Kuzey Anadolu Fayı (KAF) geçer. Dünyanın en aktif fay sistemlerinden biri olan KAF, toplam 1.500 km uzunluğunda, sağ yanal doğrultu atımlı, yani iki yakası birbirine göre yatay kayan bir kırık hattıdır. Fayın Marmara Denizi içinden geçen kolu — Adalar, Silivri, Marmaraereğlisi ve Tekirdağ arasındaki kesim — büyük deprem üretme olasılığı yüksek bir kuşak olarak izlenir.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '34',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "İstanbul'un içme suyu ihtiyacı, İSKİ tarafından işletilen 10 barajdan karşılanır: Asya yakasında Ömerli, Darlık ve Elmalı; Avrupa yakasında Terkos, Büyükçekmece, Sazlıdere, Pabuçdere, Alibey, Kazandere ve Istrancalar. Bu barajların toplam aktif biriktirme hacmi yaklaşık 868 milyon m³, yıllık ortalama su verimi ise yaklaşık 905 milyon m³'tür. Ayrıca Melen Sistemi üzerinden Düzce'den de trans-havza su aktarımı yapılır.\n\nİstanbul Boğazı'nda, dünyada nadir görülen iki katmanlı bir akıntı sistemi vardır: yüzeyde Karadeniz kökenli az tuzlu su Marmara'ya doğru, dipte ise Marmara ve Akdeniz kökenli daha tuzlu ve yoğun su Karadeniz'e doğru akar. Boğazın Avrupa yakasında Kağıthane ve Alibeyköy dereleri Haliç'te birleşir.\n\nİlin batı kesiminde, Küçükçekmece ve Büyükçekmece adlarını taşıyan iki kıyı gölü (lagün) bulunur. Büyükçekmece aynı zamanda bir İSKİ barajı olarak işletilir. Küçükçekmece ise denizle bağlantısı nedeniyle tuzlu su içerir ve içme suyu kaynağı olarak kullanılmaz.",
    after:
      "İstanbul'un içme suyu ihtiyacı, İSKİ tarafından işletilen 10 barajdan karşılanır: Asya yakasında Ömerli, Darlık ve Elmalı; Avrupa yakasında Terkos, Büyükçekmece, Sazlıdere, Pabuçdere, Alibey, Kazandere ve Istrancalar. Bu barajların toplam aktif biriktirme hacmi yaklaşık 868 milyon m³, yıllık ortalama su verimi ise yaklaşık 905 milyon m³'tür. Ayrıca Melen Sistemi üzerinden Düzce'den de havzalar arası su aktarımı yapılır.\n\nİstanbul Boğazı'nda, dünyada nadir görülen iki katmanlı bir akıntı sistemi vardır: yüzeyde Karadeniz kökenli az tuzlu su Marmara'ya doğru, dipte ise Marmara ve Akdeniz kökenli daha tuzlu ve yoğun su Karadeniz'e doğru akar. Boğazın Avrupa yakasında Kağıthane ve Alibeyköy dereleri Haliç'te birleşir.\n\nİlin batı kesiminde, Küçükçekmece ve Büyükçekmece adlarını taşıyan iki kıyı gölü (lagün) bulunur. Büyükçekmece aynı zamanda bir İSKİ barajı olarak işletilir. Küçükçekmece ise denizle bağlantısı nedeniyle tuzlu su içerir ve içme suyu kaynağı olarak kullanılmaz.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '34',
    property: 'settlementNoteTr',
    column: 'settlement_note_tr',
    kind: 'scalar',
    before:
      "Nüfus yoğunluğu (≈2.885 kişi/km², türetilmiş) ile Türkiye'nin en yoğun nüfuslu ilidir. TÜİK'in il/ilçe merkezi nüfus oranı İstanbul için %100'dür. Bu rakam ilin fiilen tamamen kentleştiği anlamına gelmez; büyükşehir statüsündeki illerde belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı Kanun) bir sonucudur. İstanbul 2024 yılında hem en çok göç alan (395.485 kişi) hem de en çok göç veren (369.453 kişi) il oldu; buna karşın net göç hızı +1,66 ‰ ile pozitif kaldı.",
    after:
      "Nüfus yoğunluğu (≈2.885 kişi/km², nüfus ve yüzölçümünden hesaplanan) ile Türkiye'nin en yoğun nüfuslu ilidir. TÜİK'in il/ilçe merkezi nüfus oranı İstanbul için %100'dür. Bu rakam ilin fiilen tamamen kentleştiği anlamına gelmez; büyükşehir statüsündeki illerde belde ve köylerin idari tüzel kişiliğinin kaldırılmasının (6360 sayılı Kanun) bir sonucudur. İstanbul 2024 yılında hem en çok göç alan (395.485 kişi) hem de en çok göç veren (369.453 kişi) il oldu; buna karşın net göç hızı +1,66 ‰ ile pozitif kaldı.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '65',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Van'ın morfolojisi genç volkanizma ve yoğun tektonizma ile şekillenmiştir. İlin batısındaki Van Gölü, yaklaşık 200 bin yıl önce Nemrut Dağı'nın patlayarak püskürttüğü lavların Muş Havzası'na giden doğal drenaj yolunu tıkamasıyla oluşmuş dünyanın en büyük volkanik set gölüdür. Tepesinde 6 kilometre çapında geniş bir kaldera barındıran 2.935 metrelik Nemrut Dağı, son lav akıntısı 1441'de kaydedilmiş uyuyan aktif bir volkandır.\n\nGöl çanağının kuzeyinde yükselen 4.058 metrelik Süphan Dağı, zirvesindeki buzul kalıntılarıyla Ağrı ve Cilo'nun ardından Türkiye'nin üçüncü yüksek doruğudur. Havza güneyden dik ve parçalı Bitlis Masifi, kuzey ve doğudan ise Aladağ ve Tendürek volkanik dizilimleriyle kuşatılmıştır.\n\nKuzey ve Doğu Anadolu fay sistemlerinin karmaşık gerilme alanında yer alan ilde, 23 Ekim 2011'de merkez üssü Tabanlı olan 7,2 büyüklüğünde bir deprem yaşanmış, 604 kişi yaşamını yitirmiş ve en ağır yıkım Erciş ilçesinde meydana gelmiştir. Aynı yılın 9 Kasım'ında Edremit merkezli 5,6 büyüklüğündeki sarsıntı da yapı stokunda ilave hasar oluşturmuştur.",
    after:
      "Van'ın yer şekillerini jeolojik açıdan genç volkanik faaliyetler ve yoğun yer kabuğu hareketleri biçimlendirmiştir. İlin batısındaki Van Gölü, yaklaşık 200 bin yıl önce Nemrut Dağı'nın patlayarak püskürttüğü lavların Muş Havzası'na giden doğal akış yolunu tıkamasıyla oluşmuş dünyanın en büyük volkanik set gölüdür. Tepesinde 6 kilometre çapında geniş bir kaldera barındıran 2.935 metrelik Nemrut Dağı, son lav akıntısı 1441'de kaydedilmiş uyuyan aktif bir volkandır.\n\nGöl çanağının kuzeyinde yükselen 4.058 metrelik Süphan Dağı, zirvesindeki buzul kalıntılarıyla Ağrı ve Cilo'nun ardından Türkiye'nin üçüncü yüksek doruğudur. Havza güneyden dik ve parçalı Bitlis Masifi, kuzey ve doğudan ise Aladağ ve Tendürek volkanik dizilimleriyle kuşatılmıştır.\n\nKuzey ve Doğu Anadolu fay sistemlerinin karmaşık gerilme alanında yer alan ilde, 23 Ekim 2011'de merkez üssü Tabanlı olan 7,2 büyüklüğünde bir deprem yaşanmış, 604 kişi yaşamını yitirmiş ve en ağır yıkım Erciş ilçesinde meydana gelmiştir. Aynı yılın 9 Kasım'ında Edremit merkezli 5,6 büyüklüğündeki sarsıntı da binalarda ek hasara yol açmıştır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '65',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Van Gölü, 3.713 km² yüzölçümü ve 451 metreye ulaşan derinliğiyle Türkiye'nin en büyük gölü ve dünyanın en geniş sodalı gölüdür. Sularının yüksek alkalinitesi (pH 9,8) ve tuzluluğu (binde 19), sert kış koşullarına rağmen göl yüzeyinin donmasını engeller ve göle endemik inci kefali türüne ev sahipliği sağlar.\n\nKapalı havza özelliği nedeniyle dış drenajı bulunmayan göl, Bendimahi, Zilan, Karasu, Deliçay ve Engil çaylarıyla beslenir. Havza tabanında ayrıca tektonik kökenli tuzlu Erçek Gölü yer alır. DSİ tarafından işletilen sulama barajları ve hidroelektrik tesisleri, akarsu rejimlerinin ilkbahar kar erimeleriyle kabaran debisini düzenleyerek Erciş ve Van ovalarındaki tarımsal sulamayı güvenceye alır.",
    after:
      "Van Gölü, 3.713 km² yüzölçümü ve 451 metreye ulaşan derinliğiyle Türkiye'nin en büyük gölü ve dünyanın en geniş sodalı gölüdür. Suyunun çok bazik (pH 9,8) ve tuzlu (binde 19) olması, sert kış koşullarına rağmen göl yüzeyinin donmasını engeller ve yalnızca bu gölde yaşayan (endemik) inci kefali türüne ev sahipliği sağlar.\n\nKapalı havza özelliği nedeniyle dışarıya akışı bulunmayan göl, Bendimahi, Zilan, Karasu, Deliçay ve Engil çaylarıyla beslenir. Havza tabanında ayrıca tektonik kökenli tuzlu Erçek Gölü yer alır. DSİ tarafından işletilen sulama barajları ve hidroelektrik tesisleri, ilkbahar kar erimeleriyle kabaran akarsuların akımını düzenleyerek Erciş ve Van ovalarındaki tarımsal sulamayı güvenceye alır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '02',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      'İlin doğu ve güneydoğu sınırını 180 kilometre boyunca Fırat Nehri ile nehir üzerindeki devasa Atatürk Baraj Gölü çizer. Çelikhan dağlarından doğan 45,5 kilometre uzunluğundaki Kahta Çayı, derin vadilerden geçerek sularını baraj gölüne boşaltır. Baraj gölü, ilin güney ovalarının sulama imkânlarını ve mikroklimasını derinden dönüştürmüştür.',
    after:
      'İlin doğu ve güneydoğu sınırını 180 kilometre boyunca Fırat Nehri ile nehir üzerindeki devasa Atatürk Baraj Gölü çizer. Çelikhan dağlarından doğan 45,5 kilometre uzunluğundaki Kahta Çayı, derin vadilerden geçerek sularını baraj gölüne boşaltır. Baraj gölü, ilin güney ovalarının sulama imkânlarını ve yerel iklimini derinden dönüştürmüştür.',
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '72',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Batman, Batman Çayı ile Dicle Nehri vadilerinin birleştiği geniş alüvyal çöküntü havzasında yer alır. İlin güneyinde kireçtaşı yapısıyla yükselen 1.288 metrelik Raman Dağı, mağaraları ve sarp yarıklarıyla dikkat çeker. Raman Dağı antiklinali aynı zamanda Türkiye'nin modern petrol tarihinin başladığı sahadır: 1940'ta Raman-1 kuyusunda petrol keşfedilmiş, 1948'de Raman-8 kuyusuyla ekonomik ölçekte üretime geçilmiştir.",
    after:
      "Batman, Batman Çayı ile Dicle Nehri vadilerinin birleştiği geniş alüvyal çöküntü havzasında yer alır. İlin güneyinde kireçtaşı yapısıyla yükselen 1.288 metrelik Raman Dağı, mağaraları ve sarp yarıklarıyla dikkat çeker. Raman Dağı antiklinali (katmanları yukarı doğru kıvrılmış kütle) aynı zamanda Türkiye'nin modern petrol tarihinin başladığı sahadır: 1940'ta Raman-1 kuyusunda petrol keşfedilmiş, 1948'de Raman-8 kuyusuyla ekonomik ölçekte üretime geçilmiştir.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '72',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Kuzeydeki yüksek dağlardan doğup güneye akan Batman Çayı, il merkezinin batısından geçerek güney sınırını çizen Dicle Nehri'ne katılır. Bu iki akarsuyun taşıdığı alüvyonlar ilin tarımsal üretim alanlarını beslerken, akarsu taşkın tabanları kentsel ve kırsal yerleşim aksını belirler.",
    after:
      "Kuzeydeki yüksek dağlardan doğup güneye akan Batman Çayı, il merkezinin batısından geçerek güney sınırını çizen Dicle Nehri'ne katılır. Bu iki akarsuyun taşıdığı alüvyonlar ilin tarımsal üretim alanlarını beslerken, akarsuların taşkın düzlükleri kentteki ve kırdaki yerleşmelerin uzandığı hattı belirler.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '21',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      'İlin can damarı, kaynağını Hazar Gölü çevresinden alan ve Türkiye sınırlarında 523 kilometre akan Dicle Nehri’dir. GAP kapsamında nehir üzerine kurulan Kralkızı Barajı ile 22 kilometre aşağısındaki Dicle Barajı hidroelektrik enerji üretirken geniş tarım arazilerini sular.\n\nKentin içme ve tarımsal sulama ihtiyacında Devegeçidi Çayı üzerindeki baraj da önemli yer tutar; karların eridiği taşkın mevsimlerinde barajlar arasında su aktarımı yapılarak rezervuar dengesi korunur.',
    after:
      'İlin can damarı, kaynağını Hazar Gölü çevresinden alan ve Türkiye sınırlarında 523 kilometre akan Dicle Nehri’dir. GAP kapsamında nehir üzerine kurulan Kralkızı Barajı ile 22 kilometre aşağısındaki Dicle Barajı hidroelektrik enerji üretirken geniş tarım arazilerini sular.\n\nKentin içme ve tarımsal sulama ihtiyacında Devegeçidi Çayı üzerindeki baraj da önemli yer tutar; karların eridiği taşkın mevsimlerinde barajlar arasında su aktarımı yapılarak baraj göllerindeki su dengesi korunur.',
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '27',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "İlin doğu sınırını Fırat Nehri çizerken batıdan nehre katılan Nizip Çayı ve Araban Ovası'nı sulayan Karasu, Fırat havzasının ildeki başlıca damarlarıdır. Doğal gölü bulunmayan kentte Oğuzeli kesimindeki Kayacık Barajı 13.680 hektarlık tarım arazisini sulayarak komşu Kilis ile paylaşılır.\n\nHızla büyüyen sanayi ve kent nüfusunun içme suyu gereksinimi ise Kahramanmaraş Pazarcık'taki Kartalkaya Barajı'ndan çekilen 53,7 kilometrelik isale hattıyla havza dışından karşılanır.",
    after:
      "İlin doğu sınırını Fırat Nehri çizerken batıdan nehre katılan Nizip Çayı ve Araban Ovası'nı sulayan Karasu, Fırat havzasının ildeki başlıca damarlarıdır. Doğal gölü bulunmayan kentte Oğuzeli kesimindeki Kayacık Barajı 13.680 hektarlık tarım arazisini sulayarak komşu Kilis ile paylaşılır.\n\nHızla büyüyen sanayi ve kent nüfusunun içme suyu gereksinimi ise Kahramanmaraş Pazarcık'taki Kartalkaya Barajı'ndan çekilen 53,7 kilometrelik su iletim hattıyla havza dışından karşılanır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '47',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Mardin Dağları, güneydeki geniş Mezopotamya Ovası’ndan aniden 600 ila 1.000 metre, yer yer 1.200 metre dik bir yamaçla ayrılan masif bir kireçtaşı kütlesidir. Bu jeomorfolojik eşik, bölgede 'Mardin Eşiği' olarak adlandırılır. Aşınmış kalker platoları güneye doğru basamaklar halinde alçalarak Kızıltepe, Nusaybin ve Mardin tarım ovalarına açılır.",
    after:
      "Mardin Dağları, güneydeki geniş Mezopotamya Ovası’ndan aniden 600 ila 1.000 metre, yer yer 1.200 metre dik bir yamaçla ayrılan masif bir kireçtaşı kütlesidir. Bu doğal eşik, bölgede 'Mardin Eşiği' olarak adlandırılır. Aşınmış kalker platoları güneye doğru basamaklar halinde alçalarak Kızıltepe, Nusaybin ve Mardin tarım ovalarına açılır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '47',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      'İlin doğu kesiminde Batman sınırının bir bölümünü çizen Dicle Nehri, derin kanyonlardan akar. Nusaybin ilçesinden geçen Çağçağ Suyu ile Savur Çayı, karstik vadileri aşarak güneydeki tarım arazilerine can suyu verir. İlde doğal göl bulunmamakta, tarımsal sulamada Buğur Çayı göleti ve yeraltı akiferlerinden yararlanılmaktadır.',
    after:
      'İlin doğu kesiminde Batman sınırının bir bölümünü çizen Dicle Nehri, derin kanyonlardan akar. Nusaybin ilçesinden geçen Çağçağ Suyu ile Savur Çayı, karstik vadileri aşarak güneydeki tarım arazilerine can suyu verir. İlde doğal göl bulunmamakta, tarımsal sulamada Buğur Çayı göleti ve yeraltı suyu katmanlarından yararlanılmaktadır.',
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '56',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Siirt arazisi, Güneydoğu Toroslar'ın Hakkari dağ sistemine bağlandığı yüksek ve engebeli dağ sıralarıyla kaplıdır; 2.838 metrelik Yazlıca (Herekul) Dağı ilin en yüksek zirvesini oluşturur. Kireçtaşı ve killi formasyonları yaran Botan Çayı, Doğruyol ve Kapılı dağları arasında Türkiye'nin en sarp kanyon vadilerinden birini meydana getirir; vadinin ekolojik ve jeomorfolojik değeri 2019'da ilan edilen Botan Vadisi Milli Parkı ile korunmaya alınmıştır.",
    after:
      "Siirt arazisi, Güneydoğu Toroslar'ın Hakkari dağ sistemine bağlandığı yüksek ve engebeli dağ sıralarıyla kaplıdır; 2.838 metrelik Yazlıca (Herekul) Dağı ilin en yüksek zirvesini oluşturur. Kireçtaşı ve kil katmanlarını yaran Botan Çayı, Doğruyol ve Kapılı dağları arasında Türkiye'nin en sarp kanyon vadilerinden birini meydana getirir; vadinin doğal yaşam ve yer şekli bakımından değeri 2019'da ilan edilen Botan Vadisi Milli Parkı ile korunmaya alınmıştır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '56',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "İlin ana hidrolojik omurgasını, yüksek dağlardan doğup Kezer ve Başur çaylarıyla birleşen Botan Çayı oluşturur; nehir batıya yönelerek Dicle Nehri'ne katılır. Sarp dağlık alanların baskın olduğu ilde sınırlı alüvyal düzlüklerden biri olan Kurtalan Ovası, tarımsal üretimin yoğunlaştığı alandır.",
    after:
      "İlin su ağının omurgasını, yüksek dağlardan doğup Kezer ve Başur çaylarıyla birleşen Botan Çayı oluşturur; nehir batıya yönelerek Dicle Nehri'ne katılır. Sarp dağlık alanların baskın olduğu ilde sınırlı alüvyal düzlüklerden biri olan Kurtalan Ovası, tarımsal üretimin yoğunlaştığı alandır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '63',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Şanlıurfa, Arap Platformu'nun kuzey basamağını oluşturan ve ortalama 500-600 metre rakımda uzanan geniş bir plato üzerinde yer alır. Karacadağ volkanik kütlesi ile Fırat Nehri arasında kalan plato sahası güneye doğru hafif bir eğimle alçalır; Hilvan-Viranşehir hattının doğusu bazalt lavlarıyla, batı kesimi ise kireçtaşı tabakalarıyla kaplıdır.\n\nKireçtaşı arazilerinde gelişen Çaykuyu, Arat ve Tektek karstik platoları yer alır; Tektek Dağları yabani fıstık topluluklarıyla ilin doğal vejetasyonunu yansıtır. Harran, Suruç, Viranşehir, Ceylanpınar, Bozova ve Siverek ovaları bölgenin en geniş tarımsal üretim havzalarını meydana getirir.",
    after:
      "Şanlıurfa, Arap Platformu'nun kuzey basamağını oluşturan ve ortalama 500-600 metre rakımda uzanan geniş bir plato üzerinde yer alır. Karacadağ volkanik kütlesi ile Fırat Nehri arasında kalan plato sahası güneye doğru hafif bir eğimle alçalır; Hilvan-Viranşehir hattının doğusu bazalt lavlarıyla, batı kesimi ise kireçtaşı tabakalarıyla kaplıdır.\n\nKireçtaşı arazilerinde gelişen Çaykuyu, Arat ve Tektek karstik platoları yer alır; Tektek Dağları yabani fıstık topluluklarıyla ilin doğal bitki örtüsünü yansıtır. Harran, Suruç, Viranşehir, Ceylanpınar, Bozova ve Siverek ovaları bölgenin en geniş tarımsal üretim havzalarını meydana getirir.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '63',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "İlin batı sınırını çizen Fırat Nehri, GAP yatırımlarıyla Türkiye'nin en büyük enerji ve sulama havzasına dönüştürülmüştür. Nehir üzerindeki 817 km² göl alanı ve 48,5 milyar m³ su hacmine sahip Atatürk Barajı, 169 metre gövde yüksekliği ve 2.400 MW kurulu gücüyle sistemin merkezidir. Baraj gölünün aşağısında Fırat vadisi boyunca Birecik ve Karkamış barajları akışı kademeli olarak düzenler.\n\nAtatürk Barajı rezervuarından alınan su, 26,4 kilometre uzunluğundaki ikiz Urfa Tünelleri ile Harran Ovası'na akıtılmaktadır. 9 Kasım 1994'te işletmeye alınan tünel sistemi, 358.000 hektarı cazibeyle, 118.000 hektarı pompajla olmak üzere toplam 476.000 hektar tarım arazisini suyla buluşturur.",
    after:
      "İlin batı sınırını çizen Fırat Nehri, GAP yatırımlarıyla Türkiye'nin en büyük enerji ve sulama havzasına dönüştürülmüştür. Nehir üzerindeki 817 km² göl alanı ve 48,5 milyar m³ su hacmine sahip Atatürk Barajı, 169 metre gövde yüksekliği ve 2.400 MW kurulu gücüyle sistemin merkezidir. Baraj gölünün aşağısında Fırat vadisi boyunca Birecik ve Karkamış barajları akışı kademeli olarak düzenler.\n\nAtatürk Barajı rezervuarından alınan su, 26,4 kilometre uzunluğundaki ikiz Urfa Tünelleri ile Harran Ovası'na akıtılmaktadır. 9 Kasım 1994'te işletmeye alınan tünel sistemi, 358.000 hektarı kendi akışıyla (cazibeyle), 118.000 hektarı pompayla olmak üzere toplam 476.000 hektar tarım arazisini suyla buluşturur.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '73',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      'Şırnak yeryüzü şekilleri batıdan doğuya doğru keskin bir morfolojik tezat sergiler. Batıdaki Cizre ve Silopi çöküntü alanları 400-550 metre rakımlı alçak düzlüklerden oluşurken, merkezden itibaren doğuya doğru Uludere ve Beytüşşebap kesimi 1.000 metreyi aşan sarp ve kayalık dağ kütlelerine dönüşür. Elips biçimindeki Cudi Dağı, 2.000 metrenin üzerinde dört doruğa sahip olup 2.114 metreye ulaşır; Gabar, Namaz ve Altın dağları bu engebeli kuşağı tamamlar.',
    after:
      "Şırnak'ın yeryüzü şekilleri batıdan doğuya doğru keskin bir karşıtlık gösterir. Batıdaki Cizre ve Silopi çöküntü alanları 400-550 metre rakımlı alçak düzlüklerden oluşurken, merkezden itibaren doğuya doğru Uludere ve Beytüşşebap kesimi 1.000 metreyi aşan sarp ve kayalık dağ kütlelerine dönüşür. Elips biçimindeki Cudi Dağı, 2.000 metrenin üzerinde dört doruğa sahip olup 2.114 metreye ulaşır; Gabar, Namaz ve Altın dağları bu engebeli kuşağı tamamlar.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '73',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      'İlin tüm akarsu şebekesi Dicle Nehri havzasına boşalır. Kızılsu, Hezil ve sınır çizen Habur çayı yüksek dağlık vadilerden hızla akarak güneydeki ovalarda Dicle ile birleşir. Sarp topoğrafya ve derin kanyonlar, hidroelektrik potansiyeli yüksek taşkın rejimli akarsu vadileri oluşturur.',
    after:
      'İlin tüm akarsu şebekesi Dicle Nehri havzasına boşalır. Kızılsu, Hezil ve sınır çizen Habur çayı yüksek dağlık vadilerden hızla akarak güneydeki ovalarda Dicle ile birleşir. Sarp arazi ve derin kanyonlar, taşkına yatkın ve hidroelektrik üretimine çok elverişli akarsu vadileri oluşturur.',
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '48',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Muğla'nın engebeli kıyı çizgisi iki süreçle biçimlenmiştir: kıyıya yakın kesimde, Akdeniz'e özgü kıyıya paralel dağ uzanımı yerini Batı Anadolu'ya özgü kıyıya dik uzanıma bırakır; buna ek olarak Üçüncü Zaman sonu ile Dördüncü Zaman'daki yoğun tektonik hareketler, çökme ve yükselmelerle yeni koy ve burunlar oluşturmuştur. Fethiye-Katrancı, Göcek ve Datça çevresindeki koylar bu sürecin en belirgin örnekleridir; dağ sıraları yer yer doğrudan denize iner.\n\nİl toprakları, Toros kıvrım sistemi ile Batı Anadolu kıvrım sisteminin üst üste bindiği kireçtaşı ağırlıklı, karstik bir arazidir; bu geçirimli yapı yüzeysel akarsu gelişimini sınırlar. Boncuk Dağları, Sandras (Çiçekbaba) Dağı ve Akdağlar ilin başlıca yükseltileridir; en yüksek nokta konusunda kaynaklar arasında kesin bir mutabakat yoktur, Antalya sınırındaki Akdağlar kütlesinde 3.000 metreyi aşan zirveler bildirilir.",
    after:
      "Muğla'nın engebeli kıyı çizgisi iki süreçle biçimlenmiştir: kıyıya yakın kesimde, Akdeniz'e özgü kıyıya paralel dağ uzanımı yerini Batı Anadolu'ya özgü kıyıya dik uzanıma bırakır; buna ek olarak Üçüncü Zaman sonu ile Dördüncü Zaman'daki yoğun tektonik hareketler, çökme ve yükselmelerle yeni koy ve burunlar oluşturmuştur. Fethiye-Katrancı, Göcek ve Datça çevresindeki koylar bu sürecin en belirgin örnekleridir; dağ sıraları yer yer doğrudan denize iner.\n\nİl toprakları, Toros kıvrım sistemi ile Batı Anadolu kıvrım sisteminin üst üste bindiği kireçtaşı ağırlıklı, karstik bir arazidir; suyu içine geçiren bu yapı, yüzeydeki akarsuların gelişimini sınırlar. Boncuk Dağları, Sandras (Çiçekbaba) Dağı ve Akdağlar ilin başlıca yükseltileridir; en yüksek nokta konusunda kaynaklar arasında kesin bir mutabakat yoktur, Antalya sınırındaki Akdağlar kütlesinde 3.000 metreyi aşan zirveler bildirilir.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '48',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "İl topraklarının kalkerli, karstik yapısı yüzeysel akarsu ağının gelişimini sınırlar; Muğla İl Çevre Durum Raporu'na göre ilin başlıca üç akarsuyu Çine Çayı, Eşen Çayı ve Dalaman Çayı'dır. Boncuk Dağları'nın kuzey yamaçlarından doğan Dalaman Çayı, 190 kilometrelik toplam uzunluğunun 65 kilometresini Muğla sınırları içinde kat eder; Akdağlar'dan beslenen Eşen Çayı ise 128 kilometrelik uzunluğunun 80 kilometresini il topraklarında geçirir ve Saklıkent Kanyonu'ndaki karstik kaynaklarla beslenir.\n\nDalaman Çayı üzerindeki Akköprü Barajı, 1995-2012 arasında inşa edilmiş, 384,5 milyon m³ rezervuar hacmiyle, elektrik üretim kapasitesi bakımından Türkiye'nin altıncı büyük barajıdır; sulama, enerji üretimi ve taşkın koruması amacıyla işletilir. Milas ilçesindeki Geyik Barajı ise Yeniköy Termik Santrali'ne soğutma suyu sağlamanın yanında Bodrum Yarımadası'nın içme suyu ihtiyacının bir bölümünü karşılar.\n\nİlin en büyük doğal gölü olan Köyceğiz Gölü, dar bir kanalla Akdeniz'e bağlı bir haliç gölüdür; 1988'de özel çevre koruma bölgesi ilan edilmiştir. Gölü denize bağlayan Dalyan Kanalı kıyısındaki İztuzu Kumsalı, deniz kaplumbağalarının (Caretta caretta) önemli yumurtlama alanlarından biridir.",
    after:
      "İl topraklarının kalkerli, karstik yapısı yüzeydeki akarsu ağının gelişimini sınırlar; Muğla İl Çevre Durum Raporu'na göre ilin başlıca üç akarsuyu Çine Çayı, Eşen Çayı ve Dalaman Çayı'dır. Boncuk Dağları'nın kuzey yamaçlarından doğan Dalaman Çayı, 190 kilometrelik toplam uzunluğunun 65 kilometresini Muğla sınırları içinde kat eder; Akdağlar'dan beslenen Eşen Çayı ise 128 kilometrelik uzunluğunun 80 kilometresini il topraklarında geçirir ve Saklıkent Kanyonu'ndaki karstik kaynaklarla beslenir.\n\nDalaman Çayı üzerindeki Akköprü Barajı, 1995-2012 arasında inşa edilmiş, 384,5 milyon m³ baraj gölü hacmiyle, elektrik üretim kapasitesi bakımından Türkiye'nin altıncı büyük barajıdır; sulama, enerji üretimi ve taşkın koruması amacıyla işletilir. Milas ilçesindeki Geyik Barajı ise Yeniköy Termik Santrali'ne soğutma suyu sağlamanın yanında Bodrum Yarımadası'nın içme suyu ihtiyacının bir bölümünü karşılar.\n\nİlin en büyük doğal gölü olan Köyceğiz Gölü, dar bir kanalla Akdeniz'e bağlı bir haliç gölüdür; 1988'de özel çevre koruma bölgesi ilan edilmiştir. Gölü denize bağlayan Dalyan Kanalı kıyısındaki İztuzu Kumsalı, deniz kaplumbağalarının (Caretta caretta) önemli yumurtlama alanlarından biridir.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '01',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Adana'nın su ağı, ilin ortasından geçerek Akdeniz'e dökülen Seyhan ve Ceyhan nehirlerine dayanır. Seyhan Nehri, Kayseri'nin Uzunyayla bölgesinde doğar ve son 30 kilometrelik bölümünde Adana-Mersin il sınırını çizer. Ceyhan Nehri ise 509 kilometre uzunluğuyla bölgenin en uzun akarsuyudur; Kahramanmaraş'ta doğar, Adana'nın doğusundan geçerek Akdeniz'e ulaşır.\n\nŞehir merkezinin hemen kuzeyinde yer alan Seyhan Barajı, 8 Nisan 1956'da hizmete giren ve yaklaşık 850 bin dekar araziyi sulayan bir toprak dolgu barajdır; aynı zamanda Adana'yı Seyhan'ın taşkınlarından korur. Çatalan Barajı ise ASKİ'nin Çatalan İçme Suyu Projesi'nin ana kaynağıdır ve kentin içme suyu ihtiyacının büyük bölümünü karşılar.\n\nİlin güney kıyısında Akyatan ve Tuzla gibi kıyı gölleri (lagünler) yer alır. Akyatan Gölü, deniz kaplumbağalarının yumurtlama alanlarından biridir; göl ile Akdeniz arasında kalan yaklaşık 2.500 hektarlık kumul alan 1960'lardan bu yana ağaçlandırılmaktadır.",
    after:
      "Adana'nın su ağı, ilin ortasından geçerek Akdeniz'e dökülen Seyhan ve Ceyhan nehirlerine dayanır. 560 kilometrelik Seyhan Nehri, Kayseri'nin Uzunyayla bölgesinde doğar ve son 30 kilometrelik bölümünde Adana-Mersin il sınırını çizer. Ceyhan Nehri ise 509 kilometre uzunluğuyla bölgenin Seyhan'dan sonra en uzun ikinci akarsuyudur; Kahramanmaraş'ta doğar, Adana'nın doğusundan geçerek Akdeniz'e ulaşır.\n\nŞehir merkezinin hemen kuzeyinde yer alan Seyhan Barajı, 8 Nisan 1956'da hizmete giren ve yaklaşık 850 bin dekar araziyi sulayan bir toprak dolgu barajdır; aynı zamanda Adana'yı Seyhan'ın taşkınlarından korur. Çatalan Barajı ise ASKİ'nin Çatalan İçme Suyu Projesi'nin ana kaynağıdır ve kentin içme suyu ihtiyacının büyük bölümünü karşılar.\n\nİlin güney kıyısında Akyatan ve Tuzla gibi kıyı gölleri (lagünler) yer alır. Akyatan Gölü, deniz kaplumbağalarının yumurtlama alanlarından biridir; göl ile Akdeniz arasında kalan yaklaşık 2.500 hektarlık kumul alan 1960'lardan bu yana ağaçlandırılmaktadır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '46',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Kahramanmaraş, kuzeyi Güneydoğu Toroslar'ın uzantılarıyla kaplı, güneyi Maraş Ovası'na açılan bir geçiş bölgesidir; il merkezi 568 metre rakımdadır. İl merkezinin hemen kuzeyinde yükselen Ahır Dağı (2.301 m), kuzeydoğusunda Engizek Dağı, kuzeyinde ise Nurhak ve Binboğa dağları ilin başlıca yükseltileridir; il sınırları içindeki en yüksek nokta, Elbistan ve Nurhak ilçeleri arasındaki 3.090 metrelik Nurhak Dağı'dır. Kuzeyde, Nurhak, Binboğa, Engizek ve Berit dağları arasında kalan Elbistan Ovası, ilin bir diğer geniş tarım alanıdır.\n\nAFAD'ın deprem raporuna göre, 6 Şubat 2023'teki iki büyük depremin merkez üssü de Kahramanmaraş sınırları içindeydi: sabah 04.17'de Pazarcık ilçesinde Mw 7,7, öğleden sonra 13.24'te ise Elbistan ilçesinde Mw 7,6 büyüklüğünde iki deprem meydana geldi. Depremler Doğu Anadolu Fay Hattı'nın farklı segmentlerinde gerçekleşti: Pazarcık depremi, sol yanal doğrultu atımlı Ölüdeniz Fay Zonu'nun kuzey ucundaki Narlı Segmenti'nde; Elbistan depremi ise faydan ayrılan bir kol olan Çardak Fayı üzerinde. İl, komşu Hatay ile birlikte depremlerden en ağır hasar gören iki il arasında yer aldı.",
    after:
      "Kahramanmaraş, kuzeyi Güneydoğu Toroslar'ın uzantılarıyla kaplı, güneyi Maraş Ovası'na açılan bir geçiş bölgesidir; il merkezi 568 metre rakımdadır. İl merkezinin hemen kuzeyinde yükselen Ahır Dağı (2.301 m), kuzeydoğusunda Engizek Dağı, kuzeyinde ise Nurhak ve Binboğa dağları ilin başlıca yükseltileridir; il sınırları içindeki en yüksek nokta, Elbistan ve Nurhak ilçeleri arasındaki 3.090 metrelik Nurhak Dağı'dır. Kuzeyde, Nurhak, Binboğa, Engizek ve Berit dağları arasında kalan Elbistan Ovası, ilin bir diğer geniş tarım alanıdır.\n\nAFAD'ın deprem raporuna göre, 6 Şubat 2023'teki iki büyük depremin merkez üssü de Kahramanmaraş sınırları içindeydi: sabah 04.17'de Pazarcık ilçesinde Mw 7,7, öğleden sonra 13.24'te ise Elbistan ilçesinde Mw 7,6 büyüklüğünde iki deprem meydana geldi. Depremler Doğu Anadolu Fay Hattı'nın farklı kesimlerinde gerçekleşti: Pazarcık depremi, sol yanal doğrultu atımlı Ölüdeniz Fay Zonu'nun kuzey ucundaki Narlı Segmenti'nde; Elbistan depremi ise faydan ayrılan bir kol olan Çardak Fayı üzerinde. İl, komşu Hatay ile birlikte depremlerden en ağır hasar gören iki il arasında yer aldı.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '57',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Sinop kent merkezinin kurulduğu Boztepe Burnu'nda üst Kretase yaşlı volkanik kayaçlar bulunur; Sinop Körfezi, karayla önündeki bir adanın birleşmesiyle oluşmuş bir tombolodur. İlin en kuzeyindeki İnceburun Yarımadası ise bataklık, göl ve düz arazilerden oluşan alçak bir kıyı şerididir.",
    after:
      "Sinop kent merkezinin kurulduğu Boztepe Burnu'nda üst Kretase (İkinci Zaman'ın sonu) yaşlı volkanik kayaçlar bulunur; Sinop Körfezi, karayla önündeki bir adanın birleşmesiyle oluşmuş bir tombolodur. İlin en kuzeyindeki İnceburun Yarımadası ise bataklık, göl ve düz arazilerden oluşan alçak bir kıyı şerididir.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '81',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Düzce Ovası, komşu Hendek Ovası'ndan (Sakarya) 250-300 metrelik bir sırtla ayrılır; bu çöküntü alanı neotektonik dönemde şekillenmiştir. Havzayı güneyden çevreleyen Elmacık Dağı kütlesi, Kuvaterner döneminde Kuzey Anadolu Fayı ile Düzce Fayı arasında yükselmiştir.",
    after:
      "Düzce Ovası, komşu Hendek Ovası'ndan (Sakarya) 250-300 metrelik bir sırtla ayrılır; bu çöküntü alanı jeolojik açıdan yakın dönemdeki yer kabuğu hareketleriyle şekillenmiştir. Havzayı güneyden çevreleyen Elmacık Dağı kütlesi, Kuvaterner döneminde (Dördüncü Zaman) Kuzey Anadolu Fayı ile Düzce Fayı arasında yükselmiştir.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '81',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Düzce, Kuzey Anadolu Fay zonunun kuzey kolu üzerinde yer alır; 12 Kasım 1999'da Mw 7,2 büyüklüğünde bir deprem, 17 Ağustos 1999 Gölcük depreminden 87 gün sonra ilin altındaki fay hattının doğu kesimini kırmıştır. İl, Bolu ve Zonguldak'ın yanı sıra Sakarya (Marmara Bölgesi) ile de komşudur — Karadeniz ile Marmara arasındaki geçiş konumunu yansıtan bir sınır ilidir.",
    after:
      "Düzce, Kuzey Anadolu Fay kuşağının kuzey kolu üzerinde yer alır; 12 Kasım 1999'da Mw 7,2 büyüklüğünde bir deprem, 17 Ağustos 1999 Gölcük depreminden 87 gün sonra ilin altındaki fay hattının doğu kesimini kırmıştır. İl, Bolu ve Zonguldak'ın yanı sıra Sakarya (Marmara Bölgesi) ile de komşudur — Karadeniz ile Marmara arasındaki geçiş konumunu yansıtan bir sınır ilidir.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '14',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Abant Gölü'nün dışında ilin su varlığı, Köroğlu ve Abant dağlarından inen kısa akarsu ağıyla sınırlıdır; bu dereler Sakarya Nehri havzasına bağlanır. Gölün kendisi dışa akışı olmayan kapalı bir havza karakterindedir.",
    after:
      "Abant Gölü'nün dışında ilin su varlığı, Köroğlu ve Abant dağlarından inen kısa akarsu ağıyla sınırlıdır; bu dereler Sakarya Nehri havzasına bağlanır. Gölün kendisi dışa akışı olmayan kapalı bir havzadır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '04',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "İlin yeryüzü şekillerini Doğu Anadolu'nun genç volkanik kütleleri belirler. Kuzeydoğuda yükselen Ağrı Dağı, ana zirve Büyük Ağrı ile güneydoğusundaki 3.896 metrelik Küçük Ağrı konisinden oluşan bileşik bir stratovolkandır. Büyük Ağrı doruğunda yaklaşık 10 km²'lik takke buzulu yer alır ve kalıcı kar sınırı 4.300 metreden başlar. İlin güneyinde Tendürek Dağı volkanik kalkanı uzanırken, batıda Murat Nehri boyunca açılan geniş vadi düzlükleri ve çöküntü alanları yer alır.",
    after:
      "İlin yeryüzü şekillerini Doğu Anadolu'nun genç volkanik kütleleri belirler. Kuzeydoğuda yükselen Ağrı Dağı, ana zirve Büyük Ağrı ile güneydoğusundaki 3.896 metrelik Küçük Ağrı konisinden oluşan bileşik bir tabakalı volkandır. Büyük Ağrı doruğunda yaklaşık 10 km²'lik takke buzulu yer alır ve kalıcı kar sınırı 4.300 metreden başlar. İlin güneyinde Tendürek Dağı kalkan volkanı uzanırken, batıda Murat Nehri boyunca açılan geniş vadi düzlükleri ve çöküntü alanları yer alır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '04',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Ağrı, 5.137 metrelik doruğuyla Türkiye'nin ve Avrupa kıtasının çatısı sayılan Ağrı Dağı'nın gölgesinde, Murat ve Aras havzalarının su bölümü çizgisinde kuruludur. Doğubayazıt'taki tarihi İshak Paşa Sarayı ve Gürbulak Sınır Kapısı ile Kafkaslar ve Orta Asya'ya açılan il, kış turizmi, yüksek irtifa dağcılığı ve sınır ticareti açısından stratejik bir konumdadır.",
    after:
      "Ağrı, 5.137 metrelik doruğuyla Türkiye'nin çatısı sayılan Ağrı Dağı'nın gölgesinde, Murat ve Aras havzalarının su bölümü çizgisinde kuruludur. Doğubayazıt'taki tarihi İshak Paşa Sarayı ve Gürbulak Sınır Kapısı ile Kafkaslar ve Orta Asya'ya açılan il, kış turizmi, yüksek irtifa dağcılığı ve sınır ticareti açısından stratejik bir konumdadır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '12',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "İlin topoğrafyasını doğuda Bingöl Dağları (3.250 m), batıda ise Şerafettin Dağları ile Akçakara Dağları kuşatır. Karlıova Havzası, KAF, DAF ve Varto fay zonlarının kesiştiği tektonik bir çöküntü alanıdır. Yüksek platolarda buzul aşındırması sonucu oluşmuş çok sayıda sirk gölü bulunurken, Solhan ilçesindeki Turnalar Gölü'nde rüzgârla yer değiştiren doğal yüzen adalar morfolojik bir nadirliğe işaret eder.",
    after:
      "İlin topoğrafyasını doğuda Bingöl Dağları (3.250 m), batıda ise Şerafettin Dağları ile Akçakara Dağları kuşatır. Karlıova Havzası, KAF, DAF ve Varto fay kuşaklarının kesiştiği tektonik bir çöküntü alanıdır. Yüksek platolarda buzul aşındırması sonucu oluşmuş çok sayıda sirk gölü bulunurken, Solhan ilçesindeki Turnalar Gölü'nde rüzgârla yer değiştiren doğal yüzen adalar, doğada ender görülen bir oluşumdur.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '12',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Bingöl Dağları'ndan beslenen Peri Suyu, Karlıova'nın kuzeybatısından çıkarak Bingöl ile Tunceli arasındaki doğal il sınırını çizer ve Fırat sistemine katılır. İlin güneyini drene eden Göynük Suyu ve Murat Nehri kolları üzerinde kurulan hidroelektrik barajları, derin vadiler boyunca hem taşkın kontrolü sağlar hem de bölgesel enerji üretimine yüksek katkı sunar.",
    after:
      "Bingöl Dağları'ndan beslenen Peri Suyu, Karlıova'nın kuzeybatısından çıkarak Bingöl ile Tunceli arasındaki doğal il sınırını çizer ve Fırat sistemine katılır. İlin güneyinin sularını toplayan Göynük Suyu ve Murat Nehri kolları üzerinde kurulan hidroelektrik barajları, derin vadiler boyunca hem taşkın kontrolü sağlar hem de bölgesel enerji üretimine yüksek katkı sunar.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '13',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Bitlis toprakları dört ana jeomorfolojik birimden oluşur: kuzeyde Ahlat volkanik tüf platosu, hemen güneyinde 2.935 metrelik Nemrut Stratovolkanı, ortada Muş-Tatvan çöküntü oluğu ve güneyde paleozoik şistlerden oluşan sarp Bitlis Masifi. Nemrut kalderası, 1441'deki son püskürme ürünü lav ve tüf setleriyle Van Gölü ile Muş Ovası arasındaki doğal su havzalarını birbirinden kalıcı olarak ayırmıştır.",
    after:
      "Bitlis toprakları dört ana yer şekli biriminden oluşur: kuzeyde Ahlat volkanik tüf platosu, hemen güneyinde 2.935 metrelik Nemrut Stratovolkanı, ortada Muş-Tatvan çöküntü oluğu ve güneyde Paleozoik (Birinci Zaman) şistlerden oluşan sarp Bitlis Masifi. Nemrut kalderası, 1441'deki son püskürme ürünü lav ve tüf setleriyle Van Gölü ile Muş Ovası arasındaki doğal su havzalarını birbirinden kalıcı olarak ayırmıştır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '13',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Nemrut volkanik kütlesinin zirve kalderasında, dünyanın ikinci büyük kaldera gölü olan tatlı sulu Nemrut Gölü ile sıcak su kaynakları içeren Ilıgöl yer alır; volkanın kuzeyinde ise lav setti gölü Nazik Gölü uzanır. İl toprakları hidrografik bir su bölümü hattıdır: kuzeydeki akarsular sodalı Van Gölü Kapalı Havzası'na yönelirken, merkezden güneye süzülen Bitlis Çayı Dicle Nehri aracılığıyla Basra Körfezi'ne dökülür.",
    after:
      "Nemrut volkanik kütlesinin zirve kalderasında, dünyanın ikinci büyük kaldera gölü olan tatlı sulu Nemrut Gölü ile sıcak su kaynakları içeren Ilıgöl yer alır; volkanın kuzeyinde ise lav setti gölü Nazik Gölü uzanır. İl toprakları, suları iki ayrı yöne ayıran bir su bölümü hattıdır: kuzeydeki akarsular sodalı Van Gölü Kapalı Havzası'na yönelirken, merkezden güneye süzülen Bitlis Çayı Dicle Nehri aracılığıyla Basra Körfezi'ne dökülür.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '23',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "İl topoğrafyası, Güneydoğu Toroslar'ın kolları olan Mastar, Hasan Dağı ve Kömürhan sırtları ile bu kütleler arasına yerleşmiş Uluova, Palu ve Karakoçan çöküntü ovalarından oluşur. İl merkezinin güneydoğusundaki 1.248 metre rakımlı Hazar Gölü, Doğu Anadolu Fayı'nın açılma havzasında oluşmuş 22 kilometre uzunluğunda tektonik bir çanaktır.",
    after:
      "İl topoğrafyası, Güneydoğu Toroslar'ın kolları olan Mastar, Hasan Dağı ve Kömürhan sırtları ile bu kütleler arasına yerleşmiş Uluova, Palu ve Karakoçan çöküntü ovalarından oluşur. İl merkezinin güneydoğusundaki 1.248 metre rakımlı Hazar Gölü, Doğu Anadolu Fayı boyunca yer kabuğunun açılmasıyla oluşmuş 22 kilometre uzunluğunda tektonik bir çanaktır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '23',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Fırat Nehri'nin ana gövdesi üzerinde 1974-1981 arasında devreye alınan Keban Barajı, 1.330 MW kurulu gücü ve yıllık 6,6 milyar kWh elektrik üretimiyle Türkiye'nin en stratejik enerji kaynaklarındandır; Murat vadisi boyunca 125 kilometre uzanan yapay rezervuarı bölgenin mikroklimasını yumuşatmıştır. Hazar Gölü'nden çıkan sular ise Behremaz Deresi üzerinden Dicle Nehri'nin ana kollarından birini besleyerek ilin hem Fırat hem Dicle havzasıyla hidrografik bağ kurmasını sağlar.",
    after:
      "Fırat Nehri'nin ana gövdesi üzerinde 1974-1981 arasında devreye alınan Keban Barajı, 1.330 MW kurulu gücü ve yıllık 6,6 milyar kWh elektrik üretimiyle Türkiye'nin en stratejik enerji kaynaklarındandır; Murat vadisi boyunca 125 kilometre uzanan yapay baraj gölü bölgenin yerel iklimini yumuşatmıştır. Hazar Gölü'nden çıkan sular ise Behremaz Deresi üzerinden Dicle Nehri'nin ana kollarından birini besleyerek ilin hem Fırat hem Dicle havzasıyla su bağı kurmasını sağlar.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '24',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ortalama 1.200 metre irtifadaki Erzincan Ovası, kuzeyden Spikör ve Keşiş dağları (3.549 m), güneyden ise kireçtaşından sarp Munzur Dağları (3.300 m) ile çevrelenmiş kapalı bir çöküntü çanağıdır. KAF'ın ana segmentinde yer alan bu zonda, 27 Aralık 1939'da Kandilli Rasathanesi kayıtlarına göre 7,9 büyüklüğünde Türkiye'nin en yıkıcı depremlerinden biri yaşanmış, 32.968 kişi yaşamını yitirmiştir. Dağların ovaya kavuştuğu kesimlerde eğim kırıklıkları nedeniyle zengin traverten ve kaynak çıkışları bulunur.",
    after:
      "Ortalama 1.200 metre irtifadaki Erzincan Ovası, kuzeyden Spikör ve Keşiş dağları (3.549 m), güneyden ise kireçtaşından sarp Munzur Dağları (3.300 m) ile çevrelenmiş kapalı bir çöküntü çanağıdır. KAF'ın ana kesiminde yer alan bu kuşakta, 27 Aralık 1939'da Kandilli Rasathanesi kayıtlarına göre 7,9 büyüklüğünde Türkiye'nin en yıkıcı depremlerinden biri yaşanmış, 32.968 kişi yaşamını yitirmiştir. Dağların ovaya kavuştuğu kesimlerde eğim kırıklıkları nedeniyle zengin traverten ve kaynak çıkışları bulunur.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '24',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Fırat Nehri'nin en büyük kaynak kolu olan Karasu, Erzurum platolarından gelerek Erzincan Ovası'nı doğudan batıya sular ve Kemah Boğazı'nda kanyonlar yararak güneye yönelir. Çayırlı Ovası ile Tercan Baraj Gölü çevresindeki sulama ağları, ova tabanındaki tahıl, şekerpancarı ve bağcılık üretiminin kesintisiz sürmesini temin eder.",
    after:
      "Fırat Nehri'nin en büyük kaynak kolu olan Karasu, Erzurum platolarından gelerek Erzincan Ovası'nı doğudan batıya sular ve Kemah Boğazı'nda kanyonlar yararak güneye yönelir. Çayırlı Ovası ile Tercan Baraj Gölü çevresindeki sulama ağları, ova tabanındaki tahıl, şekerpancarı ve bağcılık üretiminin kesintisiz sürmesini sağlar.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '25',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      'Erzurum arazisi, ortalama 2.000 metre yükseltideki geniş bazalt platolar ile bu platoları yaran Erzurum ve Pasinler tektonik çöküntü ovalarından meydana gelir. Kentin hemen güneyinde 70 kilometre boyunca uzanan Palandöken Dağları, 3.176 metrelik Büyük Ejder Tepesi ile uluslararası kış turizminin merkezidir. Kuzeyde Kargapazarı, Dumlu ve Mescit dağları, kuzeydoğuda ise Allahuekber Dağları ilin morfolojik sınırlarını belirler.',
    after:
      'Erzurum arazisi, ortalama 2.000 metre yükseltideki geniş bazalt platolar ile bu platoları yaran Erzurum ve Pasinler tektonik çöküntü ovalarından meydana gelir. Kentin hemen güneyinde 70 kilometre boyunca uzanan Palandöken Dağları, 3.176 metrelik Büyük Ejder Tepesi ile uluslararası kış turizminin merkezidir. Kuzeyde Kargapazarı, Dumlu ve Mescit dağları, kuzeydoğuda ise Allahuekber Dağları ilin doğal sınırlarını çizer.',
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '25',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Erzurum, 1.860 metreyi bulan şehir merkezi irtifasıyla Türkiye'nin en yüksek rakımlı büyükşehiridir. Kuzeydoğu Anadolu'nun tarihi ipek yolu kavşağında yer alan kent, dokuz ayrı ille komşu olarak ülkenin en çok komşuya sahip ili konumundadır. Palandöken Dağları'ndaki kış sporları merkezleri, Atatürk Üniversitesi ile gelişen eğitim altyapısı ve yayla hayvancılığı ilin temel sosyoekonomik omurgasını oluşturur.",
    after:
      "Erzurum, 1.860 metreyi bulan şehir merkezi irtifasıyla Türkiye'nin en yüksek rakımlı büyükşehiridir. Kuzeydoğu Anadolu'nun tarihi ipek yolu kavşağında yer alan kent, dokuz ayrı ille komşu olarak Konya ve Erzincan ile birlikte ülkenin en çok komşuya sahip illerindendir. Palandöken Dağları'ndaki kış sporları merkezleri, Atatürk Üniversitesi ile gelişen eğitim altyapısı ve yayla hayvancılığı ilin ekonomik ve toplumsal omurgasını oluşturur.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '25',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "İl toprakları üç ayrı deniz havzasına su gönderen kritik bir hidrografik su bölümü merkezidir. Dumlu Dağları'ndan doğan Karasu batıya yönelerek Fırat Nehri üzerinden Basra Körfezi'ne, Tekman yaylalarından çıkan Aras Nehri doğuya akarak Hazar Denizi'ne, İspir ve Tortum vadilerini aşan sular ise Çoruh Nehri aracılığıyla Karadeniz'e ulaşır. Tortum Çayı üzerindeki Tortum Gölü ve 48 metreden dökülen doğal çağlayan, heyelan set oluşumuyla bölgenin önemli bir peyzaj unsurudur.",
    after:
      "İl toprakları üç ayrı deniz havzasına su gönderen kritik bir su bölümü merkezidir. Dumlu Dağları'ndan doğan Karasu batıya yönelerek Fırat Nehri üzerinden Basra Körfezi'ne, Tekman yaylalarından çıkan Aras Nehri doğuya akarak Hazar Denizi'ne, İspir ve Tortum vadilerini aşan sular ise Çoruh Nehri aracılığıyla Karadeniz'e ulaşır. Tortum Çayı üzerindeki Tortum Gölü ve 48 metreden dökülen doğal çağlayan, heyelan set oluşumuyla bölgenin önemli doğal manzaralarındandır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '30',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Güneydoğu Toroslar'ın en sarp kesimini oluşturan Hakkari morfolojisinde, 4.168 metreyle Türkiye'nin ikinci en yüksek doruğu olan Uludoruk'un (Reşko) yer aldığı Cilo-Sat Dağları kütlesi egemendir. Buzul Çağı'ndan kalan aktif vadi buzulları, sirk gölleri ve moren setleriyle biçimlenen dağ silsilesi; Gare (3.460 m), Beridalo (3.250 m) ve Sat dağlarıyla çevrilidir. Yüksek dağların arasına sıkışan dar çöküntü koridorları, yerleşme ve ulaşımı zorunlu olarak vadilere hapsetmiştir.",
    after:
      "Güneydoğu Toroslar'ın en sarp kesimini oluşturan Hakkari'nin yer şekillerinde, 4.168 metreyle Türkiye'nin ikinci en yüksek doruğu olan Uludoruk'un (Reşko) yer aldığı Cilo-Sat Dağları kütlesi egemendir. Buzul Çağı'ndan kalan aktif vadi buzulları, sirk gölleri ve moren setleriyle biçimlenen dağ silsilesi; Gare (3.460 m), Beridalo (3.250 m) ve Sat dağlarıyla çevrilidir. Yüksek dağların arasına sıkışan dar çöküntü koridorları, yerleşme ve ulaşımı zorunlu olarak vadilere hapsetmiştir.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '30',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Cilo ve Sat dağlarının eriyen buzul ve kar sularıyla beslenen akarsu ağı, Dicle Nehri'nin ana kolu olan Büyük Zap Suyu'nda toplanır. Sarp kireçtaşı katmanlarını yararak kilometrelerce uzanan kanyonlar oluşturan Zap Suyu güneye akarak Irak topraklarına geçer; vadinin alçak ve korunaklı tabanlarındaki dar düzlüklerde oluşan mikroklima şartları, sınırlı da olsa çeltik, ceviz ve meyve yetiştiriciliğine imkân sağlar.",
    after:
      "Cilo ve Sat dağlarının eriyen buzul ve kar sularıyla beslenen akarsu ağı, Dicle Nehri'nin ana kolu olan Büyük Zap Suyu'nda toplanır. Sarp kireçtaşı katmanlarını yararak kilometrelerce uzanan kanyonlar oluşturan Zap Suyu güneye akarak Irak topraklarına geçer; vadinin alçak ve korunaklı tabanlarındaki dar düzlüklerde oluşan yerel iklim koşulları, sınırlı da olsa çeltik, ceviz ve meyve yetiştiriciliğine imkân sağlar.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '76',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      'Tarihte Sürmeli Çukuru adıyla bilinen Iğdır Ovası; Batı Iğdır, Doğu Iğdır ve Dil Ovası olmak üzere üç morfolojik alt kesimden oluşur. Batıda 910 metre civarındaki yükseklik doğuda Dilucu mevkiinde 795 metreye kadar iner. Ovanın hemen güneyinde gökyüzüne dikilen 5.137 metrelik Ağrı Dağı kütlesi, ovaya ulaşan kuzey ve güney rüzgârlarına karşı dev bir set oluşturarak kışların ılık, yazların kurak ve sıcak geçtiği fön etkili bir çanak iklimi doğurur.',
    after:
      'Tarihte Sürmeli Çukuru adıyla bilinen Iğdır Ovası; Batı Iğdır, Doğu Iğdır ve Dil Ovası olmak üzere üç alt kesimden oluşur. Batıda 910 metre civarındaki yükseklik doğuda Dilucu mevkiinde 795 metreye kadar iner. Ovanın hemen güneyinde gökyüzüne dikilen 5.137 metrelik Ağrı Dağı kütlesi, ovaya ulaşan kuzey ve güney rüzgârlarına karşı dev bir set oluşturarak kışların ılık, yazların kurak ve sıcak geçtiği fön etkili bir çanak iklimi doğurur.',
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '76',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Iğdır, Doğu Anadolu'nun yüksek platoları arasında 850 metre ortalama rakımıyla derin bir çöküntü oluğunda yer alan ve çevresindeki sert iklime zıt olarak pamuk, kayısı ve şeftali yetişen bir mikroklima vahasıdır. Ermenistan, Azerbaycan (Nahçıvan) ve İran ile sınır komşusu olarak üç ülkeye kapısı olan il, stratejik Dilucu Sınır Kapısı ile Kafkaslar ticaretinde kilit bir eşiktir.",
    after:
      "Iğdır, Doğu Anadolu'nun yüksek platoları arasında 850 metre ortalama rakımıyla derin bir çöküntü oluğunda yer alan ve çevresindeki sert iklime zıt olarak pamuk, kayısı ve şeftali yetişen, kendine özgü yerel iklimiyle (mikroklima) bir vahadır. Ermenistan, Azerbaycan (Nahçıvan) ve İran ile sınır komşusu olarak üç ülkeye kapısı olan il, stratejik Dilucu Sınır Kapısı ile Kafkaslar ticaretinde kilit bir eşiktir.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '36',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Kars topoğrafyası, Tersiyer volkanizması ürünü lav örtüleriyle düzleşmiş geniş platolar ve bu platoları kuşatan dağ dizilerinden oluşur. Kuzeyde Allahuekber Dağları ve Soğanlı Dağları, güneyde ise volkanik Aladağ uzantıları yer alır. Sarıkamış çevresinde yüksekliğin ve kar kalitesinin sağladığı elverişli zemin, Türkiye'nin en uzun kış turizmi sezonlarından birine ev sahipliği yapar.",
    after:
      "Kars'ın yer şekilleri, Tersiyer'de (Üçüncü Zaman) volkanik faaliyetlerle oluşan lav örtüleriyle düzleşmiş geniş platolar ve bu platoları kuşatan dağ dizilerinden oluşur. Kuzeyde Allahuekber Dağları ve Soğanlı Dağları, güneyde ise volkanik Aladağ uzantıları yer alır. Sarıkamış çevresinde yüksekliğin ve kar kalitesinin sağladığı elverişli zemin, Türkiye'nin en uzun kış turizmi sezonlarından birine ev sahipliği yapar.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '36',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      'İlin sularını Kars Çayı, Arpaçay ve Aras Nehri toplar. Soğanlı yaylalarından doğan Kars Çayı, kenti ikiye bölerek akar ve derin kanyonlar oluşturduğu Arpaçay ile birleşir. Türkiye-Ermenistan sınırını çizen Arpaçay üzerindeki Arpaçay Baraj Gölü, sınır boyunca tarımsal sulama ve taşkın önleme işlevi görür. Yaz başlarına kadar süren kar erimeleri, platolardaki alpin çayırları gürleştirerek ilin büyükbaş süt ve besi hayvancılığındaki liderliğini pekiştirir.',
    after:
      'İlin sularını Kars Çayı, Arpaçay ve Aras Nehri toplar. Soğanlı yaylalarından doğan Kars Çayı, kenti ikiye bölerek akar ve derin kanyonlar oluşturduğu Arpaçay ile birleşir. Türkiye-Ermenistan sınırını çizen Arpaçay üzerindeki Arpaçay Baraj Gölü, sınır boyunca tarımsal sulama ve taşkın önleme işlevi görür. Yaz başlarına kadar süren kar erimeleri, platolardaki yüksek dağ çayırlarını gürleştirerek ilin büyükbaş süt ve besi hayvancılığındaki liderliğini pekiştirir.',
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '44',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "İlin hidrografik can damarı Fırat Nehri ve kolları olan Tohma Çayı, Sultansuyu ve Kuruçay'dır. Fırat üzerinde kurulu dev Karakaya Baraj Gölü, ilin doğu sınırını çizerken bölgenin iklimini yumuşatır ve tatlı su balıkçılığına olanak tanır. İlkbahar aylarında eriyen dağ karlarıyla beslenen akarsu ağı, sulama kanalları vasıtasıyla ovadaki yüz binlerce dekar kayısı bahçesinin su ihtiyacını kesintisiz karşılar.",
    after:
      "İlin akarsu ağının can damarı Fırat Nehri ve kolları olan Tohma Çayı, Sultansuyu ve Kuruçay'dır. Fırat üzerinde kurulu dev Karakaya Baraj Gölü, ilin doğu sınırını çizerken bölgenin iklimini yumuşatır ve tatlı su balıkçılığına olanak tanır. İlkbahar aylarında eriyen dağ karlarıyla beslenen akarsu ağı, sulama kanalları vasıtasıyla ovadaki yüz binlerce dekar kayısı bahçesinin su ihtiyacını kesintisiz karşılar.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '49',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      'İlin hidrografik omurgasını oluşturan Murat Irmağı, ovayı boydan boya geçerek Karasu Çayı ve diğer yan dereleri toplar; batıya yönelerek Bingöl ve Elazığ üzerinden Fırat ana gövdesine kavuşur. İlkbaharda dağlardaki kar erimeleriyle taşan Murat Nehri, taban arazide doğal bir alüvyon gübrelemesi sağlarken; kurulan tahliye ve sulama kanalları ovanın tahıl, şekerpancarı, tütün ve yem bitkileri potansiyelini besler.',
    after:
      'İlin akarsu ağının omurgasını oluşturan Murat Irmağı, ovayı boydan boya geçerek Karasu Çayı ve diğer yan dereleri toplar; batıya yönelerek Bingöl ve Elazığ üzerinden Fırat ana gövdesine kavuşur. İlkbaharda dağlardaki kar erimeleriyle taşan Murat Nehri, ova tabanına bıraktığı alüvyonla toprağı doğal yoldan gübrelerken; kurulan tahliye ve sulama kanalları ovanın tahıl, şekerpancarı, tütün ve yem bitkisi üretimini besler.',
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '62',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      'İlin can damarları olan Munzur Suyu ve Pülümür Çayı, sarp boğazları aşarak kent merkezinde birleşir ve güneye akarak Keban Baraj Gölü fiyortlarına dökülür. Doğuda Bingöl sınırını çizen Peri Suyu da Fırat havzasına katılır. Soğuk ve berrak debisiyle Munzur Suyu, dünyaca ünlü Munzur alabalığına yaşam alanı sunarken, Ovacık Gözeleri ilin en önemli hidrolojik ve inanç turizmi kaynağıdır.',
    after:
      "İlin can damarları olan Munzur Suyu ve Pülümür Çayı, sarp boğazları aşarak kent merkezinde birleşir ve güneye akarak Keban Baraj Gölü'nün dar kollarına dökülür. Doğuda Bingöl sınırını çizen Peri Suyu da Fırat havzasına katılır. Soğuk ve berrak debisiyle Munzur Suyu, dünyaca ünlü Munzur alabalığına yaşam alanı sunarken, Ovacık Gözeleri ilin en önemli su ve inanç turizmi kaynağıdır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '42',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Konya toprakları, İç Anadolu'nun bozkır platosu karakterini taşıyan geniş, düz ovalardan oluşur; ilin ortalama yükseltisi 1.000-1.050 metre bandındadır. Çumra ve Ereğli ovaları, ilin en geniş tarım alanlarını oluşturur.\n\nİlin güneyinde, Toros Dağları'nın kuzey uzantıları başlar — Seydişehir, Hadim ve Taşkent ilçelerinde 2.000 metreyi aşan yükseltiler görülür. Doğuda Karapınar çevresindeki Karacadağ ve güneyde Karaman sınırındaki Karadağ volkanik kütleleri, ilin platosuna serpilmiştir. MTA, Karacadağ'ı da içine alan Karapınar volkanik alanını Türkiye'nin aktif volkanları arasında sayar; alanda Nasuhpınarı çevresinde ve Acıgöl maarında volkanik kökenli gaz çıkışları vardır.",
    after:
      "Konya toprakları, İç Anadolu'nun bozkır platosu karakterini taşıyan geniş, düz ovalardan oluşur; ilin ortalama yükseltisi 1.000-1.050 metre bandındadır. Çumra ve Ereğli ovaları, ilin en geniş tarım alanlarını oluşturur.\n\nİlin güneyinde, Toros Dağları'nın kuzey uzantıları başlar — Seydişehir, Hadim ve Taşkent ilçelerinde 2.000 metreyi aşan yükseltiler görülür. Doğuda Karapınar çevresindeki Karacadağ ve güneyde Karaman sınırındaki Karadağ volkanik kütleleri, ilin platosuna serpilmiştir. MTA, Karacadağ'ı da içine alan Karapınar volkanik alanını Türkiye'nin aktif volkanları arasında sayar; alanda Nasuhpınarı çevresinde ve Acıgöl maarında (patlamayla oluşmuş volkan çukuru) volkanik kökenli gaz çıkışları vardır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '38',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Kayseri'nin en belirgin yer şekli, kentin 25 kilometre güneybatısında yükselen Erciyes'tir. 3.917 metrelik bu stratovolkan, İç Anadolu Bölgesi'nin en yüksek noktasıdır. Yaklaşık 2,5-3 milyon yıl önce başlayan volkanik faaliyet Holosen'de de sürmüştür ve bilinen son püskürme MÖ 6880 dolaylarında gerçekleşmiştir. MTA, Erciyes'i Türkiye'nin aktif volkanları arasında sayar. Dağ bugün kayak turizmine ev sahipliği yapar.\n\nİlin geri kalanı, ortalama 1.050 metre yükseklikteki bir plato üzerindedir. Kuzeyde Sultansazlığı bataklık-göl kompleksinin çevresindeki düzlükler, güneyde ise Erciyes'in eteklerinden başlayıp Niğde sınırına uzanan step arazisi ilin diğer ana yer şekli gruplarıdır.",
    after:
      "Kayseri'nin en belirgin yer şekli, kentin 25 kilometre güneybatısında yükselen Erciyes'tir. 3.917 metrelik bu tabakalı volkan, İç Anadolu Bölgesi'nin en yüksek noktasıdır. Yaklaşık 2,5-3 milyon yıl önce başlayan volkanik faaliyet Holosen'de de sürmüştür ve bilinen son püskürme MÖ 6880 dolaylarında gerçekleşmiştir. MTA, Erciyes'i Türkiye'nin aktif volkanları arasında sayar. Dağ bugün kayak turizmine ev sahipliği yapar.\n\nİlin geri kalanı, ortalama 1.050 metre yükseklikteki bir plato üzerindedir. Kuzeyde Sultansazlığı bataklık-göl kompleksinin çevresindeki düzlükler, güneyde ise Erciyes'in eteklerinden başlayıp Niğde sınırına uzanan step arazisi ilin diğer ana yer şekli gruplarıdır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '70',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Karaman'ın yüzey suyu kaynakları sınırlıdır; ilin kuzey kesimi kapalı iç havza karakterindedir. Güneydeki Ermenek ilçesinden doğan Ermenek Çayı, Toros'un derin vadilerinden geçerek Mersin yönünde Akdeniz havzasına akar.",
    after:
      "Karaman'ın yüzey suyu kaynakları sınırlıdır; ilin kuzey kesimi denize akışı olmayan kapalı bir iç havzadır. Güneydeki Ermenek ilçesinden doğan Ermenek Çayı, Toros'un derin vadilerinden geçerek Mersin yönünde Akdeniz havzasına akar.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '53',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Rize, Türkiye'nin en yağışlı ilidir. Yıllık yağış yılın her mevsimine dağılır ve kurak bir dönem oluşturmaz; bu rejim, ilin ekonomisinin temelini oluşturan çay tarımının doğrudan doğal koşuludur. Kıyı şeridinden iç kesimlere doğru dik yamaçlar boyunca sıralanan çay bahçeleri, ilin en tanınan manzarasını oluşturur.",
    after:
      "Rize, Türkiye'nin en yağışlı ilidir. Yıllık yağış yılın her mevsimine dağılır ve kurak bir dönem oluşturmaz; bu yağış düzeni, ilin ekonomisinin temelini oluşturan çay tarımının doğrudan doğal koşuludur. Kıyı şeridinden iç kesimlere doğru dik yamaçlar boyunca sıralanan çay bahçeleri, ilin en tanınan manzarasını oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CN',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      'Çin\'in yer şekilleri, Hint levhasının Avrasya levhasına çarpmasıyla yükselen genç dağ kuşakları ile kadim kratonik havzaların birlikteliğiyle şekillenmiştir. Ülkenin güneybatısını kaplayan ve "dünyanın çatısı" olarak anılan ortalama 4.500 metre rakımlı Tibet Platosu, güney kenarında Nepal sınırındaki 8.848 metrelik Everest ile doruğa ulaşır. Platonun kuzey ve batı sınırlarında yükselen Karakurum ve Tanrı Dağları hattı, Pakistan sınırındaki 8.611 metrelik K2 Zirvesi de dahil olmak üzere gezegenin en sarp buzul kütlelerini barındırır.\n\nYüksek dağların yağış gölgesinde kalan batı içlerinde, dünyanın en büyük hareketli kum çöllerinden Taklamakan ile Tarım Havzası uzanır. İç Asya platolarından doğuya doğru inildikçe arazi belirgin biçimde alçalır; kuzeydoğudaki Mançurya Ovası ile Yangtze ve Sarı Nehir\'in bin yıllar boyunca biriktirdiği lös ve alüvyonlarla dolan geniş Kuzey Çin Ovası, ülkenin en geniş tarım alanlarını ve yerleşim merkezlerini oluşturur.',
    after:
      'Çin\'in yer şekilleri, Hint levhasının Avrasya levhasına çarpmasıyla yükselen genç dağ kuşakları ile çok eski ve sağlam kaya temeli üzerindeki (kratonik) havzaların birlikteliğiyle şekillenmiştir. Ülkenin güneybatısını kaplayan ve "dünyanın çatısı" olarak anılan ortalama 4.500 metre rakımlı Tibet Platosu, güney kenarında Nepal sınırındaki 8.849 metrelik Everest ile doruğa ulaşır. Platonun kuzey ve batı sınırlarında yükselen Karakurum ve Tanrı Dağları hattı, Pakistan sınırındaki 8.611 metrelik K2 Zirvesi de dahil olmak üzere gezegenin en sarp buzul kütlelerini barındırır.\n\nYüksek dağların yağış gölgesinde kalan batı içlerinde, dünyanın en büyük hareketli kum çöllerinden Taklamakan ile Tarım Havzası uzanır. İç Asya platolarından doğuya doğru inildikçe arazi belirgin biçimde alçalır; kuzeydoğudaki Mançurya Ovası ile Yangtze ve Sarı Nehir\'in bin yıllar boyunca biriktirdiği lös ve alüvyonlarla dolan geniş Kuzey Çin Ovası, ülkenin en geniş tarım alanlarını ve yerleşim merkezlerini oluşturur.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CN',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Kuzey-güney ekseninde 35 dereceden fazla enlem farkı ve okyanustan iç çöllere uzanan derin mesafe, ülkede tropikal kuşaktan soğuk karasal iklime uzanan çok geniş bir atmosferik çeşitlilik yaratır. Güneydoğu kıyıları ve Hainan Adası, yaz aylarında Pasifik ve Hint okyanuslarından bol nem taşıyan yaz musonunun etkisiyle yüksek sıcaklık ve şiddetli yağış alır. Kış aylarında ise karasal kökenli Sibirya yüksek basıncı tüm kuzey ve iç kesimlere kuru, dondurucu rüzgarlar yayar.\n\nKuzeydoğuda kışlar kar örtüsü altında ve çok sert geçerken, güney havzalarında subtropikal nem yıl boyunca hissedilir. Yüksek dağların nemli hava kütlelerini engellediği kuzeybatı havzalarında yıllık yağış 100 milimetrenin altına inerek kurak çöl koşullarını hakim kılar. Tibet Platosu'nda ise seyrek atmosfer ve yüksek irtifa nedeniyle yılın büyük bölümünde sıfırın altında seyreden sert bir alpin yayla iklimi hüküm sürer.",
    after:
      "Kuzey-güney ekseninde 35 dereceden fazla enlem farkı ve okyanustan iç çöllere uzanan derin mesafe, ülkede tropikal kuşaktan soğuk karasal iklime uzanan çok geniş bir iklim çeşitliliği yaratır. Güneydoğu kıyıları ve Hainan Adası, yaz aylarında Pasifik ve Hint okyanuslarından bol nem taşıyan yaz musonunun etkisiyle yüksek sıcaklık ve şiddetli yağış alır. Kış aylarında ise karasal kökenli Sibirya yüksek basıncı tüm kuzey ve iç kesimlere kuru, dondurucu rüzgarlar yayar.\n\nKuzeydoğuda kışlar kar örtüsü altında ve çok sert geçerken, güney havzalarında subtropikal nem yıl boyunca hissedilir. Yüksek dağların nemli hava kütlelerini engellediği kuzeybatı havzalarında yıllık yağış 100 milimetrenin altına inerek kurak çöl koşullarını hakim kılar. Tibet Platosu'nda ise seyrek atmosfer ve yüksek irtifa nedeniyle yılın büyük bölümünde sıfırın altında seyreden sert bir alpin yayla iklimi hüküm sürer.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'JP',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Kuzeydoğu Asya kıyıları açığında hilal biçiminde uzanan Japonya, Büyük Okyanus ile Japon Denizi arasında yer alan bir volkanik ada yay ülkesidir. Kara sınırı bulunmayan takımada; kuzeyden güneye Hokkaido, Honshu, Şikoku ve Kyushu olmak üzere dört ana adadan ve bunları çevreleyen yedi binden fazla küçük adadan oluşur.\n\nÜlkenin kalbi, Honshu Adası'nın doğusunda en geniş alüvyal düzlük olan Kanto Ovası'nda kurulu başkent Tokyo ve çevresindeki kentsel aglomerasyondur. Geniş enlem farkı ve dağlık omurga nedeniyle Japonya, kuzeydeki serin iğne yapraklı tayga kuşağından güneydeki Ryukyu Adaları'nın mercan resifli subtropikal iklimine kadar uzanan zengin bir coğrafi çeşitlilik barındırır.",
    after:
      "Kuzeydoğu Asya kıyıları açığında hilal biçiminde uzanan Japonya, Büyük Okyanus ile Japon Denizi arasında yer alan bir volkanik ada yay ülkesidir. Kara sınırı bulunmayan takımada; kuzeyden güneye Hokkaido, Honshu, Şikoku ve Kyushu olmak üzere dört ana adadan ve bunları çevreleyen 14 binden fazla küçük adadan oluşur (2023 resmi sayımına göre toplam 14.125 ada).\n\nÜlkenin kalbi, Honshu Adası'nın doğusunda en geniş alüvyal düzlük olan Kanto Ovası'nda kurulu başkent Tokyo ve onunla iç içe büyümüş çevre kentlerdir. Geniş enlem farkı ve dağlık omurga nedeniyle Japonya, kuzeydeki serin iğne yapraklı tayga kuşağından güneydeki Ryukyu Adaları'nın mercan resifli subtropikal iklimine kadar uzanan zengin bir coğrafi çeşitlilik barındırır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'JP',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Dar ve dağlık ada yapısı nedeniyle Japonya'daki akarsular, kıtadaki nehirlere kıyasla son derece kısa, dik eğimli ve hızlı akışlıdır. Japon Alpleri'nden doğup Niigata'da Japon Denizi'ne dökülen 367 kilometrelik Şinano Nehri, ülkenin en uzun akarsuyudur; dağlık kesimlerde derin kanyonlar oyan nehirler, şiddetli muson veya tayfun dönemlerinde ani taşkınlar oluşturur.\n\nTektonik ve volkanik hareketler sonucu oluşan krater ve çöküntü gölleri ülkenin tatlı su dengesinde kilit bir işleve sahiptir. Kyoto'nun kuzeydoğusundaki Şiga ilinde yer alan 670 kilometrekarelik Biwa Gölü, dört milyon yılı aşan jeolojik yaşıyla dünyanın en kadim göllerinden biridir ve Kansai bölgesinin içme suyu rezervuarıdır. Volkanik kuşaklar boyunca görülen binlerce jeotermal kaynak ve onsen havzası, ada hidrolojisinin karakteristik bir parçasını oluşturur.",
    after:
      "Dar ve dağlık ada yapısı nedeniyle Japonya'daki akarsular, kıtadaki nehirlere kıyasla son derece kısa, dik eğimli ve hızlı akışlıdır. Japon Alpleri'nden doğup Niigata'da Japon Denizi'ne dökülen 367 kilometrelik Şinano Nehri, ülkenin en uzun akarsuyudur; dağlık kesimlerde derin kanyonlar oyan nehirler, şiddetli muson veya tayfun dönemlerinde ani taşkınlar oluşturur.\n\nTektonik ve volkanik hareketler sonucu oluşan krater ve çöküntü gölleri ülkenin tatlı su dengesinde kilit bir işleve sahiptir. Kyoto'nun kuzeydoğusundaki Şiga ilinde yer alan 670 kilometrekarelik Biwa Gölü, dört milyon yılı aşan jeolojik yaşıyla dünyanın en kadim göllerinden biridir ve Kansai bölgesinin içme suyu rezervuarıdır. Volkanik kuşaklar boyunca görülen binlerce jeotermal kaynak ve onsen havzası, adaların su varlığının tipik bir parçasını oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MN',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      'Moğolistan topoğrafyası, batıdaki yüksek orojenik dağ sıraları ile doğuya ve güneye doğru genişleyen dalgalı peneplen platolarından meydana gelir. Batıda kuzeybatı-güneydoğu doğrultusunda uzanan sarp Altay Dağları, Moğolistan, Rusya ve Çin sınırlarının birleştiği kavşakta yer alan 4.374 metrelik Höyten Zirvesi (Khüiten) ile ülkenin en yüksek doruğunu oluşturur; Altay Tavan Bogd masifi ülkedeki dağ buzullarının ana merkezidir.\n\nÜlkenin orta kesiminde volkanik plato kalıntılarıyla çevrili Hangay Dağları, daha kuzeyde ise Rusya sınırına uzanan Hentiy Sıradağları yükselir. Güney kesimde ülke alanının üçte birini kaplayan Gobi Çölü uzanır; Gobi, kumullardan ziyade şiddetli rüzgar erozyonunun soyduğu çakıllı, taşlık platolar ve killi çöküntü havzalarından meydana gelir.',
    after:
      'Moğolistan topoğrafyası, batıdaki yüksek sıradağlar ile doğuya ve güneye doğru genişleyen, uzun süre aşınarak düzleşmiş dalgalı platolardan (peneplen) meydana gelir. Batıda kuzeybatı-güneydoğu doğrultusunda uzanan sarp Altay Dağları, Moğolistan, Rusya ve Çin sınırlarının birleştiği kavşakta yer alan 4.374 metrelik Höyten Zirvesi (Khüiten) ile ülkenin en yüksek doruğunu oluşturur; Altay Tavan Bogd masifi ülkedeki dağ buzullarının ana merkezidir.\n\nÜlkenin orta kesiminde volkanik plato kalıntılarıyla çevrili Hangay Dağları, daha kuzeyde ise Rusya sınırına uzanan Hentiy Sıradağları yükselir. Güney kesimde ülke alanının üçte birini kaplayan Gobi Çölü uzanır; Gobi, kumullardan ziyade şiddetli rüzgar erozyonunun soyduğu çakıllı, taşlık platolar ve killi çöküntü havzalarından meydana gelir.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MN',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Deniz etkisine bütünüyle kapalı konumu ve yüksek rakımı, Moğolistan\'da yeryüzünün en sert aşırı karasal iklimlerinden birini üretir. Kış aylarında Orta Asya üzerinde yerleşen yüksek basınç alanı nedeniyle hava son derece kuru, durgun ve dondurucudur; Ulan Batur, eksi 1,3 derecelik yıllık sıcaklık ortalamasıyla dünyanın en soğuk başkenti unvanını taşır ve kış geceleri eksi 40 derecenin altına inebilir.\n\nYıllık yağış kuzeydeki dağlık ve ormanlık alanlarda 300-350 milimetre civarındayken, güneydeki Gobi Çölü\'nde 100 milimetrenin altına düşer ve bu yağışın neredeyse tamamı kısa süren yaz aylarında konvektif fırtınalarla gelir. Kışın dondurucu ayazın kuraklık ve kalın buz tabakasıyla birleştiği ve hayvanların otlaklara ulaşmasını engelleyen "zud" afetleri, kırsal göçebe hayvancılık ekonomisini dönemsel olarak yıkıma uğratır.',
    after:
      'Deniz etkisine bütünüyle kapalı konumu ve yüksek rakımı, Moğolistan\'da yeryüzünün en sert aşırı karasal iklimlerinden birini üretir. Kış aylarında Orta Asya üzerinde yerleşen yüksek basınç alanı nedeniyle hava son derece kuru, durgun ve dondurucudur; Ulan Batur, eksi 1,3 derecelik yıllık sıcaklık ortalamasıyla dünyanın en soğuk başkenti unvanını taşır ve kış geceleri eksi 40 derecenin altına inebilir.\n\nYıllık yağış kuzeydeki dağlık ve ormanlık alanlarda 300-350 milimetre civarındayken, güneydeki Gobi Çölü\'nde 100 milimetrenin altına düşer ve bu yağışın neredeyse tamamı kısa süren yaz aylarında, ısınan havanın yükselmesiyle oluşan sağanak fırtınalarıyla gelir. Kışın dondurucu ayazın kuraklık ve kalın buz tabakasıyla birleştiği ve hayvanların otlaklara ulaşmasını engelleyen "zud" afetleri, kırsal göçebe hayvancılık ekonomisini dönemsel olarak yıkıma uğratır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'KR',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Güney Kore'nin morfolojik omurgasını, doğu kıyısı boyunca kuzey-güney ekseninde 500 kilometre uzanan Taebaek Dağları belirler. Bu sıradağ yarımadaya belirgin bir asimetri kazandırır: doğu yamaçları derin fay hatlarıyla Japon Denizi'ne dik bir şekilde inerken, batı yamaçları kademeli olarak alçalarak geniş vadilere ve kıyı düzlüklerine açılır. Seorak Dağı (1.708 m), granitik kuleleri ve sarp kanyonlarıyla bu sıradağın en belirgin kesimidir.\n\nÜlkenin en yüksek doruğu ana karada değil, güney açıklarındaki volkanik Jeju Adası'nda yükselen 1.950 metrelik kalkan volkanı Halla Dağı'dır (Hallasan). Sarı Deniz ve güney kıyıları ise binlerce girinti, koy, ada ve geniş gelgit düzlüğü (getbol) barındıran son derece girintili çıkıntılı bir ria tipi kıyı yapısına sahiptir; tarımsal üretimin omurgasını oluşturan geniş pirinç ovaları bu batı havzalarındadır.",
    after:
      "Güney Kore'nin yer şekillerinin omurgasını, doğu kıyısı boyunca kuzey-güney ekseninde 500 kilometre uzanan Taebaek Dağları belirler. Bu sıradağ yarımadaya belirgin bir asimetri kazandırır: doğu yamaçları derin fay hatlarıyla Japon Denizi'ne dik bir şekilde inerken, batı yamaçları kademeli olarak alçalarak geniş vadilere ve kıyı düzlüklerine açılır. Seorak Dağı (1.708 m), granitik kuleleri ve sarp kanyonlarıyla bu sıradağın en belirgin kesimidir.\n\nÜlkenin en yüksek doruğu ana karada değil, güney açıklarındaki volkanik Jeju Adası'nda yükselen 1.950 metrelik kalkan volkanı Halla Dağı'dır (Hallasan). Sarı Deniz ve güney kıyıları ise binlerce girinti, koy, ada ve geniş gelgit düzlüğü (getbol) barındıran son derece girintili çıkıntılı bir ria tipi kıyı yapısına sahiptir; tarımsal üretimin omurgasını oluşturan geniş pirinç ovaları bu batı havzalarındadır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'KR',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Kıta Asyası ile Pasifik Okyanusu arasındaki geçiş konumunda yer alan ülkede belirgin dört mevsim yaşanır. Kış mevsiminde Sibirya antisiklonunun getirdiği kuru ve soğuk kuzeybatı rüzgarları Seul ve iç kesimlerde sıcaklıkları sıfırın altına çekerken, kar yağışları Taebaek Dağları\'nın yükseklerinde yoğunlaşır.\n\nYazlar Doğu Asya musonunun etkisiyle sıcak ve yoğun nemli geçer; haziran sonundan temmuz sonuna kadar süren ve "jangma" adı verilen muson cephesi yıllık yağışın büyük kısmını getirir. Güney kıyıları ve Jeju Adası kışları çok daha ılıman geçen nemli subtropikal iklim özellikleri sergilerken, yaz sonu ve erken sonbaharda güneyden sokulan tropikal tayfunlar kıyı kesimlerinde şiddetli fırtına ve taşkınlara neden olur.',
    after:
      'Kıta Asyası ile Pasifik Okyanusu arasındaki geçiş konumunda yer alan ülkede belirgin dört mevsim yaşanır. Kış mevsiminde Sibirya yüksek basıncının getirdiği kuru ve soğuk kuzeybatı rüzgarları Seul ve iç kesimlerde sıcaklıkları sıfırın altına çekerken, kar yağışları Taebaek Dağları\'nın yükseklerinde yoğunlaşır.\n\nYazlar Doğu Asya musonunun etkisiyle sıcak ve yoğun nemli geçer; haziran sonundan temmuz sonuna kadar süren ve "jangma" adı verilen muson cephesi yıllık yağışın büyük kısmını getirir. Güney kıyıları ve Jeju Adası kışları çok daha ılıman geçen nemli subtropikal iklim özellikleri sergilerken, yaz sonu ve erken sonbaharda güneyden sokulan tropikal tayfunlar kıyı kesimlerinde şiddetli fırtına ve taşkınlara neden olur.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'KP',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Kuzey Kore iklimi, Sibirya kara kütlesine yakınlığı nedeniyle güneye kıyasla çok daha sert ve karasaldır. Kış aylarında kuzeybatıdan esen dondurucu Sibirya rüzgarları sıcaklıkları belirgin biçimde düşürür; iç kesimlerdeki Kaema Platosu'nda termometreler sıklıkla eksi 20 derecenin altına inerken, kıyılarda deniz etkisiyle soğuklar bir nebze yumuşar.\n\nYaz mevsimi Doğu Asya musonunun getirdiği sıcak ve nemli hava kütlelerinin etkisi altındadır; yıllık yağışın yarısından fazlası haziran ile eylül ayları arasındaki yoğun sağanaklarla düşer. Kısa süren büyüme mevsimi, kış donları ve yaz aylarındaki ani taşkınlar, ülkenin dağlık morfolojisiyle birleşerek tarımsal verimlilik üzerinde belirleyici bir baskı kurar.",
    after:
      "Kuzey Kore iklimi, Sibirya kara kütlesine yakınlığı nedeniyle güneye kıyasla çok daha sert ve karasaldır. Kış aylarında kuzeybatıdan esen dondurucu Sibirya rüzgarları sıcaklıkları belirgin biçimde düşürür; iç kesimlerdeki Kaema Platosu'nda termometreler sıklıkla eksi 20 derecenin altına inerken, kıyılarda deniz etkisiyle soğuklar bir nebze yumuşar.\n\nYaz mevsimi Doğu Asya musonunun getirdiği sıcak ve nemli hava kütlelerinin etkisi altındadır; yıllık yağışın yarısından fazlası haziran ile eylül ayları arasındaki yoğun sağanaklarla düşer. Kısa süren büyüme mevsimi, kış donları ve yaz aylarındaki ani taşkınlar, ülkenin dağlık yapısıyla birleşerek tarımsal verimlilik üzerinde belirleyici bir baskı kurar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'KZ',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Avrasya'nın kalbinde yer alan Kazakistan, dünyanın açık denizlere kıyısı olmayan en geniş ülkesidir; batı sınırını kapalı bir havza olan Hazar Denizi belirler. Rusya, Çin, Kırgızistan, Özbekistan ve Türkmenistan ile çevrili olan ülke, batıda Doğu Avrupa ovalarından doğuda Altay Dağları'na kadar uzanan devasa bir coğrafyayı kaplar.\n\nÜlkenin kuzeyindeki rüzgarlı İşim Nehri bozkırlarında kurulan modern başkent Astana, 1997'de güneydeki Almatı'dan taşınarak ülkenin Avrasya eksenindeki jeopolitik merkez üssü haline gelmiştir. Nüfusun büyük bölümü, tarıma elverişli kuzey bozkır kuşağında ve güneydeki dağ etekleri boyunca uzanan verimli vaha şeritlerinde yerleşiktir.",
    after:
      "Avrasya'nın kalbinde yer alan Kazakistan, dünyanın açık denizlere kıyısı olmayan en geniş ülkesidir; batı sınırını kapalı bir havza olan Hazar Denizi belirler. Rusya, Çin, Kırgızistan, Özbekistan ve Türkmenistan ile çevrili olan ülke, batıda Doğu Avrupa ovalarından doğuda Altay Dağları'na kadar uzanan devasa bir coğrafyayı kaplar.\n\nÜlkenin kuzeyindeki rüzgarlı İşim Nehri bozkırlarında kurulan modern başkent Astana, 1997'de güneydeki Almatı'dan taşınarak ülkenin Avrasya'daki siyasi ve stratejik merkezi haline gelmiştir. Nüfusun büyük bölümü, tarıma elverişli kuzey bozkır kuşağında ve güneydeki dağ etekleri boyunca uzanan verimli vaha şeritlerinde yerleşiktir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'KZ',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Kazakistan topoğrafyası, batıdaki derin tektonik çöküntülerden doğudaki 7.000 metrelik sarp orojenik zirvelere kadar büyük tezatlar barındırır. Hazar kıyısındaki Karagiye Çöküntüsü, deniz seviyesinin 132 metre altına inerek kıtanın en alçak noktalarından birini oluşturur. Ülkenin orta kuşağını, batıdan doğuya binlerce kilometre uzanan ve gezegenin en geniş kurak otlak alanını oluşturan Kazak Bozkırı ile güneyindeki Betpak-Dala (Aç Bozkır) çölü kaplar.\n\nDoğu ve güneydoğu sınırlarında yeryüzü hızla dikleşir: Kırgızistan ve Çin sınırında yükselen Tanrı Dağları'nın (Tien Shan) 7.010 metrelik piramidal zirvesi Han Tengri, ülkenin en yüksek doruğudur. Kuzeydoğuda ise Rusya sınırındaki Altay Dağları ve 4.506 metrelik Beluha Dağı masifi, geniş bozkırların ardından sarp buzul vadileri ve tayga ormanlarıyla yükselir.",
    after:
      "Kazakistan topoğrafyası, batıdaki derin tektonik çöküntülerden doğudaki 7.000 metrelik sarp dağ zirvelerine kadar büyük tezatlar barındırır. Hazar kıyısındaki Karagiye Çöküntüsü, deniz seviyesinin 132 metre altına inerek kıtanın en alçak noktalarından birini oluşturur. Ülkenin orta kuşağını, batıdan doğuya binlerce kilometre uzanan ve gezegenin en geniş kurak otlak alanını oluşturan Kazak Bozkırı ile güneyindeki Betpak-Dala (Aç Bozkır) çölü kaplar.\n\nDoğu ve güneydoğu sınırlarında yeryüzü hızla dikleşir: Kırgızistan ve Çin sınırında yükselen Tanrı Dağları'nın (Tien Shan) 7.010 metrelik piramidal zirvesi Han Tengri, ülkenin en yüksek doruğudur. Kuzeydoğuda ise Rusya sınırındaki Altay Dağları ve 4.506 metrelik Beluha Dağı masifi, geniş bozkırların ardından sarp buzul vadileri ve tayga ormanlarıyla yükselir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'KG',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Orta Asya'nın kalbinde yükselen Kırgızistan; topraklarının yüzde doksanından fazlası deniz seviyesinden bin metre yukarıda yer alan, ortalama 2.750 metre rakımıyla dünyanın en yüksek ülkelerinden biridir. Kuzeyde Kazakistan, batıda Özbekistan, güneyde Tacikistan ve doğuda Çin ile çevrili olup Tanrı Dağları (Tien Shan) ve Pamir-Alay sistemlerinin kavşağında konumlanır.\n\nKuzeyde Kazakistan sınırına yakın Çuy Vadisi'nde kurulu başkent Bişkek, ülkenin idari ve kültürel merkezidir. Dağ silsileleriyle birbirinden ayrılan derin vadiler ve tektonik çöküntüler, yerleşimi parçalı bir yapıya kavuşturmuş; geleneksel yaylacılık ve vaha tarımı nüfusun mekânsal dağılımını belirlemiştir.",
    after:
      "Orta Asya'nın kalbinde yükselen Kırgızistan; topraklarının yüzde doksanından fazlası deniz seviyesinden bin metre yukarıda yer alan, ortalama 2.750 metre rakımıyla dünyanın en yüksek ülkelerinden biridir. Kuzeyde Kazakistan, batıda Özbekistan, güneyde Tacikistan ve doğuda Çin ile çevrili olup Tanrı Dağları (Tien Shan) ve Pamir-Alay sistemlerinin kavşağında konumlanır.\n\nKuzeyde Kazakistan sınırına yakın Çuy Vadisi'nde kurulu başkent Bişkek, ülkenin idari ve kültürel merkezidir. Dağ silsileleriyle birbirinden ayrılan derin vadiler ve tektonik çöküntüler, yerleşimi parçalı bir yapıya kavuşturmuş; geleneksel yaylacılık ve vaha tarımı nüfusun ülke içindeki dağılımını belirlemiştir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'KG',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Denizlerden uzak kapalı konumu ve dik irtifa basamakları, ülkede sert karasal iklim koşullarını hakim kılar. Sıcaklık ve nem değerleri vadilerden zirvelere doğru hızla değişir; alçak vadi tabanlarında yazlar sıcak ve kurak geçerken, 3.000 metrenin üzerindeki yaylalarda yaz aylarında dahi gece donları yaşanır ve yüksek doruklar yıl boyu kalıcı buzullarla kaplı kalır.\n\nKış mevsimi özellikle iç çöküntü havzalarında ve yüksek platolarda dondurucu soğuklar ve yoğun kar örtüsüyle geçer; vadilerde sıcaklık terselmesi (enversiyon) sıkça görülür. Batıdan gelen hava kütlelerine açık dağ yamaçları yılda 1.000 milimetreye varan yağış alırken, yüksek dağların kuytusunda kalan kapalı çanaklar yıllık 200 milimetrenin altında kalarak yarı kurak bozkır niteliği kazanır.',
    after:
      'Denizlerden uzak kapalı konumu ve dik irtifa basamakları, ülkede sert karasal iklim koşullarını hakim kılar. Sıcaklık ve nem değerleri vadilerden zirvelere doğru hızla değişir; alçak vadi tabanlarında yazlar sıcak ve kurak geçerken, 3.000 metrenin üzerindeki yaylalarda yaz aylarında dahi gece donları yaşanır ve yüksek doruklar yıl boyu kalıcı buzullarla kaplı kalır.\n\nKış mevsimi özellikle iç çöküntü havzalarında ve yüksek platolarda dondurucu soğuklar ve yoğun kar örtüsüyle geçer; vadilerde, soğuk havanın vadi tabanına çökerek yamaçlardan daha soğuk kaldığı sıcaklık terselmesi sıkça görülür. Batıdan gelen hava kütlelerine açık dağ yamaçları yılda 1.000 milimetreye varan yağış alırken, yüksek dağların kuytusunda kalan kapalı çanaklar yıllık 200 milimetrenin altında kalarak yarı kurak bozkır niteliği kazanır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'KG',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Kırgızistan'ın yüksek dağ buzulları, tüm Orta Asya için hayati birer doğal tatlı su deposu ve hidrolojik güç kaynağıdır. Orta Tanrı Dağları buzullarından beslenen 535 kilometrelik Narın Nehri, ülkeyi doğudan batıya derin kanyonlar boyunca geçerek Fergana Vadisi'ne iner ve Kara Derya ile birleşip Sirderya'yı oluşturur; nehir üzerindeki Toktogul Barajı ülkenin elektrik üretiminin merkezidir.\n\nÜlkenin kuzeydoğusunda, 1.607 metre irtifada görkemli karlı dağlarla çevrili Isık-Göl, dünyanın en büyük ikinci yüksek irtifa dağ gölüdür. 668 metre derinliğe ulaşan bu tektonik kapalı göl, hafif tuzlu yapısı ve tabandaki termal hareketlilik sayesinde dondurucu kış aylarında bile asla donmaz; Kırgızcada \"sıcak göl\" anlamına gelen adını da bu özelliğinden alır.",
    after:
      "Kırgızistan'ın yüksek dağ buzulları, tüm Orta Asya için hayati birer doğal tatlı su deposu ve su gücü kaynağıdır. Orta Tanrı Dağları buzullarından beslenen 535 kilometrelik Narın Nehri, ülkeyi doğudan batıya derin kanyonlar boyunca geçerek Fergana Vadisi'ne iner ve Kara Derya ile birleşip Sirderya'yı oluşturur; nehir üzerindeki Toktogul Barajı ülkenin elektrik üretiminin merkezidir.\n\nÜlkenin kuzeydoğusunda, 1.607 metre irtifada görkemli karlı dağlarla çevrili Isık-Göl, dünyanın en büyük ikinci yüksek irtifa dağ gölüdür. 668 metre derinliğe ulaşan bu tektonik kapalı göl, hafif tuzlu yapısı ve tabandaki termal hareketlilik sayesinde dondurucu kış aylarında bile asla donmaz; Kırgızcada \"sıcak göl\" anlamına gelen adını da bu özelliğinden alır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TJ',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Tacikistan'da iklim, kısa mesafelerde yüzlerce metre değişen irtifaya bağlı olarak dramatik farklılıklar gösterir. Güneybatıdaki alçak nehir vadilerinde yazlar uzun, kurak ve kavurucu geçerken, sıcaklıklar sıklıkla 40 derecenin üzerine çıkar. Doğu Pamir platolarında ise neredeyse hiç yaz yaşanmaz; yıl boyu sert ayazların ve don olaylarının hüküm sürdüğü kutup benzeri soğuk çöl koşulları egemendir.\n\nYağış dağılımı da dağların bakı ve konumuna göre şekillenir: Akdeniz kökenli nemli hava akımlarına açık batı yamaçları yılda 1.000 ila 1.500 milimetreye varan bol kar ve yağmur alırken, yüksek duvarların ardında kalan kapalı Doğu Pamir havzalarında yıllık yağış 100 milimetrenin altına düşer. İlkbahar ve yaz aylarında eriyen karlar ile şiddetli sağanaklar dağ yamaçlarında yıkıcı çamur akıntılarına (sel) ve heyelanlara yol açar.",
    after:
      "Tacikistan'da iklim, kısa mesafelerde yüzlerce metre değişen irtifaya bağlı olarak çarpıcı farklılıklar gösterir. Güneybatıdaki alçak nehir vadilerinde yazlar uzun, kurak ve kavurucu geçerken, sıcaklıklar sıklıkla 40 derecenin üzerine çıkar. Doğu Pamir platolarında ise neredeyse hiç yaz yaşanmaz; yıl boyu sert ayazların ve don olaylarının hüküm sürdüğü kutup benzeri soğuk çöl koşulları egemendir.\n\nYağış dağılımı da dağların bakı ve konumuna göre şekillenir: Akdeniz kökenli nemli hava akımlarına açık batı yamaçları yılda 1.000 ila 1.500 milimetreye varan bol kar ve yağmur alırken, yüksek duvarların ardında kalan kapalı Doğu Pamir havzalarında yıllık yağış 100 milimetrenin altına düşer. İlkbahar ve yaz aylarında eriyen karlar ile şiddetli sağanaklar dağ yamaçlarında yıkıcı çamur akıntılarına (sel) ve heyelanlara yol açar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TM',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Orta Asya'nın güneybatısında yer alan Türkmenistan, batıda Hazar Denizi'ne geniş bir kıyı şeridiyle açılan bir çöl ve vaha ülkesidir. Kuzeyde Kazakistan ve Özbekistan, güneyde İran ve güneydoğuda Afganistan ile sınır komşusudur. Yüzölçümünün yaklaşık yüzde sekseni kurak kum çölleriyle kaplıdır.\n\nGüneyde İran sınırını oluşturan Köpetdağ'ın eteklerindeki bereketli vaha şeridinde kurulu başkent Aşkabat, çöl ile dağ arasındaki jeomorfolojik temas noktasında yer alır. Nüfus ve yerleşim alanları, nehir boyları ile dağ eteklerinden beslenen yapay su kanalları boyunca uzanan dar tarım kuşaklarında toplanmıştır.",
    after:
      "Orta Asya'nın güneybatısında yer alan Türkmenistan, batıda Hazar Denizi'ne geniş bir kıyı şeridiyle açılan bir çöl ve vaha ülkesidir. Kuzeyde Kazakistan ve Özbekistan, güneyde İran ve güneydoğuda Afganistan ile sınır komşusudur. Yüzölçümünün yaklaşık yüzde sekseni kurak kum çölleriyle kaplıdır.\n\nGüneyde İran sınırını oluşturan Köpetdağ'ın eteklerindeki bereketli vaha şeridinde kurulu başkent Aşkabat, çölün dağla buluştuğu noktada yer alır. Nüfus ve yerleşim alanları, nehir boyları ile dağ eteklerinden beslenen yapay su kanalları boyunca uzanan dar tarım kuşaklarında toplanmıştır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TM',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Türkmenistan yer şekillerinin ezici bölümünü, ülkenin iç ve kuzey kesimlerini kaplayan devasa Karakum (Kara Kum) Çölü oluşturur. Karakum; rüzgarın süpürdüğü hareketli kum tepeleri, barkanlar, killi çöküntüler (takırlar) ve tuz tavalarından meydana gelen dalgalı bir plato görünümündedir. Batıda Hazar Denizi kıyısına doğru çöl alçalarak deniz seviyesinin altındaki çöküntülere ve sığ Garaboğazköl Lagünü'ne bağlanır.\n\nÜlkenin güney sınırında, tektonik açıdan hareketli Alp-Himalaya kuşağına bağlı Köpetdağ Sıradağları sarp duvarlar halinde yükselir; Aşkabat'ın güneyindeki 2.912 metrelik Şahşah (Rizeh) Tepesi bu sıranın ülkedeki en yüksek doruğudur. Gerçek en yüksek nokta ise doğuda, Özbekistan sınırındaki Köýtendag (Kugitang) sırasında 3.139 metreye ulaşan ve zengin karstik mağara sistemleri barındıran Ayrıbaba Dağı'dır.",
    after:
      "Türkmenistan yer şekillerinin ezici bölümünü, ülkenin iç ve kuzey kesimlerini kaplayan devasa Karakum (Kara Kum) Çölü oluşturur. Karakum; rüzgarın süpürdüğü hareketli kum tepeleri, hilal biçimli kumullar (barkanlar), killi çöküntüler (takırlar) ve tuz tavalarından meydana gelen dalgalı bir plato görünümündedir. Batıda Hazar Denizi kıyısına doğru çöl alçalarak deniz seviyesinin altındaki çöküntülere ve sığ Garaboğazköl Lagünü'ne bağlanır.\n\nÜlkenin güney sınırında, tektonik açıdan hareketli Alp-Himalaya kuşağına bağlı Köpetdağ Sıradağları sarp duvarlar halinde yükselir; Aşkabat'ın güneyindeki 2.912 metrelik Şahşah (Rizeh) Tepesi bu sıranın ülkedeki en yüksek doruğudur. Gerçek en yüksek nokta ise doğuda, Özbekistan sınırındaki Köýtendag (Kugitang) sırasında 3.139 metreye ulaşan ve zengin karstik mağara sistemleri barındıran Ayrıbaba Dağı'dır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TM',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Ülkenin hidrolojik dengesi, neredeyse bütünüyle sınır boylarından geçen dış kaynaklı nehir akımlarına bağımlıdır. Doğu sınırını izleyen Amu Derya Nehri, ülkenin en büyük tatlı su kaynağıdır; güneyde Afganistan'dan gelen Murğap ve Tecen nehirleri ise çöl içlerine doğru akarak kumlar arasında vaha deltaları oluşturur ve sonlanır.\n\n1950'lerden itibaren inşa edilen ve Amu Derya'dan aldığı suyu çölü doğudan batıya boydan boya geçerek Aşkabat'a ve Hazar kıyısına kadar taşıyan 1.350 kilometrelik Karakum Kanalı, dünyanın en uzun sulama kanallarından biridir. Batıda Hazar Denizi kıyısında yer alan devasa Garaboğazköl Lagünü, dar bir boğazla denizden su çekerek aşırı buharlaşma sayesinde dünyanın en zengin doğal sodyum sülfat ve tuz yataklarını oluşturur.",
    after:
      "Ülkenin su dengesi, neredeyse bütünüyle sınır boylarından geçen dış kaynaklı nehir akımlarına bağımlıdır. Doğu sınırını izleyen Amu Derya Nehri, ülkenin en büyük tatlı su kaynağıdır; güneyde Afganistan'dan gelen Murğap ve Tecen nehirleri ise çöl içlerine doğru akarak kumlar arasında vaha deltaları oluşturur ve sonlanır.\n\n1950'lerden itibaren inşa edilen ve Amu Derya'dan aldığı suyu çölü doğudan batıya boydan boya geçerek Aşkabat'a ve Hazar kıyısına kadar taşıyan 1.350 kilometrelik Karakum Kanalı, dünyanın en uzun sulama kanallarından biridir. Batıda Hazar Denizi kıyısında yer alan devasa Garaboğazköl Lagünü, dar bir boğazla denizden su çekerek aşırı buharlaşma sayesinde dünyanın en zengin doğal sodyum sülfat ve tuz yataklarını oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'UZ',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Orta Asya'nın merkezinde yer alan Özbekistan, dünyada denize çıkışı bulunmayan ülkelerle çevrili iki ülkeden biridir (çift karasal / doubly landlocked); Lihtenştayn ile paylaştığı bu coğrafi konum nedeniyle açık denizlere ulaşmak için en az iki bağımsız devletin topraklarından geçmek gerekir. Kazakistan, Kırgızistan, Tacikistan, Türkmenistan ve Afganistan ile çevrilidir.\n\nÜlkenin kuzeydoğusunda, Tanrı Dağları eteklerindeki Çirçik Nehri vahası üzerinde kurulu başkent Taşkent, Orta Asya'nın en kalabalık metropolüdür. Topraklarının dörtte üçü kurak düzlükler ve çöllerden oluşmasına rağmen nüfus, doğudaki kapalı Fergana Vadisi ile güneybatıdaki kadim vaha nehirleri boyunca yoğunlaşmıştır.",
    after:
      "Orta Asya'nın merkezinde yer alan Özbekistan, dünyada denize çıkışı bulunmayan ülkelerle çevrili iki ülkeden biridir (çift karasal ülke); Lihtenştayn ile paylaştığı bu coğrafi konum nedeniyle açık denizlere ulaşmak için en az iki bağımsız devletin topraklarından geçmek gerekir. Kazakistan, Kırgızistan, Tacikistan, Türkmenistan ve Afganistan ile çevrilidir.\n\nÜlkenin kuzeydoğusunda, Tanrı Dağları eteklerindeki Çirçik Nehri vahası üzerinde kurulu başkent Taşkent, Orta Asya'nın en kalabalık metropolüdür. Topraklarının dörtte üçü kurak düzlükler ve çöllerden oluşmasına rağmen nüfus, doğudaki kapalı Fergana Vadisi ile güneybatıdaki kadim vaha nehirleri boyunca yoğunlaşmıştır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'UZ',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Özbekistan morfolojisi batıdaki düz çöl platoları ile doğudaki sarp dağ silsileleri arasında bölünür. Ülkenin orta ve kuzeybatı kesimini kaplayan 300 bin kilometrekarelik geniş Kızılkum Çölü, Kazakistan ile paylaşılır ve kumul sırtları ile alçak aşınım platolarından oluşur. Batı ucunda ise Hazar ile Aral havzaları arasında yükselen kireçtaşlı Ustyurt Platosu uzanır.\n\nDoğuya doğru Tanrı Dağları (Tien Shan) ve Pamir-Alay sistemlerinin etekleri yükselir. Bu dağların kollarından Hisar Sıradağları üzerinde, Tacikistan sınırında yer alan 4.643 metrelik Hazret-i Sultan Zirvesi ülkenin en yüksek noktasıdır. Dağların arasında sıkışan tektonik kökenli Fergana Vadisi; alüvyal dolgusu, korunaklı yapısı ve verimli topraklarıyla tüm Orta Asya'nın en yoğun tarım ve yerleşim havzasını meydana getirir.",
    after:
      "Özbekistan'ın yer şekilleri batıdaki düz çöl platoları ile doğudaki sarp dağ silsileleri arasında bölünür. Ülkenin orta ve kuzeybatı kesimini kaplayan 300 bin kilometrekarelik geniş Kızılkum Çölü, Kazakistan ile paylaşılır ve kumul sırtları ile alçak aşınım platolarından oluşur. Batı ucunda ise Hazar ile Aral havzaları arasında yükselen kireçtaşlı Ustyurt Platosu uzanır.\n\nDoğuya doğru Tanrı Dağları (Tien Shan) ve Pamir-Alay sistemlerinin etekleri yükselir. Bu dağların kollarından Hisar Sıradağları üzerinde, Tacikistan sınırında yer alan 4.643 metrelik Hazret-i Sultan Zirvesi ülkenin en yüksek noktasıdır. Dağların arasında sıkışan tektonik kökenli Fergana Vadisi; alüvyal dolgusu, korunaklı yapısı ve verimli topraklarıyla tüm Orta Asya'nın en yoğun tarım ve yerleşim havzasını meydana getirir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'UZ',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Açık denizlerden aşırı uzaklık ve yüksek dağ bariyerleri, Özbekistan'da buharlaşmanın yağışı katbekat aştığı belirgin bir kurak karasal iklim üretir. Yaz mevsimi uzun, bulutsuz ve kavurucudur; çöl kesimlerinde sıcaklıklar düzenli olarak 40 derecenin üzerine çıkar. Kış ayları ise kuzeyden sarkan Sibirya antisiklonunun etkisiyle özellikle Kızılkum ve Karakalpakistan düzlüklerinde sert donlara ve keskin soğuklara sahne olur.\n\nYağış miktarı son derece düşüktür; batıdaki çöllerde ve Aral çanağında yıllık 100 milimetrenin altında seyrederken, yalnızca doğudaki dağ eteklerinde ve Fergana Vadisi'nde 300 ila 400 milimetreye ulaşır. Yağışın büyük kısmı kış sonu ve ilkbaharda düşer; tarımsal üretimin devamlılığı bütünüyle karların erimesiyle dağlardan inen nehirlerin sağladığı sulama şebekesine dayanır.",
    after:
      "Açık denizlerden aşırı uzaklık ve yüksek dağ bariyerleri, Özbekistan'da buharlaşmanın yağışı katbekat aştığı belirgin bir kurak karasal iklim üretir. Yaz mevsimi uzun, bulutsuz ve kavurucudur; çöl kesimlerinde sıcaklıklar düzenli olarak 40 derecenin üzerine çıkar. Kış ayları ise kuzeyden sarkan Sibirya yüksek basıncının etkisiyle özellikle Kızılkum ve Karakalpakistan düzlüklerinde sert donlara ve keskin soğuklara sahne olur.\n\nYağış miktarı son derece düşüktür; batıdaki çöllerde ve Aral çanağında yıllık 100 milimetrenin altında seyrederken, yalnızca doğudaki dağ eteklerinde ve Fergana Vadisi'nde 300 ila 400 milimetreye ulaşır. Yağışın büyük kısmı kış sonu ve ilkbaharda düşer; tarımsal üretimin devamlılığı bütünüyle karların erimesiyle dağlardan inen nehirlerin sağladığı sulama şebekesine dayanır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BN',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Borneo Adası'nın kuzeybatı kıyısında, Güney Çin Denizi'ne bakan Brunei, bütünüyle Malezya'nın Sarawak eyaleti tarafından kuşatılmış zengin bir petrol ve gaz sultanlığıdır. Ülke arazisi, Sarawak'a ait Limbang Vadi koridoru nedeniyle coğrafi olarak iki ayrı parçaya bölünmüştür: Nüfusun ve idari merkezin toplandığı batı yakası ile doğuda bozulmamış yağmur ormanlarıyla örtülü Temburong eksklavı.\n\nEkonomisi ve kentsel omurgası bütünüyle kıyı şeridinde ve açık denizdeki hidrokarbon sahalarında odaklanan ülke, Güneydoğu Asya'nın en iyi korunmuş birincil yağmur ormanlarına ev sahipliği yapar. 2020'de açılan Sultan Hacı Ömer Ali Seyfeddin Köprüsü, iki yakayı Brunei Körfezi üzerinden birleştirerek kara yolu kopukluğunu ortadan kaldırmıştır.",
    after:
      "Borneo Adası'nın kuzeybatı kıyısında, Güney Çin Denizi'ne bakan Brunei, bütünüyle Malezya'nın Sarawak eyaleti tarafından kuşatılmış zengin bir petrol ve gaz sultanlığıdır. Ülke arazisi, Sarawak'a ait Limbang Vadi koridoru nedeniyle coğrafi olarak iki ayrı parçaya bölünmüştür: Nüfusun ve idari merkezin toplandığı batı yakası ile doğuda bozulmamış yağmur ormanlarıyla örtülü Temburong eksklavı (ana topraktan kopuk parça).\n\nEkonomisi ve kentsel omurgası bütünüyle kıyı şeridinde ve açık denizdeki petrol ve doğal gaz sahalarında odaklanan ülke, Güneydoğu Asya'nın en iyi korunmuş birincil yağmur ormanlarına ev sahipliği yapar. 2020'de açılan Sultan Hacı Ömer Ali Seyfeddin Köprüsü, iki yakayı Brunei Körfezi üzerinden birleştirerek kara yolu kopukluğunu ortadan kaldırmıştır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BN',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Brunei'nin batı kanadı, kıyı boyunca uzanan mangrov bataklıkları, alüvyal düzlükler ve iç kesimlere doğru hafifçe yükselen dalgalı kumtaşı tepelerinden meydana gelir. Bu kesimdeki kıyı ovaları, ülkenin yerleşim ve petrol altyapısının ana taşıyıcısıdır.\n\nDoğudaki Temburong bölgesi ise batıdan tamamen farklı, sarp ve engebeli bir orografi sunar. Güneye doğru yükselen sıradağların uzantısında, Malezya sınırında yer alan 1.850 metrelik Bukit Pagon ülkenin en yüksek zirvesidir. Ulu Temburong Milli Parkı'nı da içine alan bu dağlık kesim, aşırı eğimli yamaçları sayesinde insan yerleşiminden uzak kalarak adanın en bakir dipterokarp yağmur ormanı ekosistemini barındırır.",
    after:
      "Brunei'nin batı kanadı, kıyı boyunca uzanan mangrov bataklıkları, alüvyal düzlükler ve iç kesimlere doğru hafifçe yükselen dalgalı kumtaşı tepelerinden meydana gelir. Bu kesimdeki kıyı ovaları, ülkenin yerleşim ve petrol altyapısının ana taşıyıcısıdır.\n\nDoğudaki Temburong bölgesi ise batıdan tamamen farklı, sarp ve engebeli bir dağlık yapı sunar. Güneye doğru yükselen sıradağların uzantısında, Malezya sınırında yer alan 1.850 metrelik Bukit Pagon ülkenin en yüksek zirvesidir. Ulu Temburong Milli Parkı'nı da içine alan bu dağlık kesim, aşırı eğimli yamaçları sayesinde insan yerleşiminden uzak kalarak adanın dev dipterokarp ağaçlarıyla kaplı en bakir yağmur ormanını barındırır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BN',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Ülkenin hidrolojik ağını, Borneo'nun iç tepelerinden doğup kuzeye doğru akarak Güney Çin Denizi'ne ve Brunei Körfezi'ne dökülen dört ana akarsu sistemi oluşturur: Belait, Tutong, Brunei ve Temburong nehirleri.\n\n209 kilometre uzunluğundaki Belait Nehri, ülkenin en uzun akarsuyu olup batıdaki petrol sahalarının kalbinden geçerken geniş turba bataklıklarını drene eder. Başkente hayat veren Brunei Nehri ise ağzında geniş bir gelgit halici oluşturur; burada kazıklar üzerine inşa edilen kadim su şehri Kampong Ayer, akarsuyun sağladığı korunaklı liman ortamında yüzyıllardır yaşamını sürdürür. Temburong Nehri ise el değmemiş kanyonları ve şelaleleri aşarak doğu havzasının ekolojik can damarını meydana getirir.",
    after:
      "Ülkenin akarsu ağını, Borneo'nun iç tepelerinden doğup kuzeye doğru akarak Güney Çin Denizi'ne ve Brunei Körfezi'ne dökülen dört ana akarsu sistemi oluşturur: Belait, Tutong, Brunei ve Temburong nehirleri.\n\n209 kilometre uzunluğundaki Belait Nehri, ülkenin en uzun akarsuyu olup batıdaki petrol sahalarının kalbinden geçerken geniş turba bataklıklarının sularını toplar. Başkente hayat veren Brunei Nehri ise ağzında geniş bir gelgit halici oluşturur; burada kazıklar üzerine inşa edilen kadim su şehri Kampong Ayer, akarsuyun sağladığı korunaklı liman ortamında yüzyıllardır yaşamını sürdürür. Temburong Nehri ise el değmemiş kanyonları ve şelaleleri aşarak doğu havzasının ekolojik can damarını meydana getirir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'KH',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Kamboçya'nın hidrolojisi, dünya üzerinde eşi benzeri bulunmayan hidrolojik bir tersinme mekanizmasıyla çalışır. Laos sınırından ülkeye giren Mekong Nehri güneye akar ve başkent Phnom Penh önlerinde Tonle Sap ve Bassac nehirleriyle buluşarak \"Chaktomuk\" (Dört Yüz) kavşağını meydana getirir.\n\nMuson yağmurları ve Himalayalar'dan gelen kar erimeleriyle haziran ayında Mekong'un debisi olağanüstü kabardığında, nehrin suları Tonle Sap Nehri'ni geriye doğru iter. Akış yönü tersine dönen su, Tonle Sap Gölü'nü doldurarak yüzeyini kurak mevsimdeki 2.500 kilometrekareden 16.000 kilometrekareye çıkarır. Bu devasa doğal taşkın havuzu, nehir sularını regüle ederek Kamboçya ve Vietnam deltalarını yıkıcı sellerden korur; sular kasım ayında tekrar Mekong'a geri çekilirken geride bıraktığı verimli alüvyon ve zengin balık popülasyonu ülke beslenmesinin temel direğini oluşturur.",
    after:
      "Kamboçya'nın suları, dünyada eşi benzeri bulunmayan bir düzenle işler: bir nehrin akış yönü mevsime göre tersine döner. Laos sınırından ülkeye giren Mekong Nehri güneye akar ve başkent Phnom Penh önlerinde Tonle Sap ve Bassac nehirleriyle buluşarak \"Chaktomuk\" (Dört Yüz) kavşağını meydana getirir.\n\nMuson yağmurları ve Himalayalar'dan gelen kar erimeleriyle haziran ayında Mekong'un debisi olağanüstü kabardığında, nehrin suları Tonle Sap Nehri'ni geriye doğru iter. Akış yönü tersine dönen su, Tonle Sap Gölü'nü doldurarak yüzeyini kurak mevsimdeki 2.500 kilometrekareden 16.000 kilometrekareye çıkarır. Bu devasa doğal taşkın havuzu, nehir sularını dengeleyerek Kamboçya ve Vietnam deltalarını yıkıcı sellerden korur; sular kasım ayında tekrar Mekong'a geri çekilirken geride bıraktığı verimli alüvyon ve zengin balık varlığı ülke beslenmesinin temel direğini oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'ID',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Endonezya; Hint-Avustralya, Pasifik ve Avrasya levhalarının çarpışma sahasında, Pasifik Ateş Çemberi'nin en aktif kuşağında yer alır. Sumatra'daki Barisan Dağları'ndan başlayıp Cava, Bali ve Küçük Sunda adaları boyunca doğuya uzanan volkanik yay, 130'a yakın aktif stratovolkan barındırır; Cava'daki Merapi ve Semeru ile Sumatra'daki Sinabung bu dinamizmin canlı örnekleridir. Düzenli aralıklarla püsküren volkanik küller, Cava ve Bali topraklarını Güneydoğu Asya'nın en verimli tarım havzalarına dönüştürmüştür.\n\nBuna karşılık Sunda sahanlığında oturan Kalimantan, genç volkanizmadan yoksun, aşınmış yaylalar ve devasa turba bataklıklarıyla kaplıdır. Ülkenin ve Okyanusya ada dünyasının en yüksek doruğu ise doğuda, Papua'daki Sudirman Sıradağları üzerinde 4.884 metreye ulaşan ve zirvesinde ekvatoral buzullar barındıran Puncak Jaya'dır (Carstensz Piramidi).",
    after:
      "Endonezya; Hint-Avustralya, Pasifik ve Avrasya levhalarının çarpışma sahasında, Pasifik Ateş Çemberi'nin en aktif kuşağında yer alır. Sumatra'daki Barisan Dağları'ndan başlayıp Cava, Bali ve Küçük Sunda adaları boyunca doğuya uzanan volkanik yay, 130'a yakın aktif stratovolkan barındırır; Cava'daki Merapi ve Semeru ile Sumatra'daki Sinabung bu hareketliliğin canlı örnekleridir. Düzenli aralıklarla püsküren volkanik küller, Cava ve Bali topraklarını Güneydoğu Asya'nın en verimli tarım havzalarına dönüştürmüştür.\n\nBuna karşılık Sunda sahanlığında oturan Kalimantan, genç volkanizmadan yoksun, aşınmış yaylalar ve devasa turba bataklıklarıyla kaplıdır. Ülkenin ve Okyanusya ada dünyasının en yüksek doruğu ise doğuda, Papua'daki Sudirman Sıradağları üzerinde 4.884 metreye ulaşan ve zirvesinde ekvatoral buzullar barındıran Puncak Jaya'dır (Carstensz Piramidi).",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'LA',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Laos'un can damarı, ülkeyi kuzeyden güneye yaklaşık 1.900 kilometre boyunca kat eden ve batı sınırının büyük bölümünü oluşturan Mekong Nehri'dir. Ülke arazisinin neredeyse onda dokuzu Mekong drenaj havzası içerisinde yer alır; Nam Ou, Nam Khan, Nam Ngum ve Xe Don gibi yüzlerce dağ nehri bu ana artere dökülür.\n\nYüksek eğimli dağ vadilerinden inen bu akarsular Laos'a olağanüstü bir hidroelektrik potansiyeli kazandırmış, ülkeyi \"Güneydoğu Asya'nın bataryası\" haline getiren baraj projelerinin temelini oluşturmuştur. Nehrin güneyinde Kamboçya sınırındaki Si Phan Don (Dört Bin Ada) bölgesinde yer alan Khone Şelaleleri, Mekong'un kesintisiz gemiciliğe izin vermeyen en haşmetli doğal basamağıdır.",
    after:
      "Laos'un can damarı, ülkeyi kuzeyden güneye yaklaşık 1.900 kilometre boyunca kat eden ve batı sınırının büyük bölümünü oluşturan Mekong Nehri'dir. Ülke arazisinin neredeyse onda dokuzu Mekong drenaj havzası içerisinde yer alır; Nam Ou, Nam Khan, Nam Ngum ve Xe Don gibi yüzlerce dağ nehri bu ana nehre dökülür.\n\nYüksek eğimli dağ vadilerinden inen bu akarsular Laos'a olağanüstü bir hidroelektrik potansiyeli kazandırmış, ülkeyi \"Güneydoğu Asya'nın bataryası\" haline getiren baraj projelerinin temelini oluşturmuştur. Nehrin güneyinde Kamboçya sınırındaki Si Phan Don (Dört Bin Ada) bölgesinde yer alan Khone Şelaleleri, Mekong'un kesintisiz gemiciliğe izin vermeyen en haşmetli doğal basamağıdır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MY',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Yarımada Malezyası'nın topoğrafik omurgasını, kuzeyden güneye uzanarak yarımadayı doğu ve batı kıyı ovalarına bölen granit yapılı Titiwangsa Dağları oluşturur. Dağların her iki yakasında uzanan alüvyal kıyı düzlükleri, ülkenin en yoğun kentleşme ve tarım alanlarıdır.\n\nDoğu Malezya çok daha engebeli ve sarp bir orografiye sahiptir. Sabah eyaletindeki Crocker Sıradağları'nda yükselen 4.095 metrelik granit kütle Kinabalu Dağı, hem Malezya'nın hem de Güneydoğu Asya ada dünyasının en yüksek noktasıdır. Sarawak içlerinde ise Endonezya sınırına uzanan dağlık yaylalar ve Gunung Mulu'daki devasa karstik mağara sistemleri yer alır; kıyıya yaklaşıldıkça arazi geniş mangrov ve turba bataklıklarına dönüşür.",
    after:
      "Yarımada Malezyası'nın topoğrafik omurgasını, kuzeyden güneye uzanarak yarımadayı doğu ve batı kıyı ovalarına bölen granit yapılı Titiwangsa Dağları oluşturur. Dağların her iki yakasında uzanan alüvyal kıyı düzlükleri, ülkenin en yoğun kentleşme ve tarım alanlarıdır.\n\nDoğu Malezya çok daha engebeli ve sarp bir dağlık yapıya sahiptir. Sabah eyaletindeki Crocker Sıradağları'nda yükselen 4.095 metrelik granit kütle Kinabalu Dağı, hem Malezya'nın hem de Güneydoğu Asya ada dünyasının en yüksek noktasıdır. Sarawak içlerinde ise Endonezya sınırına uzanan dağlık yaylalar ve Gunung Mulu'daki devasa karstik mağara sistemleri yer alır; kıyıya yaklaşıldıkça arazi geniş mangrov ve turba bataklıklarına dönüşür.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MY',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Malezya'nın akarsuları yağış rejimine bağlı olarak yıl boyu bol su taşır; ancak akarsuların yapısı coğrafi bölgelere göre ayrışır. Batı Malezya'da akarsular Titiwangsa Dağları'ndan doğarak batıya Malakka Boğazı'na ya da doğuya Güney Çin Denizi'ne dökülür; 459 kilometrelik Pahang Nehri yarımadanın en uzun akarsuyudur.\n\nDoğu Malezya'da ise yağmur ormanlarının iç kesimlerini kıyıya bağlayan çok daha uzun ve yüksek debili nehir sistemleri uzanır. Sarawak'taki 563 kilometrelik Rajang Nehri ülkenin en uzun akarsuyu olup iç kesimlerdeki yerleşim taşımacılığının can damarıdır. Sabah'taki 560 kilometrelik Kinabatangan Nehri ise zengin taşkın ovaları ve oxbow gölleriyle zengin bir yaban hayatı sığınağı oluşturur.",
    after:
      "Malezya'nın akarsuları yağış rejimine bağlı olarak yıl boyu bol su taşır; ancak akarsuların yapısı coğrafi bölgelere göre ayrışır. Batı Malezya'da akarsular Titiwangsa Dağları'ndan doğarak batıya Malakka Boğazı'na ya da doğuya Güney Çin Denizi'ne dökülür; 459 kilometrelik Pahang Nehri yarımadanın en uzun akarsuyudur.\n\nDoğu Malezya'da ise yağmur ormanlarının iç kesimlerini kıyıya bağlayan çok daha uzun ve yüksek debili nehir sistemleri uzanır. Sarawak'taki 563 kilometrelik Rajang Nehri ülkenin en uzun akarsuyu olup iç kesimlerdeki yerleşim taşımacılığının can damarıdır. Sabah'taki 560 kilometrelik Kinabatangan Nehri ise zengin taşkın ovaları ve menderes gölleriyle zengin bir yaban hayatı sığınağı oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MM',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Tropikal muson ikliminin egemen olduğu Myanmar'da yağışın mekansal dağılımını, kuzey-güney uzanışlı sıradağların oluşturduğu orografik engeller yönlendirir. Mayıs ile ekim ayları arasında Bengal Körfezi'nden esen güneybatı musonu, kıyı şeritlerine ve batı yamaçlarına olağanüstü miktarda yağış bırakır; Rakhine kıyılarında yıllık yağış 5.000 milimetreyi aşar.\n\nBuna karşılık Arakan Dağları'nı aşarken nemini bırakan hava akımları, Mandalay ve Pagan'ı içine alan merkezi ovaya fön etkisiyle kuru olarak iner. \"Kuru Bölge\" (Dry Zone) olarak adlandırılan bu iç havzada yıllık yağış 700-1.000 milimetreye kadar gerileyerek yarı kurak savan koşulları üretir. Kış aylarındaki kuzeydoğu musonu ise ülke geneline kuru ve serin hava taşır.",
    after:
      "Tropikal muson ikliminin egemen olduğu Myanmar'da yağışın ülke içindeki dağılımını, kuzey-güney doğrultusunda uzanan sıradağların nemli rüzgarların önüne çektiği engeller belirler. Mayıs ile ekim ayları arasında Bengal Körfezi'nden esen güneybatı musonu, kıyı şeritlerine ve batı yamaçlarına olağanüstü miktarda yağış bırakır; Rakhine kıyılarında yıllık yağış 5.000 milimetreyi aşar.\n\nBuna karşılık Arakan Dağları'nı aşarken nemini bırakan hava akımları, Mandalay ve Pagan'ı içine alan merkezi ovaya fön etkisiyle kuru olarak iner. \"Kuru Bölge\" olarak adlandırılan bu iç havzada yıllık yağış 700-1.000 milimetreye kadar gerileyerek yarı kurak savan koşulları üretir. Kış aylarındaki kuzeydoğu musonu ise ülke geneline kuru ve serin hava taşır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'PH',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Takımadada yıl boyunca 26-28 derece civarında seyreden tropikal deniz iklimi egemendir. İklimin mekansal yapısını, kasım-nisan dönemindeki serin ve kuru kuzeydoğu musonu (Amihan) ile mayıs-ekim dönemindeki sıcak ve yağışlı güneybatı musonu (Habagat) biçimlendirir.\n\nÜlkenin iklimsel ve beşeri kaderini belirleyen en kritik doğa olayı tropikal siklonlardır (tayfunlar). Sıcak Pasifik suları üzerinde oluşan tayfunlar yılda ortalama 20 kez ülkeyi etkiler ve özellikle Luzon ile doğu Visayas kıyılarına olağanüstü yağışlar, heyelanlar ve fırtına dalgaları taşır. Doğuya bakan dağ yamaçlarında yıllık yağış 4.000 milimetreyi aşarken, dağların koruduğu batı vadilerinde belirgin bir kurak dönem yaşanır.',
    after:
      'Takımadada yıl boyunca 26-28 derece civarında seyreden tropikal deniz iklimi egemendir. İklimi, kasım-nisan dönemindeki serin ve kuru kuzeydoğu musonu (Amihan) ile mayıs-ekim dönemindeki sıcak ve yağışlı güneybatı musonu (Habagat) biçimlendirir.\n\nÜlkenin iklimsel ve beşeri kaderini belirleyen en kritik doğa olayı tropikal siklonlardır (tayfunlar). Sıcak Pasifik suları üzerinde oluşan tayfunlar yılda ortalama 20 kez ülkeyi etkiler ve özellikle Luzon ile doğu Visayas kıyılarına olağanüstü yağışlar, heyelanlar ve fırtına dalgaları taşır. Doğuya bakan dağ yamaçlarında yıllık yağış 4.000 milimetreyi aşarken, dağların koruduğu batı vadilerinde belirgin bir kurak dönem yaşanır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'PH',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Parçalı ada yapısı ve sarp orografisi nedeniyle Filipinler'deki akarsular genellikle kısa, dik eğimli ve sel rejimli akış gösterir. En büyük istisna, Kuzey Luzon'da Cordillera Central ile Sierra Madre dağları arasındaki geniş vadiden geçerek Babuyan Kanalı'na dökülen 505 kilometrelik Cagayan Nehri'dir; nehir ülkenin en uzun ve en geniş havzalı akarsuyudur.\n\nMindanao Adası'ndaki Rio Grande de Mindanao ve Agusan nehirleri ise güneyin en geniş bataklık ve taşkın ovalarını drene eder. Başkent Manila'nın doğusunda yer alan 900 kilometrekarelik Laguna de Bay, ülkenin en büyük tatlı su gölü olup Pasig Nehri aracılığıyla Manila Körfezi'ne bağlanır; göl hem balıkçılık hem de kentsel su temini açısından stratejik bir işleve sahiptir.",
    after:
      "Parçalı ada yapısı ve sarp dağları nedeniyle Filipinler'deki akarsular genellikle kısa, dik eğimli ve sel rejimli akış gösterir. En büyük istisna, Kuzey Luzon'da Cordillera Central ile Sierra Madre dağları arasındaki geniş vadiden geçerek Babuyan Kanalı'na dökülen 505 kilometrelik Cagayan Nehri'dir; nehir ülkenin en uzun ve en geniş havzalı akarsuyudur.\n\nMindanao Adası'ndaki Rio Grande de Mindanao ve Agusan nehirleri ise güneyin en geniş bataklık ve taşkın ovalarının sularını toplar. Başkent Manila'nın doğusunda yer alan 900 kilometrekarelik Laguna de Bay, ülkenin en büyük tatlı su gölü olup Pasig Nehri aracılığıyla Manila Körfezi'ne bağlanır; göl hem balıkçılık hem de kentsel su temini açısından stratejik bir işleve sahiptir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SG',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Malay Yarımadası'nın en güney ucunda yer alan Singapur; ana ada ile onu çevreleyen 60'ı aşkın adacıktan meydana gelen son derece yoğun bir ada şehir devletidir. Kuzeyde dar Johor Boğazı ile Malezya'dan, güneyde ise küresel deniz ticaretinin ana arterlerinden Singapur Boğazı ile Endonezya'nın Riau Adaları'ndan ayrılır.\n\nKırsal bir hinterlandı bulunmayan ve topraklarının neredeyse tamamı kentsel dokuyla kaplı olan ada, Hint Okyanusu ile Güney Çin Denizi'ni bağlayan stratejik boğaz konumu sayesinde dünyanın en işlek liman ve lojistik merkezlerinden birine dönüşmüştür.",
    after:
      "Malay Yarımadası'nın en güney ucunda yer alan Singapur; ana ada ile onu çevreleyen 60'ı aşkın adacıktan meydana gelen son derece yoğun bir ada şehir devletidir. Kuzeyde dar Johor Boğazı ile Malezya'dan, güneyde ise küresel deniz ticaretinin ana arterlerinden Singapur Boğazı ile Endonezya'nın Riau Adaları'ndan ayrılır.\n\nKırsal bir art bölgesi bulunmayan ve topraklarının neredeyse tamamı kentsel dokuyla kaplı olan ada, Hint Okyanusu ile Güney Çin Denizi'ni bağlayan stratejik boğaz konumu sayesinde dünyanın en işlek liman ve lojistik merkezlerinden birine dönüşmüştür.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SG',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Ekvatorun yalnızca bir derece kuzeyinde yer alan Singapur'da, mevsimsel sıcaklık salınımı neredeyse bulunmayan, yıl boyu sıcak ve nemli ekvatoral iklim hüküm sürer. Günlük ortalama sıcaklık 27-28 derece civarında sabit kalırken bağıl nem nadiren yüzde 70'in altına iner.\n\nYılın her ayında konvektif öğleden sonra fırtınaları şeklinde yoğun yağış görülür; yıllık yağış ortalaması 2.300 milimetreyi aşar. Yağışlar kasım ile ocak ayları arasındaki kuzeydoğu musonu döneminde en şiddetli seviyeye ulaşır. Tayfun kuşağının güneyinde kaldığı için tropikal siklonlardan doğrudan etkilenmeyen ada, ani yağış anlarında şehir içi su baskınlarını önlemek için devasa yeraltı drenaj tünelleri geliştirmiştir.",
    after:
      "Ekvatorun yalnızca bir derece kuzeyinde yer alan Singapur'da, mevsimler arasında sıcaklık farkı neredeyse bulunmayan, yıl boyu sıcak ve nemli ekvatoral iklim hüküm sürer. Günlük ortalama sıcaklık 27-28 derece civarında sabit kalırken bağıl nem nadiren yüzde 70'in altına iner.\n\nYılın her ayında, ısınan havanın yükselmesiyle oluşan öğleden sonra fırtınaları şeklinde yoğun yağış görülür; yıllık yağış ortalaması 2.300 milimetreyi aşar. Yağışlar kasım ile ocak ayları arasındaki kuzeydoğu musonu döneminde en şiddetli seviyeye ulaşır. Tayfun kuşağının güneyinde kaldığı için tropikal siklonlardan doğrudan etkilenmeyen ada, ani yağış anlarında şehir içi su baskınlarını önlemek için devasa yeraltı drenaj tünelleri geliştirmiştir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SG',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Kısıtlı yüzölçümü ve dağlık havzaların yokluğu nedeniyle Singapur'da doğal büyük nehirler ya da göller bulunmaz. Ancak ülke, mühendislik harikası entegre bir kentsel su toplama sistemiyle topraklarının üçte ikisini kapalı tatlı su havzasına dönüştürmüştür.\n\nKallang, Geylang ve Singapur nehirlerinin denize döküldüğü körfez ağzına inşa edilen Marina Barajı, deniz suyunu keserek kentin merkezinde devasa bir tatlı su rezervuarı oluşturmuştur. Adadaki 17 baraj gölünde toplanan yağmur suları, ileri arıtma teknolojileri (NEWater) ve deniz suyu arıtma tesisleriyle birleştirilerek ülkenin tarihsel su bağımlılığı stratejik olarak kırılmıştır.",
    after:
      "Kısıtlı yüzölçümü ve dağlık havzaların yokluğu nedeniyle Singapur'da doğal büyük nehirler ya da göller bulunmaz. Ancak ülke, mühendislik harikası, birbirine bağlı bir kentsel su toplama sistemiyle topraklarının üçte ikisini kapalı tatlı su havzasına dönüştürmüştür.\n\nKallang, Geylang ve Singapur nehirlerinin denize döküldüğü körfez ağzına inşa edilen Marina Barajı, deniz suyunu keserek kentin merkezinde devasa bir tatlı su rezervuarı oluşturmuştur. Adadaki 17 baraj gölünde toplanan yağmur suları, ileri arıtma teknolojileri (NEWater) ve deniz suyu arıtma tesisleriyle birleştirilerek ülkenin tarihsel su bağımlılığı stratejik olarak kırılmıştır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TH',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Tayland belirgin jeomorfolojik bölgelere ayrılır. Kuzeyde Myanmar sınırından sarkan dağ sıraları uzanır; Thanon Thong Chai kuşağında yer alan 2.565 metrelik granit kütle Doi Inthanon ülkenin en yüksek zirvesidir. Kuzeydoğuda ise kumtaşından oluşan ve kuzey ile doğudan Mekong Nehri ile kuşatılan yarı kurak Khorat Platosu uzanır.\n\nÜlkenin kalbi sayılan Merkez Ovası, Chao Phraya ve kolları tarafından doldurulmuş sığ, son derece verimli bir taşkın düzlüğüdür. Güneye doğru inildikçe Malay Yarımadası daralır; Kra Kıstağı'nda genişliği yalnızca 44 kilometreye inen bu dağlık şerit, kireçtaşı karst kuleleri ve mercan adalarıyla Andaman kıyılarını şekillendirir.",
    after:
      "Tayland yer şekilleri bakımından belirgin bölgelere ayrılır. Kuzeyde Myanmar sınırından sarkan dağ sıraları uzanır; Thanon Thong Chai kuşağında yer alan 2.565 metrelik granit kütle Doi Inthanon ülkenin en yüksek zirvesidir. Kuzeydoğuda ise kumtaşından oluşan ve kuzey ile doğudan Mekong Nehri ile kuşatılan yarı kurak Khorat Platosu uzanır.\n\nÜlkenin kalbi sayılan Merkez Ovası, Chao Phraya ve kolları tarafından doldurulmuş sığ, son derece verimli bir taşkın düzlüğüdür. Güneye doğru inildikçe Malay Yarımadası daralır; Kra Kıstağı'nda genişliği yalnızca 44 kilometreye inen bu dağlık şerit, kireçtaşı karst kuleleri ve mercan adalarıyla Andaman kıyılarını şekillendirir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TH',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Tayland genelinde tropikal muson ve savan iklimi hüküm sürer. Yıl, atmosferik hava kütlelerinin yön değiştirmesiyle üç mevsimsel döngüye ayrılır: Mayıs ile ekim arasında Hint Okyanusu'ndan esen güneybatı musonu sağanak yağışlar ve yüksek nem getirir; kasım-şubat döneminde Asya anakarasından gelen kuru kuzeydoğu musonu serin ve açık bir kış yaratır; mart-mayıs ayları ise sıcaklıkların 40 dereceyi aştığı bunaltıcı sıcak dönemdir.\n\nBölgesel topoğrafya yağış miktarını keskin biçimde farklılaştırır. Khorat Platosu batıdaki dağların yağış gölgesinde kaldığı için kuraklık çekerken, güneydeki yarımada şeridi her iki yönden gelen denizel hava kütlelerinin etkisiyle yılda 2.500 milimetreyi aşan yağış alır ve kurak mevsim yaşamayan tropikal yağmur ormanı iklimine yaklaşır.",
    after:
      "Tayland genelinde tropikal muson ve savan iklimi hüküm sürer. Yıl, hava kütlelerinin yön değiştirmesiyle üç mevsime ayrılır: Mayıs ile ekim arasında Hint Okyanusu'ndan esen güneybatı musonu sağanak yağışlar ve yüksek nem getirir; kasım-şubat döneminde Asya anakarasından gelen kuru kuzeydoğu musonu serin ve açık bir kış yaratır; mart-mayıs ayları ise sıcaklıkların 40 dereceyi aştığı bunaltıcı sıcak dönemdir.\n\nBölgesel topoğrafya yağış miktarını keskin biçimde farklılaştırır. Khorat Platosu batıdaki dağların yağış gölgesinde kaldığı için kuraklık çekerken, güneydeki yarımada şeridi her iki yönden gelen denizel hava kütlelerinin etkisiyle yılda 2.500 milimetreyi aşan yağış alır ve kurak mevsim yaşamayan tropikal yağmur ormanı iklimine yaklaşır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TH',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Tayland'ın milli nehri, kuzey dağlarından inen Ping, Wang, Yom ve Nan nehirlerinin Nakhon Sawan'da birleşmesiyle doğan 372 kilometrelik Chao Phraya'dır (kollarıyla 1.100 km). Başkent Bangkok'un içinden geçerek Tayland Körfezi'ne dökülen nehir, oluşturduğu geniş kanal (khlong) ve delta ağıyla ülkenin çeltik ambarını sular ve iç su taşımacılığını sırtlar.\n\nKuzey ve kuzeydoğu sınırının yaklaşık 900 kilometresini çizen Mekong Nehri ise Khorat Platosu'nu drene eden Mun ve Chi nehirlerini sularına katar. Ülkenin en büyük doğal tatlı su gölü kuzeydeki 225 kilometrekarelik Bueng Boraphet iken, güney yarımadada yer alan Songkhla Gölü denize lagün kanalıyla bağlanan geniş bir acı su havzasıdır.",
    after:
      "Tayland'ın milli nehri, kuzey dağlarından inen Ping, Wang, Yom ve Nan nehirlerinin Nakhon Sawan'da birleşmesiyle doğan 372 kilometrelik Chao Phraya'dır (kollarıyla 1.100 km). Başkent Bangkok'un içinden geçerek Tayland Körfezi'ne dökülen nehir, oluşturduğu geniş kanal (khlong) ve delta ağıyla ülkenin çeltik ambarını sular ve iç su taşımacılığını sırtlar.\n\nKuzey ve kuzeydoğu sınırının yaklaşık 900 kilometresini çizen Mekong Nehri ise Khorat Platosu'nun sularını toplayan Mun ve Chi nehirlerini sularına katar. Ülkenin en büyük doğal tatlı su gölü kuzeydeki 225 kilometrekarelik Bueng Boraphet iken, güney yarımadada yer alan Songkhla Gölü denize lagün kanalıyla bağlanan geniş bir acı su havzasıdır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TL',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Doğu Timor'un iklimi, Avustralya kıtasına yakınlığı ve merkezi sıradağlarının orografik etkisiyle şekillenen tropikal savan ve muson rejimidir. Yıl, aralık ile mart ayları arasındaki nemli kuzeybatı musonu ile mayıs-ekim dönemindeki kuru güneydoğu alizeleri arasında bölünür.\n\nMerkezi dağ omurgası, ada üzerinde dramatik bir yağış karşıtlığı üretir. Avustralya'dan esen kuru rüzgarların dağları aşarken nemini yitirmesi sonucu başkent Dili'nin de yer aldığı kuzey kıyısı yağış gölgesinde kalır; burada yıllık yağış 600-1.000 milimetre arasında kalarak kaktüslü kurak savan bitki örtüsü oluşturur. Buna karşılık güney yamaçları ve iç yaylalar yılda 2.000 ila 2.800 milimetre yağış alarak yemyeşil tropikal ormanları besler.",
    after:
      "Doğu Timor'un iklimi, Avustralya kıtasına yakınlığı ve ortadaki sıradağların yağışa etkisiyle şekillenen tropikal savan ve muson rejimidir. Yıl, aralık ile mart ayları arasındaki nemli kuzeybatı musonu ile mayıs-ekim dönemindeki kuru güneydoğu alizeleri arasında bölünür.\n\nOrtadaki dağ omurgası, adada çarpıcı bir yağış farkı yaratır. Avustralya'dan esen kuru rüzgarların dağları aşarken nemini yitirmesi sonucu başkent Dili'nin de yer aldığı kuzey kıyısı yağış gölgesinde kalır; burada yıllık yağış 600-1.000 milimetre arasında kalarak kaktüslü kurak savan bitki örtüsü oluşturur. Buna karşılık güney yamaçları ve iç yaylalar yılda 2.000 ila 2.800 milimetre yağış alarak yemyeşil tropikal ormanları besler.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TL',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Arazinin aşırı dik eğimi ve belirgin kurak dönemi nedeniyle Doğu Timor'daki akarsular, mevsimsel akışlı ve sel rejimli tipik sel yatakları karakterindedir. Yağışlı mevsimde dağlardan devasa tortu kütleleri taşıyarak taşan nehirler, kurak mevsimde neredeyse tamamen kuruyarak çakıllı yataklara dönüşür.\n\nÜlkenin en uzun akarsuyu olan 80 kilometrelik Loes Nehri, merkezi yaylaları drene ederek kuzeybatı kıyısından denize dökülür; Laclo ve Seical nehirleri de derin kanyonlar oyarak kuzeye akar. Ülkenin doğu ucundaki Nino Konis Santana Milli Parkı içinde yer alan 22 kilometrekarelik Ira Lalaro Gölü, Doğu Timor'un en büyük tatlı su gölü olup karstik çöküntü havzasında mevsimsel olarak genişleyip daralan benzersiz bir sulak alandır.",
    after:
      "Arazinin aşırı dik eğimi ve belirgin kurak dönemi nedeniyle Doğu Timor'daki akarsular, mevsimsel akışlı ve sel rejimli tipik sel yatakları karakterindedir. Yağışlı mevsimde dağlardan devasa tortu kütleleri taşıyarak taşan nehirler, kurak mevsimde neredeyse tamamen kuruyarak çakıllı yataklara dönüşür.\n\nÜlkenin en uzun akarsuyu olan 80 kilometrelik Loes Nehri, merkezi yaylaların sularını toplayarak kuzeybatı kıyısından denize dökülür; Laclo ve Seical nehirleri de derin kanyonlar oyarak kuzeye akar. Ülkenin doğu ucundaki Nino Konis Santana Milli Parkı içinde yer alan 22 kilometrekarelik Ira Lalaro Gölü, Doğu Timor'un en büyük tatlı su gölü olup karstik çöküntü havzasında mevsimsel olarak genişleyip daralan benzersiz bir sulak alandır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'VN',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      'Hint-Çin Yarımadası\'nın doğu kıyısı boyunca kuzeyden güneye 1.650 kilometre boyunca zarif bir "S" harfi çizerek uzanan Vietnam; kuzeyde Çin, batıda Laos ve Kamboçya ile komşudur. Doğu ve güneyde 3.200 kilometreyi aşan kıyı şeridiyle Güney Çin Denizi\'ne (ülkedeki adıyla Doğu Denizi) açılır.\n\nÜlke geleneksel olarak "bir sırığın iki ucundaki iki pirinç sepeti" metaforuyla tasvir edilir: Kuzeyde başkent Hanoi\'nin merkezinde olduğu Kızıl Nehir Deltası ile güneyde Ho Chi Minh Kenti\'nin ticaretini besleyen Mekong Deltası, ortadaki sarp Annam Sıradağları ve dar kıyı koridoruyla birbirine bağlanır.',
    after:
      'Hint-Çin Yarımadası\'nın doğu kıyısı boyunca kuzeyden güneye 1.650 kilometre boyunca zarif bir "S" harfi çizerek uzanan Vietnam; kuzeyde Çin, batıda Laos ve Kamboçya ile komşudur. Doğu ve güneyde 3.200 kilometreyi aşan kıyı şeridiyle Güney Çin Denizi\'ne (ülkedeki adıyla Doğu Denizi) açılır.\n\nÜlke geleneksel olarak "bir sırığın iki ucundaki iki pirinç sepeti" benzetmesiyle anlatılır: Kuzeyde başkent Hanoi\'nin merkezinde olduğu Kızıl Nehir Deltası ile güneyde Ho Chi Minh Kenti\'nin ticaretini besleyen Mekong Deltası, ortadaki sarp Annam Sıradağları ve dar kıyı koridoruyla birbirine bağlanır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'VN',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Vietnam topraklarının dörtte üçü dağlık ve tepelik arazilerden oluşur; ovalar yalnızca iki ana deltada ve kıyı boyunca uzanan ince şeritte toplanmıştır. Kuzeybatıda yükselen Hoàng Liên Sơn Sıradağları'ndaki 3.147 metrelik Fansipan Zirvesi, hem Vietnam'ın hem de tüm Hint-Çin Yarımadası'nın en yüksek noktasıdır.\n\nLaos sınırı boyunca güneye inen Annam Sıradağları (Trường Sơn), ülkenin omurgasını oluşturarak kıyı şeridini iç platolardan ayırır. Dağların güney ucunda yer alan Tay Nguyen (Merkezi Yaylalar) verimli bazaltik topraklarıyla ülkenin kahve ve kauçuk kalbidir. Kuzeydoğudaki Tonkin Körfezi'nde ise kireçtaşlarının deniz sularıyla aşınmasıyla oluşmuş binlerce karstik kule adayı barındıran ünlü Ha Long Körfezi uzanır.",
    after:
      "Vietnam topraklarının dörtte üçü dağlık ve tepelik arazilerden oluşur; ovalar yalnızca iki ana deltada ve kıyı boyunca uzanan ince şeritte toplanmıştır. Kuzeybatıda yükselen Hoàng Liên Sơn Sıradağları'ndaki 3.147 metrelik Fansipan Zirvesi, hem Vietnam'ın hem de Vietnam, Laos ve Kamboçya'yı kapsayan Hint-Çin'in en yüksek noktasıdır.\n\nLaos sınırı boyunca güneye inen Annam Sıradağları (Trường Sơn), ülkenin omurgasını oluşturarak kıyı şeridini iç platolardan ayırır. Dağların güney ucunda yer alan Tay Nguyen (Merkezi Yaylalar) verimli bazaltik topraklarıyla ülkenin kahve ve kauçuk kalbidir. Kuzeydoğudaki Tonkin Körfezi'nde ise kireçtaşlarının deniz sularıyla aşınmasıyla oluşmuş binlerce karstik kule adayı barındıran ünlü Ha Long Körfezi uzanır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AF',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Güney Asya ile Orta Asya'nın kesişim noktasında yer alan Afganistan, bütünüyle kara içine kilitlenmiş, sarp ve engebeli bir yayla ülkesidir. Doğudan batıya doğru uzanarak ülkeyi ortadan bölen Hindukuş Dağları, hem yerleşim dokusunu hem de tarih boyunca kıtayı kateden ticaret ve göç yollarını biçimlendirmiştir. Kuzeydoğuda Pamir Düğümü'ne doğru bir parmak gibi uzanan dar Vahan Koridoru, ülkeye Çin ile doğrudan bir temas hattı sağlar. \n\nYerleşimlerin ezici çoğunluğu, sert dağ kütlelerinin arasına sıkışmış nehir vadilerinde ve alüvyal vahalar boyunca toplanmıştır. Başkent Kabil de dahil olmak üzere büyük kentler, merkezi dağlık kütlenin etrafını çevreleyen halka biçimli bir güzergah üzerinde dizilir; bu topoğrafik tecrit, tarihsel olarak bölgesel kimliklerin güçlenmesine ve dağlık iç kesimlerin merkezi denetimden uzak kalmasına yol açmıştır.",
    after:
      "Güney Asya ile Orta Asya'nın kesişim noktasında yer alan Afganistan, bütünüyle kara içine kilitlenmiş, sarp ve engebeli bir yayla ülkesidir. Doğudan batıya doğru uzanarak ülkeyi ortadan bölen Hindukuş Dağları, hem yerleşim dokusunu hem de tarih boyunca kıtayı kateden ticaret ve göç yollarını biçimlendirmiştir. Kuzeydoğuda Pamir Düğümü'ne doğru bir parmak gibi uzanan dar Vahan Koridoru, ülkeye Çin ile doğrudan bir temas hattı sağlar. \n\nYerleşimlerin ezici çoğunluğu, sert dağ kütlelerinin arasına sıkışmış nehir vadilerinde ve alüvyal vahalar boyunca toplanmıştır. Başkent Kabil de dahil olmak üzere büyük kentler, merkezi dağlık kütlenin etrafını çevreleyen halka biçimli bir güzergah üzerinde dizilir; dağların yarattığı bu yalıtılmışlık, tarihsel olarak bölgesel kimliklerin güçlenmesine ve dağlık iç kesimlerin merkezi denetimden uzak kalmasına yol açmıştır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AF',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Deniz etkisinden bütünüyle yoksun olan ülkede aşırı sıcaklık farklarıyla tanımlanan sert bir yarı kurak ve karasal iklim hüküm sürer. Yaz aylarında alçak çöl havzalarında termometreler 49 dereceye kadar tırmanırken, kışın yüksek dağlık vadilerde dondurucu soğuklar sıfırın altında 25 derecenin altına iner. Gece ile gündüz arasındaki keskin sıcaklık salınımları, dağlık topoğrafyanın mekanik ufalanmasını hızlandırır. \n\nYağışlar genel olarak yetersizdir ve büyük ölçüde kış sonu ile ilkbahar başında düşen kar ve sağanaklardan ibarettir; yıllık ortalama yağış çoğu bölgede 300 milimetrenin altında kalır. Yalnızca güneydoğudaki Nuristan ve Kunar vadileri, Hint musonunun nemli kollarına açık kaldığı için 1.000 milimetreyi bulan yağış alır ve zengin iğne yapraklı orman örtüsünü besler.',
    after:
      'Deniz etkisinden bütünüyle yoksun olan ülkede aşırı sıcaklık farklarıyla tanımlanan sert bir yarı kurak ve karasal iklim hüküm sürer. Yaz aylarında alçak çöl havzalarında termometreler 49 dereceye kadar tırmanırken, kışın yüksek dağlık vadilerde dondurucu soğuklar sıfırın altında 25 derecenin altına iner. Gece ile gündüz arasındaki keskin sıcaklık salınımları, dağlardaki kayaların çatlayıp parçalanmasını (mekanik çözülme) hızlandırır. \n\nYağışlar genel olarak yetersizdir ve büyük ölçüde kış sonu ile ilkbahar başında düşen kar ve sağanaklardan ibarettir; yıllık ortalama yağış çoğu bölgede 300 milimetrenin altında kalır. Yalnızca güneydoğudaki Nuristan ve Kunar vadileri, Hint musonunun nemli kollarına açık kaldığı için 1.000 milimetreyi bulan yağış alır ve zengin iğne yapraklı orman örtüsünü besler.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BD',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ülke yüzölçümünün yaklaşık yüzde sekseni, yaklaşık 105.000 kilometrekarelik yayılımıyla gezegenin en büyük delta sistemini oluşturan Bengal Havzası'nın çöküntü düzlüklerinden meydana gelir. Kıyı kesiminde denizden yüksekliği yalnızca birkaç metreyi bulan bu bataklık ve delta topraklarının güneybatısında, Bengal kaplanına da ev sahipliği yapan dünyanın en geniş kesintisiz mangrov ekosistemi Sundarbans uzanır. \n\nMonoton delta topoğrafyasının yegane istisnası, güneydoğuda Myanmar sınırına paralel uzanan Chittagong Tepeleri'dir. Karstik ve kireçtaşılı katmanların oluşturduğu 200 ila 1.000 metre rakımlı bu ormanlık sırtlar kuşağında yer alan yaklaşık 1.063 metrelik Saka Haphong zirvesi, ülkenin en yüksek noktasıdır.",
    after:
      "Ülke yüzölçümünün yaklaşık yüzde sekseni, yaklaşık 105.000 kilometrekarelik yayılımıyla gezegenin en büyük delta sistemini oluşturan Bengal Havzası'nın çöküntü düzlüklerinden meydana gelir. Kıyı kesiminde denizden yüksekliği yalnızca birkaç metreyi bulan bu bataklık ve delta topraklarının güneybatısında, Bengal kaplanına da ev sahipliği yapan dünyanın en geniş kesintisiz mangrov ekosistemi Sundarbans uzanır. \n\nDüz ve tekdüze delta arazisinin tek istisnası, güneydoğuda Myanmar sınırına paralel uzanan Chittagong Tepeleri'dir. Kıvrılmış kumtaşı ve şeyl katmanlarının oluşturduğu 200 ila 1.000 metre rakımlı bu ormanlık sırtlar kuşağında yer alan yaklaşık 1.063 metrelik Saka Haphong zirvesi, ülkenin en yüksek noktasıdır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BD',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Yıl boyu yüksek sıcaklıkların egemen olduğu ülkede yaşamı tropikal muson döngüsü yönetir. Haziran ile eylül ayları arasındaki güneybatı musonu, Hint Okyanusu'ndan taşıdığı muazzam nemi boşaltarak yıllık yağışın yüzde seksenini bu döneme yığar. Nehir debilerinin kabarması ve sığ yataklardan taşmasıyla her yıl ülke topraklarının üçte biri sular altında kalır; bu taşkınlar felaketlere yol açabildiği gibi tarlalara taze ve verimli silt tabakaları da kazandırır. \n\nMevsim geçişlerinde, özellikle nisan-mayıs ve ekim-kasım aylarında Bengal Körfezi'nde oluşan tropikal siklonlar kıyı şeridini vurur. Körfezin kuzeye doğru daralan huni biçimli morfolojisi, fırtına kabarmalarını metrelerce yükselterek alçak kıyı yerleşimlerinde ve açık deniz adacıklarında şiddetli su baskınlarına neden olur.",
    after:
      "Yıl boyu yüksek sıcaklıkların egemen olduğu ülkede yaşamı tropikal muson döngüsü yönetir. Haziran ile eylül ayları arasındaki güneybatı musonu, Hint Okyanusu'ndan taşıdığı muazzam nemi boşaltarak yıllık yağışın yüzde seksenini bu döneme yığar. Nehir debilerinin kabarması ve sığ yataklardan taşmasıyla her yıl ülke topraklarının üçte biri sular altında kalır; bu taşkınlar felaketlere yol açabildiği gibi tarlalara taze ve verimli silt tabakaları da kazandırır. \n\nMevsim geçişlerinde, özellikle nisan-mayıs ve ekim-kasım aylarında Bengal Körfezi'nde oluşan tropikal siklonlar kıyı şeridini vurur. Körfezin kuzeye doğru daralan huni biçimli yapısı, fırtınanın kabarttığı deniz suyunu metrelerce yükselterek alçak kıyı yerleşimlerinde ve açık deniz adacıklarında şiddetli su baskınlarına neden olur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BD',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Bangladeş'in hidrografik omurgasını üç ana nehir damarı belirler: Ülkeye batıdan giren Ganj burada Padma, kuzeyden inen Brahmaputra ise Jamuna adını alır. Bu iki devasa su kütlesi Goalanda yakınlarında birleştikten sonra güneydoğudan gelen Meghna ile kucaklaşarak genişleyen nehir ağızlarıyla Bengal Körfezi'ne dökülür. \n\nAna kollardan ayrılan ve birbirine bağlanan yüzlerce dağıtım kanalı, ülkeyi adeta dev bir su labirentine çevirir. Karayolu ulaşımının güç olduğu taşkın düzlüklerinde bu nehirler hem ana taşımacılık arterlerini meydana getirir hem de ülkenin zengin tatlı su balıkçılığını besler. Doğu tepeliklerinden inen ve hızlı akışıyla bilinen Karnaphuli Nehri ise ülkenin en büyük liman kenti Chittagong'u denize bağlar.",
    after:
      "Bangladeş'in akarsu ağının omurgasını üç ana nehir damarı belirler: Ülkeye batıdan giren Ganj burada Padma, kuzeyden inen Brahmaputra ise Jamuna adını alır. Bu iki devasa su kütlesi Goalanda yakınlarında birleştikten sonra güneydoğudan gelen Meghna ile kucaklaşarak genişleyen nehir ağızlarıyla Bengal Körfezi'ne dökülür. \n\nAna kollardan ayrılan ve birbirine bağlanan yüzlerce dağıtım kanalı, ülkeyi adeta dev bir su labirentine çevirir. Karayolu ulaşımının güç olduğu taşkın düzlüklerinde bu nehirler hem ana taşımacılık arterlerini meydana getirir hem de ülkenin zengin tatlı su balıkçılığını besler. Doğu tepeliklerinden inen ve hızlı akışıyla bilinen Karnaphuli Nehri ise ülkenin en büyük liman kenti Chittagong'u denize bağlar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BT',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Doğu Himalayaların güney yamaçlarında kurulu olan Butan, kuzeyde Tibet Platosu (Çin), güney, doğu ve batıda ise Hindistan ile çevrili bir dağ krallığıdır. Okyanusa kıyısı olmayan ülke, güneydeki subtropikal orman ovalarından kuzeydeki daimi karlı kutup benzeri doruklara kadar yalnızca 150 kilometrelik bir mesafede 7.000 metreyi aşan olağanüstü bir dikey basamaklanma sergiler. \n\nYerleşim dokusu, yüksek sıradağların arasına oyulmuş korunaklı iç vadilerde kümelenmiştir. Başkent Thimphu da dahil olmak üzere ülkenin tarihi manastır-kaleleri (dzong), nehir yataklarının teraslarında ve yamaçlarda yer alır; orman örtüsünü ve kültürel mirası korumayı esas alan sıkı çevre politikaları, Butan'ı dünyada karbon negatif olan ender ülkelerden biri haline getirmiştir.",
    after:
      "Doğu Himalayaların güney yamaçlarında kurulu olan Butan, kuzeyde Tibet Platosu (Çin), güney, doğu ve batıda ise Hindistan ile çevrili bir dağ krallığıdır. Okyanusa kıyısı olmayan ülke, güneydeki subtropikal orman ovalarından kuzeydeki daimi karlı kutup benzeri doruklara kadar yalnızca 150 kilometrelik bir mesafede 7.000 metreyi aşan olağanüstü bir yükselti farkı gösterir. \n\nYerleşim dokusu, yüksek sıradağların arasına oyulmuş korunaklı iç vadilerde kümelenmiştir. Başkent Thimphu da dahil olmak üzere ülkenin tarihi manastır-kaleleri (dzong), nehir yataklarının teraslarında ve yamaçlarda yer alır; orman örtüsünü ve kültürel mirası korumayı esas alan sıkı çevre politikaları, Butan'ı dünyada karbon negatif olan ender ülkelerden biri haline getirmiştir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BT',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ülke topoğrafyası güneyden kuzeye yükselen üç belirgin morfolojik kuşaktan oluşur. En güneyde Hindistan sınırını izleyen dar Duars Ovası, kalın ormanlar ve alüvyal konilerle kaplıdır. Orta kesimi oluşturan 1.500 ila 2.700 metre irtifadaki İç Himalayalar; derin vadileri, teraslı tarım alanları ve ormanlık sırtlarıyla ülke nüfusunun ve tarihi yerleşimlerinin ağırlık merkezidir. \n\nKuzey kuşağında ise Büyük Himalayaların sarp, buzul aşındırmalı granit kütleleri göğe yükselir. Tibet sınır hattında yükselen 7.570 metrelik Gangkhar Puensum, Butan'ın en yüksek noktası olup yerel inançlar uyarınca kutsal sayılan dağlara tırmanışın yasaklanması nedeniyle gezegenin fethedilmemiş en yüksek doruğu kabul edilir.",
    after:
      "Ülke topoğrafyası güneyden kuzeye yükselen üç belirgin yer şekli kuşağından oluşur. En güneyde Hindistan sınırını izleyen dar Duars Ovası, kalın ormanlar ve alüvyal konilerle kaplıdır. Orta kesimi oluşturan 1.500 ila 2.700 metre irtifadaki İç Himalayalar; derin vadileri, teraslı tarım alanları ve ormanlık sırtlarıyla ülke nüfusunun ve tarihi yerleşimlerinin ağırlık merkezidir. \n\nKuzey kuşağında ise Büyük Himalayaların sarp, buzul aşındırmalı granit kütleleri göğe yükselir. Tibet sınır hattında yükselen 7.570 metrelik Gangkhar Puensum, Butan'ın en yüksek noktası olup yerel inançlar uyarınca kutsal sayılan dağlara tırmanışın yasaklanması nedeniyle gezegenin fethedilmemiş en yüksek doruğu kabul edilir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BT',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Kuzeydeki yüksek buzul alanlarından doğan sular, dağ kütlelerini enine yarıp güneye yönelerek Hindistan topraklarındaki Brahmaputra Nehri'ne kavuşur. Batıdan doğuya doğru Torsa (Amoçu), Raidak (Wangçu), Sankosh (Punatsangçu) ve ülkenin en geniş drenaj alanına sahip Manas nehir havzaları, hızlı akışları ve dik düşümleriyle Butan'ın en değerli ekonomik kaynağı olan hidroelektrik potansiyelini yaratır. \n\nBaşkent Thimphu'dan süzülen Wangçu'nun yanı sıra, yüksek zirvelerin eteklerinde eriyen buzulların gerisinde tutulan 500'ü aşkın buzul gölü yer alır. Küresel sıcaklık artışıyla hacmi genişleyen bu doğal set gölleri, setlerin aniden patlamasıyla aşağı vadilerdeki yerleşimler için yıkıcı taşkınlara (GLOF) yol açma riski taşıdığından sürekli gözetim altında tutulur.",
    after:
      "Kuzeydeki yüksek buzul alanlarından doğan sular, dağ kütlelerini enine yarıp güneye yönelerek Hindistan topraklarındaki Brahmaputra Nehri'ne kavuşur. Batıdan doğuya doğru Torsa (Amoçu), Raidak (Wangçu), Sankosh (Punatsangçu) ve ülkenin en geniş su toplama alanına sahip Manas nehir havzaları, hızlı akışları ve dik düşümleriyle Butan'ın en değerli ekonomik kaynağı olan hidroelektrik potansiyelini yaratır. \n\nBaşkent Thimphu'dan süzülen Wangçu'nun yanı sıra, yüksek zirvelerin eteklerinde eriyen buzulların gerisinde tutulan 500'ü aşkın buzul gölü yer alır. Küresel sıcaklık artışıyla hacmi genişleyen bu doğal set gölleri, setlerin aniden patlamasıyla aşağı vadilerdeki yerleşimler için yıkıcı buzul gölü taşkınlarına yol açma riski taşıdığından sürekli gözetim altında tutulur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'IN',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Hint Yarımadası'nın devasa gövdesini kaplayan Hindistan; kuzeyde Himalayaların karlı duvarları boyunca Pakistan, Çin, Nepal ve Butan ile, doğuda ise Bangladeş ve Myanmar ile sınır paylaşır. Batıda Umman Denizi, doğuda Bengal Körfezi ve güneyde Hint Okyanusu ile kuşatılan ülke, 7.500 kilometreyi aşan sahil şeridiyle Asya'nın en kritik deniz ticaret yollarının merkezinde yer alır. \n\nÜlkenin beşeri ve siyasi kalbi, kuzeyin verimli nehir vadileri üzerinde kurulmuştur. Başkent Yeni Delhi'nin de odak noktasında bulunduğu Indo-Ganj Ovası, yüz milyonlarca insanın yaşadığı dünyanın en yoğun kırsal ve kentsel nüfus kümelenmelerine ev sahipliği yapar; güneye inildikçe ise kadim kalkan kütleleri ve tropikal kıyılar devreye girer.",
    after:
      "Hint Yarımadası'nın devasa gövdesini kaplayan Hindistan; kuzeyde Himalayaların karlı duvarları boyunca Pakistan, Çin, Nepal ve Butan ile, doğuda ise Bangladeş ve Myanmar ile sınır paylaşır. Batıda Umman Denizi, doğuda Bengal Körfezi ve güneyde Hint Okyanusu ile kuşatılan ülke, 7.500 kilometreyi aşan sahil şeridiyle Asya'nın en kritik deniz ticaret yollarının merkezinde yer alır. \n\nÜlkenin beşeri ve siyasi kalbi, kuzeyin verimli nehir vadileri üzerinde kurulmuştur. Başkent Yeni Delhi'nin de odak noktasında bulunduğu Indo-Ganj Ovası, yüz milyonlarca insanın yaşadığı dünyanın en yoğun kırsal ve kentsel nüfus kümelenmelerine ev sahipliği yapar; güneye inildikçe ise çok eski ve sağlam kaya kütleleri (kalkanlar) ve tropikal kıyılar devreye girer.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'IN',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      'Ülke topoğrafyası üç ana jeomorfolojik birime ayrılır: Kuzeyde Hint levhasının Asya levhasına bindirmesiyle yükselen genç kıvrım dağları Himalayalar, Sikkim sınırında 8.586 metreye erişen Kançencunga (Kangchenjunga) Zirvesi ile ülkenin en yüksek noktasına ulaşır. Bu dev dağ setinin eteklerinde, dağlardan aşınan siltlerin birikmesiyle oluşan ve batıda İndus kollarından doğuda Ganj deltasına kadar uzanan devasa Indo-Ganj Çöküntü Ovası uzanır. \n\nOvanın güneyinde, tektonik olarak yerkürenin en eski kara parçalarından biri sayılan üçgen biçimli Dekkan Platosu yükselir. Bu bazaltik yaylayı batıdan dik bir basamak halinde kuşatan Batı Gat Dağları ile daha aşınmış ve parçalı Doğu Gatlar, platoyu kıyı ovalarından ayırır. Kuzeybatıda ise Pakistan sınırına doğru sokulan kurak kumullarıyla Büyük Hint Çölü (Thar) uzanır.',
    after:
      'Ülke topoğrafyası üç ana yer şekli bölgesine ayrılır: Kuzeyde Hint levhasının Asya levhasına bindirmesiyle yükselen genç kıvrım dağları Himalayalar, Sikkim sınırında 8.586 metreye erişen Kançencunga (Kangchenjunga) Zirvesi ile ülkenin en yüksek noktasına ulaşır. Bu dev dağ setinin eteklerinde, dağlardan aşınan siltlerin birikmesiyle oluşan ve batıda İndus kollarından doğuda Ganj deltasına kadar uzanan devasa Indo-Ganj Çöküntü Ovası uzanır. \n\nOvanın güneyinde, tektonik olarak yerkürenin en eski kara parçalarından biri sayılan üçgen biçimli Dekkan Platosu yükselir. Bu bazaltik yaylayı batıdan dik bir basamak halinde kuşatan Batı Gat Dağları ile daha aşınmış ve parçalı Doğu Gatlar, platoyu kıyı ovalarından ayırır. Kuzeybatıda ise Pakistan sınırına doğru sokulan kurak kumullarıyla Büyük Hint Çölü (Thar) uzanır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'IN',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Hindistan'ın atmosferik dinamiklerini ve tarım takvimini bütünüyle muson döngüsü yönetir. Haziran ile eylül ayları arasında Hint Okyanusu'ndan karaya doğru esen nem yüklü güneybatı musonu, yıllık yağışın yüzde yetmişinden fazlasını getirir. Nemli hava akımlarının ilk çarptığı Batı Gatlar ve kuzeydoğudaki Meghalaya Yaylası dünyanın en yüksek yağış rekorlarını kırarken, batıya doğru ilerleyen hava kütleleri kuruyarak Thar Çölü'nde yağış bırakmaz. \n\nEkim ayından itibaren kıta içi soğuyup yüksek basınç alanına dönüştüğünde kuzeydoğu musonu devreye girer; bu rüzgarlar ülkenin büyük bölümünü kurak bir kışa sokarken Bengal Körfezi üzerinden nem toplayarak güneydoğudaki Tamil Nadu kıyılarına kış yağmurlarını bırakır. Kuzeydeki yüksek dağ vadilerinde alpin ve kutup koşulları görülürken, yarımada genelinde sıcak subtropikal ve tropikal savan rejimleri belirleyicidir.",
    after:
      "Hindistan'ın hava koşullarını ve tarım takvimini bütünüyle muson döngüsü yönetir. Haziran ile eylül ayları arasında Hint Okyanusu'ndan karaya doğru esen nem yüklü güneybatı musonu, yıllık yağışın yüzde yetmişinden fazlasını getirir. Nemli hava akımlarının ilk çarptığı Batı Gatlar ve kuzeydoğudaki Meghalaya Yaylası dünyanın en yüksek yağış rekorlarını kırarken, batıya doğru ilerleyen hava kütleleri kuruyarak Thar Çölü'nde yağış bırakmaz. \n\nEkim ayından itibaren kıta içi soğuyup yüksek basınç alanına dönüştüğünde kuzeydoğu musonu devreye girer; bu rüzgarlar ülkenin büyük bölümünü kurak bir kışa sokarken Bengal Körfezi üzerinden nem toplayarak güneydoğudaki Tamil Nadu kıyılarına kış yağmurlarını bırakır. Kuzeydeki yüksek dağ vadilerinde alpin ve kutup koşulları görülürken, yarımada genelinde sıcak subtropikal ve tropikal savan rejimleri belirleyicidir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'IN',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Ülkenin hidrografik sisteminde iki farklı rejim çarpışır: Kuzeyde Himalayalardaki buzul erimeleri ve muson yağmurlarıyla beslenen sürekli ve yüksek debili nehirler ile güneyde yalnızca yağmurlara bağımlı mevsimlik yarımada nehirleri. Himalayalardaki Gangotri buzulundan doğan kutsal Ganj (Ganga) Nehri, en büyük kolu Yamuna'yı Prayagraj'da bünyesine katarak 2.500 kilometreyi aşan bir yolculukla doğuya akar ve Bengal Körfezi'ne yönelir. \n\nTibet'ten doğan İndus Nehri ve kollarının üst çığırları ile kuzeydoğuda dev kanyonlardan süzülen Brahmaputra, ülkenin diğer büyük Himalaya sistemleridir. Yarımada içinde doğup bütünüyle Hindistan topraklarında kalan en uzun nehir ise 1.465 kilometrelik Godavari'dir; Krishna ve Cauvery ile birlikte Dekkan Platosu'nu batıdan doğuya katederek delta ağızlarıyla Bengal Körfezi'ne dökülür.",
    after:
      "Ülkenin akarsularında iki farklı rejim karşı karşıya gelir: Kuzeyde Himalayalardaki buzul erimeleri ve muson yağmurlarıyla beslenen sürekli ve yüksek debili nehirler ile güneyde yalnızca yağmurlara bağımlı mevsimlik yarımada nehirleri. Himalayalardaki Gangotri buzulundan doğan kutsal Ganj (Ganga) Nehri, en büyük kolu Yamuna'yı Prayagraj'da bünyesine katarak 2.500 kilometreyi aşan bir yolculukla doğuya akar ve Bengal Körfezi'ne yönelir. \n\nTibet'ten doğan İndus Nehri ve kollarının üst çığırları ile kuzeydoğuda dev kanyonlardan süzülen Brahmaputra, ülkenin diğer büyük Himalaya sistemleridir. Yarımada içinde doğup bütünüyle Hindistan topraklarında kalan en uzun nehir ise 1.465 kilometrelik Godavari'dir; Krishna ve Cauvery ile birlikte Dekkan Platosu'nu batıdan doğuya katederek delta ağızlarıyla Bengal Körfezi'ne dökülür.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'IR',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Toprakların morfolojik omurgasını, iç yaylayı bir kale suru gibi kuşatan iki büyük sıradağ silsilesi çizer: Batı ve güneybatı boyunca Basra Körfezi'ne paralel uzanan kıvrımlı Zagros Dağları ile Hazar kıyısını güneyden saran dik Elburz Dağları. Elburz zincirinde göğe yükselen 5.610 metrelik uykudaki stratovolkan Demavent (Damavand), hem İran'ın en yüksek doruğu hem de Hindukuş'un batısındaki tüm Avrasya'nın en yüksek zirvesidir. \n\nBu sıradağların ardında kalan ve deniz etkisinden yalıtılan Merkezi İran Platosu, ortalama 900 ila 1.500 metre rakımlı kurak havzalardan oluşur. Platonun merkez ve doğusunu, yeryüzünün en yüksek yüzey sıcaklıklarının ölçüldüğü kızgın kum çölü Deşt-i Lut ile tuz kabuklarıyla kaplı ıssız Deşt-i Kevir kaplar; bu kurak iç çöküntüler dışarıya akışı olmayan kapalı drenaj alanlarıdır.",
    after:
      "Ülkenin yer şekillerinin omurgasını, iç yaylayı bir kale suru gibi kuşatan iki büyük sıradağ silsilesi çizer: Batı ve güneybatı boyunca Basra Körfezi'ne paralel uzanan kıvrımlı Zagros Dağları ile Hazar kıyısını güneyden saran dik Elburz Dağları. Elburz zincirinde göğe yükselen 5.610 metrelik uykudaki stratovolkan Demavent (Damavand), hem İran'ın en yüksek doruğu hem de Orta Doğu'nun en yüksek zirvesidir. \n\nBu sıradağların ardında kalan ve deniz etkisinden yalıtılan Merkezi İran Platosu, ortalama 900 ila 1.500 metre rakımlı kurak havzalardan oluşur. Platonun merkez ve doğusunu, yeryüzünün en yüksek yüzey sıcaklıklarının ölçüldüğü kızgın kum çölü Deşt-i Lut ile tuz kabuklarıyla kaplı ıssız Deşt-i Kevir kaplar; bu kurak iç çöküntüler, sularını dışarıya akıtamayan kapalı havzalardır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'IR',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Geniş kurak alanlar ve kapalı havzalar nedeniyle İran'ın akarsu ağı seyrektir; nehirlerin büyük bölümü mevsimlik akış gösterir veya iç çöllerin tuzlu bataklıklarında kurur. Ülkenin seyrüsefere elverişli yegane akarsuyu olan 830 kilometrelik Karun Nehri, Zagros Dağları'ndan toplanan suları Basra Körfezi'ne dökülen Şattülarap'a taşır. \n\nDağ eteklerindeki kurak araziler, bin yıllardır yer altı su seviyesini yerçekimiyle yüzeye taşıyan geleneksel kehriz (kanat) su tünelleri sistemiyle sulanmıştır. Ülkenin kuzey sınırını çizen dünyanın en büyük kapalı su kütlesi Hazar Denizi'nin yanı sıra, kuzeybatıda aşırı buharlaşma ve barajlar nedeniyle küçülen tuzlu Urmiye Gölü, İran'ın en önemli iç su ekosistemleri arasında yer alır.",
    after:
      "Geniş kurak alanlar ve kapalı havzalar nedeniyle İran'ın akarsu ağı seyrektir; nehirlerin büyük bölümü mevsimlik akış gösterir veya iç çöllerin tuzlu bataklıklarında kurur. Ülkenin gemi ulaşımına elverişli tek akarsuyu olan 830 kilometrelik Karun Nehri, Zagros Dağları'ndan toplanan suları Basra Körfezi'ne dökülen Şattülarap'a taşır. \n\nDağ eteklerindeki kurak araziler, bin yıllardır yer altı su seviyesini yerçekimiyle yüzeye taşıyan geleneksel kehriz (kanat) su tünelleri sistemiyle sulanmıştır. Ülkenin kuzey sınırını çizen dünyanın en büyük kapalı su kütlesi Hazar Denizi'nin yanı sıra, kuzeybatıda aşırı buharlaşma ve barajlar nedeniyle küçülen tuzlu Urmiye Gölü, İran'ın en önemli iç su ekosistemleri arasında yer alır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MV',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Maldivler, ortalama 1,5 metrelik doğal zemin yüksekliğiyle gezegenin en alçak topoğrafyasına sahip ülkesidir. Adaların yüzde sekseninden fazlası deniz seviyesinden bir metre ya da daha az yükseklikte kalırken, tüm ülkenin en yüksek doğal noktası Addu Atolü'nde yalnızca 2,4 metreye ulaşır. Bu morfoloji, ülkeyi küresel deniz seviyesi yükselmesi ve fırtına kabarmaları karşısında yeryüzünün en kırılgan coğrafyası yapar. \n\nAtoller, milyonlarca yıl önce çöken denizaltı volkanik kütlelerinin çevresinde mercan poliplerinin kireçli iskeletler biriktirmesiyle yükselmiştir. Zirveler sulara gömüldükçe yukarıya doğru büyümeyi sürdüren resifler, ortasında sığ lagünlerin yer aldığı halka biçimli mercan adacıkları zincirlerine dönüşmüştür. Adaların zeminini bütünüyle beyaz kalsiyum karbonatlı mercan kumları oluşturur.",
    after:
      "Maldivler, ortalama 1,5 metrelik doğal zemin yüksekliğiyle gezegenin en alçak topoğrafyasına sahip ülkesidir. Adaların yüzde sekseninden fazlası deniz seviyesinden bir metre ya da daha az yükseklikte kalırken, tüm ülkenin en yüksek doğal noktası Addu Atolü'nde yalnızca 2,4 metreye ulaşır. Bu alçak yapı, ülkeyi küresel deniz seviyesi yükselmesi ve fırtına kabarmaları karşısında yeryüzünün en kırılgan coğrafyası yapar. \n\nAtoller, milyonlarca yıl önce çöken denizaltı volkanik kütlelerinin çevresinde mercan poliplerinin kireçli iskeletler biriktirmesiyle yükselmiştir. Zirveler sulara gömüldükçe yukarıya doğru büyümeyi sürdüren resifler, ortasında sığ lagünlerin yer aldığı halka biçimli mercan adacıkları zincirlerine dönüşmüştür. Adaların zeminini bütünüyle beyaz kalsiyum karbonatlı mercan kumları oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MV',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Ekvator kuşağında yer alması nedeniyle ülkede yıl boyunca sıcaklıklar 25 ila 31 santigrat derece gibi çok dar bir aralıkta neredeyse sabit kalır; gerçek anlamda mevsimleri sıcaklık farkları değil, yön değiştiren muson rüzgarları tayin eder. Yıl boyu yüksek bağıl nem oranı ve yoğun tropikal güneşlenme süreklidir. \n\nAralık ile nisan ayları arasında Asya kıtasından esen kuzeydoğu musonu (iruvai), kuru hava kütleleri ve sakin denizlerle karakterize güneşli dönemi getirir. Mayıs ayından kasıma kadar etkili olan güneybatı musonu (hulhangu) ise Hint Okyanusu'ndan taşıdığı şiddetli sağanaklar, fırtınalar ve kuvvetli rüzgarlarla yıllık yağışın büyük bölümünü yağdırır. Yılın en kurak ayları şubat ve mart iken, en yağışlı dönem mayıs ve kasım aylarıdır.",
    after:
      "Ekvator kuşağında yer alması nedeniyle ülkede yıl boyunca sıcaklıklar 25 ila 31 santigrat derece gibi çok dar bir aralıkta neredeyse sabit kalır; gerçek anlamda mevsimleri sıcaklık farkları değil, yön değiştiren muson rüzgarları tayin eder. Yıl boyu yüksek bağıl nem oranı ve yoğun tropikal güneşlenme süreklidir. \n\nAralık ile nisan ayları arasında Asya kıtasından esen kuzeydoğu musonu (iruvai), kuru hava kütleleri ve sakin denizlerle geçen güneşli dönemi getirir. Mayıs ayından kasıma kadar etkili olan güneybatı musonu (hulhangu) ise Hint Okyanusu'ndan taşıdığı şiddetli sağanaklar, fırtınalar ve kuvvetli rüzgarlarla yıllık yağışın büyük bölümünü yağdırır. Yılın en kurak ayları şubat ve mart iken, en yağışlı dönem mayıs ve kasım aylarıdır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MV',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Adaların daracık yüzeyleri ve son derece geçirgen kumlu zemin yapısı nedeniyle Maldivler'de tek bir kalıcı akarsu ya da vadi bulunmaz; birkaç adadaki küçük gölcükler dışında göl de yoktur. Yağan yağmur suları yüzeyde tutunamadan hızla tabana süzülerek gözenekli mercan kayalarının arasına sızar. \n\nTatlı su ihtiyacı tarih boyunca, kum tabakasının altında tuzlu deniz suyunun üzerinde yüzen ince tatlı su lensinden (Ghyben-Herzberg merceği) ve çatılardan toplanan yağmur sularından karşılanmıştır. Yüzeyin yalnızca bir-iki metre altında asılı duran bu kırılgan tatlı su tabakası, aşırı çekim ve nüfus baskısıyla tuzlanma tehlikesi altında olduğundan, günümüzde ada halkının içme suyu büyük oranda deniz suyunu tuzdan arındıran ters osmoz tesisleriyle üretilmektedir.",
    after:
      "Adaların daracık yüzeyleri ve son derece geçirgen kumlu zemin yapısı nedeniyle Maldivler'de tek bir kalıcı akarsu ya da vadi bulunmaz; birkaç adadaki küçük gölcükler dışında göl de yoktur. Yağan yağmur suları yüzeyde tutunamadan hızla tabana süzülerek gözenekli mercan kayalarının arasına sızar. \n\nTatlı su ihtiyacı tarih boyunca, kum tabakasının altında tuzlu deniz suyunun üzerinde yüzen ince bir tatlı su merceğinden (Ghyben-Herzberg merceği) ve çatılardan toplanan yağmur sularından karşılanmıştır. Yüzeyin yalnızca bir-iki metre altında asılı duran bu kırılgan tatlı su tabakası, aşırı çekim ve nüfus baskısıyla tuzlanma tehlikesi altında olduğundan, günümüzde ada halkının içme suyu büyük oranda deniz suyunu tuzdan arındıran ters osmoz tesisleriyle üretilmektedir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'NP',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ülke güneyden kuzeye doğru birbirine paralel uzanan üç ana morfolojik kuşağa ayrılır: Hindistan sınırında Ganj Havzası'nın devamı olan bataklık ve ormanlık Terai Ovası; 1.000 ila 3.000 metre irtifalardaki derin kanyonlar ve teraslı tepelerden oluşan Pahad (Orta Dağlık) kuşağı; ve nihayet yeryüzünün en görkemli kıvrım hattını çizen Büyük Himalayalar. Çin sınırında 8.849 metreye ulaşan Everest (Sagarmatha) yeryüzünün doruk noktasını oluştururken, 8.000 metreyi aşan 14 zirveden sekizi Nepal topraklarında yükselir. \n\nBölgenin olağanüstü bir diğer jeomorfolojik harikası, Dhaulagiri ve Annapurna dev kütleleri arasından yaran Kali Gandaki Boğazı'dır. Vadi tabanı ile çevre zirveler arasındaki 5.500 metreyi aşan düşey yarılma, burayı dünyanın en derin kanyonlarından biri yapar; nehrin dağlar yükselmeden önce de aktığını ve tektonik yükselmeyle eşzamanlı olarak yatağını kazımayı sürdürdüğünü kanıtlayan bu yapı, öncül (antesedan) drenajın ders kitabı örneğidir.",
    after:
      "Ülke güneyden kuzeye doğru birbirine paralel uzanan üç ana yer şekli kuşağına ayrılır: Hindistan sınırında Ganj Havzası'nın devamı olan bataklık ve ormanlık Terai Ovası; 1.000 ila 3.000 metre irtifalardaki derin kanyonlar ve teraslı tepelerden oluşan Pahad (Orta Dağlık) kuşağı; ve nihayet yeryüzünün en görkemli kıvrım hattını çizen Büyük Himalayalar. Çin sınırında 8.849 metreye ulaşan Everest (Sagarmatha) yeryüzünün doruk noktasını oluştururken, 8.000 metreyi aşan 14 zirveden sekizi Nepal topraklarında yükselir. \n\nBölgenin olağanüstü bir diğer doğa harikası, Dhaulagiri ve Annapurna dev kütleleri arasından yaran Kali Gandaki Boğazı'dır. Vadi tabanı ile çevre zirveler arasındaki 5.500 metreyi aşan düşey yarılma, burayı dünyanın en derin kanyonlarından biri yapar; nehrin dağlar yükselmeden önce de aktığını ve dağlar yükseldikçe yatağını kazımayı sürdürdüğünü kanıtlayan bu yapı, öncül (antesedan) akarsuların ders kitabı örneğidir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'NP',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Dik topoğrafik basamaklanma, ülkede tropikal ormanlardan kutup tundralarına uzanan bütün iklim kuşaklarını tek bir hat üzerinde toplar. Güneydeki Terai düzlüklerinde nemli subtropikal ve tropikal savan iklimi hüküm sürerken, orta vadilerde ılıman dağ iklimi, 4.000 metrenin üzerindeki yaylalarda ise sert dağ çayırları ve kalıcı karlı alpin rejim egemendir. \n\nYağış mevsimini Bengal Körfezi'nden esen güneybatı musonu belirler; haziran ile eylül ayları arasında Himalayaların güney yamaçlarına çarpan bu rüzgarlar olağanüstü şiddette yağışlara ve heyelanlara yol açar. Buna karşın, dağ silsilesinin kuzey yamaçlarında ve Tibet sınırında kalan Mustang ve Dolpo vadileri yağış gölgesinde hapsolarak yılda 200 milimetrenin altında yağış alan kurak, soğuk çöl manzaralarına bürünür.",
    after:
      "Kısa mesafedeki büyük yükselti farkı, ülkede tropikal ormanlardan kutup tundralarına uzanan bütün iklim kuşaklarını tek bir hat üzerinde toplar. Güneydeki Terai düzlüklerinde nemli subtropikal ve tropikal savan iklimi hüküm sürerken, orta vadilerde ılıman dağ iklimi, 4.000 metrenin üzerindeki yaylalarda ise sert dağ çayırları ve kalıcı karlı alpin rejim egemendir. \n\nYağış mevsimini Bengal Körfezi'nden esen güneybatı musonu belirler; haziran ile eylül ayları arasında Himalayaların güney yamaçlarına çarpan bu rüzgarlar olağanüstü şiddette yağışlara ve heyelanlara yol açar. Buna karşın, dağ silsilesinin kuzey yamaçlarında ve Tibet sınırında kalan Mustang ve Dolpo vadileri yağış gölgesinde hapsolarak yılda 200 milimetrenin altında yağış alan kurak, soğuk çöl manzaralarına bürünür.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'PK',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Pakistan'ın kuzeyi, yeryüzünün en sarp üç büyük dağ silsilesi olan Karakurum, Himalaya ve Hindukuş'un düğümlendiği eşsiz bir tektonik yükselim merkezidir. Çin sınırındaki 8.611 metrelik K2 Zirvesi, dünyanın en yüksek ikinci noktasıdır; bu dağlık bölge kutup daireleri dışındaki gezegenin en uzun vadi buzullarını (Siaçen, Baltoro ve Batura) barındırır. \n\nKuzeydeki dağ kütlesinin güneyinde, İndus Nehri ve kollarının bin yıllar boyunca taşıdığı alüvyonlarla dolan engin İndus Ovası uzanır; bu düzlükler Pencap'ın bereketli tarım arazilerini oluşturur. Ülkenin batı ve güneybatısını kaplayan Beluçistan Platosu ise kurak dağ sıraları ve tuzlu çöküntü havzalarıyla sarp bir plato görünümündedir; doğuda ise Hindistan sınırına sokulan Cholistan ve Thar çöllerinin kumulları yer alır.",
    after:
      "Pakistan'ın kuzeyi, yeryüzünün en sarp üç büyük dağ silsilesi olan Karakurum, Himalaya ve Hindukuş'un düğümlendiği, levha hareketleriyle yükselen eşsiz bir dağlık alandır. Çin sınırındaki 8.611 metrelik K2 Zirvesi, dünyanın en yüksek ikinci noktasıdır; bu dağlık bölge kutup daireleri dışındaki gezegenin en uzun vadi buzullarını (Siaçen, Baltoro ve Batura) barındırır. \n\nKuzeydeki dağ kütlesinin güneyinde, İndus Nehri ve kollarının bin yıllar boyunca taşıdığı alüvyonlarla dolan engin İndus Ovası uzanır; bu düzlükler Pencap'ın bereketli tarım arazilerini oluşturur. Ülkenin batı ve güneybatısını kaplayan Beluçistan Platosu ise kurak dağ sıraları ve tuzlu çöküntü havzalarıyla sarp bir plato görünümündedir; doğuda ise Hindistan sınırına sokulan Cholistan ve Thar çöllerinin kumulları yer alır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'PK',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Pakistan'ın hidrografik varlığı bütünüyle İndus Nehri sistemine endekslidir. Kaynağını Tibet Platosu'ndan alıp Himalayaları yaran İndus, Pakistan topraklarında yaklaşık 2.750 kilometre yol kat ederek Umman Denizi'ne dökülür. Ülkenin tarım kalbi Pencap (\"Beş Nehir Ülkesi\"), adını İndus'un başlıca doğu kolları olan Jhelum, Chenab, Ravi, Beas ve Sutlej'den alır; bu nehirler Panjnad'da birleştikten sonra ana İndus yatağına kavuşur. \n\nİndus ve kollarından ayrılan binlerce kilometrelik sulama kanalları ve barajlar (Tarbela ve Mangla gibi), dünyanın en büyük entegre yerçekimli kanal sulama ağını meydana getirir. 1960 tarihli İndus Suları Antlaşması ile batı nehirlerinin (İndus, Jhelum, Chenab) kullanım hakkı Pakistan'a bırakılmıştır; kar ve buzul erimesiyle muson sağanaklarının aynı döneme denk gelmesi yaz aylarında havzada yıkıcı taşkınlara yol açabilmektedir.",
    after:
      "Pakistan'ın akarsu varlığı bütünüyle İndus Nehri sistemine bağlıdır. Kaynağını Tibet Platosu'ndan alıp Himalayaları yaran İndus, Pakistan topraklarında yaklaşık 2.750 kilometre yol kat ederek Umman Denizi'ne dökülür. Ülkenin tarım kalbi Pencap (\"Beş Nehir Ülkesi\"), adını İndus'un başlıca doğu kolları olan Jhelum, Chenab, Ravi, Beas ve Sutlej'den alır; bu nehirler Panjnad'da birleştikten sonra ana İndus yatağına kavuşur. \n\nİndus ve kollarından ayrılan binlerce kilometrelik sulama kanalları ve barajlar (Tarbela ve Mangla gibi), suyu yerçekimiyle taşıyan, birbirine bağlı kanallardan oluşan dünyanın en büyük sulama ağını meydana getirir. 1960 tarihli İndus Suları Antlaşması ile batı nehirlerinin (İndus, Jhelum, Chenab) kullanım hakkı Pakistan'a bırakılmıştır; kar ve buzul erimesiyle muson sağanaklarının aynı döneme denk gelmesi yaz aylarında havzada yıkıcı taşkınlara yol açabilmektedir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'LK',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Ekvatorun hemen kuzeyindeki tropikal kuşakta yer alan adada sıcaklıklar alçak kesimlerde yıl boyu 26 ila 30 santigrat derece arasında seyrederken, merkez yaylalarda rakımın etkisiyle 15 derece civarına kadar iner. İklimsel yapıyı adayı ikiye bölen orografik engel ve mevsimlik muson rüzgarları şekillendirir. \n\nMayıs ile eylül ayları arasındaki güneybatı musonu, güneybatı çeyreğine ("Islak Bölge") ve yaylaların batı yamaçlarına 2.500 milimetreyi aşan rekor yağışlar bırakır. Buna karşılık adanın kuzey ve doğusunda kalan "Kurak Bölge", aralık ile mart ayları arasındaki kuzeydoğu musonundan daha mütevazı ve düzensiz yağış alır; bu da yılın geri kalanında kuraklık koşullarının yaşanmasına yol açar.',
    after:
      'Ekvatorun hemen kuzeyindeki tropikal kuşakta yer alan adada sıcaklıklar alçak kesimlerde yıl boyu 26 ila 30 santigrat derece arasında seyrederken, merkez yaylalarda rakımın etkisiyle 15 derece civarına kadar iner. İklimi, adayı ikiye bölen dağlık engel ve mevsimlik muson rüzgarları şekillendirir. \n\nMayıs ile eylül ayları arasındaki güneybatı musonu, güneybatı çeyreğine ("Islak Bölge") ve yaylaların batı yamaçlarına 2.500 milimetreyi aşan rekor yağışlar bırakır. Buna karşılık adanın kuzey ve doğusunda kalan "Kurak Bölge", aralık ile mart ayları arasındaki kuzeydoğu musonundan daha mütevazı ve düzensiz yağış alır; bu da yılın geri kalanında kuraklık koşullarının yaşanmasına yol açar.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'LK',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Merkez Yaylaların yüksek yamaçlarından kaynaklanan nehirler, adanın her yönündeki kıyılara doğru ışınsal bir drenaj deseni çizerek dökülür. Bu sistemin en büyük istisnası ve adanın en uzun nehri olan 335 kilometrelik Mahaweli Nehri'dir; yaylaların batısından doğup dolambaçlı bir yay çizerek adanın kurak kuzeydoğusundaki Trincomalee Körfezi'ne ulaşır. \n\nKurak Bölge'deki mevsimlik akışları ve taşkınları depolamak amacıyla MÖ 3. yüzyıldan itibaren geliştirilen antik basamaklı gölet ve kanal sistemi (\"wewa\"), geleneksel sulu çeltik tarımının temelini oluşturmuştur. Binlerce yıldır işlevini koruyan yaklaşık 18.000 yapay gölet, hem yeraltı su tablasını dengeler hem de kurak dönemlerde tarımsal sürdürülebilirliği güvenceye alır.",
    after:
      "Merkez Yaylaların yüksek yamaçlarından kaynaklanan nehirler, adanın her yönündeki kıyılara doğru ışınsal bir akarsu ağı çizerek dökülür. Bu sistemin en büyük istisnası ve adanın en uzun nehri olan 335 kilometrelik Mahaweli Nehri'dir; yaylaların batısından doğup dolambaçlı bir yay çizerek adanın kurak kuzeydoğusundaki Trincomalee Körfezi'ne ulaşır. \n\nKurak Bölge'deki mevsimlik akışları ve taşkınları depolamak amacıyla MÖ 3. yüzyıldan itibaren geliştirilen antik basamaklı gölet ve kanal sistemi (\"wewa\"), geleneksel sulu çeltik tarımının temelini oluşturmuştur. Binlerce yıldır işlevini koruyan yaklaşık 18.000 yapay gölet, hem yer altı suyu seviyesini dengeler hem de kurak dönemlerde tarımın sürmesini güvenceye alır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AM',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Güney Kafkasya'nın engebeli iç yaylalarında yer alan Ermenistan; kuzeyde Gürcistan, doğuda Azerbaycan, güneyde İran ve batıda Türkiye ile çevrilidir. Bölgenin denize doğrudan çıkışı olmayan tek devleti olup topraklarının ortalama rakımı 1.800 metreyi aşar; ülke bütünüyle sarp dağlar, derin kanyonlar ve volkanik platolar kuşağında kuruludur. \n\nNüfusun ve ekonomik üretimin en yoğun kümelendiği kesim, güneybatıda Türkiye sınırı boyunca uzanan yarı kurak Ararat Ovası'dır. Başkent Erivan da bu alüvyal havzanın kuzey ucunda, Hrazdan Nehri kanyonunun yamaçlarında basamaklanarak yer alır ve ülkenin kentsel dokusunun çekirdeğini meydana getirir.",
    after:
      "Güney Kafkasya'nın engebeli iç yaylalarında yer alan Ermenistan; kuzeyde Gürcistan, doğuda Azerbaycan, güneyde İran ve batıda Türkiye ile çevrilidir. Bölgenin Karadeniz'e ya da Hazar'a kıyısı olmayan tek devleti olup topraklarının ortalama rakımı 1.800 metreyi aşar; ülke bütünüyle sarp dağlar, derin kanyonlar ve volkanik platolar kuşağında kuruludur. \n\nNüfusun ve ekonomik üretimin en yoğun kümelendiği kesim, güneybatıda Türkiye sınırı boyunca uzanan yarı kurak Ararat Ovası'dır. Başkent Erivan da bu alüvyal havzanın kuzey ucunda, Hrazdan Nehri kanyonunun yamaçlarında basamaklanarak yer alır ve ülkenin kentsel dokusunun çekirdeğini meydana getirir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AM',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Toprakların morfolojisini Küçük Kafkas Dağları silsilesi ve Neojen-Kuvaterner dönemine ait volkanik kalkanlar belirler. Kuzeybatıda yükselen ve dört ayrı doruğa sahip olan 4.090 metrelik sönmüş stratovolkan Alagöz (Aragats) Dağı, krater çöküntüsü ve eteklerindeki moren setleriyle ülkenin en yüksek noktasıdır. Volkanik kökenli bazalt, tüf ve obsidyen kayaçları ülkenin hem yapı malzemesi kültürünü hem de sarp kanyon topoğrafyasını şekillendirmiştir. \n\nÜlke yüzölçümünün yalnızca onda biri tarıma elverişli düzlüklerden oluşur; bunların en büyüğü Aras Nehri'nin suladığı Ararat (Ağrı) Ovası'dır. Geri kalan araziler, derin yarıklarla parçalanmış lav platoları, 2.000 metreyi aşan dağ sırtları ve tektonik çöküntülerden meydana gelir.",
    after:
      "Ülkenin yer şekillerini Küçük Kafkas Dağları silsilesi ve jeolojik açıdan genç (Neojen-Kuvaterner dönemine ait) volkanik kalkanlar belirler. Kuzeybatıda yükselen ve dört ayrı doruğa sahip olan 4.090 metrelik sönmüş stratovolkan Alagöz (Aragats) Dağı, krater çöküntüsü ve eteklerindeki moren setleriyle ülkenin en yüksek noktasıdır. Volkanik kökenli bazalt, tüf ve obsidyen kayaçları ülkenin hem yapı malzemesi kültürünü hem de sarp kanyon topoğrafyasını şekillendirmiştir. \n\nÜlke yüzölçümünün yalnızca onda biri tarıma elverişli düzlüklerden oluşur; bunların en büyüğü Aras Nehri'nin suladığı Ararat (Ağrı) Ovası'dır. Geri kalan araziler, derin yarıklarla parçalanmış lav platoları, 2.000 metreyi aşan dağ sırtları ve tektonik çöküntülerden meydana gelir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AZ',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Güney Kafkasya'nın en geniş ülkesi olan Azerbaycan, batıda Hazar Denizi'nin kıyı havzası ile Kafkas Dağları'nın arasına kuruludur. Kuzeyde Rusya, kuzeybatıda Gürcistan, batıda Ermenistan ve güneyde İran ile komşu olan ülkenin, ana gövdeden ayrı konumlanan Nahçıvan Özerk Cumhuriyeti eksklavı ise batıda Türkiye ve güneyde İran ile sınır oluşturur. \n\nÜlkenin ekonomik ve demografik merkezi, Hazar Denizi'ne doğru bir kanca gibi uzanan Abşeron Yarımadası'dır. Deniz seviyesinden 28 metre aşağıda yer alarak dünyanın en alçak irtifalı başkenti unvanını taşıyan Bakü, zengin petrol ve doğal gaz yataklarının çevrelediği bu yarımadada kurulmuş olup Kafkasya'nın en büyük liman ve sanayi merkezidir.",
    after:
      "Güney Kafkasya'nın en geniş ülkesi olan Azerbaycan, doğuda Hazar Denizi'nin kıyı havzası ile Kafkas Dağları'nın arasına kuruludur. Kuzeyde Rusya, kuzeybatıda Gürcistan, batıda Ermenistan ve güneyde İran ile komşu olan ülkenin, ana gövdeden ayrı konumlanan Nahçıvan Özerk Cumhuriyeti eksklavı ise batıda Türkiye ve güneyde İran ile sınır oluşturur. \n\nÜlkenin ekonomik ve demografik merkezi, Hazar Denizi'ne doğru bir kanca gibi uzanan Abşeron Yarımadası'dır. Deniz seviyesinden 28 metre aşağıda yer alarak dünyanın en alçak irtifalı başkenti unvanını taşıyan Bakü, zengin petrol ve doğal gaz yataklarının çevrelediği bu yarımadada kurulmuş olup Kafkasya'nın en büyük liman ve sanayi merkezidir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AZ',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Azerbaycan topoğrafyası, yüksek dağ kuşakları ile bunların arasında çöken geniş alüvyal çöküntü ovalarının tezatıyla şekillenmiştir. Kuzey sınırını bir duvar gibi kapatan Büyük Kafkas Dağları üzerinde, Rusya sınırında 4.485 metreye ulaşan Bazardüzü Zirvesi ülkenin doruk noktasını oluşturur. Batıda Karabağ volkanik yaylasını da içeren Küçük Kafkas Dağları, güneydoğuda ise İran sınırını izleyen ormanlık Talış Dağları yükselir.\n\nKarabağ, uluslararası hukukta hep Azerbaycan toprağı sayılmıştır. Bölgeyi 1990'lardan 2023'e kadar, Ermenistan dahil hiçbir ülke tarafından tanınmayan bir Ermeni yönetimi fiilen ayrı yönetti; Azerbaycan'ın Eylül 2023'teki askeri harekâtı sonrasında bu yönetim dağıldı; bölgenin yaklaşık 120.000 kişilik Ermeni nüfusunun 100.000'i aşkını, birkaç gün içinde bölgeyi terk edip Ermenistan'a geçti. Bölge bugün Azerbaycan idaresindedir. \n\nBu sıradağların kollarının çevrelediği orta kesimde, Kura ve Aras nehirlerinin oluşturduğu geniş Kura-Aras Ovaları uzanır. Hazar Denizi'nin negatif irtifası nedeniyle kıyı şeridindeki düzlüklerin önemli bir bölümü deniz seviyesinin altında seyreder; Abşeron ve Gobustan çevrelerinde tektonik gaz çıkışlarıyla beslenen yüzlerce çamur volkanı, bölgeye özgü eşsiz bir jeolojik peyzaj oluşturur.",
    after:
      "Azerbaycan topoğrafyası, yüksek dağ kuşakları ile bunların arasında çöken geniş alüvyal çöküntü ovalarının tezatıyla şekillenmiştir. Kuzey sınırını bir duvar gibi kapatan Büyük Kafkas Dağları üzerinde, Rusya sınırında 4.485 metreye ulaşan Bazardüzü Zirvesi ülkenin doruk noktasını oluşturur. Batıda Karabağ volkanik yaylasını da içeren Küçük Kafkas Dağları, güneydoğuda ise İran sınırını izleyen ormanlık Talış Dağları yükselir.\n\nKarabağ, uluslararası hukukta hep Azerbaycan toprağı sayılmıştır. Bölgeyi 1990'lardan 2023'e kadar, Ermenistan dahil hiçbir ülke tarafından tanınmayan bir Ermeni yönetimi fiilen ayrı yönetti; Azerbaycan'ın Eylül 2023'teki askeri harekâtı sonrasında bu yönetim dağıldı; bölgenin yaklaşık 120.000 kişilik Ermeni nüfusunun 100.000'i aşkını, birkaç gün içinde bölgeyi terk edip Ermenistan'a geçti. Bölge bugün Azerbaycan idaresindedir. \n\nBu sıradağların kollarının çevrelediği orta kesimde, Kura ve Aras nehirlerinin oluşturduğu geniş Kura-Aras Ovaları uzanır. Hazar Denizi'nin yüzeyi okyanus seviyesinin altında olduğundan kıyı şeridindeki düzlüklerin önemli bir bölümü deniz seviyesinin altında seyreder; Abşeron ve Gobustan çevrelerinde tektonik gaz çıkışlarıyla beslenen yüzlerce çamur volkanı, bölgeye özgü eşsiz bir jeolojik görünüm oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AZ',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Azerbaycan'ın su omurgasını, Kafkasya'nın en büyük akarsu sistemi olan Kura-Aras Havzası çizer. Türkiye'den doğup Gürcistan'ı geçerek ülkeye giren Kura Nehri, batıdan gelen en büyük kolu Aras ile Sabirabad yakınlarında birleşir ve geniş bir delta ile Hazar Denizi'ne dökülür. Kura üzerinde kurulan ve Güney Kafkasya'nın en büyük su kütlesi olan dev Mingeçevir Baraj Gölü, hem enerji üretimi hem de Kura-Aras ovasının sulanması için stratejik bir rezervuardır. \n\nÜlkenin doğu kıyısı boyunca 700 kilometreyi aşan bir şeritle uzanan dünyanın en büyük kapalı gölü Hazar Denizi, dış okyanuslara doğrudan bağlantısı bulunmayan kapalı bir havzadır. Hazar'a dökülen nehirler, mersin balığı popülasyonu ve zengin kıyı hidrolojisi açısından hayati önem taşırken, son yıllarda göl su seviyesindeki çekilme kıyı ekosistemlerini yakından etkilemektedir.",
    after:
      "Azerbaycan'ın su omurgasını, Kafkasya'nın en büyük akarsu sistemi olan Kura-Aras Havzası çizer. Türkiye'den doğup Gürcistan'ı geçerek ülkeye giren Kura Nehri, batıdan gelen en büyük kolu Aras ile Sabirabad yakınlarında birleşir ve geniş bir delta ile Hazar Denizi'ne dökülür. Kura üzerinde kurulan ve Güney Kafkasya'nın en büyük su kütlesi olan dev Mingeçevir Baraj Gölü, hem enerji üretimi hem de Kura-Aras ovasının sulanması için stratejik bir rezervuardır. \n\nÜlkenin doğu kıyısı boyunca 700 kilometreyi aşan bir şeritle uzanan dünyanın en büyük kapalı gölü Hazar Denizi, dış okyanuslara doğrudan bağlantısı bulunmayan kapalı bir havzadır. Hazar'a dökülen nehirler, mersin balıkları ve kıyıdaki zengin su yaşamı açısından hayati önem taşırken, son yıllarda göl su seviyesindeki çekilme kıyı ekosistemlerini yakından etkilemektedir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BH',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Bahreyn'de akışı sürekli olan hiçbir akarsu bulunmaz. Tarih boyunca adaya hayat veren ve antik Dilmun uygarlığının gelişmesini sağlayan etmen, Arap Yarımadası'ndaki akiferlerden deniz tabanına ve kıyı şeridine basınçla sızan tatlı su artezyenleridir. \n\nSon yüzyılda hızlanan kentleşme ve aşırı su çekimi, yeraltı tatlı su lenslerinin tükenmesine ve deniz suyunun tatlı su akiferlerine sızarak kaynakları tuzlamasına neden oldu. Geleneksel hurma vahalarını besleyen tatlı pınarların kurumasıyla birlikte ülke, içme ve sulama suyu ihtiyacının neredeyse tamamını doğal gazla çalışan deniz suyu arıtma tesisleriyle karşılar hale geldi.",
    after:
      "Bahreyn'de akışı sürekli olan hiçbir akarsu bulunmaz. Tarih boyunca adaya hayat veren ve antik Dilmun uygarlığının gelişmesini sağlayan etmen, Arap Yarımadası'ndaki yer altı su katmanlarından (akifer) deniz tabanına ve kıyı şeridine basınçla sızan artezyen tatlı su kaynaklarıdır. \n\nSon yüzyılda hızlanan kentleşme ve aşırı su çekimi, yer altındaki tatlı su birikintilerinin tükenmesine ve deniz suyunun tatlı su katmanlarına sızarak kaynakları tuzlamasına neden oldu. Geleneksel hurma vahalarını besleyen tatlı pınarların kurumasıyla birlikte ülke, içme ve sulama suyu ihtiyacının neredeyse tamamını doğal gazla çalışan deniz suyu arıtma tesisleriyle karşılar hale geldi.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'JO',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Doğu Akdeniz hinterlandında yer alan Ürdün, dünyanın en derin tektonik yarığı ile doğudaki uçsuz bucaksız çöl platosu arasında yükselen dağlık bir eşik üzerinde kuruludur. Ülkenin denize tek çıkışı, güney ucunda Akabe Körfezi üzerinden Kızıldeniz'e bağlanan dar bir kıyı koridorudur.",
    after:
      "Doğu Akdeniz'in iç kesiminde yer alan Ürdün, dünyanın en derin tektonik yarığı ile doğudaki uçsuz bucaksız çöl platosu arasında yükselen dağlık bir eşik üzerinde kuruludur. Ülkenin denize tek çıkışı, güney ucunda Akabe Körfezi üzerinden Kızıldeniz'e bağlanan dar bir kıyı koridorudur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'JO',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      'Ülke fizyografyası üç belirgin şeride ayrılır. Batı sınırını boydan boya kesen Ürdün Çöküntü Vadisi, Ölü Deniz Transform Fayı boyunca çöken devasa bir grabendir; tabanında deniz seviyesinin yaklaşık 440 metre altında yer alan ve yerkürenin karadaki en alçak noktası olan Lut Gölü uzanır. Vadinin tabanı ile hemen doğusunda duvar gibi yükselen platolar arasında 1.000 metreyi aşan dik fay basamakları sıralanır. \n\nBu fay dikliğinin gerisinde Aclun, Belka ve Şara dağlarını oluşturan yüksek kireçtaşı yaylaları uzanır; güneyde kırmızı kumtaşı kuleleri ve monolitleriyle ünlü Vadi Rum yer alır ve Suudi sınırına yakın Cebel Ümmü ed-Dami 1.854 metreyle ülkenin en yüksek zirvesi olarak yükselir. Bu dağlık omurganın doğusuna geçildiğinde zemin hafifçe alçalarak bazaltik lav akıntıları ve çakıllı düzlüklerden oluşan geniş Bâdiye çöl platosuna dönüşür.',
    after:
      'Ülkenin yer şekilleri üç belirgin şeride ayrılır. Batı sınırını boydan boya kesen Ürdün Çöküntü Vadisi, Ölü Deniz Transform Fayı boyunca çöken devasa bir çukur alandır (graben); tabanında deniz seviyesinin yaklaşık 440 metre altında yer alan ve yerkürenin karadaki en alçak noktası olan Lut Gölü uzanır. Vadinin tabanı ile hemen doğusunda duvar gibi yükselen platolar arasında 1.000 metreyi aşan dik fay basamakları sıralanır. \n\nBu fay dikliğinin gerisinde Aclun, Belka ve Şara dağlarını oluşturan yüksek kireçtaşı yaylaları uzanır; güneyde kırmızı kumtaşı kuleleri ve monolitleriyle ünlü Vadi Rum yer alır ve Suudi sınırına yakın Cebel Ümmü ed-Dami 1.854 metreyle ülkenin en yüksek zirvesi olarak yükselir. Bu dağlık omurganın doğusuna geçildiğinde zemin hafifçe alçalarak bazaltik lav akıntıları ve çakıllı düzlüklerden oluşan geniş Bâdiye çöl platosuna dönüşür.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'JO',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Farklı topoğrafik kuşaklar, kısa mesafelerde çarpıcı iklim farklılıkları yaratır. Batıdaki yüksek yaylalarda kışları serin, yağışlı ve zaman zaman kar yağışlı geçen Akdeniz dağ iklimi egemendir; kuzeydeki tepelerde yıllık yağış 500 milimetreye yaklaşarak zeytinlikleri ve çam ormanı kalıntılarını destekler. \n\nBuna karşılık Lut Gölü çanağında ve Ürdün Vadisi tabanında deniz seviyesinin altında olmanın getirdiği yüksek atmosferik basınç ve sıkışma nedeniyle kışlar ılık, yazlar ise boğucu ve kuraktır. Ülke topraklarının yüzde sekseninden fazlasını kaplayan doğudaki Bâdiye platosunda ise sıcaklık farklarının yüksek olduğu, yıllık yağışın 100 milimetrenin altına düştüğü tam kurak çöl koşulları hüküm sürer.',
    after:
      'Farklı topoğrafik kuşaklar, kısa mesafelerde çarpıcı iklim farklılıkları yaratır. Batıdaki yüksek yaylalarda kışları serin, yağışlı ve zaman zaman kar yağışlı geçen Akdeniz dağ iklimi egemendir; kuzeydeki tepelerde yıllık yağış 500 milimetreye yaklaşarak zeytinlikleri ve çam ormanı kalıntılarını destekler. \n\nBuna karşılık Lut Gölü çanağında ve Ürdün Vadisi tabanında deniz seviyesinin altında olmanın getirdiği yüksek hava basıncı ve sıkışma nedeniyle kışlar ılık, yazlar ise boğucu ve kuraktır. Ülke topraklarının yüzde sekseninden fazlasını kaplayan doğudaki Bâdiye platosunda ise sıcaklık farklarının yüksek olduğu, yıllık yağışın 100 milimetrenin altına düştüğü tam kurak çöl koşulları hüküm sürer.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'JO',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Ürdün, dünyanın su stresi en yüksek ülkelerinden biridir. Batı sınırını çizen Şeria (Ürdün) Nehri, en büyük kolu olan Yarmuk ve Amman yaylalarından doğup derin kanyonlardan geçen Zerka Nehri ile beslenir; akışını nihayetinde dışa akışı olmayan kapalı havza Lut Gölü'nde noktalar. \n\nYukarı havzadaki barajlar ve yoğun tarımsal su tüketimi nedeniyle Şeria Nehri'nin Lut Gölü'ne ulaştırdığı su miktarı kritik derecede azalmıştır. Bu beslenme açığı, Lut Gölü'nün su yüzeyinin yılda yaklaşık bir metre çekilmesine ve kıyı şeridinde tehlikeli tuz çöküntü obruklarının oluşmasına yol açar. Ülke, büyük kentlerin ve tarımın su ihtiyacını karşılamak için güney çölündeki fosil akiferlerden (Disi) yüzlerce kilometrelik boru hatlarıyla su taşımaktadır.",
    after:
      "Ürdün, dünyada su sıkıntısını en ağır yaşayan ülkelerden biridir. Batı sınırını çizen Şeria (Ürdün) Nehri, en büyük kolu olan Yarmuk ve Amman yaylalarından doğup derin kanyonlardan geçen Zerka Nehri ile beslenir; akışını nihayetinde dışa akışı olmayan kapalı havza Lut Gölü'nde noktalar. \n\nYukarı havzadaki barajlar ve yoğun tarımsal su tüketimi nedeniyle Şeria Nehri'nin Lut Gölü'ne ulaştırdığı su miktarı kritik derecede azalmıştır. Bu beslenme açığı, Lut Gölü'nün su yüzeyinin yılda yaklaşık bir metre çekilmesine ve kıyı şeridinde tehlikeli tuz çöküntü obruklarının oluşmasına yol açar. Ülke, büyük kentlerin ve tarımın su ihtiyacını karşılamak için güney çölündeki fosil yer altı suyu katmanlarından (Disi) yüzlerce kilometrelik boru hatlarıyla su taşımaktadır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'KW',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      'Topoğrafya, körfez kıyısındaki sıfır seviyesinden batıya ve kuzeybatıya doğru neredeyse hissedilmeyecek bir eğimle yükselen dalgalı bir çöl düzlüğüdür. Kıyı boyunca uzanan Cal ez-Zor kireçtaşı ve kumtaşı falezleri ile iç kesimdeki Mutla Sırtı arazinin başlıca morfolojik kırılma hatlarını oluşturur; batı sınırına yakın çakıllı sırtlarda rakım en çok 300 metre dolayına ulaşır. \n\nKörfez kıyıları son derece sığdır; gelgit hareketleri geniş çamur düzlükleri ve tuz bataklıkları (sebhalar) oluşturur. Şattülarap deltasının hemen güneyinde yer alan Bubiyan ve Varba adaları, nehir taşkın çökelleri ve körfez gelgitlerinin yığdığı alüvyonlardan meydana gelen, yerleşimin olmadığı bataklık kütleleridir; buna karşılık Kuveyt Körfezi ağzındaki Feyleke Adası antik çağlardan bu yana tatlı su tutabilen kireçtaşı yapısıyla iskân görmüştür.',
    after:
      'Topoğrafya, körfez kıyısındaki sıfır seviyesinden batıya ve kuzeybatıya doğru neredeyse hissedilmeyecek bir eğimle yükselen dalgalı bir çöl düzlüğüdür. Kıyı boyunca uzanan Cal ez-Zor kireçtaşı ve kumtaşı falezleri ile iç kesimdeki Mutla Sırtı düz arazinin başlıca belirgin basamaklarını oluşturur; batı sınırına yakın çakıllı sırtlarda rakım en çok 300 metre dolayına ulaşır. \n\nKörfez kıyıları son derece sığdır; gelgit hareketleri geniş çamur düzlükleri ve tuz bataklıkları (sebhalar) oluşturur. Şattülarap deltasının hemen güneyinde yer alan Bubiyan ve Varba adaları, nehir taşkın çökelleri ve körfez gelgitlerinin yığdığı alüvyonlardan meydana gelen, yerleşimin olmadığı bataklık kütleleridir; buna karşılık Kuveyt Körfezi ağzındaki Feyleke Adası antik çağlardan bu yana tatlı su tutabilen kireçtaşı yapısıyla iskân görmüştür.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'KW',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Ülke sınırları dahilinde tek bir sürekli akarsu, doğal göl ya da daimi tatlı su kaynağı bulunmaz. Yağmur sonrasında kısa süreliğine su taşıyan ve Basra Körfezi'ne doğru hafif meyil çizen kuru çöl vadileri (özellikle Vadi el-Bâtın) yüzey drenajının yegâne izleridir. \n\nYeraltında bulunan sınırlı su rezervleri yüksek oranda kükürtlü ve tuzlu olduğundan doğrudan tüketime uygun değildir. Bu mutlak su yokluğu nedeniyle Kuveyt, 1950'li yıllardan itibaren deniz suyu arıtma teknolojisine öncülük etmiş, kentsel ve sınai tatlı su ihtiyacının tamamına yakınını devasa desalinasyon tesislerinden sağlamıştır.",
    after:
      "Ülke sınırları dahilinde tek bir sürekli akarsu, doğal göl ya da daimi tatlı su kaynağı bulunmaz. Yağmur sonrasında kısa süreliğine su taşıyan ve Basra Körfezi'ne doğru hafif meyil çizen kuru çöl vadileri (özellikle Vadi el-Bâtın) yüzey akışının tek izleridir. \n\nYeraltında bulunan sınırlı su rezervleri yüksek oranda kükürtlü ve tuzlu olduğundan doğrudan tüketime uygun değildir. Bu mutlak su yokluğu nedeniyle Kuveyt, 1950'li yıllardan itibaren deniz suyu arıtma teknolojisine öncülük etmiş, kentsel ve sınai tatlı su ihtiyacının tamamına yakınını devasa arıtma tesislerinden sağlamıştır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'LB',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Fiziki yapı kıyıdan içe doğru dört morfolojik kuşağa ayrılır. Kıyıda portakal bahçeleri ve falezlerle kesintiye uğrayan dar kıyı düzlüğü uzanır; bu düzlüğün hemen ardından duvar gibi yükselen Lübnan Dağları (Cebel-i Lübnan) başlar. Kuzeyde 3.088 metreye ulaşan Kurnet es-Sevda doruğuyla Akdeniz kıyısındaki en yüksek yükseltiyi oluşturan bu silsile, kireçtaşı yapısı nedeniyle derin kanyonlar, mağaralar ve düdenlerle yarılmıştır. \n\nLübnan Dağları'nın doğusunda, Doğu Afrika Rift Sistemi'nin kuzey uzantısını oluşturan verimli Bekaa Çöküntü Vadisi uzanır. Deniz seviyesinden 900-1.000 metre yükseklikte asılı duran bu çöküntü hendeğinin doğu sınırını ise Suriye ile sınırı çizen Anti-Lübnan Sıradağları (Cebelü'ş-Şarki) ve onun güney ucundaki karlı Hermon Dağı kütlesi kapatır.",
    after:
      "Arazi kıyıdan içe doğru dört yer şekli kuşağına ayrılır. Kıyıda portakal bahçeleri ve falezlerle kesintiye uğrayan dar kıyı düzlüğü uzanır; bu düzlüğün hemen ardından duvar gibi yükselen Lübnan Dağları (Cebel-i Lübnan) başlar. Kuzeyde 3.088 metreye ulaşan Kurnet es-Sevda doruğuyla Levant'ın en yüksek yükseltiyi oluşturan bu silsile, kireçtaşı yapısı nedeniyle derin kanyonlar, mağaralar ve düdenlerle yarılmıştır. \n\nLübnan Dağları'nın doğusunda, Doğu Afrika Rift Sistemi'nin kuzey uzantısını oluşturan verimli Bekaa Çöküntü Vadisi uzanır. Deniz seviyesinden 900-1.000 metre yükseklikte asılı duran bu çukur vadinin doğu sınırını ise Suriye ile sınırı çizen Anti-Lübnan Sıradağları (Cebelü'ş-Şarki) ve onun güney ucundaki karlı Hermon Dağı kütlesi kapatır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'LB',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Küçük yüzölçümüne karşın topoğrafyadaki sert eğimler belirgin mikroklimatik katmanlar oluşturur. Kıyı kuşağında kışları ılık ve bol yağışlı, yazları sıcak ve nemli tipik bir Doğu Akdeniz iklimi hüküm sürer. Denizden gelen nemli hava kütleleri Lübnan Dağları'nın batı yamaçlarına çarparak yükselir ve orografik yağışlarla yıllık 1.000-1.400 milimetreye varan yağış bırakır. \n\nDağların zirveleri aralık ayından mayıs ayına kadar kalın bir kar örtüsü altında kalır; ülkenin adı da bu parıldayan kireçtaşı ve kar beyazlığından gelir. Buna karşılık, Lübnan Dağları'nın arkasında kalan Bekaa Vadisi ve Anti-Lübnan Dağları yağış gölgesinde kalır; deniz etkisinden yalıtılan vadide kışları dondurucu soğuklar, yazları ise kurak ve sıcak bozkır koşulları yaşanır.",
    after:
      "Küçük yüzölçümüne karşın topoğrafyadaki sert eğimler kısa mesafelerde birbirinden farklı yerel iklimler oluşturur. Kıyı kuşağında kışları ılık ve bol yağışlı, yazları sıcak ve nemli tipik bir Doğu Akdeniz iklimi hüküm sürer. Denizden gelen nemli hava kütleleri Lübnan Dağları'nın batı yamaçlarına çarparak yükselir ve yamaç (orografik) yağışlarıyla yıllık 1.000-1.400 milimetreye varan yağış bırakır. \n\nDağların zirveleri aralık ayından mayıs ayına kadar kalın bir kar örtüsü altında kalır; ülkenin adı da bu parıldayan kireçtaşı ve kar beyazlığından gelir. Buna karşılık, Lübnan Dağları'nın arkasında kalan Bekaa Vadisi ve Anti-Lübnan Dağları yağış gölgesinde kalır; deniz etkisinden yalıtılan vadide kışları dondurucu soğuklar, yazları ise kurak ve sıcak bozkır koşulları yaşanır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'LB',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Lübnan, karstik kireçtaşı dağlarının tuttuğu kar ve yağmur suları sayesinde Orta Doğu'nun en zengin su kaynaklarına ev sahipliği yapar. Kar erimeleriyle beslenen yüzlerce karstik gür kaynak (vaucluse kaynakları), yeraltından fışkırarak dağ nehirlerini ve kıyı derelerini besler. \n\nÜlkenin en önemli akarsuyu, Bekaa Vadisi'nden doğup vadiyi güneye doğru boydan boya kateden ve ardından batıya kıvrılarak Akdeniz'e dökülen Litani Nehri'dir; üzerinde kurulu Karaun Baraj Gölü tarımsal sulama ve enerji üretiminin merkezidir. Bekaa'nın kuzeyinden doğan Asi (Orontes) Nehri ise kuzeye akarak Suriye ve Türkiye üzerinden denize ulaşır.",
    after:
      "Lübnan, karstik kireçtaşı dağlarının tuttuğu kar ve yağmur suları sayesinde Orta Doğu'nun en zengin su kaynaklarına ev sahipliği yapar. Kar erimeleriyle beslenen yüzlerce karstik gür kaynak (voklüz kaynakları), yeraltından fışkırarak dağ nehirlerini ve kıyı derelerini besler. \n\nÜlkenin en önemli akarsuyu, Bekaa Vadisi'nden doğup vadiyi güneye doğru boydan boya kateden ve ardından batıya kıvrılarak Akdeniz'e dökülen Litani Nehri'dir; üzerinde kurulu Karaun Baraj Gölü tarımsal sulama ve enerji üretiminin merkezidir. Bekaa'nın kuzeyinden doğan Asi (Orontes) Nehri ise kuzeye akarak Suriye ve Türkiye üzerinden denize ulaşır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'OM',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ülkenin kuzeyini, kıyı boyunca kavis çizerek yükselen Hacer Dağları taçlandırır. Yer kabuğunun derinliklerinden itilmiş ofiyolit kayaçları ve kireçtaşı kanyonlarıyla jeolojik açıdan dünyada eşsiz olan bu sıradağ, Cebel Ahdar kütlesi üzerindeki Cebel Şems doruğunda 3.009 metreye ulaşır. Dağların denize bakan dar eteğinde verimli Batına kıyı ovası, içe bakan eteğinde ise çakıllı vadi tabanları yer alır. \n\nHacer Dağları'nın güneyinde arazi birdenbire düzleşerek taşlık düzlükler ve çakıl çöllerine dönüşür; batıda ise dünyanın en büyük kesintisiz kum çölü olan Rubalhali'nin uçsuz bucaksız kumullarıyla birleşir. Ülkenin en güneyinde yer alan Zufar bölgesi ise kireçtaşı yaylaları ve kıyı düzlükleriyle kuzeyden ayrılır; kuzeydeki Musandam burnu ise batık vadilerin oluşturduğu derin fiyort benzeri boğazlarıyla ayırt edilir.",
    after:
      "Ülkenin kuzeyini, kıyı boyunca kavis çizerek yükselen Hacer Dağları taçlandırır. Yer kabuğunun derinliklerinden yüzeye itilmiş ofiyolit kayaçları ve kireçtaşı kanyonlarıyla jeolojik açıdan dünyada eşsiz olan bu sıradağ, Cebel Ahdar kütlesi üzerindeki Cebel Şems doruğunda 3.009 metreye ulaşır. Dağların denize bakan dar eteğinde verimli Batına kıyı ovası, içe bakan eteğinde ise çakıllı vadi tabanları yer alır. \n\nHacer Dağları'nın güneyinde arazi birdenbire düzleşerek taşlık düzlükler ve çakıl çöllerine dönüşür; batıda ise dünyanın en büyük kesintisiz kum çölü olan Rubalhali'nin uçsuz bucaksız kumullarıyla birleşir. Ülkenin en güneyinde yer alan Zufar bölgesi ise kireçtaşı yaylaları ve kıyı düzlükleriyle kuzeyden ayrılır; kuzeydeki Musandam burnu ise batık vadilerin oluşturduğu derin fiyort benzeri boğazlarıyla ayırt edilir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'OM',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Umman'ın büyük bölümünde aşırı sıcak ve kurak çöl iklimi hüküm sürer; yaz aylarında iç çöllerde sıcaklıklar 45 derecenin üzerine fırlar. Ancak iki bölge bu çöl kuraklığının tamamen dışına çıkarak olağanüstü mikroklimatik alanlar oluşturur: \n\nKuzeydeki Cebel Ahdar yaylaları, 2.000 metreyi aşan rakımı sayesinde serin dağ havasına ve nar ile ceviz yetiştiriciliğine imkân tanıyan yağışlara kavuşur. En güneydeki Zufar bölgesi ise haziran ve eylül ayları arasında Hint Okyanusu musonunun (Harif) etki alanına girer. Bu mevsimde Salalah tepeleri yoğun sis, çisenti ve serin hava dalgasıyla kaplanarak bütünüyle yemyeşil bir subtropikal orman örtüsüne bürünür.",
    after:
      "Umman'ın büyük bölümünde aşırı sıcak ve kurak çöl iklimi hüküm sürer; yaz aylarında iç çöllerde sıcaklıklar 45 derecenin üzerine fırlar. Ancak iki bölge bu çöl kuraklığının tamamen dışına çıkarak olağanüstü yerel iklim alanları oluşturur: \n\nKuzeydeki Cebel Ahdar yaylaları, 2.000 metreyi aşan rakımı sayesinde serin dağ havasına ve nar ile ceviz yetiştiriciliğine imkân tanıyan yağışlara kavuşur. En güneydeki Zufar bölgesi ise haziran ve eylül ayları arasında Hint Okyanusu musonunun (Harif) etki alanına girer. Bu mevsimde Salalah tepeleri yoğun sis, çisenti ve serin hava dalgasıyla kaplanarak bütünüyle yemyeşil bir subtropikal orman örtüsüne bürünür.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'OM',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Ülkede yıl boyu sürekli akan kalıcı bir nehir yoktur; yüzeysel akış yağışlar sonrasında aniden dolup taşan ve ardından kuruyan derin vadilerle (Vadi Şab, Vadi Tiwi, Vadi Beni Halid) sağlanır. Dağlardan gelen bu taşkın suları, yer altına sızarak piedmont akiferlerini besler. \n\nUmman medeniyetinin ve vaha yerleşimlerinin can damarı, UNESCO Dünya Mirası Listesi'nde yer alan bin yıllık 'eflec' (aflaj) sulama sistemidir. Bu yerçekimli yeraltı kanal şebekesi, dağ eteklerindeki su kaynaklarını kilometrelerce uzaktaki hurma bahçelerine ve köylere buharlaşmadan ulaştırır. Modern kıyı kentlerinin su güvenliği ise büyük oranda deniz suyu arıtma tesislerine dayanır.",
    after:
      "Ülkede yıl boyu sürekli akan kalıcı bir nehir yoktur; yüzeysel akış yağışlar sonrasında aniden dolup taşan ve ardından kuruyan derin vadilerle (Vadi Şab, Vadi Tiwi, Vadi Beni Halid) sağlanır. Dağlardan gelen bu taşkın suları, yer altına sızarak dağ eteklerindeki yer altı su katmanlarını besler. \n\nUmman medeniyetinin ve vaha yerleşimlerinin can damarı, UNESCO Dünya Mirası Listesi'nde yer alan bin yıllık 'eflec' (aflaj) sulama sistemidir. Bu yerçekimli yeraltı kanal şebekesi, dağ eteklerindeki su kaynaklarını kilometrelerce uzaktaki hurma bahçelerine ve köylere buharlaşmadan ulaştırır. Modern kıyı kentlerinin su güvenliği ise büyük oranda deniz suyu arıtma tesislerine dayanır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'QA',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Arap Yarımadası'nın doğusundan Basra Körfezi'nin sığ sularına doğru kuzey yönünde uzanan alçak kireçtaşı yarımadası üzerinde kurulu Katar, kara sınırında yalnızca güneydeki Suudi Arabistan ile komşudur. Üç tarafı körfez sularıyla kuşatılmış olan ülke, sığ mercan resifleri, kum setleri ve zengin denizaltı hidrokarbon yataklarıyla çevrilidir.",
    after:
      "Arap Yarımadası'nın doğusundan Basra Körfezi'nin sığ sularına doğru kuzey yönünde uzanan alçak kireçtaşı yarımadası üzerinde kurulu Katar, kara sınırında yalnızca güneydeki Suudi Arabistan ile komşudur. Üç tarafı körfez sularıyla kuşatılmış olan ülke, sığ mercan resifleri, kum setleri ve zengin deniz altı petrol ve doğal gaz yataklarıyla çevrilidir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'QA',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      'Katar topraklarında hiçbir akarsu, tatlı su gölü veya kalıcı açık yüzey suyu kaynağı bulunmaz. Yağış suları yüzeyde akışa geçmek yerine zemindeki karstik çöküntülerde toplanır veya hızla buharlaşır. \n\nKuzeydeki sığ akiferlerde biriken tatlı yeraltı su lensleri, tarih boyunca sınırlı vaha tarımını ve kuyu yerleşimlerini beslemiş olsa da modern dönemdeki aşırı tüketim yeraltı su seviyesini düşürmüş ve deniz suyunun tatlı su katmanlarına karışmasına yol açmıştır. Günümüzde kentsel, endüstriyel ve tarımsal tatlı su ihtiyacının tamamına yakını ileri teknolojiye sahip deniz suyu arıtma (desalinasyon) tesisleriyle temin edilmektedir.',
    after:
      'Katar topraklarında hiçbir akarsu, tatlı su gölü veya kalıcı açık yüzey suyu kaynağı bulunmaz. Yağış suları yüzeyde akışa geçmek yerine zemindeki karstik çöküntülerde toplanır veya hızla buharlaşır. \n\nKuzeydeki sığ yer altı katmanlarında biriken tatlı su birikintileri, tarih boyunca sınırlı vaha tarımını ve kuyu yerleşimlerini beslemiş olsa da modern dönemdeki aşırı tüketim yeraltı su seviyesini düşürmüş ve deniz suyunun tatlı su katmanlarına karışmasına yol açmıştır. Günümüzde kentsel, endüstriyel ve tarımsal tatlı su ihtiyacının tamamına yakını ileri teknolojiye sahip deniz suyu arıtma (desalinasyon) tesisleriyle temin edilmektedir.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SA',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Arap Yarımadası'nın yaklaşık beşte dördünü kaplayan Suudi Arabistan; batıda Kızıldeniz yarığı, doğuda ise sığ Basra Körfezi tortul havzası arasında yükselen devasa bir kıtasal kalkan üzerinde yer alır. Kuzeyde Levant bozkırlarından güneyde Yemen ve Umman'ın dağlık kıyılarına kadar yedi ülkeyle kara sınırı paylaşan ülke, bölgenin coğrafi omurgasını oluşturur.",
    after:
      "Arap Yarımadası'nın yaklaşık beşte dördünü kaplayan Suudi Arabistan; batıda Kızıldeniz yarığı, doğuda ise sığ Basra Körfezi'nin tortullarla dolu havzası arasında yükselen, çok eski ve sağlam devasa bir kara kütlesi (kıtasal kalkan) üzerinde yer alır. Kuzeyde Levant bozkırlarından güneyde Yemen ve Umman'ın dağlık kıyılarına kadar yedi ülkeyle kara sınırı paylaşan ülke, bölgenin coğrafi omurgasını oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SA',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ülke topoğrafyası batıdan doğuya doğru alçalan devasa bir eğik kütle niteliğindedir. Kızıldeniz kıyısını izleyen dar ve sıcak Tihame sahil ovasının hemen ardından fay diklikleriyle duvar gibi yükselen Hicaz ve Asir dağları başlar. Asir bölgesinde 3.000 metreyi aşan Cebel Sevda ülkenin zirvesidir. Bu yüksek dağ omurgası, kıtasal riftleşmenin doğurduğu sert bir morfolojik sınırdır. \n\nDağların doğu yamaçlarından itibaren zemin yumuşak bir eğimle alçalarak kireçtaşı ve kumtaşı kuestalarından oluşan geniş Necid Platosu'na kavuşur. Platonun kuzeyini kırmızı kumullarıyla ünlü Büyük Nefud Çölü, doğusunu hilal biçimli Ed-Dehna kum koridoru, güneyini ise 650.000 kilometrekarelik yüzölçümüyle yeryüzünün en büyük kesintisiz kum denizi olan Rubalhali kaplar; Basra Körfezi kıyıları ise geniş tuz düzlükleri ve sığ resiflerle nihayetlenir.",
    after:
      "Ülke topoğrafyası batıdan doğuya doğru alçalan devasa bir eğik kütle niteliğindedir. Kızıldeniz kıyısını izleyen dar ve sıcak Tihame sahil ovasının hemen ardından fay diklikleriyle duvar gibi yükselen Hicaz ve Asir dağları başlar. Asir bölgesinde 3.000 metreyi aşan Cebel Sevda ülkenin zirvesidir. Bu yüksek dağ omurgası, kıtanın yarılmasıyla (riftleşme) oluşmuş keskin bir doğal sınırdır. \n\nDağların doğu yamaçlarından itibaren zemin yumuşak bir eğimle alçalarak bir yamacı dik, öteki yatık kireçtaşı ve kumtaşı sırtlarından (kuesta) oluşan geniş Necid Platosu'na kavuşur. Platonun kuzeyini kırmızı kumullarıyla ünlü Büyük Nefud Çölü, doğusunu hilal biçimli Ed-Dehna kum koridoru, güneyini ise 650.000 kilometrekarelik yüzölçümüyle yeryüzünün en büyük kesintisiz kum denizi olan Rubalhali kaplar; Basra Körfezi kıyıları ise geniş tuz düzlükleri ve sığ resiflerle nihayetlenir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SA',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Suudi Arabistan, sınırları içinde tek bir daimi nehir veya doğal tatlı su gölü bulunmayan dünyanın en büyük ülkesidir. Yüzey drenajı, jeolojik çağlardaki nemli dönemlerin yadigârı olan ve günümüzde yalnızca nadir yağmurlar sonrasında sel sularıyla dolan devasa fosil vadi ağlarıyla (Vadi er-Rumme, Vadi Hanife, Vadi ed- Devasir) temsil edilir. \n\nGeleneksel vaha tarımı, bu vadilerin tabanındaki sığ alüvyon sularına dayanmıştır. 20. yüzyılın ikinci yarısında derin çöl tabakalarındaki fosil akiferlerin çekilmesiyle büyük buğday tarlaları sulanmışsa da bu yenilenemeyen su rezervleri tükenme tehlikesiyle karşı karşıya kalmıştır. Günümüzde ülke, dünyanın en büyük deniz suyu arıtma (desalinasyon) kapasitesine sahiptir ve körfez kentlerinin yanı sıra yüzlerce kilometre içerideki başkent Riyad'ın suyu da boru hatlarıyla kıyı arıtma tesislerinden taşınmaktadır.",
    after:
      "Suudi Arabistan, sınırları içinde tek bir daimi nehir veya doğal tatlı su gölü bulunmayan dünyanın en büyük ülkesidir. Yüzey akışı, jeolojik çağlardaki nemli dönemlerin yadigârı olan ve günümüzde yalnızca nadir yağmurlar sonrasında sel sularıyla dolan devasa fosil vadi ağlarıyla (Vadi er-Rumme, Vadi Hanife, Vadi ed-Devasir) temsil edilir. \n\nGeleneksel vaha tarımı, bu vadilerin tabanındaki sığ alüvyon sularına dayanmıştır. 20. yüzyılın ikinci yarısında derin çöl tabakalarındaki fosil yer altı sularının çekilmesiyle büyük buğday tarlaları sulanmışsa da bu yenilenemeyen su rezervleri tükenme tehlikesiyle karşı karşıya kalmıştır. Günümüzde ülke, dünyanın en büyük deniz suyu arıtma (desalinasyon) kapasitesine sahiptir ve körfez kentlerinin yanı sıra yüzlerce kilometre içerideki başkent Riyad'ın suyu da boru hatlarıyla kıyı arıtma tesislerinden taşınmaktadır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SY',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Doğu Akdeniz kıyılarından Mezopotamya havzasına ve Suriye Çölü'ne uzanan Suriye, Anadolu dağları ile Arap Yarımadası kalkanı arasında yer alan kadim bir coğrafi kavşaktır. Akdeniz'e açılan dar kıyı koridoru, dağlık batı bariyeri ve doğuya doğru genişleyen yarı kurak bozkırları, ülkeyi Levant'ın en kritik geçiş sahası kılar.",
    after:
      "Doğu Akdeniz kıyılarından Mezopotamya havzasına ve Suriye Çölü'ne uzanan Suriye, Anadolu dağları ile Arap Yarımadası kalkanı arasında yer alan kadim bir coğrafi kavşaktır. Akdeniz'e açılan dar kıyı koridoru, dağlık batı engeli ve doğuya doğru genişleyen yarı kurak bozkırları, ülkeyi Levant'ın en kritik geçiş sahası kılar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SY',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "İklim, morfolojik kademelenmeye kusursuz bir uyum gösterir. Kıyı şeridinde ve Kıyı Sıradağları'nın batı yamaçlarında ılık, yağışlı kışlar ve nemli, sıcak yazlarla belirgin tipik Akdeniz iklimi hüküm sürer; burada yıllık yağış 800-1.000 milimetreyi aşar. \n\nKıyı dağlarını aştıktan hemen sonra yağış belirgin biçimde düşer; iç kesimdeki tarım vadilerinde kışları soğuk ve yazları sıcak yarı-kurak bozkır iklimi etkili olur. Fırat'ın doğusuna ve Bâdiye'ye geçildiğinde ise yıllık yağışın 150 milimetrenin altına indiği, gece-gündüz sıcaklık farklarının keskinleştiği sert çöl iklimi egemen hale gelir.",
    after:
      "İklim, arazinin basamaklı yapısına tam olarak uyar. Kıyı şeridinde ve Kıyı Sıradağları'nın batı yamaçlarında ılık, yağışlı kışlar ve nemli, sıcak yazlarla belirgin tipik Akdeniz iklimi hüküm sürer; burada yıllık yağış 800-1.000 milimetreyi aşar. \n\nKıyı dağlarını aştıktan hemen sonra yağış belirgin biçimde düşer; iç kesimdeki tarım vadilerinde kışları soğuk ve yazları sıcak yarı-kurak bozkır iklimi etkili olur. Fırat'ın doğusuna ve Bâdiye'ye geçildiğinde ise yıllık yağışın 150 milimetrenin altına indiği, gece-gündüz sıcaklık farklarının keskinleştiği sert çöl iklimi egemen hale gelir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SY',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Suriye'nin en önemli hidrolojik arteri ve can damarı, Türkiye dağlarında doğup ülkeyi kuzeybatıdan güneydoğuya kat eden Fırat Nehri'dir. Nehir üzerinde inşa edilen Tabka Barajı'nın gerisinde oluşan devasa Esed Gölü, ülkenin en büyük tatlı su rezervuarı olup tarımsal sulama ve elektrik üretiminin merkezidir; nehre katılan Habur ve Balih kolları ise Cezire bölgesini sular. \n\nBatıda Lübnan'dan doğup Ghab çöküntüsünü sulayarak Türkiye'ye geçen Asi (Orontes) Nehri ile Anti-Lübnan Dağları'nın karstik kaynaklarından beslenip Şam Vahası'nı (Guta) binlerce yıldır yeşerten Barada Nehri diğer hayati su yollarıdır. Doğu ve güney çöl alanlarında ise yüzey suyu bulunmaz; tarımsal üretim bütünüyle nehir vadilerine ve yeraltı kuyularına bağımlıdır.",
    after:
      "Suriye'nin en önemli akarsuyu ve can damarı, Türkiye dağlarında doğup ülkeyi kuzeybatıdan güneydoğuya kat eden Fırat Nehri'dir. Nehir üzerinde inşa edilen Tabka Barajı'nın gerisinde oluşan devasa Esed Gölü, ülkenin en büyük tatlı su rezervuarı olup tarımsal sulama ve elektrik üretiminin merkezidir; nehre katılan Habur ve Balih kolları ise Cezire bölgesini sular. \n\nBatıda Lübnan'dan doğup Ghab çöküntüsünü sulayarak Türkiye'ye geçen Asi (Orontes) Nehri ile Anti-Lübnan Dağları'nın karstik kaynaklarından beslenip Şam Vahası'nı (Guta) binlerce yıldır yeşerten Barada Nehri diğer hayati su yollarıdır. Doğu ve güney çöl alanlarında ise yüzey suyu bulunmaz; tarımsal üretim bütünüyle nehir vadilerine ve yeraltı kuyularına bağımlıdır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AE',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Arap Yarımadası'nın doğusunda, Basra Körfezi'nin güney kıyıları boyunca uzanan ve doğuda Umman Körfezi'ne kısa bir cephesi bulunan Birleşik Arap Emirlikleri, yedi emirliğin bir araya gelmesiyle oluşan bir kıyı ve çöl federasyonudur. Körfez deniz ticaretini kontrol eden stratejik konumu, sığ lagünleri ve çöl hinterlandı ülkenin coğrafi yapısını tanımlar.",
    after:
      "Arap Yarımadası'nın doğusunda, Basra Körfezi'nin güney kıyıları boyunca uzanan ve doğuda Umman Körfezi'ne kısa bir cephesi bulunan Birleşik Arap Emirlikleri, yedi emirliğin bir araya gelmesiyle oluşan bir kıyı ve çöl federasyonudur. Körfez deniz ticaretini kontrol eden stratejik konumu, sığ lagünleri ve iç kesimlerdeki çölleri ülkenin coğrafi yapısını tanımlar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AE',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Ülke genelinde yıl boyu yüksek sıcaklıkların hüküm sürdüğü aşırı kurak çöl iklimi egemendir. Mayıs-eylül arasındaki yaz aylarında sıcaklıklar kıyı kentlerinde 45 dereceyi aşarken, Basra Körfezi'nin sığ sularından buharlaşan yoğun nem havayı doygunluğa ulaştırarak kıyılarda aşırı boğucu bir ortam yaratır. İç kesimlerdeki çöllerde ise gündüzleri kavurucu sıcaklık, geceleri ise belirgin bir serinliğe evrilir. \n\nYıllık yağış miktarı 100 milimetrenin altında kalır ve kış ile erken ilkbahardaki seyrek sağanaklardan ibarettir. Yalnızca Hacer Dağları'nın yüksek zirveleri orografik yükselme sayesinde kışın daha fazla yağış alır ve yaz aylarında çöl ovalarına kıyasla 10-15 derece daha serin bir mikroklima sunar.",
    after:
      "Ülke genelinde yıl boyu yüksek sıcaklıkların hüküm sürdüğü aşırı kurak çöl iklimi egemendir. Mayıs-eylül arasındaki yaz aylarında sıcaklıklar kıyı kentlerinde 45 dereceyi aşarken, Basra Körfezi'nin sığ sularından buharlaşan yoğun nem havayı doygunluğa ulaştırarak kıyılarda aşırı boğucu bir ortam yaratır. İç kesimlerdeki çöllerde ise gündüzleri kavurucu sıcaklık, geceleri ise belirgin bir serinliğe evrilir. \n\nYıllık yağış miktarı 100 milimetrenin altında kalır ve kış ile erken ilkbahardaki seyrek sağanaklardan ibarettir. Yalnızca Hacer Dağları'nın yüksek zirveleri nemli havanın yamaçlarda yükselip soğuması sayesinde kışın daha fazla yağış alır ve yaz aylarında çöl ovalarına kıyasla 10-15 derece daha serin bir yerel iklim sunar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AE',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Birleşik Arap Emirlikleri'nde akışı sürekli olan hiçbir doğal nehir veya daimi tatlı su gölü bulunmaz. Dağlık doğu kesimindeki kuru vadiler (vadi), yalnızca kış aylarındaki ani yağışlar sonrasında coşkun seller taşıyarak kıyı ovalarına ve yeraltı akiferlerine su ulaştırır. \n\nTarihsel süreçte Al Ain ve Liva vahalarındaki hurma bahçeleri, dağ sularını yeraltından toplayan kadim 'eflec' kanalları ve sığ kuyularla sulanmıştır. Ancak çağdaş dönemde nüfusun ve kentleşmenin katlanmasıyla birlikte doğal yeraltı suları hızla tuzlanmış ve tükenmiştir. Ülke, içme suyu ve kentsel kullanımın neredeyse yüzde yüzünü yüksek kapasiteli deniz suyu arıtma (desalinasyon) tesislerinden temin eder; arıtılmış atık sular ise kentsel yeşil alanların sulanmasında geri dönüştürülür.",
    after:
      "Birleşik Arap Emirlikleri'nde akışı sürekli olan hiçbir doğal nehir veya daimi tatlı su gölü bulunmaz. Dağlık doğu kesimindeki kuru vadiler (vadi), yalnızca kış aylarındaki ani yağışlar sonrasında coşkun seller taşıyarak kıyı ovalarına ve yer altı su katmanlarına su ulaştırır. \n\nTarihsel süreçte Al Ain ve Liva vahalarındaki hurma bahçeleri, dağ sularını yeraltından toplayan kadim 'eflec' kanalları ve sığ kuyularla sulanmıştır. Ancak çağdaş dönemde nüfusun ve kentleşmenin katlanmasıyla birlikte doğal yeraltı suları hızla tuzlanmış ve tükenmiştir. Ülke, içme suyu ve kentsel kullanımın neredeyse yüzde yüzünü yüksek kapasiteli deniz suyu arıtma (desalinasyon) tesislerinden temin eder; arıtılmış atık sular ise kentsel yeşil alanların sulanmasında geri dönüştürülür.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'YE',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Arap Yarımadası'nın güneybatı köşesinde, Kızıldeniz ile Hint Okyanusu'nu (Aden Körfezi) birbirine bağlayan stratejik Babülmendep Boğazı'nın kıyısında yer alan Yemen, yarımadanın en dağlık ve en yüksek ülkesidir. Anakarasının yanı sıra, Afrika Boynuzu açıklarında eşsiz biyocoğrafik izolasyonuyla tanınan Sokotra Takımadası da Yemen topraklarının ayrılmaz bir parçasıdır.",
    after:
      "Arap Yarımadası'nın güneybatı köşesinde, Kızıldeniz ile Hint Okyanusu'nu (Aden Körfezi) birbirine bağlayan stratejik Babülmendep Boğazı'nın kıyısında yer alan Yemen, yarımadanın en dağlık ve en yüksek ülkesidir. Anakarasının yanı sıra, Afrika Boynuzu açıklarında bitki ve hayvanlarının dünyanın geri kalanından uzun süre yalıtılmış kalmasıyla tanınan Sokotra Takımadası da Yemen topraklarının ayrılmaz bir parçasıdır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'YE',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Kızıldeniz kıyısı boyunca uzanan sıcak ve kumlu Tihame sahil ovasının hemen ardından fay diklikleriyle duvar gibi yükselen batı yaylaları başlar. Tektonik kalkan yükselmesi ve volkanik kütlelerle şekillenen bu yaylalar, 2.000 ile 3.000 metre irtifada asılı duran derin kanyonlar ve aşınmış platolardan oluşur; 3.666 metre yüksekliğindeki Cebel en-Nebi Şuayb, yalnızca Yemen'in değil tüm Arap Yarımadası'nın en yüksek doruğudur. \n\nYüksek dağ silsilesi doğuya doğru kademeli olarak alçalarak kireçtaşı kanyonlarıyla yarılan Hadramut Platosu'na ve nihayetinde Rubalhali Çölü'nün kum denizine kavuşur. Hint Okyanusu'ndaki Sokotra Adası ise anakaradan milyonlarca yıl önce kopmuş kireçtaşı platoları, sarp Hacir Dağları ve endemik ejder kanadı ağaçlarıyla kaplı eşsiz bir paleo-coğrafik sığınaktır.",
    after:
      "Kızıldeniz kıyısı boyunca uzanan sıcak ve kumlu Tihame sahil ovasının hemen ardından fay diklikleriyle duvar gibi yükselen batı yaylaları başlar. Eski ve sağlam kara kütlesinin (kalkan) yükselmesi ve volkanik kütlelerle şekillenen bu yaylalar, 2.000 ile 3.000 metre irtifada asılı duran derin kanyonlar ve aşınmış platolardan oluşur; 3.666 metre yüksekliğindeki Cebel en-Nebi Şuayb, yalnızca Yemen'in değil tüm Arap Yarımadası'nın en yüksek doruğudur. \n\nYüksek dağ silsilesi doğuya doğru kademeli olarak alçalarak kireçtaşı kanyonlarıyla yarılan Hadramut Platosu'na ve nihayetinde Rubalhali Çölü'nün kum denizine kavuşur. Hint Okyanusu'ndaki Sokotra Adası ise anakaradan milyonlarca yıl önce kopmuş kireçtaşı platoları, sarp Hacir Dağları ve endemik ejder kanadı ağaçlarıyla kaplı çok eski çağlardan kalma canlıları koruyan eşsiz bir doğal sığınaktır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'YE',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Yemen'de denize sürekli su ulaştıran daimi bir nehir yoktur; hidrolojik hayat, yüksek yaylalardan doğarak derin kanyonlar boyunca Tihame'ye veya doğudaki vadilere boşalan mevsimlik sellerle (seyyiller) şekillenir. Vadi Hadramut, Vadi Bana ve Vadi Siham bu taşkın vadilerinin en görkemlileridir. \n\nYüzyıllar boyunca Yemenliler, bu ani taşkın sularını yakalamak için dik dağ yamaçlarını basamak basamak taş teraslarla donatmış ve antik Marib Barajı gibi bentlerle suyu vadi tabanlarına yönlendirmiştir. Ancak günümüzde derin kuyu sondajlarıyla yeraltı su seviyelerinin kritik eşiklerin altına inmesi, özellikle yüksek su tüketen kat (qat) tarımı ve kentsel talepler nedeniyle başkent Sana havzası dahil olmak üzere ülkeyi ağır bir su tükenme kriziyle karşı karşıya bırakmıştır.",
    after:
      "Yemen'de denize sürekli su ulaştıran daimi bir nehir yoktur; suya bağlı yaşam, yüksek yaylalardan doğarak derin kanyonlar boyunca Tihame'ye veya doğudaki vadilere boşalan mevsimlik sellerle (seyyiller) şekillenir. Vadi Hadramut, Vadi Bana ve Vadi Siham bu taşkın vadilerinin en görkemlileridir. \n\nYüzyıllar boyunca Yemenliler, bu ani taşkın sularını yakalamak için dik dağ yamaçlarını basamak basamak taş teraslarla donatmış ve antik Marib Barajı gibi bentlerle suyu vadi tabanlarına yönlendirmiştir. Ancak günümüzde derin kuyu sondajlarıyla yeraltı su seviyelerinin kritik eşiklerin altına inmesi, özellikle yüksek su tüketen kat (qat) tarımı ve kentsel talepler nedeniyle başkent Sana havzası dahil olmak üzere ülkeyi ağır bir su tükenme kriziyle karşı karşıya bırakmıştır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'DZ',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Ülkenin sürekli akış gösteren en uzun akarsuyu, Sahra Atlası'ndan doğup platoları aşarak Akdeniz'e dökülen yaklaşık 700 kilometrelik Chelif Nehri'dir. Chelif Vadisi, kuzey Cezayir'in en verimli tahıl ve meyve üretim havzalarından birini sular. \n\nGüneydeki Sahra kesiminde ise daimi akarsu bulunmaz. Drenaj, yalnızca ani ve şiddetli sağanaklardan sonra sel sularıyla dolup hızla kuruyan vadi yatakları (oued) ile suların buharlaşarak tuz kristalleri bıraktığı kapalı havza çukurluklarından (şat) ibarettir.",
    after:
      "Ülkenin sürekli akış gösteren en uzun akarsuyu, Sahra Atlası'ndan doğup platoları aşarak Akdeniz'e dökülen yaklaşık 700 kilometrelik Chelif Nehri'dir. Chelif Vadisi, kuzey Cezayir'in en verimli tahıl ve meyve üretim havzalarından birini sular. \n\nGüneydeki Sahra kesiminde ise daimi akarsu bulunmaz. Buradaki su akışı, yalnızca ani ve şiddetli sağanaklardan sonra sel sularıyla dolup hızla kuruyan vadi yatakları (oued) ile suların buharlaşarak tuz kristalleri bıraktığı kapalı havza çukurluklarından (şat) ibarettir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'EG',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ülke arazisi Nil Nehri tarafından belirgin jeomorfolojik ünitelere ayrılır. Nehrin batısında uzanan Batı (Libya) Çölü, rüzgar aşındırmasıyla oyulmuş devasa kum denizleri ve deniz seviyesinin 133 metre altına inen Kattara Çukurluğu gibi derin tektonik depresyonları barındırır. \n\nNil ile Kızıldeniz arasında uzanan Doğu Çölü ise dik ve kayalık Kızıldeniz Dağları ile yükselir. İki kıta kavşağındaki Sina Yarımadası'nda yükselen 2.642 metrelik Katerina Dağı, granit yapısıyla Mısır'ın en yüksek zirvesini oluşturur.",
    after:
      "Nil Nehri, ülke arazisini birbirinden belirgin biçimde ayrılan yer şekli bölgelerine böler. Nehrin batısında uzanan Batı (Libya) Çölü, rüzgar aşındırmasıyla oyulmuş devasa kum denizleri ve deniz seviyesinin 133 metre altına inen Kattara Çukurluğu gibi rüzgar aşındırması ve tuz ayrışmasıyla oyulmuş derin çöküntüleri barındırır. \n\nNil ile Kızıldeniz arasında uzanan Doğu Çölü ise dik ve kayalık Kızıldeniz Dağları ile yükselir. İki kıta kavşağındaki Sina Yarımadası'nda yükselen 2.642 metrelik Katerina Dağı, granit yapısıyla Mısır'ın en yüksek zirvesini oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'LY',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      'Libya, Akdeniz kıyısında geniş bir sahil şeridine sahip olmasına karşın topraklarının yüzde doksanından fazlası Sahra Çölü tarafından yutulmuş devasa bir kuraklık coğrafyasıdır. \n\nÜlke geleneksel ve morfolojik olarak üç ana bölgeye ayrılır: Kıyıdaki Trablusgarp (Tripolitanya), doğudaki kireçtaşı platosuyla yağış alan Sirenayka (Barka) ve güneydeki derin çöl vahalarından oluşan Fizan.',
    after:
      'Libya, Akdeniz kıyısında geniş bir sahil şeridine sahip olmasına karşın topraklarının yüzde doksanından fazlası Sahra Çölü tarafından yutulmuş devasa bir kuraklık coğrafyasıdır. \n\nÜlke hem geleneksel olarak hem de yer şekillerine göre üç ana bölgeye ayrılır: Kıyıdaki Trablusgarp (Tripolitanya), doğudaki kireçtaşı platosuyla yağış alan Sirenayka (Barka) ve güneydeki derin çöl vahalarından oluşan Fizan.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'LY',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      'Libya sınırları içinde yıl boyunca sürekli akış gösteren tek bir nehir dahi bulunmaz; yüzey hidrografyası yalnızca yağış dönemlerinde kısa süreli su toplayan kuru vadi yataklarından ibarettir. \n\nÜlkenin su ihtiyacının ezici çoğunluğu, Sahra\'nın derinliklerindeki Nubya Kumtaşı Akiferi\'nden çıkarılan fosil su rezervleriyle karşılanır. "Büyük Yapay Nehir" projesi kapsamında inşa edilen binlerce kilometrelik boru hatları, bu yeraltı suyunu güneyden kıyıdaki büyük şehirlere ve tarım alanlarına taşıyan yapay bir can damarıdır.',
    after:
      'Libya sınırları içinde yıl boyunca sürekli akış gösteren tek bir nehir dahi bulunmaz; yerüstü suları yalnızca yağış dönemlerinde kısa süreli su toplayan kuru vadi yataklarından ibarettir. \n\nÜlkenin su ihtiyacının ezici çoğunluğu, Sahra\'nın derinliklerindeki Nubya Kumtaşı Akiferi\'nden çıkarılan fosil su rezervleriyle karşılanır. "Büyük Yapay Nehir" projesi kapsamında inşa edilen binlerce kilometrelik boru hatları, bu yeraltı suyunu güneyden kıyıdaki büyük şehirlere ve tarım alanlarına taşıyan yapay bir can damarıdır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SD',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ülke arazisi, kenarları yükseltilerle çevrili devasa ve sığ bir tortul havzadır. Kuzey kesimini kum ve çakıl düzlüklerinden oluşan Nubya Çölü ile Libya Çölü kaplar; doğuda Kızıldeniz kıyısı boyunca dik Kızıldeniz Tepeleri uzanır. \n\nBatıda dalgalı Kordofan kumlu platoları yer alırken, Darfur bölgesinde volkanik kökenli Marra Dağları yükselir. Bu kütlenin doruğunda yer alan ve içinde iki krater gölü bulunduran 3.042 metrelik Deriba Kalderası, Sudan'ın en yüksek noktasıdır ve çevresine göre serin bir mikro-klima alanı yaratır.",
    after:
      "Ülke arazisi, kenarları yükseltilerle çevrili devasa ve sığ bir tortul havzadır. Kuzey kesimini kum ve çakıl düzlüklerinden oluşan Nubya Çölü ile Libya Çölü kaplar; doğuda Kızıldeniz kıyısı boyunca dik Kızıldeniz Tepeleri uzanır. \n\nBatıda dalgalı Kordofan kumlu platoları yer alırken, Darfur bölgesinde volkanik kökenli Marra Dağları yükselir. Bu kütlenin doruğunda yer alan ve içinde iki krater gölü bulunduran 3.042 metrelik Deriba Kalderası, Sudan'ın en yüksek noktasıdır ve çevresine göre serin bir yerel iklim alanı yaratır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SD',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Sudan iklimi, kuzeydeki kavurucu Sahra çölünden güneydeki yağışlı savan kuşağına kadar belirgin bir enlemsel kademelenme gösterir. Mısır sınırında neredeyse hiç yağış görülmezken, güneye doğru inildikçe muson yağışlarının süresi ve miktarı kademeli olarak artar. \n\nBaşkent Hartum, yıl boyu ortalama 30 derecenin üzerindeki sıcaklığıyla dünyanın en sıcak başkentlerinden biridir; yaz başlangıcında Habub adı verilen şiddetli kum ve toz fırtınaları kenti saatler içinde karanlığa gömebilir.',
    after:
      "Sudan'da iklim, kuzeydeki kavurucu Sahra çölünden güneydeki yağışlı savan kuşağına kadar enleme bağlı olarak kademe kademe değişir. Mısır sınırında neredeyse hiç yağış görülmezken, güneye doğru inildikçe muson yağışlarının süresi ve miktarı kademeli olarak artar. \n\nBaşkent Hartum, yıl boyu ortalama 30 derecenin üzerindeki sıcaklığıyla dünyanın en sıcak başkentlerinden biridir; yaz başlangıcında Habub adı verilen şiddetli kum ve toz fırtınaları kenti saatler içinde karanlığa gömebilir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SD',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Sudan hidrolojisi, Mavi ve Beyaz Nil'in zıt akış rejimleriyle şekillenir. Mavi Nil, Etiyopya'daki Tana Gölü'nden doğar; yaz musonlarıyla kabaran volkanik alüvyon yüklü sularıyla Nil sisteminin debisinin ve bereketli tortusunun yaklaşık yüzde seksenini taşır. Ekvatoral göllerden gelen Beyaz Nil ise yıl boyu daha dengeli ve berrak akar. \n\nHartum'da birleştikten sonra kuzeye yönelen nehir, Mısır sınırına kadar altı büyük çağlayandan (katarakt) geçer; sisteme katılan son kol mevsimsel taşkınlarıyla ünlü Atbara Nehri'dir. En kuzeyde ise Asvan Barajı'nın suları Sudan sınırına taşarak Nubya Gölü rezervuarını oluşturur.",
    after:
      "Sudan'ın suları, Mavi ve Beyaz Nil'in birbirine zıt akış düzenleriyle şekillenir. Mavi Nil, Etiyopya'daki Tana Gölü'nden doğar; yaz musonlarıyla kabaran volkanik alüvyon yüklü sularıyla Nil sisteminin yıllık debisinin yaklaşık üçte ikisini ve bereketli tortusunun büyük kısmını taşır. Ekvatoral göllerden gelen Beyaz Nil ise yıl boyu daha dengeli ve berrak akar. \n\nHartum'da birleştikten sonra kuzeye yönelen nehir, Mısır sınırına kadar altı büyük çağlayandan (katarakt) geçer; sisteme katılan son kol mevsimsel taşkınlarıyla ünlü Atbara Nehri'dir. En kuzeyde ise Asvan Barajı'nın suları Sudan sınırına taşarak Nubya Gölü rezervuarını oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TN',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Tunus, Afrika kıtasının Akdeniz'e en çok sokulan ve Sicilya Kanalı üzerinden Avrupa'ya en çok yaklaşan kuzeydoğu kalesidir; anakaranın en kuzey ucu olan Ras Ben Sakka Burnu da bu topraklarda yer alır. \n\nKüçük yüzölçümüne karşın ülke, kuzeydeki ormanlık Akdeniz tepelerinden orta kesimdeki bozkırlara ve güneydeki Sahra kumullarına kadar kademelenen zengin bir topoğrafik çeşitlilik sergiler.",
    after:
      "Tunus, Afrika kıtasının Akdeniz'e en çok sokulan ve Sicilya Kanalı üzerinden Avrupa'ya en çok yaklaşan kuzeydoğu kalesidir; anakaranın en kuzey ucu olan Ras Ben Sakka Burnu da bu topraklarda yer alır. \n\nKüçük yüzölçümüne karşın ülke, kuzeydeki ormanlık Akdeniz tepelerinden orta kesimdeki bozkırlara ve güneydeki Sahra kumullarına kadar kademelenen zengin bir yer şekli çeşitliliği gösterir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TN',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Tunus'ta iklim kuzeyden güneye Akdeniz ile Sahra dinamikleri arasında keskin biçimde değişir. Kuzey kıyılarında ve Kroumirie tepelerinde kışları ılık ve bol yağışlı Akdeniz iklimi görülür; orografik etkiyle yıllık yağış burada 1.000-1.500 milimetreye ulaşır. \n\nOrta bozkırlarda yıllık yağış 300 milimetrenin altına inerken, güneydeki Sahra kuşağında 100 milimetrenin de altına düşer. Yaz aylarında Sahra'dan esen sıcak ve kuru çöl rüzgarı (şili), sıcaklıkları kısa sürede 40 derecenin üzerine çıkarabilir.",
    after:
      "Tunus'ta iklim kuzeyden güneye Akdeniz ile Sahra etkileri arasında keskin biçimde değişir. Kuzey kıyılarında ve Kroumirie tepelerinde kışları ılık ve bol yağışlı Akdeniz iklimi görülür; nemli hava tepelere tırmanırken yağış bıraktığı için yıllık yağış burada 1.000-1.500 milimetreye ulaşır. \n\nOrta bozkırlarda yıllık yağış 300 milimetrenin altına inerken, güneydeki Sahra kuşağında 100 milimetrenin de altına düşer. Yaz aylarında Sahra'dan esen sıcak ve kuru çöl rüzgarı (şili), sıcaklıkları kısa sürede 40 derecenin üzerine çıkarabilir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BJ',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Kıyı şeridi, deniz dalgalarının yığdığı kum setleri, mangrovlar ve Nokoué gibi sığ lagünlerle kaplı alçak bir kıyı ovasıdır. Kıyının hemen ardında, Couffo, Zou ve Ouémé nehirlerinin yardığı killi ve verimli güney platoları uzanır; orta kesimde arazi granit kayalık tepelerle (inselberg) çeşitlenen dalgalı bir peneplen halini alır. \n\nKuzeybatıda, Togo sınırına paralel uzanan Atakora Sıradağları ülkenin en engebeli topoğrafyasını oluşturur; kuvarsit ve kumtaşından oluşan bu kütle üzerindeki 658 metrelik Sokbaro Dağı, Benin'in en yüksek noktasıdır.",
    after:
      "Kıyı şeridi, deniz dalgalarının yığdığı kum setleri, mangrovlar ve Nokoué gibi sığ lagünlerle kaplı alçak bir kıyı ovasıdır. Kıyının hemen ardında, Couffo, Zou ve Ouémé nehirlerinin yardığı killi ve verimli güney platoları uzanır; orta kesimde arazi granit kayalık tepelerle (inselberg) çeşitlenen dalgalı bir aşınım düzlüğü (peneplen) halini alır. \n\nKuzeybatıda, Togo sınırına paralel uzanan Atakora Sıradağları ülkenin en engebeli topoğrafyasını oluşturur; kuvarsit ve kumtaşından oluşan bu kütle üzerindeki 658 metrelik Sokbaro Dağı, Benin'in en yüksek noktasıdır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BF',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Batı Afrika'nın kalbinde yer alan ve denize kıyısı bulunmayan Burkina Faso, kurak Sahel ile daha nemli Sudan savanları arasında uzanan bir geçiş ülkesidir. \n\nEski Prekambriyen kristalin kalkanı üzerinde yer alan toprakları, şiddetli aşınma süreçleriyle düzleşmiş, deniz seviyesinden ortalama 250-350 metre yüksekte dalgalanan geniş platolardan oluşur.",
    after:
      "Batı Afrika'nın kalbinde yer alan ve denize kıyısı bulunmayan Burkina Faso, kurak Sahel ile daha nemli Sudan savanları arasında uzanan bir geçiş ülkesidir. \n\nYerkabuğunun çok eski ve sert kayaçlarından oluşan Prekambriyen kalkanı üzerinde yer alan toprakları, şiddetli aşınmayla düzleşmiş, deniz seviyesinden ortalama 250-350 metre yüksekte dalgalanan geniş platolardan oluşur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BF',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ülke topoğrafyasının ezici çoğunluğu, yer yer aşınmaya dirençli lateritik sert kabuklar (zırhlar) ve izole granit tepelerle kesintiye uğrayan geniş bir peneplendir. \n\nEn belirgin jeomorfolojik hareketlilik güneybatı kesiminde görülür; burada yükselen kumtaşı masifi, dik yamaçlı Banfora Falezleri'ni ve ülkenin en yüksek noktası olan 749 metrelik Tenakourou Tepesi'ni meydana getirir.",
    after:
      "Ülke topoğrafyasının ezici çoğunluğu, yer yer aşınmaya dirençli sert laterit kabukları (zırhlar) ve tek başına yükselen granit tepelerle kesintiye uğrayan geniş bir aşınım düzlüğüdür (peneplen). \n\nYer şekillerinin en çok çeşitlendiği yer güneybatı kesimidir; burada yükselen kumtaşı masifi, dik yamaçlı Banfora Falezleri'ni ve ülkenin en yüksek noktası olan 749 metrelik Tenakourou Tepesi'ni meydana getirir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CV',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      'Takımadada jeolojik yaşa ve aşınma derecesine göre iki zıt ada morfolojisi görülür: Doğu grubundaki Sal, Boa Vista ve Maio adaları milyonlarca yıllık aşınmayla düzleşmiş, kireçtaşları ve kumullarla kaplı alçak çöl adalarıdır. Batıdaki Santo Antão, Santiago ve Fogo gibi adalar ise derin kanyonlar ve sarp falezlerle yarılmış yüksek dağlık kütlelerdir. \n\nFogo adası bütünüyle devasa bir stratovolkan konisidir; adanın kalderasından yükselen 2.829 metrelik Pico do Fogo, ülkenin en yüksek zirvesidir ve 2014 yılındaki patlamasında kaldera tabanındaki köyleri lav örtüsü altında bırakmıştır.',
    after:
      'Takımadada jeolojik yaşa ve aşınma derecesine göre iki zıt ada tipi görülür: Doğu grubundaki Sal, Boa Vista ve Maio adaları milyonlarca yıllık aşınmayla düzleşmiş, kireçtaşları ve kumullarla kaplı alçak çöl adalarıdır. Batıdaki Santo Antão, Santiago ve Fogo gibi adalar ise derin kanyonlar ve sarp falezlerle yarılmış yüksek dağlık kütlelerdir. \n\nFogo adası bütünüyle devasa bir tabakalı volkan konisidir; adanın kalderasından yükselen 2.829 metrelik Pico do Fogo, ülkenin en yüksek zirvesidir ve 2014 yılındaki patlamasında kaldera tabanındaki köyleri lav örtüsü altında bırakmıştır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CV',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Cabo Verde, okyanus ortasında yer almasına karşın kıtadaki Sahel kuşağının kurak özelliklerini taşır. Yıl boyunca etkili olan kuzeydoğu alizeleri ve kışın Sahra'dan toz taşıyan Harmattan rüzgarı, adaları yarı kurak bir iklim döngüsünde tutar. \n\nYağışlar son derece düzensizdir ve yalnızca ağustos-ekim arasındaki kısa fırtınalarla düşer; Sal ve Boa Vista'da yıllık yağış 100 milimetrenin altındayken, yüksek dağ adalarının rüzgar karşılayan yamaçlarında orografik sisler sayesinde yağış 250 milimetreye kadar çıkabilir.",
    after:
      "Cabo Verde, okyanus ortasında yer almasına karşın kıtadaki Sahel kuşağının kurak özelliklerini taşır. Yıl boyunca etkili olan kuzeydoğu alizeleri ve kışın Sahra'dan toz taşıyan Harmattan rüzgarı, adaları yarı kurak bir iklim döngüsünde tutar. \n\nYağışlar son derece düzensizdir ve yalnızca ağustos-ekim arasındaki kısa fırtınalarla düşer; Sal ve Boa Vista'da yıllık yağış 100 milimetrenin altındayken, yüksek dağ adalarının rüzgar karşılayan yamaçlarında, yükselen nemli havanın oluşturduğu sisler sayesinde yağış 250 milimetreye kadar çıkabilir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CV',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Geçirimli volkanik bazalt zemin ve kurak iklim nedeniyle takımadada kalıcı akış gösteren tek bir nehir dahi bulunmaz. Yağmur suları derin vadi yataklarından (ribeira) hızla okyanusa akar; bu taşkın sularını tutmak amacıyla Santiago adasındaki Poilão gibi küçük bent ve barajlar inşa edilmiştir. \n\nYeraltı sularının aşırı çekim nedeniyle tuzlanması yüzünden başta turizmin yoğunlaştığı Sal ve Boa Vista olmak üzere ülke genelinde içme suyunun yüzde 85'inden fazlası deniz suyu arıtma (desalinizasyon) tesislerinden temin edilir.",
    after:
      "Geçirimli volkanik bazalt zemin ve kurak iklim nedeniyle takımadada kalıcı akış gösteren tek bir nehir dahi bulunmaz. Yağmur suları derin vadi yataklarından (ribeira) hızla okyanusa akar; bu taşkın sularını tutmak amacıyla Santiago adasındaki Poilão gibi küçük bent ve barajlar inşa edilmiştir. \n\nYeraltı sularının aşırı çekim nedeniyle tuzlanması yüzünden başta turizmin yoğunlaştığı Sal ve Boa Vista olmak üzere ülke genelinde içme suyunun yüzde 85'inden fazlası deniz suyu arıtma tesislerinden temin edilir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CI',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Kıyı kuşağı iki farklı jeomorfolojik yapı sergiler: Batıda dalgaların aşındırdığı dik falezler yer alırken, doğuda kum setleriyle açık denizden ayrılan ve 300 kilometre boyunca uzanan Ebrié gibi sığ kıyı lagünleri sıralanır. Kıyının ardında yükselen dalgalı platolar kuşağı, güneybatıda Taï Milli Parkı'nın koruduğu bakir yağmur ormanlarıyla örtülüdür. \n\nKuzeye çıkıldıkça arazi ortalama 300-400 metre yüksekliğindeki açık savan düzlüklerine evrilir. Ülkenin en batı ucunda, Gine ve Liberya sınırında yükselen Nimba Sıradağları üzerindeki 1.752 metrelik doruk, dik kuvarsit yamaçlarıyla ülkenin en yüksek noktasını oluşturur.",
    after:
      "Kıyı kuşağında iki farklı yer şekli görülür: Batıda dalgaların aşındırdığı dik falezler yer alırken, doğuda kum setleriyle açık denizden ayrılan ve 300 kilometre boyunca uzanan Ebrié gibi sığ kıyı lagünleri sıralanır. Kıyının ardında yükselen dalgalı platolar kuşağı, güneybatıda Taï Milli Parkı'nın koruduğu bakir yağmur ormanlarıyla örtülüdür. \n\nKuzeye çıkıldıkça arazi ortalama 300-400 metre yüksekliğindeki açık savan düzlüklerine evrilir. Ülkenin en batı ucunda, Gine ve Liberya sınırında yükselen Nimba Sıradağları üzerindeki 1.752 metrelik doruk, dik kuvarsit yamaçlarıyla ülkenin en yüksek noktasını oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CI',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Ülke toprakları, kuzey platolarından doğup güneye Atlas Okyanusu'na doğru birbirine paralel akan dört büyük akarsu ile drene edilir: Comoé, Bandama, Sassandra ve Cavally. \n\nBu nehirlerin yatakları basamaklı plato eşiklerinde sık sık çağlayan ve şelalelerle kesintiye uğradığı için iç kesimlere deniz ulaşımına elverişli değildir; ancak üzerlerinde kurulan Kossou ve Buyo gibi büyük baraj gölleri sulama ve hidroelektrik üretiminde hayati rol oynar.",
    after:
      "Ülkenin sularını, kuzey platolarından doğup güneye Atlas Okyanusu'na doğru birbirine paralel akan dört büyük akarsu taşır: Comoé, Bandama, Sassandra ve Cavally. \n\nBu nehirlerin yatakları basamaklı plato eşiklerinde sık sık çağlayan ve şelalelerle kesintiye uğradığı için iç kesimlere deniz ulaşımına elverişli değildir; ancak üzerlerinde kurulan Kossou ve Buyo gibi büyük baraj gölleri sulama ve hidroelektrik üretiminde hayati rol oynar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GM',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Gambiya, Atlas Okyanusu kıyısından başlayarak Gambiya Nehri'nin iki yakası boyunca doğuya doğru kıtanın içine sokulan, okyanus kıyısı hariç tamamen Senegal topraklarıyla kuşatılmış dar bir kıyı-enklav devletidir. \n\nGenişliği çoğu noktada 25 ila 50 kilometreyi aşmayan bu şerit biçimli ülke, sınırlarını bütünüyle nehir vadisinin jeopolitik geçmişinden alır.",
    after:
      "Gambiya, Atlas Okyanusu kıyısından başlayarak Gambiya Nehri'nin iki yakası boyunca doğuya doğru kıtanın içine sokulan, okyanus kıyısı hariç tamamen Senegal topraklarıyla kuşatılmış dar bir kıyı ülkesidir. \n\nGenişliği çoğu noktada 25 ila 50 kilometreyi aşmayan bu şerit biçimli ülke, sınırlarını bütünüyle nehir vadisinin jeopolitik geçmişinden alır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GM',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Ülkenin varlık sebebi ve tek ana drenaj ekseni Gambiya Nehri'dir; Gine'deki Fouta Djallon yaylalarından doğan nehir, ülke toprakları içinde menderesler çizerek yaklaşık 480 kilometre boyunca akar ve okyanusa kavuşur. \n\nNehir yatağının eğimi son derece düşüktür; bu nedenle okyanus gelgitlerinin etkisi ve tuzlu su kıyıdan içeriye doğru 150 kilometreden fazla sokulur. Bu durum akarsuyun aşağı çığırında geniş bir haliç-mangrov ekosistemi yaratırken tarımsal sulama olanaklarını nehrin yukarı tatlı su kesimleriyle sınırlar.",
    after:
      "Ülkenin varlık sebebi ve tek ana akarsuyu Gambiya Nehri'dir; Gine'deki Fouta Djallon yaylalarından doğan nehir, ülke toprakları içinde menderesler çizerek yaklaşık 480 kilometre boyunca akar ve okyanusa kavuşur. \n\nNehir yatağının eğimi son derece düşüktür; bu nedenle okyanus gelgitlerinin etkisi ve tuzlu su kıyıdan içeriye doğru 150 kilometreden fazla sokulur. Bu durum akarsuyun aşağı çığırında geniş bir haliç-mangrov ekosistemi yaratırken tarımsal sulama olanaklarını nehrin yukarı tatlı su kesimleriyle sınırlar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GH',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Gine Körfezi kıyısında yer alan Gana, güneydeki yağmur ormanları ve lagünlü kıyılardan kuzeydeki kurak savan platolarına kadar uzanan zengin bir Batı Afrika coğrafyasıdır. \n\nÜlke yüzölçümünün neredeyse yarısını kaplayan devasa Volta Nehri Havzası ve havzanın kalbinde yer alan yapay Volta Baraj Gölü, Gana'nın hidrolojik ve ekonomik can damarını oluşturur.",
    after:
      "Gine Körfezi kıyısında yer alan Gana, güneydeki yağmur ormanları ve lagünlü kıyılardan kuzeydeki kurak savan platolarına kadar uzanan zengin bir Batı Afrika coğrafyasıdır. \n\nÜlke yüzölçümünün neredeyse yarısını kaplayan devasa Volta Nehri Havzası ve havzanın kalbinde yer alan yapay Volta Baraj Gölü, Gana'nın su kaynaklarının ve ekonomisinin can damarını oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GH',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Gana genelinde tropikal iklim hakimdir; ancak yağış dağılımı topoğrafya ve kıyı morfolojisine bağlı olarak belirgin karşıtlıklar sergiler. Ülkenin güneybatı köşesi yılda 2.000 milimetreyi aşan bol yağışıyla yoğun yağmur ormanlarını besler. \n\nBuna karşılık başkent Akra'nın da yer aldığı güneydoğu kıyı şeridi, serin kıyı akıntıları ve rüzgar yönü nedeniyle yılda yalnızca 750-800 milimetre yağış alan kurak bir savan kuşağı (Dahomey Boşluğu) oluşturur. Kuzey kesimlerde ise tek bir yaz yağmuru mevsimi yaşanır ve kışın kurutucu Harmattan rüzgarları etkili olur.",
    after:
      "Gana genelinde tropikal iklim hakimdir; ancak yağış dağılımı yer şekillerine ve kıyının biçimine bağlı olarak belirgin karşıtlıklar sergiler. Ülkenin güneybatı köşesi yılda 2.000 milimetreyi aşan bol yağışıyla yoğun yağmur ormanlarını besler. \n\nBuna karşılık başkent Akra'nın da yer aldığı güneydoğu kıyı şeridi, serin kıyı akıntıları ve rüzgar yönü nedeniyle yılda yalnızca 750-800 milimetre yağış alan kurak bir savan kuşağı (Dahomey Boşluğu) oluşturur. Kuzey kesimlerde ise tek bir yaz yağmuru mevsimi yaşanır ve kışın kurutucu Harmattan rüzgarları etkili olur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GN',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Fouta Djallon ve Gine Yaylaları, Batı Afrika kıtasının ana nehir sistemlerinin doğduğu devasa bir hidrolojik dağıtım merkezidir. Kıtayı binlerce kilometre kat eden Nijer Nehri kaynaklarını güneydoğudaki Gine Yaylaları'ndan alırken, Senegal Nehri'nin ana kolu Bafing ile Gambiya Nehri Fouta Djallon platolarından fışkırır. \n\nAyrıca batıya, okyanusa yönelen Konkouré Nehri ve komşu Sierra Leone'ye akan Scarcies nehirleri, taşıdıkları yüksek debilerle devasa bir hidroelektrik potansiyeli yaratır.",
    after:
      "Fouta Djallon ve Gine Yaylaları, Batı Afrika kıtasının ana nehir sistemlerinin doğduğu devasa bir su dağıtım merkezidir. Kıtayı binlerce kilometre kat eden Nijer Nehri kaynaklarını güneydoğudaki Gine Yaylaları'ndan alırken, Senegal Nehri'nin ana kolu Bafing ile Gambiya Nehri Fouta Djallon platolarından fışkırır. \n\nAyrıca batıya, okyanusa yönelen Konkouré Nehri ve komşu Sierra Leone'ye akan Scarcies nehirleri, taşıdıkları yüksek debilerle devasa bir hidroelektrik potansiyeli yaratır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GW',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Batı Afrika'nın en parçalı kıyı şeridine sahip ülkelerinden biri olan Gine-Bissau; derin nehir halicileri, kıyı bataklıkları ve açıkta yer alan 88 adalı Bijagós Takımadası ile kara ve denizin iç içe geçtiği amfibik bir coğrafyadır. \n\nÜlke toprakları okyanus kıyısındaki çamur düzlüklerinden doğudaki savan platolarına doğru yumuşak bir eğimle yükselir.",
    after:
      "Batı Afrika'nın en parçalı kıyı şeridine sahip ülkelerinden biri olan Gine-Bissau; derin nehir haliçleri, kıyı bataklıkları ve açıkta yer alan 88 adalı Bijagós Takımadası ile kara ve denizin iç içe geçtiği bir coğrafyadır. \n\nÜlke toprakları okyanus kıyısındaki çamur düzlüklerinden doğudaki savan platolarına doğru yumuşak bir eğimle yükselir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'LR',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ülke topoğrafyası kıyıdan içeriye doğru dört paralel jeomorfolojik kademe izler: Yaklaşık 560 kilometre boyunca uzanan, lagünler ve kum setleriyle çevrili dar ve alçak kıyı ovası; hemen ardından başlayan ve ortalama 90 metre yükseltideki dalgalı tepelik orman kuşağı; iç kesimlerde 300-450 metreye çıkan aşınmış plato sahası; ve en kuzeyde Gine sınırına dayanan dağlık kütleler. \n\nKuzeybatıdaki Wologizi Sıradağları üzerinde yükselen 1.447 metrelik Wuteve Dağı, Liberya'nın en yüksek zirvesidir. Ülkenin kuzeydoğu sınırında yükselen demir zengini Nimba Masifi ise Gine ve Fildişi Sahili ile paylaşılan sarp bir sınır oluşturur.",
    after:
      "Ülke arazisi kıyıdan içeriye doğru dört paralel basamak halinde yükselir: Yaklaşık 560 kilometre boyunca uzanan, lagünler ve kum setleriyle çevrili dar ve alçak kıyı ovası; hemen ardından başlayan ve ortalama 90 metre yükseltideki dalgalı tepelik orman kuşağı; iç kesimlerde 300-450 metreye çıkan aşınmış plato sahası; ve en kuzeyde Gine sınırına dayanan dağlık kütleler. \n\nKuzeybatıdaki Wologizi Sıradağları üzerinde yükselen 1.447 metrelik Wuteve Dağı, Liberya'nın en yüksek zirvesidir. Ülkenin kuzeydoğu sınırında yükselen demir zengini Nimba Masifi ise Gine ve Fildişi Sahili ile paylaşılan sarp bir sınır oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'LR',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Gine Yaylaları'ndan doğan sular, Liberya topraklarını birbirine paralel hatlar boyunca kuzeydoğudan güneybatıya doğru keserek Atlas Okyanusu'na dökülen altı ana nehir sistemiyle drene edilir: Mano, Lofa, Saint Paul, Saint John, Cestos ve Cavalla. \n\nBatıda Mano Nehri Sierra Leone ile, doğuda ise 515 kilometrelik uzunluğuyla ülkenin en uzun akarsuyu olan Cavalla Nehri Fildişi Sahili ile doğal sınır oluşturur. Nehir ağızları güçlü okyanus dalgalarının yığdığı kum setleriyle kapandığı için doğal liman oluşumu sınırlıdır; ancak kıyı ardında zengin tatlı su lagünleri meydana gelir.",
    after:
      "Gine Yaylaları'ndan doğan sular, Liberya topraklarını birbirine paralel hatlar boyunca kuzeydoğudan güneybatıya doğru keserek Atlas Okyanusu'na dökülen altı ana nehir sistemiyle denize ulaşır: Mano, Lofa, Saint Paul, Saint John, Cestos ve Cavalla. \n\nBatıda Mano Nehri Sierra Leone ile, doğuda ise 515 kilometrelik uzunluğuyla ülkenin en uzun akarsuyu olan Cavalla Nehri Fildişi Sahili ile doğal sınır oluşturur. Nehir ağızları güçlü okyanus dalgalarının yığdığı kum setleriyle kapandığı için doğal liman oluşumu sınırlıdır; ancak kıyı ardında zengin tatlı su lagünleri meydana gelir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'ML',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Mali iklimi güneyden kuzeye doğru sertleşen keskin bir kuraklık gradyanı sergiler. En güneydeki Sudan savanı kuşağı yılda 1.000 milimetreyi aşan yağış alırken, başkent Bamako'nun yer aldığı Sahel geçiş sahasında yağış 500-700 milimetreye iner; Timbuktu'nun kuzeyindeki Sahra kuşağında ise yağış neredeyse sıfırlanır. \n\nKasım ve mayıs ayları arasında kuzeydoğudan esen kuru ve toz yüklü Harmattan rüzgarı tüm ülkeyi etkisi altına alır; yağışlar ise haziran-eylül arasında Atlas Okyanusu musonunun kuzeye sokulmasıyla kısa süreli fırtınalar şeklinde gerçekleşir.",
    after:
      "Mali'de güneyden kuzeye doğru gidildikçe kuraklık keskin biçimde artar. En güneydeki Sudan savanı kuşağı yılda 1.000 milimetreyi aşan yağış alırken, başkent Bamako'nun yer aldığı Sahel geçiş sahasında yağış 500-700 milimetreye iner; Timbuktu'nun kuzeyindeki Sahra kuşağında ise yağış neredeyse sıfırlanır. \n\nKasım ve mayıs ayları arasında kuzeydoğudan esen kuru ve toz yüklü Harmattan rüzgarı tüm ülkeyi etkisi altına alır; yağışlar ise haziran-eylül arasında Atlas Okyanusu musonunun kuzeye sokulmasıyla kısa süreli fırtınalar şeklinde gerçekleşir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'ML',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Ülke hidrolojisinin kalbi Nijer Nehri'dir; Gine Dağları'ndan doğup Mali'ye giren nehir, kurak arazinin ortasında kanallar, göller ve mevsimlik bataklıklardan oluşan yaklaşık 400 kilometrelik devasa bir iç taşkın deltası (İç Nijer Deltası) meydana getirir. Bu iç delta; kurak Sahel'in ortasında balıkçılık, pirinç tarımı ve göçebe hayvancılık için hayati bir yaşam alanı sunar. \n\nNehir deltadan çıktıktan sonra Timbuktu yakınlarında doğuya kıvrılarak Nijer ve Nijerya'ya yönelir. Ülkenin batısında ise Gine'den gelen Bafing ve Bakoye nehirleri Bafoulabé kasabasında birleşerek büyük Senegal Nehri'ni oluşturur.",
    after:
      "Ülkenin sularının kalbi Nijer Nehri'dir; Gine Dağları'ndan doğup Mali'ye giren nehir, kurak arazinin ortasında kanallar, göller ve mevsimlik bataklıklardan oluşan yaklaşık 400 kilometrelik devasa bir iç taşkın deltası (İç Nijer Deltası) meydana getirir. Bu iç delta; kurak Sahel'in ortasında balıkçılık, pirinç tarımı ve göçebe hayvancılık için hayati bir yaşam alanı sunar. \n\nNehir deltadan çıktıktan sonra Timbuktu yakınlarında doğuya kıvrılarak Nijer ve Nijerya'ya yönelir. Ülkenin batısında ise Gine'den gelen Bafing ve Bakoye nehirleri Bafoulabé kasabasında birleşerek büyük Senegal Nehri'ni oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MR',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Moritanya iklimi, aşırı sıcaklık farkları ve düzensiz yağış rejimiyle belirlenir. Ülkenin üçte ikisini kaplayan kuzeydeki Sahra bölgesinde mayıs-temmuz aylarında gündüz sıcaklıkları 49 dereceyi aşarken gece ile gündüz arasındaki termal uçurum belirgindir. Güneydeki Sahel kuşağında yağışlar haziran-ekim arasına toplanır ve yıllık 300 milimetreyi aşarak kısa süreli yeşermelere olanak tanır. \n\nBaşkent Nouakchott çevresinde yıllık yağış 100 milimetrenin altında kalır; kasım ile mart arasında iç kesimlerden esen kuru ve toz yüklü Harmattan rüzgarı tüm ülkede görüş mesafesini düşürürken, dar kıyı şeridi serinletici okyanus meltemleriyle bu etkiyi kısmen hafifletir.',
    after:
      'Moritanya iklimi, aşırı sıcaklık farkları ve düzensiz yağış rejimiyle belirlenir. Ülkenin üçte ikisini kaplayan kuzeydeki Sahra bölgesinde mayıs-temmuz aylarında gündüz sıcaklıkları 49 dereceyi aşarken gece ile gündüz arasındaki sıcaklık farkı çok büyüktür. Güneydeki Sahel kuşağında yağışlar haziran-ekim arasına toplanır ve yıllık 300 milimetreyi aşarak kısa süreli yeşermelere olanak tanır. \n\nBaşkent Nouakchott çevresinde yıllık yağış 100 milimetrenin altında kalır; kasım ile mart arasında iç kesimlerden esen kuru ve toz yüklü Harmattan rüzgarı tüm ülkede görüş mesafesini düşürürken, dar kıyı şeridi serinletici okyanus meltemleriyle bu etkiyi kısmen hafifletir.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'NE',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Nijer'de iklim, kuzeyden güneye keskinleşen bir kuraklık gradyanı izler. Kuzeydeki Ténéré Çölü ve Bilma vahalarında yıllık yağış 20 milimetrenin altında seyrederken, orta kuşaktaki Agadez çevresinde 110 milimetre civarında düzensiz yaz yağışları görülür. Güneydeki Sahel-Sudan tarım kuşağında ise başkent Niamey yıllık yaklaşık 540 milimetre, en güneydeki Gaya kenti ise 800 milimetre civarında yağış alır. \n\nEkim ile şubat ayları arasında kuzeydoğudan esen kuru ve toz yüklü Harmattan rüzgarı tüm ülkede gündüz sıcaklıklarını düşürürken yoğun bir toz pusu yaratır; mart-mayıs aylarında ise termometreler 40 derecenin üzerine fırlar.",
    after:
      "Nijer'de güneyden kuzeye doğru kuraklık keskin biçimde artar. Kuzeydeki Ténéré Çölü ve Bilma vahalarında yıllık yağış 20 milimetrenin altında seyrederken, orta kuşaktaki Agadez çevresinde 110 milimetre civarında düzensiz yaz yağışları görülür. Güneydeki Sahel-Sudan tarım kuşağında ise başkent Niamey yıllık yaklaşık 540 milimetre, en güneydeki Gaya kenti ise 800 milimetre civarında yağış alır. \n\nEkim ile şubat ayları arasında kuzeydoğudan esen kuru ve toz yüklü Harmattan rüzgarı tüm ülkede gündüz sıcaklıklarını düşürürken yoğun bir toz pusu yaratır; mart-mayıs aylarında ise termometreler 40 derecenin üzerine fırlar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'NG',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Orta Nijerya'da taban araziden dik basamaklarla yükselen ve ortalama 1.280 metre rakıma sahip olan Jos Platosu, aşınmış granit tepeleri ve serin mikro-klimasıyla çevre ovalardan keskin biçimde ayrılır. Ülkenin en yüksek kesimi, doğuda Kamerun sınırı boyunca uzanan Adamawa sıradağlarıdır; bu dağlık kütlenin doruğu olan 2.419 metrelik Chappal Waddi (Gangirwal), Nijerya'nın en yüksek noktasıdır. \n\nGüneyde Atlas Okyanusu kıyısında ise dünyanın en geniş yelpaze deltalarından biri olan Nijer Deltası yer alır; petrol zengini bu alçak kıyı ovası, sayısız haliç, labirent kanallar ve yoğun mangrov bataklıklarıyla kaplıdır.",
    after:
      "Orta Nijerya'da taban araziden dik basamaklarla yükselen ve ortalama 1.280 metre rakıma sahip olan Jos Platosu, aşınmış granit tepeleri ve serin yerel iklimiyle çevre ovalardan keskin biçimde ayrılır. Ülkenin en yüksek kesimi, doğuda Kamerun sınırı boyunca uzanan Adamawa sıradağlarıdır; bu dağlık kütlenin doruğu olan 2.419 metrelik Chappal Waddi (Gangirwal), Nijerya'nın en yüksek noktasıdır. \n\nGüneyde Atlas Okyanusu kıyısında ise dünyanın en geniş yelpaze deltalarından biri olan Nijer Deltası yer alır; petrol zengini bu alçak kıyı ovası, sayısız haliç, labirent kanallar ve yoğun mangrov bataklıklarıyla kaplıdır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SN',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Senegal iklimi, güneyden sokulan Batı Afrika Musonu ile kuzeyden inen kuru rüzgarların döngüsüyle şekillenir. Kuzeydeki Sahel kuşağında yağışlı mevsim 2-3 ayla sınırlı kalıp yıllık 300-400 milimetreyi aşmazken; güneye, Casamance ve Gine sınırına inildikçe yağışlar haziran-ekim arasında 1.500 milimetrenin üzerine çıkar. \n\nKıyı kesimlerinde soğuk Kanarya Akıntısı ve okyanus meltemleri Dakar yarımadasında ılıman ve ferahlatıcı bir mikro-klima yaratır; ancak iç kesimlerde kasım-mayıs arasında esen kuru Harmattan rüzgarı sıcaklığı 40 derecenin üzerine taşır.',
    after:
      'Senegal iklimi, güneyden sokulan Batı Afrika Musonu ile kuzeyden inen kuru rüzgarların döngüsüyle şekillenir. Kuzeydeki Sahel kuşağında yağışlı mevsim 2-3 ayla sınırlı kalıp yıllık 300-400 milimetreyi aşmazken; güneye, Casamance ve Gine sınırına inildikçe yağışlar haziran-ekim arasında 1.500 milimetrenin üzerine çıkar. \n\nKıyı kesimlerinde soğuk Kanarya Akıntısı ve okyanus meltemleri Dakar yarımadasında ılıman ve ferahlatıcı bir yerel iklim yaratır; ancak iç kesimlerde kasım-mayıs arasında esen kuru Harmattan rüzgarı sıcaklığı 40 derecenin üzerine taşır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SL',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Kıyı boyunca genişliği 8 ila 40 kilometre arasında değişen, sık sık deniz gelgitleriyle sular altında kalan bataklıklar, geniş haliçler ve mangrov şeritleri uzanır. Freetown Yarımadası ise bu alçak kıyıdan aniden fışkıran ve 888 metreye erişen dağlık bir gabro masifidir. \n\nİç kesimlere doğru arazi ormanlık tepelik kuşağı aşarak 300-600 metre rakımlı geniş bir granit platoya dönüşür. Kuzeydoğuda yükselen Loma Dağları'nın zirvesi olan 1.945 metrelik Bintumani (Loma Mansa), Sierra Leone'nin ve Batı Afrika orman kuşağının en yüksek noktasıdır; doğuda ise Tingi Dağları 1.853 metreye ulaşır.",
    after:
      "Kıyı boyunca genişliği 8 ila 40 kilometre arasında değişen, sık sık deniz gelgitleriyle sular altında kalan bataklıklar, geniş haliçler ve mangrov şeritleri uzanır. Freetown Yarımadası ise bu alçak kıyıdan aniden fışkıran ve 888 metreye erişen gabro kayacından oluşan dağlık bir kütledir. \n\nİç kesimlere doğru arazi ormanlık tepelik kuşağı aşarak 300-600 metre rakımlı geniş bir granit platoya dönüşür. Kuzeydoğuda yükselen Loma Dağları'nın zirvesi olan 1.945 metrelik Bintumani (Loma Mansa), Sierra Leone'nin ve Batı Afrika orman kuşağının en yüksek noktasıdır; doğuda ise Tingi Dağları 1.853 metreye ulaşır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SL',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Gine Yaylaları'ndan doğan ve Sierra Leone arazisini kuzeydoğudan güneybatıya kateden beş ana nehir sistemi ülkeyi drene eder: Küçük Scarcies, Büyük Scarcies, Rokel (Seli), Jong ve Moa. Güneydoğuda Mano Nehri ise Liberya sınırını çizer. \n\nYukarı çığırlarında sarp kanyonlar ve çağlayanlar üzerinden akan nehirler, kıyı düzlüğüne ulaştıklarında genişleyerek mangrov bataklıklarıyla çevrili devasa haliçlere dökülür. Nehirlerin debileri aşırı mevsimsel dalgalanma gösterir; muson döneminde devasa su kütleleri taşıyan Rokel Nehri gibi akarsular, kurak mevsimde oldukça sığlaşır.",
    after:
      "Gine Yaylaları'ndan doğan ve Sierra Leone arazisini kuzeydoğudan güneybatıya kateden beş ana nehir sistemi ülkenin sularını taşır: Küçük Scarcies, Büyük Scarcies, Rokel (Seli), Jong ve Moa. Güneydoğuda Mano Nehri ise Liberya sınırını çizer. \n\nYukarı çığırlarında sarp kanyonlar ve çağlayanlar üzerinden akan nehirler, kıyı düzlüğüne ulaştıklarında genişleyerek mangrov bataklıklarıyla çevrili devasa haliçlere dökülür. Nehirlerin debileri aşırı mevsimsel dalgalanma gösterir; muson döneminde devasa su kütleleri taşıyan Rokel Nehri gibi akarsular, kurak mevsimde oldukça sığlaşır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TG',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      'Gine Körfezi kıyısından kuzeye, Sahel sınırına doğru ince uzun bir koridor halinde uzanan Togo; dar yüzölçümüne karşın kıyı lagünlerinden dağ sıralarına ve savan platolarına kadar uzanan belirgin beş coğrafi basamağa ayrılır. \n\nÜlkeyi güneybatı-kuzeydoğu ekseninde boydan boya kesen Togo Dağları, hem yer şekillerinin omurgasını hem de iklimsel ve hidrolojik sınırları belirleyen temel yükseltidir.',
    after:
      'Gine Körfezi kıyısından kuzeye, Sahel sınırına doğru ince uzun bir koridor halinde uzanan Togo; dar yüzölçümüne karşın kıyı lagünlerinden dağ sıralarına ve savan platolarına kadar uzanan belirgin beş coğrafi basamağa ayrılır. \n\nÜlkeyi güneybatı-kuzeydoğu ekseninde boydan boya kesen Togo Dağları, hem yer şekillerinin omurgasını hem de iklim ve akarsu sınırlarını belirleyen temel yükseltidir.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TG',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Yalnızca 56 kilometrelik dar kıyı şeridinin hemen ardında, verimli kırmızı topraklara sahip 60-90 metre rakımlı alçak Ouatchi Platosu uzanır; bunun kuzeydoğusunda ise Mono Nehri kollarıyla yarılan 400 metre yüksekliğinde bir tabla arazi başlar. \n\nÜlkeyi çaprazlamasına kateden Togo Dağları, Gana'daki Akwapim Tepeleri ile Benin'deki Atakora Sıradağları'nı bağlayan antik kristalin zincirin merkezidir. Bu dağ kuşağının doruğu olan 986 metrelik Agou Dağı (Mont Agou), Togo'nun en yüksek noktasıdır; kuzeye doğru gidildikçe dağlar alçalarak Oti Nehri'nin kumtaşı savan düzlüklerine açılır.",
    after:
      "Yalnızca 56 kilometrelik dar kıyı şeridinin hemen ardında, verimli kırmızı topraklara sahip 60-90 metre rakımlı alçak Ouatchi Platosu uzanır; bunun kuzeydoğusunda ise Mono Nehri kollarıyla yarılan 400 metre yüksekliğinde bir tabla arazi başlar. \n\nÜlkeyi çaprazlamasına kateden Togo Dağları, Gana'daki Akwapim Tepeleri ile Benin'deki Atakora Sıradağları'nı bağlayan çok eski ve sert kayaçlardan oluşan zincirin merkezidir. Bu dağ kuşağının doruğu olan 986 metrelik Agou Dağı (Mont Agou), Togo'nun en yüksek noktasıdır; kuzeye doğru gidildikçe dağlar alçalarak Oti Nehri'nin kumtaşı savan düzlüklerine açılır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TG',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Togo, Batı Afrika kıyısındaki nemli yağmur ormanı kuşağını kesintiye uğratan "Dahomey Boşluğu" (Dahomey Gap) koridorunda yer alır. Bu özel atmosferik mekanizma nedeniyle Lomé kıyısı yılda iki yağış dönemi yaşamasına karşın yalnızca 800 milimetre civarında yağış alır ve orman yerine kıyı savanına bürünür. \n\nİç kesimlerdeki Togo Dağları yamaçlarında yağış miktarı yıllık 1.500 milimetreye kadar yükselir ve bitki örtüsü gürleşir. Kuzey savanlarında ise yağışlar mayıs-ekim arasına sıkışır; kış aylarında Sahra\'dan esen Harmattan rüzgarı havayı kurutup yoğun toz taşır.',
    after:
      'Togo, Batı Afrika kıyısındaki nemli yağmur ormanı kuşağını kesintiye uğratan "Dahomey Boşluğu" adı verilen koridorda yer alır. Bu özel hava dolaşımı nedeniyle Lomé kıyısı yılda iki yağış dönemi yaşamasına karşın yalnızca 800 milimetre civarında yağış alır ve orman yerine kıyı savanına bürünür. \n\nİç kesimlerdeki Togo Dağları yamaçlarında yağış miktarı yıllık 1.500 milimetreye kadar yükselir ve bitki örtüsü gürleşir. Kuzey savanlarında ise yağışlar mayıs-ekim arasına sıkışır; kış aylarında Sahra\'dan esen Harmattan rüzgarı havayı kurutup yoğun toz taşır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AO',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Güneybatı Afrika'nın Atlas Okyanusu kıyısında yer alan Angola; kurak kıyı şeridinden dik basamaklarla yükselen devasa iç platolarıyla (planalto) kıtanın en stratejik su kulelerinden biridir. \n\nKuzeydeki petrol ve orman zengini Cabinda ekslavından güneydeki Namib Çölü uzantılarına kadar uzanan ülke; soğuk okyanus akıntıları, basamaklı yükseltiler ve tropikal enlemlerin şekillendirdiği çok yönlü bir coğrafyaya sahiptir.",
    after:
      "Güneybatı Afrika'nın Atlas Okyanusu kıyısında yer alan Angola; kurak kıyı şeridinden dik basamaklarla yükselen devasa iç platolarıyla (planalto) kıtanın en stratejik su kulelerinden biridir. \n\nKuzeyde anakaradan ayrı duran, petrol ve orman zengini Cabinda'dan güneydeki Namib Çölü uzantılarına kadar uzanan ülke; soğuk okyanus akıntıları, basamaklı yükseltiler ve tropikal enlemlerin şekillendirdiği çok yönlü bir coğrafyaya sahiptir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AO',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Kıyı ovası güneyde Benguela ve Namibe yakınlarında 20-30 kilometrelik dar bir şeritken, Kuanza Nehri havzasında 150 kilometreyi aşan bir genişliğe ulaşır. Kıyının hemen doğusunda arazi Serra da Chela gibi dik teraslarla hızla tırmanarak 1.500-1.800 metre rakımlı Bié Platosu'na erişir. Bu platonun Huambo yakınındaki doruğu olan 2.620 metrelik Moco Dağı, Angola'nın en yüksek zirvesidir. \n\nBié Platosu kıtanın ana su bölümü çizgisi konumundadır; buradan doğan akarsular farklı yönlere dağılarak Kongo Havzası, Zambezi sistemi, Okavango Deltası ve Atlas Okyanusu arasında hayati bir hidrolojik dağıtım merkezi oluşturur.",
    after:
      "Kıyı ovası güneyde Benguela ve Namibe yakınlarında 20-30 kilometrelik dar bir şeritken, Kuanza Nehri havzasında 150 kilometreyi aşan bir genişliğe ulaşır. Kıyının hemen doğusunda arazi Serra da Chela gibi dik teraslarla hızla tırmanarak 1.500-1.800 metre rakımlı Bié Platosu'na erişir. Bu platonun Huambo yakınındaki doruğu olan 2.620 metrelik Moco Dağı, Angola'nın en yüksek zirvesidir. \n\nBié Platosu kıtanın ana su bölümü çizgisi konumundadır; buradan doğan akarsular farklı yönlere dağılarak Kongo Havzası, Zambezi sistemi, Okavango Deltası ve Atlas Okyanusu arasında hayati bir su dağıtım merkezi oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TD',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Çad'da iklim, kuzeyden güneye uzanan enlem derecelerine bağlı olarak üç ana kuşağa ayrılır. Sahra kesiminde yıllık yağış 200 milimetrenin altında kalırken gündüz ile gece sıcaklıkları arasında 30 dereceyi bulan termal tezatlar yaşanır; orta Sahel kuşağında yağışlar haziran-ağustos arasına sıkışarak 200-500 milimetre arasında seyreder. \n\nNüfusun ve tarımın yoğunlaştığı güneydeki Sudan savanlarında ise yağmur mevsimi beş aya kadar uzar ve yıllık yağış 1.000 milimetreyi aşar. Kışın Sahra'dan esen Harmattan rüzgarı kuzeyi ve merkezi kurutup tozla kaplarken, yazın Gine Körfezi'nden sokulan nemli hava kütleleri güney ovalarında şiddetli fırtınalara yol açar.",
    after:
      "Çad'da iklim, kuzeyden güneye uzanan enlem derecelerine bağlı olarak üç ana kuşağa ayrılır. Sahra kesiminde yıllık yağış 200 milimetrenin altında kalırken gündüz ile gece sıcaklıkları arasında 30 dereceyi bulan sıcaklık farkları yaşanır; orta Sahel kuşağında yağışlar haziran-ağustos arasına sıkışarak 200-500 milimetre arasında seyreder. \n\nNüfusun ve tarımın yoğunlaştığı güneydeki Sudan savanlarında ise yağmur mevsimi beş aya kadar uzar ve yıllık yağış 1.000 milimetreyi aşar. Kışın Sahra'dan esen Harmattan rüzgarı kuzeyi ve merkezi kurutup tozla kaplarken, yazın Gine Körfezi'nden sokulan nemli hava kütleleri güney ovalarında şiddetli fırtınalara yol açar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TD',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Ülkenin kalbindeki Çad Gölü, Çad, Kamerun, Nijer ve Nijerya sınırlarının kavşağında yer alan sığ ve kapalı bir tatlı su havzasıdır; göle ulaşan suyun yaklaşık yüzde 80'i güneyden gelen Chari-Logone nehir sistemi tarafından taşınır. 1970 ve 80'lerdeki şiddetli Sahel kuraklıklarında alanı 2.000 kilometrekareye kadar gerileyen göl, son yıllarda artan muson yağışlarıyla toparlanarak 2024 uydu verilerine göre 24.500 kilometrekare seviyesine ulaşmıştır. \n\nOrta Afrika Cumhuriyeti platolarından doğup Çad'a giren Chari Nehri, başkent Encemine yakınlarında Logone ile birleşerek geniş taşkın yatakları açar. Ülkenin kuzeyindeki Sahra bölgesinde kalıcı akarsu bulunmaz; Tibesti ve Ennedi'den inen kuru vadiler (\"enneri\") yalnızca seyrek sağanakların ardından kısa süreli sel suları taşır.",
    after:
      "Ülkenin kalbindeki Çad Gölü, Çad, Kamerun, Nijer ve Nijerya sınırlarının kavşağında yer alan sığ ve kapalı bir tatlı su havzasıdır; göle ulaşan suyun yaklaşık yüzde 80'i güneyden gelen Chari-Logone nehir sistemi tarafından taşınır. 1970 ve 80'lerdeki şiddetli Sahel kuraklıklarında alanı 2.000 kilometrekareye kadar gerileyen göl, son yıllarda artan muson yağışlarıyla toparlanarak 2024 uydu verilerine göre, sazlık ve bitki örtüsü altındaki sular dahil 24.500 kilometrekare seviyesine ulaşmıştır. \n\nOrta Afrika Cumhuriyeti platolarından doğup Çad'a giren Chari Nehri, başkent Encemine yakınlarında Logone ile birleşerek geniş taşkın yatakları açar. Ülkenin kuzeyindeki Sahra bölgesinde kalıcı akarsu bulunmaz; Tibesti ve Ennedi'den inen kuru vadiler (\"enneri\") yalnızca seyrek sağanakların ardından kısa süreli sel suları taşır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CM',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Kamerun, sularını dört farklı büyük su toplama havzasına gönderen istisnai bir hidrolojik düğüm noktasıdır. Ülkenin en uzun ve yüksek debili akarsuyu olan Sanaga Nehri, Wouri ve Nyong nehirleriyle birlikte doğrudan Atlas Okyanusu'na dökülür ve zengin hidroelektrik enerji üretir. \n\nKuzeyde Adamawa Platosu'ndan doğan Benue Nehri batıya akarak Nijerya'da Nijer sistemiyle birleşir; Logone Nehri ise Çad Gölü kapalı havzasına yönelir. Ülkenin güneydoğusundaki Sangha ve Ngoko nehirleri ise gür taşkın ormanlarını aşarak Kongo Havzası'na katılır.",
    after:
      "Kamerun, sularını dört farklı büyük su toplama havzasına gönderen istisnai bir su kavşağıdır. Ülkenin en uzun ve yüksek debili akarsuyu olan Sanaga Nehri, Wouri ve Nyong nehirleriyle birlikte doğrudan Atlas Okyanusu'na dökülür ve zengin hidroelektrik enerji üretir. \n\nKuzeyde Adamawa Platosu'ndan doğan Benue Nehri batıya akarak Nijerya'da Nijer sistemiyle birleşir; Logone Nehri ise Çad Gölü kapalı havzasına yönelir. Ülkenin güneydoğusundaki Sangha ve Ngoko nehirleri ise gür taşkın ormanlarını aşarak Kongo Havzası'na katılır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CF',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Orta Afrika Cumhuriyeti'nde iklim, kuzeyden güneye belirginleşen tropikal bir yağış gradyanına sahiptir. En kuzeydeki Sahel geçiş kuşağında yağışlı mevsim kısa sürer ve yıllık toplam 700 milimetre civarında kalırken; güneye inildikçe yağmur mevsimi sekiz aya uzar ve yıllık yağış 1.700 milimetreyi aşar. \n\nÜlke genelinde kasım ile mart ayları arasında kuru mevsim yaşanır; bu dönemde Sahra'dan güneye sokulan kuru Harmattan rüzgarları havayı sisli bir toz tabakasıyla kaplar ve gündüz ile gece sıcaklık farkını artırır.",
    after:
      "Orta Afrika Cumhuriyeti'nde tropikal yağışlar kuzeyden güneye doğru belirgin biçimde artar. En kuzeydeki Sahel geçiş kuşağında yağışlı mevsim kısa sürer ve yıllık toplam 700 milimetre civarında kalırken; güneye inildikçe yağmur mevsimi sekiz aya uzar ve yıllık yağış 1.700 milimetreyi aşar. \n\nÜlke genelinde kasım ile mart ayları arasında kuru mevsim yaşanır; bu dönemde Sahra'dan güneye sokulan kuru Harmattan rüzgarları havayı sisli bir toz tabakasıyla kaplar ve gündüz ile gece sıcaklık farkını artırır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CD',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Kongo Demokratik Cumhuriyeti'nin ekvator çizgisinin her iki yakasına geniş bir alanda yayılması, dünyada eşine az rastlanan bir hidro-klimatik denge yaratır; ekvatorun kuzeyi ile güneyinde yağışlı mevsimler birbirini tamamlar ve yılın her ayı havzanın en az bir yarısında şiddetli yağış görülür. \n\nMerkezi havzada sıcaklık ve bağıl nem yıl boyu yüksek kalırken yıllık yağış 2.000 milimetreyi aşar. Güneye doğru Katanga savanlarında belirgin bir kurak dönem görülürken, doğudaki 2.000 metreyi aşan Rift dağlarında ise sisli ve serin bir yayla iklimi hakimdir.",
    after:
      "Kongo Demokratik Cumhuriyeti'nin ekvator çizgisinin her iki yakasına geniş bir alanda yayılması, dünyada eşine az rastlanan bir yağış dengesi yaratır; ekvatorun kuzeyi ile güneyinde yağışlı mevsimler birbirini tamamlar ve yılın her ayı havzanın en az bir yarısında şiddetli yağış görülür. \n\nMerkezi havzada sıcaklık ve bağıl nem yıl boyu yüksek kalırken yıllık yağış 2.000 milimetreyi aşar. Güneye doğru Katanga savanlarında belirgin bir kurak dönem görülürken, doğudaki 2.000 metreyi aşan Rift dağlarında ise sisli ve serin bir yayla iklimi hakimdir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CD',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Katanga platolarından doğan Lualaba koluyla beslenen ulu Kongo Nehri, 4.700 kilometrelik bir yay çizerek Atlas Okyanusu'na dökülür; saniyede ortalama 41.000 metreküplük debisiyle Amazon'dan sonra dünyanın en yüksek akımına sahip nehridir ve çift yarımküreli yağış sayesinde debisi yıl boyunca inanılmaz bir denge sergiler. \n\nDoğu sınırında sıralanan Tanganyika, Kivu, Edward ve Albert gölleri Büyük Afrika Gölleri sisteminin batı halkasını oluşturur. Dünyanın en derin ikinci gölü olan Tanganyika sularını Lukuga Nehri üzerinden Kongo sistemine akıtırken, derin tabanında metan gazı biriktiren Kivu Gölü Ruzizi Nehri ile Tanganyika'ya bağlanır; Edward ve Albert gölleri ise kuzeye, Nil Havzası'na su taşır.",
    after:
      "Katanga platolarından doğan Lualaba koluyla beslenen ulu Kongo Nehri, 4.700 kilometrelik bir yay çizerek Atlas Okyanusu'na dökülür; saniyede ortalama 41.000 metreküplük debisiyle Amazon'dan sonra dünyanın en yüksek akımına sahip nehridir ve iki yarımküreye birden düşen yağış sayesinde debisi yıl boyunca inanılmaz bir denge sergiler. \n\nDoğu sınırında sıralanan Tanganyika, Kivu, Edward ve Albert gölleri Büyük Afrika Gölleri sisteminin batı halkasını oluşturur. Dünyanın en derin ikinci gölü olan Tanganyika sularını Lukuga Nehri üzerinden Kongo sistemine akıtırken, derin tabanında metan gazı biriktiren Kivu Gölü Ruzizi Nehri ile Tanganyika'ya bağlanır; Edward ve Albert gölleri ise kuzeye, Nil Havzası'na su taşır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GQ',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Anakara Río Muni'nin suları, yoğun yağmur ormanlarını yararak Atlas Okyanusu'na dökülen Mbini (Benito) ve Muni nehirleri tarafından drene edilir; Muni Nehri'nin geniş halici Gabon ile güney sınırını oluşturur. \n\nBioko ve Annobón adalarında ise kalıcı büyük nehirler bulunmaz; volkanik yamaçlardan inen sayısız kısa ve coşkulu dere, derin kanyonlar ve şelaleler üzerinden doğrudan okyanusa dökülür.",
    after:
      "Anakara Río Muni'nin sularını, yoğun yağmur ormanlarını yararak Atlas Okyanusu'na dökülen Mbini (Benito) ve Muni nehirleri taşır; Muni Nehri'nin geniş halici Gabon ile güney sınırını oluşturur. \n\nBioko ve Annobón adalarında ise kalıcı büyük nehirler bulunmaz; volkanik yamaçlardan inen sayısız kısa ve coşkulu dere, derin kanyonlar ve şelaleler üzerinden doğrudan okyanusa dökülür.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GA',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      'Yaklaşık 1.200 kilometre uzunluğundaki Ogooué Nehri, Ngounié ve İvindo gibi ulu kollarıyla birlikte Gabon topraklarının dörtte üçünden fazlasını drene eder; İvindo kolu üzerindeki Kougui ve Mingouli çağlayanları yağmur ormanı içinde muazzam su manzaraları oluşturur. Nehir, Port-Gentil açıklarında geniş mangrov adalarından oluşan bir deltayla okyanusa kavuşur. \n\nKuzeyde Ntem Nehri Kamerun ve Ekvator Ginesi sınırının bir bölümünü çizerken, güneyde Nyanga Nehri bağımsız bir kıyı havzası meydana getirir. Başkent Libreville ise Ogooué sistemine değil, korunaklı Komo Halici kıyısına kurulmuştur.',
    after:
      'Yaklaşık 1.200 kilometre uzunluğundaki Ogooué Nehri, Ngounié ve İvindo gibi ulu kollarıyla birlikte Gabon topraklarının dörtte üçünden fazlasının sularını toplar; İvindo kolu üzerindeki Kougui ve Mingouli çağlayanları yağmur ormanı içinde muazzam su manzaraları oluşturur. Nehir, Port-Gentil açıklarında geniş mangrov adalarından oluşan bir deltayla okyanusa kavuşur. \n\nKuzeyde Ntem Nehri Kamerun ve Ekvator Ginesi sınırının bir bölümünü çizerken, güneyde Nyanga Nehri bağımsız bir kıyı havzası meydana getirir. Başkent Libreville ise Ogooué sistemine değil, korunaklı Komo Halici kıyısına kurulmuştur.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'ST',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Gine Körfezi'nin açık sularında ekvator çizgisinin hemen üzerinde yükselen Sao Tome ve Principe; okyanus tabanından fışkıran volkanik kökenli iki ana ada ile çevresindeki sarp kayalıklardan meydana gelen tropikal bir ada ülkesidir. \n\nKamerun Volkanik Hattı'nın okyanustaki halkaları olan bu adalar; bulut ormanlarıyla örtülü dik bazalt zirveleri, kanyonları, zengin volkanik toprakları ve kıyı falezleriyle daracık bir alanda olağanüstü bir peyzaj çeşitliliği sunar.",
    after:
      "Gine Körfezi'nin açık sularında ekvator çizgisinin hemen üzerinde yükselen Sao Tome ve Principe; okyanus tabanından fışkıran volkanik kökenli iki ana ada ile çevresindeki sarp kayalıklardan meydana gelen tropikal bir ada ülkesidir. \n\nKamerun Volkanik Hattı'nın okyanustaki halkaları olan bu adalar; bulut ormanlarıyla örtülü dik bazalt zirveleri, kanyonları, zengin volkanik toprakları ve kıyı falezleriyle daracık bir alanda olağanüstü bir manzara çeşitliliği sunar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'ST',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "São Tomé Adası'nın güney ve batı kesimlerinde volkanik kütleler doğrudan denize dik falezler halinde iner; adanın merkezi doruğu olan 2.024 metrelik São Tomé Zirvesi (Pico de São Tomé), sürekli bulutlarla kaplıdır. Adanın güneyinde eski bir yanardağ bacasının lav tıkacı olarak aşınmayla açığa çıkmış olan 663 metrelik iğne biçimli Cão Grande kayası, kıtanın en çarpıcı jeomorfolojik anıtlarındandır. \n\nKuzeydoğuya doğru arazi kademeli olarak alçalarak başkentin kurulu olduğu kıyı düzlüklerine dönüşür. Yaklaşık 31 milyon yıllık daha yaşlı bir volkanik geçmişe sahip olan Príncipe Adası ise derin aşınmış sarp dişli tepeleriyle tanınır; adanın en yüksek noktası 948 metrelik Pico Príncipe'dir.",
    after:
      "São Tomé Adası'nın güney ve batı kesimlerinde volkanik kütleler doğrudan denize dik falezler halinde iner; adanın merkezi doruğu olan 2.024 metrelik São Tomé Zirvesi (Pico de São Tomé), sürekli bulutlarla kaplıdır. Adanın güneyinde eski bir yanardağ bacasının lav tıkacı olarak aşınmayla açığa çıkmış olan 663 metrelik iğne biçimli Cão Grande kayası, kıtanın en çarpıcı doğal anıtlarındandır. \n\nKuzeydoğuya doğru arazi kademeli olarak alçalarak başkentin kurulu olduğu kıyı düzlüklerine dönüşür. Yaklaşık 31 milyon yıllık daha yaşlı bir volkanik geçmişe sahip olan Príncipe Adası ise derin aşınmış sarp dişli tepeleriyle tanınır; adanın en yüksek noktası 948 metrelik Pico Príncipe'dir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'ST',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Adalarda deniz etkili nemli tropikal iklim hüküm sürer; ancak sarp topografya çok kısa mesafelerde dramatik mikro-iklim zıtlıkları üretir. Güneybatıdan esen nem yüklü okyanus rüzgarları dik dağ yamaçlarına çarptığında São Tomé'nin güneybatısında yıllık 5.000 milimetreyi aşan orografik yağışlara yol açar. \n\nBuna karşılık dağların yağmur gölgesinde kalan kuzeydoğu kıyıları ve başkent çevresinde yıllık yağış 1.000 milimetrenin altına kadar geriler. Yıl boyu yüksek seyreden sıcaklıklar, dağların sisli yamaçlarına tırmandıkça yerini ferahlatıcı bir serinliğe bırakır.",
    after:
      "Adalarda deniz etkili nemli tropikal iklim hüküm sürer; ancak sarp topografya çok kısa mesafelerde birbirinden çok farklı yerel iklimler ortaya çıkarır. Güneybatıdan esen nem yüklü okyanus rüzgarları dik dağ yamaçlarına çarptığında São Tomé'nin güneybatısında yıllık 5.000 milimetreyi aşan yamaç yağışlarına yol açar. \n\nBuna karşılık dağların yağmur gölgesinde kalan kuzeydoğu kıyıları ve başkent çevresinde yıllık yağış 1.000 milimetrenin altına kadar geriler. Yıl boyu yüksek seyreden sıcaklıklar, dağların sisli yamaçlarına tırmandıkça yerini ferahlatıcı bir serinliğe bırakır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'ST',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Adaların dairesel ve dik volkanik yapısı, dağ doruklarından her yöne denize doğru ışınsal olarak inen yüzlerce kısa ve delişmen dereden oluşan bir drenaj ağı ortaya çıkarır. \n\nSão Tomé Adası'nda 200'e yakın akarsu sayılmasına karşın hiçbiri taşımacılığa elverişli büyüklükte değildir; sular dik kanyonlar ve çağlayanlar üzerinden çok kısa mesafede Atlas Okyanusu'na dökülür. Adalarda kalıcı doğal göl bulunmaz; tatlı su dengesi gür yağmur ormanlarının tuttuğu zengin kaynak sularıyla sağlanır.",
    after:
      "Adaların dairesel ve dik volkanik yapısı, dağ doruklarından her yöne denize doğru ışınsal olarak inen yüzlerce kısa ve delişmen dereden oluşan bir akarsu ağı ortaya çıkarır. \n\nSão Tomé Adası'nda 200'e yakın akarsu sayılmasına karşın hiçbiri taşımacılığa elverişli büyüklükte değildir; sular dik kanyonlar ve çağlayanlar üzerinden çok kısa mesafede Atlas Okyanusu'na dökülür. Adalarda kalıcı doğal göl bulunmaz; tatlı su dengesi gür yağmur ormanlarının tuttuğu zengin kaynak sularıyla sağlanır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BW',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ülke coğrafyasının omurgasını oluşturan Kalahari Platosu, ortalama 1.000 metre yükseklikte hafif dalgalı kumullar ve kireçli tortullarla örtülüdür; kalın kum tabakası yüzey suyunu derhal tabana geçirdiği için arazide kalıcı akarsu vadileri gelişemez. Platonun güneydoğu sınırında yükselen 1.491 metrelik Monalanong Tepesi, GNSS ölçümleriyle komşusu Otse Tepesi'ni geride bırakarak ülkenin en yüksek doruğu olarak tescillenmiştir.\n\nKuzeybatıdaki tektonik çöküntü alanı, Okavango Nehri'nin akışını keserek suları binlerce kanal, lagün ve adacığa böler. Kuru mevsimde yaklaşık 15.000 kilometrekareye yayılan bu iç delta, sularını okyanusa ulaştıramadan buharlaşma ve yeraltına sızma yoluyla kaybeder.",
    after:
      "Ülke coğrafyasının omurgasını oluşturan Kalahari Platosu, ortalama 1.000 metre yükseklikte hafif dalgalı kumullar ve kireçli tortullarla örtülüdür; kalın kum tabakası yüzey suyunu derhal tabana geçirdiği için arazide kalıcı akarsu vadileri gelişemez. Platonun güneydoğu sınırında yükselen 1.491 metrelik Monalanong Tepesi, uydu konum ölçümleriyle komşusu Otse Tepesi'ni geride bırakarak ülkenin en yüksek doruğu olarak tescillenmiştir.\n\nKuzeybatıdaki tektonik çöküntü alanı, Okavango Nehri'nin akışını keserek suları binlerce kanal, lagün ve adacığa böler. Kuru mevsimde yaklaşık 15.000 kilometrekareye yayılan bu iç delta, sularını okyanusa ulaştıramadan buharlaşma ve yeraltına sızma yoluyla kaybeder.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BW',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Ülkede yarı kurak step iklimi ile kuzey kesimlerdeki tropikal savan koşulları etkilidir; yıllık sıcaklıklar genellikle 20 ile 30 derece arasında seyreder. Yağışlar ekim ile nisan ayları arasındaki yaz döneminde düzensiz sağanaklar halinde düşer; kuzey ve doğuda yıllık 500-700 milimetreyi bulan yağış miktarı, güneybatı Kalahari'ye doğru 250 milimetrenin altına kadar geriler. Yüksek buharlaşma ve tekrarlayan kuraklık dönemleri, tarım ve hayvancılık üzerinde sürekli bir su stresi yaratır.",
    after:
      "Ülkede yarı kurak step iklimi ile kuzey kesimlerdeki tropikal savan koşulları etkilidir; yıllık sıcaklıklar genellikle 20 ile 30 derece arasında seyreder. Yağışlar ekim ile nisan ayları arasındaki yaz döneminde düzensiz sağanaklar halinde düşer; kuzey ve doğuda yıllık 500-700 milimetreyi bulan yağış miktarı, güneybatı Kalahari'ye doğru 250 milimetrenin altına kadar geriler. Yüksek buharlaşma ve tekrarlayan kuraklık dönemleri, tarım ve hayvancılık üzerinde sürekli bir su sıkıntısı yaratır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BW',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Yüzey suları bakımından son derece kısıtlı olan ülkede hidrolojik yaşam dört ayrı sisteme dağılır. Okavango Deltası'ndan taşan mevsimlik sular, Boteti Nehri üzerinden doğudaki Makgadikgadi çanağına akarak kurak tuz tavalarını kısa süreli sığ göllere dönüştürür. Kuzey sınırında Kwando, Linyanti ve Chobe adlarıyla kıvrılan nehir sistemi Kazungula yakınında Zambezi'ye katılırken, güneydoğu sınırını Limpopo Nehri ve mevsimlik kolları belirler.",
    after:
      "Yüzey suları bakımından son derece kısıtlı olan ülkede sular dört ayrı sisteme dağılır. Okavango Deltası'ndan taşan mevsimlik sular, Boteti Nehri üzerinden doğudaki Makgadikgadi çanağına akarak kurak tuz tavalarını kısa süreli sığ göllere dönüştürür. Kuzey sınırında Kwando, Linyanti ve Chobe adlarıyla kıvrılan nehir sistemi Kazungula yakınında Zambezi'ye katılırken, güneydoğu sınırını Limpopo Nehri ve mevsimlik kolları belirler.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SZ',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ülke topraklarının batıdaki üçte birini kaplayan Highveld kuşağı, 1.300 ile 1.900 metre arasında değişen yükseltisi, derin yarılmış granit vadileri ve ormanlık yamaçlarıyla belirginleşir; Güney Afrika sınırında 1.862 metreye ulaşan Emlembe Dağı ülkenin çatısıdır. Başkent Mbabane bu serin ve sisli dağ basamağında kuruludur.\n\nArazi doğuya doğru basamaklar halinde alçalır; 700 metre ortalama rakımlı Middleveld verimli topraklarıyla ticaret merkezi Manzini'ye ve nüfusun çoğuna yurtluk eder. Yaklaşık 250 metre rakımdaki Lowveld ise geniş akasya savanlarıyla sıcak bir çöküntüyü andırır. Doğu sınırında bu ovayı aniden kesen Lubombo volkanik sırtı, yaklaşık 600 metrelik sarp duvarlarıyla Mozambik kıyı düzlüklerine set çeker.",
    after:
      "Ülke topraklarının batıdaki üçte birini kaplayan Highveld kuşağı, 1.300 ile 1.900 metre arasında değişen yükseltisi, derin yarılmış granit vadileri ve ormanlık yamaçlarıyla belirginleşir; Güney Afrika sınırında 1.862 metreye ulaşan Emlembe Dağı ülkenin çatısıdır. Başkent Mbabane bu serin ve sisli dağ basamağında kuruludur.\n\nArazi doğuya doğru basamaklar halinde alçalır; 700 metre ortalama rakımlı Middleveld verimli topraklarıyla ticaret merkezi Manzini'ye ve nüfusun çoğuna yurt olur. Yaklaşık 250 metre rakımdaki Lowveld ise geniş akasya savanlarıyla sıcak bir çöküntüyü andırır. Doğu sınırında bu ovayı aniden kesen Lubombo volkanik sırtı, yaklaşık 600 metrelik sarp duvarlarıyla Mozambik kıyı düzlüklerine set çeker.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SZ',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Ülkede batıdan doğuya gidildikçe yükseltinin azalmasına bağlı olarak subtropikal iklim belirgin biçimde sertleşir ve kuraklaşır. Yıllık yağışların büyük bölümü ekim-nisan dönemindeki sıcak yaz aylarında şiddetli fırtınalarla düşer. Highveld platolarında yıllık yağış orografik etkiyle 700-1.500 milimetreye çıkıp ortalama sıcaklık 17 derece civarında kalırken, Lowveld ovalarında yağış 500 milimetrenin altına iner, yaz sıcaklıkları düzenli olarak 30 derecenin üzerine tırmanır.',
    after:
      'Ülkede batıdan doğuya gidildikçe yükseltinin azalmasına bağlı olarak subtropikal iklim belirgin biçimde sertleşir ve kuraklaşır. Yıllık yağışların büyük bölümü ekim-nisan dönemindeki sıcak yaz aylarında şiddetli fırtınalarla düşer. Highveld platolarında yıllık yağış yamaç yağışlarıyla 700-1.500 milimetreye çıkıp ortalama sıcaklık 17 derece civarında kalırken, Lowveld ovalarında yağış 500 milimetrenin altına iner, yaz sıcaklıkları düzenli olarak 30 derecenin üzerine tırmanır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SZ',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Esvatini, batıdaki yüksek dağlardan doğarak ülkeyi enlemesine kat eden ve Lubombo sarpını derin kanyonlarla yararak Mozambik'e geçen güçlü nehirlerle beslenir. Komati, Mbuluzi, Büyük Usutu (Lusutfu) ve Ngwavuma nehirleri Güney Afrika yaylalarından doğar. Bu sınır aşan akarsu havzaları, Komati üzerindeki Maguga Barajı örneğinde olduğu gibi ortak su yönetimi protokolleriyle işletilerek kurak Lowveld tarımına can suyu sağlar.",
    after:
      "Esvatini, batıdaki yüksek dağlardan doğarak ülkeyi enlemesine kat eden ve Lubombo sarpını derin kanyonlarla yararak Mozambik'e geçen güçlü nehirlerle beslenir. Komati, Mbuluzi, Büyük Usutu (Lusutfu) ve Ngwavuma nehirleri Güney Afrika yaylalarından doğar. Bu sınır aşan akarsu havzaları, Komati üzerindeki Maguga Barajı örneğinde olduğu gibi ortak su yönetimi anlaşmalarıyla işletilerek kurak Lowveld tarımına can suyu sağlar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'LS',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ülkenin doğusunu ve merkezini kaplayan Maloti Sıradağları, bazalt lav katmanlarının akarsu ve buzul süreçleriyle yarılmasıyla oluşmuş 3.000 metreyi aşan heybetli platolardan meydana gelir. Bu kütlenin doruğunda yükselen 3.482 metrelik Thabana Ntlenyana, yalnızca Lesotho'nun değil, Kilimanjaro'nun güneyinde kalan tüm Afrika kıtasının en yüksek zirvesidir.\n\nÜlkenin en alçak noktasının dahi güneybatı sınırında 1.400 metre rakımda bulunması, küresel ölçekte eşi olmayan bir morfolojik tabandır. Nüfusun ve ekilebilir alanların toplandığı başkent Maseru ve batı şeridi, 1.500-1.700 metre bandındaki kumtaşı platoları üzerinde yer alır.",
    after:
      "Ülkenin doğusunu ve merkezini kaplayan Maloti Sıradağları, bazalt lav katmanlarının akarsu ve buzul süreçleriyle yarılmasıyla oluşmuş 3.000 metreyi aşan heybetli platolardan meydana gelir. Bu kütlenin doruğunda yükselen 3.482 metrelik Thabana Ntlenyana, yalnızca Lesotho'nun değil, Kilimanjaro'nun güneyinde kalan tüm Afrika kıtasının en yüksek zirvesidir.\n\nÜlkenin en alçak noktasının dahi güneybatı sınırında 1.400 metre rakımda bulunması, dünyada eşi olmayan bir durumdur. Nüfusun ve ekilebilir alanların toplandığı başkent Maseru ve batı şeridi, 1.500-1.700 metre bandındaki kumtaşı platoları üzerinde yer alır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'LS',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      'Lesotho, Güney Afrika\'nın kurak iç platosunu besleyen ana akarsuların doğduğu yer olması sebebiyle bölgenin "su kulesi" niteliğindedir. Senqu (Orange) Nehri ve kolları olan Malibamatso, Matsoku ile Senqunyane, 3.000 metreyi aşan bazalt yaylalarından doğar. Bu bol ve berrak kaynakları Johannesburg sanayi havzasına aktarmak üzere inşa edilen Lesotho Yaylaları Su Projesi ve Katse Barajı, tünel sistemleriyle çalışan dev bir transfer hattı oluşturarak ülke ekonomisine hidroelektrik ve düzenli gelir sağlar.',
    after:
      'Lesotho, Güney Afrika\'nın kurak iç platosunu besleyen ana akarsuların doğduğu yer olması sebebiyle bölgenin "su kulesi" niteliğindedir. Senqu (Orange) Nehri ve kolları olan Malibamatso, Matsoku ile Senqunyane, 3.000 metreyi aşan bazalt yaylalarından doğar. Bu bol ve berrak kaynakları Johannesburg sanayi havzasına aktarmak üzere inşa edilen Lesotho Yaylaları Su Projesi ve Katse Barajı, tünel sistemleriyle çalışan dev bir su aktarım hattı oluşturarak ülke ekonomisine hidroelektrik ve düzenli gelir sağlar.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'NA',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Namibya, Atlas Okyanusu boyunca uzanan hiper-kurak kıyı çölü ile iç kısımdaki yüksek platolar arasında keskin bir zıtlığa sahiptir. Kıyıdaki Namib Çölü ile iç kesimdeki Merkezi Plato'yu birbirinden ayıran Büyük Sarp (Great Escarpment), Gondwana kıtasının parçalanışından kalan tektonik bir basamaktır. Kuzeydoğuda dar bir koridor gibi uzanan Caprivi (Zambezi) Şeridi ise nehirleri ve taşkın ovalarıyla ülkenin kurak karakterine bütünüyle aykırı, sulak bir coğrafya sunar.",
    after:
      "Namibya, Atlas Okyanusu boyunca uzanan aşırı kurak kıyı çölü ile iç kısımdaki yüksek platolar arasında keskin bir zıtlığa sahiptir. Kıyıdaki Namib Çölü ile iç kesimdeki Merkezi Plato'yu birbirinden ayıran Büyük Sarp, Gondwana kıtasının parçalanışından kalan tektonik bir basamaktır. Kuzeydoğuda dar bir koridor gibi uzanan Caprivi (Zambezi) Şeridi ise nehirleri ve taşkın ovalarıyla ülkenin kurak karakterine bütünüyle aykırı, sulak bir coğrafya sunar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'NA',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Yaklaşık 80 milyon yıldır kesintisiz kurak kalarak yeryüzünün en kadim çölü sayılan Namib, kıyıdaki çakıllı düzlüklerden iç kesimdeki dev kızıl kumullara kadar uzanır; Sossusvlei kumulları dünyanın en yüksek kumulları arasındadır. Çölün doğusunda tektonik bir yükselti olarak beliren Brandberg masifindeki Königstein doruğu, 2.573 metrelik granit kütlesiyle ülkenin en yüksek zirvesidir.\n\nGüneyde Fish Nehri'nin aşındırdığı 160 kilometre uzunluğundaki Fish Nehri Kanyonu, kıtanın en derin ve görkemli kanyon vadisidir. Kuzeydeki 4.800 kilometrekarelik Etoşa Çanağı ise kuru mevsimde kireçli beyaz bir tuz tavasıyken, yağışlı dönemlerde sığ bir iç göle dönüşerek büyük yaban hayatı sürülerini çeker.",
    after:
      "Yaklaşık 80 milyon yıldır kesintisiz kurak kalarak yeryüzünün en kadim çölü sayılan Namib, kıyıdaki çakıllı düzlüklerden iç kesimdeki dev kızıl kumullara kadar uzanır; Sossusvlei kumulları dünyanın en yüksek kumulları arasındadır. Çölün doğusunda tektonik bir yükselti olarak beliren Brandberg masifindeki Königstein doruğu, 2.573 metrelik granit kütlesiyle ülkenin en yüksek zirvesidir.\n\nGüneyde Fish Nehri'nin aşındırdığı 160 kilometre uzunluğundaki Fish Nehri Kanyonu, kıtanın en büyük ve görkemli kanyon vadisidir. Kuzeydeki 4.800 kilometrekarelik Etoşa Çanağı ise kuru mevsimde kireçli beyaz bir tuz tavasıyken, yağışlı dönemlerde sığ bir iç göle dönüşerek büyük yaban hayatı sürülerini çeker.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'ZA',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ülke topoğrafyasını, kenarları Büyük Sarp (Great Escarpment) adı verilen dik dağ duvarlarıyla çevrili yüksek bir iç plato biçimlendirir. Bu sarpın doğudaki en görkemli kesimini oluşturan Drakensberg Sıradağları'nda yükselen 3.446 metrelik Mafadi Zirvesi, Güney Afrika'nın en yüksek noktasıdır.\n\nPlatonun 1.500-2.100 metre rakımlı kuzeydoğu parçası verimli ve maden zengini Highveld yaylasıdır; orta ve batı kesimlerde ise seyrek çalılarla kaplı geniş Karoo yarı çölü ile kuzeybatıya doğru Kalahari kumulları uzanır. Güneybatı kıyısında Masa Dağı gibi dik kumtaşı kütleleri okyanusla doğrudan kucaklaşır.",
    after:
      "Ülke topoğrafyasını, kenarları Büyük Sarp adı verilen dik dağ duvarlarıyla çevrili yüksek bir iç plato biçimlendirir. Bu sarpın doğudaki en görkemli kesimini oluşturan Drakensberg Sıradağları'nda yükselen 3.446 metrelik Mafadi Zirvesi, Güney Afrika'nın en yüksek noktasıdır.\n\nPlatonun 1.500-2.100 metre rakımlı kuzeydoğu parçası verimli ve maden zengini Highveld yaylasıdır; orta ve batı kesimlerde ise seyrek çalılarla kaplı geniş Karoo yarı çölü ile kuzeybatıya doğru Kalahari kumulları uzanır. Güneybatı kıyısında Masa Dağı gibi dik kumtaşı kütleleri okyanusla doğrudan kucaklaşır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BI',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Batı sınırında Tanganyika Gölü boyunca uzanan 770 metre rakımlı dar Imbo grabeni, Rift Vadisi'nin tabanıdır. Ovanın hemen doğusunda Mumirwa sarp yamaçları dik bir basamak halinde yükselerek 2.684 metrelik Heha Dağı'nı da barındıran Kongo-Nil Dağ Sırtı'na ulaşır.\n\nSırtın doğusuna geçildiğinde arazi kademeli olarak alçalarak ortalama 1.500-1.800 metre rakımlı dalgalı orta platolara dönüşür; nüfusun ve tarımsal faaliyetlerin büyük kısmı bu tepelik yaylalarda yoğunlaşmıştır. En doğu kesimde ise Bugesera ve Kumoso çöküntüleri 1.200 metreye kadar inen sıcak ve alçak vadi tabanlarını oluşturur.",
    after:
      "Batı sınırında Tanganyika Gölü boyunca uzanan 770 metre rakımlı dar Imbo çöküntü ovası (graben), Rift Vadisi'nin tabanıdır. Ovanın hemen doğusunda Mumirwa sarp yamaçları dik bir basamak halinde yükselerek 2.684 metrelik Heha Dağı'nı da barındıran Kongo-Nil Dağ Sırtı'na ulaşır.\n\nSırtın doğusuna geçildiğinde arazi kademeli olarak alçalarak ortalama 1.500-1.800 metre rakımlı dalgalı orta platolara dönüşür; nüfusun ve tarımsal faaliyetlerin büyük kısmı bu tepelik yaylalarda yoğunlaşmıştır. En doğu kesimde ise Bugesera ve Kumoso çöküntüleri 1.200 metreye kadar inen sıcak ve alçak vadi tabanlarını oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BI',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Ekvatora yakın konumuna karşın iklim dikey yükselti basamaklarıyla yumuşar. Göl kıyısındaki Imbo Ovası'nda yıllık yağış 800-950 milimetre civarında kalıp hava sıcak ve boğucuyken, 2.000 metreyi aşan Kongo-Nil dağ sırtında orografik bulutlar yıllık yağışı 1.500-2.000 milimetreye çıkarır ve sıcaklıkları 15 dereceye kadar düşürür. Orta platolar 1.200-1.500 milimetre yağışla tarım için elverişli bir serinliğe sahiptir; yağışlar ekim ile mayıs arasına yayılırken haziran-eylül arası kurak bir soluklanma dönemidir.",
    after:
      "Ekvatora yakın konumuna karşın iklim dikey yükselti basamaklarıyla yumuşar. Göl kıyısındaki Imbo Ovası'nda yıllık yağış 800-950 milimetre civarında kalıp hava sıcak ve boğucuyken, 2.000 metreyi aşan Kongo-Nil dağ sırtında yamaç boyunca yükselen nemli havanın oluşturduğu bulutlar yıllık yağışı 1.500-2.000 milimetreye çıkarır ve sıcaklıkları 15 dereceye kadar düşürür. Orta platolar 1.200-1.500 milimetre yağışla tarım için elverişli bir serinliğe sahiptir; yağışlar ekim ile mayıs arasına yayılırken haziran-eylül arası kurak bir soluklanma dönemidir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BI',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Burundi, hidrolojik açıdan Nil Nehri'nin en güneydeki kaynaklarına ev sahipliği yapar. Ülkenin en uzun akarsuyu olan Ruvubu Nehri ve kolu Ruvyironza, Kongo-Nil sırtının doğu yamaçlarından doğar; Rutovu yakınlarındaki Kasumo kaynağı Nil sisteminin Akdeniz'e en uzak memba noktası kabul edilir. Batı sınırında yer alan ve dünyanın en derin ikinci tatlı su çanağı olan Tanganyika Gölü ise balıkçılığı ve ulaşım imkanlarıyla ülkenin batı sınırını şekillendirir.",
    after:
      "Burundi, Nil Nehri'nin en güneydeki kaynaklarına ev sahipliği yapar. Ülkenin en uzun akarsuyu olan Ruvubu Nehri ve kolu Ruvyironza, Kongo-Nil sırtının doğu yamaçlarından doğar; Rutovu yakınlarındaki Kasumo kaynağı Nil sisteminin Akdeniz'e en uzak kaynak noktası kabul edilir. Batı sınırında yer alan ve dünyanın en derin ikinci tatlı su çanağı olan Tanganyika Gölü ise balıkçılığı ve ulaşım imkanlarıyla ülkenin batı sınırını şekillendirir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'KM',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Komorlar, Mozambik Kanalı'nın kuzey girişinde, Madagaskar ile Doğu Afrika kıyıları arasında yay biçiminde dizilmiş volkanik takımadalardan oluşur. Adalar jeolojik yaş bakımından belirgin bir kronoloji sergiler: Kuzeybatıdaki Grande Comore hâlâ faal bir kalkan yanardağa sahip en genç adayken, güneydoğuya doğru Anjouan, Moheli ve Fransa idaresindeki Mayotte giderek daha yaşlı ve aşınmış morfolojileriyle sıralanır. Bu volkanik geçmiş adalara dik kıyılar, siyah bazalt kayalıkları ve derin deniz çukurları kazandırmıştır.",
    after:
      "Komorlar, Mozambik Kanalı'nın kuzey girişinde, Madagaskar ile Doğu Afrika kıyıları arasında yay biçiminde dizilmiş volkanik takımadalardan oluşur. Adalar yaş bakımından belirgin bir sıra izler: Kuzeybatıdaki Grande Comore hâlâ faal bir kalkan yanardağa sahip en genç adayken, güneydoğuya doğru Anjouan, Moheli ve Fransa idaresindeki Mayotte giderek daha yaşlı ve aşınmış görünümleriyle sıralanır. Bu volkanik geçmiş adalara dik kıyılar, siyah bazalt kayalıkları ve derin deniz çukurları kazandırmıştır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'KM',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Adalarda denizel etkilerin belirlediği tropikal muson iklimi hüküm sürer. Aralık-nisan aylarında kuzeybatı musonunun (kashkazi) getirdiği sıcak ve nemli hava kütleleri şiddetli sağanaklara yol açar; mayıs-kasım döneminde ise güneydoğu alizeleri (kusi) daha serin ve kuru koşullar taşır. Yıllık yağış yamaçlarda 2.000 milimetrenin üzerine çıkarken ocak ayı yağışın en yoğun olduğu dönemdir; ada mikroklimaları dağların rüzgar tutan cephelerine göre büyük farklılıklar gösterir.',
    after:
      'Adalarda denizel etkilerin belirlediği tropikal muson iklimi hüküm sürer. Aralık-nisan aylarında kuzeybatı musonunun (kashkazi) getirdiği sıcak ve nemli hava kütleleri şiddetli sağanaklara yol açar; mayıs-kasım döneminde ise güneydoğu alizeleri (kusi) daha serin ve kuru koşullar taşır. Yıllık yağış yamaçlarda 2.000 milimetrenin üzerine çıkarken ocak ayı yağışın en yoğun olduğu dönemdir; adaların yerel iklimleri dağların rüzgar tutan cephelerine göre büyük farklılıklar gösterir.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'DJ',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Assal Gölü, Tadjoura Körfezi'nden yalnızca 10 kilometre içeride, levha kırılmalarıyla oluşmuş derin bir tektonik grabenin tabanında yer alır. Deniz seviyesinin 155 metre altındaki rakımıyla Ölü Deniz ve Taberiye Gölü'nün ardından yeryüzünün en alçak üçüncü karasal çanağıdır; kavurucu buharlaşma nedeniyle göl yüzeyinde kalın beyaz bir tuz tabakası birikmiştir.\n\nGüneybatıda Etiyopya sınırındaki Abbe Gölü çevresinde ise jeotermal bacalardan çıkan gazların kireç çökeltmesiyle oluşmuş, 50 metreye varan traverten kuleleri yükselir. Kuzeyde ise dik vadilerle yarılmış 1.500-2.000 metrelik Goda ve Mabla dağ kütleleri yer alır.",
    after:
      "Assal Gölü, Tadjoura Körfezi'nden yalnızca 10 kilometre içeride, levha kırılmalarıyla oluşmuş derin bir çöküntü hendeğinin (graben) tabanında yer alır. Deniz seviyesinin 155 metre altındaki rakımıyla Ölü Deniz ve Taberiye Gölü'nün ardından yeryüzünün en alçak üçüncü karasal çanağıdır; kavurucu buharlaşma nedeniyle göl yüzeyinde kalın beyaz bir tuz tabakası birikmiştir.\n\nGüneybatıda Etiyopya sınırındaki Abbe Gölü çevresinde ise jeotermal bacalardan çıkan gazların kireç çökeltmesiyle oluşmuş, 50 metreye varan traverten kuleleri yükselir. Kuzeyde ise dik vadilerle yarılmış 1.500-2.000 metrelik Goda ve Mabla dağ kütleleri yer alır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'ER',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Etiyopya yüksek platolarının kuzey uzantısı olan Eritre Yaylası, ortalama 2.000 metre rakımlı verimli bir kütledir; güneyde yükselen 3.018 metrelik Amba Soira doruğu ülkenin en yüksek zirvesidir. Bu yayla doğu kenarında sarp fay duvarlarıyla yarılarak çok kısa mesafede kıyıdaki Massava düzlüklerine iner.\n\nGüneydoğuda arazi, deniz seviyesinin 120 metre altına kadar inen tektonik Danakil Çukurluğu'na gömülür; aktif volkanik bacalar ve tuz katmanlarıyla kaplı bu alan kıtanın en ıssız coğrafyalarındandır. Kıyı açıklarındaki Dahlak Takımadaları ise fosilleşmiş mercan kalkerinden oluşan alçak ada platformlarıdır.",
    after:
      "Etiyopya yüksek platolarının kuzey uzantısı olan Eritre Yaylası, ortalama 2.000 metre rakımlı verimli bir kütledir; güneyde yükselen 3.018 metrelik Amba Soira doruğu ülkenin en yüksek zirvesidir. Bu yayla doğu kenarında sarp fay duvarlarıyla yarılarak çok kısa mesafede kıyıdaki Massava düzlüklerine iner.\n\nGüneydoğuda arazi, ülke sınırları içinde deniz seviyesinin 75 metre altına kadar inen tektonik Danakil Çukurluğu'na gömülür; aktif volkanik bacalar ve tuz katmanlarıyla kaplı bu alan kıtanın en ıssız coğrafyalarındandır. Kıyı açıklarındaki Dahlak Takımadaları ise fosilleşmiş mercan kalkerinden oluşan alçak ada platformlarıdır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'ER',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Topoğrafik kademelenme iklimi birbirinden bütünüyle kopuk iki zıt dünyaya ayırır. 2.300 metredeki Asmara ve çevre platolarda ılıman bir yayla iklimi hakimdir; sıcaklıklar yıl boyu 20-25 derece bandında kalırken temmuz-ağustos aylarında bereketli yaz yağmurları düşer. Buna karşılık Kızıldeniz kıyısındaki Massava ve Danakil havzalarında yaz sıcaklıkları düzenli olarak 45 derecenin üzerine fırlar; bu kesim yeryüzünün yıllık ortalama sıcaklığı en yüksek hiper-kurak kıyı kuşaklarındandır.',
    after:
      'Yükselti farkı iklimi birbirinden bütünüyle kopuk iki zıt dünyaya ayırır. 2.300 metredeki Asmara ve çevre platolarda ılıman bir yayla iklimi hakimdir; sıcaklıklar yıl boyu 20-25 derece bandında kalırken temmuz-ağustos aylarında bereketli yaz yağmurları düşer. Buna karşılık Kızıldeniz kıyısındaki Massava ve Danakil havzalarında yaz sıcaklıkları düzenli olarak 45 derecenin üzerine fırlar; bu kesim yeryüzünün yıllık ortalama sıcaklığı en yüksek aşırı kurak kıyı kuşaklarındandır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'ET',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ortalama yüksekliği 2.000 metreyi aşan Etiyopya Yaylaları, tektonik yükselmeler ve yoğun volkanik püskürmelerle biçimlenmiş derin kanyonlar ve aşınmış düzlüklerle karakterizedir. Kuzeybatıdaki Habeşistan bloğunda yükselen Simien Dağları, uçurumlu sarp yamaçları ve 4.550 metrelik zirvesi Ras Dashen ile ülkenin en yüksek noktasını barındırır. Güneydoğudaki Bale Dağları ise daha yuvarlak hatlı volkanik platolar ve geniş afro-alpin tundralarla kaplıdır.\n\nİki yayla kütlesi arasında uzanan Büyük Rift Vadisi, kuzeydoğuda üç tektonik levhanın birbirinden uzaklaştığı Afar Çöküntüsü'ne açılır. Bu yarığın kalbindeki Danakil Çukurluğu, deniz seviyesinin 125 metre altına inen tuz tavaları, aktif lav gölleri (Erta Ale) ve hidrotermal bacalarıyla yeryüzünün en sıcak ve jeolojik olarak en hareketli noktalarından biridir.",
    after:
      "Ortalama yüksekliği 2.000 metreyi aşan Etiyopya Yaylaları, tektonik yükselmeler ve yoğun volkanik püskürmelerle biçimlenmiş derin kanyonlar ve aşınmış düzlüklerle öne çıkar. Kuzeybatıdaki Habeşistan bloğunda yükselen Simien Dağları, uçurumlu sarp yamaçları ve 4.550 metrelik zirvesi Ras Dashen ile ülkenin en yüksek noktasını barındırır. Güneydoğudaki Bale Dağları ise daha yuvarlak hatlı volkanik platolar ve geniş afro-alpin tundralarla kaplıdır.\n\nİki yayla kütlesi arasında uzanan Büyük Rift Vadisi, kuzeydoğuda üç tektonik levhanın birbirinden uzaklaştığı Afar Çöküntüsü'ne açılır. Bu yarığın kalbindeki Danakil Çukurluğu, deniz seviyesinin 125 metre altına inen tuz tavaları, aktif lav gölleri (Erta Ale) ve hidrotermal bacalarıyla yeryüzünün en sıcak ve jeolojik olarak en hareketli noktalarından biridir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'ET',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Etiyopya Yaylaları, Doğu ve Kuzeydoğu Afrika'nın tartışmasız ana su kulesidir. 1.780 metre rakımdaki Tana Gölü'nden doğan Mavi Nil (Abay), derinliği yer yer 1.500 metreyi bulan devasa bir kanyon boyunca batıya kıvrılarak Sudan düzlüklerine iner ve Nil Nehri'nin ana akış hacminin yaklaşık yüzde 80'ini tek başına sağlar. Nehrin Sudan sınırına yakın kesiminde inşa edilen Büyük Etiyopya Rönesans Barajı (GERD), havzanın tüm hidrolojik ve siyasi dengelerini yeniden belirleyen dev bir rezervuardır.\n\nRift Vadisi tabanında ise drenaj sistemi kapalı havzalar biçiminde işler; yaylalardan doğan Awash Nehri denize ulaşamadan Cibuti sınırındaki tuzlu Abbe Gölü'nde sönümlenir. Güneyde Omo Nehri ise derin vadilerden akarak Kenya sınırındaki Turkana Gölü'nü besler.",
    after:
      "Etiyopya Yaylaları, Doğu ve Kuzeydoğu Afrika'nın tartışmasız ana su kulesidir. 1.780 metre rakımdaki Tana Gölü'nden doğan Mavi Nil (Abay), derinliği yer yer 1.500 metreyi bulan devasa bir kanyon boyunca batıya kıvrılarak Sudan düzlüklerine iner ve Nil Nehri'nin ana akış hacminin yaklaşık üçte ikisini tek başına sağlar. Nehrin Sudan sınırına yakın kesiminde inşa edilen Büyük Etiyopya Rönesans Barajı, havzanın tüm su ve siyaset dengelerini yeniden belirleyen dev bir rezervuardır.\n\nRift Vadisi tabanında ise sular kapalı havzalarda toplanır; yaylalardan doğan Awash Nehri denize ulaşamadan Cibuti sınırındaki tuzlu Abbe Gölü'nde sönümlenir. Güneyde Omo Nehri ise derin vadilerden akarak Kenya sınırındaki Turkana Gölü'nü besler.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'KE',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Hint Okyanusu boyunca uzanan mercan resifli kıyı şeridinin ardında, batıya doğru giderek yükselen yarı kurak Nyika platosu başlar. Bu basamakların sonunda yükselen Orta Yaylalar, Rift Vadisi tabanından aniden fışkıran volkanik devasa kütlelerle taçlanır. Rift'in doğu yamacında yükselen 5.199 metrelik Kenya Dağı (Batian), sönmüş bir stratovolkan olup ekvatorun hemen altında buzul dilleri barındıran kıtanın en yüksek ikinci noktasıdır.\n\nÜlkeyi kuzey-güney ekseninde bölen Gregory Rift'in tabanı, ortalama 40 ila 60 kilometre genişliğinde derin bir çöküntü hendeğidir. Rift'in batısında uzanan Aberdare Sıradağları ve Mau Platosu zengin dağ ormanlarıyla kaplıyken, kuzeye doğru inildikçe arazi Chalbi Çölü ve kurak lav platolarına dönüşür.",
    after:
      "Hint Okyanusu boyunca uzanan mercan resifli kıyı şeridinin ardında, batıya doğru giderek yükselen yarı kurak Nyika platosu başlar. Bu basamakların sonunda yükselen Orta Yaylalar, Rift Vadisi tabanından aniden fışkıran volkanik devasa kütlelerle taçlanır. Rift'in doğu yamacında yükselen 5.199 metrelik Kenya Dağı (Batian), sönmüş bir tabakalı volkan olup ekvatorun hemen altında buzul dilleri barındıran kıtanın en yüksek ikinci noktasıdır.\n\nÜlkeyi kuzey-güney ekseninde bölen Gregory Rift'in tabanı, ortalama 40 ila 60 kilometre genişliğinde derin bir çöküntü hendeğidir. Rift'in batısında uzanan Aberdare Sıradağları ve Mau Platosu zengin dağ ormanlarıyla kaplıyken, kuzeye doğru inildikçe arazi Chalbi Çölü ve kurak lav platolarına dönüşür.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'KE',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Rift Vadisi'nin tabanı, kapalı havza özelliği gösteren ve her biri farklı kimyasal yapıya sahip tektonik göllerle sıralanmıştır. Kuzeyde çöllerle çevrili dünyanın en büyük alkali gölü olan Turkana (Yeşim Denizi), güneye doğru zengin mikroalg örtüleriyle yüz binlerce flamingoya ev sahipliği yapan Bogoria, Nakuru ve Elmenteita soda gölleriyle devam eder; bu dizilimde Naivasha ve Baringo gölleri yeraltı sızıntıları sayesinde tatlı su karakterini korur.\n\nAçık drenaj sisteminde ise ülkenin en uzun iki akarsuyu olan Tana ve Athi-Galana nehirleri, Orta Yaylalar'dan aldıkları suları Hint Okyanusu'na taşır. Batı yaylalarından çıkan nehirler ise Victoria Gölü havzasına dökülerek dolaylı biçimde Nil sistemine bağlanır.",
    after:
      "Rift Vadisi'nin tabanı, kapalı havza özelliği gösteren ve her biri farklı kimyasal yapıya sahip tektonik göllerle sıralanmıştır. Kuzeyde dünyanın en büyük kalıcı çöl gölü ve alan bakımından en büyük alkali gölü olan Turkana (Yeşim Denizi), güneye doğru zengin mikroalg örtüleriyle yüz binlerce flamingoya ev sahipliği yapan Bogoria, Nakuru ve Elmenteita soda gölleriyle devam eder; bu dizilimde Naivasha ve Baringo gölleri yeraltı sızıntıları sayesinde tatlı su karakterini korur.\n\nDenize ulaşan akarsulardan ise ülkenin en uzun iki akarsuyu olan Tana ve Athi-Galana nehirleri, Orta Yaylalar'dan aldıkları suları Hint Okyanusu'na taşır. Batı yaylalarından çıkan nehirler ise Victoria Gölü havzasına dökülerek dolaylı biçimde Nil sistemine bağlanır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MG',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Afrika anakarasından yaklaşık 160 milyon yıl önce, Hindistan alt kıtasından ise yaklaşık 88 milyon yıl önce koparak Hint Okyanusu'nda tek başına kalan Madagaskar, dünyanın dördüncü büyük adasıdır. On milyonlarca yıllık jeolojik tecrit, ada üzerinde evrimleşen canlı ve bitki türlerinin yüzde 90'a yakınının gezegende sadece buraya özgü kalmasını sağlamıştır. Fiziki yapısı, kuzey-güney doğrultusunda uzanan kristalin bir dağ omurgası ile doğunun dik yağmur ormanı şevleri ve batının geniş savan düzlükleri arasındaki çarpıcı asimetri üzerine kuruludur.",
    after:
      "Afrika anakarasından yaklaşık 160 milyon yıl önce, Hindistan alt kıtasından ise yaklaşık 88 milyon yıl önce koparak Hint Okyanusu'nda tek başına kalan Madagaskar, dünyanın dördüncü büyük adasıdır. On milyonlarca yıl boyunca diğer karalardan ayrı kalması, ada üzerinde evrimleşen canlı ve bitki türlerinin yüzde 90'a yakınının gezegende sadece buraya özgü kalmasını sağlamıştır. Fiziki yapısı, kuzey-güney doğrultusunda uzanan kristalin bir dağ omurgası ile doğunun dik yağmur ormanı yamaçları ve batının geniş savan düzlükleri arasındaki çarpıcı karşıtlık üzerine kuruludur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MG',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Adanın belkemiğini oluşturan Orta Yayla (Hauts-Plateaux), 800 ila 1.800 metre irtifada dalgalanan granit masifler, eski volkanik koniler ve kırmızı laterit tepelerden meydana gelir. Kuzeydeki Tsaratanana Masifi'nde yer alan 2.876 metrelik Maromokotro Zirvesi adanın en yüksek noktasıyken, orta kesimdeki Ankaratra volkanik kütlesi başkent platosunu çevreler.\n\nOrta Yayla, doğu yönünde dik bir fay şeviyle (Falaise de l'Est) aniden kırılarak Hint Okyanusu kıyısındaki dar ve ormanlık kıyı şeridine düşer. Buna karşılık batıya doğru iniş çok daha tatlı ve kademelidir; burada rüzgâr ve suyun kireçtaşlarını jilet gibi keskin kulelere dönüştürdüğü karstik kanyonlar (Tsingy de Bemaraha) ve geniş kıyı ovaları yer alır. En güneyde ise arazi baobap ağaçları ve dikenli çalılarla kaplı kurak bir ovaya dönüşür.",
    after:
      "Adanın belkemiğini oluşturan Orta Yayla (Hauts-Plateaux), 800 ila 1.800 metre irtifada dalgalanan granit masifler, eski volkanik koniler ve kırmızı laterit tepelerden meydana gelir. Kuzeydeki Tsaratanana Masifi'nde yer alan 2.876 metrelik Maromokotro Zirvesi adanın en yüksek noktasıyken, orta kesimdeki Ankaratra volkanik kütlesi başkent platosunu çevreler.\n\nOrta Yayla, doğu yönünde dik bir fay yamacıyla (Falaise de l'Est) aniden kırılarak Hint Okyanusu kıyısındaki dar ve ormanlık kıyı şeridine düşer. Buna karşılık batıya doğru iniş çok daha tatlı ve kademelidir; burada rüzgâr ve suyun kireçtaşlarını jilet gibi keskin kulelere dönüştürdüğü karstik kanyonlar (Tsingy de Bemaraha) ve geniş kıyı ovaları yer alır. En güneyde ise arazi baobap ağaçları ve dikenli çalılarla kaplı kurak bir ovaya dönüşür.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MG',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Madagaskar'ın iklim deseni, Hint Okyanusu'ndan esen nemli güneydoğu alizelerinin Orta Yayla şevine çarpmasıyla ikiye ayrılır. Doğu kıyıları ve dik dağ yamaçları yıl boyu kesintisiz orografik yağış alır ve güney yarımküre yazında sık sık yıkıcı tropikal siklonların hedefi olur.\n\nYaylaları aşan hava kütleleri kuruyarak fönleştiği için batı kesiminde belirgin bir kurak dönem yaşanır; yağışlar kasım ile nisan arasındaki sıcak yaz aylarına sıkışır. Adanın güneybatı ucu ise dağların tam yağmur gölgesinde kalması ve soğuk okyanus akıntılarının buharlaşmayı sınırlaması yüzünden yarı çöl koşullarına sahip en kurak bölgedir.",
    after:
      "Madagaskar'ın iklim deseni, Hint Okyanusu'ndan esen nemli güneydoğu alizelerinin Orta Yayla'nın dik yamacına çarpmasıyla ikiye ayrılır. Doğu kıyıları ve dik dağ yamaçları yıl boyu kesintisiz yamaç yağışı alır ve güney yarımküre yazında sık sık yıkıcı tropikal siklonların hedefi olur.\n\nYaylaları aşan hava kütleleri alçalırken ısınıp kuruduğu (fön etkisi) için batı kesiminde belirgin bir kurak dönem yaşanır; yağışlar kasım ile nisan arasındaki sıcak yaz aylarına sıkışır. Adanın güneybatı ucu ise dağların tam yağmur gölgesinde kalması ve soğuk okyanus akıntılarının buharlaşmayı sınırlaması yüzünden yarı çöl koşullarına sahip en kurak bölgedir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MG',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Adanın topografik eğimi, akarsu ağında keskin bir batı-doğu zıtlığı yaratır. Batı şevlerinden Mozambik Kanalı'na doğru akan Betsiboka, Mangoky ve Tsiribihina gibi nehirler, uzun yataklar boyunca ilerler ve yaylalardaki ormansızlaşmanın tetiklediği yoğun erozyon nedeniyle kıpkırmızı bir balçık taşır; Betsiboka'nın deltası Bombetoka Körfezi'ni kızıla boyar.\n\nDoğuya akan nehirler ise dik yamaçlardan hızla inen kısa, çağlayanlı ve taşkınlara yatkın delişmen akarsulardır. Doğu kıyısı boyunca, dalgaların oluşturduğu kıyı kumullarının gerisinde doğal lagünlerin birleştirilmesiyle inşa edilmiş yaklaşık 600 kilometrelik Pangalanes Kanalı uzanır.",
    after:
      "Adanın topografik eğimi, akarsu ağında keskin bir batı-doğu zıtlığı yaratır. Batı yamaçlarından Mozambik Kanalı'na doğru akan Betsiboka, Mangoky ve Tsiribihina gibi nehirler, uzun yataklar boyunca ilerler ve yaylalardaki ormansızlaşmanın tetiklediği yoğun erozyon nedeniyle kıpkırmızı bir balçık taşır; Betsiboka'nın deltası Bombetoka Körfezi'ni kızıla boyar.\n\nDoğuya akan nehirler ise dik yamaçlardan hızla inen kısa, çağlayanlı ve taşkınlara yatkın delişmen akarsulardır. Doğu kıyısı boyunca, dalgaların oluşturduğu kıyı kumullarının gerisinde doğal lagünlerin birleştirilmesiyle inşa edilmiş yaklaşık 600 kilometrelik Pangalanes Kanalı uzanır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MW',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Malavi, Doğu Afrika Kırık Sistemi'nin güney kolu boyunca kuzeyden güneye bir şerit gibi uzanan, fiziki coğrafyası derin fay hatları ve göl çanağıyla belirlenmiş bir iç ülkedir. Doğu sınırının büyük kısmını kaplayan devasa Malavi (Nyasa) Gölü, ülkenin hidrolojik ve ekonomik can damarıdır. Bu derin çöküntü çanağının iki yakasında yer alan Nyika Platosu ve güneydeki tekil Mulanje Masifi, göl seviyesinden aniden göğe yükselen görkemli yükseltilerdir.",
    after:
      "Malavi, Doğu Afrika Kırık Sistemi'nin güney kolu boyunca kuzeyden güneye bir şerit gibi uzanan, fiziki coğrafyası derin fay hatları ve göl çanağıyla belirlenmiş bir iç ülkedir. Doğu sınırının büyük kısmını kaplayan devasa Malavi (Nyasa) Gölü, ülkenin su kaynaklarının ve ekonomisinin can damarıdır. Bu derin çöküntü çanağının iki yakasında yer alan Nyika Platosu ve güneydeki tekil Mulanje Masifi, göl seviyesinden aniden göğe yükselen görkemli yükseltilerdir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MW',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ülke morfolojisi, rift grabeninin tabanında uzanan göl çanağı ve gölün sularını güneye taşıyan Shire Nehri yarıntısı boyunca şekillenir. Fay dikliklerinin batısında arazi kademelerle yükselir; kuzeyde 2.000 metreyi aşan ormanlık ve yayla çayırlarıyla örtülü dalgalı Nyika Platosu yer alır.\n\nGüney kesimde ise kurak ovaların ortasından aniden yükselen devasa bir granit-siyenit kütlesi olan Mulanje Masifi yükselir; masifin 3.002 metrelik Sapitwa Zirvesi tüm güney-orta Afrika'nın en yüksek doruğudur. Masifin hemen kuzeybatısında yer alan 2.100 metrelik dik yamaçlı Zomba Platosu da bu tektonik yükselimin parçasıdır.",
    after:
      "Ülkenin yer şekilleri, yarık vadisinin çöküntü tabanında uzanan göl çanağı ve gölün sularını güneye taşıyan Shire Nehri vadisi boyunca şekillenir. Fay dikliklerinin batısında arazi kademelerle yükselir; kuzeyde 2.000 metreyi aşan ormanlık ve yayla çayırlarıyla örtülü dalgalı Nyika Platosu yer alır.\n\nGüney kesimde ise kurak ovaların ortasından aniden yükselen devasa bir granit-siyenit kütlesi olan Mulanje Masifi yükselir; masifin 3.002 metrelik Sapitwa Zirvesi tüm güney-orta Afrika'nın en yüksek doruğudur. Masifin hemen kuzeybatısında yer alan 2.100 metrelik dik yamaçlı Zomba Platosu da bu tektonik yükselimin parçasıdır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MW',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Afrika'nın en büyük üçüncü gölü olan Malavi Gölü, 560 kilometreyi aşan uzunluğu ve 700 metreyi bulan derinliğiyle ülkenin hidrolojik merkezidir. Gölün güney ucundan çıkan Shire Nehri, gölün yegane doğal boşalım kanalıdır; Chigaru ile Chikwawa arasındaki 80 kilometrelik dik kanyonda art arda gelen şelaleler ve çağlayanlarla yaklaşık 400 metre alçalarak Mozambik sınırında Zambezi Nehri'ne katılır. Kuzeyde ise Songwe Nehri, Tanzanya ile doğal sınırı çizen önemli bir su yoludur.",
    after:
      "Afrika'nın en büyük üçüncü gölü olan Malavi Gölü, 560 kilometreyi aşan uzunluğu ve 700 metreyi bulan derinliğiyle ülkenin su merkezidir. Gölün güney ucundan çıkan Shire Nehri, gölün tek doğal çıkış yoludur; Chigaru ile Chikwawa arasındaki 80 kilometrelik dik kanyonda art arda gelen şelaleler ve çağlayanlarla yaklaşık 400 metre alçalarak Mozambik sınırında Zambezi Nehri'ne katılır. Kuzeyde ise Songwe Nehri, Tanzanya ile doğal sınırı çizen önemli bir su yoludur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MU',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Mauritius, Hint Okyanusu'nun güneybatısında, Réunion sıcak noktasının okyanus kabuğunu delmesiyle yaklaşık 8 milyon yıl önce şekillenmiş volkanik bir ada devletidir. Ana adanın yanı sıra doğuda çok daha eski ve aşınmış Rodrigues Adası ile kuzeydeki Saint Brandon ve Agalega mercan adacıklarını kapsar. Ana ada, sönmüş bir kalkan yanardağ kalıntısı olan 300-600 metre rakımlı merkezi platoyu kuşatan dik bazaltik zirveler ve çevresindeki sakin lagünlerle özgün bir ada morfolojisi sunar.",
    after:
      "Mauritius, Hint Okyanusu'nun güneybatısında, Réunion sıcak noktasının okyanus kabuğunu delmesiyle yaklaşık 8 milyon yıl önce şekillenmiş volkanik bir ada devletidir. Ana adanın yanı sıra doğuda çok daha eski ve aşınmış Rodrigues Adası ile kuzeydeki Saint Brandon ve Agalega mercan adacıklarını kapsar. Ana ada, sönmüş bir kalkan yanardağ kalıntısı olan 300-600 metre rakımlı merkezi platoyu kuşatan dik bazaltik zirveler ve çevresindeki sakin lagünlerle özgün bir ada görünümü sunar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MU',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Ada, yıl boyu esen güneydoğu alizelerinin hakimiyeti altında nemli tropikal denizel iklime sahiptir. Kasım-nisan arasındaki yaz dönemi sıcak, nemli ve tropikal siklonlara açık geçerken, mayıs-ekim arasındaki kış dönemi alizelerin getirdiği serin ve ferahlatıcı rüzgarlarla şekillenir. Yıllık yağış alizelere kapalı batı kıyısında 1.200 milimetre dolayındayken, rüzgarı doğrudan karşılayan güneydoğu kıyısında 1.600 milimetreye, merkezi platonun sisli yüksek yamaçlarında ise orografik etkiyle 4.000-5.000 milimetreye kadar ulaşır.',
    after:
      'Ada, yıl boyu esen güneydoğu alizelerinin hakimiyeti altında nemli tropikal denizel iklime sahiptir. Kasım-nisan arasındaki yaz dönemi sıcak, nemli ve tropikal siklonlara açık geçerken, mayıs-ekim arasındaki kış dönemi alizelerin getirdiği serin ve ferahlatıcı rüzgarlarla şekillenir. Yıllık yağış alizelere kapalı batı kıyısında 1.200 milimetre dolayındayken, rüzgarı doğrudan karşılayan güneydoğu kıyısında 1.600 milimetreye, merkezi platonun sisli yüksek yamaçlarında ise yamaç yağışlarıyla 4.000-5.000 milimetreye kadar ulaşır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MU',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      'Merkezi platodan doğarak radyal biçimde kıyılara inen akarsular kısa, hızlı akışlı ve bol şelalelidir; 40 kilometrelik Grand River South East adanın en uzun nehridir. Akarsuların hiçbiri deniz taşımacılığına elverişli olmamakla birlikte derin vadiler açarak hidroelektrik üretimine ve sulamaya katkı sağlar. Kalıcı doğal göllerin az olduğu adada su dengesi, krater gölleri, baraj göletleri ve mercan lagünlerinin koruduğu kıyı akiferleri üzerinden yürütülür.',
    after:
      'Merkezi platodan doğarak her yöne yayılarak kıyılara inen akarsular kısa, hızlı akışlı ve bol şelalelidir; 40 kilometrelik Grand River South East adanın en uzun nehridir. Akarsuların hiçbiri deniz taşımacılığına elverişli olmamakla birlikte derin vadiler açarak hidroelektrik üretimine ve sulamaya katkı sağlar. Kalıcı doğal göllerin az olduğu adada su dengesi, krater gölleri, baraj göletleri ve mercan lagünlerinin koruduğu kıyıdaki yer altı suları üzerinden sağlanır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MZ',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ülke yüzölçümünün yaklaşık yarısını kaplayan kıyı ovaları, Zambezi deltasının güneyinde olağanüstü genişleyerek Güney Afrika sınırına kadar uzanır; bu düzlükler lagünler, mangrov bataklıkları ve kumul sistemleriyle kaplıdır. Deltanın kuzeyine geçildiğinde ise kıyı daralır ve arazi iç kesimlere doğru basamaklar halinde yükselir.\n\nKuzey ve kuzeybatı yaylaları, düzlüklerin ortasından birdenbire yükselen sarp granit tepelerle (inselberg) karakterizedir; bu topoğrafya Malavi Gölü çöküntüsüne komşu dağlık kütlelerle birleşir. Ülkenin en yüksek kesimi ise Zimbabve sınırı boyunca uzanan Chimanimani Sıradağları'dır; buradaki 2.436 metrelik Binga Dağı Mozambik'in doruk noktasıdır.",
    after:
      "Ülke yüzölçümünün yaklaşık yarısını kaplayan kıyı ovaları, Zambezi deltasının güneyinde olağanüstü genişleyerek Güney Afrika sınırına kadar uzanır; bu düzlükler lagünler, mangrov bataklıkları ve kumul sistemleriyle kaplıdır. Deltanın kuzeyine geçildiğinde ise kıyı daralır ve arazi iç kesimlere doğru basamaklar halinde yükselir.\n\nKuzey ve kuzeybatı yaylaları, düzlüklerin ortasından birdenbire yükselen sarp granit tepelerle (inselberg) öne çıkar; bu topoğrafya Malavi Gölü çöküntüsüne komşu dağlık kütlelerle birleşir. Ülkenin en yüksek kesimi ise Zimbabve sınırı boyunca uzanan Chimanimani Sıradağları'dır; buradaki 2.436 metrelik Binga Dağı Mozambik'in doruk noktasıdır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'RW',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ülke coğrafyasının omurgasını, kuzeyden güneye uzanan ve ortalama yüksekliği 2.500 metreyi bulan Kongo-Nil su bölümü dağ sırtı çizer. Bu sırtın kuzeybatı ucunda, Uganda ve Kongo Demokratik Cumhuriyeti sınırlarını birleştiren Virunga Sıradağları yükselir. Sönmüş ve aktif stratovolkanlardan oluşan bu zincirin Ruanda sınırındaki en yüksek zirvesi 4.507 metrelik Karisimbi Dağı'dır; komşu Bisoke ve Sabyinyo tepeleriyle birlikte dağ gorillerinin yeryüzündeki son sığınaklarını barındırır.\n\nSu bölümü hattının doğusuna geçildiğinde arazi, özenle taraçalanmış tarım tepeleriyle bezeli 1.500-1.800 metre rakımlı orta platoya dönüşür. En doğuda, Tanzanya sınırına yaklaşıldıkça yükselti 1.300 metrelere iner ve Akagera Milli Parkı'nın sığ göller, bataklıklar ve çalılık savanlardan oluşan tabanıyla son bulur.",
    after:
      "Ülke coğrafyasının omurgasını, kuzeyden güneye uzanan ve ortalama yüksekliği 2.500 metreyi bulan Kongo-Nil su bölümü dağ sırtı çizer. Bu sırtın kuzeybatı ucunda, Uganda ve Kongo Demokratik Cumhuriyeti sınırlarını birleştiren Virunga Sıradağları yükselir. Sönmüş ve aktif tabakalı volkanlardan oluşan bu zincirin Ruanda sınırındaki en yüksek zirvesi 4.507 metrelik Karisimbi Dağı'dır; komşu Bisoke ve Sabyinyo tepeleriyle birlikte dağ gorillerinin yeryüzündeki son sığınaklarını barındırır.\n\nSu bölümü hattının doğusuna geçildiğinde arazi, özenle taraçalanmış tarım tepeleriyle bezeli 1.500-1.800 metre rakımlı orta platoya dönüşür. En doğuda, Tanzanya sınırına yaklaşıldıkça yükselti 1.300 metrelere iner ve Akagera Milli Parkı'nın sığ göller, bataklıklar ve çalılık savanlardan oluşan tabanıyla son bulur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'RW',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Ekvatorun sadece iki derece güneyinde yer almasına karşın Ruanda, yüksek rakımın etkisiyle yıl boyu ortalama 18-22 derece arasında seyreden daimi bir ilkbahar iklimine sahiptir. Sadece batıdaki çöküntü tabanında sıcaklıklar 30 derecenin üzerine çıkabilir.\n\nYağış döngüsü yılda iki yağışlı ve iki kurak dönemden oluşan dörtlü bir ritim izler: şubat-mayıs arası 'büyük yağmurlar' (Itumba) ve eylül-aralık arası 'küçük yağmurlar' (Umutobo) tarımsal takvimi belirler. Dik yamaçlarda yürütülen yoğun tarım, aşırı yağış dönemlerinde şiddetli erozyon ve toprak kayması riskini tetikler.",
    after:
      "Ekvatorun sadece iki derece güneyinde yer almasına karşın Ruanda, yüksek rakımın etkisiyle yıl boyu ortalama 18-22 derece arasında seyreden daimi bir ilkbahar iklimine sahiptir. Sadece batıdaki çöküntü tabanında sıcaklıklar 30 derecenin üzerine çıkabilir.\n\nYağış döngüsü yılda iki yağışlı ve iki kurak dönemden oluşan dörtlü bir ritim izler: şubat-mayıs arası 'büyük yağmurlar' (Itumba) ve eylül-aralık arası 'küçük yağmurlar' (Umuhindo) tarımsal takvimi belirler. Dik yamaçlarda yürütülen yoğun tarım, aşırı yağış dönemlerinde şiddetli erozyon ve toprak kayması riskini tetikler.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'RW',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Ruanda'nın suları iki dev Afrika havzasına bölünür: Toprakların yaklaşık yüzde 80'i Nil Havzası'na, batıdaki yüzde 20'si ise Kongo Havzası'na aittir. Güneybatıdaki bakir Nyungwe Ormanı'ndan doğan Rukarara ve Nyabarongo nehirleri, Akagera Nehri'ni oluşturarak Victoria Gölü'ne akar; bu akış Nil Nehri'nin Akdeniz'e en uzak membasını teşkil eder.\n\nBatı sınırında yer alan Kivu Gölü ise Albertine Rifti'nin tektonik çukurluğunu dolduran 480 metre derinliğinde bir doğa harikasıdır. Dip katmanlarında yüksek oranda çözünmüş karbondioksit ve metan gazı barındıran göl, limnik patlama riski taşımakla birlikte günümüzde çekilen metanın enerji santrallerinde yakılmasıyla Ruanda'nın elektrik ihtiyacını karşılayan stratejik bir kaynağa dönüştürülmüştür.",
    after:
      "Ruanda'nın suları iki dev Afrika havzasına bölünür: Toprakların yaklaşık yüzde 80'i Nil Havzası'na, batıdaki yüzde 20'si ise Kongo Havzası'na aittir. Güneybatıdaki bakir Nyungwe Ormanı'ndan doğan Rukarara ve Nyabarongo nehirleri, Akagera Nehri'ni oluşturarak Victoria Gölü'ne akar; bu akış Nil Nehri'nin Akdeniz'e en uzak kaynağını oluşturur.\n\nBatı sınırında yer alan Kivu Gölü ise Albertine Rifti'nin tektonik çukurluğunu dolduran 480 metre derinliğinde bir doğa harikasıdır. Dip katmanlarında yüksek oranda çözünmüş karbondioksit ve metan gazı barındıran göl, biriken gazı aniden salma (limnik patlama) riski taşımakla birlikte günümüzde çekilen metanın enerji santrallerinde yakılmasıyla Ruanda'nın elektrik ihtiyacını karşılayan stratejik bir kaynağa dönüştürülmüştür.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SC',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      'Nüfusun ve ekonomik yaşamın merkez üssü olan Mahé, Praslin ve La Digue gibi granit adalar, turkuaz suların içinden aniden fırlayan devasa aşınmış granit kayalıklar, yemyeşil tropikal tepeler ve dar kıyı düzlükleriyle karakterizedir. Mahé adasındaki 905 metrelik Morne Seychellois ülkenin en yüksek zirvesidir; Praslin adasındaki Vallée de Mai ise endemik denizhindistancevizi (coco de mer) palmiyelerine ev sahipliği yapar.\n\nBu iç kümenin yüzlerce kilometre güneybatısına yayılan Dış Adalar ise kireçtaşından oluşmuş alçak mercan resifleri ve atollerdir. Bunların en büyüğü olan Aldabra Atolü, deniz seviyesinden yalnızca birkaç metre yükselen sığ bir lagün halkası olup dünyanın en büyük yükselmiş mercan atollerinden biridir ve dev kara kaplumbağalarının bozulmamış yaşam alanıdır.',
    after:
      'Nüfusun ve ekonomik yaşamın merkez üssü olan Mahé, Praslin ve La Digue gibi granit adalar, turkuaz suların içinden aniden fırlayan devasa aşınmış granit kayalıklar, yemyeşil tropikal tepeler ve dar kıyı düzlükleriyle öne çıkar. Mahé adasındaki 905 metrelik Morne Seychellois ülkenin en yüksek zirvesidir; Praslin adasındaki Vallée de Mai ise endemik denizhindistancevizi (coco de mer) palmiyelerine ev sahipliği yapar.\n\nBu iç kümenin yüzlerce kilometre güneybatısına yayılan Dış Adalar ise kireçtaşından oluşmuş alçak mercan resifleri ve atollerdir. Bunların en büyüğü olan Aldabra Atolü, deniz seviyesinden yalnızca birkaç metre yükselen sığ bir lagün halkası olup dünyanın en büyük yükselmiş mercan atollerinden biridir ve dev kara kaplumbağalarının bozulmamış yaşam alanıdır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SC',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Adaların jeolojik yapısı ve dar alanları nedeniyle Seyşeller'de kalıcı büyük bir akarsu veya nehir bulunmaz. Mahé ve Praslin'in granit yamaçlarından denize inen dik ve kısa dereler yalnızca şiddetli yağmurlar sırasında gürül gürül akar, ancak suyun büyük kısmı hızla okyanusa karışır.\n\nYüzey sularının tutulamaması nedeniyle ülke içme suyunu ormanlık vadilerdeki baraj göletleri, yağmur suyu hasadı ve kurak dönemlerde devreye giren deniz suyu arıtma (desalinizasyon) tesisleriyle sağlar. Mercan atollerinde ise yüzey suyu tamamen yok denecek düzeydedir; tek kaynak gözenekli kireçtaşı tabakasının üzerinde biriken ince tatlı su merceğidir.",
    after:
      "Adaların jeolojik yapısı ve dar alanları nedeniyle Seyşeller'de kalıcı büyük bir akarsu veya nehir bulunmaz. Mahé ve Praslin'in granit yamaçlarından denize inen dik ve kısa dereler yalnızca şiddetli yağmurlar sırasında gürül gürül akar, ancak suyun büyük kısmı hızla okyanusa karışır.\n\nYüzey sularının tutulamaması nedeniyle ülke içme suyunu ormanlık vadilerdeki baraj göletleri, yağmur suyu hasadı ve kurak dönemlerde devreye giren deniz suyu arıtma tesisleriyle sağlar. Mercan atollerinde ise yüzey suyu tamamen yok denecek düzeydedir; tek kaynak gözenekli kireçtaşı tabakasının üzerinde biriken ince tatlı su merceğidir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SO',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Ekvator kuşağına yakınlığına karşın Somali, kıyı boyunca esen kuru rüzgarlar ve denizel yükselme (upwelling) nedeniyle nem taşımayan soğuk su akıntılarının etkisiyle son derece kurak bir çöl ve yarı çöl iklimine sahiptir. Sıcaklıklar yıl boyu yüksek seyreder; kuzey kıyılarında yaz aylarında 40 derecenin üzerine çıkması olağandır.\n\nYağış düzeni göçebe hayatın tüm takvimini yöneten dört mevsime bölünmüştür: nisan-haziran arasındaki ana yağmur mevsimi 'Gu', temmuz-eylül arasındaki rüzgarlı ve kuru 'Xagaa', ekim-kasım arasındaki ikincil yağmurlar 'Deyr' ve aralık-mart arasındaki kavurucu kurak kış dönemi 'Jilaal'. Yağışların dönemsel olarak kesilmesi ülkede tekrarlayan şiddetli kuraklıklara yol açar.",
    after:
      "Ekvator kuşağına yakınlığına karşın Somali, kıyı boyunca esen kuru rüzgarlar ve derindeki soğuk suyun yüzeye çıkması (denizel yükselme) nedeniyle nem taşımayan soğuk su akıntılarının etkisiyle son derece kurak bir çöl ve yarı çöl iklimine sahiptir. Sıcaklıklar yıl boyu yüksek seyreder; kuzey kıyılarında yaz aylarında 40 derecenin üzerine çıkması olağandır.\n\nYağış düzeni göçebe hayatın tüm takvimini yöneten dört mevsime bölünmüştür: nisan-haziran arasındaki ana yağmur mevsimi 'Gu', temmuz-eylül arasındaki rüzgarlı ve kuru 'Xagaa', ekim-kasım arasındaki ikincil yağmurlar 'Deyr' ve aralık-mart arasındaki kavurucu kurak kış dönemi 'Jilaal'. Yağışların dönemsel olarak kesilmesi ülkede tekrarlayan şiddetli kuraklıklara yol açar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SS',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Güney Sudan'da nemli tropikal savan iklimi egemendir. Yıl genelinde Ekvatoral Düşük Basınç Kuşağı'nın kuzeye hareketiyle nisan ayından ekime kadar süren uzun ve şiddetli bir yağmur mevsimi yaşanır. Güneydeki Ekvatorya bölgesinde yıllık yağış 1.200 milimetreyi aşarken, kuzey sınırlarına doğru kuraklaşan arazide 600 milimetreye kadar geriler.\n\nKasım ile mart ayları arasında esen kuru kuzey rüzgarları (Harmattan), sıcaklıkları 35-40 derecenin üzerine fırlatan sert bir kurak döneme yol açar. Bu kurak-yağışlı döngü, killi topraklarda yağmurda geçit vermez bataklıklar, kuraklıkta ise çatlamış çorak araziler oluşturarak pastoralist toplulukların mevsimlik göçlerini (transhümans) zorunlu kılar.",
    after:
      "Güney Sudan'da nemli tropikal savan iklimi egemendir. Yıl genelinde Ekvatoral Düşük Basınç Kuşağı'nın kuzeye hareketiyle nisan ayından ekime kadar süren uzun ve şiddetli bir yağmur mevsimi yaşanır. Güneydeki Ekvatorya bölgesinde yıllık yağış 1.200 milimetreyi aşarken, kuzey sınırlarına doğru kuraklaşan arazide 600 milimetreye kadar geriler.\n\nKasım ile mart ayları arasında esen kuru kuzey rüzgarları (Harmattan), sıcaklıkları 35-40 derecenin üzerine fırlatan sert bir kurak döneme yol açar. Bu kurak-yağışlı döngü, killi topraklarda yağmurda geçit vermez bataklıklar, kuraklıkta ise çatlamış çorak araziler oluşturarak hayvancılıkla geçinen toplulukların mevsimlik göçlerini zorunlu kılar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TZ',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Kuzey sınırında göğe yükselen 5.895 metrelik Kilimanjaro Dağı, Kibo doruğundaki sönmüş krateri ve ekvatoral buzullarıyla sadece ülkenin değil bütün Afrika kıtasının çatısıdır. Bu dev kütlenin batısında sönmüş Meru stratovolkanı ve dünyanın en büyük bozulmamış kalderalarından biri olan 600 metre derinliğindeki Ngorongoro Çöküntüsü yer alır; bu havza, yaban hayatı göçlerinin beşiği Serengeti Platosu'na açılır.\n\nÜlke arazisi, doğu kolu (Gregory Rift) ve batı kolu (Albertine Rift) tarafından derin grabenlerle kuşatılmıştır. Bu iki yarık hattı arasında denizden 1.000 ila 1.500 metre yükseklikte dalgalanan yarı kurak geniş Orta Plato uzanır. Doğuda ise dar bir kıyı ovasının ardından Hint Okyanusu'nda Unguja (Zanzibar), Pemba ve Mafia mercan adaları yükselir.",
    after:
      "Kuzey sınırında göğe yükselen 5.895 metrelik Kilimanjaro Dağı, Kibo doruğundaki uykuda olan krateri ve ekvatoral buzullarıyla sadece ülkenin değil bütün Afrika kıtasının çatısıdır. Bu dev kütlenin batısında son olarak 1910'da küçük bir püskürme yapan Meru tabakalı volkanı ve dünyanın en büyük bozulmamış kalderalarından biri olan 600 metre derinliğindeki Ngorongoro Çöküntüsü yer alır; bu havza, yaban hayatı göçlerinin beşiği Serengeti Platosu'na açılır.\n\nÜlke arazisi, doğu kolu (Gregory Rift) ve batı kolu (Albertine Rift) tarafından derin çöküntü hendekleriyle (graben) kuşatılmıştır. Bu iki yarık hattı arasında denizden 1.000 ila 1.500 metre yükseklikte dalgalanan yarı kurak geniş Orta Plato uzanır. Doğuda ise dar bir kıyı ovasının ardından Hint Okyanusu'nda Unguja (Zanzibar), Pemba ve Mafia mercan adaları yükselir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'UG',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Winston Churchill tarafından doğasının göz kamaştırıcı yeşilliği ve canlılığı nedeniyle 'Afrika'nın İncisi' olarak adlandırılan Uganda, Ekvator çizgisi üzerinde yer almasına karşın yüksek rakımıyla benzersiz bir mikroklimaya sahiptir. Victoria Gölü'nün kuzey kıyılarından Büyük Rift Vadisi'nin sisli dağlarına uzanan bu bereketli plato ülkesi, Nil Nehri'nin ana doğum yeri ve Afrika'nın en zengin su rezervuarlarından biridir.",
    after:
      "Winston Churchill tarafından doğasının göz kamaştırıcı yeşilliği ve canlılığı nedeniyle 'Afrika'nın İncisi' olarak adlandırılan Uganda, Ekvator çizgisi üzerinde yer almasına karşın yüksek rakımıyla benzersiz bir iklime sahiptir. Victoria Gölü'nün kuzey kıyılarından Büyük Rift Vadisi'nin sisli dağlarına uzanan bu bereketli plato ülkesi, Nil Nehri'nin ana doğum yeri ve Afrika'nın en zengin su rezervuarlarından biridir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'UG',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ülke arazisinin neredeyse tamamı, güneyde 1.500 metreden kuzeyde 900 metreye doğru tatlı bir eğimle alçalan dalgalı bir plato yüzeyidir. Ancak ülkenin batı sınırında, Albertine Rift'in tektonik çukurluğundan birdenbire 5.109 metreye fırlayan Rwenzori Sıradağları ('Ay Dağları') yükselir. Volkanik kökenli olmayan, tektonik bir fay bloğu (horst) niteliğindeki bu sarp sıradağın zirvesi Margherita, ekvatorun hemen altında buzul dilleri taşır.\n\nDoğu sınırında ise Kenya ile paylaşılan 4.321 metrelik sönmüş kalkan volkan Elgon Dağı devasa bir kalderayla yükselir. Platoyu kaplayan yüzlerce alçak tepe ve bunların arasına sıkışmış papirüs bataklıkları, ülkenin tipik morfolojik görüntüsünü oluşturur.",
    after:
      "Ülke arazisinin neredeyse tamamı, güneyde 1.500 metreden kuzeyde 900 metreye doğru tatlı bir eğimle alçalan dalgalı bir plato yüzeyidir. Ancak ülkenin batı sınırında, Albertine Rift'in tektonik çukurluğundan birdenbire 5.109 metreye fırlayan Rwenzori Sıradağları ('Ay Dağları') yükselir. Volkanik kökenli olmayan, tektonik bir fay bloğu (horst) niteliğindeki bu sarp sıradağın zirvesi Margherita, ekvatorun hemen altında buzul dilleri taşır.\n\nDoğu sınırında ise Kenya ile paylaşılan 4.321 metrelik sönmüş kalkan volkan Elgon Dağı devasa bir kalderayla yükselir. Platoyu kaplayan yüzlerce alçak tepe ve bunların arasına sıkışmış papirüs bataklıkları, ülkenin tipik görüntüsünü oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'UG',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Ekvator kuşağında bulunmasına karşın ortalama 1.100 metreyi aşan rakım ve geniş su yüzeyleri, Uganda'da yıl boyu ortalama 20-27 derece arasında değişen son derece ılıman ve dengeli bir yayla iklimi yaratır. Ülkenin büyük bölümü yılda iki kez (mart-mayıs ve eylül-kasım) bol ve düzenli yağış alır.\n\nSadece kuzeydoğudaki Karamoja bölgesi, dağların yağmur gölgesinde kalması ve kuru hava akımlarının etkisiyle kurak ve yarı kurak bozkır iklimine sahiptir. Albert Gölü çevresindeki çöküntü vadisi tabanı ise platoya oranla daha sıcak ve buharlaşması yüksek bir mikroiklim sergiler.",
    after:
      "Ekvator kuşağında bulunmasına karşın ortalama 1.100 metreyi aşan rakım ve geniş su yüzeyleri, Uganda'da yıl boyu ortalama 20-27 derece arasında değişen son derece ılıman ve dengeli bir yayla iklimi yaratır. Ülkenin büyük bölümü yılda iki kez (mart-mayıs ve eylül-kasım) bol ve düzenli yağış alır.\n\nSadece kuzeydoğudaki Karamoja bölgesi, dağların yağmur gölgesinde kalması ve kuru hava akımlarının etkisiyle kurak ve yarı kurak bozkır iklimine sahiptir. Albert Gölü çevresindeki çöküntü vadisi tabanı ise platoya oranla daha sıcak ve buharlaşması yüksek bir yerel iklime sahiptir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'UG',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Yüzölçümünün yaklaşık beşte biri açık sular ve sulak alanlarla kaplı olan Uganda, bütünüyle Nil drenaj havzasının kalbinde yer alır. Dünyanın en büyük tropikal gölü olan Victoria'nın kuzey yarısı ülke sınırları içindedir ve nehrin çıkış noktası Jinja'da kabul edilir; buradan doğan Victoria Nili kuzeye doğru akarak nilüferler ve sazlıklarla kaplı sığ Kyoga Gölü labirentine yayılır.\n\nNehir batıya yöneldiğinde sert bir fay basamağından 43 metrelik dar bir yarığa düşerek görkemli Murchison Çağlayanı'nı oluşturur ve Albert Gölü'ne dökülür; buradan kuzeye, Güney Sudan sınırına yönelen akarsu Albert Nili adını alır. Batı sınırındaki Edward ve George gölleri ise su aygırlarıyla ünlü doğal Kazinga Kanalı ile birbirine bağlanır.",
    after:
      "Yüzölçümünün yaklaşık beşte biri açık sular ve sulak alanlarla kaplı olan Uganda, bütünüyle Nil havzasının kalbinde yer alır. Dünyanın en büyük tropikal gölü olan Victoria'nın kuzey yarısı ülke sınırları içindedir ve nehrin çıkış noktası Jinja'da kabul edilir; buradan doğan Victoria Nili kuzeye doğru akarak nilüferler ve sazlıklarla kaplı sığ Kyoga Gölü labirentine yayılır.\n\nNehir batıya yöneldiğinde sert bir fay basamağından 43 metrelik dar bir yarığa düşerek görkemli Murchison Çağlayanı'nı oluşturur ve Albert Gölü'ne dökülür; buradan kuzeye, Güney Sudan sınırına yönelen akarsu Albert Nili adını alır. Batı sınırındaki Edward ve George gölleri ise su aygırlarıyla ünlü doğal Kazinga Kanalı ile birbirine bağlanır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'ZM',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Güney-Orta Afrika'da karayla çevrili geniş bir yayla ülkesi olan Zambiya, kıtanın iki dev su havzası olan Kongo ve Zambezi nehirleri arasındaki kadim su bölümü platosu üzerinde kuruludur. Deniz seviyesinden ortalama 1.000 ila 1.300 metre yükseklikte dalgalanan bu serin kristalin masa arazisi; derin tektonik rift vadileri, devasa sulak alanlar ve zengin bakır kuşağı yataklarıyla biçimlenmiştir.",
    after:
      "Güney-Orta Afrika'da karayla çevrili geniş bir yayla ülkesi olan Zambiya, kıtanın iki dev su havzası olan Kongo ve Zambezi nehirleri arasındaki kadim su bölümü platosu üzerinde kuruludur. Deniz seviyesinden ortalama 1.000 ila 1.300 metre yükseklikte dalgalanan sert ve eski kayaçlardan oluşan bu serin masa arazisi; derin tektonik rift vadileri, devasa sulak alanlar ve zengin bakır kuşağı yataklarıyla biçimlenmiştir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'ZM',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Zambiya sularının dörtte üçünü toplayan ve ülkeye adını veren Zambezi Nehri, kuzeybatıdaki Kalene Tepeleri'nden doğar; Angola topraklarına girip çıktıktan sonra güney sınırı boyunca doğuya akar. Zimbabve sınırında, nehrin 100 metreyi aşan sarp bir bazalt yarığına döküldüğü Victoria Şelalesi (yerel dilde 'Gürleyen Duman' - Mosi-oa-Tunya) ve hemen ardındaki devasa Kariba Baraj Gölü, havzanın hidrolojik şaheserleridir; Kafue ve Luangwa kolları da bu ana arteri besler.\n\nÜlkenin kuzeyi ise Kongo havzasına bağlanır; Chambeshi Nehri'nin beslediği geniş Bangweulu Gölü ve çevresindeki sulak bataklıklar dünyanın en zengin tatlı su ekosistemlerindendir. Kuzey sınırında Kongo DC ile paylaşılan Mweru Gölü ve Tanganyika Gölü'nün güney ucu da ülkenin diğer stratejik su kütleleridir.",
    after:
      "Zambiya sularının dörtte üçünü toplayan ve ülkeye adını veren Zambezi Nehri, kuzeybatıdaki Kalene Tepeleri'nden doğar; Angola topraklarına girip çıktıktan sonra güney sınırı boyunca doğuya akar. Zimbabve sınırında, nehrin 100 metreyi aşan sarp bir bazalt yarığına döküldüğü Victoria Şelalesi (yerel dilde 'Gürleyen Duman' - Mosi-oa-Tunya) ve hemen ardındaki devasa Kariba Baraj Gölü, havzanın su harikalarıdır; Kafue ve Luangwa kolları da bu ana arteri besler.\n\nÜlkenin kuzeyi ise Kongo havzasına bağlanır; Chambeshi Nehri'nin beslediği geniş Bangweulu Gölü ve çevresindeki sulak bataklıklar dünyanın en zengin tatlı su ekosistemlerindendir. Kuzey sınırında Kongo DC ile paylaşılan Mweru Gölü ve Tanganyika Gölü'nün güney ucu da ülkenin diğer stratejik su kütleleridir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CA',
    property: 'governmentFormTr',
    column: 'government_form_tr',
    kind: 'scalar',
    before: 'Federal parlamenter monarşi (Commonwealth realm)',
    after: 'Federal parlamenter monarşi (İngiliz Milletler Topluluğu krallığı)',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CA',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Kanada, 8.788.700 kilometrekarelik yüzölçümüyle Rusya'dan sonra dünyanın en geniş ikinci ülkesidir. Toprakları doğuda Atlas, batıda Büyük ve kuzeyde Arktik Okyanusu ile kuşatılmıştır. \n\nBu engin coğrafyaya karşın yerleşim deseni son derece asimetriktir. Sert kış şartları ve donmuş topraklar nedeniyle nüfusun ezici çoğunluğu, Amerika Birleşik Devletleri sınırına paralel uzanan birkaç yüz kilometrelik dar güney şeridinde yaşar; kuzeye uzanan milyonlarca kilometrekarelik arazi ise seyrek yerleşimli bir tayga ve tundra kuşağından ibarettir.",
    after:
      "Kanada, 8.788.700 kilometrekarelik yüzölçümüyle Rusya'dan sonra dünyanın en geniş ikinci ülkesidir. Toprakları doğuda Atlas, batıda Büyük ve kuzeyde Arktik Okyanusu ile kuşatılmıştır. \n\nBu engin coğrafyaya karşın nüfus son derece dengesiz dağılmıştır. Sert kış şartları ve donmuş topraklar nedeniyle nüfusun ezici çoğunluğu, Amerika Birleşik Devletleri sınırına paralel uzanan birkaç yüz kilometrelik dar güney şeridinde yaşar; kuzeye uzanan milyonlarca kilometrekarelik arazi ise seyrek yerleşimli bir tayga ve tundra kuşağından ibarettir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CA',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Kıtasal boyutlar ve açık topoğrafik koridorlar Kanada genelinde büyük bir iklim çeşitliliği üretir. Sıcak Pasifik akıntılarının etkisindeki British Columbia kıyıları, bol yağışlı ve kışları ılıman geçen bir okyanusal iklime sahiptir. \n\nKayalık Dağlar'ın gerisinde uzanan iç bozkırlarda (Prairieler) kışların dondurucu, yazların sıcak geçtiği sert bir karasal iklim egemendir. Burada kış ortasında dağlardan aşağı fön karakteriyle inen Chinook rüzgarları, sıcaklığı birkaç saat içinde onlarca derece yükselterek karları hızla eritebilir. \n\nKuzeye ilerledikçe iğne yapraklı boreal ormanlar yerini ağaçsız tundraya bırakır; zemin metrelerce derinliğe kadar yıl boyu donmuş halde kalan permafrost tabakasıyla kaplanır.",
    after:
      "Kıta ölçeğindeki genişlik ve hava kütlelerine açık geniş koridorlar Kanada genelinde büyük bir iklim çeşitliliği yaratır. Sıcak Pasifik akıntılarının etkisindeki British Columbia kıyıları, bol yağışlı ve kışları ılıman geçen bir okyanusal iklime sahiptir. \n\nKayalık Dağlar'ın gerisinde uzanan iç bozkırlarda (Prairieler) kışların dondurucu, yazların sıcak geçtiği sert bir karasal iklim egemendir. Burada kış ortasında dağlardan inerken ısınıp kuruyan (fön) Chinook rüzgarları, sıcaklığı birkaç saat içinde onlarca derece yükselterek karları hızla eritebilir. \n\nKuzeye ilerledikçe iğne yapraklı boreal ormanlar yerini ağaçsız tundraya bırakır; zemin metrelerce derinliğe kadar yıl boyu donmuş halde kalan permafrost tabakasıyla kaplanır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CA',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Buzulların aşındırdığı zemin yapısı sayesinde Kanada, dünyada göl yüzeyi alanı en geniş ülkedir. Güneydoğuda Amerika Birleşik Devletleri ile paylaşılan Büyük Göller sistemi, sularını Saint Lawrence Nehri vasıtasıyla Atlas Okyanusu'na aktararak kıta içine dev bir deniz yolu koridoru açar. \n\nKuzey kesiminde ise Büyük Köle Gölü'nden doğan Mackenzie Nehri, Arktik Okyanusu'na yönelir ve yaklaşık 1.738 kilometrelik ana yatağıyla ülkenin en uzun akarsu sistemini oluşturur. \n\nToprakların merkezinde dev bir deniz kulağı gibi açılan Hudson Körfezi, Kanada topraklarının üçte birinden fazlasını toplayan devasa bir drenaj havzasına merkezlik eder.",
    after:
      "Buzulların aşındırdığı zemin yapısı sayesinde Kanada, dünyada göl yüzeyi alanı en geniş ülkedir. Güneydoğuda Amerika Birleşik Devletleri ile paylaşılan Büyük Göller sistemi, sularını Saint Lawrence Nehri vasıtasıyla Atlas Okyanusu'na aktararak kıta içine dev bir deniz yolu koridoru açar. \n\nKuzey kesiminde ise Büyük Köle Gölü'nden doğan Mackenzie Nehri, Arktik Okyanusu'na yönelir ve yaklaşık 1.738 kilometrelik ana yatağıyla ülkenin en uzun akarsu sistemini oluşturur. \n\nToprakların merkezinde dev bir deniz kulağı gibi açılan Hudson Körfezi, Kanada topraklarının üçte birinden fazlasını toplayan devasa bir su toplama havzasının merkezidir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'US',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Topoğrafik yapı, doğudan batıya belirgin üç ana kuşağa ayrılır. Doğuda Kanada sınırından Alabama'ya kadar uzanan Appalaş Dağları, yüz milyonlarca yıllık erozyonla yuvarlaklaşmış, zengin kömür yatakları ve gür ormanlarla örtülü yaşlı bir sıradağdır. \n\nBu dağların batısından itibaren Kayalık Dağlar'ın eteklerine kadar uzanan 2.000 kilometrelik geniş İç Düzlükler ve Büyük Ovalar, kıtanın tarımsal omurgasını oluşturur. \n\nÜlkenin batı üçte biri ise Pasifik levha hareketlerinin şekillendirdiği genç ve sarp kordilyera sistemine ayrılmıştır. Kıtasal 48 eyaletin en yüksek doruğu Sierra Nevada üzerindeki 4.421 metrelik Mount Whitney iken, ülkenin ve Kuzey Amerika kıtasının zirvesi, Alaska Sıradağları'nda 6.190 metreye ulaşan karlı Denali kütlesidir.",
    after:
      "Yer şekilleri, doğudan batıya belirgin üç ana kuşağa ayrılır. Doğuda Kanada sınırından Alabama'ya kadar uzanan Appalaş Dağları, yüz milyonlarca yıllık erozyonla yuvarlaklaşmış, zengin kömür yatakları ve gür ormanlarla örtülü yaşlı bir sıradağdır. \n\nBu dağların batısından itibaren Kayalık Dağlar'ın eteklerine kadar uzanan 2.000 kilometrelik geniş İç Düzlükler ve Büyük Ovalar, kıtanın tarımsal omurgasını oluşturur. \n\nÜlkenin batı üçte biri ise Pasifik levha hareketlerinin şekillendirdiği genç ve sarp kordilyera sistemine ayrılmıştır. Kıtasal 48 eyaletin en yüksek doruğu Sierra Nevada üzerindeki 4.421 metrelik Mount Whitney iken, ülkenin ve Kuzey Amerika kıtasının zirvesi, Alaska Sıradağları'nda 6.190 metreye ulaşan karlı Denali kütlesidir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'US',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Doğu-batı doğrultusunda hiçbir yüksek sıradağın bulunmayışı, Kanada kaynaklı kuru kutup havası ile Meksika Körfezi'nden gelen sıcak ve nemli tropikal havanın iç düzlüklerde doğrudan karşılaşmasına yol açar. Bu termodinamik çatışma, ilkbahar aylarında Büyük Ovalar'da dünyada benzeri olmayan şiddette fırtına ve hortumlara zemin hazırlar. \n\nKıtanın doğu yarısında dört mevsimin belirgin yaşandığı nemli karasal ve güneydoğuda subtropikal iklim görülürken, batıdaki sıradağların gerisinde kalan havzalar yağış gölgesi nedeniyle yarı kurak bozkırlara ve çöllere dönüşür. \n\nBüyük Okyanus kıyısında kuzeydeki yağışlı denizel rejim, güneye inildikçe Kaliforniya'nın yazı kurak Akdeniz iklimine bağlanır; Alaska'da subarktik soğuklar, Hawaii'de ise tropikal alize yağmurları egemendir.",
    after:
      "Doğu-batı doğrultusunda hiçbir yüksek sıradağın bulunmayışı, Kanada kaynaklı kuru kutup havası ile Meksika Körfezi'nden gelen sıcak ve nemli tropikal havanın iç düzlüklerde doğrudan karşılaşmasına yol açar. Bu iki hava kütlesinin çarpışması, ilkbahar aylarında Büyük Ovalar'da dünyada benzeri olmayan şiddette fırtına ve hortumlara zemin hazırlar. \n\nKıtanın doğu yarısında dört mevsimin belirgin yaşandığı nemli karasal ve güneydoğuda subtropikal iklim görülürken, batıdaki sıradağların gerisinde kalan havzalar yağış gölgesi nedeniyle yarı kurak bozkırlara ve çöllere dönüşür. \n\nBüyük Okyanus kıyısında kuzeydeki yağışlı denizel rejim, güneye inildikçe Kaliforniya'nın yazı kurak Akdeniz iklimine bağlanır; Alaska'da subarktik soğuklar, Hawaii'de ise tropikal alize yağmurları egemendir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MX',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Yengeç Dönencesi Meksika'yı enlemsel olarak subtropikal ve tropikal iki parçaya bölerken, yerleşim şartlarını asıl belirleyen etken dikey topoğrafyadır. Dağların koruduğu kuzey bölgeleri ile Baja California'da yağışın 250 milimetrenin altına düştüğü şiddetli çöl iklimleri hüküm sürer. \n\nKıyı ovalarını kapsayan 900 metrenin altındaki sıcak kuşak (tierra caliente) boğucu ve nemli bir tropikal rejime sahiptir. Rakımın 900 ila 1.800 metre arasında olduğu ılıman kuşak (tierra templada) tarım için ideal bir serinlik sunar. \n\n1.800 metrenin üzerindeki serin kuşak (tierra fría) ise kurak kışları ve serin geceleriyle tanınır; 2.240 metre rakımdaki başkent Meksika Şehri dahil olmak üzere nüfusun tarih boyunca bu yüksek yaylalarda toplanmasının başlıca nedeni bu elverişli mikroklimadır.",
    after:
      "Yengeç Dönencesi Meksika'yı enlemsel olarak subtropikal ve tropikal iki parçaya bölerken, yerleşim şartlarını asıl belirleyen etken yükseltidir. Dağların koruduğu kuzey bölgeleri ile Baja California'da yağışın 250 milimetrenin altına düştüğü şiddetli çöl iklimleri hüküm sürer. \n\nKıyı ovalarını kapsayan 900 metrenin altındaki sıcak kuşak (tierra caliente) boğucu ve nemli bir tropikal rejime sahiptir. Rakımın 900 ila 1.800 metre arasında olduğu ılıman kuşak (tierra templada) tarım için ideal bir serinlik sunar. \n\n1.800 metrenin üzerindeki serin kuşak (tierra fría) ise kurak kışları ve serin geceleriyle tanınır; 2.240 metre rakımdaki başkent Meksika Şehri dahil olmak üzere nüfusun tarih boyunca bu yüksek yaylalarda toplanmasının başlıca nedeni bu elverişli iklimdir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BZ',
    property: 'governmentFormTr',
    column: 'government_form_tr',
    kind: 'scalar',
    before: 'Parlamenter monarşi (Commonwealth realm)',
    after: 'Parlamenter monarşi (İngiliz Milletler Topluluğu krallığı)',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BZ',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ülke topoğrafyası iki farklı jeolojik yapıya ayrılır. Güneyde yükselen Maya Dağları, 1.124 metrelik Doyle's Delight doruğuyla ülkenin en yüksek alanını oluşturur. Paleozoik döneme ait granit ve metamorfik şistlerden oluşan bu dağ kütlesi, Orta Amerika'nın en yaşlı kara parçalarındandır ve asidik, geçirimsiz toprak yapısıyla çevresinden ayrışır. \n\nÜlkenin kuzeyi ve kıyı kuşağı ise Mezozoyik ve Tersiyer tortullardan oluşan alçak, düz bir kireçtaşı arazisidir; burada mağaralar, düdenler ve sulak bataklıklar yaygındır. \n\nKıyı açıklarında boylu boyunca uzanan Belize Bariyer Resifi, yaklaşık 300 kilometrelik uzunluğuyla Avustralya'daki Büyük Set Resifi'nin ardından dünyanın en uzun ikinci kesintisiz mercan resif sistemidir. Bu resif üzerinde yer alan Büyük Mavi Delik (Great Blue Hole), buzul çağında oluşmuş karstik bir mağara tavanının çöküp deniz suları altında kalmasıyla meydana gelen 300 metreyi aşkın çapa sahip anıtsal bir sualtı obruğudur.",
    after:
      "Ülke topoğrafyası iki farklı jeolojik yapıya ayrılır. Güneyde yükselen Maya Dağları, 1.124 metrelik Doyle's Delight doruğuyla ülkenin en yüksek alanını oluşturur. Paleozoik döneme ait granit ve metamorfik şistlerden oluşan bu dağ kütlesi, Orta Amerika'nın en yaşlı kara parçalarındandır ve asidik, geçirimsiz toprak yapısıyla çevresinden ayrışır. \n\nÜlkenin kuzeyi ve kıyı kuşağı ise Mezozoyik ve Tersiyer tortullardan oluşan alçak, düz bir kireçtaşı arazisidir; burada mağaralar, düdenler ve sulak bataklıklar yaygındır. \n\nKıyı açıklarında boylu boyunca uzanan Belize Bariyer Resifi, yaklaşık 300 kilometrelik uzunluğuyla Avustralya'daki Büyük Set Resifi'nin ardından dünyanın en uzun ikinci kesintisiz mercan resif sistemidir. Bu resif üzerinde yer alan Büyük Mavi Delik, buzul çağında oluşmuş karstik bir mağara tavanının çöküp deniz suları altında kalmasıyla meydana gelen 300 metreyi aşkın çapa sahip anıtsal bir sualtı obruğudur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BZ',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Ülkenin en önemli hidrolojik omurgası, Guatemala sınırından doğup doğuya doğru 290 kilometre aktıktan sonra Karayip Denizi'ne dökülen Belize Nehri'dir. Nehir havzası, tarih boyunca maun tomruklarının taşındığı ve bugün tarımsal yerleşimlerin yoğunlaştığı en işlek vadidir. \n\nKuzeyde Meksika ile sınırı çizen Rio Hondo ve güneyde Guatemala sınırını oluşturan Sarstoon Nehri diğer başlıca sınır aşan akarsulardır. \n\nKireçtaşı yapının egemen olduğu iç platolarda ise yağmur suları yüzeyde akmak yerine yeraltına süzülerek Caves Branch gibi geniş yeraltı nehirlerini ve karstik mağara drenaj ağlarını besler.",
    after:
      "Ülkenin en önemli akarsu omurgası, Guatemala sınırından doğup doğuya doğru 290 kilometre aktıktan sonra Karayip Denizi'ne dökülen Belize Nehri'dir. Nehir havzası, tarih boyunca maun tomruklarının taşındığı ve bugün tarımsal yerleşimlerin yoğunlaştığı en işlek vadidir. \n\nKuzeyde Meksika ile sınırı çizen Rio Hondo ve güneyde Guatemala sınırını oluşturan Sarstoon Nehri diğer başlıca sınır aşan akarsulardır. \n\nKireçtaşı yapının egemen olduğu iç platolarda ise yağmur suları yüzeyde akmak yerine yeraltına süzülerek Caves Branch gibi geniş yeraltı nehirlerini ve karstik mağaralardaki su yollarını besler.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CR',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      'Ülkeyi kuzeybatıdan güneydoğuya bir omurga gibi bölen sıradağlar zinciri, dört ana kordilyeradan meydana gelir: Guanacaste, Tilarán, Central ve Talamanca. İlk üç kordilyera aktif levha dalmasının beslediği volkanik konilerden oluşur; Arenal, Poás, Irazú ve Turrialba gibi yanardağlar tarihsel ve güncel püskürmeleriyle çevre toprakları verimli volkanik küllerle beslemiştir. \n\nGüneydeki Talamanca Sıradağları ise volkanik kökenli olmayıp tektonik yükselmenin ürünüdür; ülkenin en yüksek zirvesi olan 3.821 metrelik Cerro Chirripó bu kütle üzerinde yükselir. \n\nKıyı morfolojisi de iki deniz arasında tezat sergiler: Karayip kıyısı düz, alçak ve lagünlerle kaplı bir kıyı kordonu iken, Pasifik kıyısı Nicoya ve Osa yarımadaları, dik burunlar ve derin koylarla son derece girintili bir yapı sunar.',
    after:
      'Ülkeyi kuzeybatıdan güneydoğuya bir omurga gibi bölen sıradağlar zinciri, dört ana kordilyeradan meydana gelir: Guanacaste, Tilarán, Central ve Talamanca. İlk üç kordilyera bir levhanın diğerinin altına dalmasıyla beslenen volkanik konilerden oluşur; Arenal, Poás, Irazú ve Turrialba gibi yanardağlar tarihsel ve güncel püskürmeleriyle çevre toprakları verimli volkanik küllerle beslemiştir. \n\nGüneydeki Talamanca Sıradağları ise volkanik kökenli olmayıp tektonik yükselmenin ürünüdür; ülkenin en yüksek zirvesi olan 3.821 metrelik Cerro Chirripó bu kütle üzerinde yükselir. \n\nKıyıların biçimi de iki deniz arasında tezat oluşturur: Karayip kıyısı düz, alçak ve lagünlerle kaplı bir kıyı kordonu iken, Pasifik kıyısı Nicoya ve Osa yarımadaları, dik burunlar ve derin koylarla son derece girintili bir yapı sunar.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CR',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Orta kordilyera kuşağı, iki okyanusun hava kütlelerini keskin biçimde ayıran bir iklim duvarı işlevi görür. Karayip yamacı yıl boyunca nem yüklü alize rüzgarlarını doğrudan karşılar; bu nedenle belirgin bir kurak mevsim yaşamaksızın yıllık 3.500 ila 5.000 milimetre yağış alır. \n\nBuna karşılık Pasifik yamacı, özellikle kuzeybatıdaki Guanacaste bölgesi, kasım ile nisan arasında dağların yağış gölgesinde kalarak sert bir kurak döneme girer ve tropikal kuru orman örtüsü geliştirir. \n\n1.000 ila 1.500 metre rakımda yer alan Valle Central ve başkent San José ise serinletici ılıman bir mikroklimaya sahiptir; sıcaklık yıl boyu 18 ila 26 derece arasında dengelenir.',
    after:
      'Orta kordilyera kuşağı, iki okyanusun hava kütlelerini keskin biçimde ayıran bir iklim duvarı işlevi görür. Karayip yamacı yıl boyunca nem yüklü alize rüzgarlarını doğrudan karşılar; bu nedenle belirgin bir kurak mevsim yaşamaksızın yıllık 3.500 ila 5.000 milimetre yağış alır. \n\nBuna karşılık Pasifik yamacı, özellikle kuzeybatıdaki Guanacaste bölgesi, kasım ile nisan arasında dağların yağış gölgesinde kalarak sert bir kurak döneme girer ve tropikal kuru orman örtüsü geliştirir. \n\n1.000 ila 1.500 metre rakımda yer alan Valle Central ve başkent San José ise serinletici ılıman bir iklime sahiptir; sıcaklık yıl boyu 18 ila 26 derece arasında dengelenir.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SV',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "El Salvador, Orta Amerika'da Karayip Denizi'ne kıyısı bulunmayan, yalnızca Büyük Okyanus'a açılan tek devlettir. 20.720 kilometrekarelik yüzölçümüyle kıta ana karasının en küçük ülkesi olmasına rağmen, kilometrekareye düşen üç yüzü aşkın insanıyla bölgenin en yoğun nüfuslu coğrafyasıdır. \n\nKuzeyde Honduras, batıda Guatemala ile sınırlanan ülke, Kokos levhasının Karayip levhası altına daldığı aktif Orta Amerika Çukuru'nun hemen gerisinde yer alır; bu jeodinamik konum ülkeyi sık depremler ve yoğun volkanizma ile tanımlar.",
    after:
      "El Salvador, Orta Amerika'da Karayip Denizi'ne kıyısı bulunmayan, yalnızca Büyük Okyanus'a açılan tek devlettir. 20.720 kilometrekarelik yüzölçümüyle kıta ana karasının en küçük ülkesi olmasına rağmen, kilometrekareye düşen üç yüzü aşkın insanıyla bölgenin en yoğun nüfuslu coğrafyasıdır. \n\nKuzeyde Honduras, batıda Guatemala ile sınırlanan ülke, Kokos levhasının Karayip levhası altına daldığı aktif Orta Amerika Çukuru'nun hemen gerisinde yer alır; bu konum nedeniyle ülkede sık depremler ve yoğun volkanik etkinlik görülür.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SV',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Ülkenin hidrolojik can damarı, Guatemala dağlarından doğup El Salvador topraklarını boydan boya kat eden ve Büyük Okyanus'a dökülen Lempa Nehri'dir. Ülke yüzölçümünün yarısından fazlasını drene eden Lempa, kurulan baraj gölleriyle (Cerrón Grande Rezervuarı) ulusal elektrik üretiminin ve tarımsal sulamanın ana kaynağıdır. \n\nArazideki diğer kritik su kütleleri, dev patlamalar sonucu çöken kraterlerin su tutmasıyla oluşan Coatepeque ve Ilopango kaldera gölleridir. \n\nÖzellikle milattan sonra beşinci yüzyılda patlayarak tüm bölgedeki Maya yerleşimlerini kül altında bırakan dev Ilopango kalderası, bugün başkentin doğusunda devasa bir tatlı su havzası olarak varlığını sürdürür.",
    after:
      "Ülkenin can damarı, Guatemala dağlarından doğup El Salvador topraklarını boydan boya kat eden ve Büyük Okyanus'a dökülen Lempa Nehri'dir. Ülke yüzölçümünün yarısından fazlasının sularını toplayan Lempa, kurulan baraj gölleriyle (Cerrón Grande Rezervuarı) ulusal elektrik üretiminin ve tarımsal sulamanın ana kaynağıdır. \n\nArazideki diğer kritik su kütleleri, dev patlamalar sonucu çöken kraterlerin su tutmasıyla oluşan Coatepeque ve Ilopango kaldera gölleridir. \n\nÖzellikle milattan sonra beşinci yüzyılda patlayarak tüm bölgedeki Maya yerleşimlerini kül altında bırakan dev Ilopango kalderası, bugün başkentin doğusunda devasa bir tatlı su havzası olarak varlığını sürdürür.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GT',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ülke arazisi üç belirgin jeomorfolojik kuşağa ayrılır. Güneyde Pasifik levhasının dalma zonuna paralel uzanan Sierra Madre de Chiapas kuşağı, Orta Amerika'nın en yüksek noktası olan 4.220 metrelik Tajumulco Yanardağı dahil olmak üzere otuzdan fazla volkana ev sahipliği yapar. Bu kuşakta, 84 bin yıl önceki süper patlamanın oluşturduğu kalderada yer alan ve 340 metre derinliğiyle bölgenin en derin su kütlesi olan Atitlán Gölü yükselir. \n\nİç kesimde, Kuzey Amerika ve Karayip levhalarının sınırını çizen Motagua ve Polochic fay vadileri boyunca kristalen kireçtaşı kütlesi Cuchumatanes Sıradağları yükselir. \n\nKuzey kesimi ise Meksika'nın Yucatán Yarımadası ile bütünleşen Petén kireçtaşı platosudur; ortalama 200 metreyi aşmayan bu dalgalı karstik ova, yoğun yağmur ormanlarıyla kaplıdır ve yüzey akışından büyük ölçüde yoksundur.",
    after:
      "Ülke arazisi üç belirgin yer şekli kuşağına ayrılır. Güneyde Kokos levhasının dalma zonuna paralel uzanan Sierra Madre de Chiapas kuşağı, Orta Amerika'nın en yüksek noktası olan 4.220 metrelik Tajumulco Yanardağı dahil olmak üzere otuzdan fazla volkana ev sahipliği yapar. Bu kuşakta, 84 bin yıl önceki süper patlamanın oluşturduğu kalderada yer alan ve 340 metre derinliğiyle bölgenin en derin su kütlesi olan Atitlán Gölü yükselir. \n\nİç kesimde, Kuzey Amerika ve Karayip levhalarının sınırını çizen Motagua ve Polochic fay vadileri boyunca kristalen kireçtaşı kütlesi Cuchumatanes Sıradağları yükselir. \n\nKuzey kesimi ise Meksika'nın Yucatán Yarımadası ile bütünleşen Petén kireçtaşı platosudur; ortalama 200 metreyi aşmayan bu dalgalı karstik ova, yoğun yağmur ormanlarıyla kaplıdır ve yüzey akışından büyük ölçüde yoksundur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GT',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Enlemden ziyade dikey yükselti basamakları iklimi şekillendirir. Pasifik kıyı düzlüğü ile Petén yağmur ormanları, yıl boyu 30 dereceyi aşan sıcaklıkların ve yüksek nemin hüküm sürdüğü sıcak kuşaktadır (tierra caliente). \n\nNüfusun ve kahve üretiminin yoğunlaştığı 1.500 ila 2.500 metre arasındaki orta yaylalar, sıcaklığın yıl boyunca 15 ila 25 derece arasında seyrettiği ılıman bir yayla iklimine (tierra templada) sahiptir. \n\nCuchumatanes ve volkanik dorukların yer aldığı 3.000 metrenin üzerindeki yaylalarda (tierra fría) kış aylarında don olayları ve sert soğuklar yaşanır; doğudaki Motagua Vadisi gibi dağ ardı ceplerinde ise yağış gölgesi sebebiyle kaktüslü yarı kurak mikroklimlar gelişir.',
    after:
      'Enlemden ziyade dikey yükselti basamakları iklimi şekillendirir. Pasifik kıyı düzlüğü ile Petén yağmur ormanları, yıl boyu 30 dereceyi aşan sıcaklıkların ve yüksek nemin hüküm sürdüğü sıcak kuşaktadır (tierra caliente). \n\nNüfusun ve kahve üretiminin yoğunlaştığı 1.500 ila 2.500 metre arasındaki orta yaylalar, sıcaklığın yıl boyunca 15 ila 25 derece arasında seyrettiği ılıman bir yayla iklimine (tierra templada) sahiptir. \n\nCuchumatanes ve volkanik dorukların yer aldığı 3.000 metrenin üzerindeki yaylalarda (tierra fría) kış aylarında don olayları ve sert soğuklar yaşanır; doğudaki Motagua Vadisi gibi dağ ardı ceplerinde ise yağış gölgesi sebebiyle kaktüslü yarı kurak yerel iklimler görülür.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'NI',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      'Nikaragua, 120.340 kilometrekarelik yüzölçümüyle Orta Amerika kıstağının en geniş ülkesidir. Kuzeyde Honduras, güneyde Kosta Rika ile komşu olan ülke; batıda Büyük Okyanus, doğuda ise Karayip Denizi ile çevrilidir. \n\nÜlke coğrafyası belirgin bir doğu-batı asimetrisi sergiler. Nüfusun, sanayinin ve tarımın ezici kısmı batıdaki volkanik çöküntü havzasında ve dev göllerin çevresinde toplanırken; yüzölçümünün yarısından fazlasını kaplayan doğudaki Mosquito Kıyısı (Costa de Mosquitos), seyrek nüfuslu bakir yağmur ormanları ve nehir bataklıklarından oluşur.',
    after:
      'Nikaragua, 120.340 kilometrekarelik yüzölçümüyle Orta Amerika kıstağının en geniş ülkesidir. Kuzeyde Honduras, güneyde Kosta Rika ile komşu olan ülke; batıda Büyük Okyanus, doğuda ise Karayip Denizi ile çevrilidir. \n\nÜlkenin doğusu ile batısı arasında belirgin bir karşıtlık vardır. Nüfusun, sanayinin ve tarımın ezici kısmı batıdaki volkanik çöküntü havzasında ve dev göllerin çevresinde toplanırken; yüzölçümünün yarısından fazlasını kaplayan doğudaki Mosquito Kıyısı (Costa de Mosquitos), seyrek nüfuslu bakir yağmur ormanları ve nehir bataklıklarından oluşur.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'PA',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ülkenin omurgasını batıda Kosta Rika sınırından başlayarak uzanan volkanik Cordillera Central dağ kuşağı oluşturur. Ülkenin zirvesi, bu kütle üzerinde 3.474 metreye ulaşan uykudaki stratovolkan Volcán Barú'dur; zirvesinden açık günlerde aynı anda hem Pasifik hem de Karayip denizi ufku seçilebilir. \n\nOrta kesime doğru dağlar alçalarak yerini kanalın geçtiği 100 metrenin altındaki dalgalı tepelere ve eyer şeklindeki kıstak eşiğine bırakır. \n\nDoğuya ilerledikçe topoğrafya yeniden yükselerek Darién Sıradağları'na ve San Blas kıyı tepelerine dönüşür; aşırı nemli ve dik bu coğrafya, insan yerleşimini sınırlayan aşılmaz bir doğal duvar meydana getirir.",
    after:
      "Ülkenin omurgasını batıda Kosta Rika sınırından başlayarak uzanan volkanik Cordillera Central dağ kuşağı oluşturur. Ülkenin zirvesi, bu kütle üzerinde 3.474 metreye ulaşan uykudaki tabakalı volkan Volcán Barú'dur; zirvesinden açık günlerde aynı anda hem Pasifik hem de Karayip denizi ufku seçilebilir. \n\nOrta kesime doğru dağlar alçalarak yerini kanalın geçtiği 100 metrenin altındaki dalgalı tepelere ve eyer şeklindeki kıstak eşiğine bırakır. \n\nDoğuya ilerledikçe topoğrafya yeniden yükselerek Darién Sıradağları'na ve San Blas kıyı tepelerine dönüşür; aşırı nemli ve dik bu coğrafya, insan yerleşimini sınırlayan aşılmaz bir doğal duvar meydana getirir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'PA',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Merkezi dağ omurgası ülkeyi iki ayrı drenaj havzasına ayırır; dağların denize yakınlığı nedeniyle beş yüzü aşkın akarsu genellikle kısa, eğimli ve hızlı akışlıdır. Karayip tarafının en kritik nehri olan Chagres, Gatún Barajı ile setlenerek 1913'te insan yapımı Gatún Gölü'nü oluşturmuştur. \n\nPanama Kanalı'nın gemi geçiş havuzlarını yerçekimiyle besleyen tatlı suyun tamamı Chagres havzası ve Gatún Gölü rezervuarından karşılandığı için nehrin debisi doğrudan küresel ticaretin sürekliliğini belirler. \n\nPasifik tarafında ise ülkenin en uzun nehri olan Chucunaque ve onun birleştiği devasa debili Tuira Nehri, Darién bölgesinin vahşi yağmur ormanlarını drene ederek San Miguel Körfezi'ne dökülür.",
    after:
      "Merkezi dağ omurgası ülkeyi iki ayrı su toplama havzasına ayırır; dağların denize yakınlığı nedeniyle beş yüzü aşkın akarsu genellikle kısa, eğimli ve hızlı akışlıdır. Karayip tarafının en kritik nehri olan Chagres, Gatún Barajı ile setlenerek 1913'te insan yapımı Gatún Gölü'nü oluşturmuştur. \n\nPanama Kanalı'nın gemi geçiş havuzlarını yerçekimiyle besleyen tatlı suyun tamamı Chagres havzası ve Gatún Gölü rezervuarından karşılandığı için nehrin debisi doğrudan küresel ticaretin sürekliliğini belirler. \n\nPasifik tarafında ise ülkenin en uzun nehri olan Chucunaque ve onun birleştiği devasa debili Tuira Nehri, Darién bölgesinin vahşi yağmur ormanlarının sularını toplayarak San Miguel Körfezi'ne dökülür.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AG',
    property: 'governmentFormTr',
    column: 'government_form_tr',
    kind: 'scalar',
    before: 'Parlamenter monarşi (Commonwealth realm)',
    after: 'Parlamenter monarşi (İngiliz Milletler Topluluğu krallığı)',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AG',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Antigua adası üç belirgin topoğrafik kuşağa ayrılır: Güneybatıda aşınmış eski bir volkanik kalderanın kalıntısı olan ve 402 metreyle ülkenin en yüksek noktasını oluşturan Mount Obama (eski adıyla Boggy Peak) kütlesi yükselir; orta kesimde killi ve marnlı bir çöküntü düzlüğü uzanırken, kuzeydoğuda dalgalı kireçtaşı tepeleri yer alır.\n\nKuzeydeki Barbuda adasında ise volkanik iz bulunmaz; en yüksek yeri olan Barbuda Highlands yalnızca 44,5 metreye ulaşır. Adanın batı kıyısında açık denizden dar bir kum setiyle ayrılan sığ Codrington Lagünü, Batı Yarımküre'nin en büyük fırkateyn kuşu kolonisine ev sahipliği yapan benzersiz bir sulak alan ekosistemidir.",
    after:
      "Antigua adası üç belirgin yer şekli kuşağına ayrılır: Güneybatıda aşınmış eski bir volkanik kalderanın kalıntısı olan ve 402 metreyle ülkenin en yüksek noktasını oluşturan Mount Obama (eski adıyla Boggy Peak) kütlesi yükselir; orta kesimde killi ve marnlı bir çöküntü düzlüğü uzanırken, kuzeydoğuda dalgalı kireçtaşı tepeleri yer alır.\n\nKuzeydeki Barbuda adasında ise volkanik iz bulunmaz; en yüksek yeri olan Barbuda Highlands yalnızca 44,5 metreye ulaşır. Adanın batı kıyısında açık denizden dar bir kum setiyle ayrılan sığ Codrington Lagünü, Batı Yarımküre'nin en büyük fırkateyn kuşu kolonisine ev sahipliği yapan benzersiz bir sulak alan ekosistemidir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AG',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Ülkede kuzeydoğu alizelerinin yumuşattığı tropikal denizel bir iklim hüküm sürer; aralık-nisan arası belirgin bir kurak dönem yaşanırken, ağustos-kasım arası yağışlar artar. Dağ sıralarının yüksek olmaması orografik yağışların oluşmasını engeller; bu nedenle ada, komşu volkanik Antil adalarına kıyasla çok daha az yağış alır ve kuraklık dönemlerine açıktır. Karayip kasırga kuşağının tam yolunda bulunan adalar içinde özellikle alçak Barbuda büyük risk taşır; nitekim 2017 yılındaki Kategori 5 Irma Kasırgası Barbuda'daki tüm altyapıyı yıkarak ada nüfusunun geçici olarak tamamen tahliye edilmesine yol açmıştır.",
    after:
      "Ülkede kuzeydoğu alizelerinin yumuşattığı tropikal denizel bir iklim hüküm sürer; aralık-nisan arası belirgin bir kurak dönem yaşanırken, ağustos-kasım arası yağışlar artar. Dağ sıralarının yüksek olmaması yamaç yağışlarının oluşmasını engeller; bu nedenle ada, komşu volkanik Antil adalarına kıyasla çok daha az yağış alır ve kuraklık dönemlerine açıktır. Karayip kasırga kuşağının tam yolunda bulunan adalar içinde özellikle alçak Barbuda büyük risk taşır; nitekim 2017 yılındaki Kategori 5 Irma Kasırgası Barbuda'daki tüm altyapıyı yıkarak ada nüfusunun geçici olarak tamamen tahliye edilmesine yol açmıştır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AG',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Yükseltinin azlığı ve kireçtaşı zeminin yüksek geçirgenliği sebebiyle her iki adada da kalıcı akarsu ağı gelişmemiştir; yağış suları yüzeyde akışa geçemeden hızla yeraltına sızar. Bu hidrolojik kısıt, Antigua ve Barbuda'yı Karayipler'in tatlı su sıkıntısını en derin hisseden ülkelerinden biri yapar. Su ihtiyacı tarihsel olarak yağmur sarnıçlarıyla karşılanırken, günümüzde kentsel tüketim ve turizm tesisleri deniz suyunu arıtan desalinasyon tesislerine ve yapay göletlerde toplanan yüzey sularına dayanır.",
    after:
      "Yükseltinin azlığı ve kireçtaşı zeminin yüksek geçirgenliği sebebiyle her iki adada da kalıcı akarsu ağı gelişmemiştir; yağış suları yüzeyde akışa geçemeden hızla yeraltına sızar. Bu durum, Antigua ve Barbuda'yı Karayipler'in tatlı su sıkıntısını en derin hisseden ülkelerinden biri yapar. Su ihtiyacı tarihsel olarak yağmur sarnıçlarıyla karşılanırken, günümüzde kentsel tüketim ve turizm tesisleri deniz suyunu arıtan tesislere ve yapay göletlerde toplanan yüzey sularına dayanır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BS',
    property: 'governmentFormTr',
    column: 'government_form_tr',
    kind: 'scalar',
    before: 'Parlamenter monarşi (Commonwealth realm)',
    after: 'Parlamenter monarşi (İngiliz Milletler Topluluğu krallığı)',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BS',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Bahamalar, Karayip Denizi'nde değil, Kuzey Atlantik Okyanusu'nda Florida Boğazı ile Küba'nın kuzeyi arasında 100.000 kilometrekareden geniş bir deniz alanına yayılan 700'ü aşkın ada ve 2.000'den fazla mercan kayalığından (cay) oluşur. Bu adaların yalnızca otuz kadarı yerleşime uygundur. Ülke, okyanus tabanından dik duvarlarla yükselen devasa karbonat kireçtaşı platformları — Büyük ve Küçük Bahama Bankaları — üzerine kuruludur. Turkuaz renkli sığ deniz düzlükleri ile hemen yanı başındaki binlerce metre derinlikteki koyu mavi okyanus çukurları arasındaki tezat, takımadanın temel coğrafi kimliğini belirler.",
    after:
      "Bahamalar, Karayip Denizi'nde değil, Kuzey Atlantik Okyanusu'nda Florida Boğazı ile Küba'nın kuzeyi arasında 100.000 kilometrekareden geniş bir deniz alanına yayılan 700'ü aşkın ada ve 2.000'den fazla mercan kayalığından oluşur. Bu adaların yalnızca otuz kadarı yerleşime uygundur. Ülke, okyanus tabanından dik duvarlarla yükselen devasa karbonat kireçtaşı platformları — Büyük ve Küçük Bahama Bankaları — üzerine kuruludur. Turkuaz renkli sığ deniz düzlükleri ile hemen yanı başındaki binlerce metre derinlikteki koyu mavi okyanus çukurları arasındaki tezat, takımadanın temel coğrafi kimliğini belirler.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BS',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Bahamalar adalarının tamamı mercan ve biyojenik kireçtaşından oluşmuş son derece alçak, düz rölyefli arazilerdir; volkanik ya da kıtasal kayaç yüzeyi bulunmaz. Ülkenin en yüksek yeri Cat Adası üzerinde yükselen ve deniz seviyesinden yalnızca 63 metre yüksekte bulunan Alvernia Tepesi'dir (Mount Alvernia).\n\nBuzul çağlarındaki deniz seviyesi değişimleri sırasında yağış sularının kireçtaşını kimyasal olarak eritmesiyle geniş karstik obruklar ve mağara sistemleri gelişmiştir. Son buzul erimesiyle sular altında kalan bu dik dikey mağaralar \"mavi delik\" (blue hole) olarak adlandırılır. Long Adası kıyısındaki 202 metre derinliğindeki Dean's Mavi Deliği ile Andros Adası'nın iç kesimlerindeki sualtı labirentleri, yeryüzünün en zengin batık karst yapılarını oluşturur.",
    after:
      "Bahamalar adalarının tamamı mercan ve canlı kalıntısı kireçtaşından oluşmuş son derece alçak ve düz arazilerdir; volkanik ya da kıtasal kayaç yüzeyi bulunmaz. Ülkenin en yüksek yeri Cat Adası üzerinde yükselen ve deniz seviyesinden yalnızca 63 metre yüksekte bulunan Alvernia Tepesi'dir.\n\nBuzul çağlarındaki deniz seviyesi değişimleri sırasında yağış sularının kireçtaşını kimyasal olarak eritmesiyle geniş karstik obruklar ve mağara sistemleri gelişmiştir. Son buzul erimesiyle sular altında kalan bu dik dikey mağaralar \"mavi delik\" olarak adlandırılır. Long Adası kıyısındaki 202 metre derinliğindeki Dean's Mavi Deliği ile Andros Adası'nın iç kesimlerindeki sualtı labirentleri, yeryüzünün en zengin batık karst yapılarını oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BB',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ada yüzeyi, tektonik yükselme dönemlerinde dalgaların yonttuğu mercan kireçtaşı terasları halinde kıyıdan iç kesimlere doğru kademeli olarak yükselir. Ülkenin en yüksek noktası, orta-kuzey kesimde 336 metreye ulaşan Hillaby Dağı'dır (Mount Hillaby).\n\nHillaby çevresindeki Scotland District adı verilen doğu bölgesinde kireçtaşı örtü aşınmış, alttaki yumuşak kil ve kumtaşı katmanları açığa çıkarak sarp vadiler ve heyelanlı bir engebe alanı doğurmuştur. Kireçtaşı tabakasının derinliklerinde ise yağmur sularının çözünmesiyle oluşan ve yeraltı nehirleri ile sarkıt-dikit galerilerini barındıran Harrison Mağarası gibi zengin karstik boşluklar gelişmiştir.",
    after:
      "Ada yüzeyi, tektonik yükselme dönemlerinde dalgaların yonttuğu mercan kireçtaşı terasları halinde kıyıdan iç kesimlere doğru kademeli olarak yükselir. Ülkenin en yüksek noktası, orta-kuzey kesimde 336 metreye ulaşan Hillaby Dağı'dır.\n\nHillaby çevresindeki Scotland District adı verilen doğu bölgesinde kireçtaşı örtü aşınmış, alttaki yumuşak kil ve kumtaşı katmanları açığa çıkarak sarp vadiler ve heyelanlı bir engebe alanı doğurmuştur. Kireçtaşı tabakasının derinliklerinde ise yağmur sularının çözünmesiyle oluşan ve yeraltı nehirleri ile sarkıt-dikit galerilerini barındıran Harrison Mağarası gibi zengin karstik boşluklar gelişmiştir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BB',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Kuzeydoğu alizelerinin kesintisiz esintisiyle serinleyen tropikal denizel bir iklim hüküm sürer; aralık-mayıs arası kurak ve güneşli, haziran-kasım arası ise yağışlı geçer. Karayip ada yayının oldukça doğusunda yer alması, adayı ana kasırga rotalarının bir nebze dışında bırakır; bu sayede Barbados komşularına kıyasla doğrudan kasırga vuruşlarına daha seyrek maruz kalır. Buna karşın kurak mevsimde azalan yağışlar, adanın tarım ve yerleşim alanlarında su stresinin belirginleşmesine yol açar.',
    after:
      'Kuzeydoğu alizelerinin kesintisiz esintisiyle serinleyen tropikal denizel bir iklim hüküm sürer; aralık-mayıs arası kurak ve güneşli, haziran-kasım arası ise yağışlı geçer. Karayip ada yayının oldukça doğusunda yer alması, adayı ana kasırga rotalarının bir nebze dışında bırakır; bu sayede Barbados komşularına kıyasla doğrudan kasırga vuruşlarına daha seyrek maruz kalır. Buna karşın kurak mevsimde azalan yağışlar, adanın tarım ve yerleşim alanlarında su sıkıntısının belirginleşmesine yol açar.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CU',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      'Adanın orografik omurgası üç ana grupta toplanır: Güneydoğuda Karayip levhası sınırı boyunca dik falezlerle denize inen ve 1.974 metrelik zirvesi Pico Turquino ile ülkenin en yüksek noktasını oluşturan Sierra Maestra; adanın ortasında yükselen Sierra del Escambray; batıda ise Sierra del Rosario ve Sierra de los Órganos dağları.\n\nBatıdaki Viñales Vadisi, dikey duvarlarla yükselen kule karst tepeleri ("mogote") ve geniş mağara labirentleriyle dünyanın en tanınmış tropikal karst manzaralarından birini sunar. Kıyı şeritlerinde ise zengin mercan resifleri, mangrov bataklıkları ve adayı çevreleyen yüzlerce alçak mercan adacığı (cayo) yer alır.',
    after:
      'Adanın dağlık omurgası üç ana grupta toplanır: Güneydoğuda Karayip levhası sınırı boyunca dik falezlerle denize inen ve 1.974 metrelik zirvesi Pico Turquino ile ülkenin en yüksek noktasını oluşturan Sierra Maestra; adanın ortasında yükselen Sierra del Escambray; batıda ise Sierra del Rosario ve Sierra de los Órganos dağları.\n\nBatıdaki Viñales Vadisi, dikey duvarlarla yükselen kule karst tepeleri ("mogote") ve geniş mağara labirentleriyle dünyanın en tanınmış tropikal karst manzaralarından birini sunar. Kıyı şeritlerinde ise zengin mercan resifleri, mangrov bataklıkları ve adayı çevreleyen yüzlerce alçak mercan adacığı (cayo) yer alır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CU',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Ülke genelinde tropikal savan iklimi hüküm sürer; mayıs-ekim arası bol yağışlı ve nemli, kasım-nisan arası ise daha kurak geçer. Kuzeydoğu alizelerine bakan kuzey ve doğu dağ yamaçları gür ormanları besleyen yoğun yağışlar alırken, Sierra Maestra'nın güney yamaçlarında kalan Guantánamo havzası rüzgar gölgesi sebebiyle kaktüslerin yetiştiği yarı kurak bir mikroiklim sergiler. Haziran-kasım döneminde Atlantik ve Karayip kökenli yıkıcı kasırgalar adayı düzenli olarak boydan boya etkiler.",
    after:
      "Ülke genelinde tropikal savan iklimi hüküm sürer; mayıs-ekim arası bol yağışlı ve nemli, kasım-nisan arası ise daha kurak geçer. Kuzeydoğu alizelerine bakan kuzey ve doğu dağ yamaçları gür ormanları besleyen yoğun yağışlar alırken, Sierra Maestra'nın güney yamaçlarında kalan Guantánamo havzası rüzgar gölgesi sebebiyle kaktüslerin yetiştiği yarı kurak bir yerel iklime sahiptir. Haziran-kasım döneminde Atlantik ve Karayip kökenli yıkıcı kasırgalar adayı düzenli olarak boydan boya etkiler.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CU',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Küba'nın ince ve uzun ada morfolojisi, suların hızla kuzey ya da güney kıyılarına ulaşmasına neden olduğu için akarsuların ezici çoğunluğu kısa boyludur. Bu kuralın en büyük istisnası, Sierra Maestra eteklerinden doğup batıya doğru tektonik bir oluk boyunca 370 kilometre akarak Guacanayabo Körfezi'ne dökülen Cauto Nehri'dir. Doğu dağlarının gür ormanlarından doğan Toa Nehri ise bozulmamış havzasıyla ülkenin debisi en yüksek akarsuyudur. Batıdaki karstik alanlarda sular yer altına çekilerek mağara nehirleri oluştururken, güney kıyısındaki Zapata Yarımadası Karayipler'in en geniş sulak alan ve bataklık ekosistemini barındırır.",
    after:
      "Küba'nın ince ve uzun ada biçimi, suların hızla kuzey ya da güney kıyılarına ulaşmasına neden olduğu için akarsuların ezici çoğunluğu kısa boyludur. Bu kuralın en büyük istisnası, Sierra Maestra eteklerinden doğup batıya doğru tektonik bir oluk boyunca 370 kilometre akarak Guacanayabo Körfezi'ne dökülen Cauto Nehri'dir. Doğu dağlarının gür ormanlarından doğan Toa Nehri ise bozulmamış havzasıyla ülkenin debisi en yüksek akarsuyudur. Batıdaki karstik alanlarda sular yer altına çekilerek mağara nehirleri oluştururken, güney kıyısındaki Zapata Yarımadası Karayipler'in en geniş sulak alan ve bataklık ekosistemini barındırır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'DM',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Kuzey-güney doğrultusunda uzanan sarp volkanik omurga üzerinde iki büyük masif yükselir: 1.447 metreyle adanın zirvesi olan Morne Diablotins ve UNESCO Dünya Mirası Listesi'ndeki 1.342 metrelik Morne Trois Pitons.\n\nMorne Trois Pitons Ulusal Parkı içinde yer alan Desolation Vadisi (Umutsuzluk Vadisi), kaynayan çamur göletleri, kükürt bacaları ve fümarollerle aktif bir volkanik cehennem manzarası sunar. Bu vadideki batık bir fümarol kraterinde oluşan Kaynayan Göl (Boiling Lake), yaklaşık 60 metre çapındaki sürekli fokurdayan gri-mavi sularıyla Yeni Zelanda'daki Frying Pan Gölü'nün ardından dünyanın ikinci en büyük termal gölüdür.",
    after:
      "Kuzey-güney doğrultusunda uzanan sarp volkanik omurga üzerinde iki büyük masif yükselir: 1.447 metreyle adanın zirvesi olan Morne Diablotins ve UNESCO Dünya Mirası Listesi'ndeki 1.342 metrelik Morne Trois Pitons.\n\nMorne Trois Pitons Ulusal Parkı içinde yer alan Desolation Vadisi (Umutsuzluk Vadisi), kaynayan çamur göletleri, kükürt bacaları ve gaz çıkışlarıyla (fümarol) aktif bir volkanik cehennem manzarası sunar. Bu vadideki batık bir fümarol kraterinde oluşan Kaynayan Göl, yaklaşık 60 metre çapındaki sürekli fokurdayan gri-mavi sularıyla Yeni Zelanda'daki Frying Pan Gölü'nün ardından dünyanın ikinci en büyük termal gölüdür.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'DM',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Dominika, Küçük Antiller'in en yüksek yağış miktarına sahip coğrafyasıdır. Atlas Okyanusu'ndan nem taşıyan kuzeydoğu alizeleri dik dağ yamaçlarına çarparak muazzam bir orografik yükselime yol açar; bu mekanizma iç kesimlerdeki dağ sırtlarında yıllık yağış miktarını 7.000 ila 9.000 milimetre gibi olağanüstü düzeylere ulaştırır. Buna karşılık dağların rüzgar gölgesinde kalan batı Karayip kıyısı belirgin biçimde daha az yağış alır. Aşırı yağışlar ve sarp eğimler, kasırga mevsiminde adayı toprak kaymaları ve sel felaketlerine karşı son derece savunmasız kılar.",
    after:
      "Dominika, Küçük Antiller'in en yüksek yağış miktarına sahip coğrafyasıdır. Atlas Okyanusu'ndan nem taşıyan kuzeydoğu alizeleri dik dağ yamaçlarına çarparak havanın yamaç boyunca muazzam ölçüde yükselmesine yol açar; bu durum iç kesimlerdeki dağ sırtlarında yıllık yağış miktarını 7.000 ila 9.000 milimetre gibi olağanüstü düzeylere ulaştırır. Buna karşılık dağların rüzgar gölgesinde kalan batı Karayip kıyısı belirgin biçimde daha az yağış alır. Aşırı yağışlar ve sarp eğimler, kasırga mevsiminde adayı toprak kaymaları ve sel felaketlerine karşı son derece savunmasız kılar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'DO',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Dominik Cumhuriyeti, Büyük Antiller'in ikinci büyük adası Hispaniola'nın doğudaki üçte ikilik kesimini kaplar ve batı komşusu Haiti ile paylaştığı hat, Karayip ada devletleri arasındaki tek kara sınırıdır. Kuzeyinde Atlas Okyanusu, güneyinde ise Karayip Denizi yer alır. Ülke, Karayipler'in en yüksek dağ zirvelerinden deniz seviyesinin altındaki tektonik tuz göllerine ve bereketli alüvyal vadilere kadar uzanan olağanüstü bir morfolojik çeşitliliğe sahiptir.",
    after:
      "Dominik Cumhuriyeti, Büyük Antiller'in ikinci büyük adası Hispaniola'nın doğudaki üçte ikilik kesimini kaplar ve batı komşusu Haiti ile paylaştığı hat, Karayip ada devletleri arasındaki tek kara sınırıdır. Kuzeyinde Atlas Okyanusu, güneyinde ise Karayip Denizi yer alır. Ülke, Karayipler'in en yüksek dağ zirvelerinden deniz seviyesinin altındaki tektonik tuz göllerine ve bereketli alüvyal vadilere kadar uzanan olağanüstü bir yer şekli çeşitliliğine sahiptir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'DO',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Dağ sıralarının uzanışı ve yükselti basamakları, ülkede birbirine komşu zıt mikroklimatik alanlar yaratmıştır. Kuzeydoğu alizelerinin doğrudan ulaştığı Samaná Yarımadası ve Cordillera Septentrional yamaçları yılda 2.000 milimetreyi aşan yağışlarla tropikal nemli ormanlarla kaplıdır. Buna karşılık Cordillera Central'ın rüzgar gölgesinde kalan güneybatı ovaları ve Enriquillo havzası, yılda 500 milimetrenin altına inen yağış miktarıyla kaktüslü kurak step iklimi sergiler. Yüksek dağ platolarında ise kış aylarında don olaylarının görüldüğü serin bir yayla iklimi yaşanır.",
    after:
      "Dağ sıralarının uzanışı ve yükselti basamakları, ülkede birbirine komşu ama birbirine zıt yerel iklimler yaratmıştır. Kuzeydoğu alizelerinin doğrudan ulaştığı Samaná Yarımadası ve Cordillera Septentrional yamaçları yılda 2.000 milimetreyi aşan yağışlarla tropikal nemli ormanlarla kaplıdır. Buna karşılık Cordillera Central'ın rüzgar gölgesinde kalan güneybatı ovaları ve Enriquillo havzası, yılda 500 milimetrenin altına inen yağış miktarıyla kaktüslü kurak step iklimi sergiler. Yüksek dağ platolarında ise kış aylarında don olaylarının görüldüğü serin bir yayla iklimi yaşanır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'DO',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Cordillera Central masifi, Hispaniola adasının ana su kulesidir ve ülkenin başlıca üç büyük nehir sistemini besler: Kuzeybatıya akıp Monte Cristi Körfezi'ne dökülen Yaque del Norte, doğuya doğru Cibao Ovası'nı baştan başa sulayarak Samaná Körfezi'ne ulaşan Yuna Nehri ve güney ovalarından Karayip Denizi'ne inen Yaque del Sur. Dağ nehirleri üzerine kurulan barajlar hem tarımsal sulamayı güvenceye alır hem de elektrik üretir. Güneybatıdaki Enriquillo Gölü ise denize çıkışı olmayan kapalı havzasıyla Amerikan timsahları ve flamingolar için benzersiz bir hipersalin sulak alan barındırır.",
    after:
      "Cordillera Central masifi, Hispaniola adasının ana su kulesidir ve ülkenin başlıca üç büyük nehir sistemini besler: Kuzeybatıya akıp Monte Cristi Körfezi'ne dökülen Yaque del Norte, doğuya doğru Cibao Ovası'nı baştan başa sulayarak Samaná Körfezi'ne ulaşan Yuna Nehri ve güney ovalarından Karayip Denizi'ne inen Yaque del Sur. Dağ nehirleri üzerine kurulan barajlar hem tarımsal sulamayı güvenceye alır hem de elektrik üretir. Güneybatıdaki Enriquillo Gölü ise denize çıkışı olmayan kapalı havzasıyla Amerikan timsahları ve flamingolar için benzersiz, aşırı tuzlu bir sulak alan barındırır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GD',
    property: 'governmentFormTr',
    column: 'government_form_tr',
    kind: 'scalar',
    before: 'Parlamenter monarşi (Commonwealth realm)',
    after: 'Parlamenter monarşi (İngiliz Milletler Topluluğu krallığı)',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GD',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Kuzeydoğu alizelerinin serinlettiği tropikal denizel iklimde haziran-aralık dönemi yağışlı, ocak-mayıs dönemi ise daha kurak geçer. Orografik yükselmenin etkisiyle merkezi ormanlık dağ yamaçları yılda 4.000 milimetreyi aşan bol yağış alarak baharat plantasyonlarının ihtiyaç duyduğu nemi sağlarken, kıyı ovalarında bu miktar 1.500 milimetreye kadar iner. Geleneksel olarak kasırga kuşağının güney sınırında yer alıp güvenli kabul edilen ada, 2004 yılındaki Kategori 3 Ivan Kasırgası ile doğrudan vurulmuş; fırtına ada tarımını ve muskat ağacı varlığını uzun yıllar sekteye uğratmıştır.',
    after:
      'Kuzeydoğu alizelerinin serinlettiği tropikal denizel iklimde haziran-aralık dönemi yağışlı, ocak-mayıs dönemi ise daha kurak geçer. Nemli havanın dağlara tırmanmasıyla merkezi ormanlık dağ yamaçları yılda 4.000 milimetreyi aşan bol yağış alarak baharat plantasyonlarının ihtiyaç duyduğu nemi sağlarken, kıyı ovalarında bu miktar 1.500 milimetreye kadar iner. Geleneksel olarak kasırga kuşağının güney sınırında yer alıp güvenli kabul edilen ada, 2004 yılındaki Kategori 3 Ivan Kasırgası ile doğrudan vurulmuş; fırtına ada tarımını ve muskat ağacı varlığını uzun yıllar sekteye uğratmıştır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GD',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Yoğun yağışlar ve sarp volkanik eğim, Grenada anakarasında merkezi dağ masifinden her yöne radyal düzende inen gür bir akarsu şebekesi oluşturmuştur. Bu kısa ve dik debili dağ dereleri, Annandale ve Concord şelaleleri gibi çağlayanlar üzerinden basamaklar halinde kıyıya iner. Adanın kentsel içme suyu şebekesi büyük ölçüde Grand Etang yağmur ormanı havzasındaki bu kaynaklardan beslenir. Buna karşılık kuzeydeki alçak kireçtaşı adaları Carriacou ve Petite Martinique'te sürekli yüzey akışı bulunmaz; su ihtiyacı sarnıçlar ve desalinasyonla çözülür.",
    after:
      "Yoğun yağışlar ve sarp volkanik eğim, Grenada anakarasında merkezi dağ masifinden her yöne yayılarak inen gür bir akarsu şebekesi oluşturmuştur. Bu kısa ve dik debili dağ dereleri, Annandale ve Concord şelaleleri gibi çağlayanlar üzerinden basamaklar halinde kıyıya iner. Adanın kentsel içme suyu şebekesi büyük ölçüde Grand Etang yağmur ormanı havzasındaki bu kaynaklardan beslenir. Buna karşılık kuzeydeki alçak kireçtaşı adaları Carriacou ve Petite Martinique'te sürekli yüzey akışı bulunmaz; su ihtiyacı sarnıçlar ve deniz suyu arıtmasıyla çözülür.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'HT',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ülke arazisi, Karayip ile Kuzey Amerika levhalarının sınırındaki doğrultu atımlı aktif fay hatları boyunca parçalanmış son derece sarp bir jeomorfolojiye sahiptir. Güneydeki Tiburon Yarımadası boyunca uzanan Massif de la Selle üzerindeki 2.680 metrelik Pic la Selle, Haiti'nin en yüksek zirvesidir. Kuzeyde Massif du Nord dağları yükselirken, bu sıradağlar arasında tektonik kökenli Cul-de-Sac Çöküntüsü ve verimli Artibonite Ovası yer alır.\n\nEnriquillo-Plantain Garden fay sistemi, ülke tarihinin en yıkıcı depremlerine sahne olmuştur. Dağlık yamaçlardaki aşırı ormansızlaşma, çıplak kalan dik arazide şiddetli toprak erozyonuna ve derin karstik yarıntılara yol açmıştır.",
    after:
      "Ülke arazisi, Karayip ile Kuzey Amerika levhalarının sınırındaki yatay yönde kayan (doğrultu atımlı) aktif fay hatları boyunca parçalanmış son derece sarp bir araziye sahiptir. Güneydeki Tiburon Yarımadası boyunca uzanan Massif de la Selle üzerindeki 2.680 metrelik Pic la Selle, Haiti'nin en yüksek zirvesidir. Kuzeyde Massif du Nord dağları yükselirken, bu sıradağlar arasında tektonik kökenli Cul-de-Sac Çöküntüsü ve verimli Artibonite Ovası yer alır.\n\nEnriquillo-Plantain Garden fay sistemi, ülke tarihinin en yıkıcı depremlerine sahne olmuştur. Dağlık yamaçlardaki aşırı ormansızlaşma, çıplak kalan dik arazide şiddetli toprak erozyonuna ve derin karstik yarıntılara yol açmıştır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'HT',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Topografik engellerin rüzgar yönüne göre farklılaşması, tropikal iklim içinde keskin yağış tezatları doğurmuştur. Kuzeydoğu alizelerine bakan kuzey kıyıları ve yüksek dağ yamaçları yılda 1.500 ila 2.000 milimetre yağış alırken, dağ sıralarının rüzgar gölgesinde kalan Cul-de-Sac çöküntüsü gibi iç havzalarda yıllık yağış 600 milimetrenin altına düşerek yarı kurak bir ortama dönüşür. Karayip kasırga koridorunda yer alan ülkede orman örtüsünün tahrip edilmiş olması, şiddetli fırtınalarda ani taşkınlara, çamur sellerine ve kitlesel toprak kaymalarına neden olarak doğal riskleri ağırlaştırır.',
    after:
      'Dağların rüzgar yönüne göre farklı konumlanması, tropikal iklim içinde keskin yağış tezatları doğurmuştur. Kuzeydoğu alizelerine bakan kuzey kıyıları ve yüksek dağ yamaçları yılda 1.500 ila 2.000 milimetre yağış alırken, dağ sıralarının rüzgar gölgesinde kalan Cul-de-Sac çöküntüsü gibi iç havzalarda yıllık yağış 600 milimetrenin altına düşerek yarı kurak bir ortama dönüşür. Karayip kasırga koridorunda yer alan ülkede orman örtüsünün tahrip edilmiş olması, şiddetli fırtınalarda ani taşkınlara, çamur sellerine ve kitlesel toprak kaymalarına neden olarak doğal riskleri ağırlaştırır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'JM',
    property: 'governmentFormTr',
    column: 'government_form_tr',
    kind: 'scalar',
    before: 'Parlamenter monarşi (Commonwealth realm)',
    after: 'Parlamenter monarşi (İngiliz Milletler Topluluğu krallığı)',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'JM',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      'Jamaika, Büyük Antiller yayında Küba ve Hispaniola\'nın güneybatısında tek başına uzanan, Karayipler\'in yüzölçümü bakımından üçüncü büyük ada devletidir. Yerli dilinde "ağaç ve su ülkesi" anlamına gelen Xaymaca kökünden türeyen adıyla uyumlu olarak, sarp dağları, ormanlarla örtülü kireçtaşı platoları ve kıyı ovalarıyla çevrilidir. Adanın jeolojik yapısı, dünyanın en zengin boksit madeni yataklarından birine ev sahipliği yapar; düzlükler ve verimli kıyı şeritleri ise tarihsel şeker kamışı plantasyonlarının merkezidir.',
    after:
      'Jamaika, Büyük Antiller yayında Küba ve Hispaniola\'nın güneybatısında tek başına uzanan, Karayipler\'in yüzölçümü bakımından üçüncü büyük adası olan bir ada devletidir. Yerli dilinde "ağaç ve su ülkesi" anlamına gelen Xaymaca kökünden türeyen adıyla uyumlu olarak, sarp dağları, ormanlarla örtülü kireçtaşı platoları ve kıyı ovalarıyla çevrilidir. Adanın jeolojik yapısı, dünyanın en zengin boksit madeni yataklarından birine ev sahipliği yapar; düzlükler ve verimli kıyı şeritleri ise tarihsel şeker kamışı plantasyonlarının merkezidir.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'JM',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      'Adanın doğu kesimini sarp kristalen kayaçlardan oluşan ve 2.256 metre yüksekliğindeki Blue Mountain Peak ile ülkenin en yüksek noktasını barındıran Mavi Dağlar (Blue Mountains) kaplar. Orta ve batı kesimlerde ise kalın beyaz kireçtaşı katmanlarının oluşturduğu geniş bir plato uzanır.\n\nBu platonun merkezinde yer alan Cockpit Country, huni biçimli yüzlerce kireçtaşı çukuru (dolin) ve dik koni tepeciklerin birbirini izlediği, dünyadaki en görkemli tropikal kule ve koni karst arazilerinden biridir. Yarıklarla dolu bu geçit vermez topoğrafya, sömürge döneminde kaçak köle topluluklarının (Maroonlar) kurduğu bağımsız yerleşimlere doğal bir kale koruması sağlamıştır.',
    after:
      'Adanın doğu kesimini sarp kristalen kayaçlardan oluşan ve 2.256 metre yüksekliğindeki Blue Mountain Peak ile ülkenin en yüksek noktasını barındıran Mavi Dağlar kaplar. Orta ve batı kesimlerde ise kalın beyaz kireçtaşı katmanlarının oluşturduğu geniş bir plato uzanır.\n\nBu platonun merkezinde yer alan Cockpit Country, huni biçimli yüzlerce kireçtaşı çukuru (dolin) ve dik koni tepeciklerin birbirini izlediği, dünyadaki en görkemli tropikal kule ve koni karst arazilerinden biridir. Yarıklarla dolu bu geçit vermez topoğrafya, sömürge döneminde kaçak köle topluluklarının (Maroonlar) kurduğu bağımsız yerleşimlere doğal bir kale koruması sağlamıştır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'JM',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Ülkede kuzeydoğu alizelerinin yönlendirdiği tropikal deniz iklimi egemendir; kıyı ovaları yıl boyu sıcak ve nemli kalırken, Mavi Dağlar'ın doruklarında serin bir yayla iklimi hüküm sürer. Alizelerin çarptığı Mavi Dağlar'ın kuzey yamaçları yılda 5.000 milimetreyi aşan yağış alarak dağları saran yoğun bir sis kuşağı yaratır; dünyaca ünlü Blue Mountain kahvesi bu serin ve nemli mikroklimada yetişir. Dağların gerisinde kalan güney kıyıları ise belirgin biçimde daha kuraktır. Karayip kasırga kuşağının merkezindeki ada, özellikle 1988'deki Gilbert gibi süper kasırgaların hedefi olmuştur.",
    after:
      "Ülkede kuzeydoğu alizelerinin yönlendirdiği tropikal deniz iklimi egemendir; kıyı ovaları yıl boyu sıcak ve nemli kalırken, Mavi Dağlar'ın doruklarında serin bir yayla iklimi hüküm sürer. Alizelerin çarptığı Mavi Dağlar'ın kuzey yamaçları yılda 5.000 milimetreyi aşan yağış alarak dağları saran yoğun bir sis kuşağı yaratır; dünyaca ünlü Blue Mountain kahvesi bu serin ve nemli iklimde yetişir. Dağların gerisinde kalan güney kıyıları ise belirgin biçimde daha kuraktır. Karayip kasırga kuşağının merkezindeki ada, özellikle 1988'deki Gilbert gibi süper kasırgaların hedefi olmuştur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'JM',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Cockpit Country ve orta kireçtaşı platosunda yüzeye düşen yağmur suları gözenekli kayalardan hızla yeraltına sızarak uçsuz bucaksız mağara nehirleri ve yeraltı galerileri oluşturur; bu nedenle platonun üzerinde belirgin bir nehir ağı gelişmemiştir. Yüzey akışı daha çok geçirimsiz tabakaların bulunduğu vadilerde toplanır: Adanın güneyinde akan 93 kilometrelik Rio Minho en uzun nehirken, batıdaki 53 kilometrelik Black River (Kara Nehir) mangrov bataklıkları ve tatlı su sulak alanlarıyla adanın en geniş iç su ekosistemini oluşturur. Kuzey sahilinde ise basamaklı kireçtaşı taraçalarından doğrudan denize dökülen Dunn's River Şelalesi, adanın karstik hidrolojisinin denize ulaştığı simgesel bir çağlayandır.",
    after:
      "Cockpit Country ve orta kireçtaşı platosunda yüzeye düşen yağmur suları gözenekli kayalardan hızla yeraltına sızarak uçsuz bucaksız mağara nehirleri ve yeraltı galerileri oluşturur; bu nedenle platonun üzerinde belirgin bir nehir ağı gelişmemiştir. Yüzey akışı daha çok geçirimsiz tabakaların bulunduğu vadilerde toplanır: Adanın güneyinde akan 93 kilometrelik Rio Minho en uzun nehirken, batıdaki 53 kilometrelik Black River (Kara Nehir) mangrov bataklıkları ve tatlı su sulak alanlarıyla adanın en geniş iç su ekosistemini oluşturur. Kuzey sahilinde ise basamaklı kireçtaşı taraçalarından doğrudan denize dökülen Dunn's River Şelalesi, adanın kireçtaşı içinden akan sularının denize ulaştığı simgesel bir çağlayandır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'KN',
    property: 'governmentFormTr',
    column: 'government_form_tr',
    kind: 'scalar',
    before: 'Federal parlamenter monarşi (Commonwealth realm)',
    after: 'Federal parlamenter monarşi (İngiliz Milletler Topluluğu krallığı)',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'KN',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Kuzeydoğu alizelerinin egemenliğindeki tropikal denizel iklim, yükselti basamaklarına bağlı olarak keskin yerel farklılıklar gösterir. Kıyı ovalarında yıllık yağış 1.000 ila 1.200 milimetre arasında kalırken, bulut ormanlarıyla kaplı volkanik doruklarda bu miktar 3.000 milimetreyi aşar; buna karşılık Saint Kitts'in güneydoğusundaki alçak yarımada kaktüslerin yetiştiği yarı kurak bir mikroiklime sahiptir. Karayip kasırga kuşağının doğrudan geçiş güzergahında bulunan adalar, yaz sonu ve sonbahar aylarında şiddetli tropikal siklon tehdidi altındadır.",
    after:
      "Kuzeydoğu alizelerinin egemenliğindeki tropikal denizel iklim, yükselti basamaklarına bağlı olarak keskin yerel farklılıklar gösterir. Kıyı ovalarında yıllık yağış 1.000 ila 1.200 milimetre arasında kalırken, bulut ormanlarıyla kaplı volkanik doruklarda bu miktar 3.000 milimetreyi aşar; buna karşılık Saint Kitts'in güneydoğusundaki alçak yarımada kaktüslerin yetiştiği yarı kurak bir yerel iklime sahiptir. Karayip kasırga kuşağının doğrudan geçiş güzergahında bulunan adalar, yaz sonu ve sonbahar aylarında şiddetli tropikal siklon tehdidi altındadır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'LC',
    property: 'governmentFormTr',
    column: 'government_form_tr',
    kind: 'scalar',
    before: 'Parlamenter monarşi (Commonwealth realm)',
    after: 'Parlamenter monarşi (İngiliz Milletler Topluluğu krallığı)',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'LC',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Saint Lucia, Küçük Antiller'in Rüzgarüstü Adaları grubunda, Martinik ile Saint Vincent arasında uzanan ve topoğrafik siluetiyle Karayipler'in en ikonik manzaralarına sahip volkanik bir ada devletidir. Adanın güneybatı sahilinde turkuaz denizden dikey birer duvar gibi yükselen orman kaplı ikiz lav tıkaçları (Pitonlar), ülkenin ulusal simgesidir. İç kesimlerini saran sarp dağ sıraları, bol yağışlı bulut ormanları ve aktif jeotermal vadiler, adaya vahşi ve engebeli bir doğa karakteri kazandırır.",
    after:
      "Saint Lucia, Küçük Antiller'in Rüzgarüstü Adaları grubunda, Martinik ile Saint Vincent arasında uzanan ve dağ siluetiyle Karayipler'in en ikonik manzaralarına sahip volkanik bir ada devletidir. Adanın güneybatı sahilinde turkuaz denizden dikey birer duvar gibi yükselen orman kaplı ikiz lav tıkaçları (Pitonlar), ülkenin ulusal simgesidir. İç kesimlerini saran sarp dağ sıraları, bol yağışlı bulut ormanları ve aktif jeotermal vadiler, adaya vahşi ve engebeli bir doğa karakteri kazandırır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'LC',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Merkezi dağ omurgasından radyal olarak her yöne inen çok sayıda nehir adanın vadilerini aşındırmıştır. Bu akarsuların en uzunu, adanın orta-batı kesimini drene eden Roseau Nehri'dir. Bu nehir üzerinde inşa edilen John Compton Barajı, başkent Castries ve adanın kuzey yerleşimlerinin tatlı su güvencesini oluşturan ana içme suyu rezervuarıdır. Cul de Sac, Roseau ve Fond d'Or gibi alüvyon tabanlı geniş nehir vadileri ise adanın başlıca muz tarımı ve yerleşim alanlarını barındırır.",
    after:
      "Merkezi dağ omurgasından radyal olarak her yöne inen çok sayıda nehir adanın vadilerini aşındırmıştır. Bu akarsuların en uzunu, adanın orta-batı kesiminin sularını toplayan Roseau Nehri'dir. Bu nehir üzerinde inşa edilen John Compton Barajı, başkent Castries ve adanın kuzey yerleşimlerinin tatlı su güvencesini oluşturan ana içme suyu rezervuarıdır. Cul de Sac, Roseau ve Fond d'Or gibi alüvyon tabanlı geniş nehir vadileri ise adanın başlıca muz tarımı ve yerleşim alanlarını barındırır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'VC',
    property: 'governmentFormTr',
    column: 'government_form_tr',
    kind: 'scalar',
    before: 'Parlamenter monarşi (Commonwealth realm)',
    after: 'Parlamenter monarşi (İngiliz Milletler Topluluğu krallığı)',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'VC',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Saint Vincent ve Grenadinler, Windward Adaları'nın güney yayında yer alan büyük anakara Saint Vincent ile bunun güneyinde Grenada'ya doğru uzanan 32 küçük ada ve mercan kayalığından (Grenadinler) oluşan iki parçalı bir ada devletidir. Ülkenin ana karası Saint Vincent, kuzeyinde yükselen son derece aktif bir stratovolkanın şekillendirdiği sarp, yoğun ormanlık ve dağlık bir yapıya sahiptir. Buna karşılık Bequia, Mustique ve Union gibi güneydeki Grenadin adaları ise alçak tepeleri, beyaz kumsalları ve sığ mercan lagünleriyle anakaraya tam bir tezat oluşturur.",
    after:
      "Saint Vincent ve Grenadinler, Windward Adaları'nın güney yayında yer alan büyük anakara Saint Vincent ile bunun güneyinde Grenada'ya doğru uzanan 32 küçük ada ve mercan kayalığından (Grenadinler) oluşan iki parçalı bir ada devletidir. Ülkenin ana karası Saint Vincent, kuzeyinde yükselen son derece aktif bir tabakalı volkanın şekillendirdiği sarp, yoğun ormanlık ve dağlık bir yapıya sahiptir. Buna karşılık Bequia, Mustique ve Union gibi güneydeki Grenadin adaları ise alçak tepeleri, beyaz kumsalları ve sığ mercan lagünleriyle anakaraya tam bir tezat oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'VC',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Ülkede yıl boyunca sıcak ve nemli tropikal denizel koşullar etkilidir. Saint Vincent'ın yüksek volkanik dağları kuzeydoğu alizelerinden muazzam miktarda orografik yağış çekerek yıllık 4.000 milimetrenin üzerine çıkarken, güneydeki basık Grenadin adaları yılda 1.000 milimetre civarında yağışla kurak çalı ve kuru orman biyomuna bürünür. Karayip kasırga koridorunda bulunan ülke, hem tropik fırtına ve kasırgaların hem de La Soufrière'in havaya savurduğu piroklastik kül bulutlarının çifte doğal afet riskini taşır.",
    after:
      "Ülkede yıl boyunca sıcak ve nemli tropikal denizel koşullar etkilidir. Saint Vincent'ın yüksek volkanik dağları kuzeydoğu alizelerinden muazzam miktarda yamaç yağışı alarak yıllık 4.000 milimetrenin üzerine çıkarken, güneydeki basık Grenadin adaları yılda 1.000 milimetre civarında yağışla kurak çalılık ve kuru ormanlarla kaplanır. Karayip kasırga koridorunda bulunan ülke, hem tropik fırtına ve kasırgaların hem de La Soufrière'in havaya savurduğu kızgın kül bulutlarının çifte doğal afet riskini taşır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'VC',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      'Saint Vincent anakarasında merkezi sırttan doğup derin vadiler boyunca kıyıya hızla ulaşan çok sayıda gür debili dağ deresi akar; volkanik aşınma sebebiyle adanın batı kıyısındaki plajlar karakteristik siyah bazalt kumlarıyla kaplıdır. Buna karşılık küçük ve alçak Grenadin adalarında kalıcı akarsu bulunmaz; bu adalarda tatlı su ihtiyacı tamamen yağmur suyu sarnıçları, yerel desalinasyon üniteleri ve anakaradan gemilerle taşınan sularla karşılanır.',
    after:
      'Saint Vincent anakarasında merkezi sırttan doğup derin vadiler boyunca kıyıya hızla ulaşan çok sayıda gür debili dağ deresi akar; volkanik aşınma sebebiyle adanın batı kıyısındaki plajlar karakteristik siyah bazalt kumlarıyla kaplıdır. Buna karşılık küçük ve alçak Grenadin adalarında kalıcı akarsu bulunmaz; bu adalarda tatlı su ihtiyacı tamamen yağmur suyu sarnıçları, yerel deniz suyu arıtma üniteleri ve anakaradan gemilerle taşınan sularla karşılanır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TT',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Trinidad ve Tobago, Karayipler'in en güney ucunda, Venezuela'nın Orinoco Deltası'na yalnızca 11 kilometre mesafede yer alan iki adalı bir devlettir. Bölgedeki diğer ada ülkelerinden farklı olarak volkanik yay sistemine değil, doğrudan Güney Amerika kıtasal kalkanına ve şelfine aittir. Bu kıtasal jeoloji, ülkeye zengin petrol, doğal gaz ve doğal asfalt yatakları kazandırmış; bitki ve hayvan varlığını da Antil adalarından ziyade Amazon ve Orinoco havzalarıyla akraba kılmıştır. Nüfusun ve sanayinin ezici çoğunluğu büyük ada Trinidad'da toplanmıştır.",
    after:
      "Trinidad ve Tobago, Karayipler'in en güney ucunda, Venezuela'nın Orinoco Deltası'na yalnızca 11 kilometre mesafede yer alan iki adalı bir devlettir. Bölgedeki diğer ada ülkelerinden farklı olarak volkanik yay sistemine değil, doğrudan Güney Amerika kıtasal kalkanına ve kıta sahanlığına aittir. Bu kıtasal jeoloji, ülkeye zengin petrol, doğal gaz ve doğal asfalt yatakları kazandırmış; bitki ve hayvan varlığını da Antil adalarından ziyade Amazon ve Orinoco havzalarıyla akraba kılmıştır. Nüfusun ve sanayinin ezici çoğunluğu büyük ada Trinidad'da toplanmıştır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TT',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Trinidad'ın kuzey kıyısı boyunca uzanan Kuzey Sıradağları (Northern Range), jeolojik olarak Venezuela Kıyı Andları'nın doğrudan deniz aşırı uzantısıdır; bu sıradağ üzerinde yükselen 940 metrelik El Cerro del Aripo ülkenin en yüksek zirvesidir. Adanın orta ve güney kesimleri ise dalgalı ovalar ve alçak petrol havzalarıyla kaplıdır.\n\nAdanın güneybatısındaki La Brea kasabasında yer alan Katran Gölü (Pitch Lake), yaklaşık 40 hektarlık alanıyla yeryüzünün en büyük doğal asfalt rezervuarıdır ve derin faylardan sızan petrol hidrokarbonlarının yüzeyde ağırlaşmasıyla oluşmuştur. Kuzeydoğudaki küçük ada Tobago'nun bel kemiğini ise 1776 yılında Batı Yarımküre'nin ilk yasal orman koruma alanı ilan edilen sarp Ana Sıradağ (Main Ridge) oluşturur.",
    after:
      "Trinidad'ın kuzey kıyısı boyunca uzanan Kuzey Sıradağları, jeolojik olarak Venezuela Kıyı Andları'nın doğrudan deniz aşırı uzantısıdır; bu sıradağ üzerinde yükselen 940 metrelik El Cerro del Aripo ülkenin en yüksek zirvesidir. Adanın orta ve güney kesimleri ise dalgalı ovalar ve alçak petrol havzalarıyla kaplıdır.\n\nAdanın güneybatısındaki La Brea kasabasında yer alan Katran Gölü, yaklaşık 40 hektarlık alanıyla yeryüzünün en büyük doğal asfalt rezervuarıdır ve derin faylardan sızan petrol hidrokarbonlarının yüzeyde ağırlaşmasıyla oluşmuştur. Kuzeydoğudaki küçük ada Tobago'nun bel kemiğini ise 1776 yılında Batı Yarımküre'nin ilk yasal orman koruma alanı ilan edilen sarp Ana Sıradağ oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TT',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Kıtasal şelf kökeni sayesinde Trinidad, Karayip adaları içinde en olgun ve geniş nehir ağlarına sahiptir. Kuzey Sıradağları eteklerinden doğup batıdaki Paria Körfezi'ne akan Caroni Nehri, başkentin güneyinde devasa Caroni Bataklığı mangrov ekosistemini besler; bu sulak alan ülkenin ulusal simgesi olan kızıl ibisin (Scarlet Ibis) dünyadaki en önemli tünekleme sahasıdır. Doğu sahiline dökülen 50 kilometrelik Ortoire Nehri ise adanın en uzun su yoludur. Dağlık Tobago adasında ise daha kısa, hızlı akan temiz dereler ve çağlayanlar baskındır.",
    after:
      "Kıta sahanlığı kökeni sayesinde Trinidad, Karayip adaları içinde en olgun ve geniş nehir ağlarına sahiptir. Kuzey Sıradağları eteklerinden doğup batıdaki Paria Körfezi'ne akan Caroni Nehri, başkentin güneyinde devasa Caroni Bataklığı mangrov ekosistemini besler; bu sulak alan ülkenin ulusal simgesi olan kızıl ibisin dünyadaki en önemli tünekleme sahasıdır. Doğu sahiline dökülen 50 kilometrelik Ortoire Nehri ise adanın en uzun su yoludur. Dağlık Tobago adasında ise daha kısa, hızlı akan temiz dereler ve çağlayanlar baskındır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AR',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Ülkenin en önemli hidrolojik arteri, Brezilya'dan doğup güneye inen ve yaklaşık 4.880 kilometre uzunluğa sahip olan Paraná Nehri'dir. Paraná, Uruguay Nehri ile birleşerek Atlas Okyanusu'na açılan devasa huni biçimli Río de la Plata halicini oluşturur; bu havza Arjantin'in tahıl ve sanayi taşımacılığının can damarıdır.\n\nKuzeydeki Gran Chaco düzlüklerinden geçen Pilcomayo ve Bermejo nehirleri, And eteklerinden topladıkları bol killi tortuyu Paraná sistemine aktarır. Orta kesimde ise Arjantin'in en büyük doğal gölü olan devasa tuzlu bataklık lagünü Mar Chiquita (Ansenuza) kapalı bir havza oluşturur.\n\nPatagonya boyunca uzanan Colorado, Negro ve Santa Cruz nehirleri, And Dağları'ndaki buzul erimeleri ve dağ gölleriyle beslenerek kurak platoları aşar ve Atlas Okyanusu'na dökülür; bu kesimdeki Nahuel Huapi, Argentino ve Viedma gibi göller kıtanın en büyük buzul tatlı su rezervleridir.",
    after:
      "Ülkenin en önemli akarsuyu, Brezilya'dan doğup güneye inen ve yaklaşık 4.880 kilometre uzunluğa sahip olan Paraná Nehri'dir. Paraná, Uruguay Nehri ile birleşerek Atlas Okyanusu'na açılan devasa huni biçimli Río de la Plata halicini oluşturur; bu havza Arjantin'in tahıl ve sanayi taşımacılığının can damarıdır.\n\nKuzeydeki Gran Chaco düzlüklerinden geçen Pilcomayo ve Bermejo nehirleri, And eteklerinden topladıkları bol killi tortuyu Paraná sistemine aktarır. Orta kesimde ise Arjantin'in en büyük doğal gölü olan devasa tuzlu bataklık lagünü Mar Chiquita (Ansenuza) kapalı bir havza oluşturur.\n\nPatagonya boyunca uzanan Colorado, Negro ve Santa Cruz nehirleri, And Dağları'ndaki buzul erimeleri ve dağ gölleriyle beslenerek kurak platoları aşar ve Atlas Okyanusu'na dökülür; bu kesimdeki Nahuel Huapi, Argentino ve Viedma gibi göller kıtanın en büyük buzul tatlı su rezervleridir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BO',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Güney Amerika'nın kalbinde yer alan Bolivya, Paraguay ile birlikte kıtanın denize doğrudan çıkışı bulunmayan iki ülkesinden biridir. Ülke, batıda 4.000 metre rakımlı And zirvelerinden doğuda Amazon ve Paraguay havzalarının tropikal alçak düzlüklerine hızla alçalan baş döndürücü bir topoğrafik eğime sahiptir.\n\nNüfus ve idari merkezler tarih boyunca batıdaki yüksek dağ platoları ve vadi oluklarında yoğunlaşmış olsa da, doğudaki ovalar tarım, hayvancılık ve doğal gaz zenginliğiyle ülkenin ekonomik ağırlık merkezini giderek kendi tarafına çekmektedir.",
    after:
      "Güney Amerika'nın kalbinde yer alan Bolivya, Paraguay ile birlikte kıtanın denize doğrudan çıkışı bulunmayan iki ülkesinden biridir. Ülke, batıda 4.000 metre rakımlı And zirvelerinden doğuda Amazon ve Paraguay havzalarının tropikal alçak düzlüklerine hızla alçalan baş döndürücü bir arazi eğimine sahiptir.\n\nNüfus ve idari merkezler tarih boyunca batıdaki yüksek dağ platoları ve vadi oluklarında yoğunlaşmış olsa da, doğudaki ovalar tarım, hayvancılık ve doğal gaz zenginliğiyle ülkenin ekonomik ağırlık merkezini giderek kendi tarafına çekmektedir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BO',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Bolivya hidrolojik olarak üç ana drenaj havzasına ayrılır. Altiplano üzerindeki kapalı havzanın merkezinde, Peru ile paylaşılan 3.812 metre rakımlı Titicaca Gölü yer alır; dünyanın ticari seyrüsefere elverişli en yüksek gölü olan bu su kütlesinin yaklaşık %40'ı Bolivya sınırları içindedir. Gölün suları Desaguadero Nehri ile güneydeki sığ Poopó Gölü'ne akar; aşırı buharlaşma ve su çekilmesi nedeniyle Poopó Gölü periyodik olarak tamamen kuruma noktasına gelmektedir.\n\nÜlke topraklarının üçte ikisini toplayan Amazon havzası, Mamoré ve Beni gibi dev akarsularla And Dağları'nın sularını kuzeye taşır; bu nehirler Brezilya sınırında birleşerek Amazon'un en büyük kollarından Madeira Nehri'ni meydana getirir.\n\nGüneydoğu kesimindeki Gran Chaco suları ise Pilcomayo ve Bermejo nehirleri aracılığıyla güneye yönelerek Río de la Plata sistemine katılır.",
    after:
      "Bolivya'nın suları üç ana havzaya ayrılır. Altiplano üzerindeki kapalı havzanın merkezinde, Peru ile paylaşılan 3.812 metre rakımlı Titicaca Gölü yer alır; dünyanın ticari seyrüsefere elverişli en yüksek gölü olan bu su kütlesinin yaklaşık %40'ı Bolivya sınırları içindedir. Gölün suları Desaguadero Nehri ile güneydeki sığ Poopó Gölü'ne akar; aşırı buharlaşma ve su çekilmesi nedeniyle Poopó Gölü periyodik olarak tamamen kuruma noktasına gelmektedir.\n\nÜlke topraklarının üçte ikisini toplayan Amazon havzası, Mamoré ve Beni gibi dev akarsularla And Dağları'nın sularını kuzeye taşır; bu nehirler Brezilya sınırında birleşerek Amazon'un en büyük kollarından Madeira Nehri'ni meydana getirir.\n\nGüneydoğu kesimindeki Gran Chaco suları ise Pilcomayo ve Bermejo nehirleri aracılığıyla güneye yönelerek Río de la Plata sistemine katılır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BR',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Geniş yüzölçümü ve topoğrafik çeşitlilik Brezilya'da beş ana iklim kuşağı oluşturur. Amazon Havzası'nda sıcaklığın yıl boyu 25-28 derecede kaldığı, bol yağışlı ve yüksek nemli ekvatoral iklim hakimdir.\n\nMerkezdeki Brezilya Yaylası ve Cerrado sahasında, yazları bol yağışlı kışları ise belirgin kurak geçen tropikal yükseklik iklimi görülür. Kuzeydoğunun iç kesimlerinde Sertão olarak bilinen yarı kurak bölgede, yağışların hem az hem de yıllara göre düzensiz düştüğü şiddetli kuraklık döngüleri yaşanır.\n\nOğlak Dönencesi'nin güneyinde kalan Paraná ve Santa Catarina gibi güney eyaletlerinde ise dört mevsimin belirginleştiği, kış aylarında yüksek kesimlere don ve ender kar düşebilen ılıman subtropikal iklim etkilidir.",
    after:
      "Geniş yüzölçümü ve yer şekli çeşitliliği Brezilya'da beş ana iklim kuşağı oluşturur. Amazon Havzası'nda sıcaklığın yıl boyu 25-28 derecede kaldığı, bol yağışlı ve yüksek nemli ekvatoral iklim hakimdir.\n\nMerkezdeki Brezilya Yaylası ve Cerrado sahasında, yazları bol yağışlı kışları ise belirgin kurak geçen tropikal yükseklik iklimi görülür. Kuzeydoğunun iç kesimlerinde Sertão olarak bilinen yarı kurak bölgede, yağışların hem az hem de yıllara göre düzensiz düştüğü şiddetli kuraklık döngüleri yaşanır.\n\nOğlak Dönencesi'nin güneyinde kalan Paraná ve Santa Catarina gibi güney eyaletlerinde ise dört mevsimin belirginleştiği, kış aylarında yüksek kesimlere don ve ender kar düşebilen ılıman subtropikal iklim etkilidir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CL',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Güney Amerika'nın güneybatı kıyısı boyunca kuzeyden güneye yaklaşık 4.300 kilometre boyunca uzanan Şili, buna karşılık ortalama yalnızca 175-180 kilometre genişliğiyle yeryüzünün en sıra dışı şerit geometrisine sahip ülkesidir. Doğuda And Dağları'nın yüksek duvarıyla Arjantin ve Bolivya'dan ayrılırken, batıda Büyük Okyanus'a boylu boyunca cephe verir.\n\nÜlke, 38 derecelik enlem farkı boyunca gezegenin en kurak çölünden ılıman Akdeniz vadilerine, fırtınalı yağmur ormanlarından fiyortlar ve dev buzullarla parçalanmış subantarktik takımadalara kadar kesintisiz bir coğrafi tezatlar zinciridir.",
    after:
      "Güney Amerika'nın güneybatı kıyısı boyunca kuzeyden güneye yaklaşık 4.300 kilometre boyunca uzanan Şili, buna karşılık ortalama yalnızca 175-180 kilometre genişliğiyle yeryüzünün en sıra dışı şerit biçimli ülkesidir. Doğuda And Dağları'nın yüksek duvarıyla Arjantin ve Bolivya'dan ayrılırken, batıda Büyük Okyanus'a boylu boyunca cephe verir.\n\nÜlke, 38 derecelik enlem farkı boyunca gezegenin en kurak çölünden ılıman Akdeniz vadilerine, fırtınalı yağmur ormanlarından fiyortlar ve dev buzullarla parçalanmış subantarktik takımadalara kadar kesintisiz bir coğrafi tezatlar zinciridir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CL',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Şili morfolojisi, kuzeyden güneye paralel uzanan üç ana yapısal şerit üzerinde gelişmiştir: Doğuda kıtanın çatısını kuran And Dağları, batıda kıyı boyunca uzanan Kıyı Sıradağları (Cordillera de la Costa) ve iki dağ sistemi arasına sıkışan tektonik çöküntü alanı Orta Vadi (Valle Central).\n\nKuzey kesimde iki dağ sırasının arasına hapsolan Atakama Çölü, kutup dışı yeryüzünün en kurak sahasıdır. And Dağları bu kesimde 6.893 metrelik Ojos del Salado gibi dünyanın en yüksek aktif volkanlarına ev sahipliği yapar.\n\nSantiago'nun yer aldığı yaklaşık 965 kilometrelik Orta Vadi, alüvyon dolgulu verimli topraklarıyla ülke nüfusunun ve tarımsal üretiminin ezici çoğunluğunu barındırır. Puerto Montt'un güneyinde ise Orta Vadi deniz seviyesinin altına gömülür; Kıyı Sıradağları parçalanarak Chiloé dahil binlerce adaya dönüşürken, kıyı kesimi Kuzey ve Güney Patagonya Buz Tarlaları'nın beslediği derin fiyortlarla yarılır.",
    after:
      "Şili'nin yer şekilleri, kuzeyden güneye paralel uzanan üç ana şerit üzerinde gelişmiştir: Doğuda kıtanın çatısını kuran And Dağları, batıda kıyı boyunca uzanan Kıyı Sıradağları (Cordillera de la Costa) ve iki dağ sistemi arasına sıkışan tektonik çöküntü alanı Orta Vadi (Valle Central).\n\nKuzey kesimde iki dağ sırasının arasına hapsolan Atakama Çölü, kutup dışı yeryüzünün en kurak sahasıdır. And Dağları bu kesimde 6.893 metrelik Ojos del Salado gibi dünyanın en yüksek aktif volkanlarına ev sahipliği yapar.\n\nSantiago'nun yer aldığı yaklaşık 965 kilometrelik Orta Vadi, alüvyon dolgulu verimli topraklarıyla ülke nüfusunun ve tarımsal üretiminin ezici çoğunluğunu barındırır. Puerto Montt'un güneyinde ise Orta Vadi deniz seviyesinin altına gömülür; Kıyı Sıradağları parçalanarak Chiloé dahil binlerce adaya dönüşürken, kıyı kesimi Kuzey ve Güney Patagonya Buz Tarlaları'nın beslediği derin fiyortlarla yarılır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CL',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Şili'nin iklim mozaiğini, enlemsel uzanımın yanı sıra kıyı boyunca kuzeye doğru akan soğuk Humboldt Akıntısı ile yarı kalıcı Güney Pasifik yüksek basınç merkezi şekillendirir. Kuzeydeki Atakama Çölü'nde, soğuk deniz suyunun buharlaşmayı engellemesi ve And Dağları'nın doğudan gelen nemi tamamen kesmesi nedeniyle yıllarca tek damla yağış almayan hiper-kurak koşullar hüküm sürer.\n\nOrta Şili'de yazları ılık ve kurak, kışları serin ve yağışlı geçen ideal bir Akdeniz iklimi görülür; bu iklimsel kararlılık bölgeyi küresel bir meyve ve şarap üretim merkezine dönüştürmüştür.\n\nGüneye inildikçe Pasifik'ten esen fırtınalı batı rüzgarlarının etkisiyle iklim soğuk, sert ve aşırı yağışlı bir okyanusal karaktere bürünür; Patagonya fiyortlarında yıllık yağış yer yer 4.000-5.000 milimetreyi aşar.",
    after:
      "Şili'nin iklim mozaiğini, enlemsel uzanımın yanı sıra kıyı boyunca kuzeye doğru akan soğuk Humboldt Akıntısı ile yarı kalıcı Güney Pasifik yüksek basınç merkezi şekillendirir. Kuzeydeki Atakama Çölü'nde, soğuk deniz suyunun buharlaşmayı engellemesi ve And Dağları'nın doğudan gelen nemi tamamen kesmesi nedeniyle yıllarca tek damla yağış almayan aşırı kurak koşullar hüküm sürer.\n\nOrta Şili'de yazları ılık ve kurak, kışları serin ve yağışlı geçen ideal bir Akdeniz iklimi görülür; bu iklimsel kararlılık bölgeyi küresel bir meyve ve şarap üretim merkezine dönüştürmüştür.\n\nGüneye inildikçe Pasifik'ten esen fırtınalı batı rüzgarlarının etkisiyle iklim soğuk, sert ve aşırı yağışlı bir okyanusal karaktere bürünür; Patagonya fiyortlarında yıllık yağış yer yer 4.000-5.000 milimetreyi aşar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CO',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Güney Amerika'nın kuzeybatı köşesinde yer alan Kolombiya, kıtada hem Karayip Denizi'ne hem de Büyük Okyanus'a kıyısı olan tek ülkedir. Ülke, Ekvador sınırından giren And Dağları'nın üçe çatallanarak oluşturduğu sarp kordilyeralar ile doğudaki uçsuz bucaksız ova ve ormanlar arasında çarpıcı bir coğrafi bölünme gösterir.\n\nBu keskin topoğrafik yapı, Kolombiya'yı beş belirgin doğal bölgeye ayırır: And dağlık kuşağı, Karayip kıyı düzlükleri, Pasifik yağmur ormanları, doğudaki Orinoco savanları (Llanos) ve güneydeki Amazon havzası. Nüfusun ve ekonomik üretimin büyük bölümü, elverişli iklim sunan yüksek And vadilerinde yoğunlaşmıştır.",
    after:
      "Güney Amerika'nın kuzeybatı köşesinde yer alan Kolombiya, kıtada hem Karayip Denizi'ne hem de Büyük Okyanus'a kıyısı olan tek ülkedir. Ülke, Ekvador sınırından giren And Dağları'nın üçe çatallanarak oluşturduğu sarp kordilyeralar ile doğudaki uçsuz bucaksız ova ve ormanlar arasında çarpıcı bir coğrafi bölünme gösterir.\n\nBu keskin yer şekli yapısı, Kolombiya'yı beş belirgin doğal bölgeye ayırır: And dağlık kuşağı, Karayip kıyı düzlükleri, Pasifik yağmur ormanları, doğudaki Orinoco savanları (Llanos) ve güneydeki Amazon havzası. Nüfusun ve ekonomik üretimin büyük bölümü, elverişli iklim sunan yüksek And vadilerinde yoğunlaşmıştır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'EC',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "And Dağları, Ekvador topraklarında birbirine paralel uzanan Doğu ve Batı Kordilyera olarak ikiye ayrılır. Bu iki sırtın arasında uzanan yüksek vadi oluğu, onlarca dev volkan konisiyle çevrili olduğu için Alman doğa bilimci Alexander von Humboldt tarafından \"Volkanlar Bulvarı\" olarak adlandırılmıştır.\n\nBu kuşağın en yüksek zirvesi 6.263 metrelik Chimborazo Yanardağı'dır. Gezegenimizin kutuplardan basık, ekvatordan şişkin elips biçimi nedeniyle Chimborazo'nun zirvesi, Dünya'nın merkezinden ölçüldüğünde yeryüzünün uzaya en yakın noktası unvanını taşır. 5.897 metrelik mükemmel simetrili konisiyle Cotopaxi ise dünyanın en yüksek aktif strato-volkanları arasındadır.\n\nAndlar'ın batısında Guayas Nehri'nin beslediği alüvyon zengini Costa ovası, doğusunda ise Amazon ormanlarının alçak tabanı Oriente uzanır. Pasifik açıklarındaki Galápagos Takımadaları ise aktif bir okyanusal sıcak nokta üzerinde yükselen bazaltik kalkan volkanlarından oluşur.",
    after:
      "And Dağları, Ekvador topraklarında birbirine paralel uzanan Doğu ve Batı Kordilyera olarak ikiye ayrılır. Bu iki sırtın arasında uzanan yüksek vadi oluğu, onlarca dev volkan konisiyle çevrili olduğu için Alman doğa bilimci Alexander von Humboldt tarafından \"Volkanlar Bulvarı\" olarak adlandırılmıştır.\n\nBu kuşağın en yüksek zirvesi 6.263 metrelik Chimborazo Yanardağı'dır. Gezegenimizin kutuplardan basık, ekvatordan şişkin elips biçimi nedeniyle Chimborazo'nun zirvesi, Dünya'nın merkezinden ölçüldüğünde yeryüzünün uzaya en yakın noktası unvanını taşır. 5.897 metrelik mükemmel simetrili konisiyle Cotopaxi ise dünyanın en yüksek aktif tabakalı volkanları arasındadır.\n\nAndlar'ın batısında Guayas Nehri'nin beslediği alüvyon zengini Costa ovası, doğusunda ise Amazon ormanlarının alçak tabanı Oriente uzanır. Pasifik açıklarındaki Galápagos Takımadaları ise aktif bir okyanusal sıcak nokta üzerinde yükselen bazaltik kalkan volkanlarından oluşur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GY',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Guyana'da yıl boyu yüksek sıcaklık ve nemle tanımlanan ekvatoral bir rejim hüküm sürer. Ülkeyi diğer birçok tropikal bölgeden ayıran temel özellik, Tropikal Yakınsama Kuşağı'nın (ITCZ) mevsimsel göçüne bağlı olarak yılda iki yağışlı ve iki kurak dönem yaşamasıdır.\n\nBirincil yağışlı mevsim Mayıs'tan Ağustos ortasına kadar sürerek yıllık yağışın yaklaşık %40'ını getirir; ikincil yağışlı dönem ise Aralık ve Ocak aylarında yağışın yaklaşık %20'sini bırakır. Şubat-Nisan ve Eylül-Ekim dönemleri ise kurak geçer.\n\nKıyı ovasında yıllık yağış Atlas Okyanusu'ndan gelen nemli alizelerle 2.000 milimetreyi aşarken, kuzeydoğu alizeleri kıyıdaki bunaltıcı sıcağı yumuşatır; iç kesimdeki Rupununi savanlarında ise yağış yaklaşık 1.800 milimetreye geriler ve kurak mevsimde savanlar kururken yağışlı mevsimde geniş taşkın düzlüklerine dönüşür.",
    after:
      "Guyana'da yıl boyu yüksek sıcaklık ve nemle tanımlanan ekvatoral bir rejim hüküm sürer. Ülkeyi diğer birçok tropikal bölgeden ayıran temel özellik, Tropikal Yakınsama Kuşağı'nın mevsimsel göçüne bağlı olarak yılda iki yağışlı ve iki kurak dönem yaşamasıdır.\n\nBirincil yağışlı mevsim Mayıs'tan Ağustos ortasına kadar sürerek yıllık yağışın yaklaşık %40'ını getirir; ikincil yağışlı dönem ise Aralık ve Ocak aylarında yağışın yaklaşık %20'sini bırakır. Şubat-Nisan ve Eylül-Ekim dönemleri ise kurak geçer.\n\nKıyı ovasında yıllık yağış Atlas Okyanusu'ndan gelen nemli alizelerle 2.000 milimetreyi aşarken, kuzeydoğu alizeleri kıyıdaki bunaltıcı sıcağı yumuşatır; iç kesimdeki Rupununi savanlarında ise yağış yaklaşık 1.800 milimetreye geriler ve kurak mevsimde savanlar kururken yağışlı mevsimde geniş taşkın düzlüklerine dönüşür.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GY',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Guyana'nın ana drenaj omurgasını, güneydeki Acarai Dağları'ndan doğup 1.014 kilometre boyunca kuzeye akan ve ülke topraklarının yaklaşık %73'ünü sulayan Essequibo Nehri oluşturur; ağzında 20 kilometreyi aşan bir haliç ve sayısız adacık kurarak Atlas Okyanusu'na dökülür.\n\nKıyı boyunca uzanan Demerara ve Berbice nehirleri, boksit taşımacılığı ve tarımsal yerleşim açısından hayati su yollarıdır; başkent Georgetown, Demerara Nehri'nin okyanusa kavuştuğu haliçte kuruludur.\n\nKıyı ovası yüksek gelgitte deniz seviyesinin altında kaldığından, su yönetimi Hollanda sömürge döneminden miras kalan karmaşık bir polder, deniz duvarı ve \"koker\" adı verilen gelgit kapakları sistemiyle sağlanır; yağmur suları alçak gelgitte yerçekimiyle okyanusa tahliye edilirken yüksek gelgitte kapaklar kapatılarak deniz suyunun tarım arazilerini basması önlenir.",
    after:
      "Guyana'nın ana akarsu omurgasını, güneydeki Acarai Dağları'ndan doğup 1.014 kilometre boyunca kuzeye akan ve ülke topraklarının yaklaşık %73'ünü sulayan Essequibo Nehri oluşturur; ağzında 20 kilometreyi aşan bir haliç ve sayısız adacık kurarak Atlas Okyanusu'na dökülür.\n\nKıyı boyunca uzanan Demerara ve Berbice nehirleri, boksit taşımacılığı ve tarımsal yerleşim açısından hayati su yollarıdır; başkent Georgetown, Demerara Nehri'nin okyanusa kavuştuğu haliçte kuruludur.\n\nKıyı ovası yüksek gelgitte deniz seviyesinin altında kaldığından, su yönetimi Hollanda sömürge döneminden miras kalan karmaşık bir set içi arazi (polder), deniz duvarı ve \"koker\" adı verilen gelgit kapakları sistemiyle sağlanır; yağmur suları alçak gelgitte yerçekimiyle okyanusa tahliye edilirken yüksek gelgitte kapaklar kapatılarak deniz suyunun tarım arazilerini basması önlenir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'PY',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Región Oriental, Brezilya Yaylası'nın uzantısı olan dalgalı bazalt platoları, verimli kırmızı toprakları (terra roxa) ve alçak tepe sıralarını kapsar. Ülkenin en yüksek noktası da bu bölgede, Ybytyruzú sıradağları üzerinde yükselen 842 metrelik Cerro Tres Kandú tepesidir.\n\nParaguay Nehri'nin batısında başlayan Región Occidental ise And Dağları'ndan aşınarak birikmiş kalın alüvyon katmanlarından oluşan ve neredeyse tamamen düz uzanan Gran Chaco havzasının parçasıdır. Arazi doğuya, nehir yatağına doğru çok hafif bir eğim gösterir.\n\nChaco zemininde killi ve tuzlu katmanların yaygın olması, drenaj yetersizliğiyle birleştiğinde yağışlı mevsimde geniş alanların bataklığa dönüşmesine, kurak dönemde ise toprağın çatlayıp tuz birikintilerine bürünmesine yol açar; bu nedenle bölge tarıma doğu kesimi kadar elverişli değildir.",
    after:
      "Región Oriental, Brezilya Yaylası'nın uzantısı olan dalgalı bazalt platoları, verimli kırmızı toprakları (terra roxa) ve alçak tepe sıralarını kapsar. Ülkenin en yüksek noktası da bu bölgede, Ybytyruzú sıradağları üzerinde yükselen 842 metrelik Cerro Tres Kandú tepesidir.\n\nParaguay Nehri'nin batısında başlayan Región Occidental ise And Dağları'ndan aşınarak birikmiş kalın alüvyon katmanlarından oluşan ve neredeyse tamamen düz uzanan Gran Chaco havzasının parçasıdır. Arazi doğuya, nehir yatağına doğru çok hafif bir eğim gösterir.\n\nChaco zemininde killi ve tuzlu katmanların yaygın olması, suyun akıp gidememesiyle birleştiğinde yağışlı mevsimde geniş alanların bataklığa dönüşmesine, kurak dönemde ise toprağın çatlayıp tuz birikintilerine bürünmesine yol açar; bu nedenle bölge tarıma doğu kesimi kadar elverişli değildir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'PY',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Oğlak Dönencesi'nin ülkeyi tam ortadan kesmesi, Paraguay'da subtropikal ile tropikal iklim kuşakları arasında belirgin bir geçiş karakteri yaratır. Región Oriental'de yıl boyunca düzenli dağılan, belirgin bir kurak dönemi olmayan ve yıllık 1.400 ila 1.800 milimetreye ulaşan nemli subtropikal bir rejim etkilidir.\n\nBatıya doğru ilerledikçe yağış hızla azalır; Chaco Boreal kesiminde yıllık yağış 500 ila 1.000 milimetreye kadar düşerek yarı kurak çalı biyomuna zemin hazırlar.\n\nYaz aylarında Amazon ve Chaco üzerinden gelen sıcak hava kütleleri sıcaklıkları sık sık 35-40 derecenin üzerine çıkararak ülkeyi kıtanın en sıcak bölgelerinden biri yapar. Kış aylarında ise güney kutup dairesinden esen fırtınalı pampero rüzgarları, sıcaklığın saatler içinde 15-20 derece birden düşmesine neden olur.",
    after:
      "Oğlak Dönencesi'nin ülkeyi tam ortadan kesmesi, Paraguay'da subtropikal ile tropikal iklim kuşakları arasında belirgin bir geçiş karakteri yaratır. Región Oriental'de yıl boyunca düzenli dağılan, belirgin bir kurak dönemi olmayan ve yıllık 1.400 ila 1.800 milimetreye ulaşan nemli subtropikal bir rejim etkilidir.\n\nBatıya doğru ilerledikçe yağış hızla azalır; Chaco Boreal kesiminde yıllık yağış 500 ila 1.000 milimetreye kadar düşerek yarı kurak çalılıklara zemin hazırlar.\n\nYaz aylarında Amazon ve Chaco üzerinden gelen sıcak hava kütleleri sıcaklıkları sık sık 35-40 derecenin üzerine çıkararak ülkeyi kıtanın en sıcak bölgelerinden biri yapar. Kış aylarında ise güney kutup dairesinden esen fırtınalı pampero rüzgarları, sıcaklığın saatler içinde 15-20 derece birden düşmesine neden olur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'PE',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Yeryüzünün en büyük nehir sistemi olan Amazon, doğuşunu bütünüyle Peru Andları'ndaki buzul kaynaklarına borçludur. Uzun yıllar Apurímac Nehri ana kaynak kabul edilmişken, 2014 yılında yapılan ölçümler kaynağı Cordillera Rumi Cruz'daki Mantaro Nehri'nin çıkışına taşımış ve bu kolun yaklaşık 75 kilometre daha uzun olduğunu belgelemiştir.\n\nAnd vadilerini derin kanyonlarla yaran Marañón ve Ucayali nehirleri, Nauta yakınlarında birleşerek Amazon Nehri'nin ana gövdesini başlatır ve doğuya, Brezilya'ya doğru akar.\n\nPasifik yamacındaki nehirler ise dik eğimli, kısa ve mevsimliktir; buna karşın çöl kıyısında kurulan Lima gibi dev metropollerin ve tarım vahalarının yegane tatlı su kaynağıdır. Güneydoğudaki Titicaca Gölü ise Altiplano'nun kapalı hidrolojik sistemini besler.",
    after:
      "Yeryüzünün en büyük nehir sistemi olan Amazon, doğuşunu bütünüyle Peru Andları'ndaki buzul kaynaklarına borçludur. Uzun yıllar Apurímac Nehri ana kaynak kabul edilmişken, 2014 yılında yapılan ölçümler kaynağı Cordillera Rumi Cruz'daki Mantaro Nehri'nin çıkışına taşımış ve bu kolun yaklaşık 75 kilometre daha uzun olduğunu belgelemiştir.\n\nAnd vadilerini derin kanyonlarla yaran Marañón ve Ucayali nehirleri, Nauta yakınlarında birleşerek Amazon Nehri'nin ana gövdesini başlatır ve doğuya, Brezilya'ya doğru akar.\n\nPasifik yamacındaki nehirler ise dik eğimli, kısa ve mevsimliktir; buna karşın çöl kıyısında kurulan Lima gibi dev metropollerin ve tarım vahalarının yegane tatlı su kaynağıdır. Güneydoğudaki Titicaca Gölü ise Altiplano'nun kapalı su havzasını besler.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SR',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Güney Amerika'nın kuzeydoğusunda Atlas Okyanusu kıyısında yer alan Surinam, yüzölçümü bakımından kıtanın en küçük bağımsız devletidir. Topraklarının yaklaşık %94'ünü kaplayan bakir yağmur ormanlarıyla yeryüzünde yüzölçümüne oranla en yüksek orman örtüsüne sahip ülkesi konumundadır.\n\nÜlke, jeolojik olarak komşusu Guyana ile birlikte aşınmaya dirençli Prekambriyen Guyana Kalkanı üzerinde oturur. Basamaklı yüksek tepuilerin aksine Surinam'ın iç kesimleri büyük ölçüde alçak bir peneplendir. Nüfusun ve yerleşimlerin neredeyse tamamı başkent Paramaribo çevresindeki dar kıyı şeridinde toplanırken, güneydeki engin ormanlık alanlar neredeyse bütünüyle boştur.",
    after:
      "Güney Amerika'nın kuzeydoğusunda Atlas Okyanusu kıyısında yer alan Surinam, yüzölçümü bakımından kıtanın en küçük bağımsız devletidir. Topraklarının yaklaşık %94'ünü kaplayan bakir yağmur ormanlarıyla yeryüzünde yüzölçümüne oranla en yüksek orman örtüsüne sahip ülkesi konumundadır.\n\nÜlke, jeolojik olarak komşusu Guyana ile birlikte aşınmaya dirençli Prekambriyen Guyana Kalkanı üzerinde oturur. Basamaklı yüksek tepuilerin aksine Surinam'ın iç kesimleri büyük ölçüde alçak bir aşınım düzlüğüdür (peneplen). Nüfusun ve yerleşimlerin neredeyse tamamı başkent Paramaribo çevresindeki dar kıyı şeridinde toplanırken, güneydeki engin ormanlık alanlar neredeyse bütünüyle boştur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SR',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Surinam morfolojisi iki ana yapısal kuşağa ayrılır: Kuzeydeki alçak ve bataklık kıyı düzlüğü ile güneyde yükselen eski kristalen yaylalar. Kıyı kuşağı, mangrov bataklıkları ve \"ritsen\" adı verilen eski kum-kavuk sırtlarıyla örtülüdür; başkent ve tarım arazileri bu sağlam kum setleri üzerinde kurulmuştur.\n\nİç kesimlere doğru arazi, granitik kalıntı tepelerin (inselberg) orman denizinden tek başına yükseldiği aşınmış bir platoya dönüşür. Ülkenin orta-güney kesiminde uzanan Wilhelmina Dağları üzerindeki 1.280 metrelik Julianatop, Surinam'ın en yüksek zirvesidir.\n\nÜlke topraklarının yaklaşık dörtte biri, 1,6 milyon hektarlık el değmemiş ormanı koruyan Merkez Surinam Doğa Rezervi'ni oluşturur; 2000 yılında UNESCO Dünya Mirası Listesi'ne alınan bu alan, Guyana Kalkanı'ndaki en bozulmamış ekosistemlerden biridir.",
    after:
      "Surinam'ın yer şekilleri iki ana kuşağa ayrılır: Kuzeydeki alçak ve bataklık kıyı düzlüğü ile güneyde yükselen eski kristalen yaylalar. Kıyı kuşağı, mangrov bataklıkları ve \"ritsen\" adı verilen eski kum ve kavkı sırtlarıyla örtülüdür; başkent ve tarım arazileri bu sağlam kum setleri üzerinde kurulmuştur.\n\nİç kesimlere doğru arazi, granitik kalıntı tepelerin (inselberg) orman denizinden tek başına yükseldiği aşınmış bir platoya dönüşür. Ülkenin orta-güney kesiminde uzanan Wilhelmina Dağları üzerindeki 1.280 metrelik Julianatop, Surinam'ın en yüksek zirvesidir.\n\nÜlke topraklarının yaklaşık dörtte biri, 1,6 milyon hektarlık el değmemiş ormanı koruyan Merkez Surinam Doğa Rezervi'ni oluşturur; 2000 yılında UNESCO Dünya Mirası Listesi'ne alınan bu alan, Guyana Kalkanı'ndaki en bozulmamış ekosistemlerden biridir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'UY',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      'Uruguay arazisi, kadim kristalen kalkanın milyonlarca yıllık aşınmasıyla oluşmuş dalgalı bir peneplen karakteri sergiler. Bu yumuşak çayır topoğrafyasını "cuchilla" adı verilen alçak, yassı sırtlar böler; bunların en önemlileri ülkeyi boydan boya kat eden Cuchilla Grande ile batıdaki Cuchilla de Haedo\'dur.\n\nBu sırtlar gerçek dağ zincirleri olmayıp mera arazisini hafifçe dalgalandıran taşlık tepelerden ibarettir; aralarında Cerro Pan de Azúcar ve Cerro Arequita gibi tekil granit tepeler yükselir. Ülkenin en yüksek noktası, Maldonado bölgesindeki Sierra Carapé üzerinde yer alan 513,66 metrelik Cerro Catedral\'dir ve kıtanın en alçak ulusal zirveleri arasındadır.\n\nGüneydoğu kıyısında Atlas Okyanusu boyunca kumul şeritleri ve Laguna Merín ile Laguna de Rocha gibi geniş kıyı lagünleri ve sulak alan sistemleri (bañados) uzanır.',
    after:
      'Uruguay arazisi, kadim kristalen kalkanın milyonlarca yıllık aşınmasıyla oluşmuş dalgalı bir aşınım düzlüğü (peneplen) görünümündedir. Bu yumuşak çayır topoğrafyasını "cuchilla" adı verilen alçak, yassı sırtlar böler; bunların en önemlileri ülkeyi boydan boya kat eden Cuchilla Grande ile batıdaki Cuchilla de Haedo\'dur.\n\nBu sırtlar gerçek dağ zincirleri olmayıp mera arazisini hafifçe dalgalandıran taşlık tepelerden ibarettir; aralarında Cerro Pan de Azúcar ve Cerro Arequita gibi tekil granit tepeler yükselir. Ülkenin en yüksek noktası, Maldonado bölgesindeki Sierra Carapé üzerinde yer alan 513,66 metrelik Cerro Catedral\'dir ve kıtanın en alçak ulusal zirveleri arasındadır.\n\nGüneydoğu kıyısında Atlas Okyanusu boyunca kumul şeritleri ve Laguna Merín ile Laguna de Rocha gibi geniş kıyı lagünleri ve sulak alan sistemleri (bañados) uzanır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'UY',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Uruguay bütünüyle ılıman subtropikal kuşakta (Köppen Cfa) yer alır ve ülke genelinde son derece dengeli, homojen bir iklim yapısı sergiler. Belirgin bir kurak mevsim bulunmaz; yağış kışın kutup cepheleriyle, yazın ise konvektif fırtınalarla yıl boyunca düzenli dağılır.\n\nYıllık yağış güney kıyılarında ve Montevideo çevresinde 1.100-1.200 milimetre iken, kuzeye Brezilya sınırına yaklaştıkça 1.600 milimetreye kadar yükselir.\n\nDağ sıralarının bulunmaması hava kütlelerinin engelsizce hareket etmesine olanak tanır. Kuzeyden esen sıcak tropikal hava ile Antarktika kökenli soğuk pampero rüzgarlarının karşılaşması, birkaç gün içinde keskin sıcaklık dalgalanmalarına yol açabilir; buna karşın ilkbahar nemli ve rüzgarlı, yazlar ılık, sonbahar mutedil ve kışlar ılıman-serin geçer.',
    after:
      'Uruguay bütünüyle ılıman subtropikal kuşakta (Köppen Cfa) yer alır ve ülke genelinde son derece dengeli ve her yerde benzer bir iklime sahiptir. Belirgin bir kurak mevsim bulunmaz; yağış kışın kutup cepheleriyle, yazın ise ısınan havanın yükselmesiyle oluşan fırtınalarla yıl boyunca düzenli dağılır.\n\nYıllık yağış güney kıyılarında ve Montevideo çevresinde 1.100-1.200 milimetre iken, kuzeye Brezilya sınırına yaklaştıkça 1.600 milimetreye kadar yükselir.\n\nDağ sıralarının bulunmaması hava kütlelerinin engelsizce hareket etmesine olanak tanır. Kuzeyden esen sıcak tropikal hava ile Antarktika kökenli soğuk pampero rüzgarlarının karşılaşması, birkaç gün içinde keskin sıcaklık dalgalanmalarına yol açabilir; buna karşın ilkbahar nemli ve rüzgarlı, yazlar ılık, sonbahar mutedil ve kışlar ılıman-serin geçer.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'VE',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Güney Amerika'nın kuzey kıyısında Karayip Denizi ve Atlas Okyanusu'na cephe veren Venezuela; batıda Kolombiya, güneyde Brezilya ve doğuda Guyana ile komşudur. Ülke, kıtanın neredeyse tüm karakteristik ekosistemlerini sınırları içinde toplayan dört temel fizyografik bölgeye ayrılır.\n\nKuzeybatıdaki petrol zengini Maracaibo alçak havzası, kuzeyi kuşatan sarp Kıyı Andları, ülkenin merkezini kaplayan geniş Orinoco savanları (Llanos) ve güneydoğudaki kadim Guyana Yaylası, Venezuela'ya olağanüstü bir peyzaj ve doğal kaynak zenginliği kazandırır.",
    after:
      "Güney Amerika'nın kuzey kıyısında Karayip Denizi ve Atlas Okyanusu'na cephe veren Venezuela; batıda Kolombiya, güneyde Brezilya ve doğuda Guyana ile komşudur. Ülke, kıtanın neredeyse tüm karakteristik ekosistemlerini sınırları içinde toplayan dört temel doğal bölgeye ayrılır.\n\nKuzeybatıdaki petrol zengini Maracaibo alçak havzası, kuzeyi kuşatan sarp Kıyı Andları, ülkenin merkezini kaplayan geniş Orinoco savanları (Llanos) ve güneydoğudaki kadim Guyana Yaylası, Venezuela'ya olağanüstü bir manzara ve doğal kaynak zenginliği kazandırır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'VE',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "And Dağları'nın kuzeydoğu kolu olan Cordillera de Mérida, ülkenin batısında yükselir ve 4.978 metrelik Pico Bolívar ile Venezuela'nın en yüksek doruğunu oluşturur. Bu dağ zinciri kıyı boyunca Karakas vadisini çevreleyen Kıyı Sıradağları (Cordillera de la Costa) olarak devam eder.\n\nDağların batısında yer alan Maracaibo Gölü, dar bir boğazla Karayip Denizi'ne bağlı olduğundan hidrolojik olarak bir iç körfez niteliği taşısa da yaklaşık 13.200 kilometrekarelik yüzeyiyle Güney Amerika'nın en büyük su kütlesi kabul edilir ve altındaki devasa hidrokarbon yataklarıyla ülkenin enerji kalbidir. Ülkenin merkezini kaplayan Llanos ise Orinoco Havzası'nın parçası olan uçsuz bucaksız bir çayır-savan düzlüğüdür.\n\nGüneydoğudaki Guyana Yaylası'nda (Gran Sabana), yeryüzünün en eski Prekambriyen kumtaşı tabakalarının aşınmasıyla oluşmuş dik uçurumlu masa dağları (tepui) yükselir. Bu tepuilerin en büyüğü olan Auyán-tepui'nin zirvesinden dökülen Angel Şelalesi (Kerepakupai Merú), 979 metrelik toplam düşüşüyle dünyanın en yüksek şelalesidir.",
    after:
      "And Dağları'nın kuzeydoğu kolu olan Cordillera de Mérida, ülkenin batısında yükselir ve 4.978 metrelik Pico Bolívar ile Venezuela'nın en yüksek doruğunu oluşturur. Bu dağ zinciri kıyı boyunca Karakas vadisini çevreleyen Kıyı Sıradağları (Cordillera de la Costa) olarak devam eder.\n\nDağların batısında yer alan Maracaibo Gölü, dar bir boğazla Karayip Denizi'ne bağlı olduğundan aslında bir iç körfez niteliği taşısa da yaklaşık 13.200 kilometrekarelik yüzeyiyle Güney Amerika'nın en büyük su kütlesi kabul edilir ve altındaki devasa petrol ve doğal gaz yataklarıyla ülkenin enerji kalbidir. Ülkenin merkezini kaplayan Llanos ise Orinoco Havzası'nın parçası olan uçsuz bucaksız bir çayır-savan düzlüğüdür.\n\nGüneydoğudaki Guyana Yaylası'nda (Gran Sabana), yeryüzünün en eski Prekambriyen kumtaşı tabakalarının aşınmasıyla oluşmuş dik uçurumlu masa dağları (tepui) yükselir. Bu tepuilerin en büyüğü olan Auyán-tepui'nin zirvesinden dökülen Angel Şelalesi (Kerepakupai Merú), 979 metrelik toplam düşüşüyle dünyanın en yüksek şelalesidir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'VE',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Güney Amerika'nın Amazon'dan sonraki en büyük, dünya genelinde ise debi bakımından üçüncü büyük nehri olan Orinoco, yaklaşık 2.140 kilometre boyunca akarak ülke topraklarının beşte dördünden fazlasını drene eder. Orinoco'nun yukarı çığırında yer alan Casiquiare Kanalı, nehrin sularının bir kısmını Amazon sistemine (Rio Negro) aktararak iki dev kıtasal havza arasında dünyada eşi görülmemiş doğal bir su yolu bağlantısı kurar.\n\nGuyana Yaylası'ndan inen Caroní Nehri, taşıdığı yüksek debi ve dik yatak eğimiyle Orinoco'ya katılır; üzerinde kurulu Guri Barajı, elektrik üretimi bakımından dünyanın en büyük hidroelektrik santrallerinden biridir.\n\nMaracaibo Gölü'ne dökülen Catatumbo Nehri ağzı ise yeryüzünün en benzersiz elektromanyetik doğa olayına sahne olur; \"Catatumbo Yıldırımları\" olarak bilinen bu olayda, bataklık gazları ile dağ rüzgarlarının karşılaşması sonucu yılda 160 ila 260 gece boyunca aralıksız şimşek fırtınaları parıldar.",
    after:
      "Güney Amerika'nın Amazon'dan sonraki en büyük, dünya genelinde ise debi bakımından üçüncü büyük nehri olan Orinoco, yaklaşık 2.140 kilometre boyunca akarak ülke topraklarının beşte dördünden fazlasının sularını toplar. Orinoco'nun yukarı çığırında yer alan Casiquiare Kanalı, nehrin sularının bir kısmını Amazon sistemine (Rio Negro) aktararak iki dev kıtasal havza arasında dünyada eşi görülmemiş doğal bir su yolu bağlantısı kurar.\n\nGuyana Yaylası'ndan inen Caroní Nehri, taşıdığı yüksek debi ve dik yatak eğimiyle Orinoco'ya katılır; üzerinde kurulu Guri Barajı, elektrik üretimi bakımından dünyanın en büyük hidroelektrik santrallerinden biridir.\n\nMaracaibo Gölü'ne dökülen Catatumbo Nehri ağzı ise yeryüzünün en benzersiz elektromanyetik doğa olayına sahne olur; \"Catatumbo Yıldırımları\" olarak bilinen bu olayda, bataklık gazları ile dağ rüzgarlarının karşılaşması sonucu yılda 160 ila 260 gece boyunca aralıksız şimşek fırtınaları parıldar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'FI',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      'Finlandiya, Baltık Kalkanı’nın masif kristalen kayaçları üzerine yerleşen, yüz binden fazla göl ve adadan oluşan geniş bir kuzey coğrafyasıdır. Batıda Botni Körfezi, güneyde Finlandiya Körfezi ile çevrili olan ülke, doğuda Rusya ile 1.340 kilometrelik kesintisiz bir tayga sınırı paylaşır.\n\nBaşkent Helsinki, güney kıyısında deniz ticaret yollarının kavşağında kuruludur. Güneybatı açıklarındaki Takımada Denizi (Saaristomeri) ve özerk Åland Adaları, buzul sonrası kara yükselmesiyle her yıl denizden biraz daha yükselen dünyanın en yoğun ada labirentlerinden biridir.',
    after:
      'Finlandiya, Baltık Kalkanı’nın sert ve kristalli eski kayaçları üzerine yerleşen, yüz binden fazla göl ve adadan oluşan geniş bir kuzey coğrafyasıdır. Batıda Botni Körfezi, güneyde Finlandiya Körfezi ile çevrili olan ülke, doğuda Rusya ile 1.340 kilometrelik kesintisiz bir tayga sınırı paylaşır.\n\nBaşkent Helsinki, güney kıyısında deniz ticaret yollarının kavşağında kuruludur. Güneybatı açıklarındaki Takımada Denizi (Saaristomeri) ve özerk Åland Adaları, buzul sonrası kara yükselmesiyle her yıl denizden biraz daha yükselen dünyanın en yoğun ada labirentlerinden biridir.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'FI',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Finlandiya'nın jeomorfolojisi, son buzul çağında anakarayı kaplayan buzulların granit ve gnays temel kayayı törpülemesiyle oluşmuştur. Ülkenin güneyini ve ortasını kuşatan Salpausselkä moren sırtları, buzul dillerinin önünde birikmiş çakıl ve kumlardan oluşur; bu sırtlar güneydeki su akışını engelleyerek iç kesimde devasa bir göller platosu meydana getirmiştir.\n\nKuzeye, Laponya'ya doğru arazi yükselir ve orman kuşağının yerini ağaçsız, yuvarlak doruklu tepeler (tunturi) alır. Norveç sınırındaki İskandinav Dağları eteğinde yer alan Halti dağının yamacı (1.324 m), Finlandiya sınırları içindeki en yüksek irtifayı oluşturur.",
    after:
      "Finlandiya'nın yer şekilleri, son buzul çağında anakarayı kaplayan buzulların granit ve gnays temel kayayı törpülemesiyle oluşmuştur. Ülkenin güneyini ve ortasını kuşatan Salpausselkä moren sırtları, buzul dillerinin önünde birikmiş çakıl ve kumlardan oluşur; bu sırtlar güneydeki su akışını engelleyerek iç kesimde devasa bir göller platosu meydana getirmiştir.\n\nKuzeye, Laponya'ya doğru arazi yükselir ve orman kuşağının yerini ağaçsız, yuvarlak doruklu tepeler (tunturi) alır. Norveç sınırındaki İskandinav Dağları eteğinde yer alan Halti dağının yamacı (1.324 m), Finlandiya sınırları içindeki en yüksek irtifayı oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'IS',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "İzlanda morfolojisi, aktif volkanizma ile buzul aşındırmasının bir arada çalıştığı istisnai bir yapı sergiler. Ülke genelinde 30’u aşkın faal volkanik sistem yer alır; çatlak püskürmeleri, gayzerler, lav tüpleri ve bazalt platoları araziyi kaplar. UNESCO Dünya Mirası listesindeki Þingvellir, iki kıtasal levhanın yüzeyde çıplak gözle izlenebilen yarık vadisini oluşturur.\n\nGüneydoğuda 7.700 kilometrekarelik alanıyla Avrupa'nın hacimce en büyük buz örtüsü olan Vatnajökull yükselir. Bu kütlenin güney kenarındaki Öræfajökull stratovolkanının krater sırtında yer alan Hvannadalshnúkur (2.110 m), İzlanda’nın en yüksek zirvesidir. Buzul altı volkanik patlamaları, devasa erime sularının aniden ovaya boşaldığı buzul taşkınlarına (jökulhlaup) yol açarak güney kıyılarında geniş siyah kum ovaları (sandur) oluşturmuştur.",
    after:
      "İzlanda’nın yer şekilleri, aktif volkanizma ile buzul aşındırmasının bir arada çalıştığı istisnai bir yapı sergiler. Ülke genelinde 30’u aşkın faal volkanik sistem yer alır; çatlak püskürmeleri, gayzerler, lav tüpleri ve bazalt platoları araziyi kaplar. UNESCO Dünya Mirası listesindeki Þingvellir, iki kıtasal levhanın yüzeyde çıplak gözle izlenebilen yarık vadisini oluşturur.\n\nGüneydoğuda 7.700 kilometrekarelik alanıyla Avrupa'nın hacimce en büyük buz örtüsü olan Vatnajökull yükselir. Bu kütlenin güney kenarındaki Öræfajökull stratovolkanının krater sırtında yer alan Hvannadalshnúkur (2.110 m), İzlanda’nın en yüksek zirvesidir. Buzul altı volkanik patlamaları, devasa erime sularının aniden ovaya boşaldığı buzul taşkınlarına (jökulhlaup) yol açarak güney kıyılarında geniş siyah kum ovaları (sandur) oluşturmuştur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'IE',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "İrlanda'nın yer şekilleri klasik bir çanak morfolojisi sunar: Kireçtaşı temelli, alçak ve hafif dalgalı iç ova, kıyı boyunca dizilen dağlık kütlelerle çepeçevre sarılmıştır. İç ovalarda buzul çökelleri ve drenaj tıkanıklıkları nedeniyle geniş turbalıklar (bog) oluşmuştur.\n\nÜlkenin en yüksek noktası, güneybatıdaki Kerry Kontluğu'nda yükselen MacGillycuddy’s Reeks sırası üzerindeki 1.038,6 metrelik Carrauntoohil doruğudur. Atlantik fırtınalarının dövdüğü batı kıyısında 200 metreyi aşan dik Moher Falezleri, derin fiyort benzeri koylar ile Kerry ve Dingle yarımadaları uzanır; Clare bölgesindeki Burren ise çıplak kireçtaşı plakalarından oluşan karstik yapısıyla tanınır.",
    after:
      "İrlanda'nın yer şekilleri klasik bir çanak görünümü sunar: Kireçtaşı temelli, alçak ve hafif dalgalı iç ova, kıyı boyunca dizilen dağlık kütlelerle çepeçevre sarılmıştır. İç ovalarda buzul çökelleri ve suyun akamaması nedeniyle geniş turbalıklar oluşmuştur.\n\nÜlkenin en yüksek noktası, güneybatıdaki Kerry Kontluğu'nda yükselen MacGillycuddy’s Reeks sırası üzerindeki 1.038,6 metrelik Carrauntoohil doruğudur. Atlantik fırtınalarının dövdüğü batı kıyısında 200 metreyi aşan dik Moher Falezleri, derin fiyort benzeri koylar ile Kerry ve Dingle yarımadaları uzanır; Clare bölgesindeki Burren ise çıplak kireçtaşı plakalarından oluşan karstik yapısıyla tanınır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'IE',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "İrlanda'nın ve tüm Britanya Adaları'nın en uzun akarsuyu olan 360 kilometrelik Shannon Nehri, kuzey platolarından doğarak iç ovayı güneye doğru boydan boya kat eder ve Atlantik Okyanusu’na açılan geniş bir halice dökülür. Shannon, yavaş eğimli yatağında Lough Ree ve Lough Derg gibi geniş yayvan göller oluşturur.\n\nCumhuriyet topraklarındaki en geniş göl, batıda Galway açıklarında uzanan 176 kilometrekarelik Lough Corrib’dir. Karstik Burren sahasında yüzey suları hızla çatlaklardan yer altına sızarak mağara kanallarına karışır; kış yağışlarıyla dolup yazın kuruyan geçici karst gölleri (turlough), adanın özgün hidrolojik peyzajını yansıtır.",
    after:
      "İrlanda'nın ve tüm Britanya Adaları'nın en uzun akarsuyu olan 360 kilometrelik Shannon Nehri, kuzey platolarından doğarak iç ovayı güneye doğru boydan boya kat eder ve Atlantik Okyanusu’na açılan geniş bir halice dökülür. Shannon, yavaş eğimli yatağında Lough Ree ve Lough Derg gibi geniş yayvan göller oluşturur.\n\nCumhuriyet topraklarındaki en geniş göl, batıda Galway açıklarında uzanan 176 kilometrekarelik Lough Corrib’dir. Karstik Burren sahasında yüzey suları hızla çatlaklardan yer altına sızarak mağara kanallarına karışır; kış yağışlarıyla dolup yazın kuruyan geçici karst gölleri, adanın kendine özgü su manzarasını yansıtır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'LT',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Ülke genelinde ılıman denizel iklimden nemli karasal iklime geçiş özellikleri hakimdir. Baltık Denizi’nin ılıtıcı etkisi yalnızca Klaipėda çevresi ve Kuron kıyısındaki dar bir kıyı kuşağında hissedilir; kış aylarında kıyılarda hava daha nemli ve rüzgarlıdır.\n\nİç kesimlere ve özellikle doğu sınırındaki tepelik alanlara geçildikçe karasal rejim güçlenir; kış donları uzar ve kar örtüsü yerde ortalama üç ay boyunca kalır. Yaz ayları genellikle ılık geçer, Temmuz sıcaklıkları 18 derece civarındadır; en fazla yağış yaz aylarındaki konvektif fırtınalarla düşer.',
    after:
      'Ülke genelinde ılıman denizel iklimden nemli karasal iklime geçiş özellikleri hakimdir. Baltık Denizi’nin ılıtıcı etkisi yalnızca Klaipėda çevresi ve Kuron kıyısındaki dar bir kıyı kuşağında hissedilir; kış aylarında kıyılarda hava daha nemli ve rüzgarlıdır.\n\nİç kesimlere ve özellikle doğu sınırındaki tepelik alanlara geçildikçe karasal rejim güçlenir; kış donları uzar ve kar örtüsü yerde ortalama üç ay boyunca kalır. Yaz ayları genellikle ılık geçer, Temmuz sıcaklıkları 18 derece civarındadır; en fazla yağış yaz aylarındaki sağanak ve gök gürültülü fırtınalarla düşer.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'LT',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Litvanya topraklarının üçte ikisinden fazlasını drene eden Nemunas Nehri, Belarus'ta doğup ülkeyi baştan başa geçtikten sonra Kaunas'ta en büyük kolu olan Neris ile birleşir. Nehir, Klaipėda güneyinde geniş ve verimli bir delta oluşturarak sığ Kuron Lagünü’ne dökülür.\n\nKuron Lagünü, sığ yapısıyla zengin bir balıkçılık ve sulak alan ekosistemi barındırır. Ülkenin doğusundaki Aukštaitija bölgesinde toplanan 2.800'ü aşkın buzul gölü, yoğun çam ormanlarıyla çevrili labirent benzeri doğal su yolları meydana getirir.",
    after:
      "Litvanya topraklarının üçte ikisinden fazlasının sularını toplayan Nemunas Nehri, Belarus'ta doğup ülkeyi baştan başa geçtikten sonra Kaunas'ta en büyük kolu olan Neris ile birleşir. Nehir, Klaipėda güneyinde geniş ve verimli bir delta oluşturarak sığ Kuron Lagünü’ne dökülür.\n\nKuron Lagünü, sığ yapısıyla zengin bir balıkçılık ve sulak alan ekosistemi barındırır. Ülkenin doğusundaki Aukštaitija bölgesinde toplanan 2.800'ü aşkın buzul gölü, yoğun çam ormanlarıyla çevrili labirent benzeri doğal su yolları meydana getirir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'NO',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Norveç, 58 ile 71 derece kuzey enlemleri arasında yer almasına karşın, Atlas Okyanusu'ndan kıyı boyunca kuzeye ilerleyen ılık Norveç Akıntısı (Golfstrim uzantısı) sayesinde olağanüstü bir termal anomaliye sahiptir. Bu akıntı sayesinde Kutup Dairesi ötesindeki Narvik ve Tromsø gibi limanlar kışın bile buz tutmaz.\n\nAtlantik fırtınalarına dik duran batı yamaçları, yıllık 2.500-3.000 milimetreyi aşan şiddetli orografik yağış alır. Buna karşılık dağ sırasının doğusundaki vadiler yağmur gölgesinde kalarak çok daha kurak ve sert karasal kış koşulları yaşar. En kuzeydeki Finnmark bölgesinde kışın aylarca süren kutup gecesi, yazın ise batmayan gece güneşi gözlenir.",
    after:
      "Norveç, 58 ile 71 derece kuzey enlemleri arasında yer almasına karşın, Atlas Okyanusu'ndan kıyı boyunca kuzeye ilerleyen ılık Norveç Akıntısı (Golfstrim uzantısı) sayesinde olağanüstü enlemine göre olağanüstü ılık bir iklime sahiptir. Bu akıntı sayesinde Kutup Dairesi ötesindeki Narvik ve Tromsø gibi limanlar kışın bile buz tutmaz.\n\nAtlantik fırtınalarına dik duran batı yamaçları, yıllık 2.500-3.000 milimetreyi aşan şiddetli yamaç yağışı (orografik yağış) alır. Buna karşılık dağ sırasının doğusundaki vadiler yağmur gölgesinde kalarak çok daha kurak ve sert karasal kış koşulları yaşar. En kuzeydeki Finnmark bölgesinde kışın aylarca süren kutup gecesi, yazın ise batmayan gece güneşi gözlenir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SE',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'İsveç, İskandinav Dağları’nın Atlas Okyanusu’ndan gelen nemli fırtınaları batı yamaçlarında tutması nedeniyle Norveç’e göre belirgin biçimde daha kuru ve karasal bir iklime sahiptir. Kuzey yarısı (Norrland), uzun ve dondurucu geçen subarktik kışlar yaşarken yaz aylarında gece güneşiyle aydınlanır.\n\nGüney ve orta İsveç (Svealand ve Götaland) ise Baltık ve Kattegat etkileriyle daha ılıman, dört mevsimin belirgin yaşandığı nemli karasal bir rejime sahiptir. Kış yağışları kuzeyde aylarca erimeyen kalın bir kar örtüsü bırakırken güneyde tarımsal vegetasyon süresi daha uzundur.',
    after:
      'İsveç, İskandinav Dağları’nın Atlas Okyanusu’ndan gelen nemli fırtınaları batı yamaçlarında tutması nedeniyle Norveç’e göre belirgin biçimde daha kuru ve karasal bir iklime sahiptir. Kuzey yarısı (Norrland), uzun ve dondurucu geçen subarktik kışlar yaşarken yaz aylarında gece güneşiyle aydınlanır.\n\nGüney ve orta İsveç (Svealand ve Götaland) ise Baltık ve Kattegat etkileriyle daha ılıman, dört mevsimin belirgin yaşandığı nemli karasal bir rejime sahiptir. Kış yağışları kuzeyde aylarca erimeyen kalın bir kar örtüsü bırakırken güneyde ekinlerin büyüme süresi daha uzundur.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GB',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Birleşik Krallık arazisi, kuzey ve batıdaki antik, aşınmış dağlık kütleler ile güney ve doğudaki alçak tortul ovalar arasında keskin bir jeolojik tezat sergiler. İskoçya’yı ikiye bölen Highland Sınır Fayı’nın kuzeyinde kalan engebeli Highlands bölgesinde yer alan Ben Nevis (1.345 m), ülkenin en yüksek doruğudur.\n\nİngiltere’nin kuzey omurgasını Pennine Dağları kurarken, Göller Bölgesi'ndeki Scafell Pike (978 m) İngiltere'nin, Galler'deki Snowdonia masifinde yükselen Snowdon (Yr Wyddfa, 1.085 m) ise Galler’in en yüksek noktalarıdır. Güneydoğuya doğru topografya tebeşir tepeleri (downs), verimli kireçtaşı düzlükleri ve sığ kıyı vadileriyle yatışır.",
    after:
      "Birleşik Krallık arazisi, kuzey ve batıdaki antik, aşınmış dağlık kütleler ile güney ve doğudaki alçak tortul ovalar arasında keskin bir jeolojik tezat sergiler. İskoçya’yı ikiye bölen Highland Sınır Fayı’nın kuzeyinde kalan engebeli Highlands bölgesinde yer alan Ben Nevis (1.345 m), ülkenin en yüksek doruğudur.\n\nİngiltere’nin kuzey omurgasını Pennine Dağları kurarken, Göller Bölgesi'ndeki Scafell Pike (978 m) İngiltere'nin, Galler'deki Snowdonia masifinde yükselen Snowdon (Yr Wyddfa, 1.085 m) ise Galler’in en yüksek noktalarıdır. Güneydoğuya doğru topografya tebeşir tepeleri, verimli kireçtaşı düzlükleri ve sığ kıyı vadileriyle yatışır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GB',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Ülke iklimi bütünüyle, Kuzey Atlantik Akıntısı’nın ılıtıcı suları ve batıdan gelen alçak basınç cephelerinin yönettiği ılıman okyanusal rejim altındadır. Kış ayları enleme göre oldukça yumuşak, yazlar ise serin ve nemli geçer; aşırı sıcaklık dalgalanmaları seyrektir.\n\nTopografik yükselti belirgin bir yağış ayrımı üretir: Batı İskoçya dağları, Göller Bölgesi ve Galler yamaçları yılda 2.500-3.000 milimetreyi aşan şiddetli orografik yağış alırken, dağların yağmur gölgesinde kalan doğu İngiltere ve Londra havzasında yıllık yağış 600-700 milimetreye kadar geriler.',
    after:
      'Ülke iklimi bütünüyle, Kuzey Atlantik Akıntısı’nın ılıtıcı suları ve batıdan gelen alçak basınç cephelerinin yönettiği ılıman okyanusal rejim altındadır. Kış ayları enleme göre oldukça yumuşak, yazlar ise serin ve nemli geçer; aşırı sıcaklık dalgalanmaları seyrektir.\n\nTopografik yükselti belirgin bir yağış ayrımı üretir: Batı İskoçya dağları, Göller Bölgesi ve Galler yamaçları yılda 2.500-3.000 milimetreyi aşan şiddetli yamaç yağışı alırken, dağların yağmur gölgesinde kalan doğu İngiltere ve Londra havzasında yıllık yağış 600-700 milimetreye kadar geriler.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AT',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Avusturya rölyefinin ana gövdesini batıdan doğuya uzanan Doğu Alpleri meydana getirir. Kuzey Kireçtaşı Alpleri, Hohe Tauern ve Merkez Doğu Alpleri boyunca yükselen yüzlerce zirve 3.000 metreyi aşar; ülkenin en yüksek noktası olan 3.798 metrelik Grossglockner bu kristalin kuşakta yer alır. Buzul vadileri, sarp kornişler ve moren setleri bu dağlık kesimin temel morfolojisini belirler.\n\nBuna karşılık Tuna'nın kuzeyinde kalan Waldviertel ve Mühlviertel platoları, Alpler'den çok daha yaşlı olan Bohemya Masifi'nin aşınmış granit tepelerinden oluşur. Ülkenin doğu ucunda ise Viyana Havzası ve Neusiedler Gölü çevresi, Macaristan sınırında Panonya Ovası'nın alçak ve düz bozkır karakterini yansıtır.",
    after:
      "Avusturya’nın yer şekillerinin ana gövdesini batıdan doğuya uzanan Doğu Alpleri meydana getirir. Kuzey Kireçtaşı Alpleri, Hohe Tauern ve Merkez Doğu Alpleri boyunca yükselen yüzlerce zirve 3.000 metreyi aşar; ülkenin en yüksek noktası olan 3.798 metrelik Grossglockner bu kristalin kuşakta yer alır. Buzul vadileri, sarp kornişler ve moren setleri bu dağlık kesimin temel görünümünü belirler.\n\nBuna karşılık Tuna'nın kuzeyinde kalan Waldviertel ve Mühlviertel platoları, Alpler'den çok daha yaşlı olan Bohemya Masifi'nin aşınmış granit tepelerinden oluşur. Ülkenin doğu ucunda ise Viyana Havzası ve Neusiedler Gölü çevresi, Macaristan sınırında Panonya Ovası'nın alçak ve düz bozkır karakterini yansıtır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AT',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Ülke genelinde Atlantik okyanusal iklimi ile Doğu Avrupa karasal iklimi arasında belirgin bir geçiş kuşağı uzanır. Batıdaki Tirol ve Vorarlberg vadileri nemli hava kütlelerinin etkisiyle bol yağış alırken, doğuya ve Viyana çevresine doğru gidildikçe yazlar daha sıcak, kışlar ise daha kurak ve karasal bir karaktere bürünür.\n\nAlp vadilerinde dikey iklim kademelenmesi baskındır; yükseklikle birlikte sıcaklıklar hızla düşer ve kış aylarında çanak vadilerde sıcaklık terselmesi (enversiyon) gelişir. Güneyden dağları aşıp vadilere inen sıcak ve kuru fön (Föhn) rüzgarları, kış ortasında bile hızlı kar erimelerine ve ani çığ risklerine yol açar.',
    after:
      'Ülke genelinde Atlantik okyanusal iklimi ile Doğu Avrupa karasal iklimi arasında belirgin bir geçiş kuşağı uzanır. Batıdaki Tirol ve Vorarlberg vadileri nemli hava kütlelerinin etkisiyle bol yağış alırken, doğuya ve Viyana çevresine doğru gidildikçe yazlar daha sıcak, kışlar ise daha kurak ve karasal bir karaktere bürünür.\n\nAlp vadilerinde dikey iklim kademelenmesi baskındır; yükseklikle birlikte sıcaklıklar hızla düşer ve kış aylarında çanak vadilerde sıcaklık terselmesi (enversiyon) gelişir. Güneyden dağları aşıp vadilere inen sıcak ve kuru fön rüzgarları, kış ortasında bile hızlı kar erimelerine ve ani çığ risklerine yol açar.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AT',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Tuna Nehri, batıdan doğuya yaklaşık 357 kilometre boyunca ülkeyi kat ederek Avusturya hidrografyasının ana omurgasını çizer. İnn, Salzach, Enns ve Traun nehirleri Alpler'deki buzul ve kar erimelerinden beslenerek Tuna havzasına katılır; böylece ülke topraklarının neredeyse tamamı sularını doğrudan Karadeniz'e ulaştırır.\n\nSalzkammergut yöresindeki derin buzul gölleri ve batıda Vorarlberg sınırındaki Konstanz Gölü (Bodensee), Alp drenajının temiz tatlı su rezervleridir. Buna taban tabana zıt olarak doğudaki Neusiedler Gölü, derinliği bir metreyi güçlükle bulan, sazlıklarla çevrili tipik bir sığ bozkır gölü niteliği taşır.",
    after:
      "Tuna Nehri, batıdan doğuya yaklaşık 357 kilometre boyunca ülkeyi kat ederek Avusturya hidrografyasının ana omurgasını çizer. İnn, Salzach, Enns ve Traun nehirleri Alpler'deki buzul ve kar erimelerinden beslenerek Tuna havzasına katılır; böylece ülke topraklarının neredeyse tamamı sularını doğrudan Karadeniz'e ulaştırır.\n\nSalzkammergut yöresindeki derin buzul gölleri ve batıda Vorarlberg sınırındaki Konstanz Gölü (Bodensee), Alplerden inen suların oluşturduğu temiz tatlı su rezervleridir. Buna taban tabana zıt olarak doğudaki Neusiedler Gölü, derinliği bir metreyi güçlükle bulan, sazlıklarla çevrili tipik bir sığ bozkır gölü niteliği taşır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BE',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Kuzey Denizi'nden sokulan nemli batı rüzgarları Belçika genelinde ılıman ve nemli bir okyanus iklimi oluşturur. Kıyı kuşağında ve orta platolarda kışlar yumuşak, yazlar serin geçer; yıl boyu düzenli dağılan yağışlar sık bulutluluk ve sisle birleşir.\n\nGüneydoğuya ve Ardenler yaylasına doğru yükseldikçe iklim koşulları belirgin biçimde sertleşir. Yıllık yağış miktarı 1.200 milimetreyi aşarak ülkenin en yüksek seviyesine ulaşır; kış aylarında kar örtüsü platolarda haftalarca erimeden kalarak mikro-karasal bir özellik sergiler.",
    after:
      "Kuzey Denizi'nden sokulan nemli batı rüzgarları Belçika genelinde ılıman ve nemli bir okyanus iklimi oluşturur. Kıyı kuşağında ve orta platolarda kışlar yumuşak, yazlar serin geçer; yıl boyu düzenli dağılan yağışlar sık bulutluluk ve sisle birleşir.\n\nGüneydoğuya ve Ardenler yaylasına doğru yükseldikçe iklim koşulları belirgin biçimde sertleşir. Yıllık yağış miktarı 1.200 milimetreyi aşarak ülkenin en yüksek seviyesine ulaşır; kış aylarında kar örtüsü platolarda haftalarca erimeden kalarak küçük ölçekte karasal bir özellik sergiler.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'FR',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Fransa, Manş Denizi, Atlas Okyanusu ve Akdeniz arasında uzanan ve 'Altıgen' (L'Hexagone) olarak anılan anakarasının yanı sıra, Güney Amerika ve okyanuslara dağılmış denizaşırı topraklarıyla küresel bir coğrafi yayılıma sahiptir. Anakara, denizel kıyılar ile yüksek dağ silsilelerini buluşturan zengin bir jeomorfolojik mozaik sunar.\n\nFransız Guyanası üzerinden Brezilya ve Surinam ile kara sınırı paylaşan ülke, bu özelliğiyle kıtalar arası nadir bir sınır yapısına sahiptir. Başkent Paris, kuzeydeki verimli Paris Havzası'nın merkezinde, Sen Nehri'nin adacıkları etrafında stratejik bir iç su kavşağı olarak gelişmiştir.",
    after:
      "Fransa, Manş Denizi, Atlas Okyanusu ve Akdeniz arasında uzanan ve 'Altıgen' (L'Hexagone) olarak anılan anakarasının yanı sıra, Güney Amerika ve okyanuslara dağılmış denizaşırı topraklarıyla küresel bir coğrafi yayılıma sahiptir. Anakara, denizel kıyılar ile yüksek dağ silsilelerini buluşturan zengin bir yer şekli çeşitliliği sunar.\n\nFransız Guyanası üzerinden Brezilya ve Surinam ile kara sınırı paylaşan ülke, bu özelliğiyle kıtalar arası nadir bir sınır yapısına sahiptir. Başkent Paris, kuzeydeki verimli Paris Havzası'nın merkezinde, Sen Nehri'nin adacıkları etrafında stratejik bir iç su kavşağı olarak gelişmiştir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'FR',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Geniş yüzölçümü ve üç cepheden denizlerle çevrili konumu Fransa'da dört farklı iklim tipini bir araya getirir. Atlas Okyanusu ve Manş kıyılarında (Bretanya, Normandiya) yıl boyu bol yağışlı ve ılıman okyanus iklimi hüküm sürerken, iç ve doğu kesimlere (Alsace, Burgonya) gidildikçe kışları daha soğuk ve yazları daha sıcak karasal koşullar öne çıkar.\n\nGüney kıyılarında ve Korsika'da sıcak ve kurak yazlar ile ılık kışların görüldüğü Akdeniz iklimi egemendir; Rhône vadisinden güneye esen sert ve soğuk Mistral rüzgarı kıyı mikroklimasını derinden etkiler. Alpler, Pireneler ve Jura dağlarında ise yoğun kış karlarıyla belirginleşen dağ iklimi hüküm sürer.",
    after:
      "Geniş yüzölçümü ve üç cepheden denizlerle çevrili konumu Fransa'da dört farklı iklim tipini bir araya getirir. Atlas Okyanusu ve Manş kıyılarında (Bretanya, Normandiya) yıl boyu bol yağışlı ve ılıman okyanus iklimi hüküm sürerken, iç ve doğu kesimlere (Alsace, Burgonya) gidildikçe kışları daha soğuk ve yazları daha sıcak karasal koşullar öne çıkar.\n\nGüney kıyılarında ve Korsika'da sıcak ve kurak yazlar ile ılık kışların görüldüğü Akdeniz iklimi egemendir; Rhône vadisinden güneye esen sert ve soğuk Mistral rüzgarı kıyıdaki yerel iklimi derinden etkiler. Alpler, Pireneler ve Jura dağlarında ise yoğun kış karlarıyla belirginleşen dağ iklimi hüküm sürer.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'FR',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Fransa'nın akarsu ağı ülkeyi dört farklı su havzasına boşaltır. Merkez Masifi'nden doğup Atlas Okyanusu'na yönelen 1.013 kilometrelik Loire, ülkenin en uzun nehridir. Paris Havzası'nı kat ederek Manş Denizi'ne dökülen Sen Nehri ile Pireneler eteklerinden beslenip Gironde haliciyle okyanusa ulaşan Garonne, ülkenin batı drenajını tamamlar.\n\nİsviçre Alpleri'nden doğup güneye akan Rhône Nehri ise Akdeniz'e dökülen en debili akarsudur. Doğal göller Alp eteklerindeki buzul çanaklarında (Bourget ve Annecy gölleri ile paylaşılan Cenevre Gölü) toplanmıştır; tarihi Canal du Midi gibi kanallar ise okyanus ile Akdeniz'i iç sulardan birbirine bağlar.",
    after:
      "Fransa'nın akarsu ağı ülkeyi dört farklı su havzasına boşaltır. Merkez Masifi'nden doğup Atlas Okyanusu'na yönelen 1.013 kilometrelik Loire, ülkenin en uzun nehridir. Paris Havzası'nı kat ederek Manş Denizi'ne dökülen Sen Nehri ile Pireneler eteklerinden beslenip Gironde haliciyle okyanusa ulaşan Garonne, ülkenin batıdaki akarsu ağını tamamlar.\n\nİsviçre Alpleri'nden doğup güneye akan Rhône Nehri ise Akdeniz'e dökülen en debili akarsudur. Doğal göller Alp eteklerindeki buzul çanaklarında (Bourget ve Annecy gölleri ile paylaşılan Cenevre Gölü) toplanmıştır; tarihi Canal du Midi gibi kanallar ise okyanus ile Akdeniz'i iç sulardan birbirine bağlar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'LI',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Lihtenştayn, Orta Avrupa'da Alpler'in derin vadilerinden birine yerleşmiş, batısında İsviçre ile doğusunda Avusturya arasında sıkışan bir mikro-devlettir. Ren Nehri ülkenin batı sınırını baştan başa çizerken, doğu kesimi sarp Rätikon dağ silsilesinin yamaçlarına yaslanır.\n\nKomşularının da açık denizlere kıyısı bulunmaması nedeniyle Lihtenştayn, dünyada Özbekistan ile birlikte yalnızca iki 'çift karasal' (doubly landlocked) ülkeden biridir. Başkent Vaduz, Ren Vadisi tabanında, dağ yamacına kurulu tarihi prens kalesinin eteklerinde yer alır.",
    after:
      "Lihtenştayn, Orta Avrupa'da Alpler'in derin vadilerinden birine yerleşmiş, batısında İsviçre ile doğusunda Avusturya arasında sıkışan bir mikro-devlettir. Ren Nehri ülkenin batı sınırını baştan başa çizerken, doğu kesimi sarp Rätikon dağ silsilesinin yamaçlarına yaslanır.\n\nKomşularının da açık denizlere kıyısı bulunmaması nedeniyle Lihtenştayn, dünyada Özbekistan ile birlikte yalnızca iki 'çift karasal' ülkeden biridir. Başkent Vaduz, Ren Vadisi tabanında, dağ yamacına kurulu tarihi prens kalesinin eteklerinde yer alır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'LI',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      'Ülke topoğrafyası, yalnızca 25 kilometrelik bir hat üzerinde 453 metrelik Ren vadisi tabanından 2.599 metrelik Vorder Grauspitz zirvesine fırlayan dik bir eğim profiline sahiptir. Nüfusun ve tarım alanlarının toplandığı batı şeridi, alüvyal dolgularla kaplı düz bir vadi tabanından ibarettir.\n\nÜlke yüzölçümünün üçte ikisini oluşturan doğu kesimi ise Alp orojenezine ait sarp kireçtaşı kayalıklar, derin buzul çentikleri ve yüksek yaylalardan meydana gelir. Bu keskin eğim farkı, yerleşimi neredeyse tamamen vadi tabanındaki dar koridora zorlar.',
    after:
      'Ülke topoğrafyası, yalnızca 25 kilometrelik bir hat üzerinde 453 metrelik Ren vadisi tabanından 2.599 metrelik Vorder Grauspitz zirvesine fırlayan dik bir eğim profiline sahiptir. Nüfusun ve tarım alanlarının toplandığı batı şeridi, alüvyal dolgularla kaplı düz bir vadi tabanından ibarettir.\n\nÜlke yüzölçümünün üçte ikisini oluşturan doğu kesimi ise Alp dağ oluşumuna ait sarp kireçtaşı kayalıklar, derin buzul çentikleri ve yüksek yaylalardan meydana gelir. Bu keskin eğim farkı, yerleşimi neredeyse tamamen vadi tabanındaki dar koridora zorlar.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'LI',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Dar yüzölçümüne rağmen arazinin dikey basamaklanması zengin mikroklimalar doğurur. Vadi tabanında yıllık ortalama sıcaklık 9-10 derece civarında seyreder; yaz ayları serin-ılık, kışlar ise çevre Alp vadilerine kıyasla daha yumuşak geçer.\n\nİklimin en belirleyici dinamik unsuru, Alpler'in güneyinden vadiye inen sıcak ve kuru fön rüzgarıdır. Bu rüzgar kış ortasında dahi sıcaklıkları aniden yükselterek kar örtüsünü hızla eritir; vadide bağcılık yapılabilmesini sağlarken yamaçlarda çığ riskini tetikler.",
    after:
      "Dar yüzölçümüne rağmen arazinin dikey basamaklanması birbirinden farklı yerel iklimler doğurur. Vadi tabanında yıllık ortalama sıcaklık 9-10 derece civarında seyreder; yaz ayları serin-ılık, kışlar ise çevre Alp vadilerine kıyasla daha yumuşak geçer.\n\nİklimin en belirleyici dinamik unsuru, Alpler'in güneyinden vadiye inen sıcak ve kuru fön rüzgarıdır. Bu rüzgar kış ortasında dahi sıcaklıkları aniden yükselterek kar örtüsünü hızla eritir; vadide bağcılık yapılabilmesini sağlarken yamaçlarda çığ riskini tetikler.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'LU',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Lüksemburg'un doğu sınırını çizen Moselle (Mosel) Nehri, dik yamaçlarındaki bağ teraslarıyla ünlü geniş bir vadi oluşturur ve Ren havzasına bağlanır. Ülkeyi batıdan doğuya kat eden 172 kilometrelik Sûre (Sauer) Nehri ise Our, Alzette ve Wiltz kollarını toplayarak ülkenin ana iç drenaj sistemini kurar.\n\nKuzeybatıda Sûre üzerinde kurulan Haute-Sûre baraj gölü, ülkenin en büyük tatlı su rezervuarı olup içme suyu ihtiyacının önemli bir bölümünü karşılar. Başkenti ikiye bölen Alzette Nehri ise tarihi surların eteklerindeki kanyon vadiyi derinleştirerek şehre özgün morfolojisini kazandırmıştır.",
    after:
      "Lüksemburg'un doğu sınırını çizen Moselle (Mosel) Nehri, dik yamaçlarındaki bağ teraslarıyla ünlü geniş bir vadi oluşturur ve Ren havzasına bağlanır. Ülkeyi batıdan doğuya kat eden 172 kilometrelik Sûre (Sauer) Nehri ise Our, Alzette ve Wiltz kollarını toplayarak ülkenin ana akarsu ağını kurar.\n\nKuzeybatıda Sûre üzerinde kurulan Haute-Sûre baraj gölü, ülkenin en büyük tatlı su rezervuarı olup içme suyu ihtiyacının önemli bir bölümünü karşılar. Başkenti ikiye bölen Alzette Nehri ise tarihi surların eteklerindeki kanyon vadiyi derinleştirerek şehre kendine özgü görünümünü kazandırmıştır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MC',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      'Monako topraklarında sürekli akışa sahip doğal bir nehir veya göl bulunmaz. Dik yamaçlardan denize inen dar sel yatakları kentsel gelişim sürecinde bütünüyle yer altına alınmış ve kapalı drenaj hatlarına dönüştürülmüştür; Saint-Jean vadisi bu hatların en bilinenidir.\n\nKentsel tatlı su ihtiyacının tamamı komşu Fransa’daki akiferlerden ve kaynak sularından borularla taşınarak karşılanır. Ülkenin tek su cephesi, derinliği hızla artan ve iki yapay dalgakıranla korunan Hercule ve Fontvieille yat limanlarıdır.',
    after:
      'Monako topraklarında sürekli akışa sahip doğal bir nehir veya göl bulunmaz. Dik yamaçlardan denize inen dar sel yatakları kentsel gelişim sürecinde bütünüyle yer altına alınmış ve kapalı kanallara dönüştürülmüştür; Saint-Jean vadisi bu hatların en bilinenidir.\n\nKentsel tatlı su ihtiyacının tamamı komşu Fransa’daki akiferlerden ve kaynak sularından borularla taşınarak karşılanır. Ülkenin tek su cephesi, derinliği hızla artan ve iki yapay dalgakıranla korunan Hercule ve Fontvieille yat limanlarıdır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AL',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Arnavutluk, Balkan Yarımadası'nın güneybatısında, Adriyatik ile İyon denizlerinin birleştiği Otranto Boğazı eşiğinde yer alır. Kuzeyde Karadağ ve Kosova, doğuda Kuzey Makedonya, güneyde ise Yunanistan ile çevrilidir.\n\nBatıdaki alçak ve alüvyal kıyı ovaları ile doğudaki aşılması güç sarp dağ silsileleri arasında çarpıcı bir morfolojik tezat uzanır. Başkent Tiran, bu iki dünyanın kesiştiği verimli iç ovada, Dajti Dağı'nın eteklerinde kuruludur.",
    after:
      "Arnavutluk, Balkan Yarımadası'nın güneybatısında, Adriyatik ile İyon denizlerinin birleştiği Otranto Boğazı eşiğinde yer alır. Kuzeyde Karadağ ve Kosova, doğuda Kuzey Makedonya, güneyde ise Yunanistan ile çevrilidir.\n\nBatıdaki alçak ve alüvyal kıyı ovaları ile doğudaki aşılması güç sarp dağ silsileleri arasında yer şekilleri bakımından çarpıcı bir karşıtlık uzanır. Başkent Tiran, bu iki dünyanın kesiştiği verimli iç ovada, Dajti Dağı'nın eteklerinde kuruludur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AL',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      'Ülke arazisinin yüzde yetmişinden fazlasını kaplayan dağlık kütleler, Dinar orojenezinin güney uzantısı olan Helenid kıvrım kuşağına aittir. Kuzeyde yer alan Arnavut Alpleri (Prokletije), buzul vadileri, keskin sirkler ve karstik kanyonlarla örülü vahşi bir topoğrafya sunar. Kuzey Makedonya sınırında yükselen 2.764 metrelik Korab Dağı, iki ülkenin ortak çatısı olarak ülkenin en yüksek zirvesidir.\n\nBatıda Adriyatik kıyısı boyunca Myzeqe Ovası gibi geniş alüvyon düzlükleri ve sığ lagünler uzanırken, güneydeki İyon kıyıları (Arnavut Rivierası) dağların doğrudan denize indiği falezli ve dik burunlu koylarla şekillenir.',
    after:
      'Ülke arazisinin yüzde yetmişinden fazlasını kaplayan dağlık kütleler, Dinar dağ oluşumunun güney uzantısı olan Helenid kıvrım kuşağına aittir. Kuzeyde yer alan Arnavut Alpleri (Prokletije), buzul vadileri, keskin sirkler ve karstik kanyonlarla örülü vahşi bir topoğrafya sunar. Kuzey Makedonya sınırında yükselen 2.764 metrelik Korab Dağı, iki ülkenin ortak çatısı olarak ülkenin en yüksek zirvesidir.\n\nBatıda Adriyatik kıyısı boyunca Myzeqe Ovası gibi geniş alüvyon düzlükleri ve sığ lagünler uzanırken, güneydeki İyon kıyıları (Arnavut Rivierası) dağların doğrudan denize indiği falezli ve dik burunlu koylarla şekillenir.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AL',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Yüksek eğimli ve bol yağış alan dağlardan beslenen ülke akarsuları olağanüstü bir su ve enerji gücüne sahiptir. Kosova'dan gelen kolların birleşmesiyle doğan 280 kilometrelik Drin Nehri, üzerindeki kanyon barajlarıyla ülkenin elektrik üretim omurgasını oluşturur. Seman, Shkumbin ve Avrupa'nın yatağı bozulmamış son vahşi akarsularından sayılan Vjosë, batı ovalarını aşarak Adriyatik'e dökülür.\n\nArnavutluk'un göl hidrografyası tektonik sınır gölleriyle öne çıkar: Karadağ sınırındaki sığ İşkodra Gölü ile Kuzey Makedonya sınırındaki kadim ve derin Ohri Gölü ile Prespa gölleri, zengin biyolojik çeşitliliğe sahip uluslararası sulak alanlardır.",
    after:
      "Yüksek eğimli ve bol yağış alan dağlardan beslenen ülke akarsuları olağanüstü bir su ve enerji gücüne sahiptir. Kosova'dan gelen kolların birleşmesiyle doğan 280 kilometrelik Drin Nehri, üzerindeki kanyon barajlarıyla ülkenin elektrik üretim omurgasını oluşturur. Seman, Shkumbin ve Avrupa'nın yatağı bozulmamış son vahşi akarsularından sayılan Vjosë, batı ovalarını aşarak Adriyatik'e dökülür.\n\nArnavutluk'un gölleri arasında tektonik kökenli sınır gölleri öne çıkar: Karadağ sınırındaki sığ İşkodra Gölü ile Kuzey Makedonya sınırındaki kadim ve derin Ohri Gölü ile Prespa gölleri, zengin biyolojik çeşitliliğe sahip uluslararası sulak alanlardır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AD',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Yüksek dağ morfolojisi ülkenin iklim rejimini bütünüyle belirler. Kışlar uzun, dondurucu ve yoğun kar yağışlı geçer; yamaçlarda aylarca korunan kaliteli kar örtüsü, ülkeyi kış sporları ve kayak turizminin önde gelen merkezlerinden biri haline getirmiştir.\n\nYaz ayları vadilerde ılık ve güneşli geçerken, öğleden sonraları yükselen hava kütleleri ani dağ fırtınalarına ve sağanaklara neden olur; geceler en sıcak aylarda dahi serinliğini korur.',
    after:
      'Yüksek dağlık yapı ülkenin iklimini bütünüyle belirler. Kışlar uzun, dondurucu ve yoğun kar yağışlı geçer; yamaçlarda aylarca korunan kaliteli kar örtüsü, ülkeyi kış sporları ve kayak turizminin önde gelen merkezlerinden biri haline getirmiştir.\n\nYaz ayları vadilerde ılık ve güneşli geçerken, öğleden sonraları yükselen hava kütleleri ani dağ fırtınalarına ve sağanaklara neden olur; geceler en sıcak aylarda dahi serinliğini korur.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AD',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Ülke suları Valira nehir sistemi tarafından drene edilir. Kuzeydoğudan inen Valira d'Orient ile kuzeybatıdan gelen Valira del Nord dereleri Escaldes-Engordany'de birleşerek Gran Valira'yı oluşturur; bu nehir güneye akıp İspanya sınırında Segre Nehri'ne kavuşur.\n\nYüksek buzul sirklerinde eriyen karların doldurduğu 70'e yakın berrak dağ gölü serpişmiştir; Incles Vadisi'nde yer alan 21,9 hektarlık yüzeyiyle Estany de Juclar, ülkenin en büyük doğal su yüzeyidir.",
    after:
      "Ülkenin sularını Valira nehir sistemi toplar. Kuzeydoğudan inen Valira d'Orient ile kuzeybatıdan gelen Valira del Nord dereleri Escaldes-Engordany'de birleşerek Gran Valira'yı oluşturur; bu nehir güneye akıp İspanya sınırında Segre Nehri'ne kavuşur.\n\nYüksek buzul sirklerinde eriyen karların doldurduğu 70'e yakın berrak dağ gölü serpişmiştir; Incles Vadisi'nde yer alan 21,9 hektarlık yüzeyiyle Estany de Juclar, ülkenin en büyük doğal su yüzeyidir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'HR',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Kıyı kuşağı boyunca set çeken Velebit ve Biokovo dağları, Dinar Alpleri'nin kireçtaşı ve dolomitlerden oluşan klasik karst topoğrafyasını sergiler. Bosna-Hersek sınırındaki Dinara Dağı (1.831 m), ülkenin en yüksek zirvesidir. Kıyıya paralel uzanan bu dik sıradağlar, iç kesimlerle kıyı arasında aşılması güç bir orografik duvar oluşturur.\n\nKuzeydoğuya doğru ilerledikçe zemin hızla alçalır; Slavonya bölgesi, Sava, Drava ve Tuna nehirlerinin taşıdığı kalın alüvyonlarla örtülü, Pannon Havzası'nın son derece verimli, düz ve tarımsal merkezidir.",
    after:
      "Kıyı kuşağı boyunca set çeken Velebit ve Biokovo dağları, Dinar Alpleri'nin kireçtaşı ve dolomitlerden oluşan klasik karst topoğrafyasını sergiler. Bosna-Hersek sınırındaki Dinara Dağı (1.831 m), ülkenin en yüksek zirvesidir. Kıyıya paralel uzanan bu dik sıradağlar, iç kesimlerle kıyı arasında aşılması güç bir dağ duvarı oluşturur.\n\nKuzeydoğuya doğru ilerledikçe zemin hızla alçalır; Slavonya bölgesi, Sava, Drava ve Tuna nehirlerinin taşıdığı kalın alüvyonlarla örtülü, Pannon Havzası'nın son derece verimli, düz ve tarımsal merkezidir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'HR',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      'Ülke suları Karadeniz ve Adriyatik havzalarına dağılır. Doğudaki geniş Slavonya topraklarını kat eden Sava ve Drava nehirleri ile doğu sınırını çizen Tuna Nehri, zengin bir su taşımacılığı ve tarımsal sulama ağı sunar.\n\nKıyı kuşağındaki nehirler karstik arazide kısa ama gür akışlıdır; kireçtaşı kanyonlarını yaran Krka Nehri, traverten setleri ve şelaleleriyle doğrudan denize ulaşır. Dağlık iç kesimde yer alan dünyaca ünlü Plitvice Gölleri ise doğal traverten basamakları ve çağlayanlarla birbirine bağlanan 16 turkuaz karst gölünden oluşan anıtsal bir hidrolojik sistemdir.',
    after:
      'Ülke suları Karadeniz ve Adriyatik havzalarına dağılır. Doğudaki geniş Slavonya topraklarını kat eden Sava ve Drava nehirleri ile doğu sınırını çizen Tuna Nehri, zengin bir su taşımacılığı ve tarımsal sulama ağı sunar.\n\nKıyı kuşağındaki nehirler karstik arazide kısa ama gür akışlıdır; kireçtaşı kanyonlarını yaran Krka Nehri, traverten setleri ve şelaleleriyle doğrudan denize ulaşır. Dağlık iç kesimde yer alan dünyaca ünlü Plitvice Gölleri ise doğal traverten basamakları ve çağlayanlarla birbirine bağlanan 16 turkuaz karst gölünden oluşan anıtsal bir su sistemidir.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'IT',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ülke jeomorfolojisi iki büyük orojenik kuşak tarafından yönetilir. Kuzey sınırını 1.200 kilometre boyunca çizen Alpler, Fransa sınırındaki 4.810 metrelik Mont Blanc (Monte Bianco) ile Avrupa'nın en yüksek zirvesine ev sahipliği yapar; doğudaki Dolomitler ise kireçtaşı kuleleriyle dikleşir. Yarımadanın omurgasını oluşturan Apenin Dağları ise Ligurya'dan güney ucuna kadar 1.350 kilometre uzanarak yarımadayı doğu ve batı havzalarına böler; Gran Sasso kütlesindeki Corno Grande (2.912 m) bu hattın doruğudur.\n\nAlpler ile Apeninler arasına yerleşen geniş Po Ovası, İtalya'nın en zengin alüvyal tarım ve sanayi havzasıdır. Ülke ayrıca aktif Akdeniz fay kuşağında yer alır; Sicilya'daki Etna, Napoli Körfezi'ndeki Vezüv ve Aeolian Adaları'ndaki Stromboli aktif volkanizmanın belirleyici merkezleridir.",
    after:
      "Ülkenin yer şekillerini iki büyük dağ kuşağı belirler. Kuzey sınırını 1.200 kilometre boyunca çizen Alpler, Fransa sınırındaki 4.810 metrelik Mont Blanc (Monte Bianco) ile Alpler'in ve Batı Avrupa'nın en yüksek zirvesine ev sahipliği yapar; doğudaki Dolomitler ise kireçtaşı kuleleriyle dikleşir. Yarımadanın omurgasını oluşturan Apenin Dağları ise Ligurya'dan güney ucuna kadar 1.350 kilometre uzanarak yarımadayı doğu ve batı havzalarına böler; Gran Sasso kütlesindeki Corno Grande (2.912 m) bu hattın doruğudur.\n\nAlpler ile Apeninler arasına yerleşen geniş Po Ovası, İtalya'nın en zengin alüvyal tarım ve sanayi havzasıdır. Ülke ayrıca aktif Akdeniz fay kuşağında yer alır; Sicilya'daki Etna, Napoli Körfezi'ndeki Vezüv ve Aeolian Adaları'ndaki Stromboli aktif volkanizmanın belirleyici merkezleridir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'IT',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "İtalya'nın en uzun ve en debili akarsuyu, Kotya Alpleri'nden doğup 652 kilometre boyunca Po Ovası'nı katederek Adriyatik Denizi'ne devasa bir deltayla dökülen Po Nehri'dir; Alp buzul erimeleri ve kollarla beslenen nehir, tarım ve sanayinin can damarıdır. Apeninler'den beslenen Tiber (Tevere) Roma'dan geçerek Tiren Denizi'ne, Arno Nehri ise Floransa ve Pisa'dan geçerek Ligurya Denizi'ne ulaşır.\n\nKuzeydeki Alp eteklerinde buzul aşındırmasıyla oluşmuş fiyort benzeri derin göller —Garda (370 km²), Maggiore ve Como— hem taşkın düzenleyici birer su deposu hem de yumuşak mikroklimaya sahip cazibe havzalarıdır.",
    after:
      "İtalya'nın en uzun ve en debili akarsuyu, Kotya Alpleri'nden doğup 652 kilometre boyunca Po Ovası'nı katederek Adriyatik Denizi'ne devasa bir deltayla dökülen Po Nehri'dir; Alp buzul erimeleri ve kollarla beslenen nehir, tarım ve sanayinin can damarıdır. Apeninler'den beslenen Tiber (Tevere) Roma'dan geçerek Tiren Denizi'ne, Arno Nehri ise Floransa ve Pisa'dan geçerek Ligurya Denizi'ne ulaşır.\n\nKuzeydeki Alp eteklerinde buzul aşındırmasıyla oluşmuş fiyort benzeri derin göller —Garda (370 km²), Maggiore ve Como— hem taşkın düzenleyici birer su deposu hem de yumuşak yerel iklimleriyle birer çekim merkezidir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MT',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Takımadanın jeolojik yapısı bütünüyle Oligosen ve Miyosen yaşlı sarımsı kireçtaşı (globigerina) tabakalarından oluşur. Arazi genel olarak hafif dalgalı alçak platolar, taş duvarlarla örülmüş teraslı tarım sekileri ve dik kıyı falezleriyle şekillenmiştir.\n\nMalta Adası'nın güneybatı kıyısı boyunca tektonik faylanmayla oluşmuş Dingli Kayalıkları (Dingli Cliffs), 253 metrelik yüksekliğiyle takımadanın doruk noktasıdır. Karstik erime ve dalga aşındırması, kıyılarda Mavi Mağara (Blue Grotto) ve batık vadi koyları (wied) gibi zengin jeomorfolojik yapılar meydana getirmiştir.",
    after:
      "Takımadanın jeolojik yapısı bütünüyle Oligosen ve Miyosen yaşlı sarımsı kireçtaşı (globigerina) tabakalarından oluşur. Arazi genel olarak hafif dalgalı alçak platolar, taş duvarlarla örülmüş teraslı tarım sekileri ve dik kıyı falezleriyle şekillenmiştir.\n\nMalta Adası'nın güneybatı kıyısı boyunca tektonik faylanmayla oluşmuş Dingli Kayalıkları (Dingli Cliffs), 253 metrelik yüksekliğiyle takımadanın doruk noktasıdır. Karstik erime ve dalga aşındırması, kıyılarda Mavi Mağara (Blue Grotto) ve batık vadi koyları (wied) gibi zengin yer şekilleri meydana getirmiştir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'ME',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Adını yamaçlarını örten koyu çam ve kayın ormanlarından alan Karadağ ('Crna Gora'), Balkanlar'ın güneybatısında Adriyatik Denizi ile Dinar Alpleri arasına sıkışmış dikey basamaklı bir dağ ülkesidir. Hırvatistan, Bosna-Hersek, Sırbistan, Kosova ve Arnavutluk ile çevrilidir.\n\nÜlke, Adriyatik'in derin fiyort benzeri körfezi Boka Kotorska'dan 2.500 metrelik buzul zirvelerine birkaç on kilometrede tırmanan olağanüstü dik bir kabartıya sahiptir. Başkent Podgoritsa, İşkodra Gölü'nün kuzeyindeki verimli alüvyal çöküntü ovasında kuruludur.",
    after:
      "Adını yamaçlarını örten koyu çam ve kayın ormanlarından alan Karadağ ('Crna Gora'), Balkanlar'ın güneybatısında Adriyatik Denizi ile Dinar Alpleri arasına sıkışmış dikey basamaklı bir dağ ülkesidir. Hırvatistan, Bosna-Hersek, Sırbistan, Kosova ve Arnavutluk ile çevrilidir.\n\nÜlke, Adriyatik'in derin fiyort benzeri körfezi Boka Kotorska'dan 2.500 metrelik buzul zirvelerine birkaç on kilometrede tırmanan olağanüstü dik bir araziye sahiptir. Başkent Podgoritsa, İşkodra Gölü'nün kuzeyindeki verimli alüvyal çöküntü ovasında kuruludur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'ME',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Kıyı kuşağı ve Zeta Vadisi'nde sıcak, kurak yazlar ve ılık, bol yağışlı kışlarla belirginleşen Akdeniz iklimi hüküm sürer. Kıyı dağlarının denize adeta bir duvar gibi dikilmesi, denizel nemi hapsederek Avrupa'nın en olağanüstü orografik yağışlarına neden olur; Kotor Körfezi yamacındaki Crkvice mevkii, yıllık 4.500-5.000 milimetreyi bulan yağışıyla kıtanın en çok yağış alan noktasıdır.\n\nKıyıdan yalnızca birkaç kilometre içerideki yüksek dağlık kesimlerde ise deniz etkisi hızla kaybolur; yerini bol karlı, sert ve dondurucu bir dağ iklimine bırakır; Durmitor yaylalarında kar örtüsü mayıs sonuna kadar erimeden kalır.",
    after:
      "Kıyı kuşağı ve Zeta Vadisi'nde sıcak, kurak yazlar ve ılık, bol yağışlı kışlarla belirginleşen Akdeniz iklimi hüküm sürer. Kıyı dağlarının denize adeta bir duvar gibi dikilmesi, denizel nemi hapsederek Avrupa'nın en olağanüstü yamaç yağışlarına neden olur; Kotor Körfezi yamacındaki Crkvice mevkii, yıllık 4.500-5.000 milimetreyi bulan yağışıyla kıtanın en çok yağış alan noktasıdır.\n\nKıyıdan yalnızca birkaç kilometre içerideki yüksek dağlık kesimlerde ise deniz etkisi hızla kaybolur; yerini bol karlı, sert ve dondurucu bir dağ iklimine bırakır; Durmitor yaylalarında kar örtüsü mayıs sonuna kadar erimeden kalır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MK',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      'Ülke arazisi sarp dağ sıraları ile bunların arasına çökmüş tektonik graben havzalarından meydana gelir. Batı sınırında Arnavutluk ile paylaşılan 2.764 metrelik Korab Dağı ile kuzeybatıdaki heybetli Şar Dağları ülkenin en yüksek zirvelerini barındırır; doğuda ise Osogovo ve Plačkovica masifleri daha yuvarlak hatlı eski dağ kütleleridir.\n\nBu dağlık çerçeveyi kuzeybatıdan güneydoğuya yaran Vardar Vadisi ile güneybatıdaki Pelagonya Ovası, ülkenin en verimli tarım topraklarını ve nüfus yoğunluğunu barındıran düzlüklerdir.',
    after:
      'Ülke arazisi sarp dağ sıraları ile bunların arasına çökmüş tektonik çöküntü havzalarından meydana gelir. Batı sınırında Arnavutluk ile paylaşılan 2.764 metrelik Korab Dağı ile kuzeybatıdaki heybetli Şar Dağları ülkenin en yüksek zirvelerini barındırır; doğuda ise Osogovo ve Plačkovica masifleri daha yuvarlak hatlı eski dağ kütleleridir.\n\nBu dağlık çerçeveyi kuzeybatıdan güneydoğuya yaran Vardar Vadisi ile güneybatıdaki Pelagonya Ovası, ülkenin en verimli tarım topraklarını ve nüfus yoğunluğunu barındıran düzlüklerdir.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MK',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Ülke topraklarının yaklaşık beşte dördünü drene eden Vardar Nehri, Gostivar yakınlarındaki karst kaynaklarından doğup ülke içinde 301 kilometre akarak Selanik Körfezi'nden Ege'ye dökülür; Treska, Pčinja ve Bregalnica başlıca kollarıdır.\n\nÜlkenin güneybatısında yer alan ve Arnavutluk ile paylaşılan Ohri Gölü (Ohrid), 288 metreyi bulan derinliği ve 2-3 milyon yıllık yaşıyla Avrupa'nın en eski ve biyolojik açıdan en zengin tektonik göllerindendir. Hemen güneyindeki Prespa Gölü ise yeraltı karstik galerileriyle Ohri'yi besleyen bir diğer stratejik su kaynağıdır.",
    after:
      "Ülke topraklarının yaklaşık beşte dördünün sularını toplayan Vardar Nehri, Gostivar yakınlarındaki karst kaynaklarından doğup ülke içinde 301 kilometre akarak Selanik Körfezi'nden Ege'ye dökülür; Treska, Pčinja ve Bregalnica başlıca kollarıdır.\n\nÜlkenin güneybatısında yer alan ve Arnavutluk ile paylaşılan Ohri Gölü (Ohrid), 288 metreyi bulan derinliği ve 2-3 milyon yıllık yaşıyla Avrupa'nın en eski ve biyolojik açıdan en zengin tektonik göllerindendir. Hemen güneyindeki Prespa Gölü ise yeraltı karstik galerileriyle Ohri'yi besleyen bir diğer stratejik su kaynağıdır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'PT',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Tejo Nehri'nin kuzeyinde zemin engebeli granit masifleri ve şist platolarıyla yükselir; anakara Portekiz'in en yüksek noktası olan Torre zirvesi (1.993 m), Serra da Estrela sıradağlarında yer alır. Douro Nehri vadisi boyunca uzanan teraslanmış dik şist yamaçları, insan emeğiyle şekillendirilmiş anıtsal bir kültürel peyzaj sunar.\n\nTejo'nun güneyinde arazi alçalarak Alentejo'nun mantar meşesi ve zeytinliklerle kaplı dalgalı peneplenlerine dönüşür. En güneydeki Algarve ise kireçtaşı falezleri ve kumsallarıyla okyanusa kavuşur. Ülkenin mutlak en yüksek zirvesi ise anakarada değil, Azorlar'daki Pico Adası'nda denizden dimdik 2.351 metreye fırlayan volkan konisidir (Ponta do Pico).",
    after:
      "Tejo Nehri'nin kuzeyinde zemin engebeli granit masifleri ve şist platolarıyla yükselir; anakara Portekiz'in en yüksek noktası olan Torre zirvesi (1.993 m), Serra da Estrela sıradağlarında yer alır. Douro Nehri vadisi boyunca uzanan teraslanmış dik şist yamaçları, insan emeğiyle şekillendirilmiş anıtsal bir kültürel peyzaj sunar.\n\nTejo'nun güneyinde arazi alçalarak Alentejo'nun mantar meşesi ve zeytinliklerle kaplı dalgalı aşınım düzlüklerine (peneplen) dönüşür. En güneydeki Algarve ise kireçtaşı falezleri ve kumsallarıyla okyanusa kavuşur. Ülkenin mutlak en yüksek zirvesi ise anakarada değil, Azorlar'daki Pico Adası'nda denizden dimdik 2.351 metreye fırlayan volkan konisidir (Ponta do Pico).",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'PT',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Ülke iklimi Atlas Okyanusu ile Akdeniz dinamiklerinin dengesine dayanır. Kuzeybatı kesimi (Minho), okyanusal nemli hava kütlelerinin etkisiyle bol yağış alır; bazı dağ yamaçlarında yıllık yağış 2.500-3.000 milimetreyi aşarak Avrupa'nın en nemli köşelerinden birini oluşturur.\n\nGüneye ve doğu iç kesimlere inildikçe yağışlar hızla azalır ve kuraklık dönemi uzar. Alentejo ovalarında yazlar 40°C'yi aşan kavurucu sıcaklara sahne olurken kışlar ılımandır. Azor Takımadası yıl boyu ılıman ve son derece nemli okyanus iklimine, Madeira ise subtropikal ılıman bir rejime sahiptir.",
    after:
      "Ülke iklimi Atlas Okyanusu ile Akdeniz etkilerinin dengesine dayanır. Kuzeybatı kesimi (Minho), okyanusal nemli hava kütlelerinin etkisiyle bol yağış alır; bazı dağ yamaçlarında yıllık yağış 2.500-3.000 milimetreyi aşarak Avrupa'nın en nemli köşelerinden birini oluşturur.\n\nGüneye ve doğu iç kesimlere inildikçe yağışlar hızla azalır ve kuraklık dönemi uzar. Alentejo ovalarında yazlar 40°C'yi aşan kavurucu sıcaklara sahne olurken kışlar ılımandır. Azor Takımadası yıl boyu ılıman ve son derece nemli okyanus iklimine, Madeira ise subtropikal ılıman bir rejime sahiptir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SM',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Yüzölçümünün küçüklüğü ve kireçtaşı zemin nedeniyle ülkede doğal göl veya büyük bir nehir bulunmaz; sular Titano yamaçlarından doğan derelerle drene edilir.\n\nAusa Deresi kuzeye yönelerek Adriyatik'e dökülürken, San Marino Deresi batı sınırını takip edip Marecchia Nehri'ne karışır; doğudaki Marano Deresi ise doğrudan denize akar. Ülkenin tatlı su ihtiyacı İtalya ile yapılan ortak altyapı protokolleri ve yerel kuyularla güvence altına alınır.",
    after:
      "Yüzölçümünün küçüklüğü ve kireçtaşı zemin nedeniyle ülkede doğal göl veya büyük bir nehir bulunmaz; suları Titano yamaçlarından doğan dereler taşır.\n\nAusa Deresi kuzeye yönelerek Adriyatik'e dökülürken, San Marino Deresi batı sınırını takip edip Marecchia Nehri'ne karışır; doğudaki Marano Deresi ise doğrudan denize akar. Ülkenin tatlı su ihtiyacı İtalya ile yapılan ortak altyapı protokolleri ve yerel kuyularla güvence altına alınır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'RS',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Balkan Yarımadası'nın kalbinde ve Pannon Havzası'nın güney eşiğinde yer alan Sırbistan, denize kıyısı bulunmayan, Orta ve Güneydoğu Avrupa'nın kilit bir kavşak ülkesidir. Kuzeyde Macaristan, doğuda Romanya ve Bulgaristan, güneyde Kuzey Makedonya, batıda ise Karadağ, Bosna-Hersek ve Hırvatistan ile çevrilidir.\n\nÜlke, kuzeydeki uçsuz bucaksız alüvyal ovalar ile güneydeki dağlık ve ormanlık yaylalar arasında belirgin bir morfolojik tezat sergiler. Başkent Belgrad, Sava ve Tuna nehirlerinin kavuştuğu stratejik platoda, bu iki jeomorfolojik dünyanın tam eşiğinde kuruludur.",
    after:
      "Balkan Yarımadası'nın kalbinde ve Pannon Havzası'nın güney eşiğinde yer alan Sırbistan, denize kıyısı bulunmayan, Orta ve Güneydoğu Avrupa'nın kilit bir kavşak ülkesidir. Kuzeyde Macaristan, doğuda Romanya ve Bulgaristan, güneyde Kuzey Makedonya, batıda ise Karadağ, Bosna-Hersek ve Hırvatistan ile çevrilidir.\n\nÜlke, kuzeydeki uçsuz bucaksız alüvyal ovalar ile güneydeki dağlık ve ormanlık yaylalar arasında belirgin bir yer şekli karşıtlığı sergiler. Başkent Belgrad, Sava ve Tuna nehirlerinin kavuştuğu stratejik platoda, bu iki farklı arazinin tam eşiğinde kuruludur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BY',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Belarus rölyefinin ana hatları, Pleistosen döneminde kuzeyden ilerleyen devasa İskandinav buzullarının aşındırma ve biriktirme süreçleriyle şekillenmiştir. Buzulların erirken geride bıraktığı moren yığınları, ülkeyi güneybatıdan kuzeydoğuya çapraz kesen Belarus Sırtı'nı meydana getirir; Minsk'in batısında yükselen 345 metrelik Dzyarzhynskaya Hara, ülkenin en yüksek noktasını oluşturmasına karşın çevresinden yalnızca tatlı bir eğimle ayrılır.\n\nÜlkenin güney yarısında, Pripyat Nehri havzasında uzanan Polesya bölgesi ise Avrupa'nın en geniş ve bakir bataklık havzasıdır. Düşük eğim nedeniyle suları tahliye edemeyen bu devasa çöküntü alanı; menderesli kollar, ölü nehir yatakları, turbalıklar ve taşkın ormanlarıyla örülü uçsuz bucaksız bir sulak labirent görünümündedir. Batı sınırındaki Białowieża (Belovejskaya Puşça) ise Avrupa ovalarının son kadim ova ormanını ve bizon popülasyonunu barındırır.",
    after:
      "Belarus’un yer şekillerinin ana hatları, Pleistosen döneminde kuzeyden ilerleyen devasa İskandinav buzullarının aşındırma ve biriktirme süreçleriyle şekillenmiştir. Buzulların erirken geride bıraktığı moren yığınları, ülkeyi güneybatıdan kuzeydoğuya çapraz kesen Belarus Sırtı'nı meydana getirir; Minsk'in batısında yükselen 345 metrelik Dzyarzhynskaya Hara, ülkenin en yüksek noktasını oluşturmasına karşın çevresinden yalnızca tatlı bir eğimle ayrılır.\n\nÜlkenin güney yarısında, Pripyat Nehri havzasında uzanan Polesya bölgesi ise Avrupa'nın en geniş ve bakir bataklık havzasıdır. Düşük eğim nedeniyle suları tahliye edemeyen bu devasa çöküntü alanı; menderesli kollar, ölü nehir yatakları, turbalıklar ve taşkın ormanlarıyla örülü uçsuz bucaksız bir sulak labirent görünümündedir. Batı sınırındaki Białowieża (Belovejskaya Puşça) ise Avrupa ovalarının son kadim ova ormanını ve bizon popülasyonunu barındırır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BY',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Ülkede, Baltık Denizi'nin ılımanlaştırıcı denizel etkisi ile doğudaki geniş Avrasya kara kütlesinin sertliği arasında geçiş özelliği gösteren ılıman karasal iklim hüküm sürer. Kış ayları soğuk ve yoğun bulutlu geçer; Atlantik kaynaklı siklonların getirdiği nem, sıcaklıkları sıfırın altında tutarken ülkeyi uzun süreli bir kar örtüsüyle kaplar.\n\nKar yerde kalma süresi güneybatıdaki 70-80 günden, Sibirya yüksek basıncının etkisine daha açık olan kuzeydoğuda 120 günün üzerine çıkar. Yaz mevsimi ise ılık, nemli ve sağanak yağışlıdır; yıllık toplam yağışın yaklaşık üçte ikisi tarımsal vejetasyonun en canlı olduğu nisan-ekim döneminde düşer.",
    after:
      "Ülkede, Baltık Denizi'nin ılımanlaştırıcı denizel etkisi ile doğudaki geniş Avrasya kara kütlesinin sertliği arasında geçiş özelliği gösteren ılıman karasal iklim hüküm sürer. Kış ayları soğuk ve yoğun bulutlu geçer; Atlantik kaynaklı siklonların getirdiği nem, sıcaklıkları sıfırın altında tutarken ülkeyi uzun süreli bir kar örtüsüyle kaplar.\n\nKar yerde kalma süresi güneybatıdaki 70-80 günden, Sibirya yüksek basıncının etkisine daha açık olan kuzeydoğuda 120 günün üzerine çıkar. Yaz mevsimi ise ılık, nemli ve sağanak yağışlıdır; yıllık toplam yağışın yaklaşık üçte ikisi ekinlerin en hızlı büyüdüğü nisan-ekim döneminde düşer.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BG',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Balkan Yarımadası'nın doğusunda, Avrupa ile Anadolu arasındaki tarihsel kara köprüsünün üzerinde yer alan Bulgaristan; kuzeyde Tuna Nehri hattıyla Romanya'dan ayrılır, batıda Sırbistan ve Kuzey Makedonya, güneyinde Yunanistan ve Türkiye ile komşudur, doğuda ise Karadeniz'e açılır.\n\nÜlke, kuzeydeki bereketli lös platolarından güneydeki sarp buzul zirvelerine kadar basamaklar halinde yükselen belirgin bir morfolojik çeşitlilik sunar. Başkent Sofya, batıda dağ sıralarıyla çevrili korunaklı bir havzada, stratejik geçiş yollarının kesişim noktasında kuruludur.",
    after:
      "Balkan Yarımadası'nın doğusunda, Avrupa ile Anadolu arasındaki tarihsel kara köprüsünün üzerinde yer alan Bulgaristan; kuzeyde Tuna Nehri hattıyla Romanya'dan ayrılır, batıda Sırbistan ve Kuzey Makedonya, güneyinde Yunanistan ve Türkiye ile komşudur, doğuda ise Karadeniz'e açılır.\n\nÜlke, kuzeydeki bereketli lös platolarından güneydeki sarp buzul zirvelerine kadar basamaklar halinde yükselen belirgin bir yer şekli çeşitliliği sunar. Başkent Sofya, batıda dağ sıralarıyla çevrili korunaklı bir havzada, stratejik geçiş yollarının kesişim noktasında kuruludur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BG',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Bulgaristan topoğrafyasının omurgasını, ülkeyi batıdan doğuya boydan boya kateden Balkan Dağları (Stara Planina) oluşturur. Yaklaşık 560 kilometre boyunca uzanan ve en yüksek noktası 2.376 metrelik Botev Tepesi olan bu silsile, kuzeydeki verimli Tuna Platosu ile güneydeki Yukarı Trakya Düzlüğü arasında hem fiziki hem iklimsel aşılmaz bir set çeker.\n\nGüneybatıya doğru yükselti keskin biçimde artar; Balkan Yarımadası'nın en yüksek doruğu olan 2.925 metrelik Musala Zirvesi'ni barındıran Rila Dağları ile komşusu Pirin, buzul aşındırmasıyla yontulmuş sarp sirkleri ve kristal buzul gölleriyle görkemli bir alp morfolojisi sergiler. Daha güneyde ise Türkiye ve Yunanistan sınırına yaslanan, karstik mağaraları, derin kanyonları ve geniş ormanlarıyla tanınan eski masif kütlesi Rodop Dağları uzanır.",
    after:
      "Bulgaristan topoğrafyasının omurgasını, ülkeyi batıdan doğuya boydan boya kateden Balkan Dağları (Stara Planina) oluşturur. Yaklaşık 560 kilometre boyunca uzanan ve en yüksek noktası 2.376 metrelik Botev Tepesi olan bu silsile, kuzeydeki verimli Tuna Platosu ile güneydeki Yukarı Trakya Düzlüğü arasında hem fiziki hem iklimsel aşılmaz bir set çeker.\n\nGüneybatıya doğru yükselti keskin biçimde artar; Balkan Yarımadası'nın en yüksek doruğu olan 2.925 metrelik Musala Zirvesi'ni barındıran Rila Dağları ile komşusu Pirin, buzul aşındırmasıyla yontulmuş sarp sirkleri ve kristal buzul gölleriyle görkemli bir yüksek dağ görünümü sergiler. Daha güneyde ise Türkiye ve Yunanistan sınırına yaslanan, karstik mağaraları, derin kanyonları ve geniş ormanlarıyla tanınan eski masif kütlesi Rodop Dağları uzanır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BG',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Ülkede iklim, Stara Planina sıradağlarının oluşturduğu orografik bariyer nedeniyle iki belirgin karaktere ayrılır. Dağların kuzeyinde kalan Tuna Ovası, Rusya üzerinden sokulan dondurucu rüzgarlara açık olduğundan sert karasal koşullar yaşar; kışlar çok soğuk ve karlı, yazlar ise sıcak geçer.\n\nSıradağların güneyine geçildiğinde soğuk hava akımları kesilir ve Ege Denizi'nden vadi oluklarıyla sokulan sıcak hava sayesinde ılımanlaşma başlar; Yukarı Trakya Ovası ile Rodop eteklerinde Akdeniz geçiş iklimi egemen olur ve bağcılık ile gül tarımı için elverişli koşullar doğar. Karadeniz kıyı kuşağında ise denizel etki kışları yumuşatırken sonbahar aylarını daha ılık hale getirir.",
    after:
      "Ülkede iklim, Stara Planina sıradağlarının oluşturduğu dağ engeli nedeniyle iki belirgin karaktere ayrılır. Dağların kuzeyinde kalan Tuna Ovası, Rusya üzerinden sokulan dondurucu rüzgarlara açık olduğundan sert karasal koşullar yaşar; kışlar çok soğuk ve karlı, yazlar ise sıcak geçer.\n\nSıradağların güneyine geçildiğinde soğuk hava akımları kesilir ve Ege Denizi'nden vadi oluklarıyla sokulan sıcak hava sayesinde ılımanlaşma başlar; Yukarı Trakya Ovası ile Rodop eteklerinde Akdeniz geçiş iklimi egemen olur ve bağcılık ile gül tarımı için elverişli koşullar doğar. Karadeniz kıyı kuşağında ise denizel etki kışları yumuşatırken sonbahar aylarını daha ılık hale getirir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BG',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Bulgaristan toprakları Karadeniz ve Ege Denizi olmak üzere iki büyük hidrolojik havzaya bölünür. Kuzey sınırının büyük bölümünü çizen Tuna Nehri, İskır (Iskar) gibi nehirlerle beslenir; Balkan Dağları'nı derin bir kanyonla boydan boya yaran tek akarsu olan İskır, Sofya Havzası'nın sularını Tuna'ya taşır.\n\nÜlkenin güney ve orta kesimlerindeki sular ise Rila Dağları'ndan doğan Meriç (Maritsa) ve Arda nehirleri aracılığıyla güneye, Ege Denizi'ne yönelir. Doğuda Rezve (Rezovska) Deresi'ne kadar uzanan yaklaşık 378 kilometrelik Karadeniz kıyısı; kuzeyde dik falezler ve Kaliakra Burnu ile başlarken, güneye doğru geniş kumul plajları, kıyı gölleri ve lagünlerle çeşitlenir.",
    after:
      "Bulgaristan toprakları Karadeniz ve Ege Denizi olmak üzere iki büyük su havzasına bölünür. Kuzey sınırının büyük bölümünü çizen Tuna Nehri, İskır (Iskar) gibi nehirlerle beslenir; Balkan Dağları'nı derin bir kanyonla boydan boya yaran tek akarsu olan İskır, Sofya Havzası'nın sularını Tuna'ya taşır.\n\nÜlkenin güney ve orta kesimlerindeki sular ise Rila Dağları'ndan doğan Meriç (Maritsa) ve Arda nehirleri aracılığıyla güneye, Ege Denizi'ne yönelir. Doğuda Rezve (Rezovska) Deresi'ne kadar uzanan yaklaşık 378 kilometrelik Karadeniz kıyısı; kuzeyde dik falezler ve Kaliakra Burnu ile başlarken, güneye doğru geniş kumul plajları, kıyı gölleri ve lagünlerle çeşitlenir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CZ',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Çekya, sularını üç farklı açık denize gönderen benzersiz bir hidrolojik kavşaktır; Kralický Sněžník dağındaki tek bir doruk noktası bile Kuzey Denizi, Baltık ve Karadeniz havzalarını birbirinden ayırır. Şumava'dan doğarak Prag'ın kalbinden geçen 430 kilometrelik Vltava, Mělník'te Elbe (Labe) ile birleşir ve Kuzey Denizi'ne yönelen ana su yolunu kurar.\n\nMoravya bölgesinin suları güneye akıp Tuna'ya katılarak Karadeniz'e ulaşan Morava Nehri ile boşalırken, ülkenin kuzeydoğusundaki sular Oder (Odra) üzerinden Baltık Denizi'ne taşınır. Doğal derin göllerin az olduğu ülkede, Güney Bohemya'daki Třeboň havzası başta olmak üzere Orta Çağ'dan bu yana sazan yetiştiriciliği ve taşkın kontrolü için inşa edilmiş binlerce yapay gölet, eşsiz bir kültürel sulak alan peyzajı oluşturur.",
    after:
      "Çekya, sularını üç farklı açık denize gönderen benzersiz bir su kavşağıdır; Kralický Sněžník dağındaki tek bir doruk noktası bile Kuzey Denizi, Baltık ve Karadeniz havzalarını birbirinden ayırır. Şumava'dan doğarak Prag'ın kalbinden geçen 430 kilometrelik Vltava, Mělník'te Elbe (Labe) ile birleşir ve Kuzey Denizi'ne yönelen ana su yolunu kurar.\n\nMoravya bölgesinin suları güneye akıp Tuna'ya katılarak Karadeniz'e ulaşan Morava Nehri ile boşalırken, ülkenin kuzeydoğusundaki sular Oder (Odra) üzerinden Baltık Denizi'ne taşınır. Doğal derin göllerin az olduğu ülkede, Güney Bohemya'daki Třeboň havzası başta olmak üzere Orta Çağ'dan bu yana sazan yetiştiriciliği ve taşkın kontrolü için inşa edilmiş binlerce yapay gölet, eşsiz bir kültürel sulak alan peyzajı oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MD',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Moldova hidrolojisi iki büyük sınır nehrinin kontrolündedir. Batı sınırının tamamını boydan boya çizen Prut Nehri, Romanya ile doğal bir ayrım oluşturarak güneyde Tuna'ya katılır; doğuda ise Ukrayna sınırını ve Transdinyester bölgesini kat eden Dinyester (Nistru), ülkenin en gür debili iç su yoludur.\n\nTransdinyester, uluslararası hukukta tartışmasız biçimde Moldova toprağıdır. 1990-92 Dinyester Savaşı'nın ardından bölgeyi fiilen ayrı bir yönetim idare eder; bu yönetimin bağımsızlığını Rusya dahil hiçbir ülke tanımaz. Bölgede konuşlu Rus askerî birlikleri, Moldova tarafından hukuka aykırı sayılır.\n\nÜlkenin güney ucunda Tuna Nehri ile Prut'un birleştiği noktada yer alan Giurgiuleşti Limanı, Moldova'nın açık denizlere açılan yegane uluslararası liman kapısıdır. Derin vadiler boyunca açılmış küçük göletler ve baraj rezervuarları yerel sulama ihtiyacını karşılarken, geniş kireçtaşı akiferleri ülkenin maden ve artezyen suları açısından zengin bir yeraltı hidrolojisine sahip olmasını sağlar.",
    after:
      "Moldova’nın akarsuları iki büyük sınır nehrine bağlıdır. Batı sınırının tamamını boydan boya çizen Prut Nehri, Romanya ile doğal bir ayrım oluşturarak güneyde Tuna'ya katılır; doğuda ise Ukrayna sınırını ve Transdinyester bölgesini kat eden Dinyester (Nistru), ülkenin en gür debili iç su yoludur.\n\nTransdinyester, uluslararası hukukta tartışmasız biçimde Moldova toprağıdır. 1990-92 Dinyester Savaşı'nın ardından bölgeyi fiilen ayrı bir yönetim idare eder; bu yönetimin bağımsızlığını Rusya dahil hiçbir ülke tanımaz. Bölgede konuşlu Rus askerî birlikleri, Moldova tarafından hukuka aykırı sayılır.\n\nÜlkenin güney ucunda Tuna Nehri ile Prut'un birleştiği noktada yer alan Giurgiuleşti Limanı, Moldova'nın açık denizlere açılan yegane uluslararası liman kapısıdır. Derin vadiler boyunca açılmış küçük göletler ve baraj rezervuarları yerel sulama ihtiyacını karşılarken, geniş kireçtaşı akiferleri ülkenin maden ve artezyen suları açısından zengin yeraltı sularına sahip olmasını sağlar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'PL',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Polonya rölyefi güneyden kuzeye doğru birbirine paralel uzanan belirgin jeomorfolojik kuşaklar sergiler. En kuzeydeki Baltık kıyı şeridi; fırtınalarla sürüklenen kumların oluşturduğu Hel Yarımadası, kıyı kordonları, lagünler ve hareketli kumullarla örtülüdür. Kıyının hemen güneyinde, Son Buzul Çağı'nın erimesiyle biçimlenmiş binlerce moren gölünü barındıran Pomeranya ve Mazurya Göller Bölgeleri uzanır.\n\nÜlkenin orta kesimini verimli tarım topraklarıyla kaplı geniş Mazovya ve Büyük Polonya ovaları doldurur. Güneye inildikçe kireçtaşı platolarıyla yükselen arazi, Slovakya sınırında görkemli bir alp morfolojisine bürünür; granit dorukları ve buzul sirkleriyle yükselen Yüksek Tatra kütlesindeki 2.499 metrelik Rysy zirvesi, Polonya'nın en yüksek noktasını oluşturur. Güneybatıda ise daha yaşlı, aşınmış ve zengin kömür havzalarına sahip Sudetler yer alır.",
    after:
      "Polonya’nın yer şekilleri güneyden kuzeye doğru birbirine paralel uzanan belirgin kuşaklar sergiler. En kuzeydeki Baltık kıyı şeridi; fırtınalarla sürüklenen kumların oluşturduğu Hel Yarımadası, kıyı kordonları, lagünler ve hareketli kumullarla örtülüdür. Kıyının hemen güneyinde, Son Buzul Çağı'nın erimesiyle biçimlenmiş binlerce moren gölünü barındıran Pomeranya ve Mazurya Göller Bölgeleri uzanır.\n\nÜlkenin orta kesimini verimli tarım topraklarıyla kaplı geniş Mazovya ve Büyük Polonya ovaları doldurur. Güneye inildikçe kireçtaşı platolarıyla yükselen arazi, Slovakya sınırında görkemli bir yüksek dağ görünümüne bürünür; granit dorukları ve buzul sirkleriyle yükselen Yüksek Tatra kütlesindeki 2.499 metrelik Rysy zirvesi, Polonya'nın en yüksek noktasını oluşturur. Güneybatıda ise daha yaşlı, aşınmış ve zengin kömür havzalarına sahip Sudetler yer alır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'PL',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Polonya topraklarının neredeyse tamamı Baltık Denizi havzasına aittir ve ülke hidrolojisi iki dev akarsu arteri tarafından kontrol edilir. Karpatlar'ın yamaçlarından doğup Kraków ve Varşova'yı geçerek Gdańsk Körfezi'nde Baltık'a dökülen 1.047 kilometrelik Vistül (Wisła), ülkenin tarihsel ve coğrafi omurgasıdır.\n\nBatıda Almanya ile sınırın önemli bir bölümünü oluşturan Oder (Odra) ve kolu Warta, batı ovalarının sularını Szczecin Lagünü üzerinden denize taşır. Kuzeydoğuda yer alan ve \"Bin Göller Diyarı\" olarak anılan Mazurya Bölgesi ise Śniardwy ve Mamry gibi ülkenin en geniş göllerini birbirine bağlayan nehir ve kanal ağlarıyla benzersiz bir sulak ekosistem meydana getirir.",
    after:
      "Polonya topraklarının neredeyse tamamı Baltık Denizi havzasına aittir ve ülkenin sularını iki dev akarsu toplar. Karpatlar'ın yamaçlarından doğup Kraków ve Varşova'yı geçerek Gdańsk Körfezi'nde Baltık'a dökülen 1.047 kilometrelik Vistül (Wisła), ülkenin tarihsel ve coğrafi omurgasıdır.\n\nBatıda Almanya ile sınırın önemli bir bölümünü oluşturan Oder (Odra) ve kolu Warta, batı ovalarının sularını Szczecin Lagünü üzerinden denize taşır. Kuzeydoğuda yer alan ve \"Bin Göller Diyarı\" olarak anılan Mazurya Bölgesi ise Śniardwy ve Mamry gibi ülkenin en geniş göllerini birbirine bağlayan nehir ve kanal ağlarıyla benzersiz bir sulak ekosistem meydana getirir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'RU',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Rusya topoğrafyası batıdan doğuya basamaklanan devasa morfolojik kuşaklardan meydana gelir. Avrupa kesimini kaplayan dalgalı Doğu Avrupa Ovası, doğuda Avrupa ile Asya'nın geleneksel sınırı kabul edilen ve 1.895 metrelik Narodnaya doruğuna ulaşan aşınmış Ural Dağları ile kesilir. Ural'ın ötesinde, dünyanın en geniş ve kesintisiz alüvyal düzlüğü olan, bataklık ve nehir labirentleriyle kaplı Batı Sibirya Ovası uzanır.\n\nYenisey Nehri'nin doğusuna geçildiğinde arazi, derin kanyonlarla yarılmış eski bir bazalt kalkanı olan Orta Sibirya Platosu'na yükselir; daha doğuda ise Pasifik Ateş Çemberi'nin genç ve sarp silsileleri başlar. Kamçatka Yarımadası'ndaki Klyuçevskaya Sopka gibi onlarca aktif stratovolkan kıtanın doğu ucunu şekillendirir. Ülkenin güney sınırında, Kafkas Dağları üzerinde yükselen 5.642 metrelik çift konili Elbruz Dağı ise hem Rusya'nın hem de tüm Avrupa kıtasının en yüksek zirvesidir.",
    after:
      "Rusya topoğrafyası batıdan doğuya basamaklanan devasa yer şekli kuşaklarından meydana gelir. Avrupa kesimini kaplayan dalgalı Doğu Avrupa Ovası, doğuda Avrupa ile Asya'nın geleneksel sınırı kabul edilen ve 1.895 metrelik Narodnaya doruğuna ulaşan aşınmış Ural Dağları ile kesilir. Ural'ın ötesinde, dünyanın en geniş ve kesintisiz alüvyal düzlüğü olan, bataklık ve nehir labirentleriyle kaplı Batı Sibirya Ovası uzanır.\n\nYenisey Nehri'nin doğusuna geçildiğinde arazi, derin kanyonlarla yarılmış eski bir bazalt kalkanı olan Orta Sibirya Platosu'na yükselir; daha doğuda ise Pasifik Ateş Çemberi'nin genç ve sarp silsileleri başlar. Kamçatka Yarımadası'ndaki Klyuçevskaya Sopka gibi onlarca aktif stratovolkan kıtanın doğu ucunu şekillendirir. Ülkenin güney sınırında, Kafkas Dağları üzerinde yükselen 5.642 metrelik çift konili Elbruz Dağı ise hem Rusya'nın hem de tüm Avrupa kıtasının en yüksek zirvesidir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SK',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Batı Karpatlar'ın sarp dağ kütleleri ile Pannon Havzası'nın kuzey eşiği arasında sıkışan Slovakya; dağlık peyzajı, derin kanyonları ve zengin yeraltı mağara sistemleriyle karakterize olan bir Orta Avrupa ülkesidir. Denize çıkışı bulunmayan ülke; Çekya, Polonya, Ukrayna, Macaristan ve Avusturya ile çevrilidir.\n\nÜlke, kuzeydeki heybetli alp doruklarından güneydeki verimli Tuna ovalarına doğru basamak basamak alçalan bir topoğrafyaya sahiptir. Başkent Bratislava, ülkenin en güneybatı ucunda, Tuna Nehri kıyısında Avusturya ve Macaristan sınırlarının kesiştiği noktada kurulu olup iki bağımsız ülkeyle doğrudan komşu olan dünyadaki yegane başkenttir.",
    after:
      "Batı Karpatlar'ın sarp dağ kütleleri ile Pannon Havzası'nın kuzey eşiği arasında sıkışan Slovakya; dağlık manzarası, derin kanyonları ve zengin yeraltı mağara sistemleriyle öne çıkan bir Orta Avrupa ülkesidir. Denize çıkışı bulunmayan ülke; Çekya, Polonya, Ukrayna, Macaristan ve Avusturya ile çevrilidir.\n\nÜlke, kuzeydeki heybetli alp doruklarından güneydeki verimli Tuna ovalarına doğru basamak basamak alçalan bir topoğrafyaya sahiptir. Başkent Bratislava, ülkenin en güneybatı ucunda, Tuna Nehri kıyısında Avusturya ve Macaristan sınırlarının kesiştiği noktada kurulu olup iki bağımsız ülkeyle doğrudan komşu olan dünyadaki yegane başkenttir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SK',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      'Slovakya topraklarının büyük bölümünü kaplayan Karpat yayı, kuzey sınırında kıtanın en kompakt yüksek dağ arazisi olan Yüksek Tatra (Vysoké Tatry) ile zirveye ulaşır. Tüm Karpat dağ sisteminin de en yüksek doruğu olan 2.655 metrelik Gerlachovský štít; buzul aşındırmasıyla bilenmiş sivri granit kuleleri, sarp buzul çanakları ve yüzü aşkın buzul dağ gölüyle (pleso) gerçek bir alp morfolojisi sergiler.\n\nDağların güneyine doğru uzanan Alçak Tatra ve tarihi madencilik geçmişiyle bilinen Slovak Cevher Dağları (Slovenské rudohorie) dalgalı yaylalar oluştururken, Slovak Cenneti (Slovenský raj) derin karstik kanyonlar, şelaleler ve buz mağaralarıyla yarılmıştır. Ülkenin güney kuşağında ise Tuna ve kolları tarafından biriktirilmiş lös ve alüvyonlarla kaplı, bağcılık ve tarımın yoğunlaştığı düz Tuna Ovası (Podunajská nížina) uzanır.',
    after:
      'Slovakya topraklarının büyük bölümünü kaplayan Karpat yayı, kuzey sınırında kıtanın en toplu yüksek dağ arazisi olan Yüksek Tatra (Vysoké Tatry) ile zirveye ulaşır. Tüm Karpat dağ sisteminin de en yüksek doruğu olan 2.655 metrelik Gerlachovský štít; buzul aşındırmasıyla bilenmiş sivri granit kuleleri, sarp buzul çanakları ve yüzü aşkın buzul dağ gölüyle (pleso) gerçek bir yüksek dağ görünümü sergiler.\n\nDağların güneyine doğru uzanan Alçak Tatra ve tarihi madencilik geçmişiyle bilinen Slovak Cevher Dağları (Slovenské rudohorie) dalgalı yaylalar oluştururken, Slovak Cenneti (Slovenský raj) derin karstik kanyonlar, şelaleler ve buz mağaralarıyla yarılmıştır. Ülkenin güney kuşağında ise Tuna ve kolları tarafından biriktirilmiş lös ve alüvyonlarla kaplı, bağcılık ve tarımın yoğunlaştığı düz Tuna Ovası (Podunajská nížina) uzanır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SK',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Ülkede iklim koşulları dikey yükselti basamaklarına sıkı sıkıya bağlıdır. Kuzeydeki dağlık kuşakta sert alp iklimi hüküm sürer; kışlar uzun, dondurucu ve yoğun kar yağışlı geçer, Tatra doruklarında kar örtüsü yılın yarısından fazla yerde kalır.\n\nGüneye, Pannon Havzası'nın etkisi altındaki Tuna Ovası'na inildikçe ılıman karasal koşullar egemen olur; yaz mevsimi uzun, güneşli ve sıcak geçerken, kış donları çok daha kısa sürer. Yıllık yağış miktarı yüksek Tatra yamaçlarında 1.400 milimetreyi aşarken güneydeki alçak ovalarda 550-600 milimetre dolayına kadar gerileyerek belirgin bir orografik tezat oluşturur.",
    after:
      "Ülkede iklim koşulları dikey yükselti basamaklarına sıkı sıkıya bağlıdır. Kuzeydeki dağlık kuşakta sert alp iklimi hüküm sürer; kışlar uzun, dondurucu ve yoğun kar yağışlı geçer, Tatra doruklarında kar örtüsü yılın yarısından fazla yerde kalır.\n\nGüneye, Pannon Havzası'nın etkisi altındaki Tuna Ovası'na inildikçe ılıman karasal koşullar egemen olur; yaz mevsimi uzun, güneşli ve sıcak geçerken, kış donları çok daha kısa sürer. Yıllık yağış miktarı yüksek Tatra yamaçlarında 1.400 milimetreyi aşarken güneydeki alçak ovalarda 550-600 milimetre dolayına kadar gerileyerek dağlarla ovalar arasında belirgin bir karşıtlık oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SK',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Slovakya sularının ezici çoğunluğu Tuna Nehri aracılığıyla Karadeniz'e dökülür. Ülkenin ana iç omurgasını, Yüksek ve Alçak Tatra kaynaklarının birleşmesiyle doğan, sanayi ve yerleşim merkezlerini birbirine bağlayan 400 kilometreyi aşkın uzunluktaki Váh Nehri oluşturur; güneyde ise Tuna Nehri Macaristan ile doğal bir sınır çizer.\n\nBuna karşılık kuzeydeki Tatra yamaçlarından doğan Poprad ve Dunajec nehirleri, Karpatlar'ı aşarak Polonya üzerinden Baltık Denizi havzasına akar ve ülkenin küçük bir kesimini kıtasal su ayrımının kuzeyine bağlar. Yüksek vadilerde yer alan Štrbské Pleso ve Veľké Hincovo Pleso gibi kristal berraklığındaki buzul gölleri ise ülkenin en değerli dağ hidrolojisi rezervleridir.",
    after:
      "Slovakya sularının ezici çoğunluğu Tuna Nehri aracılığıyla Karadeniz'e dökülür. Ülkenin ana iç omurgasını, Yüksek ve Alçak Tatra kaynaklarının birleşmesiyle doğan, sanayi ve yerleşim merkezlerini birbirine bağlayan 400 kilometreyi aşkın uzunluktaki Váh Nehri oluşturur; güneyde ise Tuna Nehri Macaristan ile doğal bir sınır çizer.\n\nBuna karşılık kuzeydeki Tatra yamaçlarından doğan Poprad ve Dunajec nehirleri, Karpatlar'ı aşarak Polonya üzerinden Baltık Denizi havzasına akar ve ülkenin küçük bir kesimini kıtasal su ayrımının kuzeyine bağlar. Yüksek vadilerde yer alan Štrbské Pleso ve Veľké Hincovo Pleso gibi kristal berraklığındaki buzul gölleri ise ülkenin en değerli dağ suyu rezervleridir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'UA',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ukrayna rölyefinin yüzde doksanından fazlasını, akarsu vadileriyle hafifçe dalgalanan geniş ovalar ve alçak platolar oluşturur. Batıda Podolya ve Dinyeper yaylaları yükselirken, ülkenin engebeli yegane dağ kuşağı güneybatı sınırındaki Karpatlar'dır; sık kayın ve ladin ormanlarıyla örtülü bu silsile üzerindeki 2.061 metrelik Hoverla Dağı, geniş alpin çayırlarıyla (polonina) ülkenin en yüksek zirvesidir.\n\nGüneye doğru inildikçe arazi Karadeniz Kıyı Ovası'nın dümdüz bozkırlarına dönüşür. Karadeniz'e uzanan Kırım Yarımadası'nın kuzeyi kuru bir step arazisiyken, güney kıyısı boyunca kireçtaşı kanyonları ve dik yalıyarlarıyla yükselen Kırım Dağları uzanır; bu silsilenin çatısını 1.545 metrelik Roman-Koş oluşturur.",
    after:
      "Ukrayna’nın yer şekillerinin yüzde doksanından fazlasını, akarsu vadileriyle hafifçe dalgalanan geniş ovalar ve alçak platolar oluşturur. Batıda Podolya ve Dinyeper yaylaları yükselirken, ülkenin engebeli yegane dağ kuşağı güneybatı sınırındaki Karpatlar'dır; sık kayın ve ladin ormanlarıyla örtülü bu silsile üzerindeki 2.061 metrelik Hoverla Dağı, geniş alpin çayırlarıyla (polonina) ülkenin en yüksek zirvesidir.\n\nGüneye doğru inildikçe arazi Karadeniz Kıyı Ovası'nın dümdüz bozkırlarına dönüşür. Karadeniz'e uzanan Kırım Yarımadası'nın kuzeyi kuru bir step arazisiyken, güney kıyısı boyunca kireçtaşı kanyonları ve dik yalıyarlarıyla yükselen Kırım Dağları uzanır; bu silsilenin çatısını 1.545 metrelik Roman-Koş oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'UA',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Ukrayna hidrolojisinin ana arteri, ülkeyi kuzeyden güneye ikiye bölerek Karadeniz'e akan 2.200 kilometrelik Dinyeper (Dnipro) Nehri'dir. Nehrin yüksek ve sarp sağ kıyısı ile alçak alüvyal sol kıyısı arasındaki morfolojik tezat, vadi boyunca inşa edilen devasa baraj gölleri ve hidroelektrik kaskatlarıyla tarihi bir su omurgasına dönüştürülmüştür.\n\nBatıda Dinyester (Nistru) ve Güney Bug nehirleri Karadeniz'e, doğuda Siverskyi Donets ise Don havzasına akar; güneybatı ucunda Tuna Nehri'nin Kiliya kolu delta ağzıyla Karadeniz'e ulaşır. Ülkenin güneydoğusunda Kerç Boğazı ile Karadeniz'e bağlanan Azak Denizi ise ortalama 7-8 metrelik sığlığı, düşük tuzluluk oranı ve kış aylarında kıyılarının buz tutmasıyla kendine özgü bir yarı-kapalı deniz ekosistemidir.",
    after:
      "Ukrayna hidrolojisinin ana arteri, ülkeyi kuzeyden güneye ikiye bölerek Karadeniz'e akan 2.200 kilometrelik Dinyeper (Dnipro) Nehri'dir. Nehrin yüksek ve sarp sağ kıyısı ile alçak alüvyal sol kıyısı arasındaki yükselti farkı, vadi boyunca inşa edilen devasa baraj gölleri ve basamak basamak dizilmiş hidroelektrik santralleriyle tarihi bir su omurgasına dönüştürülmüştür.\n\nBatıda Dinyester (Nistru) ve Güney Bug nehirleri Karadeniz'e, doğuda Siverskyi Donets ise Don havzasına akar; güneybatı ucunda Tuna Nehri'nin Kiliya kolu delta ağzıyla Karadeniz'e ulaşır. Ülkenin güneydoğusunda Kerç Boğazı ile Karadeniz'e bağlanan Azak Denizi ise ortalama 7-8 metrelik sığlığı, düşük tuzluluk oranı ve kış aylarında kıyılarının buz tutmasıyla kendine özgü bir yarı-kapalı deniz ekosistemidir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AU',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Kıta topografyası üç ana morfolojik kuşaktan oluşur: Batıda Prekambriyen yaşlı aşınmış kayaçlardan meydana gelen eski Batı Platosu (kızıl kumtaşı monolit Uluru bu arazinin kalbinde yükselir), ortada tektonik çöküntü alanlarını kapsayan alçak Orta Ovalar ve doğu sahilini boydan boya kuşatan Büyük Ayırıcı Sıradağlar (Great Dividing Range).\n\nCape York'tan Victoria'ya kadar 3.500 kilometreyi aşan bu hat, tek bir ülke sınırları içindeki en uzun dağ kuşağıdır; güneyindeki Karlı Dağlar kesiminde yükselen 2.228 metrelik Kosciuszko Dağı kıtanın çatısını oluşturur. Kuzeydoğu kıyısı açıklarında uzanan 2.300 kilometrelik Büyük Set Resifi ise 2.900'den fazla resifiyle dünyanın en büyük mercan ekosistemidir.",
    after:
      "Kıta topografyası üç ana yer şekli kuşağından oluşur: Batıda Prekambriyen yaşlı aşınmış kayaçlardan meydana gelen eski Batı Platosu (kızıl kumtaşı monolit Uluru bu arazinin kalbinde yükselir), ortada tektonik çöküntü alanlarını kapsayan alçak Orta Ovalar ve doğu sahilini boydan boya kuşatan Büyük Ayırıcı Sıradağlar (Great Dividing Range).\n\nCape York'tan Victoria'ya kadar 3.500 kilometreyi aşan bu hat, tek bir ülke sınırları içindeki en uzun dağ kuşağıdır; güneyindeki Karlı Dağlar kesiminde yükselen 2.228 metrelik Kosciuszko Dağı kıtanın çatısını oluşturur. Kuzeydoğu kıyısı açıklarında uzanan 2.300 kilometrelik Büyük Set Resifi ise 2.900'den fazla resifiyle dünyanın en büyük mercan ekosistemidir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AU',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Kıtanın yüzey hidrolojisi son derece sınırlı ve dengesizdir. 2.508 kilometrelik Murray Nehri ile Darling kolunun oluşturduğu Murray-Darling Havzası, kıtanın güneydoğusundaki en önemli tarımsal su kaynağıdır; bu havza dışındaki iç nehirlerin çoğu yalnızca mevsimlik akış gösterir.\n\nKıtanın en alçak noktası olan Eyre Gölü (Kati Thanda), deniz seviyesinin 15 metre altındaki kapalı bir havzadır ve yalnızca nadir büyük taşkınlarda su tutarak çoğunlukla devasa bir tuz düzlüğü halinde kalır. Yüzeydeki bu kuraklığı dengeleyen en kritik zenginlik ise tabanda 1,7 milyon kilometrekareye yayılan Büyük Artezyen Havzası'dır; bu derin basınçlı yeraltı suyu, iç kesimlerdeki çiftliklerin ve kasabaların yegane tatlı su güvencesidir.",
    after:
      "Kıtanın yüzey suları son derece sınırlıdır ve dengesiz dağılır. 2.508 kilometrelik Murray Nehri ile Darling kolunun oluşturduğu Murray-Darling Havzası, kıtanın güneydoğusundaki en önemli tarımsal su kaynağıdır; bu havza dışındaki iç nehirlerin çoğu yalnızca mevsimlik akış gösterir.\n\nKıtanın en alçak noktası olan Eyre Gölü (Kati Thanda), deniz seviyesinin 15 metre altındaki kapalı bir havzadır ve yalnızca nadir büyük taşkınlarda su tutarak çoğunlukla devasa bir tuz düzlüğü halinde kalır. Yüzeydeki bu kuraklığı dengeleyen en kritik zenginlik ise tabanda 1,7 milyon kilometrekareye yayılan Büyük Artezyen Havzası'dır; bu derin basınçlı yeraltı suyu, iç kesimlerdeki çiftliklerin ve kasabaların yegane tatlı su güvencesidir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'NZ',
    property: 'independenceNoteTr',
    column: 'independence_note_tr',
    kind: 'scalar',
    before: 'Dominyon statüsü 1907; tam bağımsızlık kademeli Commonwealth sürecinde kazanıldı.',
    after:
      'Dominyon statüsü 1907; tam bağımsızlık İngiliz Milletler Topluluğu içinde kademeli bir süreçle kazanıldı.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'NZ',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Güney Adası'nın omurgasını, aktif Alp Fayı boyunca diklemesine yükselen 600 kilometrelik Güney Alpleri oluşturur. Kalıcı buzullarıyla bu silsilenin zirvesi 3.724 metrelik Aoraki (Cook Dağı)'dır. Adanın güneybatısındaki Fiordland bölgesinde, buzul aşındırmasıyla derinlemesine oyulmuş vadilerin deniz suyuyla dolmasıyla oluşan 14 sarp fiyort sıralanır; 1.500-2.000 metrelik dik yalıyarlar doğrudan derin sulara dalar.\n\nKuzey Adası ise volkanik yay sistemlerinin şekillendirdiği bambaşka bir morfolojiye sahiptir. Taupo Volkanik Bölgesi'nde yükselen 2.797 metrelik aktif stratovolkan Ruapehu Dağı adanın en yüksek noktasıdır; çevresindeki Tongariro ve Ngauruhoe ile birlikte zengin krater gölleri ve jeotermal alanlar barındırır.",
    after:
      "Güney Adası'nın omurgasını, aktif Alp Fayı boyunca diklemesine yükselen 600 kilometrelik Güney Alpleri oluşturur. Kalıcı buzullarıyla bu silsilenin zirvesi 3.724 metrelik Aoraki (Cook Dağı)'dır. Adanın güneybatısındaki Fiordland bölgesinde, buzul aşındırmasıyla derinlemesine oyulmuş vadilerin deniz suyuyla dolmasıyla oluşan 14 sarp fiyort sıralanır; 1.500-2.000 metrelik dik yalıyarlar doğrudan derin sulara dalar.\n\nKuzey Adası ise volkanik yay sistemlerinin şekillendirdiği bambaşka bir yer şekline sahiptir. Taupo Volkanik Bölgesi'nde yükselen 2.797 metrelik aktif stratovolkan Ruapehu Dağı adanın en yüksek noktasıdır; çevresindeki Tongariro ve Ngauruhoe ile birlikte zengin krater gölleri ve jeotermal alanlar barındırır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'NZ',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Hakim batı rüzgarları ve yüksek sıradağlar ülkede keskin bir iklimsel tezat doğurur. Tasman Denizi'nden gelen nemli hava kütleleri Güney Alpleri'nin batı yamaçlarına çarparak yoğun yağış bırakır; Fiordland ve batı kıyıları dünyanın en çok yağış alan alanları arasındadır. Dağ silsilesini aşarak fön etkisiyle kuruyan hava ise doğudaki Canterbury Ovaları'nda belirgin bir yağış gölgesi ve kurak tarım arazileri yaratır.\n\nKuzeyden güneye uzanan enlem farkı sıcaklıkları da kademelendirir: Kuzey Adası'nın kuzey kesimleri ılıman-subtropikal özellikler taşırken, Güney Adası'nın güneyi serin, rüzgarlı ve okyanusal karakterdedir.",
    after:
      "Hakim batı rüzgarları ve yüksek sıradağlar ülkede keskin bir iklim karşıtlığı doğurur. Tasman Denizi'nden gelen nemli hava kütleleri Güney Alpleri'nin batı yamaçlarına çarparak yoğun yağış bırakır; Fiordland ve batı kıyıları dünyanın en çok yağış alan alanları arasındadır. Dağ silsilesini aşarak fön etkisiyle kuruyan hava ise doğudaki Canterbury Ovaları'nda belirgin bir yağış gölgesi ve kurak tarım arazileri yaratır.\n\nKuzeyden güneye uzanan enlem farkı sıcaklıkları da kademelendirir: Kuzey Adası'nın kuzey kesimleri ılıman-subtropikal özellikler taşırken, Güney Adası'nın güneyi serin, rüzgarlı ve okyanusal karakterdedir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'NZ',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Kuzey Adası'nın hidrolojik arteri, Ruapehu yamaçlarından doğup 425 kilometre sonra Tasman Denizi'ne dökülen Waikato Nehri'dir. Nehir, devasa bir volkanik kalderada toplanan ülkenin en büyük gölü Taupo'yu besler; göl çıkışındaki Huka Şelalesi'nin ardından kurulan hidroelektrik santral kaskatlarıyla ulusal elektrik üretimine büyük katkı sağlar.\n\nGüney Adası'nda ise debisi en yüksek akarsu Clutha Nehri'dir; dağ eteklerinde sıralanan Te Anau ve Wakatipu gibi derin buzul tekne gölleri eriyen kar ve buzul sularını toplayarak vadi akışını dengeler.",
    after:
      "Kuzey Adası'nın ana akarsuyu, Ruapehu yamaçlarından doğup 425 kilometre sonra Tasman Denizi'ne dökülen Waikato Nehri'dir. Nehir, devasa bir volkanik kalderada toplanan ülkenin en büyük gölü Taupo'yu besler; göl çıkışındaki Huka Şelalesi'nin ardından basamak basamak kurulan hidroelektrik santralleriyle ulusal elektrik üretimine büyük katkı sağlar.\n\nGüney Adası'nda ise debisi en yüksek akarsu Clutha Nehri'dir; dağ eteklerinde sıralanan Te Anau ve Wakatipu gibi derin buzul tekne gölleri eriyen kar ve buzul sularını toplayarak vadi akışını dengeler.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'FJ',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Güneydoğu alize rüzgarlarının yönlendirdiği tropikal deniz iklimi, adalarda belirgin bir ekolojik iki kutupluluk yaratır. Viti Levu\'nun güneydoğuya bakan rüzgar üstü yamaçları yıl boyunca bol orografik yağış alıp gür yağmur ormanlarıyla örtülürken, dağların arkasında kalan kuzeybatı kesimleri yağış gölgesi nedeniyle çok daha kuraktır; bu tezat adayı yerel dilde "ıslak taraf" ve "kuru taraf" olarak ikiye böler.\n\nKasım ile nisan arasındaki sıcak ve nemli yaz dönemi, aynı zamanda takımadanın tropikal siklon rotalarına açık olduğu dönemdir.',
    after:
      'Güneydoğu alize rüzgarlarının yönlendirdiği tropikal deniz iklimi, adalarda belirgin bir ikilik yaratır. Viti Levu\'nun güneydoğuya bakan rüzgar üstü yamaçları yıl boyunca bol yamaç yağışı alıp gür yağmur ormanlarıyla örtülürken, dağların arkasında kalan kuzeybatı kesimleri yağış gölgesi nedeniyle çok daha kuraktır; bu tezat adayı yerel dilde "ıslak taraf" ve "kuru taraf" olarak ikiye böler.\n\nKasım ile nisan arasındaki sıcak ve nemli yaz dönemi, aynı zamanda takımadanın tropikal siklon rotalarına açık olduğu dönemdir.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SB',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Büyük adaların iç kesimlerini sarp volkanik dağ silsileleri kaplar. Guadalcanal'ın güneyinde yükselen 2.335 metrelik Popomanaseu Dağı, Yeni Gine ana karası haricinde Güney Pasifik ada dünyasının en yüksek doruğudur ve sisli bulut ormanlarıyla örtülüdür.\n\nTakımadanın güneyinde, deniz yüzeyinin yaklaşık 20 metre altında zirve yapan Kavachi, bölgenin en aktif denizaltı yanardağlarındandır; sık tekrarlanan püskürmeleri okyanus yüzeyinde zaman zaman kısa ömürlü lav adacıkları oluşturur.",
    after:
      "Büyük adaların iç kesimlerini sarp volkanik dağ silsileleri kaplar. Guadalcanal'ın güneyinde yükselen 2.335 metrelik Popomanaseu Dağı, ülkenin en yüksek doruğudur ve sisli bulut ormanlarıyla örtülüdür.\n\nTakımadanın güneyinde, deniz yüzeyinin yaklaşık 20 metre altında zirve yapan Kavachi, bölgenin en aktif denizaltı yanardağlarındandır; sık tekrarlanan püskürmeleri okyanus yüzeyinde zaman zaman kısa ömürlü lav adacıkları oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'KI',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      'Yalnızca 810 kilometrekarelik kara yüzölçümüne karşın Kiribati, 3,5 milyon kilometrekareyi aşan muazzam bir okyanus münhasır ekonomik bölgesine yayılır. Adaların neredeyse tamamı deniz seviyesinden 2-3 metreden fazla yükselmeyen alçak mercan atolleridir.\n\nBu düzlüğün tek morfolojik istisnası, batıda tek başına yükselen Banaba adasıdır; yükselmiş bir mercan kireçtaşı kütlesi olan ada, 81 metrelik rakımıyla ülkenin en yüksek yeridir ve zengin fosfat madenciliği geçmişiyle tanınır.',
    after:
      'Yalnızca 810 kilometrekarelik kara yüzölçümüne karşın Kiribati, 3,5 milyon kilometrekareyi aşan muazzam bir okyanus münhasır ekonomik bölgesine yayılır. Adaların neredeyse tamamı deniz seviyesinden 2-3 metreden fazla yükselmeyen alçak mercan atolleridir.\n\nBu düzlüğün tek istisnası, batıda tek başına yükselen Banaba adasıdır; yükselmiş bir mercan kireçtaşı kütlesi olan ada, 81 metrelik rakımıyla ülkenin en yüksek yeridir ve zengin fosfat madenciliği geçmişiyle tanınır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MH',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      'Kuzey Pasifik\'in Mikronezya bölgesinde yer alan Marşal Adaları; kuzeybatı-güneydoğu doğrultusunda paralel uzanan iki ada zincirinden oluşur: Doğudaki Ratak ("gündoğumu") ve batıdaki Ralik ("günbatımı"). Yaklaşık 1.300 kilometrelik hat boyunca 29 mercan atolü ve 5 tekil adaya dağılan ülkede başkent Majuro, Ratak zincirinin güneyinde geniş lagünlü bir atoldür.\n\n2 milyon kilometrekarelik deniz alanına yayılan adalar, kadim Polinezya-Mikronezya okyanus denizciliğinin sopa haritalarıyla (stick charts) simgeleşen seyrüsefer mirasını yaşatır.',
    after:
      'Kuzey Pasifik\'in Mikronezya bölgesinde yer alan Marşal Adaları; kuzeybatı-güneydoğu doğrultusunda paralel uzanan iki ada zincirinden oluşur: Doğudaki Ratak ("gündoğumu") ve batıdaki Ralik ("günbatımı"). Yaklaşık 1.300 kilometrelik hat boyunca 29 mercan atolü ve 5 tekil adaya dağılan ülkede başkent Majuro, Ratak zincirinin güneyinde geniş lagünlü bir atoldür.\n\n2 milyon kilometrekarelik deniz alanına yayılan adalar, kadim Polinezya-Mikronezya okyanus denizciliğinin sopa haritalarıyla simgeleşen denizde yön bulma mirasını yaşatır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'FM',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Batı Pasifik'te Karolin Adaları takımadasının 2.900 kilometrelik okyanus yayına yayılan Mikronezya Federe Devletleri; batıdan doğuya Yap, Chuuk, Pohnpei ve Kosrae olmak üzere dört federe eyaletten meydana gelir.\n\nToplam 607 ada ve atolü kapsayan bu geniş denizel ülkede federal başkent Palikir, en büyük tekil kara parçası olan Pohnpei adasında yer alır. Yüksek volkanik dağlar ile alçak mercan adalarının birleşimi, ülkeye zengin bir morfolojik ve kültürel çeşitlilik kazandırır.",
    after:
      "Batı Pasifik'te Karolin Adaları takımadasının 2.900 kilometrelik okyanus yayına yayılan Mikronezya Federe Devletleri; batıdan doğuya Yap, Chuuk, Pohnpei ve Kosrae olmak üzere dört federe eyaletten meydana gelir.\n\nToplam 607 ada ve atolü kapsayan bu geniş denizel ülkede federal başkent Palikir, en büyük tekil kara parçası olan Pohnpei adasında yer alır. Yüksek volkanik dağlar ile alçak mercan adalarının birleşimi, ülkeye zengin bir doğal ve kültürel çeşitlilik kazandırır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'NR',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      'Nauru, okyanus tabanındaki bir denizaltı volkanının üzerini örten mercan resifinin tektonik olarak yükselmesiyle oluşmuştur. Adanın dış çeperini hindistan cevizi ağaçlarıyla kaplı dar ve verimli bir kıyı düzlüğü kuşatırken, ortada "Topside" adı verilen yüksek kireçtaşı platosu yükselir; platonun en yüksek noktası 65 metreye ulaşır.\n\nYüzyıllar boyunca biriken guano kökenli zengin fosfat yataklarının bir asrı aşkın süre açık ocaklarla kazılması, iç platonun yaklaşık yüzde seksenini 15-20 metreye varan sivri kireçtaşı pinakıllarından oluşan ay benzeri çorak bir topoğrafyaya çevirmiştir.',
    after:
      'Nauru, okyanus tabanındaki bir denizaltı volkanının üzerini örten mercan resifinin tektonik olarak yükselmesiyle oluşmuştur. Adanın dış çeperini hindistan cevizi ağaçlarıyla kaplı dar ve verimli bir kıyı düzlüğü kuşatırken, ortada "Topside" adı verilen yüksek kireçtaşı platosu yükselir; platonun en yüksek noktası 65 metreye ulaşır.\n\nYüzyıllar boyunca biriken guano kökenli zengin fosfat yataklarının bir asrı aşkın süre açık ocaklarla kazılması, iç platonun yaklaşık yüzde seksenini 15-20 metreye varan sivri kireçtaşı kulelerinden oluşan ay benzeri çorak bir topoğrafyaya çevirmiştir.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'NR',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Ekvatoral kuşaktaki konumuyla yıl boyu sıcak ve nemli bir iklime sahip olan adada yağış rejimi, Pasifik'teki El Niño-Güney Salınımı (ENSO) döngülerine son derece duyarlıdır. Yıllık ortalama yağış 2.000 milimetre civarında seyretse de, kurak La Niña dönemlerinde aylar süren susuzluklar yaşanırken El Niño yıllarında şiddetli sağanaklar görülür.\n\nEkvatora bitişik konumu Coriolis kuvvetini engellediği için Nauru'da dönen tropikal siklonlar görülmez.",
    after:
      "Ekvatoral kuşaktaki konumuyla yıl boyu sıcak ve nemli bir iklime sahip olan adada yağış rejimi, Pasifik'teki El Niño-Güney Salınımı döngülerine son derece duyarlıdır. Yıllık ortalama yağış 2.000 milimetre civarında seyretse de, kurak La Niña dönemlerinde aylar süren susuzluklar yaşanırken El Niño yıllarında şiddetli sağanaklar görülür.\n\nEkvatora bitişik konumu Coriolis kuvvetini engellediği için Nauru'da dönen tropikal siklonlar görülmez.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'NR',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Gözenekli kireçtaşı zemin suyu tutmadığı için adada hiçbir kalıcı akarsu veya dere bulunmaz. Yegane doğal tatlı su yüzeyi, merkezi platonun güneybatısındaki karstik çöküntüde yer alan sığ Buada Lagünü'dür; denizle bağlantısı olmayan bu gölet çevresindeki tropikal bitki örtüsüyle vaha niteliğindedir.\n\nİçme suyu ihtiyacı, yer altı su tablasının madencilikle kirlenmesi ve tuzlanması nedeniyle büyük ölçüde deniz suyu arıtma (desalinizasyon) tesislerinden ve çatılardan toplanan yağmur suyu tanklarından karşılanır.",
    after:
      "Gözenekli kireçtaşı zemin suyu tutmadığı için adada hiçbir kalıcı akarsu veya dere bulunmaz. Yegane doğal tatlı su yüzeyi, merkezi platonun güneybatısındaki karstik çöküntüde yer alan sığ Buada Lagünü'dür; denizle bağlantısı olmayan bu gölet çevresindeki tropikal bitki örtüsüyle vaha niteliğindedir.\n\nİçme suyu ihtiyacı, yer altı su tablasının madencilikle kirlenmesi ve tuzlanması nedeniyle büyük ölçüde deniz suyu arıtma tesislerinden ve çatılardan toplanan yağmur suyu tanklarından karşılanır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'PW',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Palau topoğrafyası iki keskin morfolojik tezat sergiler: Toplam kara alanının büyük kısmını oluşturan Babeldaob volkanik kökenlidir; dağlık vadileri, şelaleleri, mangrov bataklıkları ve 242 metrelik zirvesiyle ülkenin en yüksek noktası olan Ngerchelchuus Dağı'na ev sahipliği yapar.\n\nBuna karşılık güneyde uzanan Kayalık Adalar (Chelbacheb); denizden yükselen, dalga aşındırmasıyla tabanları oyulup mantar formunu almış zümrüt yeşili 250-300 karstik kireçtaşı adasından meydana gelir.",
    after:
      "Palau topoğrafyası keskin bir karşıtlık sergiler: Toplam kara alanının büyük kısmını oluşturan Babeldaob volkanik kökenlidir; dağlık vadileri, şelaleleri, mangrov bataklıkları ve 242 metrelik zirvesiyle ülkenin en yüksek noktası olan Ngerchelchuus Dağı'na ev sahipliği yapar.\n\nBuna karşılık güneyde uzanan Kayalık Adalar (Chelbacheb); denizden yükselen, dalga aşındırmasıyla tabanları oyulup mantar formunu almış zümrüt yeşili 250-300 karstik kireçtaşı adasından meydana gelir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'PW',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Babeldaob adası zengin akarsu ağıyla Mikronezya'da istisnai bir konuma sahiptir; adanın merkezindeki Ngardok Gölü, bölgenin en büyük doğal tatlı su gölüdür ve denize dökülen Ngerdorch Nehri'ni besler.\n\nKayalık Adalar'da ise akarsu yerine, okyanusla bağlantısı karstik çatlaklarla sınırlı izole deniz suyu gölleri (marine lakes) yer alır; bunların en ünlüsü, milyonlarca yıldır avcılardan uzak kalarak yakıcı hücrelerini yitirmiş altın denizanalarına ev sahipliği yapan Denizanası Gölü'dür (Jellyfish Lake).",
    after:
      "Babeldaob adası zengin akarsu ağıyla Mikronezya'da istisnai bir konuma sahiptir; adanın merkezindeki Ngardok Gölü, bölgenin en büyük doğal tatlı su gölüdür ve denize dökülen Ngerdorch Nehri'ni besler.\n\nKayalık Adalar'da ise akarsu yerine, okyanusla bağlantısı karstik çatlaklarla sınırlı izole deniz suyu gölleri yer alır; bunların en ünlüsü, yaklaşık 12.000 yıldır avcılardan uzak kalarak yakıcı hücrelerini yitirmiş altın denizanalarına ev sahipliği yapan Denizanası Gölü'dür (Jellyfish Lake).",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'WS',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Adaların omurgasını lav platoları ve krater konileri şekillendirir. Savai'i'nin merkezinde yükselen 1.858 metrelik Silisili Dağı ülkenin çatısıdır ve sık dağ ormanlarıyla kaplıdır. Adanın kuzeyinde 1905-1911 yılları arasında püsküren Matavanu Yanardağı'nın lav tarlaları yaklaşık 75 kilometrekarelik bir alanı kaplayarak kıyıdaki köyleri gömmüş ve morfolojiyi dönüştürmüştür.\n\nDaha yaşlı olan Upolu ise sönmüş krater gölleri, çağlayanlarla yarılan vadileri ve kıyı ovalarıyla daha yumuşak hatlara sahiptir.",
    after:
      "Adaların omurgasını lav platoları ve krater konileri şekillendirir. Savai'i'nin merkezinde yükselen 1.858 metrelik Silisili Dağı ülkenin çatısıdır ve sık dağ ormanlarıyla kaplıdır. Adanın kuzeyinde 1905-1911 yılları arasında püsküren Matavanu Yanardağı'nın lav tarlaları yaklaşık 75 kilometrekarelik bir alanı kaplayarak kıyıdaki köyleri gömmüş ve araziyi dönüştürmüştür.\n\nDaha yaşlı olan Upolu ise sönmüş krater gölleri, çağlayanlarla yarılan vadileri ve kıyı ovalarıyla daha yumuşak hatlara sahiptir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'WS',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "İki ada arasında belirgin bir hidrolojik farklılık gözlenir. Jeolojik açıdan daha eski olan Upolu'da aşınmış volkanik taban suyu tutar; dağlardan kıyıya dökülen çok sayıda berrak dere, vadi çağlayanları ve derin kireçtaşı-bazalt obruklarında toplanan tatlı su havuzları (To Sua Okyanus Çukuru) gelişmiştir.\n\nBuna karşılık Savai'i'nin genç ve çatlaklı bazalt lav örtüsü yağmur suyunu anında yeraltına sızdırdığından belirgin bir yüzey akarsu ağı gelişmemiştir; ada halkı su ihtiyacını yeraltı akiferlerinden ve kıyıda denizle buluşan tatlı su pınarlarından sağlar.",
    after:
      "İki ada arasında sular bakımından belirgin bir farklılık gözlenir. Jeolojik açıdan daha eski olan Upolu'da aşınmış volkanik taban suyu tutar; dağlardan kıyıya dökülen çok sayıda berrak dere, vadi çağlayanları ve derin kireçtaşı-bazalt obruklarında toplanan tatlı su havuzları (To Sua Okyanus Çukuru) gelişmiştir.\n\nBuna karşılık Savai'i'nin genç ve çatlaklı bazalt lav örtüsü yağmur suyunu anında yeraltına sızdırdığından belirgin bir yüzey akarsu ağı gelişmemiştir; ada halkı su ihtiyacını yeraltı akiferlerinden ve kıyıda denizle buluşan tatlı su pınarlarından sağlar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TO',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      'Tongatapu gibi yükselmiş mercan kireçtaşı adalarında hiçbir kalıcı yüzey akarsuyu bulunmaz; gözenekli kireçtaşı zemin yağan yağmuru hızla yeraltına geçirir. Tatlı su ihtiyacı, tuzlu suyun üzerinde yüzen sığ tatlı su lensi katmanından ve çatılarda kurulan sarnıçlardan karşılanır.\n\nBatıdaki dik volkanik adalarda ise yalnızca yağış sonrası akan kısa ve geçici dereler ile bazı krater gölleri görülür.',
    after:
      'Tongatapu gibi yükselmiş mercan kireçtaşı adalarında hiçbir kalıcı yüzey akarsuyu bulunmaz; gözenekli kireçtaşı zemin yağan yağmuru hızla yeraltına geçirir. Tatlı su ihtiyacı, tuzlu suyun üzerinde yüzen sığ tatlı su merceğinden ve çatılarda kurulan sarnıçlardan karşılanır.\n\nBatıdaki dik volkanik adalarda ise yalnızca yağış sonrası akan kısa ve geçici dereler ile bazı krater gölleri görülür.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TV',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Tuvalu'nun en yüksek doğal noktası, güneydeki Niulakita adasında yalnızca 4,6 metredir; ülke genelinde ortalama yükseklik ise bunun çok altındadır. Funafuti Atolü'nün 33 adacığı toplamda yalnızca 2,4 kilometrekarelik bir kara alanı oluştururken, çevrelediği Funafuti Lagünü yaklaşık 275 kilometrekarelik devasa bir su yüzeyine yayılır.\n\nKara parçaları ile lagünler arasındaki bu muazzam orantısızlık ülkenin tüm adalarında belirgindir; küresel ısınmayla yükselen okyanus seviyesi ve kıyı erozyonu adaların varoluşsal jeolojik tehdididir.",
    after:
      "Tuvalu'nun en yüksek doğal noktası, güneydeki Niulakita adasında yalnızca 4,6 metredir; ülke genelinde ortalama yükseklik ise bunun çok altındadır. Funafuti Atolü'nün 33 adacığı toplamda yalnızca 2,4 kilometrekarelik bir kara alanı oluştururken, çevrelediği Funafuti Lagünü yaklaşık 275 kilometrekarelik devasa bir su yüzeyine yayılır.\n\nKara parçaları ile lagünler arasındaki bu muazzam orantısızlık ülkenin tüm adalarında belirgindir; küresel ısınmayla yükselen okyanus seviyesi ve kıyı erozyonu adaların varlığını doğrudan tehdit eder.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TV',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      'Tuvalu topraklarında hiçbir nehir, dere veya tatlı su gölü bulunmaz; atollerin ortasındaki büyük lagünler tamamen açık denizle irtibatlı tuzlu sulardır. Tek tatlı su kaynağı, evlerin çatılarından sarnıçlara toplanan yağmur suyu ile adacıkların altında biriken incecik yeraltı tatlı su merceğidir.\n\nYüksek gelgit dönemlerinde deniz suyunun gözenekli mercan kireçtaşının altından yukarı kaynayarak toprağı basması (kral gelgitleri), bu hassas tatlı su lensini tuzlandırarak geleneksel pulaka (bataklık tarosu) tarımını ve içme suyu güvenliğini doğrudan tehdit eder.',
    after:
      'Tuvalu topraklarında hiçbir nehir, dere veya tatlı su gölü bulunmaz; atollerin ortasındaki büyük lagünler tamamen açık denizle irtibatlı tuzlu sulardır. Tek tatlı su kaynağı, evlerin çatılarından sarnıçlara toplanan yağmur suyu ile adacıkların altında biriken incecik yeraltı tatlı su merceğidir.\n\nYüksek gelgit dönemlerinde deniz suyunun gözenekli mercan kireçtaşının altından yukarı kaynayarak toprağı basması (kral gelgitleri), bu hassas tatlı su merceğini tuzlandırarak geleneksel pulaka (bataklık tarosu) tarımını ve içme suyu güvenliğini doğrudan tehdit eder.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CY',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Kıbrıs adasının güney yarısını kaplayan Güney Kıbrıs Rum Yönetimi, Akdeniz'in doğu havzasında yükselen Troodos Dağları ve verimli güney sahil ovaları üzerinde kuruludur. Adanın morfolojik omurgasını oluşturan bu dağlık kütle, hem adanın mikroklimasını hem de yerleşim ve su kaynaklarının dağılımını belirler.\n\nKıyı şeridinde Limasol, Larnaka ve Baf gibi liman kentleri uzanırken, iç kesimde başkent Lefkoşa'nın güney mahalleleri ile ada içi tarım alanları yer alır.",
    after:
      "Kıbrıs adasının güney yarısını kaplayan Güney Kıbrıs Rum Yönetimi, Akdeniz'in doğu havzasında yükselen Troodos Dağları ve verimli güney sahil ovaları üzerinde kuruludur. Adanın omurgasını oluşturan bu dağlık kütle, hem adanın yerel iklimini hem de yerleşim ve su kaynaklarının dağılımını belirler.\n\nKıyı şeridinde Limasol, Larnaka ve Baf gibi liman kentleri uzanırken, iç kesimde başkent Lefkoşa'nın güney mahalleleri ile ada içi tarım alanları yer alır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CY',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Troodos Dağları, jeoloji biliminde okyanus kabuğunun ve üst mantonun aşınarak yüzeyde kusursuz biçimde korunduğu dünyanın en ünlü ofiyolit komplekslerinden biridir; adada antik çağlardan bu yana işletilen zengin bakır yatakları da bu magmatik yükselimin ürünüdür. Masifin kalbinde yükselen 1.952 metrelik Olimpos Dağı (Hionistra), kışın karla kaplanan kubbesiyle tüm Kıbrıs'ın doruk noktasıdır.\n\nDağların güney yamaçları taraçalı bağlar ve derin vadilerle Akdeniz kıyısındaki alçak kıyı düzlüklerine iner. Kuzey yamaçlar ise adayı doğu-batı ekseninde kesen alüvyal Mesarya Ovası'nın güney kenarına dayanır.",
    after:
      "Troodos Dağları, okyanus kabuğunun ve üst mantonun yükselip aşınmayla yüzeye çıktığı ve kusursuz biçimde izlenebildiği, jeolojide ofiyolit denen yapının dünyadaki en ünlü örneklerinden biridir; adada antik çağlardan bu yana işletilen zengin bakır yatakları da bu magmatik yükselimin ürünüdür. Masifin kalbinde yükselen 1.952 metrelik Olimpos Dağı (Hionistra), kışın karla kaplanan kubbesiyle tüm Kıbrıs'ın doruk noktasıdır.\n\nDağların güney yamaçları taraçalı bağlar ve derin vadilerle Akdeniz kıyısındaki alçak kıyı düzlüklerine iner. Kuzey yamaçlar ise adayı doğu-batı ekseninde kesen alüvyal Mesarya Ovası'nın güney kenarına dayanır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CY',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      'Yazları uzun, kurak ve sıcak, kışları ise ılık ve yağışlı geçen tipik bir Akdeniz iklimi egemendir. İç kesimdeki Mesarya düzlüğü ve kıyı ovalarında yaz sıcaklıkları düzenli olarak 35 derecenin üzerine tırmanırken, yüksek Troodos yamaçları denizden gelen esintiler ve orografik etkiyle serinler.\n\nYıllık yağışın ezici bölümü kasım-mart arasına toplanır ve yağmur bulutları doğrudan Troodos kütlesine çarparak doruklarda kışın kar örtüsü bırakır; bu durum kurak kıyılar ile serin dağ yaylaları arasında belirgin bir mikroklima karşıtlığı üretir.',
    after:
      'Yazları uzun, kurak ve sıcak, kışları ise ılık ve yağışlı geçen tipik bir Akdeniz iklimi egemendir. İç kesimdeki Mesarya düzlüğü ve kıyı ovalarında yaz sıcaklıkları düzenli olarak 35 derecenin üzerine tırmanırken, yüksek Troodos yamaçları denizden gelen esintiler ve yükseltinin etkisiyle serinler.\n\nYıllık yağışın ezici bölümü kasım-mart arasına toplanır ve yağmur bulutları doğrudan Troodos kütlesine çarparak doruklarda kışın kar örtüsü bırakır; bu durum kurak kıyılar ile serin dağ yaylaları arasında belirgin bir yerel iklim karşıtlığı üretir.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'QN',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Kuzey Kıbrıs Türk Cumhuriyeti, Kıbrıs adasının kuzeyini kaplayan; kıyı boyunca bir set gibi uzanan Beşparmak Dağları, güneydeki geniş Mesarya Ovası ve Akdeniz'e bir kılıç gibi uzanan ince Karpaz Yarımadası ile ayırt edici bir morfolojiye sahiptir.\n\nBaşkent Lefkoşa'nın kuzey yarısı ile Girne ve Gazimağusa gibi tarihi liman kentleri bu coğrafi omurga üzerinde yer alır; dağlar ile ova arasındaki topoğrafik ayrım adanın yerleşim desenini doğrudan belirler.",
    after:
      "Kuzey Kıbrıs Türk Cumhuriyeti, Kıbrıs adasının kuzeyini kaplayan; kıyı boyunca bir set gibi uzanan Beşparmak Dağları, güneydeki geniş Mesarya Ovası ve Akdeniz'e bir kılıç gibi uzanan ince Karpaz Yarımadası ile ayırt edici bir yer şekline sahiptir.\n\nBaşkent Lefkoşa'nın kuzey yarısı ile Girne ve Gazimağusa gibi tarihi liman kentleri bu coğrafi omurga üzerinde yer alır; dağlar ile ova arasındaki topoğrafik ayrım adanın yerleşim desenini doğrudan belirler.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'QN',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Kuzey kıyı şeridine paralel uzanan Beşparmak (Girne) Dağları, Mesozoik kalkerlerden oluşan dik ve sarp kireçtaşı sırtlarıyla Akdeniz'e duvar çeker. Adını beş parmağı andıran kayalık kulelerinden alan sıradağın en yüksek noktası 1.024 metrelik Selvili Tepe'dir; bu kireçtaşı kütle güneydeki volkanik Troodos'tan jeolojik açıdan tamamen farklı bir yapı sergiler.\n\nDağların güneyinde uzanan geniş ve düz Mesarya Ovası ile batıdaki Güzelyurt havzası, adanın tahıl ve narenciye üretim merkezidir. Kuzeydoğuda ise Akdeniz'in derinliklerine sokulan 80 kilometrelik Karpaz Yarımadası, el değmemiş kumulları ve falezli burunlarıyla adanın en bakir kıyı peyzajını sunar.",
    after:
      "Kuzey kıyı şeridine paralel uzanan Beşparmak (Girne) Dağları, II. jeolojik zamanda (Mesozoik) oluşmuş dik ve sarp kireçtaşı sırtlarıyla Akdeniz'e duvar çeker. Adını beş parmağı andıran kayalık kulelerinden alan sıradağın en yüksek noktası 1.024 metrelik Selvili Tepe'dir; bu kireçtaşı kütle güneydeki volkanik Troodos'tan jeolojik açıdan tamamen farklı bir yapı sergiler.\n\nDağların güneyinde uzanan geniş ve düz Mesarya Ovası ile batıdaki Güzelyurt havzası, adanın tahıl ve narenciye üretim merkezidir. Kuzeydoğuda ise Akdeniz'in derinliklerine sokulan 80 kilometrelik Karpaz Yarımadası, el değmemiş kumulları ve falezli burunlarıyla adanın en bakir kıyı manzarasını sunar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'IL',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      'Doğu Akdeniz çanağının güneydoğu kıyısında yer alan İsrail; batıda Akdeniz kıyı ovalarından başlayıp iç kesimlerdeki tepelik yaylalara, doğudaki derin Rift çöküntüsüne ve güneydeki kurak çöl düzlüklerine kadar uzanan çok katmanlı bir fiziki dokuya sahiptir.\n\nBu topoğrafik çeşitlilik, çok dar bir coğrafi şerit içerisinde kıyı Akdeniz yaşantısı ile sert çöl koşullarını ve derin tektonik çukurlukları bir arada barındırır.',
    after:
      'Doğu Akdeniz çanağının güneydoğu kıyısında yer alan İsrail; batıda Akdeniz kıyı ovalarından başlayıp iç kesimlerdeki tepelik yaylalara, doğudaki derin Rift çöküntüsüne ve güneydeki kurak çöl düzlüklerine kadar uzanan çok çeşitli bir araziye sahiptir.\n\nBu topoğrafik çeşitlilik, çok dar bir coğrafi şerit içerisinde kıyı Akdeniz yaşantısı ile sert çöl koşullarını ve derin tektonik çukurlukları bir arada barındırır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'IL',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Kuzeydoğuda deniz seviyesinin yaklaşık 210 metre altında yer alan Taberiye Gölü (Celile Denizi), ülkenin en büyük doğal tatlı su rezervuarıdır. Taberiye'den çıkarak güneye kıvrılan ve bir kısmı boyunca Ürdün sınırını çizen Şeria Nehri, sularını yüksek tuzluluğuyla bilinen Lut Gölü'ne boşaltır.\n\nAşırı buharlaşma ve tatlı suyun tarımda kullanılması nedeniyle Lut Gölü seviyesi her yıl yaklaşık bir metre alçalırken, ülke içme suyu ihtiyacının ezici çoğunluğunu Akdeniz kıyısına kurduğu modern deniz suyu arıtma (desalinizasyon) tesislerinden karşılar.",
    after:
      "Kuzeydoğuda deniz seviyesinin yaklaşık 210 metre altında yer alan Taberiye Gölü (Celile Denizi), ülkenin en büyük doğal tatlı su rezervuarıdır. Taberiye'den çıkarak güneye kıvrılan ve bir kısmı boyunca Ürdün sınırını çizen Şeria Nehri, sularını yüksek tuzluluğuyla bilinen Lut Gölü'ne boşaltır.\n\nAşırı buharlaşma ve tatlı suyun tarımda kullanılması nedeniyle Lut Gölü seviyesi her yıl yaklaşık bir metre alçalırken, ülke içme suyu ihtiyacının ezici çoğunluğunu Akdeniz kıyısına kurduğu modern deniz suyu arıtma tesislerinden karşılar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'PS',
    property: 'introTr',
    column: 'intro_tr',
    kind: 'scalar',
    before:
      "Doğu Akdeniz havzasında yer alan Filistin, coğrafi olarak birbiriyle doğrudan kara bağlantısı bulunmayan iki ayrı parçadan — doğudaki dağlık Batı Şeria ve güneybatıdaki sahil şeridi Gazze'den — meydana gelir.\n\nBu iki bölge, topoğrafik yapılarından iklim ve su kaynaklarına kadar tümüyle farklı fiziki ve beşeri dinamikler taşır; Batı Şeria bir iç yayla niteliğindeyken Gazze yoğun nüfuslu alçak bir kıyı koridorudur.",
    after:
      "Doğu Akdeniz havzasında yer alan Filistin, coğrafi olarak birbiriyle doğrudan kara bağlantısı bulunmayan iki ayrı parçadan — doğudaki dağlık Batı Şeria ve güneybatıdaki sahil şeridi Gazze'den — meydana gelir.\n\nBu iki bölge, topoğrafik yapılarından iklim ve su kaynaklarına kadar tümüyle farklı fiziki ve beşeri özellikler taşır; Batı Şeria bir iç yayla niteliğindeyken Gazze yoğun nüfuslu alçak bir kıyı koridorudur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'XK',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Ülke morfolojisi iki ana havza etrafında şekillenir: Batıdaki Metohija Havzası ve doğudaki Kosova Ovası. Bu ovaları güneyden ve batıdan kuşatan sıradağlar ülkenin doğal sınırlarını çizer: Güneyde Kuzey Makedonya sınırında yükselen Šar (Şar) Dağları ile güneybatıda Arnavutluk ve Karadağ sınırını oluşturan kireçtaşlı Prokletije (Arnavut Alpleri) masifleri en sarp kesimlerdir.\n\nProkletije'deki 2.656 metrelik Gjeravica Dağı ve Şar Dağları'ndaki Velika Rudoka doruğu ülkenin en yüksek noktalarıdır; bu dağlar kış sporları ve dağ ekosistemleri açısından zengin bir topoğrafya sunar.",
    after:
      "Ülkenin arazisi iki ana havza etrafında şekillenir: Batıdaki Metohija Havzası ve doğudaki Kosova Ovası. Bu ovaları güneyden ve batıdan kuşatan sıradağlar ülkenin doğal sınırlarını çizer: Güneyde Kuzey Makedonya sınırında yükselen Šar (Şar) Dağları ile güneybatıda Arnavutluk ve Karadağ sınırını oluşturan kireçtaşlı Prokletije (Arnavut Alpleri) masifleri en sarp kesimlerdir.\n\nProkletije'deki 2.656 metrelik Gjeravica Dağı ve Şar Dağları'ndaki Velika Rudoka doruğu ülkenin en yüksek noktalarıdır; bu dağlar kış sporları ve dağ ekosistemleri açısından zengin bir topoğrafya sunar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'XK',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Ilıman karasal iklimin hüküm sürdüğü ülkede topoğrafik koridorlar yerel iklim desenlerini belirler. Batıdaki Metohija Havzası, Ak Drin vadisi boyunca Adriyatik Denizi'nden sokulan ılıman hava akımları sayesinde daha yumuşak ve Akdeniz etkisine açık bir karaktere sahiptir.\n\nDoğudaki Kosova Ovası ise kıtadan gelen soğuk hava dalgalarıyla kışları daha sert ve kar yağışlı geçer. Ülkeyi çevreleyen yüksek dağlık alanlarda kışlar uzun sürer ve kar örtüsü aylarca yerde kalır.",
    after:
      "Ilıman karasal iklimin hüküm sürdüğü ülkede vadilerin açtığı koridorlar yerel iklimi belirler. Batıdaki Metohija Havzası, Ak Drin vadisi boyunca Adriyatik Denizi'nden sokulan ılıman hava akımları sayesinde daha yumuşak ve Akdeniz etkisine açık bir karaktere sahiptir.\n\nDoğudaki Kosova Ovası ise kıtadan gelen soğuk hava dalgalarıyla kışları daha sert ve kar yağışlı geçer. Ülkeyi çevreleyen yüksek dağlık alanlarda kışlar uzun sürer ve kar örtüsü aylarca yerde kalır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'XK',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Kosova, sularını üç ayrı denize (Adriyatik, Karadeniz ve Ege) ulaştıran Balkanlar'ın nadir hidrolojik kavşaklarından biridir. Žleb Dağı yamaçlarından doğup Metohija'yı geçen Ak Drin (Drini i Bardhë), Arnavutluk'ta Kara Drin ile birleşerek Adriyatik Denizi'ne dökülür.\n\nDoğudaki Sitnica ve İbar nehirleri Tuna havzası üzerinden Karadeniz'e; güneydeki Lepenac ise Vardar Nehri üzerinden Ege Denizi'ne akar. Doğal göllerin az olduğu ülkede, İbar üzerindeki çok amaçlı Gazivode (Ujmani) Baraj Gölü sanayi, tarım ve enerji üretimi açısından hayati bir tatlı su deposudur.",
    after:
      "Kosova, sularını üç ayrı denize (Adriyatik, Karadeniz ve Ege) ulaştıran Balkanlar'ın nadir su kavşaklarından biridir. Žleb Dağı yamaçlarından doğup Metohija'yı geçen Ak Drin (Drini i Bardhë), Arnavutluk'ta Kara Drin ile birleşerek Adriyatik Denizi'ne dökülür.\n\nDoğudaki Sitnica ve İbar nehirleri Tuna havzası üzerinden Karadeniz'e; güneydeki Lepenac ise Vardar Nehri üzerinden Ege Denizi'ne akar. Doğal göllerin az olduğu ülkede, İbar üzerindeki çok amaçlı Gazivode (Ujmani) Baraj Gölü sanayi, tarım ve enerji üretimi açısından hayati bir tatlı su deposudur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GL',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      'Adanın morfolojisini, iç kesimleri dolduran kilometrelerce kalınlıktaki buzul kütlesi yönetir; buz kalkanının devasa ağırlığı (izostazi) adanın merkezini deniz seviyesinin altına doğru bastırarak dev bir çanağa dönüştürmüştür. Yükseltiler ise kıyı şeridini bir çerçeve gibi saran sarp dağ sıralarında toplanır; Doğu Grönland\'daki 3.694 metrelik Gunnbjørn Fjeld tüm Arktik bölgesinin en yüksek doruğudur.\n\nBuz tabakasını delerek göğe yükselen çıplak kayalık zirveler, Inuit dilinden dünya coğrafya literatürüne geçen "nunatak" adıyla anılır. Okyanus kıyıları ise binlerce yıllık buzul aşındırmasının ve deniz istilasının biçimlendirdiği, girintileriyle 44 bin kilometreyi aşan derin ve görkemli fiyort labirentleriyle parçalanmıştır.',
    after:
      'Adanın yer şekillerini, iç kesimleri dolduran kilometrelerce kalınlıktaki buzul kütlesi belirler; buz kalkanının devasa ağırlığı (izostazi) adanın merkezini deniz seviyesinin altına doğru bastırarak dev bir çanağa dönüştürmüştür. Yükseltiler ise kıyı şeridini bir çerçeve gibi saran sarp dağ sıralarında toplanır; Doğu Grönland\'daki 3.694 metrelik Gunnbjørn Fjeld tüm Arktik bölgesinin en yüksek doruğudur.\n\nBuz tabakasını delerek göğe yükselen çıplak kayalık zirveler, Inuit dilinden dünya coğrafya literatürüne geçen "nunatak" adıyla anılır. Okyanus kıyıları ise binlerce yıllık buzul aşındırmasının ve deniz istilasının biçimlendirdiği, girintileriyle 44 bin kilometreyi aşan derin ve görkemli fiyort labirentleriyle parçalanmıştır.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GL',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Klasik bir drenaj ağı yerine adanın hidrografyasını buzul erime suları, derin fiyortlar ve denize kopan devasa buzdağları yönetir. Kalınlığı yer yer 3 kilometreyi bulan ve 2,9 milyon kilometreküp buz kütlesi barındıran Grönland buz örtüsü, dünya deniz seviyesini yaklaşık 7,4 metre yükseltebilecek devasa bir tatlı su deposudur.\n\nBatı kıyısındaki Ilulissat Buz Fiyordu'nu besleyen Sermeq Kujalleq, yılda 35 kilometreküpten fazla buzdağını okyanusa bırakarak Antarktika dışındaki yeryüzünün en üretken buzul akışını sağlar. Doğu kıyısında ise karaya yüzlerce kilometre sokulan Scoresby Sund dünyanın en geniş fiyort sistemini oluşturur.",
    after:
      "Adanın sularını klasik bir akarsu ağı yerine buzul erime suları, derin fiyortlar ve denize kopan devasa buzdağları belirler. Kalınlığı yer yer 3 kilometreyi bulan ve 2,9 milyon kilometreküp buz kütlesi barındıran Grönland buz örtüsü, dünya deniz seviyesini yaklaşık 7,4 metre yükseltebilecek devasa bir tatlı su deposudur.\n\nBatı kıyısındaki Ilulissat Buz Fiyordu'nu besleyen Sermeq Kujalleq, yılda 35 kilometreküpten fazla buzdağını okyanusa bırakarak Antarktika dışındaki yeryüzünün en üretken buzul akışını sağlar. Doğu kıyısında ise karaya yüzlerce kilometre sokulan Scoresby Sund dünyanın en geniş fiyort sistemini oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GL',
    property: 'governanceNoteTr',
    column: 'governance_note_tr',
    kind: 'scalar',
    before:
      "Grönland, Danimarka Krallığı içinde özerk bir yönetime sahiptir. Bugünkü düzenin temeli, 1979'da kurulan Home Rule yönetiminin yerini alan 2009 tarihli Özerklik Yasası'dır. Yasa, 25 Kasım 2008'de yapılan halk oylamasında yüzde 75,5 evet oyu çıktıktan sonra kabul edildi ve 21 Haziran 2009'da yürürlüğe girdi.\n\nYasanın başlangıç bölümünde Grönland halkı, uluslararası hukuk uyarınca kendi kaderini tayin hakkına sahip bir halk olarak tanınır. Aynı yasa Grönlandcayı (Kalaallisut) resmî dil sayar. Anayasa, vatandaşlık, yüksek mahkeme, dış politika, savunma ve güvenlik politikası ile kur ve para politikası Danimarka'da kalır; bunlar Grönland'a devredilemeyen alanlardır.\n\nGrönland, Danimarka ile birlikte 1973'te Avrupa Topluluklarına katıldı. 1982'deki halk oylamasının ardından 1 Şubat 1985'te ayrıldı, Danimarka ise üye kaldı.\n\nAdanın tek kara sınırı 2022'de çizildi. 14 Haziran 2022'de Kanada ile Danimarka Krallığı, Grönland'ın da katılımıyla, Tartupaluk (Hans Adası) üzerindeki elli yılı aşkın sınır sorununu bir anlaşmayla çözdü. Sınır, adayı kuzeyden güneye boydan boya kesen doğal yarığı izler.",
    after:
      "Grönland, Danimarka Krallığı içinde özerk bir yönetime sahiptir. Bugünkü düzenin temeli, 1979'da kurulan iç yönetim düzeninin yerini alan 2009 tarihli Özerklik Yasası'dır. Yasa, 25 Kasım 2008'de yapılan halk oylamasında yüzde 75,5 evet oyu çıktıktan sonra kabul edildi ve 21 Haziran 2009'da yürürlüğe girdi.\n\nYasanın başlangıç bölümünde Grönland halkı, uluslararası hukuk uyarınca kendi kaderini tayin hakkına sahip bir halk olarak tanınır. Aynı yasa Grönlandcayı (Kalaallisut) resmî dil sayar. Anayasa, vatandaşlık, yüksek mahkeme, dış politika, savunma ve güvenlik politikası ile kur ve para politikası Danimarka'da kalır; bunlar Grönland'a devredilemeyen alanlardır.\n\nGrönland, Danimarka ile birlikte 1973'te Avrupa Topluluklarına katıldı. 1982'deki halk oylamasının ardından 1 Şubat 1985'te ayrıldı, Danimarka ise üye kaldı.\n\nAdanın tek kara sınırı 2022'de çizildi. 14 Haziran 2022'de Kanada ile Danimarka Krallığı, Grönland'ın da katılımıyla, Tartupaluk (Hans Adası) üzerindeki elli yılı aşkın sınır sorununu bir anlaşmayla çözdü. Sınır, adayı kuzeyden güneye boydan boya kesen doğal yarığı izler.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AQ',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Kıtayı baştan başa kat eden Transantarktik Dağları, coğrafyayı Doğu ve Batı Antarktika olmak üzere iki ana kütleye ayırır; Doğu kesimi yüksek ve kadim bir buzul platosu iken Batı kesimi parçalı bir buzul altı adalar morfolojisine sahiptir. Ellsworth Dağları'ndaki 4.892 metrelik Vinson Masifi kıtanın zirve noktasıdır.\n\nOrtalama buz kalınlığının 2 kilometreyi aşması nedeniyle Antarktika, yeryüzünün ortalama yükseltisi en fazla olan kıtasıdır; Güney Kutbu noktası da 2.800 metre rakımlı bu kutup platosu üzerinde yer alır. Buz örtüsünü delerek yükselen az sayıdaki aktif volkandan biri olan Ross Adası'ndaki Erebus Dağı, kalıcı lav gölüyle dünyanın en güneyindeki etkin yanardağdır.",
    after:
      "Kıtayı baştan başa kat eden Transantarktik Dağları, coğrafyayı Doğu ve Batı Antarktika olmak üzere iki ana kütleye ayırır; Doğu kesimi yüksek ve kadim bir buzul platosu iken Batı kesimi ise buzun altında parçalı adalardan oluşur. Ellsworth Dağları'ndaki 4.892 metrelik Vinson Masifi kıtanın zirve noktasıdır.\n\nOrtalama buz kalınlığının 2 kilometreyi aşması nedeniyle Antarktika, yeryüzünün ortalama yükseltisi en fazla olan kıtasıdır; Güney Kutbu noktası da 2.800 metre rakımlı bu kutup platosu üzerinde yer alır. Buz örtüsünü delerek yükselen az sayıdaki aktif volkandan biri olan Ross Adası'ndaki Erebus Dağı, kalıcı lav gölüyle dünyanın en güneyindeki etkin yanardağdır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AQ',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Antarktika, yeryüzünün en soğuk, en fırtınalı ve en kurak kıtasıdır. 21 Temmuz 1983'te Vostok İstasyonu'nda ölçülen eksi 89,2 santigrat derece, standart meteorolojik ölçüm tarihindeki dünya rekoru olmayı sürdürür.\n\nİç platoya düşen yıllık yağış (kar eşdeğeri) yalnızca birkaç santimetre düzeyinde kaldığı için kıta hidrolojik olarak devasa bir kutup çölüdür; yağan karın erimeden milyonlarca yıl birikip sıkışması bugünkü buz kalkanını meydana getirmiştir. İç kesimden kıyılara doğru dik yamaçlardan hızla boşalan katabatik fırtına rüzgarları saatte yüzlerce kilometre hıza ulaşabilir.",
    after:
      "Antarktika, yeryüzünün en soğuk, en fırtınalı ve en kurak kıtasıdır. 21 Temmuz 1983'te Vostok İstasyonu'nda ölçülen eksi 89,2 santigrat derece, standart meteorolojik ölçüm tarihindeki dünya rekoru olmayı sürdürür.\n\nİç platoya düşen yıllık yağış (kar eşdeğeri) yalnızca birkaç santimetre düzeyinde kaldığı için kıta devasa bir kutup çölüdür; yağan karın erimeden milyonlarca yıl birikip sıkışması bugünkü buz kalkanını meydana getirmiştir. İç kesimden kıyılara doğru dik yamaçlardan hızla boşalan katabatik fırtına rüzgarları saatte yüzlerce kilometre hıza ulaşabilir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AQ',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Gezegenin yüzey tatlı su rezervinin yaklaşık yüzde 90'ını buz halinde hapseden Antarktika buz kalkanı, yaklaşık 30 milyon kilometreküp buz hacmine sahiptir. Bu dev kütlenin tamamının erimesi dünya deniz seviyesini yaklaşık 58 metre yükseltebilecek hidrolojik potansiyel taşır.\n\nBuz örtüsünün okyanusa taştığı kıyılarda Fransa büyüklüğündeki Ross Buz Sahanlığı gibi devasa yüzen buz platformları oluşur. Kilometrelerce kalınlıktaki buz tabakasının tabanında ise jeotermal ısı ve yüksek basınç altında sıvı kalan yüzlerce buzul altı göl keşfedilmiştir; bunların en büyüğü olan Vostok Gölü, milyonlarca yıldır dış dünyadan tecrit edilmiş eşsiz bir ekosistemdir.",
    after:
      "Gezegenin yüzey tatlı su rezervinin yaklaşık yüzde 90'ını buz halinde hapseden Antarktika buz kalkanı, yaklaşık 30 milyon kilometreküp buz hacmine sahiptir. Bu dev kütlenin tamamı eriseydi dünya deniz seviyesi yaklaşık 58 metre yükselebilirdi.\n\nBuz örtüsünün okyanusa taştığı kıyılarda Fransa büyüklüğündeki Ross Buz Sahanlığı gibi devasa yüzen buz platformları oluşur. Kilometrelerce kalınlıktaki buz tabakasının tabanında ise jeotermal ısı ve yüksek basınç altında sıvı kalan yüzlerce buzul altı göl keşfedilmiştir; bunların en büyüğü olan Vostok Gölü, milyonlarca yıldır dış dünyadan tecrit edilmiş eşsiz bir ekosistemdir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TR',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    kind: 'scalar',
    before:
      "Alp-Himalaya kıvrım kuşağında yer alan Türkiye morfolojisi, Avrasya ile Afrika-Arap levhalarının sıkışma rejiminde batıdan doğuya doğru kademeli yükselen genç ve dinamik bir topoğrafyaya sahiptir. Kuzeyde kıyıya paralel uzanan Kuzey Anadolu Dağları ile güneyde Akdeniz'i kuşatan Toros Sıradağları, iç kesimlerdeki plato basamaklarını denizel etkilerden yalıtır.\n\nDoğuya doğru gidildikçe dağ sıraları birbirine yaklaşarak daralır ve yerini ortalama 2.000 metreyi aşan volkanik yaylalar ile Ağrı Dağı gibi görkemli dorukların yükseldiği sarp bir dağlık kütleye bırakır. Batı Anadolu'da ise gerilme tektoniğinin açtığı graben vadileri ve horst blokları kıyıya dik uzanır. Bu genç jeolojik yapı, ülkeyi baştan başa kat eden Kuzey Anadolu ve Doğu Anadolu fay hatlarıyla dinamik bir sismik karakter kazanır.",
    after:
      "Alp-Himalaya kıvrım kuşağında yer alan Türkiye, Avrasya ile Afrika-Arap levhalarının birbirine sıkışmasıyla batıdan doğuya doğru kademeli yükselen genç ve hareketli bir yer şekline sahiptir. Kuzeyde kıyıya paralel uzanan Kuzey Anadolu Dağları ile güneyde Akdeniz'i kuşatan Toros Sıradağları, iç kesimlerdeki plato basamaklarını denizel etkilerden yalıtır.\n\nDoğuya doğru gidildikçe dağ sıraları birbirine yaklaşarak daralır ve yerini ortalama 2.000 metreyi aşan volkanik yaylalar ile Ağrı Dağı gibi görkemli dorukların yükseldiği sarp bir dağlık kütleye bırakır. Batı Anadolu'da ise yer kabuğunun gerilip kırılmasıyla oluşan çöküntü ovaları (graben) ve yükselen bloklar (horst) kıyıya dik uzanır. Bu genç jeolojik yapı, ülkeyi baştan başa kat eden Kuzey Anadolu ve Doğu Anadolu fay hatlarıyla dinamik bir sismik karakter kazanır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TR',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    kind: 'scalar',
    before:
      "Dağ sıralarının kıyılara paralel uzanışı ve ani yükselti basamakları, kıyı kuşakları ile iç bölgeler arasında keskin iklim zıtlıkları üretir. Kıyılarda denizel etkilerin belirlediği ılıman Akdeniz ve her mevsim nemli Karadeniz iklimleri hüküm sürerken; dağların yağmur gölgesinde kalan iç platolarda sıcaklık farklarının belirginleştiği karasal iklim egemendir.\n\nDoğu Karadeniz'in dik yamaçları denizden gelen nemli hava kütlelerini yakalayarak orografik etkiyle ülkenin en yüksek yağışını toplarken; etrafı dağlarla çevrili kapalı Tuz Gölü havzası yılda 300 milimetrenin altında yağış alarak kurak bozkır çehresine bürünür. Yükseltinin doğuya doğru artması kış sıcaklıklarını dondurucu seviyelere çekerken kar örtüsünün yerde kalma süresini uzatır.",
    after:
      "Dağ sıralarının kıyılara paralel uzanışı ve ani yükselti basamakları, kıyı kuşakları ile iç bölgeler arasında keskin iklim zıtlıkları üretir. Kıyılarda denizel etkilerin belirlediği ılıman Akdeniz ve her mevsim nemli Karadeniz iklimleri hüküm sürerken; dağların yağmur gölgesinde kalan iç platolarda sıcaklık farklarının belirginleştiği karasal iklim egemendir.\n\nDoğu Karadeniz'in dik yamaçları denizden gelen nemli hava kütlelerini yükselmeye zorlayarak yamaç yağışıyla ülkenin en yüksek yağışını toplarken; etrafı dağlarla çevrili kapalı Tuz Gölü havzası yılda 300 milimetrenin altında yağış alarak kurak bozkır çehresine bürünür. Yükseltinin doğuya doğru artması kış sıcaklıklarını dondurucu seviyelere çekerken kar örtüsünün yerde kalma süresini uzatır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'TR',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    kind: 'scalar',
    before:
      "Yüksek ve engebeli topoğrafya, Türkiye'yi çevre denizlere ve komşu havzalara su sağlayan stratejik bir hidrolojik kavşak konumuna getirir. Ülke içinden doğarak Karadeniz'e dökülen Kızılırmak ve Yeşilırmak ile Ege'ye inen akarsular kıyılarda geniş tarımsal deltalar kurar. Anadolu yaylalarından beslenen Fırat ve Dicle nehirleri ise Mezopotamya düzlüklerine can vererek Basra Körfezi'ne ulaşır; doğuda Aras Nehri Hazar Denizi kapalı havzasına yönelir. Meriç ve Asi nehirleri ise sınır aşarak Türkiye kıyılarından denize dökülür.\n\nTektonik ve volkanik çöküntüler zengin bir göl varlığı barındırır: Ülkenin en büyük su kütlesi olan sodalı Van Gölü ile kurak dönemlerde alanı daralan sığ Tuz Gölü iki dev kapalı havza oluşturur. Karadeniz ile Akdeniz arasındaki tuzluluk ve yoğunluk farkı ise Marmara Denizi ve Türk Boğazları boyunca üstte Karadeniz'den Akdeniz'e, dipte ise Akdeniz'den Karadeniz'e akan kesintisiz bir çift katmanlı akıntı sistemi işletir.",
    after:
      "Yüksek ve engebeli topoğrafya, Türkiye'yi çevre denizlere ve komşu havzalara su sağlayan önemli bir su kavşağı konumuna getirir. Ülke içinden doğarak Karadeniz'e dökülen Kızılırmak ve Yeşilırmak ile Ege'ye inen akarsular kıyılarda geniş tarımsal deltalar kurar. Anadolu yaylalarından beslenen Fırat ve Dicle nehirleri ise Mezopotamya düzlüklerine can vererek Basra Körfezi'ne ulaşır; doğuda Aras Nehri Hazar Denizi kapalı havzasına yönelir. Meriç ve Asi nehirleri ise sınır aşarak Türkiye kıyılarından denize dökülür.\n\nTektonik ve volkanik çöküntüler zengin bir göl varlığı barındırır: Ülkenin en büyük su kütlesi olan sodalı Van Gölü ile kurak dönemlerde alanı daralan sığ Tuz Gölü iki dev kapalı havza oluşturur. Karadeniz ile Akdeniz arasındaki tuzluluk ve yoğunluk farkı ise Marmara Denizi ve Türk Boğazları boyunca üstte Karadeniz'den Akdeniz'e, dipte ise Akdeniz'den Karadeniz'e akan kesintisiz bir çift katmanlı akıntı sistemi işletir.",
  },
];

function cast(kind: SeedCopyChange['kind']): string {
  if (kind === 'jsonb') return '::jsonb';
  if (kind === 'textarray') return '::text[]';
  return '';
}

function param(kind: SeedCopyChange['kind'], value: unknown): unknown {
  return kind === 'jsonb' && value !== null ? JSON.stringify(value) : value;
}

async function apply(queryRunner: QueryRunner, from: 'before' | 'after', to: 'before' | 'after') {
  for (const change of SEED_COPY_CHANGES) {
    const c = cast(change.kind);
    await queryRunner.query(
      `UPDATE "${change.table}" SET "${change.column}" = $1${c}, "updated_at" = now() WHERE "${change.keyColumn}" = $2 AND "${change.column}" IS NOT DISTINCT FROM $3${c}`,
      [param(change.kind, change[to]), change.key, param(change.kind, change[from])],
    );
  }
}

export class UpdateSeedProseCopy1790208000000 implements MigrationInterface {
  name = 'UpdateSeedProseCopy1790208000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await apply(queryRunner, 'before', 'after');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await apply(queryRunner, 'after', 'before');
  }
}
