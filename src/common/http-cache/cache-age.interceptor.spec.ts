import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { CacheAgeInterceptor, readCacheAge, withCacheAge } from './cache-age.interceptor';

describe('withCacheAge / readCacheAge', () => {
  it('round-trips the age without adding anything to the SERIALIZED body', () => {
    // The whole reason for a symbol: the number must reach the header without changing the JSON,
    // because a body that changes on every request cannot carry a useful ETag.
    const body = withCacheAge({ points: [1, 2] }, 1_234);

    expect(readCacheAge(body)).toBe(1_234);
    expect(JSON.stringify(body)).toBe('{"points":[1,2]}');
    expect(Object.keys(body)).toEqual(['points']);
  });

  it('keeps the property NON-ENUMERABLE, which the two assertions above cannot see', () => {
    // Measured: `JSON.stringify` and `Object.keys` both ignore a symbol-keyed property whatever
    // its descriptor says, so both lines above pass unchanged against a helper that had lost
    // `enumerable: false`. Spread is what discriminates — it copies enumerable symbol-keyed own
    // properties — and spread is also how a controller would compose `{ ...body, extra }`, which
    // is the route by which an enumerable age would start travelling with the payload.
    const body = withCacheAge({ points: [1, 2] }, 1_234);
    const copy = { ...body };

    expect(Object.getOwnPropertySymbols(copy)).toEqual([]);
    expect(readCacheAge(copy)).toBeNull();
  });

  it('keeps the property CONFIGURABLE, so a second attach replaces rather than throws', () => {
    // The other untested descriptor option. With `configurable: false` the second
    // `Object.defineProperty` raises a TypeError — inside a response path, on a body some
    // future caller attached to twice.
    const body = withCacheAge({ points: [1, 2] }, 1_234);

    expect(() => withCacheAge(body, 7)).not.toThrow();
    expect(readCacheAge(body)).toBe(7);
  });

  it('rounds and floors at zero, so a clock skew cannot publish a negative age', () => {
    expect(readCacheAge(withCacheAge({}, 12.6))).toBe(13);
    expect(readCacheAge(withCacheAge({}, -5))).toBe(0);
  });

  it('drops a non-finite age rather than publishing `NaN` as a header value', () => {
    expect(readCacheAge(withCacheAge({}, Number.NaN))).toBeNull();
    expect(readCacheAge(withCacheAge({}, Number.POSITIVE_INFINITY))).toBeNull();
  });

  it('attaches nothing when there is no cache behind the response', () => {
    expect(readCacheAge(withCacheAge({}, null))).toBeNull();
    expect(readCacheAge({})).toBeNull();
    expect(readCacheAge(null)).toBeNull();
    expect(readCacheAge('a string')).toBeNull();
    expect(readCacheAge(undefined)).toBeNull();
  });

  it('returns the same object, so a handler can attach in a return statement', () => {
    const body = { a: 1 };
    expect(withCacheAge(body, 10)).toBe(body);
  });
});

describe('CacheAgeInterceptor', () => {
  const setHeader = jest.fn();
  const context = {
    switchToHttp: () => ({ getResponse: () => ({ setHeader }) }),
  } as unknown as ExecutionContext;

  function handlerReturning(body: unknown): CallHandler {
    return { handle: () => of(body) } as CallHandler;
  }

  beforeEach(() => {
    setHeader.mockClear();
  });

  it('publishes the header name it was constructed with', async () => {
    // The single behaviour that used to be duplicated: each leg keeps its own external header
    // name, which is the non-breaking half of the convergence debt (DEC 2026-07-31b A-6).
    const interceptor = new CacheAgeInterceptor('X-Marine-Cache-Age');

    await lastValueFrom(
      interceptor.intercept(context, handlerReturning(withCacheAge({ ok: true }, 42))),
    );

    expect(setHeader).toHaveBeenCalledWith('X-Marine-Cache-Age', '42');
  });

  it('serves two legs from one class, each with its own name and no shared state', async () => {
    const marine = new CacheAgeInterceptor('X-Marine-Cache-Age');
    const airQuality = new CacheAgeInterceptor('X-Air-Quality-Cache-Age');

    await lastValueFrom(marine.intercept(context, handlerReturning(withCacheAge({}, 1))));
    await lastValueFrom(airQuality.intercept(context, handlerReturning(withCacheAge({}, 2))));

    expect(setHeader.mock.calls).toEqual([
      ['X-Marine-Cache-Age', '1'],
      ['X-Air-Quality-Cache-Age', '2'],
    ]);
  });

  it('passes a body carrying no age straight through', async () => {
    const interceptor = new CacheAgeInterceptor('X-Marine-Cache-Age');
    const body = { indexSystem: 'a constant, with no cache behind it' };

    await expect(
      lastValueFrom(interceptor.intercept(context, handlerReturning(body))),
    ).resolves.toBe(body);
    expect(setHeader).not.toHaveBeenCalled();
  });

  it('publishes a zero age, which is not the same as no age', async () => {
    const interceptor = new CacheAgeInterceptor('X-Marine-Cache-Age');

    await lastValueFrom(interceptor.intercept(context, handlerReturning(withCacheAge({}, 0))));

    expect(setHeader).toHaveBeenCalledWith('X-Marine-Cache-Age', '0');
  });

  it('sets NO header on an error response', async () => {
    // An error body never carries a cache-age claim about data it did not serve.
    const interceptor = new CacheAgeInterceptor('X-Marine-Cache-Age');
    const failing = { handle: () => throwError(() => new Error('upstream down')) } as CallHandler;

    await expect(lastValueFrom(interceptor.intercept(context, failing))).rejects.toThrow(
      'upstream down',
    );
    expect(setHeader).not.toHaveBeenCalled();
  });
});
