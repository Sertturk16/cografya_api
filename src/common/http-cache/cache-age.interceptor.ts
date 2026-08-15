import { type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { type Observable, tap } from 'rxjs';

/**
 * "How old is the cached data behind this response?", published as a response header.
 *
 * The marine and air-quality legs each wrote this mechanism out in full — 87 and 84 lines, the
 * same symbol trick, the same rounding, the same `tap`, and comments written in parallel. This is
 * the single class they collapse into. The HEADER NAME is the only thing that differed, so it is
 * the only thing that is a parameter.
 *
 * ## The header names do NOT converge here, and that is the point
 * `X-Marine-Cache-Age` and `X-Air-Quality-Cache-Age` are an external contract the web repo reads.
 * Converging them on one neutral name is the BREAKING half of this debt (`DEC 2026-07-31b` A-6),
 * deliberately excluded: each leg keeps passing its own name, the bytes on the wire do not move,
 * and the day the neutral name is ruled it becomes a one-line change instead of a rewrite.
 *
 * ## A HEADER, not a body field — a contract decision, not a style one
 * The value changes on every single request. In the body it would change the ETag on every
 * request too, and the ETag is what makes the web repo's ISR revalidation nearly free. Everything
 * that stays in the body (`generatedAtUtc`, `freshness`, `staleSinceUtc`) changes only when the
 * DATA changes, which is exactly what makes a strong-ish ETag possible.
 *
 * ## Why there is ONE symbol rather than one per leg
 * Both interceptors are bound at their own controller, so a marine body never passes through the
 * air-quality interceptor and vice versa — the ages cannot cross. A per-leg symbol factory would
 * be machinery guarding a case the routing already forbids (`ENGINEERING.md` §12: YAGNI is the
 * default). If a single response body is ever composed from both legs, that is the moment to
 * revisit this, and the moment it would first be true.
 *
 * The trade that collapse makes, stated so the revisit trigger above is not the only record of it:
 * each predecessor carried its OWN symbol, so a leg mix-up used to produce an ABSENT header, which
 * is visible. With one symbol a mix-up would publish the other leg's age instead — a wrong value,
 * published silently. Not reachable today, and worth knowing before the second body composition
 * arrives.
 *
 * ## NAME COLLISION — the wiring round must delete the marine pair in the SAME commit
 * `src/marine/marine-cache-age.interceptor.ts:36,52` exports `withCacheAge` and `readCacheAge`
 * with identical names and identical signatures to the two below, keyed on a DIFFERENT module
 * -private symbol. Importing one and reading with the other is not a type error and not a unit
 * failure: `readCacheAge` simply returns `null` and the header disappears. And it disappears
 * loudly in the wrong direction — `main.ts:33` advertises `X-Marine-Cache-Age` in the CORS
 * `exposedHeaders`, so the browser is offered a header that never arrives and cannot tell "cache
 * age unknown" from "there is no cache behind this response".
 *
 * (The air-quality leg is not exposed to this: its functions are named
 * `withAirQualityCacheAge` / `readAirQualityCacheAge`, so a mixed import there is a compile error.)
 *
 * So the marine conversion is one commit, not two: switch `marine-values.service.ts` and
 * `marine.controller.ts` to these functions AND delete `marine-cache-age.interceptor.ts`'s
 * `withCacheAge`/`readCacheAge` in the same change, keeping its `MARINE_CACHE_AGE_HEADER` export.
 * `test/marine-values.e2e-spec.ts:474,529,643` assert the header, so `Test (e2e)` catches a
 * half-done conversion — but it catches it after the fact, and this note is how it is not made.
 */

/**
 * The key the age travels on, from the service to the interceptor.
 *
 * A symbol because `JSON.stringify` ignores symbol-keyed properties: the number reaches the header
 * without ever appearing in the payload, so two requests serving the same cached data produce
 * byte-identical bodies. A string key — even a `_private` one — would leak into the response and
 * quietly break the ETag it exists to protect.
 *
 * Module-private: the only ways in and out are {@link withCacheAge} and {@link readCacheAge}.
 */
const CACHE_AGE_SECONDS = Symbol('cacheAgeSeconds');

/**
 * Attach a cache age to a response body.
 *
 * Returns the same object; the property is non-enumerable and symbol-keyed, so it is invisible to
 * serialization, to `Object.keys`, and to the OpenAPI shape.
 */
export function withCacheAge<T extends object>(body: T, cacheAgeSeconds: number | null): T {
  // A non-finite age is dropped rather than published: `Math.round(NaN)` is `NaN` and the header
  // would literally read `…-Cache-Age: NaN`, which every client would then have to defend against.
  // The body handed in must be REQUEST-OWNED — never a shared cached instance — because this
  // attaches to the object itself.
  if (cacheAgeSeconds === null || !Number.isFinite(cacheAgeSeconds)) return body;
  Object.defineProperty(body, CACHE_AGE_SECONDS, {
    value: Math.max(0, Math.round(cacheAgeSeconds)),
    enumerable: false,
    configurable: true,
  });
  return body;
}

/** Read an attached cache age back off a body. `null` when the body carries none. */
export function readCacheAge(body: unknown): number | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as Record<symbol, unknown>)[CACHE_AGE_SECONDS];
  return typeof value === 'number' ? value : null;
}

/**
 * Publishes the configured header for any handler whose body carries a cache age.
 *
 * ## Why only on success
 * The header is set inside `tap` on the SUCCESS stream (the `CacheControlInterceptor` precedent,
 * PR #23 I1), so an error response never carries a cache-age claim about data it did not serve. A
 * handler that attaches nothing — a constant, a plain Postgres read — passes through untouched.
 *
 * ## No `@Injectable()`, and what the wiring round must therefore do
 * The decorator is deliberately absent: this class takes a constructor argument Nest's DI cannot
 * supply, so advertising it as injectable would promise a resolvability it does not have (and
 * would fail at boot if someone registered it as a class provider). The two legs bind it as an
 * INSTANCE, which needs no provider at all:
 *
 * ```ts
 * @UseInterceptors(new CacheAgeInterceptor(MARINE_CACHE_AGE_HEADER))
 * ```
 *
 * So the conversion of each leg is: keep the leg's exported header-name constant, switch the
 * `@UseInterceptors(XCacheAgeInterceptor)` argument to the instance form above, and DELETE the
 * interceptor's entry from that module's `providers` array (`marine.module.ts`,
 * `air-quality.module.ts`). A leftover provider entry is what would break the boot.
 */
export class CacheAgeInterceptor implements NestInterceptor {
  /**
   * @param headerName the leg's own response header — `X-Marine-Cache-Age`,
   * `X-Air-Quality-Cache-Age`. Passed in rather than derived so the external contract stays
   * visible at the binding site, where a reviewer reads it.
   */
  constructor(private readonly headerName: string) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      tap((body: unknown) => {
        const age = readCacheAge(body);
        if (age === null) return;
        const response = context
          .switchToHttp()
          .getResponse<{ setHeader(name: string, value: string): void }>();
        response.setHeader(this.headerName, String(age));
      }),
    );
  }
}
