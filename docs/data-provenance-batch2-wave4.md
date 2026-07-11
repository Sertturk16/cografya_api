# Data provenance — Batch 2, wave 4 (Akdeniz, 7 provinces) — seed snapshot

**Purpose.** A repo-local, read-only snapshot of the provenance for the wave-4 data loaded
by `pnpm db:seed:geography` (`src/database/seeds/province.seed-data.ts`, the
`BATCH2_WAVE4_PROVINCES` array). The **live, writable ledger** lives at the orchestrator
root — `data-provenance.md` (outside this repo, per the single-writer rule). This file is a
frozen copy so the seed's traceability travels with the code; if the two ever disagree, the
root ledger wins. (Companion to `docs/data-provenance-pilot5.md`,
`docs/data-provenance-batch2-wave1.md`, `docs/data-provenance-batch2-wave2.md` and
`docs/data-provenance-batch2-wave3.md`.)

- **Batch:** 2 — wave 4: Akdeniz, 7 provinces (Adana, Burdur, Hatay, Isparta, Kahramanmaraş,
  Mersin, Osmaniye). Antalya is Akdeniz's 8th province but is already seeded in Batch 1
  (pilot-5), so it is NOT repeated here.
- **Scope:** BASE DATA ONLY — the same field set/shape as the pilot-5 + wave-1 + wave-2 +
  wave-3 seed. The PR-5a detail-page fields (`intro_tr`, `hydrography_*`,
  `urbanization_rate`, `net_migration_rate`, `settlement_note_tr`, `economy_indicator`) are
  **deliberately `null`** for this wave (owner priority ruling, DEC 2026-07-10) — filled by
  a later fact-checked content batch, never invented here.
- **Source of record:** NOVA's researched draft, **independently fact-checked by a different
  actor**, verdict **"7/7 VERIFIED, ZERO numeric deviations"** — every value below (including
  the full neighbour lists and the Kahramanmaraş elevation exception) was re-derived from its
  Tier-1 source in a second browser session and matched the draft exactly.
  - Draft: `Owner's Inbox/data-source-groundwork/batch2-wave4-akdeniz.md`
  - Fact-check report (independent actor): `Owner's Inbox/data-source-groundwork/batch2-wave4-factcheck.md`
  - Root ledger: `data-provenance.md` — Batch 2 — Dalga 4
- **Scope guard:** only these 7 (+ 5 pilot + 9 wave-1 + 10 wave-2 + 7 wave-3 = 38) provinces
  are seeded. The remaining 43 are still DRAFT and are intentionally NOT seeded — their web
  pages correctly `notFound()` (404) until a future wave clears an independent fact-check.

## Per-field Tier-1 authority + fact-check status

| Field | Authority (Tier-1) | Status |
|---|---|---|
| Nüfus (population, ref. 31.12.2025) | TÜİK ADNKS 2025 (bülten 53899) | VERIFIED 7/7 |
| Yüzölçümü (area, km²) | Harita Genel Müdürlüğü (`il_ilce_alanlari.xlsx`) | VERIFIED 7/7 |
| İlçe sayısı (district count) | İçişleri Bakanlığı e-İçişleri envanteri | VERIFIED 7/7 |
| Rakım + koordinat (il merkezi) | MGM il-merkez meteoroloji istasyonu (kanonik ref.) | VERIFIED 7/7 (Kahramanmaraş via GLOSSARY §1 exception, see below) |
| Köppen iklim | MGM 2023 Köppen raporu, s.11-14 (254-istasyon tablo) | **Csa 7/7, UNIFORM** (VERIFIED) |
| Komşu iller | Tier-2, full 81-il GeoJSON scan + Vikipedi (double-verified) | **VERIFIED 7/7** |

## Seeded values

