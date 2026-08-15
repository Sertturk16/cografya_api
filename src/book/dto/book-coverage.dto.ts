import { ApiProperty } from '@nestjs/swagger';

/**
 * What this book's index actually covers, as numbers — the interface's raw material.
 *
 * **The numbers live here and not in the prose, by owner ruling** (→ DEC 2026-08-15c §2). The
 * approved editorial text was revised twice for exactly this: the first draft led with
 * "40 denemeden 30'unun video çözümü var" plus the list of gaps, and the owner rejected it —
 * *"sayfaya giren insanlara niye eksiklerimizi gösteriyoruz"* — then removed "otuz", "180" and
 * "altı" from the text as well. The measurement that settled it was the reference product showing
 * its counts on card badges and list rows while keeping its blurb short. So: counts belong to the
 * interface, and this object is how the interface gets them.
 *
 * That ruling is about FRAMING, not about hiding. What was rejected was writing "40 denemenin
 * video çözümü var", because a student looking for deneme 26 who cannot find it leaves. This
 * object states what exists and asserts nothing about what does not; how it is presented is
 * Vera's, under `DESIGN.md`.
 *
 * **NOT SERVED BY ANY B1 ENDPOINT** — a frozen contract published for codegen (SPEC §16).
 */
export class BookCoverageDto {
  @ApiProperty({
    type: Number,
    minimum: 0,
    example: 30,
    description: 'How many denemeler of this book have a video solution indexed here.',
  })
  videoCount!: number;

  @ApiProperty({
    type: Number,
    minimum: 0,
    example: 180,
    description: 'How many individual question solutions are indexed, across every video.',
  })
  questionCount!: number;

  @ApiProperty({
    type: [Number],
    example: [1, 2, 3, 15, 33, 40],
    description:
      'Exactly which deneme numbers are covered, ascending. Ranges for display ("1–13") are the ' +
      "web layer's to derive; the api publishes the set, never a formatted string.",
  })
  denemeNumbers!: number[];

  @ApiProperty({
    type: Number,
    minimum: 1,
    example: 40,
    description:
      'How many denemeler the BOOK contains — a künye fact, not a coverage figure. It is not ' +
      'derived from videoCount, and nothing forces the two apart: a fully covered book makes ' +
      'them equal. Non-nullable: the owner checked the book (K-E), and denemeler 14 and 22 DO ' +
      'exist there — only their solution videos are missing.',
  })
  denemeCount!: number;
}
