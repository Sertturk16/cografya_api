import {
  CLIMATE_MONTH_COUNT,
  type ClimateMonthlyNormal,
  type ClimateNormals,
} from '../../province/province.types';

/**
 * Source-INDEPENDENT structural assertions over a `ClimateNormals` document.
 *
 * ## What this file is, and what it deliberately is not
 * It is the surviving, narrowed core of the retired `climate-assertions.ts` (~48 KB, deleted with
 * the MGM import line in the ERA5-Land migration — DEC 2026-07-30l, DEC 2026-08-04c). Everything
 * kept here is a property of the STORED CONTRACT, true of any climate source we could ever wire:
 * exactly 12 months numbered 1-12 in order, the core pair present and finite, no negative
 * precipitation, an ascending period, and an EXACT key set.
 *
 * Everything that was specific to MGM's HTML — the decimal round-trip against raw source cell
 * strings, the anomaly allowlist, the `unpublishable` declaration chain, the min ≤ mean ≤ max
 * ordering rule, the sunshine/rainy-day ranges, the record-column sign checks — went with the
 * parser it belonged to. Those checks were not weakened, they lost their subject: the fields they
 * guarded no longer exist in the contract (DEC 2026-08-01o), and their raw-cell evidence has no
 * counterpart in a binary reanalysis. The equivalent fidelity gate on the ERA5-Land line is the
 * manifest cross-check in `era5-load-assertions.ts`, which recomputes each province's annual
 * figures from the 12 normals and requires them to match values the FETCH phase recorded
 * independently — see that file for why that is a genuine re-derivation proof rather than a
 * plausibility check.
 *
 * ## Why the key set is checked, and why that is the load-bearing half
 * The stored series is spread verbatim onto the public payload (`{ ...normals, derived }` in
 * `province.service.ts`), so a key hand-added to a stored document travels all the way to a live
 * SEO page without appearing in any DTO, in `openapi.json`, or in the web repo's generated types.
 * Nothing downstream can stop it: the DTOs are `implements`-only mirrors and no serializer
 * whitelist sits in the path (the `whitelist` `ValidationPipe` guards INBOUND bodies). This is the
 * boundary where offline JSON becomes trusted data, and the only place that can REFUSE the key
 * instead of quietly shipping it.
 *
 * Every function here throws. A caller wanting a reportable outcome rather than an abort uses
 * {@link findUnpublishableReason}, which returns instead.
 */

export class ClimateNormalsShapeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`[climate-normals] ${message}`, options);
    this.name = 'ClimateNormalsShapeError';
  }
}

/**
 * The two measures a province MUST carry in all 12 months to be published at all.
 *
 * Retained as a named set even though the contract now has no other monthly measure: it is what
 * "core pair" MEANS, it is consumed by the load phase's completeness gate, and a future third
 * measure (which would be additive and optional) must not silently join the all-or-nothing rule
 * by being added to an interface.
 */
export const CORE_PAIR_FIELDS: ReadonlySet<string> = new Set(['tempMeanC', 'precipitationMm']);

/**
 * The key sets of every object inside a stored series, mirroring `province.types.ts`.
 *
 * Kept as literal arrays rather than derived from the interfaces because TypeScript types do not
 * exist at runtime and this check must run against JSON that came off disk. The `satisfies` on
 * each entry is what keeps them honest: rename or drop a field in `province.types.ts` and this
 * file stops compiling.
 */
const CLIMATE_NORMALS_KEYS = [
  'source',
  'sourceUrl',
  'periodStartYear',
  'periodEndYear',
  'months',
] as const satisfies readonly (keyof ClimateNormals)[];

const CLIMATE_MONTHLY_KEYS = [
  'month',
  'tempMeanC',
  'precipitationMm',
] as const satisfies readonly (keyof ClimateMonthlyNormal)[];

