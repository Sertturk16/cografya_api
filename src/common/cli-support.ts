/**
 * The SKELETON shared by the repo's hand-run command-line tools — and nothing else.
 *
 * EVERY hand-run entry point in the repo — the seed CLIs, the `db:import:*` tools, the ERA5
 * importer and the OpenAPI generator — ends with the same six lines; the two-phase importers parse
 * the same `--phase=` flag with the same two lines; and the ones that talk to Postgres open and
 * close a data source with the same nested `finally`. That is the whole of what is shared here.
 *
 * Deliberately stated as CLASSES rather than as three tallies. The first draft counted them, and
 * all three counts were stale one merge later when `books.cli.ts` landed — a number in a comment
 * describing a growing set is wrong on a schedule. `git grep -l 'process.exitCode = 1' src` names
 * the current set, and it is correct whenever it is run.
 *
 * ## What deliberately stays in each tool
 * `ENGINEERING.md` §5 requires every two-phase import tool to defend ITS OWN gates — path
 * absoluteness, byte ceilings, key redaction, the usage banner, the "which phase touches the
 * network" reasoning. None of that moves here: a reader must be able to open one tool's file and
 * see every rule that tool enforces. Which exit code the process ends with is not part of that
 * defence, and neither is the shape of a `finally` block.
 *
 * ## Why this lives in `src/common/` and not `src/database/`
 * Two of the consumers are not database tools (the OpenAPI generator today, and any future
 * non-DB tool), and — more decisively — nothing in this file imports TypeORM. {@link
 * withDataSource} takes a {@link ClosableDataSource}, a structural interface a real `DataSource`
 * satisfies by having the two methods. A `src/database/` home would assert a dependency the file
 * does not have, and would make the unit spec pay for an entity graph it never uses.
 */

/**
 * Run a tool's `main` and end the process the way every tool here already ends it.
 *
 * Never rejects: a CLI's last statement has nothing left to hand a rejection to, and a floating
 * one would become an unhandled-rejection crash whose output interleaves with the real error.
 *
 * ## `process.exitCode`, not `process.exit()`
 * The comment this replaces is verbatim in eight files, and it is right: `process.exit()` tears
 * the process down immediately, which can truncate buffered stdout/stderr — so the tool exits
 * non-zero having printed only part of the reason. Setting `exitCode` lets Node drain and exit
 * naturally.
 *
 * ## Call it as `void runCli(...)`
 * ```ts
 * void runCli('db:seed:world', main);
 * ```
 * `runCli` is `async`, and the sites it replaces end with `main().catch(…)`, which
 * `@typescript-eslint/no-floating-promises` treats as handled. A bare `runCli('…', main);` is not,
 * and fails `Typecheck & Lint`. The `void` says what is already true — this never rejects — rather
 * than suppressing anything.
 *
 * ## The entry-point guard stays at the CALL SITE
 * Some of the tools wrap this in `if (require.main === module)` so that importing the module
 * (which their unit specs do, to reach the parser) does not execute `main` against Jest's argv.
 * That guard CANNOT move in here: `module` is per-module in CommonJS, so a helper compares its
 * own identity and would answer `false` for every caller. It is one line at the call site and it
 * has to stay there.
 *
 * @param label the bracketed tag the tool already prints, without brackets — e.g. `db:seed:world`
 */
export async function runCli(label: string, main: () => Promise<void>): Promise<void> {
  try {
    // `await` inside the try (rather than `main().catch(...)`) so a SYNCHRONOUS throw out of
    // `main` — an argument parser that refuses before the first await — lands here too.
    await main();
  } catch (error: unknown) {
    console.error(`[${label}] failed:`, error);
    // exitCode (not process.exit) so buffered stdio flushes before exit.
    process.exitCode = 1;
  }
}

/** What {@link parsePhaseFlag} needs to know to accept, refuse, or explain a `--phase=` value. */
export interface PhaseFlagOptions<TPhase extends string> {
  /** The phases this tool really has. Refusing everything else is the point. */
  readonly accepted: readonly TPhase[];
  /** The usage line, WITHOUT the `Usage: ` prefix — e.g. `pnpm db:import:era5 --phase=load`. */
  readonly usage: string;
  /**
   * Value → the paragraph explaining why that specific value is refused.
   *
   * This exists because two of the three call sites need it and would otherwise LOSE something:
   * `db:import:marine-ecmwf` explains that its load phase has not been built yet, and
   * `db:import:marine-cmems` explains that its load phase will never exist because that leg
   * stores nothing in Postgres. Collapsing either into a usage line would answer "you typed
   * something wrong" to an operator whose real question is "why not?".
   */
  readonly rejected?: Readonly<Record<string, string>>;
}

