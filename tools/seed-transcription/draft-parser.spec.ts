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
    const [field] = parseDraft(draft('### `introTr`\n> birinci satır\n> ikinci satır')).fields;
    expect(field?.value).toBe('birinci satır ikinci satır');
  });

  it('does not insert a space when the previous line ends with an apostrophe', () => {
    // The real hazard: Turkish suffixes attach across the break ("cenote'" + "ler").
    const [field] = parseDraft(draft("### `introTr`\n> yerine cenote'\n> ler ve yeraltı")).fields;
    expect(field?.value).toBe("yerine cenote'ler ve yeraltı");
  });

  it('does not insert a space when the previous line ends with a hyphen', () => {
    const [field] = parseDraft(
      draft('### `climateNoteTr`\n> tamamen Kasım-\n> Nisan arası'),
    ).fields;
    expect(field?.value).toBe('tamamen Kasım-Nisan arası');
  });

  it('handles a typographic apostrophe the same way', () => {
    const [field] = parseDraft(draft('### `introTr`\n> Türkiye’\n> nin')).fields;
    expect(field?.value).toBe('Türkiye’nin');
  });

  it('reports every no-space join it performed', () => {
    const [field] = parseDraft(draft('### `climateNoteTr`\n> Kasım-\n> Nisan\n> ve devamı')).fields;
    expect(field?.tightJoins).toHaveLength(1);
  });

  it('reports nothing when every join is an ordinary space', () => {
    const [field] = parseDraft(draft('### `introTr`\n> bir\n> iki\n> üç')).fields;
    expect(field?.tightJoins).toHaveLength(0);
  });

  it('NEVER concatenates two words without a separator', () => {
    // The literal PR #43 regression: "deltanın" + "üzerinde" must not fuse.
    const [field] = parseDraft(draft('### `introTr`\n> deltanın\n> üzerinde')).fields;
    expect(field?.value).toBe('deltanın üzerinde');
    expect(field?.value).not.toContain('deltanınüzerinde');
  });

  it('collapses incidental leading and trailing whitespace on each line', () => {
    const [field] = parseDraft(draft('### `introTr`\n>    bir   \n>   iki')).fields;
    expect(field?.value).toBe('bir iki');
  });
});

describe('parseDraft — paragraphs', () => {
  it('turns a blank quote line into exactly one paragraph break', () => {
    const [field] = parseDraft(draft('### `introTr`\n> ilk\n>\n> ikinci')).fields;
    expect(field?.value).toBe('ilk\n\nikinci');
  });

  it('does not emit a leading or trailing paragraph break', () => {
    const [field] = parseDraft(draft('### `introTr`\n>\n> tek\n>\n')).fields;
    expect(field?.value).toBe('tek');
  });

  it('collapses consecutive blank quote lines into a single break', () => {
    const [field] = parseDraft(draft('### `introTr`\n> ilk\n>\n>\n> ikinci')).fields;
    expect(field?.value).toBe('ilk\n\nikinci');
  });
});

describe('parseDraft — structure', () => {
  it('associates each field with its enclosing section heading', () => {
    const parsed = parseDraft(
      '## 1. A (Alpha)\n### `introTr`\n> a\n\n## 2. B (Beta)\n### `introTr`\n> b\n',
    ).fields;
    expect(parsed.map((f) => [f.section, f.value])).toEqual([
      ['1. A (Alpha)', 'a'],
      ['2. B (Beta)', 'b'],
    ]);
  });

  it('skips a non-narrative field header but says so out loud', () => {
    const result = parseDraft(draft('### `populationYear`\n> 2024'));
    expect(result.fields).toHaveLength(0);
    expect(result.diagnostics).toEqual([
      {
        severity: 'warning',
        line: 5,
        message: 'ignoring `populationYear` — not a narrative field',
      },
    ]);
  });

  it('ignores preamble sections that carry no field header', () => {
    const parsed = parseDraft('## 0. Kapsam doğrulaması\n\nDüz metin, alıntı değil.\n').fields;
    expect(parsed).toHaveLength(0);
  });

  it('ignores non-blockquote lines inside a field block', () => {
    const [field] = parseDraft(draft('### `introTr`\n> bir\n\n| tablo | satırı |\n> iki')).fields;
    expect(field?.value).toBe('bir iki');
  });

  it('does not treat a `###` field header as a `##` section heading', () => {
    const parsed = parseDraft(draft('### `introTr`\n> a\n### `climateNoteTr`\n> b')).fields;
    expect(parsed.map((f) => f.section)).toEqual(['1. ÜLKE (Country)', '1. ÜLKE (Country)']);
  });

  it('reports the field header line number for actionable errors', () => {
    const [field] = parseDraft('## 1. A (Alpha)\n### `introTr`\n> a\n').fields;
    expect(field?.line).toBe(2);
  });

  it('is deterministic', () => {
    const markdown = draft('### `introTr`\n> bir\n>\n> iki');
    expect(parseDraft(markdown)).toEqual(parseDraft(markdown));
  });
});

