import { ApiProperty } from '@nestjs/swagger';

/**
 * One etiket inside its video — an order number, a start second and an optional name
 * (`GLOSSARY.md` §4.2, `etiket`; `DEC 2026-09-10b` md.1). The generic successor to the retired
 * `BookVideoQuestionDto` (P0 plan §5.2/§8.1) — renamed rather than recreated, so `startSecond`
 * carries over unchanged.
 *
 * **`orderNo` carries a number and no forced language, and that is the rule rather than an
 * economy.** For a deneme book's etiketler the reader-facing label — `Soru 3` — is still built in
 * the web repo from an i18n key plus {@link orderNo}: playbook §6 bars a user-facing literal from
 * leaving the api, and a deneme book's etiketler carry no name (`GLOSSARY.md` §4.2). A
 * topic-summary/soru-bankası book's etiketler carry one, in {@link nameTr}/{@link nameEn} — the
 * one per-type hole in the api's language-neutral boundary. A consequence worth stating because it
 * looks like an omission: `SEO-POLICY.md` A4 (cross-links on shared entities) cannot be applied at
 * this level on a deneme book's surface — we do not hold the question texts, so any cross-link
 * would have to be invented.
 *
 * Served inside `BookVideoDto.tags` since B3 (renamed P0 PR-3), ascending by `orderNo`, ordered in
 * SQL rather than in the mapper so the e2e assertion on the SERVED order is a guard that can
 * actually fail.
 */
export class BookVideoTagDto {
  @ApiProperty({
    type: Number,
    minimum: 1,
    example: 3,
    description:
      "The etiket's position inside its video, from 1, gapless. ALWAYS stored, never derived " +
      'from startSecond (`DEC 2026-09-10b` md.3). The reader-facing "Soru 3" label of a deneme ' +
      'book is composed in the web layer from this number and an i18n key.',
  })
  orderNo!: number;

  @ApiProperty({
    type: Number,
    minimum: 0,
    example: 94,
    description:
      "Whole seconds from the start of the video to this etiket's solution — the jump target " +
      'handed to the player (DEC 2026-08-15d: the jump happens inside the loaded player, not by ' +
      'rebuilding the embed URL). DO NOT assume the first etiket starts at 0 — the measured ' +
      'set of first-mark seconds is {0, 2, 6, 11, 94}, so 0 is an ordinary value and not a ' +
      'sentinel.',
  })
  startSecond!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description:
      "The etiket's own name — generic-model addition (`GLOSSARY.md` §4.2, `etiket adı`). NULL " +
      'for every etiket of a deneme book: sıra and saniye are the only information, and the ' +
      'reader sees "Soru 3" built from the web repo\'s own i18n key plus orderNo. A ' +
      "topic-summary/soru-bankası book's etiketler carry one.",
  })
  nameTr!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description:
      'EN counterpart of nameTr, null on the same SEO-POLICY §B14 14.2 grounds every other EN ' +
      'twin uses: a field with no counterpart is omitted, never machine-filled.',
  })
  nameEn!: string | null;
}
