import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
 * **This ordering is a PUBLISHED render order.** The web repo drops the array into a select in the
 * order it arrives; re-ordering it — or "tidying" it into an `ORDER BY id` — changes what a user
 * sees. It is pinned by a structural e2e assertion for exactly that reason.
 */
const TURKISH_COLLATOR = new Intl.Collator('tr');

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
   * The ilçe of one il, in Turkish alphabetical order.
   *
   * An il with no rows — or a well-formed uuid matching no il at all — returns an EMPTY ARRAY, not
   * a 404: `provinceId` is a filter, and "no ilçe matched" is a legitimate answer to a filter. A
   * 404 would claim the route does not exist.
   *
   * `select` is explicit so the timestamps and the foreign key never leave the process. The SQL
   * `ORDER BY` is not the published order — the collator below is — but it is kept so the input to
   * the sort is deterministic: `Array.prototype.sort` is stable, so without it two names the
   * collator considers equal would come back in whatever order the planner chose.
   */
  async findByProvince(provinceId: string): Promise<DistrictDto[]> {
    const rows = await this.districtRepository.find({
      where: { provinceId },
      select: { id: true, nameTr: true },
      order: { nameTr: 'ASC' },
    });

    return rows
      .sort((left, right) => TURKISH_COLLATOR.compare(left.nameTr, right.nameTr))
      .map((row) => ({ id: row.id, nameTr: row.nameTr }));
  }
}
