/**
 * Unit coverage for the province climate-narrative one-offs' paragraph-classification logic
 * (`extractBody`) and its cross-draft `collectFromContents` guard. This is the logic that decides
 * WHAT prose gets seeded, so it earns the same class of test the main `draft-parser` carries.
 * Structural only: no province facts are asserted (→ CONVENTIONS §2) — every fixture is neutral
 * placeholder prose exercising a boundary of the extractor, never a climate claim.
 *
 * The extractor is shared by every wave (N1, N2, …); only the target list is wave data, so these
 * cases protect all of them at once.
 */
import {
  N1_TARGETS,
  N2_TARGETS,
  collectFromContents,
  extractBody,
} from './oneoff-province-climate-extract.ts';

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

  it('DROPS plain prose that follows the sources block (the STOP is a break, not a skip)', () => {
    // The one case the N1 suite left unpinned (wave-N1 closing summary, open item): every real
    // draft happens to END its section right after `**Mekanizma → kaynak:**`, so `break` and
    // `continue` were observationally identical there. They are NOT equivalent — with `continue`
    // a trailing editorial note after the sources block would be silently appended to the seeded
    // prose. Pinned here so the boundary cannot regress unnoticed.
    const md = section(
      'Gerçek paragraf.\n\n' +
        '**Mekanizma → kaynak:**\n- bir kaynak satırı\n\n' +
        'Kaynak listesinden SONRA gelen bir not.',
    );
    const result = extractBody(md, 'Antalya');
    expect(result?.value).toBe('Gerçek paragraf.');
    expect(result?.value).not.toContain('SONRA');
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
    const found = collectFromContents(
      ['## 1. Antalya\n\nantalya metni', '## 1. Rize\n\nrize metni'],
      N1_TARGETS,
    );
    expect(found.get('07')?.value).toBe('antalya metni');
    expect(found.get('53')?.value).toBe('rize metni');
  });

  it('THROWS when the same province heading appears in more than one draft', () => {
    // Matches the main pipeline's locked rule — the tool will not pick a winner (§8).
    expect(() =>
      collectFromContents(
        ['## 1. Antalya\n\nbir metin', '## 1. Antalya\n\nbaşka metin'],
        N1_TARGETS,
      ),
    ).toThrow(/duplicate heading/u);
  });

  it('only collects the wave it was given (an N1 heading is invisible to the N2 target list)', () => {
    // The target list is the wave boundary: passing the wrong draft to a wave one-off must
    // produce "no draft body found" (exit 1 in the runner), never a silent partial seed.
    const found = collectFromContents(['## 1. Antalya\n\nantalya metni'], N2_TARGETS);
    expect(found.size).toBe(0);
  });
});

describe('wave target lists — structural invariants', () => {
  const waves = [
    { label: 'N1', targets: N1_TARGETS },
    { label: 'N2', targets: N2_TARGETS },
  ];

  it.each(waves)('$label plate codes are unique and 2-char zero-padded', ({ targets }) => {
    const plates = targets.map((t) => t.plate);
    expect(new Set(plates).size).toBe(plates.length);
    for (const plate of plates) expect(plate).toMatch(/^\d{2}$/u);
  });

  it('N1 and N2 target no province twice (a later wave must not silently re-seed an earlier one)', () => {
    const n1 = new Set(N1_TARGETS.map((t) => t.plate));
    const overlap = N2_TARGETS.filter((t) => n1.has(t.plate));
    expect(overlap).toEqual([]);
  });
});
