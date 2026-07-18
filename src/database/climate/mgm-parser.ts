import {
  CLIMATE_MONTH_COUNT,
  CLIMATE_SOURCE_MGM_GENERAL,
  type ClimateExtremeRecord,
  type ClimateMonthlyNormal,
  type ClimateNormals,
  type ClimateRecords,
} from '../../province/province.types';

/**
 * Parser for MGM's "İllerimize Ait Genel İstatistiki Veriler" page (`k=A`).
 *
 * This is the single series for all 81 provinces (PLAN.md ruling 5; `k=H` is unused).
 * The page is XSLT (Xalan) output and structurally identical across provinces, which is
 * what makes a strict parser possible — and strictness is the whole design here.
 *
 * ## The governing rule: fail LOUDLY, never silently
 * Every function below throws on anything it did not expect: an unknown row label, a cell
 * count that is not 1/2/14, a numeric cell that does not match the exact `k=A` grammar, a
 * non-empty "Yıllık" cell, a month header out of order. There is no lenient path and no
 * "skip what we don't understand" branch. The failure mode this forbids is the one that
 * actually costs us: a silent empty array or a silently truncated number that looks like a
 * successful run and publishes wrong figures to 81 pages.
 *
 * ## No HTML-parsing dependency, deliberately
 * The extraction below is regex over a fixed, machine-generated table. A DOM library would
 * be *more* lenient, not less — it would happily hand back a shifted or partial row that
 * the asserts here reject. Given that the parser's job is to refuse anything unexpected,
 * the tolerance a DOM parser adds is a liability, and it would put a runtime dependency
 * into the app image for a script that runs about once a year. Revisit if MGM ever serves
 * genuinely irregular markup (nested cells, unclosed tags) — that is the condition under
 * which this trade flips.
 */

/** Turkish month headers, in the order MGM prints them. Used to PROVE column alignment. */
const MONTH_HEADERS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
] as const;

/** Header text of the trailing column MGM prints but never fills (trap T1). */
const ANNUAL_HEADER = 'Yıllık';

/**
 * Cells in a data row: 1 label + 12 months + 1 (empty) annual = 14.
 * Asserted per row so a column shift cannot pass (PLAN.md risk #2).
 */
const DATA_ROW_CELL_COUNT = 1 + CLIMATE_MONTH_COUNT + 1;

/** Monthly-series measures we accept, keyed by MGM's exact row label. */
export const METRIC_ROW_LABELS = {
  'Ortalama Sıcaklık (°C)': 'tempMeanC',
  'Ortalama En Yüksek Sıcaklık (°C)': 'tempMaxMeanC',
  'Ortalama En Düşük Sıcaklık (°C)': 'tempMinMeanC',
  'Ortalama Güneşlenme Süresi (saat)': 'sunshineHours',
  'Ortalama Yağışlı Gün Sayısı': 'rainyDays',
  'Aylık Toplam Yağış Miktarı Ortalaması (mm)': 'precipitationMm',
  'En Yüksek Sıcaklık (°C)': 'tempRecordMaxC',
  'En Düşük Sıcaklık (°C)': 'tempRecordMinC',
} as const satisfies Record<string, keyof Omit<ClimateMonthlyNormal, 'month'>>;

export type MetricRowLabel = keyof typeof METRIC_ROW_LABELS;
export type MetricField = (typeof METRIC_ROW_LABELS)[MetricRowLabel];

/** Record columns of the second `k=A` table, with the unit each MUST carry. */
export const RECORD_COLUMNS = [
  { header: 'Günlük Toplam En Yüksek Yağış Miktarı', field: 'dailyMaxPrecipitationMm', unit: 'mm' },
  { header: 'Günlük En Hızlı Rüzgar', field: 'fastestWindMs', unit: 'm/sn' },
  { header: 'En Yüksek Kar', field: 'maxSnowDepthCm', unit: 'cm' },
] as const satisfies readonly { header: string; field: keyof ClimateRecords; unit: string }[];

const PERIOD_ROW_RE = /^Ölçüm Periyodu\s*\(\s*(\d{4})\s*-\s*(\d{4})\s*\)$/;

