import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AIR_QUALITY_STEP_HOURS,
  buildIndexDto,
  buildSeriesDto,
  CAMS_GRID_RESOLUTION_DEGREES,
  compileRun,
  describeUnreadableRow,
  normaliseConcentration,
  selectStepIndex,
  unavailableIndexDto,
  type CompilableRow,
  type CompilableRun,
  type CompiledRun,
} from './air-quality-compile';
import {
  AirQualityCategory,
  AirQualityFreshness,
  AirQualityPollutant,
  AirQualityStatus,
  ALL_AIR_QUALITY_POLLUTANTS,
} from './air-quality.types';
import type {
  AirQualityStoredConcentrations,
  AirQualityStoredSupport,
} from './entities/air-quality-run.entity';

/**
 * Unit tests for the pure read-path compile.
 *
 * STRUCTURAL only (CONVENTIONS §2): every concentration below is synthetic and no assertion
 * claims a real-world air-quality fact. What is pinned is shape, length, contiguity, product
 * boundary, status mapping and the refusal branches — the invariants a silent failure would break.
 */

const RUN_UTC = new Date('2026-08-02T00:00:00.000Z');
const MS_PER_HOUR = 3_600_000;

function block(
  steps: number,
  fill: (index: number) => number | null,
): AirQualityStoredConcentrations {
  const values = {} as AirQualityStoredConcentrations;
  for (const pollutant of ALL_AIR_QUALITY_POLLUTANTS) {
    values[pollutant] = Array.from({ length: steps }, (_unused, index) => fill(index));
  }
  return values;
}

function support(verdict: 'ok' | 'not_supported' = 'ok'): AirQualityStoredSupport {
  const verdicts = {} as AirQualityStoredSupport;
  for (const pollutant of ALL_AIR_QUALITY_POLLUTANTS) verdicts[pollutant] = verdict;
  return verdicts;
}

function run(overrides: Partial<CompilableRun> = {}): CompilableRun {
  return {
    runUtc: RUN_UTC,
    // A SPAN: 3 means four forecast steps.
    forecastHours: 3,
    analysisHours: 0,
    datasetId: 'cams-europe-air-quality-forecasts',
    ...overrides,
  };
}

function row(overrides: Partial<CompilableRow> = {}): CompilableRow {
  return {
    plateCode: '06',
    gridLatitude: 39.95,
    gridLongitude: 32.85,
    distanceKm: 3.1,
    concentrations: block(4, (index) => 10 + index),
    support: support(),
    analysisConcentrations: null,
    analysisSupport: null,
    ingestedAt: new Date('2026-08-02T06:00:00.000Z'),
    ...overrides,
  };
}

function okRun(input: { run?: CompilableRun; rows?: CompilableRow[] } = {}): CompiledRun {
  const outcome = compileRun({ run: input.run ?? run(), rows: input.rows ?? [row()] });
  if (outcome.kind !== 'ok') throw new Error(`expected a compilable run, got ${outcome.kind}`);
  return outcome.run;
}

describe('compileRun — the analysis ⊕ forecast merge', () => {
  it('derives the step count from the ARRAYS and publishes forecastHours + 1 steps', () => {
    const compiled = okRun();
    expect(compiled.timesUtc).toHaveLength(4);
    expect(compiled.timesUtc[0]).toBe(RUN_UTC.toISOString());
    expect(compiled.stepHours).toBe(AIR_QUALITY_STEP_HOURS);
    expect(compiled.horizonEndUtc).toBe(compiled.timesUtc[compiled.timesUtc.length - 1]);
  });

  it('starts the series analysisHours BEFORE the run when an analysis product exists', () => {
    const compiled = okRun({
      run: run({ analysisHours: 2 }),
      rows: [row({ analysisConcentrations: block(2, () => 5), analysisSupport: support() })],
    });
    expect(compiled.timesUtc).toHaveLength(6);
    expect(compiled.timesUtc[0]).toBe(new Date(RUN_UTC.getTime() - 2 * MS_PER_HOUR).toISOString());
    // The seam is the run base time exactly — never a fabricated instant.
    expect(compiled.analysisEndUtc).toBe(RUN_UTC.toISOString());
    expect(compiled.timesUtc[2]).toBe(compiled.analysisEndUtc);
  });

  it('publishes analysisEndUtc = null and starts AT the run when there is no analysis half', () => {
    const compiled = okRun();
    expect(compiled.analysisEndUtc).toBeNull();
    expect(compiled.timesUtc[0]).toBe(RUN_UTC.toISOString());
  });

  it('keeps every array exactly timesUtc.length long, with consecutive steps one hour apart', () => {
    const compiled = okRun({
      run: run({ analysisHours: 2 }),
      rows: [row({ analysisConcentrations: block(2, () => 5), analysisSupport: support() })],
    });
    const province = compiled.provinces[0];
    expect(province).toBeDefined();
    for (const pollutant of ALL_AIR_QUALITY_POLLUTANTS) {
      expect(province?.concentrations[pollutant]).toHaveLength(compiled.timesUtc.length);
    }
    for (let index = 1; index < compiled.timesUtc.length; index += 1) {
      const previous = new Date(String(compiled.timesUtc[index - 1])).getTime();
      const current = new Date(String(compiled.timesUtc[index])).getTime();
      expect(current - previous).toBe(MS_PER_HOUR);
    }
  });

  it('concatenates the analysis half FIRST and the forecast half after it', () => {
    const compiled = okRun({
      run: run({ analysisHours: 2 }),
      rows: [
        row({
          analysisConcentrations: block(2, () => 1),
          analysisSupport: support(),
          concentrations: block(4, () => 2),
        }),
      ],
    });
    // A structural ordering claim, not a data claim: the two halves are distinguishable and the
    // seam sits exactly where analysisEndUtc says it does.
    expect(compiled.provinces[0]?.concentrations.pm2_5).toEqual([1, 1, 2, 2, 2, 2]);
  });
});

