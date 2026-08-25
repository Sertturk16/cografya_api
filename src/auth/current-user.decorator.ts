import {
  createParamDecorator,
  InternalServerErrorException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { AUTHENTICATED_USER_REQUEST_KEY, type AuthenticatedUser } from './authenticated-user';

type RequestWithAuthenticatedUser = Request &
  Partial<Record<typeof AUTHENTICATED_USER_REQUEST_KEY, AuthenticatedUser>>;

/**
 * Reads `request.authenticatedUser`, written by `AccessTokenGuard` (parent §7.2).
 *
 * **Fail-closed, not `undefined`.** A route that carries `@CurrentUser()` but forgot
 * `@UseGuards(AccessTokenGuard)` would otherwise silently hand the handler `undefined`, which a
 * careless handler can treat as "no user" instead of "misconfigured route" — a real
 * authorization accident. Throwing here turns that mistake into an immediate 500 at the one
 * route that has it, instead of a quiet gap discovered later.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<RequestWithAuthenticatedUser>();
    const user = request[AUTHENTICATED_USER_REQUEST_KEY];
    if (!user) {
      throw new InternalServerErrorException(
        '@CurrentUser() was used on a route with no AccessTokenGuard — request.authenticatedUser is unset.',
      );
    }
    return user;
  },
);
