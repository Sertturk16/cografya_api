import { describe, expect, it } from '@jest/globals';
import { validateEnv } from '../../config/env.schema';
import { EarthquakeIngestJobKind } from '../../earthquake/earthquake.types';
import {
  buildBackfillRunInput,
  DEFAULT_SAFETY_LIMIT,
  DEFAULT_SCOPE_BUFFER_KM,
  DEFAULT_STALE_MAX_SECONDS,
  parseEarthquakePhase,
  parseIsoDay,
  readPositiveIntEnv,
  type BackfillTally,
} from './earthquake.cli';

/**
 * The hand-run earthquake CLI's argument and environment guards.
 *
 * Every sibling import CLI has a spec over its parsers; this one exported them "so a spec may
 * import the parsers above" and then had none (review #118 TA118-M2). The guards below are what
 * keep a forgotten flag from making a network call and a mistyped knob from classifying ~33 000
 * historical rows on a rule nobody chose.
 */

/** The three variables with no safe default, so `validateEnv` can be asked about the rest. */
const BOOT_MINIMUM = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  WEB_ORIGIN: 'http://localhost:3000',
};

describe('parseEarthquakePhase', () => {
  it.each(['probe', 'boundary', 'backfill'] as const)('accepts --phase=%s', (phase) => {
    expect(parseEarthquakePhase([`--phase=${phase}`])).toBe(phase);
  });

  it('refuses a MISSING phase rather than defaulting to one', () => {
    // The whole reason there is no default: `probe` is the phase that touches the network, so
    // defaulting to it puts a provider call in whatever script forgets the argument — and any
    // other default makes a typo silently skip the work somebody meant to do.
    expect(() => parseEarthquakePhase([])).toThrow(/--phase=""/);
  });

  it.each(['--phase=Probe', '--phase=load', '--phase=', '--phase=probe '])(
    'refuses %s',
    (argument) => {
      expect(() => parseEarthquakePhase([argument])).toThrow(/Usage:/);
    },
  );

  it('reads the flag wherever it sits in argv', () => {
    expect(parseEarthquakePhase(['--from=2025-01-01', '--phase=backfill'])).toBe('backfill');
  });
});

describe('parseIsoDay', () => {
  it('reads a plain day as its UTC midnight', () => {
    expect(parseIsoDay('2026-08-17')?.toISOString()).toBe('2026-08-17T00:00:00.000Z');
  });

  it.each(['2026-02-30', '2025-02-29', '2026-04-31'])(
    'rejects %s instead of rolling it over into the next month',
    (raw) => {
      // `new Date('2026-02-30T00:00:00.000Z')` is NOT Invalid Date — it is 2 March. Without the
      // component comparison, `--from=2026-02-30` loads a range starting on a day nobody typed.
      expect(parseIsoDay(raw)).toBeNull();
    },
  );

  it('accepts a real leap day, so the check above refuses only what is impossible', () => {
    expect(parseIsoDay('2024-02-29')?.toISOString()).toBe('2024-02-29T00:00:00.000Z');
  });

  it('rejects an impossible month, which the constructor does catch on its own', () => {
    expect(parseIsoDay('2026-13-01')).toBeNull();
  });

  it.each(['2026-8-17', '17/08/2026', '2026-08-17T00:00:00', 'yesterday', '', undefined])(
    'refuses %s',
    (raw) => {
      expect(parseIsoDay(raw)).toBeNull();
    },
  );
});

describe('readPositiveIntEnv', () => {
  it('falls back when the variable is absent or blank — a fresh clone sets neither', () => {
    expect(readPositiveIntEnv({}, 'X', 200)).toBe(200);
    expect(readPositiveIntEnv({ X: '' }, 'X', 200)).toBe(200);
    expect(readPositiveIntEnv({ X: '   ' }, 'X', 200)).toBe(200);
  });

  it('takes the operator’s value when there is one', () => {
    expect(readPositiveIntEnv({ X: '300' }, 'X', 200)).toBe(300);
  });

  it.each(['0', '-1', '2.5', 'abc', 'NaN', '20 000'])(
    'refuses %s instead of falling back',
    (raw) => {
      // Refusing is the point. Quietly classifying ~33 000 rows on the default while the operator
      // believes their number took effect is the drift CODE118-I1 describes, one level deeper.
      expect(() => readPositiveIntEnv({ X: raw }, 'X', 200)).toThrow(/positive integer/);
    },
  );

  it('accepts exactly what the boot schema’s own coercion accepts', () => {
    // `z.coerce.number().int().positive()` is `Number()` plus the same two tests, so `1e3` is 1000
    // on both sides. Agreeing with the schema is the whole point of this reader; being STRICTER
    // than it would make a value the server boots with refuse the backfill.
    expect(readPositiveIntEnv({ X: '1e3' }, 'X', 200)).toBe(1000);
    const coerced = validateEnv({ ...BOOT_MINIMUM, EARTHQUAKE_SCOPE_BUFFER_KM: '1e3' });
    expect(coerced.EARTHQUAKE_SCOPE_BUFFER_KM).toBe(1000);
  });
});

