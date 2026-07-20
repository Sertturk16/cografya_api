import {
  CLIMATE_MONTH_COUNT,
  type ClimateDerived,
  type ClimateNormals,
  type SeasonalPrecipitation,
} from './province.types';

/**
 * Pure derivations over a province's climate series.
 *
 * Everything here is the value-add MGM's own page does not carry (its "Yıllık" column is
 * empty — trap T1), so these figures are OURS and may not be attributed to MGM. They are
 * computed ONCE, at serialization time in `ProvinceService.toDetail`, and served as raw
 * numbers: the chart summary, the metadata description and the JSON-LD then all read the same
 * value and cannot round it three different ways (PLAN.md risk 7). Formatting — decimals,
 * separators, month names, units — is the web repo's `next-intl` job, never ours.
 *
 * Exported (not inlined into the service) for the same reason `computePopulationDensity` is:
 * these are pure functions with real branches — tie-breaks, the residue distribution, the
 * defensive null paths — and unit-testing them directly is cheaper and sharper than reaching
 * them only through an HTTP round-trip.
 */

/**
 * Round to ONE decimal place. Chosen as the canonical precision for the annual aggregates:
 * MGM publishes monthly temperature and precipitation to one decimal, so one decimal is the
 * most an average or a sum can honestly claim, and pinning it here also cleans the floating-
 * point residue a naive sum leaves (e.g. `1247.7999999` → `1247.8`). The web may format to
 * fewer decimals for display; it must not re-derive.
 */
function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Northern-hemisphere meteorological seasons, as 0-based indices into a 12-element monthly
 * array. Winter wraps the year end (Dec + Jan + Feb). This is the convention MGM's own climate
 * material uses and the one the competitor's seasonal breakdown assumes, so our percentages are
 * comparable to theirs.
 */
const SEASONS: ReadonlyArray<{
  key: keyof SeasonalPrecipitation;
  monthIndexes: readonly number[];
}> = [
  { key: 'winterPct', monthIndexes: [11, 0, 1] },
  { key: 'springPct', monthIndexes: [2, 3, 4] },
  { key: 'summerPct', monthIndexes: [5, 6, 7] },
  { key: 'autumnPct', monthIndexes: [8, 9, 10] },
];

/**
 * Seasonal share of annual precipitation as whole integers that sum to EXACTLY 100.
 *
 * The residue rule is the plan's (PLAN.md §1): round each season's share to the nearest
 * integer, then add whatever is missing from (or over) 100 to the season with the LARGEST
 * precipitation total. (Largest total ≡ largest share — the four shares divide by the same
 * annual denominator — so this matches PLAN.md's "largest share" wording exactly.) That single
 * correction is what guarantees the four values sum to 100 — a property the visible summary, the
 * metadata and the JSON-LD all depend on, so it must live in one place and be tested here.
 *
 * Returns `null` (rather than emitting a set that would not sum to 100 and would break the
 * contract's invariant) if the input is not a complete 12-month array, carries a NEGATIVE monthly
 * value, or has a non-positive annual total. A negative precipitation is physically impossible and
 * the import (`assertClimateNormalsShape`) already refuses it, but a negative slipping through here
 * could yield a nonsensical share (e.g. `winterPct: -8`) that still sums to 100 and passes every
 * other invariant — so the pure function refuses it too, making its own contract total and
 * self-consistent rather than relying on the caller. No real Turkish province hits any of these
 * paths; they are defensive guards against corrupt input, not expected outcomes.
 *
 * Exported for direct unit testing of the residue distribution and the tie-break.
 */
export function computeSeasonalPrecipitationPercentages(
  monthlyPrecipMm: readonly number[],
): SeasonalPrecipitation | null {
  if (monthlyPrecipMm.length !== CLIMATE_MONTH_COUNT) {
    return null;
  }

  const seasonTotals: number[] = [];
  for (const season of SEASONS) {
    let total = 0;
    for (const index of season.monthIndexes) {
      const value = monthlyPrecipMm[index];
      // A missing or NEGATIVE monthly value is not a derivable series — the four seasons cover
      // all 12 indices, so this guard sees every month.
      if (value === undefined || value < 0) {
        return null;
      }
      total += value;
    }
    seasonTotals.push(total);
  }

  const annualTotal = seasonTotals.reduce((sum, total) => sum + total, 0);
  if (annualTotal <= 0) {
    return null;
  }

  // Round each share, then reconcile the rounding residue onto the largest share so the four
  // integers total exactly 100.
  const rounded = seasonTotals.map((total) => Math.round((total / annualTotal) * 100));
  const residue = 100 - rounded.reduce((sum, pct) => sum + pct, 0);

  let largestIndex = 0;
  for (let i = 1; i < seasonTotals.length; i += 1) {
    // Strict `>` — a tie resolves to the earlier season (winter before autumn), deterministic.
    if ((seasonTotals[i] ?? 0) > (seasonTotals[largestIndex] ?? 0)) {
      largestIndex = i;
    }
  }
  rounded[largestIndex] = (rounded[largestIndex] ?? 0) + residue;

  return {
    winterPct: rounded[0] ?? 0,
    springPct: rounded[1] ?? 0,
    summerPct: rounded[2] ?? 0,
    autumnPct: rounded[3] ?? 0,
  };
}

