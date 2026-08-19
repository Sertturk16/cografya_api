import { describe, expect, it } from '@jest/globals';
import { validateEnv } from '../../config/env.schema';
import {
  DEFAULT_SAFETY_LIMIT,
  DEFAULT_SCOPE_BUFFER_KM,
  parseEarthquakePhase,
  parseIsoDay,
  readPositiveIntEnv,
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
