import { Controller, Get, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CacheControl } from '../common/http-cache/cache-control.decorator';
import { DistrictService } from './district.service';
import { DistrictListQueryDto } from './dto/district-list-query.dto';
import { DistrictDto } from './dto/district.dto';

/**
 * `Cache-Control` for the ilçe list.
 *
 * The longest window on this api, and the data earns it: the ilçe list changes when Türkiye creates
 * or renames an ilçe by law — a handful of times a decade — and it changes only through a
 * `pnpm db:seed:reference` run against a re-collected artefact, never through a request. Compare
 * the province reads (`max-age=300`), whose bodies carry live-ish climate and air-quality figures.
 *
 * The value matches the air-quality attribution/marine-points windows already in this repo rather
 * than inventing a fourth number: one day at the CDN, a week of stale-while-revalidate. `s-maxage`
 * is stated separately because a shared cache is where this list should actually live.
 *
 * It rides `@CacheControl` rather than `@Header` so it is set on SUCCESS ONLY — a 400 for a
 * malformed `plateCode` must not be cached for a day, or a client that fixes its bug keeps being
 * served the error.
 */
const DISTRICT_CACHE_CONTROL =
  'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';

/**
 * Reference lists the registration form reads (üyelik plan §3, PR-1).
 *
 * **No auth guard, by design** (`ENGINEERING.md` §2, the `ProvinceController` precedent). The list
 * of Türkiye's ilçe is public administrative fact, it is needed BEFORE anybody has an account —
 * the registration form is where it is used — and there is no write endpoint, no admin CRUD and no
 * role on this leg at all. Rows change only through a seed run.
 *
 * **No personal data passes through here** (`ENGINEERING.md` §3.6): a request carries one province
 * id and the response carries place names. This route is the reason the form CAN avoid a free-text
 * ilçe field, which is the KVKK-cheaper shape.
 *
 * The controller path is `reference` rather than `districts` because the plan's PR-2 adds
 * `/api/reference/universities` and `/api/reference/departments` beside it — one prefix for "lists
 * that exist to fill a select box", kept apart from the content surface (`/api/provinces`,
 * `/api/countries`, `/api/books`) whose payloads are the SEO pages themselves.
 */
@ApiTags('reference')
@Controller('reference')
export class DistrictController {
  constructor(private readonly districtService: DistrictService) {}

  @Get('districts')
  @CacheControl(DISTRICT_CACHE_CONTROL)
  @ApiOperation({
    summary: "List one province's districts (ilçe) by plate code, Turkish-alphabetical.",
    description:
      'A plain typed array — no envelope and no pagination, the bounded-set rule ' +
      '`ENGINEERING.md` §2 already applies to the 81 provinces: the largest province has fewer ' +
      'than 40 ilçe and the whole set is 973. The order is the order to render. The province is ' +
      'addressed by the two-digit plate code published on every province payload; the internal ' +
      'uuid is never part of this contract.',
  })
  @ApiOkResponse({ type: DistrictDto, isArray: true })
  @ApiBadRequestResponse({
    description:
      'plateCode is missing or is not exactly two zero-padded digits, or an unrecognised query ' +
      'parameter was sent — unknown parameters are rejected rather than ignored, and that ' +
      'includes the retired provinceId. Distinct from an empty array, which means the parameter ' +
      'was well-formed and matched no ilçe.',
  })
  findDistricts(@Query() query: DistrictListQueryDto): Promise<DistrictDto[]> {
    return this.districtService.findByProvincePlateCode(query.plateCode);
  }
}
