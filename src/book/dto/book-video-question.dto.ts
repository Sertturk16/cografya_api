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
 * **NOT SERVED BY ANY B1 ENDPOINT** — a frozen contract published for codegen; the public
 * endpoints land in B3 (SPEC §16).
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
      "Whole seconds from the start of the video to this question's solution; handed to the " +
      'player as ?start=<seconds>. DO NOT assume the first question starts at 0 — the measured ' +
      'set of first-question seconds is {0, 2, 6, 11, 94}, so 0 is an ordinary value and not a ' +
      'sentinel.',
  })
  startSecond!: number;
}
