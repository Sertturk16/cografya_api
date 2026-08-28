import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Measurement } from './entities/measurement.entity';
import { MeasurementsController } from './measurements.controller';
import { MeasurementsNoStoreMiddleware } from './measurements-no-store.middleware';
import { MeasurementsService } from './measurements.service';

/**
 * UYELIK-11: the measurements module — one entity, one migration, five protected create/list/
 * get/update-title/delete endpoints, no scheduled work and no external provider. `AuthModule` is
 * imported for {@link AccessTokenGuard}'s own dependency, mirroring `GameRoundsModule`'s own
 * precedent exactly.
 *
 * No business-key sibling entity is registered here — unlike `FavoritesModule`
 * (`Province`/`Country`), this module resolves no external business key before writing: `type`
 * and `points` are supplied by the client and resolved against no other table (plan §5.1), the
 * same shape `GameRoundsModule` already has.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Measurement]), AuthModule],
  controllers: [MeasurementsController],
  providers: [MeasurementsService],
})
export class MeasurementsModule implements NestModule {
  /**
   * `Cache-Control: no-store` on all five routes this module registers — see
   * {@link MeasurementsNoStoreMiddleware}'s own docblock for the full mechanism.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MeasurementsNoStoreMiddleware).forRoutes(MeasurementsController);
  }
}
