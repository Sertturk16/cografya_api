/**
 * Applies parsed draft values into the seed files as a minimal, AST-precise edit.
 *
 * DIFF NOISE IS A CORRECTNESS CONCERN, not a cosmetic one: a wave that rewrites whole
 * files buries the three lines that changed, and the content-fidelity reviewer cannot see
 * what actually moved. So edits are computed as byte ranges over the ORIGINAL text and
 * spliced back-to-front; every byte outside a touched property is preserved exactly.
 *
 * Two shapes are handled:
 *   - the property already exists (`introTr: null,` or an older concatenation) — its whole
 *     assignment is replaced;
 *   - the property is absent — it is inserted after the last narrative field already
 *     present, or after `independenceNoteTr`, keeping the seed's field order stable.
 */
import * as fs from 'node:fs';
import ts from 'typescript';

import { NARRATIVE_FIELDS, type NarrativeField } from './draft-parser.ts';
import { emitConcat } from './emit.ts';
import { foldStringConcat } from './seed-reader.ts';

/** Seed field order — narrative fields always follow `independenceNoteTr`. */
const ANCHOR_FIELD = 'independenceNoteTr';

export interface PendingWrite {
  readonly isoCode: string;
  readonly field: NarrativeField;
  readonly value: string;
}

export interface ApplyResult {
  readonly file: string;
  readonly updated: number;
  readonly inserted: number;
  /** Fields whose committed value already equals the draft — deliberately left untouched. */
  readonly skipped: number;
  readonly text: string;
}

interface Splice {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

function propertyName(property: ts.ObjectLiteralElementLike): string | null {
  if (!ts.isPropertyAssignment(property)) return null;
  const name = property.name;
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  return null;
}

function columnOf(text: string, position: number): number {
  return position - text.lastIndexOf('\n', position - 1) - 1;
}

/**
 * Compute the new text for one seed file. Pure over (text, writes) — no I/O, so it is
 * directly unit-testable and deterministic.
 */
export function applyToSource(
  fileName: string,
  text: string,
  writes: readonly PendingWrite[],
): ApplyResult {
  const byIso = new Map<string, Map<NarrativeField, string>>();
  for (const write of writes) {
    const existing = byIso.get(write.isoCode) ?? new Map<NarrativeField, string>();
    existing.set(write.field, write.value);
    byIso.set(write.isoCode, existing);
  }

  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const splices: Splice[] = [];
  let updated = 0;
  let inserted = 0;
  let skipped = 0;

  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      let isoCode: string | null = null;
      for (const property of node.properties) {
        if (propertyName(property) !== 'isoCode') continue;
        if (!ts.isPropertyAssignment(property)) continue;
        if (ts.isStringLiteralLike(property.initializer)) isoCode = property.initializer.text;
      }

      const wanted = isoCode === null ? undefined : byIso.get(isoCode);
      if (wanted !== undefined) {
        const positions = new Map<string, ts.PropertyAssignment>();
        for (const property of node.properties) {
          const name = propertyName(property);
          if (name !== null && ts.isPropertyAssignment(property)) positions.set(name, property);
        }

        // Insertion anchor: after the last field that already exists and sorts before the
        // one being inserted, so seed field order stays stable across waves.
        for (const field of NARRATIVE_FIELDS) {
          const value = wanted.get(field);
          if (value === undefined) continue;

          const existing = positions.get(field);
          if (existing !== undefined) {
            // ALREADY CORRECT -> DO NOT TOUCH. The committed files were hand-wrapped, and
            // this emitter's chunk boundaries differ from those human choices for roughly
            // half of them. Re-emitting an unchanged value would churn thousands of lines
            // without changing a single character of content, burying the real edit and
            // violating the "don't rewrite existing seed data" boundary. Bytes move only
            // when the VALUE moves.
            if (foldStringConcat(existing.initializer) === value) {
              skipped += 1;
              continue;
            }
            const start = existing.getStart(source);
            const indent = columnOf(text, start);
            // Extend to include the trailing comma so the replacement owns it.
            let end = existing.getEnd();
            if (text[end] === ',') end += 1;
            // Splice from the START OF THE LINE, not from the property name: `emitConcat`
            // renders its own leading indent, and replacing from the name would leave the
            // original indent in place and double it.
            splices.push({ start: start - indent, end, text: emitConcat(value, indent, field) });
            updated += 1;
            continue;
          }

          const order = [ANCHOR_FIELD, ...NARRATIVE_FIELDS];
          const index = order.indexOf(field);
          let anchor: ts.PropertyAssignment | undefined;
          for (let i = index - 1; i >= 0 && anchor === undefined; i -= 1) {
            const name = order[i];
            if (name !== undefined) anchor = positions.get(name);
          }
          if (anchor === undefined) {
            throw new Error(
              `applyToSource: cannot place "${field}" for ${isoCode ?? '?'} — ` +
                `neither ${ANCHOR_FIELD} nor an earlier narrative field is present.`,
            );
          }
          let end = anchor.getEnd();
          if (text[end] === ',') end += 1;
          const indent = columnOf(text, anchor.getStart(source));
          splices.push({ start: end, end, text: `\n${emitConcat(value, indent, field)}` });
          inserted += 1;
          // Later fields in this pass anchor off the one just inserted only through
          // `order`, which is why insertions are emitted in NARRATIVE_FIELDS order.
          positions.set(field, anchor);
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);

  // Back-to-front so earlier offsets stay valid.
  const ordered = [...splices].sort((a, b) => b.start - a.start);
  let output = text;
  for (const splice of ordered) {
    output = output.slice(0, splice.start) + splice.text + output.slice(splice.end);
  }

  return { file: fileName, updated, inserted, skipped, text: output };
}

export function applyToFile(filePath: string, writes: readonly PendingWrite[]): ApplyResult {
  const text = fs.readFileSync(filePath, 'utf8');
  return applyToSource(filePath, text, writes);
}
