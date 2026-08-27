import {
  generateCompliantPassword,
  hashPassword,
  isPasswordPolicyCompliant,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from './credential-fixture.ts';

describe('isPasswordPolicyCompliant', () => {
  it('accepts a password carrying lower + upper + digit within range', () => {
    expect(isPasswordPolicyCompliant('Abcdef1')).toBe(true);
  });

  it('rejects missing a class or out-of-range length', () => {
    expect(isPasswordPolicyCompliant('abcdef1')).toBe(false); // no uppercase
    expect(isPasswordPolicyCompliant('ABCDEF1')).toBe(false); // no lowercase
    expect(isPasswordPolicyCompliant('Abcdefg')).toBe(false); // no digit
    expect(isPasswordPolicyCompliant('Ab1')).toBe(false); // too short
    expect(isPasswordPolicyCompliant(`Ab1${'a'.repeat(PASSWORD_MAX_LENGTH)}`)).toBe(false); // too long
  });

  it('accepts exactly at the boundary lengths', () => {
    expect(isPasswordPolicyCompliant('Ab1defg'.slice(0, PASSWORD_MIN_LENGTH))).toBe(true);
    expect(isPasswordPolicyCompliant('Ab1' + 'a'.repeat(PASSWORD_MAX_LENGTH - 3))).toBe(true);
  });

  it('rejects exactly one character short of the minimum length', () => {
    expect(isPasswordPolicyCompliant('Ab1defg'.slice(0, PASSWORD_MIN_LENGTH - 1))).toBe(false);
  });
});

describe('generateCompliantPassword', () => {
  it('always produces a policy-compliant, non-empty password, run after run', () => {
    for (let i = 0; i < 200; i += 1) {
      const password = generateCompliantPassword();
      expect(isPasswordPolicyCompliant(password)).toBe(true);
    }
  });

  it('never repeats a value across calls (runtime-generated, not a fixed constant)', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateCompliantPassword()));
    expect(seen.size).toBe(50);
  });
});

describe('hashPassword', () => {
  it('produces an argon2id PHC string the real login verify path accepts', async () => {
    const password = generateCompliantPassword();
    const hash = await hashPassword(password);
    expect(hash).toMatch(/^\$argon2id\$/);

    const argon2 = await import('argon2');
    await expect(argon2.verify(hash, password)).resolves.toBe(true);
    await expect(argon2.verify(hash, 'definitely-wrong')).resolves.toBe(false);
  });
});
