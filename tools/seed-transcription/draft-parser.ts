/**
 * Markdown narrative-draft parser.
 *
 * WHY THIS EXISTS (→ CONVENTIONS §2, byte-for-byte roundtrip):
 * PR #43 shipped a real content bug — a fact-checked draft was transcribed BY HAND into
 * the seed's `+`-concatenation idiom and inter-chunk spaces were silently dropped at some
 * boundaries ("deltanınüzerinde"). The roundtrip check added afterwards is DETECTION.
 * This parser is the PREVENTION half: no human ever retypes prose again, so the class of
 * error cannot be introduced in the first place.
 *
 * INPUT FORMAT — parsed AS-IS, no new format imposed on NOVA.
 * All 13+ narrative waves already share one shape, verified empirically across every
 * draft in `Owner's Inbox/`:
 *
 *   ## 3. TANZANYA (Tanzania)          <- country section (## , not ###)
 *   ### `introTr`                      <- field header, backtick-quoted field name
 *   > prose line one
 *   > prose line two
 *   >                                  <- blank quote line = paragraph break
 *   > second paragraph
 *
 * Any `##` section that contains no field header is ignored (waves open with
 * "## 0. Kapsam doğrulaması" / "## 1. Görev bağlamı" preamble sections).
 */

/** The field names a narrative wave may carry. Anything else in a draft is ignored. */
export const NARRATIVE_FIELDS = [
  'introTr',
  'landformNoteTr',
  'climateNoteTr',
  'hydrographyNoteTr',
  'sovereigntyNoteTr',
] as const;

export type NarrativeField = (typeof NARRATIVE_FIELDS)[number];

export interface ParsedField {
  /** Raw `##` heading text, e.g. `3. TANZANYA (Tanzania)`. */
  readonly section: string;
  readonly field: NarrativeField;
  /** The reconstructed prose. Paragraphs separated by exactly `\n\n`. */
  readonly value: string;
  /** Every no-separator line join performed (see JOIN RULE) — surfaced for review. */
  readonly tightJoins: readonly string[];
  /** 1-based line number of the field header, for actionable error messages. */
  readonly line: number;
}

function isNarrativeField(name: string): name is NarrativeField {
  return (NARRATIVE_FIELDS as readonly string[]).includes(name);
}

/**
 * JOIN RULE — the heart of this tool, and the exact place the PR #43 class of bug lives.
 *
 * Drafts are hard-wrapped at ~90 columns, so a single prose sentence spans several `>`
 * lines. Rejoining them requires deciding what goes BETWEEN two lines, and both possible
 * mistakes are silent corruption:
 *
 *   - always insert a space  ->  "cenote'" + "ler"    becomes "cenote' ler"   (WRONG)
 *   - never insert a space   ->  "deltanın" + "üzerinde" becomes "deltanınüzerinde" (the
 *                                actual PR #43 bug)
 *
 * The rule: join with NO separator when the accumulated text ends with a character that
 * Turkish orthography uses to bind a token across the break — an apostrophe (suffix after
 * a proper noun: `Türkiye'` + `nin`) or a hyphen (a range or compound: `Kasım-` + `Nisan`,
 * `1.000-` + `1.400`). Otherwise join with exactly one U+0020.
 *
 * This rule was not invented: it was derived by diffing every draft in `Owner's Inbox/`
 * against the committed seed. It fires 5 times across ~761 fields, and in all 5 the
 * committed (hand-transcribed, fact-checked) seed agrees with it. Because the set is
 * small and the rule is a heuristic on ambiguous input, every firing is REPORTED
 * (`tightJoins`) rather than applied silently — the content-fidelity reviewer eyeballs a
 * 5-line list instead of re-reading 196 countries.
 */
const TIGHT_JOIN_SUFFIX = /['’-]$/u;

function joinLine(accumulated: string, next: string): { text: string; tight: boolean } {
  if (accumulated === '') return { text: next, tight: false };
  if (TIGHT_JOIN_SUFFIX.test(accumulated)) return { text: accumulated + next, tight: true };
  return { text: `${accumulated} ${next}`, tight: false };
}

const SECTION_RE = /^##\s+(?<title>\S.*)$/u;
const FIELD_RE = /^###\s+`(?<name>[A-Za-z]+)`\s*$/u;
const QUOTE_RE = /^>\s?(?<content>.*)$/u;

/**
 * Parse one narrative draft. Deterministic: the same markdown always yields the same
 * `ParsedField[]`, and the parser never normalises, trims, or "fixes" prose beyond the
 * documented JOIN RULE.
 */
export function parseDraft(markdown: string): ParsedField[] {
  const out: ParsedField[] = [];
  const lines = markdown.split('\n');

  let section: string | null = null;
  let field: NarrativeField | null = null;
  let fieldLine = 0;
  let buffer: string[] = [];

  const flush = (): void => {
    if (section !== null && field !== null) {
      const paragraphs: string[] = [];
      const tightJoins: string[] = [];
      let current = '';

      for (const raw of buffer) {
        const m = QUOTE_RE.exec(raw);
        // A non-blockquote line inside a field block (a table, a note, a `---`) ends the
        // prose we care about; skip it rather than folding it into the value.
        if (m?.groups === undefined) continue;
        const content = m.groups['content']?.trim() ?? '';
        if (content === '') {
          if (current !== '') {
            paragraphs.push(current);
            current = '';
          }
          continue;
        }
        const joined = joinLine(current, content);
        if (joined.tight) {
          tightJoins.push(`${current.slice(-30)}⟨no-space⟩${content.slice(0, 20)}`);
        }
        current = joined.text;
      }
      if (current !== '') paragraphs.push(current);

      const value = paragraphs.join('\n\n');
      if (value !== '') {
        out.push({ section, field, value, tightJoins, line: fieldLine });
      }
    }
    buffer = [];
  };

  lines.forEach((line, index) => {
    const fieldMatch = FIELD_RE.exec(line);
    if (fieldMatch?.groups !== undefined) {
      flush();
      const name = fieldMatch.groups['name'] ?? '';
      field = isNarrativeField(name) ? name : null;
      fieldLine = index + 1;
      return;
    }
    // `###` also matches `^##\s` only if we check the field pattern first, which we do.
    const sectionMatch = SECTION_RE.exec(line);
    if (sectionMatch?.groups !== undefined && !line.startsWith('###')) {
      flush();
      field = null;
      section = sectionMatch.groups['title']?.trim() ?? null;
      return;
    }
    if (field !== null) buffer.push(line);
  });
  flush();

  return out;
}
