import { ApiProperty } from '@nestjs/swagger';
import {
  PM25_READING_POINT_PROVINCE_CENTRE,
  PM25_SOURCE_ACAG_SATPM25,
  type Pm25Annual,
  type Pm25AnnualValue,
  type Pm25ReadingPoint,
  type Pm25Source,
} from '../province.types';
import { Pm25AttributionDto } from './pm25-attribution.dto';

/** One year of the published series. */
export class Pm25AnnualValueDto implements Pm25AnnualValue {
  @ApiProperty({ example: 2024, description: 'Veri yılı.' })
  year!: number;

  @ApiProperty({
    example: 22.74,
    description:
      'O yılın ortalama PM2.5 değeri (µg/m³) — ham sayı, biçimlenmiş dize değil. Biçimleme web ' +
      'deposunun işidir.',
  })
  valueUgM3!: number;
}

/**
 * Uzun dönem hava kirliliği (yıllık ortalama PM2.5) — il sayfasının İklim'den sonraki bölümünün
 * verisi.
 *
 * Mirrors the stored {@link Pm25Annual} document exactly (the interface is `implements`-ed, so the
 * column and the published contract cannot drift), plus two DERIVED convenience fields that are
 * computed at serialization time and never persisted.
 *
 * ## This is NOT the live air-quality payload
 * `/api/air-quality/provinces/{plateCode}` publishes a CAMS-modelled hourly INDEX ("hava
 * kalitesi"); this publishes a satellite-derived annual CONCENTRATION ("hava kirliliği"). Two
 * different claims, two different provenances, two different attributions — and a renderer that
 * mixes them (an EAQI colour band on this number, say) would be asserting an index we never
 * computed.
 */
export class Pm25AnnualDto implements Pm25Annual {
  @ApiProperty({
    enum: [PM25_SOURCE_ACAG_SATPM25],
    example: PM25_SOURCE_ACAG_SATPM25,
    description: 'Serinin kaynak kimliği.',
  })
  source!: Pm25Source;

  @ApiProperty({
    example: 'V6.GL.03',
    description:
      'Veri seti sürümü. ZORUNLU alan: yenileme yılda bir ve elle yapıldığı için tüketicinin ' +
      'verinin ne kadar eski olduğunu ikinci bir kaynağa bakmadan görebilmesi gerekir.',
  })
  datasetVersion!: string;

  @ApiProperty({
    example: 'https://www.satpm.org/v6-gl-03',
    description: '81 ilde aynı olan sağlayıcı sürüm sayfası.',
  })
  sourceUrl!: string;

  @ApiProperty({
    example: 0.009998,
    description:
      'Izgara hücre boyutu (derece) — sağlayıcının andığı 0,01° DEĞİL, dosyanın ENLEM ekseninden ' +
      'ÖLÇÜLEN adım, 6 ondalığa yuvarlanmış. İki eksen bu hassasiyette birebir aynı değildir ' +
      '(boylam adımı manifestte ayrıca kayıtlıdır); yayımlanan tek sayı enlem adımıdır. ' +
      'Sağlayıcı ızgarayı 0,01° × 0,01° diye anar (künyedeki çekince metninde de öyle geçer); ' +
      'buradaki sayı o ızgaranın float32 eksende ölçülen gerçek adımıdır. Biri diğerinin yerine ' +
      'geçmez.',
  })
  gridCellSizeDeg!: number;

  @ApiProperty({
    example: 'µg/m3',
    description:
      'Değerlerin birimi. Bu hattın SABİTİDİR — dosyanın `units` özniteliğinden okunmaz; ' +
      'sağlayıcının ürün sayfasında bildirdiği birimdir.',
  })
  unit!: string;

  @ApiProperty({
    enum: [PM25_READING_POINT_PROVINCE_CENTRE],
    example: PM25_READING_POINT_PROVINCE_CENTRE,
    description:
      'Değerin OKUNDUĞU nokta. `province_centre` = il merkezine düşen tek hücre; bu bir il ' +
      'ORTALAMASI DEĞİLDİR (→ DEC 2026-08-19d md.1). Arayüz bunu ima etmemelidir.',
  })
  readingPoint!: Pm25ReadingPoint;

  @ApiProperty({ example: 39.975, description: 'Okunan hücrenin merkez enlemi.' })
  cellLatitude!: number;

  @ApiProperty({ example: 32.865, description: 'Okunan hücrenin merkez boylamı.' })
  cellLongitude!: number;

  @ApiProperty({
    example: 0.279,
    description: 'İl merkezi ile hücre merkezi arasındaki uzaklık (km) — künyede gösterilebilir.',
  })
  cellDistanceKm!: number;

  @ApiProperty({
    type: [Pm25AnnualValueDto],
    description: 'Yıla göre ARTAN sırada, en az bir girdi.',
  })
  years!: Pm25AnnualValueDto[];

  @ApiProperty({
    example: 2024,
    description:
      'Serinin EN SON yılı — `years` dizisinin son girdisinden TÜRETİLİR, saklanmaz. Verinin ' +
      'bayatlığı bu alandan tek bakışta görülür.',
  })
  latestYear!: number;

  @ApiProperty({
    example: 22.74,
    description: "En son yılın değeri (µg/m³) — `years`'ten türetilir, saklanmaz.",
  })
  latestValueUgM3!: number;

  @ApiProperty({
    type: Pm25AttributionDto,
    description:
      'Lisans/atıf bloğu. Bölüm yayımlandığında HER ZAMAN yayımlanır — bildirim bir değere değil, ' +
      'yayımlanan bölüme iliştirilir.',
  })
  attribution!: Pm25AttributionDto;
}
