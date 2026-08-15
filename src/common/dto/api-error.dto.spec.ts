import { describe, expect, it } from '@jest/globals';
import {
  BadRequestException,
  type ArgumentMetadata,
  Controller,
  Get,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOkResponse, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { IsString, Matches } from 'class-validator';
import { ApiErrorDto } from './api-error.dto';

/**
 * A DTO that DESCRIBES someone else's shape is only worth its declaration if the description is
 * true — and the framework, not this repo, owns the shape. So these tests measure the real bodies
 * the installed NestJS produces and check the declaration against them. A framework upgrade that
 * changed the default error body would turn this red, which is the only way this class can be
 * kept honest without an e2e run.
 *
 * The other half is the EMITTED SCHEMA. Everything above concerns the framework's bodies and the
 * TypeScript type; neither is what this class ships. What ships is the `@ApiProperty` metadata
 * that lands in `openapi/openapi.json` and becomes Vera's generated types, and no gate covers it:
 * `Typecheck & Lint` sees only the TS type, and `openapi-check` asserts the artifact matches a
 * regeneration of itself, never that the schema is RIGHT. So the emitted schema is measured here.
 */

function bodyOf(exception: { getResponse(): string | object }): Record<string, unknown> {
  const response = exception.getResponse();
  if (typeof response !== 'object') throw new Error('expected an object error body');
  return response as Record<string, unknown>;
}

/**
 * The schema `@nestjs/swagger` publishes for {@link ApiErrorDto}, read the way the artifact is
 * built: a throwaway module whose only route declares the DTO, run through the real
 * `SwaggerModule.createDocument`.
 *
 * Nothing here is mocked, and nothing is asserted from memory — `emitted` is whatever the
 * installed swagger version produces from the decorators as written.
 */
async function emittedSchema(): Promise<{
  properties: Record<string, Record<string, unknown>>;
  required: string[];
}> {
  @Controller('probe')
  class ProbeController {
    @Get()
    @ApiOkResponse({ type: ApiErrorDto })
    get(): ApiErrorDto {
      return { statusCode: 404, message: 'Not Found' };
    }
  }

  const moduleRef = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  try {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    const schema = document.components?.schemas?.ApiErrorDto;
    if (schema === undefined || !('properties' in schema)) {
      throw new Error('swagger published no ApiErrorDto schema');
    }
    return {
      properties: (schema.properties ?? {}) as Record<string, Record<string, unknown>>,
      required: schema.required ?? [],
    };
  } finally {
    await app.close();
  }
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
    //
    // The DTO is declared HERE rather than imported from `route-params.dto.ts`. What this case
    // needs is any DTO with two failing constraints; reaching for the real `SlugParams` coupled a
    // file about error BODIES to the slug pattern, so a future loosening of that pattern would
    // have failed this file with a message pointing nowhere near the cause.
    class TwoFailingFields {
      @IsString()
      @Matches(/^[a-z]+$/, { message: 'first must be lowercase letters' })
      first!: string;

      @IsString()
      @Matches(/^[a-z]+$/, { message: 'second must be lowercase letters' })
      second!: string;
    }

    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = { type: 'param', metatype: TwoFailingFields };

    const rejection: unknown = await pipe
      .transform({ first: 'NOT LOWERCASE', second: 'ALSO NOT' }, metadata)
      .then(() => null)
      .catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(BadRequestException);
    const body = bodyOf(rejection as BadRequestException);

    expect(Array.isArray(body.message)).toBe(true);
    // Two failing fields, so this is the several-at-once case the union exists for and not an
    // array of one that happens to satisfy `Array.isArray`.
    expect(body.message).toHaveLength(2);
    expect(body).toMatchObject({ statusCode: 400, error: 'Bad Request' });

    // Compiles only while `message` accepts both members of the union.
    const asArray: ApiErrorDto = { statusCode: 400, message: ['first must be lowercase letters'] };
    const asString: ApiErrorDto = { statusCode: 404, message: 'Not Found' };
    expect(Array.isArray(asArray.message)).toBe(true);
    expect(Array.isArray(asString.message)).toBe(false);
  });

  it('describes every key the framework emits, and invents none', async () => {
    // The §6 boundary in test form: this DTO may DECLARE the default shape, never reshape it. A
    // key here that the framework does not emit would be authored contract, which §6 forbids.
    //
    // The declared side is read off the PUBLISHED SCHEMA, not off a list written here. A
    // hand-written list makes this a comparison between the framework and the test's own setup:
    // adding `@ApiProperty() timestamp` to the class would leave both loops green while the
    // contract grew a key the framework never sends.
    const declaredKeys = Object.keys((await emittedSchema()).properties);
    const emitted = new Set([
      ...Object.keys(bodyOf(new NotFoundException())),
      ...Object.keys(bodyOf(new NotFoundException('errors.country.notFound'))),
      ...Object.keys(bodyOf(new BadRequestException(['one', 'two']))),
    ]);

    expect(emitted.size).toBeGreaterThan(0);
    expect(declaredKeys).not.toHaveLength(0);
    for (const key of emitted) {
      expect(declaredKeys).toContain(key);
    }
    for (const declared of declaredKeys) {
      expect(emitted.has(declared)).toBe(true);
    }
  });
});

/**
 * The class's only real output.
 *
 * Everything above tests the framework's bodies and the TypeScript type; this class ships neither.
 * It ships `@ApiProperty` metadata into `openapi/openapi.json`, from which Vera codegens. The
 * failure these cases exist to catch: a later round simplifies the awkward `oneOf` to
 * `@ApiProperty({ type: String })` while leaving the TS type untouched. `Typecheck & Lint` stays
 * green (the type did not change), `openapi-check` stays green (it asserts the artifact matches
 * regeneration, never that the schema is right), and the contract then publishes `message: string`
 * for a 400 whose real body is an array — the outcome this DTO's own docblock calls "worse than no
 * DTO: a wrong type is trusted".
 */
describe('the schema ApiErrorDto publishes', () => {
  it('emits `message` as the string | string[] union, not a bare string', async () => {
    const { properties } = await emittedSchema();

    expect(properties.message?.oneOf).toEqual([
      { type: 'string' },
      { type: 'array', items: { type: 'string' } },
    ]);
    // The regression's exact shape: a plain `type: 'string'` alongside no `oneOf`.
    expect(properties.message?.type).toBeUndefined();
  });

  it('leaves `error` OUT of `required`, because the argument-less 404 omits it', async () => {
    const { required } = await emittedSchema();

    expect(required).toContain('statusCode');
    expect(required).toContain('message');
    expect(required).not.toContain('error');
  });

  it('emits `statusCode` as a number, so a client does not parse it as text', async () => {
    const { properties } = await emittedSchema();

    expect(properties.statusCode?.type).toBe('number');
  });
});
