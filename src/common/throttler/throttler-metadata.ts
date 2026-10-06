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
 * Declares the i18n key a 429 from this route (or every route of this controller) carries.
 * A route that declares nothing answers `COMMON_ERROR_KEYS.tooManyRequests` instead
 * (`TrustedClientThrottlerGuard.getErrorMessage`); neither ever answers `@nestjs/throttler`'s
 * English prose. Declare one where the web should be able to say something route-specific (a
 * tighter `@Throttle` ceiling, the auth IP axis).
 *
 * The value is a key imported from the module's `*-error-keys.ts`, never reader-facing prose
 * (`src/common/error-keys.spec.ts` enforces it): the sentence a reader sees is `cografya_web`'s.
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
