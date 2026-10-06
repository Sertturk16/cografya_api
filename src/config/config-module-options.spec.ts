import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { ConfigModule } from '@nestjs/config';
import { buildConfigModuleOptions } from './config-module-options';

/**
 * Behaviour, not the option object: `ConfigModule.forRoot` is run in a directory holding a `.env`
 * whose `REDIS_URL` is a sentinel, and the test reads where that value ended up. The local `.env`
 * points at the dev Redis and turns upstream flags on, so a test process that loads it is not
 * the process CI runs.
 */
describe('buildConfigModuleOptions', () => {
  const DOTENV_REDIS_URL = 'redis://dotenv-sentinel.invalid:6379';
  let savedEnv: NodeJS.ProcessEnv;
  let savedCwd: string;
  let dir: string;

  beforeEach(() => {
    savedEnv = { ...process.env };
    savedCwd = process.cwd();
    dir = mkdtempSync(join(tmpdir(), 'config-module-options-'));
    writeFileSync(join(dir, '.env'), `REDIS_URL=${DOTENV_REDIS_URL}\n`);
    process.chdir(dir);
    process.env = {
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      WEB_ORIGIN: 'http://localhost:3000',
    };
  });

  afterEach(() => {
    process.chdir(savedCwd);
    process.env = savedEnv;
    rmSync(dir, { recursive: true, force: true });
  });

  it('ignores the .env file under NODE_ENV=test', async () => {
    process.env.NODE_ENV = 'test';

    await ConfigModule.forRoot(buildConfigModuleOptions(process.env.NODE_ENV));

    expect(process.env.REDIS_URL).toBeUndefined();
  });

  it('POSITIVE CONTROL: loads the same .env under NODE_ENV=development', async () => {
    // Without this the case above would also pass if the sentinel file were never readable.
    process.env.NODE_ENV = 'development';

    await ConfigModule.forRoot(buildConfigModuleOptions(process.env.NODE_ENV));

    expect(process.env.REDIS_URL).toBe(DOTENV_REDIS_URL);
  });
});
