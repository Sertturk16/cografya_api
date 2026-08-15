# `data/books/` — the committed question-index artefact

One file, and it is a **byte copy**:

| File | Source | Read by | Size |
| --- | --- | --- | ---: |
| `ayt-cografya-brans-denemeleri.timestamps.json` | `Owner's Inbox/kitap-video-cozumler/timestamps.json` | `pnpm db:seed:books` | 18 101 B |

Nothing in this repo writes it. It is copied in, never regenerated, and never hand-edited.

---

## Why it is a copy and not a `.ts` seed array

`ENGINEERING.md` §8's most expensive lesson is that narrative-content seeds are transcribed by
tool, never by hand: PR #43's dropped spaces came from hand-typing prose into the
`+`-concatenation idiom. Retyping 180 numbers into a TypeScript file is the numeric form of the
same class, and a worse one — **a dropped space is visible in review, a timestamp shifted by three
seconds is not.**

A byte copy plus runtime validation makes that class structurally impossible rather than merely
unlikely: there is no transcription step, so there is nothing to transcribe wrongly. It is also why
this leg has no fifth `tools/seed-transcription/` lane (SPEC §7.1, Atlas ruling on the B2 plan).

## The hashes, and exactly what each one proves

**Artefact (SHA-256 of the whole file):**

```
be6f529401e616225d41345ce858eeb7d0eb93b6434c28c1eb94b46a5d499a55
```

Re-verify both sides from the repo root:

```sh
sha256sum data/books/ayt-cografya-brans-denemeleri.timestamps.json \
          "../Owner's Inbox/kitap-video-cozumler/timestamps.json"
cmp data/books/ayt-cografya-brans-denemeleri.timestamps.json \
    "../Owner's Inbox/kitap-video-cozumler/timestamps.json"
```

The same hash is pinned in `src/database/seeds/book-timestamps.artifact.ts` and checked at runtime,
so the seed refuses to write if the committed copy changed. **That check does NOT close SPEC §17's
R10.** The two copies that can drift apart are the Inbox source and this one, and no check inside
this repository can see the Inbox source — it lives outside the repo, which is why CI cannot own
this and why the command above is run by the reviewer, by hand. The runtime pin catches exactly one
thing: somebody "correcting" a mark in the committed file instead of re-measuring it.

**The three editorial strings** (`books.seed-data.ts`, from
`Owner's Inbox/kitap-video-cozumler/kitap-editoryal-metin.md`, the approved v2 revision block):

| Field | Code points | SHA-256 |
| --- | ---: | --- |
| `metaTitleTr` | 57 | `859c9064ac9b388ad0ee02ccf7abbbf643adcc218fd932ade28da8aec75f7bd3` |
| `metaDescriptionTr` | 151 | `1d92939960cd8f731d9ae3cf02f2c4b82c9a0b24945d968feb65290c18069a4b` |
| `introTr` | 449 | `c75f29e9531bb182cf76d54d9c0c8fe404e9683d9efce003f1318d86b51f2356` |

Re-derive the seeded side from the compiled build, from the repo root:

```sh
pnpm build && node -e '
const { createHash } = require("node:crypto");
const { SEED_BOOKS } = require("./dist/database/seeds/books.seed-data.js");
for (const field of ["metaTitleTr", "metaDescriptionTr", "introTr"]) {
  const value = SEED_BOOKS[0][field];
  console.log(field, [...value].length, createHash("sha256").update(value, "utf8").digest("hex"));
}'
```

Three equal hex strings is the verification. It replaces reading 657 characters of Turkish prose
character by character, which is the check a human silently fails.

## What the seed refuses

`src/database/seeds/book-timestamps.artifact.ts` carries SPEC §7.2's seven refusals and
`book-seed-invariants.ts` the künye and prose ceilings. Two are worth knowing before editing
anything here:

- **The artefact carries no question number.** `questionNo` is derived from array position, so the
  `"Soru {n}"` tag is the *independent witness* that the marks were not dropped, duplicated or
  reordered. Position and tag must agree for every mark, or nothing is written.
- **`--check` needs no database.** `pnpm db:seed:books --check` validates everything and opens no
  connection; the closing criterion is its **exit code**, never the counts it prints.
