# CLAUDE.md — `cografya_api` Engineering Ground-Truth (BINDING)

This file is the binding engineering playbook for the **`cografya_api`** repo — the
NestJS backend of the Coğrafya platform (an SEO-first, free, TR+EN geography education
site). On engineering specifics it **overrides** the Deniz persona and the
orchestrator-home docs; it is the local source of truth for how code lands here.

- **Single writer:** Deniz. No one else commits to this repo.
- **Precedence:** this file wins over the Deniz persona on repo specifics. For
  cross-team *process* (routing, delivery, the review-loop ownership), the
  orchestrator-home `CLAUDE.md` + `CONVENTIONS.md` remain authoritative — this file does
  not restate or override them, it implements the api half.
- **Sister repo:** `cografya_web` (Vera, single writer). We share **one contract**: the
  OpenAPI spec this repo generates. Never edit the web repo; coordinate contract changes
  through Atlas (see §4).
- **Not multi-tenant.** This is a single-tenant public content platform: no `companyId`,
  no billing, no tenancy isolation. Do not import those patterns from any sister project.
  What replaces tenancy as the sacred boundary is **baseline security + data
  correctness** (§3).

---

## 1. Stack (locked — `CONVENTIONS.md` §3)

- **NestJS + TypeScript**, full `strict: true` + `noUncheckedIndexedAccess`. No `any`
  ships; no unchecked index access.
- **TypeORM + PostgreSQL 16.** `synchronize` is **always off** — schema changes ship only
  as hand-reviewed migrations (§5).
- **Redis 7** for caching (hot content reads, feed responses). Present in
  `docker-compose.yml`; wired into the app only when a real cache need lands — until then
  hot reads use HTTP `Cache-Control` headers (see `ProvinceController`).
- **Node 24**, **pnpm** (pinned via `packageManager`; `corepack enable`).
- **Config:** env is validated at boot by a **zod** schema (`src/config/env.schema.ts`)
  wired into `ConfigModule.forRoot({ validate })`. Missing/mistyped env **aborts boot**.
  Every variable the app reads MUST be declared there; give a default only when a safe one
  exists (`DATABASE_URL` has none — a missing value kills boot by design).
- **OpenAPI is the shared contract.** `@nestjs/swagger` decorates every DTO/route;
  `openapi/openapi.json` is a committed artifact the web repo codegens from. CI runs
  `openapi:check` (regenerate + `git diff --exit-code`) — a stale spec fails the build.
- **No BullMQ / no second entry point at day-0.** Background needs (feed polling, sitemap
  pings) start as simple scheduled providers. Escalate to a real queue only when a real
  queue need appears — surface it to Atlas first (§12).

---

## 2. The API surface

- **Public content endpoints are read-optimized** — they feed the SEO/SSG pages. Lean
  list payloads, full detail payloads, HTTP `Cache-Control` headers (Redis read-through
  layered in only when traffic warrants). Public routes carry **no auth guard by design**
  (documented at the controller, as in `ProvinceController`).
- **Admin/editor CRUD is guarded and audited** — every destructive write behind a role
  guard, with an operation log entry. Not yet built; binding once panels land.
- **DTO tiers — keep it as simple as the data allows.** Today: **List** (lean) + **Detail**
  (full) per public entity (see `ProvinceListItemDto` / `ProvinceDetailDto`). Add a
  **Response** tier only where a write echo genuinely needs a distinct shape — decide when
  the first write endpoint lands and record the ruling in this file. Do not pre-build tiers.
- **Response envelope + pagination.** Faz-1 list endpoints that are bounded and small
  (e.g. the 81 provinces) return a plain typed array — no envelope, no pagination, by
  deliberate choice (a fixed, fully-cacheable set). The **first unbounded/growing list**
  (blog, topics) introduces the shared response-envelope + pagination helper; establish it
  once, then it is binding for every list after. Record the shape here when it lands.
