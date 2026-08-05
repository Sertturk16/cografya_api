/**
 * Glue tests. Every leaf module was covered in isolation; this layer — draft -> country ->
 * seed file — was not, and it is where a bug writes one country's prose into another
 * country's file. Structural only, invented placeholder data (→ CONVENTIONS §2).
 */
import { collect, draftsWithoutFields, evaluateCheck, routeWrites, type Item } from './pipeline.ts';
import type { SeedIndex } from './seed-reader.ts';

const SEED: SeedIndex = {
  countries: [
    { isoCode: 'AA', nameTr: 'Alfa', nameEn: 'Alpha', file: 'one.countries.ts' },
    { isoCode: 'BB', nameTr: 'Beta', nameEn: 'Beta', file: 'two.countries.ts' },
    { isoCode: 'CC', nameTr: 'Gama', nameEn: 'Gamma', file: 'two.countries.ts' },
  ],
  fields: [{ isoCode: 'AA', field: 'introTr', value: 'yerleşik değer', file: 'one.countries.ts' }],
  // A hand-built index, so it is healthy by construction. The real reader populates this from
  // `syntaxErrorsIn`, and the CLI refuses to run any mode while it is non-empty.
  syntaxErrors: [],
};

function draft(label: string, body: string) {
  return { label, markdown: `# Başlık\n\n${body}\n` };
}

const item = (isoCode: string, field: Item['field']): Item => ({
  isoCode,
  field,
  value: 'v',
  heading: 'h',
  draft: 'd.md',
  tightJoins: [],
});

describe('routeWrites', () => {
  it('routes each country to the file that actually declares it', () => {
    const { byFile, errors } = routeWrites(
      [item('AA', 'introTr'), item('BB', 'introTr'), item('CC', 'climateNoteTr')],
      SEED,
    );
    expect(errors).toEqual([]);
    expect(byFile.get('one.countries.ts')?.map((w) => w.isoCode)).toEqual(['AA']);
    expect(byFile.get('two.countries.ts')?.map((w) => w.isoCode)).toEqual(['BB', 'CC']);
  });

  it('never lets one country’s write land in another country’s file', () => {
    const { byFile } = routeWrites([item('AA', 'introTr')], SEED);
    expect(byFile.has('two.countries.ts')).toBe(false);
  });

  it('preserves the field alongside the country it belongs to', () => {
    const { byFile } = routeWrites([item('CC', 'climateNoteTr')], SEED);
    expect(byFile.get('two.countries.ts')).toEqual([
      { isoCode: 'CC', field: 'climateNoteTr', value: 'v' },
    ]);
  });

  it('errors rather than silently dropping an unknown country', () => {
    const { errors } = routeWrites([item('ZZ', 'introTr')], SEED);
    expect(errors).toEqual(['ZZ is not present in any seed file']);
  });
});

describe('draftsWithoutFields — the country lane’s expected-count gate', () => {
  // The hole this closes, reproduced end-to-end in the PR #92 review: a draft the parser
  // understood nothing in used to print "checked 0 field(s): 0 identical, 0 drifted, 0 not yet
  // seeded" and exit 0 — a green earned by transcribing nothing.
  const good = draft('good.md', '## 1. ALFA (Alpha)\n### `introTr`\n> bir metin');
  const nothing = draft('bad.md', 'Bu dosyada hiç alan başlığı yok.');

  it('names nothing when every draft contributed at least one field', () => {
    const { understood, errors } = collect([good], SEED);
    expect(errors).toEqual([]);
    expect(draftsWithoutFields([good], understood)).toEqual([]);
  });

  it('names the draft that yielded no field at all', () => {
    const { items, understood, errors } = collect([nothing], SEED);
    // No error either: the parser found nothing to complain ABOUT, which is the whole problem.
    expect(errors).toEqual([]);
    expect(items).toEqual([]);
    expect(draftsWithoutFields([nothing], understood)).toEqual(['bad.md']);
  });

  it('names ONLY the empty one when a good draft is passed alongside it', () => {
    // The case a global `items.length === 0` test sails straight past, and the likeliest shape
    // of the mistake: one authoritative draft plus a wrong/superseded file (Atlas ruling AS-7).
    const { understood, errors } = collect([good, nothing], SEED);
    expect(errors).toEqual([]);
    expect(draftsWithoutFields([good, nothing], understood)).toEqual(['bad.md']);
  });

  it('does NOT name a byte-identical duplicate draft — dedup is not "understood nothing"', () => {
    // THE FALSE RED THIS GATE SHIPPED WITH (CR93-I1, reproduced on the real okyanusya draft):
    // `collect` drops a field whose `isoCode.field` was already seen with identical prose, so
    // an items-based gate accused a perfectly well-formed draft of being the wrong file.
    const copy = draft('copy.md', '## 1. ALFA (Alpha)\n### `introTr`\n> bir metin');
    const forward = collect([good, copy], SEED);
    expect(forward.items).toHaveLength(1); // the dedup still happens — that part was correct
    expect(draftsWithoutFields([good, copy], forward.understood)).toEqual([]);

    // ARGV ORDER MUST NOT DECIDE: the old gate blamed whichever copy came second.
    const reversed = collect([copy, good], SEED);
    expect(draftsWithoutFields([copy, good], reversed.understood)).toEqual([]);
  });
});

