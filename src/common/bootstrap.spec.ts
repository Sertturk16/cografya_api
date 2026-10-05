import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { BadRequestException, type ArgumentMetadata } from '@nestjs/common';
import { IsString } from 'class-validator';
import ts from 'typescript';
import { buildValidationPipe } from './bootstrap';

const ROOT = join(__dirname, '..', '..');
const E2E_DIR = join(ROOT, 'test');

class NameBody {
  @IsString()
  name!: string;
}

const BODY: ArgumentMetadata = { type: 'body', metatype: NameBody };

function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(() => null).catch((error: unknown) => error);
}

describe('buildValidationPipe', () => {
  it('rejects an unknown key with a 400 (whitelist + forbidNonWhitelisted)', async () => {
    const rejection = await rejectionOf(
      buildValidationPipe().transform({ name: 'Ege', extra: 1 }, BODY),
    );

    expect(rejection).toBeInstanceOf(BadRequestException);
  });

  it('returns a DTO instance and converts a typed primitive parameter (transform)', async () => {
    const pipe = buildValidationPipe();

    const body: unknown = await pipe.transform({ name: 'Ege' }, BODY);
    const page: unknown = await pipe.transform('3', {
      type: 'query',
      metatype: Number,
      data: 'page',
    });

    expect(body).toBeInstanceOf(NameBody);
    expect(page).toBe(3);
  });
});

/**
 * `main.ts` never runs in tests, so each e2e app installs the global pipe itself. An app built
 * without it answers a malformed parameter with whatever the handler does instead of the 400
 * production returns, and every test in that suite still passes. This check reads the e2e specs
 * (and `main.ts`) as TypeScript syntax trees, so comments and string literals can never satisfy
 * it, and fails when:
 *
 * - an app (`createNestApplication()` or `NestFactory.create()`) is not bound to a name;
 * - that name never receives `useGlobalPipes(buildValidationPipe())` in the same function, or
 *   receives it only after its `init()`;
 * - a `ValidationPipe` is constructed by hand instead of through the builder.
 *
 * `freshBuildValidationPipe` is the alias a spec destructures after `jest.resetModules()`
 * (see the builder's docblock for why it must come from the fresh registry).
 */
const BUILDER_NAMES = new Set(['buildValidationPipe', 'freshBuildValidationPipe']);

interface PipeScan {
  apps: number;
  findings: string[];
}

function isBuilderCall(node: ts.Node): boolean {
  if (!ts.isCallExpression(node) || node.arguments.length > 0) return false;
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return BUILDER_NAMES.has(callee.text);
  return ts.isPropertyAccessExpression(callee) && callee.name.text === 'buildValidationPipe';
}

function isAppCreation(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
  const { name, expression } = node.expression;
  if (name.text === 'createNestApplication') return true;
  return name.text === 'create' && ts.isIdentifier(expression) && expression.text === 'NestFactory';
}

/** `const app = …`, `app = …` or `this.app = …` → the bound expression's text. */
function boundName(creation: ts.CallExpression): string | null {
  let node: ts.Node = creation;
  while (
    ts.isAwaitExpression(node.parent) ||
    ts.isParenthesizedExpression(node.parent) ||
    ts.isAsExpression(node.parent) ||
    ts.isNonNullExpression(node.parent)
  ) {
    node = node.parent;
  }
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && parent.initializer === node) {
    return ts.isIdentifier(parent.name) ? parent.name.text : null;
  }
  if (
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    parent.right === node
  ) {
    return parent.left.getText();
  }
  return null;
}

function enclosingFunction(node: ts.Node): ts.Node {
  let current = node.parent;
  while (!ts.isSourceFile(current) && !ts.isFunctionLike(current)) current = current.parent;
  return current;
}

/** Calls of the form `<binding>.<method>(…)` anywhere inside `scope`. */
function methodCallsOn(scope: ts.Node, binding: string, method: string): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === method &&
      node.expression.expression.getText() === binding
    ) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return calls;
}

