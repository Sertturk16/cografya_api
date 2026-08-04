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
 *     present, or after `governmentFormTr`, keeping the seed's field order stable.
 */
import * as fs from 'node:fs';
import ts from 'typescript';

import { NARRATIVE_FIELDS, type NarrativeField } from './draft-parser.ts';
import { emitConcat } from './emit.ts';
import { foldStringConcat } from './seed-reader.ts';

/**
 * Seed field order — narrative fields always follow `governmentFormTr`.
 *
 * It used to be `independenceNoteTr`, which became a NARRATIVE field itself in the dalga-1 wave
 * (Atlas ruling S2 → see `NARRATIVE_FIELDS`). A field cannot be both the anchor and a thing that
 * anchors on it, so the anchor moved back one slot to the last NON-narrative property in the
 * seed objects. Behaviour for the five pre-existing narrative fields is unchanged: they anchored
 * on `independenceNoteTr` before and still do, since it now sits first in `NARRATIVE_FIELDS`.
 */
const ANCHOR_FIELD = 'governmentFormTr';

export interface PendingWrite {
  readonly isoCode: string;
  readonly field: NarrativeField;
  readonly value: string;
}

/**
 * A field whose committed value is a non-null string that DIFFERS from the draft.
 *
 * WHY THIS IS NOT JUST AN UPDATE (the C1 failure): the draft is not automatically newer
 * than the seed. A correction landed directly on the seed (PR #46 fixed the country name
 * `Ekvator` -> `Ekvador` on `BR.introTr` / `CO.introTr`) leaves the draft stale, and an
 * unconditional `apply` silently reverts a live, reviewed fix on public pages — via the
 * very command `ENGINEERING.md` §8 mandates. The only defence was a human reading the diff,
 * which is precisely the defence that failed in PR #43 and caused this tool to exist.
 *
 * So divergence is a QUESTION, not an instruction: report it and refuse. Overwriting is
 * still one flag away (`--force`) for the legitimate case — NOVA revising prose on purpose.
 */
export interface Divergence {
  readonly isoCode: string;
  readonly field: NarrativeField;
  readonly committed: string;
  readonly draft: string;
}

export interface ApplyResult {
  readonly file: string;
  readonly updated: number;
  readonly inserted: number;
  /** Fields whose committed value already equals the draft — deliberately left untouched. */
  readonly skipped: number;
  /** Non-null committed values that differ from the draft. Empty unless `force` is set. */
  readonly diverged: readonly Divergence[];
  readonly text: string;
}

export interface ApplyOptions {
  /** Overwrite a diverging non-null committed value. Off by default, on purpose. */
  readonly force?: boolean;
}

