import {
  CLIMATE_MONTH_COUNT,
  CLIMATE_SOURCE_MGM_GENERAL,
  type ClimateExtremeRecord,
  type ClimateMonthlyNormal,
  type ClimateNormals,
  type ClimateRecords,
} from '../../province/province.types';
import type { ClimateManifestArtifact, ClimateNormalsArtifact } from './climate-artifact.types';
import {
  EMPTY_CELL_VALUES,
  METRIC_ROW_LABELS,
  NON_NEGATIVE_MONTHLY_FIELDS,
  RECORD_COLUMNS,
  formatLikeRawKaNumber,
  formatLikeRawRecordDate,
  isAbsentRecordValueCell,
  tryParseKaNumber,
  type MetricField,
  type MgmRawMetricRow,
  type MgmRawRecordCell,
  type MgmValueAnomaly,
} from './mgm-parser';

/**
 * Import-time assertions. Every one of these ABORTS the run — none of them warn.
 *
 * The pattern is `assertKoppenCaveatInvariant`'s (`seed-geography.ts`): a data rule that
 * cannot be expressed as a DB constraint is expressed as a loud check that stops the import
 * rather than letting broken data reach a published page. The `jsonb`-on-`provinces` shape
 * traded away `CHECK (month BETWEEN 1 AND 12)` and a unique key; this file is where that
 * debt is repaid.
 */

export class ClimateImportError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`[climate-import] ${message}`, options);
    this.name = 'ClimateImportError';
  }
}

/**
 * The cell contents MGM uses to mean "nothing here".
 *
 * The definition lives in ONE place — `EMPTY_CELL_VALUES` in `mgm-parser`, the same set
 * `parseKaNumber` consults when it decides to return `null`. This function is only the
 * trim-then-look-up wrapper. It used to be a second, independent copy of the list while its
 * own comment claimed the opposite; the copy is what would have let the two drift, so that a
 * cell the parser called blank could read as non-blank here (or worse, the reverse — which
 * turns "a reading was dropped" into a passing check).
 */
function isBlankSourceCell(raw: string): boolean {
  return EMPTY_CELL_VALUES.has(raw.trim());
}

/**
 * The monthly extreme-temperature rows carry an occurrence date in each cell's `title`.
 * Those dates round-trip exactly like the values do.
 *
 * The asymmetry is deliberate and is the rule the owner set: **a missing date must never
 * cost us the reading** (MGM simply may not have printed one), but a date that MGM DID print
 * and we dropped is a silent loss, and a stored date that does not re-print to the source
 * string is a corruption. Both throw.
 */
function assertMonthlyDatesRoundTrip(
  plateCode: string,
  normals: ClimateNormals,
  row: MgmRawMetricRow,
): void {
  const dateField = MONTHLY_DATE_FIELD_BY_LABEL[row.label];
  if (dateField === undefined) return; // averages carry no occurrence date

  if (row.rawMonthlyTitles.length !== CLIMATE_MONTH_COUNT) {
    throw new ClimateImportError(
      `${plateCode}: raw row "${row.label}" holds ${row.rawMonthlyTitles.length} title cells, ` +
        `expected ${CLIMATE_MONTH_COUNT}.`,
    );
  }

  for (let month = 1; month <= CLIMATE_MONTH_COUNT; month += 1) {
    const rawTitle = (row.rawMonthlyTitles[month - 1] ?? '').trim();
    const stored = normals.months[month - 1]?.[dateField] ?? null;

    if (stored === null) {
      if (!isBlankSourceCell(rawTitle)) {
        throw new ClimateImportError(
          `${plateCode}: "${row.label}" month ${month} has a null occurrence date but the ` +
            `source cell carries ${JSON.stringify(rawTitle)} — a date was dropped.`,
        );
      }
      continue;
    }

    if (formatLikeRawRecordDate(stored) !== rawTitle) {
      throw new ClimateImportError(
        `${plateCode}: "${row.label}" month ${month} occurrence date ${JSON.stringify(stored)} ` +
          `does not re-print as the source's ${JSON.stringify(rawTitle)}.`,
      );
    }
  }
}

/** Which stored date field (if any) an extreme-temperature row's `title` attributes feed. */
const MONTHLY_DATE_FIELD_BY_LABEL: Partial<
  Record<MgmRawMetricRow['label'], 'tempRecordMaxDate' | 'tempRecordMinDate'>
> = {
  'En Yüksek Sıcaklık (°C)': 'tempRecordMaxDate',
  'En Düşük Sıcaklık (°C)': 'tempRecordMinDate',
};

/* ------------------------------------------------------------------ *
 * 1. The decimal round-trip — the ONLY defence that catches trap T3
 * ------------------------------------------------------------------ */

/**
 * Close the round-trip's OTHER direction: every stored value must HAVE a raw row to be
 * checked against.
 *
 * `assertDecimalRoundTrip` iterates the raw rows and looks up the stored value for each. That
 * only proves "every raw row is faithfully represented" — a stored value whose metric has no
 * manifest row is never re-printed, never compared, and passes. Given this module's own threat
 * model (the artifact is hand-editable between the two phases, and `load` is the phase that
 * actually writes), an unchecked value is exactly the seam the design exists to close: adding
 * a `sunshineHours` series and deleting its raw row would otherwise publish unverified numbers.
 */
