import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Explicit, reviewable Argon2id profile.
 *
 * OWASP's current minimum Argon2id profile (read 2026-08-24) is 19 MiB,
 * 2 iterations and parallelism 1. RFC 9106's memory-constrained profile is
 * stronger (64 MiB / 3 iterations); moving to it needs an operational benchmark
 * and a security review rather than an environment knob or a silent library-
 * default change.
 *
 * Primary sources:
 * - https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
 * - https://www.rfc-editor.org/rfc/rfc9106.html#name-parameter-choice
 * - https://github.com/ranisalt/node-argon2/tree/v0.45.1
 */
export const PASSWORD_HASH_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
});

export class PasswordHashingError extends Error {
  constructor() {
    super('Password hashing failed.');
    this.name = 'PasswordHashingError';
  }
}

export class PasswordHashVerificationError extends Error {
  constructor() {
    super('Password hash verification failed.');
    this.name = 'PasswordHashVerificationError';
  }
}

/**
 * Password-only cryptographic boundary. It owns no logger and never includes a
 * password or encoded hash in an error. Product password rules belong at the
 * registration/reset DTO boundary, not in this primitive.
 */
@Injectable()
export class PasswordHasherService {
  async hash(password: string): Promise<string> {
    try {
      return await argon2.hash(password, PASSWORD_HASH_OPTIONS);
    } catch {
      throw new PasswordHashingError();
    }
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash, password);
    } catch {
      // Malformed/corrupt PHC strings are an internal integrity failure. Fail
      // closed, but do not echo either secret-bearing input into logs/errors.
      throw new PasswordHashVerificationError();
    }
  }
}
