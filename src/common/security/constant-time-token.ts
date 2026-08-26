import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * The single constant-time secret-comparison primitive for this repo (SEC84-P1). Both
 * `trusted-client.ts`'s `isTrustedClientRequest` (the throttle-exemption bypass secret) and
 * `docs-gate.ts`'s Basic-auth check (the `/docs` gate) delegate to this function rather than
 * keeping their own copy, so there is exactly one place that gets the hardening right.
 *
 * **Fail-closed:** with no configured secret, nothing is trusted — an absent presented value is
 * likewise never trusted. **Constant-time:** both sides are reduced to fixed-length SHA-256
 * digests before `timingSafeEqual`, so neither the secret's length nor its value leaks through
 * timing (a plain `===` on a bypass secret is a timing oracle; digesting first also means
 * `timingSafeEqual`, which throws on length mismatch, never sees two raw strings of different
 * length).
 *
 * **Binding rule (SEC84-P1 plan, "Risks and explicit stops"):** if `trusted-client.spec.ts`
 * needs ANY modification to stay green after `isTrustedClientRequest` delegates here, that is a
 * STOP — it means the delegation changed behaviour — and the fix is to revert the delegation,
 * not to edit the spec. This function's own body is `isTrustedClientRequest`'s original body,
 * moved rather than rewritten, so no such edit should ever be needed.
 */
export function constantTimeTokenMatch(
  presented: string | undefined,
  configured: string | undefined,
): boolean {
  if (configured === undefined || configured === '' || presented === undefined) {
    return false;
  }

  const presentedDigest = createHash('sha256').update(presented).digest();
  const configuredDigest = createHash('sha256').update(configured).digest();
  return timingSafeEqual(presentedDigest, configuredDigest);
}
