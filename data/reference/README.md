# `data/reference/` — the committed reference artefacts

Three files, and every one of them is a **byte copy** of a collected artefact that lives in
`Owner's Inbox/`:

| File                        | Source                                           | Read by                                 |     Size |
| --------------------------- | ------------------------------------------------ | --------------------------------------- | -------: |
| `districts.tuik.json`       | `Owner's Inbox/oturum-lite/ilce-listesi.json`    | `pnpm db:seed:reference`                | 73 638 B |
| `universities.yok.json`     | `Owner's Inbox/oturum-lite/universiteler.json`   | `src/reference/reference-lists.spec.ts` | 32 447 B |
| `departments.yokatlas.json` | `Owner's Inbox/oturum-lite/bolumler-lisans.json` | `src/reference/reference-lists.spec.ts` | 10 165 B |

Nothing in this repo writes them. They are copied in, never regenerated, and never hand-edited — and
`.prettierignore` carries `data/reference/*.json` so `pnpm format` cannot quietly rewrite them
either. **None has a trailing newline**; that is part of the byte copy.

**The two lists differ from the ilçe list in one way that matters: nothing reads them at runtime.**
The ilçe list is read from disk by the seed; the üniversite and bölüm lists are compiled into
`src/reference/university.data.ts` and `src/reference/department.data.ts` instead, because `nest
build` does not copy asset files into `dist/` (`FU-SPEC-71-PATH`) and those two endpoints answer
from memory with no seed and no table behind them. The copies here are the **archive** and the
in-repo side of the fidelity check — see "The üniversite and bölüm lists" below.

**`bolumler-onlisans.json` is deliberately absent.** `DEC 2026-08-20p` md.4 rules the 261 önlisans
programme names out of the registration form's scope; a file that is out of scope should not be
sitting here waiting to be wired in by somebody who did not read the ruling.

> **The copy's own `_meta.statu` still reads `DRAFT — provenance defter satırı inmeden seed inmez`,
> and that precondition IS met.** The two `provenance/datasets.md` rows (both 2026-08-20 — the TÜİK
> source row and the MGM verification-only row) landed before this seed did. The line is stale
> rather than wrong-at-the-time, and it is left untouched on purpose: a byte copy that gets edited
> to read better is no longer a byte copy, and the hash below is what makes that rule enforceable.
> Re-stamping the Inbox artefact is its author's, not this repo's.

---

## The ilçe list — why it is a copy and not a `.ts` seed array

`ENGINEERING.md` §8's most expensive lesson is that content seeds are transcribed by tool, never by
hand: PR #43's dropped spaces came from hand-typing prose into the `+`-concatenation idiom.
Retyping 973 Turkish place names is the same class and a worse one — a dropped space is visible in
review, `Şarkışla` mistyped as `Şarkişla` is not, and it would be published on a form 973 users pick
from.

A byte copy plus load-time validation makes that class structurally impossible rather than merely
unlikely: there is no transcription step, so there is nothing to transcribe wrongly. That is also
why this leg adds no `tools/seed-transcription/` lane. It is the `data/books/` design, second use.

## The ilçe list — provenance and licence

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

## The ilçe list — the hash, and exactly what it proves

**Artefact (SHA-256 of the whole file):**

```
5963b103e2a5a0ac9e0fdf7ac9d11ca206fd2f52fd3c854381483b1c48afc9df
```

Re-verify both sides. **Both paths resolve from the current directory and the second one leaves
the repository, so `..` has to be the orchestration root** — run this from a checkout of this
branch that sits directly inside it. From a linked worktree (`cografya_api-wt/<task>/`) `..` is
the worktree parent, the Inbox file is not there, and the command exits 1 on a missing operand;
point at the orchestration root explicitly in that case.

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