/**
 * The EXACT numeric grammar of the `k=A` tab: an optional minus, digits, and — if there is
 * a fractional part — a COMMA separator (trap T3). A dot is rejected rather than guessed
 * at, because `10.4` on this tab could equally be a thousands separator; refusing to
 * choose is the point.
 */
const K_A_NUMBER_RE = /^(-?)(\d{1,4})(?:,(\d{1,2}))?$/;

/** MGM prints record dates as `DD.MM.YYYY`. */
const RECORD_DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;

/**
 * Cells MGM leaves blank. `-` is included because a station with no record prints it.
 *
 * Exported because the load-phase assertions must decide "is this source cell blank?" by the
 * SAME rule the parser used when it produced the `null` — two independent copies could drift
 * apart and turn a dropped reading into a passing check.
 */
export const EMPTY_CELL_VALUES: ReadonlySet<string> = new Set(['', '-', '—']);

/** Plausibility window for a measurement period. Wider than reality on purpose: this
 * guards against a parse landing on the wrong digits, not against MGM being wrong. */
const MIN_PERIOD_YEAR = 1900;
const MAX_PERIOD_YEAR = 2200;

/** A raw (unparsed) monthly row, kept verbatim for the decimal round-trip check. */
export interface MgmRawMetricRow {
  label: MetricRowLabel;
  /** Exactly `CLIMATE_MONTH_COUNT` cell strings, trimmed but otherwise untouched. */
  rawMonthlyCells: string[];
  /**
   * Exactly `CLIMATE_MONTH_COUNT` raw `title` attributes (`''` where the cell has none) —
   * the occurrence dates of the extreme-temperature rows. Kept verbatim for the same reason
   * the values are: so the load phase can prove the stored ISO date re-prints to what MGM
   * actually published.
   */
  rawMonthlyTitles: string[];
}

/** A raw (unparsed) record cell, kept verbatim for the round-trip check. */
export interface MgmRawRecordCell {
  field: keyof ClimateRecords;
  rawDate: string;
  /** The full cell text including its unit, e.g. `"199,5 mm"`. */
  rawValue: string;
}

/**
 * Everything the parser produces: the normalized object we store, plus the raw strings the
 * round-trip assertion needs. The raw half is what makes trap T3 catchable — a range
 * invariant cannot see `10,4 → 10`, because `10` still satisfies `min ≤ mean ≤ max`.
 */
export interface MgmParseResult {
  normals: ClimateNormals;
  raw: {
    metricRows: MgmRawMetricRow[];
    recordCells: MgmRawRecordCell[];
  };
}

export interface MgmParseContext {
  /** MGM's province key, e.g. `ICEL`. Cross-checked against the table's own header cell. */
  mgmKey: string;
  /** The exact URL the HTML came from; stored on the series as `sourceUrl`. */
  sourceUrl: string;
}

export class MgmParseError extends Error {
  constructor(message: string, context: MgmParseContext) {
    super(`[mgm-parser] ${context.mgmKey}: ${message}`);
    this.name = 'MgmParseError';
  }
}

/* ------------------------------------------------------------------ *
 * HTML micro-extraction
 * ------------------------------------------------------------------ */

/**
 * A table cell reduced to what this parser reads: its text, and its `title` attribute —
 * which is where MGM hides the occurrence date of an extreme-temperature reading.
 */
interface HtmlCell {
  text: string;
  /** `title` attribute content, or `''` when the cell has none. */
  title: string;
}

function extractTables(html: string): string[] {
  return [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((match) => match[1] ?? '');
}

function extractRows(tableHtml: string): string[] {
  return [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1] ?? '');
}

function extractCells(rowHtml: string): HtmlCell[] {
  return [...rowHtml.matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi)].map((match) => ({
    text: toText(match[3] ?? ''),
    title: /\btitle="([^"]*)"/i.exec(match[2] ?? '')?.[1]?.trim() ?? '',
  }));
}

