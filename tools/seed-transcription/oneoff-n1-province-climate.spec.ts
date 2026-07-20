/**
 * Unit coverage for the wave-N1 one-off's paragraph-classification logic (`extractBody`) and
 * its cross-draft `collectFromContents` guard. This is the logic that decides WHAT prose gets
 * seeded, so it earns the same class of test the main `draft-parser` carries. Structural only:
 * no province facts are asserted (→ CONVENTIONS §2) — every fixture is neutral placeholder
 * prose exercising a boundary of the extractor, never a climate claim.
 */
import { collectFromContents, extractBody } from './oneoff-n1-extract.ts';

/** Wrap a section body under a `## 1. Antalya` heading, as the drafts are shaped. */
function section(body: string): string {
  return `# Başlık\n\n## 1. Antalya\n\n${body}\n`;
}

describe('extractBody — section boundary', () => {
  it('finds a heading that carries a parenthetical Köppen suffix', () => {
    const md = '# Başlık\n\n## 1. Artvin (Cfb)\n\nbir metin';
    expect(extractBody(md, 'Artvin')?.value).toBe('bir metin');
  });

  it('returns null when the target heading is absent (feeds the loud failure)', () => {
    // main() turns this null into a stderr error + exit 1 — the loud failure lives there,
    // and null is the signal that triggers it. A missing province must never seed empty.
    expect(extractBody(section('bir metin'), 'Konya')).toBeNull();
  });

  it('stops the section at the next `##` heading', () => {
    const md = '## 1. Antalya\n\nbir metin\n\n## 2. Rize\n\nbaşka metin';
    expect(extractBody(md, 'Antalya')?.value).toBe('bir metin');
  });
});

describe('extractBody — paragraph classification', () => {
  it('STOPS at a `**Mekanizma` block and excludes it and everything after', () => {
    const md = section('Gerçek paragraf.\n\n**Mekanizma → kaynak:**\n- bir kaynak satırı');
    const result = extractBody(md, 'Antalya');
    expect(result?.value).toBe('Gerçek paragraf.');
    expect(result?.value).not.toContain('kaynak');
  });

  it('SKIPS a `**Veri:**` bold-meta block but keeps the prose that follows it', () => {
    const md = section('**Veri:** ort. 18 derece\n\nGerçek paragraf.');
    expect(extractBody(md, 'Antalya')?.value).toBe('Gerçek paragraf.');
  });

  it('skips tables, rules and sub-headings, keeping only the prose', () => {
    const md = section('| a | b |\n\n---\n\n### Alt başlık\n\nGerçek paragraf.');
    expect(extractBody(md, 'Antalya')?.value).toBe('Gerçek paragraf.');
  });

  it('preserves a blank-line paragraph break as a double newline', () => {
    const md = section('ilk paragraf.\n\nikinci paragraf.');
    expect(extractBody(md, 'Antalya')?.value).toBe('ilk paragraf.\n\nikinci paragraf.');
  });

  it('returns null when a section holds no narrative paragraph at all', () => {
    const md = section('**Veri:** yalnızca meta\n\n**Mekanizma → kaynak:**\n- x');
    expect(extractBody(md, 'Antalya')).toBeNull();
  });
});

describe('extractBody — JOIN RULE', () => {
  it('joins ordinary wrapped lines with exactly one space', () => {
    const result = extractBody(section('birinci\nikinci'), 'Antalya');
    expect(result?.value).toBe('birinci ikinci');
    expect(result?.tightJoins).toHaveLength(0);
  });

  it('joins tight (no space) when the previous line ends with an apostrophe, and reports it', () => {
    const result = extractBody(section("istasyon'\nun kaydı"), 'Antalya');
    expect(result?.value).toBe("istasyon'un kaydı");
    expect(result?.tightJoins).toHaveLength(1);
  });

  it('joins tight after a hyphen (range/compound) and reports it', () => {
    const result = extractBody(section('kasım-\nnisan arası'), 'Antalya');
    expect(result?.value).toBe('kasım-nisan arası');
    expect(result?.tightJoins).toHaveLength(1);
  });

  it('never fuses two words when the previous line ends with a letter', () => {
    const result = extractBody(section('deltanın\nüzerinde'), 'Antalya');
    expect(result?.value).toBe('deltanın üzerinde');
    expect(result?.value).not.toContain('deltanınüzerinde');
    expect(result?.tightJoins).toHaveLength(0);
  });
});

describe('collectFromContents — one authoritative draft per province', () => {
  it('collects disjoint provinces from separate drafts (the N1 pilot/N1 split)', () => {
    const found = collectFromContents([
      '## 1. Antalya\n\nantalya metni',
      '## 1. Rize\n\nrize metni',
    ]);
    expect(found.get('07')?.value).toBe('antalya metni');
    expect(found.get('53')?.value).toBe('rize metni');
  });

  it('THROWS when the same province heading appears in more than one draft', () => {
    // Matches the main pipeline's locked rule — the tool will not pick a winner (§8).
    expect(() =>
      collectFromContents(['## 1. Antalya\n\nbir metin', '## 1. Antalya\n\nbaşka metin']),
    ).toThrow(/duplicate heading/u);
  });
});
