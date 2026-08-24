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
 * arguments — EXPANDED through same-file `const`/`let` bindings to a fixpoint (`buildBindingMap`
 * + `collectExpanded`, `TA135-I2`) — is scanned against {@link FORBIDDEN_IDENTIFIER_NAMES}. This
 * is what catches a forbidden name reaching the call through a local rebind the shape check would
 * otherwise wave through (`const locale = user.email` then `${locale}` — `locale` is itself an
 * allow-listed interpolation name, so only following the binding back to `email` sees the leak).
 * The expansion is deliberately file-wide and NOT scope-aware: two different bindings of the same
 * name anywhere in the file are unioned, so a dirty binding in one function can flag a clean-named
 * use in another. That is a conservative choice made on purpose — it can only produce a false
 * POSITIVE, never a false negative, and a real collision is resolved by renaming the offending
 * local rather than by narrowing the scan.
 *
 * **What this gate still cannot see, named rather than left implicit:** a logger reference (or a
 * tainted value) passed as an ARGUMENT to a helper function and logged from inside that helper.
 * Seeing through that needs type information this AST-only scan does not have — it is a
 * recorded, standing limitation, not an oversight, and it does not shrink the two delika this
 * file was widened to close.
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
 * Maps every `const`/`let` bound NAME in the file to the set of identifier names appearing in
 * its initializer — unioned across every declaration of that name anywhere in the file. This is
 * deliberately NOT scope-aware (`TA135-I2`): a dirty binding of a name in one function taints
 * every occurrence of that name everywhere, which can only widen what fires, never narrow it.
 */
function buildBindingMap(sourceFile: ts.SourceFile): Map<string, Set<string>> {
  const bindings = new Map<string, Set<string>>();

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const names = new Set<string>();
      collectIdentifierNames(node.initializer, names);
      const boundName = node.name.text;
      const existing = bindings.get(boundName);
      if (existing) {
        for (const name of names) existing.add(name);
      } else {
        bindings.set(boundName, names);
      }
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
});