/**
 * Cell inner HTML → comparable text: drop nested tags (MGM wraps units in `<span>`), decode
 * the handful of entities the page actually uses, collapse all whitespace (`&nbsp;`
 * included), and NFC-normalize so `Sıcaklık` compares equal regardless of how the source
 * composed its diacritics.
 */
function toText(innerHtml: string): string {
  return innerHtml
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFC');
}

/* ------------------------------------------------------------------ *
 * Value parsing
 * ------------------------------------------------------------------ */

/**
 * Parse one `k=A` numeric cell. Returns `null` for a genuinely blank cell and THROWS on
 * anything that is neither blank nor an exact match of the comma grammar — never a guess,
 * never a `parseFloat` fallback. `parseFloat('10,4')` returning `10` is the single most
 * likely defect in this whole feature (PLAN.md risk #1) and it is silent; this function
 * plus `assertDecimalRoundTrip` are the two independent defences against it.
 */
export function parseKaNumber(
  rawCell: string,
  context: MgmParseContext,
  where: string,
): number | null {
  const raw = rawCell.trim();
  if (EMPTY_CELL_VALUES.has(raw)) return null;

  const match = K_A_NUMBER_RE.exec(raw);
  if (!match) {
    throw new MgmParseError(
      `${where}: cell ${JSON.stringify(raw)} does not match the k=A number grammar ` +
        `(optional '-', 1-4 digits, optional ',' + 1-2 decimals). Refusing to guess — a ` +
        `dot-separated or grouped value here would silently truncate.`,
      context,
    );
  }

  const [, sign = '', integerPart = '', decimalPart] = match;
  const parsed = Number(
    `${sign}${integerPart}${decimalPart === undefined ? '' : `.${decimalPart}`}`,
  );
  if (!Number.isFinite(parsed)) {
    throw new MgmParseError(
      `${where}: cell ${JSON.stringify(raw)} parsed to a non-finite number.`,
      context,
    );
  }

  // Normalize -0 to 0: JSON.stringify(-0) emits "0", so a -0 stored in jsonb would come
  // back as 0 and make the load-phase round-trip check fail for a purely cosmetic reason.
  return parsed === 0 ? 0 : parsed;
}

/**
 * Re-print a parsed number in the source's own notation, so it can be compared byte-for-byte
 * against the raw cell. The decimal count comes FROM THE RAW STRING, so `21,0` re-prints as
 * `21,0` and not `21`.
 */
