# `cografya_api` Reviewer Rubrics

This legacy `.claude/` path is retained for compatibility, but the Markdown content is
provider-neutral and is used by both Claude and Codex.

The orchestration-root `REVIEW-POLICY.md` is the only authority for:

- roster and applicability;
- escalation (model selection is set by the active provider's `review-pr` skill);
- severity;
- output contract;
- validation, deduplication, and report shape;
- author filter and delivery loop.

These files contain role-specific checklists only:

- `code-reviewer.md`
- `security-privacy-reviewer.md`
- `silent-failure-hunter.md`
- `pr-test-analyzer.md`

Reviewers never modify code/content/state, delete files, run tests, or touch the
consolidated report. Each may write only the unique raw recovery checkpoint Atlas
assigns under `pr-reviews/`, and returns the same structured findings to Atlas. Atlas
alone writes and checkpoints the consolidated `pr-reviews/{PR}.md` after every wave.
