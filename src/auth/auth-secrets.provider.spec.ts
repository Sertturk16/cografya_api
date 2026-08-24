import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { Env } from '../config/env.schema';
import { validateEnv } from '../config/env.schema';
import { AuthSecretsProvider } from './auth-secrets.provider';

const VALID_JWT_SECRET = 'a'.repeat(32);
const VALID_HMAC_PEPPER = 'b'.repeat(32);

/**
 * A ConfigService stand-in built from the REAL `validateEnv`, not a hand-written literal —
 * the `marine-upstream.config.spec.ts` precedent. The mapping this provider does is only
 * meaningful against values boot itself would actually produce.
 */
function configFrom(raw: Record<string, string>): ConfigService<Env, true> {
  const env = validateEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    ...raw,
  });
  return { get: (key: keyof Env) => env[key] } as unknown as ConfigService<Env, true>;
}

describe('AuthSecretsProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the configured secrets verbatim when both are set', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const provider = new AuthSecretsProvider(
      configFrom({ JWT_SECRET: VALID_JWT_SECRET, AUTH_HMAC_PEPPER: VALID_HMAC_PEPPER }),
    );

    expect(provider.getJwtSecret()).toBe(VALID_JWT_SECRET);
    expect(provider.getHmacPepper()).toBe(VALID_HMAC_PEPPER);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('mints a random 32-byte ephemeral secret for each unset value', () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const provider = new AuthSecretsProvider(configFrom({}));

    expect(Buffer.from(provider.getJwtSecret(), 'base64url').length).toBe(32);
    expect(Buffer.from(provider.getHmacPepper(), 'base64url').length).toBe(32);
    expect(provider.getJwtSecret()).not.toBe(provider.getHmacPepper());
  });

  it('mints two DIFFERENT processes two DIFFERENT ephemeral secrets', () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const first = new AuthSecretsProvider(configFrom({}));
    const second = new AuthSecretsProvider(configFrom({}));

    expect(first.getJwtSecret()).not.toBe(second.getJwtSecret());
    expect(first.getHmacPepper()).not.toBe(second.getHmacPepper());
  });

  it('logs exactly ONE warning when at least one secret is ephemeral, and never the value', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const provider = new AuthSecretsProvider(configFrom({ JWT_SECRET: VALID_JWT_SECRET }));

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [line] = warnSpy.mock.calls[0] as [string];
    expect(line).toMatch(/ephemeral/i);
    expect(line).not.toContain(VALID_JWT_SECRET);
    expect(line).not.toContain(provider.getHmacPepper());
  });

  it('logs no warning at all when both secrets are configured', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    new AuthSecretsProvider(
      configFrom({ JWT_SECRET: VALID_JWT_SECRET, AUTH_HMAC_PEPPER: VALID_HMAC_PEPPER }),
    );

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
