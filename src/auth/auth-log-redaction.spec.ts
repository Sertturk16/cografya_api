import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import ts from 'typescript';

/**
 * The structural gate behind §10: no log line under `src/auth/**` may carry an address, name,
 * phone, password, hash, code or token.
 *
 * **Scope, stated ENUMERABLY rather than as "the shape every service in this package uses"**
 * (PR-2, `SEC135-I2`/`CODE135-I1` — the previous wording tied the gate's coverage to a
 * convention assumption, and a convention is not a proof). A call is a LOG SINK when:
 *  - its callee target is exactly the identifier `console` (every method — `console.log`,
 *    `console.error`, `console.info`, `console.dir`, `console.table`, … — is one channel and
 *    none of them is exempt), OR
 *  - its callee is `<target>.<method>(...)`, `<method>` is one of {@link LOGGER_METHODS}, and
 *    `<target>` is either a bare identifier or the final name of a property-access chain whose
 *    name is exactly `log` or matches `/logger$/i` (`logger`, `authLogger`, `this.logger`,
 *    `this.exemptionLogger`, the static `Logger` class identifier itself — `/logger$/i` already
 *    covers `Logger`, so no separate case is needed for the static form).
 *
 * Each argument to a recognised sink must be:
 *  - a plain string literal (or a template literal with NO interpolation), or
 *  - a template literal whose every `${…}` interpolation resolves to a single identifier —
 *    bare (`locale`) or the final property of a member access (`message.locale`) — that is a
 *    member of {@link ALLOWED_INTERPOLATION_NAMES}.
 * Anything else (a function call, string concatenation, a spread, an identifier outside the
 * allow-list) is a violation.
 *
 * Independently of that shape check, every identifier appearing anywhere inside a log call's
 * arguments — EXPANDED through same-file bindings to a fixpoint (`buildBindingMap` +
 * `collectExpanded`, `TA135-I2`) — is scanned against {@link FORBIDDEN_IDENTIFIER_NAMES}. This
 * is what catches a forbidden name reaching the call through a local rebind the shape check would
 * otherwise wave through (`const locale = user.email` then `${locale}` — `locale` is itself an
 * allow-listed interpolation name, so only following the binding back to `email` sees the leak).
 * The expansion is deliberately file-wide and NOT scope-aware: two different bindings of the same
 * name anywhere in the file are unioned, so a dirty binding in one function can flag a clean-named
 * use in another. That is a conservative choice made on purpose — it can only produce a false
 * POSITIVE, never a false negative, and a real collision is resolved by renaming the offending
 * local rather than by narrowing the scan.
 *
 * **THREE binding forms feed that map, not one** (`SEC136-I2`/`VAL136-L3` — the first version
 * claimed all three and implemented only the first):
 *  1. a simple declaration, `const locale = user.email`;
 *  2. a DESTRUCTURING declaration, `const { email: scope } = user` or `const [locale] = [u.email]`
 *     — the bound name takes the initializer's identifiers PLUS its own binding element's
 *     property name, which is where `email` lives in the object form and is the only place the
 *     forbidden word appears at all;
 *  3. a plain ASSIGNMENT to an existing name, `locale = user.email`, which is a
 *     `BinaryExpression` and not a declaration, so the declaration-only walk never saw it.
 * All three were measured SILENT before this round and FIRE after it; each has its own case
 * below, each paired with the clean form it must NOT flag.
 *
 * **What this gate still cannot see, named rather than left implicit:** a logger reference (or a
 * tainted value) passed as an ARGUMENT to a helper function and logged from inside that helper;
 * a value reaching a log line through a class FIELD (`this.something`) rather than a local
 * binding; and a sink shape outside the enumeration above (a bare function call, element access
 * such as `this.logger['warn'](…)`, or a target name that neither is `log` nor ends in `logger`,
 * e.g. `this.loggerService`). Seeing through the first two needs type/flow information this
 * AST-only scan does not have; the third is a deliberate boundary on the sink enumeration. All
 * are recorded, standing limitations rather than oversights, and none of them shrinks the three
 * binding forms this file now covers.
 */

/** `fatal`/`info`/`trace` widen the five Nest `Logger` methods to also cover a custom logger's
 * `fatal` and `console`'s `info`/`trace` — `console` itself bypasses this set entirely (above). */
