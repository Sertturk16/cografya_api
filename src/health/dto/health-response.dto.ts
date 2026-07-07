import { ApiProperty } from '@nestjs/swagger';

/**
 * Response body for the liveness probe.
 *
 * Declared as a real DTO class (not an inline type) so it lands as a named
 * schema in the generated OpenAPI document — the api is the single source of
 * truth for the shared contract that the web repo codegens from.
 */
export class HealthResponseDto {
  @ApiProperty({
    example: 'ok',
    description: 'Liveness status of the API. Always "ok" when the service responds.',
  })
  status!: string;
}