function assertRawRowsCoverStoredValues(
  plateCode: string,
  normals: ClimateNormals,
  rawMetricRows: readonly MgmRawMetricRow[],
  rawRecordCells: readonly MgmRawRecordCell[],
): void {
  const coveredFields = new Set<MetricField>(
    rawMetricRows.map((row) => METRIC_ROW_LABELS[row.label]),
  );

  const uncovered = new Set<MetricField>();
  for (const month of normals.months) {
    for (const field of Object.values(METRIC_ROW_LABELS)) {
      if (month[field] !== null && !coveredFields.has(field)) uncovered.add(field);
    }
  }
  if (uncovered.size > 0) {
    throw new ClimateImportError(
      `${plateCode}: field(s) ${[...uncovered].join(', ')} carry values but the manifest holds ` +
        `no raw source row for them — those numbers would be written unverified.`,
    );
  }

  // The three record columns are a fixed set, so their coverage is absolute, not conditional:
  // a missing raw cell means the whole column escapes the check.
  const coveredRecordFields = new Set(rawRecordCells.map((cell) => cell.field));
  const missingRecordFields = RECORD_COLUMNS.filter(
    (column) => !coveredRecordFields.has(column.field),
  );
  if (missingRecordFields.length > 0) {
    throw new ClimateImportError(
      `${plateCode}: the manifest holds no raw cell for record column(s) ` +
        `${missingRecordFields.map((column) => column.field).join(', ')} — expected all ` +
        `${RECORD_COLUMNS.length}.`,
    );
  }
}

/* ------------------------------------------------------------------ *
 * 1a. Anomaly declarations are VERIFIED, never trusted
 * ------------------------------------------------------------------ */

/**
 * Prove that every declared anomaly names a raw cell that really does hold an impossible value.
 *
 * **Why this exists.** An anomaly switches OFF the decimal round-trip for the cell it names —
 * the strongest check in this module, and the only one that can see a dropped reading. If
 * membership in the list were enough, the list would be an unverified allowlist over
 * artifact-controlled JSON: appending one line to `climate-manifest.json` and nulling the
 * matching value in `climate-normals.json` would make a genuine MGM reading vanish into
 * Postgres and onto a public page, indistinguishable from a real source gap. `tempMinMeanC`
 * and `tempMaxMeanC` were fully exposed to exactly that (the ordering invariant short-circuits
 * on `null`, so nothing else would have objected), and the core pair was protected only
 * incidentally, by an unrelated rule.
 *
 * So the declaration is treated as a CLAIM about the source, and the source is right there in
 * the manifest. A claim is honoured only when all of these hold:
 *   1. the named field is one this parser is capable of refusing (the two allowlists — an
 *      anomaly cannot be declared on a temperature mean, where negatives are ordinary);
 *   2. the manifest carries a raw cell for it;
 *   3. that raw cell re-derives, through the SAME `k=A` grammar the parser uses, to a value
 *      that is actually impossible.
 * Anything else throws. The failure is deliberately loud and specific: a false declaration is
 * either tampering or a genuine bug in the fetch phase, and both need a human.
 */
function assertAnomalyDeclarationsAreReal(
  plateCode: string,
  normals: ClimateNormals,
  rawMetricRows: readonly MgmRawMetricRow[],
  rawRecordCells: readonly MgmRawRecordCell[],
  anomalies: readonly MgmValueAnomaly[],
): void {
  for (const anomaly of anomalies) {
    // Half one: the source really did publish something impossible. Shared with the
    // unpublishable-declaration check, so both consume the SAME evidence by the same rule.
    assertAnomalyMatchesSource(plateCode, anomaly, rawMetricRows, rawRecordCells);

    // Half two: and we really did refuse it. Only meaningful where a series exists to inspect —
    // a declaration standing over a PUBLISHED value would exempt a live number from the
    // round-trip, which is the T3 trap re-opened.
    const declared = describeAnomaly(anomaly);
    if (anomaly.month !== null) {
      const stored = normals.months[anomaly.month - 1]?.[anomaly.field as MetricField] ?? null;
      if (stored !== null) {
        throw new ClimateImportError(
          `${plateCode}: ${declared} but the value ${JSON.stringify(stored)} IS published — an ` +
            `anomaly exempts a cell from the round-trip, so it must correspond to a null.`,
        );
      }
      continue;
    }
    if (normals.records[anomaly.field as keyof typeof normals.records] !== null) {
      throw new ClimateImportError(
        `${plateCode}: ${declared} but the record IS published — an anomaly exempts a cell from ` +
          `the round-trip, so it must correspond to a null.`,
      );
    }
  }
}

function describeAnomaly(anomaly: MgmValueAnomaly): string {
  return `declared anomaly ${JSON.stringify(anomaly.field)}${
    anomaly.month === null ? '' : ` month ${String(anomaly.month)}`
  }`;
}

/**
 * The EVIDENCE half of an anomaly check: does the raw cell this declaration names really hold a
 * physically impossible value?
 *
 * Split out from `assertAnomalyDeclarationsAreReal` because it is the half that does not need a
 * published series to check against — which is exactly the situation of a province that was
 * WITHHELD. Sharing it is the point: an unpublishable declaration and an anomaly declaration are
 * now grounded in the same raw cells by the same rule, so the two cannot drift into disagreeing
 * about what "impossible" means.
 */