describe('the backfill’s fallbacks match the boot schema', () => {
  /**
   * The invariant `earthquake-row.ts` states — "two callers must classify identically" — applied to
   * the PARAMETER rather than the function. Both values are read from the environment at run time,
   * so these constants only matter when nothing is set; a fallback disagreeing with the schema
   * would make an unconfigured backfill differ from an unconfigured server.
   */
  const schemaDefaults = validateEnv(BOOT_MINIMUM);

  it('uses the schema default for the scope buffer', () => {
    expect(DEFAULT_SCOPE_BUFFER_KM).toBe(schemaDefaults.EARTHQUAKE_SCOPE_BUFFER_KM);
  });

  it('uses the schema default for the safety limit', () => {
    expect(DEFAULT_SAFETY_LIMIT).toBe(schemaDefaults.EARTHQUAKE_SAFETY_LIMIT);
  });

  it('uses the schema default for the freshness budget', () => {
    // Same invariant, applied to the budget the ledger verdict is measured against: a backfill
    // judging its own coverage by 3 h while the server publishes `ok` for 6 h would anchor rows the
    // read side would then call fresh, or refuse rows it would not.
    expect(DEFAULT_STALE_MAX_SECONDS).toBe(schemaDefaults.EARTHQUAKE_STALE_MAX_SECONDS);
  });
});

/**
 * The ledger row the historical load writes — `FU-E2-BACKFILL-RUNROW`'s permanent fix.
 *
 * The property under test is not "a row exists" but WHICH of the two columns the read path keys on
 * it sets. `EarthquakeReadStore.newestSuccessfulRunFinishedAt` publishes freshness from rows with
 * `outcome = 'ok'` AND `error_reason IS NULL`, so every case below is really an assertion about
 * whether this load is allowed to anchor `dataUpdatedAtUtc`.
 */
