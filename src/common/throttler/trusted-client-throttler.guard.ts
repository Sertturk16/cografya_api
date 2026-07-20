import { type ExecutionContext, Injectable } from '@nestjs/common';
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
 * `x-internal-request-token` header skips the limit. Everything else — anonymous public
 * traffic — stays subject to the global 120 req/min (app.module.ts).
 *
 * Why a custom guard: `@SkipThrottle()` is a static, route-level decision and cannot depend
 * on a per-request header, so the conditional skip has to live in `shouldSkip`. The core
 * decision is the pure, unit-tested `isTrustedClientRequest`; this class only wires the
 * header + the zod-validated secret into it, and preserves the base `@SkipThrottle()`
 * behaviour (e.g. `/health`) by deferring to `super.shouldSkip` first.
 *
 * Fail-closed: with `INTERNAL_REQUEST_TOKEN` unset the exemption does not exist and every
 * request is throttled. Security posture is documented in `trusted-client.ts`.
 */
@Injectable()
export class TrustedClientThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly config: ConfigService<Env, true>,
  ) {
    super(options, storageService, reflector);
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    // Preserve route-level @SkipThrottle() (e.g. /health) before considering the exemption.
    if (await super.shouldSkip(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const rawHeader = request.headers[INTERNAL_REQUEST_HEADER];
    const presentedToken = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    return isTrustedClientRequest(
      presentedToken,
      this.config.get('INTERNAL_REQUEST_TOKEN', { infer: true }),
    );
  }
}
