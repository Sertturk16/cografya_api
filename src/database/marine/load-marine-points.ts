import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';
import { MarinePoint } from '../../marine/entities/marine-point.entity';
import { Province } from '../../province/entities/province.entity';
import type { MarinePointsProbeArtifact } from './marine-artifact.types';
import { assertArtifactIsLoadable, MarineImportError } from './marine-assertions';

/**
 * `--phase=load` — reads the COMMITTED artifact and upserts the points. No network, ever.
 *
 * The only phase CI or a deployment runs, and it is offline and deterministic by construction:
 * Copernicus being down can never fail a build.
 *
 * ## Idempotency is a correctness property here, not a nicety
 * A point whose stored row already equals the artifact is left completely untouched, so
 * `marine_points.updated_at` does not move. Writes go through the TypeORM repository precisely
 * so `@UpdateDateColumn` moves exactly when a value genuinely changed — raw SQL would have
 * required setting it by hand, which is the kind of thing that silently gets forgotten.
 */

export interface LoadPhaseOptions {
  /** Directory holding `marine-points-probe.json`. */
  inputDir: string;
}

export interface LoadPhaseResult {
  inserted: number;
  updated: number;
  unchanged: number;
  /** Rows that were in the table but are absent from the artifact, and were therefore deleted. */
  removed: number;
}

async function readArtifact(path: string): Promise<MarinePointsProbeArtifact> {
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch (error: unknown) {
    throw new MarineImportError(`cannot read ${path}`, { cause: error });
  }
  try {
    return JSON.parse(contents) as MarinePointsProbeArtifact;
  } catch (error: unknown) {
    // Wrapped for the same reason the read is: a bare `SyntaxError` does not say which file.
    throw new MarineImportError(`${path} is not valid JSON`, { cause: error });
  }
}

/** The fields a stored row and an artifact entry must agree on for the row to be "unchanged". */
function isUnchanged(
  row: MarinePoint,
  entry: MarinePointsProbeArtifact['entries'][number],
): boolean {
  return (
    row.slugTr === entry.slugTr &&
    row.slugEn === entry.slugEn &&
    row.nameTr === entry.nameTr &&
    row.nameEn === entry.nameEn &&
    row.coastLabelTr === entry.coastLabelTr &&
    row.coastLabelEn === entry.coastLabelEn &&
    row.provincePlateCode === entry.plateCode &&
    row.seaBasin === entry.seaBasin &&
    row.latitude === entry.latitude &&
    row.longitude === entry.longitude &&
    row.displayOrder === entry.displayOrder
  );
}

/**
 * Load the probe artifact into `marine_points`.
 *
 * ## Validation happens on the WRITE path, not only at probe time
 * The artifact is what actually reaches the database, and it is a hand-editable file between
 * the two phases. `assertArtifactIsLoadable` therefore re-derives every verdict from the
 * artifact's own recorded provider evidence and refuses any disagreement with the recorded
 * one — a claim inside the file cannot validate the file.
 *
 * ## The MAPPING leg (DEC 2026-07-19), which is why this is not a plain upsert
 * The failure this import can produce is not a crash. It is a point bound to the wrong province
 * or the wrong sea, publishing a plausible number with every test green. So the plate code is
 * checked against the seeded `provinces` row BY NAME: the artifact carries the province name
 * the candidate was written for, and a one-digit plate typo then fails naming both provinces
 * instead of quietly attaching Sinop's sea to Samsun.
 */
export async function loadMarinePoints(
  dataSource: DataSource,
  options: LoadPhaseOptions,
): Promise<LoadPhaseResult> {
  const artifact = await readArtifact(join(options.inputDir, 'marine-points-probe.json'));

  assertArtifactIsLoadable(artifact);

  // ── MAPPING: every plate code must exist AND name the province the candidate meant ──
  const provinces = await dataSource
    .getRepository(Province)
    .find({ select: { plateCode: true, nameTr: true } });
  const provinceNameByCode = new Map(provinces.map((p) => [p.plateCode, p.nameTr]));

  const mappingErrors: string[] = [];
  for (const entry of artifact.entries) {
    const seededName = provinceNameByCode.get(entry.plateCode);
    if (seededName === undefined) {
      mappingErrors.push(
        `${entry.slugTr}: plate code ${entry.plateCode} is not in the database. Run ` +
          `\`pnpm db:seed:geography\` first — a marine point without its province is a silent orphan.`,
      );
      continue;
    }
    if (seededName !== entry.provinceNameTr) {
      mappingErrors.push(
        `${entry.slugTr}: plate code ${entry.plateCode} is "${seededName}" in the database, but ` +
          `the artifact was written for "${entry.provinceNameTr}". Resolve the mismatch — do not ` +
          `seed a point onto a province it was not verified for.`,
      );
    }
  }
  if (mappingErrors.length > 0) {
    throw new MarineImportError(`province mapping failed:\n  ${mappingErrors.join('\n  ')}`);
  }

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let removed = 0;

  await dataSource.transaction(async (manager) => {
    const repo = manager.getRepository(MarinePoint);
    const existing = await repo.find();
    const existingBySlug = new Map(existing.map((row) => [row.slugTr, row]));
    const artifactSlugs = new Set(artifact.entries.map((entry) => entry.slugTr));

    // Removals happen FIRST, inside the same transaction. A point dropped from the candidate
    // list must not linger: it would keep appearing on the hub, and — worse — it would keep
    // occupying its `(province, basin)` unique slot, so the replacement point for that province
    // could not be inserted. The whole thing is one transaction, so a failure part-way leaves
    // the table exactly as it was.
    for (const row of existing) {
      if (!artifactSlugs.has(row.slugTr)) {
        await repo.remove(row);
        removed += 1;
      }
    }

    for (const entry of artifact.entries) {
      const row = existingBySlug.get(entry.slugTr);

      if (row === undefined) {
        await repo.save(
          repo.create({
            slugTr: entry.slugTr,
            slugEn: entry.slugEn,
            nameTr: entry.nameTr,
            nameEn: entry.nameEn,
            coastLabelTr: entry.coastLabelTr,
            coastLabelEn: entry.coastLabelEn,
            provincePlateCode: entry.plateCode,
            seaBasin: entry.seaBasin,
            latitude: entry.latitude,
            longitude: entry.longitude,
            displayOrder: entry.displayOrder,
          }),
        );
        inserted += 1;
        continue;
      }

      if (isUnchanged(row, entry)) {
        unchanged += 1;
        continue;
      }

      row.slugEn = entry.slugEn;
      row.nameTr = entry.nameTr;
      row.nameEn = entry.nameEn;
      row.coastLabelTr = entry.coastLabelTr;
      row.coastLabelEn = entry.coastLabelEn;
      row.provincePlateCode = entry.plateCode;
      row.seaBasin = entry.seaBasin;
      row.latitude = entry.latitude;
      row.longitude = entry.longitude;
      row.displayOrder = entry.displayOrder;
      await repo.save(row);
      updated += 1;
    }
  });

  return { inserted, updated, unchanged, removed };
}
