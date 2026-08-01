# `data/era5-land/` — committed evidence of the ERA5-Land climate migration

These two files are the reviewable output of one hand-run
`pnpm db:import:era5 --phase=fetch`. They are **evidence and offline input**, never runtime
data: the server never reads them, and CI never regenerates them.

| File | What it is |
|---|---|
| `era5-manifest.json` | Provenance: the exact CDS request, job ids and queue stamps, the raw file's SHA-256 + size + provider MD5, the decoded axes, the decoder identity, the land/sea mask census, and **every province's grid-cell assignment** — including the A-1 fallback flag, the cell used and the distance in kilometres. Plus the structural assertion results from the run. |
| `era5-province-series.json` | 81 provinces × 360 months × 2 variables = 58 320 values, **converted but not averaged**: monthly mean °C and monthly total mm, unrounded. PR-2's 30-year normal is computed from this file, so the published number is auditable without touching Copernicus. |

## Where the raw file is

It is **not here, and never will be.** The production download is
`era5-land-1991-2020.nc`, **19 801 767 bytes** of NetCDF4/HDF5. The fetch CLI requires an
explicit absolute `--raw-dir` outside the repo, and `.gitignore` carries a belt for the case
where someone points it here anyway. The manifest identifies that exact file forever by
SHA-256, size and the provider's own MD5, so a copy can always be proven to be *the* copy.

## How to regenerate

```
pnpm db:import:era5 --phase=fetch --raw-dir=/absolute/path/outside/the/repo
```

The key is read from `process.env.CDS_API_KEY`, script-locally, for that one command. It is
deliberately **not** in the app's env schema: a migration run by hand once a decade must not
be a precondition for the server to boot.

Already have the raw file? Skip the network entirely:

```
pnpm db:import:era5 --phase=fetch --raw-dir=/tmp/era5 --from-file=/absolute/path/era5-land-1991-2020.nc
```

Both artifacts are deterministic — canonical key order, fixed indentation — so a re-run over
the same raw file produces byte-identical files and `git diff` is a real verification.

## Source, licence and required attribution

- **Dataset:** `reanalysis-era5-land-monthly-means` (Copernicus Climate Change Service / C3S),
  DOI `10.24381/cds.68d2bb30`, ~0.1° reanalysis grid, WMO normal window 1991–2020.
- **Licence:** CC-BY-4.0, accepted on the account.
- **Required attribution (verbatim, must travel with any published figure):**
  > Generated using Copernicus Climate Change Service information 2026. Neither the European
  > Commission nor ECMWF is responsible for any use that may be made of the Copernicus
  > information or data it contains.

## How a province's number is read (A-1)

Each province's value comes from the grid cell at its **administrative-centre coordinate**.
ERA5-Land is defined on land only, and 24.4 % of the Turkish bounding box is sea; five coastal
provinces' administrative points land in it. For those five — and only those five — the value
comes from the **nearest land cell**, and the shift is declared: the flag, the cell and the
distance in kilometres are all in the manifest, and they carry through to `data-provenance.md`
and the page. The list is closed and compared on every run; a sixth province appearing stops
the run rather than being absorbed. So does any shift over 25 km.

This is not a silent neighbour drift, which remains forbidden. The difference is that every
part of it is written down.
