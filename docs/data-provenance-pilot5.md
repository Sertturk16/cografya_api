# Data provenance — Pilot 5 provinces (seed snapshot)

**Purpose.** A repo-local, read-only snapshot of the provenance for the data loaded
by `pnpm db:seed:geography` (`src/database/seeds/province.seed-data.ts`). The **live,
writable ledger** lives at the orchestrator root — `data-provenance.md` (outside this
repo, per the single-writer rule). This file is a frozen copy so the seed's traceability
travels with the code; if the two ever disagree, the root ledger wins.

- **Batch:** 1 — pilot 5 provinces (İstanbul, Ankara, İzmir, Van, Antalya).
- **Source of record:** NOVA's il-level data dictionary, status **SEED-READY
  (fact-checked 2026-07-08)**.
  - Dictionary: `Owner's Inbox/data-source-groundwork/il-data-dictionary.md` (§2.1)
  - Fact-check report (independent actor): `Owner's Inbox/data-source-groundwork/pilot-5-factcheck.md`
  - Root ledger: `data-provenance.md` — Batch 1
- **Scope guard:** only these 5 provinces are seeded. The remaining 76 are still DRAFT
  and are intentionally NOT seeded — their web pages correctly `notFound()` (404) until
  a future batch clears fact-check. No value here is invented; fields the dictionary
  leaves open are stored as `null` (see landform note below).

## Per-field Tier-1 authority + fact-check status

| Field | Authority (Tier-1) | Status |
|---|---|---|
| Nüfus (population, ref. 31.12.2025) | TÜİK ADNKS 2025 (bülten 53899) | VERIFIED 5/5 |
| Yüzölçümü (area, km²) | Harita Genel Müdürlüğü (`il_ilce_alanlari.xlsx`) | VERIFIED 5/5 |
| İlçe sayısı (district count) | İçişleri Bakanlığı e-İçişleri envanteri | VERIFIED 5/5 |
| Rakım + koordinat (il merkezi) | MGM il-merkez meteoroloji istasyonu (kanonik ref.) | CORRECTED/aligned 2026-07-08 |
| Köppen iklim | MGM 2023 Köppen raporu, s.11-15 (254-istasyon tablo) | 5/5 = **Csa** (CORRECTED/VERIFIED) |
| Komşu iller | Tier-2 statik coğrafi olgu, çok-kaynaklı | VERIFIED (Tier-2) |

## Seeded values

| Plaka | İl | Bölge | Nüfus (2025) | Alan km² | İlçe | Rakım m | Enlem | Boylam | Köppen |
|---|---|---|---|---|---|---|---|---|---|
| 34 | İstanbul | Marmara | 15.754.053 | 5.461 | 39 | 33 | 40,9819 | 28,8208 | Csa |
| 06 | Ankara | İç Anadolu | 5.910.320 | 25.632 | 25 | 891 | 39,9727 | 32,8637 | Csa |
| 35 | İzmir | Ege | 4.504.185 | 11.891 | 30 | 29 | 38,4049 | 27,1895 | Csa |
| 65 | Van | Doğu Anadolu | 1.112.013 | 20.921 | 13 | 1.675 | 38,4693 | 43,3460 | Csa |
| 07 | Antalya | Akdeniz | 2.777.677 | 20.177 | 19 | 47 | 36,8851 | 30,6828 | Csa |

Rakım/koordinat MGM istasyonları: İstanbul→Bakırköy/Yeşilköy, Ankara→Keçiören,
İzmir→Konak, Van→Edremit, Antalya→Muratpaşa.

## Mandatory Köppen caveat (stored in `climate_note_tr`)

All 5 provinces resolve to **Csa** under MGM's 2023 Köppen table. Per dictionary §2.1,
a bare "Csa" must NEVER ship alone: MGM's own report notes the simplified third-letter
rule classifies ~65% of Türkiye's 254 stations as "Cs", so its discriminating power is
limited in Central/Eastern Anatolia — Thornthwaite/Erinç/De Martonne/Aydeniz diverge
(Ankara → semi-arid steppe, Van → continental/lake-influenced). The seed stores this
caveat in `climate_note_tr` so the note always travels with the value.

## Open / deferred items (surfaced, not blocking)

- **`landform_note_tr` is `null` for all 5** — the dictionary marks yer şekli/jeoloji as
  only partially filled for the pilot (field #12); deferred to the production batch.
  Not invented to satisfy a column.
- **İstanbul area conflict (low priority, open):** HGM 5.461 km² is the published value;
  TÜİK's own bulletin implies ~5.353 km² via its density figure. İçişleri publishes no
  independent km² table, so there is no conflicting third number — HGM stands. The source
  of TÜİK's implicit ~5.353 remains unresolved (footnote candidate on the province page).
- **Neighbour codes:** dictionary lists neighbours by NAME; the seed converts them to the
  immutable İçişleri plaka codes (spelled out inline in `province.seed-data.ts`). Sea/
  border adjacencies (İstanbul→deniz, Van→İran) are not provinces and are excluded from
  `neighbor_plate_codes`.
- **Centroid / bounding-box:** derived from boundary GeoJSON at build time (dictionary
  field #9), never hand-seeded — not stored on the entity.
