import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';
import { checkEnvBound, type EnvBoundCheck, type EnvIssueCollector } from './env-bounds';

/**
 * A real zod refinement context satisfies {@link EnvIssueCollector} — checked by the COMPILER, not
 * by a comment.
 *
 * This is the one thing a helper written before its call sites cannot otherwise know: that it will
 * actually drop into `env.schema.ts`'s `superRefine`. If zod's context ever stops fitting, this
 * line stops compiling and `Typecheck & Lint` says so, instead of the mismatch surfacing during
 * the conversion.
 *
 * `Typecheck & Lint` is named deliberately: `tsconfig.unit-spec.json` sets `isolatedModules: true`,
 * so ts-jest transpiles without type-checking and `Test (unit)` holds NOTHING of this proof. A
 * green unit run is not evidence for the line below; the typecheck job is.
 */
const acceptsARealRefinementContext: (ctx: z.core.$RefinementCtx) => EnvIssueCollector = (ctx) =>
  ctx;

interface RecordedIssue {
  code: string;
  path: string[];
  message: string;
}

function collect(): { ctx: EnvIssueCollector; issues: RecordedIssue[] } {
  const issues: RecordedIssue[] = [];
  return {
    issues,
    ctx: {
      addIssue: (issue) => {
        issues.push({ code: issue.code, path: issue.path, message: issue.message });
      },
    },
  };
}

function issuesFor(check: EnvBoundCheck): RecordedIssue[] {
  const { ctx, issues } = collect();
  checkEnvBound(ctx, check);
  return issues;
}

/**
 * `env.schema.ts`, with its string-concatenation seams folded away and whitespace collapsed.
 *
 * The schema writes each message as `'… — a single ' + 'call cannot …'` across two source lines,
 * so a raw substring search would miss every one of them. Removing the `' + '` seam and
 * collapsing runs of whitespace reconstructs exactly the string the file composes at runtime,
 * without evaluating it.
 */
const FOLDED_SCHEMA_SOURCE = readFileSync(join(__dirname, 'env.schema.ts'), 'utf8')
  .replace(/'\s*\+\s*'/g, '')
  .replace(/\s+/g, ' ');

/**
 * A HAND-WRITTEN bound message as the schema shapes one: `<VAR>[ + <VAR>…] <phrase> <VAR>`.
 *
 * Anchored on the variable names so that the same phrase appearing in an explanatory COMMENT
 * ("a tour budget must not exceed the tour that hosts it") is not miscounted as a rule. Verified
 * against a deliberately perturbed copy: adding a fourteenth hand-written cross-check moves the
 * count, adding the sentence above to a comment does not.
 *
 * **What it cannot see, and why the second pattern below exists.** A bound expressed through
 * `checkEnvBound` composes its message at RUNTIME, so no bound sentence appears in the source at
 * all. When B4 added five such call sites this regex still returned thirteen, and every case in
 * this file stayed green while the schema ran eighteen bounds — the exact blindness the
 * reverse-direction case was written to remove, in a form it could not detect (PR #111 CODE111-M3).
 */
const BOUND_MESSAGE =
  /[A-Z][A-Z0-9_]*(?: \+ [A-Z][A-Z0-9_]*)* (?:must not exceed|must be smaller than|must be shorter than) [A-Z][A-Z0-9_]*/g;

/**
 * A bound expressed through the helper instead. One match per call site.
 *
 * The import (`import { checkEnvBound } from './env-bounds'`) carries no opening parenthesis, so it
 * is not counted — verified with a positive control: the pattern reports 5 against the file today
 * and 6 against a copy with one call site duplicated.
 */