describe('compileRun — the M9 length validation (forecastHours is a SPAN)', () => {
  it('skips a row whose forecast arrays contradict the run span, without failing the run', () => {
    const outcome = compileRun({
      run: run(),
      rows: [row({ plateCode: '06', concentrations: block(3, () => 1) }), row({ plateCode: '34' })],
    });
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.skipped.map((skip) => skip.plateCode)).toEqual(['06']);
    expect(outcome.run.provinces.map((province) => province.plateCode)).toEqual(['34']);
  });

  it('skips a row whose analysis arrays contradict analysisHours (a STEP COUNT)', () => {
    const outcome = compileRun({
      run: run({ analysisHours: 24 }),
      rows: [row({ analysisConcentrations: block(23, () => 1), analysisSupport: support() })],
    });
    expect(outcome.kind).toBe('schema_error');
  });

  it('skips a row that carries no analysis product while the run claims one', () => {
    const outcome = compileRun({ run: run({ analysisHours: 24 }), rows: [row()] });
    expect(outcome.kind).toBe('schema_error');
  });

  it('degrades to schema_error — never a throw — when NO row is readable', () => {
    const outcome = compileRun({ run: run(), rows: [row({ concentrations: block(1, () => 1) })] });
    expect(outcome.kind).toBe('schema_error');
    if (outcome.kind !== 'schema_error') return;
    expect(outcome.skipped).toHaveLength(1);
  });

  it('degrades to schema_error when the run holds no rows at all', () => {
    expect(compileRun({ run: run(), rows: [] }).kind).toBe('schema_error');
  });
});

describe('describeUnreadableRow — every branch the compile dereferences', () => {
  it('accepts the written shape', () => {
    expect(describeUnreadableRow(row(), run())).toBeNull();
  });

  it('refuses a row whose cell metadata is not the written type', () => {
    expect(describeUnreadableRow(row({ gridLatitude: Number.NaN }), run())).not.toBeNull();
    expect(
      describeUnreadableRow(row({ gridLongitude: 'north' as unknown as number }), run()),
    ).not.toBeNull();
    expect(
      describeUnreadableRow(row({ distanceKm: Number.POSITIVE_INFINITY }), run()),
    ).not.toBeNull();
    expect(
      describeUnreadableRow(row({ ingestedAt: '2026-08-02' as unknown as Date }), run()),
    ).not.toBeNull();
    expect(describeUnreadableRow(row({ ingestedAt: new Date('nope') }), run())).not.toBeNull();
  });

  it('refuses concentrations that are not an object', () => {
    const broken = row({ concentrations: null as unknown as AirQualityStoredConcentrations });
    expect(describeUnreadableRow(broken, run())).toContain('not an object');
  });

  it('refuses a missing pollutant array', () => {
    const partial = block(4, () => 1);
    const broken = { ...partial, o3: undefined } as unknown as AirQualityStoredConcentrations;
    expect(describeUnreadableRow(row({ concentrations: broken }), run())).toContain('not an array');
  });

  it('refuses a RAGGED concentration block (a jsonb shape the entity type cannot enforce)', () => {
    const ragged = { ...block(4, () => 1), so2: [1, 2] } as AirQualityStoredConcentrations;
    expect(describeUnreadableRow(row({ concentrations: ragged }), run())).toContain('ragged');
  });

  it('refuses a support object missing a verdict', () => {
    const broken = { ...support(), no2: 'maybe' } as unknown as AirQualityStoredSupport;
    expect(describeUnreadableRow(row({ support: broken }), run())).toContain('support verdict');
  });

  it('refuses analysisSupport present while analysisConcentrations is null', () => {
    expect(describeUnreadableRow(row({ analysisSupport: support() }), run())).not.toBeNull();
  });

  it('refuses a row with no plate code (the province join did not resolve)', () => {
    // Routed through the loud skip path on purpose: a row nothing can match would otherwise
    // compile fine and turn the hub silently all-unavailable.
    expect(describeUnreadableRow(row({ plateCode: '' }), run())).toContain('plate code');
  });
});

