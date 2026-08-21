import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Province } from '../province/entities/province.entity';
import { DistrictDto } from './dto/district.dto';
import { District } from './entities/district.entity';

/**
 * Turkish alphabetical order, and it is applied HERE rather than in SQL.
 *
 * ## Why not `ORDER BY name_tr`
 * The database's own ordering is byte/locale order, which puts `Çilimli` after `Yığılca` — the
 * committed artefact is in exactly that order, and 57 of the 81 provinces read wrongly under it.
 * Turkish collation is the whole question for this list: `ç` follows `c`, `ı` precedes `i`, `ş`
 * follows `s`, and none of that is expressible without a Turkish collation.
 *
 * ## Why not `ORDER BY name_tr COLLATE "tr-TR-x-icu"`
 * That form is correct wherever it works, and whether it works is a property of how the Postgres
 * SERVER was built — ICU support is a compile-time option, and the hosting target for this platform
 * is undecided (`CONVENTIONS.md` §2/§7). An ordering that silently falls back to byte order on a
 * server built without ICU is worse than no ordering, because it looks right in the e2e image and
 * wrong in production. Node's ICU is ours and is pinned with the runtime, so the collator answers
 * the same everywhere this code runs.
 *
 * ## Cost
 * At most 39 rows per request (İstanbul), 973 in the whole table, on a response that carries a long
 * `Cache-Control`. This is not a sort that needs an index.
 *
 * ## Why the resolution is ASSERTED rather than assumed
 * The argument above rejects `COLLATE "tr-TR-x-icu"` because it can fall back silently on a server
 * built without ICU — and `Intl.Collator('tr')` has the same failure mode on a Node built without
 * full ICU, where it resolves to the root locale and returns a DIFFERENT published order with no
 * error anywhere. Rejecting one option for a hazard and then not checking for it in the option
 * taken is the gap this guard closes. It throws at module load, which is the same fail-fast posture
 * `ENGINEERING.md` §1 takes for a missing environment variable: an api that cannot collate Turkish
 * must not serve a wrong order for a day at the CDN plus a week of `stale-while-revalidate`.
 *
 * **This ordering is a PUBLISHED render order.** The web repo drops the array into a select in the
 * order it arrives; re-ordering it — or "tidying" it into an `ORDER BY id` — changes what a user
 * sees. It is pinned by a structural e2e assertion for exactly that reason.
 */
function requireTurkishCollator(): Intl.Collator {
  const collator = new Intl.Collator('tr');
  const { locale } = collator.resolvedOptions();

  if (locale !== 'tr' && !locale.startsWith('tr-')) {
    throw new Error(
      `this Node build cannot collate Turkish: new Intl.Collator('tr') resolved to "${locale}". ` +
        'It was built without full ICU, so the ilçe list would be published in root-locale order ' +
        '(ç, ğ, ı, ö, ş and ü all misplaced) with nothing anywhere to signal it. Use a Node build ' +
        'with full ICU, or set NODE_ICU_DATA.',
    );
  }

  return collator;
}

const TURKISH_COLLATOR = requireTurkishCollator();

/**
 * Reads the ilçe reference list.
 *
 * Public and read-only, like every other content service here: there is no write path, no admin
 * CRUD and no role on this leg at all. Rows arrive through `pnpm db:seed:reference`.
 */
@Injectable()
export class DistrictService {
  constructor(
    @InjectRepository(District)
    private readonly districtRepository: Repository<District>,
  ) {}

  /**
   * The ilçe of one il, in Turkish alphabetical order, addressed by the il's PLATE CODE.
   *
   * ## The lookup key and the storage key are deliberately different
   * `districts.province_id` is a uuid foreign key and stays one; the public contract takes
   * `plateCode` because that is the only province key this api publishes (→ `DEC 2026-08-21c`).
   * Translating between them is precisely a service's job, and doing it in ONE query keeps that
   * translation from costing a round trip: an inner join against `provinces` resolves the key and
   * filters in the same statement (the `book.service.ts` `leftJoin(BookVideoQuestion, …)`
   * precedent). It also keeps this module's `forFeature` at a single entity, which matters because
   * the plan's PR-2 hangs two repository-less constant lists off the same module.
   *
   * ## An unknown plate code returns an EMPTY ARRAY, not a 404
   * The inner join simply matches nothing, which is the right answer twice over: `plateCode` is a
   * filter rather than a resource id, and "this il has no ilçe row yet" and "this il does not
   * exist" are the same thing to a form that is trying to populate a select. A 404 would claim the
   * route does not exist. A MALFORMED code never reaches here — the global pipe answers 400 from
   * `DistrictListQueryDto`.
   *
   * `select` is explicit so the timestamps and the foreign key never leave the process. The SQL
   * `ORDER BY` is not the published order — the collator below is — but it is kept so the input to
   * the sort is deterministic: `Array.prototype.sort` is stable, so without it two names the
   * collator considers equal would come back in whatever order the planner chose.
   */
  async findByProvincePlateCode(plateCode: string): Promise<DistrictDto[]> {
    const rows = await this.districtRepository
      .createQueryBuilder('district')
      .innerJoin(Province, 'province', 'province.id = district.provinceId')
      .where('province.plateCode = :plateCode', { plateCode })
      .select(['district.id', 'district.nameTr'])
      .orderBy('district.nameTr', 'ASC')
      .getMany();

    return rows
      .sort((left, right) => TURKISH_COLLATOR.compare(left.nameTr, right.nameTr))
      .map((row) => ({ id: row.id, nameTr: row.nameTr }));
  }
}
