import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Observable, tap } from 'rxjs';
import { CACHE_CONTROL_METADATA } from './cache-control.decorator';

/** Structural view of the bits of the HTTP response we touch — avoids an express type dep. */
interface ResponseWithSetHeader {
  setHeader(name: string, value: string): void;
}

/**
 * Sets the `Cache-Control` header declared by `@CacheControl(...)` — but ONLY on a
 * successful response.
 *
 * WHY an interceptor instead of `@Header('Cache-Control', …)`: the `@Header` decorator
 * applies the header before the handler runs, so Nest's default exception path keeps it
 * on 5xx responses too. A transient DB error would then return a real 500 that still
 * carries `max-age=300, stale-while-revalidate=86400`, letting a caching intermediary
 * serve/prolong a resolved outage for up to five minutes (silent-failure-hunter, PR #23
 * I1). Here the header is set inside `tap` on the SUCCESS stream: when the handler throws,
 * the error notification skips the `tap` callback, so error responses are never cached.
 *
 * Registered globally (APP_INTERCEPTOR); routes without the metadata are passed through
 * untouched, so `/health` and any future non-cached route are unaffected.
 */
@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const value = this.reflector.getAllAndOverride<string | undefined>(CACHE_CONTROL_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (value === undefined) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse<ResponseWithSetHeader>();
        response.setHeader('Cache-Control', value);
      }),
    );
  }
}
