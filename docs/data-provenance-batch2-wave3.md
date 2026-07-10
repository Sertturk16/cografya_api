# Data provenance — Batch 2, wave 3 (Ege, 7 provinces) — seed snapshot

**Purpose.** A repo-local, read-only snapshot of the provenance for the wave-3 data loaded
by `pnpm db:seed:geography` (`src/database/seeds/province.seed-data.ts`, the
`BATCH2_WAVE3_PROVINCES` array). The **live, writable ledger** lives at the orchestrator
root — `data-provenance.md` (outside this repo, per the single-writer rule). This file is a
frozen copy so the seed's traceability travels with the code; if the two ever disagree, the
root ledger wins. (Companion to `docs/data-provenance-pilot5.md`,
`docs/data-provenance-batch2-wave1.md` and `docs/data-provenance-batch2-wave2.md`.)

- **Batch:** 2 — wave 3: Ege, 7 provinces (Afyonkarahisar, Aydın, Denizli, Kütahya, Manisa,
  Muğla, Uşak). İzmir is Ege's 8th province but is already seeded in Batch 1 (pilot-5), so it
  is NOT repeated here.
- **Scope:** BASE DATA ONLY — the same field set/shape as the pilot-5 + wave-1 + wave-2 seed.
  The PR-5a detail-page fields (`intro_tr`, `hydrography_*`, `urbanization_rate`,
  `net_migration_rate`, `settlement_note_tr`, `economy_indicator`) are **deliberately `null`**
  for this wave (owner priority ruling, DEC 2026-07-10) — filled by a later fact-checked
  content batch, never invented here.
- **Source of record:** NOVA's researched draft, **independently fact-checked by a different
  actor**, verdict **"7/7 VERIFIED, ZERO deviations — the cleanest wave yet"** — every value
  below (including the full neighbour lists) was re-derived from its Tier-1 source in a second
  browser session and matched the draft exactly.
  - Draft: `Owner's Inbox/data-source-groundwork/batch2-wave3-ege.md`
  - Fact-check report (independent actor): `Owner's Inbox/data-source-groundwork/batch2-wave3-factcheck.md`
  - Root ledger: `data-provenance.md` — Batch 2 — Dalga 3
- **Scope guard:** only these 7 (+ 5 pilot + 9 wave-1 + 10 wave-2 = 31) provinces are seeded.
  The remaining 50 are still DRAFT and are intentionally NOT seeded — their web pages correctly
  `notFound()` (404) until a future wave clears an independent fact-check.

## Per-field Tier-1 authority + fact-check status

| Field | Authority (Tier-1) | Status |
|---|---|---|
| Nüfus (population, ref. 31.12.2025) | TÜİK ADNKS 2025 (bülten 53899) | VERIFIED 7/7 |
| Yüzölçümü (area, km²) | Harita Genel Müdürlüğü (`il_ilce_alanlari.xlsx`) | VERIFIED 7/7 |
| İlçe sayısı (district count) | İçişleri Bakanlığı e-İçişleri envanteri | VERIFIED 7/7 |
| Rakım + koordinat (il merkezi) | MGM il-merkez meteoroloji istasyonu (kanonik ref.) | VERIFIED 7/7 |
| Köppen iklim | MGM 2023 Köppen raporu, s.11-15 (254-istasyon tablo) | **5 Csa + 1 Cfa + 1 Csb** (VERIFIED 7/7) |
| Komşu iller | Tier-2, full 81-il GeoJSON adjacency scan | **VERIFIED 7/7** (not spot-checks) |

## Seeded values

| Plaka | İl | Bölge | Nüfus (2025) | Alan km² | İlçe | Rakım m | Enlem | Boylam | Köppen |
|---|---|---|---|---|---|---|---|---|---|
| 03 | Afyonkarahisar | Ege | 751.808 | 14.016 | 18 | 1034 | 38,738 | 30,5604 | **Cfa** |
| 09 | Aydın | Ege | 1.172.107 | 8.116 | 17 | 56 | 37,8402 | 27,8379 | Csa |
| 20 | Denizli | Ege | 1.060.975 | 12.134 | 19 | 425 | 37,762 | 29,0921 | Csa |
| 43 | Kütahya | Ege | 570.478 | 11.634 | 13 | 969 | 39,4171 | 29,9891 | **Csb** |
| 45 | Manisa | Ege | 1.477.756 | 13.339 | 17 | 71 | 38,6153 | 27,4049 | Csa |
| 48 | Muğla | Ege | 1.099.547 | 12.654 | 13 | 646 | 37,2095 | 28,3668 | Csa |
| 64 | Uşak | Ege | 374.405 | 5.555 | 6 | 919 | 38,6712 | 29,404 | Csa |