describe('buildBackfillRunInput', () => {
  const STARTED = new Date('2026-08-20T09:00:00.000Z');
  const FINISHED = new Date('2026-08-20T09:12:00.000Z');
  // The go-live shape the runbook now spells out: `--to` is TOMORROW's midnight, so the load's
  // coverage runs past the moment it finishes. `--to=<today>` would end 9 h before it — a gap the
  // freshness case below is about, not the default this fixture should encode.
  const FROM = new Date('2025-08-21T00:00:00.000Z');
  const TO = new Date('2026-08-21T00:00:00.000Z');

  const tally = (overrides: Partial<BackfillTally> = {}): BackfillTally => ({
    windows: 53,
    fetched: 33_000,
    inserted: 33_000,
    updated: 0,
    unchanged: 0,
    rejected: 0,
    skippedOutOfScope: 120,
    ...overrides,
  });

  const build = (
    overrides: {
      tally?: BackfillTally;
      failure?: string | null;
      rejectionReasons?: ReadonlySet<string>;
      windowStartUtc?: Date;
      windowEndUtc?: Date;
    } = {},
  ): ReturnType<typeof buildBackfillRunInput> =>
    buildBackfillRunInput({
      startedAtUtc: STARTED,
      finishedAtUtc: FINISHED,
      windowStartUtc: overrides.windowStartUtc ?? FROM,
      windowEndUtc: overrides.windowEndUtc ?? TO,
      tally: overrides.tally ?? tally(),
      failure: overrides.failure ?? null,
      rejectionReasons: overrides.rejectionReasons ?? new Set<string>(),
      staleMaxSeconds: DEFAULT_STALE_MAX_SECONDS,
    });

  it('files the load under its own job kind, never under a cadence', () => {
    // A backfill recorded as `recent` would be indistinguishable from a 5-minute tour in the
    // ledger, which is the one place the difference is auditable afterwards.
    expect(build().jobKind).toBe(EarthquakeIngestJobKind.Backfill);
  });

  it('records the OPERATOR-requested range as the window, not the last chunk', () => {
    const input = build();
    expect(input.windowStartUtc).toBe(FROM);
    expect(input.windowEndUtc).toBe(TO);
  });

  it('anchors freshness on a completed load — clean ok, no reason', () => {
    const input = build();
    expect(input.outcome).toBe('ok');
    expect(input.errorReason).toBeNull();
    expect(input.fetchedCount).toBe(33_000);
    expect(input.insertedCount).toBe(33_000);
    expect(input.skippedOutOfScopeCount).toBe(120);
  });

  it('anchors nothing when the load stopped part-way', () => {
    const input = build({ failure: 'backfill stopped at 2025-11-04 00:00:00: HTTP 503.' });
    // Not `ok`, so the read path skips it — while the row still records that a load ran and how
    // far it got, which is what tells "this load failed" from "no load ever ran".
    expect(input.outcome).toBe('transient');
    expect(input.errorReason).toContain('HTTP 503');
    expect(input.insertedCount).toBe(33_000);
  });

  it('refuses to anchor a load whose rows all bounced off the store', () => {
    // The parser-break shape: the provider answered, nothing landed. The CALL succeeded, so the
    // outcome word stays `ok` — the reason is what keeps it out of the freshness query.
    const input = build({
      tally: tally({ inserted: 0, updated: 0, unchanged: 0, rejected: 33_000 }),
      rejectionReasons: new Set(['date is missing or not a string', 'type is longer than allowed']),
    });
    expect(input.outcome).toBe('ok');
    expect(input.errorReason).toContain('33000 row(s)');
    expect(input.errorReason).toContain('date is missing or not a string');
  });

  it('treats an empty historical range as a clean load, not a fault', () => {
    // Nothing fetched and nothing stored is a fact about the range asked for. Flagging it would
    // make a legitimately quiet window look like a broken pipeline.
    const input = build({
      tally: tally({ fetched: 0, inserted: 0, updated: 0, unchanged: 0, skippedOutOfScope: 0 }),
    });
    expect(input.outcome).toBe('ok');
    expect(input.errorReason).toBeNull();
  });

  it('counts a re-run that changed nothing as having reached the store', () => {
    // The load is idempotent, so a second run over the same range legitimately writes no row at
    // all. Reading that as "nothing reached the store" would file a healthy re-run as degraded.
    const input = build({ tally: tally({ inserted: 0, updated: 0, unchanged: 33_000 }) });
    expect(input.outcome).toBe('ok');
    expect(input.errorReason).toBeNull();
  });

  it('refuses to anchor a HISTORICAL repair, whose coverage is nowhere near the run', () => {
    // Review #125 SFH125-I1. `--from=2025-11-01 --to=2025-12-01` run during a two-day ingest
    // outage: the call succeeds, so the outcome word stays `ok`, but letting it anchor would flip
    // the public pages from an honest `stale` to `ok` with `dataUpdatedAtUtc` = now over a list
    // frozen two days ago. The reason is what keeps it out of the freshness query.
    const input = build({
      windowStartUtc: new Date('2025-11-01T00:00:00.000Z'),
      windowEndUtc: new Date('2025-12-01T00:00:00.000Z'),
    });
    expect(input.outcome).toBe('ok');
    expect(input.errorReason).toContain('not current coverage');
    expect(input.errorReason).toContain('2025-12-01T00:00:00.000Z');
    // Still a full record of what the load did — it is the ANCHOR that is withheld, not the row.
    expect(input.insertedCount).toBe(33_000);
  });

  it('still anchors a load whose coverage ends exactly on the freshness budget', () => {
    // The boundary belongs to the side that does not raise an alarm, matching
    // `resolveEarthquakeFreshness`'s own `<=` at the other end of the same budget.
    const input = build({
      windowEndUtc: new Date(FINISHED.getTime() - DEFAULT_STALE_MAX_SECONDS * 1000),
    });
    expect(input.outcome).toBe('ok');
    expect(input.errorReason).toBeNull();
  });

  it('records BOTH degradations when a stale-coverage load also stored nothing', () => {
    // The two reasons are independent, and the parser break is the louder one — `recordRun`
    // truncates at 500 chars keeping the leading text, so it has to come first.
    const input = build({
      windowStartUtc: new Date('2025-11-01T00:00:00.000Z'),
      windowEndUtc: new Date('2025-12-01T00:00:00.000Z'),
      tally: tally({ inserted: 0, updated: 0, unchanged: 0, rejected: 33_000 }),
      rejectionReasons: new Set(['date is missing or not a string']),
    });
    expect(input.outcome).toBe('ok');
    expect(input.errorReason).toMatch(/^the provider returned 33000 row\(s\)/);
    expect(input.errorReason).toContain('not current coverage');
  });
});
