# Data provenance — Batch 2, wave 2 (Marmara, 10 provinces) — seed snapshot

**Purpose.** A repo-local, read-only snapshot of the provenance for the wave-2 data loaded
by `pnpm db:seed:geography` (`src/database/seeds/province.seed-data.ts`, the
`BATCH2_WAVE2_PROVINCES` array). The **live, writable ledger** lives at the orchestrator
root — `data-provenance.md` (outside this repo, per the single-writer rule). This file is a
frozen copy so the seed's traceability travels with the code; if the two ever disagree, the
root ledger wins. (Companion to `docs/data-provenance-pilot5.md` and
`docs/data-provenance-batch2-wave1.md`.)

- **Batch:** 2 — wave 2: Marmara, 10 provinces (Balıkesir, Bilecik, Bursa, Çanakkale,
  Edirne, Kırklareli, Kocaeli, Sakarya, Tekirdağ, Yalova). İstanbul is Marmara's 11th
  province but is already seeded in Batch 1 (pilot-5), so it is NOT repeated here.
- **Scope:** BASE DATA ONLY — the same field set/shape as the pilot-5 + wave-1 seed. The
  PR-5a detail-page fields (`intro_tr`, `hydrography_*`, `urbanization_rate`,
  `net_migration_rate`, `settlement_note_tr`, `economy_indicator`) are **deliberately
  `null`** for this wave (owner priority ruling, DEC 2026-07-10) — filled by a later
  fact-checked content batch, never invented here.
- **Source of record:** NOVA's researched draft, **independently fact-checked by a
  different actor**, core-data verdict **"10/10 VERIFIED, ZERO deviations"** — every value
  below was re-derived from its Tier-1 source in a second browser session and matched the
  draft exactly.
  - Draft: `Owner's Inbox/data-source-groundwork/batch2-wave2-marmara.md`
  - Fact-check report (independent actor): `Owner's Inbox/data-source-groundwork/batch2-wave2-factcheck.md`
  - Root ledger: `data-provenance.md` — Batch 2 — Dalga 2
- **Scope guard:** only these 10 (+ 5 pilot + 9 wave-1 = 24) provinces are seeded. The
  remaining 57 are still DRAFT and are intentionally NOT seeded — their web pages correctly
  `notFound()` (404) until a future wave clears an independent fact-check.

## Per-field Tier-1 authority + fact-check status

| Field | Authority (Tier-1) | Status |
|---|---|---|
| Nüfus (population, ref. 31.12.2025) | TÜİK ADNKS 2025 (bülten 53899) | VERIFIED 10/10 |
| Yüzölçümü (area, km²) | Harita Genel Müdürlüğü (`il_ilce_alanlari.xlsx`) | VERIFIED 10/10 |
| İlçe sayısı (district count) | İçişleri Bakanlığı e-İçişleri envanteri | VERIFIED 10/10 |
| Rakım + koordinat (il merkezi) | MGM il-merkez meteoroloji istasyonu (kanonik ref.) | VERIFIED 10/10 |
| Köppen iklim | MGM 2023 Köppen raporu, s.11-15 (254-istasyon tablo) | **8 Csa + 2 Cfa** (VERIFIED 10/10) |
| Komşu iller | Tier-2 statik coğrafi olgu, çok-kaynaklı | VERIFIED (Tier-2, Kırklareli notu hariç) |

## Seeded values

| Plaka | İl | Bölge | Nüfus (2025) | Alan km² | İlçe | Rakım m | Enlem | Boylam | Köppen |
|---|---|---|---|---|---|---|---|---|---|
| 10 | Balıkesir | Marmara | 1.284.517 | 14.583 | 20 | 110 | 39,6551 | 27,9207 | Csa |
| 11 | Bilecik | Marmara | 228.995 | 4.179 | 8 | 539 | 40,1414 | 29,9772 | Csa |
| 16 | Bursa | Marmara | 3.263.011 | 10.813 | 17 | 100 | 40,2308 | 29,0133 | Csa |
| 17 | Çanakkale | Marmara | 573.976 | 9.817 | 12 | 6 | 40,141 | 26,3993 | Csa |
| 22 | Edirne | Marmara | 422.438 | 6.145 | 9 | 51 | 41,6767 | 26,5508 | Csa |
| 39 | Kırklareli | Marmara | 379.595 | 6.459 | 8 | 232 | 41,7382 | 27,2178 | Csa |
| 41 | Kocaeli | Marmara | 2.161.171 | 3.397 | 12 | 0 | 40,7663 | 29,9173 | **Cfa** |
| 54 | Sakarya | Marmara | 1.123.693 | 4.824 | 16 | 30 | 40,7676 | 30,3934 | **Cfa** |
| 59 | Tekirdağ | Marmara | 1.208.441 | 6.190 | 11 | 4 | 40,9585 | 27,4965 | Csa |
| 77 | Yalova | Marmara | 311.635 | 798 | 6 | 4 | 40,6589 | 29,2796 | Csa |

Rakım/koordinat MGM istasyonları — **not all "Merkez"** (fact-check §A.4, the most sensitive
check; same category as the pilot's İstanbul→Yeşilköy and wave-1's Diyarbakır→Bağlar):
Balıkesir→Merkez, Bilecik→Merkez, **Bursa→Osmangazi**, Çanakkale→Merkez, Edirne→Merkez,
Kırklareli→Merkez, **Kocaeli→İzmit**, **Sakarya→Adapazarı**, **Tekirdağ→Süleymanpaşa**,
Yalova→Merkez. None of Bursa/Kocaeli/Sakarya/Tekirdağ has a district named "Merkez" anymore
(cross-confirmed against the e-İçişleri dropdown scan). Recorded as an inline comment on each
`elevationM` in `province.seed-data.ts`. Note Kocaeli's elevation is a real **0 m** (İzmit
Körfezi coast), not a missing value.