- **Global `/api` prefix** for content routes; `/health` stays bare (see
  `src/common/bootstrap.ts`). The OpenAPI generator applies the same prefix so the spec's
  paths always match what the app serves.

---

## 3. The security boundary (baseline security + data correctness) — NON-NEGOTIABLE

This site will hold **teacher and student accounts (students may be minors — KVKK
sensitivity)**, accept **user image uploads**, and **proxy third-party feeds**. Never
ship an unguarded write, an unvalidated input, or an unbounded external call.

### 3.1 HTTP hardening (current posture — `src/main.ts`)
- **helmet** on globally. CSP is intentionally **off** and documented at the call site
  (this service serves JSON, not HTML; the only HTML surface is the dev-only `/docs`). All
  other helmet protections (HSTS, noSniff, frameguard, …) stay on. Keep this decision
  loud, never silent.
- **CORS** allows only the configured `WEB_ORIGIN`; `credentials: false` until cookie auth
  exists (revisit CORS + credentials together when auth cookies are introduced).
- **Rate limit:** global `ThrottlerGuard`, 120 req/min per client, in-memory store
  (single-instance day-0; a Redis-backed store is layered in at horizontal scale — surface
  to Atlas first). `/health` is exempt via `@SkipThrottle`. Per-user/upload endpoints get
  their own tighter throttle when they land.
- **`/docs` (Swagger UI + `/docs-json`)** is currently ungated so web can codegen against
  a dev instance. It carries a `TODO(first-deploy)` to gate behind a non-production check
  before the first real deployment — the full API surface must not be publicly browsable
  in prod. This is a first-deploy acceptance criterion (Atlas-tracked).

### 3.2 Input validation — on every DTO
- The global `ValidationPipe` runs with **`whitelist: true` + `forbidNonWhitelisted:
  true` + `transform: true`** (`src/main.ts`) — applied from day one so every future write
  endpoint is guarded by default. Every DTO field carries the right `class-validator`
  decorators; unknown properties are rejected, not silently dropped.
- Never trust a client-supplied type, length, enum, or id shape. Validate at the boundary.

### 3.3 Auth & roles
- **JWT** auth; the role model is **minimal** (public / student / teacher / admin — the
  exact set is locked in SPEC-0, not invented here). Not yet built.
- Once built: a **guard on every non-public route**; role checks go through **shared
  helpers/decorators**, never inline `user.role === '…'` literals. Public-content routes
  stay explicitly public and say so at the controller.

### 3.4 Upload safety (AI image analysis — future)
When the image-upload / vision endpoint lands, all of these are mandatory:
- **Size + MIME allowlist enforced server-side** — never trust the client-declared type;
  sniff the real content type.
- **Store outside the web root / in object storage**, never in a servable path.
- **Strip EXIF** before storage (privacy + payload hygiene).
- **Per-user rate limit** on the upload route (tighter than the global throttle).
- The **vision-provider call is wrapped with a timeout + a cost guard**; a provider
  failure fails soft and never hangs a request.

### 3.5 External feed proxying (AFAD/Kandilli, MGM, air quality — future)
- **Always through our cached server-side proxy** — provider keys never reach the client.
- **Per-provider timeout + retry policy + fail-soft:** a provider outage degrades the
  widget, never the page. No unbounded external call, ever.
