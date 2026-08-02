# `test/fixtures/era5/` — the golden fixture and its independent reference

| File | What it is |
|---|---|
| `mini-tr-t2m-1991-01.nc` | **Real CDS output**, committed verbatim: one job asking for `2m_temperature`, January 1991, over the same Turkish bounding box production uses. 47 953 B, NetCDF4/HDF5, chunked `(1, 71, 196)` with SHUFFLE → DEFLATE level 1. |
| `reference.json` | The expected values, produced by readers that are **independent of `jsfive`** (see below). |

## Why a real file, and not one we generate

Our decoder path is `jsfive`, a pure-JavaScript re-implementation of the HDF5 library. If the
fixture were built by a writer we also wrote, the writer and the reader could share the same
wrong model of the format and the test would pass while both were wrong. So the golden bytes
come from the provider, unmodified.

The synthetic files in `src/database/era5/era5-fixture.builder.ts` serve the opposite purpose:
they exist to break the format **on purpose** (a `scale_factor` that appeared, a transposed
dimension order) in ways a real download never will. Neither replaces the other.

## How `reference.json` was produced

Two independent C implementations, cross-validated:

- **`ncdump`** — the netCDF C reference implementation (Unidata), netCDF **4.10.1**. Values read
  at full float32 decimal precision (`-p 9,17`) and parsed back through `numpy.float32`, so the
  decimal round-trip is exact.
- **`h5dump`** — the HDF5 C reference implementation (The HDF Group), **2.2.0**. Raw
  little-endian binary output (`-b LE`), read as `<f4`.

All **13 916** values were compared element by element: **10 524 finite + 3 392 masked, bit-for-bit
identical** across both readers, with both agreeing on exactly which cells are masked. Only then
was the reference written.

The province cell selection inside the reference — the index arithmetic, the read-back tolerance
and the A-1 nearest-land-cell fallback — was **re-implemented from scratch in Python**, so the
reference does not inherit our TypeScript arithmetic either. It independently derived the same
five fallback provinces (`07, 33, 52, 57, 61`) and the same cells and distances the pre-build
probe measured.

The generator script lives outside the repo (it depends on `ncdump`/`h5dump`/`numpy` being
installed and is run by hand when the fixture is replaced); its full method is described above and
recorded in the reference's own `producedBy` block.

## Why the golden test uses EXACT float equality

It pins **decoder correctness** — that our byte arithmetic lands on the same float three
independent implementations produced — not any geographic fact. A tolerance is exactly what would
let a real decoding offset (one row, one cell, one byte) slip through. What the temperature
actually was in January 1991 is recorded evidence in `data/era5-land/`, and is asserted nowhere.

## `jsfive` — licence and dependency audit

Read verbatim from the **installed** package (`node_modules/jsfive`), not from registry metadata:

- **Version 0.4.0**, pinned exactly in `package.json` and locked by integrity hash in
  `pnpm-lock.yaml` (CI runs `pnpm install --frozen-lockfile`, so the pin is actually enforced).
- **Repository:** https://github.com/usnistgov/jsfive — the **US National Institute of Standards
  and Technology**. Author: Brian B. Maranville.
- **`package.json` licence field:** `"SEE LICENSE IN LICENSE.txt"`. The shipped `LICENSE.txt`, in
  full:

  > jsfive is in the public domain.
  >
  > It is based in large part on the pyfive library
  > https://github.com/jjhelmus/pyfive
  > Copyright (c) 2016 Jonathan J. Helmus
  > All rights reserved.

  So: public domain, carrying the upstream **pyfive** copyright notice. We reproduce that notice
  here and in the PR body. (Upstream pyfive is distributed under a BSD 3-clause licence; jsfive's
  own file does not restate the BSD clauses, only the copyright line, which we preserve.)
- **Transitive dependency:** `pako` **2.2.0** (`MIT AND Zlib`) for DEFLATE, also locked by
  integrity hash.
- **No install scripts, no native bindings, no postinstall.** Ships CJS + ESM + browser bundles.
- **No TypeScript definitions** (`main`/`module`/`exports` present, `types` absent) — hence the
  narrow hand-written ambient declaration at `src/database/era5/hdf5/jsfive.d.ts`.
- **`devDependencies` only.** No `src/` runtime code imports it; the Nest application never loads
  it. It is reachable only from the hand-run import CLI.

### Known limitation, found by our own fail-closed adapter

`jsfive@0.4.0` reads HDF5 attributes only from **compact** storage (attribute messages in the
object header). When a dataset carries enough attributes for HDF5 to switch to **dense** storage
(an Attribute Info Message plus a fractal heap — the library's own source carries a `TODO` for
this case), `jsfive` returns an **empty attribute bag with no error**.

That is what happens here: `ncdump` shows `t2m` carrying 33 attributes and `valid_time` carrying
4 plus its dimension-scale attributes, while `jsfive` reports `{}` for both. Datasets under the
threshold (`number`, and the root group) are read correctly.

The **data** layer is unaffected and was verified against the pre-build probe measurements
value-for-value. The consequence for the attribute-based contract checks is recorded in the PR and
in `Owner's Inbox/iklim-era5-spec/pr1-closing-summary.md`.