## Köppen — MIXED this wave (the highest-risk check)

8/10 provinces resolve to **Csa**; **Kocaeli and Sakarya resolve to Cfa** ("f" = her mevsim
yağışlı / no dry season). This is the first non-uniform Köppen batch. The fact-check
independently re-downloaded and re-parsed MGM's `koppen.pdf` and confirmed Kocaeli (s.13) and
Sakarya (s.14) genuinely sit on their own `Cfa` rows — NOT a copy-paste from neighbouring
Bursa's `Csa` (§A.5, "the exact scenario a copy-paste error could hide"). The mandatory MGM
caveat rule still applies to all 10: a bare Köppen code must never ship. The 8 Csa provinces
reuse the shared `MGM_KOPPEN_CAVEAT_TR`; Kocaeli/Sakarya carry a Cfa-variant caveat
(`MGM_KOPPEN_CAVEAT_CFA_TR`). No province-specific Thornthwaite/Erinç divergence is appended
for any of the 10 — the source deliberately did not research that alternative for this wave.

**Cfa Turkish class label — RESOLVED (owner ruling + NOVA confirmation, 2026-07-11):** the
Cfa `climate_class_tr` is **`Karadeniz iklimi`** (superseding the initially-seeded "Nemli
subtropikal iklim"). Chosen as the TYT/AYT-curriculum name for the class (same register as
Csa→"Akdeniz iklimi") AND on a definitional match, not just pedagogy: "Karadeniz iklimi"'s
standard definition ("her mevsim yağışlı") maps directly onto Köppen's "f" (no dry season)
that defines Cfa. NOVA sanity-checked Kocaeli/Sakarya specifically — their sourced
regional-climate descriptions at the exact MGM stations used are consistent with Karadeniz
influence (no geographic-accuracy red flag).

## Slug decisions

All 10 slugs follow the GLOSSARY §5 ASCII-fold rule (`Çanakkale`→`canakkale`,
`Kırklareli`→`kirklareli`, `Tekirdağ`→`tekirdag`, `Balıkesir`→`balikesir`, etc.); `slug_tr`
== `slug_en` (no distinct EN name). NOVA's 81-province collision scan (recorded at wave-1)
came back clean, so none of these fold onto an already-seeded slug.

## Kırklareli neighbours — a resolved Tier-1-vs-Tier-1 conflict

The draft claimed Kırklareli neighbours only Edirne+Tekirdağ (İstanbul NOT a neighbour). The
independent fact-check **downgraded this to `[TEYİT GEREK]`** (§A.6.1): two official state
pages — Kırklareli İl Özel İdaresi (`kirklareliilozelidaresi.gov.tr`) AND the Bakanlık İl
Müdürlüğü (`kirklareli.csb.gov.tr`) — DO list İstanbul (34) as a neighbour, contradicting the
draft's cited source; Wikipedia + a Çatalca district-level check say only Edirne+Tekirdağ.
**Atlas resolved it geometrically** against the real vendored boundary GeoJSON
(`cografya_web/data/tr-il-boundaries.geojson`, OSM/ODbL): known-adjacent pairs measure
**0.00 km** of polygon separation, but **Kırklareli↔İstanbul measures ~6.5 km** — they do NOT
share a border (contrast: Kırklareli↔Ankara = 342 km). Two independent evidence lines
(Wikipedia + real geometry) agree.

**Seed decision (Atlas's evidence-based default):** İstanbul (34) is **EXCLUDED** from
Kırklareli's `neighbor_plate_codes` — only Edirne (22) + Tekirdağ (59). Definitive closure
waits on the one-shot 81-il İçişleri/HGM boundary pass. **Vera note:** in the interim the il
page must NOT assert a hard "Kırklareli only borders Edirne and Tekirdağ" sentence — use a
cautious phrasing (per fact-check §A.6.1) since two official pages still say otherwise.

## Other neighbour notes (VERIFIED in fact-check)

- **Edirne–Çanakkale share a land border** (§A.6.2, three independent sources) — Tekirdağ
  does NOT come between them at the Saros Körfezi coast (Keşan/Enez ↔ Gelibolu/Eceabat).
- **Yalova** has only 2 land neighbours (Kocaeli, Bursa) — Türkiye's 2nd most "isolated"
  province after wave-1's Kilis (1 neighbour).
- **Bursa** has 6 land neighbours — the most in this wave.
- Country/sea adjacencies are NOT provinces and are excluded from `neighbor_plate_codes`
  (Edirne→Yunanistan/Bulgaristan; Kırklareli→Bulgaristan/Karadeniz; Kocaeli/Sakarya→Karadeniz;
  Balıkesir→Midilli/Yunanistan overseas; Tekirdağ→Marmara/Karadeniz).

## Open / deferred items (surfaced, not blocking)

- **All PR-5a detail-page fields + `landform_note_tr` are `null` for all 10** — base-data
  wave by owner ruling (DEC 2026-07-10). Not invented to satisfy a column.
- **Cfa Turkish-label register** — RESOLVED to `Karadeniz iklimi` (see Köppen section).
- **Kırklareli–İstanbul neighbour** — `[TEYİT GEREK]`, closed by the 81-il boundary pass.
- **Tekirdağ Karadeniz coastline** — fact-check upgraded this to VERIFIED (§A.6.3); it does
  not change any seeded field (sea adjacency is not stored), only informs future il-page copy.
- **Centroid / bounding-box:** derived from boundary GeoJSON at build time, never
  hand-seeded — not stored on the entity.
