/**
 * ONE-OFF — wave N1 province `climateNarrativeTr` transcription (NOT a tool generalization).
 *
 * WHY THIS EXISTS, AND WHY IT IS SEPARATE FROM `cli.ts`
 * ────────────────────────────────────────────────────
 * The main `seed:transcribe` pipeline (cli.ts + pipeline.ts + apply.ts + resolve-country.ts)
 * is COUNTRY-only by construction: it reads `src/database/seeds/countries/*.countries.ts`,
 * identifies an entity by `isoCode`+`nameTr`+`nameEn`, and keys every route/write on
 * `isoCode`. Provinces have `plateCode`+`nameTr`+`slugTr/En` and NONE of `isoCode`/`nameEn`,
 * so that pipeline cannot see them. Extending it to a second identity axis (plate code) is a
 * multi-module refactor that a single 9-province wave does not justify — Atlas ruled it
 * REJECTED as speculative generality for N1 (Path A), to be revisited on its own evidenced
 * PR only if a later wave shows this one-off is clunky.
 *
 * What this file DELIBERATELY REUSES is the ONE piece that actually kills the PR #43 bug
 * class: the proven, property-tested, lossless emitter `emitConcat` (emit.ts) and the AST
 * folder `foldStringConcat` (seed-reader.ts). No prose is ever retyped by hand — the body is
 * extracted from NOVA's draft programmatically, emitted by the same code the country tool
 * uses, and the CONVENTIONS §2 byte-for-byte roundtrip is re-run here (`check`) and is
 * independently reproducible by the content-fidelity reviewer with the exact command in the
 * closing summary.
 *
 * USAGE (reviewer-reproducible — pass the two authoritative draft paths):
 *   node tools/seed-transcription/oneoff-n1-province-climate.ts emit  <pilot.md> <n1.md>
 *   node tools/seed-transcription/oneoff-n1-province-climate.ts check <pilot.md> <n1.md>
 *
 * `emit`  prints the `climateNarrativeTr:` concatenation snippet for each of the 9 provinces.
 * `check` folds the committed value out of `province.seed-data.ts` and byte-diffs it against
 *         the freshly-extracted draft body — exit 0 iff all 9 are identical (0 drifted, 0
 *         missing), the same exit-code contract as `seed:transcribe check`.
 *
 * BODY-BOUNDARY RULE (Atlas-confirmed 2026-07-20): the seeded body is the NARRATIVE
 * PARAGRAPHS ONLY of each `## N. <Province>` section. Excluded: the `**Veri:**` block, the
 * `**Mekanizma → kaynak:**` block and everything after it, any other `**bold:**`-led meta
 * paragraph, tables (`|`), rules (`---`) and headings. A paragraph is kept iff its first line
 * is plain prose; a `**Mekanizma` paragraph STOPS the section; any other `**`-led paragraph
 * (e.g. `**Veri:**`) is SKIPPED.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

import { emitConcat } from './emit.ts';
import { foldStringConcat } from './seed-reader.ts';

/** Draft-heading name (exact, incl. Turkish diacritics) -> canonical plate code. */
const TARGETS: readonly { readonly name: string; readonly plate: string }[] = [
  { name: 'Antalya', plate: '07' },
  { name: 'Rize', plate: '53' },
  { name: 'Konya', plate: '42' },
  { name: 'Erzurum', plate: '25' },
  { name: 'İstanbul', plate: '34' },
  { name: 'Artvin', plate: '08' },
  { name: 'Kütahya', plate: '43' },
  { name: 'Hakkâri', plate: '30' },
  { name: 'Ağrı', plate: '04' },
];

const SEED_FILE = path.resolve(
  import.meta.dirname,
  '../../src/database/seeds/province.seed-data.ts',
);

/**
 * The JOIN RULE, copied verbatim from `draft-parser.ts` (kept local so this one-off does not
 * force an export purely for a throwaway): join hard-wrapped lines with a single space,
 * EXCEPT when the accumulated text ends with a Turkish suffix-binding character (apostrophe)
 * or a hyphen (range/compound), where the join is tight. Every tight join is surfaced.
 */
