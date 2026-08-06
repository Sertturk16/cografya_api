# Codex Adapter — `cografya_api`

Before task actions, read `ENGINEERING.md` completely. It is the provider-neutral,
binding backend handbook.

For shared process and product state, use the assigned task context manifest and read
only its exact headings from:

- the orchestration-root `ATLAS-OPERATIONS.md`
- the orchestration-root `CONVENTIONS.md`
- the exact `TASKS.md` entry when task state matters
- the root policy sections named by the manifest

Never load full `CONVENTIONS.md`, `TASKS.md`, or history ledgers by default.

Codex-specific execution uses the `cografya_backend_dev` profile from
the orchestration root's `.codex/agents/`. Deniz is the single writer. Never edit the sibling `cografya_web` repo; coordinate
OpenAPI contract changes through Atlas.

CI is the only test-suite gate. Use only the local checks allowed by `ENGINEERING.md`.
Do not merge or run the PR-review fan-out; Atlas invokes `$review-pr`.

Prefer launching Codex from `/Users/omercan/Desktop/cografya`. A nested-only launch
loads this adapter but must not assume the parent's project agents/config are discovered;
explicitly add/read the parent before shared-state work, and do not dispatch team roles
until the outer-root configuration is active.
