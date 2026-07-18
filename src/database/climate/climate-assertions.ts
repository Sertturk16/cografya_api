import {
  CLIMATE_MONTH_COUNT,
  CLIMATE_SOURCE_MGM_GENERAL,
  type ClimateNormals,
} from '../../province/province.types';
import type { ClimateManifestArtifact, ClimateNormalsArtifact } from './climate-artifact.types';
import {
  EMPTY_CELL_VALUES,
  METRIC_ROW_LABELS,
  RECORD_COLUMNS,
  formatLikeRawKaNumber,
  formatLikeRawRecordDate,
  type MetricField,
  type MgmRawMetricRow,
  type MgmRawRecordCell,
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
): void {
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
        // A null must correspond to a genuinely blank source cell. A null standing where MGM
        // printed a number would mean we dropped a reading.
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
      if (!isBlankSourceCell(rawValue)) {
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

/**
 * Structural validation of a series that IS about to be written. Unlike
 * `findUnpublishableReason` (an expected outcome), every failure here means the artifact is
 * malformed, so these throw.
 */
export function assertClimateNormalsShape(plateCode: string, normals: ClimateNormals): void {
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

  // The three records are magnitudes — rainfall, wind speed and snow depth. None can be
  // negative. The monthly values are range-checked above; the records were not, so a sign flip
  // in a record cell had no cheap check at all. (Like every range invariant here this is weak
  // on its own and cannot see a truncated decimal — that remains the round-trip's job.)
  for (const column of RECORD_COLUMNS) {
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
  const normalsCodeSet = new Set(normalsCodes);
  const orphanedManifestCodes = manifestCodes.filter((code) => !normalsCodeSet.has(code));
  if (orphanedManifestCodes.length > 0) {
    throw new ClimateImportError(
      `province(s) ${orphanedManifestCodes.join(', ')} are present in climate-manifest.json but ` +
        `absent from climate-normals.json — the two artifacts do not describe the same run.`,
    );
  }

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
