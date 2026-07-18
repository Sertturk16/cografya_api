/**
 * Draft-parser tests — the JOIN RULE is the bug this whole tool exists to prevent, so it
 * carries the densest coverage. Structural only: no country facts (→ CONVENTIONS §2).
 */
import { parseDraft } from './draft-parser.ts';

function draft(body: string): string {
  return `# Başlık\n\n## 1. ÜLKE (Country)\n\n${body}\n`;
}

describe('parseDraft — JOIN RULE', () => {
  it('joins wrapped lines with exactly one space', () => {
    const [field] = parseDraft(draft('### `introTr`\n> birinci satır\n> ikinci satır'));
    expect(field?.value).toBe('birinci satır ikinci satır');
  });

  it('does not insert a space when the previous line ends with an apostrophe', () => {
    // The real hazard: Turkish suffixes attach across the break ("cenote'" + "ler").
    const [field] = parseDraft(draft("### `introTr`\n> yerine cenote'\n> ler ve yeraltı"));
    expect(field?.value).toBe("yerine cenote'ler ve yeraltı");
  });

  it('does not insert a space when the previous line ends with a hyphen', () => {
    const [field] = parseDraft(draft('### `climateNoteTr`\n> tamamen Kasım-\n> Nisan arası'));
    expect(field?.value).toBe('tamamen Kasım-Nisan arası');
  });

  it('handles a typographic apostrophe the same way', () => {
    const [field] = parseDraft(draft('### `introTr`\n> Türkiye’\n> nin'));
    expect(field?.value).toBe('Türkiye’nin');
  });

  it('reports every no-space join it performed', () => {
    const [field] = parseDraft(draft('### `climateNoteTr`\n> Kasım-\n> Nisan\n> ve devamı'));
    expect(field?.tightJoins).toHaveLength(1);
  });

  it('reports nothing when every join is an ordinary space', () => {
    const [field] = parseDraft(draft('### `introTr`\n> bir\n> iki\n> üç'));
    expect(field?.tightJoins).toHaveLength(0);
  });

  it('NEVER concatenates two words without a separator', () => {
    // The literal PR #43 regression: "deltanın" + "üzerinde" must not fuse.
    const [field] = parseDraft(draft('### `introTr`\n> deltanın\n> üzerinde'));
    expect(field?.value).toBe('deltanın üzerinde');
    expect(field?.value).not.toContain('deltanınüzerinde');
  });

  it('collapses incidental leading and trailing whitespace on each line', () => {
    const [field] = parseDraft(draft('### `introTr`\n>    bir   \n>   iki'));
    expect(field?.value).toBe('bir iki');
  });
});

describe('parseDraft — paragraphs', () => {
  it('turns a blank quote line into exactly one paragraph break', () => {
    const [field] = parseDraft(draft('### `introTr`\n> ilk\n>\n> ikinci'));
    expect(field?.value).toBe('ilk\n\nikinci');
  });

  it('does not emit a leading or trailing paragraph break', () => {
    const [field] = parseDraft(draft('### `introTr`\n>\n> tek\n>\n'));
    expect(field?.value).toBe('tek');
  });

  it('collapses consecutive blank quote lines into a single break', () => {
    const [field] = parseDraft(draft('### `introTr`\n> ilk\n>\n>\n> ikinci'));
    expect(field?.value).toBe('ilk\n\nikinci');
  });
});

describe('parseDraft — structure', () => {
  it('associates each field with its enclosing section heading', () => {
    const parsed = parseDraft(
      '## 1. A (Alpha)\n### `introTr`\n> a\n\n## 2. B (Beta)\n### `introTr`\n> b\n',
    );
    expect(parsed.map((f) => [f.section, f.value])).toEqual([
      ['1. A (Alpha)', 'a'],
      ['2. B (Beta)', 'b'],
    ]);
  });

  it('ignores field headers that are not narrative fields', () => {
    expect(parseDraft(draft('### `populationYear`\n> 2024'))).toHaveLength(0);
  });

  it('ignores preamble sections that carry no field header', () => {
    const parsed = parseDraft('## 0. Kapsam doğrulaması\n\nDüz metin, alıntı değil.\n');
    expect(parsed).toHaveLength(0);
  });

  it('ignores non-blockquote lines inside a field block', () => {
    const [field] = parseDraft(draft('### `introTr`\n> bir\n\n| tablo | satırı |\n> iki'));
    expect(field?.value).toBe('bir iki');
  });

  it('does not treat a `###` field header as a `##` section heading', () => {
    const parsed = parseDraft(draft('### `introTr`\n> a\n### `climateNoteTr`\n> b'));
    expect(parsed.map((f) => f.section)).toEqual(['1. ÜLKE (Country)', '1. ÜLKE (Country)']);
  });

  it('reports the field header line number for actionable errors', () => {
    const [field] = parseDraft('## 1. A (Alpha)\n### `introTr`\n> a\n');
    expect(field?.line).toBe(2);
  });

  it('is deterministic', () => {
    const markdown = draft('### `introTr`\n> bir\n>\n> iki');
    expect(parseDraft(markdown)).toEqual(parseDraft(markdown));
  });
});
