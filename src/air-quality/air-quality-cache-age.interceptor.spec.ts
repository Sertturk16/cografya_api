import { describe, expect, it } from '@jest/globals';
import { firstValueFrom, of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import {
  AIR_QUALITY_CACHE_AGE_HEADER,
  AirQualityCacheAgeInterceptor,
  readAirQualityCacheAge,
  withAirQualityCacheAge,
} from './air-quality-cache-age.interceptor';

function contextWithHeaderSink(sink: Map<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getResponse: () => ({
        setHeader: (name: string, value: string) => {
          sink.set(name, value);
        },
      }),
    }),
  } as unknown as ExecutionContext;
}

function handlerReturning(body: unknown): CallHandler {
  return { handle: () => of(body) };
}

describe('air-quality cache-age carrier', () => {
  it('attaches an age that is invisible to serialization (the ETag contract)', () => {
    const body = withAirQualityCacheAge({ plateCode: '06' }, 42);
    expect(readAirQualityCacheAge(body)).toBe(42);
    // The whole reason the key is a symbol: two responses serving the same cached run must
    // serialize byte-identically, or the weak ETag the web's ISR depends on changes every request.
    expect(JSON.stringify(body)).toBe('{"plateCode":"06"}');
    expect(Object.keys(body)).toEqual(['plateCode']);
  });

  it('rounds and floors at zero, and drops a non-finite age instead of publishing NaN', () => {
    expect(readAirQualityCacheAge(withAirQualityCacheAge({}, 4.6))).toBe(5);
    expect(readAirQualityCacheAge(withAirQualityCacheAge({}, -3))).toBe(0);
    expect(readAirQualityCacheAge(withAirQualityCacheAge({}, Number.NaN))).toBeNull();
    expect(readAirQualityCacheAge(withAirQualityCacheAge({}, null))).toBeNull();
  });

  it('carries an age on an ARRAY body too (the hub returns a plain array)', () => {
    const body = withAirQualityCacheAge([{ plateCode: '06' }], 7);
    expect(readAirQualityCacheAge(body)).toBe(7);
    expect(JSON.stringify(body)).toBe('[{"plateCode":"06"}]');
  });

  it('reads null off a body that carries nothing', () => {
    expect(readAirQualityCacheAge({ plateCode: '06' })).toBeNull();
    expect(readAirQualityCacheAge(null)).toBeNull();
    expect(readAirQualityCacheAge('not an object')).toBeNull();
  });
});

describe('AirQualityCacheAgeInterceptor', () => {
  it('publishes the header when the body carries an age', async () => {
    const headers = new Map<string, string>();
    const interceptor = new AirQualityCacheAgeInterceptor();
    await firstValueFrom(
      interceptor.intercept(
        contextWithHeaderSink(headers),
        handlerReturning(withAirQualityCacheAge({ plateCode: '06' }, 12)),
      ),
    );
    expect(headers.get(AIR_QUALITY_CACHE_AGE_HEADER)).toBe('12');
  });

  it('passes a body with no age through untouched (index-system has no cache behind it)', async () => {
    const headers = new Map<string, string>();
    const interceptor = new AirQualityCacheAgeInterceptor();
    await firstValueFrom(
      interceptor.intercept(contextWithHeaderSink(headers), handlerReturning({ indexSystem: 'x' })),
    );
    expect(headers.size).toBe(0);
  });
});
