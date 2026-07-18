# `data/climate` — MGM climate normals, committed artifacts

Produced by `pnpm db:import:climate --phase=fetch`, consumed by `--phase=load`. **Do not hand-edit
any file here.** Every value is cross-checked on load against the raw source strings in the
manifest, so a manual edit does not quietly take effect — it fails the import.

| File | What it is |
|---|---|
| `climate-normals.json` | The series we publish. The ONLY input to the load phase's writes. |
| `climate-manifest.json` | Provenance: per-page URL, UTC fetch stamp, HTTP status, sha256 of the full response, the parsed period, the **raw cell strings**, and the `anomalies` list. |
| `fragments/` | The `<table>` fragments of each page — the human-readable audit trail. |

The full HTML (~28 MB across 81 pages) is deliberately **not** committed; the fragments plus a
sha256 per page are the audit trail, at ~1.5 MB instead.

## The run behind these files

- **Fetched 2026-07-18**, all 81 provinces, serially, ≥5 s apart, identifying User-Agent.
- **Measurement periods differ per province** — 28 distinct start years (1927–2011), all ending
  2025. There is no single period that describes Turkey; read it per province.
- All 81 pages had exactly two `<table>` elements, all eight metric rows, comma decimals, and no
  blank monthly cells.

> **Re-running costs ~70 minutes.** MGM throttles sustained access down to ~50 s/page. A run that
> looks hung after ten minutes is being throttled, not stuck. Re-run yearly, by hand, once.

## Known source defects

These are MGM's, not ours. They are recorded rather than hidden — see the canonical
`data-provenance.md` in the orchestrator home for the full entry.

**Osmaniye — `En Yüksek Kar` = `-1 cm` (dated 15.02.2004).** A negative snow depth is physically
impossible. Unique across all 81 provinces, unexplained in MGM's documentation, and unsupported by
any independent source. **We do not publish it:** the field is nulled, the rest of Osmaniye's
series is kept, and the refusal is recorded in the manifest's `anomalies`.

**Muğla — `En Yüksek Kar` absent.** MGM prints date `..` and a bare ` cm`, its own "no such
record" spelling. Muğla's series starts in 2001 and its station is coastal Mediterranean, so no
measurable snow in 24 years is consistent. Not a defect; the field is simply `null`.

## The anomaly threshold

An impossible value is nulled, recorded and printed — it does not abort the run, because one bad
MGM cell must not block 81 provinces. But more than `MAX_ANOMALIES` (5) of them **does** abort,
before anything is written: that many means the source has broken rather than that one cell is
wrong. If a future run trips it, investigate MGM — **do not raise the number.**
