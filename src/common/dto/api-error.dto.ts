import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * The error body this API already returns — DESCRIBED, never redesigned.
 *
 * ## What problem this solves
 * Without it an error response in `openapi/openapi.json` has no body schema and the web's
 * generated types say nothing about errors. Every non-2xx response is declared with it
 * (`src/openapi/openapi-responses.spec.ts`).
 *
 * ## Why declaring is allowed here and reshaping is not
 * `ENGINEERING.md` §6: "keep error responses to framework defaults and structural fields, not
 * authored prose." A global exception filter that rewrote the body would break that rule — and
 * would also break the two properties this repo currently gets for free, that no stack trace ever
 * reaches a client and that every error body already looks the same. So this class INVENTS
 * NOTHING. Each field below is what NestJS's own default filter puts on the wire today.
 *
 * ## The shape was measured against the installed framework, not remembered
 * Run against `@nestjs/common` as installed:
 *
 * ```
 * new NotFoundException().getResponse()
 *   → {"message":"Not Found","statusCode":404}                                  // no `error` key
 * new NotFoundException('errors.province.notFound').getResponse()
 *   → {"message":"errors.province.notFound","error":"Not Found","statusCode":404}
 * new BadRequestException(['a must be x']).getResponse()
 *   → {"message":["a must be x"],"error":"Bad Request","statusCode":400}
 * ```
 *
 * That measurement decides two fields. `error` is OPTIONAL because the argument-less form omits it
 * entirely. Every 4xx this code throws now carries a key (`src/common/error-keys.spec.ts`), but
 * a deliberate 5xx is thrown argument-less on purpose (diagnostics go to the log, not the body),
 * so a required `error` would still be a false declaration for those. `message` is
 * `string | string[]` because that is what `ValidationPipe` actually produces when several fields
 * fail at once. A DTO that hid either would be worse than no DTO: a wrong type is trusted, a
 * missing one is at least known to be missing.
 *
 * ## For binding, not for construction
 * Nothing instantiates this class. It exists to be named in `@ApiNotFoundResponse({ type:
 * ApiErrorDto })` and friends, so the published contract carries the shape the framework already
 * serves. Adding it to a response is an ADDITIVE contract change — a response that had no
 * declaration gains one — and must still be flagged to Atlas for Vera (§4).
 */
export class ApiErrorDto {
  @ApiProperty({
    type: Number,
    example: 404,
    description: 'HTTP status code, repeated in the body by the framework default error shape.',
  })
  statusCode!: number;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Not Found',
    description:
      'A single message, or one message per failed field when request validation rejects ' +
      'several at once.',
  })
  message!: string | string[];

  @ApiPropertyOptional({
    type: String,
    example: 'Not Found',
    description:
      'The status reason phrase. Present only when the exception was raised with an explicit ' +
      'message; an argument-less `NotFoundException` omits this key entirely.',
  })
  error?: string;
}
