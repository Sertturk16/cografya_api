import { describe, expect, it } from '@jest/globals';
import {
  PASSWORD_HASH_OPTIONS,
  PasswordHasherService,
  PasswordHashVerificationError,
} from './password-hasher.service';

describe('PasswordHasherService', () => {
  const service = new PasswordHasherService();

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
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(malformed);
      expect(message).not.toContain(password);
    }
  });
});
