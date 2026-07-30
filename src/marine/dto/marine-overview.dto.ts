import { ApiProperty } from '@nestjs/swagger';
import { MarineAttributionDto } from './marine-attribution.dto';
import { MarineOverviewPointDto } from './marine-overview-point.dto';

/**
 * The `/deniz` hub payload: every point's instant values in one response.
 *
 * An OBJECT rather than a bare array because it carries `generatedAtUtc`, `dataAvailable` and
 * `attributions`. This is NOT a pagination envelope and does not trigger the repo playbook §2
 * rule that the first unbounded list establishes one.
 *
 * **NOT IMPLEMENTED IN M1** — frozen contract only; the endpoint lands in M4.
 */
export class MarineOverviewDto {
  @ApiProperty({ type: MarineOverviewPointDto, isArray: true })
  points!: MarineOverviewPointDto[];

  @ApiProperty({
    example: '2026-07-30T12:04:11.000Z',
    description: 'When the server assembled this response (ISO-8601 UTC).',
  })
  generatedAtUtc!: string;

  @ApiProperty({
    example: true,
    description:
      'False only in the narrow window where the cache is genuinely empty (first boot before ' +
      'the first warmup tick, or after a cache flush). The response is still 200 — a 5xx would ' +
      'break the web build, which is the one thing these endpoints must never do — but it ' +
      'carries Cache-Control: no-store and this flag. CONTRACT: a response with ' +
      'dataAvailable=false MUST NOT be committed by ISR/SSG; keep the previous render. That is ' +
      'what stops an empty /deniz page from being indexed.',
  })
  dataAvailable!: boolean;

  @ApiProperty({ type: MarineAttributionDto, isArray: true })
  attributions!: MarineAttributionDto[];
}