/**
 * The OTHER direction, at compile time: every key of the interface must appear in the array.
 *
 * `satisfies readonly (keyof T)[]` is one-directional — it fails when a field is RENAMED or
 * DROPPED (a listed name stops being a `keyof`), and it is silent when a field is ADDED. That
 * silent direction is the expensive one: a new contract field would reach `assertExactKeys` as an
 * "unknown key" and abort the offline load phase against a perfectly honest artifact — a failure
 * at import time for a mistake made at the keyboard. Instantiating the alias below with the keys
 * an array does NOT list makes TypeScript reject anything but `never`, so the mistake cannot
 * compile.
 *
 * `ClimateKeyListsAreExhaustive` is `export`ed for one mechanical reason only — it has no callers
 * and is not API: a purely local type-level proof reads as dead code to
 * `@typescript-eslint/no-unused-vars`, and silencing that rule per-line would be the same wound
 * one indirection further away.
 */
type NoUnlistedKeys<TUnlisted extends never> = TUnlisted;

export type ClimateKeyListsAreExhaustive = [
  NoUnlistedKeys<Exclude<keyof ClimateNormals, (typeof CLIMATE_NORMALS_KEYS)[number]>>,
  NoUnlistedKeys<Exclude<keyof ClimateMonthlyNormal, (typeof CLIMATE_MONTHLY_KEYS)[number]>>,
];

/** Require an object's key set to be EXACTLY the declared one — no extras, none missing. */
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
    throw new ClimateNormalsShapeError(
      `${plateCode}: ${what} carries unknown key(s) ${unexpected.map((k) => JSON.stringify(k)).join(', ')}. ` +
        `The stored series is spread verbatim onto the public climate payload, so an unknown key ` +
        `would be SERVED — outside the DTO, outside openapi.json and outside the web's generated ` +
        `types. Add the field to province.types.ts, its DTO and the OpenAPI spec deliberately, or ` +
        `remove it from the source document.`,
    );
  }
  if (missing.length > 0) {
    throw new ClimateNormalsShapeError(
      `${plateCode}: ${what} is missing key(s) ${missing.map((k) => JSON.stringify(k)).join(', ')}. ` +
        `Every field is declared non-optional, so an absent one would serve \`undefined\` where ` +
        `the contract promises a value.`,
    );
  }
}

/**
 * Is this series publishable? Returns the REASON it is not, or `null` when it is.
 *
 * It deliberately returns instead of throwing: "this province has no publishable series" was an
 * expected, reportable outcome of an MGM run, not a crash. On the ERA5-Land line it is no longer
 * reachable with real data — a uniform global reanalysis grid has no "this station does not
 * report" class (SPEC §5.3) — so the load phase treats a non-null return as a hard failure. The
 * function survives that change on purpose: it is the ONE definition of "complete enough to
 * publish", and the day a third source appears, the rule must already exist rather than be
 * re-invented by whoever wires it.
 */
export function findUnpublishableReason(normals: ClimateNormals): string | null {
  if (!Array.isArray(normals.months)) {
    return 'months is not an array';
  }
  if (normals.months.length !== CLIMATE_MONTH_COUNT) {
    return `has ${String(normals.months.length)} months, expected ${String(CLIMATE_MONTH_COUNT)}`;
  }

  const missing: string[] = [];
  for (let month = 1; month <= CLIMATE_MONTH_COUNT; month += 1) {
    const entry = normals.months[month - 1];
    if (entry === undefined || entry.month !== month) {
      return `month slot ${String(month)} holds ${JSON.stringify(entry?.month)} — months must be 1-12 in order`;
    }
    // `typeof` + `isFinite`, not `!== null`: this document came off disk (or out of `jsonb`),
    // where the declared TypeScript type is an assertion rather than a guarantee. `NaN` matters
    // as much as `null` — it survives JSON as `null`, but an in-process caller can hand one
    // straight in, and `NaN` propagates silently through every average downstream.
    if (!Number.isFinite(entry.tempMeanC)) missing.push(`tempMeanC[${String(month)}]`);
    if (!Number.isFinite(entry.precipitationMm)) missing.push(`precipitationMm[${String(month)}]`);
  }

  return missing.length > 0
    ? `core pair incomplete (${[...CORE_PAIR_FIELDS].join(' + ')}): ${missing.join(', ')}`
    : null;
}