function assertAnomalyMatchesSource(
  plateCode: string,
  anomaly: MgmValueAnomaly,
  rawMetricRows: readonly MgmRawMetricRow[],
  rawRecordCells: readonly MgmRawRecordCell[],
): void {
  const declared = describeAnomaly(anomaly);

  if (anomaly.month !== null) {
    const nonNegativeMonthlyFields = new Set<string>(
      NON_NEGATIVE_MONTHLY_FIELDS.map((entry) => entry.field),
    );
    if (!Number.isInteger(anomaly.month) || anomaly.month < 1 || anomaly.month > 12) {
      throw new ClimateImportError(
        `${plateCode}: ${declared} names month ${String(anomaly.month)}, which is not 1-12.`,
      );
    }
    if (!nonNegativeMonthlyFields.has(anomaly.field)) {
      throw new ClimateImportError(
        `${plateCode}: ${declared} names a field that has no impossible-value rule. Only ` +
          `${[...nonNegativeMonthlyFields].join(', ')} can be refused for being negative — a ` +
          `negative temperature is an ordinary January, not an anomaly.`,
      );
    }

    const rawRowByField = new Map<MetricField, MgmRawMetricRow>(
      rawMetricRows.map((row) => [METRIC_ROW_LABELS[row.label], row]),
    );
    const row = rawRowByField.get(anomaly.field as MetricField);
    if (row === undefined) {
      throw new ClimateImportError(
        `${plateCode}: ${declared} but the manifest holds no raw source row for it — the ` +
          `declaration cannot be checked against anything, so it is refused.`,
      );
    }
    const raw = (row.rawMonthlyCells[anomaly.month - 1] ?? '').trim();
    const rederived = tryParseKaNumber(raw);
    if (rederived === null || rederived >= 0) {
      throw new ClimateImportError(
        `${plateCode}: ${declared}, but its source cell reads ${JSON.stringify(raw)}, which is ` +
          `not an impossible value. An anomaly disables the strongest fidelity check for that ` +
          `cell; it is honoured only when the source really did publish something impossible.`,
      );
    }
    return;
  }

  const column = RECORD_COLUMNS.find((candidate) => candidate.field === anomaly.field);
  if (column === undefined || !column.nonNegative) {
    throw new ClimateImportError(
      `${plateCode}: ${declared} names no record column that has an impossible-value rule.`,
    );
  }
  const cell = rawRecordCells.find((candidate) => candidate.field === anomaly.field);
  if (cell === undefined) {
    throw new ClimateImportError(
      `${plateCode}: ${declared} but the manifest holds no raw source cell for it — the ` +
        `declaration cannot be checked against anything, so it is refused.`,
    );
  }
  // `"-1 cm"` → `"-1"`. A cell with no unit separator cannot be a real reading, so it also
  // cannot justify an anomaly.
  const rawValue = cell.rawValue.trim();
  const separatorIndex = rawValue.lastIndexOf(' ');
  const rederived =
    separatorIndex === -1 ? null : tryParseKaNumber(rawValue.slice(0, separatorIndex));
  if (rederived === null || rederived >= 0) {
    throw new ClimateImportError(
      `${plateCode}: ${declared}, but its source cell reads ${JSON.stringify(rawValue)}, which ` +
        `is not an impossible value. An anomaly disables the strongest fidelity check for that ` +
        `cell; it is honoured only when the source really did publish something impossible.`,
    );
  }
}

/**
 * The two measures a province MUST carry in all 12 months to be published at all (PLAN §1).
 *
 * Lives here, next to `findUnpublishableReason` which enforces the rule, and is consumed by BOTH
 * phases — the fetch phase's withhold branch and the load phase's verification of that branch.
 * A second copy in `mgm-fetch` would let the writing phase and the deciding phase disagree about
 * what "core" means, which is the drift this module refuses everywhere else.
 */
export const CORE_PAIR_FIELDS: ReadonlySet<string> = new Set(['tempMeanC', 'precipitationMm']);

/**
 * Prove that every WITHHELD province was withheld for a reason the source can corroborate.
 *
 * **This is the same defect as the anomaly allowlist, one layer up, and it was introduced by the
 * fix for that one.** `unpublishable[]` suppresses the load phase's province-coverage check —
 * the backstop against a silently dropped province. Validated only structurally (is it an array,
 * is it not also published, does it have a manifest entry), membership was again enough: append
 * one line, delete the province from `climate-normals.json`, and a genuinely dropped province
 * passes coverage AND has its stored series actively cleared.
 *
 * The "anomaly-induced only" rule existed, but ONLY in `mgm-fetch` — the phase that does not
 * write. This module's own threat model is that the artifact is hand-editable between the two
 * phases and `load` is the phase that actually writes, so the rule had to come down to the
 * writing phase.
 *
 * **No new declaration is introduced by this fix** — deliberately, because the recurring shape of
 * these defects is "a check is disabled by a list, and the list becomes the attack surface". This
 * consumes the `anomalies` list, which is itself verified against raw cells rather than trusted:
 *
 *   unpublishable[] → a core-pair anomaly for the same province → its raw manifest cell.
 *
 * **Where that chain actually ends — stated precisely, because an overclaim here is worse than a
 * gap.** It ends at `manifest.rawMetricRows` / `rawRecordCells`, which are **inside the artifact**
 * and therefore hand-editable under this module's own threat model. It does NOT reach MGM's served
 * bytes. Forging a withheld province still requires three coordinated edits (delete the series,
 * add the anomaly, rewrite the raw cell to something negative) instead of one, and every
 * inconsistent subset is refused — but a consistent forgery of all three is not currently caught.
 *
 * **The last link is open, and knowingly so.** `pageSha256` is written by the fetch phase and
 * never checked on the load path, and the 81 committed fragments are never read by
 * `load-climate.ts`. Closing it means having `load` read the fragments and verify the raw cells
 * against them — real work with its own test surface, tracked as a follow-up rather than bolted on
 * here. Until then: the raw cells are the *best available* evidence on the write path, not
 * independent evidence. Do not describe them as the latter.
 */
