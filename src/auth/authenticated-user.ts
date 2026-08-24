/** What `AccessTokenGuard` attaches to `request` and `@CurrentUser()` reads back — id only. */
export interface AuthenticatedUser {
  readonly id: string;
}

/**
 * The single name of the `request` property `AccessTokenGuard` writes to and `@CurrentUser()`
 * reads from — one constant so the two files can never drift onto two different keys.
 */
export const AUTHENTICATED_USER_REQUEST_KEY = 'authenticatedUser' as const;
