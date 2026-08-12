import { ApiProperty } from '@nestjs/swagger';

/**
 * The filter the server ACTUALLY applied, echoed back — not the filter that was requested.
 *
 * The two differ whenever a default fills in, and that difference is the point: a reader looking
 * at a list of five events cannot otherwise tell whether the window was seven days or one, or
 * whether a magnitude floor hid the rest. SPEC §13 item 14 pins the echo as identical to what
 * was applied.
 *
 * `page` and `pageSize` are NOT repeated here: they are part of the core envelope
 * (`DEC 2026-08-12k` §2), and a second copy inside `meta` would be a fact stored twice.
 *
 * Field set derived from SPEC §6.3's query parameters and confirmed at the E1 plan gate; the
 * query DTO that validates them lands with the endpoint in E3 (with no route, a query DTO emits
 * nothing into the contract).
 */
export class EarthquakeFilterEchoDto {
  @ApiProperty({
    type: Number,
    minimum: -1,
    maximum: 10,
    example: 2.5,
    description:
      'The magnitude floor applied. The default is 2.5 (QUESTIONS.md D-2) and it is applied at ' +
      'DISPLAY time, never at ingest — everything is stored, so "show all" finds real data ' +
      '(DEC 2026-08-12k D-C).',
  })
  minMagnitude!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '46',
    description: 'The province filter applied, as a zero-padded plate code, or null for none.',
  })
  plateCode!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-08-04T00:00:00.000Z',
    description:
      'Start of the window applied, UTC. Always concrete — a defaulted window is resolved to ' +
      'real instants here rather than echoed as "the last 7 days".',
  })
  fromUtc!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-08-11T23:59:59.000Z',
    description: 'End of the window applied, UTC.',
  })
  toUtc!: string;
}
