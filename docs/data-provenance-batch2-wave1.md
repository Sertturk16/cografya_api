# Data provenance — Batch 2, wave 1 (Güneydoğu Anadolu, 9 provinces) — seed snapshot

**Purpose.** A repo-local, read-only snapshot of the provenance for the wave-1 data loaded
by `pnpm db:seed:geography` (`src/database/seeds/province.seed-data.ts`, the
`BATCH2_WAVE1_PROVINCES` array). The **live, writable ledger** lives at the orchestrator
root — `data-provenance.md` (outside this repo, per the single-writer rule). This file is a
frozen copy so the seed's traceability travels with the code; if the two ever disagree, the
root ledger wins. (Companion to `docs/data-provenance-pilot5.md` for Batch 1.)

- **Batch:** 2 — wave 1: Güneydoğu Anadolu, 9 provinces (Adıyaman, Batman, Diyarbakır,
  Gaziantep, Kilis, Mardin, Siirt, Şanlıurfa, Şırnak).
- **Scope:** BASE DATA ONLY — the same field set/shape as the pilot-5 seed. The PR-5a
  detail-page fields (`intro_tr`, `hydrography_*`, `urbanization_rate`,
  `net_migration_rate`, `settlement_note_tr`, `economy_indicator`) are **deliberately
  `null`** for this wave (owner priority ruling, DEC 2026-07-10) — filled by a later
  fact-checked content batch, never invented here.
- **Source of record:** NOVA's researched draft, **independently fact-checked by a
  different actor**, verdict **"SEED-READY, ZERO corrections needed"** — every value below
  was re-derived from its Tier-1 source in a second browser session and matched the draft
  exactly (no `CORRECTED` items, unlike Batch 1).
  - Draft: `Owner's Inbox/data-source-groundwork/batch2-wave1-guneydogu-anadolu.md`
  - Fact-check report (independent actor): `Owner's Inbox/data-source-groundwork/batch2-wave1-factcheck.md`
  - Root ledger: `data-provenance.md` — Batch 2 — Dalga 1
- **Scope guard:** only these 9 (+ the 5 pilot = 14) provinces are seeded. The remaining
  67 are still DRAFT and are intentionally NOT seeded — their web pages correctly
  `notFound()` (404) until a future wave clears an independent fact-check.

## Per-field Tier-1 authority + fact-check status

| Field | Authority (Tier-1) | Status |
|---|---|---|
| Nüfus (population, ref. 31.12.2025) | TÜİK ADNKS 2025 (bülten 53899) | VERIFIED 9/9 |
| Yüzölçümü (area, km²) | Harita Genel Müdürlüğü (`il_ilce_alanlari.xlsx`) | VERIFIED 9/9 |
| İlçe sayısı (district count) | İçişleri Bakanlığı e-İçişleri envanteri | VERIFIED 9/9 |
| Rakım + koordinat (il merkezi) | MGM il-merkez meteoroloji istasyonu (kanonik ref.) | VERIFIED 9/9 |
| Köppen iklim | MGM 2023 Köppen raporu, s.11-15 (254-istasyon tablo) | 9/9 = **Csa** (VERIFIED) |
| Komşu iller | Tier-2 statik coğrafi olgu, çok-kaynaklı | VERIFIED (Tier-2) |

## Seeded values

| Plaka | İl | Bölge | Nüfus (2025) | Alan km² | İlçe | Rakım m | Enlem | Boylam | Köppen |
|---|---|---|---|---|---|---|---|---|---|
| 02 | Adıyaman | Güneydoğu Anadolu | 617.821 | 7.337 | 9 | 672 | 37,7553 | 38,2775 | Csa |
| 72 | Batman | Güneydoğu Anadolu | 662.626 | 4.477 | 6 | 610 | 37,8636 | 41,1562 | Csa |
| 21 | Diyarbakır | Güneydoğu Anadolu | 1.852.356 | 15.101 | 17 | 674 | 37,9094 | 40,2133 | Csa |
| 27 | Gaziantep | Güneydoğu Anadolu | 2.222.415 | 6.803 | 9 | 700 | 36,9468 | 37,4617 | Csa |
| 79 | Kilis | Güneydoğu Anadolu | 157.363 | 1.412 | 4 | 640 | 36,7085 | 37,1123 | Csa |
| 47 | Mardin | Güneydoğu Anadolu | 903.576 | 8.780 | 10 | 1.040 | 37,3103 | 40,7284 | Csa |
| 56 | Siirt | Güneydoğu Anadolu | 332.369 | 5.717 | 7 | 895 | 37,9319 | 41,9354 | Csa |
| 63 | Şanlıurfa | Güneydoğu Anadolu | 2.265.800 | 19.242 | 13 | 550 | 37,1608 | 38,7863 | Csa |
| 73 | Şırnak | Güneydoğu Anadolu | 573.666 | 7.078 | 7 | 1.350 | 37,5209 | 42,4523 | Csa |

Rakım/koordinat MGM istasyonları — **not all "Merkez"** (fact-check §A.4, the most sensitive
check; same category as the pilot's İstanbul→Yeşilköy and Van→Edremit):
Adıyaman→Merkez, Batman→Merkez, **Diyarbakır→Bağlar**, **Gaziantep→Oğuzeli**, Kilis→Merkez,
**Mardin→Artuklu**, Siirt→Merkez, **Şanlıurfa→Eyyübiye**, Şırnak→Merkez. Recorded as an
inline comment on each `elevationM` in `province.seed-data.ts`.

## Slug decisions (locked)

- **Şanlıurfa → `sanliurfa`** (both `slug_tr`/`slug_en`): official-name ASCII fold, no
  "urfa" exception (→ DEC 2026-07-10). All 9 slugs follow the GLOSSARY §5 fold rule; NOVA's
  81-province collision scan came back clean (no two province names fold to the same slug).

## Mandatory Köppen caveat (stored in `climate_note_tr`)

All 9 provinces resolve to **Csa** under MGM's 2023 Köppen table. Per the locked rule, a
bare "Csa" must NEVER ship alone: the seed stores the shared `MGM_KOPPEN_CAVEAT_TR` note in
`climate_note_tr` so the note always travels with the value. This is the **same generic
caveat** the pilot attaches to its own non-İç/Doğu provinces (İstanbul, İzmir, Antalya). No
province-specific Thornthwaite/Erinç divergence is appended for these 9 — the source
**deliberately did not research** that alternative classification for this wave (draft
Bölüm 2 / fact-check §A.5), so appending one would be a sourceless fact.

## Open / deferred items (surfaced, not blocking)

- **All PR-5a detail-page fields + `landform_note_tr` are `null` for all 9** — base-data
  wave by owner ruling (DEC 2026-07-10). Not invented to satisfy a column.
- **Neighbour codes:** the draft lists neighbours by NAME; the seed converts them to the
  immutable İçişleri plaka codes (spelled out inline in `province.seed-data.ts`). Country
  borders (Gaziantep/Kilis/Mardin/Şanlıurfa→Suriye, Şırnak→Irak+Suriye) are not provinces
  and are excluded from `neighbor_plate_codes`. Kilis has a single province neighbour
  (Gaziantep) — Türkiye's most "isolated" province by land-neighbour count.
- **Diyarbakır "2nd-most neighbours in the region" claim:** a content note, not a data
  field — the fact-check left the ranking `[TEYİT GEREK — low priority]` (Erzurum=9 and
  Diyarbakır=8 confirmed, but the full regional ranking was not scanned). Does not affect
  any seeded value.
- **Centroid / bounding-box:** derived from boundary GeoJSON at build time, never
  hand-seeded — not stored on the entity.