export function formatLikeRawKaNumber(value: number, rawCell: string): string {
  const raw = rawCell.trim();
  const commaIndex = raw.indexOf(',');
  const decimals = commaIndex === -1 ? 0 : raw.length - commaIndex - 1;
  const sign = value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(decimals)}`.replace('.', ',');
}

/**
 * `DD.MM.YYYY` → ISO `YYYY-MM-DD`.
 *
 * Returns `null` for a genuinely absent date and THROWS on a present-but-unparseable one.
 * That split is the whole point: a missing date must never cost us the reading it belongs
 * to, but a date in a shape we do not recognise must never be guessed at (the T3 lesson —
 * `01.02.2003` is 1 February or 2 January depending on a convention we must not assume, so
 * the format is pinned rather than inferred).
 */
function parseRecordDate(rawDate: string, context: MgmParseContext, where: string): string | null {
  const raw = rawDate.trim();
  if (EMPTY_CELL_VALUES.has(raw)) return null;

  const match = RECORD_DATE_RE.exec(raw);
  if (!match) {
    throw new MgmParseError(
      `${where}: record date ${JSON.stringify(raw)} is not DD.MM.YYYY. Refusing to guess at a ` +
        `date format rather than publish a wrong one.`,
      context,
    );
  }
  const [, day = '', month = '', year = ''] = match;

  // Calendar-validate: `31.02.1970` matches the pattern but is not a date. A silently wrong
  // date on a public page is worse than a loud import failure.
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const composed = new Date(Date.UTC(Number(year), monthNumber - 1, dayNumber));
  if (
    composed.getUTCFullYear() !== Number(year) ||
    composed.getUTCMonth() !== monthNumber - 1 ||
    composed.getUTCDate() !== dayNumber
  ) {
    throw new MgmParseError(
      `${where}: ${JSON.stringify(raw)} is not a real calendar date.`,
      context,
    );
  }

  return `${year}-${month}-${day}`;
}

/** ISO `YYYY-MM-DD` → MGM's `DD.MM.YYYY`, for the round-trip assertion. */
export function formatLikeRawRecordDate(isoDate: string): string {
  const [year = '', month = '', day = ''] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}

/* ------------------------------------------------------------------ *
 * Page parsing
 * ------------------------------------------------------------------ */

interface MonthlyTableResult {
  periodStartYear: number;
  periodEndYear: number;
  metricRows: MgmRawMetricRow[];
  values: Map<MetricField, (number | null)[]>;
  /** Occurrence dates (ISO), only for the two extreme-temperature rows. */
  dates: Map<MonthlyDateField, (string | null)[]>;
}

/**
 * The two monthly measures whose cells carry an occurrence date in their `title` attribute,
 * mapped to the field the date is stored in.
 *
 * Only these two are read. Averages have no meaningful single date, so a `title` on any
 * other row is ignored rather than treated as an error — ignoring an attribute we never
 * claim to publish is not a silent data loss, unlike ignoring a VALUE.
 */
const MONTHLY_DATE_FIELDS = {
  tempRecordMaxC: 'tempRecordMaxDate',
  tempRecordMinC: 'tempRecordMinDate',
} as const satisfies Partial<Record<MetricField, keyof ClimateMonthlyNormal>>;

type MonthlyDateField = (typeof MONTHLY_DATE_FIELDS)[keyof typeof MONTHLY_DATE_FIELDS];

function isDatedMetricField(field: MetricField): field is keyof typeof MONTHLY_DATE_FIELDS {
  return Object.prototype.hasOwnProperty.call(MONTHLY_DATE_FIELDS, field);
}

function parseMonthlyTable(tableHtml: string, context: MgmParseContext): MonthlyTableResult {
  const rows = extractRows(tableHtml);
  const headerRowHtml = rows[0];
  if (headerRowHtml === undefined) {
    throw new MgmParseError('monthly table has no rows at all.', context);
  }

  // --- Header: proves the 12 month columns are present, in order, followed by the
  // deliberately-empty "Yıllık" column. Every later row is indexed against THIS layout.
  const headerCells = extractCells(headerRowHtml);
  if (headerCells.length !== DATA_ROW_CELL_COUNT) {
    throw new MgmParseError(
      `header row has ${headerCells.length} cells, expected ${DATA_ROW_CELL_COUNT}.`,
      context,
    );
  }
  const headerKey = headerCells[0]?.text ?? '';
  if (headerKey.toUpperCase() !== context.mgmKey.toUpperCase()) {
    throw new MgmParseError(
      `table is for province key ${JSON.stringify(headerKey)} but ${JSON.stringify(context.mgmKey)} ` +
        `was requested — the page served a different province than the URL asked for.`,
      context,
    );
  }
  MONTH_HEADERS.forEach((expected, index) => {
    const actual = headerCells[index + 1]?.text;
    if (actual !== expected) {
      throw new MgmParseError(
        `month header ${index + 1} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}.`,
        context,
      );
    }
  });
  if (headerCells[DATA_ROW_CELL_COUNT - 1]?.text !== ANNUAL_HEADER) {
    throw new MgmParseError(
      `last header cell is ${JSON.stringify(headerCells[DATA_ROW_CELL_COUNT - 1]?.text)}, ` +
        `expected ${JSON.stringify(ANNUAL_HEADER)}.`,
      context,
    );
  }

  const periods: { start: number; end: number }[] = [];
  const metricRows: MgmRawMetricRow[] = [];
  const values = new Map<MetricField, (number | null)[]>();
  const dates = new Map<MonthlyDateField, (string | null)[]>();

  for (const [index, rowHtml] of rows.slice(1).entries()) {
    const cells = extractCells(rowHtml);
    const rowNumber = index + 2;

    // Full-width footnote row (`<tfoot>`): structurally incapable of carrying monthly data,
    // so it is skipped rather than allow-listed by its exact prose — pinning the footnote
    // text would make the parser brittle about a sentence we never read.
    if (cells.length === 1) continue;

    // "Ölçüm Periyodu ( 1929 - 2025)" separator: a spacer cell + a colspan header.
    if (cells.length === 2) {
      const label = cells[1]?.text ?? '';
      const match = PERIOD_ROW_RE.exec(label);
      if (!match) {
        throw new MgmParseError(
          `row ${rowNumber} has 2 cells but ${JSON.stringify(label)} is not a measurement-period row.`,
          context,
        );
      }
      periods.push({ start: Number(match[1]), end: Number(match[2]) });
      continue;
    }

    if (cells.length !== DATA_ROW_CELL_COUNT) {
      throw new MgmParseError(
        `row ${rowNumber} has ${cells.length} cells; only 1 (footnote), 2 (period) and ` +
          `${DATA_ROW_CELL_COUNT} (data) are known layouts.`,
        context,
      );
    }

    // --- Data row.
    const label = cells[0]?.text ?? '';
    if (!isMetricRowLabel(label)) {
      throw new MgmParseError(
        `row ${rowNumber} carries the unrecognised label ${JSON.stringify(label)}. MGM's table ` +
          `layout has changed; refusing to import rather than silently drop a measure.`,
        context,
      );
    }
    const field = METRIC_ROW_LABELS[label];
    if (values.has(field)) {
      throw new MgmParseError(
        `row ${rowNumber}: measure ${JSON.stringify(label)} appears twice.`,
        context,
      );
    }

    // Trap T1: MGM prints a "Yıllık" column and leaves it EMPTY. If it is ever non-empty,
    // either MGM started publishing an annual figure or our columns have shifted — both
    // demand a human, neither may pass silently.
    const annualCell = cells[DATA_ROW_CELL_COUNT - 1]?.text ?? '';
    if (annualCell !== '') {
      throw new MgmParseError(
        `row ${rowNumber} (${label}): the "Yıllık" cell is ${JSON.stringify(annualCell)}, expected empty. ` +
          `Our annual figures are DERIVED (they may not be attributed to MGM), so a populated ` +
          `cell here means the page layout changed.`,
        context,
      );
    }

    // The month count comes from the CONSTANT, never from the number of cells found.
    const rawMonthlyCells: string[] = [];
    const rawMonthlyTitles: string[] = [];
    const monthlyValues: (number | null)[] = [];
    const monthlyDates: (string | null)[] = [];
    const dated = isDatedMetricField(field);

    for (let month = 1; month <= CLIMATE_MONTH_COUNT; month += 1) {
      const cell = cells[month];
      const raw = cell?.text ?? '';
      const rawTitle = cell?.title ?? '';
      const where = `row ${rowNumber} (${label}), month ${month}`;

      rawMonthlyCells.push(raw);
      rawMonthlyTitles.push(rawTitle);
      monthlyValues.push(parseKaNumber(raw, context, where));
      // Dates are read ONLY for the two extreme rows. A missing date yields null and never
      // costs us the reading; a malformed one throws.
      monthlyDates.push(dated ? parseRecordDate(rawTitle, context, where) : null);
    }

    if (dated) {
      // A date with no value is meaningless — it would render as "(Temmuz 2017)" attached to
      // nothing. The reverse (a value with no date) is explicitly allowed.
      for (let month = 1; month <= CLIMATE_MONTH_COUNT; month += 1) {
        if (monthlyDates[month - 1] !== null && monthlyValues[month - 1] === null) {
          throw new MgmParseError(
            `row ${rowNumber} (${label}), month ${month}: an occurrence date with no reading.`,
            context,
          );
        }
      }
      dates.set(MONTHLY_DATE_FIELDS[field], monthlyDates);
    }

    metricRows.push({ label, rawMonthlyCells, rawMonthlyTitles });
    values.set(field, monthlyValues);
  }

  if (periods.length === 0) {
    throw new MgmParseError(
      'no "Ölçüm Periyodu" row found — the measurement period cannot be assumed.',
      context,
    );
  }
  const [firstPeriod] = periods;
  if (firstPeriod === undefined) {
    throw new MgmParseError('measurement period list was unexpectedly empty.', context);
  }
  // `k=A` prints the period twice (once above the averages, once above the extremes). They
  // are the same period in every province examined; if they ever diverge we must not pick
  // one silently, because the page states a single period to the reader.
  for (const period of periods) {
    if (period.start !== firstPeriod.start || period.end !== firstPeriod.end) {
      throw new MgmParseError(
        `the page states more than one measurement period ` +
          `(${firstPeriod.start}-${firstPeriod.end} and ${period.start}-${period.end}); ` +
          `refusing to choose one.`,
        context,
      );
    }
  }
  if (
    firstPeriod.start < MIN_PERIOD_YEAR ||
    firstPeriod.end > MAX_PERIOD_YEAR ||
    firstPeriod.start >= firstPeriod.end
  ) {
    throw new MgmParseError(
      `implausible measurement period ${firstPeriod.start}-${firstPeriod.end}.`,
      context,
    );
  }
  // The allowlist above catches a RENAMED row (unrecognised label → throw). It cannot catch a
  // REMOVED one: a dropped row simply never appears, its field fills `?? null` for all 12
  // months, and `metricRows.length === 0` still passes because the other seven rows remain —
  // so six of the eight measures could vanish and the table would quietly lose a column across
  // all 81 provinces. Requiring the full expected set closes that direction (PLAN risk #3:
  // "Gürültülü patlar, sessiz boş dizi asla").
  const missingLabels = (Object.keys(METRIC_ROW_LABELS) as MetricRowLabel[]).filter(
    (label) => !values.has(METRIC_ROW_LABELS[label]),
  );
  if (missingLabels.length > 0) {
    throw new MgmParseError(
      `the monthly table is missing ${missingLabels.length} expected measure row(s): ` +
        `${missingLabels.map((label) => JSON.stringify(label)).join(', ')}. MGM's table layout ` +
        `has changed; refusing to import a series that would silently lose a measure.`,
      context,
    );
  }
  if (metricRows.length === 0) {
    throw new MgmParseError('monthly table contained no recognised measure rows.', context);
  }

  return {
    periodStartYear: firstPeriod.start,
    periodEndYear: firstPeriod.end,
    metricRows,
    values,
    dates,
  };
}

