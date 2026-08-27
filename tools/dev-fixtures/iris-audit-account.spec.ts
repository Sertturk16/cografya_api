import { isPasswordPolicyCompliant } from './credential-fixture.ts';
import { resolvePassword } from './iris-audit-account-runner.ts';

/**
 * `resolvePassword()` (TA143-M1) is the one pure, DB-free piece of the
 * `iris-audit-account-runner.ts` logic — everything else there needs a real Postgres connection
 * (`pickDistrict`, `upsertFixtureUser`) or is already covered elsewhere (`assertLocalDatabaseUrl`,
 * `isPasswordPolicyCompliant`). Importing the runner module never runs the CLI: `main()` is a
 * plain exported function here, and the argv-gated direct-invocation check that calls it lives
 * only in the entry point (`iris-audit-account.ts`), which this spec never imports.
 */
describe('resolvePassword', () => {
  const BASE_ARGV = process.argv.slice(0, 2);
  const ORIGINAL_ARGV = process.argv;
  const ORIGINAL_ENV_PASSWORD = process.env.AUDIT_ACCOUNT_PASSWORD;

  afterEach(() => {
    process.argv = ORIGINAL_ARGV;
    if (ORIGINAL_ENV_PASSWORD === undefined) {
      delete process.env.AUDIT_ACCOUNT_PASSWORD;
    } else {
      process.env.AUDIT_ACCOUNT_PASSWORD = ORIGINAL_ENV_PASSWORD;
    }
  });

  it('prefers --password over AUDIT_ACCOUNT_PASSWORD and over auto-generation', () => {
    process.argv = [...BASE_ARGV, '--password', 'FromCliFlag1'];
    process.env.AUDIT_ACCOUNT_PASSWORD = 'FromEnvVar1';
    expect(resolvePassword()).toEqual({ password: 'FromCliFlag1', source: 'cli' });
  });

  it('falls back to AUDIT_ACCOUNT_PASSWORD when no --password flag is present', () => {
    process.argv = [...BASE_ARGV];
    process.env.AUDIT_ACCOUNT_PASSWORD = 'FromEnvVar1';
    expect(resolvePassword()).toEqual({ password: 'FromEnvVar1', source: 'env' });
  });

  it('auto-generates a policy-compliant password when neither --password nor the env var is set', () => {
    process.argv = [...BASE_ARGV];
    delete process.env.AUDIT_ACCOUNT_PASSWORD;
    const result = resolvePassword();
    expect(result.source).toBe('generated');
    expect(isPasswordPolicyCompliant(result.password)).toBe(true);
  });

  it('throws when --password is given with no value', () => {
    process.argv = [...BASE_ARGV, '--password'];
    expect(() => resolvePassword()).toThrow('--password requires a value.');
  });

  it('throws when --password is the LAST argv entry with nothing after it, not merely empty string', () => {
    // Same case as above, phrased against the actual failure mode: `argv[flagIndex + 1]` reads
    // past the end of the array and is `undefined`, which the `if (!value)` check must catch.
    process.argv = [...BASE_ARGV, '--irrelevant-flag', '--password'];
    expect(() => resolvePassword()).toThrow('--password requires a value.');
  });
});
