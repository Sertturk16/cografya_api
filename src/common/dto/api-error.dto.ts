import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * The error body this API already returns — DESCRIBED, never redesigned.
 *
 * ## What problem this solves
 * `openapi/openapi.json` declares nine error responses across seven paths and gives none of them
 * a body schema, so the web repo's generated types have nothing to say about an error and Vera has
 * to hand-write the shape. Every 200 response in the same artifact has a schema, so this is a gap
 * rather than a convention.
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
 * entirely — and FIVE THROW SITES (`marine-values.service.ts:137,156`,
 * `air-quality-read.service.ts:165,194`, `marine-enabled.guard.ts:25`) reach FOUR of the nine
 * declared responses that way: the three marine 404s, which the guard alone can produce, and the
 * air-quality 404. The two counts are not the same number and the distinction matters here,
 * because a required `error` would be a false declaration for every one of those four —
 * one would be enough. `message` is
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
