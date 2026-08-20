import type { DataSource, EntityManager } from 'typeorm';
import { Province } from '../../province/entities/province.entity';
import { District } from '../../reference/entities/district.entity';
import {
  DistrictsArtifactError,
  assertArtifactMatchesProvinces,
  readDistrictsArtifact,
  type DistrictsArtifact,
} from './district.artifact';

/**
 * `pnpm db:seed:reference` — the offline, deterministic, idempotent write phase for the reference
 * corpus (üyelik plan §3, PR-1).
 *
 * ## Two-phase discipline, and which phase this is
 * Playbook §5 splits external data into a hand-run `fetch`/`probe` that touches the network and an
 * offline `load` that reads only committed artefacts. This is a `load`, and the whole of it: the
 * collecting phase was NOVA's 2026-08-20 round against TÜİK's Coğrafi İstatistik Portalı, whose
 * output is the committed `data/reference/districts.tuik.json`. Nothing here opens a socket, so
 * this seed cannot fail because a provider is down.
 *
 * ## The corpus is "reference lists", and today it holds one
 * `ENGINEERING.md` §5 splits seeds per corpus with one script each. This is the fourth
 * (`db:seed:geography`, `db:seed:world`, `db:seed:books`), and it owns the lists the registration
 * form reads. Today that is the ilçe list alone; the plan's PR-2 lists (üniversite, bölüm) are
 * compile-time constants with no table, so they will not arrive here.
 *
 * ## All-or-nothing, and the gate that decides it
 * Every check runs BEFORE anything is written and the writes are one transaction, so a violation
 * anywhere means nothing is written at all rather than a half-seeded province. Two gates bracket
 * the writes:
 *   - **before**, {@link assertArtifactMatchesProvinces} joins the artefact to the province rows on
 *     BOTH the il's name and its published `district_count`;
 *   - **after**, {@link assertWrittenCountsMatchProvinces} re-counts what is actually in the table
 *     and compares it to the same column, inside the same transaction.
 * The second is not the first repeated. The first judges the INPUT; the second judges the RESULT,
 * which is what playbook §5's fidelity rule asks for ("a check on the WRITE path"), and it is the
 * only one that can see a row this seed did not write and does not know about.
 *
 * ## Idempotent PER ROW
 * A district already present under its province is left completely untouched — no `UPDATE`, so
 * `@UpdateDateColumn` does not move and a routine re-run is a genuine no-op.
 *
 * **There is deliberately no `updated` counter, because there is no update path.** `(province_id,
 * name_tr)` is the natural key AND the entire payload, so a row either matches or is a different
 * row. A counter that can never move is a gate that can never go red, and this file does not ship
 * one. The consequence is worth stating because it lands on somebody else: a RENAMED ilçe is a
 * removal plus an insert, so its `id` changes. Once the plan's PR-3 adds `users.district_id`
 * pointing here, a rename will either be refused by that foreign key or orphan the reference,
 * depending on how it is declared — that is a decision for the PR that adds the column, and it is
 * recorded here rather than discovered there.
 *
 * ## What this seed will DELETE, and only on request
 * A district row whose name the artefact no longer carries is REFUSED by name unless the operator
 * passes `--allow-removals`, and the whole transaction rolls back. Leaving such a row would publish
 * an ilçe that no longer exists AND break the count gate; deleting it silently would let a
 * truncated artefact quietly shrink the list. So it is an operator decision, never a number in a
 * log line (the `db:seed:books` precedent).
 */

export interface SeedReferenceResult {
  inserted: number;
  /** Rows already matching the artefact — left untouched, so `updated_at` did not move. */
  unchanged: number;
  removed: number;
  /** Provinces the artefact covered. */
  provinces: number;
  /** Districts the artefact declares (the table's row count after a successful run). */
  total: number;
}

export interface SeedReferenceOptions {
  /**
   * Defaults to reading and hash-checking the committed artefact.
   *
   * **What an injected artefact SKIPS**, stated so a fixture author knows what they own: the
   * SHA-256 pin and everything `parseDistrictsArtifact` runs (the shape, the coverage floor, the
   * plate-set completeness, the writing form). What it does NOT skip is either province gate — the
   * two that decide whether anything is written at all.
   */
  artifact?: DistrictsArtifact;
  /** Authorises this run to DELETE district rows the artefact no longer carries. Default `false`. */
  allowRemovals?: boolean;
}

/**
 * The post-write half of the count gate: what is IN the table, per province, against the
 * `district_count` the province pages publish.
 *
 * It runs inside the transaction, after the inserts and deletes, so it judges the state the run is
 * about to COMMIT rather than the input it started from — which is what `ENGINEERING.md` §5's
 * fidelity rule asks of a line that publishes values ("a check on the WRITE path").
 *
 * **What it can actually catch, stated honestly, because an earlier revision of this comment
 * overstated it.** A stray row present BEFORE the run is not the case: such a row is in `existing`
 * and not in `declared`, so it goes down the removal path and is either refused by name or deleted.
 * Follow that through and the table this gate re-counts holds exactly `declared`, which gate 1 has
 * already joined against `district_count` — so on a single, uncontended run gate 2 cannot fire, and
 * that is a property of gate 1 being CORRECT rather than of gate 2 being decoration. What is left
 * for it: a row committed by a concurrent writer between the two gates (this transaction is READ
 * COMMITTED, so gate 1 never saw it and gate 2 does), and any future edit that makes the write loop
 * disagree with the set gate 1 approved. It has no red-side test for the same reason: reaching it
 * means constructing a state the code path forbids. That is recorded rather than fixed — removing
 * the gate would trade a cheap re-count for the claim that gate 1's reasoning can never be wrong.
 */