function isMetricRowLabel(label: string): label is MetricRowLabel {
  return Object.prototype.hasOwnProperty.call(METRIC_ROW_LABELS, label);
}

interface RecordsTableResult {
  records: ClimateRecords;
  recordCells: MgmRawRecordCell[];
}

function parseRecordsTable(tableHtml: string, context: MgmParseContext): RecordsTableResult {
  const rows = extractRows(tableHtml);
  const headerRowHtml = rows[0];
  const bodyRowHtml = rows[1];
  if (headerRowHtml === undefined || bodyRowHtml === undefined) {
    throw new MgmParseError('records table needs a header row and a value row.', context);
  }
  // Every row must be accounted for, exactly as in the monthly table. Reading only rows 0-1
  // would silently discard an added row — and an added row is precisely the signal that the
  // column layout we index by position has moved.
  if (rows.length !== 2) {
    throw new MgmParseError(
      `records table has ${rows.length} rows, expected exactly 2 (a header row and a value ` +
        `row). MGM's layout has changed; refusing to read the value row by position.`,
      context,
    );
  }

  const headerCells = extractCells(headerRowHtml);
  if (headerCells.length !== RECORD_COLUMNS.length) {
    throw new MgmParseError(
      `records header has ${headerCells.length} columns, expected ${RECORD_COLUMNS.length}.`,
      context,
    );
  }
  RECORD_COLUMNS.forEach((column, index) => {
    const actual = headerCells[index]?.text;
    if (actual !== column.header) {
      throw new MgmParseError(
        `records column ${index + 1} is ${JSON.stringify(actual)}, expected ${JSON.stringify(column.header)}.`,
        context,
      );
    }
  });

  // Each record column is a (date, value) PAIR of cells.
  const valueCells = extractCells(bodyRowHtml);
  if (valueCells.length !== RECORD_COLUMNS.length * 2) {
    throw new MgmParseError(
      `records value row has ${valueCells.length} cells, expected ${RECORD_COLUMNS.length * 2} ` +
        `(a date and a value per column).`,
      context,
    );
  }

  const records: ClimateRecords = {
    dailyMaxPrecipitationMm: null,
    fastestWindMs: null,
    maxSnowDepthCm: null,
  };
  const recordCells: MgmRawRecordCell[] = [];

  RECORD_COLUMNS.forEach((column, index) => {
    const rawDate = valueCells[index * 2]?.text ?? '';
    const rawValue = valueCells[index * 2 + 1]?.text ?? '';
    recordCells.push({ field: column.field, rawDate, rawValue });

    const parsed = parseRecordValue(
      rawValue,
      rawDate,
      column.unit,
      context,
      `record "${column.header}"`,
    );
    records[column.field] = parsed;
  });

  return { records, recordCells };
}