/**
 * Derive the annual/extreme/seasonal figures from a climate series.
 *
 * Returns `null` when the series cannot yield a coherent derivation — because the 12-month core
 * pair (`tempMeanC` + `precipitationMm`) is not complete, the annual precipitation is not
 * positive, or the stored value is not even the shape the type promises (`{}`, `{ months: null }`,
 * a non-array `months`). That last case is real, not paranoia: this argument is deserialized from
 * a `jsonb` column, and a `jsonb` value's runtime shape is NOT constrained by its TypeScript type,
 * so a legacy, hand-written or future admin-CRUD row can violate `ClimateNormals` at runtime.
 * Under the import-time all-or-nothing rule every STORED series is complete, so a `null` here
 * means either a province with no series at all or corrupt data; either way the caller serves
 * `climate: null` and the page degrades gracefully rather than shipping a chart summary built on
 * `NaN`. It deliberately returns `null` instead of throwing — and the shape guard is what makes
 * that promise TRUE for the malformed shapes above: a serialization path (the whole
 * `GET /api/provinces` list + the sitemap build, not just one detail page) must not 500 over a
 * data-integrity slip.
 */
export function computeClimateDerived(normals: ClimateNormals): ClimateDerived | null {
  // Shape guard at the jsonb boundary (see docblock): `!Array.isArray(months)` catches `{}` and
  // `{ months: null }` (a destructured `undefined`/`null`) before `.length` can throw on them.
  const { months } = normals;
  if (!Array.isArray(months) || months.length !== CLIMATE_MONTH_COUNT) {
    return null;
  }

  const temps: number[] = [];
  const precip: number[] = [];
  for (let month = 1; month <= CLIMATE_MONTH_COUNT; month += 1) {
    const entry = months[month - 1];
    // Months must be present, in order, with a complete core pair — anything else is not a
    // derivable series.
    if (entry === undefined || entry.month !== month) {
      return null;
    }
    if (entry.tempMeanC === null || entry.precipitationMm === null) {
      return null;
    }
    temps.push(entry.tempMeanC);
    precip.push(entry.precipitationMm);
  }

  const seasonalPrecipitation = computeSeasonalPrecipitationPercentages(precip);
  if (seasonalPrecipitation === null) {
    return null;
  }

  let hottestIndex = 0;
  let coldestIndex = 0;
  let wettestIndex = 0;
  let driestIndex = 0;
  for (let i = 1; i < CLIMATE_MONTH_COUNT; i += 1) {
    // Strict comparisons so a tie resolves to the EARLIEST month, deterministically.
    if ((temps[i] ?? 0) > (temps[hottestIndex] ?? 0)) hottestIndex = i;
    if ((temps[i] ?? 0) < (temps[coldestIndex] ?? 0)) coldestIndex = i;
    if ((precip[i] ?? 0) > (precip[wettestIndex] ?? 0)) wettestIndex = i;
    if ((precip[i] ?? 0) < (precip[driestIndex] ?? 0)) driestIndex = i;
  }

  const annualMeanTempC = roundTo1(
    temps.reduce((sum, value) => sum + value, 0) / CLIMATE_MONTH_COUNT,
  );
  const annualPrecipitationMm = roundTo1(precip.reduce((sum, value) => sum + value, 0));
  const annualTempRangeC = roundTo1((temps[hottestIndex] ?? 0) - (temps[coldestIndex] ?? 0));

  return {
    annualMeanTempC,
    annualPrecipitationMm,
    hottestMonth: hottestIndex + 1,
    coldestMonth: coldestIndex + 1,
    wettestMonth: wettestIndex + 1,
    driestMonth: driestIndex + 1,
    annualTempRangeC,
    seasonalPrecipitation,
  };
}
