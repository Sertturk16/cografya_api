import { ApiProperty } from '@nestjs/swagger';

/**
 * One programme name, as the registration form's "Bölüm" suggestion box needs it.
 *
 * ## One field, and it stays an object rather than a bare string
 * The list could be published as `string[]`. It is not, for two reasons that both point the same
 * way: every other list this api serves is a list of objects, so a lone array of scalars would make
 * the web repo's generated client special-case one endpoint; and the moment a second attribute is
 * ever wanted, an object is an additive change while a scalar array is a breaking one. That is the
 * same asymmetry that keeps `id` OUT of `UniversityDto` — cheap to add, expensive to remove —
 * applied in the other direction because here the container is what would have to change.
 *
 * ## Why there is no level / degree field
 * The list is lisans only. `DEC 2026-08-20p` md.4 rules that önlisans programme names are **not**
 * added to the registration form, and it is an owner ruling derived from a measurement rather than
 * a preference: the reference product's own list carries zero two-year programmes, so the risk of
 * offering a two-year programme to somebody who selected "Lisans" never arises. `bolumler-onlisans.json`
 * exists in the Inbox and is deliberately **not** copied into this repo — a file that is out of
 * scope should not be sitting in `data/` waiting to be wired in by someone who did not read the
 * ruling.
 *
 * ## The five umbrella names are gone, and that too was ruled
 * The source's lisans set carries 350 names, five of which name a GROUP rather than a programme
 * ("… Programları"). `DEC 2026-08-21a` records the owner's decision to drop them so the list is of
 * one kind and later "how many members study X" counts come out clean, and NOVA's criterion,
 * controls and the five removed names are in `Owner's Inbox/oturum-lite/universite-bolum-listesi.md`
 * §E9. The artefact copied into `data/reference/departments.yokatlas.json` is the post-removal file;
 * this repo removes nothing of its own.
 */
export class DepartmentDto {
  @ApiProperty({
    example: 'Coğrafya Öğretmenliği',
    description:
      'Bölüm/program adı (TR), kaynağın yazdığı gibi — kaynak zaten okurun gördüğü yazımı ' +
      'veriyor, bu yüzden bir dönüşüm uygulanmıyor (DEC 2026-08-20m md.6). Yalnız lisans ' +
      'programları; önlisans kapsam dışı (DEC 2026-08-20p md.4). Kaynak: YÖK Atlas program ' +
      'adları (bkz. provenance/datasets.md, 2026-08-21 satırı).',
  })
  nameTr!: string;
}