The pin also does not catch a **truncated** artefact — updating the pin is the _documented_
procedure for a re-collection, so a partial export whose rows are each perfectly valid would pass.
`ARTIFACT_COVERAGE_FLOOR` (81 provinces / 973 districts) is the second constant a recomputation
cannot discharge. It is a FLOOR, not an equality: an ilçe is created by law, so the real total can
rise, and equality would turn a lawful new ilçe into a red gate while the floor turns a truncated
export into one.

## The ilçe list — why 973 rather than 975 or 922

Three totals were in circulation and all three are explained in the dossier §2:

| Number  | Where it stood                                                                   | Verdict                                                                                                                 |
| ------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **973** | TÜİK's own Düzey-4 geometry; `provinces.district_count` since the geography seed | **correct for us**                                                                                                      |
| 922     | İçişleri Bakanlığı, "Mülki İdare Bölümleri Envanteri"                            | correct, counts something else — it omits the 51 non-metropolitan provinces' `Merkez` ilçe (30 büyükşehir + 51 il = 81) |
| 975     | the SPEC, taken from the reference product                                       | wrong — Antalya's `Aksu` and `Kumluca` also appear under Artvin there                                                   |

The registration form needs every ilçe a user can select, `Merkez` included, so **973** is the
number this artefact carries and the one the load phase enforces against
`provinces.district_count`.

## The ilçe list — what the seed refuses

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

---

## The üniversite and bölüm lists (PR-2)

Two more byte copies, and — unlike the ilçe list — **no seed, no table and no runtime file read**.
They feed `GET /api/reference/universities` and `GET /api/reference/departments`, which answer from
the committed constants `src/reference/university.data.ts` and `src/reference/department.data.ts`.

### What is derived, and what is archived

`universities.yok.json` holds YÖK's own **ALL-CAPS** spelling. `DEC 2026-08-20m` md.6 rules two
things in one sentence — the reader sees normal writing ("Boğaziçi Üniversitesi"), and the source
data is kept exactly as YÖK wrote it — and the two halves land in two files: the archive here keeps
the capitals, the published constant carries the reader's form. `src/reference/reference-writing-form.ts`
is the conversion, and it is written out character by character rather than calling
`toLocaleLowerCase('tr')`, because that is the defect. `DEC 2026-08-20p` md.5 names the trap
classes and the two halves were measured on two different corpora. The U+0307 half is the sibling
ilçe list's: a ready-made converter puts an invisible combining dot into 308 of those 973 names.
The İ/ı half is **this** artefact's — `Iğdır` and `Şırnak` are province names and appear nowhere
among the 973 ilçe names, while `IĞDIR ÜNİVERSİTESİ` and `ŞIRNAK ÜNİVERSİTESİ` are rows here, and
a ready-made converter answers `Iğdir` and `Şirnak`.

`departments.yokatlas.json` needs **no** conversion — its source already arrives in the reader's
writing. The check runs the same function over it anyway and requires a no-op, which is what pins
the two lists to one convention instead of two that merely happen to agree today.

Two exception classes exist and both are small enough to read:

- **Initialisms keep their capitals** — `KTO`, `MEF`, `OSTİM`, `SANKO`, `TOBB`, `TED`. This is the
  second trap `DEC 2026-08-20p` md.5 names (`ODTÜ` → `Odtü`). Neither `ODTÜ` nor `İTÜ` occurs in
  this artefact — YÖK publishes both institutions under their full names — but these six do. The
  list is closed and the check refuses a member the source no longer contains.
- **A one-letter part after a hyphen stays small** — `BEZM-İ ÂLEM` → `Bezm-i Âlem`, the izafet
  suffix. A part of two or more letters is a word and is capitalised: `TÜRK-ALMAN` → `Türk-Alman`,
  `ÜNİVERSİTESİ-CERRAHPAŞA` → `Üniversitesi-Cerrahpaşa`.

### The gate

