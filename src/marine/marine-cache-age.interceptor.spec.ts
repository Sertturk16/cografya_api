import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError, lastValueFrom } from 'rxjs';
import {
  MARINE_CACHE_AGE_HEADER,
  MarineCacheAgeInterceptor,
  readCacheAge,
  withCacheAge,
} from './marine-cache-age.interceptor';

describe('withCacheAge / readCacheAge', () => {
  it('round-trips the age without adding anything to the SERIALIZED body', () => {
    // The whole reason for a symbol: the number must reach the header without changing the JSON,
    // because a body that changes on every request cannot carry a useful ETag (§7.8).
    const body = withCacheAge({ points: [1, 2] }, 1_234);

    expect(readCacheAge(body)).toBe(1_234);
    expect(JSON.stringify(body)).toBe('{"points":[1,2]}');
    expect(Object.keys(body)).toEqual(['points']);
  });

  it('rounds and floors at zero, so a clock skew cannot publish a negative age', () => {
    expect(readCacheAge(withCacheAge({}, 12.6))).toBe(13);
    expect(readCacheAge(withCacheAge({}, -5))).toBe(0);
  });

  it('attaches nothing when there is no cache behind the response', () => {
    expect(readCacheAge(withCacheAge({}, null))).toBeNull();
    expect(readCacheAge({})).toBeNull();
    expect(readCacheAge(null)).toBeNull();
    expect(readCacheAge('a string')).toBeNull();
  });
});

describe('MarineCacheAgeInterceptor', () => {
  const setHeader = jest.fn();
  const context = {
    switchToHttp: () => ({ getResponse: () => ({ setHeader }) }),
  } as unknown as ExecutionContext;

  beforeEach(() => {
    setHeader.mockClear();
  });

  function handlerReturning(value: unknown): CallHandler {
    return { handle: () => of(value) };
  }

  it('publishes the header when the body carries an age', async () => {
    const interceptor = new MarineCacheAgeInterceptor();
    await lastValueFrom(
      interceptor.intercept(context, handlerReturning(withCacheAge({ ok: true }, 42))),
    );

    expect(setHeader).toHaveBeenCalledWith(MARINE_CACHE_AGE_HEADER, '42');
  });

  it('leaves a body without an age untouched', async () => {
    const interceptor = new MarineCacheAgeInterceptor();
    await lastValueFrom(interceptor.intercept(context, handlerReturning({ ok: true })));
    expect(setHeader).not.toHaveBeenCalled();
  });

  it('never sets the header on an error response', async () => {
    // Same rule as `CacheControlInterceptor` (PR #23, I1): a failed response must not carry a
    // cache claim about data it did not serve.
    const interceptor = new MarineCacheAgeInterceptor();
    const failing: CallHandler = { handle: () => throwError(() => new Error('boom')) };

    await expect(lastValueFrom(interceptor.intercept(context, failing))).rejects.toThrow('boom');
    expect(setHeader).not.toHaveBeenCalled();
  });
});
