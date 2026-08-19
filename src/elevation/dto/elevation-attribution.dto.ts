import { ApiProperty } from '@nestjs/swagger';

/**
 * The licence surface of one profile response.
 *
 * ## The strings are minted HERE and nowhere else (Atlas ruling AK-25 md.6)
 * The web repo CONSUMES these fields and never writes a second copy — including the PNG export,
 * whose embedded credit (SPEC §9.3) is drawn from what this contract serves. Two copies of a
 * licence text is two things that can drift, and only one of them would be reviewed the day the
 * licence changes.
 *
 * ## Every field is populated on every response, cold path included
 * A notice that appears only when data resolved discharges nothing. See
 * `elevation-attribution.constant.ts` for each string's provenance and for why three notices are
 * published rather than the two the plan proposed.
 */
export class ElevationAttributionDto {
  @ApiProperty({
    example: 'Terrain Tiles (Mapzen, a Linux Foundation project)',
    description: 'Sağlayıcı adı — AWS Open Data kaydının `ManagedBy` alanından.',
  })
  providerName!: string;

  @ApiProperty({
    example: 'https://registry.opendata.aws/terrain-tiles/',
    description: 'AWS Open Data kayıt adresi.',
  })
  datasetUrl!: string;

  @ApiProperty({
    example: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
    description:
      'Atıf yükümlülüğünü tanımlayan belge. Kaydın `License:` alanı bir lisans ADI değil, bu ' +
      'belgeye işaret eder.',
  })
  licenceUrl!: string;

  @ApiProperty({
    type: [String],
    description:
      'Borçlu olunan atıf satırları, BİREBİR ve İngilizce. Çevrilmez, kısaltılmaz, yeniden ' +
      'yazılmaz, sırası değiştirilmez. Profili gösteren HER yüzeyde — PNG dışa aktarımı dahil — ' +
      'okunabilir biçimde görünmek zorundadır.',
  })
  requiredNoticesEn!: string[];

  @ApiProperty({
    example: 'Not to be used for navigation',
    description:
      'NOAA’nın ETOPO1 için koyduğu ayrı sınır, birebir. DENİZ DERİNLİĞİ gösteren her yüzeyde ' +
      'yazılır; `seaDepthIncluded` bu yanıtın o sınıfa girip girmediğini söyler.',
  })
  navigationLimitEn!: string;

  @ApiProperty({
    type: Boolean,
    example: false,
    description:
      'Bu yanıt deniz derinliği içeriyor mu. Örnekleme zoom’u lisans gereği z12’ye sabit ve ' +
      'orada deniz tam 0 m okunur (ölçüldü), dolayısıyla yapısal olarak `false` — ' +
      '`navigationLimitEn` bu yanıt için tetiklenmez. Alan sözleşmede duruyor ki derinlik ' +
      'gösteren bir yüzey doğduğunda kuralı aramak zorunda kalmasın.',
  })
  seaDepthIncluded!: boolean;

  @ApiProperty({
    description:
      'Yöntem beyanı (TR) — GMTED2010’un değiştirme-beyanı yükümlülüğü ve CLMS veri ' +
      'politikasının 2. koşulu. Yayımlanan türetilmiş rakımın yanında durur ve KISALTILAMAZ.',
  })
  methodNoteTr!: string;

  @ApiProperty({ description: 'Yöntem beyanının İngilizce ikizi.' })
  methodNoteEn!: string;

  @ApiProperty({
    description:
      'Doğruluk çekincesi (TR). Kullanım noktasında gösterilir: ızgara verisi sivri zirveleri ' +
      'sistematik olarak alçaltır (Erciyes’te ölçülen fark ~88 m).',
  })
  accuracyNoteTr!: string;

  @ApiProperty({ description: 'Doğruluk çekincesinin İngilizce ikizi.' })
  accuracyNoteEn!: string;

  @ApiProperty({
    description:
      'Kaynağı Türkçe anlatan bilgilendirme cümlesi. İngilizce bildirimlerin YERİNE GEÇMEZ, ' +
      'yanlarında durur.',
  })
  explanationTr!: string;
}