function assertUnpublishableDeclarationsAreReal(manifest: ClimateManifestArtifact): void {
  const manifestByCode = new Map(manifest.entries.map((entry) => [entry.plateCode, entry]));

  for (const province of manifest.unpublishable ?? []) {
    const entry = manifestByCode.get(province.plateCode);
    if (entry === undefined) {
      // Already reported by the caller's provenance check; guarded so this cannot throw a bare
      // TypeError if the order of checks is ever rearranged.
      continue;
    }

    // A province is withheld ONLY because refusing an impossible CORE value emptied its
    // all-or-nothing pair. Any other cause is a page-shape change that must abort the run, not a
    // gap to be declared away — so a declaration with no core-pair anomaly behind it is refused.
    const supporting = manifest.anomalies.filter(
      (anomaly) => anomaly.plateCode === province.plateCode && CORE_PAIR_FIELDS.has(anomaly.field),
    );
    if (supporting.length === 0) {
      throw new ClimateImportError(
        `${province.plateCode}: declared unpublishable (${JSON.stringify(province.reason)}) but no ` +
          `anomaly on a core field (${[...CORE_PAIR_FIELDS].join(', ')}) is recorded for it. A ` +
          `province may be withheld only because an impossible CORE value was refused; the ` +
          `declaration is evidence-free and is refused, because it would otherwise suppress the ` +
          `coverage check that exists to catch a silently dropped province.`,
      );
    }

    // …and that supporting anomaly is itself checked against the raw source cell, by the same
    // rule and the same `k=A` grammar every other declaration is checked by.
    for (const anomaly of supporting) {
      assertAnomalyMatchesSource(
        province.plateCode,
        anomaly,
        entry.rawMetricRows,
        entry.rawRecordCells,
      );
    }
  }
}

/**
 * Re-print every parsed number in MGM's own notation and require it to match the raw source
 * cell byte-for-byte.
 *
 * **This is the assertion that matters most.** `parseFloat('10,4')` yields `10` — silently.
 * Range invariants CANNOT catch it: `10` still satisfies `min ≤ mean ≤ max`, still plots on
 * the chart, still reads plausibly. The only thing that catches a truncation is comparing
 * the number we kept against the string MGM actually printed. So the manifest keeps the raw
 * cell, and the load phase — the phase that writes to the database — re-derives `"10,4"`
 * from `10.4` and refuses to proceed if it gets `"10"`.
 *
 * It runs at BOTH phases on purpose: at fetch, to fail the run before a bad artifact is ever
 * committed; at load, because the artifact is what actually reaches the database and the
 * check must sit on the write path, not only on the path that produced the file.
 */
export function assertDecimalRoundTrip(
  plateCode: string,
  normals: ClimateNormals,
  rawMetricRows: readonly MgmRawMetricRow[],
  rawRecordCells: readonly MgmRawRecordCell[],
  /**
   * Values the parser nulled because they are physically impossible. Without this the check
   * cannot tell "we refused to publish an impossible reading" from "we lost a reading", and it
   * must keep failing loudly on the second. Defaults to none, so the strict behaviour is what
   * you get unless an anomaly is explicitly declared.
   *
   * **Every entry is VERIFIED against the raw cell it names before it exempts anything** — see
   * `assertAnomalyDeclarationsAreReal`. A declaration is a claim about the source, not a
   * permission slip.
   */
  anomalies: readonly MgmValueAnomaly[] = [],
): void {
  assertAnomalyDeclarationsAreReal(plateCode, normals, rawMetricRows, rawRecordCells, anomalies);

  const anomalousMonthlyCells = new Set(
    anomalies.filter((a) => a.month !== null).map((a) => `${a.field}:${String(a.month)}`),
  );
  const anomalousRecordFields = new Set(
    anomalies.filter((a) => a.month === null).map((a) => a.field),
  );

  assertRawRowsCoverStoredValues(plateCode, normals, rawMetricRows, rawRecordCells);

  for (const row of rawMetricRows) {
    const field = METRIC_ROW_LABELS[row.label];
    if (row.rawMonthlyCells.length !== CLIMATE_MONTH_COUNT) {
      throw new ClimateImportError(
        `${plateCode}: raw row "${row.label}" holds ${row.rawMonthlyCells.length} cells, ` +
          `expected ${CLIMATE_MONTH_COUNT}.`,
      );
    }

    for (let month = 1; month <= CLIMATE_MONTH_COUNT; month += 1) {
      const raw = (row.rawMonthlyCells[month - 1] ?? '').trim();
      const value = normals.months[month - 1]?.[field] ?? null;

      if (value === null) {
        // A null must correspond to a genuinely blank source cell — OR to a declared anomaly,
        // where MGM printed something impossible and we refused it on purpose. A null standing
        // where MGM printed a usable number would mean we dropped a reading.
        if (anomalousMonthlyCells.has(`${field}:${String(month)}`)) continue;
        if (!isBlankSourceCell(raw)) {
          throw new ClimateImportError(
            `${plateCode}: "${row.label}" month ${month} is null but the source cell reads ` +
              `${JSON.stringify(raw)} — a reading was dropped.`,
          );
        }
        continue;
      }

      const reprinted = formatLikeRawKaNumber(value, raw);
      // `-0,0` and `0,0` denote the same value; `parseKaNumber` normalizes -0 to 0 because
      // JSON has no -0, so the sign is stripped from the comparison for zero ONLY. This
      // cannot mask a truncation: truncation changes digits, never just a sign.
      const expected = value === 0 ? raw.replace(/^-/, '') : raw;
      if (reprinted !== expected) {
        throw new ClimateImportError(
          `${plateCode}: DECIMAL ROUND-TRIP FAILED for "${row.label}" month ${month} — ` +
            `stored ${value} re-prints as ${JSON.stringify(reprinted)} but MGM printed ` +
            `${JSON.stringify(raw)}. This is the silent-truncation trap (e.g. "10,4" read as 10); ` +
            `the value must not be published.`,
        );
      }
    }

    assertMonthlyDatesRoundTrip(plateCode, normals, row);
  }

  for (const cell of rawRecordCells) {
    const column = RECORD_COLUMNS.find((candidate) => candidate.field === cell.field);
    if (!column) {
      throw new ClimateImportError(
        `${plateCode}: unknown record field ${JSON.stringify(cell.field)}.`,
      );
    }
    const record = normals.records[cell.field];
    const rawValue = cell.rawValue.trim();

    if (record === null) {
      // A record may legitimately be null two ways: the station has no such record, or the one
      // MGM published was impossible and we refused it.
      if (anomalousRecordFields.has(cell.field)) continue;
      // NOT `isBlankSourceCell`: a records cell has a second way of being empty that a monthly
      // cell does not — MGM prints the bare unit (` cm`) when the station has no such record.
      // The predicate is imported from the parser rather than restated here, so the "was this
      // null legitimate?" test cannot drift from the rule that produced the null.
      if (!isAbsentRecordValueCell(rawValue, column.unit)) {
        throw new ClimateImportError(
          `${plateCode}: record "${column.header}" is null but the source cell reads ` +
            `${JSON.stringify(rawValue)} — a record was dropped.`,
        );
      }
      continue;
    }

    const numberPart = rawValue.slice(0, rawValue.lastIndexOf(' '));
    const reprinted = `${formatLikeRawKaNumber(record.value, numberPart)} ${column.unit}`;
    if (reprinted !== rawValue) {
      throw new ClimateImportError(
        `${plateCode}: DECIMAL ROUND-TRIP FAILED for record "${column.header}" — stored ` +
          `${record.value} re-prints as ${JSON.stringify(reprinted)} but MGM printed ` +
          `${JSON.stringify(rawValue)}.`,
      );
    }

    // Dates round-trip too: `1968-12-26` must re-print as MGM's `26.12.1968`. A null date is
    // legitimate ONLY when the source printed none — otherwise a date was dropped.
    const rawDate = cell.rawDate.trim();
    if (record.date === null) {
      if (!isBlankSourceCell(rawDate)) {
        throw new ClimateImportError(
          `${plateCode}: record "${column.header}" has a null date but the source cell reads ` +
            `${JSON.stringify(rawDate)} — an occurrence date was dropped.`,
        );
      }
    } else if (formatLikeRawRecordDate(record.date) !== rawDate) {
      throw new ClimateImportError(
        `${plateCode}: record "${column.header}" date ${JSON.stringify(record.date)} does not ` +
          `re-print as the source's ${JSON.stringify(rawDate)}.`,
      );
    }
  }
}