const HELPER_BOUND_CALL = /checkEnvBound\(/g;

/**
 * How many bounds `env.schema.ts` expresses through the helper today.
 *
 * A DECLARED number rather than a derived one, on purpose: the whole job of the two counts below is
 * to fail when somebody adds a bound without recording it here, and a number read off the file it
 * is meant to guard could never do that.
 */
const HELPER_BOUND_COUNT = 5;

/**
 * The thirteen cross-checks `env.schema.ts` runs today, each with values that BREACH it and the
 * message that file prints right now.
 *
 * Transcribed from the schema so the composition is pinned against the real thing rather than
 * against a shape invented here: the conversion round can only be a no-op on boot behaviour if
 * every one of these comes back character for character.
 */
const SCHEMA_CROSS_CHECKS: readonly { readonly check: EnvBoundCheck; readonly message: string }[] =
  [
    {
      check: {
        kind: 'must-not-exceed',
        subject: 'MARINE_SINGLE_CALL_TIMEOUT_MS',
        subjectValue: 20_000,
        limit: 'MARINE_UPSTREAM_DEADLINE_MS',
        limitValue: 10_000,
        reason: 'a single call cannot be allowed more time than the whole operation',
      },
      message:
        'MARINE_SINGLE_CALL_TIMEOUT_MS must not exceed MARINE_UPSTREAM_DEADLINE_MS — a single ' +
        'call cannot be allowed more time than the whole operation.',
    },
    {
      check: {
        kind: 'must-not-exceed',
        subject: 'MARINE_VALUE_TTL_SECONDS',
        subjectValue: 7_200,
        limit: 'MARINE_STALE_MAX_SECONDS',
        limitValue: 3_600,
        reason:
          'otherwise a value can breach the staleness ceiling while still being labelled fresh',
      },
      message:
        'MARINE_VALUE_TTL_SECONDS must not exceed MARINE_STALE_MAX_SECONDS — otherwise a value ' +
        'can breach the staleness ceiling while still being labelled fresh.',
    },
    {
      check: {
        kind: 'must-be-shorter-than',
        subject: 'MARINE_WARMUP_DEADLINE_MS',
        subjectValue: 900_000,
        limit: 'MARINE_WARMUP_INTERVAL_SECONDS',
        limitValue: 900 * 1000,
        reason: 'a tour that can outlive its own interval overlaps the next one',
      },
      message:
        'MARINE_WARMUP_DEADLINE_MS must be shorter than MARINE_WARMUP_INTERVAL_SECONDS — a tour ' +
        'that can outlive its own interval overlaps the next one.',
    },
    {
      check: {
        kind: 'must-not-exceed',
        subject: 'ECMWF_SINGLE_CALL_TIMEOUT_MS',
        subjectValue: 200_000,
        limit: 'ECMWF_TOUR_BUDGET_MS',
        limitValue: 180_000,
        reason:
          'a single download cannot be allowed more time than the whole tour slice it runs in',
      },
      message:
        'ECMWF_SINGLE_CALL_TIMEOUT_MS must not exceed ECMWF_TOUR_BUDGET_MS — a single download ' +
        'cannot be allowed more time than the whole tour slice it runs in.',
    },
    {
      check: {
        kind: 'must-be-smaller-than',
        subject: 'ECMWF_TOUR_BUDGET_MS + CMEMS_TOUR_BUDGET_MS',
        subjectValue: 180_000 + 120_000,
        limit: 'MARINE_WARMUP_DEADLINE_MS',
        limitValue: 300_000,
        reason:
          'the two provider slices share one tour, and their sum overrunning it would starve ' +
          'whichever target runs second',
        path: ['ECMWF_TOUR_BUDGET_MS'],
      },
      message:
        'ECMWF_TOUR_BUDGET_MS + CMEMS_TOUR_BUDGET_MS must be smaller than ' +
        'MARINE_WARMUP_DEADLINE_MS — the two provider slices share one tour, and their sum ' +
        'overrunning it would starve whichever target runs second.',
    },
    {
      check: {
        kind: 'must-not-exceed',
        subject: 'CMEMS_SINGLE_CALL_TIMEOUT_MS',
        subjectValue: 20_000,
        limit: 'MARINE_UPSTREAM_DEADLINE_MS',
        limitValue: 10_000,
        reason:
          'a single CMEMS call cannot be allowed more time than the whole request operation it ' +
          'runs in',
      },
      message:
        'CMEMS_SINGLE_CALL_TIMEOUT_MS must not exceed MARINE_UPSTREAM_DEADLINE_MS — a single ' +
        'CMEMS call cannot be allowed more time than the whole request operation it runs in.',
    },
    {
      check: {
        kind: 'must-not-exceed',
        subject: 'CMEMS_SINGLE_CALL_TIMEOUT_MS',
        subjectValue: 130_000,
        limit: 'CMEMS_TOUR_BUDGET_MS',
        limitValue: 120_000,
        reason: 'a single call cannot be allowed more time than the whole tour slice it runs in',
      },
      message:
        'CMEMS_SINGLE_CALL_TIMEOUT_MS must not exceed CMEMS_TOUR_BUDGET_MS — a single call ' +
        'cannot be allowed more time than the whole tour slice it runs in.',
    },
    {
      check: {
        kind: 'must-not-exceed',
        subject: 'ECMWF_TOUR_MAX_BYTES',
        subjectValue: 400_000_000,
        limit: 'ECMWF_CYCLE_MAX_BYTES',
        limitValue: 300_000_000,
        reason: 'one tour cannot be allowed more bytes than the whole cycle it contributes to',
      },
      message:
        'ECMWF_TOUR_MAX_BYTES must not exceed ECMWF_CYCLE_MAX_BYTES — one tour cannot be ' +
        'allowed more bytes than the whole cycle it contributes to.',
    },
    {
      check: {
        kind: 'must-not-exceed',
        subject: 'ECMWF_MAX_RANGE_BYTES',
        subjectValue: 90_000_000,
        limit: 'ECMWF_TOUR_MAX_BYTES',
        limitValue: 80_000_000,
        reason:
          'a single planned range cannot be allowed more bytes than the whole tour it downloads in',
      },
      message:
        'ECMWF_MAX_RANGE_BYTES must not exceed ECMWF_TOUR_MAX_BYTES — a single planned range ' +
        'cannot be allowed more bytes than the whole tour it downloads in.',
    },
    {
      check: {
        kind: 'must-not-exceed',
        subject: 'AIR_QUALITY_DOWNLOAD_TIMEOUT_MS',
        subjectValue: 200_000,
        limit: 'AIR_QUALITY_TOUR_BUDGET_MS',
        limitValue: 180_000,
        reason:
          'a single download cannot be allowed more time than the whole tour slice it runs in',
      },
      message:
        'AIR_QUALITY_DOWNLOAD_TIMEOUT_MS must not exceed AIR_QUALITY_TOUR_BUDGET_MS — a single ' +
        'download cannot be allowed more time than the whole tour slice it runs in.',
    },
    {
      check: {
        kind: 'must-be-smaller-than',
        subject: 'AIR_QUALITY_TOUR_BUDGET_MS',
        subjectValue: 300_000,
        limit: 'AIR_QUALITY_INGEST_DEADLINE_MS',
        limitValue: 300_000,
        reason: 'the leg must leave room in its own tour for the tour bookkeeping around it',
      },
      message:
        'AIR_QUALITY_TOUR_BUDGET_MS must be smaller than AIR_QUALITY_INGEST_DEADLINE_MS — the ' +
        'leg must leave room in its own tour for the tour bookkeeping around it.',
    },
    {
      check: {
        kind: 'must-be-shorter-than',
        subject: 'AIR_QUALITY_INGEST_DEADLINE_MS',
        subjectValue: 3_600_000,
        limit: 'AIR_QUALITY_INGEST_INTERVAL_SECONDS',
        limitValue: 3_600 * 1000,
        reason: 'a tour that can outlive its own interval overlaps the next one',
      },
      message:
        'AIR_QUALITY_INGEST_DEADLINE_MS must be shorter than ' +
        'AIR_QUALITY_INGEST_INTERVAL_SECONDS — a tour that can outlive its own interval ' +
        'overlaps the next one.',
    },
    {
      check: {
        kind: 'must-not-exceed',
        subject: 'AIR_QUALITY_VALUE_TTL_SECONDS',
        subjectValue: 7_200,
        limit: 'AIR_QUALITY_STALE_MAX_SECONDS',
        limitValue: 3_600,
        reason:
          'otherwise a value can breach the staleness ceiling while still being labelled fresh',
      },
      message:
        'AIR_QUALITY_VALUE_TTL_SECONDS must not exceed AIR_QUALITY_STALE_MAX_SECONDS — ' +
        'otherwise a value can breach the staleness ceiling while still being labelled fresh.',
    },
  ];

describe('checkEnvBound', () => {
  it('is reachable from a real zod refinement context', () => {
    expect(typeof acceptsARealRefinementContext).toBe('function');
  });

  it('covers all thirteen numeric cross-checks the schema runs today', () => {
    // Guards the guard: a table that silently shrank would make every case below vacuous.
    expect(SCHEMA_CROSS_CHECKS).toHaveLength(13);
  });

  /**
   * The link this table did not have, and the reason the type docblock used to overstate its own
   * gate: `toHaveLength(13)` sees a SHRINKING table, and nothing here ever opened `env.schema.ts`.
   * So the table was a hand transcription that could drift from the schema in either direction
   * while every case below stayed green.
   *
   * Both checks assert a CORRESPONDENCE between two files, never a value read off one of them —
   * so neither hardcodes a fact, and a reworded message must be reworded in both places or the
   * suite says so.
   */
  it('every table message still occurs in `env.schema.ts` — a reword cannot pass silently', () => {
    const missing = SCHEMA_CROSS_CHECKS.filter(
      ({ message }) => !FOLDED_SCHEMA_SOURCE.includes(message.replace(/\s+/g, ' ')),
    ).map(({ check }) => `${check.subject} vs ${check.limit}`);

    expect(missing).toEqual([]);
  });

  it('and `env.schema.ts` composes no HAND-WRITTEN bound message this table has not got', () => {
    // The direction `toHaveLength(13)` structurally cannot see: a FOURTEENTH hand-written
    // cross-check added to the schema leaves the table at thirteen and every case below still
    // passing.
    expect(FOLDED_SCHEMA_SOURCE.match(BOUND_MESSAGE) ?? []).toHaveLength(
      SCHEMA_CROSS_CHECKS.length,
    );
  });

  it('and every bound the schema runs THROUGH the helper is accounted for too', () => {
    // The half the regex above is structurally blind to. Without this, a sixth `checkEnvBound` call
    // — a whole new boot rule — lands with no number in this file moving, which is how five of the
    // eighteen bounds the schema runs today went uncounted for a whole PR.
    expect(FOLDED_SCHEMA_SOURCE.match(HELPER_BOUND_CALL) ?? []).toHaveLength(HELPER_BOUND_COUNT);
  });

  for (const { check, message } of SCHEMA_CROSS_CHECKS) {
    it(`reproduces the schema message for ${check.subject} vs ${check.limit}`, () => {
      expect(issuesFor(check).map((issue) => issue.message)).toEqual([message]);
    });
  }

  it('attaches the issue to the subject key by default', () => {
    const [first] = SCHEMA_CROSS_CHECKS;
    expect(issuesFor(first?.check ?? SCHEMA_CROSS_CHECKS[0]!.check)[0]?.path).toEqual([
      'MARINE_SINGLE_CALL_TIMEOUT_MS',
    ]);
  });

  it('attaches a SUM check to the single key zod can point at', () => {
    // The subject reads as an expression; the path cannot, so it is passed explicitly.
    const sumCheck = SCHEMA_CROSS_CHECKS.find((entry) => entry.check.subject.includes('+'));
    expect(sumCheck).toBeDefined();
    expect(issuesFor(sumCheck!.check)[0]?.path).toEqual(['ECMWF_TOUR_BUDGET_MS']);
  });

  it('raises a `custom` issue, which is what zod needs for a cross-field rule', () => {
    expect(issuesFor(SCHEMA_CROSS_CHECKS[0]!.check)[0]?.code).toBe('custom');
  });

  describe('the comparison is bound to the wording', () => {
    const base = {
      subject: 'A_MS',
      limit: 'B_MS',
      reason: 'because the second must contain the first',
    } as const;

    it('`must not exceed` ALLOWS equality — a call may use the whole budget', () => {
      expect(
        issuesFor({ ...base, kind: 'must-not-exceed', subjectValue: 100, limitValue: 100 }),
      ).toEqual([]);
      expect(
        issuesFor({ ...base, kind: 'must-not-exceed', subjectValue: 101, limitValue: 100 }),
      ).toHaveLength(1);
    });

    it('`must be smaller than` REFUSES equality — a tour must leave room around itself', () => {
      expect(
        issuesFor({ ...base, kind: 'must-be-smaller-than', subjectValue: 100, limitValue: 100 }),
      ).toHaveLength(1);
      expect(
        issuesFor({ ...base, kind: 'must-be-smaller-than', subjectValue: 99, limitValue: 100 }),
      ).toEqual([]);
    });

    it('`must be shorter than` refuses equality too — a tour equal to its interval overlaps', () => {
      expect(
        issuesFor({ ...base, kind: 'must-be-shorter-than', subjectValue: 100, limitValue: 100 }),
      ).toHaveLength(1);
    });
  });

  it('says NOTHING when the configuration is sound', () => {
    for (const { check } of SCHEMA_CROSS_CHECKS) {
      const holds: EnvBoundCheck = { ...check, subjectValue: 1, limitValue: 1_000_000_000 };
      expect(issuesFor(holds)).toEqual([]);
    }
  });

  describe('a non-finite operand REFUSES rather than reporting the bound sound', () => {
    const base = {
      kind: 'must-not-exceed',
      subject: 'A_MS',
      limit: 'B_MS',
      reason: 'because the second must contain the first',
    } as const;

    it.each([
      ['NaN subject', Number.NaN, 100],
      ['NaN limit', 100, Number.NaN],
      ['Infinite subject', Number.POSITIVE_INFINITY, 100],
      ['Infinite limit', 100, Number.POSITIVE_INFINITY],
    ])('%s', (_label, subjectValue, limitValue) => {
      // Without the guard this is the SILENT case: `NaN > x` and `NaN >= x` are both false, so a
      // bound whose operands could not be computed would report itself sound and the boot would
      // continue on a configuration nobody checked.
      expect(issuesFor({ ...base, subjectValue, limitValue })).toEqual([
        {
          code: 'custom',
          path: ['A_MS'],
          message: 'A_MS could not be compared with B_MS — one of the two is not a finite number.',
        },
      ]);
    });

    it('does not borrow the reason sentence, which would not apply', () => {
      const [issue] = issuesFor({ ...base, subjectValue: Number.NaN, limitValue: 100 });
      expect(issue?.message).not.toContain(base.reason);
    });

    it('still attaches to the explicit path when the subject is an expression', () => {
      const sum = SCHEMA_CROSS_CHECKS.find((entry) => entry.check.subject.includes('+'));
      expect(sum).toBeDefined();
      expect(issuesFor({ ...sum!.check, subjectValue: Number.NaN })[0]?.path).toEqual([
        'ECMWF_TOUR_BUDGET_MS',
      ]);
    });
  });
});
