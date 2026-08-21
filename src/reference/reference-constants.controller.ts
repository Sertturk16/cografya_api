import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CacheControl } from '../common/http-cache/cache-control.decorator';
import { DEPARTMENTS } from './department.data';
import { DepartmentDto } from './dto/department.dto';
import { UniversityDto } from './dto/university.dto';
import { UNIVERSITIES } from './university.data';

/**
 * `Cache-Control` for the two compile-time reference lists.
 *
 * The same window `DistrictController` uses, and for a stronger version of the same reason: these
 * rows cannot change without a deploy, because they are compiled into the build rather than read
 * from a table. One day at the CDN, a week of `stale-while-revalidate`.
 *
 * **It is restated here rather than shared with the ilçe route on purpose.** Extracting a constant
 * out of `district.controller.ts` would edit a file this task has no other reason to touch — the
 * "while I was in there" change the process forbids — and the district DTO's own docblock already
 * records the same refusal for the plate-code pattern. The drift this leaves is bounded and worth
 * naming rather than hiding: if the two ever disagree, one reference list is cached longer than
 * another, which is a cosmetic inconsistency and not a correctness bug. A reviewer who wants them
 * unified should get it as its own change with its own review.
 *
 * It rides `@CacheControl` rather than `@Header` so the header is set on SUCCESS ONLY.
 */
const REFERENCE_LIST_CACHE_CONTROL =
  'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';

/**
 * The two reference lists the registration form reads that have no table behind them (üyelik plan
 * §3, PR-2).
 *
 * **No auth guard, by design** (`ENGINEERING.md` §2, the `ProvinceController` precedent): both
 * lists are public reference data, both are needed BEFORE anybody has an account — the registration
 * form is where they are used — and neither has a write path, an admin CRUD or a role on this leg.
 *
 * **No personal data passes through here** (`ENGINEERING.md` §3.6). A request carries nothing at
 * all and the responses are lists of institution and programme names. These routes are the reason
 * the form CAN offer a suggestion box instead of a bare free-text field, which is the shape that
 * keeps "hangi bölümden kaç üyemiz var" answerable later without storing anything more about a
 * person.
 *
 * **No service, and no repository.** Both handlers return a frozen module constant, so there is
 * nothing to inject and nothing to query; a service layer here would be one indirection whose only
 * behaviour is `return`. That is why `ReferenceModule` keeps its `forFeature` at `District`.
 *
 * **Neither route takes a query DTO, so neither validates its query string.** `ENGINEERING.md` §2
 * records this asymmetry: a route with no query DTO ignores unknown parameters instead of
 * rejecting them, which is a consequence of where DTOs exist rather than a second policy. Adding
 * an empty DTO purely to turn `?utm_source=x` into a 400 would be machinery in service of nothing —
 * these endpoints have no parameters to get wrong, and a caller that passes one gets the whole list
 * either way.
 */
@ApiTags('reference')
@Controller('reference')
export class ReferenceConstantsController {
  @Get('universities')
  @CacheControl(REFERENCE_LIST_CACHE_CONTROL)
  @ApiOperation({
    summary: 'List every university the registration form offers, Turkish-alphabetical.',
    description:
      'A plain typed array — no envelope and no pagination, the bounded-set rule ' +
      '`ENGINEERING.md` §2 states for the 81 provinces. The set is fixed at build time and the ' +
      'order is the order to render. Names are in the reader’s writing ("Boğaziçi Üniversitesi"); ' +
      'KKTC institutions are marked by `type`. No logo, founding year, score, quota or ' +
      'university-programme pairing is published — none of it was collected.',
  })
  @ApiOkResponse({ type: UniversityDto, isArray: true })
  findUniversities(): readonly UniversityDto[] {
    return UNIVERSITIES;
  }

  @Get('departments')
  @CacheControl(REFERENCE_LIST_CACHE_CONTROL)
  @ApiOperation({
    summary: 'List every bachelor-level programme name the registration form offers.',
    description:
      'A plain typed array, Turkish-alphabetical, on the same bounded-set rule as the university ' +
      'list. Lisans only — önlisans programme names are out of scope (DEC 2026-08-20p md.4). No ' +
      'score, quota or university pairing is published; the source list carries none.',
  })
  @ApiOkResponse({ type: DepartmentDto, isArray: true })
  findDepartments(): readonly DepartmentDto[] {
    return DEPARTMENTS;
  }
}
