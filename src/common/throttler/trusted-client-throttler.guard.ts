import { randomBytes } from 'node:crypto';
import { type ExecutionContext, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { type Env } from '../../config/env.schema';
import { NO_TRUSTED_CLIENT_EXEMPTION, THROTTLER_ERROR_MESSAGE } from './throttler-metadata';
import { INTERNAL_REQUEST_HEADER, isTrustedClientRequest } from './trusted-client';
import {
  buildTrackerKey,
  resolveVisitorIdentity,
  VISITOR_ADDRESS_HEADER,
  VISITOR_FORWARD_TOKEN_HEADER,
  type TrackerFallbackReason,
} from './visitor-tracker';

/** The request shape `getTracker` reads. Narrower than the base class's `Record<string, any>` —
 * TypeScript checks method parameters BIVARIANTLY, so this narrowing type-checks even though it
 * would not for a plain function-typed property (SEC84-P1 §C). */
interface VisitorTrackerRequest {
  readonly ip?: string;
  readonly socket?: { readonly remoteAddress?: string };
  readonly headers: Record<string, string | string[] | undefined>;
}

/**
 * Global rate-limit guard with ONE added exemption: a trusted first-party caller (the web
 * SSG build) that presents the configured `INTERNAL_REQUEST_TOKEN` in the
 * `x-internal-request-token` header skips the limit — but ONLY on safe, side-effect-free
 * reads (GET/HEAD). Everything else — anonymous public traffic, and any non-safe method
 * even with a valid token — stays subject to the global 120 req/min (app.module.ts).
 *
 * Why a custom guard: `@SkipThrottle()` is a static, route-level decision and cannot depend
 * on a per-request header, so the conditional skip has to live in `shouldSkip`. The core
 * decision is the pure, unit-tested `isTrustedClientRequest`; this class only wires the
 * header + the zod-validated secret into it.
 *
 * Safe-method scope: the exemption's documented safety rationale (the exempted endpoints
 * are public, auth-less, cheap, cacheable reads — see `trusted-client.ts`, which owns the posture
 * and records why the retired "PII-free" clause does not change the conclusion) holds only for
 * reads. The roadmap
 * already commits admin CRUD, auth panels and an AI-vision POST (ENGINEERING.md §3); a leaked
 * token must never silently exempt a write/upload/brute-force surface from throttling.
 * Restricting the exemption to GET/HEAD enforces a claim the exemption already makes about
 * itself, and changes no live behaviour (every current route is GET).
 *
 * **Safe-method scope is no longer sufficient on its own, which is why `@NoTrustedClientExemption`
 * exists** (`SEC136-I3`). `GET /api/auth/session` is the first authenticated, PII-returning GET in
 * this repo: the method check waves it through, because a method is not a statement about what a
 * route reads. The per-route opt-out below is the narrowing `trusted-client.ts`'s own posture
 * paragraph asks for by name, and it is checked FIRST — see `shouldSkip`.
 *
 * `@SkipThrottle()` (e.g. `/health`) is NOT preserved by the `super.shouldSkip()` call: in
 * `@nestjs/throttler@6.5.0` the base `shouldSkip` is literally `return false` and never
 * reads skip metadata — the decorator is honoured by the inherited `canActivate`'s own
 * reflector loop, untouched by this subclass. The `super.shouldSkip()` call below is
 * forward-compatible defensive forwarding, not the mechanism that preserves route skips.
 *
 * Fail-closed: with `INTERNAL_REQUEST_TOKEN` unset the exemption does not exist and every
 * request is throttled. A single boot-time log line records which state is active (no
 * per-request logging, never the secret value). Security posture is in `trusted-client.ts`.
 *
 * **SEC84-P1 — identity and bypass are two DIFFERENT methods reading two DIFFERENT
 * variables, and that separation is structural, not a convention.** `shouldSkip` (above,
 * UNCHANGED by this plan) decides the bypass and reads `INTERNAL_REQUEST_TOKEN`; `getTracker`
 * (below, new) decides the TRACKED IDENTITY and reads `VISITOR_FORWARD_TOKEN`. A caller that
 * proves its `VISITOR_FORWARD_TOKEN` gets its OWN throttle bucket instead of sharing the peer's —
 * it never gets `shouldSkip === true`, because `getTracker` cannot influence `shouldSkip` and
 * `shouldSkip`'s GET/HEAD-only, fail-closed logic above is untouched. See `visitor-tracker.ts`
 * for the two-axis resolution (peer vs. forwarded) `getTracker` delegates to.
 */
@Injectable()
export class TrustedClientThrottlerGuard extends ThrottlerGuard implements OnModuleInit {
  private readonly exemptionLogger = new Logger('TrustedClientThrottle');

  /**
   * One 32-byte random salt per PROCESS, minted once here and never logged, persisted or
   * configurable. `getTracker` HMACs the resolved identity under it (`buildTrackerKey`) so the
   * value handed to `ThrottlerLimitDetail.tracker` — and anything a future error message or heap
   * dump could reach — is meaningless outside this process. This is defence in depth: the
   * throttler already sha256's the composite bucket key before it reaches storage, so the raw
   * address never reached the store even without this salt (SEC84-P1 §F).
   */
  private readonly trackerSalt = randomBytes(32);

  /** At most one log line per process PER REASON CODE — a `Set` over the closed seven-member
   * `TrackerFallbackReason` union, never a growing map, so the log surface is structurally
   * bounded rather than timer- or volume-limited (SEC84-P1 §F). */
  private readonly loggedTrackerReasons = new Set<TrackerFallbackReason>();

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly config: ConfigService<Env, true>,
  ) {
    super(options, storageService, reflector);
  }

  /**
   * MUST call `super.onModuleInit()` first: the base `ThrottlerGuard` builds its internal
   * `throttlers` array there, so skipping it would silently leave the limiter uninitialised.
   * The added lines are the observability signal for the exemption (I5) and, since SEC84-P1, for
   * the separate visitor-forwarding mechanism — two independent boot states, two independent log
   * lines, neither ever printing the secret.
   */
  async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    const configured = this.config.get('INTERNAL_REQUEST_TOKEN', { infer: true });
    const active = configured !== undefined && configured !== '';
    this.exemptionLogger.log(
      active
        ? 'trusted-client throttle exemption: active'
        : 'trusted-client throttle exemption: inactive (INTERNAL_REQUEST_TOKEN not set)',
    );

    const configuredForwardToken = this.config.get('VISITOR_FORWARD_TOKEN', { infer: true });
    const forwardingActive = configuredForwardToken !== undefined && configuredForwardToken !== '';
    this.exemptionLogger.log(
      forwardingActive
        ? 'visitor-forwarding tracker: active'
        : 'visitor-forwarding tracker: inactive (VISITOR_FORWARD_TOKEN not set)',
    );
  }

  /**
   * SEC84-P1 — overrides the base `ThrottlerGuard.getTracker` (default: `return req.ip`) for
   * EVERY throttled route (the global window and every `@Throttle` ceiling alike — `getTracker`
   * becomes `commonOptions.getTracker` because `ThrottlerModule.forRoot` is called with an
   * array). Resolution is delegated entirely to the pure `resolveVisitorIdentity`
   * (`visitor-tracker.ts`); this method only wires the request/env into it and HMACs the result
   * under {@link trackerSalt} so no raw address is ever the literal tracker string.
   *
   * The fallback reason (when the caller is not an authenticated forwarder, or its forwarded
   * value is invalid) is logged AT MOST ONCE PER PROCESS PER CODE, and never for the two normal
   * cases (no forwarding token configured; a direct caller sending none) — those carry no
   * `reason` at all, by design (§F).
   */
  // NOT `async`, deliberately: every step is pure/synchronous (`resolveVisitorIdentity`,
  // `buildTrackerKey`), so an `async` body here would be flagged by
  // `@typescript-eslint/require-await` for having no `await`. The base class's own signature is
  // `Promise<string>` (it awaits `getTracker` in `handleRequest`), so the value is wrapped rather
  // than the method marked `async` for nothing.
  protected getTracker(req: VisitorTrackerRequest): Promise<string> {
    const result = resolveVisitorIdentity({
      resolvedPeer: req.ip,
      rawSocketAddress: req.socket?.remoteAddress,
      forwardTokenHeader: req.headers[VISITOR_FORWARD_TOKEN_HEADER],
      addressHeader: req.headers[VISITOR_ADDRESS_HEADER],
      configuredForwardToken: this.config.get('VISITOR_FORWARD_TOKEN', { infer: true }),
      isProduction: this.config.get('NODE_ENV', { infer: true }) === 'production',
    });

    if (result.reason !== undefined && !this.loggedTrackerReasons.has(result.reason)) {
      this.loggedTrackerReasons.add(result.reason);
      this.exemptionLogger.warn(`visitor tracker fell back to the peer identity: ${result.reason}`);
    }

    return Promise.resolve(buildTrackerKey(this.trackerSalt, result.identity));
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    // The per-route opt-out is read BEFORE anything else, and returns without consulting the
    // base class. Order is load-bearing, not stylistic: `super.shouldSkip` is literally
    // `return false` in @nestjs/throttler@6.5.0, but the forwarding call below exists precisely
    // because that may change — and if it ever returns true for some future reason, an opt-out
    // route would be skipped before this class looked at its own metadata. Checking first makes
    // the opt-out hold whatever the base does (SEC136-I3).
    const optedOut = this.reflector.getAllAndOverride<boolean | undefined>(
      NO_TRUSTED_CLIENT_EXEMPTION,
      [context.getHandler(), context.getClass()],
    );
    if (optedOut === true) {
      return false;
    }

    // Forward to the base. NOTE: this does NOT preserve @SkipThrottle() (see the class
    // docblock) — it is forward-compatible defensive forwarding.
    if (await super.shouldSkip(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      method: string;
      headers: Record<string, string | string[] | undefined>;
    }>();

    // Scope the exemption to safe, side-effect-free reads only. A leaked token must never
    // exempt a future write/upload/auth POST from throttling (ENGINEERING.md §3); all current
    // routes are GET, so this restricts nothing that exists today.
    const method = request.method.toUpperCase();
    // CONTROL-C (temporary, revert-to-red evidence for SEC84-P1 E-5): the GET/HEAD-only early
    // return is deleted.
    void method;

    const rawHeader = request.headers[INTERNAL_REQUEST_HEADER];
    const presentedToken = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    return isTrustedClientRequest(
      presentedToken,
      this.config.get('INTERNAL_REQUEST_TOKEN', { infer: true }),
    );
  }

  /**
   * Lets a route (or a whole controller) declare the i18n key its 429 body carries, instead of
   * `@nestjs/throttler`'s built-in English prose (`CODE136-I1`/`SEC136-I4`).
   *
   * Falls through to `super` — i.e. the framework default — for every route that declares
   * nothing, so this is additive: no existing 429 body changes.
   */
  protected async getErrorMessage(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<string> {
    const declared = this.reflector.getAllAndOverride<string | undefined>(THROTTLER_ERROR_MESSAGE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (typeof declared === 'string' && declared.length > 0) {
      return declared;
    }
    return super.getErrorMessage(context, throttlerLimitDetail);
  }
}
