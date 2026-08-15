import { describe, expect, it } from '@jest/globals';
import {
  BadRequestException,
  type ArgumentMetadata,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { ApiErrorDto } from './api-error.dto';
import { SlugParams } from './route-params.dto';

/**
 * A DTO that DESCRIBES someone else's shape is only worth its declaration if the description is
 * true — and the framework, not this repo, owns the shape. So these tests measure the real bodies
 * the installed NestJS produces and check the declaration against them. A framework upgrade that
 * changed the default error body would turn this red, which is the only way this class can be
 * kept honest without an e2e run.
 */

const DECLARED_KEYS: readonly (keyof ApiErrorDto)[] = ['statusCode', 'message', 'error'];

function bodyOf(exception: { getResponse(): string | object }): Record<string, unknown> {
  const response = exception.getResponse();
  if (typeof response !== 'object') throw new Error('expected an object error body');
  return response as Record<string, unknown>;
}

describe('ApiErrorDto', () => {
  it('declares `error` as OPTIONAL, because the argument-less 404 omits it entirely', () => {
    // Five of the nine responses this describes are thrown this way: `marine-values.service.ts`,
    // `air-quality-read.service.ts` and `marine-enabled.guard.ts` all throw `new
    // NotFoundException()`. A required `error` would be a false declaration for all of them.
    const body = bodyOf(new NotFoundException());

    expect(body).toEqual({ message: 'Not Found', statusCode: 404 });
    expect(Object.keys(body)).not.toContain('error');

    // Compiles only while `error` is optional.
    const declared: ApiErrorDto = { statusCode: 404, message: 'Not Found' };
    expect(declared.error).toBeUndefined();
  });

  it('carries `error` when the exception was raised WITH a message', () => {
    // The other four: `province.service.ts` and `country.service.ts` pass an i18n key.
    const body = bodyOf(new NotFoundException('errors.province.notFound'));

    expect(body).toEqual({
      message: 'errors.province.notFound',
      error: 'Not Found',
      statusCode: 404,
    });
  });

  it('types `message` as a union because ValidationPipe really produces an ARRAY', async () => {
    // Measured through the pipe itself, configured as `main.ts` configures it, rather than
    // asserted from memory. This is the case that makes a plain `message: string` a lie.
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = { type: 'param', metatype: SlugParams };

    const rejection: unknown = await pipe
      .transform({ slug: 'NOT A SLUG' }, metadata)
      .then(() => null)
      .catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(BadRequestException);
    const body = bodyOf(rejection as BadRequestException);

    expect(Array.isArray(body.message)).toBe(true);
    expect(body).toMatchObject({ statusCode: 400, error: 'Bad Request' });

    // Compiles only while `message` accepts both members of the union.
    const asArray: ApiErrorDto = { statusCode: 400, message: ['slug must be lowercase'] };
    const asString: ApiErrorDto = { statusCode: 404, message: 'Not Found' };
    expect(Array.isArray(asArray.message)).toBe(true);
    expect(Array.isArray(asString.message)).toBe(false);
  });

  it('describes every key the framework emits, and invents none', () => {
    // The §6 boundary in test form: this DTO may DECLARE the default shape, never reshape it. A
    // key here that the framework does not emit would be authored contract, which §6 forbids.
    const emitted = new Set([
      ...Object.keys(bodyOf(new NotFoundException())),
      ...Object.keys(bodyOf(new NotFoundException('errors.country.notFound'))),
      ...Object.keys(bodyOf(new BadRequestException(['one', 'two']))),
    ]);

    expect(emitted.size).toBeGreaterThan(0);
    for (const key of emitted) {
      expect(DECLARED_KEYS).toContain(key);
    }
    for (const declared of DECLARED_KEYS) {
      expect(emitted.has(declared)).toBe(true);
    }
  });
});