const LOGGER_METHODS = new Set([
  'log',
  'warn',
  'error',
  'debug',
  'verbose',
  'fatal',
  'info',
  'trace',
]);

/** The only names this package's log lines are allowed to interpolate. */
const ALLOWED_INTERPOLATION_NAMES = new Set(['template', 'locale', 'scope', 'outcome']);

/** Never allowed inside a log call's arguments, in any position, under any name binding. */
const FORBIDDEN_IDENTIFIER_NAMES = [
  'email',
  'password',
  'code',
  'token',
  'phone',
  'firstName',
  'lastName',
  'hash',
  'resetToken',
  'passwordHash',
  'subjectHash',
  'userId',
  'sub',
];

export interface RedactionViolation {
  readonly file: string;
  readonly line: number;
  readonly reason: string;
}

/** A target name counts as "a logger" if it is exactly `log` or ends with `logger`, any case. */
function isLoggerLikeName(name: string): boolean {
  return name === 'log' || /logger$/i.test(name);
}

function isLogSink(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  const target = node.expression.expression;
  const methodName = node.expression.name.text;

  // `console.*` is a sink on ANY method — gating it by `LOGGER_METHODS` would leave most of
  // `console`'s real surface (`console.info`, `console.dir`, `console.table`, …) unwatched.
  if (ts.isIdentifier(target) && target.text === 'console') return true;

  if (!LOGGER_METHODS.has(methodName)) return false;

  if (ts.isIdentifier(target)) return isLoggerLikeName(target.text);
  if (ts.isPropertyAccessExpression(target)) return isLoggerLikeName(target.name.text);
  return false;
}

/** The single name an interpolation resolves to, or `undefined` if it is not a simple reference. */
function interpolationName(expr: ts.Expression): string | undefined {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return undefined;
}

function collectIdentifierNames(node: ts.Node, into: Set<string>): void {
  if (ts.isIdentifier(node)) into.add(node.text);
  ts.forEachChild(node, (child) => collectIdentifierNames(child, into));
}

/**
 * Maps every bound NAME in the file to the set of identifier names it can carry — unioned across
 * every binding of that name anywhere in the file. This is deliberately NOT scope-aware
 * (`TA135-I2`): a dirty binding of a name in one function taints every occurrence of that name
 * everywhere, which can only widen what fires, never narrow it.
 *
 * Three binding forms are recognised; see the file docblock for why each is here and which
 * measurement added it.
 */
