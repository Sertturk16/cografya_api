# `data/elevation/` — the committed terrain probe artifact

One file, written by `pnpm db:import:terrain --phase=probe`, read by **nothing at runtime**.

| File                       | Written by                                        | Read by                                                                        |
| -------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| `terrain-tiles-probe.json` | `pnpm db:import:terrain --phase=probe` (hand-run) | humans, `probe-terrain-tiles.spec.ts`, and the PR that configures the endpoint |

(No size column. It said "~15 KB" against a file that was 9.6 KB when written and is 10.8 KB
now, and it would rot on every re-run: a measurable fact is produced by a check or it is not
stated — review #122, CODE122-M8.)

## What it is for

The elevation profile endpoint is configured with numbers that are not free choices: a request
deadline, a per-call timeout, a per-request tile ceiling, a provider budget, and the tripwire's
allow-list of terrain source families. Every one of those was a **guess** in the plan
(`Owner's Inbox/cbs-p2/plan-api.md` §13 records them as `[ÖLÇÜLMEDİ]`), because hosting is
undecided and nobody had measured the provider from this codebase.

This artifact is what replaces the guesses with measurements a reviewer can check. It is
evidence, never a runtime input — nothing loads it, and no code path degrades if it is stale.

## The run gates itself, and the exit code is the answer

Every property below is also a PASS/FAIL gate evaluated by `evaluateProbeAssertions`, printed
by the CLI and recorded in `assertions[]`. A failing gate sets a non-zero exit code and the
artifact must not be committed as evidence. Read the exit code, never the printed counts — the
rule `ENGINEERING.md` §8 sets for the content-fidelity lanes, for the same reason.

Before the #122 review none of this existed: a run where every tile answered 403 printed
`tiles 200: 0`, wrote an artifact full of nulls, and exited 0.

## The four things a reader should look at first

1. **`attribution.matchesPin`.** `provenance/datasets.md` pinned the SHA-256 of Tilezen's
   `docs/attribution.md` on 2026-08-19. `false` means the upstream licence text has moved and
   the two notices the endpoint publishes may no longer be the ones we owe. That is an
   escalation, not a number to re-tune.
2. **`samplingZoomSourceTokens`.** The tripwire's allow-list candidate — the terrain source
   families seen at the sampling zoom, and ONLY at that zoom. `etopo1` must never appear here:
   its absence above z10 is what keeps NOAA's "Not to be used for navigation" limit from
   arising at all, and removes one line from the attribution set (SPEC §8.2).
   **Read `imagerySourceTokensByZoom` beside it** — the run deliberately touches z8…z13, so the
   whole-run `imagerySourceTokens` list DOES contain `etopo1` and is context, not a source of
   configuration. An allow-list built from the flat list would whitelist the one family the
   licence argument depends on being absent.
3. **`bathymetryByZoom`.** The re-measurement of SPEC §8.2's threshold: depth present at
   z <= 10, a flat 0 m at z >= 11. If a future run shows depth at the sampling zoom, the
   profile is publishing sea depth and both the NOAA limit and the ETOPO1 attribution line
   apply again.
4. **`points[].differenceM`.** The decoder's positive control. It compares this repo's decoder
   against the _independent_ Python decoder SPEC §7.3 used, at three points measured on
   2026-08-19. `decodedNearestM` is the like-for-like value; `decodedM` is what the endpoint
   would publish (bilinear), and the two legitimately differ on steep ground.

## What it deliberately does NOT establish

- **Production latency.** The timings are from whichever machine ran the probe. They bound the
  arithmetic (a tile is hundreds of milliseconds, not tens), and they are not a production SLO.
  They measure **transfer time only**: the 400 ms politeness gap sits outside the measurement.
  It did not always — the first committed artifact folded the sleep into every reading and
  published a median of 640 ms where the transfer took 219 ms, which is the number PR-E2's
  request deadline would have been sized from (review #122, CODE122-I2).
- **A full-coverage source census.** It samples a handful of tiles. The tripwire's allow-list
  must therefore be the set of families the two published attribution lines actually cover, with
  this artifact as evidence for the sampling zoom rather than as the whole census.
- **Anything about the byte size of a SEA tile being representative.** Sea tiles at the sampling
  zoom are a flat 0 m and compress to under a kilobyte; land tiles measure two orders of
  magnitude larger. `samplingZoomByteStats.meanBytes` therefore sits far below the ~121 kB a
  land line averages, because several sampled points are offshore. **A per-request byte estimate
  uses `maxBytes` or the land figure, never the mean.** The scoping in that field is by ZOOM; the
  skew is by TERRAIN, and the two are independent.

## Politeness

The probe is serial, spaced 400 ms, timed out at 30 s per request, byte-capped, and identifies
itself with the shared bot user agent. One full run is about fifteen requests. It touches no
database, reads no secret, and is never run by CI or a deploy (`ENGINEERING.md` §5).