/* ------------------------------------------------------------------ *
 * 2. Is this series publishable at all?
 * ------------------------------------------------------------------ */

/**
 * The "all-or-nothing core pair" rule (PLAN.md §1). A province whose 12 months are not
 * BOTH fully temperature-covered and fully precipitation-covered gets no
 * `climate_normals` object at all — the page renders no climate section rather than a
 * half-empty chart.
 *
 * Returns `null` for a series that must not be published (with the reason), or `null`-free
 * silence for one that may be. It deliberately returns instead of throwing: an unpublishable
 * province is an expected, reportable outcome of a run, not a crash. Under ruling 5 all 81
 * are expected to pass — the rule exists so that a future MGM change is VISIBLE, not so that
 * gaps are tolerated quietly.
 */
export function findUnpublishableReason(normals: ClimateNormals): string | null {
  if (normals.months.length !== CLIMATE_MONTH_COUNT) {
    return `has ${normals.months.length} months, expected ${CLIMATE_MONTH_COUNT}`;
  }

  const missing: string[] = [];
  for (let month = 1; month <= CLIMATE_MONTH_COUNT; month += 1) {
    const entry = normals.months[month - 1];
    if (entry === undefined || entry.month !== month) {
      return `month slot ${month} holds ${JSON.stringify(entry?.month)} — months must be 1-12 in order`;
    }
    if (entry.tempMeanC === null) missing.push(`tempMeanC[${month}]`);
    if (entry.precipitationMm === null) missing.push(`precipitationMm[${month}]`);
  }

  return missing.length > 0 ? `core pair incomplete: ${missing.join(', ')}` : null;
}

/* ------------------------------------------------------------------ *
 * 1b. The key set is EXACT — the artifact cannot widen the public contract
 * ------------------------------------------------------------------ */

/**
 * The key sets of every object inside a stored series, mirroring `province.types.ts`.
 *
 * Kept as literal arrays rather than derived from the interfaces because TypeScript types do not
 * exist at runtime and this check must run against JSON that came off disk. The `satisfies` on
 * each entry is what keeps them honest: rename or drop a field in `province.types.ts` and this
 * file stops compiling, which is the same "the interface is the one definition" discipline
 * `province.types.ts` documents for the entity and the DTO.
 */
const CLIMATE_NORMALS_KEYS = [
  'source',
  'sourceUrl',
  'periodStartYear',
  'periodEndYear',
  'months',
  'records',
] as const satisfies readonly (keyof ClimateNormals)[];

const CLIMATE_MONTHLY_KEYS = [
  'month',
  'tempMeanC',
  'tempMaxMeanC',
  'tempMinMeanC',
  'precipitationMm',
  'sunshineHours',
  'rainyDays',
  'tempRecordMaxC',
  'tempRecordMaxDate',
  'tempRecordMinC',
  'tempRecordMinDate',
] as const satisfies readonly (keyof ClimateMonthlyNormal)[];

const CLIMATE_RECORDS_KEYS = [
  'dailyMaxPrecipitationMm',
  'fastestWindMs',
  'maxSnowDepthCm',
] as const satisfies readonly (keyof ClimateRecords)[];

const CLIMATE_EXTREME_RECORD_KEYS = [
  'value',
  'date',
] as const satisfies readonly (keyof ClimateExtremeRecord)[];

