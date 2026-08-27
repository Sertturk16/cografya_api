import { randomInt } from 'node:crypto';
import * as argon2 from 'argon2';

/**
 * Argon2id profile and password-policy constants, mirrored BY HAND from
 * `src/auth/password-hasher.service.ts` (`PASSWORD_HASH_OPTIONS`) and
 * `src/auth/auth.constants.ts` (`PASSWORD_MIN_LENGTH`/`PASSWORD_MAX_LENGTH`) — not imported,
 * for the same reason `local-database-guard.ts` states in its own header: this tool runs under
 * Node's native TypeScript type-stripping and nothing under `src/` is reachable from it without
 * a build step this tool deliberately has none of (measured, not assumed — see that file).
 *
 * Keeping these in sync by hand is a real, recorded cost, and the repo already accepts it
 * elsewhere for the identical reason (`user.entity.ts`'s `CHK_users_profile_shape` docblock:
 * "the migration is mirrored token for token … nothing machine-compares the two"). If either
 * source ever changes, update this file's copy in the same PR.
 *
 * The values below match `password-hasher.service.ts` and `auth.constants.ts` as read
 * 2026-08-27.
 */
export const PASSWORD_HASH_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
});

export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 128;

/** Mirrors `isPasswordPolicyCompliant` in `src/auth/password-policy.ts` — see this file's header. */
export function isPasswordPolicyCompliant(value: string): boolean {
  if (value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) return false;
  if (!/[a-z]/.test(value)) return false;
  if (!/[A-Z]/.test(value)) return false;
  if (!/[0-9]/.test(value)) return false;
  return true;
}

const LOWER = 'abcdefghijkmnpqrstuvwxyz'; // no 'l'/'o' — avoids 1/0 confusion when read aloud
const UPPER = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no 'I'/'O'
const DIGITS = '23456789'; // no '0'/'1'
const ALL = LOWER + UPPER + DIGITS;
const GENERATED_PASSWORD_LENGTH = 24;

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)] ?? '';
}

/**
 * Generates a fresh, policy-compliant password at RUNTIME. Never returns a fixed or
 * previously-seen value, and the caller is responsible for never writing the result to a file —
 * this function only produces the string. One of each required character class is placed first
 * (so the policy is met by construction, not by chance on a 24-character draw) and the whole
 * string is then shuffled with the same CSPRNG-backed `randomInt` so the fixed classes are not
 * positionally guessable.
 */
export function generateCompliantPassword(): string {
  const required = [pick(LOWER), pick(UPPER), pick(DIGITS)];
  const rest = Array.from({ length: GENERATED_PASSWORD_LENGTH - required.length }, () => pick(ALL));
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const a = chars[i];
    const b = chars[j];
    if (a === undefined || b === undefined) continue;
    chars[i] = b;
    chars[j] = a;
  }
  const password = chars.join('');
  /* istanbul ignore next -- construction guarantees this; kept as a fail-closed assertion */
  if (!isPasswordPolicyCompliant(password)) {
    throw new Error('generateCompliantPassword produced a non-compliant password — refusing.');
  }
  return password;
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, PASSWORD_HASH_OPTIONS);
}
