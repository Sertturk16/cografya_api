import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  PASSWORD_HASH_OPTIONS,
  PasswordHasherService,
  PasswordHashingError,
  PasswordHashVerificationError,
} from './password-hasher.service';

describe('PasswordHasherService', () => {
  const service = new PasswordHasherService();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('writes an Argon2id PHC string carrying the reviewed parameters', async () => {
    const encoded = await service.hash('Synthetic-Password-1');

    expect(encoded).toMatch(/^\$argon2id\$v=19\$/);
    expect(encoded).toContain(`m=${PASSWORD_HASH_OPTIONS.memoryCost}`);
    expect(encoded).toContain(`t=${PASSWORD_HASH_OPTIONS.timeCost}`);
    expect(encoded).toContain(`p=${PASSWORD_HASH_OPTIONS.parallelism}`);
  });

  it('accepts the matching password and rejects a different password', async () => {
    const encoded = await service.hash('Synthetic-Password-2');

    await expect(service.verify(encoded, 'Synthetic-Password-2')).resolves.toBe(true);
    await expect(service.verify(encoded, 'Different-Password-2')).resolves.toBe(false);
  });

  it('uses a fresh salt for each hash', async () => {
    const first = await service.hash('Synthetic-Password-3');
    const second = await service.hash('Synthetic-Password-3');

    expect(first).not.toBe(second);
  });

  it('fails closed on a malformed hash without echoing either input', async () => {
    const malformed = 'not-a-phc-string';
    const password = 'Synthetic-Password-4';

    try {
      await service.verify(malformed, password);
      throw new Error('expected malformed hash verification to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(PasswordHashVerificationError);
      // A secret reaches a caller through three serialisable channels, not one: `message`,
      // the `cause` chain and `stack`. Pinning only `message` leaves a later
      // `super(message, { cause })` or a `stack` append free to reopen this boundary with
      // the test still green (PR #133 round 2, SEC133R2-M1).
      const message = error instanceof Error ? error.message : String(error);
      const cause = error instanceof Error ? error.cause : undefined;
      const stack = error instanceof Error ? String(error.stack) : '';
      expect(message).not.toContain(malformed);
      expect(message).not.toContain(password);
      expect(cause).toBeUndefined();
      expect(stack).not.toContain(malformed);
      expect(stack).not.toContain(password);
    }
  });

  it('wraps an argon2 hashing failure without echoing the password', async () => {
    // `import * as argon2` compiles to TypeScript's `__importStar` interop, which hands each
    // importer a namespace object whose members are NON-CONFIGURABLE getters onto the one real
    // `module.exports`. Spying on that namespace throws; spying on the module object itself is
    // seen through the getters, including by the service under test. `jest.requireActual` reads
    // the same active CJS registry entry a normal `require` would.
    const argon2Module = jest.requireActual<typeof import('argon2')>('argon2');
    const password = 'Synthetic-Password-5';
    const hashSpy = jest
      .spyOn(argon2Module, 'hash')
      .mockImplementation(() => Promise.reject(new Error('synthetic native argon2 failure')));

    try {
      await service.hash(password);
      throw new Error('expected the hashing failure to be wrapped');
    } catch (error) {
      expect(error).toBeInstanceOf(PasswordHashingError);
      // Same three-channel pin as the verify path above (SEC133R2-M1).
      const message = error instanceof Error ? error.message : String(error);
      const cause = error instanceof Error ? error.cause : undefined;
      const stack = error instanceof Error ? String(error.stack) : '';
      expect(message).not.toContain(password);
      expect(cause).toBeUndefined();
      expect(stack).not.toContain(password);
    }

    expect(hashSpy).toHaveBeenCalledTimes(1);
  });
});
