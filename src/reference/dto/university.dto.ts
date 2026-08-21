import { ApiProperty } from '@nestjs/swagger';

/**
 * What kind of institution a row is — the source's own split, kept rather than reduced.
 *
 * ## The four values are the source's axis, not one we invented
 * YÖK published these four lists at `yok.gov.tr/university` in the 2026-08-20 collection —
 * `?type=1` (Devlet), `?type=2` (Vakıf), `?type=3` (Vakıf MYO), `?type=6` (KKTC) — and this
 * artefact carries those four (`provenance/datasets.md`, the 2026-08-20 YÖK row).
 *
 * **Said that precisely on purpose.** The numbering skips 4 and 5, and nothing in our record says
 * what those two return or whether they return anything; the four addresses were read off YÖK's
 * own menu and footer on that date. So this is the split the publisher was offering then, not a
 * claim about the completeness of its taxonomy. What the load-bearing half of the argument needs
 * is narrower and IS measured: `?type=6` is the publisher's own list, so `KKTC` is the source's
 * classification rather than ours. `KKTC` sits on the same axis as `DEVLET` and
 * `VAKIF` in the source, so it does here too. It is not a "country" field wearing the wrong name:
 * YÖK does not classify a KKTC institution as state or foundation, and inventing a second field to
 * split what the source keeps together would be us re-classifying institutions, which is exactly
 * what a reference list must not do.
 *
 * This value is what satisfies the plan's requirement that KKTC institutions be **separately
 * marked** (üyelik plan §3, PR-2, kabul ölçütü 3): the sixteen KKTC rows carry `KKTC` and nothing
 * else does. `reference-lists.spec.ts` pins that as a two-way check against the artefact.
 *
 * ## Where the list comes from — the criterion, not just the count
 * The published set is exactly what YÖK publishes at `yok.gov.tr/university`, the four lists its
 * own menu and footer link to (`?type=1` Devlet · `?type=2` Vakıf · `?type=3` Vakıf MYO ·
 * `?type=6` KKTC). YÖK Atlas (`yokatlas.yok.gov.tr/api/tercih-kilavuz/universiteler`, 228 rows) is
 * the CROSS-CHECK surface and never the source — `DEC 2026-08-20h` md.3 and md.4 rule that the
 * list is taken from the publisher's own publication. Writing the criterion down is the point: a
 * re-collection that reached for the cross-check surface instead would widen this set, move the
 * hash pin by the documented procedure, clear the coverage floor and leave every gate green.
 *
 * ## Scope — owner-ruled, and the two halves are not the same kind of absence
 * The boundary is the owner's, closed on 2026-08-20 as `FU-UNI-LISTE-EKSIK-KURUMLAR`
 * (`Team/state/FOLLOWUPS.md`): MSÜ, Polis Akademisi and JSGA stay out, the sixteen KKTC
 * institutions are in, and the six institutions abroad stay out.
 *
 * The two exclusions differ in a way that matters for what can guard them. MSÜ, Polis Akademisi
 * and JSGA appear in NEITHER official list — the ruling and the source agree, so the source itself
 * keeps them out. The six abroad (Manas, Hoca Ahmet Yesevi, Uluslararası Saraybosna, Uluslararası
 * Balkan, Tiran New York, Azerbaycan Devlet Pedagoji) DO exist on the YÖK Atlas surface and are
 * out by the ruling alone; `yok.gov.tr` has no "yurt dışı" category at all. The whole failure path
 * lives in those six, which is why `reference-lists.spec.ts` pins the exclusion structurally
 * rather than leaving it as prose. The measurements behind both halves are in
 * `Owner's Inbox/oturum-lite/universite-bolum-listesi.md` §5.2 and §7.1.
 *
 * `VAKIF_MYO` is the four foundation vocational schools YÖK publishes as its own type; they are
 * institutions a user can name, and dropping them would narrow the source's own scope on our
 * authority. **This is unrelated to the önlisans DEPARTMENT question** (`DEC 2026-08-20p` md.4),
 * which is about which programme names the "Bölüm" select offers, not about which institutions
 * exist.
 *
 * The values are ASCII upper-snake — the `GeographicRegion` convention, chosen there so the
 * published value is safe in generated web types and would survive becoming a Postgres enum label.
 *
 * **All four stay Turkish, deliberately, and `GLOSSARY.md` §7.2 holds the reason.** `GLOSSARY.md`
 * §4.4 rules that a registration-form code value goes to English where the concept has a clean
 * English equivalent, and three of these four do. The exception is written down at §7.2 rather
 * than restated here, because a scope that exists twice can disagree with itself. Read it before
 * translating any of them: a glossary pass over this package's enums is planned work
 * (`FU-GLOSSARY-UYELIK`, `AK-24` open), and applying §4.4 mechanically is precisely what §7.2
 * refuses.
 *
 * Turkish labels are the web's, as with every other enum in this contract; the two group headings
 * the reader actually sees are ruled in `GLOSSARY.md` §7.2 and §7.3 (`DEC 2026-08-21h`).
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
      'Kurum türü — YÖK’ün yok.gov.tr/university adresinde 2026-08-20 toplamasında yayımladığı ' +
      'dört liste (type=1 Devlet, type=2 Vakıf, type=3 Vakıf MYO, type=6 KKTC). KKTC kurumları ' +
      'bu alanla ayrılır. Okurun gördüğü TR grup başlıkları web tarafındadır ve GLOSSARY.md ' +
      '§7.2/§7.3 ile hükme bağlıdır (DEC 2026-08-21h): type=KKTC ise “KKTC”, değilse “Türkiye”; ' +
      '“Yurt dışı” kullanılmaz.',
  })
  type!: UniversityType;
}
