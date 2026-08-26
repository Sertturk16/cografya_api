# `cografya_api` Engineering Ground Truth (Provider-Neutral, Binding)

This file is the binding engineering playbook for the **`cografya_api`** repo — the
NestJS backend of the Coğrafya platform (an SEO-first, free, TR+EN geography education
site). On repo-specific engineering questions it **overrides** the Deniz persona and
orchestrator summaries (per `ATLAS.md`'s **Delivery and canonical homes** section, which
names this file as the repo-engineering home); it never overrides `CONVENTIONS.md` on
cross-repo product/process rules, the live board, or a dated ruling in `DECISIONS.md`. It
is the local source of truth for how code lands here.

- **Single writer:** Deniz. No one else commits to this repo.
- **Precedence:** this file wins over the Deniz persona on repo specifics. For
  cross-team *process* (routing, delivery, the review-loop ownership), the
  orchestration-root `ATLAS.md` (**Routing and acceptance**, **Review**, **Delivery and
  canonical homes**) + `CONVENTIONS.md` remain authoritative — this file does not restate
  or override them, it implements the api half.
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
- **Redis 7** for caching (hot content reads, feed responses). Wired into the app from the
  marine M2 PR via `REDIS_URL` (`src/upstream/`): the upstream cache, the single-flight
  refresh lock and the shared provider-budget counters. `REDIS_URL` is **optional in
  development/test** — the app falls back to an in-process LRU and says so loudly at boot —
  and **mandatory in production while `MARINE_ENABLED=true`**, enforced at boot by the env
  schema (owner ruling E1 → DEC 2026-07-29b). Content reads that need no upstream call still
  use HTTP `Cache-Control` headers only (see `ProvinceController`).
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
  queue need appears — surface it to Atlas first (§12). The shape that rule leaves room for is
  the **scheduled warmup tour** (`ScheduledWarmupService`, `src/upstream/`, `ScheduleModule` +
  `SchedulerRegistry`): providers inside this process — no queue, no worker, no separate
  deployable. It is **one shared class with one instance per feature leg**: the discipline that
  must never be copied (the cross-instance Redis lock, its compare-and-delete release, the
  overlap guard, the per-tour deadline, "skip the tour when Redis cannot answer") lives in that
  one class, while each leg passes its own `name` — from which the lock key, both
  scheduler-registry timer names, the logger context and the `redis.degraded` label are derived —
  plus its own kill switch, interval and deadline. Per-leg instances are deliberate: a shared
  instance would demote a leg's kill switch to "registers no targets" while its timer kept
  running, and would let one leg's bad tour eat another's budget. It arrived with marine M2 as
  `MarineWarmupService` and became provider-neutral in the air-quality A0 move. Its Faz-1 arrival
  is a recorded deviation from marine SPEC v1's "no scheduled work" (SPEC-ADDENDUM §3.3, AÇIK-1).

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
  introduces the shared response-envelope + pagination helper; establish it once, then it
  is binding for every list after.
  **It landed with the earthquake list (E1, `PaginationEnvelopeDto`), and the shape is:**
  > A list response carries **exactly** `items`, `page`, `pageSize`, `total` and `hasMore`
  > at the top level. Every endpoint-specific field lives inside **one** named `meta`
  > object. A list with no endpoint-specific fields carries **no `meta` at all**.

  Core five ruled by `DEC 2026-08-12k` §2; the `meta` form by §7. `page`/`pageSize`/
  `total`/`hasMore` are inherited from `src/common/dto/pagination-envelope.dto.ts`;
  `items` is declared per list DTO because `@ApiProperty({ type: [X] })` needs the concrete
  item type — its **presence** is nonetheless forced from the base, which declares
  `abstract items`, so a list DTO that omits it does not compile.
  **Why `meta` is nested rather than five more top-level keys is a measured
  constraint, not taste:** `@nestjs/swagger` emits a subclass schema FLAT — no `allOf`, no
  `$ref` to the base, and the base is absent from `components.schemas` unless registered
  separately — so inheritance alone enforces the core in TypeScript while leaving the
  published contract an undifferentiated list of keys. Nesting is the only form in which
  the boundary survives into `openapi.json`. Blog and topic lists follow this; they do not
  inherit any endpoint's `meta`. Accepted trade-off recorded with the ruling: offset
  pagination can repeat a row across pages when new rows land mid-read; cursor pagination
  fixes that and breaks the stable `?page=2` addresses the web repo's canonical strategy
  depends on.
