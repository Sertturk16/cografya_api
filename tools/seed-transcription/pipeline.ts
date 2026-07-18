/**
 * The glue between parsing, resolution and the seed index — kept PURE and separate from
 * `cli.ts` so it can be tested.
 *
 * WHY THIS MODULE EXISTS: every leaf module was well covered in isolation, but the glue
 * was not — including the `isoCode -> seed file` routing, where a bug writes one country's
 * prose into another country's file. That is the exact corruption class this tool exists
 * to prevent, one layer up. No `fs`, no `process`, no `argv` here: the caller supplies the
 * already-read draft text and the already-read seed index.
 */
import { parseDraft, type NarrativeField } from './draft-parser.ts';
import type { SeedIndex } from './seed-reader.ts';
import { resolveCountry } from './resolve-country.ts';
import type { PendingWrite } from './apply.ts';

export interface DraftInput {
  /** How this draft is named in diagnostics. Use a path, not a basename (see below). */
  readonly label: string;
  readonly markdown: string;
}

export interface Item {
  readonly isoCode: string;
  readonly field: NarrativeField;
  readonly value: string;
  readonly heading: string;
  readonly draft: string;
  readonly tightJoins: readonly string[];
}

export interface Collected {
  readonly items: readonly Item[];
  /** Fatal. The caller must not proceed on a partly-understood draft. */
  readonly errors: readonly string[];
  /** Non-fatal, but never silent. */
  readonly warnings: readonly string[];
}

export function collect(drafts: readonly DraftInput[], seed: SeedIndex): Collected {
  const items: Item[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // Keyed `isoCode.field` ACROSS all drafts, because that is the granularity at which a
  // collision actually corrupts: two drafts carrying the same country+field with different
  // prose used to resolve last-wins, silently. The consequence was not merely a wrong
  // value — `apply` could never reach a fixed point, so `check` reported a permanent drift
  // forever and the mandated gate could never go green. `resolve-country.ts` is emphatic
  // that ambiguity must FAIL LOUDLY, NEVER GUESS; this path used to guess.
  const seen = new Map<string, { readonly value: string; readonly draft: string }>();

  for (const { label, markdown } of drafts) {
    const { fields, diagnostics } = parseDraft(markdown);

    for (const diagnostic of diagnostics) {
      const rendered = `${label}:${diagnostic.line} ${diagnostic.message}`;
      if (diagnostic.severity === 'error') errors.push(rendered);
      else warnings.push(rendered);
    }

    const resolved = new Map<string, string>();

    for (const parsed of fields) {
      let isoCode = resolved.get(parsed.section);
      if (isoCode === undefined) {
        const resolution = resolveCountry(parsed.section, seed.countries);
        if (!resolution.ok) {
          errors.push(`${label}:${parsed.line} ${resolution.reason}`);
          continue;
        }
        isoCode = resolution.isoCode;
        resolved.set(parsed.section, isoCode);
      }

      const key = `${isoCode}.${parsed.field}`;
      const previous = seen.get(key);
      if (previous !== undefined) {
        // Identical prose in two drafts is harmless — nothing to choose between.
        if (previous.value !== parsed.value) {
          errors.push(
            `${label}:${parsed.line} ${key} is defined twice with different prose ` +
              `(also in "${previous.draft}") — pass only the authoritative draft`,
          );
        }
        continue;
      }
      seen.set(key, { value: parsed.value, draft: label });

      items.push({
        isoCode,
        field: parsed.field,
        value: parsed.value,
        heading: parsed.section,
        draft: label,
        tightJoins: parsed.tightJoins,
      });
    }
  }

  return { items, errors, warnings };
}

export interface CheckReport {
  readonly matched: number;
  readonly drifted: readonly string[];
  readonly missing: readonly string[];
}

export function evaluateCheck(items: readonly Item[], seed: SeedIndex): CheckReport {
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

  return { matched: items.length - missing.length - drifted.length, drifted, missing };
}

export interface Routed {
  readonly byFile: ReadonlyMap<string, readonly PendingWrite[]>;
  readonly errors: readonly string[];
}

/**
 * Group pending writes by the seed file that owns each country.
 *
 * A country is routed ONLY by its own entry in the seed index — never by draft order, file
 * name, or position. An unknown `isoCode` is an error, not a skip.
 */
export function routeWrites(items: readonly Item[], seed: SeedIndex): Routed {
  const fileOf = new Map<string, string>();
  for (const country of seed.countries) fileOf.set(country.isoCode, country.file);

  const byFile = new Map<string, PendingWrite[]>();
  const errors: string[] = [];

  for (const item of items) {
    const file = fileOf.get(item.isoCode);
    if (file === undefined) {
      errors.push(`${item.isoCode} is not present in any seed file`);
      continue;
    }
    const list = byFile.get(file) ?? [];
    list.push({ isoCode: item.isoCode, field: item.field, value: item.value });
    byFile.set(file, list);
  }

  return { byFile, errors };
}