`src/reference/reference-lists.spec.ts` runs in `Test (unit)` — no Postgres, no network, both sides
committed. It has three legs and they are deliberately not the same check three times: it
**re-derives** each published list from the archive and compares row for row; it judges every
published name against **independent** writing-form invariants that never call the conversion; and
it checks a short **hand-written** table of the named traps. Every refusal is exercised against a
deliberately broken in-memory copy, so a check that stopped looking turns the file red instead of
leaving a green nobody earned.

Regenerating a list after a re-collection means applying that same conversion and the
`tur` → `UniversityType` map the spec declares; the spec is what says whether you got it right.

### Provenance and licence — read this before adding a source line anywhere

Both rows are in `provenance/datasets.md` (2026-08-20 for the üniversite list, 2026-08-21 for the
bölüm list) and both carry **`[KAYNAK DOĞRULANAMADI]`**. That marker is not a formality:

- **The üniversite source publishes no usage terms at all.** No "Telif", no "Tüm hakları", no
  "Kullanım Şartları" anywhere in the page body; the footer carries only, verbatim and untranslated:

  > `© 2026 Yükseköğretim Kurulu Bilgi İşlem Daire Başkanlığı`

  `robots.txt` is `User-agent: *` with an empty `Disallow`. **Silence is not permission**, and the
  ledger row refuses to record it as one.

- **The bölüm source publishes no usage terms either** and its `robots.txt` cannot be read (HTTP 200,
  but the body is a React Native source file).

So what we hold is "not forbidden", never "permitted", and the basis for using either list is a
different one: **institution and programme names are facts, and facts are not protected**
(`DEC 2026-08-20h` md.3 for the üniversite names; `DEC 2026-08-21a` for the bölüm list, where the
owner decided with the gap in full view). `DEC 2026-08-21a` also measured what was NOT taken: the
list came from a 611-row, three-field name endpoint, not from the 12 265-row derived table
`DEC 2026-08-20h` md.3 was worried about — **no score, rank, quota, occupancy, tuition or
university-programme pairing was collected**, and `z.strictObject` in the spec is what keeps a
future re-collection from smuggling one in.

Two obligations follow and both are open, tracked in the ledger rows: `FU-UNI-LISTE-KAYNAK` (whether
a visible source line belongs on the registration form is a product decision — nothing in the api
renders one today, and no endpoint here publishes a licence string) and `FU-BOLUM-KAYNAK-OSYM`
(rebuild the programme names from ÖSYM's own guide, which is the publisher).

### The hashes, and exactly what they prove

```
5b90dd8c3a6608835ead0b561a76cd81bd34facc1e98170c4a707bd01e626829  universities.yok.json
6100c8f7a832b9b3c620d29f23edf9c7a970d86a4c3905d8a91783e91a8fcba0  departments.yokatlas.json
```

Re-verify both sides. **Both paths resolve from the current directory and the second one leaves
the repository, so `..` has to be the orchestration root** — run this from a checkout of this
branch that sits directly inside it. From a linked worktree (`cografya_api-wt/<task>/`) `..` is
the worktree parent, the Inbox file is not there, and the command exits 1 on a missing operand;
point at the orchestration root explicitly in that case.

```sh
sha256sum data/reference/universities.yok.json \
          "../Owner's Inbox/oturum-lite/universiteler.json"
cmp data/reference/universities.yok.json \
    "../Owner's Inbox/oturum-lite/universiteler.json"

sha256sum data/reference/departments.yokatlas.json \
          "../Owner's Inbox/oturum-lite/bolumler-lisans.json"
cmp data/reference/departments.yokatlas.json \
    "../Owner's Inbox/oturum-lite/bolumler-lisans.json"
```

The same hashes are pinned in `reference-lists.spec.ts`. As with the ilçe pin, they catch **exactly
one thing** — somebody editing a committed copy by hand — and they do **not** prove the copy still
matches the Inbox source, which lives outside this repository where no CI job can reach it. The
commands above are the reviewer's, run by hand. The coverage floors in the same spec are the second
constant a recomputation cannot discharge: a truncated export would otherwise pass every per-row
check and simply publish a shorter list.