describe('parseDraft — line endings', () => {
  // REGRESSION (C2): every regex here is `$`-anchored and `.` does not match `\r`, so a
  // CRLF draft parsed to ZERO fields. `check` then printed "0 drifted" and exited green —
  // a total no-op wearing the exact wording of the merge gate.
  const body = '### `introTr`\n> birinci satır\n>\n> ikinci satır';

  it('parses CRLF input identically to LF input', () => {
    const lf = draft(body);
    const crlf = lf.split('\n').join('\r\n');
    expect(parseDraft(crlf)).toEqual(parseDraft(lf));
  });

  it('parses a CRLF draft into a non-empty result', () => {
    const crlf = draft(body).split('\n').join('\r\n');
    const { fields } = parseDraft(crlf);
    expect(fields).toHaveLength(1);
    expect(fields[0]?.value).toBe('birinci satır\n\nikinci satır');
  });

  it('parses lone-CR input identically to LF input', () => {
    const lf = draft(body);
    expect(parseDraft(lf.split('\n').join('\r'))).toEqual(parseDraft(lf));
  });

  it('does not leave a stray carriage return inside a value', () => {
    const crlf = draft(body).split('\n').join('\r\n');
    expect(parseDraft(crlf).fields[0]?.value).not.toContain('\r');
  });
});

describe('parseDraft — field-block termination', () => {
  // REGRESSION (I4): a `###` heading that is not a backticked field name did not end the
  // block, so a `### Kaynaklar` citation was folded into the preceding field and seeded as
  // public prose. The roundtrip `check` is structurally blind to this — both sides run
  // this same parser, so they agree with each other while both are wrong.
  it('ends a field block at a non-field `###` heading', () => {
    const { fields } = parseDraft(
      draft('### `introTr`\n> gerçek metin\n\n### Kaynaklar\n> [1] bir kaynak'),
    );
    expect(fields).toHaveLength(1);
    expect(fields[0]?.value).toBe('gerçek metin');
    expect(fields[0]?.value).not.toContain('kaynak');
  });

  it('ends a field block at a deeper heading too', () => {
    const { fields } = parseDraft(draft('### `introTr`\n> gerçek metin\n\n#### Not\n> dipnot'));
    expect(fields[0]?.value).toBe('gerçek metin');
  });

  it('still ends a field block at the next `##` section', () => {
    const { fields } = parseDraft(
      '## 1. A (Alpha)\n### `introTr`\n> a\n## 2. B (Beta)\n> kaçak satır\n',
    );
    expect(fields).toHaveLength(1);
    expect(fields[0]?.value).toBe('a');
  });
});