| Plaka | İl | Bölge | Nüfus (2025) | Alan km² | İlçe | Rakım m | Enlem | Boylam | Köppen |
|---|---|---|---|---|---|---|---|---|---|
| 01 | Adana | Akdeniz | 2.283.609 | 13.844 | 15 | 20 | 36,9838 | 35,298 | Csa |
| 15 | Burdur | Akdeniz | 277.226 | 7.175 | 11 | 957 | 37,722 | 30,294 | Csa |
| 31 | Hatay | Akdeniz | 1.577.531 | 5.524 | 15 | 82 | 36,3615 | 36,2829 | Csa |
| 32 | Isparta | Akdeniz | 445.303 | 8.946 | 13 | 997 | 37,7848 | 30,7679 | Csa |
| 46 | Kahramanmaraş | Akdeniz | 1.146.278 | 14.520 | 11 | **572** | 37,576 | 36,915 | Csa |
| 33 | Mersin | Akdeniz | 1.956.428 | 16.010 | 13 | 7 | 36,812 | 34,6411 | Csa |
| 80 | Osmaniye | Akdeniz | 564.123 | 3.320 | 7 | 94 | 37,1021 | 36,2539 | Csa |

Rakım/koordinat MGM istasyonları — **not all "Merkez"** (fact-check §A.4, the most sensitive
check; same category as the pilot's İstanbul→Yeşilköy and wave-2's Bursa→Osmangazi): the three
büyükşehir provinces default to a named station — **Adana→Seyhan**, **Hatay→Antakya**,
**Mersin→Akdeniz** — while Burdur, Isparta and Osmaniye default to "Merkez". Kahramanmaraş
also shows a legacy "Merkez" default, but its elevation reading is broken (see next section).
Each is recorded as an inline comment on the corresponding `elevationM` in
`province.seed-data.ts`.

## Kahramanmaraş elevation — GLOSSARY §1 EXCEPTION (locked, → Atlas kararı 2026-07-11)

The single data-quality exception this wave. MGM's **literal default "Merkez" record** for
Kahramanmaraş returns **elevation = 0 m** — physically impossible for this inland/highland
province (documented ~500–570 m). Verified broken by NOVA AND the independent fact-check via
direct MGM navigation. Per the GLOSSARY §1 same-coordinate exception, the seeded value uses
MGM's OWN coordinate-identical **"Onikişubat"** record instead:

- **"Merkez"** (literal default, no `&ilce`): elevation **0 m** (broken), lat 37,576 / lon 36,915.
- **"Onikişubat"** (`&ilce=Onikisubat`): elevation **572 m**, lat 37,576 / lon 36,915 —
  coordinates IDENTICAL to the "Merkez" record. → **seeded value**.
- **"Dulkadiroğlu"** (`&ilce=Dulkadiroglu`, control): elevation 525 m, lat 37,5402 / lon 36,9685
  — a DIFFERENT coordinate, a genuinely distinct station. NOT used.

This is **not an invented value**: it is the same authoritative source's own working record for
the identical physical location. Independently TRIPLE-verified — the fact-check re-ran all three
MGM navigations and additionally confirmed the physical realism with a third source (Onikişubat
Kaymakamlığı's official "Coğrafi Durum" page: ~568 m, ~1% off, consistent). The exception is
recorded as a locked standing rule in `GLOSSARY.md` §1 (not a one-off).

**Vera's il page needs a STRONGER footnote here** than the plain rename notes (Adana/Hatay/
Mersin): the shown elevation/coordinate is the Onikişubat record's, not the literal "Merkez"
record's — stated explicitly for transparency and to prevent confusion if anyone later pulls the
raw "Merkez" record and finds 0 m (fact-check §A.4.1 / draft Bölüm 3).

## Köppen — UNIFORM Csa this wave (no new class)

All 7 provinces resolve to **Csa**, read on each il's own MGM `koppen.pdf` row (s.11–14). Two
notes:

- **Hatay has no "HATAY" line in MGM's 254-station table** — it is represented by its
  default-station row **"ANTAKYA"** (s.11, "Csa"), which is consistent with MGM's own il/ilçe
  tool defaulting Hatay to the Antakya station. Not an error; two MGM sources agree (fact-check
  §A.5 / draft Bölüm 2). Method note for future waves: if an il name is missing from the Köppen
  table, also search under its MGM default-station name.
