import { ApiProperty } from '@nestjs/swagger';

/**
 * One question's jump target inside its deneme's video.
 *
 * **This DTO carries a number and no language, and that is the rule rather than an economy.** The
 * label the reader sees — `Soru 3` — is built in the web repo from an i18n key plus
 * {@link questionNo}: playbook §6 bars a user-facing literal from leaving the api, and
 * `QUESTIONS.md` V-4 closed the question of giving a question a semantic title, so there is no
 * topic name to carry either. A consequence worth stating because it looks like an omission:
 * `SEO-POLICY.md` A4 (cross-links on shared entities) cannot be applied at question level on this
 * surface — we do not hold the question texts, so any cross-link would have to be invented
 * (SPEC §11.3).
 *
 * Served inside `BookDetailDto` since B3, ascending by `questionNo`, ordered in SQL rather than in
 * the mapper so the e2e assertion on the SERVED order is a guard that can actually fail.
 */
export class BookVideoQuestionDto {
  @ApiProperty({
    type: Number,
    minimum: 1,
    example: 3,
    description:
      'The question position inside its deneme, from 1, gapless. The reader-facing "Soru 3" ' +
      'label is composed in the web layer from this number and an i18n key.',
  })
  questionNo!: number;

  @ApiProperty({
    type: Number,
    minimum: 0,
    example: 94,
    description:
      "Whole seconds from the start of the video to this question's solution — the jump target " +
      'handed to the player (DEC 2026-08-15d: the jump happens inside the loaded player, not by ' +
      'rebuilding the embed URL). DO NOT assume the first question starts at 0 — the measured ' +
      'set of first-question seconds is {0, 2, 6, 11, 94}, so 0 is an ordinary value and not a ' +
      'sentinel.',
  })
  startSecond!: number;
}
