# Claude Code Adapter — `cografya_api`

@ENGINEERING.md

The imported handbook is provider-neutral and binding. Claude-specific execution uses
the `cografya-backend-dev` agent definition from the orchestration root. Deniz remains
the single writer, has no `Agent` tool, and returns review orchestration to Atlas.

For shared process and product state, read the orchestration-root `ATLAS-OPERATIONS.md`,
`CONVENTIONS.md`, and `TASKS.md`. A session launched with its cwd inside this repo loads
only this adapter and the imported handbook — explicitly read the parent root before
shared-state work.
