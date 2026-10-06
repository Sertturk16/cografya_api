import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import ts from 'typescript';

/**
 * The error-body rule, enforced (rule text: `CLAUDE.md` "Error bodies", `docs/conventions.md`).
 *
 * Every `new <X>Exception(...)` from `@nestjs/common` under `src/` must be one of:
 * - a 4xx whose first argument is an i18n key imported from a `*-error-keys.ts` module
 *   (`AUTH_ERROR_KEYS.unauthenticated`, `FAVORITES_NOT_FOUND_KEY_BY_TYPE[type]`);
 * - a `BadRequestException([...])` with an array literal: the pipe's own validation shape,
 *   whose entries may be developer text, exactly like a class-validator `message:`;
 * - a 5xx with no argument at all: the framework default body, diagnostics go to the log.
 *
 * A string literal, a template, an argument-less 4xx or a key spelled in place fails here.
 */

const SRC_ROOT = join(__dirname, '..');

const SERVER_ERROR_EXCEPTIONS = new Set([
  'InternalServerErrorException',
  'NotImplementedException',
  'BadGatewayException',
  'ServiceUnavailableException',
  'GatewayTimeoutException',
  'HttpVersionNotSupportedException',
]);

const ERROR_KEY_MODULE = /-error-keys$/;
const ERROR_KEY_VALUE = /^errors\.[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/;

function sourceFiles(dir: string, predicate: (name: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path, predicate);
    return predicate(entry.name) ? [path] : [];
  });
}

const isProductionSource = (name: string): boolean =>
  name.endsWith('.ts') && !name.endsWith('.spec.ts') && !name.endsWith('.d.ts');

/** Local binding name → the module specifier it was imported from. */
function importsOf(file: ts.SourceFile): Map<string, string> {
  const imports = new Map<string, string>();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      imports.set(element.name.text, statement.moduleSpecifier.text);
    }
  }
  return imports;
}

/** `A.b`, `A[b]`, `(A.b)` → `A`; anything else → undefined. */
function rootIdentifier(expression: ts.Expression): ts.Identifier | undefined {
  let node: ts.Expression = expression;
  for (;;) {
    if (ts.isIdentifier(node)) return node;
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      node = node.expression;
    } else if (ts.isParenthesizedExpression(node)) {
      node = node.expression;
    } else {
      return undefined;
    }
  }
}

interface ThrowSiteScan {
  sites: number;
  violations: string[];
}

function scanThrowSites(): ThrowSiteScan {
  const scan: ThrowSiteScan = { sites: 0, violations: [] };
  for (const path of sourceFiles(SRC_ROOT, isProductionSource)) {
    const file = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.ES2023,
      true,
    );
    const imports = importsOf(file);
    const visit = (node: ts.Node): void => {
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text.endsWith('Exception') &&
        imports.get(node.expression.text) === '@nestjs/common'
      ) {
        scan.sites += 1;
        const problem = problemWith(node.expression.text, node.arguments ?? [], imports);
        if (problem !== undefined) {
          const { line } = file.getLineAndCharacterOfPosition(node.getStart());
          scan.violations.push(`${relative(SRC_ROOT, path)}:${String(line + 1)} ${problem}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return scan;
}

function problemWith(
  exception: string,
  args: readonly ts.Expression[],
  imports: Map<string, string>,
): string | undefined {
  if (SERVER_ERROR_EXCEPTIONS.has(exception)) {
    return args.length === 0 ? undefined : `${exception} carries a message; log it, throw argless`;
  }
  const first = args[0];
  if (first === undefined) return `${exception}() has no error key`;
  if (exception === 'BadRequestException' && ts.isArrayLiteralExpression(first)) return undefined;
  const root = rootIdentifier(first);
  const from = root === undefined ? undefined : imports.get(root.text);
  if (from !== undefined && ERROR_KEY_MODULE.test(from)) return undefined;
  return `${exception}(${first.getText()}) is not a key imported from a *-error-keys.ts module`;
}

function stringLeaves(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value !== null && typeof value === 'object')
    return Object.values(value).flatMap(stringLeaves);
  return [];
}

describe('error bodies carry i18n keys', () => {
  it('every exception thrown in src carries a *-error-keys.ts key, a validation array, or (5xx) nothing', () => {
    const { sites, violations } = scanThrowSites();

    // A walker that silently matched nothing would pass vacuously; src has ~70 sites today.
    expect(sites).toBeGreaterThan(50);
    expect(violations).toEqual([]);
  });

  it('every *-error-keys.ts value is an errors.<area>.<name> key, and no key is reused across modules', () => {
    const owners = new Map<string, string>();
    const problems: string[] = [];
    const keyFiles = sourceFiles(SRC_ROOT, (name) => name.endsWith('-error-keys.ts'));

    expect(keyFiles.length).toBeGreaterThan(0);
    for (const path of keyFiles) {
      const name = relative(SRC_ROOT, path);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const exported = require(path) as Record<string, unknown>;
      for (const key of new Set(stringLeaves(exported))) {
        if (!ERROR_KEY_VALUE.test(key))
          problems.push(`${name}: ${key} is not errors.<area>.<name>`);
        const owner = owners.get(key);
        if (owner !== undefined && owner !== name)
          problems.push(`${key} in both ${owner} and ${name}`);
        owners.set(key, name);
      }
    }
    expect(problems).toEqual([]);
  });
});
