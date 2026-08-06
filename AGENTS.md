# Codex Adapter — `cografya_api`

Before task actions, read `ENGINEERING.md` completely. It is the provider-neutral,
binding backend handbook.

For shared process and product state, start from the assigned task context manifest. It
routes you to:

- the orchestration-root `ATLAS-OPERATIONS.md`
- the orchestration-root `CONVENTIONS.md`
- the orchestration-root `CONTENT-STYLE.md` for any reader-facing seeded narrative
- the exact `TASKS.md` entry when task state matters
- the root policy sections named by the manifest

The manifest is a starting point, not a ceiling. Read `CONVENTIONS.md` and `CONTENT-STYLE.md` as far as the task needs; economise on
history ledgers by grepping the heading. **Reading more is not the failure mode; missing a
binding rule is** (→ DEC 2026-08-06w). Any seeded narrative a reader sees obliges
`CONTENT-STYLE.md`, cited or not.

Codex-specific execution uses the `cografya_backend_dev` profile from
the orchestration root's `.codex/agents/`. Deniz is the single writer. Never edit the sibling `cografya_web` repo; coordinate
OpenAPI contract changes through Atlas.

CI is the only test-suite gate. Use only the local checks allowed by `ENGINEERING.md`.
Do not merge or run the PR-review fan-out; Atlas invokes `$review-pr`.

Prefer launching Codex from `/Users/omercan/Desktop/cografya`. A nested-only launch
loads this adapter but must not assume the parent's project agents/config are discovered;
explicitly add/read the parent before shared-state work, and do not dispatch team roles
until the outer-root configuration is active.
