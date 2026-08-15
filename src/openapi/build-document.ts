import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { BookAttributionDto } from '../book/dto/book-attribution.dto';
import { BookDetailDto } from '../book/dto/book-detail.dto';
import { BookListItemDto } from '../book/dto/book-list-item.dto';
import { EarthquakeAttributionDto } from '../earthquake/dto/earthquake-attribution.dto';
import { EarthquakeListDto } from '../earthquake/dto/earthquake-list.dto';

/**
 * Schemas published WITHOUT a route.
 *
 * Every other schema in the spec is discovered by scanning controllers, so a contract PR that
 * ships types before their endpoints has no way in — and that is exactly what the earthquake E1
 * and the book B1 PRs are (types and schema, no runtime, so the web repo can codegen and build
 * against a mock while the later PRs land the ingest, the seed and the endpoints).
 *
 * `SwaggerModule.createDocument`'s `extraModels` option is the only mechanism for it: the
 * scanner calls `addExtraModels` independently of how many routes it found. The alternative —
 * a stub controller to hang `@ApiExtraModels` on — would ship runtime the PR is explicitly
 * forbidden to ship.
 *
 * Only TOP-LEVEL types are listed. Anything they reference is pulled in transitively, so
 * `EarthquakeEventDto`, `EarthquakeListMetaDto` and `EarthquakeFilterEchoDto` arrive through
 * `EarthquakeListDto`, and `BookCoverageDto`, `BookVideoDto`, `BookVideoQuestionDto` and
 * `BookVideoYoutubeDto` through `BookDetailDto`. Three entries are named anyway and for two
 * different reasons:
 *  - `EarthquakeAttributionDto` and `BookAttributionDto` are reachable only through an array
 *    property, and they are the schemas whose absence would be a licence problem rather than a
 *    typing problem;
 *  - `BookListItemDto` is **not** reachable at all. `BookDetailDto` extends it, and swagger emits
 *    a subclass FLAT — no `allOf`, no `$ref` to the base — so the base would be absent from
 *    `components.schemas` while `GET /api/books` is specified to return an array of exactly it.
 *
 * **This list shrinks as endpoints land.** When E3 and B3 serve these types from real routes, the
 * scanner finds them and the entries become redundant — remove them then; a permanent extra-model
 * list would quietly hide a DTO that no longer has a route at all.
 */
const ROUTELESS_CONTRACT_MODELS = [
  EarthquakeListDto,
  EarthquakeAttributionDto,
  BookListItemDto,
  BookDetailDto,
  BookAttributionDto,
];

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
