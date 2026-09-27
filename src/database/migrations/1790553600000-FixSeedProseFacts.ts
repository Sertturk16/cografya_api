import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Data-only migration: carries the seed prose fact and grammar fixes of this change into
 * databases that were seeded before it (deploys run migrations, never the seed CLIs).
 *
 * Same guard as `UpdateSeedProseCopy1790208000000`: each change rewrites ONE column of ONE
 * row, and only while that column still holds exactly the old text, so a row edited some
 * other way is left alone. `down()` applies the same guard in the other direction.
 * `updated_at` is set by hand because raw SQL bypasses `@UpdateDateColumn`.
 */
type SeedFactChange = {
  readonly table: 'provinces' | 'countries';
  readonly keyColumn: 'plate_code' | 'iso_code';
  readonly key: string;
  readonly property: string;
  readonly column: string;
  readonly before: string;
  readonly after: string;
};

export const SEED_FACT_CHANGES: readonly SeedFactChange[] = [
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '06',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    before:
      "Ankara'nın su ağı, kuzeybatısında doğan Sakarya Nehri ile ilin güneydoğusundan geçen Kızılırmak'a dayanır. Sakarya Nehri'nin kaynağı Çamlıdere ilçesindedir; nehir buradan kuzeybatıya akarak Sakarya iline geçer. Kızılırmak ise ilin güneydoğu kesiminden yaklaşık 256 kilometre boyunca geçer. Şehir merkezinden geçen Çubuk, İncesu ve Ova çayları birleşerek Ankara Çayı'nı oluşturur; bu çay da Sakarya Nehri'ne katılır.\n\nİlin içme suyu ihtiyacı ASKİ tarafından işletilen barajlardan karşılanır: Çamlıdere, Kurtboğazı, Bayındır ile Çubuk I ve Çubuk II. Çamlıdere Barajı, yaklaşık 1,2 milyar m³ kapasitesiyle bu barajların en büyüğüdür. Çubuk I, 1936'da tamamlanan Cumhuriyet döneminin ilk barajıdır. Kesikköprü ve Sarıyar barajları Kızılırmak ve Sakarya üzerinde enerji üretimi amacıyla işletilir.\n\nİlin güneyinde, Gölbaşı ilçesinde yer alan Mogan ve Eymir gölleri başlıca doğal gölleridir. Mogan Gölü yaklaşık 5 km uzunluğunda, 4 metreyi geçmeyen bir derinliğe sahiptir. Eymir Gölü, Mogan Gölü'nden beslenir.",
    after:
      "Ankara'nın su ağı, kuzeybatısından geçen Sakarya Nehri ile ilin güneydoğusundan geçen Kızılırmak'a dayanır. Sakarya Nehri ise il sınırları dışında, Eskişehir'in Çifteler ilçesindeki Sakaryabaşı kaynaklarından doğar. Kızılırmak ise ilin güneydoğu kesiminden yaklaşık 256 kilometre boyunca geçer. Şehir merkezinden geçen Çubuk, İncesu ve Ova çayları birleşerek Ankara Çayı'nı oluşturur; bu çay da Sakarya Nehri'ne katılır.\n\nİlin içme suyu ihtiyacı ASKİ tarafından işletilen barajlardan karşılanır: Çamlıdere, Kurtboğazı, Bayındır ile Çubuk I ve Çubuk II. Çamlıdere Barajı, yaklaşık 1,2 milyar m³ kapasitesiyle bu barajların en büyüğüdür. Çubuk I, 1936'da tamamlanan Cumhuriyet döneminin ilk barajıdır. Kesikköprü ve Sarıyar barajları Kızılırmak ve Sakarya üzerinde enerji üretimi amacıyla işletilir.\n\nİlin güneyinde, Gölbaşı ilçesinde yer alan Mogan ve Eymir gölleri başlıca doğal gölleridir. Mogan Gölü yaklaşık 5 km uzunluğunda, 4 metreyi geçmeyen bir derinliğe sahiptir. Eymir Gölü, Mogan Gölü'nden beslenir.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '10',
    property: 'introTr',
    column: 'intro_tr',
    before:
      "Balıkesir, 2025 yılı boyunca Sındırgı ilçesi çevresinde art arda yaşanan depremlerle sismik olarak gündeme geldi: 10 Ağustos'ta büyüklüğü 6,1, 27 Ekim'de ise 6,0 olan iki ayrı deprem kaydedildi. İl, kuzeyde Marmara Denizi'ne, güney ve batıda Ege Denizi'ne kıyısı olan, iki denizi birden kucaklayan Türkiye'nin az sayıdaki ilinden biridir; toplam kıyı uzunluğu 290,5 kilometredir. Marmara kıyısında Bandırma 60, Ege kıyısında ise Ayvalık 54 kilometrelik bir kıyı şeridine sahiptir.",
    after:
      "Balıkesir, 2025 yılı boyunca Sındırgı ilçesi çevresinde art arda yaşanan depremlerle sismik olarak gündeme geldi: 10 Ağustos'ta büyüklüğü 6,1, 27 Ekim'de ise 6,0 olan iki ayrı deprem kaydedildi. İl, kuzeyde Marmara Denizi'ne, güney ve batıda Ege Denizi'ne kıyısı olan, iki denizi birden kucaklayan Türkiye'nin az sayıdaki illerinden biridir; toplam kıyı uzunluğu 290,5 kilometredir. Marmara kıyısında Bandırma 60, Ege kıyısında ise Ayvalık 54 kilometrelik bir kıyı şeridine sahiptir.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '11',
    property: 'settlementNoteTr',
    column: 'settlement_note_tr',
    before:
      "Bilecik'te büyükşehir statüsü bulunmadığından TÜİK'in il/ilçe merkezi nüfus oranı gerçek bir kentleşme düzeyi gösterir: 2025 verilerine göre nüfusun %84,11'i il ve ilçe merkezlerinde yaşar. 2024 yılında 10.023 kişi aldı, 10.038 kişi verdi; net göç hızı binde -0,07 ile aradaki 15 kişilik farkla aldığından hafifçe daha fazla göç verdi.",
    after:
      "Bilecik'te büyükşehir statüsü bulunmadığından TÜİK'in il/ilçe merkezi nüfus oranı gerçek bir kentleşme düzeyi gösterir: 2025 verilerine göre nüfusun %84,11'i il ve ilçe merkezlerinde yaşar. 2024 yılında 10.023 kişi aldı, 10.038 kişi verdi; net göç hızı binde -0,07'dir; aradaki 15 kişilik farkla, aldığından hafifçe daha fazla göç verdi.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '14',
    property: 'introTr',
    column: 'intro_tr',
    before:
      "Bolu, İstanbul ile Ankara'yı bağlayan D-100 karayolu ve TEM otoyolunun geçtiği, Marmara ile Karadeniz bölgeleri arasındaki en işlek geçiş kuşaklarından birinde yer alır. Abant Dağları üzerindeki krater/birikinti kökenli Abant Gölü, 1.325 metre rakımda, 125 hektarlık yüzölçümüyle ilin en tanınan doğal alanıdır. İl, sekiz komşusuyla Türkiye'deki illerin çoğundan daha fazla komşuya sahiptir.",
    after:
      "Bolu, İstanbul ile Ankara'yı bağlayan D-100 karayolu ve TEM otoyolunun geçtiği, Marmara ile Karadeniz bölgeleri arasındaki en işlek geçiş kuşaklarından birinde yer alır. Abant Dağları üzerindeki heyelan set gölü Abant Gölü, 1.325 metre rakımda, 125 hektarlık yüzölçümüyle ilin en tanınan doğal alanıdır. İl, sekiz komşusuyla Türkiye'deki illerin çoğundan daha fazla komşuya sahiptir.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '30',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    before:
      "Güneydoğu Toroslar'ın en sarp kesimini oluşturan Hakkari'nin yer şekillerinde, 4.168 metreyle Türkiye'nin ikinci en yüksek doruğu olan Uludoruk'un (Reşko) yer aldığı Cilo-Sat Dağları kütlesi egemendir. Buzul Çağı'ndan kalan aktif vadi buzulları, sirk gölleri ve moren setleriyle biçimlenen dağ silsilesi; Gare (3.460 m), Beridalo (3.250 m) ve Sat dağlarıyla çevrilidir. Yüksek dağların arasına sıkışan dar çöküntü koridorları, yerleşme ve ulaşımı zorunlu olarak vadilere hapsetmiştir.",
    after:
      "Güneydoğu Toroslar'ın en sarp kesimini oluşturan Hakkari'nin yer şekillerinde, 4.135 metreyle Türkiye'nin ikinci en yüksek doruğu olan Uludoruk'un (Reşko) yer aldığı Cilo-Sat Dağları kütlesi egemendir. Buzul Çağı'ndan kalan aktif vadi buzulları, sirk gölleri ve moren setleriyle biçimlenen dağ silsilesi; Gare (3.460 m), Beridalo (3.250 m) ve Sat dağlarıyla çevrilidir. Yüksek dağların arasına sıkışan dar çöküntü koridorları, yerleşme ve ulaşımı zorunlu olarak vadilere hapsetmiştir.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '32',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    before:
      "Isparta, Batı Toroslar'ın Isparta uzantıları üzerinde, 3.000 metreye yaklaşan yüksek dağlarla çevrilidir. İlin en yüksek noktası, hem Anamas (Dedegöl) Dağları'nın hem de Batı Toroslar'ın en yüksek zirvesi olan 2.992 metrelik Dedegöl Dağı'dır. Doğuda Sultan Dağları, Konya sınırını oluşturur.",
    after:
      "Isparta, Batı Toroslar'ın Isparta uzantıları üzerinde, 3.000 metreye yaklaşan yüksek dağlarla çevrilidir. İlin en yüksek noktası, Anamas (Dedegöl) Dağları'nın en yüksek zirvesi olan 2.992 metrelik Dedegöl Dağı'dır. Doğuda Sultan Dağları, Konya sınırını oluşturur.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '34',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    before:
      "İstanbul, yer şekilleri bakımından Çatalca-Kocaeli Bölümü'nde yer alır. İlin büyük bölümünü dağlar ya da ovalar değil, aşınım yüzeyleri üzerinde gelişmiş bir plato oluşturur; bu plato Kocaeli Platosu'nun bir parçasıdır. İlin en yüksek noktası, Kartal, Pendik, Sultanbeyli ve Sancaktepe sınırında yer alan 538 metrelik Aydos Dağı'dır. Onu 438 metreyle Kayış Dağı ve 409 metreyle Alem Dağı izler.\n\nİstanbul Boğazı, 17 deniz mili (yaklaşık 31,5 km) uzunluğundadır. Üzerinde, güneyden kuzeye doğru üç asma köprü iki yakayı birbirine bağlar: 1973'te açılan 15 Temmuz Şehitler Köprüsü, 1988'de açılan Fatih Sultan Mehmet Köprüsü ve 2016'da açılan Yavuz Sultan Selim Köprüsü.\n\nBoğazın Avrupa yakasında yer alan Haliç, Kağıthane ve Alibeyköy derelerinin birleşip denizin istila ettiği bir vadi ağzından oluşmuştur. Coğrafyada bu tip kıyılara \"ria\" denir.\n\nTarihi yarımada — bugünkü Fatih ilçesi — şehrin en eski yerleşim çekirdeğidir ve geleneksel olarak yedi tepe üzerine kurulu kabul edilir. Bu tanım surlariçi bölgeyi kapsar; ilin toplam yüzölçümü 5.461 km²'dir.\n\nİstanbul'un yaklaşık 20 km güneyinden Kuzey Anadolu Fayı (KAF) geçer. Dünyanın en aktif fay sistemlerinden biri olan KAF, toplam 1.500 km uzunluğunda, sağ yanal doğrultu atımlı, yani iki yakası birbirine göre yatay kayan bir kırık hattıdır. Fayın Marmara Denizi içinden geçen kolu — Adalar, Silivri, Marmaraereğlisi ve Tekirdağ arasındaki kesim — büyük deprem üretme olasılığı yüksek bir kuşak olarak izlenir.",
    after:
      "İstanbul, yer şekilleri bakımından Çatalca-Kocaeli Bölümü'nde yer alır. İlin büyük bölümünü dağlar ya da ovalar değil, aşınım yüzeyleri üzerinde gelişmiş bir plato oluşturur; bu plato Kocaeli Platosu'nun bir parçasıdır. İlin en yüksek noktası, Kartal, Pendik, Sultanbeyli ve Sancaktepe sınırında yer alan 538 metrelik Aydos Dağı'dır. Onu 442 metreyle Alem Dağı ve 438 metreyle Kayış Dağı izler.\n\nİstanbul Boğazı, 17 deniz mili (yaklaşık 31,5 km) uzunluğundadır. Üzerinde, güneyden kuzeye doğru üç asma köprü iki yakayı birbirine bağlar: 1973'te açılan 15 Temmuz Şehitler Köprüsü, 1988'de açılan Fatih Sultan Mehmet Köprüsü ve 2016'da açılan Yavuz Sultan Selim Köprüsü.\n\nBoğazın Avrupa yakasında yer alan Haliç, Kağıthane ve Alibeyköy derelerinin birleşip denizin istila ettiği bir vadi ağzından oluşmuştur. Coğrafyada bu tip kıyılara \"ria\" denir.\n\nTarihi yarımada — bugünkü Fatih ilçesi — şehrin en eski yerleşim çekirdeğidir ve geleneksel olarak yedi tepe üzerine kurulu kabul edilir. Bu tanım surlariçi bölgeyi kapsar; ilin toplam yüzölçümü 5.461 km²'dir.\n\nİstanbul'un yaklaşık 20 km güneyinden Kuzey Anadolu Fayı (KAF) geçer. Dünyanın en aktif fay sistemlerinden biri olan KAF, toplam 1.500 km uzunluğunda, sağ yanal doğrultu atımlı, yani iki yakası birbirine göre yatay kayan bir kırık hattıdır. Fayın Marmara Denizi içinden geçen kolu — Adalar, Silivri, Marmaraereğlisi ve Tekirdağ arasındaki kesim — büyük deprem üretme olasılığı yüksek bir kuşak olarak izlenir.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '42',
    property: 'introTr',
    column: 'intro_tr',
    before:
      "Konya, 40.838 kilometrekarelik yüzölçümüyle Türkiye'nin en büyük ilidir. İç Anadolu Bölgesi'nin güneyinde, geniş bir bozkır platosu üzerinde kuruludur. İl merkezindeki Çumra ilçesi sınırlarında yer alan Çatalhöyük, MÖ 7.400'lere uzanan tarihiyle 2012'de UNESCO Dünya Mirası Listesi'ne girmiştir.",
    after:
      "Konya, 40.838 kilometrekarelik yüzölçümüyle Türkiye'nin en büyük ilidir. İç Anadolu Bölgesi'nin güneyinde, geniş bir bozkır platosu üzerinde kuruludur. Kent merkezinin yaklaşık 52 kilometre güneydoğusundaki Çumra ilçesi sınırlarında yer alan Çatalhöyük, MÖ 7.400'lere uzanan tarihiyle 2012'de UNESCO Dünya Mirası Listesi'ne girmiştir.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '53',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    before:
      "Yıl boyunca süren yüksek yağış, ile yoğun bir akarsu ağı ve bol yeraltı suyu kazandırır; Fırtına Deresi'nin yanı sıra çok sayıda küçük dere kıyı boyunca doğrudan Karadeniz'e dökülür. Bu bol su kaynağı, çay ve fındık tarımının yanında ilin başlıca geçim kaynaklarından birini oluşturan küçük ölçekli hidroelektrik ve içme suyu tesislerinin de altyapısını oluşturur.",
    after:
      "Yıl boyunca süren yüksek yağış, Rize'ye yoğun bir akarsu ağı ve bol yeraltı suyu kazandırır; Fırtına Deresi'nin yanı sıra çok sayıda küçük dere kıyı boyunca doğrudan Karadeniz'e dökülür. Bu bol su kaynağı, çay ve fındık tarımının yanında ilin başlıca geçim kaynaklarından birini oluşturan küçük ölçekli hidroelektrik ve içme suyu tesislerinin de altyapısını oluşturur.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '55',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    before:
      "Türkiye sınırları içinde tamamen akan en uzun nehir olan Kızılırmak, Bafra ilçesi yakınlarında Karadeniz'e dökülür. Nehrin taşıdığı alüvyonların oluşturduğu Kızılırmak Deltası, 1998'de Ramsar Sözleşmesi'ne dahil edilmiş, Anadolu'nun ikinci büyük Ramsar alanıdır. Delta içindeki Balık, Uzun, Cernek, Liman, Karaboğaz ve Mülk gölleri acı su özelliği taşır; alanda 358 kuş türü tespit edilmiştir.\n\nİlin doğusunda Yeşilırmak, Çarşamba ilçesi yakınlarında kendi deltasını oluşturarak denize ulaşır. İçme suyu ihtiyacının büyük bölümü, Abdal Deresi üzerinde 1985-1988 arasında inşa edilen ve yaklaşık 580 milyon m³ kapasiteli Çakmak Barajı'ndan karşılanır.",
    after:
      "Türkiye sınırları içinde tamamen akan en uzun nehir olan Kızılırmak, Bafra ilçesi yakınlarında Karadeniz'e dökülür. Nehrin taşıdığı alüvyonların oluşturduğu Kızılırmak Deltası, 1998'de Ramsar Sözleşmesi'ne dahil edilmiş, Anadolu'nun ikinci büyük Ramsar alanıdır. Delta içindeki Balık, Uzun, Cernek, Liman, Karaboğaz ve Mülk gölleri acı su özelliği taşır; alanda 358 kuş türü tespit edilmiştir.\n\nİlin doğusunda Yeşilırmak, Çarşamba ilçesi yakınlarında kendi deltasını oluşturarak denize ulaşır. İçme suyu ihtiyacının büyük bölümü, Abdal Deresi üzerinde 1985-1988 arasında inşa edilen ve yaklaşık 106,5 milyon m³ kapasiteli Çakmak Barajı'ndan karşılanır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '58',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    before:
      "Kızılırmak, İmranlı ilçesinde Kızıldağ'ın 2.000 metreyi aşan yükseltilerinden doğar. Sivas topraklarından geçtikten sonra Kayseri, Kırşehir, Kırıkkale, Ankara, Aksaray, Nevşehir, Çorum ve Samsun'dan geçerek Karadeniz'e dökülür. Millî Eğitim Bakanlığı müfredat kaynakları nehrin toplam uzunluğu için 1.355 kilometre rakamını kullanır.",
    after:
      "Kızılırmak, İmranlı ilçesinde Kızıldağ'ın 2.000 metreyi aşan yükseltilerinden doğar. Sivas topraklarından geçtikten sonra Kayseri, Kırşehir, Kırıkkale, Ankara, Aksaray, Nevşehir, Çankırı, Çorum ve Samsun'dan geçerek Karadeniz'e dökülür. Millî Eğitim Bakanlığı müfredat kaynakları nehrin toplam uzunluğu için 1.355 kilometre rakamını kullanır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '61',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    before:
      "İlin yüzölçümünün büyük bölümünü dağlar oluşturur; kıyı düzlükleri yalnızca akarsu ağızlarında dar şeritler halinde genişler. Güneydoğuda Soğanlı Dağları'nın en yüksek noktası olan Çakırgöl Dağı 3.063 metreye, güneybatıda Zigana Dağları'ndaki Zigana Geçidi 2.356 metreye ulaşır. İlin en yüksek kesimi ise güneydoğu ucundaki Haldizen Dağları'dır, 3.000 metrenin üzerinde zirvelere sahiptir.",
    after:
      "İlin yüzölçümünün büyük bölümünü dağlar oluşturur; kıyı düzlükleri yalnızca akarsu ağızlarında dar şeritler halinde genişler. Güneydoğuda Soğanlı Dağları'nın en yüksek noktası olan Çakırgöl Dağı 3.063 metreye, güneybatıda Zigana Dağları'ndaki Zigana Geçidi 2.032 metreye ulaşır. İlin en yüksek kesimi ise güneydoğu ucundaki Haldizen Dağları'dır, 3.000 metrenin üzerinde zirvelere sahiptir.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '62',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    before:
      "İl topoğrafyasını kuzeyde 3.300 metreye tırmanan kireçtaşından sarp Munzur Dağları ile ortada yükselen Bağırpaşa Dağı (3.298 m) belirler. Kırılma ve akarsu aşındırmasının yarattığı derin kanyon vadileri araziyi parçalamıştır. Munzur Dağları'nın yüksek doruklarında buzul gölleri (sirk gölleri) bulunurken, Ovacık çöküntü havzası tabanında karstik kaynaklardan fışkıran devasa su çıkışları yer alır.",
    after:
      "İl topoğrafyasını kuzeyde Akbaba Tepesi'nde 3.463 metreye tırmanan kireçtaşından sarp Munzur Dağları ile kuzeydoğu ucunda yükselen Bağırpaşa Dağı (3.298 m) belirler. Kırılma ve akarsu aşındırmasının yarattığı derin kanyon vadileri araziyi parçalamıştır. Munzur Dağları'nın yüksek doruklarında buzul gölleri (sirk gölleri) bulunurken, Ovacık çöküntü havzası tabanında karstik kaynaklardan fışkıran devasa su çıkışları yer alır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '65',
    property: 'introTr',
    column: 'intro_tr',
    before:
      "Van, Doğu Anadolu'nun en büyük kenti olup Urartu Krallığı'nın kadim başkenti Tuşba'dan bu yana Van Gölü Kapalı Havzası'nın ana yerleşim ve ticaret merkezidir. Deniz seviyesinden 1.646 metre yüksekteki geniş göl kıyısında kurulu olan kent, etrafını saran volkanik dağlar ve su kütlesinin yarattığı ılımanlaştırıcı etkiyle Doğu Anadolu'nun en canlı tarım, hayvancılık ve lojistik kavşaklarından biri olarak öne çıkar.",
    after:
      "Van, Doğu Anadolu'nun en büyük kenti olup Urartu Krallığı'nın kadim başkenti Tuşpa'dan bu yana Van Gölü Kapalı Havzası'nın ana yerleşim ve ticaret merkezidir. Deniz seviyesinden 1.646 metre yüksekteki geniş göl kıyısında kurulu olan kent, etrafını saran volkanik dağlar ve su kütlesinin yarattığı ılımanlaştırıcı etkiyle Doğu Anadolu'nun en canlı tarım, hayvancılık ve lojistik kavşaklarından biri olarak öne çıkar.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '65',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    before:
      "Van'ın yer şekillerini jeolojik açıdan genç volkanik faaliyetler ve yoğun yer kabuğu hareketleri biçimlendirmiştir. İlin batısındaki Van Gölü, yaklaşık 200 bin yıl önce Nemrut Dağı'nın patlayarak püskürttüğü lavların Muş Havzası'na giden doğal akış yolunu tıkamasıyla oluşmuş dünyanın en büyük volkanik set gölüdür. Tepesinde 6 kilometre çapında geniş bir kaldera barındıran 2.935 metrelik Nemrut Dağı, son lav akıntısı 1441'de kaydedilmiş uyuyan aktif bir volkandır.\n\nGöl çanağının kuzeyinde yükselen 4.058 metrelik Süphan Dağı, zirvesindeki buzul kalıntılarıyla Ağrı ve Cilo'nun ardından Türkiye'nin üçüncü yüksek doruğudur. Havza güneyden dik ve parçalı Bitlis Masifi, kuzey ve doğudan ise Aladağ ve Tendürek volkanik dizilimleriyle kuşatılmıştır.\n\nKuzey ve Doğu Anadolu fay sistemlerinin karmaşık gerilme alanında yer alan ilde, 23 Ekim 2011'de merkez üssü Tabanlı olan 7,2 büyüklüğünde bir deprem yaşanmış, 604 kişi yaşamını yitirmiş ve en ağır yıkım Erciş ilçesinde meydana gelmiştir. Aynı yılın 9 Kasım'ında Edremit merkezli 5,6 büyüklüğündeki sarsıntı da binalarda ek hasara yol açmıştır.",
    after:
      "Van'ın yer şekillerini jeolojik açıdan genç volkanik faaliyetler ve yoğun yer kabuğu hareketleri biçimlendirmiştir. İlin batısındaki Van Gölü, yaklaşık 200 bin yıl önce Nemrut Dağı'nın patlayarak püskürttüğü lavların Muş Havzası'na giden doğal akış yolunu tıkamasıyla oluşmuş dünyanın en büyük volkanik set gölüdür. Gölün batısında, komşu Bitlis sınırları içinde yükselen ve tepesinde 6 kilometre çapında geniş bir kaldera barındıran 2.935 metrelik Nemrut Dağı, son lav akıntısı 1441'de kaydedilmiş uyuyan aktif bir volkandır.\n\nGöl çanağının kuzeyinde yükselen 4.058 metrelik Süphan Dağı, zirvesindeki buzul kalıntılarıyla Ağrı ve Cilo'nun ardından Türkiye'nin üçüncü yüksek doruğudur. Havza güneyden dik ve parçalı Bitlis Masifi, kuzey ve doğudan ise Aladağ ve Tendürek volkanik dizilimleriyle kuşatılmıştır.\n\nKuzey ve Doğu Anadolu fay sistemlerinin karmaşık gerilme alanında yer alan ilde, 23 Ekim 2011'de merkez üssü Tabanlı olan 7,2 büyüklüğünde bir deprem yaşanmış, 604 kişi yaşamını yitirmiş ve en ağır yıkım Erciş ilçesinde meydana gelmiştir. Aynı yılın 9 Kasım'ında Edremit merkezli 5,6 büyüklüğündeki sarsıntı da binalarda ek hasara yol açmıştır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '67',
    property: 'introTr',
    column: 'intro_tr',
    before:
      "Zonguldak, Türkiye'nin taşkömürü yataklarına sahip tek ilidir; Ereğli ilçesinde 1829'da bulunan kömür damarları, ilin ekonomik kimliğini belirlemiştir. Kestaneci köyünden Uzun Mehmet'in bulduğu kabul edilen bu yataklar, Karbonifer döneminde göllerde biriken bitki kalıntılarından oluşmuştur. Kok kömürüyle beslenen Ereğli Demir Çelik Fabrikaları, bu jeolojik mirasın sanayiye dönüşmüş hâlidir.",
    after:
      "Zonguldak, Türkiye'nin başlıca taşkömürü havzasının merkezidir; Ereğli ilçesinde 1829'da bulunan kömür damarları, ilin ekonomik kimliğini belirlemiştir. Kestaneci köyünden Uzun Mehmet'in bulduğu kabul edilen bu yataklar, Karbonifer döneminde bataklıklarda biriken bitki kalıntılarından oluşmuştur. Kok kömürüyle beslenen Ereğli Demir Çelik Fabrikaları, bu jeolojik mirasın sanayiye dönüşmüş hâlidir.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '70',
    property: 'introTr',
    column: 'intro_tr',
    before:
      "Karaman, 1989'da Konya'dan ayrılarak ayrı bir il olmuştur; 13-16. yüzyıllar arasında Anadolu'nun güçlü beyliklerinden Karamanoğulları'na başkentlik yapmıştır. İlin kuzeyinde yükselen Karadağ'daki Binbirkilise ören yeri, Bizans döneminden kalma yüzlerce kilise ve manastır kalıntısını barındırır.",
    after:
      "Karaman, 1989'da Konya'dan ayrılarak ayrı bir il olmuştur; 13-15. yüzyıllar arasında Anadolu'nun güçlü beyliklerinden Karamanoğulları'na başkentlik yapmıştır. İlin kuzeyinde yükselen Karadağ'daki Binbirkilise ören yeri, Bizans döneminden kalma yüzlerce kilise ve manastır kalıntısını barındırır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '71',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    before:
      "Kırıkkale, Kızılırmak'ın Ankara'ya yakın kesiminden geçtiği, ortalama 700-850 metre yükseklikteki dar bir plato şeridi üzerindedir. İl, İç Anadolu Bölgesi'nin bu platformda seed edilmiş illeri arasında en küçük yüzölçümüne sahiptir.",
    after:
      "Kırıkkale, Kızılırmak'ın Ankara'ya yakın kesiminden geçtiği, ortalama 700-850 metre yükseklikteki dar bir plato şeridi üzerindedir. İl, İç Anadolu Bölgesi'nin illeri arasında en küçük yüzölçümüne sahiptir.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '19',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    before:
      "MGM'nin 2023 Köppen sınıflandırması bu ili Cfb (Karadeniz iklimi, her mevsim yağışlı, yazı serin) olarak verir. Ancak MGM'nin kendi raporu, bu basitleştirilmiş yöntemin (üçüncü-harf kuralı) Türkiye'deki 254 istasyonun yaklaşık %65'ini 'Cs' (Akdeniz tipi) çıkardığını ve İç Anadolu ile Doğu Anadolu gibi bölgelerde ayırt ediciliğinin sınırlı kaldığını belirtir; Thornthwaite, Erinç, De Martonne ve Aydeniz gibi diğer sınıflandırmalarda bu iller farklı iklim tiplerine ayrışabilir. Köppen sınıflandırması ile ders kitaplarındaki bölgesel iklim adları iki ayrı sistemdir ve illerin çoğunda örtüşmez. Bir ilin Köppen kodu Akdeniz tipini gösterirken ders kitabı aynı ili karasal ya da Karadeniz iklimi alanında gösterebilir, tersi de görülür.",
    after:
      "MGM'nin 2023 Köppen sınıflandırması bu ili Cfb (Karadeniz iklimi, her mevsim yağışlı, yazı sıcak) olarak verir. Ancak MGM'nin kendi raporu, bu basitleştirilmiş yöntemin (üçüncü-harf kuralı) Türkiye'deki 254 istasyonun yaklaşık %65'ini 'Cs' (Akdeniz tipi) çıkardığını ve İç Anadolu ile Doğu Anadolu gibi bölgelerde ayırt ediciliğinin sınırlı kaldığını belirtir; Thornthwaite, Erinç, De Martonne ve Aydeniz gibi diğer sınıflandırmalarda bu iller farklı iklim tiplerine ayrışabilir. Köppen sınıflandırması ile ders kitaplarındaki bölgesel iklim adları iki ayrı sistemdir ve illerin çoğunda örtüşmez. Bir ilin Köppen kodu Akdeniz tipini gösterirken ders kitabı aynı ili karasal ya da Karadeniz iklimi alanında gösterebilir, tersi de görülür.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '37',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    before:
      "MGM'nin 2023 Köppen sınıflandırması bu ili Cfb (Karadeniz iklimi, her mevsim yağışlı, yazı serin) olarak verir. Ancak MGM'nin kendi raporu, bu basitleştirilmiş yöntemin (üçüncü-harf kuralı) Türkiye'deki 254 istasyonun yaklaşık %65'ini 'Cs' (Akdeniz tipi) çıkardığını ve İç Anadolu ile Doğu Anadolu gibi bölgelerde ayırt ediciliğinin sınırlı kaldığını belirtir; Thornthwaite, Erinç, De Martonne ve Aydeniz gibi diğer sınıflandırmalarda bu iller farklı iklim tiplerine ayrışabilir. Köppen sınıflandırması ile ders kitaplarındaki bölgesel iklim adları iki ayrı sistemdir ve illerin çoğunda örtüşmez. Bir ilin Köppen kodu Akdeniz tipini gösterirken ders kitabı aynı ili karasal ya da Karadeniz iklimi alanında gösterebilir, tersi de görülür.",
    after:
      "MGM'nin 2023 Köppen sınıflandırması bu ili Cfb (Karadeniz iklimi, her mevsim yağışlı, yazı sıcak) olarak verir. Ancak MGM'nin kendi raporu, bu basitleştirilmiş yöntemin (üçüncü-harf kuralı) Türkiye'deki 254 istasyonun yaklaşık %65'ini 'Cs' (Akdeniz tipi) çıkardığını ve İç Anadolu ile Doğu Anadolu gibi bölgelerde ayırt ediciliğinin sınırlı kaldığını belirtir; Thornthwaite, Erinç, De Martonne ve Aydeniz gibi diğer sınıflandırmalarda bu iller farklı iklim tiplerine ayrışabilir. Köppen sınıflandırması ile ders kitaplarındaki bölgesel iklim adları iki ayrı sistemdir ve illerin çoğunda örtüşmez. Bir ilin Köppen kodu Akdeniz tipini gösterirken ders kitabı aynı ili karasal ya da Karadeniz iklimi alanında gösterebilir, tersi de görülür.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '14',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    before:
      "MGM'nin 2023 Köppen sınıflandırması bu ili Cfb (Karadeniz iklimi, her mevsim yağışlı, yazı serin) olarak verir. Ancak MGM'nin kendi raporu, bu basitleştirilmiş yöntemin (üçüncü-harf kuralı) Türkiye'deki 254 istasyonun yaklaşık %65'ini 'Cs' (Akdeniz tipi) çıkardığını ve İç Anadolu ile Doğu Anadolu gibi bölgelerde ayırt ediciliğinin sınırlı kaldığını belirtir; Thornthwaite, Erinç, De Martonne ve Aydeniz gibi diğer sınıflandırmalarda bu iller farklı iklim tiplerine ayrışabilir. Köppen sınıflandırması ile ders kitaplarındaki bölgesel iklim adları iki ayrı sistemdir ve illerin çoğunda örtüşmez. Bir ilin Köppen kodu Akdeniz tipini gösterirken ders kitabı aynı ili karasal ya da Karadeniz iklimi alanında gösterebilir, tersi de görülür.",
    after:
      "MGM'nin 2023 Köppen sınıflandırması bu ili Cfb (Karadeniz iklimi, her mevsim yağışlı, yazı sıcak) olarak verir. Ancak MGM'nin kendi raporu, bu basitleştirilmiş yöntemin (üçüncü-harf kuralı) Türkiye'deki 254 istasyonun yaklaşık %65'ini 'Cs' (Akdeniz tipi) çıkardığını ve İç Anadolu ile Doğu Anadolu gibi bölgelerde ayırt ediciliğinin sınırlı kaldığını belirtir; Thornthwaite, Erinç, De Martonne ve Aydeniz gibi diğer sınıflandırmalarda bu iller farklı iklim tiplerine ayrışabilir. Köppen sınıflandırması ile ders kitaplarındaki bölgesel iklim adları iki ayrı sistemdir ve illerin çoğunda örtüşmez. Bir ilin Köppen kodu Akdeniz tipini gösterirken ders kitabı aynı ili karasal ya da Karadeniz iklimi alanında gösterebilir, tersi de görülür.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '08',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    before:
      "MGM'nin 2023 Köppen sınıflandırması bu ili Cfb (Karadeniz iklimi, her mevsim yağışlı, yazı serin) olarak verir. Ancak MGM'nin kendi raporu, bu basitleştirilmiş yöntemin (üçüncü-harf kuralı) Türkiye'deki 254 istasyonun yaklaşık %65'ini 'Cs' (Akdeniz tipi) çıkardığını ve İç Anadolu ile Doğu Anadolu gibi bölgelerde ayırt ediciliğinin sınırlı kaldığını belirtir; Thornthwaite, Erinç, De Martonne ve Aydeniz gibi diğer sınıflandırmalarda bu iller farklı iklim tiplerine ayrışabilir. Köppen sınıflandırması ile ders kitaplarındaki bölgesel iklim adları iki ayrı sistemdir ve illerin çoğunda örtüşmez. Bir ilin Köppen kodu Akdeniz tipini gösterirken ders kitabı aynı ili karasal ya da Karadeniz iklimi alanında gösterebilir, tersi de görülür.",
    after:
      "MGM'nin 2023 Köppen sınıflandırması bu ili Cfb (Karadeniz iklimi, her mevsim yağışlı, yazı sıcak) olarak verir. Ancak MGM'nin kendi raporu, bu basitleştirilmiş yöntemin (üçüncü-harf kuralı) Türkiye'deki 254 istasyonun yaklaşık %65'ini 'Cs' (Akdeniz tipi) çıkardığını ve İç Anadolu ile Doğu Anadolu gibi bölgelerde ayırt ediciliğinin sınırlı kaldığını belirtir; Thornthwaite, Erinç, De Martonne ve Aydeniz gibi diğer sınıflandırmalarda bu iller farklı iklim tiplerine ayrışabilir. Köppen sınıflandırması ile ders kitaplarındaki bölgesel iklim adları iki ayrı sistemdir ve illerin çoğunda örtüşmez. Bir ilin Köppen kodu Akdeniz tipini gösterirken ders kitabı aynı ili karasal ya da Karadeniz iklimi alanında gösterebilir, tersi de görülür.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MN',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    before:
      'Moğolistan topoğrafyası, batıdaki yüksek sıradağlar ile doğuya ve güneye doğru genişleyen, uzun süre aşınarak düzleşmiş dalgalı platolardan (peneplen) meydana gelir. Batıda kuzeybatı-güneydoğu doğrultusunda uzanan sarp Altay Dağları, Moğolistan, Rusya ve Çin sınırlarının birleştiği kavşakta yer alan 4.374 metrelik Höyten Zirvesi (Khüiten) ile ülkenin en yüksek doruğunu oluşturur; Altay Tavan Bogd masifi ülkedeki dağ buzullarının ana merkezidir.\n\nÜlkenin orta kesiminde volkanik plato kalıntılarıyla çevrili Hangay Dağları, daha kuzeyde ise Rusya sınırına uzanan Hentiy Sıradağları yükselir. Güney kesimde ülke alanının üçte birini kaplayan Gobi Çölü uzanır; Gobi, kumullardan ziyade şiddetli rüzgar erozyonunun soyduğu çakıllı, taşlık platolar ve killi çöküntü havzalarından meydana gelir.',
    after:
      'Moğolistan topoğrafyası, batıdaki yüksek sıradağlar ile doğuya ve güneye doğru genişleyen, uzun süre aşınarak düzleşmiş dalgalı platolardan (peneplen) meydana gelir. Batıda kuzeybatı-güneydoğu doğrultusunda uzanan sarp Altay Dağları, Moğolistan-Çin sınırı üzerinde, üç ülkenin sınırlarının kesiştiği noktaya yalnızca birkaç kilometre uzaklıkta yer alan 4.374 metrelik Höyten Zirvesi (Khüiten) ile ülkenin en yüksek doruğunu oluşturur; Altay Tavan Bogd masifi ülkedeki dağ buzullarının ana merkezidir.\n\nÜlkenin orta kesiminde volkanik plato kalıntılarıyla çevrili Hangay Dağları, daha kuzeyde ise Rusya sınırına uzanan Hentiy Sıradağları yükselir. Güney kesimde ülke alanının üçte birini kaplayan Gobi Çölü uzanır; Gobi, kumullardan ziyade şiddetli rüzgar erozyonunun soyduğu çakıllı, taşlık platolar ve killi çöküntü havzalarından meydana gelir.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'KG',
    property: 'governmentFormTr',
    column: 'government_form_tr',
    before: 'Parlamenter cumhuriyet',
    after: 'Başkanlık cumhuriyeti',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'PK',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    before:
      'Toprakların dörtte üçünden fazlasında kurak ve yarı kurak çöl ve bozkır iklimi egemendir. Yaz aylarında İndus Ovası ve Beluçistan içlerinde sıcaklıklar düzenli olarak 45 derecenin üzerine çıkar, Yakubabad kenti dünyanın en sıcak yerleşimlerinden biri haline gelir; kışlar ise iç ovalarda serin ve ılıman seyreder. \n\nYağış rejimini büyük ölçüde temmuz ile eylül ayları arasında etkili olan güneybatı musonu belirler; muson neminin ulaştığı doğu ve kuzey ovaları yoğun sağanaklar alırken, batıdaki Beluçistan Platosu ve güney kıyıları bu yağışlardan çok az pay alır. Kuzeydeki yüksek dağlık kesimlerde ise yıl boyu donma noktasında seyreden sert alpin iklim ve yoğun kış kar yağışları hüküm sürer.',
    after:
      'Toprakların dörtte üçünden fazlasında kurak ve yarı kurak çöl ve bozkır iklimi egemendir. Yaz aylarında İndus Ovası ve Beluçistan içlerinde sıcaklıklar düzenli olarak 45 derecenin üzerine çıkar, Jacobabad kenti dünyanın en sıcak yerleşimlerinden biri haline gelir; kışlar ise iç ovalarda serin ve ılıman seyreder. \n\nYağış rejimini büyük ölçüde temmuz ile eylül ayları arasında etkili olan güneybatı musonu belirler; muson neminin ulaştığı doğu ve kuzey ovaları yoğun sağanaklar alırken, batıdaki Beluçistan Platosu ve güney kıyıları bu yağışlardan çok az pay alır. Kuzeydeki yüksek dağlık kesimlerde ise yıl boyu donma noktasında seyreden sert alpin iklim ve yoğun kış kar yağışları hüküm sürer.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AZ',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    before:
      "Azerbaycan topoğrafyası, yüksek dağ kuşakları ile bunların arasında çöken geniş alüvyal çöküntü ovalarının tezatıyla şekillenmiştir. Kuzey sınırını bir duvar gibi kapatan Büyük Kafkas Dağları üzerinde, Rusya sınırında 4.485 metreye ulaşan Bazardüzü Zirvesi ülkenin doruk noktasını oluşturur. Batıda Karabağ volkanik yaylasını da içeren Küçük Kafkas Dağları, güneydoğuda ise İran sınırını izleyen ormanlık Talış Dağları yükselir.\n\nKarabağ, uluslararası hukukta hep Azerbaycan toprağı sayılmıştır. Bölgeyi 1990'lardan 2023'e kadar, Ermenistan dahil hiçbir ülke tarafından tanınmayan bir Ermeni yönetimi fiilen ayrı yönetti; Azerbaycan'ın Eylül 2023'teki askeri harekâtı sonrasında bu yönetim dağıldı; bölgenin yaklaşık 120.000 kişilik Ermeni nüfusunun 100.000'i aşkını, birkaç gün içinde bölgeyi terk edip Ermenistan'a geçti. Bölge bugün Azerbaycan idaresindedir. \n\nBu sıradağların kollarının çevrelediği orta kesimde, Kura ve Aras nehirlerinin oluşturduğu geniş Kura-Aras Ovaları uzanır. Hazar Denizi'nin yüzeyi okyanus seviyesinin altında olduğundan kıyı şeridindeki düzlüklerin önemli bir bölümü deniz seviyesinin altında seyreder; Abşeron ve Gobustan çevrelerinde tektonik gaz çıkışlarıyla beslenen yüzlerce çamur volkanı, bölgeye özgü eşsiz bir jeolojik görünüm oluşturur.",
    after:
      "Azerbaycan topoğrafyası, yüksek dağ kuşakları ile bunların arasında çöken geniş alüvyal çöküntü ovalarının tezatıyla şekillenmiştir. Kuzey sınırını bir duvar gibi kapatan Büyük Kafkas Dağları üzerinde, Rusya sınırında 4.466 metreye ulaşan Bazardüzü Zirvesi ülkenin doruk noktasını oluşturur. Batıda Karabağ volkanik yaylasını da içeren Küçük Kafkas Dağları, güneydoğuda ise İran sınırını izleyen ormanlık Talış Dağları yükselir.\n\nKarabağ, uluslararası hukukta hep Azerbaycan toprağı sayılmıştır. Bölgeyi 1990'lardan 2023'e kadar, Ermenistan dahil hiçbir ülke tarafından tanınmayan bir Ermeni yönetimi fiilen ayrı yönetti; Azerbaycan'ın Eylül 2023'teki askeri harekâtı sonrasında bu yönetim dağıldı; bölgenin yaklaşık 120.000 kişilik Ermeni nüfusunun 100.000'i aşkını, birkaç gün içinde bölgeyi terk edip Ermenistan'a geçti. Bölge bugün Azerbaycan idaresindedir. \n\nBu sıradağların kollarının çevrelediği orta kesimde, Kura ve Aras nehirlerinin oluşturduğu geniş Kura-Aras Ovaları uzanır. Hazar Denizi'nin yüzeyi okyanus seviyesinin altında olduğundan kıyı şeridindeki düzlüklerin önemli bir bölümü deniz seviyesinin altında seyreder; Abşeron ve Gobustan çevrelerinde tektonik gaz çıkışlarıyla beslenen yüzlerce çamur volkanı, bölgeye özgü eşsiz bir jeolojik görünüm oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AE',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    before:
      "Ülke topoğrafyasının yüzde sekseninden fazlası düz veya dalgalı kum çölleriyle kaplıdır. Güneyde ve batıda çöl manzarası, dünyanın en yüksek kumul sırtlarına sahip Rubalhali'nin uzantısıyla birleşir; Liva Vahası çevresinde yükselen dev barkanlar yüzlerce metrelik irtifalar kazanır. Basra Körfezi kıyısı ise son derece sığ, labirentimsi kanallar, mangrov adacıkları ve geniş tuz düzlükleriyle (sebha) çevrilidir. \n\nBu kurak düzlük tablosu ülkenin doğusunda köklü bir kırılmaya uğrar. Ras Al Khaimah'tan Fujayra'ya uzanan Hacer Dağları kütlesi, çıplak ofiyolit ve kireçtaşı kayalıklarıyla yükselir; silsilenin en yüksek zirvelerinden olan 1.934 metrelik Cebel Jais bu dağlık kuşakta yer alır. Dağların doğu eteğinde Umman Körfezi'ne bakan dar Batına kıyı şeridi uzanır.",
    after:
      "Ülke topoğrafyasının yüzde sekseninden fazlası düz veya dalgalı kum çölleriyle kaplıdır. Güneyde ve batıda çöl manzarası, dünyanın en büyük kum çölü olan Rubalhali'nin uzantısıyla birleşir; Liva Vahası çevresinde yükselen dev barkanlar yüzlerce metrelik irtifalar kazanır. Basra Körfezi kıyısı ise son derece sığ, labirentimsi kanallar, mangrov adacıkları ve geniş tuz düzlükleriyle (sebha) çevrilidir. \n\nBu kurak düzlük tablosu ülkenin doğusunda köklü bir kırılmaya uğrar. Ras Al Khaimah'tan Fujayra'ya uzanan Hacer Dağları kütlesi, çıplak ofiyolit ve kireçtaşı kayalıklarıyla yükselir; silsilenin en yüksek zirvelerinden olan 1.934 metrelik Cebel Jais bu dağlık kuşakta yer alır. Dağların doğu eteğinde Umman Körfezi'ne bakan dar Batına kıyı şeridi uzanır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'AE',
    property: 'independenceNoteTr',
    column: 'independence_note_tr',
    before: "2 Aralık 1971'de İngiltere'den bağımsız oldu (7 emirliğin federasyonu).",
    after:
      "2 Aralık 1971'de İngiltere'den bağımsız oldu (6 emirlikle kuruldu; Ras el-Hayme 10 Şubat 1972'de katılarak federasyonu yediye tamamladı).",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'IE',
    property: 'introTr',
    column: 'intro_tr',
    before:
      "İrlanda Cumhuriyeti, İrlanda Adası'nın yaklaşık beşte dördünü kaplayan, batıda azgın Kuzey Atlantik dalgalarına, doğuda ise Britanya Adası ile arasındaki sığ İrlanda Denizi'ne bakan bir ada devletidir. Kuzeydoğuda Birleşik Krallık’a bağlı Kuzey İrlanda ile paylaştığı kara sınırı, ülkenin tek kara komşuluğunu oluşturur.\n\nBaşkent Dublin, doğu kıyısında Liffey Nehri’nin korunaklı Dublin Körfezi’ne ulaştığı düzlükte kurulmuştur. Açık okyanusa bakan engebeli batı kıyısı ile iç ticaret yollarına açık doğu kıyısı arasındaki coğrafi tezat, ülkenin yerleşim ve iktisat dengesini biçimlendirmiştir.",
    after:
      "İrlanda Cumhuriyeti, İrlanda Adası'nın yaklaşık altıda beşini kaplayan, batıda azgın Kuzey Atlantik dalgalarına, doğuda ise Britanya Adası ile arasındaki sığ İrlanda Denizi'ne bakan bir ada devletidir. Kuzeydoğuda Birleşik Krallık’a bağlı Kuzey İrlanda ile paylaştığı kara sınırı, ülkenin tek kara komşuluğunu oluşturur.\n\nBaşkent Dublin, doğu kıyısında Liffey Nehri’nin korunaklı Dublin Körfezi’ne ulaştığı düzlükte kurulmuştur. Açık okyanusa bakan engebeli batı kıyısı ile iç ticaret yollarına açık doğu kıyısı arasındaki coğrafi tezat, ülkenin yerleşim ve iktisat dengesini biçimlendirmiştir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'NO',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    before:
      "Norveç, 58 ile 71 derece kuzey enlemleri arasında yer almasına karşın, Atlas Okyanusu'ndan kıyı boyunca kuzeye ilerleyen ılık Norveç Akıntısı (Golfstrim uzantısı) sayesinde olağanüstü enlemine göre olağanüstü ılık bir iklime sahiptir. Bu akıntı sayesinde Kutup Dairesi ötesindeki Narvik ve Tromsø gibi limanlar kışın bile buz tutmaz.\n\nAtlantik fırtınalarına dik duran batı yamaçları, yıllık 2.500-3.000 milimetreyi aşan şiddetli yamaç yağışı (orografik yağış) alır. Buna karşılık dağ sırasının doğusundaki vadiler yağmur gölgesinde kalarak çok daha kurak ve sert karasal kış koşulları yaşar. En kuzeydeki Finnmark bölgesinde kışın aylarca süren kutup gecesi, yazın ise batmayan gece güneşi gözlenir.",
    after:
      "Norveç, 58 ile 71 derece kuzey enlemleri arasında yer almasına karşın, Atlas Okyanusu'ndan kıyı boyunca kuzeye ilerleyen ılık Norveç Akıntısı (Golfstrim uzantısı) sayesinde enlemine göre olağanüstü ılık bir iklime sahiptir. Bu akıntı sayesinde Kutup Dairesi ötesindeki Narvik ve Tromsø gibi limanlar kışın bile buz tutmaz.\n\nAtlantik fırtınalarına dik duran batı yamaçları, yıllık 2.500-3.000 milimetreyi aşan şiddetli yamaç yağışı (orografik yağış) alır. Buna karşılık dağ sırasının doğusundaki vadiler yağmur gölgesinde kalarak çok daha kurak ve sert karasal kış koşulları yaşar. En kuzeydeki Finnmark bölgesinde kışın aylarca süren kutup gecesi, yazın ise batmayan gece güneşi gözlenir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GB',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    before:
      'Galler’deki Cambrian Dağları’ndan doğup Bristol Körfezi’nin derin halicine dökülen 354 kilometrelik Severn Nehri, Birleşik Krallık’ın en uzun akarsuyudur. Güney İngiltere’yi baştan başa kat eden 346 kilometrelik Thames Nehri ise Londra’dan geçerek Kuzey Denizi’ne geniş bir haliçle karışır; nehirler tarihsel sanayileşme sürecinde geniş bir kanal ağıyla birbirine bağlanmıştır.\n\nKuzey İrlanda’da yer alan 392 kilometrekarelik Neagh Gölü (Lough Neagh), Britanya Adaları’nın en büyük tatlı su gölüdür. İskoçya’daki tektonik Great Glen fayı boyunca sıralanan derin Loch Ness ve güneyindeki Loch Lomond ile İngiltere Göller Bölgesi’ndeki Windermere, buzul çağından kalma başlıca çanak gölleridir.',
    after:
      'Galler’deki Cambrian Dağları’ndan doğup Bristol Körfezi’nin derin halicine dökülen 354 kilometrelik Severn Nehri, Birleşik Krallık’ın en uzun akarsuyudur. Güney İngiltere’yi baştan başa kat eden 346 kilometrelik Thames Nehri ise Londra’dan geçerek Kuzey Denizi’ne geniş bir haliçle karışır; nehirler tarihsel sanayileşme sürecinde geniş bir kanal ağıyla birbirine bağlanmıştır.\n\nKuzey İrlanda’da yer alan 392 kilometrekarelik Neagh Gölü (Lough Neagh), Britanya Adaları’nın en büyük tatlı su gölüdür. İskoçya’daki tektonik Great Glen fayı boyunca sıralanan derin Loch Ness ile güneybatıdaki Highland Sınır Fayı üzerinde yer alan Loch Lomond ve İngiltere Göller Bölgesi’ndeki Windermere, buzul çağından kalma başlıca çanak gölleridir.',
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'RS',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    before:
      "Sırbistan, Avrupa'nın en yoğun nehir ağlarından birine sahiptir ve topraklarının neredeyse tamamı Tuna üzerinden Karadeniz havzasına boşalır. 588 kilometre boyunca ülkeyi kat eden Tuna Nehri, Romanya sınırında Karpatlar'ı yararak oluşturduğu ünlü Demir Kapı (Djerdap) Boğazı ile kıtanın en görkemli nehir kanyonlarından birini yaratır.\n\nBatıdan gelen Sava, kuzeyden gelen Tisa ve güneyden gelen Drina nehirleri Tuna'ya bağlanan ana su kollarıdır; bunlar arasında yalnızca Morava Nehri bütünüyle Sırbistan toprakları içinde doğup akar ve ülkenin ana iç omurgasını oluşturur.",
    after:
      "Sırbistan, Avrupa'nın en yoğun nehir ağlarından birine sahiptir ve topraklarının neredeyse tamamı Tuna üzerinden Karadeniz havzasına boşalır. 588 kilometre boyunca ülkeyi kat eden Tuna Nehri, Romanya sınırında Karpatlar'ı yararak oluşturduğu ünlü Demir Kapı (Djerdap) Boğazı ile kıtanın en görkemli nehir kanyonlarından birini yaratır.\n\nBatıdan gelen Sava, kuzeyden gelen Tisa ve güneyden gelen Drina nehirleri Tuna havzasının ana su kollarıdır; bunlar arasında yalnızca Morava Nehri bütünüyle Sırbistan toprakları içinde doğup akar ve ülkenin ana iç omurgasını oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SM',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    before:
      "Yüzölçümünün küçüklüğü ve kireçtaşı zemin nedeniyle ülkede doğal göl veya büyük bir nehir bulunmaz; suları Titano yamaçlarından doğan dereler taşır.\n\nAusa Deresi kuzeye yönelerek Adriyatik'e dökülürken, San Marino Deresi batı sınırını takip edip Marecchia Nehri'ne karışır; doğudaki Marano Deresi ise doğrudan denize akar. Ülkenin tatlı su ihtiyacı İtalya ile yapılan ortak altyapı protokolleri ve yerel kuyularla güvence altına alınır.",
    after:
      "Yüzölçümünün küçüklüğü ve kireçtaşı zemin nedeniyle ülkede doğal göl veya büyük bir nehir bulunmaz; suları Titano yamaçlarından doğan dereler taşır.\n\nAusa Deresi kuzeye yönelip bir kanalla Marecchia Nehri'ne karışarak dolaylı yoldan Adriyatik'e ulaşırken, San Marino Deresi batı sınırını takip edip Marecchia Nehri'ne karışır; doğudaki Marano Deresi ise doğrudan denize akar. Ülkenin tatlı su ihtiyacı İtalya ile yapılan ortak altyapı protokolleri ve yerel kuyularla güvence altına alınır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BY',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    before:
      "Belarus’un yer şekillerinin ana hatları, Pleistosen döneminde kuzeyden ilerleyen devasa İskandinav buzullarının aşındırma ve biriktirme süreçleriyle şekillenmiştir. Buzulların erirken geride bıraktığı moren yığınları, ülkeyi güneybatıdan kuzeydoğuya çapraz kesen Belarus Sırtı'nı meydana getirir; Minsk'in batısında yükselen 345 metrelik Dzyarzhynskaya Hara, ülkenin en yüksek noktasını oluşturmasına karşın çevresinden yalnızca tatlı bir eğimle ayrılır.\n\nÜlkenin güney yarısında, Pripyat Nehri havzasında uzanan Polesya bölgesi ise Avrupa'nın en geniş ve bakir bataklık havzasıdır. Düşük eğim nedeniyle suları tahliye edemeyen bu devasa çöküntü alanı; menderesli kollar, ölü nehir yatakları, turbalıklar ve taşkın ormanlarıyla örülü uçsuz bucaksız bir sulak labirent görünümündedir. Batı sınırındaki Białowieża (Belovejskaya Puşça) ise Avrupa ovalarının son kadim ova ormanını ve bizon popülasyonunu barındırır.",
    after:
      "Belarus'un yer şekillerinin ana hatları, Pleistosen döneminde kuzeyden ilerleyen devasa İskandinav buzullarının aşındırma ve biriktirme süreçleriyle şekillenmiştir. Buzulların erirken geride bıraktığı moren yığınları, ülkeyi güneybatıdan kuzeydoğuya çapraz kesen Belarus Sırtı'nı meydana getirir; Minsk'in batısında yükselen 345 metrelik Dzyarzhynskaya Hara, ülkenin en yüksek noktasını oluşturmasına karşın çevresinden yalnızca tatlı bir eğimle ayrılır.\n\nÜlkenin güney yarısında, Pripyat Nehri havzasında uzanan Polesya bölgesi ise Avrupa'nın en geniş ve bakir bataklık havzasıdır. Düşük eğim nedeniyle suları tahliye edemeyen bu devasa çöküntü alanı; menderesli kollar, ölü nehir yatakları, turbalıklar ve taşkın ormanlarıyla örülü uçsuz bucaksız bir sulak labirent görünümündedir. Batı sınırındaki Białowieża (Belovejskaya Puşça) ise Avrupa ovalarının son kadim ova ormanını ve bizon popülasyonunu barındırır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'NZ',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    before:
      "Güney Adası'nın omurgasını, aktif Alp Fayı boyunca diklemesine yükselen 600 kilometrelik Güney Alpleri oluşturur. Kalıcı buzullarıyla bu silsilenin zirvesi 3.724 metrelik Aoraki (Cook Dağı)'dır. Adanın güneybatısındaki Fiordland bölgesinde, buzul aşındırmasıyla derinlemesine oyulmuş vadilerin deniz suyuyla dolmasıyla oluşan 14 sarp fiyort sıralanır; 1.500-2.000 metrelik dik yalıyarlar doğrudan derin sulara dalar.\n\nKuzey Adası ise volkanik yay sistemlerinin şekillendirdiği bambaşka bir yer şekline sahiptir. Taupo Volkanik Bölgesi'nde yükselen 2.797 metrelik aktif stratovolkan Ruapehu Dağı adanın en yüksek noktasıdır; çevresindeki Tongariro ve Ngauruhoe ile birlikte zengin krater gölleri ve jeotermal alanlar barındırır.",
    after:
      "Güney Adası'nın omurgasını, aktif Alp Fayı boyunca diklemesine yükselen 500 kilometrelik Güney Alpleri oluşturur. Kalıcı buzullarıyla bu silsilenin zirvesi 3.724 metrelik Aoraki (Cook Dağı)'dır. Adanın güneybatısındaki Fiordland bölgesinde, buzul aşındırmasıyla derinlemesine oyulmuş vadilerin deniz suyuyla dolmasıyla oluşan 14 sarp fiyort sıralanır; 1.500-2.000 metrelik dik yalıyarlar doğrudan derin sulara dalar.\n\nKuzey Adası ise volkanik yay sistemlerinin şekillendirdiği bambaşka bir yer şekline sahiptir. Taupo Volkanik Bölgesi'nde yükselen 2.797 metrelik aktif stratovolkan Ruapehu Dağı adanın en yüksek noktasıdır; çevresindeki Tongariro ve Ngauruhoe ile birlikte zengin krater gölleri ve jeotermal alanlar barındırır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'FJ',
    property: 'introTr',
    column: 'intro_tr',
    before:
      "Güney Pasifik'in kalbinde Melanezya takımada kuşağında yer alan Fiji; 330'u aşkın ada ve 500'den fazla adacıktan meydana gelen bir okyanus ülkesidir. Nüfusun ve ekonomik hayatın yaklaşık dörtte üçü, başkent Suva'nın da bulunduğu en büyük ada Viti Levu ile kuzeydoğudaki Vanua Levu'da toplanır.\n\nAdaların tamamı volkanik kökenli dağlık iç kesimler ile bunları çevreleyen geniş mercan resifleri ve turkuaz lagünlerden oluşur.",
    after:
      "Güney Pasifik'in kalbinde Melanezya takımada kuşağında yer alan Fiji; 330'u aşkın ada ve 500'den fazla adacıktan meydana gelen bir okyanus ülkesidir. Nüfusun ve ekonomik hayatın yaklaşık yüzde 87'si, başkent Suva'nın da bulunduğu en büyük ada Viti Levu ile kuzeydoğudaki Vanua Levu'da toplanır.\n\nAdaların tamamı volkanik kökenli dağlık iç kesimler ile bunları çevreleyen geniş mercan resifleri ve turkuaz lagünlerden oluşur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'FM',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    before:
      "Dört eyalet birbirinden çok farklı jeolojik karakterler sergiler: Doğudaki Pohnpei ve Kosrae, sarp bazaltik zirveleri 700 metreyi aşan, yoğun yağmur ormanlarıyla örtülü yüksek volkanik kütlelerdir. Chuuk Eyaleti, 50-80 kilometre genişliğindeki devasa Chuuk Lagünü'nü çevreleyen mercan resifleri ile lagün içinde 443 metreye kadar yükselen volkanik ada tepelerinin eşsiz bir karışımıdır.\n\nEn batıdaki Yap'ın ana adaları ise kıtasal kabuk kökenli metamorfik kayaçlarıyla ayrışırken, eyaletin dış kesimleri çok sayıda alçak mercan atolünden oluşur.",
    after:
      "Dört eyalet birbirinden çok farklı jeolojik karakterler sergiler: Doğudaki Pohnpei ve Kosrae, sarp bazaltik zirveleri 600 metreyi aşan, yoğun yağmur ormanlarıyla örtülü yüksek volkanik kütlelerdir. Chuuk Eyaleti, 50-80 kilometre genişliğindeki devasa Chuuk Lagünü'nü çevreleyen mercan resifleri ile lagün içinde 443 metreye kadar yükselen volkanik ada tepelerinin eşsiz bir karışımıdır.\n\nEn batıdaki Yap'ın ana adaları ise kıtasal kabuk kökenli metamorfik kayaçlarıyla ayrışırken, eyaletin dış kesimleri çok sayıda alçak mercan atolünden oluşur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GM',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    before:
      "Ülke bütünüyle alüvyon tabanlı alçak bir nehir vadisi ve onu çevreleyen kumtaşı taraçalarından oluşur; arazide hiçbir belirgin dağ veya yükselti bulunmaz. Doğu sınırına yakın en yüksek noktasının deniz seviyesinden yalnızca 53 metre yüksekte olması, Gambiya'yı Afrika kıtasında ulusal doruk noktası en alçak ülke yapar. \n\nNehrin aşağı kesiminde tuzlu suyun sokulduğu geniş mangrov bataklıkları yer alırken, tatlı su taşıdığı orta kesimlerdeki taşkın düzlükleri (banto faros) geleneksel pirinç tarımının, nehir boyundaki kumlu taraçalar ise yer fıstığı ekiminin merkezidir.",
    after:
      "Ülke bütünüyle alüvyon tabanlı alçak bir nehir vadisi ve onu çevreleyen kumtaşı taraçalarından oluşur; arazide hiçbir belirgin dağ veya yükselti bulunmaz. Doğu sınırına yakın en yüksek noktasının deniz seviyesinden yalnızca 53 metre yüksekte olması, Gambiya'yı Afrika kıtasında ulusal doruk noktası en alçak olan ülke yapar. \n\nNehrin aşağı kesiminde tuzlu suyun sokulduğu geniş mangrov bataklıkları yer alırken, tatlı su taşıdığı orta kesimlerdeki taşkın düzlükleri (banto faros) geleneksel pirinç tarımının, nehir boyundaki kumlu taraçalar ise yer fıstığı ekiminin merkezidir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GM',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    before:
      "Ülkenin varlık sebebi ve tek ana akarsuyu Gambiya Nehri'dir; Gine'deki Fouta Djallon yaylalarından doğan nehir, ülke toprakları içinde menderesler çizerek yaklaşık 480 kilometre boyunca akar ve okyanusa kavuşur. \n\nNehir yatağının eğimi son derece düşüktür; bu nedenle okyanus gelgitlerinin etkisi ve tuzlu su kıyıdan içeriye doğru 150 kilometreden fazla sokulur. Bu durum akarsuyun aşağı çığırında geniş bir haliç-mangrov ekosistemi yaratırken tarımsal sulama olanaklarını nehrin yukarı tatlı su kesimleriyle sınırlar.",
    after:
      "Ülkenin varlık sebebi ve tek ana akarsuyu Gambiya Nehri'dir; Gine'deki Fouta Djallon yaylalarından doğan nehir, ülke toprakları içinde menderesler çizerek yaklaşık 480 kilometre boyunca akar ve okyanusa kavuşur. \n\nNehir yatağının eğimi son derece düşüktür; bu nedenle okyanus gelgitlerinin etkisiyle tuzlu su kıyıdan içeriye doğru 150 kilometreden fazla sokulur. Bu durum akarsuyun aşağı çığırında geniş bir haliç-mangrov ekosistemi yaratırken tarımsal sulama olanaklarını nehrin yukarı tatlı su kesimleriyle sınırlar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GH',
    property: 'introTr',
    column: 'intro_tr',
    before:
      "Gine Körfezi kıyısında yer alan Gana, güneydeki yağmur ormanları ve lagünlü kıyılardan kuzeydeki kurak savan platolarına kadar uzanan zengin bir Batı Afrika coğrafyasıdır. \n\nÜlke yüzölçümünün neredeyse yarısını kaplayan devasa Volta Nehri Havzası ve havzanın kalbinde yer alan yapay Volta Baraj Gölü, Gana'nın su kaynaklarının ve ekonomisinin can damarını oluşturur.",
    after:
      "Gine Körfezi kıyısında yer alan Gana, güneydeki yağmur ormanları ve lagünlü kıyılardan kuzeydeki kurak savan platolarına kadar uzanan zengin bir Batı Afrika coğrafyasıdır. \n\nÜlke yüzölçümünün yaklaşık yüzde 70'ini kaplayan devasa Volta Nehri Havzası ve havzanın kalbinde yer alan yapay Volta Baraj Gölü, Gana'nın su kaynaklarının ve ekonomisinin can damarını oluşturur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'ML',
    property: 'climateNoteTr',
    column: 'climate_note_tr',
    before:
      "Mali'de güneyden kuzeye doğru gidildikçe kuraklık keskin biçimde artar. En güneydeki Sudan savanı kuşağı yılda 1.000 milimetreyi aşan yağış alırken, başkent Bamako'nun yer aldığı Sahel geçiş sahasında yağış 500-700 milimetreye iner; Timbuktu'nun kuzeyindeki Sahra kuşağında ise yağış neredeyse sıfırlanır. \n\nKasım ve mayıs ayları arasında kuzeydoğudan esen kuru ve toz yüklü Harmattan rüzgarı tüm ülkeyi etkisi altına alır; yağışlar ise haziran-eylül arasında Atlas Okyanusu musonunun kuzeye sokulmasıyla kısa süreli fırtınalar şeklinde gerçekleşir.",
    after:
      "Mali'de güneyden kuzeye doğru gidildikçe kuraklık keskin biçimde artar. En güneydeki Sudan savanı kuşağı yılda 1.000 milimetreyi aşan yağış alırken, başkent Bamako'nun da içinde bulunduğu bu kuşakta yağış yıllık 900-1.000 milimetre civarında kalırken, daha kuzeydeki Sahel geçiş sahasında yağış 500-700 milimetreye iner; Timbuktu'nun kuzeyindeki Sahra kuşağında ise yağış neredeyse sıfırlanır. \n\nKasım ve mayıs ayları arasında kuzeydoğudan esen kuru ve toz yüklü Harmattan rüzgarı tüm ülkeyi etkisi altına alır; yağışlar ise haziran-eylül arasında Atlas Okyanusu musonunun kuzeye sokulmasıyla kısa süreli fırtınalar şeklinde gerçekleşir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SZ',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    before:
      "Esvatini, batıdaki yüksek dağlardan doğarak ülkeyi enlemesine kat eden ve Lubombo sarpını derin kanyonlarla yararak Mozambik'e geçen güçlü nehirlerle beslenir. Komati, Mbuluzi, Büyük Usutu (Lusutfu) ve Ngwavuma nehirleri Güney Afrika yaylalarından doğar. Bu sınır aşan akarsu havzaları, Komati üzerindeki Maguga Barajı örneğinde olduğu gibi ortak su yönetimi anlaşmalarıyla işletilerek kurak Lowveld tarımına can suyu sağlar.",
    after:
      "Esvatini, batıdaki yüksek dağlardan doğarak ülkeyi enlemesine kat eden ve Lubombo sarpını derin kanyonlarla yararak Mozambik'e geçen güçlü nehirlerle beslenir. Komati ve Büyük Usutu (Lusutfu) nehirleri Güney Afrika yaylalarından doğarken, Mbuluzi ve Ngwavuma nehirleri ülkenin kendi batı yaylalarından kaynağını alır. Bu sınır aşan akarsu havzaları, Komati üzerindeki Maguga Barajı örneğinde olduğu gibi ortak su yönetimi anlaşmalarıyla işletilerek kurak Lowveld tarımına can suyu sağlar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'MU',
    property: 'introTr',
    column: 'intro_tr',
    before:
      "Mauritius, Hint Okyanusu'nun güneybatısında, Réunion sıcak noktasının okyanus kabuğunu delmesiyle yaklaşık 8 milyon yıl önce şekillenmiş volkanik bir ada devletidir. Ana adanın yanı sıra doğuda çok daha eski ve aşınmış Rodrigues Adası ile kuzeydeki Saint Brandon ve Agalega mercan adacıklarını kapsar. Ana ada, sönmüş bir kalkan yanardağ kalıntısı olan 300-600 metre rakımlı merkezi platoyu kuşatan dik bazaltik zirveler ve çevresindeki sakin lagünlerle özgün bir ada görünümü sunar.",
    after:
      "Mauritius, Hint Okyanusu'nun güneybatısında, Réunion sıcak noktasının okyanus kabuğunu delmesiyle yaklaşık 8 milyon yıl önce şekillenmiş volkanik bir ada devletidir. Ana adanın yanı sıra doğuda jeolojik olarak çok daha genç Rodrigues Adası ile kuzeydeki Saint Brandon ve Agalega mercan adacıklarını kapsar. Ana ada, sönmüş bir kalkan yanardağ kalıntısı olan 300-600 metre rakımlı merkezi platoyu kuşatan dik bazaltik zirveler ve çevresindeki sakin lagünlerle özgün bir ada görünümü sunar.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'CA',
    property: 'introTr',
    column: 'intro_tr',
    before:
      "Kanada, 8.788.700 kilometrekarelik yüzölçümüyle Rusya'dan sonra dünyanın en geniş ikinci ülkesidir. Toprakları doğuda Atlas, batıda Büyük ve kuzeyde Arktik Okyanusu ile kuşatılmıştır. \n\nBu engin coğrafyaya karşın nüfus son derece dengesiz dağılmıştır. Sert kış şartları ve donmuş topraklar nedeniyle nüfusun ezici çoğunluğu, Amerika Birleşik Devletleri sınırına paralel uzanan birkaç yüz kilometrelik dar güney şeridinde yaşar; kuzeye uzanan milyonlarca kilometrekarelik arazi ise seyrek yerleşimli bir tayga ve tundra kuşağından ibarettir.",
    after:
      "Kanada, 9.984.670 kilometrekarelik yüzölçümüyle Rusya'dan sonra dünyanın en geniş ikinci ülkesidir. Toprakları doğuda Atlas, batıda Büyük ve kuzeyde Arktik Okyanusu ile kuşatılmıştır. \n\nBu engin coğrafyaya karşın nüfus son derece dengesiz dağılmıştır. Sert kış şartları ve donmuş topraklar nedeniyle nüfusun ezici çoğunluğu, Amerika Birleşik Devletleri sınırına paralel uzanan birkaç yüz kilometrelik dar güney şeridinde yaşar; kuzeye uzanan milyonlarca kilometrekarelik arazi ise seyrek yerleşimli bir tayga ve tundra kuşağından ibarettir.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'BZ',
    property: 'introTr',
    column: 'intro_tr',
    before:
      "Belize, Orta Amerika'nın Karayip kıyısında, Yucatán Yarımadası'nın güney kökünde yer alan kompakt bir kıyı ülkesidir. Bölgede resmi dili İngilizce olan tek devlettir; bu kültürel kimlik, 1981 yılına kadar Britanya Hondurası adıyla Birleşik Krallık idaresinde kalmış olmasından kaynaklanır. \n\nÜlke arazisinin büyük bölümü yoğun tropikal yağmur ormanlarıyla kaplıdır. Nüfus yoğunluğu bölge ortalamasının oldukça altındadır ve yerleşimler ağırlıklı olarak Karayip kıyı şeridi ile nehir vadilerinde toplanmıştır.",
    after:
      "Belize, Orta Amerika'nın Karayip kıyısında, Yucatán Yarımadası'nın güney kökünde yer alan kompakt bir kıyı ülkesidir. Bölgede resmi dili İngilizce olan tek devlettir; bu kültürel kimlik, 1973'e kadar Britanya Hondurası adını taşıyıp 1981'e kadar Birleşik Krallık idaresinde kalmış olmasından kaynaklanır. \n\nÜlke arazisinin büyük bölümü yoğun tropikal yağmur ormanlarıyla kaplıdır. Nüfus yoğunluğu bölge ortalamasının oldukça altındadır ve yerleşimler ağırlıklı olarak Karayip kıyı şeridi ile nehir vadilerinde toplanmıştır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'ZW',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    before:
      "Ülkenin su rejimini kuzey ve güney sınırlarını çizen iki büyük akarsu yönetir. Kuzeyde Zambezi Nehri, Zambiya ile paylaşılan Victoria Şelalesi'nin ardından Kariba Boğazı'nda toplanarak dünyanın depolama hacmi bakımından en büyük baraj göllerinden biri olan Kariba Gölü'nü oluşturur. Güney sınırında ise kurak arazilerden kıvrılarak Mozambik'e doğru akan Limpopo Nehri uzanır.\n\nMerkezi Highveld sırtı bir su bölümü çizgisi işlevi görerek iç nehirleri iki ana yöne dağıtır: Manyame ve Mazowe kuzeye Zambezi'ye akarken, Save ve Runde nehirleri güneydoğuya Hint Okyanusu'na yönelir. Akarsuların çoğu kış aylarında kuruma noktasına geldiği için ülke tarımı ve kentleri, göl Mutirikwi (Kyle) ve Kariba gibi yapay su depolama rezervuarlarıyla ayakta tutulur.",
    after:
      "Ülkenin su rejimini kuzey ve güney sınırlarını çizen iki büyük akarsu yönetir. Kuzeyde Zambezi Nehri, Zambiya ile paylaşılan Victoria Şelalesi'nin ardından Kariba Boğazı'nda toplanarak dünyanın depolama hacmi bakımından en büyük baraj göllerinden biri olan Kariba Gölü'nü oluşturur. Güney sınırında ise kurak arazilerden kıvrılarak Mozambik'e doğru akan Limpopo Nehri uzanır.\n\nMerkezi Highveld sırtı bir su bölümü çizgisi işlevi görerek iç nehirleri iki ana yöne dağıtır: Manyame ve Mazowe kuzeye Zambezi'ye akarken, Save ve Runde nehirleri güneydoğuya Hint Okyanusu'na yönelir. Akarsuların çoğu kış aylarında kuruma noktasına geldiği için ülke tarımı ve kentleri, Mutirikwi (Kyle) ve Kariba gibi yapay su depolama rezervuarlarıyla ayakta tutulur.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'GT',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    before:
      "Ülke arazisi üç belirgin yer şekli kuşağına ayrılır. Güneyde Kokos levhasının dalma zonuna paralel uzanan Sierra Madre de Chiapas kuşağı, Orta Amerika'nın en yüksek noktası olan 4.220 metrelik Tajumulco Yanardağı dahil olmak üzere otuzdan fazla volkana ev sahipliği yapar. Bu kuşakta, 84 bin yıl önceki süper patlamanın oluşturduğu kalderada yer alan ve 340 metre derinliğiyle bölgenin en derin su kütlesi olan Atitlán Gölü yükselir. \n\nİç kesimde, Kuzey Amerika ve Karayip levhalarının sınırını çizen Motagua ve Polochic fay vadileri boyunca kristalen kireçtaşı kütlesi Cuchumatanes Sıradağları yükselir. \n\nKuzey kesimi ise Meksika'nın Yucatán Yarımadası ile bütünleşen Petén kireçtaşı platosudur; ortalama 200 metreyi aşmayan bu dalgalı karstik ova, yoğun yağmur ormanlarıyla kaplıdır ve yüzey akışından büyük ölçüde yoksundur.",
    after:
      "Ülke arazisi üç belirgin yer şekli kuşağına ayrılır. Güneyde Kokos levhasının dalma zonuna paralel uzanan Sierra Madre de Chiapas kuşağı, Orta Amerika'nın en yüksek noktası olan 4.220 metrelik Tajumulco Yanardağı dahil olmak üzere otuzdan fazla volkana ev sahipliği yapar. Bu kuşakta, 84 bin yıl önceki süper patlamanın oluşturduğu kalderada yer alan ve 340 metre derinliğiyle bölgenin en derin su kütlesi olan Atitlán Gölü yer alır. \n\nİç kesimde, Kuzey Amerika ve Karayip levhalarının sınırını çizen Motagua ve Polochic fay vadileri boyunca kristalen kireçtaşı kütlesi Cuchumatanes Sıradağları yükselir. \n\nKuzey kesimi ise Meksika'nın Yucatán Yarımadası ile bütünleşen Petén kireçtaşı platosudur; ortalama 200 metreyi aşmayan bu dalgalı karstik ova, yoğun yağmur ormanlarıyla kaplıdır ve yüzey akışından büyük ölçüde yoksundur.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '13',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    before:
      "Nemrut volkanik kütlesinin zirve kalderasında, dünyanın ikinci büyük kaldera gölü olan tatlı sulu Nemrut Gölü ile sıcak su kaynakları içeren Ilıgöl yer alır; volkanın kuzeyinde ise lav setti gölü Nazik Gölü uzanır. İl toprakları, suları iki ayrı yöne ayıran bir su bölümü hattıdır: kuzeydeki akarsular sodalı Van Gölü Kapalı Havzası'na yönelirken, merkezden güneye süzülen Bitlis Çayı Dicle Nehri aracılığıyla Basra Körfezi'ne dökülür.",
    after:
      "Nemrut volkanik kütlesinin zirve kalderasında, Türkiye'nin en büyük kaldera gölü olan tatlı sulu Nemrut Gölü ile sıcak su kaynakları içeren Ilıgöl yer alır; volkanın kuzeyinde ise lav setti gölü Nazik Gölü uzanır. İl toprakları, suları iki ayrı yöne ayıran bir su bölümü hattıdır: kuzeydeki akarsular sodalı Van Gölü Kapalı Havzası'na yönelirken, merkezden güneye süzülen Bitlis Çayı Dicle Nehri aracılığıyla Basra Körfezi'ne dökülür.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '16',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    before:
      "İznik Gölü, 298 kilometrekarelik yüzölçümüyle Türkiye'nin doğal gölleri arasında beşinci, Marmara Bölgesi'nde ise en büyüğüdür; tektonik kökenli bir çöküntü gölü olup en derin noktası 65 metreye ulaşır. Antik adı Ascania Limne olan göl, Homeros'un İlyada'sında da anılır. İlin batısındaki Uluabat Gölü ise sığdır — derinliği 2-4 metreyi geçmez — ve nilüfer yataklarıyla kaplı, tümüyle koruma altındaki bir sulak alandır.\n\nNilüfer Çayı, Uludağ'daki Aras Şelalesi'nden doğar, Bursa Ovası'nı geçerek Susurluk Çayı'na katılır ve Karacabey üzerinden Marmara Denizi'ne ulaşır; adını Orhan Gazi'nin eşi Nilüfer Hatun'dan alır. İçme suyu ihtiyacının büyük bölümü, birlikte ilin su ihtiyacının yaklaşık %85'ini karşılayan Doğancı ve Nilüfer barajlarından sağlanır.",
    after:
      "İznik Gölü, 298 kilometrekarelik yüzölçümüyle Türkiye'nin doğal gölleri arasında beşinci, Marmara Bölgesi'nde ise en büyüğüdür; tektonik kökenli bir çöküntü gölü olup en derin noktası 65 metreye ulaşır. Antik adı Ascania Limne olan göl, Homeros'un İlyada'sında da anılır. İlin batısındaki Uluabat Gölü ise sığdır — derinliği 2-4 metreyi geçmez — ve nilüfer yataklarıyla kaplı, tümüyle koruma altındaki bir sulak alandır.\n\nNilüfer Çayı, Uludağ'ın güney yamaçlarında Aras Suyu adıyla doğar, Bursa Ovası'nı geçerek Susurluk Çayı'na katılır ve Karacabey üzerinden Marmara Denizi'ne ulaşır; adını Orhan Gazi'nin eşi Nilüfer Hatun'dan alır. İçme suyu ihtiyacının büyük bölümü, birlikte ilin su ihtiyacının yaklaşık %85'ini karşılayan Doğancı ve Nilüfer barajlarından sağlanır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '17',
    property: 'introTr',
    column: 'intro_tr',
    before:
      "Çanakkale, Ege Denizi'ni Marmara Denizi'ne bağlayan Çanakkale Boğazı'nın iki yakasına kuruludur; il toprakları Avrupa'daki Gelibolu Yarımadası ile Anadolu'daki Biga Yarımadası'ndan oluşur. İlin güneyinde, kent merkezinin yaklaşık 30 kilometre içerisinde, 1998'de UNESCO Dünya Mirası Listesi'ne alınan Truva Ören Yeri bulunur; kesintisiz 3.000 yılı aşkın bir süreye yayılan 10 yerleşim katmanı taşır. Boğazın Avrupa yakasındaki Gelibolu Yarımadası'nın büyük bölümü, 1915 Çanakkale Savaşları'nın anı ve mezarlık alanlarına ayrılmıştır.",
    after:
      "Çanakkale, Ege Denizi'ni Marmara Denizi'ne bağlayan Çanakkale Boğazı'nın iki yakasına kuruludur; il toprakları Avrupa'daki Gelibolu Yarımadası ile Anadolu'daki Biga Yarımadası'ndan oluşur. İlin güneyinde, kent merkezinin yaklaşık 30 kilometre içerisinde, 1998'de UNESCO Dünya Mirası Listesi'ne alınan Truva Ören Yeri bulunur; kesintisiz 3.000 yılı aşkın bir süreye yayılan 9 yerleşim katmanı taşır. Boğazın Avrupa yakasındaki Gelibolu Yarımadası'nın büyük bölümü, 1915 Çanakkale Savaşları'nın anı ve mezarlık alanlarına ayrılmıştır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '36',
    property: 'introTr',
    column: 'intro_tr',
    before:
      "Kars, 1.750 metre rakımlı bazalt platosu üzerinde, Türkiye'nin Ermenistan sınırında yükselen köklü bir serhat ve kültür kentidir. UNESCO Dünya Mirası Listesi'ndeki Ani Arkeolojik Alanı, Baltık mimari tarzı tarihi taş yapıları, Sarıkamış sarıçam ormanları ve dünya çapında tescilli gravyer ve kaşar peynirleriyle Doğu Anadolu'nun en belirgin kültürel ve turistik merkezlerindendir.",
    after:
      "Kars, 1.750 metre rakımlı bazalt platosu üzerinde, Türkiye'nin Ermenistan sınırında yükselen köklü bir serhat ve kültür kentidir. UNESCO Dünya Mirası Listesi'ndeki Ani Arkeolojik Alanı, Baltık mimari tarzı tarihi taş yapıları, Sarıkamış sarıçam ormanları ve coğrafi işaret tescilli gravyer ve kaşar peynirleriyle Doğu Anadolu'nun en belirgin kültürel ve turistik merkezlerindendir.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '48',
    property: 'hydrographyNoteTr',
    column: 'hydrography_note_tr',
    before:
      "İl topraklarının kalkerli, karstik yapısı yüzeydeki akarsu ağının gelişimini sınırlar; Muğla İl Çevre Durum Raporu'na göre ilin başlıca üç akarsuyu Çine Çayı, Eşen Çayı ve Dalaman Çayı'dır. Boncuk Dağları'nın kuzey yamaçlarından doğan Dalaman Çayı, 190 kilometrelik toplam uzunluğunun 65 kilometresini Muğla sınırları içinde kat eder; Akdağlar'dan beslenen Eşen Çayı ise 128 kilometrelik uzunluğunun 80 kilometresini il topraklarında geçirir ve Saklıkent Kanyonu'ndaki karstik kaynaklarla beslenir.\n\nDalaman Çayı üzerindeki Akköprü Barajı, 1995-2012 arasında inşa edilmiş, 384,5 milyon m³ baraj gölü hacmiyle, elektrik üretim kapasitesi bakımından Türkiye'nin altıncı büyük barajıdır; sulama, enerji üretimi ve taşkın koruması amacıyla işletilir. Milas ilçesindeki Geyik Barajı ise Yeniköy Termik Santrali'ne soğutma suyu sağlamanın yanında Bodrum Yarımadası'nın içme suyu ihtiyacının bir bölümünü karşılar.\n\nİlin en büyük doğal gölü olan Köyceğiz Gölü, dar bir kanalla Akdeniz'e bağlı bir haliç gölüdür; 1988'de özel çevre koruma bölgesi ilan edilmiştir. Gölü denize bağlayan Dalyan Kanalı kıyısındaki İztuzu Kumsalı, deniz kaplumbağalarının (Caretta caretta) önemli yumurtlama alanlarından biridir.",
    after:
      "İl topraklarının kalkerli, karstik yapısı yüzeydeki akarsu ağının gelişimini sınırlar; Muğla İl Çevre Durum Raporu'na göre ilin başlıca üç akarsuyu Çine Çayı, Eşen Çayı ve Dalaman Çayı'dır. Boncuk Dağları'nın kuzey yamaçlarından doğan Dalaman Çayı, 190 kilometrelik toplam uzunluğunun 65 kilometresini Muğla sınırları içinde kat eder; Akdağlar'dan beslenen Eşen Çayı ise 128 kilometrelik uzunluğunun 80 kilometresini il topraklarında geçirir ve Saklıkent Kanyonu'ndaki karstik kaynaklarla beslenir.\n\nDalaman Çayı üzerindeki Akköprü Barajı, 1995-2012 arasında inşa edilmiş, 384,5 milyon m³ baraj gölü hacmi ve 115 megavatlık kurulu gücüyle bölgenin başlıca hidroelektrik barajlarından biridir; sulama, enerji üretimi ve taşkın koruması amacıyla işletilir. Milas ilçesindeki Geyik Barajı ise Yeniköy Termik Santrali'ne soğutma suyu sağlamanın yanında Bodrum Yarımadası'nın içme suyu ihtiyacının bir bölümünü karşılar.\n\nİlin en büyük doğal gölü olan Köyceğiz Gölü, dar bir kanalla Akdeniz'e bağlı bir haliç gölüdür; 1988'de özel çevre koruma bölgesi ilan edilmiştir. Gölü denize bağlayan Dalyan Kanalı kıyısındaki İztuzu Kumsalı, deniz kaplumbağalarının (Caretta caretta) önemli yumurtlama alanlarından biridir.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '68',
    property: 'introTr',
    column: 'intro_tr',
    before:
      "Aksaray, Kapadokya'nın en uzun kanyonlarından biri olan Ihlara Vadisi'ne ev sahipliği yapar. İlin kuzeydoğu ucu, Türkiye'nin ikinci büyük gölü Tuz Gölü'nün güneybatı kıyısına kadar uzanır.",
    after:
      "Aksaray, Kapadokya'nın en uzun kanyonlarından biri olan Ihlara Vadisi'ne ev sahipliği yapar. İlin kuzeybatı ucu, Türkiye'nin ikinci büyük gölü Tuz Gölü'nün güneybatı kıyısına kadar uzanır.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '77',
    property: 'introTr',
    column: 'intro_tr',
    before:
      "Yalova, 798 kilometrekarelik yüzölçümüyle Türkiye'nin en küçük ilidir. İl, 5 Haziran 1995'te yürürlüğe giren bir kanun hükmünde kararnameyle 77. il olarak kuruldu; o tarihe kadar 1930'dan beri İstanbul'un bir ilçesiydi. Kuruluşla birlikte Armutlu ilçesi Bursa'dan, Altınova ise Kocaeli'nden Yalova'ya bağlandı.",
    after:
      "Yalova, 798 kilometrekarelik yüzölçümüyle Türkiye'nin en küçük ilidir. İl, 6 Haziran 1995'te yürürlüğe giren bir kanun hükmünde kararnameyle 77. il olarak kuruldu; o tarihe kadar 1930'dan beri İstanbul'un bir ilçesiydi. Kuruluşla birlikte Armutlu ilçesi Bursa'dan, Altınova ise Kocaeli'nden Yalova'ya bağlandı.",
  },
  {
    table: 'provinces',
    keyColumn: 'plate_code',
    key: '74',
    property: 'introTr',
    column: 'intro_tr',
    before:
      "Bartın, kimliğini büyük ölçüde aynı adı taşıyan çayın oluşturduğu vadiden alır. Yüzölçümü bakımından Türkiye'nin üçüncü en küçük ilidir; bu sıralamada yalnızca Yalova ve Kilis daha küçüktür. Amasra ilçesi, dik yamaçların Karadeniz'le buluştuğu yedi tepe ve beş yarımada üzerinde kurulu tarihî bir liman kentidir. Kurucaşile ise antik dönemden bu yana geleneksel ahşap tekne yapımıyla tanınır.",
    after:
      "Bartın, kimliğini büyük ölçüde aynı adı taşıyan çayın oluşturduğu vadiden alır. Yüzölçümü bakımından Türkiye'nin üçüncü en küçük ilidir; bu sıralamada yalnızca Yalova ve Kilis daha küçüktür. Amasra ilçesi, dik yamaçların Karadeniz'le buluştuğu denize uzanan bir burun ile bu burnun iki yanındaki koylar üzerinde kurulu tarihî bir liman kentidir. Kurucaşile ise antik dönemden bu yana geleneksel ahşap tekne yapımıyla tanınır.",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'ID',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    before:
      "Endonezya; Hint-Avustralya, Pasifik ve Avrasya levhalarının çarpışma sahasında, Pasifik Ateş Çemberi'nin en aktif kuşağında yer alır. Sumatra'daki Barisan Dağları'ndan başlayıp Cava, Bali ve Küçük Sunda adaları boyunca doğuya uzanan volkanik yay, 130'a yakın aktif stratovolkan barındırır; Cava'daki Merapi ve Semeru ile Sumatra'daki Sinabung bu hareketliliğin canlı örnekleridir. Düzenli aralıklarla püsküren volkanik küller, Cava ve Bali topraklarını Güneydoğu Asya'nın en verimli tarım havzalarına dönüştürmüştür.\n\nBuna karşılık Sunda sahanlığında oturan Kalimantan, genç volkanizmadan yoksun, aşınmış yaylalar ve devasa turba bataklıklarıyla kaplıdır. Ülkenin ve Okyanusya ada dünyasının en yüksek doruğu ise doğuda, Papua'daki Sudirman Sıradağları üzerinde 4.884 metreye ulaşan ve zirvesinde ekvatoral buzullar barındıran Puncak Jaya'dır (Carstensz Piramidi).",
    after:
      "Endonezya; Hint-Avustralya, Pasifik ve Avrasya levhalarının çarpışma sahasında, Pasifik Ateş Çemberi'nin en aktif kuşağında yer alır. Sumatra'daki Barisan Dağları'ndan başlayıp Cava, Bali ve Küçük Sunda adaları boyunca doğuya uzanan volkanik yay, 130'a yakın aktif stratovolkan barındırır; Cava'daki Merapi ve Semeru ile Sumatra'daki Sinabung bu hareketliliğin canlı örnekleridir. Düzenli aralıklarla püsküren volkanik küller, Cava ve Bali topraklarını Güneydoğu Asya'nın en verimli tarım havzalarına dönüştürmüştür.\n\nBuna karşılık Sunda sahanlığında oturan Kalimantan, genç volkanizmadan yoksun, aşınmış yaylalar ve devasa turba bataklıklarıyla kaplıdır. Ülkenin ve Okyanusya ada dünyasının en yüksek doruğu ise doğuda, Papua'daki Sudirman Sıradağları üzerinde 4.884 metreye ulaşan ve yamaçlarında hızla eriyen ekvatoral buzullar barındıran Puncak Jaya'dır (Carstensz Piramidi).",
  },
  {
    table: 'countries',
    keyColumn: 'iso_code',
    key: 'SB',
    property: 'landformNoteTr',
    column: 'landform_note_tr',
    before:
      "Büyük adaların iç kesimlerini sarp volkanik dağ silsileleri kaplar. Guadalcanal'ın güneyinde yükselen 2.335 metrelik Popomanaseu Dağı, ülkenin en yüksek doruğudur ve sisli bulut ormanlarıyla örtülüdür.\n\nTakımadanın güneyinde, deniz yüzeyinin yaklaşık 20 metre altında zirve yapan Kavachi, bölgenin en aktif denizaltı yanardağlarındandır; sık tekrarlanan püskürmeleri okyanus yüzeyinde zaman zaman kısa ömürlü lav adacıkları oluşturur.",
    after:
      "Büyük adaların iç kesimlerini sarp volkanik dağ silsileleri kaplar. Guadalcanal'ın güneyinde yükselen 2.335 metrelik Popomanaseu Dağı, ülkenin en yüksek doruğudur ve sisli bulut ormanlarıyla örtülüdür.\n\nVangunu Adası'nın güneyinde, deniz yüzeyinin yaklaşık 20 metre altında zirve yapan Kavachi, bölgenin en aktif denizaltı yanardağlarındandır; sık tekrarlanan püskürmeleri okyanus yüzeyinde zaman zaman kısa ömürlü lav adacıkları oluşturur.",
  },
];

async function apply(queryRunner: QueryRunner, from: 'before' | 'after', to: 'before' | 'after') {
  for (const change of SEED_FACT_CHANGES) {
    await queryRunner.query(
      `UPDATE "${change.table}" SET "${change.column}" = $1, "updated_at" = now() WHERE "${change.keyColumn}" = $2 AND "${change.column}" IS NOT DISTINCT FROM $3`,
      [change[to], change.key, change[from]],
    );
  }
}

export class FixSeedProseFacts1790553600000 implements MigrationInterface {
  name = 'FixSeedProseFacts1790553600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await apply(queryRunner, 'before', 'after');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await apply(queryRunner, 'after', 'before');
  }
}
