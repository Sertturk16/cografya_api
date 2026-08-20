# `data/reference/` — the committed ilçe artefact

One file, and it is a **byte copy**:

| File | Source | Read by | Size |
| --- | --- | --- | ---: |
| `districts.tuik.json` | `Owner's Inbox/oturum-lite/ilce-listesi.json` | `pnpm db:seed:reference` | 73 638 B |

Nothing in this repo writes it. It is copied in, never regenerated, and never hand-edited — and
`.prettierignore` carries `data/reference/*.json` so `pnpm format` cannot quietly rewrite it either.
The file has **no trailing newline**; that is part of the byte copy.

> **The copy's own `_meta.statu` still reads `DRAFT — provenance defter satırı inmeden seed inmez`,
> and that precondition IS met.** The two `provenance/datasets.md` rows (both 2026-08-20 — the TÜİK
> source row and the MGM verification-only row) landed before this seed did. The line is stale
> rather than wrong-at-the-time, and it is left untouched on purpose: a byte copy that gets edited
> to read better is no longer a byte copy, and the hash below is what makes that rule enforceable.
> Re-stamping the Inbox artefact is its author's, not this repo's.

---

## Why it is a copy and not a `.ts` seed array

`ENGINEERING.md` §8's most expensive lesson is that content seeds are transcribed by tool, never by
hand: PR #43's dropped spaces came from hand-typing prose into the `+`-concatenation idiom.
Retyping 973 Turkish place names is the same class and a worse one — a dropped space is visible in
review, `Şarkışla` mistyped as `Şarkişla` is not, and it would be published on a form 973 users pick
from.

A byte copy plus load-time validation makes that class structurally impossible rather than merely
unlikely: there is no transcription step, so there is nothing to transcribe wrongly. That is also
why this leg adds no `tools/seed-transcription/` lane. It is the `data/books/` design, second use.

## Provenance and licence

**Source (published):** TÜİK Coğrafi İstatistik Portalı — Düzey-4 (ilçe) and Düzey-3 (il) geometry,
`https://cip.tuik.gov.tr/assets/geometri/nuts4.json` + `.../nuts3.json`, accessed **2026-08-20**.
The ledger row is `provenance/datasets.md` (2026-08-20, TÜİK Coğrafi İstatistik Portalı); the full
collection dossier is `Owner's Inbox/oturum-lite/ilce-listesi.md`.

TÜİK's own legal notice (`https://www.tuik.gov.tr/Kurumsal/Yasal_Uyari`), quoted verbatim and never
translated:

> "İnternet sitemizden, yayınlarımızdan veya veri tabanlarımızdan elde edilen verilerin, kaynak
> gösterilmek suretiyle herhangi bir izine gerek duymaksızın yeniden kullanımı mümkündür"

So: **no prior permission is required and attribution is mandatory.** That is what makes
`CONVENTIONS.md` §7 satisfied for this list, and it is also a standing obligation — the credit is
carried by the ledger row and by this file today. **Whether a visible source line also appears on
the registration form is a product decision and is still OPEN** (the ledger row says so in its own
`OPEN:` clause); until it is ruled, nothing in the api renders one, and no endpoint here publishes a
licence string.

**Verification source (NOT published):** MGM's forecast-centre list
(`https://servis.mgm.gov.tr/web/merkezler/ililcesi?il=<il>`, 81 calls) independently confirmed 969
of the 973 names, and the four differences are each explained in the dossier §3.2. **No MGM string
ships**, because MGM's legal notice (`https://www.mgm.gov.tr/site/yasal-uyari.aspx`), quoted
verbatim, requires prior permission:

> "Internet sitesinde bulunan hiçbir bilgi; önceden izin alınmadan ve kaynak gösterilmeden, kod ve
> yazılım da dahil olmak üzere, değiştirilemez, kopyalanamaz, çoğaltılamaz, başka bir lisana
> çevrilemez, yeniden yayımlanamaz"

`CONVENTIONS.md` §7 is therefore **not** met for MGM. The artefact's per-district `mgmConfirmed`
flag is a research record and `src/database/seeds/district.artifact.ts` discards it in
`normalizeArtifact`, so "nothing from MGM reaches a column" is a structural property rather than a
promise.

## The hash, and exactly what it proves

**Artefact (SHA-256 of the whole file):**

