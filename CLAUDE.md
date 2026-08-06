# Claude Code Adapter — `cografya_api`

@ENGINEERING.md

The imported handbook is provider-neutral and binding. Claude-specific execution uses
the `cografya-backend-dev` agent definition from the orchestration root. Deniz remains
the single writer, has no `Agent` tool, and returns review orchestration to Atlas.

For shared process and product state, start from the assigned task context manifest.
Read `CONVENTIONS.md` and `CONTENT-STYLE.md` as far as the task needs; economise on
*history* — `DECISIONS.md`, board archives, provenance ledgers — by grepping the heading.
**Reading more is not the failure mode; missing a binding rule is** (→ DEC 2026-08-06w).
When your task's output type obliges a source, read it whether or not the manifest cited
it: any seeded narrative a reader sees obliges `CONTENT-STYLE.md`.

A session launched with its cwd inside this repo loads only this adapter and the
imported handbook — explicitly add the parent root before shared-state work.
