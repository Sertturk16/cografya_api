import { ApiProperty } from '@nestjs/swagger';
import { ElevationAttributionDto } from './elevation-attribution.dto';
import { ElevationPointDto } from './elevation-point.dto';

/**
 * One elevation profile: the line that was measured, the numbers along it, and the licence
 * surface that must travel with them.
 *
 * ## Two parallel arrays, not an array of objects
 * `distancesKm[i]` and `elevationsM[i]` describe the same point. An array of `{distanceKm,
 * elevationM}` objects carries the same information at roughly three times the bytes, which
 * breaks the ~3 kB response budget SPEC §7.4 designed the server leg around.
 *
 * ## The sample coordinates are NOT returned
 * They are reconstructible from `from`, `to` and the index — the samples are evenly spaced along
 * the great circle — so returning them would sell the client something it can already compute.
 *
 * ## No envelope
 * This is one resource, not a list. `ENGINEERING.md` §2's pagination envelope is for unbounded or
 * growing lists.
 */
export class ElevationProfileDto {
  @ApiProperty({
    type: ElevationPointDto,
    description:
      'Hattın başlangıcı — YUVARLANMIŞ hâliyle. İstemcinin gönderdiği ham koordinat değil, ' +
      'profilin gerçekten hesaplandığı nokta.',
  })
  from!: ElevationPointDto;

  @ApiProperty({ type: ElevationPointDto, description: 'Hattın bitişi, aynı yuvarlama ile.' })
  to!: ElevationPointDto;

  @ApiProperty({
    type: Number,
    example: 511.4,
    description: 'Yuvarlanmış hattın büyük daire uzunluğu (km).',
  })
  lengthKm!: number;

  @ApiProperty({
    type: 'integer',
    example: 200,
    description:
      'Hat boyunca örneklenen nokta sayısı. SUNUCU sabiti: istekte seçilemez, çünkü bir isteğin ' +
      'dokunabileceği ayrık karo sayısı bu sayıyı aşamaz — maliyet tavanı böylece bir ayar ' +
      'değil, aritmetik bir gerçektir. Yanıtta yayımlanır ki istemci varsaymak zorunda kalmasın.',
  })
  sampleCount!: number;

  @ApiProperty({
    type: 'integer',
    example: 12,
    description:
      'Örneklemenin yapıldığı karo yakınlaştırma düzeyi. Bir performans ayarı DEĞİL, lisans ' +
      'kaldıracıdır: daha düşük bir düzeyde karışıma deniz derinliği taşıyan bir kaynak girer ve ' +
      'atıf yükümlülüğü değişir. Kodda sabittir.',
  })
  sampleZoom!: number;

  @ApiProperty({
    type: Boolean,
    example: true,
    description:
      'Hiç değilse bir örnek çözülebildi mi. `false` ise iki dizi de boştur ve yanıt ' +
      '`Cache-Control: no-store` taşır — ISR/SSG bu hâli kaydetmemelidir.',
  })
  dataAvailable!: boolean;

  @ApiProperty({
    type: 'integer',
    example: 200,
    description:
      'Gerçekten çözülen örnek sayısı. `sampleCount`’tan KÜÇÜKSE profil kısmidir: yanıt bir ' +
      'hata değil, bir ısınma adımıdır — o istekte çekilen karolar sunucuda kaldığı için aynı ' +
      'hattın ikinci isteği daha çoğunu çözer. Soğuk önbellekte çok uzun hatlarda bu ' +
      'BEKLENEN hâldir, istisna değil; istemci yeniden deneme durumunu buna göre tasarlar. ' +
      'Kısmi yanıt da `no-store` taşır ve önbelleğe yazılmaz.',
  })
  resolvedSampleCount!: number;

  @ApiProperty({
    type: [Number],
    example: [0, 2.57, 5.14],
    description:
      'Hat başlangıcından itibaren mesafeler (km), artan. Uzunluğu `sampleCount` kadardır ve ' +
      '`elevationsM` ile aynı indekslenir.',
  })
  distancesKm!: number[];

  @ApiProperty({
    // Raw schema, NOT `type: [Number]` + `nullable: true`: on an `@ApiProperty` ARRAY, `nullable`
    // marks the array nullable and never its items — so the published contract promised
    // `number[] | null` (which this endpoint never returns) while forbidding the per-sample `null`
    // its own `example` carries and its own `resolvedSampleCount` documents as EXPECTED. Vera
    // codegens from this file, so the mistake lands as `NaN` on every partial profile. The house
    // form is `src/marine/dto/marine-series.dto.ts`'s, and the reason it exists is this one
    // (review #124, CODE124-I1).
    type: 'array',
    items: { type: 'number', nullable: true },
    example: [12, 34, null],
    description:
      'TAM SAYI metre rakımlar; çözülemeyen nokta `null`. Ondalık YAYIMLANMAZ: kaynak ızgaranın ' +
      'kendi hatası onlarca metre mertebesinde olduğu için ondalık göstermek olmayan bir ' +
      'hassasiyet iddia eder (SPEC §6.6).',
  })
  elevationsM!: (number | null)[];

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 12,
    description: 'Çözülen örneklerin en küçüğü (m). Hiç örnek çözülemediyse `null`.',
  })
  minElevationM!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 3061,
    description: 'Çözülen örneklerin en büyüğü (m). Hiç örnek çözülemediyse `null`.',
  })
  maxElevationM!: number | null;

  @ApiProperty({
    type: ElevationAttributionDto,
    description:
      'Lisans yüzeyi. HER yanıtta doludur — `dataAvailable: false` olan yanıtlarda da — çünkü ' +
      'bildirim yayımlanan bölüme iliştirilir, tek tek değerlerin sağlığına değil.',
  })
  attribution!: ElevationAttributionDto;
}