function scanPipes(fileName: string, source: string): PipeScan {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const at = (node: ts.Node): string =>
    `${fileName}:${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  const scan: PipeScan = { apps: 0, findings: [] };

  const visit = (node: ts.Node): void => {
    if (ts.isNewExpression(node)) {
      const callee = node.expression;
      const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : callee.getText();
      if (name.endsWith('ValidationPipe')) {
        scan.findings.push(`${at(node)}: hand-built ${name}; use buildValidationPipe()`);
      }
    }
    if (isAppCreation(node)) {
      scan.apps += 1;
      const binding = boundName(node);
      if (binding === null) {
        scan.findings.push(`${at(node)}: app is not bound to a name, so no pipe can be installed`);
      } else {
        const scope = enclosingFunction(node);
        const install = methodCallsOn(scope, binding, 'useGlobalPipes').find((call) =>
          call.arguments.some(isBuilderCall),
        );
        const init = methodCallsOn(scope, binding, 'init')[0];
        if (install === undefined) {
          scan.findings.push(
            `${at(node)}: \`${binding}\` never gets useGlobalPipes(buildValidationPipe())`,
          );
        } else if (init !== undefined && init.getStart() < install.getStart()) {
          scan.findings.push(`${at(install)}: \`${binding}\` gets the pipe after its init()`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return scan;
}

describe('every application installs buildValidationPipe()', () => {
  it('holds for every test/*.e2e-spec.ts', () => {
    const files = readdirSync(E2E_DIR).filter((file) => file.endsWith('.e2e-spec.ts'));
    let apps = 0;
    const findings: string[] = [];
    for (const file of files) {
      const scan = scanPipes(`test/${file}`, readFileSync(join(E2E_DIR, file), 'utf8'));
      apps += scan.apps;
      findings.push(...scan.findings);
    }

    expect(findings).toEqual([]);
    // A scan that recognises no app at all would pass the line above vacuously.
    expect(apps).toBeGreaterThan(0);
  });

  it('holds for src/main.ts', () => {
    const scan = scanPipes('src/main.ts', readFileSync(join(ROOT, 'src', 'main.ts'), 'utf8'));

    expect(scan).toEqual({ apps: 1, findings: [] });
  });

  describe('the check itself (synthetic sources)', () => {
    it('accepts the shapes the real specs use', () => {
      const source = `
        beforeAll(async () => {
          app = moduleRef.createNestApplication();
          applyGlobalPrefix(app);
          app.useGlobalPipes(buildValidationPipe());
          await app.init();
        });
        async function bootApp() {
          const { buildValidationPipe: freshBuildValidationPipe } = freshBootstrap;
          const created = moduleRef.createNestApplication();
          created.useGlobalPipes(freshBuildValidationPipe());
          await created.init();
          return created;
        }
        async function bootstrap() {
          const app = await NestFactory.create(AppModule);
          app.useGlobalPipes(buildValidationPipe());
          await app.listen(3001);
        }
      `;

      expect(scanPipes('ok.ts', source)).toEqual({ apps: 3, findings: [] });
    });

    it('flags an app that never installs the pipe', () => {
      const source = `
        beforeAll(async () => {
          app = moduleRef.createNestApplication();
          applyGlobalPrefix(app);
          await app.init();
        });
      `;

      expect(scanPipes('bare.ts', source).findings).toEqual([
        'bare.ts:3: `app` never gets useGlobalPipes(buildValidationPipe())',
      ]);
    });

    it('is not satisfied by an install inside a comment or a string', () => {
      const source = `
        beforeAll(async () => {
          app = moduleRef.createNestApplication();
          // app.useGlobalPipes(buildValidationPipe());
          /* app.useGlobalPipes(buildValidationPipe()); */
          const note = 'app.useGlobalPipes(buildValidationPipe())';
          await app.init();
        });
      `;

      expect(scanPipes('commented.ts', source).findings).toEqual([
        'commented.ts:3: `app` never gets useGlobalPipes(buildValidationPipe())',
      ]);
    });

    it('flags a hand-built pipe even with the production options', () => {
      const source = `
        beforeAll(async () => {
          app = moduleRef.createNestApplication();
          app.useGlobalPipes(
            new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
          );
          await app.init();
        });
      `;

      expect(scanPipes('hand.ts', source).findings).toEqual([
        'hand.ts:3: `app` never gets useGlobalPipes(buildValidationPipe())',
        'hand.ts:5: hand-built ValidationPipe; use buildValidationPipe()',
      ]);
    });

    it('flags a second app, and a pipe installed on a different binding', () => {
      const source = `
        beforeAll(async () => {
          app = moduleRef.createNestApplication();
          app.useGlobalPipes(buildValidationPipe());
          await app.init();
        });
        beforeAll(async () => {
          disabledApp = moduleRef.createNestApplication();
          app.useGlobalPipes(buildValidationPipe());
          await disabledApp.init();
        });
      `;

      expect(scanPipes('second.ts', source).findings).toEqual([
        'second.ts:8: `disabledApp` never gets useGlobalPipes(buildValidationPipe())',
      ]);
    });

    it('flags a pipe installed after init(), and an app bound to no name', () => {
      const source = `
        beforeAll(async () => {
          app = moduleRef.createNestApplication();
          await app.init();
          app.useGlobalPipes(buildValidationPipe());
        });
        it('boots inline', async () => {
          await moduleRef.createNestApplication().init();
        });
      `;

      expect(scanPipes('order.ts', source).findings).toEqual([
        'order.ts:5: `app` gets the pipe after its init()',
        'order.ts:8: app is not bound to a name, so no pipe can be installed',
      ]);
    });
  });
});