describe('parseDraft — unrecognised field headers fail loudly', () => {
  // REGRESSION (I5): a typo'd header was indistinguishable from an intentional skip.
  // Country resolution has always failed loudly; field names now do too.
  it('errors on a header that differs from a narrative field only by case', () => {
    const { fields, diagnostics } = parseDraft(draft('### `introTR`\n> kaybolacak metin'));
    expect(fields).toHaveLength(0);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe('error');
    expect(diagnostics[0]?.message).toContain('introTr');
  });

  it('errors on a transcribed field header carrying trailing text', () => {
    const { fields, diagnostics } = parseDraft(draft('### `introTr` (owner verbatim)\n> metin'));
    expect(fields).toHaveLength(0);
    expect(diagnostics[0]?.severity).toBe('error');
    expect(diagnostics[0]?.message).toContain('trailing text');
  });

  it('only warns when the annotated header names an out-of-scope field', () => {
    const { diagnostics } = parseDraft(draft('### `capitalNoteTr` (owner verbatim)\n> metin'));
    expect(diagnostics[0]?.severity).toBe('warning');
  });

  it('reports the header line number so the message is actionable', () => {
    const { diagnostics } = parseDraft('## 1. A (Alpha)\n### `climateNOTETr`\n> metin\n');
    expect(diagnostics[0]?.line).toBe(2);
  });

  it('emits no diagnostics for a clean draft', () => {
    expect(parseDraft(draft('### `introTr`\n> temiz')).diagnostics).toEqual([]);
  });
});

describe('parseDraft — the dalga-1 field set', () => {
  // Four fields joined `NARRATIVE_FIELDS` in this wave: the three new detail sections, plus
  // `independenceNoteTr` (ruling S2), which was ordinary prose living outside the tool and
  // would otherwise have had to be transcribed by hand — the PR #43 bug class, entering
  // through the gate meant to prevent it.
  it.each([['independenceNoteTr'], ['settlementNoteTr'], ['economyNoteTr'], ['governanceNoteTr']])(
    'parses a `%s` section like any other narrative field',
    (field) => {
      const { fields, diagnostics } = parseDraft(
        draft(`### \`${field}\`\n> birinci satır\n> ikinci satır`),
      );
      expect(diagnostics).toEqual([]);
      expect(fields).toHaveLength(1);
      expect(fields[0]?.field).toBe(field);
      expect(fields[0]?.value).toBe('birinci satır ikinci satır');
    },
  );

  it('still WARNS on a field the tool deliberately does not transcribe', () => {
    // The list grew; it did not become permissive. `statusLabelTr` is approved card copy that
    // is hand-copied byte-for-byte from the label document, NOT prose the tool writes.
    const { fields, diagnostics } = parseDraft(draft('### `statusLabelTr`\n> Bir Etiket'));
    expect(fields).toHaveLength(0);
    expect(diagnostics[0]?.severity).toBe('warning');
    expect(diagnostics[0]?.message).toContain('not a narrative field');
  });

  it('still errors on a case-variant of a NEW field', () => {
    const { diagnostics } = parseDraft(draft('### `governanceNoteTR`\n> metin'));
    expect(diagnostics[0]?.severity).toBe('error');
    expect(diagnostics[0]?.message).toContain('governanceNoteTr');
  });
});

describe('parseDraft — JOIN RULE non-firing boundary', () => {
  // ASYMMETRIC DANGER: `tightJoins` reports only FIRINGS, so a rule that wrongly fails to
  // fire is invisible to the reported list and to the human eyeball-check alike. These
  // pin the NEGATIVE side of the boundary, which nothing else covers.
  it.each([
    ['en dash', '–'],
    ['em dash', '—'],
    ['comma', ','],
    ['full stop', '.'],
    ['colon', ':'],
    ['closing parenthesis', ')'],
    ['digit', '5'],
    ['letter', 'a'],
  ])('inserts a space after %s', (_label, suffix) => {
    const { fields } = parseDraft(draft(`### \`introTr\`\n> bir${suffix}\n> iki`));
    expect(fields[0]?.value).toBe(`bir${suffix} iki`);
    expect(fields[0]?.tightJoins).toHaveLength(0);
  });

  it.each([
    ['ASCII hyphen', '-'],
    ['straight apostrophe', "'"],
    ['typographic apostrophe', '’'],
  ])('joins tight after %s', (_label, suffix) => {
    const { fields } = parseDraft(draft(`### \`introTr\`\n> bir${suffix}\n> iki`));
    expect(fields[0]?.value).toBe(`bir${suffix}iki`);
    expect(fields[0]?.tightJoins).toHaveLength(1);
  });
});