- **Respect licence/attribution** — no feed is wired without recorded licence +
  attribution terms (NOVA's briefs are the authority; `CONVENTIONS.md` §4/§7).

### 3.6 KVKK / personal data
- Student/teacher personal data is **minimized**, **never exposed on public endpoints**,
  and **never logged** (no PII in logs, error messages, fixtures, or the OpenAPI examples).
- **Any new personal-data surface is flagged to Atlas** for the security-privacy-reviewer
  pass before it merges — do not add a PII field, endpoint, or log line quietly.

### 3.7 Secrets
- Secrets live in **env (zod-validated)** only — never in code, logs, fixtures, seeds, or
  the committed OpenAPI spec. `.env` is gitignored; `.env.example` documents the shape
  without real values.

---

## 4. The contract with `cografya_web`

- The **OpenAPI spec is the single source of truth** for the shared DTO/type contract.
  After **any** DTO or route change: regenerate (`pnpm openapi:generate`) and commit
  `openapi/openapi.json`. CI's `openapi-check` job fails on a stale spec.
- **Breaking changes are flagged to Atlas** so Vera lands the matching web change — never
  silently. A removed/renamed field, a changed type, a changed path, a new required
  request field: all breaking. When in doubt, treat it as breaking and surface it.
- Never edit `cografya_web`. Coordinate every contract change through Atlas.

---

## 5. Data & migrations — hand-review discipline

- **`synchronize` is off.** Every entity change gets a migration. No exceptions.
- **Workflow:** change the entity → `pnpm migration:generate <path>` → **read and
  hand-review the generated SQL** → **add it to the explicit `migrations` array** in
  `src/database/data-source-options.ts` (no globs — every migration is registered on
  purpose) → commit. **Never commit an unread generated migration.**
- Migrations live in `src/database/migrations/`. The CLI runs against the compiled build
  (`dist/database/data-source.js`).
- **Public entities carry `slug_tr` + `slug_en`** (the web repo's localized-slug routing
  depends on them). Slug columns are indexed for the lookup path.
- **External data imports are TWO-PHASE, and the phases are not interchangeable**
  (`pnpm db:import:climate --phase=fetch|load`, `src/database/climate/`). `fetch` is the only
  thing that touches the network: run BY HAND (roughly yearly), polite by construction
  (serial, >=5 s apart, 60 s timeout, identifying UA, circuit breaker), and it writes
  committed, reviewable artifacts. **Budget ~70 minutes for a full `fetch`** — MGM throttles
  sustained access down to ~50 s/page (measured 2026-07-18); a slow run is being throttled,
  not hung. `load` is offline, deterministic and idempotent, reads
  only those artifacts, and is the only phase CI or a deploy may run. **Never collapse the
  two** — a build that can fail because a provider is down is not a build. Fidelity rule: the
  manifest keeps the RAW source cell strings and the load phase re-prints each parsed number
  to prove it still matches, because range/ordering invariants cannot detect a silently
  truncated decimal.
- **Seeds** are split: `db:seed` / `db:seed:dev`, plus a dedicated **`db:seed:geography`**
  for the country/province/concept base data — the platform's most critical seed. Seed
  discipline notes belong on the entity (e.g. `plate_code` is zero-padded to 2 chars so
  the lexical `ORDER BY plate_code` stays correct). No secrets or PII in seeds.

---

## 6. i18n content model

- Public entities carry **TR + EN fields** and `slug_tr`/`slug_en`.
- **User-facing messages are i18n keys, never hardcoded literals** (no hardcoded
  user-facing string ships). The i18n module is introduced with the first user-facing
  message surface; until then keep error responses to framework defaults and structural
  fields, not authored prose.

---

## 7. Implementation workflow

1. **Confirm scope to 95%.** Read the matching brief/SPEC first; if something seems wrong
   for our case, stop and ask Atlas. Never make a change unless 95% sure.
2. Build order per feature: **entity (+ `slug_tr`/`slug_en` if public) → migration
   (hand-reviewed) → DTOs (with `@nestjs/swagger` + `class-validator`) → service
   (validation, transactions, caching) → controller (guards + serialization + cache
   headers) → i18n keys → seeds if base data → e2e tests (CRUD + authz: assert both the
   role-forbidden and the unauthenticated paths)**.
3. Regenerate `openapi/openapi.json` if the contract changed (§4).
4. **Verify before done:** standalone `pnpm typecheck` (`tsc --noEmit`) + `pnpm lint` on
   changed files, **no `--fix`**. Tests run on CI (§8). Never weaken or skip a test to go
   green.

---

## 8. Quality gates (a task is not "done" until)

- **CI is the ONLY test gate.** Locally run **only** `pnpm typecheck` + `pnpm lint` on
  changed files (**no `--fix`**). Verify tests by reading the PR's CI — never run the e2e
  suite to "confirm green" locally.
- **CI jobs (`.github/workflows/ci.yml`):** `Typecheck & Lint` · `Build` · `OpenAPI spec
  drift` · `Test (unit)` · `Test (e2e)` (Jest + `@testcontainers/postgresql` on a real
  Postgres + supertest). **CI green is the single merge gate — no merge while red.**
- **`Test (unit)` covers `tools/` AND pure `src/` modules with a `.spec.ts` sibling**
  (config: `test/jest-unit.json` + `tsconfig.unit-spec.json`). A module that needs no
  database belongs there, not in the Testcontainers e2e suite — the e2e job is for code that
  genuinely needs Postgres. `src/**/*.spec.ts` is excluded from `tsconfig.build.json`, so
  specs are type-checked but never emitted to `dist/`.
- **e2e tests use a real Postgres via Testcontainers**, not mocks. Every authz-bearing
  route asserts the forbidden and unauthenticated paths, not only the happy path.
- **Narrative-content seed PRs are transcribed by tool, never by hand.** Use
  `pnpm seed:transcribe apply <draft.md>` to write fact-checked prose into the seed, and
  `pnpm seed:transcribe check <draft.md>` to verify. This replaces the manual
  byte-for-byte roundtrip reconstruction that `CONVENTIONS.md` §2 required. Hand-typing
  prose into the `+`-concatenation idiom is what caused PR #43's dropped spaces — don't.
  See `tools/seed-transcription/README.md` for the join rule and the design rationale.
- **The content-fidelity gate is per-wave, and it is `exit 0`.** Run `check` over **the
  draft(s) that PR touches** — not the whole corpus — and it must exit 0, which means
  `0 drifted` **and** `0 not yet seeded`. Do not read the printed counts and judge by eye;
  read the exit code.
  - The gate is **scoped to the PR's own drafts on purpose.** A corpus-wide run also sweeps
    up superseded drafts and drafts whose prose the seed has since corrected — neither is a
    defect in the wave being reviewed, and folding them in produces a gate that can never
    go green. A mandated gate that cannot go green trains the next engineer to ignore it,
    which is worse than having no gate.
  - **`apply` refuses to overwrite a committed value that differs from the draft.** That is
    not an obstacle to route around: it means the seed may hold a correction the draft
    never caught up with (PR #46's `Ekvator` -> `Ekvador` is the live example). Back-port
    the fix to the draft. `--force` exists for the case where the draft is genuinely the
    newer text — using it is a decision you must be able to defend in the PR.
  - **Pass only the authoritative draft.** Two drafts naming the same country+field with
    different prose is a hard error, by design; the tool will not pick a winner for you.
- No deploy job — hosting is undecided (`CONVENTIONS.md` §2/§7). Do **not** wire a deploy
  pipeline until the hosting target is chosen.

---

## 9. Branch & PR flow

- **`feature/* → dev`**, squash-merge PR. `main` is a placeholder until the prod-promotion
  model is decided alongside hosting.
- Conventional Commits (enforced by commitlint via a git hook). `pre-commit` runs
  `lint-staged` (ESLint `--fix` + project-wide typecheck) on staged TypeScript.
- One PR per coherent change; open against `dev`; let the review loop (§10) run before
  reporting done.

---

## 10. PR review loop + Critical Architect Filter (BINDING protocol)

Every PR goes through the full loop — not optional, not abbreviated.

**Atlas runs the reviewer fan-out on the main thread — NOT the engineer.** Engineers have
no `Agent` tool (a deliberate design choice, not an accident — it keeps fresh-context
review independent of the author; SPEC §0). Attempting the fan-out from here degrades to
self-review, the exact bias the loop exists to remove. The committed reviewer assets Atlas
loads live in **`.claude/reviewers/`** (roster, role prompts, per-repo checklists,
severity taxonomy — see `.claude/reviewers/README.md`).

Reviewers write findings to `pr-reviews/{PR#}-{role}.md`; Atlas consolidates into
`pr-reviews/{PR#}.md` and hands it to the author. **`pr-reviews/` is ephemeral working
scratch** — Atlas archives the consolidated file to
`Owner's Inbox/pr-review-archive/cografya_api-{PR#}.md` and it is never deleted mid-loop
(a reviewer once `rm -rf`'d it by mistake; the templates now forbid deleting anything).

### The Critical Architect Filter — the author's half
For **every** finding Atlas hands back, evaluate through this lens and record the outcome:

- **Criticality** (Critical Bug / Tech Debt / Style / Nitpick) · **Blast Radius** ·
  **Cost/Benefit** · **Architectural Fit (YAGNI?)**.
- **Scope brake first:** act **only** on correctness / security / SEO-correctness /
  requirement items. Stylistic or speculative findings → downgrade, don't action.
  *(api localization: "SEO-correctness" has no direct surface here; its analog is
  **contract/OpenAPI correctness** and **KVKK/data-correctness** — treat those as the
  same class of hard boundary.)*
- **Decision, one of:**
  - **Accept** — apply the fix.
  - **Discuss & Decide** — *Steel-man* the suggestion, *counter-argue* the current code,
    weigh the *trade-off*, close with **"Winner: […] — Because…"**.
  - **Reject** — including **False Positive / misread context** (state why).
- **Annotate every skipped item in English** in the PR body / filter notes with its
  rationale. **Do not action a finding you cannot justify.**
- **Security / KVKK / upload findings get the deeper security-privacy-reviewer pass** via
  Atlas before they are closed.
- Apply Critical/Important items first → **commit & push** → re-loop via Atlas until no
  Critical/Important remains. Hand follow-ups to Atlas for the board.

The **severity taxonomy** (CRITICAL / IMPORTANT / MINOR) that reviewers tag findings with
is defined in `.claude/reviewers/README.md`; the filter and the reviewers speak the same
language.

---

## 11. Repo-init hygiene

Reproduce these when cloning fresh or standing up a sibling repo.

### 11.1 Repo-local git credential helper (covers `git push`/`pull` only)
This machine hosts multiple GitHub accounts; the "active" one can flip. To pin **git
transport** for this repo to the correct account regardless of global state, a
**repo-local** credential helper is configured (`git config --local`):

```
# 1) an empty value first, to CLEAR any inherited global/system helper for this repo
credential.helper=
# 2) then the repo-local helper: mint a token for the pinned account on demand
credential.helper=!f() { echo "username=x-access-token"; echo "password=$(gh auth token --user Sertturk16)"; }; f
```

The leading empty entry is required — without it an inherited global helper (e.g. osxkeychain)
can win and serve the wrong account's cached credential. This helper shells out to
`gh auth token --user Sertturk16`, so `git push`/`pull` always use the pinned account's
token even if `gh`'s active account has drifted.

### 11.2 The `gh` CLI account-revert gap (KNOWN, unsolved — surface, don't assume)
The §11.1 helper fixes **git transport only**. The **`gh` CLI itself** keys off its own
*active account* state, which other work on the machine can silently revert. Therefore:

- **Run `gh auth switch --hostname github.com --user Sertturk16` before every `gh`
  invocation** in this repo (PR create, checks, etc.). This is the current mitigation.
- A durable fix (e.g. a per-repo `GH_CONFIG_DIR` so `gh`'s active-account state is scoped
  to this repo) is **still open and tracked separately**. This doc records current reality;
  it does **not** claim to solve the `gh` gap.

---

## 12. Escalation / growth triggers

- Architectural escalation (a real queue, a shared cache store, horizontal scaling,
  cost/rate concerns on an external provider) is **surfaced to Atlas first** — never
  introduced on reflex. YAGNI is the default; add machinery only when a real need lands.
- A new personal-data surface, a new upload path, a new external provider, or a new
  breaking contract change each trigger the relevant Atlas-coordinated review pass before
  merge (§3.6, §4).