```
5963b103e2a5a0ac9e0fdf7ac9d11ca206fd2f52fd3c854381483b1c48afc9df
```

Re-verify both sides from the repo root:

```sh
sha256sum data/reference/districts.tuik.json \
          "../Owner's Inbox/oturum-lite/ilce-listesi.json"
cmp data/reference/districts.tuik.json \
    "../Owner's Inbox/oturum-lite/ilce-listesi.json"
```

The same hash is pinned in `src/database/seeds/district.artifact.ts` and checked at load time, so
the seed refuses to write if the committed copy changed. **It catches exactly one thing:** somebody
"correcting" a name in the repo instead of taking it up with the source — which is a real temptation
here, since TÜİK itself ships `KahramanKAZAN` and this repo publishes `Kahramankazan`. It does
**not** prove the committed copy still matches the Inbox source: that file lives outside this
repository, so no runtime check and no CI job here can reach it, and the command above is run by the
reviewer, by hand.

The pin also does not catch a **truncated** artefact — updating the pin is the *documented*
procedure for a re-collection, so a partial export whose rows are each perfectly valid would pass.
`ARTIFACT_COVERAGE_FLOOR` (81 provinces / 973 districts) is the second constant a recomputation
cannot discharge. It is a FLOOR, not an equality: an ilçe is created by law, so the real total can
rise, and equality would turn a lawful new ilçe into a red gate while the floor turns a truncated
export into one.

## The numbers, and why 973 rather than 975 or 922

Three totals were in circulation and all three are explained in the dossier §2:

| Number | Where it stood | Verdict |
| --- | --- | --- |
| **973** | TÜİK's own Düzey-4 geometry; `provinces.district_count` since the geography seed | **correct for us** |
| 922 | İçişleri Bakanlığı, "Mülki İdare Bölümleri Envanteri" | correct, counts something else — it omits the 51 non-metropolitan provinces' `Merkez` ilçe (30 büyükşehir + 51 il = 81) |
| 975 | the SPEC, taken from the reference product | wrong — Antalya's `Aksu` and `Kumluca` also appear under Artvin there |

The registration form needs every ilçe a user can select, `Merkez` included, so **973** is the
number this artefact carries and the one the load phase enforces against
`provinces.district_count`.

## What the seed refuses

`src/database/seeds/district.artifact.ts` carries the artefact refusals and
`src/database/seeds/seed-reference.ts` the two province gates. Four are worth knowing before editing
anything here:

- **The writing form is checked, and the database deliberately does not check it.** `DEC
  2026-08-20p` md.5 rules the reader sees `Kadıköy`, not `KADIKÖY`, for all 973 of these names —
  it is the ruling that extends `DEC 2026-08-20m` md.6 (written for university and department
  names, and carrying a "store the source form, convert only on screen" half that would say the
  opposite here) to this list. The source is ALL-CAPS, so
  every name went through a hand-written `İ`→`i` / `I`→`ı` mapping; a ready-made converter puts an
  invisible U+0307 into **308** of these 973 names. The load phase refuses both an ALL-CAPS
  leftover and a U+0307, because a transformation is judged where the error message can name the
  source. The column's own `CHECK` only rejects padding and the empty string.
- **The plate↔il mapping is joined against the province table**, on the il's NAME as well as its
  district count. The artefact derived that mapping geometrically (point-in-polygon over TÜİK's own
  Düzey-3 polygons), so a systematic off-by-one would produce 973 correctly-spelled names attached
  to the wrong provinces and every internal check would still pass. The name join is what sees it.
- **The count gate runs twice, on the input and on the result.** The second run re-counts the rows
  actually in the table, inside the same transaction, which is the only check that can see a row
  this seed neither wrote nor removed.
- **`--check` needs no database and is not a weaker gate.** It runs every artefact refusal and then
  joins against the committed province corpus (`SEED_PROVINCES`) instead of against a live table, so
  a reviewer on any machine can run it with no Postgres at all. The closing criterion is its **exit
  code**, never the counts it prints:

  ```sh
  pnpm db:seed:reference                    # validate, then write (idempotent)
  pnpm db:seed:reference --check            # validate only; writes nothing, opens no connection
  pnpm db:seed:reference --allow-removals   # additionally authorises DELETING rows the artefact dropped
  ```

  Without the flag, a run that would delete an ilçe **refuses by name and rolls the whole
  transaction back**. A deletion is an operator decision, never a number in a log line.
