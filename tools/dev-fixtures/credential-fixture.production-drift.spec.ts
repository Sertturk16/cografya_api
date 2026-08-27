import {
  PASSWORD_MAX_LENGTH as PROD_MAX,
  PASSWORD_MIN_LENGTH as PROD_MIN,
} from '../../src/auth/auth.constants';
import { PASSWORD_HASH_OPTIONS as PROD_HASH_OPTIONS } from '../../src/auth/password-hasher.service';
import {
  PASSWORD_HASH_OPTIONS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from './credential-fixture.ts';

/**
 * SEC143-M1 — a machine-checked drift guard between `credential-fixture.ts`'s BY-HAND mirror of
 * the Argon2id profile and password-policy bounds, and their real production source
 * (`password-hasher.service.ts` / `auth.constants.ts`). `credential-fixture.ts`'s own header
 * explains why the RUNTIME tool cannot import `src/` directly (no build step, and this repo's
 * native-TypeScript-stripping tools cannot parse `experimentalDecorators` syntax) — but that
 * constraint is about the tool's own execution, not about a `.spec.ts` file: ts-jest fully
 * compiles specs (including decorators) via `tsconfig.unit-spec.json`, so THIS file can import
 * both sides directly and assert they still agree, closing the "silent future weakening
 * produces no red signal" gap the finding raised. A future strengthening of the production
 * profile (the file's own docblock already names RFC 9106's stronger profile as a future
 * candidate) will fail this test the moment it lands, rather than leaving the dev-fixture tool
 * silently behind.
 */
describe('credential-fixture.ts Argon2id/policy mirror stays byte-identical to production', () => {
  it('PASSWORD_HASH_OPTIONS matches password-hasher.service.ts exactly', () => {
    expect(PASSWORD_HASH_OPTIONS).toEqual(PROD_HASH_OPTIONS);
  });

  it('PASSWORD_MIN_LENGTH / PASSWORD_MAX_LENGTH match auth.constants.ts exactly', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(PROD_MIN);
    expect(PASSWORD_MAX_LENGTH).toBe(PROD_MAX);
  });
});
