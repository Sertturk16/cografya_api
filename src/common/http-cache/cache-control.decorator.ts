import { SetMetadata } from '@nestjs/common';

/** Reflector metadata key carrying a route's desired `Cache-Control` header value. */
export const CACHE_CONTROL_METADATA = 'cache-control-header';

/**
 * Declares the `Cache-Control` header value for a public read route. Unlike the raw
 * `@Header('Cache-Control', …)` decorator (which sets the header BEFORE the handler runs,
 * so it also rides 5xx error responses and lets a caching intermediary make a resolved
 * outage look ongoing), this is honoured by `CacheControlInterceptor`, which sets the
 * header ONLY on a successful (2xx) response — an error path leaves it unset.
 *
 * Use on cacheable public GET routes (the SSG/SEO content reads). Do NOT put it on
 * mutating or auth-bearing routes.
 */
export const CacheControl = (value: string): MethodDecorator & ClassDecorator =>
  SetMetadata(CACHE_CONTROL_METADATA, value);
