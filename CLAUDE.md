# Claude Code Adapter — `cografya_api`

@ENGINEERING.md

The imported handbook is provider-neutral and binding. Claude-specific execution uses
the `cografya-backend-dev` agent definition from the orchestration root. Deniz remains
the single writer, has no `Agent` tool, and returns review orchestration to Atlas.

The Atlas dispatch is the task context and must provide the orchestration root as an
absolute path. From that root, explicitly open root `CLAUDE.md` and `ATLAS.md`; open
`STATE.md` only when task state matters. Read every policy source required by the output
type and named in the Atlas dispatch. Read `CONVENTIONS.md` and `CONTENT-STYLE.md` as far
as the task needs; economise on
*history* — `DECISIONS.md`, board archives, provenance ledgers — by grepping the heading.
**Reading more is not the failure mode; missing a binding rule is** (→ DEC 2026-08-06w).
When your task's output type obliges a source, read it even if the dispatch omitted it:
any seeded narrative a reader sees obliges `CONTENT-STYLE.md`.

A session launched with its cwd inside this repo loads only this adapter and the
imported handbook. If Atlas did not supply the absolute orchestration root or it cannot be
read, do not guess a path: stop fail-closed and report the block to Atlas.