describe('R2 — negative and non-finite concentrations never reach the EAQI band lookup', () => {
  it('normalises null, non-finite and negative values to null', () => {
    expect(normaliseConcentration(null)).toBeNull();
    expect(normaliseConcentration(undefined)).toBeNull();
    expect(normaliseConcentration(Number.NaN)).toBeNull();
    expect(normaliseConcentration(Number.POSITIVE_INFINITY)).toBeNull();
    expect(normaliseConcentration(-999)).toBeNull();
    expect(normaliseConcentration(0)).toBe(0);
    expect(normaliseConcentration(12.5)).toBe(12.5);
  });

  it('counts every substituted value so the condition can never be silent', () => {
    const outcome = compileRun({
      run: run(),
      rows: [row({ concentrations: block(4, (index) => (index === 0 ? -999 : 1)) })],
    });
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    // One substituted step × five pollutants.
    expect(outcome.normalisedValues).toBe(5);
    expect(outcome.run.provinces[0]?.concentrations.pm2_5[0]).toBeNull();
  });

  it('does NOT count genuinely absent values as substitutions', () => {
    const outcome = compileRun({
      run: run(),
      rows: [row({ concentrations: block(4, () => null) })],
    });
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.normalisedValues).toBe(0);
  });

  it('builds an index from a −999 row WITHOUT throwing (subIndexBand would RangeError)', () => {
    // The COMPILE-time half of R2: `subIndexBand` throws on a negative, that throw would escape
    // the never-throw refresh closure, and the public page would answer 500 on the cold path.
    const compiled = okRun({ rows: [row({ concentrations: block(4, () => -999) })] });
    const province = compiled.provinces[0];
    expect(province).toBeDefined();
    if (province === undefined) return;
    const index = buildIndexDto({
      compiled,
      province,
      stepIndex: 0,
      provenance: { freshness: null, fetchedAtUtc: null, staleSinceUtc: null },
    });
    expect(index.status).toBe(AirQualityStatus.NoData);
    expect(index.band).toBeNull();
    expect(index.missingPollutants).toHaveLength(5);
    // The published raw value is null, not the sentinel: a −999 must never be shown as a number.
    expect(index.pollutants.every((pollutant) => pollutant.value === null)).toBe(true);
  });

  it('builds the whole SERIES from a −999 row without throwing', () => {
    const compiled = okRun({ rows: [row({ concentrations: block(4, () => -999) })] });
    const province = compiled.provinces[0];
    if (province === undefined) throw new Error('missing province');
    const series = buildSeriesDto(compiled, province);
    expect(series.bands).toEqual([null, null, null, null]);
    expect(series.concentrations.pm2_5).toEqual([null, null, null, null]);
  });

  it('counts a substituted value that was NOT a number (a corrupted jsonb block)', () => {
    // CR-7 / SFH-3: counting gated on `typeof raw === 'number'` meant a stored block of
    // `["12","13"]` compiled clean, published an all-null series and incremented nothing —
    // indistinguishable from a legitimate `no_data`. jsonb is schemaless: this shape is exactly
    // what the entity type only CLAIMS is impossible.
    const corrupted = block(4, () => null) as unknown as Record<string, unknown[]>;
    for (const pollutant of ALL_AIR_QUALITY_POLLUTANTS) {
      corrupted[pollutant] = ['12', true, null, {}];
    }
    const outcome = compileRun({
      run: run(),
      rows: [row({ concentrations: corrupted as unknown as AirQualityStoredConcentrations })],
    });
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    // Three present-but-unusable values per pollutant × five pollutants; the `null` step is a
    // genuine absence and is still not counted.
    expect(outcome.normalisedValues).toBe(15);
  });
});

