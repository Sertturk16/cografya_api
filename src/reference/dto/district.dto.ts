import { ApiProperty } from '@nestjs/swagger';

/**
 * One ilçe, as the registration form's "İlçe" select needs it: something to submit and something
 * to show.
 *
 * ## There is ONE tier, and no Detail tier is coming
 * Playbook §2 keeps DTO tiers as simple as the data allows and forbids pre-building them. An ilçe
 * has no page (`DEC 2026-08-20i` md.2), so there is no detail view to size a second tier for, and
 * the entity stores nothing this shape omits except its timestamps and its foreign key.
 *
 * ## `provinceId` is deliberately NOT echoed back
 * The caller supplied it — it is the required query parameter of the only route that returns this
 * type — so echoing it would add 973 copies of a value the client already holds to the only
 * response shape that carries it. `ENGINEERING.md` §2 admits a "Response" tier where a write echo
 * genuinely needs one; this is a read, and it does not.
 */
export class DistrictDto {
  @ApiProperty({
    format: 'uuid',
    example: '6b3f6f5a-6f5a-4f5a-8f5a-6f5a6f5a6f5a',
    description:
      'İlçenin kimliği — kayıt formunun gönderdiği değer. Kalıcıdır, ama bir ilçe yeniden ' +
      'adlandırılırsa değişir (yeniden adlandırma bir silme + eklemedir).',
  })
  id!: string;

  @ApiProperty({
    example: 'Kadıköy',
    maxLength: 100,
    description:
      'İlçe adı (TR), okurun gördüğü yazımla — "Kadıköy", "KADIKÖY" değil (DEC 2026-08-20m md.6). ' +
      'Kaynak: TÜİK Coğrafi İstatistik Portalı (bkz. provenance/datasets.md, 2026-08-20 satırı).',
  })
  nameTr!: string;
}