/**
 * Require an object's key set to be EXACTLY the declared one — no extras, none missing.
 *
 * **The extras half is the load-bearing one, and it is a PUBLIC-CONTRACT defence.** The served
 * climate payload is built as `{ ...normals, derived }` (`province.service.ts`), so this object's
 * keys are spread verbatim onto a public endpoint. A key hand-added to `climate-normals.json`
 * between the two import phases therefore travels: artifact → `jsonb` column → response body →
 * a live SEO page, without appearing in any DTO, in `openapi.json`, or in the web repo's
 * generated types. Nothing downstream can stop it: the DTOs are `implements`-only mirrors, and
 * the response is a plain object, so no serializer whitelist is in the path. The `whitelist`
 * `ValidationPipe` guards INBOUND request bodies, not outbound reads.
 *
 * That is why the check sits HERE, at the upstream load assertion, rather than at serialization:
 * this is the boundary where hand-editable JSON becomes trusted data, and it is the only place
 * that can reject the key instead of quietly dropping it. A serializer whitelist would hide the
 * edit; a load assertion refuses the import and names it.
 *
 * The missing half costs one comparison and closes the mirror hole: a deleted key would put
 * `undefined` on the wire for a field the contract declares non-optional.
 */
function assertExactKeys(
  plateCode: string,
  what: string,
  value: object,
  expected: readonly string[],
): void {
  const actual = Object.keys(value);
  const expectedSet = new Set<string>(expected);
  const unexpected = actual.filter((key) => !expectedSet.has(key)).sort();
  const missing = expected.filter((key) => !actual.includes(key)).sort();

  if (unexpected.length > 0) {
    throw new ClimateImportError(
      `${plateCode}: ${what} carries unknown key(s) ${unexpected.map((k) => JSON.stringify(k)).join(', ')}. ` +
        `The stored series is spread verbatim onto the public climate payload, so an unknown key ` +
        `would be SERVED — outside the DTO, outside openapi.json and outside the web's generated ` +
        `types. Add the field to province.types.ts, its DTO and the OpenAPI spec deliberately, or ` +
        `remove it from the artifact.`,
    );
  }
  if (missing.length > 0) {
    throw new ClimateImportError(
      `${plateCode}: ${what} is missing key(s) ${missing.map((k) => JSON.stringify(k)).join(', ')}. ` +
        `Every field is declared non-optional, so an absent one would serve \`undefined\` where ` +
        `the contract promises a value or an explicit null.`,
    );
  }
}

/**
 * Structural validation of a series that IS about to be written. Unlike
 * `findUnpublishableReason` (an expected outcome), every failure here means the artifact is
 * malformed, so these throw.
 */
export function assertClimateNormalsShape(plateCode: string, normals: ClimateNormals): void {
  // FIRST, before any field is read: the object's key set must be exactly what the contract
  // declares. Every later check inspects individual fields and is blind to a key it does not
  // know about — and an unknown key here is served straight onto a public page (see
  // `assertExactKeys`). Months and records are covered too: they are nested inside the same
  // spread, so an extra key on a single month reaches the wire exactly the same way.
  assertExactKeys(plateCode, 'the series', normals, CLIMATE_NORMALS_KEYS);
  if (!Array.isArray(normals.months)) {
    throw new ClimateImportError(`${plateCode}: "months" is not an array.`);
  }
  for (const [index, month] of normals.months.entries()) {
    if (month === null || typeof month !== 'object') {
      throw new ClimateImportError(`${plateCode}: months[${index}] is not an object.`);
    }
    assertExactKeys(plateCode, `months[${index}]`, month, CLIMATE_MONTHLY_KEYS);
  }
  if (normals.records === null || typeof normals.records !== 'object') {
    throw new ClimateImportError(`${plateCode}: "records" is not an object.`);
  }
  assertExactKeys(plateCode, '"records"', normals.records, CLIMATE_RECORDS_KEYS);
  for (const key of CLIMATE_RECORDS_KEYS) {
    const record = normals.records[key];
    if (record === null) continue;
    if (typeof record !== 'object') {
      throw new ClimateImportError(`${plateCode}: records.${key} is neither an object nor null.`);
    }
    assertExactKeys(plateCode, `records.${key}`, record, CLIMATE_EXTREME_RECORD_KEYS);
  }

  if (normals.source !== CLIMATE_SOURCE_MGM_GENERAL) {
    throw new ClimateImportError(
      `${plateCode}: source is ${JSON.stringify(normals.source)}, expected ` +
        `${JSON.stringify(CLIMATE_SOURCE_MGM_GENERAL)} — MGM's k=A table is the only source.`,
    );
  }
  if (!normals.sourceUrl.startsWith('https://www.mgm.gov.tr/')) {
    throw new ClimateImportError(
      `${plateCode}: sourceUrl ${JSON.stringify(normals.sourceUrl)} is not an MGM URL. The page ` +
        `links this per province, so it must be real and per-province (Mersin's key is ICEL).`,
    );
  }
  if (normals.periodStartYear >= normals.periodEndYear) {
    throw new ClimateImportError(
      `${plateCode}: measurement period ${normals.periodStartYear}-${normals.periodEndYear} is not ascending.`,
    );
  }

  const reason = findUnpublishableReason(normals);
  if (reason !== null) {
    throw new ClimateImportError(`${plateCode}: ${reason} — this series must not be written.`);
  }

  // Ordering invariant. Weak on its own (it cannot see a truncated decimal — that is what
  // the round-trip is for), but it catches a swapped min/max row cheaply.
  for (const month of normals.months) {
    const { tempMinMeanC: min, tempMeanC: mean, tempMaxMeanC: max } = month;
    if (min !== null && mean !== null && min > mean) {
      throw new ClimateImportError(
        `${plateCode}: month ${month.month} has mean min ${min}°C above mean ${mean}°C.`,
      );
    }
    if (max !== null && mean !== null && max < mean) {
      throw new ClimateImportError(
        `${plateCode}: month ${month.month} has mean max ${max}°C below mean ${mean}°C.`,
      );
    }
    if (month.precipitationMm !== null && month.precipitationMm < 0) {
      throw new ClimateImportError(
        `${plateCode}: month ${month.month} has negative precipitation ${month.precipitationMm} mm.`,
      );
    }
    // Occurrence dates: an ISO date is meaningful only alongside the reading it dates. The
    // reverse (a reading with no date) is explicitly allowed — see `ClimateMonthlyNormal`.
    for (const [dateField, valueField] of [
      ['tempRecordMaxDate', 'tempRecordMaxC'],
      ['tempRecordMinDate', 'tempRecordMinC'],
    ] as const) {
      const date = month[dateField];
      if (date === null) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new ClimateImportError(
          `${plateCode}: month ${month.month} ${dateField} ${JSON.stringify(date)} is not ISO YYYY-MM-DD.`,
        );
      }
      if (month[valueField] === null) {
        throw new ClimateImportError(
          `${plateCode}: month ${month.month} carries ${dateField} with no ${valueField} — an ` +
            `occurrence date without its reading is meaningless.`,
        );
      }
    }

    if (month.rainyDays !== null && (month.rainyDays < 0 || month.rainyDays > 31)) {
      throw new ClimateImportError(
        `${plateCode}: month ${month.month} has ${month.rainyDays} rainy days.`,
      );
    }
    if (month.sunshineHours !== null && (month.sunshineHours < 0 || month.sunshineHours > 24)) {
      throw new ClimateImportError(
        `${plateCode}: month ${month.month} has ${month.sunshineHours} mean daily sunshine hours.`,
      );
    }
  }

  // The record columns published today are magnitudes — rainfall, wind speed and snow depth —
  // and none can be negative. The monthly values are range-checked above; the records were not,
  // so a sign flip in a record cell had no cheap check at all. (Like every range invariant here
  // this is weak on its own and cannot see a truncated decimal — that remains the round-trip's
  // job.)
  //
  // Driven by the per-column `nonNegative` flag rather than applied blanket, symmetrically with
  // `NON_NEGATIVE_MONTHLY_FIELDS`: MGM also publishes `En Düşük Sıcaklık`, and a blanket rule
  // would silently null every legitimate sub-zero record the day such a column is added.
  for (const column of RECORD_COLUMNS) {
    if (!column.nonNegative) continue;
    const record = normals.records[column.field];
    if (record !== null && record.value < 0) {
      throw new ClimateImportError(
        `${plateCode}: record "${column.header}" is ${record.value} ${column.unit} — a negative ` +
          `magnitude is impossible.`,
      );
    }
  }
}

