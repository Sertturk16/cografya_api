# CAMS golden fixture

Real bytes from the CAMS European Air Quality Forecasts dataset (Copernicus ADS), committed
as the regression anchor for the ZIP + NetCDF3 decode path (`src/air-quality/cams/`).

**Why this exists.** Every negative-path fixture in the unit suite is built programmatically
(`netcdf3-fixture.builder.ts`) because the measured production file carries ZERO missing
values — the `_FillValue`/`not_supported` paths cannot be cut out of provider bytes. A
builder-only suite would let the builder and the reader agree on a shared wrong model, so the
happy path is anchored on this REAL file, with the expected values produced by INDEPENDENT
readers (`reference.json`) and asserted bit-exactly in `cams-golden.spec.ts`.

## Provenance

| Item | Value |
| --- | --- |
| Dataset | `cams-europe-air-quality-forecasts`, `ensemble` product |
| Job shape | 1 variable (`particulate_matter_2.5um`) × 1 step (`leadtime_hour: 0`), TR `area` `[42.5, 25.5, 35.5, 45.0]` |
| Model run | **2026-08-01 00:00 UTC** (`time:long_name = "FORECAST time from 20260801"`) |
| Downloaded | 2026-08-01, by the hand-run probe (`pnpm db:import:air-quality --phase=probe`) |
| Container | ZIP, single entry `ENS_FORECAST.nc`, method 0 (STORED) — 57 028 B |
| Inner format | NetCDF3 classic (`CDF\x01`), grid 195 × 70, cell-centred, lat axis DESCENDING |
| Licence | **CC-BY-4.0** — *Contains modified Copernicus Atmosphere Monitoring Service Information 2026.* Neither the European Commission nor ECMWF is responsible for any use that may be made of the Copernicus information or data it contains. |

## Cross-validation (`reference.json`)

Three independent implementations read the same bytes on 2026-08-01:

1. **`netcdf3-ts@1`** — the TypeScript reader under test (via the probe run: the production
   job's step-0 PM2.5 values, same model run and subset);
2. an **independent Python stdlib `struct` reader** (session scratch, no shared code);
3. **`ncdump`** (netCDF C library, Homebrew) at `-p 9` (9 significant digits — full float32
   round-trip precision).

Result: ncdump ↔ Python **13 650/13 650** grid values bit-exact after float32 round-trip;
Python ↔ netcdf3-ts **81/81** province cells bit-exact. `reference.json` was emitted by the
PYTHON reader (never by the code under test) and carries this record in its
`crossValidation` block.

## Regenerating

Only needed if the fixture is deliberately refreshed. ADS job results expire after ~1.5–2
days, so a refresh is a NEW probe run, not a re-download:

```bash
# needs ADS_API_KEY in the environment (script-local read; never in env.schema.ts)
pnpm db:import:air-quality --phase=probe
```

The probe rewrites `mini-tr-pm25-1step.zip` here and the evidence artifact under
`data/air-quality/`. Then regenerate `reference.json` with independent readers (the
procedure above), update the provenance table's run date, and expect the golden spec's
values to change — that is the point of the anchor.
