/**
 * The "this number may not pass that number" cross-check, written once.
 *
 * `src/config/env.schema.ts` runs thirteen of them in one `superRefine`: a single call against an
 * operation budget, a tour slice against the tour that hosts it, a value TTL against the staleness
 * ceiling, a deadline against the interval that repeats it. Each is nine to eleven lines and only
 * four things differ between them — the two operands, the comparison, and the sentence explaining
 * WHY the configuration cannot mean what it says.
 *
 * ## The reason is a PARAMETER, never a template
 * That explanation is the valuable half. "A single call cannot be allowed more time than the whole
 * operation" is what turns a boot refusal into something an operator can act on, and it is
 * different in all thirteen. A helper that generated a reason would flatten thirteen real
 * explanations into one useless one; a helper that takes the reason keeps every word and deletes
 * only the eight lines of ceremony around it.
 *
 * ## Why NAME and VALUE are separate for both operands
 * Two of the thirteen would be impossible otherwise. The air-quality and marine interval checks
 * compare against `<VAR>_INTERVAL_SECONDS * 1000` while the message must name the SECONDS
 * variable, because that is the variable an operator edits. And the ECMWF/CMEMS check compares a
 * SUM against one limit: its subject reads `ECMWF_TOUR_BUDGET_MS + CMEMS_TOUR_BUDGET_MS` while the
 * issue path must stay the single key zod can attach an error to. Passing computed numbers
 * alongside the names an operator recognises is what covers both.
 *
 * ## Why the comparison is bound to the wording
 * "Must not exceed" allows equality and refuses only a greater value; "must be smaller/shorter
 * than" refuses equality too. In the schema today that pairing is maintained by hand in thirteen
 * places, and a message that says "must be shorter than" over a `>` comparison would be a rule
 * that lies about itself — with a boot that accepts a tour exactly as long as its own interval.
 * {@link EnvBoundKind} makes the pairing structural: choosing the wording chooses the comparison.
 */

/**
 * How the bound reads, and — inseparably — how it compares.
 *
 * - `must-not-exceed` — equality is fine; only a greater subject is refused (`subject > limit`).
 * - `must-be-smaller-than` — equality is refused too (`subject >= limit`). For quantities.
 * - `must-be-shorter-than` — the same comparison, for DURATIONS. A separate member only because
 *   the schema's existing messages say "shorter" where they talk about time, and those messages
 *   are pinned verbatim by `env.schema.spec.ts`.
 */
export type EnvBoundKind = 'must-not-exceed' | 'must-be-smaller-than' | 'must-be-shorter-than';

const PHRASE: Readonly<Record<EnvBoundKind, string>> = {
  'must-not-exceed': 'must not exceed',
  'must-be-smaller-than': 'must be smaller than',
  'must-be-shorter-than': 'must be shorter than',
};

/** One cross-check: what is compared, against what, how, and why. */
export interface EnvBoundCheck {
  readonly kind: EnvBoundKind;
  /**
   * The subject as an operator reads it — usually one variable name, occasionally an expression
   * over several (`'ECMWF_TOUR_BUDGET_MS + CMEMS_TOUR_BUDGET_MS'`).
   */
  readonly subject: string;
  /** The subject's computed value, in the unit the comparison happens in. */
  readonly subjectValue: number;
  /** The limit as an operator reads it — the variable they would edit, not the unit conversion. */
  readonly limit: string;
  /** The limit's computed value, in the same unit as {@link subjectValue}. */
  readonly limitValue: number;
  /**
   * Why this configuration cannot mean what it says, as one sentence WITHOUT a trailing full
   * stop — the helper adds it, so all thirteen messages punctuate alike.
   */
  readonly reason: string;
  /**
   * Which key the issue attaches to. Defaults to the subject, which is right whenever the subject
   * is a single variable; pass it explicitly when the subject is an expression, since zod can only
   * point at a real key.
   */
  readonly path?: readonly string[];
}

/**
 * The part of a zod refinement context this helper touches.
 *
 * Structural, not `z.core.$RefinementCtx`, for two reasons: the helper then carries no dependency
 * on zod's internal type surface across a major version, and a spec can prove the composed message
 * without building a parse payload. `env-bounds.spec.ts` holds a compile-time proof that a real
 * refinement context satisfies this interface, so the decoupling cannot silently stop fitting the
 * call site.
 */
export interface EnvIssueCollector {
  addIssue(issue: { code: 'custom'; path: string[]; message: string }): void;
}

/**
 * Add a zod issue when the bound is breached, and nothing at all when it holds.
 *
 * The composed message is `<subject> <phrase> <limit> — <reason>.`, which is what all thirteen
 * hand-written blocks print today, character for character.
 */
export function checkEnvBound(ctx: EnvIssueCollector, check: EnvBoundCheck): void {
  const breached =
    check.kind === 'must-not-exceed'
      ? check.subjectValue > check.limitValue
      : check.subjectValue >= check.limitValue;

  if (!breached) return;

  ctx.addIssue({
    code: 'custom',
    path: [...(check.path ?? [check.subject])],
    message: `${check.subject} ${PHRASE[check.kind]} ${check.limit} — ${check.reason}.`,
  });
}
