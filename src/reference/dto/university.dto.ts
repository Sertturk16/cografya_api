import { ApiProperty } from '@nestjs/swagger';

/**
 * What kind of institution a row is — YÖK's own four-way split, kept rather than reduced.
 *
 * ## The four values are the source's axis, not one we invented
 * YÖK publishes its list under four `type` parameters and this artefact carries all four
 * (`provenance/datasets.md`, the 2026-08-20 YÖK row). `KKTC` sits on the same axis as `DEVLET` and
 * `VAKIF` in the source, so it does here too. It is not a "country" field wearing the wrong name:
 * YÖK does not classify a KKTC institution as state or foundation, and inventing a second field to
 * split what the source keeps together would be us re-classifying institutions, which is exactly
 * what a reference list must not do.
 *
 * This value is what satisfies the plan's requirement that KKTC institutions be **separately
 * marked** (üyelik plan §3, PR-2, kabul ölçütü 3): the sixteen KKTC rows carry `KKTC` and nothing
 * else does. `reference-lists.spec.ts` pins that as a two-way check against the artefact.
 *
 * ## Scope, ruled and measured
 * The artefact excludes the six institutions abroad, MSÜ, Polis Akademisi and JSGA, and includes
 * the sixteen KKTC institutions — the owner's boundary, applied by the collector. `VAKIF_MYO` is
 * the four foundation vocational schools YÖK publishes as its own type; they are institutions a
 * user can name, and dropping them would narrow the source's own scope on our authority. **This is
 * unrelated to the önlisans DEPARTMENT question** (`DEC 2026-08-20p` md.4), which is about which
 * programme names the "Bölüm" select offers, not about which institutions exist.
 *
 * The values are ASCII upper-snake — the `GeographicRegion` convention, chosen there so the
 * published value is safe in generated web types and would survive becoming a Postgres enum label.
 * Turkish labels are the web's, as with every other enum in this contract.
 */
export enum UniversityType {
  Devlet = 'DEVLET',
  Vakif = 'VAKIF',
  VakifMyo = 'VAKIF_MYO',
  Kktc = 'KKTC',
}

/**
 * One institution, as the registration form's "Üniversite" suggestion box needs it.
 *
 * ## There is no `id`, and that is a decision rather than an omission
 * SPEC §6.2 sketches this row as `{ id, nameTr, type }`, but the same table's next column rules
 * that the user's answer is stored as **text** (`universityName` → *metin*) — the form submits a
 * NAME, never a key. So an `id` here would be a value nothing sends, nothing stores and nothing
 * resolves. There is also nothing to mint it from: YÖK publishes no identifier in this artefact,
 * and `GLOSSARY.md` §5's slug rule — the only string-minting policy this project has — carries a
 * standing `[TEYİT GEREK]` and is explicitly not canonical, so using it to coin 223 permanent
 * identifiers would be reaching for an unratified rule to fill a gap. `nameTr` is unique across the
 * list (asserted in `reference-lists.spec.ts`) and is therefore already the key the select needs.
 *
 * Adding an `id` later is an ADDITIVE contract change; removing one is breaking. That asymmetry is
 * why the smaller shape is the reversible choice, and it is flagged to Atlas rather than assumed.
 *
 * ## The city is deliberately absent
 * The artefact carries `il`/`kktcSehir` and this DTO drops them, per the plan's own §15 md.5: the
 * registration form asks for the user's province in its own field, so a university's city would be
 * a second, unrelated province on the same screen.
 */
export class UniversityDto {
  @ApiProperty({
    example: 'Boğaziçi Üniversitesi',
    description:
      'Üniversite adı (TR), okurun gördüğü yazımla — "Boğaziçi Üniversitesi", "BOĞAZİÇİ ' +
      'ÜNİVERSİTESİ" değil (DEC 2026-08-20m md.6). Kaynağın büyük harfli hâli bu depoda ' +
      'data/reference/universities.yok.json içinde bozulmadan durur. Kaynak: YÖK (bkz. ' +
      'provenance/datasets.md, 2026-08-20 satırı).',
  })
  nameTr!: string;

  @ApiProperty({
    enum: UniversityType,
    example: UniversityType.Devlet,
    description:
      'Kurum türü — YÖK’ün kendi dörtlü ayrımı. KKTC kurumları bu alanla ayrılır; TR etiketleri ' +
      'web tarafında.',
  })
  type!: UniversityType;
}
