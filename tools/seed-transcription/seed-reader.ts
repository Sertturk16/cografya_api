/**
 * Reads the committed seed files through the TypeScript AST.
 *
 * The seed data is parsed, never regex-scraped: a `+`-concatenation of string literals is
 * folded by walking the binary expression, which is exactly how the compiler sees it. That
 * makes the reader agree with the runtime value by construction — the whole point of the
 * roundtrip gate is that it cannot disagree with what actually reaches Postgres.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

import { NARRATIVE_FIELDS, type NarrativeField } from './draft-parser.ts';

export interface SeededField {
  readonly isoCode: string;
  readonly field: NarrativeField;
  /** Folded value of the concatenation — what the seeder writes to the column. */
  readonly value: string;
  readonly file: string;
}

export interface SeededCountry {
  readonly isoCode: string;
  readonly nameTr: string;
  readonly nameEn: string;
  readonly file: string;
}

function isNarrativeField(name: string): name is NarrativeField {
  return (NARRATIVE_FIELDS as readonly string[]).includes(name);
}

/** Fold a string-literal `+` chain to its value. Returns null for anything else. */
export function foldStringConcat(node: ts.Expression): string | null {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) return foldStringConcat(node.expression);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = foldStringConcat(node.left);
    const right = foldStringConcat(node.right);
    if (left === null || right === null) return null;
    return left + right;
  }
  return null;
}

function propertyName(property: ts.ObjectLiteralElementLike): string | null {
  if (!ts.isPropertyAssignment(property)) return null;
  const name = property.name;
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteralLike(name)) return name.text;
  return null;
}

export interface SeedIndex {
  readonly fields: readonly SeededField[];
  readonly countries: readonly SeededCountry[];
  /**
   * SYNTAX errors found while parsing the seed sources. Empty on a healthy corpus.
   *
   * WHY THIS IS CARRIED RATHER THAN IGNORED: `ts.createSourceFile` is ERROR-TOLERANT. Handed
   * a seed file with a missing comma it returns a tree anyway — one that silently drops
   * properties or whole rows. The index would then be quietly incomplete, and `check` would
   * report "0 drifted" over fields it never actually read: a false green on the very command
   * `ENGINEERING.md` §8 mandates as the content-fidelity gate. The gate's remit is content,
   * not syntax — but a gate that can be defeated by a broken file is not a gate, so the
   * condition is surfaced here and refused by the CLI (`cli.ts`) rather than swallowed.
   */
  readonly syntaxErrors: readonly string[];
}

/**
 * Syntax errors in a TypeScript source, as human-readable strings. Empty means it parses.
 *
 * Uses `ts.transpileModule({ reportDiagnostics: true })` — a PUBLIC API that performs no type
 * checking and needs no compiler host, so it is cheap enough to run on every write. (The
 * `SourceFile.parseDiagnostics` property would be the obvious alternative and is deliberately
 * NOT used: it is internal to the TypeScript API and reaching it requires an `any` cast, which
 * this repo does not ship.)
 *
 * Shared by the reader, the CLI's pre-write verification and the applier's tests, so all three
 * agree on one definition of "this is valid TypeScript".
 */
export function syntaxErrorsIn(text: string): string[] {
  const output = ts.transpileModule(text, {
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.Latest },
  });
  return (output.diagnostics ?? []).map(
    (diagnostic) => `${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
  );
}

/**
 * Index ONE seed source's text. Pure over (label, text) — no I/O, so it is directly
 * unit-testable and deterministic, matching the `applyToSource` / `applyToFile` split next door.
 *
 * `label` is the value recorded on every result (`file`); it is also handed to the compiler as
 * the source file name, which nothing here reads — the parser needs a name, not a real path.
 *
 * WHAT IT SURVIVES, and why that is worth a test rather than an assumption: a seed row may carry
 * properties this reader has no interest in, of shapes `foldStringConcat` cannot fold. An enum
 * member reference (`entityType: CountryEntityType.Territory`) is a property-access expression,
 * so folding returns null and the loop skips it — crucially WITHOUT disturbing row detection,
 * which keys on the `isoCode`/`nameTr`/`nameEn` triple. A plain string that is not a narrative
 * field (`statusLabelTr: 'Danimarka Özerk Bölgesi'`) folds fine but is filtered out by
 * `isNarrativeField`, so approved card copy never enters the prose index and can never be
 * reported as drifted prose.
 */
export function indexSeedSource(label: string, text: string): SeedIndex {
  const fields: SeededField[] = [];
  const countries: SeededCountry[] = [];
  const syntaxErrors = syntaxErrorsIn(text).map((message) => `${label}: ${message}`);
  const source = ts.createSourceFile(label, text, ts.ScriptTarget.Latest, true);

  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      // One map, not two: `scalars` and `concats` were built identically and only one was
      // ever read. `foldStringConcat` already covers both the single-literal and the
      // `+`-chain shapes, so there is nothing for a second map to distinguish.
      const scalars = new Map<string, string>();

      for (const property of node.properties) {
        const name = propertyName(property);
        if (name === null || !ts.isPropertyAssignment(property)) continue;
        const folded = foldStringConcat(property.initializer);
        if (folded === null) continue;
        scalars.set(name, folded);
      }

      const isoCode = scalars.get('isoCode');
      const nameTr = scalars.get('nameTr');
      const nameEn = scalars.get('nameEn');

      // A country object is identified by carrying all three identity fields — this
      // avoids mistaking a nested literal for a country entry.
      if (isoCode !== undefined && nameTr !== undefined && nameEn !== undefined) {
        countries.push({ isoCode, nameTr, nameEn, file: label });
        for (const [name, value] of scalars) {
          if (isNarrativeField(name)) fields.push({ isoCode, field: name, value, file: label });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);

  return { fields, countries, syntaxErrors };
}

/** Read every `*.countries.ts` file in a directory into a flat index. */
export function readSeedDirectory(directory: string): SeedIndex {
  const fields: SeededField[] = [];
  const countries: SeededCountry[] = [];
  const syntaxErrors: string[] = [];

  const files = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.countries.ts'))
    .sort();

  for (const file of files) {
    const text = fs.readFileSync(path.join(directory, file), 'utf8');
    const indexed = indexSeedSource(file, text);
    fields.push(...indexed.fields);
    countries.push(...indexed.countries);
    syntaxErrors.push(...indexed.syntaxErrors);
  }

  return { fields, countries, syntaxErrors };
}
