# seed-transcription

Deterministic transcription of fact-checked narrative drafts into the country seed files.

## Why

PR #43 shipped a real content bug. A fact-checked draft was transcribed **by hand** into
the seed's `+`-concatenation idiom, and inter-chunk spaces were silently dropped at some
boundaries — `"deltanın" + "üzerinde"` became `"deltanınüzerinde"`.

The response at the time was **detection**: a byte-for-byte roundtrip rule in
`CONVENTIONS.md` §2, a `content-fidelity` reviewer, and a "don't trust the author's claim,
re-run it independently" discipline. All correct, all after the fact.

This tool is the **prevention** half. No human retypes prose, so the error class cannot be
introduced. The reviewer's first check collapses from _"reconstruct every string and diff
it against the draft"_ to one line:

```bash
pnpm seed:transcribe check "Owner's Inbox/<wave>/<wave>-narrative-draft.md"
```

If that prints `N identical, 0 drifted`, the committed seed and the fact-checked draft
agree. Nothing else needs re-reading.

## Usage

```bash
# Verify committed seed == draft (the automated CONVENTIONS §2 roundtrip gate)
pnpm seed:transcribe check "Owner's Inbox/dunya-haritasi-okyanusya/okyanusya-narrative-draft.md"

# Print the TS snippet for each field, without touching any file
pnpm seed:transcribe emit  "<draft.md>"

# Write the values into the seed files in place
pnpm seed:transcribe apply "<draft.md>"
```

Several drafts may be passed at once. `check` exits non-zero on drift.

## Design decisions

### Input: existing markdown, parsed as-is

No structured format is imposed on NOVA. All 13+ waves already share one shape — verified
empirically against every draft in `Owner's Inbox/` — so the parser targets what exists:

```markdown
## 3. TANZANYA (Tanzania)

### `introTr`

> prose line one
> prose line two
>
> second paragraph
```

Sections without a field header (the `## 0. Kapsam doğrulaması` / `## 1. Görev bağlamı`
preamble every wave opens with) are ignored.

### The JOIN RULE — the actual bug surface

Drafts hard-wrap prose, so rejoining lines requires deciding what goes _between_ them, and
both possible mistakes are silent corruption:

| previous line ends with | join                  | why                                                       |
| ----------------------- | --------------------- | --------------------------------------------------------- |
| `'` or `’`              | **no separator**      | Turkish suffix binds across the break: `cenote'` + `ler`  |
| `-`                     | **no separator**      | range or compound: `Kasım-` + `Nisan`, `1.000-` + `1.400` |
| anything else           | **exactly one space** | ordinary wrap: `deltanın` + `üzerinde`                    |

This rule was derived, not invented: every draft was diffed against the committed seed. It
fires 5 times across ~730 fields, and in all 5 the hand-transcribed, fact-checked seed
agrees with it. Because it is a heuristic on ambiguous input, **every firing is reported**
(`No-space line joins performed`) rather than applied silently — the reviewer eyeballs a
5-line list instead of 196 countries.

### Output: losslessness by construction

The emitter splits a paragraph on spaces and appends each separating space to the **end of
the chunk before it**. Therefore `chunks.join('') === value` holds _by construction_, not
by inspection — there is no boundary at which a space could be dropped. This is asserted at
runtime in `emitConcat` (it throws rather than emitting a lossy seed) and property-tested
in `emit.spec.ts` against every value committed in the seed files.

Quote selection mirrors Prettier's rule (minimise escapes, tie → single) and the wrap
respects the same `printWidth: 100`, so emitted source is **Prettier-stable**: no
reformatting pass, no `format:check` churn.

### `apply` never touches an already-correct field

The committed files were hand-wrapped, and this emitter's chunk boundaries differ from
those human choices for roughly half of them — those boundaries are arbitrary and were
never reproducible. So `apply` folds the committed value and compares it to the draft
value: if they are equal, **not one byte moves**. Bytes move only when the _value_ moves.
That keeps diffs minimal and honours the "don't rewrite existing seed data" boundary.

### Country resolution fails loudly

A `##` heading resolves to an `isoCode` via, in priority order:

1. an explicit ISO code in the heading — `## 5. ÇİN CUMHURİYETİ / TAYVAN (TW)`;
2. a name match against the seed's `nameTr` / `nameEn`, with both sides split the same
   deterministic way (`Çin Cumhuriyeti (Tayvan)` also answers to each half).

No match, or more than one match, is a **hard error** and the run stops. There is no
nearest-name fallback: a silently skipped country is how a wave "lands" with an empty
field, and a silently mis-matched one would write one country's climate onto another.

## Verified against the committed seed

Running `check` across every narrative draft:

```
checked 729 field(s): 714 identical, 15 drifted, 0 not yet seeded
```

The 15 divergences are **not** tool defects — see the closing summary. They fall in three
classes: 7 lost paragraph breaks (a real, previously undetected fidelity regression), 2
stale drafts where a spelling correction was applied at seed time and never back-ported,
and 6 sovereignty entries whose drafts were deliberately restructured during seeding.

## Tests

`pnpm test:unit` (CI job `Test (unit — tools)`). Tests assert **rules and invariants
only** — not one country fact is hardcoded (→ `CONVENTIONS.md` §2). The data-driven suite
reads whatever is committed and asserts a property over it, so it keeps working as waves
land and never needs editing when a fact is corrected.
