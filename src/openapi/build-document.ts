import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  type OpenAPIObject,
  type SwaggerDocumentOptions,
  SwaggerModule,
} from '@nestjs/swagger';

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
 * `EarthquakeListDto`.
 *
 * **This list shrinks as endpoints land, and B3 is the first time it did.** `BookListDto` and
 * `BookDetailDto` left it when `GET /api/books` and `GET /api/books/{slug}` started serving them:
 * the scanner now reaches both through `@ApiOkResponse`, and every book schema below them arrives
 * transitively — `BookListItemDto` through `BookListDto.items`, and `BookCoverageDto`,
 * `BookVideoDto`, `BookVideoQuestionDto` and `BookVideoYoutubeDto` through `BookDetailDto`. A
 * permanent extra-model list would quietly hide a DTO that no longer has a route at all, which is
 * the whole reason entries are removed rather than left as insurance.
 *
 * **`BookAttributionDto` left too, and the entry it used to have was justified by a claim this same
 * docblock refutes three sentences earlier.** It read "reachable only through an array property" —
 * but `BookDetailDto.videos` and `BookListDto.items` are array properties as well, and both arrive
 * transitively without an entry. An array property is not a barrier to the scanner; the real reason
 * that entry existed was belt-and-braces for a licence-bearing schema (PR #110 review,
 * `CODE110-M3`). Belt-and-braces is exactly what this list must not become: a permanent entry keeps
 * publishing a schema after the field that referenced it is gone, which is the failure the removal
 * rule exists to prevent. `book.contract.spec.ts` pins `BookDetailDto.attribution` and all eight
 * book schemas on every CI run, so the guard is a test rather than a list entry — and unlike an
 * entry, a test can fail. Verified after regeneration: the schema set is unchanged.
 *
 * **E3 emptied it, which is the rule working rather than the rule expiring.** `EarthquakeListDto`
 * left when the hub and province routes started returning it, and `EarthquakeAttributionDto` left
 * with it: the scanner now reaches every earthquake schema through a `$ref` chain —
 * `EarthquakeEventDto`, `EarthquakeListMetaDto` and `EarthquakeFilterEchoDto` through
 * `EarthquakeListDto`, and the attribution through both that chain and `EarthquakeMetaDto`. Keeping
 * the attribution entry "for safety" was already identified as belt-and-braces above, and belt-and
 * braces is what makes this list publish schemas nothing references. Verified by regenerating: the
 * schema set gained `EarthquakeMetaDto` and lost nothing.
 *
 * The empty array is deliberate rather than a deleted option: the next contract-first PR needs the
 * mechanism, and finding it here — with the reasoning above — is cheaper than rediscovering that
 * `extraModels` is the only way to publish a schema without a route.
 */
const ROUTELESS_CONTRACT_MODELS: NonNullable<SwaggerDocumentOptions['extraModels']> = [];

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
