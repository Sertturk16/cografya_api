/**
 * seed-transcription — deterministic transcription of fact-checked narrative drafts into
 * the country seed files.
 *
 *   node tools/seed-transcription/cli.ts check <draft.md> [...]
 *   node tools/seed-transcription/cli.ts emit  <draft.md> [...]
 *   node tools/seed-transcription/cli.ts apply <draft.md> [...]
 *
 * `check` is the automated form of the CONVENTIONS §2 byte-for-byte roundtrip gate: it
 * re-parses the draft and diffs it against what is committed. `apply` is the prevention:
 * it writes the seed so no human transcribes prose by hand.
 *
 * Run with Node's native type stripping (Node >= 24) — no build step, so the tool is
 * usable mid-review without a compile.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseDraft, type NarrativeField } from './draft-parser.ts';
import { emitConcat } from './emit.ts';
import { readSeedDirectory, type SeedIndex } from './seed-reader.ts';
import { resolveCountry } from './resolve-country.ts';
import { applyToSource, type PendingWrite } from './apply.ts';

const SEED_DIR = path.resolve(import.meta.dirname, '../../src/database/seeds/countries');

type Mode = 'check' | 'emit' | 'apply';

interface Item {
  readonly isoCode: string;
  readonly field: NarrativeField;
  readonly value: string;
  readonly heading: string;
  readonly draft: string;
  readonly tightJoins: readonly string[];
}

interface Collected {
  readonly items: readonly Item[];
  readonly errors: readonly string[];
}

function collect(draftPaths: readonly string[], seed: SeedIndex): Collected {
  const items: Item[] = [];
  const errors: string[] = [];

  for (const draftPath of draftPaths) {
    const markdown = fs.readFileSync(draftPath, 'utf8');
    const draft = path.basename(draftPath);
    const resolved = new Map<string, string>();

    for (const parsed of parseDraft(markdown)) {
      let isoCode = resolved.get(parsed.section);
      if (isoCode === undefined) {
        const resolution = resolveCountry(parsed.section, seed.countries);
        if (!resolution.ok) {
          errors.push(`${draft}:${parsed.line} ${resolution.reason}`);
          continue;
        }
        isoCode = resolution.isoCode;
        resolved.set(parsed.section, isoCode);
      }
      items.push({
        isoCode,
        field: parsed.field,
        value: parsed.value,
        heading: parsed.section,
        draft,
        tightJoins: parsed.tightJoins,
      });
    }
  }

  return { items, errors };
}

function reportTightJoins(items: readonly Item[]): void {
  const joins = items.flatMap((item) =>
    item.tightJoins.map((join) => `  ${item.isoCode}.${item.field}: ${join}`),
  );
  if (joins.length === 0) return;
  process.stdout.write(
    `\nNo-space line joins performed (draft broke a line after "'" or "-"; verify each):\n` +
      `${joins.join('\n')}\n`,
  );
}

function runCheck(items: readonly Item[], seed: SeedIndex): number {
  const committed = new Map<string, string>();
  for (const field of seed.fields) committed.set(`${field.isoCode}.${field.field}`, field.value);

  const missing: string[] = [];
  const drifted: string[] = [];

  for (const item of items) {
    const key = `${item.isoCode}.${item.field}`;
    const actual = committed.get(key);
    if (actual === undefined) {
      missing.push(`  ${key} — in draft "${item.draft}", absent from the seed`);
      continue;
    }
    if (actual !== item.value) {
      let prefix = 0;
      while (
        prefix < actual.length &&
        prefix < item.value.length &&
        actual[prefix] === item.value[prefix]
      ) {
        prefix += 1;
      }
      drifted.push(
        `  ${key} — diverges at offset ${prefix}\n` +
          `      draft: ${JSON.stringify(item.value.slice(Math.max(0, prefix - 30), prefix + 40))}\n` +
          `      seed : ${JSON.stringify(actual.slice(Math.max(0, prefix - 30), prefix + 40))}`,
      );
    }
  }

  const matched = items.length - missing.length - drifted.length;
  process.stdout.write(
    `checked ${items.length} field(s): ${matched} identical, ` +
      `${drifted.length} drifted, ${missing.length} not yet seeded\n`,
  );
  if (drifted.length > 0) process.stdout.write(`\nDRIFT:\n${drifted.join('\n')}\n`);
  if (missing.length > 0) process.stdout.write(`\nNOT SEEDED:\n${missing.join('\n')}\n`);

  return drifted.length > 0 ? 1 : 0;
}

function runEmit(items: readonly Item[]): number {
  for (const item of items) {
    process.stdout.write(`// ${item.isoCode} — ${item.heading}\n`);
    process.stdout.write(`${emitConcat(item.value, 4, item.field)}\n`);
  }
  return 0;
}

function runApply(items: readonly Item[], seed: SeedIndex): number {
  const fileOf = new Map<string, string>();
  for (const country of seed.countries) fileOf.set(country.isoCode, country.file);

  const byFile = new Map<string, PendingWrite[]>();
  for (const item of items) {
    const file = fileOf.get(item.isoCode);
    if (file === undefined) {
      process.stderr.write(`error: ${item.isoCode} is not present in any seed file\n`);
      return 1;
    }
    const list = byFile.get(file) ?? [];
    list.push({ isoCode: item.isoCode, field: item.field, value: item.value });
    byFile.set(file, list);
  }

  for (const [file, writes] of [...byFile.entries()].sort()) {
    const fullPath = path.join(SEED_DIR, file);
    const before = fs.readFileSync(fullPath, 'utf8');
    const result = applyToSource(fullPath, before, writes);
    if (result.text === before) {
      process.stdout.write(`${file}: unchanged (${result.skipped} already correct)\n`);
      continue;
    }
    fs.writeFileSync(fullPath, result.text, 'utf8');
    process.stdout.write(
      `${file}: ${result.inserted} inserted, ${result.updated} updated, ` +
        `${result.skipped} already correct (untouched)\n`,
    );
  }

  // The emitter is Prettier-stable by construction (same printWidth, same quote rule), so
  // no reformatting step is needed. Verify rather than assume.
  process.stdout.write(`\nVerify with: pnpm exec prettier --check src/database/seeds/countries\n`);
  return 0;
}

function main(): number {
  const [modeArg, ...draftPaths] = process.argv.slice(2);
  const modes: readonly Mode[] = ['check', 'emit', 'apply'];
  if (modeArg === undefined || !modes.includes(modeArg as Mode) || draftPaths.length === 0) {
    process.stderr.write(`usage: cli.ts <${modes.join('|')}> <draft.md> [...]\n`);
    return 2;
  }

  const seed = readSeedDirectory(SEED_DIR);
  const { items, errors } = collect(draftPaths, seed);

  if (errors.length > 0) {
    process.stderr.write(`unresolved draft section(s):\n${errors.join('\n')}\n`);
    // Never proceed on a partially-understood draft: a skipped country is a silently
    // empty field, which is the failure this tool exists to prevent.
    return 1;
  }

  const mode = modeArg as Mode;
  let code: number;
  if (mode === 'check') code = runCheck(items, seed);
  else if (mode === 'emit') code = runEmit(items);
  else code = runApply(items, seed);

  if (mode !== 'emit') reportTightJoins(items);
  return code;
}

process.exitCode = main();