/**
 * The POST-CACHE half of R2 — the pass that exists for a cache entry written by an EARLIER
 * deployment, which never went through today's `compileRun`.
 *
 * ## Why these tests bypass `compileRun` (review #84, the downgraded CRITICAL)
 * The two tests above build their input through `okRun()` → `compileRun()`, which already nulls
 * the −999 before `buildIndexDto` runs — so what reaches the post-cache call is a NULL row, not a
 * negative one, and deleting the second `normaliseConcentration` call left the whole suite green.
 * The layer looked covered and was not. A `CompiledRun` is therefore hand-constructed here,
 * carrying a raw −999 in a shape the compile layer would never emit, which is precisely the state
 * a cross-deploy cache entry can be in.
 */
describe('R2 post-cache — a CACHED payload carrying a raw −999', () => {
  /** A `CompiledRun` as it comes back from Redis: shaped like the type, never compiled by us. */
  function cachedRunWith(value: number): CompiledRun {
    const concentrations = {} as Record<AirQualityPollutant, (number | null)[]>;
    const supportVerdicts = {} as Record<AirQualityPollutant, 'ok' | 'not_supported'>;
    for (const pollutant of ALL_AIR_QUALITY_POLLUTANTS) {
      concentrations[pollutant] = [value, value, value, value];
      supportVerdicts[pollutant] = 'ok';
    }
    return {
      runUtc: RUN_UTC.toISOString(),
      datasetId: 'cams-europe-air-quality-forecasts',
      analysisEndUtc: null,
      stepHours: 1,
      timesUtc: Array.from({ length: 4 }, (_unused, index) =>
        new Date(RUN_UTC.getTime() + index * MS_PER_HOUR).toISOString(),
      ),
      horizonEndUtc: new Date(RUN_UTC.getTime() + 3 * MS_PER_HOUR).toISOString(),
      provinces: [
        {
          plateCode: '06',
          gridLatitude: 39.95,
          gridLongitude: 32.85,
          distanceKm: 3.1,
          ingestedAtUtc: RUN_UTC.toISOString(),
          concentrations,
          support: supportVerdicts,
        },
      ],
    };
  }

  it('buildIndexDto does not throw, publishes no number, and COUNTS the substitutions', () => {
    const compiled = cachedRunWith(-999);
    const province = compiled.provinces[0];
    if (province === undefined) throw new Error('missing province');
    const tally = { count: 0 };

    const index = buildIndexDto({
      compiled,
      province,
      stepIndex: 0,
      provenance: { freshness: null, fetchedAtUtc: null, staleSinceUtc: null },
      tally,
    });

    expect(index.band).toBeNull();
    expect(index.status).toBe(AirQualityStatus.NoData);
    expect(index.pollutants.every((pollutant) => pollutant.value === null)).toBe(true);
    // One step × five pollutants — the pass is no longer silent (review #84 I2).
    expect(tally.count).toBe(5);
  });

  it('buildSeriesDto does not throw and counts every step it substituted', () => {
    const compiled = cachedRunWith(-999);
    const province = compiled.provinces[0];
    if (province === undefined) throw new Error('missing province');
    const tally = { count: 0 };

    const series = buildSeriesDto(compiled, province, tally);

    expect(series.bands).toEqual([null, null, null, null]);
    // …and the PUBLISHED raw values are null too: a sentinel must never be shown as a number on
    // this path either, not only kept out of the band lookup.
    expect(series.concentrations.pm2_5).toEqual([null, null, null, null]);
    expect(series.concentrations.o3).toEqual([null, null, null, null]);
    // Four steps × five pollutants.
    expect(tally.count).toBe(20);
  });

  it('counts nothing when the cached payload is clean', () => {
    const compiled = cachedRunWith(12);
    const province = compiled.provinces[0];
    if (province === undefined) throw new Error('missing province');
    const tally = { count: 0 };
    buildSeriesDto(compiled, province, tally);
    expect(tally.count).toBe(0);
  });
});