- **Request DTOs — query parameters carry their ceiling, and the ceiling is per endpoint.**
  A paginated list takes a `@Query()` DTO class (`BookListQueryDto` is the first, B3) whose
  `page`/`pageSize` bounds and defaults live in `class-validator` decorators AND in
  `@ApiPropertyOptional`, so the published contract states them. **The default belongs in the
  property initialiser, never behind a `?? 50` in the service:** the web repo pages until
  `hasMore` is false and reads both the default and the maximum out of `openapi.json`, where a
  service-side default is invisible. Declare each number **once**, as an exported constant —
  it appears in two decorators that no tool cross-checks, and the e2e imports it rather than
  retyping it.
  **There is no shared base query DTO, and this is a property of the tooling rather than a
  preference:** class-validator decorators accumulate through inheritance, so a subclass can
  only ever TIGHTEN a base `@Max` and never loosen it. A base would have to carry the lowest
  ceiling any endpoint will ever want, and any endpoint needing a higher one would have to stop
  extending it. On **an endpoint that takes a query DTO**, unknown query parameters are therefore
  **rejected** (400) rather than ignored — that is §3.2's global pipe doing its job, and such an
  endpoint does not carve itself an exception. The asymmetry is worth knowing: a route with no
  query DTO (every province, country and marine read today) never validates its query string at
  all, so it ignores unknown parameters instead. That is a consequence of where DTOs exist, not a
  second policy — but it means "unknown parameters are rejected" is true of the surface that has a
  DTO, and only that surface.
- **Global `/api` prefix** for content routes; `/health` stays bare (see
  `src/common/bootstrap.ts`). The OpenAPI generator applies the same prefix so the spec's
  paths always match what the app serves.

---

## 3. The security boundary (baseline security + data correctness) — NON-NEGOTIABLE

This site will hold **teacher and student accounts (students may be minors — KVKK
sensitivity)**, accept **user image uploads**, and **proxy third-party feeds**. Never
ship an unguarded write, an unvalidated input, or an unbounded external call.

### 3.1 HTTP hardening (current posture — `src/main.ts`)
- **helmet** on globally. CSP is intentionally **off** and documented at the call site: this
  service serves JSON, not HTML, on its public content routes, and the one HTML surface —
  `/docs` (Swagger UI) — is **not dev-only** (CODE139-I1/SEC139-M6, fix round). Since SEC84-P1
  it is served in production too, behind HTTP Basic auth when `DOCS_ACCESS_TOKEN` is set (the
  `/docs` bullet below), and not mounted at all when it is unset.

  The CSP-off decision was **re-evaluated a third time**
  (`SEC139R3-M1`/`SEC139R3-M2`/`CODE139R3-M1`/`CODE139R3-M2`): the previous rewrite's premise —
  that Swagger UI needs inline scripts helmet's default CSP would block — was measured **false**
  in round 2 and holds on independent re-measurement here too. What this round found wrong
  instead was the remaining-risk paragraph's OWN counts, and — more importantly — its
  conclusion, which claimed more than either count supports.

  Measured against the served page (`@nestjs/swagger@11.4.5`'s `buildSwaggerHTML`, invoked with
  no custom `swaggerOptions` by the `SwaggerModule.setup('docs', app, document)` call inside the
  closure `applyDocsGate` runs in `src/main.ts` — not by `applyDocsGate` itself, which only
  decides whether to run that closure): three `<script src="...">` tags to same-origin files
  (`swagger-ui-bundle.js`, `swagger-ui-standalone-preset.js`, `swagger-ui-init.js`) and **zero**
  inline `<script>` tags or `on*` attribute handlers. `helmet@8.2.0`'s own default `script-src`
  is the explicit `['self']`, which already permits those three same-origin files, and its
  default `style-src` already permits the page's two inline `<style>` blocks — so the specific
  blocker the earlier rewrite named does not exist.

  The remaining-risk paragraph named two items and both counts were wrong. The served page loads
  two `swagger-ui-dist@5.32.8` files (`swagger-ui-bundle.js`, `swagger-ui-standalone-preset.js`);
  each contains exactly **one** `new Function(` call, for **two** total, not one — and both are
  the identical webpack `globalThis` polyfill: `if("object"==typeof globalThis)return
  globalThis;try{return this||new Function("return this")()}catch(s){if("object"==typeof
  window)return window}`. `swagger-ui-bundle.js` separately references
  `https://validator.swagger.io/validator` **three** times, not one — two `void
  0===x?<default>:x` fallbacks plus the frozen default-config entry — all belonging to the
  single `validatorUrl` default its bundled `OnlineValidatorBadge` ships with. The
  `script-src`/`connect-src` sentence in the previous version was also imprecise: `script-src`
  is already explicit (measured above) and does not fall back to anything; only `connect-src`,
  absent from helmet's default directive list, falls back to `default-src 'self'`. None of this
  is pinned by a test or a type in this repo — it is an observation about the installed
  packages' current contents, not a guarantee that anything here turns red if a future
  `swagger-ui-dist` or `@nestjs/swagger` upgrade changes it.

  Read directly rather than left open, the `new Function(` call **resolves**, and does not need
  a browser render to settle: `typeof globalThis === 'object'` is true in every currently
  shipping browser (Chrome 71+, Firefox 65+, Safari 12.1+, Edge 79+ — all years old), so the
  branch containing `new Function(` is never reached under normal execution. In a browser old
  enough to lack `globalThis`, the call sits inside a `try`/`catch` that falls back to `window`
  on any thrown error, so a `script-src` without `'unsafe-eval'` blocking that call is caught and
  absorbed rather than surfacing as a broken page. The `validator.swagger.io` reference is a
  separate, `connect-src` question: if a CSP with no explicit `connect-src` were ever applied
  here, the online-validator badge's request would be blocked and the badge would fail — the
  page would not.

  What this measurement supports: the three objections raised against the served `/docs` page
  across three rounds — required inline scripts, an insufficient `script-src`, and a blocking
  `new Function(` call — are each refuted, independently re-measured for the third time. What it
  does **not** support is "therefore CSP stays off": `app.use(helmet({ contentSecurityPolicy:
  false }))` is a **global** setting, and every compatibility question measured above and by the
  two prior rounds is scoped to the one `/docs` HTML surface. Nothing measured here says
  anything about why CSP is off on the JSON routes, where no such question exists at all — the
  only thing that has ever carried over there is the older observation that CSP is *harmless* on
  JSON, not that anything above makes it *necessary*. CSP therefore stays off today because it
  has never been evaluated as a global setting, not because this paragraph defends it as one;
  enabling it — narrowly for `/docs`, more broadly, or not at all — remains a separate,
  evidenced decision this PR does not make in either direction. All other helmet protections
  (HSTS, noSniff, frameguard, …) stay on. Keep this decision loud, never silent.