Rakım/koordinat MGM istasyonları — **not all "Merkez"** (fact-check §A.4, the most sensitive
check; same category as the pilot's İstanbul→Yeşilköy and wave-2's Bursa→Osmangazi):
Afyonkarahisar→Merkez, **Aydın→"Merkez" (= Efeler)**, **Denizli→Pamukkale**, Kütahya→Merkez,
**Manisa→Yunusemre**, **Muğla→Menteşe**, Uşak→Merkez. Recorded as an inline comment on each
`elevationM` in `province.seed-data.ts`. Two nuances this wave:

- **Aydın "Merkez" is a confirmed ALIAS of Efeler**, not a data conflict — the MGM UI shows a
  "Merkez" default while the administrative district is "Efeler"; both records return the
  identical elevation/coordinate (56 m, 37,8402, 27,8379), re-verified by double navigation
  (fact-check §A.4.1). No footnote needed on the il page.
- **Manisa's separate legacy "Merkez" record has a different, unresolved longitude**
  (27,8049 vs. Yunusemre's 27,4049, ~35 km) and is NOT the page-load default — the seeded
  value uses the confirmed default **Yunusemre** (GLOSSARY §1). The origin of the legacy
  "Merkez" record stays `[TEYİT GEREK]` (low priority — does not affect the seeded value).

## Köppen — MIXED, THREE CLASSES this wave (the highest-risk check)

5/7 provinces resolve to **Csa**; **Afyonkarahisar resolves to Cfa** (like wave-2's
Kocaeli/Sakarya); **Kütahya resolves to Csb** — the platform's **THIRD Köppen class**. The
fact-check independently re-downloaded and re-parsed MGM's `koppen.pdf` and confirmed each row
on its own page (Afyonkarahisar s.11: "Cfa … her mevsim yağışlı"; Kütahya s.14: "Csb Kışı
ılık, yazı sıcak ve kurak iklim") — NOT copied from a neighbour (§A.5). The task's "don't
assume homogeneity" warning materialised: the real split was NOT the expected coast-vs-interior
axis (both coastal Aydın/Muğla and interior Manisa/Denizli/Uşak are Csa); the two outliers are
two neighbouring interior-highland provinces (Afyonkarahisar 1034 m → Cfa, Kütahya 969 m → Csb)
landing on DIFFERENT subtypes. The mandatory MGM caveat rule still applies to all 7: a bare
Köppen code must never ship. The 5 Csa provinces reuse the shared `MGM_KOPPEN_CAVEAT_TR`;
Afyonkarahisar carries the Cfa-variant (`MGM_KOPPEN_CAVEAT_CFA_TR`); Kütahya carries the new
Csb-variant (`MGM_KOPPEN_CAVEAT_CSB_TR`). No province-specific Thornthwaite/Erinç divergence is
appended for any of the 7 — the source deliberately did not research that alternative.

**Köppen⇒caveat invariant — 3rd code confirmed handled with zero change:** the seed-time
`assertKoppenCaveatInvariant` checks that each caveat names its own code as a substring. Codes
`Csa` / `Cfa` / `Csb` do not cross-substring-match, so the self-maintaining check accepts Csb
as soon as its caveat names "Csb" and fails a mismatched (e.g. Csa-flavoured) caveat on a Csb
row. Proven in `province.e2e-spec` (`assertKoppenCaveatInvariant` block: a Csb-names-Csb
positive + a Csa-caveat-on-Csb-row negative).

**Csb Turkish class label — `Akdeniz iklimi` (PROVISIONAL, surfaced for an owner ruling —
NOT invented).** Unlike Cfa (which mapped cleanly onto the distinct curriculum type
"Karadeniz iklimi" via its "her mevsim yağışlı" definition, RESOLVED at wave-2), Csb has **no
distinct TYT/AYT-curriculum name of its own**: it is a warm-summer SUBTYPE of the same
dry-summer Mediterranean family as Csa, and the source explicitly places it there
(batch2-wave3-ege §2: still in the "kurak yaz / Akdeniz-tipi" family, only "yaz sıcaklığı
Csa'ya göre bir kademe daha ılıman"). So rather than coin a new label, Csb's
`climate_class_tr` reuses the existing **`Akdeniz iklimi`**; the distinct Köppen code (`Csb`)
plus the "yazı sıcak ve kurak" caveat carry the warm-summer nuance. This mirrors the Cfa flow
(ship a defensible, source-grounded value + surface for a ruling). **Open for the owner:**
confirm `Akdeniz iklimi` for Csb, or rule a distinct sub-label — a one-constant change
(`CLIMATE_CLASS_CSB_TR`) either way.

## Slug decisions

All 7 slugs follow the GLOSSARY §5 ASCII-fold rule (`Aydın`→`aydin`, `Kütahya`→`kutahya`,
`Muğla`→`mugla`, `Uşak`→`usak`, `Afyonkarahisar`→`afyonkarahisar`, `Denizli`→`denizli`,
`Manisa`→`manisa`); `slug_tr` == `slug_en` (no distinct EN name). NOVA's 81-province collision
scan (recorded at wave-1) came back clean, so none of these fold onto an already-seeded slug.

## Neighbours — full 81-il GeoJSON adjacency scan (VERIFIED, two non-obvious results)

Unlike prior waves (which used GeoJSON only to break a conflict), the fact-check ran a full
81-province `shapely` adjacency scan for ALL 7 provinces (0.00 km min-distance = shared border)
and confirmed every drafted list exactly — no missing or extra neighbour. Two results worth
recording:

- **Denizli does NOT border Isparta.** One web source listed "Burdur ve Isparta" together, but
  Denizli↔Burdur measures 0.00 km (adjacent) while Denizli↔Isparta measures 0.15778° (~17.5 km
  gap) — Burdur intrudes between them. Isparta is **EXCLUDED** from Denizli's 6-neighbour list
  (Uşak, Afyonkarahisar, Burdur, Muğla, Aydın, Manisa). The likely source of the confusion is
  Afyonkarahisar, which genuinely borders both Burdur and Isparta (fact-check §A.6.1).
- **Manisa DOES border Denizli.** Looks separated on a coarse map (Aydın/Uşak appear to
  intervene), but Manisa↔Denizli measures 0.00 km — a narrow real border via Manisa's
  Sarıgöl / Denizli's Çivril-Buldan corner. Kept in Manisa's 6-neighbour list (fact-check
  §A.6.2; calibration ref Manisa↔Konya = 2.23° confirms the method).

Country/sea adjacencies are NOT provinces and are excluded from `neighbor_plate_codes`
(Aydın/Muğla→Ege/Akdeniz kıyısı). Afyonkarahisar and Kütahya are the most-connected in this
wave (7 land neighbours each); Uşak the least (4).

## Region classification (Bölüm 0 — VERIFIED)

All 7 are Ege (`GeographicRegion.Ege`). NOVA independently confirmed the classic 7-region Ege
list = 8 provinces (İzmir + these 7), and that — unlike Marmara — the İBBS/NUTS Level-1 TR3
region coincides exactly with the classic geographic region here (TR31 İzmir · TR32
Aydın-Denizli-Muğla · TR33 Manisa-Afyonkarahisar-Kütahya-Uşak), cross-checked against the GEKA
TR32 plan + MEB İBBS report (fact-check §A.7).

## Open / deferred items (surfaced, not blocking)

- **All PR-5a detail-page fields + `landform_note_tr` are `null` for all 7** — base-data wave
  by owner ruling (DEC 2026-07-10). Not invented to satisfy a column.
- **Csb Turkish-label register** — PROVISIONAL `Akdeniz iklimi`, surfaced for an owner ruling
  (see Köppen section). A one-constant change if overruled.
- **Manisa legacy "Merkez" MGM record origin** — `[TEYİT GEREK]`, low priority, does not affect
  the seeded value (Yunusemre is the confirmed default).
- **Afyonkarahisar's Cfa vs. Kütahya's Csb outlier** — whether it reflects a real micro-climate
  or an MGM station-location artefact was not separately researched (Thornthwaite/Erinç
  cross-check out of scope) — a possible future MEB-accuracy pass, same discipline as prior
  waves.
- **Centroid / bounding-box:** derived from boundary GeoJSON at build time, never hand-seeded —
  not stored on the entity.
</content>
</invoke>