const TIGHT_JOIN_SUFFIX = /['’-]$/u;

interface ExtractResult {
  readonly value: string;
  readonly tightJoins: readonly string[];
}

/** Extract the narrative body of one `## N. <name>` province section from a draft. */
function extractBody(markdown: string, targetName: string): ExtractResult | null {
  const lines = markdown.replace(/\r\n?/gu, '\n').split('\n');

  // Locate the section heading: `## <n>. <name>` optionally followed by ` (Köppen)`.
  const headingRe = /^##\s+\d+\.\s+(?<name>.+?)\s*(?:\(.*\))?\s*$/u;
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const m = headingRe.exec(lines[i] ?? '');
    if (m?.groups?.['name'] === targetName) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return null;

  // Section runs until the next `##` heading (or EOF).
  let end = lines.length;
  for (let i = start; i < lines.length; i += 1) {
    if (/^##\s/u.test(lines[i] ?? '')) {
      end = i;
      break;
    }
  }

  // Group the section into blank-line-separated paragraphs.
  const paragraphs: string[][] = [];
  let current: string[] = [];
  for (let i = start; i < end; i += 1) {
    const raw = (lines[i] ?? '').trim();
    if (raw === '') {
      if (current.length > 0) {
        paragraphs.push(current);
        current = [];
      }
      continue;
    }
    current.push(raw);
  }
  if (current.length > 0) paragraphs.push(current);

  const bodyParas: string[] = [];
  const tightJoins: string[] = [];
  for (const para of paragraphs) {
    const first = para[0] ?? '';
    if (/^\*\*Mekanizma/u.test(first)) break; // sources block — stop, exclude the rest
    if (first.startsWith('**')) continue; // **Veri:** and any other bold meta — skip
    if (first.startsWith('|') || first.startsWith('---') || first.startsWith('#')) continue;

    let acc = '';
    for (const line of para) {
      if (acc === '') {
        acc = line;
      } else if (TIGHT_JOIN_SUFFIX.test(acc)) {
        tightJoins.push(`${acc.slice(-30)}⟨no-space⟩${line.slice(0, 20)}`);
        acc += line;
      } else {
        acc = `${acc} ${line}`;
      }
    }
    bodyParas.push(acc);
  }

  if (bodyParas.length === 0) return null;
  return { value: bodyParas.join('\n\n'), tightJoins };
}

/** Fold the committed `climateNarrativeTr` value for each plate code out of the seed AST. */
function readCommitted(): Map<string, string> {
  const text = fs.readFileSync(SEED_FILE, 'utf8');
  const source = ts.createSourceFile(SEED_FILE, text, ts.ScriptTarget.Latest, true);
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

function collect(draftPaths: readonly string[]): Map<string, ExtractResult> {
  const drafts = draftPaths.map((p) => fs.readFileSync(p, 'utf8'));
  const found = new Map<string, ExtractResult>();
  for (const target of TARGETS) {
    for (const markdown of drafts) {
      const body = extractBody(markdown, target.name);
      if (body !== null) {
        found.set(target.plate, body);
        break;
      }
    }
  }
  return found;
}

function main(): number {
  const [mode, ...draftPaths] = process.argv.slice(2);
  if ((mode !== 'emit' && mode !== 'check') || draftPaths.length === 0) {
    process.stderr.write('usage: oneoff-n1-province-climate.ts <emit|check> <draft.md> [...]\n');
    return 2;
  }

  const bodies = collect(draftPaths);
  const missingFromDraft = TARGETS.filter((t) => !bodies.has(t.plate));
  if (missingFromDraft.length > 0) {
    process.stderr.write(
      `error: no draft body found for: ${missingFromDraft.map((t) => `${t.plate} ${t.name}`).join(', ')}\n`,
    );
    return 1;
  }

  if (mode === 'emit') {
    for (const target of TARGETS) {
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
  const committed = readCommitted();
  const drifted: string[] = [];
  const missing: string[] = [];
  for (const target of TARGETS) {
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
    `checked ${TARGETS.length} province(s): ${TARGETS.length - drifted.length - missing.length} identical, ` +
      `${drifted.length} drifted, ${missing.length} not yet seeded\n`,
  );
  if (drifted.length > 0) process.stdout.write(`\nDRIFT:\n${drifted.join('\n')}\n`);
  if (missing.length > 0) process.stdout.write(`\nNOT SEEDED:\n${missing.join('\n')}\n`);
  return drifted.length > 0 || missing.length > 0 ? 1 : 0;
}

process.exitCode = main();
