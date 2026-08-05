/**
 * Reading the DRAFT files a human named on the command line.
 *
 * WHY THIS IS A SHARED MODULE RATHER THAN THREE `readFileSync` CALLS. The draft path is the ONLY
 * path in this toolchain that comes from argv instead of from the repo, so it is the only one a
 * typo can miss — and the drafts live OUTSIDE the repo (`../Owner's Inbox/…`), which is exactly
 * the kind of path people get wrong. Left bare, `fs.readFileSync` answers that typo with a Node
 * stack trace whose first four lines are `node:fs` internals. It fails loud, but it reads like a
 * TOOL CRASH: the reviewer replaying the `ENGINEERING.md` §8 gate by hand cannot tell "you typed
 * the path wrong" from "the transcription tool is broken", and the second reading is the one that
 * stops a review.
 *
 * ONE implementation, one wording, all four entry points (`seed:transcribe`, the N-wave climate
 * one-offs, the P-wave prose one-offs). A friendly message on one lane and a stack trace on the
 * next is worse than a stack trace everywhere — it is an inconsistency a future reader has to
 * explain (the reason PR #92 deliberately did NOT fix this on one lane alone).
 *
 * NOTHING HERE THROWS, and nothing here exits: the caller owns the exit code, because each shell
 * has its own contract about what it prints first.
 */
import * as fs from 'node:fs';

/** One draft path that could not be read, with a reason a human can act on. */
export interface DraftReadFailure {
  readonly path: string;
  readonly reason: string;
}

/** One draft that WAS read, carried with its own path so nothing has to zip two arrays. */
export interface DraftFile {
  readonly path: string;
  readonly markdown: string;
}

export interface DraftReadResult {
  /**
   * The successfully read drafts, in argv order.
   *
   * An unreadable path contributes NO entry rather than an empty string, so a missing file can
   * never be mistaken downstream for a draft that parsed to nothing — the two failures this PR
   * separates deliberately. Each entry keeps its own path, so a caller never index-matches these
   * against `draftPaths`.
   */
  readonly files: readonly DraftFile[];
  readonly failures: readonly DraftReadFailure[];
}

/**
 * `errno` codes worth translating. Anything else falls through to the raw message ON PURPOSE:
 * folding an unknown I/O failure into a generic "cannot read" sentence would turn this fix into
 * the very thing it exists to remove — a real error hidden behind a friendly summary.
 */
const REASON_BY_CODE: Readonly<Record<string, string>> = {
  ENOENT: 'no such file',
  ENOTDIR: 'a path segment is not a directory',
  EISDIR: 'is a directory, not a draft file',
  EACCES: 'permission denied',
  EPERM: 'permission denied',
};

/**
 * DUCK-TYPED, NOT `instanceof Error` — deliberately. An `fs` error crosses a realm boundary when
 * it is raised inside Jest's VM context, and `instanceof` is realm-scoped: the check silently
 * returns false there, and the friendly reason degrades to `String(error)` — the raw
 * "Error: ENOENT: no such file or directory, open '…'" this module exists to replace. Caught by
 * `draft-io.spec.ts` on CI, which is exactly what that spec is for.
 */
function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
  );
}

/**
 * NOT called `describe`: every spec in this repo loads its module under Jest, where `describe` is
 * a global, and a module-local function by that name shadows it for the whole file.
 *
 * The `?? String(error.message ?? error)` tail is not belt-and-braces: the predicate above is
 * DUCK-TYPED, so it also accepts a `{ code: 'X' }` object with no `message` at all.
 */
function reasonFor(error: unknown): string {
  if (!isErrnoException(error)) return String(error);
  // `code` is a string here by construction — the predicate tested exactly that.
  return REASON_BY_CODE[error.code ?? ''] ?? String(error.message ?? error);
}

/** Read every draft path, collecting EVERY failure instead of stopping at the first one. */
export function readDraftFiles(draftPaths: readonly string[]): DraftReadResult {
  const files: DraftFile[] = [];
  const failures: DraftReadFailure[] = [];

  for (const draftPath of draftPaths) {
    try {
      // STRIP A LEADING BOM. The drafts are authored outside the repo by non-engineers, and one
      // round-trip through an editor that writes UTF-8-with-BOM prefixes U+FEFF to the first
      // heading — which then matches no heading pattern, so the whole first section vanishes.
      // The result is loud (the empty-draft guard fires) but WRONGLY DIAGNOSED: it accuses a
      // correct draft of being the wrong file. An invisible byte must not decide that.
      const markdown = fs.readFileSync(draftPath, 'utf8').replace(/^\uFEFF/u, '');
      files.push({ path: draftPath, markdown });
    } catch (error) {
      // ALL of them, not just the first: a run that passes three drafts should name every bad
      // path in one pass, so the operator fixes the invocation once instead of three times.
      failures.push({ path: draftPath, reason: reasonFor(error) });
    }
  }

  return { files, failures };
}

/** The single wording every lane prints before returning 1. */
export function renderDraftReadFailures(failures: readonly DraftReadFailure[]): string {
  return (
    `error: cannot read draft file(s) — check the path. Drafts live OUTSIDE this repo, so from\n` +
    `the repo root the path usually starts with "../Owner's Inbox/":\n` +
    `${failures.map((failure) => `  ${failure.path} — ${failure.reason}`).join('\n')}\n`
  );
}