async function assertWrittenCountsMatchProvinces(
  manager: EntityManager,
  provinces: readonly Province[],
): Promise<void> {
  const rows: { province_id: string; count: string }[] = await manager
    .createQueryBuilder(District, 'district')
    .select('district.province_id', 'province_id')
    .addSelect('COUNT(*)', 'count')
    .groupBy('district.province_id')
    .getRawMany();

  const written = new Map(rows.map((row) => [row.province_id, Number(row.count)]));
  const problems: string[] = [];

  for (const province of provinces) {
    const actual = written.get(province.id) ?? 0;
    if (actual !== province.districtCount) {
      problems.push(
        `${province.plateCode} ${province.nameTr} — ${String(actual)} row(s) in districts, ` +
          `provinces.district_count says ${String(province.districtCount)}`,
      );
    }
  }

  if (problems.length > 0) {
    throw new DistrictsArtifactError(
      'the ilçe rows this run would commit do not agree with provinces.district_count, so nothing ' +
        `was written:\n  ${problems.join('\n  ')}`,
    );
  }
}

/** Thrown instead of deleting, when the operator has not authorised removals. */
function refuseRemovals(removals: readonly { plateCode: string; nameTr: string }[]): never {
  const listed = removals
    .map((removal) => `${removal.plateCode} ${JSON.stringify(removal.nameTr)}`)
    .join('\n  ');

  throw new DistrictsArtifactError(
    `${String(removals.length)} district row(s) are in the database but not in the committed ` +
      'artefact. Deleting a published ilçe is an operator decision, so nothing was written. ' +
      'Re-run with --allow-removals if the artefact is genuinely the newer list:\n  ' +
      listed,
  );
}

export async function seedReference(
  dataSource: DataSource,
  options: SeedReferenceOptions = {},
): Promise<SeedReferenceResult> {
  const artifact = options.artifact ?? (await readDistrictsArtifact());
  const allowRemovals = options.allowRemovals ?? false;

  let inserted = 0;
  let unchanged = 0;
  let removed = 0;

  await dataSource.transaction(async (manager) => {
    const provinces = await manager.getRepository(Province).find();

    // Gate 1 — the INPUT. Refuses a mis-mapped plate↔il assignment and any disagreement with the
    // already-published `district_count`, before a single row is touched.
    assertArtifactMatchesProvinces(artifact, provinces);

    const districtRepo = manager.getRepository(District);
    const existing = await districtRepo.find();

    const provinceIdByPlate = new Map(
      provinces.map((province) => [province.plateCode, province.id]),
    );
    const plateByProvinceId = new Map(
      provinces.map((province) => [province.id, province.plateCode]),
    );

    const existingByProvince = new Map<string, Map<string, District>>();
    for (const row of existing) {
      const byName = existingByProvince.get(row.provinceId) ?? new Map<string, District>();
      byName.set(row.nameTr, row);
      existingByProvince.set(row.provinceId, byName);
    }

    const toInsert: District[] = [];
    const declared = new Set<string>();

    for (const province of artifact.provinces) {
      // Non-null by gate 1: every artefact plate has a province row, or it threw above.
      const provinceId = provinceIdByPlate.get(province.plateCode);
      if (provinceId === undefined) {
        throw new DistrictsArtifactError(
          `plate ${province.plateCode} has no province row — gate 1 should have refused this run.`,
        );
      }

      const byName = existingByProvince.get(provinceId);

      for (const nameTr of province.districtNamesTr) {
        declared.add(`${provinceId}|${nameTr}`);

        if (byName?.has(nameTr) === true) {
          unchanged += 1;
          continue;
        }

        toInsert.push(districtRepo.create({ provinceId, nameTr }));
      }
    }

    const removals = existing.filter((row) => !declared.has(`${row.provinceId}|${row.nameTr}`));
    if (removals.length > 0) {
      if (!allowRemovals) {
        refuseRemovals(
          removals.map((row) => ({
            plateCode: plateByProvinceId.get(row.provinceId) ?? row.provinceId,
            nameTr: row.nameTr,
          })),
        );
      }

      await districtRepo.delete(removals.map((row) => row.id));
      removed = removals.length;
    }

    if (toInsert.length > 0) {
      await districtRepo.save(toInsert);
      inserted = toInsert.length;
    }

    // Gate 2 — the RESULT. See the function's own note for why this is not gate 1 repeated.
    await assertWrittenCountsMatchProvinces(manager, provinces);
  });

  return {
    inserted,
    unchanged,
    removed,
    provinces: artifact.provinces.length,
    total: artifact.districtCount,
  };
}
