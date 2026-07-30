import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FakeRedisClient } from '../../../test/support/fake-redis-client';
import { UpstreamMetrics } from '../upstream-metrics';
import { InProcessSingleFlight, RedisSingleFlight } from './single-flight';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('InProcessSingleFlight', () => {
  let metrics: UpstreamMetrics;

  beforeEach(() => {
    metrics = new UpstreamMetrics();
    jest.spyOn(metrics, 'event').mockImplementation(() => undefined);
  });

  it('runs the refresh once and lets the second caller JOIN it', async () => {
    const flight = new InProcessSingleFlight(metrics);
    const gate = deferred<string>();
    let calls = 0;

    const first = flight.run('k', () => {
      calls += 1;
      return gate.promise;
    });
    const second = flight.run('k', () => {
      calls += 1;
      return Promise.resolve('should never run');
    });

    gate.resolve('value');
    await expect(first).resolves.toEqual({ outcome: 'ran', value: 'value' });
    await expect(second).resolves.toEqual({ outcome: 'joined', value: 'value' });
    expect(calls).toBe(1);
    expect(metrics.get('singleflight.joined', 'cache')).toBe(1);
  });

  it('does NOT cache a rejected refresh — one failure must not poison the key', async () => {
    // The failure mode SPEC-ADDENDUM §6.2 names: if the rejected promise stayed in the in-flight
    // table, every later caller would await the same rejection for the process lifetime.
    const flight = new InProcessSingleFlight(metrics);

    await expect(flight.run('k', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(flight.run('k', () => Promise.resolve('recovered'))).resolves.toEqual({
      outcome: 'ran',
      value: 'recovered',
    });
  });

  it('clears the in-flight record after success too, so the next call really refreshes', async () => {
    const flight = new InProcessSingleFlight(metrics);
    let calls = 0;
    const refresh = (): Promise<number> => {
      calls += 1;
      return Promise.resolve(calls);
    };

    await flight.run('k', refresh);
    await flight.run('k', refresh);
    expect(calls).toBe(2);
  });

  it('keys are independent', async () => {
    const flight = new InProcessSingleFlight(metrics);
    const gate = deferred<string>();
    const a = flight.run('a', () => gate.promise);
    const b = flight.run('b', () => Promise.resolve('b-value'));

    await expect(b).resolves.toEqual({ outcome: 'ran', value: 'b-value' });
    gate.resolve('a-value');
    await expect(a).resolves.toEqual({ outcome: 'ran', value: 'a-value' });
  });
});

describe('RedisSingleFlight', () => {
  let metrics: UpstreamMetrics;
  let redis: FakeRedisClient;

  beforeEach(() => {
    metrics = new UpstreamMetrics();
    jest.spyOn(metrics, 'event').mockImplementation(() => undefined);
    redis = new FakeRedisClient();
  });

  it('the winner runs and the loser does NOT wait', async () => {
    // Waiting would hand the loser the very latency A2 was designed away. It returns immediately
    // and its caller decides what to serve.
    const winner = new RedisSingleFlight(redis, metrics, 15_000, () => 'token-a');
    const loser = new RedisSingleFlight(redis, metrics, 15_000, () => 'token-b');
    const gate = deferred<string>();

    const first = winner.run('k', () => gate.promise);
    await expect(loser.run('k', () => Promise.resolve('nope'))).resolves.toEqual({
      outcome: 'lost',
    });

    gate.resolve('value');
    await expect(first).resolves.toEqual({ outcome: 'ran', value: 'value' });
    expect(metrics.get('singleflight.lost', 'cache')).toBe(1);
  });

  it('releases the lock when the refresh finishes, so the next caller can win', async () => {
    const flight = new RedisSingleFlight(redis, metrics, 15_000, () => 'token-a');
    await flight.run('k', () => Promise.resolve(1));
    expect(redis.keys()).not.toContain('upstream:lock:k');
  });

  it('releases the lock even when the refresh THROWS', async () => {
    const flight = new RedisSingleFlight(redis, metrics, 15_000, () => 'token-a');
    await expect(flight.run('k', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(redis.keys()).not.toContain('upstream:lock:k');
  });

  it('never deletes a lock it no longer owns', async () => {
    // The scenario the compare-and-delete exists for: the winner overruns the TTL, the lock
    // expires, another instance legitimately takes it — and a bare DEL would then erase the NEW
    // owner's lock, leaving two refreshes running with nothing in the logs.
    const slow = new RedisSingleFlight(redis, metrics, 1_000, () => 'token-slow');
    const gate = deferred<string>();
    const running = slow.run('k', () => gate.promise);

    redis.advance(1_500); // the slow winner's lock has now expired
    await redis.setIfAbsent('upstream:lock:k', 'token-other', 15_000);

    gate.resolve('done');
    await running;

    // The other instance's lock is untouched.
    await expect(redis.get('upstream:lock:k')).resolves.toBe('token-other');
  });

  it('refreshes ANYWAY when Redis cannot answer, instead of silently refreshing never', async () => {
    // Treating a Redis error as "someone else holds the lock" would mean NOBODY refreshes: the
    // cache decays to empty while every log line looks normal.
    redis.failing = true;
    const flight = new RedisSingleFlight(redis, metrics, 15_000, () => 'token-a');

    await expect(flight.run('k', () => Promise.resolve('value'))).resolves.toEqual({
      outcome: 'ran',
      value: 'value',
    });
    expect(metrics.get('redis.degraded', 'cache')).toBe(1);
  });
});
