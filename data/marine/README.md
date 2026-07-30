# `data/marine/` — the committed marine reference-point probe artifact

One file: **`marine-points-probe.json`** (~250 KB, 30 points).

It is written by `pnpm db:import:marine-points --phase=probe` and read by
`--phase=load`. Nothing else in the repo may write it, and no other phase touches the
network.

---

## Why this file exists at all

A marine reference point in the wrong place does not crash anything. It binds a province
to the wrong sea and publishes a plausible number, with every test green. That is the
exact failure class DEC 2026-07-19's MAPPING leg exists for, and it is why the point list
is not a hand-written seed array: **every coordinate in this file was checked against a
live provider response, and the evidence for that check is in the file.**

The `load` phase does not trust the recorded verdicts. It re-derives all of them from the
recorded provider evidence and refuses any disagreement — a claim inside a file cannot
validate the file.

---

## How this run was produced

**2026-07-30**, by a single `pnpm db:import:marine-points --phase=probe` invocation of the
committed code. Not a replay, not a hand-edit. If you regenerate it, say so here.

|                              |                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| Candidates                   | 30 (15 Black Sea, 6 Marmara, 5 Aegean, 4 Mediterranean) across **27** coastal provinces |
| CMEMS `GetFeatureInfo` calls | **84**, serial, ≥ 2.5 s apart, 20 s timeout                                             |
| Open-Meteo calls             | **2 total, for all 30 points** — one `forecast` (wind), one `marine` (wave + SST)       |
| Wall clock                   | ~4 minutes                                                                              |
| Assertions                   | 16 per Black-Sea/Aegean/Mediterranean point, 11 per Marmara point, plus 3 run-level     |
| Result                       | **every assertion passed**                                                              |

Both providers are anonymous: no API key, no account, no credential. Do not add one.

---

## The five fields are checked SEPARATELY

SPEC v1 asked for "one query per provider" per point. That is not enough — a single
"the provider answered" tick hides the case where four of five fields came back null.

| #   | Field                              | Source     | Rule                                                                             |
| --- | ---------------------------------- | ---------- | -------------------------------------------------------------------------------- |
| 1   | Sea surface temperature (`thetao`) | CMEMS      | non-null and 0–35 °C                                                             |
| 2   | Wave height (`VHM0`)               | CMEMS      | non-null, **or** the basin is Marmara → declared `not_supported` and NOT queried |
| 3   | Wave direction (`VMDR`)            | CMEMS      | must agree with ② — one present and one absent is a FAIL                         |
| 4   | Wind speed 10 m                    | Open-Meteo | non-null                                                                         |
| 5   | Wind direction 10 m                | Open-Meteo | non-null                                                                         |

Plus, per point: HTTP 200 + `application/json` on every recorded call, the dataset the
provider echoes must equal the one we asked for, and the grid-centre distance must be
within the product's ceiling.

---

## The three basin claims (the ones that actually catch a mis-placed point)

1. **Bounding box** — the SNAPPED grid centre (not our requested coordinate) must fall in
   the basin's hand-drawn box. A coarse net, and honest about it: the Black Sea and
   Marmara boxes overlap in a thin band of real Marmara water.
2. **Dataset echo** — the provider must return the dataset we queried.
3. **Marmara cross-check** — a genuine Marmara point must get `null` from the **Black Sea
   wave** product, whose bounding box contains the Marmara but whose land mask excludes it.
   **All six Marmara points returned `null`.** This is a provider-sourced falsification and
   is worth far more than our own box.
4. **Two-sea separation** — the two points of a two-sea province must be > 30 km apart.
   Measured: İstanbul 84.3 km, Çanakkale 147.0 km, Balıkesir 176.2 km.

---

## Two things this run found that the spec did not predict

### 1. Open-Meteo snaps to the nearest WET cell, so the 7.5 km ceiling was wrong

SPEC-ADDENDUM §4.5(b) set Open-Meteo's ceiling at 7.5 km using the CMEMS formula (half a
cell diagonal × 1.2). That formula assumes the provider returns the cell the request falls
in. CMEMS does; **Open-Meteo does not.**

Measured across all 30 candidates: its marine grid is exactly **1/12° (0.08333°)** with
centres on the `(k + 0.5)/12` lattice, and the returned cell is up to **two grid steps**
from the containing one (Kastamonu +2 lat, Ordu +2 lat, Yalova −1 lat / −1 lon). Ten of
thirty candidates exceeded 7.5 km — including points whose CMEMS snap was 0.00 km with a
perfectly good temperature, i.e. points unambiguously at sea.

The ceiling was therefore measuring a quantity Open-Meteo does not produce. It is now
**20 km** ≈ half a cell diagonal (~5.8 km) + a two-cell wet-search allowance. Observed
maximum in this run: **14.51 km**. Recorded as a deviation from a locked acceptance number
and reported to Atlas.

This also corrects the served contract: `MarineValueDto.distanceKm` means an **in-cell
offset** for `cmems` and a **nearest-wet-cell search distance** for `open-meteo`. Those are
different quantities and the OpenAPI description now says so.

### 2. The first Yalova candidate was on land — which is the probe working

`40.58 / 29.10` sits on the Armutlu peninsula; the 500 m Marmara model answered `null`.
Moved to `40.72 / 29.15`, ~7 km north of the Yalova shore and west of the İzmit Gulf mouth
(~29.4 E), so the narrow-gulf rule still holds. This is exactly the failure the two-phase
design exists to catch before a row reaches the database.

---

## Known limits of this artifact, stated rather than discovered later

- **No `time` parameter is sent.** The probe uses the provider's default step, recorded as
  `cmems.timeParam: null`. What the probe asks is "is this coordinate on a WET cell of the
  right dataset", and a land mask does not move with time. **The RUNTIME rule is the
  opposite and stays binding** (SPEC-ADDENDUM §7.1): every runtime CMEMS call must send an
  explicit `time`, because a value whose instant we do not know must never be published as
  "now".
- **Five points snapped to exactly 0.00 km** because their coordinates happen to land on
  grid centres (they are multiples of the 0.025° / 0.00625° grid step). Real, but those
  five carry less discriminating power for the distance assertion than the others.
- **CMEMS dataset ids are pinned here**, not resolved from the catalogue. There is no
  predictable naming pattern — the same quantity is `phy-temp` in the Black Sea and
  `phy-tem` in the Marmara, the step token is `PT1H-m` vs `PT1H-i`, and three version
  stamps (`_202311`, `_202411`, `_202511`) are in service at once. A retired id answers
  HTTP 400 with an XML body. AÇIK-4 proposes resolving them from STAC at runtime; that is
  an M3/M4 review decision. Pinning them in the artifact is correct regardless — an
  artifact must record the dataset it actually queried.
- **Size is ~250 KB, not the 35–60 KB the addendum estimated.** The estimate predated the
  hardened criteria it then mandated: each of the 84 CMEMS calls carries its full request
  URL, response sha256 and echoed dataset, and each point carries its support matrix and
  11–16 assertion verdicts. That is the reviewable evidence, so it stays. For scale, the
  climate artifacts are ~930 KB.

---

## Re-running it

```bash
pnpm db:import:marine-points --phase=probe   # network, by hand, ~4 min, writes this file
pnpm db:import:marine-points --phase=load    # offline, idempotent, upserts marine_points
```

The artifact is written **even when assertions fail**, on purpose — a failed run's evidence
is what you need in order to move a coordinate. The process still exits non-zero and
`--phase=load` refuses the artifact independently, so a failing artifact cannot reach the
database by accident.