interface Splice {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  /** Emission index — the tie-break when two splices share a start offset (see below). */
  readonly order: number;
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
 * Where a property assignment ENDS for splicing purposes, and whether it is comma-terminated.
 *
 * THE SEPARATOR IS A CORRECTNESS CONCERN, not a formatting one: this module writes TypeScript
 * SOURCE, and two object properties that end up separated by a newline alone are a syntax
 * error (`',' expected`). Getting it wrong produces a seed file that does not compile — and
 * because `ts.createSourceFile` is error-tolerant, the `check` gate would still read the
 * wreckage and report its counts. So the comma is found deliberately rather than assumed.
 *
 * Scanning forward past WHITESPACE (rather than testing the single adjacent character, which
 * is what this used to do) closes two distinct ways of emitting unparseable output:
 *   - the property has NO trailing comma — the caller must supply one;
 *   - the comma exists but is not adjacent (`governmentFormTr: 'x'  ,`) — the old adjacency
 *     test declared it absent, so the splice landed IN FRONT of it and produced `…,  ,`.
 *
 * Both were reachable through the ORDINARY anchor path, i.e. they predate the no-anchor
 * fallback this file also grew; the fallback merely widened the set of shapes that reach here.
 */
function endOfProperty(
  text: string,
  property: ts.PropertyAssignment,
): { end: number; hasComma: boolean } {
  const propertyEnd = property.getEnd();
  let scan = propertyEnd;
  while (scan < text.length && /[\s]/u.test(text[scan] ?? '')) scan += 1;
  return text[scan] === ','
    ? { end: scan + 1, hasComma: true }
    : { end: propertyEnd, hasComma: false };
}

/**
 * Compute the new text for one seed file. Pure over (text, writes) — no I/O, so it is
 * directly unit-testable and deterministic.
 */
export function applyToSource(
  fileName: string,
  text: string,
  writes: readonly PendingWrite[],
  options: ApplyOptions = {},
): ApplyResult {
  const byIso = new Map<string, Map<NarrativeField, string>>();
  for (const write of writes) {
    const existing = byIso.get(write.isoCode) ?? new Map<NarrativeField, string>();
    existing.set(write.field, write.value);
    byIso.set(write.isoCode, existing);
  }

  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const splices: Splice[] = [];
  const diverged: Divergence[] = [];
  /**
   * Properties that already carry a comma AS A RESULT OF THIS PASS, so nothing adds a second
   * one. Getting this wrong yields `,,` — just as unparseable as the missing comma it was
   * meant to fix.
   *
   * TWO WAYS A PROPERTY ENDS UP COMMA-TERMINATED MID-PASS, and both must be recorded here:
   *   - an INSERT synthesised the separator (several fields on one comma-less anchor);
   *   - an UPDATE rewrote the property, and `emitConcat` always emits a trailing comma. This
   *     one is easy to miss, because the update and the insert are different branches that
   *     never look at each other: a comma-less property that is BOTH rewritten and used as
   *     the anchor for a new field reads as comma-less from the ORIGINAL text, so the insert
   *     branch helpfully adds the comma the update branch had already supplied.
   *
   * ORDER CANNOT BE ASSUMED, which is the trap here. For the NORMAL anchor chain a field's
   * anchor is always an earlier entry of `NARRATIVE_FIELDS`, so the anchor is processed first
   * and a flag would be enough. The no-anchor FALLBACK breaks that: it anchors on the object's
   * LAST property, which may be a LATER narrative field — one whose own update has not run yet
   * and will append its own comma afterwards. So a synthesised comma is not just recorded, it
   * stays CANCELLABLE until the pass ends.
   */
  const commaSupplied = new Set<ts.PropertyAssignment>();
  /** Anchor -> `order` of the comma splice synthesised for it, so a later update can cancel it. */
  const synthesisedComma = new Map<ts.PropertyAssignment, number>();
  /** `order` values of splices that a later decision retracted; filtered out before applying. */
  const cancelledSplices = new Set<number>();
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
            const committed = foldStringConcat(existing.initializer);
            if (committed === value) {
              skipped += 1;
              continue;
            }
            // `committed === null` means the initializer is not a string at all — `null`,
            // the normal "not yet seeded" state. Writing that is the happy path.
            // A non-null string that differs is a DIVERGENCE (see `Divergence`).
            if (committed !== null && options.force !== true) {
              diverged.push({ isoCode: isoCode ?? '?', field, committed, draft: value });
              continue;
            }
            const start = existing.getStart(source);
            const indent = columnOf(text, start);
            // Extend to include the trailing comma so the replacement owns it. `emitConcat`
            // always emits its own trailing comma, so leaving a non-adjacent original behind
            // would produce `newValue,  ,` — see `endOfProperty`.
            const { end } = endOfProperty(text, existing);
            // Splice from the START OF THE LINE, not from the property name: `emitConcat`
            // renders its own leading indent, and replacing from the name would leave the
            // original indent in place and double it.
            //
            // KNOWN LIMITATION, pre-existing and recorded rather than papered over: this
            // assumes the property OWNS its line, which is true of every committed seed file
            // (prettier, printWidth 100, one property per line) and false of a single-line
            // object literal — there, "the start of the line" is the start of the whole
            // statement, so the replacement eats the prefix. Unreachable in this repo: a
            // country row carries 15+ properties and cannot fit on one line. `cli.ts` re-parses
            // every file before writing, so even if it somehow happened the tool refuses
            // instead of committing wreckage.
            splices.push({
              start: start - indent,
              end,
              text: emitConcat(value, indent, field),
              order: splices.length,
            });
            // The replacement ends with `emitConcat`'s own trailing comma, so this property is
            // comma-terminated from here on — even if the ORIGINAL text had none. Recorded so
            // a field inserted against this same property later in the pass does not read the
            // original, conclude "no comma", and synthesise a second one…
            commaSupplied.add(existing);
            // …and, for the fallback case where the insert already ran (it anchored on this
            // property as the object's LAST one, before we knew it would be rewritten), retract
            // the comma it synthesised. Cancelling is what makes the two branches order-
            // independent instead of merely order-lucky.
            const alreadySynthesised = synthesisedComma.get(existing);
            if (alreadySynthesised !== undefined) cancelledSplices.add(alreadySynthesised);
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
            // NO ANCHOR AT ALL — fall back to the object's LAST property rather than refusing.
            //
            // This is reachable in practice, and the dalga-1 wave is where it becomes so: a row
            // whose `governmentFormTr` and `independenceNoteTr` are both inapplicable (Antarktika
            // is the live example) has no anchor unless the author keeps explicit `: null,`
            // properties for fields the row will never use. That constraint is documented for
            // seed authors and remains the primary rule — but the tool should not DIE when a
            // reasonable-looking cleanup removes a null property.
            //
            // WHAT THE FALLBACK COSTS, stated precisely (an earlier revision of this comment
            // claimed "nothing is lost", which was too strong on two counts and is the kind of
            // over-claim this file is otherwise careful about):
            //   - the field lands at the END of the object, OUT of `NARRATIVE_FIELDS` order —
            //     visible in the diff, but it is a real deviation from house field order;
            //   - when SOME fields anchor normally and others fall back in the same pass, the
            //     two groups are ordered relative to their own anchors, so the object's overall
            //     field order can differ from `NARRATIVE_FIELDS`. Correct content, unusual
            //     order.
            // What IS guaranteed is narrower and is enforced rather than asserted: the output
            // parses (see `endOfProperty` + the applier tests' shared re-parse check), and no
            // prose value is altered.
            for (const property of node.properties) {
              if (ts.isPropertyAssignment(property)) anchor = property;
            }
          }
          if (anchor === undefined) {
            // Unreachable by construction: `wanted` is only defined when this object literal
            // carries an `isoCode` property assignment, so there is always at least one. Kept
            // as a loud failure rather than a non-null assertion, in case that ever changes.
            throw new Error(
              `applyToSource: cannot place "${field}" for ${isoCode ?? '?'} — ` +
                `the object literal has no property to anchor on.`,
            );
          }
          const { end, hasComma } = endOfProperty(text, anchor);
          const indent = columnOf(text, anchor.getStart(source));
          if (!hasComma && !commaSupplied.has(anchor)) {
            // A ZERO-WIDTH splice carrying just the separator, pushed BEFORE the field's own
            // splice at the same offset. Splices sharing an offset are applied
            // highest-`order`-first, so the lowest-order one ends up physically first — i.e.
            // this comma lands directly against the anchor, ahead of every field inserted
            // here. Each emitted field already ends with its own comma, so ONE separator per
            // anchor is enough — see `commaSupplied` for the two ways an anchor can already
            // have acquired it during this same pass.
            commaSupplied.add(anchor);
            synthesisedComma.set(anchor, splices.length);
            splices.push({ start: end, end, text: ',', order: splices.length });
          }
          splices.push({
            start: end,
            end,
            text: `\n${emitConcat(value, indent, field)}`,
            order: splices.length,
          });
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

  // Back-to-front so earlier offsets stay valid. Two INSERTIONS can share a start offset
  // (both anchor on the same existing property); applying those in emission order would
  // land them reversed, because each one is spliced in ahead of the previous. Applying the
  // LATER-emitted one first leaves the earlier one in front of it, which is the seed field
  // order `NARRATIVE_FIELDS` defines.
  const ordered = [...splices]
    .filter((splice) => !cancelledSplices.has(splice.order))
    .sort((a, b) => b.start - a.start || b.order - a.order);
  let output = text;
  for (const splice of ordered) {
    output = output.slice(0, splice.start) + splice.text + output.slice(splice.end);
  }

  return { file: fileName, updated, inserted, skipped, diverged, text: output };
}

export function applyToFile(
  filePath: string,
  writes: readonly PendingWrite[],
  options: ApplyOptions = {},
): ApplyResult {
  const text = fs.readFileSync(filePath, 'utf8');
  return applyToSource(filePath, text, writes, options);
}
