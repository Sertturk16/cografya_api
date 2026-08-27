import {
  assertLocalDatabaseUrl,
  isLoopbackAddress,
  isLoopbackHostname,
  NonLocalDatabaseError,
  type DnsLookupFn,
} from './local-database-guard.ts';

const LOOPBACK_V4 = [{ address: '127.0.0.1', family: 4 }];
const LOOPBACK_V6 = [{ address: '::1', family: 6 }];

describe('isLoopbackHostname', () => {
  it('accepts the three conventional spellings', () => {
    expect(isLoopbackHostname('localhost')).toBe(true);
    expect(isLoopbackHostname('127.0.0.1')).toBe(true);
    expect(isLoopbackHostname('::1')).toBe(true);
  });

  it('accepts uppercase and the bracketed IPv6 form URL.hostname actually produces', () => {
    expect(isLoopbackHostname('LOCALHOST')).toBe(true);
    expect(isLoopbackHostname('[::1]')).toBe(true);
  });

  it('rejects a real hostname', () => {
    expect(isLoopbackHostname('db.production.example.com')).toBe(false);
    expect(isLoopbackHostname('10.0.0.5')).toBe(false);
  });
});

describe('isLoopbackAddress', () => {
  it('accepts the loopback ranges', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('127.1.2.3')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
  });

  it('rejects a real address, including a private-range one', () => {
    expect(isLoopbackAddress('10.0.0.5')).toBe(false);
    expect(isLoopbackAddress('192.168.1.1')).toBe(false);
    expect(isLoopbackAddress('::ffff:c0a8:101')).toBe(false);
  });
});

describe('assertLocalDatabaseUrl', () => {
  it('accepts localhost when DNS resolution agrees it is loopback', async () => {
    const lookup: DnsLookupFn = () => Promise.resolve(LOOPBACK_V4);
    const target = await assertLocalDatabaseUrl(
      'postgresql://cografya:cografya_dev@localhost:5433/cografya',
      lookup,
    );
    expect(target).toEqual({ host: 'localhost', port: '5433' });
  });

  it('accepts a literal 127.0.0.1', async () => {
    const lookup: DnsLookupFn = () => Promise.resolve(LOOPBACK_V4);
    const target = await assertLocalDatabaseUrl(
      'postgresql://cografya:cografya_dev@127.0.0.1:5433/cografya',
      lookup,
    );
    expect(target.host).toBe('127.0.0.1');
  });

  it('accepts the bracketed IPv6 loopback form', async () => {
    const lookup: DnsLookupFn = () => Promise.resolve(LOOPBACK_V6);
    const target = await assertLocalDatabaseUrl(
      'postgresql://cografya:cografya_dev@[::1]:5433/cografya',
      lookup,
    );
    expect(target.host).toBe('[::1]');
  });

  it('REFUSES a non-local hostname outright, without ever calling DNS', async () => {
    const lookup = jest.fn<ReturnType<DnsLookupFn>, Parameters<DnsLookupFn>>();
    await expect(
      assertLocalDatabaseUrl(
        'postgresql://cografya:cografya_dev@db.production.example.com:5432/cografya',
        lookup,
      ),
    ).rejects.toThrow(NonLocalDatabaseError);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('REFUSES when the hostname literal reads local but DNS resolves elsewhere (the "never trust the env var alone" case)', async () => {
    const lookup: DnsLookupFn = () => Promise.resolve([{ address: '203.0.113.9', family: 4 }]);
    await expect(
      assertLocalDatabaseUrl('postgresql://cografya:cografya_dev@localhost:5432/cografya', lookup),
    ).rejects.toThrow(NonLocalDatabaseError);
  });

  it('REFUSES when DNS resolution fails', async () => {
    const lookup: DnsLookupFn = () => Promise.reject(new Error('ENOTFOUND'));
    await expect(
      assertLocalDatabaseUrl('postgresql://cografya:cografya_dev@localhost:5432/cografya', lookup),
    ).rejects.toThrow(NonLocalDatabaseError);
  });

  it('REFUSES an unparseable DATABASE_URL', async () => {
    const lookup: DnsLookupFn = () => Promise.resolve(LOOPBACK_V4);
    await expect(assertLocalDatabaseUrl('not a url', lookup)).rejects.toThrow(
      NonLocalDatabaseError,
    );
  });

  it('REFUSES a mixed DNS answer where only one resolved address is non-loopback', async () => {
    const lookup: DnsLookupFn = () =>
      Promise.resolve([
        { address: '127.0.0.1', family: 4 },
        { address: '203.0.113.9', family: 4 },
      ]);
    await expect(
      assertLocalDatabaseUrl('postgresql://cografya:cografya_dev@localhost:5432/cografya', lookup),
    ).rejects.toThrow(NonLocalDatabaseError);
  });
});
