import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import ts from 'typescript';

const MAIN = join(__dirname, 'main.ts');

/** `<receiver>.<method>(…)` calls in the file, in source order, with the receiver's text. */
function methodCalls(source: ts.SourceFile, method: string): { receiver: string; at: number }[] {
  const calls: { receiver: string; at: number }[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === method
    ) {
      calls.push({ receiver: node.expression.expression.getText(source), at: node.getStart() });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

/**
 * Without shutdown hooks node runs as PID 1 in the container with no SIGTERM handler, so the
 * kernel drops `docker stop`'s SIGTERM and Docker SIGKILLs the API after 10 s on every deploy:
 * the existing `onModuleDestroy` hooks (Redis `quit()`, warmup timers), TypeORM and the HTTP
 * server never close. Read as a syntax tree, so a comment or string cannot satisfy it.
 */
describe('main.ts', () => {
  it('enables shutdown hooks on the app before it listens', () => {
    const source = ts.createSourceFile(
      'main.ts',
      readFileSync(MAIN, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const listen = methodCalls(source, 'listen');
    const hooks = methodCalls(source, 'enableShutdownHooks');

    expect(listen).toHaveLength(1);
    expect(hooks).toHaveLength(1);
    expect(hooks[0]?.receiver).toBe(listen[0]?.receiver);
    expect(hooks[0]?.at).toBeLessThan(listen[0]?.at ?? 0);
  });
});
