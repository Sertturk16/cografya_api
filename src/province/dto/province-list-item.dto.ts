import { ApiProperty } from '@nestjs/swagger';
import { GeographicRegion } from '../../common/geographic-region.enum';

/**
 * Lean list payload for the il-hub index.
 *
 * Read-DTO tiers for this entity are List + Detail (ProvinceDetailDto) + MapSummary
 * (ProvinceMapSummaryDto) — the last a purpose-sized bulk read for the homepage map
 * hover-card. Each has a concrete consumer, so none is speculative (CLAUDE §2 "keep
 * DTO tiers minimal" — consciously ratified: three READ shapes, no more). A write/
 * "Response" tier is still intentionally NOT introduced: the API is public read-only
 * with no write endpoint echoing input back, so it would be speculative today.
 */
export class ProvinceListItemDto {
  @ApiProperty({ example: '34', description: 'Plaka kodu (stable, unique).' })
  plateCode!: string;

  @ApiProperty({ example: 'İstanbul', description: 'İl adı (TR).' })
  nameTr!: string;

  @ApiProperty({ enum: GeographicRegion, description: 'Coğrafi bölge.' })
  region!: GeographicRegion;

  @ApiProperty({ example: 'istanbul', description: 'TR slug (routing key).' })
  slugTr!: string;

  @ApiProperty({ example: 'istanbul', description: 'EN slug (routing key).' })
  slugEn!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Csa',
    description:
      'Köppen iklim kısa kodu (MGM 2023). Liste DTO’suna bilinçli eklendi: "benzer iklime sahip ' +
      'iller" bloğu bu alan olmadan kurulamaz (aynı Köppen kodlu illere çapraz link). Saf toplama, ' +
      'kırıcı değil.',
  })
  climateKoppen!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 14.2,
    description:
      'Yıllık ortalama sıcaklık (°C) — 12 aylık ortalamanın ortalaması, 1 ondalık. Detay ' +
      'DTO’sundaki climate.derived.annualMeanTempC ile AYNI türetilmiş değerdir (tek kaynak: ' +
      'climate-derivations.ts; liste yolunda yeniden türetilmez, aynı buildClimate çağrısıyla ' +
      'canlı hesaplanır). Benzer-iklim bloğunun "en yakın 5" seçimi (→ DEC 2026-07-20b) ve çapa ' +
      'metnindeki "il adı + °C" bu alan olmadan kurulamaz. İlin yayınlanabilir iklim serisi ' +
      'yoksa null. Saf toplama, kırıcı değil.',
  })
  climateAnnualMeanTempC!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 40.9819,
    description:
      'İl merkezi enlemi (decimal degrees) — MGM il-merkez istasyonu. Detay DTO’sundaki ' +
      '`latitude` ile AYNI sütun, aynı değer; liste yolunda hiçbir türetme yok. CBS ölçüm ' +
      'araçlarının (mesafe / koordinat) 81’lik il seçimi bu alan olmadan kurulamaz — ve ' +
      'poligon merkezinden türetmek bir alternatif DEĞİL: `GLOSSARY.md` §1 alan ağırlık ' +
      'merkezini il merkeziyle karıştırmayı adıyla yasaklıyor, ve iki nokta arasındaki fark ' +
      'ölçülen mesafeye doğrudan geçer. Saf toplama, kırıcı değil.',
  })
  latitude!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 28.8208,
    description:
      'İl merkezi boylamı (decimal degrees) — MGM il-merkez istasyonu. Gerekçesi ve ' +
      'kaynağı `latitude` ile aynı; ikisi tek bir noktanın iki yarısıdır ve birlikte ' +
      'eklenir.',
  })
  longitude!: number | null;
}
