# `data/acag-pm25/` — committed evidence of the long-term PM2.5 (ACAG SatPM2.5) import

These two files are the reviewable output of one hand-run
`pnpm db:import:acag --phase=fetch`. They are **evidence and offline input**, never runtime
data: the server never reads them, and CI never regenerates them.

| File | What it is |
|---|---|
| `acag-manifest.json` | Provenance: the pinned dataset version, every annual file's S3 key + size + **SHA-256** + its own `TIMECOVERAGE` attribute, the decode timings, the decoder identity read from the installed package, the hyperslab window and the axis facts derived from it, the series artifact's SHA-256, and the structural assertion results from the run. |
| `acag-province-pm25.json` | 81 provinces × 27 years = 2 187 published values, plus each province's grid cell: the requested province-centre coordinate, the full-array indices, the cell centre and the distance between the two. |

## What the numbers are — and are not

Annual mean PM2.5 (µg/m³) from **ACAG SatPM2.5 V6.GL.03** (satellite AOD + GEOS-Chem + ground
calibration), read from the **~1 km cell containing the province centre** — the point
`GLOSSARY.md` §1 defines, i.e. MGM's default provincial-centre station coordinate. It is
**not a provincial average**: the owner ruled the centre cell explicitly (DEC 2026-08-19d md.1),
and `province averaging` was offered and declined. The provider's own caveat — the 1 km grid does
not fully resolve gradients at 1 km — ships with every published figure
(`src/province/acag-attribution.constant.ts`).

This is a different product from the live air-quality leg (`src/air-quality/`, CAMS hourly
index). Annual concentration vs hourly index: different claims, different provenance, different
attribution. Neither may be rendered as the other.

## Which file the values come from, and why it is the GLOBAL one

**No ACAG regional tile covers Türkiye.** Measured 2026-08-19 from the files themselves: the EU
tile spans −14.995…39.995°E, the AF tile stops at 38.005°N, and the AS tile starts at 65.005°E.
Twelve provinces — Ağrı, Ardahan, Artvin, Bayburt, Bingöl, Bitlis, Erzurum, Iğdır, Kars, Muş,
Rize, Van — fall in a gap **no tile covers**, so an EU+AF stitch cannot reach 81/81. Only
`V6GL03/FineResolution/GL/Annual/` does.

That file is `PM25[13000, 36000]` = 468 million cells, which is why this line reads a
**hyperslab** (the Türkiye window) with `h5wasm` instead of materialising the array with `jsfive`
the way the ERA5 line does. See `src/database/acag/acag-hdf5.adapter.ts`.

## Where the raw files are

**Not here, and never will be.** Each annual global file is ~450 MB (27 of them ≈ 12.2 GB of
transfer). The fetch CLI requires an explicit absolute `--raw-dir` outside the repo and deletes
each file right after extracting its window, so peak disk is one file; `.gitignore` carries a
`*.nc` belt for the operator who points `--raw-dir` here anyway. The manifest identifies every
one of those files forever by SHA-256 and size, so a copy can always be proven to be *the* copy.

## Update cadence

**Annual, hand-run, no scheduler.** ACAG publishes roughly one new year at a time, irregularly.
There is no cron, no polling and no warmup tour on this line: when a new year appears, an
operator re-runs `--phase=fetch` and then `--phase=load`. `datasetVersion` and the latest year
are published in the payload so staleness is visible without opening this directory.

**All years in a series come from ONE version.** The provider recalibrates the entire time
series per version ("for the entire time series", its own page), so mixing versions would
fabricate a trend. Assertion `A-06` refuses it.
