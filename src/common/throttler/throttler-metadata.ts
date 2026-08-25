import { SetMetadata } from '@nestjs/common';

/**
 * The TWO route-level throttling signals `TrustedClientThrottlerGuard` reads, and the only
 * additions this review round makes under `src/common/throttler/` — the trusted-client
 * exemption's own decision logic (`isTrustedClientRequest`, the safe-method scope, the
 * fail-closed secret handling) is untouched.
 *
 * Both are plain `SetMetadata` markers rather than behaviour: the guard is the single place
 * that decides what they mean, so a route can never accidentally change the limiter itself.
 */

/** Reflector key for {@link ThrottlerErrorMessage}. */
export const THROTTLER_ERROR_MESSAGE = 'throttler:error-message';

/** Reflector key for {@link NoTrustedClientExemption}. */
export const NO_TRUSTED_CLIENT_EXEMPTION = 'throttler:no-trusted-client-exemption';

/**
 * Declares the body message a 429 from this route (or every route of this controller) carries,
 * replacing `@nestjs/throttler`'s built-in English prose `ThrottlerException: Too Many Requests`
 * (`throttler.exception.js`) — `CODE136-I1`/`SEC136-I4`.
 *
 * **Scope is deliberately per-route/per-controller, not module-wide.** `ThrottlerModule.forRoot`
 * accepts an `errorMessage`, but that value applies to EVERY route in the app, so a single auth
 * i18n key would start appearing in the 429 body of every public content endpoint too — a
 * contract change far wider than the finding. Routes that declare nothing keep the framework
 * default, unchanged.
 *
 * The value is an i18n KEY, never reader-facing prose (`ENGINEERING.md` §6): the sentence a
 * reader sees is `cografya_web`'s.
 */
export const ThrottlerErrorMessage = (message: string): MethodDecorator & ClassDecorator =>
  SetMetadata(THROTTLER_ERROR_MESSAGE, message);

/**
 * Takes a route back OUT of the trusted-client throttle exemption — `SEC136-I3`, and the
 * per-route opt-out `trusted-client.ts`'s own posture paragraph asks for by name ("the exemption
 * needs a per-route opt-out rather than another exception").
 *
 * **This is NOT `@SkipThrottle`, and the difference is the whole point.** `@SkipThrottle` removes
 * throttling from a route; this marker removes the EXEMPTION from a route, so the route stays
 * subject to every ceiling that applies to it. Both reviewer legs that raised the finding
 * forbade `@SkipThrottle` here for exactly that inversion.
 */
export const NoTrustedClientExemption = (): MethodDecorator & ClassDecorator =>
  SetMetadata(NO_TRUSTED_CLIENT_EXEMPTION, true);