/* ------------------------------------------------------------------ *
 * 3. Do the two artifacts corroborate each other?
 * ------------------------------------------------------------------ */

/**
 * Cross-check `climate-normals.json` against `climate-manifest.json` before anything is
 * written: same source, same province set, and the same measurement period per province.
 * A mismatch means the two files came from different runs — in which case the raw cells the
 * round-trip check is about to trust do not belong to the values being written, and the
 * check would be theatre.
 */
export function assertArtifactsCorroborate(
  normalsArtifact: ClimateNormalsArtifact,
  manifest: ClimateManifestArtifact,
): void {
  // Checked against the CONSTANT, not merely against each other: these objects were
  // `JSON.parse`d off disk, so their declared types are an assertion, not a guarantee. Two
  // files agreeing on a wrong source would still be wrong.
  if (
    normalsArtifact.source !== CLIMATE_SOURCE_MGM_GENERAL ||
    manifest.source !== CLIMATE_SOURCE_MGM_GENERAL
  ) {
    throw new ClimateImportError(
      `both artifacts must declare source ${JSON.stringify(CLIMATE_SOURCE_MGM_GENERAL)} — got ` +
        `${JSON.stringify(normalsArtifact.source)} and ${JSON.stringify(manifest.source)}.`,
    );
  }
  if (normalsArtifact.generatedAtUtc !== manifest.generatedAtUtc) {
    throw new ClimateImportError(
      `artifacts are from different runs (${normalsArtifact.generatedAtUtc} vs ` +
        `${manifest.generatedAtUtc}) — the raw cells would not belong to these values.`,
    );
  }

  // The manifest is `JSON.parse`d off disk, so `anomalies: ClimateAnomaly[]` is a declared type,
  // not a fact. A file that predates the field, a bad merge or a hand-edit yields `undefined`
  // here and the consumer's `for…of` then throws a bare `TypeError: not iterable`, which tells
  // an operator nothing about WHICH artifact is wrong. Checked here, where every other
  // artifact-shape rule already lives, so the failure is a `ClimateImportError` that names the
  // problem. `unpublishable` is genuinely optional (see the type) so absence is fine, but a
  // present-and-wrong value is not.
  if (!Array.isArray(manifest.anomalies)) {
    throw new ClimateImportError(
      'climate-manifest.json has no "anomalies" array. It may legitimately be EMPTY, but it must ' +
        'be present: it is the record of every source value the run refused, and an absent list ' +
        'is indistinguishable from a list that was dropped.',
    );
  }
  if (manifest.unpublishable !== undefined && !Array.isArray(manifest.unpublishable)) {
    throw new ClimateImportError(
      'climate-manifest.json has an "unpublishable" key that is not an array.',
    );
  }

  // Provenance monotonicity: the artifact is stamped when the run FINISHES, so no page can have
  // been fetched after it. This is one line, and it is the check that would have caught PR #65's
  // provenance defect at CI instead of in review — the committed manifest mixed a stamp captured
  // before a ~70-minute loop with per-page stamps captured during it, and nothing objected.
  //
  // The reviewer also proposed asserting `fetchedAtUtc` NON-DECREASING across entries. That is
  // deliberately NOT here: monotonicity is a property of one transport strategy (a single serial
  // pass), not of the data. A resumable or batched harvest produces genuine, correct stamps in
  // non-alphabetical order — the committed artifact is exactly that case — so the assertion
  // would reject true provenance and its only available remedies would be to rewrite real
  // timestamps or to delete the check. A check that honest data cannot satisfy does not survive
  // contact with the next operator.
  const generatedAt = Date.parse(manifest.generatedAtUtc);
  if (Number.isNaN(generatedAt)) {
    throw new ClimateImportError(
      `climate-manifest.json generatedAtUtc ${JSON.stringify(manifest.generatedAtUtc)} is not a ` +
        `parseable ISO-8601 instant.`,
    );
  }
  for (const entry of manifest.entries) {
    const fetchedAt = Date.parse(entry.fetchedAtUtc);
    if (Number.isNaN(fetchedAt)) {
      throw new ClimateImportError(
        `${entry.plateCode}: fetchedAtUtc ${JSON.stringify(entry.fetchedAtUtc)} is not a ` +
          `parseable ISO-8601 instant.`,
      );
    }
    if (fetchedAt > generatedAt) {
      throw new ClimateImportError(
        `${entry.plateCode}: fetchedAtUtc ${entry.fetchedAtUtc} is AFTER the artifact's ` +
          `generatedAtUtc ${manifest.generatedAtUtc}. The run stamp is taken when the run ` +
          `finishes, so a page cannot have been fetched later — the two fields describe ` +
          `different runs.`,
      );
    }
  }

  const normalsCodes = normalsArtifact.entries.map((entry) => entry.plateCode);
  const manifestCodes = manifest.entries.map((entry) => entry.plateCode);
  if (new Set(normalsCodes).size !== normalsCodes.length) {
    throw new ClimateImportError('climate-normals.json contains duplicate plate codes.');
  }
  if (new Set(manifestCodes).size !== manifestCodes.length) {
    throw new ClimateImportError('climate-manifest.json contains duplicate plate codes.');
  }

  // Both directions. The normals→manifest direction below catches a value with no provenance;
  // this one catches the reverse — a manifest entry with no series. That is not cosmetic: the
  // two files are supposed to be one run's output, so an extra manifest entry means either the
  // artifacts came from different runs or a province was dropped from the normals after the
  // fact, which is precisely the I1 omission this pair of files should be able to see.
  //
  // A DECLARED-unpublishable province is the one legitimate exception: its page was fetched (so
  // it has a manifest entry and full provenance) but refusing an impossible core value left it
  // with no publishable series. That is a recorded decision, not a dropped province — which is
  // exactly the distinction this check exists to make.
  const normalsCodeSet = new Set(normalsCodes);
  const unpublishableCodes = new Set(
    (manifest.unpublishable ?? []).map((province) => province.plateCode),
  );
  const bothPublishedAndNot = [...unpublishableCodes].filter((code) => normalsCodeSet.has(code));
  if (bothPublishedAndNot.length > 0) {
    throw new ClimateImportError(
      `province(s) ${bothPublishedAndNot.sort().join(', ')} are declared unpublishable in ` +
        `climate-manifest.json yet carry a series in climate-normals.json — the artifact ` +
        `contradicts itself about what is being published.`,
    );
  }
  const orphanedManifestCodes = manifestCodes.filter(
    (code) => !normalsCodeSet.has(code) && !unpublishableCodes.has(code),
  );
  if (orphanedManifestCodes.length > 0) {
    throw new ClimateImportError(
      `province(s) ${orphanedManifestCodes.join(', ')} are present in climate-manifest.json but ` +
        `absent from climate-normals.json — the two artifacts do not describe the same run.`,
    );
  }
  const unknownUnpublishable = [...unpublishableCodes].filter(
    (code) => !new Set(manifestCodes).has(code),
  );
  if (unknownUnpublishable.length > 0) {
    throw new ClimateImportError(
      `province(s) ${unknownUnpublishable.sort().join(', ')} are declared unpublishable but have ` +
        `no manifest entry — an unpublishable province is one we DID fetch and chose not to ` +
        `publish, so it must still carry its provenance.`,
    );
  }

  // The checks above are STRUCTURAL — they prove the declaration is well-formed, not that it is
  // true. This one demands evidence, and it runs on the load path because `load` is the phase
  // that writes.
  assertUnpublishableDeclarationsAreReal(manifest);

  const manifestByCode = new Map(manifest.entries.map((entry) => [entry.plateCode, entry]));
  for (const entry of normalsArtifact.entries) {
    const manifestEntry = manifestByCode.get(entry.plateCode);
    if (!manifestEntry) {
      throw new ClimateImportError(
        `${entry.plateCode}: present in normals but absent from the manifest.`,
      );
    }
    if (
      manifestEntry.periodStartYear !== entry.normals.periodStartYear ||
      manifestEntry.periodEndYear !== entry.normals.periodEndYear
    ) {
      throw new ClimateImportError(
        `${entry.plateCode}: manifest period ${manifestEntry.periodStartYear}-${manifestEntry.periodEndYear} ` +
          `disagrees with the series' ${entry.normals.periodStartYear}-${entry.normals.periodEndYear}.`,
      );
    }
    if (manifestEntry.url !== entry.normals.sourceUrl) {
      throw new ClimateImportError(
        `${entry.plateCode}: manifest URL ${JSON.stringify(manifestEntry.url)} disagrees with the ` +
          `series' sourceUrl ${JSON.stringify(entry.normals.sourceUrl)}.`,
      );
    }
  }
}
