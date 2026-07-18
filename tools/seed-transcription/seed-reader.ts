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
}

/** Read every `*.countries.ts` file in a directory into a flat index. */
export function readSeedDirectory(directory: string): SeedIndex {
  const fields: SeededField[] = [];
  const countries: SeededCountry[] = [];

  const files = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.countries.ts'))
    .sort();

  for (const file of files) {
    const fullPath = path.join(directory, file);
    const text = fs.readFileSync(fullPath, 'utf8');
    const source = ts.createSourceFile(fullPath, text, ts.ScriptTarget.Latest, true);

    const visit = (node: ts.Node): void => {
      if (ts.isObjectLiteralExpression(node)) {
        const scalars = new Map<string, string>();
        const concats = new Map<string, string>();

        for (const property of node.properties) {
          const name = propertyName(property);
          if (name === null || !ts.isPropertyAssignment(property)) continue;
          const folded = foldStringConcat(property.initializer);
          if (folded === null) continue;
          scalars.set(name, folded);
          concats.set(name, folded);
        }

        const isoCode = scalars.get('isoCode');
        const nameTr = scalars.get('nameTr');
        const nameEn = scalars.get('nameEn');

        // A country object is identified by carrying all three identity fields — this
        // avoids mistaking a nested literal for a country entry.
        if (isoCode !== undefined && nameTr !== undefined && nameEn !== undefined) {
          countries.push({ isoCode, nameTr, nameEn, file });
          for (const [name, value] of concats) {
            if (isNarrativeField(name)) fields.push({ isoCode, field: name, value, file });
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return { fields, countries };
}