/**
 * Structural validation of a series that IS about to be written. Unlike
 * {@link findUnpublishableReason} every failure here means the document is malformed, so these
 * throw.
 *
 * Source-independent by construction: it never inspects the value of `source` or `sourceUrl`
 * beyond requiring them to be non-empty strings. Pinning a series to a PARTICULAR source is the
 * loading line's job (`era5-load-assertions.ts`), which is what keeps this module reusable the day
 * a second source lands beside ERA5-Land.
 */
export function assertClimateNormalsShape(plateCode: string, normals: ClimateNormals): void {
  // FIRST, before any field is read: the object's key set must be exactly what the contract
  // declares. Every later check inspects individual fields and is blind to a key it does not know
  // about — and an unknown key here is served straight onto a public page (see `assertExactKeys`).
  if (normals === null || typeof normals !== 'object' || Array.isArray(normals)) {
    throw new ClimateNormalsShapeError(`${plateCode}: the series is not an object.`);
  }
  assertExactKeys(plateCode, 'the series', normals, CLIMATE_NORMALS_KEYS);

  if (typeof normals.source !== 'string' || normals.source.length === 0) {
    throw new ClimateNormalsShapeError(
      `${plateCode}: source is ${JSON.stringify(normals.source)} — a series must name the source ` +
        `it came from, because that string is what the published attribution is keyed on.`,
    );
  }
  if (typeof normals.sourceUrl !== 'string' || !normals.sourceUrl.startsWith('https://')) {
    throw new ClimateNormalsShapeError(
      `${plateCode}: sourceUrl ${JSON.stringify(normals.sourceUrl)} is not an https URL. It is ` +
        `rendered as the "see the source" link, so a non-URL there ships a broken citation.`,
    );
  }
  if (
    !Number.isInteger(normals.periodStartYear) ||
    !Number.isInteger(normals.periodEndYear) ||
    normals.periodStartYear >= normals.periodEndYear
  ) {
    throw new ClimateNormalsShapeError(
      `${plateCode}: measurement period ${String(normals.periodStartYear)}-${String(normals.periodEndYear)} ` +
        `is not two ascending integer years.`,
    );
  }

  if (!Array.isArray(normals.months)) {
    throw new ClimateNormalsShapeError(`${plateCode}: "months" is not an array.`);
  }
  for (const [index, month] of normals.months.entries()) {
    if (month === null || typeof month !== 'object' || Array.isArray(month)) {
      throw new ClimateNormalsShapeError(
        `${plateCode}: months[${String(index)}] is not an object.`,
      );
    }
    assertExactKeys(plateCode, `months[${String(index)}]`, month, CLIMATE_MONTHLY_KEYS);
  }

  // Completeness + ordering, via the one definition of the rule.
  const reason = findUnpublishableReason(normals);
  if (reason !== null) {
    throw new ClimateNormalsShapeError(
      `${plateCode}: ${reason} — this series must not be written.`,
    );
  }

  // Physical floor. Weak on its own — it cannot see a plausible-but-wrong value, which is what
  // the load line's manifest cross-check is for — but a negative monthly rainfall total is
  // impossible at any source, and it would silently poison the seasonal percentages (which are
  // shares of a sum) rather than merely looking odd on a chart.
  for (const month of normals.months) {
    if (month.precipitationMm < 0) {
      throw new ClimateNormalsShapeError(
        `${plateCode}: month ${String(month.month)} has negative precipitation ` +
          `${String(month.precipitationMm)} mm.`,
      );
    }
  }
}