const PHASE_PREFIX = '--phase=';

/**
 * Read `--phase=<value>` out of an argv slice, or throw.
 *
 * ## There is no default, in any tool, on purpose
 * Every import tool in this repo says the same thing in its own docblock: defaulting to the
 * network phase puts a provider call in whatever script forgets the argument, and defaulting to
 * any other phase makes a typo silently skip the work. So a missing flag is a refusal, never an
 * assumption — and this helper cannot offer a default even to a caller that wants one.
 *
 * The refusal reads `Usage: <usage> (got "<value>")`, which is what all three call sites print
 * today, character for character.
 */
export function parsePhaseFlag<TPhase extends string>(
  argv: readonly string[],
  options: PhaseFlagOptions<TPhase>,
): TPhase {
  const flag = argv.find((arg) => arg.startsWith(PHASE_PREFIX));
  const value = flag?.slice(PHASE_PREFIX.length);

  // Returning the matched ELEMENT rather than the parsed string keeps the narrow `TPhase` type
  // without a cast: the value that comes back is provably one the caller listed.
  for (const phase of options.accepted) {
    if (phase === value) return phase;
  }

  // `Object.hasOwn` rather than a plain lookup: `--phase=toString` would otherwise reach
  // `Object.prototype.toString` through the record and throw an Error whose message is a
  // stringified function. A hand-typed flag must not be able to do that.
  //
  // The explanation is then READ before it is thrown. `Object.hasOwn` proves the key exists, not
  // that its value is a string, and under `noUncheckedIndexedAccess` the lookup is
  // `string | undefined` — which `new Error(undefined)` accepts, producing a refusal with an empty
  // message. Falling through to the usage line instead means the worst case is a less specific
  // refusal rather than a silent one.
  const rejected = options.rejected;
  const explanation =
    value !== undefined && rejected !== undefined && Object.hasOwn(rejected, value)
      ? rejected[value]
      : undefined;
  if (explanation !== undefined) throw new Error(explanation);

  throw new Error(`Usage: ${options.usage} (got ${JSON.stringify(value ?? '')})`);
}

/**
 * The part of a TypeORM `DataSource` this module uses — and the reason it can be unit-tested.
 *
 * Structural on purpose: a real `DataSource` satisfies it by having the two methods, while a spec
 * can satisfy it with an object, so {@link withDataSource}'s ordering guarantees are provable
 * without a Postgres container. `Promise<unknown>` because the two real methods disagree on their
 * resolved type (`initialize` resolves the DataSource, `destroy` resolves void) and neither is
 * read here.
 */
export interface ClosableDataSource {
  initialize(): Promise<unknown>;
  destroy(): Promise<unknown>;
}

/**
 * Open a data source, run `body`, and close it — with a teardown failure that can never mask the
 * real one.
 *
 * ## Why the inner `try` is not optional
 * If `destroy()` rejects inside a bare `finally`, its rejection REPLACES whatever `body` threw:
 * the seed error that actually matters disappears and the operator is told the connection would
 * not close. Catching and logging the teardown failure keeps the original error propagating,
 * which is what the four hand-written copies of this block already do.
 *
 * ## A teardown-only failure is loud, and still a success
 * When `body` succeeded and only `destroy()` failed, the error is printed and the result is
 * returned: the work landed, and the process ends zero. That is the behaviour of every
 * hand-written copy today and it is inherited on purpose — failing a completed seed because a
 * socket would not close would make an idempotent tool look broken.
 *
 * ## Converting a tool: leave the `[label] done` line INSIDE the body
 * Every hand-written copy logs its success line inside the `try`, before the teardown runs. A
 * conversion that lifts it out — `const result = await withDataSource(…); console.log('… done')` —
 * moves it AFTER the "failed to close the data source" line in exactly the case above, so a tool
 * that succeeded reads on stdout as though it failed afterwards. Pass the log inside `body`.
 *
 * `body` receives the SAME source that was passed in, with its concrete type intact, so a caller
 * keeps every repository and manager a real `DataSource` offers.
 */
export async function withDataSource<TSource extends ClosableDataSource, TResult>(
  label: string,
  dataSource: TSource,
  body: (dataSource: TSource) => Promise<TResult>,
): Promise<TResult> {
  await dataSource.initialize();

  try {
    // `return await` rather than `return`: without the await, `finally` runs BEFORE the body's
    // promise settles and the connection is destroyed out from under it.
    return await body(dataSource);
  } finally {
    try {
      await dataSource.destroy();
    } catch (destroyError) {
      console.error(`[${label}] failed to close the data source:`, destroyError);
    }
  }
}
