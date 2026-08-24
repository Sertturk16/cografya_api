import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import ts from 'typescript';

/**
 * The structural gate behind §10: no log line under `src/auth/**` may carry an address, name,
 * phone, password, hash, code or token.
 *
 * A "log call" is any `<expr>.logger.<method>(...)` call (`log`/`warn`/`error`/`debug`/
 * `verbose`) — the shape every service in this package uses via its own `private readonly
 * logger = new Logger('AUTH')`. Each argument to such a call must be:
 *  - a plain string literal (or a template literal with NO interpolation), or
 *  - a template literal whose every `${…}` interpolation resolves to a single identifier —
 *    bare (`locale`) or the final property of a member access (`message.locale`) — that is a
 *    member of {@link ALLOWED_INTERPOLATION_NAMES}.
 * Anything else (a function call, string concatenation, a spread, an identifier outside the
 * allow-list) is a violation. Independently of that shape check, EVERY identifier appearing
 * anywhere inside a log call's arguments is scanned against {@link FORBIDDEN_IDENTIFIER_NAMES}
 * — this catches a forbidden name reaching the call through a shape the allow-list would
 * otherwise accept (e.g. a local rebound as `const locale = user.email`).
 */

const LOGGER_METHODS = new Set(['log', 'warn', 'error', 'debug', 'verbose']);

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

function isLoggerCall(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  if (!LOGGER_METHODS.has(node.expression.name.text)) return false;
  const target = node.expression.expression;
  return ts.isPropertyAccessExpression(target) && target.name.text === 'logger';
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

/** Runs the whole gate against one already-loaded TypeScript source. */
export function checkSource(fileName: string, sourceText: string): RedactionViolation[] {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const violations: RedactionViolation[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isLoggerCall(node)) {
      for (const arg of node.arguments) {
        const line = sourceFile.getLineAndCharacterOfPosition(arg.getStart(sourceFile)).line + 1;

        const identifierNames = new Set<string>();
        collectIdentifierNames(arg, identifierNames);
        for (const forbidden of FORBIDDEN_IDENTIFIER_NAMES) {
          if (identifierNames.has(forbidden)) {
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
});
