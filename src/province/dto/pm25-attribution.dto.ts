import { ApiProperty } from '@nestjs/swagger';

/**
 * The licence/attribution block published beside every long-term PM2.5 series.
 *
 * Every string here is either provider-verbatim or a recorded derivation
 * (`acag-attribution.constant.ts` names which is which, per element). The API publishes the
 * PARTS and never a pre-joined sentence: separator, order and typography are presentation
 * decisions, and they differ between TR and EN.
 */
export class Pm25AttributionDto {
  @ApiProperty({
    example: 'Atmospheric Composition Analysis Group, Washington University in St. Louis',
    description: 'Kurum adı — kurumun kendi yazdığı hâliyle. Çevrilmez.',
  })
  providerName!: string;

  @ApiProperty({
    example: 'SatPM₂.₅ V6.GL.03',
    description:
      'Lisanslanan eserin adı — sağlayıcının lisans cümlesinden BİREBİR. Alt simgeler (U+2082, ' +
      "U+2085) alıntının parçasıdır; ASCII'ye düzleştirmek alıntıyı bozar.",
  })
  workTitle!: string;

  @ApiProperty({ example: 'V6.GL.03', description: 'Veri seti sürümü.' })
  datasetVersion!: string;

  @ApiProperty({
    example: 'https://www.satpm.org/v6-gl-03',
    description: 'Sağlayıcının sürüm sayfası.',
  })
  datasetUrl!: string;

  @ApiProperty({
    example: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
    description: 'Lisans adı. Çevrilmez.',
  })
  licenceName!: string;

  @ApiProperty({
    example: 'https://creativecommons.org/licenses/by/4.0/?ref=chooser-v1',
    description: 'Sağlayıcının lisans cümlesindeki bağlantının birebir hâli.',
  })
  licenceUrl!: string;

  @ApiProperty({
    description: 'Referans yayın — sağlayıcının kendi biçiminde, BİREBİR. Çevrilmez.',
  })
  referenceCitation!: string;

  @ApiProperty({ description: 'Referans yayının DOI bağlantısı.' })
  referenceUrl!: string;

  @ApiProperty({
    description:
      "SAĞLAYICININ KENDİ ÇEKİNCESİ — birebir ve çevrilmeden yayımlanır. Izgara 1 km'dir ama " +
      'sağlayıcı her gradyanı çözemediğini kendisi yazar; bu cümle yayımlanan her sayıya eşlik ' +
      'etmek zorundadır.',
  })
  methodNoticeText!: string;

  @ApiProperty({
    type: [String],
    example: ['airPollution.notice.satelliteDerived', 'airPollution.notice.provinceCentrePoint'],
    description:
      'Editoryal uyarıların i18n ANAHTARLARI — api metin yayımlamaz, anahtar yayımlar; ' +
      'karşılıklarını web deposu yazar.',
  })
  noticeKeys!: string[];
}
