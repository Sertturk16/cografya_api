# ECMWF golden corpus

Real bytes from ECMWF Open Data, plus the ecCodes reading of them, committed as the regression
reference for the GRIB decoding path (`src/marine/ecmwf/`).

**Why this exists.** DEC 2026-07-31d picked `@mattnucc/gribberish` as a *controlled first
implementation* of the GRIB2 decode, not a permanent commitment, and attached five binding
conditions. Condition 2 is this directory: a golden corpus built from real ECMWF messages, with
**ecCodes output kept as the reference fixture**. Condition 5 makes a difference between the two
one of the three triggers for migrating to ecCodes — which is only detectable because the numbers
in `eccodes-reference.json` were produced by a different implementation than the one under test.

## Provenance

| Item | Value |
| --- | --- |
| Cycle | **2026-07-30 12z** (`ifs/0p25`) |
| Step | **72 h** — a mid-range step, more representative than step 0 |
| Host | `https://data.ecmwf.int/forecasts` (primary path; no redirects, HTTP 206 on `Range`) |
| Licence | CC BY 4.0 — `Veri kaynağı: ECMWF Open Data, © ECMWF, CC BY 4.0` |
| Downloaded | 2026-07-30 (the same cycle the SPEC measurements ran against) |
| Reference decoder | ecCodes **2.48.0** (Homebrew) |

Each `.grib2` file here **is** the body of one HTTP `Range` response — the exact bytes at the
offset and length the matching `.index` file gives, not a re-cut or re-encoded copy. That is
asserted in `grib-decoder.adapter.spec.ts`: the file length must equal the requested range.

| File | Bytes | Contents |
| --- | ---: | --- |
| `20260730-12z-oper-10u-step72.grib2` | 749 722 | one message: `10u`, CCSDS, 12-bit, **no bitmap** |
| `20260730-12z-wave-swh-mwd-step72.grib2` | 1 822 138 | two adjacent messages: `swh` + `mwd`, CCSDS, 16-bit, **bitmap present** |
| `20260730-12z-oper-step72.index` | 40 204 | the real `oper` index, 184 JSON-lines records |
| `20260730-12z-wave-step72.index` | 2 660 | the real `wave` index, 13 JSON-lines records |
| `eccodes-reference.json` | ~9 KB | ecCodes' reading of every header field and of 30 × 3 point values |

**On the size (2.45 MiB).** SPEC risk R8 aimed at ~1 MB. That target was written before the
measurement found that the wave fields carry a **bitmap** and the wind fields do not — so a
one-message corpus covers only one of the two packing shapes, and the uncovered one is precisely
where a wrong decoder fills the land mask with plausible sea. There is no smaller message in this
product: every field is the same 1440 × 721 global grid. `10v` was deliberately left out, because
the u/v mix-up a second wind fixture would guard against is caught more strongly — and in
production rather than only in a test — by the GRIB parameter-identification check in
`grib-decoder.adapter.ts`.

## Regenerating

Only needed if the corpus is deliberately refreshed (a new cycle, a new parameter). ECMWF keeps
roughly 12–13 cycles, so the URLs below stop working after ~2 days; pick a current cycle and
update the provenance table.

```bash
BASE=https://data.ecmwf.int/forecasts/20260730/12z/ifs/0p25
STEP=20260730120000-72h

# 1. the sidecar indexes (JSON-LINES despite the application/json content type)
curl -s "$BASE/oper/$STEP-oper-fc.index" -o 20260730-12z-oper-step72.index
curl -s "$BASE/wave/$STEP-wave-fc.index" -o 20260730-12z-wave-step72.index

# 2. the byte ranges those indexes point at (_offset / _length of the wanted params)
curl -s -H 'Range: bytes=10186000-10935721' \
  "$BASE/oper/$STEP-oper-fc.grib2" -o 20260730-12z-oper-10u-step72.grib2
curl -s -H 'Range: bytes=5886914-7709051' \
  "$BASE/wave/$STEP-wave-fc.grib2" -o 20260730-12z-wave-swh-mwd-step72.grib2

# 3. the ecCodes reference — headers…
grib_ls -j -p shortName,discipline,parameterCategory,parameterNumber,packingType,\
dataRepresentationTemplateNumber,editionNumber,bitsPerValue,Ni,Nj,numberOfValues,\
numberOfMissing,bitmapPresent,scanningMode,latitudeOfFirstGridPointInDegrees,\
longitudeOfFirstGridPointInDegrees,latitudeOfLastGridPointInDegrees,\
longitudeOfLastGridPointInDegrees,iDirectionIncrementInDegrees,jDirectionIncrementInDegrees,\
dataDate,dataTime,stepUnits,step,gridDefinitionTemplateNumber,productDefinitionTemplateNumber \
  20260730-12z-oper-10u-step72.grib2 20260730-12z-wave-swh-mwd-step72.grib2

# 4. …and one point value, at FULL precision (the default 6 significant figures is not enough
#    for the exact-equality assertion the golden test makes)
grib_ls -l 38.72,26.60,1 -F '%.17g' -p shortName 20260730-12z-wave-swh-mwd-step72.grib2
```

`eccodes-reference.json` is assembled from steps 3 and 4 across all 30 reference points (the
coordinates in `src/database/marine/marine-candidates.ts`). `grib_ls -l lat,lon,1` also prints the
grid index and cell centre it chose; those are recorded per point and are what
`mapPointToGrid` is checked against, so the two implementations have to agree about the PLACE
before they are asked to agree about the value.

Note the `-F '%.17g'`: without it ecCodes prints 6 significant figures and the golden test's exact
equality would have to be loosened to a tolerance — which is exactly the kind of loosening that
lets a real decoding difference through.