describe('selectStepIndex — nearest step, no interpolation', () => {
  const times = Array.from({ length: 4 }, (_unused, index) =>
    new Date(RUN_UTC.getTime() + index * MS_PER_HOUR).toISOString(),
  );

  it('picks the step exactly on now', () => {
    expect(selectStepIndex(times, RUN_UTC.getTime() + 2 * MS_PER_HOUR)).toBe(2);
  });

  it('picks the nearest step for an instant between two steps', () => {
    expect(selectStepIndex(times, RUN_UTC.getTime() + 2 * MS_PER_HOUR + 20 * 60_000)).toBe(2);
    expect(selectStepIndex(times, RUN_UTC.getTime() + 2 * MS_PER_HOUR + 40 * 60_000)).toBe(3);
  });

  it('clamps to the nearest END step when now falls outside the series', () => {
    expect(selectStepIndex(times, RUN_UTC.getTime() - 10 * MS_PER_HOUR)).toBe(0);
    expect(selectStepIndex(times, RUN_UTC.getTime() + 99 * MS_PER_HOUR)).toBe(3);
  });

  it('returns null for an empty axis rather than a fabricated index', () => {
    expect(selectStepIndex([], RUN_UTC.getTime())).toBeNull();
  });
});

describe('buildIndexDto — SPEC §7.4 status mapping', () => {
  const provenance = {
    freshness: AirQualityFreshness.Fresh,
    fetchedAtUtc: '2026-08-02T06:00:00.000Z',
    staleSinceUtc: null,
  };

  function indexFor(rowOverrides: Partial<CompilableRow>, stepIndex = 0) {
    const compiled = okRun({ rows: [row(rowOverrides)] });
    const province = compiled.provinces[0];
    if (province === undefined) throw new Error('missing province');
    return buildIndexDto({ compiled, province, stepIndex, provenance });
  }

  it('calls the shared EAQI module rather than re-deriving a band table', () => {
    const index = indexFor({});
    // Structural: whatever band the shared table yields, the dominant pollutant must be one that
    // actually reached the worst band, and category/band must agree with each other.
    expect(index.band).not.toBeNull();
    expect(index.category).not.toBeNull();
    expect(Object.values(AirQualityCategory)).toContain(index.category);
    expect(index.status).toBe(AirQualityStatus.Ok);
  });

  it('breaks a dominant-pollutant tie by the published order, not by iteration luck', () => {
    // All five pollutants equal ⇒ several share the worst band; the tie-break order's first
    // member must win. The order itself is owned and tested by `eaqi/`.
    const index = indexFor({ concentrations: block(4, () => 500) });
    expect(index.dominantPollutant).toBe(AirQualityPollutant.Pm2_5);
  });

  it('publishes a PARTIAL index and names what is missing', () => {
    const partial = { ...block(4, () => 10), so2: [null, null, null, null] };
    const index = indexFor({ concentrations: partial });
    expect(index.status).toBe(AirQualityStatus.Ok);
    expect(index.band).not.toBeNull();
    expect(index.missingPollutants).toEqual([AirQualityPollutant.So2]);
    const so2 = index.pollutants.find((entry) => entry.pollutant === AirQualityPollutant.So2);
    expect(so2?.status).toBe(AirQualityStatus.NoData);
  });

  it('maps a structurally unsupported pollutant to not_supported, not to no_data', () => {
    const verdicts = { ...support(), o3: 'not_supported' } as AirQualityStoredSupport;
    const index = indexFor({ support: verdicts });
    const o3 = index.pollutants.find((entry) => entry.pollutant === AirQualityPollutant.O3);
    expect(o3?.status).toBe(AirQualityStatus.NotSupported);
    expect(o3?.value).toBeNull();
    expect(index.missingPollutants).toContain(AirQualityPollutant.O3);
  });

  it('collapses to no_data with null band/category/dominant when all five are missing', () => {
    const index = indexFor({ concentrations: block(4, () => null) });
    expect(index.status).toBe(AirQualityStatus.NoData);
    expect(index.band).toBeNull();
    expect(index.category).toBeNull();
    expect(index.dominantPollutant).toBeNull();
    expect(index.missingPollutants).toHaveLength(5);
  });

  it('nulls freshness whenever status is not ok (the DTO invariant)', () => {
    expect(indexFor({}).freshness).toBe(AirQualityFreshness.Fresh);
    expect(indexFor({ concentrations: block(4, () => null) }).freshness).toBeNull();
  });

  it('publishes the run, ingest and compile instants as three separate facts', () => {
    const index = indexFor({}, 1);
    expect(index.modelRunAtUtc).toBe(RUN_UTC.toISOString());
    expect(index.ingestedAtUtc).toBe('2026-08-02T06:00:00.000Z');
    expect(index.fetchedAtUtc).toBe(provenance.fetchedAtUtc);
    expect(index.validAtUtc).toBe(new Date(RUN_UTC.getTime() + MS_PER_HOUR).toISOString());
  });
});

