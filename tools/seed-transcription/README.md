# seed-transcription

Deterministic transcription of fact-checked narrative drafts into the country seed files.

> **This CLI is the COUNTRY lane. Provinces have a separate one.**
> `pnpm seed:transcribe` resolves rows by `isoCode` and only ever reads
> `src/database/seeds/country.seed-data.ts`. Province narrative waves are keyed on
> `plateCode` and are driven by a per-wave one-off entry point run directly with `node`:
>
> ```bash
> node tools/seed-transcription/oneoff-n<wave>-province-climate.ts emit  "<draft.md>"
> node tools/seed-transcription/oneoff-n<wave>-province-climate.ts check "<draft.md>"
> ```
>
> N1 and N2 (`oneoff-n1-province-climate.ts`, `oneoff-n2-province-climate.ts`) are the
> shipped precedent; they share `oneoff-province-climate-runner.ts` (file IO, AST fold,
> `emit`/`check` drivers) and `oneoff-province-climate-extract.ts` (pure classification), so
> the byte-fidelity gate has one implementation across waves. Both lanes reuse `emitConcat`
> and honour the same exit-code contract.
>
> **Running the country CLI over a province wave reports a false green** — it never reads
> `province.seed-data.ts`, so it finds nothing to disagree with. Pick the lane that owns the
> seed file the PR touches.

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

If that **exits 0**, the committed seed and the fact-checked draft agree. Nothing else
needs re-reading. Judge by the exit code, not by eye: `check` exits non-zero on drift **and
on "not yet seeded"**, because a wave where `apply` was never run has no drift at all and
would otherwise print a reassuring `0 drifted` while nothing had been written.

## Usage

```bash
# Verify committed seed == draft (the automated CONVENTIONS §2 roundtrip gate)
pnpm seed:transcribe check "Owner's Inbox/dunya-haritasi-okyanusya/okyanusya-narrative-draft.md"

# Print the TS snippet for each field, without touching any file
pnpm seed:transcribe emit  "<draft.md>"

# Write the values into the seed files in place
pnpm seed:transcribe apply "<draft.md>"

# Same, but overwrite values the seed and the draft disagree on (see below — think first)
pnpm seed:transcribe apply --force "<draft.md>"
```

Several drafts may be passed at once — but pass only **authoritative** ones: two drafts
naming the same country+field with different prose is a hard error, not a last-wins merge.

### `apply` refuses to revert a correction

The draft is **not** automatically newer than the seed. When a field's committed value is a
non-null string that differs from the draft, `apply` prints both sides and writes **nothing
at all** — not even the files it could have written.

This is a real failure that was caught in review, not a hypothetical: PR #46 corrected the
country name `Ekvator` -> `Ekvador` on `BR.introTr` and `CO.introTr` directly in the seed,
and the draft was never back-ported. An unconditional `apply` silently reverted that fix on
two live pages — via the very command `ENGINEERING.md` §8 mandates as the fidelity gate. The
only defence was a human reading the diff, which is precisely the defence that failed in
PR #43 and caused this tool to exist in the first place.

So: back-port the fix to the draft. `--force` is for the case where the draft really is the
newer text, and reaching for it is a decision you should be able to defend in the PR.

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

### Field order, the insertion anchor, and one constraint on seed authors

`NARRATIVE_FIELDS` (in `draft-parser.ts`) is both the list of fields this tool transcribes
**and** the seed field order it maintains: an absent property is inserted after the last
field that already exists and sorts before it, so waves cannot scramble the seed's shape.
Below the whole list sits the **anchor**, `governmentFormTr` — the last non-narrative
property of a seed row — which is where the first narrative field of a row attaches.

**Constraint for whoever authors a new seed row:** keep `governmentFormTr: null,` and
`independenceNoteTr: null,` in a row that will never use them, rather than "tidying" them
away. Antarktika is the live example — neither concept applies to it. Both properties are
what a later narrative wave anchors on; without them the field is appended at the END of
the object instead of in house field order. That is a deliberate fallback (it used to be a
hard error that killed the whole wave).

Be precise about what the fallback does and does not promise. It guarantees the output
**parses** and that no prose value is altered — `apply` re-parses every file it is about to
write and refuses rather than committing broken source, and every applier test asserts the
same thing through one shared check. It does **not** guarantee house field order: the field
lands at the end, and in a mixed pass (some fields anchored normally, some fallen back) the
object's overall order can differ from `NARRATIVE_FIELDS`. Correct content, unusual order —
which is exactly why the explicit nulls remain the intended shape.

`independenceNoteTr` is itself a narrative field as of the dalga-1 wave (Atlas ruling S2,
2026-08-02): it is ordinary prose, and leaving it outside the tool would have forced the
one country whose draft carries an independence section to be transcribed **by hand** —
the PR #43 bug class, entering through the gate built to prevent it. No earlier draft
carries an `` ### `independenceNoteTr` `` header, so past waves are unaffected.

### Country resolution fails loudly

A `##` heading resolves to an `isoCode` via, in priority order:

1. an explicit ISO code in the heading — `## 5. ÇİN CUMHURİYETİ / TAYVAN (TW)`;
2. a name match against the seed's `nameTr` / `nameEn`, with both sides split the same
   deterministic way (`Çin Cumhuriyeti (Tayvan)` also answers to each half).

No match, or more than one match, is a **hard error** and the run stops. There is no
nearest-name fallback: a silently skipped country is how a wave "lands" with an empty
field, and a silently mis-matched one would write one country's climate onto another.

The ISO escape hatch is **cross-checked, not trusted**: if a heading's two-letter code and
its names resolve to different countries, neither wins and the run stops.

Field headers fail loudly too, which they previously did not. A header that differs from a
known field only by case (`introTR`) or that carries trailing text
(`` ### `introTr` (owner verbatim) ``) is an **error**, because the prose beneath it is
real content that would otherwise be discarded with no signal at all. A backticked header
naming a field this tool does not transcribe is a printed **warning**, not silence.

## Verified against the committed seed

Run per wave — which is how the gate is defined (`ENGINEERING.md` §8) — **24 of the 26 drafts
exit 0 today**. The exceptions are known, tracked, and none is a tool defect:

| Draft | Result | Cause |
| --- | --- | --- |
| `dunya-haritasi-latin-amerika` | 2 drifted | **Stale draft:** PR #46's `Ekvator` -> `Ekvador` correction landed on the seed and was never back-ported to the draft. `apply` now refuses rather than reverting it. NOVA task. |
| `dunya-haritasi-sovereignty` | hard error | **Superseded draft.** Its authoritative replacement is `dunya-haritasi-sovereignty-narrative/`, which exits 0 on all 24 fields. The older file also annotates its field headers, which is now an error. |

**Resolved:** `dunya-haritasi-afrika-sahra-alti` used to report `7 drifted` — a real seed
regression, not a tool defect: `\n\n` paragraph breaks on `landformNoteTr` (TZ, ZM, ZW, AO,
CD, SN, CI) were flattened to single spaces during hand transcription. This was the tool's
first live catch, and it is fixed in PR #63; that draft now exits 0.

Note the last row: those 6 "divergences" only ever appeared when **both** sovereignty
drafts were passed to one run, where the duplicate `isoCode.field` silently resolved
last-wins. That is now a hard error, so the corpus no longer has a permanently un-greenable
field.

## Tests

`pnpm test:unit` (CI job `Test (unit — tools)`). Tests assert **rules and invariants
only** — not one country fact is hardcoded (→ `CONVENTIONS.md` §2). The data-driven suite
reads whatever is committed and asserts a property over it, so it keeps working as waves
land and never needs editing when a fact is corrected.
