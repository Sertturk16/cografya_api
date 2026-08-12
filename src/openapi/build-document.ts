import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { EarthquakeAttributionDto } from '../earthquake/dto/earthquake-attribution.dto';
import { EarthquakeListDto } from '../earthquake/dto/earthquake-list.dto';

/**
 * Schemas published WITHOUT a route.
 *
 * Every other schema in the spec is discovered by scanning controllers, so a contract PR that
 * ships types before their endpoints has no way in — and that is exactly what the earthquake E1
 * PR is (SPEC §16: types and schema, no runtime, so the web repo can codegen and build against
 * a mock while E2/E3 land the ingest and the endpoints).
 *
 * `SwaggerModule.createDocument`'s `extraModels` option is the only mechanism for it: the
 * scanner calls `addExtraModels` independently of how many routes it found. The alternative —
 * a stub controller to hang `@ApiExtraModels` on — would ship runtime the PR is explicitly
 * forbidden to ship.
 *
 * Only TOP-LEVEL types are listed. Anything they reference is pulled in transitively, so
 * `EarthquakeEventDto`, `EarthquakeListMetaDto` and `EarthquakeFilterEchoDto` arrive through
 * `EarthquakeListDto`. `EarthquakeAttributionDto` is named anyway because it is reachable only
 * through an array property and because it is the one schema whose absence would be a licence
 * problem rather than a typing problem.
 *
 * **This list shrinks as endpoints land.** When E3 serves these types from a real route, the
 * scanner finds them and the entry becomes redundant — remove it then; a permanent extra-model
 * list would quietly hide a DTO that no longer has a route at all.
 */
const ROUTELESS_CONTRACT_MODELS = [EarthquakeListDto, EarthquakeAttributionDto];

/**
 * Builds the OpenAPI document. Single source of truth for the spec, shared by:
 *  - `main.ts` (serves it live at `/docs` for dev), and
 *  - `scripts` → `openapi:generate` (writes the committed `openapi/openapi.json`
 *    artifact that the web repo codegens types from — CONVENTIONS §3, SPEC B).
 *
 * Keeping one builder guarantees the served docs and the committed artifact can
 * never describe different contracts.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Coğrafya API')
    .setDescription('Backend API for the Coğrafya education platform.')
    .setVersion('0.0.1')
    .build();

  return SwaggerModule.createDocument(app, config, {
    extraModels: ROUTELESS_CONTRACT_MODELS,
  });
}