/**
 * Split a record cell like `"199,5 mm"` into its number and unit, assert the unit is the one
 * this column must carry, and pair it with its date. A blank pair yields `null` (a station
 * with no measurable snow is normal); a present value with a WRONG unit throws, because a
 * unit swap would silently rescale the figure.
 *
 * A value WITHOUT a date is kept, with `date: null` — MGM may simply not have printed one,
 * and discarding a real record over a missing date would be data loss. A date without a
 * value still throws: it is meaningless on its own.
 */
export function parseRecordValue(
  rawValue: string,
  rawDate: string,
  expectedUnit: string,
  context: MgmParseContext,
  where: string,
): ClimateExtremeRecord | null {
  const value = rawValue.trim();
  const date = rawDate.trim();
  if (EMPTY_CELL_VALUES.has(value)) {
    if (!EMPTY_CELL_VALUES.has(date)) {
      throw new MgmParseError(
        `${where}: an occurrence date ${JSON.stringify(date)} with no record value.`,
        context,
      );
    }
    return null;
  }

  const separatorIndex = value.lastIndexOf(' ');
  if (separatorIndex === -1) {
    throw new MgmParseError(`${where}: value ${JSON.stringify(value)} carries no unit.`, context);
  }
  const numberPart = value.slice(0, separatorIndex);
  const unitPart = value.slice(separatorIndex + 1);
  if (unitPart !== expectedUnit) {
    throw new MgmParseError(
      `${where}: unit is ${JSON.stringify(unitPart)}, expected ${JSON.stringify(expectedUnit)}.`,
      context,
    );
  }

  const parsedNumber = parseKaNumber(numberPart, context, where);
  if (parsedNumber === null) {
    throw new MgmParseError(
      `${where}: value ${JSON.stringify(value)} has no numeric part.`,
      context,
    );
  }

  return { value: parsedNumber, date: parseRecordDate(date, context, where) };
}

