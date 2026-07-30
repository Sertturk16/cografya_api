import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, tap } from 'rxjs';

/**
 * How old, in seconds, the cached data behind this response is (SPEC-ADDENDUM §6.1 / B7).
 *
 * A HEADER, not a body field, and that is a contract decision rather than a style one: the value
 * changes on every single request, so putting it in the body would make the ETag change on every
 * request too — and the ETag is what lets Vera's ISR revalidate cost almost nothing. Everything
 * that stays in the body (`generatedAtUtc`, `freshness`, `staleSinceUtc`) changes only when the
 * DATA changes, which is exactly what makes a strong-ish ETag possible.
 */
export const MARINE_CACHE_AGE_HEADER = 'X-Marine-Cache-Age';

/**
 * Symbol key the age travels on, from the service to the interceptor.
 *
 * A symbol because `JSON.stringify` ignores symbol-keyed properties: the number reaches the
 * header without ever appearing in the payload, so the body stays byte-identical between two
 * requests that serve the same cached data. A string key (even a `_private` one) would leak into
 * the response and quietly break the ETag it exists to protect.
 */
const CACHE_AGE_SECONDS = Symbol('marineCacheAgeSeconds');

/**
 * Attach a cache age to a response body.
 *
 * Returns the same object; the property is non-enumerable and symbol-keyed, so it is invisible to
 * serialization, to `Object.keys`, and to the OpenAPI shape.
 */
export function withCacheAge<T extends object>(body: T, cacheAgeSeconds: number | null): T {
  if (cacheAgeSeconds === null) return body;
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
 * Publishes `X-Marine-Cache-Age` for any handler whose body carries one.
 *
 * ## Why an interceptor and why only on success
 * Identical reasoning to `CacheControlInterceptor` (PR #23, I1): the header is set inside `tap`
 * on the SUCCESS stream, so an error response never carries a cache-age claim about data it did
 * not serve.
 *
 * ## Registered even though no endpoint sets an age yet
 * M2 builds the cache; the value endpoints that read from it land in M3/M4. Wiring the mechanism
 * now — with the helper, the symbol and this interceptor tested together — means the M3 adapter
 * adds one `withCacheAge(...)` call rather than also having to get this plumbing right while
 * doing something harder. A handler that attaches nothing is passed through untouched.
 */
@Injectable()
export class MarineCacheAgeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      tap((body: unknown) => {
        const age = readCacheAge(body);
        if (age === null) return;
        const response = context
          .switchToHttp()
          .getResponse<{ setHeader(name: string, value: string): void }>();
        response.setHeader(MARINE_CACHE_AGE_HEADER, String(age));
      }),
    );
  }
}