- **CORS** allows only the configured `WEB_ORIGIN`; `credentials: false` until cookie auth
  exists (revisit CORS + credentials together when auth cookies are introduced).
- **Rate limit:** global `ThrottlerGuard`, 120 req/min per client, in-memory store
  (single-instance day-0; a Redis-backed store is layered in at horizontal scale — surface
  to Atlas first). `/health` is exempt via `@SkipThrottle`. Per-user/upload endpoints get
  their own tighter throttle when they land.
- **`/docs` (Swagger UI + `/docs-json` + `/docs-yaml`)** is gated in production behind
  `DOCS_ACCESS_TOKEN` (SEC84-P1, `src/openapi/docs-gate.ts`): unset in production means the
  surface is **not mounted at all** (fail-closed), set means it answers behind HTTP Basic auth.
  Outside production it stays open, exactly as before, so the web repo keeps codegenning against
  a dev instance. The former `TODO(first-deploy)` on this item is closed.
- **`trust proxy` — SEC84-P1 took BOTH branches the prior first-deploy criterion named, and they
  are not alternatives.** The peer axis gets a bounded hop count of exactly 1
  (`TRUSTED_PROXY_HOPS`, default `0`, applied via the shared `applyProxyTrust(app, hops)`) —
  sound only under the ingress restriction `DEC 2026-08-26o` states: the api is not reachable
  except through the single trusted L7 terminator. The forwarded axis gets an explicit
  `getTracker` override on `TrustedClientThrottlerGuard`
  (`src/common/throttler/visitor-tracker.ts`), which believes a caller's `x-visitor-address` only
  when it also authenticates with `VISITOR_FORWARD_TOKEN`. `trust proxy: true` and any unbounded
  or unmeasured hop count stay forbidden without exception — `max(1)` in the env schema is what
  makes "bounded" a property of the code rather than of an intention. **The first-deploy criterion
  stays open, restated rather than closed:** no docblock may describe any limit here as
  per-visitor until BOTH the web forwarding change (Vera, later) and the deploy-path verification
  that the deployed terminator behaves as assumed have happened — landing the api half alone
  proves the resolution *logic*, not what a deployed socket receives. See
  `Owner's Inbox/uyelik-ve-giris-yol-haritasi/UYELIK-04-SEC84-P1-api-plan.md` for the full design
  and `test/throttle.e2e-spec.ts` E-1…E-5 for what is actually measured today.

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
  - **The exception is a CLASS, not a table list: a public entity WITHOUT its own page.** The
    rule's reason is routing, so where a ruling says there is no page, there is no route, and a
    slug would be a column nothing resolves. Each member is admitted by a dated ruling, each
    dies with its premise (if the ruling is reopened, the slug columns and their migration land
    in the PR that reopens it), and **"it felt unnecessary" is never a member**. The rule still
    binds every entity that does have a page.
    - `earthquake_events` (E1). `DEC 2026-08-12k` D-E rules there is **no per-event page** —
      ~33 000 near-identical thin pages a year is the shape `SEO-POLICY.md` §12.1 (scaled
      content abuse) targets, and that penalty lands site-wide rather than page-by-page.
    - `book_videos` and `book_video_questions` (B1). `Owner's Inbox/kitap-video-cozumler/SPEC.md`
      §4.3 rules there is **no per-deneme and no per-question page** — 30 near-identical thin
      pages PER BOOK on a tier with no ceiling (`DEC 2026-08-15e`) is the same §12.1 shape, and
      the exposure grows with every book rather than stopping at a total. Deep links
      into a deneme or a question are served by **fragments** (`#deneme-12`,
      `#deneme-12-soru-3`), the pattern `DEC 2026-08-04i` §2 already set with `#iller` /
      `#ulkeler`. The book itself DOES have a page and carries both slugs.