/**
 * Parse a full MGM `k=A` page into the stored `ClimateNormals` shape plus the raw strings
 * the round-trip assertion needs.
 *
 * Throws on ANY structural surprise — see the module note. Callers must not catch-and-skip.
 */
export function parseMgmGeneralStatisticsPage(
  html: string,
  context: MgmParseContext,
): MgmParseResult {
  const tables = extractTables(html);
  const monthlyTable = tables[0];
  const recordsTable = tables[1];

  if (monthlyTable === undefined) {
    throw new MgmParseError(
      'the page contains no <table> at all. (This is exactly how a province with no ' +
        'published series presents — it must abort the import, not yield an empty series.)',
      context,
    );
  }
  if (recordsTable === undefined) {
    throw new MgmParseError(
      'the page contains no records table (expected a second <table>).',
      context,
    );
  }
  if (tables.length !== 2) {
    throw new MgmParseError(
      `the page contains ${tables.length} tables, expected exactly 2 (monthly series + records).`,
      context,
    );
  }

  const monthly = parseMonthlyTable(monthlyTable, context);
  const { records, recordCells } = parseRecordsTable(recordsTable, context);

  // Build the 12 months from the CONSTANT, so an absent measure row becomes explicit nulls
  // rather than a short array.
  const months: ClimateMonthlyNormal[] = [];
  for (let month = 1; month <= CLIMATE_MONTH_COUNT; month += 1) {
    const index = month - 1;
    months.push({
      month,
      tempMeanC: monthly.values.get('tempMeanC')?.[index] ?? null,
      tempMaxMeanC: monthly.values.get('tempMaxMeanC')?.[index] ?? null,
      tempMinMeanC: monthly.values.get('tempMinMeanC')?.[index] ?? null,
      precipitationMm: monthly.values.get('precipitationMm')?.[index] ?? null,
      sunshineHours: monthly.values.get('sunshineHours')?.[index] ?? null,
      rainyDays: monthly.values.get('rainyDays')?.[index] ?? null,
      tempRecordMaxC: monthly.values.get('tempRecordMaxC')?.[index] ?? null,
      tempRecordMaxDate: monthly.dates.get('tempRecordMaxDate')?.[index] ?? null,
      tempRecordMinC: monthly.values.get('tempRecordMinC')?.[index] ?? null,
      tempRecordMinDate: monthly.dates.get('tempRecordMinDate')?.[index] ?? null,
    });
  }
  if (months.length !== CLIMATE_MONTH_COUNT) {
    throw new MgmParseError(
      `built ${months.length} months, expected ${CLIMATE_MONTH_COUNT}.`,
      context,
    );
  }

  return {
    normals: {
      source: CLIMATE_SOURCE_MGM_GENERAL,
      sourceUrl: context.sourceUrl,
      periodStartYear: monthly.periodStartYear,
      periodEndYear: monthly.periodEndYear,
      months,
      records,
    },
    raw: { metricRows: monthly.metricRows, recordCells },
  };
}