describe('collect — duplicate isoCode.field', () => {
  // REGRESSION (I1): two drafts carrying the same country+field with different prose used
  // to resolve last-wins, silently. `apply` could then never reach a fixed point, so the
  // mandated `0 drifted` gate reported a permanent drift forever.
  const first = draft('a/wave.md', '## 1. ALFA (Alpha)\n### `introTr`\n> ilk metin');
  const second = draft('b/wave.md', '## 1. ALFA (Alpha)\n### `introTr`\n> ikinci metin');

  it('errors instead of picking a winner', () => {
    const { errors } = collect([first, second], SEED);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('AA.introTr is defined twice');
  });

  it('names BOTH drafts by path, not by a collision-prone basename', () => {
    const { errors } = collect([first, second], SEED);
    expect(errors[0]).toContain('a/wave.md');
    expect(errors[0]).toContain('b/wave.md');
  });

  it('emits no item for the ambiguous field', () => {
    const { items } = collect([first, second], SEED);
    expect(items).toHaveLength(1);
    expect(items[0]?.value).toBe('ilk metin');
  });

  it('accepts an identical duplicate — there is nothing to choose between', () => {
    const { errors, items } = collect([first, draft('c/wave.md', first.markdown)], SEED);
    expect(errors).toEqual([]);
    expect(items).toHaveLength(1);
  });

  it('does not confuse the same field on two different countries', () => {
    const { errors } = collect(
      [first, draft('b/wave.md', '## 1. BETA (Beta)\n### `introTr`\n> başka')],
      SEED,
    );
    expect(errors).toEqual([]);
  });
});

describe('collect — diagnostics are surfaced, never swallowed', () => {
  it('promotes a parser error to a fatal collect error', () => {
    const { errors } = collect([draft('w.md', '## 1. ALFA (Alpha)\n### `introTR`\n> metin')], SEED);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('w.md:');
  });

  it('keeps a non-narrative field as a warning, not an error', () => {
    const { errors, warnings } = collect(
      [draft('w.md', '## 1. ALFA (Alpha)\n### `populationYear`\n> 2024')],
      SEED,
    );
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it('errors on a heading no seeded country matches', () => {
    const { errors } = collect(
      [draft('w.md', '## 1. BİLİNMEYEN (Unknown)\n### `introTr`\n> metin')],
      SEED,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('no seeded country matches');
  });

  it('resolves a country heading to the right isoCode', () => {
    const { items } = collect([draft('w.md', '## 2. GAMA (Gamma)\n### `introTr`\n> m')], SEED);
    expect(items[0]?.isoCode).toBe('CC');
  });
});

describe('evaluateCheck', () => {
  it('counts an identical field as matched', () => {
    const report = evaluateCheck([{ ...item('AA', 'introTr'), value: 'yerleşik değer' }], SEED);
    expect(report).toEqual({ matched: 1, drifted: [], missing: [] });
  });

  it('reports a drifted field with the offset it diverges at', () => {
    const report = evaluateCheck([{ ...item('AA', 'introTr'), value: 'yerleşik başka' }], SEED);
    expect(report.matched).toBe(0);
    expect(report.drifted).toHaveLength(1);
    expect(report.drifted[0]).toContain('diverges at offset 9');
  });

  it('reports a field that is not yet in the seed as missing, not as matched', () => {
    const report = evaluateCheck([item('BB', 'introTr')], SEED);
    expect(report.missing).toHaveLength(1);
    expect(report.matched).toBe(0);
  });
});
