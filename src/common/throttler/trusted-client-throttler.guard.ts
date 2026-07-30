import { type ExecutionContext, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { type Env } from '../../config/env.schema';
import { INTERNAL_REQUEST_HEADER, isTrustedClientRequest } from './trusted-client';

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
 * are public, auth-less, PII-free, cheap, cacheable reads) holds only for reads. The roadmap
 * already commits admin CRUD, auth panels and an AI-vision POST (ENGINEERING.md §3); a leaked
 * token must never silently exempt a write/upload/brute-force surface from throttling.
 * Restricting the exemption to GET/HEAD enforces a claim the exemption already makes about
 * itself, and changes no live behaviour (every current route is GET).
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
 */
@Injectable()
export class TrustedClientThrottlerGuard extends ThrottlerGuard implements OnModuleInit {
  private readonly exemptionLogger = new Logger('TrustedClientThrottle');

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
   * The added line is the single observability signal for the exemption (I5).
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
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    // Forward to the base first. NOTE: this does NOT preserve @SkipThrottle() (see the class
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
    if (method !== 'GET' && method !== 'HEAD') {
      return false;
    }

    const rawHeader = request.headers[INTERNAL_REQUEST_HEADER];
    const presentedToken = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    return isTrustedClientRequest(
      presentedToken,
      this.config.get('INTERNAL_REQUEST_TOKEN', { infer: true }),
    );
  }
}
