/**
 * PURE extraction logic for the province `climateNarrativeTr` wave one-offs (N1, N2, …).
 *
 * This module is deliberately IO-free and `import.meta`-free so it can be unit-tested under
 * ts-jest (CommonJS) — the same pure-vs-shell split the main pipeline uses (`draft-parser.ts`
 * is pure and tested; `cli.ts` holds the IO and `import.meta`). The CLI shells that read files,
 * fold the committed seed AST and drive `emit`/`check` live in `oneoff-n<wave>-province-climate.ts`
 * (they share `oneoff-province-climate-runner.ts`).
 *
 * WAVE-NEUTRAL BY EXTRACTION, NOT BY GENERALIZATION. It was first authored for wave N1 (PR #69,
 * as `oneoff-n1-extract.ts`) and is reused verbatim by N2: only the TARGET LIST is wave-specific,
 * so the list is passed in as data and every wave shares ONE tested extractor. Copying this file
 * per wave would fork the join rule and the paragraph classification — the byte-fidelity logic —
 * into parallel copies that can silently drift, which is the opposite of what the fidelity gate
 * is for. This is still NOT a generalization of the country `seed:transcribe` pipeline (that
 * remains country-only by construction; see `oneoff-n1-province-climate.ts`).
 *
 * BODY-BOUNDARY RULE (Atlas-confirmed 2026-07-20): the seeded body is the NARRATIVE PARAGRAPHS
 * ONLY of each `## N. <Province>` section. Excluded: the `**Veri:**` block, the
 * `**Mekanizma → kaynak:**` block and everything after it, any other `**bold:**`-led meta
 * paragraph, tables (`|`), rules (`---`) and headings. A paragraph is kept iff its first line is
 * plain prose; a `**Mekanizma` paragraph STOPS the section; any other `**`-led paragraph is SKIPPED.
 */

/**
 * One province of a wave: the `## N. <name>` heading spelling used in the draft, paired with the
 * İçişleri plate code the seed row is keyed on.
 *
 * The pairing is the ONE link in this pipeline that no other gate can derive — a wrong `plate`
 * seeds one province's prose onto another province's page while `emit`, `check` and the e2e
 * plate-membership assertions all stay green, because every one of them is defined in terms of
 * this same table. `assertTargetsMatchSeed` (runner) therefore cross-checks each `name` against
 * the seed row's own `nameTr` under `foldProvinceName`.
 *
 * `name` is the DRAFT spelling, which is not always the seed spelling: wave N1's draft heading is
 * `Hakkâri` while the seed's `nameTr` is `Hakkari`. That is exactly why the cross-check folds
 * diacritics instead of comparing raw strings.
 */
export interface WaveTarget {
  readonly name: string;
  readonly plate: string;
}

/**
 * Fold a province name to a comparison key: strip diacritics (NFD, drop combining marks) and
 * case. Used ONLY to compare two spellings of the same province — never to display or to key
 * anything. Both sides of every comparison run through this same function, so the fold does not
 * have to be linguistically principled, only consistent (`Hakkâri` and `Hakkari` must meet; no
 * two distinct Turkish province names differ by diacritics alone, so the fold cannot merge two
 * real provinces).
 */
export function foldProvinceName(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** `## <n>. <name>` optionally followed by a parenthetical (the Köppen code in the wave drafts). */
const SECTION_HEADING_RE = /^##\s+\d+\.\s+(?<name>.+?)\s*(?:\(.*\))?\s*$/u;

/**
 * Every `## N. <name>` heading in a draft, in document order.
 *
 * Wave drafts number their editorial sections too (`## 5. Paylaşılan varlık …`, `## 6. Register
 * …`), so a heading is NOT a province section by virtue of being numbered — the caller decides
 * what is a province by matching against the seed's own name list.
 */
export function collectSectionHeadings(markdown: string): string[] {
  const names: string[] = [];
  for (const line of markdown.replace(/\r\n?/gu, '\n').split('\n')) {
    const name = SECTION_HEADING_RE.exec(line)?.groups?.['name'];
    if (name !== undefined) names.push(name);
  }
  return names;
}

/** Wave N1 — 5 calibration pilots + 4 new provinces (PR #69). */
export const N1_TARGETS: readonly WaveTarget[] = [
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

/**
 * Wave N2 — 10 provinces (Şırnak mandated + the 9 population-weighted candidates NOVA kept).
 * The `name` is the DRAFT HEADING spelling and the `plate` is the İçişleri plate code the seed
 * is keyed on; the two are written out together so the mapping is auditable rather than implied.
 */
export const N2_TARGETS: readonly WaveTarget[] = [
  { name: 'Şırnak', plate: '73' },
  { name: 'Ankara', plate: '06' },
  { name: 'İzmir', plate: '35' },
  { name: 'Bursa', plate: '16' },
  { name: 'Adana', plate: '01' },
  { name: 'Gaziantep', plate: '27' },
  { name: 'Mersin', plate: '33' },
  { name: 'Kocaeli', plate: '41' },
  { name: 'Şanlıurfa', plate: '63' },
  { name: 'Eskişehir', plate: '26' },
];

/**
 * The JOIN RULE, copied verbatim from `draft-parser.ts` (kept local so this one-off does not
 * force an export purely for a throwaway): join hard-wrapped lines with a single space, EXCEPT
 * when the accumulated text ends with a Turkish suffix-binding character (apostrophe) or a
 * hyphen (range/compound), where the join is tight. Every tight join is surfaced.
 */
const TIGHT_JOIN_SUFFIX = /['’-]$/u;

export interface ExtractResult {
  readonly value: string;
  readonly tightJoins: readonly string[];
}

/** Extract the narrative body of one `## N. <name>` province section from a draft. */
export function extractBody(markdown: string, targetName: string): ExtractResult | null {
  const lines = markdown.replace(/\r\n?/gu, '\n').split('\n');

  // Locate the section heading: `## <n>. <name>` optionally followed by ` (Köppen)`.
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const m = SECTION_HEADING_RE.exec(lines[i] ?? '');
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

/**
 * Extract each target's body from the supplied draft CONTENTS. A province heading must live in
 * EXACTLY ONE draft: if two drafts both carry a `## N. <name>` section for the same target, this
 * is a hard error — the one-off will not pick a winner, mirroring the main pipeline's locked rule
 * ("two drafts naming the same entity+field is a hard error, by design", ENGINEERING.md §8). Silently
 * taking the first match could seed the wrong (e.g. superseded) body while `check` still exited
 * green against whichever draft won.
 */
export function collectFromContents(
  drafts: readonly string[],
  targets: readonly WaveTarget[],
): Map<string, ExtractResult> {
  const found = new Map<string, ExtractResult>();
  for (const target of targets) {
    const matches = drafts
      .map((markdown) => extractBody(markdown, target.name))
      .filter((body): body is ExtractResult => body !== null);
    if (matches.length > 1) {
      throw new Error(
        `duplicate heading: "${target.name}" (plate ${target.plate}) appears in ${matches.length} drafts — ` +
          'pass exactly one authoritative draft per province; the one-off will not pick a winner.',
      );
    }
    const [body] = matches;
    if (body !== undefined) found.set(target.plate, body);
  }
  return found;
}