function buildBindingMap(sourceFile: ts.SourceFile): Map<string, Set<string>> {
  const bindings = new Map<string, Set<string>>();

  const bind = (boundName: string, names: Set<string>): void => {
    const existing = bindings.get(boundName);
    if (existing) {
      for (const name of names) existing.add(name);
    } else {
      bindings.set(boundName, new Set(names));
    }
  };

  /**
   * Walks a destructuring pattern, binding each element's LOCAL name to the initializer's
   * identifiers plus that element's own `propertyName`.
   *
   * The per-element treatment is the load-bearing part: folding the WHOLE pattern's identifiers
   * into every bound name would make `const { email, locale } = draft` taint `locale` with
   * `email`, i.e. a false positive on ordinary clean code, and this file's own design promise is
   * that widening never costs correctness elsewhere.
   */
  const bindPattern = (pattern: ts.BindingPattern, initializerNames: Set<string>): void => {
    for (const element of pattern.elements) {
      if (!ts.isBindingElement(element)) continue; // an array hole (`const [, b] = …`)
      const elementNames = new Set(initializerNames);
      if (element.propertyName && !ts.isComputedPropertyName(element.propertyName)) {
        elementNames.add(element.propertyName.text);
      }
      if (ts.isIdentifier(element.name)) {
        bind(element.name.text, elementNames);
      } else {
        bindPattern(element.name, elementNames);
      }
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const names = new Set<string>();
      collectIdentifierNames(node.initializer, names);
      if (ts.isIdentifier(node.name)) {
        bind(node.name.text, names);
      } else {
        bindPattern(node.name, names);
      }
    }

    // A rebind of an ALREADY-declared name is an assignment, not a declaration, so the branch
    // above never sees it: `let locale = 'tr'; locale = user.email;`.
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      const names = new Set<string>();
      collectIdentifierNames(node.right, names);
      bind(node.left.text, names);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return bindings;
}

/**
 * The identifiers directly inside `node`, expanded through `bindings` to a FIXPOINT — a
 * multi-step rebind (`const mid = u.email; const locale = mid;`) is followed all the way back.
 * `visited` both stops the walk and IS the answer: every name ever reached, direct or bound.
 */
function collectExpanded(node: ts.Node, bindings: Map<string, Set<string>>): Set<string> {
  const direct = new Set<string>();
  collectIdentifierNames(node, direct);

  const visited = new Set<string>();
  const queue: string[] = [...direct];
  while (queue.length > 0) {
    const name = queue.shift();
    if (name === undefined || visited.has(name)) continue;
    visited.add(name);
    const bound = bindings.get(name);
    if (bound) {
      for (const next of bound) {
        if (!visited.has(next)) queue.push(next);
      }
    }
  }
  return visited;
}

/** Runs the whole gate against one already-loaded TypeScript source. */
export function checkSource(fileName: string, sourceText: string): RedactionViolation[] {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const bindings = buildBindingMap(sourceFile);
  const violations: RedactionViolation[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isLogSink(node)) {
      for (const arg of node.arguments) {
        const line = sourceFile.getLineAndCharacterOfPosition(arg.getStart(sourceFile)).line + 1;

        const expandedNames = collectExpanded(arg, bindings);
        for (const forbidden of FORBIDDEN_IDENTIFIER_NAMES) {
          if (expandedNames.has(forbidden)) {
            violations.push({
              file: fileName,
              line,
              reason: `log argument references the forbidden identifier "${forbidden}"`,
            });
          }
        }

        if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) continue;

        if (ts.isTemplateExpression(arg)) {
          for (const span of arg.templateSpans) {
            const name = interpolationName(span.expression);
            if (name === undefined || !ALLOWED_INTERPOLATION_NAMES.has(name)) {
              violations.push({
                file: fileName,
                line,
                reason:
                  'template literal interpolates an expression that is not a single ' +
                  'allow-listed identifier',
              });
            }
          }
          continue;
        }

        violations.push({
          file: fileName,
          line,
          reason: 'log argument is neither a string literal nor an allow-listed template literal',
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

function collectTsFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      found.push(...collectTsFiles(fullPath));
    } else if (entry.endsWith('.ts')) {
      found.push(fullPath);
    }
  }
  return found;
}

describe('src/auth/** log redaction (§10)', () => {
  it('reports ZERO violations across every real file under src/auth', () => {
    const files = collectTsFiles(__dirname);
    const violations = files.flatMap((file) => checkSource(file, readFileSync(file, 'utf8')));
    expect(violations).toEqual([]);
  });

  it('POSITIVE CONTROL: the gate actually fires red on a deliberately dirty synthetic source', () => {
    const dirty = `
      class Dirty {
        private readonly logger = new Logger('AUTH');
        send(message: { to: string; code: string }): void {
          this.logger.log(\`sending code \${message.code} to \${message.to}\`);
        }
      }
    `;
    const violations = checkSource('dirty-synthetic.ts', dirty);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((violation) => violation.reason.includes('"code"'))).toBe(true);
  });

  it('POSITIVE CONTROL: a plain string literal log call is clean (no false positive)', () => {
    const clean = `
      class Clean {
        private readonly logger = new Logger('AUTH');
        boot(): void {
          this.logger.warn('AUTH — ephemeral per-process signing key; tokens do not survive a restart');
        }
      }
    `;
    expect(checkSource('clean-synthetic.ts', clean)).toEqual([]);
  });

  it('POSITIVE CONTROL: an allow-listed member-access interpolation is clean', () => {
    const clean = `
      class Clean {
        private readonly logger = new Logger('AUTH');
        send(message: { template: string; locale: string }): void {
          this.logger.log(\`mail.noop template=\${message.template} locale=\${message.locale}\`);
        }
      }
    `;
    expect(checkSource('clean-member-access.ts', clean)).toEqual([]);
  });

  it('POSITIVE CONTROL: a non-identifier interpolation (a call expression) is flagged', () => {
    const dirty = `
      class Dirty {
        private readonly logger = new Logger('AUTH');
        send(): void {
          this.logger.log(\`outcome=\${JSON.stringify({})}\`);
        }
      }
    `;
    expect(checkSource('dirty-call-expression.ts', dirty).length).toBeGreaterThan(0);
  });

  describe('Çare 1 (`SEC135-I2`/`CODE135-I1`) — sink shapes the OLD matcher never saw', () => {
    it('FIRES on a module-level `const logger = new Logger(...)` bare identifier target', () => {
      const dirty = `
        const logger = new Logger('AUTH');
        class Dirty {
          send(message: { code: string }): void {
            logger.log(\`code \${message.code}\`);
          }
        }
      `;
      const violations = checkSource('vaka-b.ts', dirty);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((violation) => violation.reason.includes('"code"'))).toBe(true);
    });

    it('FIRES on `this.authLogger.warn(...)`, an alternate member name ending in "logger"', () => {
      const dirty = `
        class Dirty {
          private readonly authLogger = new Logger('AUTH');
          send(message: { code: string }): void {
            this.authLogger.warn(\`code \${message.code}\`);
          }
        }
      `;
      const violations = checkSource('vaka-c.ts', dirty);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((violation) => violation.reason.includes('"code"'))).toBe(true);
    });

    it('FIRES on `this.log.warn(...)`, the bare "log" member name', () => {
      const dirty = `
        class Dirty {
          private readonly log = new Logger('AUTH');
          send(message: { code: string }): void {
            this.log.warn(\`code \${message.code}\`);
          }
        }
      `;
      const violations = checkSource('vaka-d.ts', dirty);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((violation) => violation.reason.includes('"code"'))).toBe(true);
    });

    it('FIRES on `console.error(...)`, on a method never in LOGGER_METHODS for a non-console target', () => {
      const dirty = `
        class Dirty {
          send(u: { email: string }): void {
            console.error('sending to', u.email);
          }
        }
      `;
      const violations = checkSource('vaka-e.ts', dirty);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((violation) => violation.reason.includes('"email"'))).toBe(true);
    });

    it('FIRES on a static `Logger.error(...)` call', () => {
      const dirty = `
        class Dirty {
          send(message: { code: string }): void {
            Logger.error(\`code \${message.code}\`);
          }
        }
      `;
      const violations = checkSource('vaka-f.ts', dirty);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((violation) => violation.reason.includes('"code"'))).toBe(true);
    });

    it('FIRES on a method-local `const logger = ...` bare identifier target', () => {
      const dirty = `
        class Dirty {
          send(message: { code: string }): void {
            const logger = new Logger('AUTH');
            logger.log(\`code \${message.code}\`);
          }
        }
      `;
      const violations = checkSource('vaka-g.ts', dirty);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((violation) => violation.reason.includes('"code"'))).toBe(true);
    });
  });

  describe('Çare 2 (`TA135-I2`) — a forbidden name reaching the call through a rebind', () => {
    it('FIRES when an allow-listed interpolation name is bound to a forbidden value (locale ← email)', () => {
      const dirty = `
        class Dirty {
          private readonly logger = new Logger('AUTH');
          send(user: { email: string }): void {
            const locale = user.email;
            this.logger.log(\`x \${locale}\`);
          }
        }
      `;
      const violations = checkSource('vaka-h.ts', dirty);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((violation) => violation.reason.includes('"email"'))).toBe(true);
    });

    it('FIRES when an allow-listed interpolation name is bound to a forbidden value (outcome ← resetToken)', () => {
      const dirty = `
        class Dirty {
          private readonly logger = new Logger('AUTH');
          send(m: { resetToken: string }): void {
            const outcome = m.resetToken;
            this.logger.log(\`x \${outcome}\`);
          }
        }
      `;
      const violations = checkSource('vaka-i.ts', dirty);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((violation) => violation.reason.includes('"resetToken"'))).toBe(true);
    });

    it('FIRES through a TWO-STEP rebind chain (locale ← mid ← email)', () => {
      const dirty = `
        class Dirty {
          private readonly logger = new Logger('AUTH');
          send(u: { email: string }): void {
            const mid = u.email;
            const locale = mid;
            this.logger.log(\`x \${locale}\`);
          }
        }
      `;
      const violations = checkSource('vaka-h2.ts', dirty);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((violation) => violation.reason.includes('"email"'))).toBe(true);
    });

    it('stays SILENT on a genuinely clean allow-listed interpolation (no false positive from expansion)', () => {
      const clean = `
        class Clean {
          private readonly logger = new Logger('AUTH');
          send(message: { template: string; locale: string }): void {
            this.logger.log(\`mail.noop template=\${message.template} locale=\${message.locale}\`);
          }
        }
      `;
      expect(checkSource('vaka-k.ts', clean)).toEqual([]);
    });
  });

  /**
   * `SEC136-I2`/`VAL136-L3`: the docblock claimed the expansion followed every same-file binding,
   * but `buildBindingMap` only matched `VariableDeclaration`s with an `Identifier` name — so the
   * two forms below reached a log line SILENTLY, and both are the same class of hole the file was
   * widened to close in the first place.
   *
   * This is not a hypothetical shape. `SFH136-I2`'s own remedy — the logger `SessionService`
   * gained this round — is a log line in a method that holds a `user`, and
   * `const { email: scope } = user;` is a plausible way to write it. The gate had to see it
   * BEFORE that logger landed, which is why both changes are in the same round.
   */
  describe('SEC136-I2 — bindings the declaration-only walk never saw', () => {
    it('FIRES on an object destructuring rename (const { email: scope } = user)', () => {
      const dirty = `
        class Dirty {
          private readonly logger = new Logger('AUTH');
          send(user: { email: string }): void {
            const { email: scope } = user;
            this.logger.warn(\`login.verify scope=\${scope}\`);
          }
        }
      `;
      const violations = checkSource('vaka-l.ts', dirty);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((violation) => violation.reason.includes('"email"'))).toBe(true);
    });

    it('FIRES on an array destructuring binding (const [locale] = [user.email])', () => {
      const dirty = `
        class Dirty {
          private readonly logger = new Logger('AUTH');
          send(user: { email: string }): void {
            const [locale] = [user.email];
            this.logger.log(\`x \${locale}\`);
          }
        }
      `;
      const violations = checkSource('vaka-m.ts', dirty);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((violation) => violation.reason.includes('"email"'))).toBe(true);
    });

    it('FIRES on a NESTED destructuring rename (const { user: { email: outcome } } = ctx)', () => {
      const dirty = `
        class Dirty {
          private readonly logger = new Logger('AUTH');
          send(ctx: { user: { email: string } }): void {
            const { user: { email: outcome } } = ctx;
            this.logger.log(\`x \${outcome}\`);
          }
        }
      `;
      const violations = checkSource('vaka-n.ts', dirty);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((violation) => violation.reason.includes('"email"'))).toBe(true);
    });

    it('FIRES on an assignment rebind after declaration (let locale = "tr"; locale = user.email)', () => {
      const dirty = `
        class Dirty {
          private readonly logger = new Logger('AUTH');
          send(user: { email: string }): void {
            let locale = 'tr';
            locale = user.email;
            this.logger.log(\`x \${locale}\`);
          }
        }
      `;
      const violations = checkSource('vaka-o.ts', dirty);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((violation) => violation.reason.includes('"email"'))).toBe(true);
    });

    it('FIRES through an assignment rebind chained onto a destructured name', () => {
      const dirty = `
        class Dirty {
          private readonly logger = new Logger('AUTH');
          send(user: { email: string }): void {
            const { email: mid } = user;
            let outcome = 'ok';
            outcome = mid;
            this.logger.log(\`x \${outcome}\`);
          }
        }
      `;
      const violations = checkSource('vaka-p.ts', dirty);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((violation) => violation.reason.includes('"email"'))).toBe(true);
    });

    it('POSITIVE CONTROL: a clean destructuring of allow-listed names stays SILENT', () => {
      // The widening must not cost correctness on ordinary code: destructuring is how this
      // package reads a `MailMessage`, and `const { template, locale } = message` must never
      // cross-contaminate the two bound names with each other's siblings.
      const clean = `
        class Clean {
          private readonly logger = new Logger('AUTH');
          send(message: { template: string; locale: string; email: string }): void {
            const { template, locale } = message;
            this.logger.log(\`mail.noop template=\${template} locale=\${locale}\`);
          }
        }
      `;
      expect(checkSource('vaka-q.ts', clean)).toEqual([]);
    });

    it('POSITIVE CONTROL: a clean assignment rebind stays SILENT', () => {
      const clean = `
        class Clean {
          private readonly logger = new Logger('AUTH');
          send(message: { template: string }): void {
            let outcome = 'ok';
            outcome = 'failed';
            this.logger.log(\`mail.send template=\${message.template} outcome=\${outcome}\`);
          }
        }
      `;
      expect(checkSource('vaka-r.ts', clean)).toEqual([]);
    });
  });
});
