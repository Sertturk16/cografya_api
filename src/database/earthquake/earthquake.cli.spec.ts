import { describe, expect, it } from '@jest/globals';
import { validateEnv } from '../../config/env.schema';
import { EarthquakeIngestJobKind } from '../../earthquake/earthquake.types';
import {
  buildBackfillRunInput,
  DEFAULT_SAFETY_LIMIT,
  DEFAULT_SCOPE_BUFFER_KM,
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
  const FROM = new Date('2025-08-20T00:00:00.000Z');
  const TO = new Date('2026-08-20T00:00:00.000Z');

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
    } = {},
  ): ReturnType<typeof buildBackfillRunInput> =>
    buildBackfillRunInput({
      startedAtUtc: STARTED,
      finishedAtUtc: FINISHED,
      windowStartUtc: FROM,
      windowEndUtc: TO,
      tally: overrides.tally ?? tally(),
      failure: overrides.failure ?? null,
      rejectionReasons: overrides.rejectionReasons ?? new Set<string>(),
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
});