- **External data imports are TWO-PHASE, and the phases are not interchangeable.** `fetch`/`probe`
  is the only thing that touches the network: run BY HAND, polite by construction (serial, spaced,
  timed out, identifying UA), and it writes committed, reviewable artifacts. `load` is offline,
  deterministic and idempotent, reads only those artifacts, and is the only phase CI or a deploy
  may run. **Never collapse the two** — a build that can fail because a provider is down is not a
  build. A line that PUBLISHES numbers additionally needs a **fidelity rule**: a check on the WRITE
  path proving the published values still correspond to the source, because range and ordering
  invariants cannot detect a plausible-but-wrong value. This is a requirement on any new publishing
  line, not a claim that every existing line already satisfies it — the climate line's rule is
  written below; marine and air-quality carry their own acceptance criteria and are not audited
  against this wording here. **The rule is not about NUMBERS specifically — it is about any
  per-row value derived from an external source**, because "plausible but wrong" is a property
  of the derivation, not of the datatype. `climateCurriculumNameTr` (the MEB-curriculum climate
  name, 81 provinces) is the first non-numeric line to need it: seeding one province the wrong
  climate name satisfies every structural invariant and is still false on the page, so its
  write-path check is the M1 mapping lane (§8).
  - **The climate line is `pnpm db:import:era5 --phase=fetch|load` (`src/database/era5/`)**, against
    a BINARY source (Copernicus CDS, ERA5-Land monthly means, NetCDF4/HDF5). It is the ONLY climate
    import; the retired MGM line (`db:import:climate`, `src/database/climate/`, `data/climate/`)
    was removed with its artifacts and fixtures when MGM left production (→ DEC 2026-07-30l,
    DEC 2026-08-04c). **What survives from it lives in `src/database/climate/`: `canonical-json.ts`
    and `climate-normals.assertions.ts`, both source-independent on purpose** — the day a second
    climate source lands, they are what it reuses. The MGM Köppen CLASS (`climate_koppen`,
    `climate_class_tr`, `climate_note_tr`) is deliberately untouched by all of this: it is an
    attributed quotation of an official publication, not a series we re-publish as our own
    (→ DEC 2026-08-04a).
  - `fetch`: two serial CDS jobs, budget ~5 minutes for a healthy queue but a **3-hour patience
    ceiling per job** (the provider's queue is load-sensitive and a single fast measurement is not
    a guarantee). `DELETE /jobs/{id}` is called **only after the download is byte- and
    MD5-verified** — deleting earlier makes the job 404 permanently. The **raw ~19 MB `.nc` is
    never committed** (`--raw-dir` is mandatory and must be absolute; `.gitignore` carries a belt);
    a `<raw>.jobs.json` sidecar keeps the job evidence beside those bytes, and is **fail-soft in
    every direction** — no sidecar can make a run fail. `--from-file=<abs path>` re-runs the whole
    offline half with zero network calls.
  - `load`: derives the 12 published normals from the committed 81 × 360 × 2 series and upserts
    them, in one transaction, all-or-nothing, with no network. **The fidelity rule on this line is
    the manifest cross-check**: the annual figures re-derived from the 12 normals must equal the
    ones the fetch phase computed independently off the decoded arrays (tolerance 1e-9; measured
    worst disagreement 8.3e-14). Completeness is absolute — 81 of 81, or nothing is written.