- **No new climate class.** Unlike wave-2 (added Cfa) and wave-3 (added Csb), wave-4 introduces
  nothing new — all 7 reuse the shared `MGM_KOPPEN_CAVEAT_TR` verbatim. The seed-time
  `assertKoppenCaveatInvariant` needs zero change. No province-specific Thornthwaite/Erinç
  divergence is appended — the source deliberately did not research that alternative here. This
  is the SECOND fully-homogeneous wave (after wave-1's 9/9 Csa), expected because "Akdeniz
  iklimi" is Köppen's own name for the Cs family.

## Slug decisions

All 7 slugs follow the GLOSSARY §5 ASCII-fold rule (`Kahramanmaraş`→`kahramanmaras`,
`Isparta`→`isparta`, the rest are already ASCII: `adana`, `burdur`, `hatay`, `mersin`,
`osmaniye`); `slug_tr` == `slug_en` (no distinct EN name). NOVA's 81-province collision scan
(recorded at wave-1) came back clean, so none of these fold onto an already-seeded slug.

## Neighbours — Tier-2, double-verified (GeoJSON full-scan + Vikipedi)

The fact-check confirmed all 7 lists via BOTH a full 81-province `shapely` adjacency scan and
independent Vikipedi text extraction (§A.6, 7/7 VERIFIED). Country/sea adjacencies (Hatay→Suriye,
Adana/Mersin/Hatay→Akdeniz kıyısı) are NOT provinces and are excluded from `neighbor_plate_codes`.
Three non-obvious results survived double-verification:

- **Hatay does NOT border Kahramanmaraş** (~0.35° gap). A haberturk article contradicted itself
  across two paragraphs; GeoJSON + Vikipedi resolved it — Hatay's neighbours are Osmaniye, Adana,
  Gaziantep only (+ Suriye).
- **Isparta does NOT border Denizli** (Burdur intrudes) — the Isparta-side confirmation of the
  same finding wave-3 recorded from the Denizli side.
- **Adana DOES border both Kayseri and Hatay** — a source list had omitted them; added after the
  buffered GeoJSON test + Vikipedi confirmed the shared borders. Kahramanmaraş↔Kayseri was
  completed the same way. Adana (6) and Kahramanmaraş (7) are the most-connected this wave;
  Osmaniye (4) the least. Kahramanmaraş is the only wave-4 province with no sea coast.

## Region classification (Bölüm 0 — VERIFIED)

All 7 are Akdeniz (`GeographicRegion.Akdeniz`). NOVA independently confirmed the classic
7-region Akdeniz list = 8 provinces (Antalya + these 7), and that — like Ege, unlike Marmara —
the İBBS/NUTS Level-1 TR6 region coincides with the classic geographic region (TR61
Antalya-Isparta-Burdur · TR62 Adana-Mersin · TR63 Hatay-Kahramanmaraş-Osmaniye), cross-checked
against the MEB İBBS report + an academic TR61/62/63 source (fact-check §A.7). A separate
awareness note (deferred to content-writing, does not change the il-based assignment): the
physical/natural Mediterranean-region boundary does not follow administrative il lines exactly
(e.g. 3 Kahramanmaraş districts fall outside it), but the platform uses the locked il-based /
whole-il rule (each il assigned to ONE region).

## Open / deferred items (surfaced, not blocking)

- **All PR-5a detail-page fields + `landform_note_tr` are `null` for all 7** — base-data wave by
  owner ruling (DEC 2026-07-10). Not invented to satisfy a column.
- **Root ledger status flip (Atlas-owned):** at the time the root `data-provenance.md` wave-4
  section was written, several rows were still marked `DRAFT` / `[TEYİT GEREK]` (incl. the
  Kahramanmaraş elevation exception). The independent fact-check has since cleared them (7/7
  VERIFIED) and GLOSSARY §1 locks the exception — the root ledger's wave-4 rows should be updated
  DRAFT→VERIFIED and the Kahramanmaraş `[TEYİT GEREK]` resolved. Flagged to Atlas; outside this
  repo's single-writer scope.
- **Buffered-boundary GeoJSON method** (a neighbour-detection refinement developed this wave) is
  not yet validated at 81-il scale against the official İçişleri/HGM boundary map — carried to the
  future bulk boundary-confirmation pass (fact-check §A.6.2). Does not affect any seeded value.
- **Centroid / bounding-box:** derived from boundary GeoJSON at build time, never hand-seeded —
  not stored on the entity.
