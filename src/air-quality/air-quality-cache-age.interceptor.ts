import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, tap } from 'rxjs';

/**
 * How old, in seconds, the cached run behind this response is.
 *
 * A HEADER, not a body field, and that is a contract decision rather than a style one (the
 * `X-Marine-Cache-Age` reasoning, SPEC-ADDENDUM §6.1/B7): the value changes on every request, so
 * putting it in the body would change the ETag on every request too — and the ETag is what makes
 * the web repo's ISR revalidation nearly free. Everything that stays in the body
 * (`fetchedAtUtc`, `freshness`, `staleSinceUtc`) changes only when the DATA changes.
 *
 * A leg-specific name, like marine's. Converging the two onto one neutral header is a RECORDED
 * DEBT (DEC 2026-07-31b), not an oversight, and A2b deliberately does not rename marine's.
 */
export const AIR_QUALITY_CACHE_AGE_HEADER = 'X-Air-Quality-Cache-Age';

/**
 * Symbol key the age travels on, from the service to the interceptor.
 *
 * A symbol because `JSON.stringify` ignores symbol-keyed properties: the number reaches the header
 * without ever appearing in the payload, so two requests serving the same cached run produce
 * byte-identical bodies. A string key — even a `_private` one — would leak into the response and
 * quietly break the ETag it exists to protect.
 */
const CACHE_AGE_SECONDS = Symbol('airQualityCacheAgeSeconds');

/**
 * Attach a cache age to a response body. Returns the same object; the property is
 * non-enumerable and symbol-keyed, so it is invisible to serialization, to `Object.keys` and to
 * the OpenAPI shape.
 */
export function withAirQualityCacheAge<T extends object>(
  body: T,
  cacheAgeSeconds: number | null,
): T {
  // A non-finite age is dropped rather than published: `Math.round(NaN)` is `NaN` and the header
  // would literally read `X-Air-Quality-Cache-Age: NaN`. The body handed in must be
  // REQUEST-OWNED — never a shared cached instance — because this attaches to the object itself.
  if (cacheAgeSeconds === null || !Number.isFinite(cacheAgeSeconds)) return body;
  Object.defineProperty(body, CACHE_AGE_SECONDS, {
    value: Math.max(0, Math.round(cacheAgeSeconds)),
    enumerable: false,
    configurable: true,
  });
  return body;
}

/** Read an attached cache age back off a body. `null` when the body carries none. */
export function readAirQualityCacheAge(body: unknown): number | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as Record<symbol, unknown>)[CACHE_AGE_SECONDS];
  return typeof value === 'number' ? value : null;
}

/**
 * Publishes {@link AIR_QUALITY_CACHE_AGE_HEADER} for any handler whose body carries one.
 *
 * The header is set inside `tap` on the SUCCESS stream only, so an error response never carries a
 * cache-age claim about data it did not serve (the `CacheControlInterceptor` precedent, PR #23
 * I1). A handler that attaches nothing — `index-system`, which has no cache behind it — is passed
 * through untouched.
 */
@Injectable()
export class AirQualityCacheAgeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      tap((body: unknown) => {
        const age = readAirQualityCacheAge(body);
        if (age === null) return;
        const response = context
          .switchToHttp()
          .getResponse<{ setHeader(name: string, value: string): void }>();
        response.setHeader(AIR_QUALITY_CACHE_AGE_HEADER, String(age));
      }),
    );
  }
}
