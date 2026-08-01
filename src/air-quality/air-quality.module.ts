import { Module } from '@nestjs/common';
import { AirQualityController } from './air-quality.controller';

/**
 * Air-quality module — A1 slice: the frozen OpenAPI contract + the one static catalogue
 * endpoint.
 *
 * DELIBERATELY EMPTY of providers: no scheduled work, no ADS client, no entity, no Redis
 * binding, no env surface (the approved A1 plan's scope guard — `env.schema.ts` and
 * `src/upstream` diffs are EMPTY in this PR). The ingest state machine, the Postgres store
 * and the two province endpoints arrive in A2 on the A0-generalised warmup seam.
 */
@Module({
  controllers: [AirQualityController],
})
export class AirQualityModule {}
