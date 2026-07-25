/**
 * Shared SHELL for the province `climateNarrativeTr` wave one-offs (N1, N2, …).
 *
 * Holds the file IO, the committed-seed AST fold and the `emit`/`check` drivers; the pure
 * classification logic lives in `oneoff-province-climate-extract.ts` and the per-wave entry
 * points (target list + usage banner + direct-invocation guard) in
 * `oneoff-n<wave>-province-climate.ts`. Deliberately `import.meta`-free: the wave CLIs own that,
 * so nothing here can break a ts-jest (CommonJS) import of a sibling module.
 *
 * WHY SHARED RATHER THAN COPIED PER WAVE: `check` IS the byte-fidelity gate. Forking its diff
 * and its exit-code contract into one copy per wave would let the gate weaken in one wave
 * without anyone noticing; keeping one copy means re-running the N1 command also regression-tests
 * the code N2's gate runs on. The wave-specific part is data (the target list), and data is what
 * gets passed in.
 */
import * as fs from 'node:fs';

import ts from 'typescript';

import { emitConcat } from './emit.ts';
import {
  collectFromContents,
  type ExtractResult,
  type WaveTarget,
} from './oneoff-province-climate-extract.ts';
import { foldStringConcat } from './seed-reader.ts';

/** Fold the committed `climateNarrativeTr` value for each plate code out of the seed AST. */
export function readCommitted(seedFile: string): Map<string, string> {
  const text = fs.readFileSync(seedFile, 'utf8');
  const source = ts.createSourceFile(seedFile, text, ts.ScriptTarget.Latest, true);
  const byPlate = new Map<string, string>();

  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      let plate: string | null = null;
      let narrative: string | null = null;
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const name = ts.isIdentifier(property.name)
          ? property.name.text
          : ts.isStringLiteralLike(property.name)
            ? property.name.text
            : null;
        if (name === 'plateCode') plate = foldStringConcat(property.initializer);
        else if (name === 'climateNarrativeTr') narrative = foldStringConcat(property.initializer);
      }
      if (plate !== null && narrative !== null) byPlate.set(plate, narrative);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return byPlate;
}

/** Read each draft path and delegate to the pure, one-authoritative-draft-per-province collector. */
function collect(
  draftPaths: readonly string[],
  targets: readonly WaveTarget[],
): Map<string, ExtractResult> {
  return collectFromContents(
    draftPaths.map((p) => fs.readFileSync(p, 'utf8')),
    targets,
  );
}

export interface WaveRunOptions {
  readonly mode: 'emit' | 'check';
  readonly draftPaths: readonly string[];
  readonly targets: readonly WaveTarget[];
  readonly seedFile: string;
}

/**
 * Run one wave's `emit` or `check`. Returns the process exit code: 0 on success, 1 when a draft
 * body is missing or the committed seed diverges from the draft (`check`).
 */
export function runWave({ mode, draftPaths, targets, seedFile }: WaveRunOptions): number {
  const bodies = collect(draftPaths, targets);
  const missingFromDraft = targets.filter((t) => !bodies.has(t.plate));
  if (missingFromDraft.length > 0) {
    process.stderr.write(
      `error: no draft body found for: ${missingFromDraft.map((t) => `${t.plate} ${t.name}`).join(', ')}\n`,
    );
    return 1;
  }

  if (mode === 'emit') {
    for (const target of targets) {
      const body = bodies.get(target.plate);
      if (body === undefined) continue;
      process.stdout.write(`// ${target.plate} ${target.name} (${body.value.length} chars)\n`);
      process.stdout.write(`${emitConcat(body.value, 4, 'climateNarrativeTr')}\n`);
      for (const join of body.tightJoins) process.stdout.write(`//   tight-join: ${join}\n`);
      process.stdout.write('\n');
    }
    return 0;
  }

  // check
  const committed = readCommitted(seedFile);
  const drifted: string[] = [];
  const missing: string[] = [];
  for (const target of targets) {
    const draftValue = bodies.get(target.plate)?.value ?? '';
    const seedValue = committed.get(target.plate);
    if (seedValue === undefined) {
      missing.push(`  ${target.plate} ${target.name} — absent from the seed`);
      continue;
    }
    if (seedValue !== draftValue) {
      let at = 0;
      while (at < seedValue.length && at < draftValue.length && seedValue[at] === draftValue[at]) {
        at += 1;
      }
      drifted.push(
        `  ${target.plate} ${target.name} — diverges at offset ${at}\n` +
          `      draft: ${JSON.stringify(draftValue.slice(Math.max(0, at - 30), at + 40))}\n` +
          `      seed : ${JSON.stringify(seedValue.slice(Math.max(0, at - 30), at + 40))}`,
      );
    }
  }

  process.stdout.write(
    `checked ${targets.length} province(s): ${targets.length - drifted.length - missing.length} identical, ` +
      `${drifted.length} drifted, ${missing.length} not yet seeded\n`,
  );
  if (drifted.length > 0) process.stdout.write(`\nDRIFT:\n${drifted.join('\n')}\n`);
  if (missing.length > 0) process.stdout.write(`\nNOT SEEDED:\n${missing.join('\n')}\n`);
  return drifted.length > 0 || missing.length > 0 ? 1 : 0;
}

/** Parse `<emit|check> <draft.md> [...]` argv; returns null when the usage is wrong. */
export function parseArgs(
  argv: readonly string[],
): { mode: 'emit' | 'check'; draftPaths: readonly string[] } | null {
  const [mode, ...draftPaths] = argv;
  if ((mode !== 'emit' && mode !== 'check') || draftPaths.length === 0) return null;
  return { mode, draftPaths };
}
