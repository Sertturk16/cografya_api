import { ApiProperty } from '@nestjs/swagger';
import { PaginationEnvelopeDto } from '../../common/dto/pagination-envelope.dto';
import { EarthquakeEventDto } from './earthquake-event.dto';
import { EarthquakeListMetaDto } from './earthquake-list-meta.dto';

/**
 * A paginated earthquake list — the response shape of `GET /api/earthquakes` and of the
 * per-province path, both of which land in E3.
 *
 * **NOT SERVED BY ANY E1 ENDPOINT.** Published in this contract PR so the web repo can codegen
 * and build against a mock while the runtime is built (SPEC §15 step 1).
 *
 * ## This is the repo's FIRST unbounded list, so its shape binds the next ones
 * Playbook §2: the first unbounded/growing list introduces the shared envelope, and every list
 * after follows it. `DEC 2026-08-12k` §2 and §7 rule what that means concretely — the core five
 * inherited from `PaginationEnvelopeDto` plus `items`, and every endpoint-specific field inside
 * a single `meta` object. Blog and topic lists will carry the same five; their `meta`, if they
 * need one at all, is their own.
 *
 * ## Not a Detail tier, and there will not be one
 * D-E rules out per-event pages, so there is no "full payload" distinct from the list item
 * (SPEC §6.2). Playbook §2's List+Detail default is satisfied by List alone here.
 */
export class EarthquakeListDto extends PaginationEnvelopeDto {
  @ApiProperty({
    type: EarthquakeEventDto,
    isArray: true,
    description:
      'The page of events, newest first, tie-broken by providerEventId so a row cannot appear ' +
      'on two pages. Empty on the cold path — which is a 200 with meta.dataStatus ' +
      '"unavailable", never an error.',
  })
  items!: EarthquakeEventDto[];

  @ApiProperty({
    type: EarthquakeListMetaDto,
    description:
      "This endpoint's extension to the shared envelope: applied filter, data freshness and " +
      'the mandatory attribution. Not part of the core five and not inherited by any other list.',
  })
  meta!: EarthquakeListMetaDto;
}