describe('unavailableIndexDto — the cold value', () => {
  it('carries no value, no provenance and no freshness, but still names what is missing', () => {
    const index = unavailableIndexDto();
    expect(index.status).toBe(AirQualityStatus.Unavailable);
    expect(index.band).toBeNull();
    expect(index.freshness).toBeNull();
    expect(index.pollutants).toHaveLength(0);
    expect(index.missingPollutants).toHaveLength(5);
    expect(index.validAtUtc).toBeNull();
    expect(index.modelRunAtUtc).toBeNull();
    expect(index.ingestedAtUtc).toBeNull();
    expect(index.datasetId).toBeNull();
    expect(index.gridLatitude).toBeNull();
  });
});

describe('buildSeriesDto — the published series invariants', () => {
  it('keeps every array exactly timesUtc.length long', () => {
    const compiled = okRun({
      run: run({ analysisHours: 2 }),
      rows: [row({ analysisConcentrations: block(2, () => 5), analysisSupport: support() })],
    });
    const province = compiled.provinces[0];
    if (province === undefined) throw new Error('missing province');
    const series = buildSeriesDto(compiled, province);
    const expected = series.timesUtc.length;
    expect(series.bands).toHaveLength(expected);
    expect(series.categories).toHaveLength(expected);
    expect(series.dominantPollutants).toHaveLength(expected);
    for (const values of Object.values(series.concentrations)) {
      expect(values).toHaveLength(expected);
    }
    expect(series.analysisEndUtc).toBe(compiled.analysisEndUtc);
    expect(series.horizonEndUtc).toBe(series.timesUtc[expected - 1]);
  });

  it('copies the arrays so a consumer cannot mutate the cached run', () => {
    const compiled = okRun();
    const province = compiled.provinces[0];
    if (province === undefined) throw new Error('missing province');
    const series = buildSeriesDto(compiled, province);
    series.timesUtc.push('mutated');
    series.concentrations.pm2_5.push(999);
    expect(compiled.timesUtc).toHaveLength(4);
    expect(province.concentrations.pm2_5).toHaveLength(4);
  });
});

describe('gridResolutionDegrees is auditable against the measured provider grid', () => {
  it('matches both axis steps recorded in the committed probe artifact', () => {
    // The decoder deliberately hardcodes 0.1 nowhere (it derives the signed step from the file's
    // own axis), so this constant would otherwise be an unaudited second source of one fact.
    // Atlas ruled a constant + THIS equality test over a new stored column (plan Q4).
    const artifact = JSON.parse(
      readFileSync(
        join(__dirname, '..', '..', 'data', 'air-quality', 'air-quality-probe.json'),
        'utf8',
      ),
    ) as { latitudeAxis: { step: number }; longitudeAxis: { step: number } };

    // float32 axes are never exactly 0.1 apart — the same 1e-3 tolerance class `cams-grid.ts`
    // derives for its own equal-step guard.
    expect(Math.abs(artifact.latitudeAxis.step)).toBeCloseTo(CAMS_GRID_RESOLUTION_DEGREES, 3);
    expect(Math.abs(artifact.longitudeAxis.step)).toBeCloseTo(CAMS_GRID_RESOLUTION_DEGREES, 3);
  });
});

describe('the read path resolves nothing — no decoder ever reaches a request', () => {
  it('never imports the ZIP/NetCDF decode modules (D2 isolation, as a structural gate)', () => {
    // A2b's D2 argument is that the read path allocates no buffers and decodes nothing: it reads
    // jsonb and does ~400 band comparisons. This test turns that argument from prose into a gate —
    // a future refactor that pulls a decoder into the request path turns it red.
    const decoders = ['cams-decode', 'cams-zip', 'netcdf3'];
    for (const file of [
      'air-quality-compile.ts',
      'air-quality-series.reader.ts',
      'air-quality-read.service.ts',
      'air-quality-read.store.ts',
      'air-quality-cache-age.interceptor.ts',
    ]) {
      const source = readFileSync(join(__dirname, file), 'utf8');
      const specifiers = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1] ?? '');
      const offenders = specifiers.filter((specifier) =>
        decoders.some((decoder) => specifier.includes(decoder)),
      );
      expect(`${file} imports: [${offenders.join(', ')}]`).toBe(`${file} imports: []`);
    }
  });
});