/* ------------------------------------------------------------------ *
 * Province key map
 * ------------------------------------------------------------------ */

/** Turkey's province count — a structural constant, not a researched datum. */
const PROVINCE_COUNT = 81;

export interface MgmProvinceKey {
  /** MGM's URL key, e.g. `ICEL`. */
  key: string;
  /** The province name MGM prints for it, e.g. `Mersin`. */
  nameTr: string;
}

/**
 * Read the 81-province key map out of any MGM province page.
 *
 * The page publishes its own dictionary in `<div id="nav_iller">`, so the keys are NEVER
 * guessed from province names and no hand-maintained override table is needed — including
 * the one real irregularity, `ICEL → Mersin`, which the page states itself. Two out-of-scope
 * keys that exist elsewhere on the site (`BAKU`, `SARAYBOSNA` — overseas forecast pages) are
 * outside this div and so cannot leak in.
 *
 * Throws unless it finds exactly 81 unique keys with unique names.
 */
export function parseMgmProvinceKeys(html: string): MgmProvinceKey[] {
  const navMatch = /<div\b[^>]*\bid="nav_iller"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
  if (!navMatch) {
    throw new Error(
      '[mgm-parser] no <div id="nav_iller"> block found — the province key map is unavailable.',
    );
  }

  const entries = [
    ...(navMatch[1] ?? '').matchAll(
      /<a\b[^>]*href="\?k=A(?:&|&amp;)m=([A-Z]+)"[^>]*>([^<]+)<\/a>/g,
    ),
  ];
  const keys: MgmProvinceKey[] = entries.map((match) => ({
    key: match[1] ?? '',
    nameTr: toText(match[2] ?? ''),
  }));

  if (keys.length !== PROVINCE_COUNT) {
    throw new Error(
      `[mgm-parser] found ${keys.length} province links in #nav_iller, expected ${PROVINCE_COUNT}.`,
    );
  }
  const uniqueKeys = new Set(keys.map((entry) => entry.key));
  const uniqueNames = new Set(keys.map((entry) => entry.nameTr));
  if (uniqueKeys.size !== PROVINCE_COUNT || uniqueNames.size !== PROVINCE_COUNT) {
    throw new Error(
      `[mgm-parser] province key map is not one-to-one (${uniqueKeys.size} unique keys, ` +
        `${uniqueNames.size} unique names for ${keys.length} links).`,
    );
  }

  return keys;
}