- **Provider keys come in two kinds, and the boot schema treats them differently** (rule
  sharpened at the A2a review, #80 I9):
  - **A hand-run-only key NEVER enters `src/config/env.schema.ts`.** A key consumed
    exclusively by hand-run `fetch`/`probe` scripts (`CDS_API_KEY` is the live example) is
    read from `process.env` **script-locally** and the boot schema does not declare it: a
    migration somebody runs by hand once a decade must not become a precondition for the
    server to start.
  - **A server-boot key is declared — optional, feature-gated.** Once the SERVER itself
    consumes the key (a scheduled ingest, a proxied feed), it belongs in the boot schema as
    `optional()`, with a cross-check that makes the feature-enabled-but-keyless combination
    unbootable (`ADS_API_KEY` + `AIR_QUALITY_ENABLED` is the live example, A2a). The default
    stays "feature off", so a fresh clone still boots with no keys at all. Hand-run scripts
    that share the same key keep reading it script-locally from their own shell — declaring
    it for the server never makes it a requirement for a hand run, nor vice versa.
  - The corollary binds BOTH kinds — a key is redacted from every log line, scanned for
    before any artifact is written, and asserted absent by a `no-key-material` structural
    check.
- **Seeds are split PER CORPUS — one `package.json` script each. There is no umbrella
  `db:seed` and no `db:seed:dev`**; a doc or a setup recipe naming either is stale, and
  following it runs a command that does not exist. The four that do exist are
  **`db:seed:geography`** (the 81 provinces — the platform's most critical seed),
  **`db:seed:world`** (the country corpus), **`db:seed:books`** (books plus their
  video-solution rows) and **`db:seed:reference`** (the 973 ilçe the registration form's
  "İlçe" select reads). Each runs against the compiled build, assumes `migration:run`
  has already created the schema, and reads `DATABASE_URL` straight from the environment
  — these CLIs run outside Nest's DI, so there is no `ConfigService` and no `.env` is
  loaded for them. **`db:seed:reference` additionally requires `db:seed:geography` to have
  run first**, because every ilçe hangs off a province row and its first gate refuses a run
  against an empty `provinces`; skipping it leaves `districts` empty, and an empty table is
  not an error anywhere — the endpoint answers `200 []` for every plate code and the
  registration form's select comes up blank. There are **two** exceptions to the
  `DATABASE_URL` requirement: `db:seed:books --check` and `db:seed:reference --check`, each
  of which validates the committed corpus and returns before touching `DATABASE_URL` or
  opening a connection at all (`books.cli.ts`, `reference.cli.ts`) — so those are the two
  seed commands that run without a database, and the ones a reviewer can run on any
  machine.
  Seed discipline notes belong on the entity (e.g. `plate_code` is zero-padded to 2 chars
  so the lexical `ORDER BY plate_code` stays correct). No secrets or PII in seeds.
  **`neighborIsoCodes` array order is a PUBLISHED render order** (the web detail page
  iterates it unsorted): the house rule is narrative/geographic order mirroring the row's
  own `introTr`, and on sovereignty-sensitive rows the order is deliberate — **never sort
  these arrays alphabetically as a "tidy-up"** (Atlas ruling AS-1/AS-6c, PR #92).

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

- **Local execution is the test gate** (→ `DEC 2026-08-26u`). Run `pnpm typecheck` +
  `pnpm lint` on changed files (**no `--fix`**), then the full unit and e2e suites locally
  — Docker is present in this environment and Testcontainers works against it the same way
  it does in CI. Report exact counts and quote any failure verbatim; a claimed "clean" with
  no numbers is not evidence.
- **CI jobs (`.github/workflows/ci.yml`) run the same commands:** `Typecheck & Lint` ·
  `Build` · `OpenAPI spec drift` · `Test (unit)` · `Test (e2e)` (Jest +
  `@testcontainers/postgresql` on a real Postgres + supertest). CI remains available as a
  secondary, independent record when it is reachable, but is not required to block a merge
  decision. **A genuine green local run is the merge gate — no merge on a red result you
  have seen.**
- **`Test (unit)` covers `tools/` AND pure `src/` modules with a `.spec.ts` sibling**
  (config: `test/jest-unit.json` + `tsconfig.unit-spec.json`). A module that needs no
  database belongs there, not in the Testcontainers e2e suite — the e2e job is for code that
  genuinely needs Postgres. `src/**/*.spec.ts` is excluded from `tsconfig.build.json`, so
  specs are type-checked but never emitted to `dist/`.
- **e2e tests use a real Postgres via Testcontainers**, not mocks. Every authz-bearing
  route asserts the forbidden and unauthenticated paths, not only the happy path.
- **Narrative-content seed PRs are transcribed by tool, never by hand.** Hand-typing prose
  into the `+`-concatenation idiom is what caused PR #43's dropped spaces — don't. There are
  **FOUR verification lanes, and they are not interchangeable**; using the wrong one reports a
  false green, because each lane can only see the seed file (and the field shape) it knows
  about. Three are TRANSCRIPTION lanes (country / province climate / province prose); the
  fourth (**M1, the müfredat mapping**) is a MAPPING lane and is described at the end of this
  list — it exists because a value stored as a shared-constant REFERENCE is invisible to every
  AST-folding byte-compare, and still needs the §5 fidelity rule. The shared
  exit-code contract lives in **four runner copies** (`country-runner.ts` +
  `oneoff-province-climate-runner.ts` + `oneoff-province-prose-runner.ts` +
  `oneoff-province-curriculum-runner.ts`) driven by their entry points (`cli.ts`,
  `oneoff-n1`, `oneoff-n2`, `oneoff-p1`…`oneoff-p6`, `oneoff-m1`) — a new
  lane author must replicate the same invariant, not assume one copy guards all. **The
  runner/entry-point split is structural, not stylistic:** the runner is deliberately
  `import.meta`-free so a CommonJS (ts-jest) spec can import it, and the entry point owns
  `import.meta.dirname`, argv and the usage banner. A refusal written into an entry point
  cannot be pinned at all. **Direct-invocation guards in EVERY province-lane entry
  point go through the shared, spec-pinned `isDirectInvocation` helper
  (`oneoff-province-climate-runner.ts`) — never a raw `import.meta.url ===
  pathToFileURL(argv[1])` compare, which silently no-ops the whole gate (exit 0, no
  output) on any symlinked path (PR #94 review, SFH94-I1).** The caller passes its
  `import.meta`-derived path; both sides are realpath'd.
  - **Countries — `pnpm seed:transcribe`.** `apply <draft.md>` writes fact-checked prose into
    the wave files under `src/database/seeds/countries/*.countries.ts`, `check <draft.md>`
    verifies it. **That directory is the tool's ENTIRE world** (`cli.ts` → `SEED_DIR`): a row
    must LIVE inside `countries/` to be transcribable at all, and a row declared anywhere else
    is invisible to every mode. `country.seed-data.ts` now declares NO rows — it holds the
    `CountrySeed` shape and the `SEED_COUNTRIES` composition only. It used to declare the 8
    "pilot" rows (GR/BG/GE/AM/AZ/IR/IQ/SY), and that is exactly what this rule cost: their
    prose sat outside every gate until FU-PILOT-RETIRE moved them into the wave files, and
    two of them kept a factually wrong sentence through a wave that corrected six others.
    Country-only **by construction**: the pipeline keys rows on `isoCode`. See
    `tools/seed-transcription/README.md` for the join rule and the design rationale.
  - **A DRAFT FIELD NAME OUTSIDE `NARRATIVE_FIELDS` IS A WARNING, NOT AN ERROR — so the gate
    counts past it.** `draft-parser.ts` skips such a section and prints `ignoring <name> —
    not a narrative field`; the `checked N field(s)` line then never mentions it and `exit 0`
    says nothing about that prose. The example this rule was written from is the pilot draft's
    THEN-merged `landformClimateNoteTr`, which the seed splits into `landformNoteTr` +
    `climateNoteTr` (see FIELD-MAPPING DECISION 1 in `src/database/seeds/country.seed-data.ts`,
    not in the draft): every field value under those sections was gated by nothing until
    PR #127 re-headed them. **The hazard did not go with the example** — `draft-parser.ts`
    still warns and still exits 0 on any field name outside `NARRATIVE_FIELDS`.
    **Read the warnings beside the count, not only the exit code** — a green gate
    over half a draft is the one false green the exit-code contract cannot express. Bringing
    such a section under the gate means re-heading it into the seed's own field names, which
    is a mechanical re-heading and must leave the prose byte-identical. FU-PILOT-RETIRE
    (PR #127) is the worked precedent for all eight pilot sections; **the gate output it
    reports is reproducible only against the matching `Owner's Inbox/` draft revision**, which
    lives in the orchestration root and not in this repo, so this rule states the METHOD and
    deliberately pins no number here — re-run the lane and read your own exit code.
  - **Provinces — a per-wave ONE-OFF script, not a `package.json` command.** Provinces are
    keyed on `plateCode`, so they are driven by their own wave entry point run directly with
    `node`:

    ```
    node tools/seed-transcription/oneoff-n<wave>-province-climate.ts emit  "<draft.md>"
    node tools/seed-transcription/oneoff-n<wave>-province-climate.ts check "<draft.md>"
    ```

    N1 (PR #69) and N2 (PR #70) are the shipped precedent. Each wave entry point holds only its
    target list and usage banner; the shared shell (`oneoff-province-climate-runner.ts`) and the
    pure extraction logic (`oneoff-province-climate-extract.ts`) are common and unit-tested, so
    the `check` gate cannot weaken in one wave without failing in all of them. Adding a wave =
    a new target list + a new entry point, deliberately NOT a generalisation of the country
    pipeline (Atlas ruling 2026-07-25).
  - **Province PROSE (non-climate narrative fields) — `oneoff-p<wave>-province-prose.ts`**,
    field-parametric, run directly with `node` exactly like the climate lane; shares the same
    exit-code contract via its own runner (`oneoff-province-prose-runner.ts`). The climate lane
    remains `climateNarrativeTr`-only. P1 (PR #92), P2 (PR #94, `hydrographyNoteTr`),
    P3 (PR #95, now **17 fields** after the Mersin transfer to P4 and the Ankara +
    İstanbul-`hydrographyNoteTr` transfers to P6), P4 (PR #96, now **12 fields** after
    the Samsun transfer to P6), P5 (the müfredat `climateCurriculumNoteTr`, 15 fields)
    and P6 (prose-cleanup wave-1 / W1, 10 fields) are the shipped precedents; each wave =
    its own committed entry point (Atlas ruling AS-3, option C). **Wave target lists live in the shared
    `import.meta`-free targets module (`oneoff-province-prose-targets` + its spec) —
    keyed on the `(plate, field)` PAIR. Ownership model (PR #96): exactly ONE wave owns
    a pair at a time — lists say who owns a field NOW, not who ever touched it. A later
    correction MOVES the entry (target list AND draft section together), never
    duplicates it; the CI-pinned invariants are non-overlap + the `HISTORICALLY_OWNED`
    superset (no pair ever ends up owned by no wave), NOT immutability.**
    **A MOVE IS NOT ALWAYS AVAILABLE, and the fallback is the back-port.** When the pair
    is the SOLE entry of its current wave, moving it empties that list — which trips the
    spec's `$label is non-empty` case and refusal 1 together, turning a green gate
    permanently red on a PR that improves the very prose it guards. In that case the
    correction is back-ported into the OWNING wave's draft and ownership does not move
    (the `apply`-refusal rule below, applied to a draft that is stale rather than wrong).
    P6 is the precedent: ten of W1's twelve fields moved or were added normally, while
    Çorum/19 and Sivas/58 `hydrographyNoteTr` — the single entries of P1 and P2 — were
    back-ported instead. **Verifying such a PR therefore means running the older waves'
    gates too**, since that is where those fields' fidelity is actually asserted.
    **The country lane has no equivalent registry**, so there a later correction simply
    supersedes the older draft. Three rules follow, and all three were learned the
    expensive way in the PR #103 review:
    - **Find the claimants before you allocate, don't assume them.** With no registry there
      is no list to consult, so the sweep is manual and mandatory: `grep -rl` the ISO code
      across `Owner's Inbox/**/*.md`, then run `check` on **every** file that names it, one
      invocation per draft (never several at once — that is the "pass only the authoritative
      draft" refusal). Record each file's exit code BEFORE choosing where the correction
      lands. PR #103 skipped this for two fields its own plan had marked `teyit edilmedi`
      and turned a 28/28 green wave draft red.
    - **Back-port only buys what the owning draft's gate is worth.** Prefer back-porting
      into the draft that currently owns the field — but the ONLY thing that preference buys
      is that draft's `exit 0`, so check the colour first. If the owning draft is already red
      for an unrelated field, back-porting there asserts nothing: the corrected prose ends up
      with no green gate anywhere, and its fidelity can then only be "read off the DRIFT
      list", which this section forbids two bullets down. In that case claim the field in a
      draft whose gate IS green and say so in both files' headers — that note is the
      registry this lane does not have. (PR #103: `EG introTr` back-ported into a shim that
      had been red on `JO introTr` since PR #94.)
    - **Never `apply --force` an invocation carrying any section beyond the one you are
      landing.** Not "a multi-country draft" — the country count is not the hazard.
      `cli.ts` parses `--force` once over the whole argv and `country-runner.ts` hands the
      same flag to every planned file, so the divergence refusal in `apply.ts` is suppressed
      for **every diverging field in every draft passed**, in a single-country draft and a
      multi-draft invocation alike. Each one is force-reverted to whatever its draft still
      says. Narrow the invocation to a draft carrying only the section being landed.
  - **The müfredat MAPPING lane — `oneoff-m1-province-curriculum.ts`**, the §5 fidelity rule for
    `climateCurriculumNameTr` (the MEB-curriculum climate name, 81 provinces). It is NOT a
    transcription lane and deliberately does not reuse the emitter: the seed stores the value as
    a reference to one of eight shared `CURRICULUM_*` constants — so a typo is a compile error,
    and so no AST-folding byte-compare can see the value at all. Pointing a prose lane at it
    reports `unfoldable`; pointing `pnpm seed:transcribe` at it reports the classic false green.
    Instead it re-parses the SOURCE tables (`Owner's Inbox/koppen-mufredat-eslemesi/brief.md`
    §3) and runs three joins against the committed seed: name→curriculum name for the NET rows,
    the eleven `BELİRSİZ` rows against an explicit owner-ruling override table (checked in BOTH
    directions, so a brief revision that resolves a row fails the now-stale override), and the
    brief's Köppen column against `climateKoppen` 81/81 — which is the join that catches a
    row-shifted table, the failure mode plausible names hide. `check` is the gate; `emit`
    regenerates the 81 seed property lines so a reviewer can diff instead of eyeballing.
  - **All FOUR lanes share ONE exit-code contract** (below); the three TRANSCRIPTION lanes also
    reuse the property-tested lossless emitter, which is the part that actually kills the PR #43
    bug class. No entry point is wired into a CI job — the sources live outside the repo, under
    `Owner's Inbox/` — so the reviewing code-reviewer still runs the matching command by hand.
    **Run the lane that owns the seed file the PR touches:** a province wave verified with
    `pnpm seed:transcribe` reports nothing wrong because that pipeline never reads
    `province.seed-data.ts` (this happened in a PR #70 review).
  - **The shells also share FOUR REFUSALS, and a new lane must carry all four**
    (PR #93, Atlas ruling AS-7) — or state, at the refusal's site, why it has no analogue.
    (The M1 lane carries 1-3 verbatim; refusal 4 has no analogue there because that lane
    reconstructs nothing from multiple lines, so no join heuristic exists to agree with itself.
    "No analogue" is only acceptable when it is written down where the next reader will look.)
    Each is a false green somebody reproduced, not a
    hypothetical: (1) **nothing expected** — an empty wave target list fails instead of
    printing "checked 0". The country lane, which has no wave target table, additionally
    refuses a draft it understood no field in; the province lanes have no twin of that
    per-draft variant yet (queued follow-up). That gate is measured on what the parser
    UNDERSTOOD, never on the items that survive de-duplication — two drafts carrying
    identical prose is a sanctioned invocation, and judging it by surviving items false-REDs
    a correct draft (PR #93 review); (2)
    **the committed seed does not parse** — `ts.createSourceFile` is error-tolerant, so
    every mode would read a silently incomplete index; (3) **an unreadable draft path** is
    answered with a message naming every bad path, not a `node:fs` stack trace; (4)
    **tight joins are reported in `check`, not only in `emit`** — both sides of `check` run
    the same parser, so a wrongly glued line join agrees with itself (reporting only, never
    a failure) — and it prints on **stdout**, beside the count line it belongs to, in every
    lane. The shared draft reader is `tools/seed-transcription/draft-io.ts`; it also strips
    a leading BOM, because an invisible byte must not decide that a section exists.
  - **The drafts are not in this repo.** Run from the repo root, a draft path starts with
    `../Owner's Inbox/…`; the usage banners abbreviate it.
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

Atlas alone runs the independent reviewer fan-out. Deniz has no subagent-spawn tool and
must never self-review. Provider-neutral reviewer role rubrics live at the legacy
`.claude/reviewers/` path; the canonical roster, severity, and workflow live in the
orchestration-root `REVIEW-POLICY.md`.

When Atlas returns a consolidated report, read and apply the orchestration-root `REVIEW-POLICY.md` §9
completely. It is the single severity, author-filter, annotation, re-loop, and delivery
procedure.

API-specific filter boundary:

- action-worthy classes are correctness, security, contract/OpenAPI correctness,
  KVKK/data correctness, and explicit requirements;
- this file and `CONVENTIONS.md` beat a conflicting review suggestion;
- route security, KVKK, upload, and provider-boundary findings back to Atlas for the
  dedicated deeper pass;
- hand follow-ups to Atlas; Deniz never writes `STATE.md`, the Atlas-only live board.

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

---

## Kim neyi okur — kapsam sözleşmesi

This table is the sole owner of this document's read scope. Role definitions do not
restate it; they carry the anchor id from the last column, and
`Team/scripts/read-contract-lint.sh` verifies each id is still present in every named
definition file (→ DEC 2026-08-07a). The gate is bound into `Team/scripts/tests/run.sh`
and wind-down runs that suite fail-closed, but there is no root `pre-commit` hook — it
fires at wind-down and on demand, not per commit, so a broken anchor can survive until the
next wind-down (→ DEC 2026-08-25m).

<!-- read-contract -->

| Rol | Okur | Ne zaman | Tanım dosyası | Anchor |
|---|---|---|---|---|
| **Deniz** (single writer) | **Mandatory:** the header block (precedence, single-writer, sister-repo boundary, not-multi-tenant) + §3 + §5 + §7 + §8 + §9 + §10 + §12. **On demand:** §1 (env/zod schema, Redis/upstream, OpenAPI tooling, scheduled work), §2 (a new or changed endpoint, DTO tier, list envelope), §4 (any DTO, route or `openapi.json` change), §6 (a TR+EN field, a slug, a user-facing message), §11.1 (a fresh clone or a new sibling repo), §11.2 (before every `gh` invocation — PR create, checks, anything else) | The mandatory set before writing anything in this repo, on every task; an on-demand section the moment the task reaches the trigger named beside it | `Team/roles/deniz.md` | `READ-ENG-API` |
| **Review legs** (`code-reviewer`, `security-privacy-reviewer`, validator) | §1 stack lock, §3, §5 and §8 — the repo engineering truth a finding is scored against — plus §2 and §4 when the diff carries API surface or contract. §10 for context only: it is the author's half of the loop and a leg never acts on it | On every `cografya_api` review leg, before assigning a severity to a finding | `Team/roles/reviewer-critical.md` `Team/roles/reviewer-routine.md` `Team/roles/validator.md` | `READ-ENG-API-REVIEWER` |

<!-- /read-contract -->

**Why the split falls there.** The mandatory set is the part whose violation is invisible
from the diff surface: §3 and §5 are broken by changes that do not look like security or
data changes (a helper refactor that reorders a published array, a hand-run key drifting
into the boot schema), and §7–§10 plus §12 govern how any change lands at all — including
§8's verification lanes, which no CI job runs for you. The on-demand set is keyed to a
trigger the task itself makes visible (an endpoint, a DTO, `openapi.json`, a TR+EN field),
and part of it has a machine gate behind that catches a miss: §1's strict-TypeScript half
is held by the `Typecheck & Lint` job and its env half by boot-time validation, while §4
is held by `openapi-check`. **§11.2 is the exception in that set** — its trigger is an
action rather than a diff surface, because a PR opened under the wrong GitHub identity
leaves no trace in the diff at all.

Deniz's obligations toward `CONTENT-STYLE.md`, `SEO-POLICY.md` Part A, `GLOSSARY.md` and
the provenance ledger are owned by those documents' own tables, not by this one.
