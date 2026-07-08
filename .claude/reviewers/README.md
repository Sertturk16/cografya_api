# `cografya_api` — Reviewer Assets (Atlas-loaded)

Committed, auditable templates for the **api PR review fan-out**. These files are what
**Atlas** reads to run the review loop on a `cografya_api` PR. They are the api half of
PR-3; the web repo carries its own mirror under `cografya_web/.claude/reviewers/`.

## Who runs this (the hard constraint)

**The fan-out is run ONLY by Atlas, on the main thread.** The engineers (Deniz here, Vera
in web) are **not** granted the `Agent` tool — a deliberate design choice, not an
accident. Two reasons:

1. A subagent without the `Agent` tool cannot spawn subagents, so an engineer literally
   cannot run the fan-out.
2. Even if granted, **an author spawning their own reviewers reintroduces the exact bias
   the loop exists to remove.** Independent, fresh-context review is the whole point.

So these templates are **Atlas orchestration assets**, never an engineer capability. An
engineer reading them for context is fine; an engineer running them is structurally
impossible and, by design, undesired.

## The loop (per PR)

1. **Atlas runs the fan-out on the MAIN THREAD.** For each roster role, Atlas spawns a
   fresh `general-purpose` agent (until a repo-local review skill exists), anchored to the
   PR's worktree/branch **diff**, and hands it that role's template from this directory.
2. **Reviewers are read-only.** Each writes its findings to `pr-reviews/{PR#}-{role}.md`
   and returns a **distilled, severity-tagged summary** to Atlas. Reviewers **never**
   modify or delete files (see each template's output contract).
3. **CRITICAL findings get per-finding adversarial validation** — a fresh agent
   steel-mans and stress-tests the claimed failure before it is treated as blocking.
4. **The AUTHORING engineer (Deniz) runs the Critical Architect Filter** on the
   consolidated findings (protocol in the repo-root `CLAUDE.md` §10): per finding —
   Criticality · Blast Radius · Cost-Benefit · Architectural Fit → **Accept / Discuss &
   Decide / Reject**; act only on correctness / security / SEO-correctness (api analog:
   contract & KVKK correctness) / requirement items; **annotate every skipped item in
   English**; commit & push.
5. **Re-loop** until no CRITICAL/IMPORTANT remains.
6. **Atlas archives** the consolidated `pr-reviews/{PR#}.md` to
   `Owner's Inbox/pr-review-archive/cografya_api-{PR#}.md` before the worktree is removed.
   The owner sees only the critical-points summary.

## Roster (api)

| Role | Model | When |
| --- | --- | --- |
| `code-reviewer` | `opus` | **Always** — every api PR |
| `security-privacy-reviewer` | `sonnet` | **Always** — auth, validation, upload, rate-limit, KVKK/PII |
| `silent-failure-hunter` | `sonnet` | **Always** — swallowed errors, lost awaits, fail-soft feeds |
| `pr-test-analyzer` | `sonnet` | When the PR touches tests or behaviour needing test coverage |

Reviewers are **review-time-only roles**, not team seats. Atlas spawns them fresh per PR,
anchored to the PR diff, and tears them down after. (`CONVENTIONS.md` §2 / SPEC §5.)

## Severity taxonomy (SHARED with `cografya_web` — do not diverge)

Reviewers and the filter use the same three levels so they speak one language:

- **CRITICAL** — blocks merge: correctness / security / data-loss / SEO-breaking (api:
  contract-breaking, KVKK/PII exposure). **A concrete failure scenario is required** — no
  CRITICAL without a described way it actually breaks.
- **IMPORTANT** — a real defect or standards violation (security, validation, KVKK) that
  must be fixed before merge but is not catastrophic.
- **MINOR** — cleanup / nit / deferrable. Filter's discretion.

## Directory layout

```
.claude/reviewers/
  README.md                       # this file — loop, roster, severity, constraint
  code-reviewer.md                # correctness/design (opus, always)
  security-privacy-reviewer.md    # authz, input validation, upload, rate-limit, KVKK
  silent-failure-hunter.md        # swallowed errors, lost awaits, fail-soft feeds
  pr-test-analyzer.md             # test coverage/quality (as applicable)
```

The binding review-loop + Critical Architect Filter protocol lives in the repo-root
**`CLAUDE.md`** (§10). These templates supply the per-role prompts and checklists Atlas
loads to execute it.
